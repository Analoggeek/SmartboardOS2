/* Whiteboard — infinite-feel canvas with pages, shapes, text, images, PDF export */
import { el, clamp, toast, downloadBlob, downloadURL, pickFiles, fileToDataURL, debounce, uid, beep } from '../utils.js';
import { createEraserIndex, eraseStroke } from '../eraser.js';
import { archiveWriter } from '../archive.js';
import { isDocument } from '../document-import.js';
import { icon, iconEl } from '../icons.js';
import { idb, store } from '../db.js';
import { createPenTracker, getPenSettings, savePenSettings } from '../pen.js';
import { classroomWidget } from '../class-widget.js';
import { capturePhoto } from '../camera.js';
import { checkpoint } from '../board-checkpoints.js';
import { paintBoardObject } from '../board-render.js';
import { EMOJI_SVG } from '../emoji-data.js';

const PALETTE = [
  '#0f172a', '#64748b', '#ffffff', '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#14b8a6', '#0ea5e9', '#6366f1', '#a855f7', '#ec4899',
];
const TOOLS = [
  { id: 'select', name: 'Select', icon: 'cursor' },
  { id: 'pen', name: 'Pen', icon: 'pen' },
  { id: 'highlighter', name: 'Highlighter', icon: 'highlighter' },
  { id: 'eraser', name: 'Eraser', icon: 'eraser' },
  { id: 'line', name: 'Line', icon: 'line' },
  { id: 'arrow', name: 'Arrow', icon: 'arrow' },
  { id: 'rect', name: 'Rectangle', icon: 'square' },
  { id: 'ellipse', name: 'Ellipse', icon: 'circle' },
  { id: 'text', name: 'Text', icon: 'type' },
  { id: 'laser', name: 'Laser', icon: 'zap' },
  { id: 'pan', name: 'Pan', icon: 'hand' },
];
const BG_NAMES = { plain: 'Plain', grid: 'Grid', dots: 'Dots', lines: 'Vertical lines', ruled: 'Ruled paper', music: 'Music staves',
  graph: 'Graph paper', handwriting: 'Handwriting', isometric: 'Isometric', white: 'Whiteboard', chalk: 'Green chalkboard', black: 'Blackboard' };
const BG_FILLS = { white: '#ffffff', chalk: '#143b31', black: '#101114' };
const EMOJI_GROUPS = [
  { name: 'Class', list: ['😀', '🙂', '😊', '🤓', '🎓', '👏', '🙋', '✋', '👍', '👎', '💡', '✅', '❌', '❗', '❓', '⭐', '🌟', '🏆', '🎯', '📌'] },
  { name: 'School', list: ['📚', '📖', '📝', '✏️', '🖊️', '📏', '📐', '🧮', '📊', '📈', '🗓️', '⏰', '🎒', '🏫', '🔬', '🔭', '🧪', '⚗️', '🖇️', '📎'] },
  { name: 'Science', list: ['🌍', '🌞', '🌙', '⭐', '🪐', '🚀', '🧬', '🧠', '❤️', '🫁', '🌱', '🌳', '🍁', '💧', '🔥', '⚡', '🌡️', '🧲', '⚛️', '🔋'] },
  { name: 'Fun', list: ['🎉', '🎊', '🎈', '🎁', '🏅', '🥇', '⚽', '🏏', '🎨', '🎵', '🎬', '🕹️', '🐶', '🐱', '🦁', '🐘', '🦋', '🌈', '🍎', '🍕'] },
];

export async function mount({ root, params = {}, api, annotation }) {
  /* ---------------- state ---------------- */
  const storageKey = annotation?.key || 'current';
  const archive = archiveWriter(annotation ? storageKey.replace('pdf-ink:', 'pdf-').replaceAll(':', '-') : 'board');
  let pages = [{ objects: [], bg: annotation ? 'plain' : 'grid', bgImage: annotation?.image || null }];
  let pageIndex = 0;
  let tool = 'pen';
  let color = annotation || document.documentElement.dataset.theme === 'light' ? '#0f172a' : '#ffffff';
  let size = 4;
  let eraseWhole = false;
  let view = { x: 0, y: 0, scale: 1 };
  let objects = pages[0].objects;
  let history = [];
  let future = [];
  let dirty = true;
  let raf = null;
  let live = null;         // in-progress object
  let laser = [];          // transient laser strokes
  let spaceHeld = false;
  const pointers = new Map();
  let pinch = null;
  const imgCache = new Map();
  const pen = createPenTracker();
  let penSettings = getPenSettings();
  let pendingEmoji = null;
  let tapInfo = null;
  let selection = null;
  let clipText = '';
  let replacing = false;

  /* ---------------- DOM ---------------- */
  const stage = el('div', { class: 'wb-stage' });
  const canvas = el('canvas');
  stage.append(canvas);
  const ctx = canvas.getContext('2d');
  const scene = document.createElement('canvas');
  const sceneCtx = scene.getContext('2d', { alpha: false });
  let sceneKey, sceneObjects, sceneRevision = 0, eraserFrame = 0;
  const boundsCache = new WeakMap();

  const emptyHint = el('div', { class: 'wb-empty' },
    el('div', {}, el('b', { text: 'Board is ready' }), 'Draw, type, or drop an image / PDF page here'));
  stage.append(emptyHint);

  const badgeTool = el('span', { class: 'wb-badge', text: 'Pen' });
  const badgeInfo = el('span', { class: 'wb-badge', text: 'Page 1' });
  stage.append(el('div', { class: 'wb-status' }, badgeTool, badgeInfo));

  const zoomLabel = el('button', { class: 'tool-btn', text: '100%', title: 'Reset zoom', onclick: () => { view = { x: 0, y: 0, scale: 1 }; mark(); } });
  const zoomBox = el('div', { class: 'wb-zoom' },
    el('button', { class: 'tool-btn', html: icon('minus'), title: 'Zoom out', onclick: () => zoomBy(0.8) }),
    zoomLabel,
    el('button', { class: 'tool-btn', html: icon('plus'), title: 'Zoom in', onclick: () => zoomBy(1.25) }),
    el('button', { class: 'tool-btn', html: icon('expand'), title: 'Fit to content', onclick: () => fitView() })
  );
  stage.append(zoomBox);

  const eraserRing = el('div', {
    style: {
      position: 'absolute', borderRadius: '50%', border: '1.5px solid var(--text-3)',
      pointerEvents: 'none', display: 'none', zIndex: '4', left: '0', top: '0', transform: 'translate(-50%,-50%)',
    },
  });
  stage.append(eraserRing);

  /* toolbar */
  const toolButtons = new Map();
  const toolGroup = el('div', { class: 'pill-group' });
  TOOLS.forEach((t) => {
    const b = el('button', {
      class: `tool-btn ${t.id === tool ? 'active' : ''}`, title: t.name, 'aria-label': t.name, html: icon(t.icon),
      onclick: () => setTool(t.id),
    });
    toolButtons.set(t.id, b);
    toolGroup.append(b);
  });

  const colorDot = el('span', { style: { width: '16px', height: '16px', borderRadius: '50%', background: color, boxShadow: '0 0 0 2px var(--surface-solid), 0 0 0 3px var(--border-strong)' } });
  const colorBtn = el('button', { class: 'tool-btn ghost', title: 'Pen colour', 'aria-label': 'Pen colour', 'aria-expanded': 'false' }, colorDot, el('span', { class: 'ic', html: icon('chevron-down'), style: { width: '12px', height: '12px' } }));

  const colorPop = el('div', {
    class: 'wb-colors',
    style: {
      position: 'absolute', zIndex: '50', top: '8px', left: '8px', padding: '10px',
      display: 'none', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px',
      background: 'var(--surface-solid)', border: '1px solid var(--border-strong)',
      borderRadius: '14px', boxShadow: 'var(--shadow)',
    },
  });
  PALETTE.forEach((c) => {
    colorPop.append(el('button', {
      title: c,
      'aria-label': `Pen colour ${c}`,
      onclick: () => { setColor(c); toggleColors(false); colorBtn.focus(); },
      style: {
        width: '24px', height: '24px', borderRadius: '50%', background: c,
        border: c === color ? '2px solid var(--accent)' : '1px solid var(--border-strong)',
      },
    }));
  });
  const customColor = el('input', {
    type: 'color', value: color, 'aria-label': 'Custom pen colour',
    style: { gridColumn: 'span 3', width: '100%', height: '26px', border: 0, background: 'transparent', cursor: 'pointer' },
    oninput: (e) => setColor(e.target.value),
  });
  colorPop.append(customColor);
  stage.append(colorPop);
  function toggleColors(open) {
    colorPop.style.display = open ? 'grid' : 'none';
    colorBtn.setAttribute('aria-expanded', String(open));
    if (open) toggleBackgrounds(false);
  }
  colorBtn.addEventListener('click', () => toggleColors(colorPop.style.display !== 'grid'));
  stage.addEventListener('pointerdown', (e) => {
    if (!colorPop.contains(e.target)) toggleColors(false);
  });

  const sizeInput = el('input', {
    type: 'range', min: '1', max: '26', value: String(size), title: 'Brush size',
    oninput: (e) => { size = Number(e.target.value); },
  });

  const eraseMode = el('select', { class: 'field', title: 'Eraser mode', 'aria-label': 'Eraser mode', hidden: true },
    el('option', { value: 'part', text: 'Erase ink' }), el('option', { value: 'whole', text: 'Erase object' }));
  eraseMode.onchange = () => { eraseWhole = eraseMode.value === 'whole'; };

  const undoBtn = el('button', { class: 'tool-btn', title: 'Undo (Ctrl+Z)', html: icon('undo'), onclick: undo });
  const redoBtn = el('button', { class: 'tool-btn', title: 'Redo (Ctrl+Shift+Z)', html: icon('redo'), onclick: redo });
  const clearBtn = el('button', { class: 'tool-btn', title: 'Clear page', html: icon('trash'), onclick: clearPage });

  const pageLabel = el('button', { class: 'tool-btn', text: '1 / 1', title: 'Page overview', onclick: showPageMenu });
  const prevBtn = el('button', { class: 'tool-btn', title: 'Previous page', html: icon('chevron-left'), onclick: () => gotoPage(pageIndex - 1) });
  const nextBtn = el('button', { class: 'tool-btn', title: 'Next page', html: icon('chevron-right'), onclick: () => gotoPage(pageIndex + 1) });
  const addPageBtn = el('button', { class: 'tool-btn', title: 'Add page', html: icon('file-plus'), onclick: addPage });
  const delPageBtn = el('button', { class: 'tool-btn', title: 'Delete page', html: icon('x'), onclick: deletePage });

  const bgMenu = el('div', { class: 'wb-pop wb-bg-menu', hidden: true },
    el('div', { class: 'pop-head' }, el('b', { text: 'Board backgrounds' })));
  const bgList = el('div', { class: 'wb-bg-list' });
  const bgPicker = el('input', { type: 'color', 'aria-label': 'Custom board colour', value: '#17314b' });
  bgMenu.append(bgList, el('label', { class: 'set-row' }, 'Custom board colour', bgPicker)); stage.append(bgMenu);
  bgPicker.oninput = () => {
    page().bgColor = bgPicker.value;
    mark(); scheduleSave();
  };
  const bgBtn = el('button', { class: 'tool-btn', title: 'Change background', 'aria-expanded': 'false',
    html: `${icon('grid')}<span>Board style</span>`, onclick: () => toggleBackgrounds(bgMenu.hidden) });
  function toggleBackgrounds(open) {
    bgMenu.hidden = !open;
    bgBtn.setAttribute('aria-expanded', String(open));
    if (!open) return;
    toggleColors(false);
    bgPicker.value = page().bgColor || '#17314b';
    bgList.replaceChildren(...Object.entries(BG_NAMES).map(([id, name]) => el('button', {
      class: `wb-bg-option ${page().bg === id ? 'active' : ''}`, text: name,
      'aria-pressed': String(page().bg === id), onclick: () => {
        page().bg = id; delete page().bgColor;
        if (id === 'white' && color === '#ffffff') setColor('#0f172a');
        if ((id === 'black' || id === 'chalk') && color === '#0f172a') setColor('#ffffff');
        toggleBackgrounds(false); bgBtn.focus(); mark(); scheduleSave();
      },
    })));
  }
  stage.addEventListener('pointerdown', (e) => { if (!bgMenu.contains(e.target)) toggleBackgrounds(false); });
  const targetWindow = root.closest('.win');
  if (!annotation) targetWindow?.classList.add('board-workspace');
  const presentBtn = el('button', { class: 'tool-btn wb-present', title: 'Toggle screen fullscreen (F)', 'aria-label': 'Toggle screen fullscreen', html: icon('fullscreen'), onclick: () => window.__sbos.toggleFullscreen() });

  const imgBtn = el('button', { class: 'tool-btn', title: 'Insert image', html: icon('image'), onclick: insertImage });
  const emojiBtn = el('button', { class: 'tool-btn', title: 'Emoji & stickers', html: icon('smile') });
  const camBtn = el('button', { class: 'tool-btn', title: 'Take a photo with the camera', html: icon('camera'), onclick: () => insertPhoto() });
  const penBtn = el('button', { class: 'tool-btn', title: 'Pen, pressure & palm rejection', html: icon('settings') });
  const floatBtn = el('button', { class: 'tool-btn', title: 'Floating toolbox (stays on screen while presenting)', html: icon('sparkles') });
  const pngBtn = el('button', { class: 'tool-btn', title: 'Export PNG', html: icon('download'), onclick: exportPNG });
  const pdfBtn = el('button', { class: 'tool-btn', title: 'Export PDF', html: icon('pdf'), onclick: exportPDF });
  const saveBtn = el('button', { class: 'tool-btn', title: 'Save board', html: icon('save'), onclick: () => { saveSession(true); } });
  const exportBtn = el('button', { class: 'tool-btn', title: 'Export & save', html: `${icon('download')}<span>Export</span>` });

  const importBtn = !annotation && el('button', { class: 'tool-btn wb-import', title: 'Import a complete PDF or PowerPoint', html: `${icon('folder')}<span>Import PDF / PPT</span>`, onclick: () => openDocument() });
  const recordBtn = !annotation && el('button', { class: 'tool-btn', title: 'Camera and recording layout', html: `${icon('camera')}<span>Camera</span>`, onclick: () => api.open('recording') });
  const mini = annotation ? null : classroomWidget(() => api.open('class'));
  const classBtn = mini && el('button', { class: 'tool-btn', title: 'Toggle classroom tools widget', html: `${icon('timer')}<span>Class tools</span>`, 'aria-expanded': 'false', onclick: () => { mini.toggle(); classBtn.setAttribute('aria-expanded', String(!mini.node.hidden)); } });

  const toolbar = el('div', { class: 'app-toolbar wb-toolbar', style: { position: 'relative' } },
    importBtn, classBtn, recordBtn, presentBtn, colorBtn, annotation ? null : bgBtn, sizeInput,
    el('div', { class: 'sep' }), toolGroup,
    el('div', { class: 'sep' }),
    eraseMode, undoBtn, redoBtn, clearBtn,
    el('div', { class: 'sep' }),
    annotation ? null : [prevBtn, pageLabel, nextBtn, addPageBtn, delPageBtn],
    el('div', { class: 'sep' }),
    penBtn, annotation ? null : floatBtn,
    el('div', { class: 'sep' }),
    imgBtn, camBtn, emojiBtn, exportBtn
  );

  const app = el('div', { class: 'app wb-app' }, toolbar, stage);
  root.append(app);
  if (mini) stage.append(mini.node);
  let embedded, docEpoch = 0;
  const documentHost = annotation ? null : el('div', { class: 'board-document-host', hidden: true });
  if (documentHost) root.append(documentHost);
  async function openDocument(file) {
    if (!documentHost) return;
    if (embedded) { embedded.onParams?.({ file }); return; }
    const epoch = ++docEpoch;
    app.hidden = true; documentHost.hidden = false;
    documentHost.replaceChildren(el('div', { class: 'settings', role: 'status', text: 'Opening document tools…' }));
    try {
      const { mount } = await import('./pdf.js');
      if (epoch !== docEpoch || !root.isConnected) return;
      documentHost.replaceChildren();
      embedded = mount({ root: documentHost, params: { file }, api: { ...api, setTitle: () => {}, close: closeDocument } });
    } catch (error) { console.warn(error); closeDocument(); toast('Could not open document tools.', 'err'); }
  }
  async function closeDocument() {
    ++docEpoch;
    const instance = embedded; embedded = null;
    documentHost.hidden = true;
    await instance?.onClose?.();
    if (embedded || !documentHost.hidden) return;
    documentHost.replaceChildren(); app.hidden = false; requestAnimationFrame(resizeCanvas);
  }

  /* ---------------- emoji picker ---------------- */
  const emojiHint = el('div', { class: 'wb-emoji-hint', hidden: true }, el('span', { text: 'Tap the board to place the sticker' }), el('button', { class: 'mini-btn', text: 'Cancel' }));
  stage.append(emojiHint);
  emojiHint.querySelector('button').addEventListener('click', (e) => {
    e.stopPropagation();
    pendingEmoji = null;
    updateEmojiHint();
  });

  const emojiPop = el('div', { class: 'wb-pop emoji-pop', hidden: true });
  stage.append(emojiPop);
  function buildEmojiPop() {
    emojiPop.innerHTML = '';
    emojiPop.append(el('div', { class: 'pop-head' }, el('b', { text: 'Emoji & stickers' }), el('small', { text: 'Tap one, then tap the board — stickers are bundled, so they look the same everywhere' })));
    EMOJI_GROUPS.forEach((group) => {
      emojiPop.append(el('div', { class: 'emoji-group-label', text: group.name }));
      const grid = el('div', { class: 'emoji-grid' });
      group.list.forEach((char) => {
        const src = EMOJI_SVG[char];
        grid.append(el('button', {
          class: 'emoji-cell', title: char,
          onclick: () => {
            pendingEmoji = char;
            updateEmojiHint();
            emojiPop.hidden = true;
          },
        }, src ? el('img', { src, alt: char, draggable: 'false' }) : el('span', { text: char })));
      });
      emojiPop.append(grid);
    });
  }
  function updateEmojiHint() {
    emojiHint.hidden = !pendingEmoji;
    emojiHint.querySelector('span').textContent = pendingEmoji ? `Tap the board to place ${pendingEmoji}` : '';
  }
  emojiBtn.addEventListener('click', () => {
    if (emojiPop.hidden) { buildEmojiPop(); emojiPop.hidden = false; penPop.hidden = true; }
    else emojiPop.hidden = true;
  });

  /* ---------------- pen & palm panel ---------------- */
  const penPop = el('div', { class: 'wb-pop pen-pop', hidden: true });
  stage.append(penPop);

  function buildPenPop() {
    const ps = penSettings;
    penPop.innerHTML = '';
    const seg = (label, key, options) => el('div', { class: 'pop-row' },
      el('span', { class: 'pop-label', text: label }),
      el('div', { class: 'seg' }, options.map(([value, text]) => el('button', {
        class: `seg-btn${ps[key] === value ? ' active' : ''}`,
        text,
        onclick: () => { penSettings = savePenSettings({ [key]: value }); buildPenPop(); },
      })))
    );
    const rangeRow = (label, value, min, max, step, onChange, fmt) => {
      const out = el('output', { class: 'range-out', text: fmt(value) });
      return el('div', { class: 'pop-row' },
        el('span', { class: 'pop-label', text: label }),
        el('div', { class: 'range-wrap' },
          el('input', {
            type: 'range', min: String(min), max: String(max), step: String(step), value: String(value),
            oninput: (e) => { out.textContent = fmt(Number(e.target.value)); },
            onchange: (e) => onChange(Number(e.target.value)),
          }),
          out
        )
      );
    };

    const toggle = (label, key, hint) => el('label', { class: 'pop-row switch-row' },
      el('span', { class: 'pop-label' }, el('b', { text: label }), el('small', { text: hint })),
      el('input', {
        type: 'checkbox', checked: !!ps[key],
        onchange: (e) => { penSettings = savePenSettings({ [key]: e.target.checked }); buildPenPop(); },
      })
    );

    penPop.append(
      el('div', { class: 'pop-head' }, el('b', { text: 'Pen & palm' }), el('small', { text: 'Works with any stylus — no driver needed' })),
      seg('Palm rejection', 'palm', [['auto', 'Auto'], ['strong', 'Strong'], ['off', 'Off']]),
      toggle('Pen pressure', 'pressure', 'Line gets thicker when you press harder'),
      toggle('Pen tilt', 'tilt', 'Tilt the pen for a wider highlighter'),
      toggle('Draw with a finger', 'touchDraw', 'Turn off for pen-only writing'),
      rangeRow('Palm rest delay', ps.palmDelay, 0, 2000, 100, (v) => { penSettings = savePenSettings({ palmDelay: v }); }, (v) => `${v} ms`),
      rangeRow('Pen smoothing', Math.round(ps.smoothing * 100), 0, 80, 5, (v) => { penSettings = savePenSettings({ smoothing: v / 100 }); }, (v) => `${v}%`),
      el('p', { class: 'pop-note', text: 'Software palm rejection ignores big or resting contacts and any touch right after the pen. It also works on laptops without native palm rejection.' })
    );
  }
  penBtn.addEventListener('click', () => {
    if (penPop.hidden) { buildPenPop(); penPop.hidden = false; emojiPop.hidden = true; }
    else penPop.hidden = true;
  });
  window.addEventListener('sbos:pen', (e) => { penSettings = e.detail; });

  /* ---------------- floating toolbox ---------------- */
  const floatBar = el('div', { class: 'wb-float', hidden: true });
  stage.append(floatBar);
  const floatState = store.get('wbFloat', { x: null, y: null, on: false });

  function buildFloatBar() {
    floatBar.innerHTML = '';
    floatBar.append(el('div', { class: 'wb-float-handle', html: icon('grid'), title: 'Drag to move' }));
    const add = (iconName, title, fn, active) => floatBar.append(el('button', {
      class: `float-btn${active ? ' active' : ''}`, html: icon(iconName), title, onclick: fn,
    }));
    add('cursor', 'Select & move (S)', () => setTool('select'), tool === 'select');
    add('pen', 'Pen (P)', () => setTool('pen'), tool === 'pen');
    add('highlighter', 'Highlighter (H)', () => setTool('highlighter'), tool === 'highlighter');
    add('eraser', 'Eraser (E)', () => setTool('eraser'), tool === 'eraser');
    add('zap', 'Laser pointer (Z)', () => setTool('laser'), tool === 'laser');
    add('type', 'Text (T)', () => setTool('text'), tool === 'text');
    add('smile', 'Emoji', () => { emojiPop.hidden = false; buildEmojiPop(); });
    floatBar.append(el('div', { class: 'float-sep' }));
    add('undo', 'Undo', undo);
    add('chevron-left', 'Previous page', () => gotoPage(pageIndex - 1));
    add('chevron-right', 'Next page', () => gotoPage(pageIndex + 1));
    add('plus', 'New page', addPage);
    floatBar.append(el('div', { class: 'float-sep' }));
    add('x', 'Hide toolbox', () => toggleFloat(false));
    if (floatState.x == null) {
      const small = stage.clientWidth < 700;
      floatState.x = small ? 8 : Math.max(16, stage.clientWidth - 420);
      floatState.y = small ? Math.max(64, stage.clientHeight - 104) : 60;
    }
    const maxX = Math.max(0, stage.clientWidth - floatBar.offsetWidth);
    const maxY = Math.max(0, stage.clientHeight - floatBar.offsetHeight);
    floatState.x = clamp(floatState.x, 0, maxX);
    floatState.y = clamp(floatState.y, 0, maxY);
    floatBar.style.left = `${floatState.x}px`;
    floatBar.style.top = `${floatState.y}px`;
  }

  function toggleFloat(on = floatBar.hidden) {
    floatBar.hidden = !on;
    floatState.on = on;
    store.set('wbFloat', floatState);
    floatBtn.classList.toggle('active', on);
    if (on) buildFloatBar();
  }

  (function makeDraggable() {
    let drag = null;
    floatBar.addEventListener('pointerdown', (e) => {
      const handle = e.target.closest('.wb-float-handle');
      if (!handle) return;
      e.preventDefault();
      const r = stage.getBoundingClientRect();
      drag = { dx: e.clientX - (r.left + floatBar.offsetLeft), dy: e.clientY - (r.top + floatBar.offsetTop) };
      floatBar.setPointerCapture(e.pointerId);
    });
    floatBar.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const r = stage.getBoundingClientRect();
      const x = clamp(e.clientX - r.left - drag.dx, 0, Math.max(0, r.width - floatBar.offsetWidth));
      const y = clamp(e.clientY - r.top - drag.dy, 0, Math.max(0, r.height - floatBar.offsetHeight));
      floatBar.style.left = `${x}px`;
      floatBar.style.top = `${y}px`;
      floatState.x = x; floatState.y = y;
    });
    floatBar.addEventListener('pointerup', () => {
      if (!drag) return;
      drag = null;
      store.set('wbFloat', floatState);
    });
  })();

  floatBtn.addEventListener('click', () => toggleFloat());

  /* ---------------- export menu ---------------- */
  const exportMenu = el('div', { class: 'wb-pop export-menu', hidden: true, style: { width: '210px', left: 'auto', right: '10px', top: '48px', maxHeight: 'none' } },
    el('button', { class: 'menu-item', html: `${icon('image')}<span>Export page as PNG</span>`, onclick: () => { exportMenu.hidden = true; exportPNG(); } }),
    el('button', { class: 'menu-item', html: `${icon('pdf')}<span>Export board as PDF</span>`, onclick: () => { exportMenu.hidden = true; exportPDF(); } }),
    el('button', { class: 'menu-item', html: `${icon('save')}<span>Save board now</span>`, onclick: () => { exportMenu.hidden = true; saveSession(true); } })
  );
  stage.append(exportMenu);
  exportBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    exportMenu.hidden = !exportMenu.hidden;
    emojiPop.hidden = true;
    penPop.hidden = true;
  });
  stage.addEventListener('pointerdown', (e) => {
    if (!exportMenu.hidden && !e.target.closest('.export-menu') && !e.target.closest('.tool-btn')) exportMenu.hidden = true;
  });

  /* ---------------- camera ---------------- */
  async function insertPhoto() {
    const data = await capturePhoto({ title: 'Camera → board' });
    if (data) {
      addImageObject(data);
      toast('Photo added to the board', 'ok');
    }
  }

  /* ---------------- helpers ---------------- */
  const page = () => pages[pageIndex];
  const mark = () => { dirty = true; if (!raf) raf = requestAnimationFrame(tick); };
  const tick = () => {
    raf = null;
    if (dirty) { dirty = false; draw(); }
  };

  function setTool(id) {
    tool = id;
    eraseMode.hidden = id !== 'eraser';
    toolButtons.forEach((b, k) => b.classList.toggle('active', k === id));
    badgeTool.textContent = selection && id === 'select' ? `Select · ${selection.type}` : (TOOLS.find((t) => t.id === id)?.name || id);
    canvas.style.cursor = id === 'pan' ? 'grab' : id === 'text' ? 'text' : id === 'eraser' ? 'none' : id === 'select' ? 'default' : 'crosshair';
    if (id !== 'select' && selection) { selection = null; mark(); }

    if (!annotation) api.setTitle(`Whiteboard · ${TOOLS.find((t) => t.id === id)?.name}`);
  }
  function setColor(c) {
    color = c;
    colorDot.style.background = c;
    customColor.value = c;
  }
  function zoomBy(f) {
    const r = canvas.getBoundingClientRect();
    zoomAt(f, r.width / 2, r.height / 2);
  }
  function zoomAt(f, sx, sy) {
    const ns = clamp(view.scale * f, 0.2, 6);
    const k = ns / view.scale;
    view.x = sx - (sx - view.x) * k;
    view.y = sy - (sy - view.y) * k;
    view.scale = ns;
    zoomLabel.textContent = `${Math.round(ns * 100)}%`;
    mark();
  }

  function fitView() {
    const r = stage.getBoundingClientRect();
    if (!r.width) return;
    const hasContent = objects.length || page().bgImage;
    if (!hasContent) { view = { x: 0, y: 0, scale: 1 }; zoomLabel.textContent = '100%'; mark(); return; }
    const b = boundsFor(page(), r.width, r.height);
    const pad = 36;
    const scale = clamp(Math.min((r.width - pad * 2) / b.w, (r.height - pad * 2) / b.h), 0.1, 4);
    view.scale = scale;
    view.x = (r.width - b.w * scale) / 2 - b.x * scale;
    view.y = (r.height - b.h * scale) / 2 - b.y * scale;
    zoomLabel.textContent = `${Math.round(scale * 100)}%`;
    mark();
  }

  const snapshot = () => ({ objects: objects.slice(), bgImage: page().bgImage, bg: page().bg, bgColor: page().bgColor });
  function restoreSnapshot(state) {
    Object.assign(page(), state, { objects: state.objects.slice() });
    objects = page().objects;
  }
  function pushHistory(previous = snapshot()) {
    history.push(previous);
    if (history.length > 60) history.shift();
    future.length = 0;
    updateButtons();
  }
  function undo() {
    if (!history.length) return;
    future.push(snapshot());
    restoreSnapshot(history.pop());
    selection = null;
    mark(); scheduleSave(); updateButtons();
  }
  function redo() {
    if (!future.length) return;
    history.push(snapshot());
    restoreSnapshot(future.pop());
    selection = null;
    mark(); scheduleSave(); updateButtons();
  }
  function updateButtons() {
    undoBtn.disabled = !history.length;
    redoBtn.disabled = !future.length;
    prevBtn.disabled = pageIndex <= 0;
    nextBtn.disabled = pageIndex >= pages.length - 1;
    delPageBtn.disabled = pages.length <= 1;
    pageLabel.textContent = `${pageIndex + 1} / ${pages.length}`;
    badgeTool.textContent = selection && tool === 'select'
      ? `Select · ${selection.type}`
      : (TOOLS.find((t) => t.id === tool)?.name || tool);
    badgeInfo.textContent = `Page ${pageIndex + 1} · ${objects.length} obj`;
    emptyHint.style.display = objects.length || page().bgImage ? 'none' : 'grid';
  }

  /* ---------------- drawing ---------------- */
  function resizeCanvas() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(5500000 / (w*h)));
    const pixelsW = Math.max(1, Math.round(w*dpr)), pixelsH = Math.max(1, Math.round(h*dpr));
    if (canvas.width === pixelsW && canvas.height === pixelsH && canvas.__dpr === dpr) return;
    canvas.width = scene.width = pixelsW;
    canvas.height = scene.height = pixelsH;
    canvas.__dpr = dpr;
    mark();
  }

  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function paintBgPattern(c, rect, bgMode, light, px = 1) {
    if (bgMode === 'plain' || BG_FILLS[bgMode]) return;
    const col = light ? 'rgba(16,24,46,0.10)' : 'rgba(255,255,255,0.085)';
    c.save();
    c.strokeStyle = col;
    c.fillStyle = col;
    c.lineWidth = px;
    const x0 = Math.floor(rect.x / 40) * 40;
    const y0 = Math.floor(rect.y / 40) * 40;
    const x1 = rect.x + rect.w;
    const y1 = rect.y + rect.h;
    if (['graph', 'handwriting', 'isometric'].includes(bgMode)) {
      c.beginPath();
      const step = bgMode === 'graph' ? 20 : 36;
      for (let y = Math.floor(rect.y / step) * step; y < y1; y += step) {
        c.moveTo(rect.x, y); c.lineTo(x1, y);
        if (bgMode === 'handwriting') { c.moveTo(rect.x, y + step / 2); c.lineTo(x1, y + step / 2); }
      }
      if (bgMode === 'graph') {
        for (let x = Math.floor(rect.x / step) * step; x < x1; x += step) { c.moveTo(x, rect.y); c.lineTo(x, y1); }
      } else if (bgMode === 'isometric') {
        const span = rect.h / Math.sqrt(3);
        for (let x = Math.floor((rect.x - span) / step) * step; x < x1 + span; x += step) {
          c.moveTo(x, rect.y); c.lineTo(x + span, y1);
          c.moveTo(x, rect.y); c.lineTo(x - span, y1);
        }
      }
      c.stroke();
    } else if (bgMode === 'grid' || bgMode === 'lines') {
      c.beginPath();
      for (let x = x0; x < x1; x += 40) { c.moveTo(x, rect.y); c.lineTo(x, y1); }
      if (bgMode === 'grid') for (let y = y0; y < y1; y += 40) { c.moveTo(rect.x, y); c.lineTo(x1, y); }
      c.stroke();
    } else if (bgMode === 'dots') {
      for (let x = x0; x < x1; x += 40) {
        for (let y = y0; y < y1; y += 40) {
          c.beginPath();
          c.arc(x, y, 1.4 * px, 0, Math.PI * 2);
          c.fill();
        }
      }
    } else if (bgMode === 'ruled') {
      c.beginPath();
      for (let y = y0; y < y1; y += 44) { c.moveTo(rect.x, y); c.lineTo(x1, y); }
      c.stroke();
      c.strokeStyle = light ? 'rgba(239,68,68,0.28)' : 'rgba(248,113,113,0.34)';
      c.beginPath();
      c.moveTo(72, rect.y);
      c.lineTo(72, y1);
      c.stroke();
    } else if (bgMode === 'music') {
      c.beginPath();
      for (let base = Math.floor(rect.y / 96) * 96; base < y1; base += 96) {
        for (let i = 0; i < 5; i++) {
          const y = base + i * 14;
          if (y < rect.y) continue;
          c.moveTo(rect.x, y);
          c.lineTo(x1, y);
        }
      }
      c.stroke();
    }
    c.restore();
  }

  function drawBackground(c, w, h, bgMode, light) {
    const bg = page().bgColor || BG_FILLS[bgMode] || (light ? '#ffffff' : cssVar('--canvas-bg', '#0e1424'));
    c.fillStyle = bg;
    c.fillRect(-5000, -5000, 10000, 10000);
    if (bgMode === 'plain') return;
    paintBgPattern(c, {
      x: -view.x / view.scale,
      y: -view.y / view.scale,
      w: w / view.scale,
      h: h / view.scale,
    }, bgMode, light, 1 / view.scale);
  }

  function draw() {
    const dpr = canvas.__dpr || 1;
    const w = canvas.width / dpr, h = canvas.height / dpr;
    const light = document.documentElement.dataset.theme === 'light';
    const pg = page();
    const staticKey = [canvas.width,canvas.height,view.x,view.y,view.scale,light,pg.bg,pg.bgColor,objects.length,sceneRevision].join('|');
    if (sceneObjects !== objects || sceneKey !== staticKey || live?.moving || live?.resizing) {
      sceneKey = staticKey; sceneObjects = objects;
      sceneCtx.setTransform(dpr,0,0,dpr,0,0);
      sceneCtx.fillStyle = pg.bgColor || BG_FILLS[pg.bg] || (light ? '#ffffff' : cssVar('--canvas-bg','#0e1424'));
      sceneCtx.fillRect(0,0,w,h);
      sceneCtx.save(); sceneCtx.translate(view.x, view.y); sceneCtx.scale(view.scale, view.scale);
      drawBackground(sceneCtx,w,h,pg.bg,light);
      if (pg.bgImage) drawBgImage(sceneCtx, pg.bgImage);
      const visible = [-view.x/view.scale,-view.y/view.scale,(w-view.x)/view.scale,(h-view.y)/view.scale];
      for (const o of objects) {
        if (o.type === 'stroke' || o.type === 'image') {
          const b = eraseBounds(o);
          if (b && (b.x > visible[2] || b.x+b.w < visible[0] || b.y > visible[3] || b.y+b.h < visible[1])) continue;
        }
        drawObject(sceneCtx,o);
      }
      sceneCtx.restore();
    }
    ctx.setTransform(1,0,0,1,0,0);
    ctx.drawImage(scene,0,0);
    ctx.setTransform(dpr,0,0,dpr,dpr*view.x,dpr*view.y);
    ctx.scale(view.scale,view.scale);
    if (live?.type && live.tool !== 'laser') drawObject(ctx,live);
    if (selection && objects.includes(selection)) drawSelection(ctx);
    for (const l of laser) drawObject(ctx,l);
    const text = `${Math.round(view.scale * 100)}%`;
    if (zoomLabel.textContent !== text) zoomLabel.textContent = text;
  }

  function drawBgImage(c, bgImg) {
    const img = getImage(bgImg.src);
    if (!img || !img.complete || !img.naturalWidth) return;
    c.drawImage(img, bgImg.x, bgImg.y, bgImg.w, bgImg.h);
    c.strokeStyle = 'rgba(127,127,127,.25)';
    c.lineWidth = 1;
    c.strokeRect(bgImg.x, bgImg.y, bgImg.w, bgImg.h);
  }

  const drawObject = (context, object) => paintBoardObject(context, object, getImage);

  function getImage(src) {
    if (imgCache.has(src)) return imgCache.get(src);
    const img = new Image();
    img.onload = () => { sceneRevision++; mark(); };
    img.src = src;
    imgCache.set(src, img);
    return img;
  }

  /* ---------------- input ---------------- */
  function toWorld(e) {
    const r = canvas.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    return { x: (sx - view.x) / view.scale, y: (sy - view.y) / view.scale };
  }

  function hitObject(o, p, r) {
    if (o.type === 'stroke') {
      const lim = (o.size * 1.2 + 10) / view.scale;
      return o.points.some((pt) => Math.hypot(pt.x - p.x, pt.y - p.y) < lim);
    }
    if (o.type === 'shape') {
      const minX = Math.min(o.x0, o.x1) - 10, maxX = Math.max(o.x0, o.x1) + 10;
      const minY = Math.min(o.y0, o.y1) - 10, maxY = Math.max(o.y0, o.y1) + 10;
      return p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
    }
    if (o.type === 'text') {
      return p.x > o.x - 8 && p.x < o.x + 400 && p.y > o.y - 8 && p.y < o.y + o.fontSize * 2;
    }
    if (o.type === 'image') {
      return p.x > o.x && p.x < o.x + o.w && p.y > o.y && p.y < o.y + o.h;
    }
    if (o.type === 'emoji') {
      const r = o.size * 0.6;
      return p.x > o.x - r && p.x < o.x + r && p.y > o.y - r && p.y < o.y + r;
    }
    if (o.type === 'card') {
      return p.x > o.x && p.x < o.x + o.w && p.y > o.y && p.y < o.y + o.h;
    }
    return false;
  }

  function objectBounds(o) {
    if (o.type === 'stroke') {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      const pad = o.size * (o.tool === 'highlighter' ? 1.6 : o.pressured ? .85 : .5) + 2;
      o.points.forEach((pt) => {
        minX = Math.min(minX, pt.x - pad); maxX = Math.max(maxX, pt.x + pad);
        minY = Math.min(minY, pt.y - pad); maxY = Math.max(maxY, pt.y + pad);
      });
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
    if (o.type === 'shape') {
      const pad = o.size / 2 + 2;
      return {
        x: Math.min(o.x0, o.x1) - pad, y: Math.min(o.y0, o.y1) - pad,
        w: Math.abs(o.x1 - o.x0) + pad * 2, h: Math.abs(o.y1 - o.y0) + pad * 2,
      };
    }
    if (o.type === 'text') {
      const lines = String(o.text).split('\n');
      const w = Math.max(...lines.map((l) => l.length * o.fontSize * 0.56), 20);
      return { x: o.x, y: o.y - o.fontSize, w, h: lines.length * o.fontSize * 1.3 + 6 };
    }
    if (o.type === 'image' || o.type === 'card') return { x: o.x, y: o.y, w: o.w, h: o.h };
    if (o.type === 'emoji') return { x: o.x - o.size / 2, y: o.y - o.size / 2, w: o.size, h: o.size };
    return null;
  }

  function moveObject(o, dx, dy) {
    boundsCache.delete(o); sceneRevision++;
    if (o.type === 'stroke') o.points.forEach((pt) => { pt.x += dx; pt.y += dy; });
    else if (o.type === 'shape') { o.x0 += dx; o.x1 += dx; o.y0 += dy; o.y1 += dy; }
    else { o.x += dx; o.y += dy; }
  }

  function scaleObject(o, f, ax, ay) {
    boundsCache.delete(o); sceneRevision++;
    const sx = (v) => ax + (v - ax) * f;
    const sy = (v) => ay + (v - ay) * f;
    if (o.type === 'stroke') {
      o.points.forEach((pt) => { pt.x = sx(pt.x); pt.y = sy(pt.y); });
      o.size *= f;
    } else if (o.type === 'shape') {
      o.x0 = sx(o.x0); o.x1 = sx(o.x1); o.y0 = sy(o.y0); o.y1 = sy(o.y1);
      o.size *= f;
    } else if (o.type === 'text') {
      o.x = sx(o.x); o.y = sy(o.y); o.fontSize *= f;
    } else if (o.type === 'emoji') {
      o.x = sx(o.x); o.y = sy(o.y); o.size *= f;
    } else if (o.type === 'image' || o.type === 'card') {
      const b = { x: o.x, y: o.y, w: o.w, h: o.h };
      o.x = sx(b.x); o.y = sy(b.y); o.w = b.w * f; o.h = b.h * f;
    }
  }

  function drawSelection(c) {
    const b = objectBounds(selection);
    if (!b) return;
    const px = 1 / view.scale;
    c.save();
    c.strokeStyle = '#6366f1';
    c.fillStyle = '#6366f1';
    c.lineWidth = 1.6 * px;
    c.setLineDash([6 * px, 4 * px]);
    c.strokeRect(b.x - 4 * px, b.y - 4 * px, b.w + 8 * px, b.h + 8 * px);
    c.setLineDash([]);
    const hs = 9 * px;
    c.fillStyle = '#ffffff';
    c.strokeStyle = '#6366f1';
    c.lineWidth = 1.8 * px;
    c.beginPath();
    c.rect(b.x + b.w + 4 * px - hs / 2, b.y + b.h + 4 * px - hs / 2, hs, hs);
    c.fill();
    c.stroke();
    c.restore();
  }

  function deleteSelection() {
    if (!selection) return false;
    const i = objects.indexOf(selection);
    if (i < 0) { selection = null; return false; }
    pushHistory();
    objects.splice(i, 1);
    page().objects = objects;
    selection = null;
    mark(); scheduleSave(); updateButtons();
    return true;
  }

  function duplicateSelection() {
    if (!selection) return;
    const copy = JSON.parse(JSON.stringify(selection));
    moveObject(copy, 24, 24);
    pushHistory();
    objects.push(copy);
    page().objects = objects;
    selection = copy;
    mark(); scheduleSave(); updateButtons();
    toast('Item duplicated', 'ok', 1400);
  }

  function eraseBounds(o) {
    if (boundsCache.has(o)) return boundsCache.get(o);
    let box = objectBounds(o);
    if (o.type === 'text') box = { x: o.x-8, y: o.y-8, w: 408, h: o.fontSize*2+8 };
    if (o.type === 'shape') box = { x: box.x-10, y: box.y-10, w: box.w+20, h: box.h+20 };
    boundsCache.set(o,box);
    return box;
  }
  function flushEraser() {
    if (eraserFrame) cancelAnimationFrame(eraserFrame);
    eraserFrame = 0;
    if (!live?.erasing) return;
    const { index, samples, radius, step, before } = live;
    let changed = false;
    const clip = (o,p) => {
      if (o.type === 'stroke' && !eraseWhole) {
        const parts = eraseStroke(o.points,p,radius + o.size*(o.tool === 'highlighter' ? 1.6 : .55));
        return parts && parts.map(points => ({ ...o, points }));
      }
      return hitObject(o,p) ? [] : null;
    };
    for (const p of samples.splice(0)) {
      const from = live.last || p;
      const count = Math.min(64,Math.max(1,Math.ceil(Math.hypot(p.x-from.x,p.y-from.y)/step)));
      for (let j=1;j<=count;j++) {
        const t = j/count;
        changed = index.visit({ x: from.x+(p.x-from.x)*t, y: from.y+(p.y-from.y)*t },clip) || changed;
      }
      live.last = p;
    }
    if (!changed) return;
    if (!live.dirty) { live.dirty = true; pushHistory(before); }
    objects = index.objects();
    page().objects = objects;
    mark(); updateButtons();
  }
  function queueErase(p) {
    const samples = live.samples;
    if (samples.length >= 24) samples[samples.length-1] = p;
    else samples.push(p);
    if (!eraserFrame) eraserFrame = requestAnimationFrame(flushEraser);
  }

  canvas.addEventListener('pointerdown', (e) => {
    // Palm rejection: the pen engine decides whether a contact is a palm,
    // a resting hand, or an intentional finger stroke.
    if (e.pointerType === 'touch' && !pen.shouldDraw(e, penSettings)) return;

    pointers.set(e.pointerId, e);
    canvas.setPointerCapture(e.pointerId);

    if (pointers.size === 2) {
      // Pinching ends an eraser gesture without losing work already applied.
      if (live?.erasing) { flushEraser(); if (live.dirty) scheduleSave(); }
      live = null;
      const [a, b] = Array.from(pointers.values());
      pinch = {
        dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        scale: view.scale,
        cx: (a.clientX + b.clientX) / 2,
        cy: (a.clientY + b.clientY) / 2,
        vx: view.x, vy: view.y,
      };
      return;
    }
    if (pointers.size > 2) return;

    const p = toWorld(e);
    const erasing = tool === 'eraser';
    const panning = tool === 'pan' || spaceHeld || e.button === 1;
    tapInfo = { x: e.clientX, y: e.clientY, t: performance.now() };

    // place a pending emoji sticker
    if (pendingEmoji && !panning) {
      pushHistory();
      objects.push({ type: 'emoji', char: pendingEmoji, x: p.x, y: p.y, size: Math.max(44, size * 11), color: document.documentElement.dataset.theme === 'light' ? '#0f172a' : '#ffffff' });
      page().objects = objects;
      pendingEmoji = null;
      updateEmojiHint();
      mark(); scheduleSave(); updateButtons();
      return;
    }

    if (tool === 'select' && !panning) {
      if (selection) {
        const b = objectBounds(selection);
        const grab = 16 / view.scale;
        if (b && Math.abs(p.x - (b.x + b.w)) < grab && Math.abs(p.y - (b.y + b.h)) < grab) {
          const previous = snapshot();
          const original = selection;
          selection = structuredClone(original);
          objects[objects.indexOf(original)] = selection;
          live = { resizing: true, obj: selection, anchor: { x: b.x, y: b.y }, base: original,
            w0: Math.max(4,b.w), h0: Math.max(4,b.h), start: p, snapshot: previous, dirty: false };
          return;
        }
      }
      const hit = [...objects].reverse().find((o) => hitObject(o, p));
      selection = hit || null;
      updateButtons();
      if (hit) {
        const previous = snapshot();
        selection = structuredClone(hit);
        objects[objects.indexOf(hit)] = selection;
        live = { moving: true, obj: selection, last: p, start: p, snapshot: previous, dirty: false };
      }
      mark();
      return;
    }

    if (panning) {
      live = { pan: true, sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
      canvas.style.cursor = 'grabbing';
      return;
    }
    if (erasing) {
      const radius = Math.max(8,size*1.4)/view.scale;
      live = { erasing: true, index: createEraserIndex(objects,eraseBounds,Math.max(radius+2,(size*1.2+14)/view.scale)),
        radius, step: radius*.85, before: snapshot(), samples: [p] };
      flushEraser();
      return;
    }
    if (tool === 'text') {
      createTextInput(p);
      return;
    }
    const pressure = e.pointerType === 'pen' ? clamp(e.pressure || 0.5, 0.05, 1) : 0.5;
    const tiltF = e.pointerType === 'pen' && penSettings.tilt ? Math.min(1, (Math.hypot(e.tiltX || 0, e.tiltY || 0) / 70)) : 0;
    if (tool === 'laser') {
      live = { type: 'stroke', tool: 'laser', color: '#ff3b5c', size: size + 2, points: [{ ...p, p: pressure }] };
      return;
    }
    pushHistory();
    if (tool === 'pen' || tool === 'highlighter') {
      let width = tool === 'highlighter' ? Math.max(6, size) : size;
      if (tool === 'highlighter') width *= 1 + tiltF * 0.9;
      live = {
        type: 'stroke', tool, color, size: width,
        points: [{ ...p, p: pressure }],
        pressured: e.pointerType === 'pen' && penSettings.pressure && tool === 'pen',
      };
    } else {
      live = { type: 'shape', shape: tool, color, size, x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    }
    mark();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, e);

    if (tool === 'eraser') {
      const r = stage.getBoundingClientRect();
      eraserRing.style.display = 'block';
      eraserRing.style.width = eraserRing.style.height = `${Math.max(16, size * 3)}px`;
      eraserRing.style.transform = `translate3d(${e.clientX-r.left}px,${e.clientY-r.top}px,0) translate(-50%,-50%)`;
    } else if (eraserRing.style.display !== 'none') {
      eraserRing.style.display = 'none';
    }

    if (pinch && pointers.size === 2) {
      const [a, b] = Array.from(pointers.values());
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const r = canvas.getBoundingClientRect();
      const ns = clamp(pinch.scale * (dist / pinch.dist), 0.2, 6);
      const cx = (a.clientX + b.clientX) / 2 - r.left;
      const cy = (a.clientY + b.clientY) / 2 - r.top;
      view.scale = ns;
      view.x = cx - ((cx - (pinch.cx - r.left)) * ns) / pinch.scale;
      view.y = cy - ((cy - (pinch.cy - r.top)) * ns) / pinch.scale;
      zoomLabel.textContent = `${Math.round(ns * 100)}%`;
      mark();
      return;
    }

    if (!live) return;
    if (live.pan) {
      view.x = live.vx + (e.clientX - live.sx);
      view.y = live.vy + (e.clientY - live.sy);
      mark();
      return;
    }
    const p = toWorld(e);
    if (live.erasing) { queueErase(p); return; }
    if (live.moving) {
      const dx = p.x - live.last.x;
      const dy = p.y - live.last.y;
      if (!live.dirty && Math.hypot(p.x - live.start.x, p.y - live.start.y) < 1.2) return;
      live.dirty = true;
      moveObject(live.obj, dx, dy);
      live.last = p;
      mark();
      return;
    }
    if (live.resizing) {
      live.dirty = true;
      const f = clamp((p.x - live.anchor.x) / live.w0, 0.12, 14);
      live.obj = selection;
      Object.keys(selection).forEach((k) => { delete selection[k]; });
      Object.assign(selection, structuredClone(live.base));
      scaleObject(selection, f, live.anchor.x, live.anchor.y);
      mark();
      return;
    }
    if (live.type === 'stroke') {
      let prev = live.points[live.points.length - 1];
      const smooth = clamp(penSettings.smoothing, 0, 0.85);
      const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      const raw = events.length ? events.map((ev) => ({ pt: toWorld(ev), pr: ev.pressure })) : [{ pt: p, pr: e.pressure }];
      for (const item of raw) {
        const x = prev.x + (item.pt.x - prev.x) * (1 - smooth);
        const y = prev.y + (item.pt.y - prev.y) * (1 - smooth);
        if (Math.hypot(x - prev.x, y - prev.y) < 0.55) continue;
        const pr = e.pointerType === 'pen' ? clamp(item.pr || 0.5, 0.05, 1) : 0.5;
        const pt = { x, y, p: pr };
        live.points.push(pt);
        prev = pt;
      }
      if (live.tool === 'laser') laser = [live];
    } else if (live.type === 'shape') {
      live.x1 = p.x; live.y1 = p.y;
    }
    mark();
  });

  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (pinch && pointers.size < 2) { pinch = null; }
    if (!live) return;
    if (live.moving) {
      const moved = live.dirty;
      const snap = live.snapshot;
      live = null;
      if (moved) {
        history.push(snap);
        if (history.length > 60) history.shift();
        future.length = 0;
        page().objects = objects;
        scheduleSave(); updateButtons();
      }
      mark();
      return;
    }
    if (live.resizing) {
      const snap = live.snapshot;
      live = null;
      history.push(snap);
      if (history.length > 60) history.shift();
      future.length = 0;
      page().objects = objects;
      scheduleSave(); updateButtons();
      mark();
      return;
    }
    const wasPan = live.pan;
    if (wasPan) canvas.style.cursor = tool === 'pan' ? 'grab' : 'crosshair';
    if (live.erasing) {
      if (e.type === 'pointerup') queueErase(toWorld(e));
      flushEraser(); if (live.dirty) scheduleSave();
      live = null; return;
    }
    if (live.type === 'stroke' && live.tool !== 'laser') {
      if (live.points.length === 1) {
        const p = live.points[0];
        live.points.push({ x: p.x + 0.4, y: p.y + 0.4 });
      }
      objects.push(live);
      page().objects = objects;
      live = null;
      scheduleSave();
      updateButtons();
      mark();
      return;
    }
    if (live.type === 'shape') {
      const w = Math.abs(live.x1 - live.x0);
      const h = Math.abs(live.y1 - live.y0);
      if (w > 3 || h > 3) {
        objects.push(live);
        page().objects = objects;
        scheduleSave();
        updateButtons();
      }
      live = null;
      mark();
      return;
    }
    if (live.type === 'stroke' && live.tool === 'laser') {
      const l = live;
      live = null;
      setTimeout(() => {
        laser = laser.filter((x) => x !== l);
        mark();
      }, 1200);
    }
    live = null;
    mark();
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', () => { eraserRing.style.display = 'none'; });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) {
      zoomAt(e.deltaY < 0 ? 1.1 : 0.9, e.clientX - r.left, e.clientY - r.top);
    } else if (e.shiftKey) {
      view.x -= e.deltaY; mark();
    } else {
      view.y -= e.deltaY; view.x -= e.deltaX; mark();
    }
  }, { passive: false });

  /* drag & drop images / pdf pages */
  ['dragover', 'dragenter'].forEach((t) => stage.addEventListener(t, (e) => { e.preventDefault(); stage.style.outline = '2px dashed var(--accent)'; stage.style.outlineOffset = '-8px'; }));
  ['dragleave', 'drop'].forEach((t) => stage.addEventListener(t, () => { stage.style.outline = 'none'; }));
  stage.addEventListener('drop', async (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (!file) { toast('Drop a local image or PDF file', 'info'); return; }
    if (file.type.startsWith('image/')) {
      const src = await fileToDataURL(file);
      addImageObject(src);
    } else if (isDocument(file)) {
      openDocument(file);
    } else {
      toast('Drop an image, PDF, PPTX, DOCX, TXT or Markdown file', 'warn');
    }
  });

  /* ---------------- text ---------------- */
  function createTextInput(p) {
    const fontSize = clamp(size * 5, 16, 84);
    const ta = el('textarea', {
      class: 'wb-text-input',
      rows: '1',
      style: {
        left: `${p.x * view.scale + view.x}px`,
        top: `${p.y * view.scale + view.y}px`,
        color: color,
        fontSize: `${fontSize * view.scale}px`,
        minWidth: '160px',
      },
    });
    stage.append(ta);
    requestAnimationFrame(() => { ta.focus(); });
    let live = true;
    let committed = false;
    setTimeout(() => { live = false; }, 220);
    ta.addEventListener('pointerdown', (e) => e.stopPropagation());
    const commit = () => {
      if (committed) return;
      if (live) { requestAnimationFrame(() => { if (!committed) ta.focus(); }); return; }
      committed = true;
      const text = ta.value.trim();
      if (ta.parentNode) ta.remove();
      if (!text) return;
      pushHistory();
      objects.push({ type: 'text', x: p.x, y: p.y, text, color, fontSize });
      page().objects = objects;
      mark(); scheduleSave(); updateButtons();
      setTool('pen');
    };
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { committed = true; if (ta.parentNode) ta.remove(); return; }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
      if (e.key === 'Enter' && e.shiftKey) {
        ta.style.height = 'auto';
        ta.style.height = `${ta.scrollHeight}px`;
      }
    });
    ta.addEventListener('blur', commit);
  }

  /* ---------------- images ---------------- */
  function addImageObject(src, opts = {}) {
    const img = getImage(src);
    const r = stage.getBoundingClientRect();
    const maxW = (r.width * 0.56) / view.scale;
    const maxH = (r.height * 0.56) / view.scale;
    const place = () => {
      const nw = img.naturalWidth || 800;
      const nh = img.naturalHeight || 600;
      const k = Math.min(maxW / nw, maxH / nh, 1);
      const w = nw * k, h = nh * k;
      const jitter = (objects.length % 3) - 1;
      const cx = (r.width / 2 - view.x) / view.scale + jitter * 26;
      const cy = (r.height / 2 - view.y) / view.scale + jitter * 22;
      if (opts.asBackground) {
        const kk = Math.min((r.width * 0.94) / view.scale / nw, (r.height * 0.94) / view.scale / nh);
        const bw = nw * kk, bh = nh * kk;
        sceneRevision++;
        page().bgImage = { src, x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh };
        page().bg = 'plain';
        setColor('#0f172a'); // write on top of a white page
        setTimeout(() => fitView(), 30);
      } else {
        pushHistory();
        objects.push({ type: 'image', src, x: cx - w / 2, y: cy - h / 2, w, h });
        page().objects = objects;
      }
      mark(); scheduleSave(); updateButtons();
    };
    if (img.complete && img.naturalWidth) place();
    else img.addEventListener('load', place, { once: true });
  }

  async function insertImage() {
    const files = await pickFiles({ accept: 'image/*', multiple: true });
    for (const f of files) {
      addImageObject(await fileToDataURL(f));
    }
    if (files.length) toast(`${files.length} image${files.length > 1 ? 's' : ''} added`, 'ok');
  }

  /* ---------------- pages ---------------- */
  function gotoPage(i) {
    if (i < 0 || i >= pages.length) return;
    selection = null;
    pageIndex = i;
    objects = page().objects;
    history = []; future = [];
    updateButtons();
    mark(); scheduleSave();
  }
  function addPage() {
    pages.push({ objects: [], bg: page().bg, bgColor: page().bgColor, bgImage: null });
    gotoPage(pages.length - 1);
    toast(`Page ${pages.length} added`, 'ok', 1600);
  }
  function deletePage() {
    if (pages.length <= 1) return;
    pages.splice(pageIndex, 1);
    pageIndex = Math.min(pageIndex, pages.length - 1);
    objects = page().objects;
    history = []; future = [];
    updateButtons(); mark(); scheduleSave();
    toast('Page deleted', 'info', 1600);
  }
  function pageThumb(pg) {
    const W = 168, H = 108;
    const out = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    out.width = W * dpr;
    out.height = H * dpr;
    out.style.width = `${W}px`;
    out.style.height = `${H}px`;
    const c = out.getContext('2d');
    const light = document.documentElement.dataset.theme === 'light';
    c.scale(dpr, dpr);
    c.fillStyle = light ? '#f8fafc' : '#0b1120';
    c.fillRect(0, 0, W, H);
    try {
      const src = renderPageToCanvas(pg, 1.2);
      const fit = Math.min((W - 10) / src.width, (H - 10) / src.height);
      const w = src.width * fit, h = src.height * fit;
      c.drawImage(src, (W - w) / 2, (H - h) / 2, w, h);
    } catch { /* empty page */ }
    c.strokeStyle = 'rgba(127,127,127,.28)';
    c.strokeRect(0.5, 0.5, W - 1, H - 1);
    return out;
  }

  let pageOverview;
  function showPageMenu() {
    pageOverview?.remove();
    const grid = el('div', { class: 'wb-pages-grid' });
    pages.forEach((pg, i) => {
      const card = el('div', { class: `wb-page-card${i === pageIndex ? ' active' : ''}` },
        pageThumb(pg),
        el('div', { class: 'wb-page-meta' },
          el('b', { text: `Page ${i + 1}${pg.title ? ` · ${pg.title}` : ''}` }),
          el('small', { text: `${pg.objects.length} item${pg.objects.length === 1 ? '' : 's'}${pg.bgImage ? ' · source' : ''}` })
        ),
        el('div', { class: 'wb-page-acts' },
          el('button', { class: 'mini-btn', text: 'Open', onclick: () => { gotoPage(i); closeModal(); } }),
          el('button', { class: 'mini-btn', text: 'Name', onclick: () => {
            const title = prompt('Page name (optional)', pg.title || '');
            if (title !== null) { pg.title = title.trim().slice(0,80); scheduleSave(); showPageMenu(); }
          } }),
          el('button', { class: 'mini-btn', text: '←', 'aria-label': 'Move page earlier', disabled: i === 0, onclick: () => movePage(i,-1) }),
          el('button', { class: 'mini-btn', text: '→', 'aria-label': 'Move page later', disabled: i === pages.length - 1, onclick: () => movePage(i,1) }),
          el('button', { class: 'mini-btn', text: 'Duplicate', onclick: () => duplicatePage(i) }),
          el('button', { class: 'mini-btn danger', text: 'Delete', disabled: pages.length <= 1, onclick: () => { removePage(i); } })
        )
      );
      card.addEventListener('dblclick', () => { gotoPage(i); closeModal(); });
      grid.append(card);
    });
    grid.append(el('button', { class: 'wb-page-add', onclick: () => { addPage(); showPageMenu(true); } },
      el('span', { html: icon('file-plus') }), el('b', { text: 'New page' }), el('small', { text: 'Blank page with the same background' })
    ));

    const backdrop = el('div', { class: 'modal-backdrop' },
      el('div', { class: 'modal wb-pages-modal' },
        el('h3', { text: 'Board pages' }),
        el('p', { text: `${pages.length} page${pages.length === 1 ? '' : 's'} · tap a card to jump, duplicate to reuse a layout.` }),
        grid,
        el('div', { class: 'modal-foot' },
          el('button', { class: 'btn', text: 'Add page', onclick: () => { addPage(); showPageMenu(true); } }),
          el('button', { class: 'btn primary', text: 'Close', onclick: () => closeModal() })
        )
      )
    );
    pageOverview = backdrop;
    function closeModal() { backdrop.remove(); pageOverview = null; }
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });
    document.body.append(backdrop);
  }

  function movePage(i, delta) {
    const pg = page();
    const [moved] = pages.splice(i,1);
    pages.splice(i+delta,0,moved);
    pageIndex = pages.indexOf(pg); updateButtons(); scheduleSave(); showPageMenu();
  }
  function duplicatePage(i) {
    const src = pages[i];
    pages.splice(i + 1, 0, JSON.parse(JSON.stringify({ objects: src.objects, bg: src.bg, bgColor: src.bgColor, bgImage: src.bgImage, title: src.title })));
    updateButtons();
    mark(); scheduleSave();
    showPageMenu(true);
    toast(`Page ${i + 1} duplicated`, 'ok', 1500);
  }

  function removePage(i) {
    if (pages.length <= 1) return;
    pages.splice(i, 1);
    if (pageIndex >= pages.length) pageIndex = pages.length - 1;
    if (pageIndex >= i && pageIndex > 0) pageIndex = Math.min(pageIndex, pages.length - 1);
    objects = page().objects;
    history = []; future = [];
    updateButtons(); mark(); scheduleSave();
    showPageMenu(true);
  }

  function clearPage() {
    if (!objects.length && !page().bgImage) return;
    pushHistory();
    objects = [];
    page().objects = objects;
    if (!annotation) page().bgImage = null;
    mark(); scheduleSave(); updateButtons();
    toast('Page cleared — undo with Ctrl+Z', 'info');
  }
  /* ---------------- export ---------------- */
  function boundsFor(pg, fallbackW, fallbackH) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const add = (x, y, w = 0, h = 0) => {
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
    };
    if (pg.bgImage) add(pg.bgImage.x, pg.bgImage.y, pg.bgImage.w, pg.bgImage.h);
    pg.objects.forEach((o) => {
      if (o.type === 'stroke') o.points.forEach((p) => add(p.x - o.size, p.y - o.size, o.size * 2, o.size * 2));
      else if (o.type === 'shape') add(Math.min(o.x0, o.x1) - o.size, Math.min(o.y0, o.y1) - o.size, Math.abs(o.x1 - o.x0) + o.size * 2, Math.abs(o.y1 - o.y0) + o.size * 2);
      else if (o.type === 'text') add(o.x, o.y, Math.max(...String(o.text).split('\n').map((l) => l.length * o.fontSize * 0.6)), o.fontSize * 1.4 * String(o.text).split('\n').length);
      else if (o.type === 'image') add(o.x, o.y, o.w, o.h);
      else if (o.type === 'emoji') add(o.x - o.size / 2, o.y - o.size / 2, o.size, o.size);
      else if (o.type === 'card') add(o.x, o.y, o.w, o.h);
    });
    if (!isFinite(minX)) return { x: 0, y: 0, w: fallbackW, h: fallbackH };
    const pad = 40;
    return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
  }

  function renderPageToCanvas(pg, scale = 2, opts = {}) {
    const r = stage.getBoundingClientRect();
    const b = boundsFor(pg, r.width / view.scale, r.height / view.scale);
    const out = document.createElement('canvas');
    scale = Math.min(scale, 4200 / Math.max(b.w, b.h), Math.sqrt(7500000 / (b.w * b.h)));
    out.width = Math.max(1, Math.round(b.w * scale));
    out.height = Math.max(1, Math.round(b.h * scale));
    const c = out.getContext('2d');
    const light = opts.light ?? (document.documentElement.dataset.theme === 'light');
    c.fillStyle = pg.bgColor || BG_FILLS[pg.bg] || (light ? '#ffffff' : '#0e1424');
    c.fillRect(0, 0, out.width, out.height);
    c.save();
    c.scale(scale, scale);
    c.translate(-b.x, -b.y);
    paintBgPattern(c, b, pg.bg, light, 1);
    if (pg.bgImage) {
      const img = getImage(pg.bgImage.src);
      if (img.complete && img.naturalWidth) c.drawImage(img, pg.bgImage.x, pg.bgImage.y, pg.bgImage.w, pg.bgImage.h);
    }
    pg.objects.forEach((o) => drawObject(c, o));
    c.restore();
    return out;
  }

  function exportPNG() {
    try {
      const out = renderPageToCanvas(page(), 2);
      out.toBlob((blob) => {
        if (!blob) return;
        downloadBlob(blob, `smartboard-page-${pageIndex + 1}.png`);
        toast('PNG downloaded', 'ok');
      }, 'image/png');
    } catch (e) { console.error(e); toast('Export failed', 'err'); }
  }

  async function exportPDF() {
    try {
      const { jsPDF } = window.jspdf || {};
      if (!jsPDF) { toast('PDF library not loaded', 'err'); return; }
      const first = renderPageToCanvas(pages[0], 1.6);
      const landscape = first.width >= first.height;
      const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'pt', format: 'a4', compress: true });
      const pw = doc.internal.pageSize.getWidth();
      const ph = doc.internal.pageSize.getHeight();
      pages.forEach((pg, i) => {
        if (i > 0) doc.addPage(landscape ? 'a4' : 'a4', landscape ? 'landscape' : 'portrait');
        const c = renderPageToCanvas(pg, 1.6);
        const data = c.toDataURL('image/jpeg', 0.92);
        const ratio = Math.min((pw - 32) / c.width, (ph - 32) / c.height);
        const w = c.width * ratio, h = c.height * ratio;
        doc.addImage(data, 'JPEG', (pw - w) / 2, (ph - h) / 2, w, h);
      });
      doc.save(`SmartBoard-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast(`Exported ${pages.length} page PDF`, 'ok');
    } catch (e) {
      console.error(e);
      toast('PDF export failed', 'err');
    }
  }

  /* ---------------- persistence ---------------- */
  const scheduleSave = debounce(() => saveSession(false), 500);

  function serialize() {
    const savedPages = annotation ? [{ ...pages[0], bgImage: null }] : pages;
    return { pages: savedPages, pageIndex, savedAt: Date.now(), version: 1 };
  }

  async function saveSession(manual = false, immediate = false) {
    if (replacing) return false;
    try {
      const payload = serialize();
      const saved = await idb.set('boards', storageKey, payload);
      if (!saved) throw new Error('Storage is unavailable');
      if (!annotation && !replacing) checkpoint(payload, manual ? 'Manual save' : 'Autosave').catch(console.warn);
      if (!annotation && payload.pages.every(p => !p.bgImage && p.objects.length < 1500 && !p.objects.some(o => o.type === 'image'))) store.set('board-mirror', payload);
      if (immediate || manual) await archive.write(payload);
      else archive.schedule(payload);
      if (manual) { toast('Board saved on this device', 'ok'); beep({ freq: 660, dur: 0.08 }); }
    } catch (e) {
      console.warn(e);
      if (manual) toast('Could not save board', 'err');
      return false;
    }
    return true;
  }

  async function loadSession() {
    try {
      let data = await idb.get('boards', storageKey);
      const mirror = annotation ? null : store.get('board-mirror', null);
      if (mirror && (!data || (mirror.savedAt || 0) > (data.savedAt || 0))) data = mirror;
      if (data && Array.isArray(data.pages) && data.pages.length) {
        pages = (annotation ? data.pages.slice(0, 1) : data.pages).map((p) => ({ objects: p.objects || [], bg: p.bg || 'grid', bgColor: /^#[a-f0-9]{6}$/i.test(p.bgColor) ? p.bgColor : undefined, bgImage: p.bgImage || null, title: p.title }));
        if (annotation) pages[0].bgImage = annotation.image;
        pageIndex = clamp(data.pageIndex || 0, 0, pages.length - 1);
        objects = pages[pageIndex].objects;
        pages.forEach((p) => p.objects.forEach((o) => { if (o.type === 'image') getImage(o.src); if (p.bgImage) getImage(p.bgImage.src); }));
        if (pages.some((p) => p.objects.length || p.bgImage)) {
          if (!annotation) toast('Last board restored', 'info', 2600);
          setTimeout(() => fitView(), 80);
        }
      }
    } catch (e) { console.warn(e); }
  }

  /* flush the board when the tab is hidden or closed */
  const flush = () => {
    saveSession(false, true);
    // synchronous safety net for hard reloads / crashes
    try {
      if (!annotation && !pages.some(p => p.bgImage || p.objects.length > 1500 || p.objects.some(o => o.type === 'image'))) store.set('board-mirror', serialize());
    } catch { /* quota */ }
  };
  const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', flush);

  /* ---------------- shortcuts ---------------- */
  function onKey(e) {
    if (!isVisible() || replacing) return;
    if (e.key === 'Escape' && (colorPop.style.display === 'grid' || !bgMenu.hidden)) {
      toggleColors(false); toggleBackgrounds(false); return;
    }
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    if (typing) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveSession(true); return; }
    if (e.key === ' ') { spaceHeld = true; canvas.style.cursor = 'grab'; }
    const map = { s: 'select', p: 'pen', h: 'highlighter', e: 'eraser', l: 'line', a: 'arrow', r: 'rect', o: 'ellipse', t: 'text', z: 'laser', v: 'pan' };
    const k = e.key.toLowerCase();
    if (e.key === 'Escape' && pendingEmoji) { pendingEmoji = null; updateEmojiHint(); return; }
    if (e.key === 'Escape' && selection) { selection = null; updateButtons(); mark(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selection) { e.preventDefault(); deleteSelection(); return; }
    if (mod && e.key.toLowerCase() === 'd' && selection) { e.preventDefault(); duplicateSelection(); return; }
    if (!mod && map[k]) setTool(map[k]);
    if (e.key === '[') { size = clamp(size - 1, 1, 26); sizeInput.value = size; }
    if (e.key === ']') { size = clamp(size + 1, 1, 26); sizeInput.value = size; }
  }
  function onKeyUp(e) {
    if (e.key === ' ') { spaceHeld = false; if (tool !== 'pan') canvas.style.cursor = 'crosshair'; }
  }
  const onTheme = () => {
    const light = document.documentElement.dataset.theme === 'light';
    if (!annotation && light && color === '#ffffff') setColor('#0f172a');
    if (!annotation && !light && color === '#0f172a') setColor('#ffffff');
    mark();
  };
  window.addEventListener('sbos:theme', onTheme);

  const isVisible = () => document.body.contains(root) && !!stage.getClientRects().length && api.head.closest('.win')?.classList.contains('focused');
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKeyUp);

  /* ---------------- init ---------------- */
  await loadSession();
  updateButtons();
  setTool(tool);
  if (annotation) { getImage(annotation.image.src); requestAnimationFrame(fitView); }
  if (!annotation && floatState.on) toggleFloat(true);
  // Sticker images are loaded lazily on first use.

  const ro = new ResizeObserver(() => resizeCanvas());
  ro.observe(stage);
  resizeCanvas();
  requestAnimationFrame(resizeCanvas);

  // params: image from PDF viewer and tool requests
  async function openLessonBoard(board, title) {
    if (annotation || replacing) return;
    replacing = true;
    try {
      if (!await checkpoint(serialize(), 'Before opening a lesson', true)) throw Error('Could not keep a recovery point; export your current board first.');
      if (!root.isConnected) return;
      const next = structuredClone(board);
      if (!await idb.set('boards', storageKey, { ...next, savedAt: Date.now() })) throw Error('Could not save the lesson board.');
      store.del('board-mirror');
      pages = next.pages;
      gotoPage(next.pageIndex);
      fitView();
      toast(`${title || 'Lesson'} opened`, 'ok');
    } catch (e) { toast(e.message || 'Could not open lesson', 'err'); }
    finally { replacing = false; }
  }
  const handleParams = (p = {}) => {
    if (p.lessonBoard) { openLessonBoard(p.lessonBoard, p.title); return; }
    if (p.image) {
      if (p.newPage && (objects.length || page().bgImage)) addPage();
      addImageObject(p.image, { asBackground: !!p.asBackground });
      toast(p.title ? `${p.title} sent to board` : 'Image added to board', 'ok');
    }
    if (p.page) gotoPage(clamp(p.page - 1, 0, pages.length - 1));
    if (p.tool && TOOLS.some((t) => t.id === p.tool)) setTool(p.tool);
    if (p.picker) { buildEmojiPop(); emojiPop.hidden = false; }
    if (p.addPage) addPage();
    if (p.file || p.document) openDocument(p.file);
  };
  handleParams(params);

  return {
    save: async () => { const saved = await embedded?.save?.(); return saved === false ? false : saveSession(false, true); },
    onParams: handleParams,
    onResize: () => resizeCanvas(),
    onClose: () => {
      const saved = saveSession(false, true);
      docEpoch++; embedded?.onClose?.(); mini?.close();
      pageOverview?.remove();
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
      if (eraserFrame) cancelAnimationFrame(eraserFrame);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('sbos:theme', onTheme);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      return saved;
    },
    exportPDF,
    exportPNG,
    addPage,
    getPages: () => pages,
    state: () => ({
      tool, pageIndex, pageCount: pages.length,
      objects: objects.map((o) => ({
        type: o.type, pressured: !!o.pressured, pts: o.points?.length,
        p: o.points?.[0]?.p, char: o.char, url: o.url,
      })),
      pen: penSettings,
    }),
  };
}

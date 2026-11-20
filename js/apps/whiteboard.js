/* Whiteboard — infinite-feel canvas with pages, shapes, text, images, PDF export */
import { el, clamp, toast, downloadBlob, downloadURL, pickFiles, fileToDataURL, debounce, uid, beep, fmtClock } from '../utils.js';
import { createEraserIndex, eraseStroke } from '../eraser.js';
import { archiveWriter } from '../archive.js';
import { ACCEPT, isDocument } from '../document-import.js';
import { MAX_BOARD_PAGES, isBlankBoardPage, insertBlankBoardPage, insertDocumentPages, readDocumentPages } from '../board-document.js';
import { BG_NAMES, BG_FILLS, templates, templatePreview, paintBgPattern } from '../board-templates.js';
import { movableControls, resetBoardControls } from '../control-layout.js';
import { icon, iconEl } from '../icons.js';
import { getSettings, idb, store } from '../db.js';
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
export const TOOLS = [
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
const EMOJI_GROUPS = [
  { name: 'Class', list: ['😀', '🙂', '😊', '🤓', '🎓', '👏', '🙋', '✋', '👍', '👎', '💡', '✅', '❌', '❗', '❓', '⭐', '🌟', '🏆', '🎯', '📌'] },
  { name: 'School', list: ['📚', '📖', '📝', '✏️', '🖊️', '📏', '📐', '🧮', '📊', '📈', '🗓️', '⏰', '🎒', '🏫', '🔬', '🔭', '🧪', '⚗️', '🖇️', '📎'] },
  { name: 'Science', list: ['🌍', '🌞', '🌙', '⭐', '🪐', '🚀', '🧬', '🧠', '❤️', '🫁', '🌱', '🌳', '🍁', '💧', '🔥', '⚡', '🌡️', '🧲', '⚛️', '🔋'] },
  { name: 'Fun', list: ['🎉', '🎊', '🎈', '🎁', '🏅', '🥇', '⚽', '🏏', '🎨', '🎵', '🎬', '🕹️', '🐶', '🐱', '🦁', '🐘', '🦋', '🌈', '🍎', '🍕'] },
];

export async function mount({ root, params = {}, api }) {
  /* ---------------- state ---------------- */
  const storageKey = 'current';
  const archive = archiveWriter('board');
  let pages = [{ objects: [], bg: 'grid', bgImage: null }];
  let pageIndex = 0;
  let tool = 'pen';
  let color = document.documentElement.dataset.theme === 'light' ? '#0f172a' : '#ffffff';
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
  let replacing = false, importing, closed = false, importDialog, templateDialog, activeThumbs;

  /* ---------------- DOM ---------------- */
  const stage = el('div', { class: 'wb-stage' });
  const canvas = el('canvas', { tabindex: '0', 'aria-label':'Whiteboard canvas' });
  stage.append(canvas);
  const ctx = canvas.getContext('2d');
  const scene = document.createElement('canvas');
  const sceneCtx = scene.getContext('2d', { alpha: false });
  let sceneKey, sceneObjects, sceneRevision = 0, eraserFrame = 0;
  const boundsCache = new WeakMap();

  const emptyHint = el('div', { class: 'wb-empty' },
    el('div', {}, el('b', { text: 'Board is ready' }), 'Draw, type or drop a PDF, PowerPoint or image'));
  stage.append(emptyHint);

  const badgeTool = el('span', { class: 'wb-badge', text: 'Pen' });
  const badgeInfo = el('span', { class: 'wb-badge', text: 'Page 1' });
  stage.append(el('div', { class: 'wb-status sr-only', 'aria-live': 'polite' }, badgeTool, badgeInfo));

  const zoomLabel = el('button', { class: 'tool-btn', text: '100%', title: 'Reset zoom', onclick: () => { view = { x: 0, y: 0, scale: 1 }; mark(); } });
  const zoomBox = el('div', { class: 'wb-zoom' },
    el('button', { class: 'tool-btn', html: icon('minus'), title: 'Zoom out', onclick: () => zoomBy(0.8) }),
    zoomLabel,
    el('button', { class: 'tool-btn', html: icon('plus'), title: 'Zoom in', onclick: () => zoomBy(1.25) }),
    el('button', { class: 'tool-btn', html: icon('expand'), title: 'Fit to content', onclick: () => fitView() })
  );


  const eraserRing = el('div', {
    style: {
      position: 'absolute', borderRadius: '50%', border: '1.5px solid var(--text-3)',
      pointerEvents: 'none', display: 'none', zIndex: '4', left: '0', top: '0', transform: 'translate(-50%,-50%)',
    },
  });
  stage.append(eraserRing);

  /* toolbar */
  const toolButtons = new Map();
  TOOLS.forEach((t) => {
    const b = el('button', {
      class: `tool-btn ${t.id === tool ? 'active' : ''}`, title: t.name, 'aria-label': t.name, html: icon(t.icon),
      onclick: () => setTool(t.id),
    });
    toolButtons.set(t.id, b);
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
    if (open) { closePanels(colorPop); placePanel(colorPop); }
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

  const pageLabel = el('button', { class: 'tool-btn', text: '1 / 1', title: 'Page overview', onclick: showPageMenu });
  const prevBtn = el('button', { class: 'tool-btn', title: 'Previous page', html: icon('chevron-left'), onclick: () => gotoPage(pageIndex - 1) });
  const nextBtn = el('button', { class: 'tool-btn', title: 'Next page', html: icon('chevron-right'), onclick: () => gotoPage(pageIndex + 1) });

  root.closest('.win')?.classList.add('board-workspace');
  const toolButton = (name, text, action) => el('button', { class: 'tool-btn', type: 'button', title: text, 'aria-label': text, html: icon(name), onclick: action });
  const grip = el('button', { class: 'tool-btn control-grip', type: 'button', title: 'Move toolbox · drag or use arrow keys (Home resets)', 'aria-label': 'Move drawing toolbox', html: '<span class="grip-dots" aria-hidden="true"></span>' });
  const moreBtn = toolButton('grid', 'More drawing tools', () => {
    morePop.hidden = !morePop.hidden; moreBtn.setAttribute('aria-expanded', String(!morePop.hidden));
    if (!morePop.hidden) { closePanels(morePop); placePanel(morePop); }
  });
  moreBtn.setAttribute('aria-expanded','false');
  const basic = ['select','pen','highlighter','eraser','text','line','arrow'];
  const primaryTools = basic.map(id => toolButtons.get(id));
  const morePop = el('div', { class: 'wb-pop wb-context-pop wb-more', hidden: true },
    el('div', { class: 'pop-head' }, el('b', { text: 'Shapes, brush & zoom' })),
    el('div', { class: 'drawing-grid' }, ...TOOLS.filter(t => !basic.includes(t.id)).map(t => toolButtons.get(t.id))),
    el('label', { class: 'wb-brush-label' }, 'Brush size ', sizeInput), eraseMode, zoomBox);
  const quickColours = ['#ef4444','#0ea5e9','#22c55e'];
  const colourButtons = quickColours.map((value, i) => el('button',{class:'tool-btn quick-colour',title:`${['Red','Blue','Green'][i]} ink`,'aria-label':`${['Red','Blue','Green'][i]} ink`,
    'aria-pressed':'false', onclick:() => { setColor(value); if (!['pen','highlighter','line','arrow','rect','ellipse','text'].includes(tool)) setTool('pen'); }},el('i',{style:{background:value}})));
  const newBtn = toolButton('file-plus','New page after current',addPage);
  newBtn.classList.add('new-board-page');
  const deletePageBtn = toolButton('trash','Delete current page',() => removePage(pageIndex, false));
  const deleteImageBtn = toolButton('image-x','Delete selected image',deleteImage);
  const pageStrip = el('div', { class: 'board-page-strip', role:'group', 'aria-label':'Board pages' },
    newBtn, prevBtn, pageLabel, nextBtn, deletePageBtn, deleteImageBtn);
  const inkTools=el('div',{class:'ink-tools',role:'group','aria-label':'Pen and ink'},grip,...primaryTools,
    el('span',{class:'colour-presets',role:'group','aria-label':'Ink presets'},...colourButtons),colorBtn,moreBtn,undoBtn,redoBtn);
  const toolbar = el('div', { class: 'app-toolbar wb-toolbar clean-toolbox', role: 'toolbar', 'aria-label': 'Drawing and page toolbox' },inkTools,pageStrip);

  const quick = (glyph,label,short,click,secondary = false) => el('button',{class:`tool-btn teaching-shortcut${secondary?' shortcut-secondary':''}`,type:'button',title:label,'aria-label':label,onclick:click},
    el('span',{class:'shortcut-icon',html:icon(glyph),'aria-hidden':'true'}), short && el('span',{class:'shortcut-label',text:short}));
  const importShortcut = quick('file-plus','Import PDF / PPT','Import',askForDocument);
  importShortcut.classList.add('shortcut-primary');
  const shortcuts = el('div',{class:'board-shortcuts',role:'toolbar','aria-label':'Teaching shortcuts'},
    importShortcut, quick('camera','Camera and recording','Camera',() => api.open('recording')),
    quick('smile','Stickers and emoji','Stickers',() => toggleEmoji(shortcuts)), quick('users','Classroom tools','Class tools',()=>mini.toggle()),
    quick('note','Open Notes','Notes',() => api.open('notes')), quick('image','Insert image',null,insertImage),
    quick('grid','Board designs',null,showTemplates), quick('save','Save board',null,() => saveSession(true),true),
    quick('download','Export board PDF',null,exportPDF,true), quick('expand','Fit page',null,fitView,true),
    quick('fullscreen','Toggle screen fullscreen',null,()=>window.__sbos.toggleFullscreen()), quick('rotate','Reset layout',null,resetBoardControls,true));
  const clockTime = el('time',{class:'board-clock-time'});
  const clock = el('div',{class:'board-clock',title:'Local time'},el('span',{html:icon('clock'),'aria-hidden':'true'}),clockTime);
  const updateClock = () => {
    const now = new Date(), {time,suffix} = fmtClock(now,getSettings().use24h);
    const label = suffix ? `${time} ${suffix}` : time;
    if (clockTime.textContent !== label) {
      clockTime.textContent = label;
      clockTime.dateTime = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    }
  };
  updateClock(); const clockTimer = setInterval(updateClock,1000);
  stage.append(shortcuts,clock,toolbar,morePop);
  const mini = classroomWidget(() => api.open('class'));
  stage.append(mini.node);
  const app = el('div', { class: 'app wb-app' }, stage);
  root.append(app);
  const positioning = movableControls({node: toolbar, handle: grip, bounds:stage, key:'teaching-tray',
    start: max => ({x: max.x / 2, y: max.y}), moved: () => { if (colorPop.style.display === 'grid') placePanel(colorPop); if (!morePop.hidden) placePanel(morePop); } });
  function placePanel(panel, anchor = toolbar) {
    const above = anchor.offsetTop > stage.clientHeight / 2;
    const w = panel.offsetWidth || 224;
    panel.style.left = `${clamp(anchor.offsetLeft + (anchor.offsetWidth - w)/2, 8, Math.max(8,stage.clientWidth-w-8))}px`;
    panel.style.right = 'auto';
    panel.style.top = above ? 'auto' : `${anchor.offsetTop + anchor.offsetHeight + 8}px`;
    panel.style.bottom = above ? `${stage.clientHeight - anchor.offsetTop + 8}px` : 'auto';
  }
  function closePanels(keep) {
    for (const p of [morePop, emojiPop, penPop]) if (p !== keep) p.hidden = true;
    moreBtn.setAttribute('aria-expanded', String(!morePop.hidden));
    if (keep !== colorPop) toggleColors(false);
  }
  stage.addEventListener('pointerdown', e => { if (e.target === canvas) closePanels(); });

  function askForDocument() {
    if (importing) return;
    pickFiles({accept: ACCEPT}).then(([file]) => { if (file) openDocument(file); });
  }
  function showImportDialog() {
    if (closed || importing || importDialog) return;
    const recent = el('div', {class:'import-recents'});
    const choose = el('button', {class:'btn primary', text:'Choose PDF or PowerPoint', onclick:() => { importDialog?.remove(); importDialog=null; askForDocument(); } });
    importDialog = boardDialog('Import to the board', [el('p',{text:'Every page or slide becomes a board page you can draw on. Pick PDF, PPTX, DOCX, TXT or Markdown.'}),choose,recent], () => { importDialog=null; });
    idb.get('docs','recents').then(list => {
      if (!recent.isConnected || !Array.isArray(list) || !list.length) return;
      recent.append(el('b',{text:'From the previous document reader'}), ...list.filter(item=>item.data).map(item=>el('button',{class:'btn',text:item.name,onclick:() => {
        importDialog?.remove(); importDialog=null; openDocument(new File([item.data],item.name,{type:'application/pdf'}));
      }})));
    });
  }
  async function openDocument(file) {
    if (!file) { showImportDialog(); return; }
    if (closed || importing || replacing) return;
    const ctrl = importing = new AbortController();
    const msg = el('p', { class:'board-import-status', role:'status', text:`Opening ${file.name}…` });
    const progress = el('progress', {'aria-label':'Import progress'});
    const cancel = el('button', {class:'btn', text:'Cancel import', onclick:() => ctrl.abort()});
    const overlay = el('div', {class:'board-import-overlay', role:'dialog','aria-modal':'true','aria-label':'Import document'},
      el('div', {class:'board-import-card'}, el('strong', {text:'Adding pages to your board'}), msg, progress, cancel));
    stage.append(overlay); cancel.focus({preventScroll:true});
    let inserted;
    try {
      const limit = MAX_BOARD_PAGES - pages.length + Number(pages.length === 1 && isBlankBoardPage(page()));
      if (limit <= 0) throw new Error('This board is full. Create room or save it as a lesson before importing.');
      const result = await readDocumentPages(file,{signal:ctrl.signal,limit,progress:(text,n,total) => {
        msg.textContent = text; progress.max=total; progress.value=n;
      }});
      if (ctrl.signal.aborted || closed) return;
      replacing = true;
      cancel.disabled = true;
      msg.textContent = 'Saving all pages on this device…';
      inserted = insertDocumentPages(pages,pageIndex,result.pages);
      const payload = {...inserted, version:1, savedAt:Date.now()};
      if (!await idb.set('boards',storageKey,payload)) throw Error('Could not save the imported pages. Free up some device storage and try again.');
      if (closed) return;
      store.del('board-mirror');
      pages = inserted.pages;
      gotoPage(inserted.pageIndex);
      const unit = result.imported === 'slides' ? 'slide' : 'page';
      toast(`${result.pages.length} ${unit}${result.pages.length===1?'':'s'} added to the board${result.inkCount ? ' · previous ink restored' : ''}`, 'ok', 4600);
      if (result.warnings?.length) toast(`Some PowerPoint items may differ (${result.warnings.join(', ')}). Use PDF for exact layout.`, 'warn', 7600);
      if (result.imported === 'text') toast('Text imported. For original formatting, import a PDF copy.', 'info', 5600);
    } catch (error) {
      if (!ctrl.signal.aborted && !closed) toast(error.message || 'Could not import that document. The board was not changed.', 'err', 7400);
    } finally {
      importing = null; replacing = false;
      overlay.remove();
      if (inserted && !closed) scheduleSave();
    }
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
  function toggleEmoji(anchor = toolbar) {
    if (emojiPop.hidden) { closePanels(); buildEmojiPop(); emojiPop.hidden = false; placePanel(emojiPop, anchor); }
    else emojiPop.hidden = true;
  }

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
  function togglePenSettings() {
    if (penPop.hidden) { closePanels(); buildPenPop(); penPop.hidden = false; placePanel(penPop); }
    else penPop.hidden = true;
  }
  const penListener = e => { penSettings = e.detail; };
  window.addEventListener('sbos:pen',penListener);

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
    toolButtons.forEach((b, k) => { b.classList.toggle('active', k === id); b.setAttribute('aria-pressed', String(k === id)); });
    moreBtn.classList.toggle('active', !basic.includes(id));
    badgeTool.textContent = selection && id === 'select' ? `Select · ${selection.type}` : (TOOLS.find((t) => t.id === id)?.name || id);
    canvas.style.cursor = id === 'pan' ? 'grab' : id === 'text' ? 'text' : id === 'eraser' ? 'none' : id === 'select' ? 'default' : 'crosshair';
    if (id !== 'select' && selection) { selection = null; mark(); }
    updateButtons();

    api.setTitle(`Whiteboard · ${TOOLS.find((t) => t.id === id)?.name}`);
  }
  function setColor(c) {
    color = c;
    colorDot.style.background = c;
    customColor.value = c;
    colourButtons.forEach((button,i)=>button.setAttribute('aria-pressed',String(quickColours[i]===c)));
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
    const b = isSourcePage(page()) ? page().bgImage : boundsFor(page(), r.width, r.height);
    const pad = page().bgImage ? 16 : 36;
    const top = Math.max(pad, shortcuts.offsetTop + shortcuts.offsetHeight + 8);
    const bottom = Math.max(pad, toolbar.offsetTop > r.height / 2 ? r.height - toolbar.offsetTop + 8 : 14);
    const h = Math.max(40,r.height-top-bottom);
    const scale = clamp(Math.min((r.width - pad * 2) / b.w, h / b.h), 0.03, 4);
    view.scale = scale;
    view.x = (r.width - b.w * scale) / 2 - b.x * scale;
    view.y = top + (h - b.h * scale) / 2 - b.y * scale;
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
    pageLabel.textContent = `${pageIndex + 1} / ${pages.length}`;
    badgeTool.textContent = selection && tool === 'select'
      ? `Select · ${selection.type}`
      : (TOOLS.find((t) => t.id === tool)?.name || tool);
    newBtn.disabled = pages.length >= MAX_BOARD_PAGES;
    deletePageBtn.disabled = pages.length <= 1;
    const canRemoveBackdrop = !!page().bgImage && !isSourcePage(page());
    deleteImageBtn.disabled = !(selection?.type === 'image' || canRemoveBackdrop);
    const imageAction = selection?.type !== 'image' && canRemoveBackdrop ? 'Delete background image' : 'Delete selected image';
    deleteImageBtn.title = imageAction;
    deleteImageBtn.setAttribute('aria-label', imageAction);
    pageLabel.setAttribute('aria-label', `Page ${pageIndex + 1} of ${pages.length}. Open page overview`);
    badgeInfo.textContent = `Page ${pageIndex + 1} · ${page().title || `${objects.length} items`}`;
    pageLabel.title = page().title ? `${page().title} · Page overview` : 'Page overview';
    emptyHint.style.display = objects.length || page().bgImage || templates[page().bg] ? 'none' : 'grid';
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
      sceneCtx.fillStyle = isSourcePage(pg) ? (light ? '#e1e6f1' : '#202638') : (pg.bgColor || BG_FILLS[pg.bg] || (light ? '#ffffff' : cssVar('--canvas-bg','#0e1424')));
      sceneCtx.fillRect(0,0,w,h);
      sceneCtx.save(); sceneCtx.translate(view.x, view.y); sceneCtx.scale(view.scale, view.scale);
      if (!isSourcePage(pg)) drawBackground(sceneCtx,w,h,pg.bg,light);
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
    if (imgCache.has(src)) { const hit=imgCache.get(src); imgCache.delete(src); imgCache.set(src,hit); return hit; }
    const img = new Image();
    img.onload = () => { sceneRevision++; mark(); };
    img.src = src;
    imgCache.set(src, img);
    if (imgCache.size > 20) imgCache.delete(imgCache.keys().next().value);
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
    if (importing || !file) return;
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

  function boardDialog(title, children, onClose) {
    const backdrop = el('div',{class:'modal-backdrop board-dialog'});
    const prior=document.activeElement;
    const close = () => { backdrop.remove(); onClose?.(); if (prior?.isConnected) prior.focus({preventScroll:true}); };
    const button = el('button',{class:'btn',text:'Close',onclick:close});
    const dialog = el('section',{class:'board-dialog-panel',role:'dialog','aria-modal':'true','aria-label':title},
      el('header',{},el('h2',{text:title}),button),...children);
    backdrop.append(dialog);
    backdrop.addEventListener('click',e=> {if(e.target===backdrop)close();});
    backdrop.addEventListener('keydown',e=> {
      if(e.key==='Escape'){e.stopPropagation();close();}
      if(e.key==='Tab'){
        const controls=[...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), select, a[href]')];
        if(e.shiftKey && document.activeElement===controls[0]){e.preventDefault();controls.at(-1)?.focus();}
        if(!e.shiftKey && document.activeElement===controls.at(-1)){e.preventDefault();controls[0]?.focus();}
      }
    });
    document.body.append(backdrop); button.focus(); return backdrop;
  }
  function applyBackground(id, newPage) {
    if (!Object.hasOwn(BG_NAMES,id) || importing || replacing) return;
    if (newPage && !addPage()) return;
    if (page().bgImage) { toast('Choose a blank board page for a new background.', 'info'); return; }
    pushHistory();
    page().bg=id; delete page().bgColor;
    usePageInk(); mark(); updateButtons(); scheduleSave();
  }
  function showTemplates() {
    if (templateDialog || importing) return;
    const create = el('input',{type:'checkbox'}); create.checked = !!page().bgImage;
    const set = id => { applyBackground(id, create.checked); templateDialog?.remove(); templateDialog=null; };
    const featured = el('div',{class:'board-template-grid'}, ...Object.entries(templates).map(([id,t])=>
      el('button',{class:'board-template-choice',onclick:()=>set(id)},templatePreview(id),el('b',{text:t.name}),el('small',{text:t.detail}))));
    const basics = el('div',{class:'board-background-chips'}, ...Object.entries(BG_NAMES).filter(([id])=>!templates[id]).map(([id,label])=>
      el('button',{class:`btn${page().bg===id?' primary':''}`,text:label,onclick:()=>set(id)})));
    const custom = el('input',{type:'color','aria-label':'Custom board colour',value:page().bgColor || '#263a63',onchange:e=>{
      if (create.checked && !addPage()) return;
      if (page().bgImage) { toast('Choose a blank page for a custom background.','info'); return; }
      pushHistory(); page().bgColor=e.target.value; usePageInk(); mark(); updateButtons(); scheduleSave(); templateDialog?.remove();templateDialog=null;
    }});
    templateDialog=boardDialog('Board designs',[
      el('p',{text:'Choose a teaching template or a simple writing surface.'}),
      el('label',{class:'template-create'},create,'Add as a new board page'),featured,
      el('h3',{text:'Classic surfaces'}),basics,el('label',{class:'template-create'},custom,'Custom board colour'),
    ],()=>{ templateDialog=null; });
  }

  /* ---------------- pages ---------------- */
  const isSourcePage = pg => !!pg.source && !!pg.bgImage;
  function usePageInk() {
    const pg = page();
    if (pg.bgImage || BG_FILLS[pg.bg] || pg.bgColor) {
      const hex = pg.bgColor || BG_FILLS[pg.bg] || '#ffffff';
      const lum = [1,3,5].reduce((v,i) => v + parseInt(hex.slice(i,i+2),16),0) / 3;
      if (lum > 142 && color === '#ffffff') setColor('#0f172a');
      if (lum < 125 && color === '#0f172a') setColor('#ffffff');
    } else if (color === '#0f172a' || color === '#ffffff') setColor(document.documentElement.dataset.theme === 'light' ? '#0f172a' : '#ffffff');
  }
  function gotoPage(i) {
    if (i < 0 || i >= pages.length) return;
    const leavingImage = !!pages[pageIndex]?.bgImage;
    live = null; selection = null;
    pageIndex = i;
    objects = page().objects;
    history = []; future = [];
    usePageInk(); updateButtons();
    if (page().bgImage) fitView();
    else if (leavingImage) { view = {x:0,y:0,scale:1}; }
    mark(); scheduleSave();
  }
  function addPage() {
    if (importing || replacing) return false;
    try {
      const next = insertBlankBoardPage(pages,pageIndex);
      pages = next.pages;
      gotoPage(next.pageIndex);
      toast(`Blank page inserted · ${pageIndex + 1} of ${pages.length}`, 'ok', 1700); return true;
    } catch (error) { toast(error.message,'warn'); return false; }
  }
  function deleteImage() {
    if (selection?.type === 'image') { deleteSelection(); return; }
    if (page().bgImage && !isSourcePage(page())) {
      pushHistory();
      page().bgImage = null;
      fitView(); scheduleSave(); updateButtons();
      toast('Background image removed · Undo to restore', 'info');
    }
  }
  function pageThumb(pg,images) {
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
      const src = renderPageToCanvas(pg, .65, {images});
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
    pageOverview?.remove(); activeThumbs?.disconnect();
    const grid = el('div', { class: 'wb-pages-grid' });
    pages.forEach((pg, i) => {
      const card = el('div', { class: `wb-page-card${i === pageIndex ? ' active' : ''}` },
        el('div',{class:'wb-page-preview','data-thumb':String(i)}),
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
      el('span', { html: icon('file-plus') }), el('b', { text: 'New page' }), el('small', { text: 'Insert after the current page' })
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
    function closeModal() { activeThumbs?.disconnect(); backdrop.remove(); pageOverview = null; }
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });
    document.body.append(backdrop);
    activeThumbs = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        const node = entry.target; activeThumbs?.unobserve(node);
        const pg=pages[Number(node.dataset.thumb)];
        if (pg) readyImages(pg).then(images => { if (node.isConnected) node.replaceChildren(pageThumb(pg,images)); });
      }
    },{rootMargin:'80px'});
    grid.querySelectorAll('[data-thumb]').forEach(node=>activeThumbs.observe(node));
  }

  function movePage(i, delta) {
    const pg = page();
    const [moved] = pages.splice(i,1);
    pages.splice(i+delta,0,moved);
    pageIndex = pages.indexOf(pg); updateButtons(); scheduleSave(); showPageMenu();
  }
  function duplicatePage(i) {
    if (pages.length >= MAX_BOARD_PAGES) { toast('This board has reached its page limit.', 'warn'); return; }
    pages.splice(i + 1, 0, structuredClone(pages[i]));
    if (i < pageIndex) pageIndex++;
    updateButtons();
    mark(); scheduleSave();
    showPageMenu(true);
    toast(`Page ${i + 1} duplicated`, 'ok', 1500);
  }

  function removePage(i, reopen = true) {
    if (pages.length <= 1 || !confirm(`Delete page ${i+1}?`)) return;
    const old = page();
    pages.splice(i, 1);
    const keep = pages.indexOf(old);
    pageIndex = keep < 0 ? Math.min(i,pages.length-1) : keep;
    gotoPage(pageIndex);
    if (reopen) showPageMenu();
    else toast(`Page deleted · ${pages.length} remaining`, 'info', 1800);
  }

  function clearPage() {
    if (!objects.length && (!page().bgImage || isSourcePage(page()))) return;
    pushHistory();
    objects = [];
    page().objects = objects;
    // A document page stays in place when its handwritten marks are cleared.
    if (!isSourcePage(page())) page().bgImage = null;
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
    const pad = isSourcePage(pg) ? 0 : 40;
    return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
  }

  function renderPageToCanvas(pg, scale = 2, opts = {}) {
    const r = stage.getBoundingClientRect();
    const b = boundsFor(pg, Math.max(1,r.width / view.scale), Math.max(1,r.height / view.scale));
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
      const img = opts.images?.get(pg.bgImage.src) || getImage(pg.bgImage.src);
      if (img.complete && img.naturalWidth) c.drawImage(img, pg.bgImage.x, pg.bgImage.y, pg.bgImage.w, pg.bgImage.h);
    }
    pg.objects.forEach(o => paintBoardObject(c,o,src => opts.images?.get(src) || getImage(src)));
    c.restore();
    return out;
  }

  async function readyImages(pg) {
    const paths = [pg.bgImage?.src, ...pg.objects.map(o=>o.type==='image'?o.src:o.type==='emoji'?EMOJI_SVG[o.char]:null)].filter(Boolean);
    const decoded = new Map();
    await Promise.all([...new Set(paths)].map(async src => {
      const img=getImage(src); await img.decode().catch(()=>{}); decoded.set(src,img);
    }));
    return decoded;
  }
  async function exportPNG() {
    try {
      const pg=page(), index=pageIndex;
      const images=await readyImages(pg);
      const out = renderPageToCanvas(pg, 2, {images});
      out.toBlob(blob => {
        if (!blob) return;
        downloadBlob(blob, `smartboard-page-${index + 1}.png`);
        toast('PNG downloaded', 'ok');
      }, 'image/png');
    } catch (e) { console.error(e); toast('Export failed', 'err'); }
  }
  let exporting = false;
  async function exportPDF() {
    if (exporting) return;
    exporting=true;
    const selected=pages.map(pg=>({...pg,objects:pg.objects.slice()}));
    try {
      const { jsPDF } = window.jspdf || {};
      if (!jsPDF) throw Error('PDF library not loaded.');
      let doc, bytes=0;
      toast(`Preparing ${selected.length} pages for export…`, 'info');
      for (const pg of selected) {
        const c = renderPageToCanvas(pg, 1.35, {images:await readyImages(pg)});
        const scale = Math.min(1, 1060 / Math.max(c.width,c.height));
        const w=c.width*scale,h=c.height*scale,orientation=w>=h?'landscape':'portrait';
        if (!doc) doc=new jsPDF({unit:'pt',format:[w,h],orientation,compress:true});
        else doc.addPage([w,h],orientation);
        const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',.91));
        c.width=c.height=1;
        if (!blob || (bytes+=blob.size)>65*1024*1024) throw Error('The PDF export is too large. Split the lesson before exporting.');
        doc.addImage(new Uint8Array(await blob.arrayBuffer()),'JPEG',0,0,w,h);
      }
      doc.save(`SmartBoard-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast(`Exported ${selected.length} page PDF`, 'ok');
    } catch (e) { console.error(e); toast(e.message || 'PDF export failed', 'err'); }
    finally {exporting=false;}
  }

  /* ---------------- persistence ---------------- */
  const scheduleSave = debounce(() => saveSession(false), 500);

  function serialize() {
    return { pages, pageIndex, savedAt: Date.now(), version: 1 };
  }

  async function saveSession(manual = false, immediate = false) {
    if (replacing) return false;
    try {
      const payload = serialize();
      const saved = await idb.set('boards', storageKey, payload);
      if (!saved) throw new Error('Storage is unavailable');
      if (!replacing) checkpoint(payload, manual ? 'Manual save' : 'Autosave').catch(console.warn);
      if (payload.pages.every(p => !p.bgImage && p.objects.length < 1500 && !p.objects.some(o => o.type === 'image'))) store.set('board-mirror', payload);
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
      const mirror = store.get('board-mirror', null);
      if (mirror && (!data || (mirror.savedAt || 0) > (data.savedAt || 0))) data = mirror;
      if (data && Array.isArray(data.pages) && data.pages.length) {
        pages = data.pages.map((p) => ({ objects: p.objects || [], bg: p.bg || 'grid', bgColor: /^#[a-f0-9]{6}$/i.test(p.bgColor) ? p.bgColor : undefined, bgImage: p.bgImage || null, title: p.title, source: p.source }));
        pageIndex = clamp(data.pageIndex || 0, 0, pages.length - 1);
        objects = pages[pageIndex].objects;
        if (pages.some((p) => p.objects.length || p.bgImage)) {
          toast('Last board restored', 'info', 2600);
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
      if (!pages.some(p => p.bgImage || p.objects.length > 1500 || p.objects.some(o => o.type === 'image'))) store.set('board-mirror', serialize());
    } catch { /* quota */ }
  };
  const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', flush);

  /* ---------------- shortcuts ---------------- */
  function onKey(e) {
    if (importing || pageOverview || document.querySelector('.board-dialog') || !isVisible() || replacing) return;
    if (e.key === 'Escape' && (colorPop.style.display === 'grid' || !morePop.hidden || !penPop.hidden || !emojiPop.hidden)) { closePanels(); return; }
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    if (typing) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveSession(true); return; }
    if (e.key === ' ') { spaceHeld = true; canvas.style.cursor = 'grab'; }
    const map = { s: 'select', p: 'pen', h: 'highlighter', e: 'eraser', l: 'line', a: 'arrow', r: 'rect', o: 'ellipse', t: 'text', z: 'laser', v: 'pan' };
    const k = e.key.toLowerCase();
    if (!mod && pages.length > 1 && ['PageDown','PageUp'].includes(e.key)) { e.preventDefault(); gotoPage(pageIndex + (e.key === 'PageDown'?1:-1)); return; }
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
    if (!page().bgImage && !BG_FILLS[page().bg] && light && color === '#ffffff') setColor('#0f172a');
    if (!page().bgImage && !BG_FILLS[page().bg] && !light && color === '#0f172a') setColor('#ffffff');
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
  usePageInk();
  // Sticker images are loaded lazily on first use.

  const ro = new ResizeObserver(() => { resizeCanvas(); if (page().bgImage) fitView(); });
  ro.observe(stage);
  resizeCanvas();
  requestAnimationFrame(resizeCanvas);

  // Reuse the board for incoming media, documents and workspace actions.
  async function openLessonBoard(board, title) {
    if (closed || replacing || importing) return;
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
    if (p.returnToBoard) canvas.focus({preventScroll:true});
    if (importing || replacing) return;
    if (p.image) {
      if (p.newPage && (objects.length || page().bgImage) && !addPage()) return;
      addImageObject(p.image, { asBackground: !!p.asBackground });
      toast(p.title ? `${p.title} sent to board` : 'Image added to board', 'ok');
    }
    if (p.page) gotoPage(clamp(p.page - 1, 0, pages.length - 1));
    if (p.tool && TOOLS.some((t) => t.id === p.tool)) setTool(p.tool);
    if (p.picker) toggleEmoji();
    if (Object.hasOwn(templates,p.template)) applyBackground(p.template, !(pages.length === 1 && isBlankBoardPage(page())));
    if (p.addPage) addPage();
    if (p.file || p.document) openDocument(p.file);
    if (typeof p.action === 'string' && Object.hasOwn(actions,p.action)) actions[p.action]();
  };
  const actions = { deletePage: () => removePage(pageIndex, false), deleteImage, askForDocument, showImportDialog, showTemplates, showPageMenu, addPage, insertImage, insertPhoto, toggleEmoji, togglePenSettings, clearPage,
      save: () => saveSession(true), toggleClassWidget: () => mini.toggle(), fitView, exportPNG, exportPDF, undo, redo,
    penColour: () => toggleColors(true), brushSettings: () => { closePanels(morePop); morePop.hidden = false; moreBtn.setAttribute('aria-expanded','true'); placePanel(morePop); sizeInput.focus(); },
    previousPage: () => gotoPage(pageIndex - 1), nextPage: () => gotoPage(pageIndex + 1),
    zoomIn: () => zoomBy(1.25), zoomOut: () => zoomBy(.8), resetZoom: () => { view = {x:0,y:0,scale:1}; mark(); } };
  handleParams(params);
  return {
    save: () => saveSession(false, true), actions,
    onParams: handleParams,
    onResize: () => resizeCanvas(),
    onClose: () => {
      const saved = saveSession(false, true);
      closed = true; importing?.abort(); mini.close(); positioning.close(); clearInterval(clockTimer);
      pageOverview?.remove(); importDialog?.remove(); templateDialog?.remove(); activeThumbs?.disconnect();
      window.removeEventListener('sbos:pen',penListener);
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
      tool, pageIndex, pageCount: pages.length, documentPage: isSourcePage(page()),
      objects: objects.map((o) => ({
        type: o.type, pressured: !!o.pressured, pts: o.points?.length,
        p: o.points?.[0]?.p, char: o.char, url: o.url,
      })),
      pen: penSettings,
    }),
  };
}

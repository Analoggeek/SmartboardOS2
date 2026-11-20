/* SmartBoardOS — system bootstrap */
import { $, el, toast, pickFiles, clamp } from './utils.js';
import { ACCEPT } from './document-import.js';
import { templates, templatePreview } from './board-templates.js';
import { movableControls, resetBoardControls } from './control-layout.js';
import { appArt } from './app-art.js';
import { icon, hydrateIcons } from './icons.js';
import { getSettings, saveSettings } from './db.js';
import { WindowManager } from './wm.js';
import * as Whiteboard from './apps/whiteboard.js';
import * as MediaApp from './apps/media.js';
import * as ClassApp from './apps/class.js';
import * as NotesApp from './apps/notes.js';
import * as CalculatorApp from './apps/calculator.js';
import * as RecordingApp from './apps/recording.js';
import * as SettingsApp from './apps/settings.js';

const DESKTOP = location.protocol === 'sbos:';
const VERSION = (DESKTOP && new URLSearchParams(location.search).get('version')) || '1.4.0';
const WALLS = {
  aurora: ['rgba(99,102,241,.26)', 'rgba(168,85,247,.22)', 'rgba(34,211,238,.20)'],
  sunset: ['rgba(249,115,22,.28)', 'rgba(244,63,94,.24)', 'rgba(168,85,247,.24)'],
  forest: ['rgba(16,185,129,.26)', 'rgba(59,130,246,.18)', 'rgba(132,204,22,.18)'],
  midnight: ['rgba(30,64,175,.34)', 'rgba(15,23,42,.40)', 'rgba(2,132,199,.26)'],
};

const lazyApp = (load) => async (context) => {
  const loading = el('p', { class: 'settings', role: 'status', text: 'Loading offline tools…' });
  context.root.append(loading);
  try {
    const module = await load();
    loading.remove();
    if (context.root.isConnected) return module.mount(context);
  } catch (error) {
    console.warn('[Offline app]', error);
    context.root.replaceChildren(el('p', { class: 'settings', role: 'status', text: 'Could not open this tool. Close its window and try again.' }));
  }
};

const APPS = [
  {
    id: 'whiteboard', startMaximized: true, name: 'Whiteboard', tagline: 'Draw, write & export', icon: 'board',
    color: '#6366f1', soft: 'rgba(99,102,241,.16)', width: 1120, height: 720, mount: Whiteboard.mount,
  },
  {
    id: 'media', name: 'Media', tagline: 'Images on device', icon: 'image',
    color: '#0ea5e9', soft: 'rgba(14,165,233,.15)', width: 920, height: 640, mount: MediaApp.mount,
  },
  {
    id: 'class', name: 'Class Tools', tagline: 'Picker, timer, scores', icon: 'users',
    color: '#f59e0b', soft: 'rgba(245,158,11,.16)', width: 880, height: 660, mount: ClassApp.mount,
  },
  {
    id: 'notes', name: 'Notes', tagline: 'Lesson plans & reminders', icon: 'note',
    color: '#22c55e', soft: 'rgba(34,197,94,.15)', width: 900, height: 620, mount: NotesApp.mount,
  },
  {
    id: 'calculator', name: 'Calculator', tagline: 'Quick maths', icon: 'calculator',
    color: '#a855f7', soft: 'rgba(168,85,247,.16)', width: 380, height: 560, mount: CalculatorApp.mount,
  },
  {
    id: 'maps', name: 'Map Atlas', tagline: 'Offline geography maps', icon: 'globe',
    color: '#0891b2', soft: 'rgba(8,145,178,.18)', width: 1000, height: 735, mount: lazyApp(() => import('./apps/maps.js')),
  },
  {
    id: 'lessons', name: 'Lesson Library', tagline: 'Lesson packs & recovery', icon: 'folder',
    color: '#f59e0b', soft: 'rgba(245,158,11,.16)', width: 1060, height: 760, mount: lazyApp(() => import('./apps/lessons.js')),
  },
  {
    id: 'recording', name: 'Recording Studio', tagline: 'Screen, camera and microphone', icon: 'camera',
    color: '#e11d48', soft: 'rgba(225,29,72,.18)', width: 680, height: 705, mount: RecordingApp.mount,
  },
  {
    id: 'settings', name: 'Settings', tagline: 'Make it yours', icon: 'settings',
    color: '#64748b', soft: 'rgba(100,116,139,.18)', width: 640, height: 700, mount: SettingsApp.mount,
  },
];
const appOrder = APPS.map(app => app.id);
const defaultPins = ['whiteboard', 'class', 'lessons', 'recording', 'settings'];

const wm = new WindowManager($('#window-layer'));
APPS.forEach((a) => wm.register(a));

const settings = () => getSettings();

function applyTheme() {
  const s = settings();
  const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  const theme = s.theme === 'auto' ? (prefersLight ? 'light' : 'dark') : s.theme;
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.accent = s.accent || 'indigo';
  document.documentElement.dataset.contrast = s.contrast ? 'high' : 'normal';
  document.documentElement.dataset.controls = s.largeControls ? 'large' : 'normal';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#eef1f8' : '#0b1020');
  $('#btn-theme').innerHTML = icon(theme === 'light' ? 'sun' : 'moon');
  window.dispatchEvent(new CustomEvent('sbos:theme'));
}

function applyMotion() {
  const s = settings();
  document.documentElement.dataset.motion = s.motion ? 'on' : 'off';
}

function applyWallpaper() {
  const s = settings();
  const w = WALLS[s.wallpaper] || WALLS.aurora;
  const root = document.documentElement;
  root.style.setProperty('--wall-a', w[0]);
  root.style.setProperty('--wall-b', w[1]);
  root.style.setProperty('--wall-c', w[2]);
}

function applyGreeting() {
  const s = settings();
  const h = new Date().getHours();
  const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const name = (s.teacherName || '').trim() || 'Teacher';
  $('#hero-greet').textContent = `${part}, ${name}`;
  $('#home-date').textContent = new Intl.DateTimeFormat(undefined,{ weekday:'short',month:'short',day:'numeric' }).format(new Date());
}

const appMenu = $('#workspace-menu');
const appToggle = $('#btn-apps');
const customize = $('#workspace-custom');
const shellControls = $('.workspace-controls');
const boardVisible = () => { const board = wm.windows.get('whiteboard'); return !!board && !board.minimized && board.root.classList.contains('focused'); };
function placeAppMenu() {
  if (appMenu.hidden) return;
  const {left,top,bottom} = shellControls.getBoundingClientRect();
  const yBelow=bottom+9, height=appMenu.offsetHeight;
  appMenu.style.left=`${clamp(left,8,Math.max(8,innerWidth-appMenu.offsetWidth-8))}px`;
  appMenu.style.top=`${clamp(yBelow+height<=innerHeight || top<height+15 ? yBelow : top-height-8,8,Math.max(8,innerHeight-height-8))}px`;
}
function selectLauncherTab(board) {
  $('#workspace-grid').hidden=board;
  $('#workspace-board-actions').hidden=!board;
  $('#show-app-grid').setAttribute('aria-pressed',String(!board));
  $('#show-board-actions').setAttribute('aria-pressed',String(board));
  placeAppMenu();
}
function openDocumentPicker() {
  closeAppMenu();
  pickFiles({accept:ACCEPT}).then(([file])=> { if (file) launch('whiteboard',{file}); });
}
const boardAction = action => launch('whiteboard',{action});
const boardActions = [
  ['grid','Board designs','showTemplates'], ['plus','Add board page','addPage'], ['file','Page overview','showPageMenu'],
  ['image','Insert image','insertImage'], ['camera','Take board photo','insertPhoto'], ['smile','Stickers','toggleEmoji'],
  ['settings','Pen & palm','togglePenSettings'], ['users','Class widget','toggleClassWidget'], ['expand','Fit content','fitView'],
  ['save','Save board','save'], ['pdf','Export board PDF','exportPDF'], ['download','Export page PNG','exportPNG'],
  ['trash','Clear page ink','clearPage'], ['folder','Previous imports','showImportDialog'],
];
function closeAppMenu(focus = false) {
  appMenu.hidden = true;
  appToggle.setAttribute('aria-expanded', 'false');
  if (focus) appToggle.focus();
}
function launch(id, params) { closeAppMenu(); wm.open(id, params); }
function showHome() {
  closeAppMenu();
  wm.windows.forEach(w => wm.toggleMinimize(w.id, true));
}
function getPins() {
  return Array.isArray(settings().appPins) ? settings().appPins.filter((id, i, a) => appOrder.includes(id) && a.indexOf(id) === i) : defaultPins;
}
function appTile(app, menu = false) {
  const art = app.id === 'whiteboard' ? el('img', { src: './assets/icons/icon-192.png', alt: '' }) : el('span', { html: appArt(app.id) });
  return el('button', { class: menu ? 'workspace-tile' : 'workspace-card', type: 'button', 'data-app': app.id, onclick: () => launch(app.id) },
    el('span', { class: 'workspace-art' }, art), el('span', { class: 'workspace-tile-label' }, el('b', { text: app.name }), !menu && el('small', { text: app.tagline })),
    !menu && el('span',{class:'home-card-arrow', html:icon('chevron-right'),'aria-hidden':'true'}));
}
function renderAppMenu() {
  const pins = getPins();
  $('#workspace-grid').replaceChildren(...[...pins, ...appOrder.filter(x => !pins.includes(x))].map(id => appTile(wm.apps.get(id), true)));
  customize.replaceChildren(el('p', { text: 'Pinned apps appear first. All tools stay available in the grid.' }),
    el('div', { class: 'workspace-pins' }, ...appOrder.map(id => {
      const box = el('input', { type: 'checkbox' }); box.checked = pins.includes(id);
      box.onchange = () => { saveSettings({ appPins: box.checked ? [...pins,id] : pins.filter(x => x !== id) }); renderAppMenu(); customize.querySelector(`[data-pin="${id}"]`)?.focus(); };
      box.dataset.pin = id;
      return el('label', {}, box, wm.apps.get(id).name);
    })), el('label', { class: 'workspace-start' }, 'Open on startup ', el('select', { class: 'field', 'aria-label': 'Open on startup', onchange: e => saveSettings({ startup: e.target.value }) },
      el('option', { value: 'board', text: 'Whiteboard' }), el('option', { value: 'home', text: 'Home' }))));
  customize.querySelector('select').value = settings().startup === 'home' ? 'home' : 'board';
  placeAppMenu();
}
function renderLaunch() {
  const order = ['whiteboard','lessons','notes','class','maps','media','recording','calculator','settings'];
  $('#launch-grid').replaceChildren(...order.map(id => appTile(wm.apps.get(id))));
  $('#home-tool-count').textContent = `${order.length} tools`;
  $('#hero-actions').replaceChildren(
    el('button', { class: 'home-cta primary', html: `${icon('pen')}<span>Open whiteboard</span>`, onclick: () => launch('whiteboard') }),
    el('button', { class: 'home-cta', html: `${icon('file-plus')}<span>Import PDF / PPT</span>`, onclick: openDocumentPicker }));
  $('#home-templates').replaceChildren(...['blueprint','cornell','coordinate'].map(id => el('button',{
    class:'home-template-tile',onclick:()=>launch('whiteboard',{template:id}), 'aria-label':`Add ${templates[id].name} page`
  },templatePreview(id),el('span',{},el('b',{text:templates[id].name}),el('small',{text:templates[id].detail})),el('span',{class:'home-card-arrow',html:icon('chevron-right'),'aria-hidden':'true'}))));
  $('#home-templates').append(el('button',{class:'home-all-templates',html:`<span>Explore all board designs</span>${icon('chevron-right')}`,onclick:()=>boardAction('showTemplates')}));
  if (!DESKTOP) $('#home-footer-links').append(el('a',{href:'./install.html',text:'Get the offline installer'}));
  $('#workspace-board-actions').replaceChildren(...boardActions.map(([symbol,label,id])=>
    el('button',{class:'board-action',type:'button',onclick:()=>boardAction(id)},el('span',{html:icon(symbol),'aria-hidden':'true'}),el('b',{text:label}))));
}

/* =========================================================
   command palette
   ========================================================= */
const palette = {
  backdrop: $('#palette-backdrop'),
  input: $('#palette-input'),
  results: $('#palette-results'),
  items: [],
  index: 0,
};

function paletteItems() {
  const apps = wm.appList().map((a) => ({
    icon: a.icon, title: a.name, sub: a.tagline, hint: 'App',
    run: () => wm.open(a.id),
  }));
  const actions = [
    {
      icon: 'pen', title: 'New whiteboard page', sub: 'Add a fresh page to the board', hint: 'Action',
      run: () => { wm.open('whiteboard'); setTimeout(() => wm.windows.get('whiteboard')?.instance?.addPage?.(), 300); },
    },
    { icon: 'pdf', title: 'Import PDF / PPT', sub: 'Open a complete document in the whiteboard', hint: 'Action', run: openDocumentPicker },
    { icon: 'download', title: 'Export board as PDF', sub: 'Download every page as one PDF', hint: 'Action', run: () => exportBoardPDF() },
    { icon: 'download', title: 'Export board as PNG', sub: 'Save the current page as an image', hint: 'Action', run: () => exportBoardPNG() },
    { icon: 'note', title: 'Quick note', sub: 'Jot something down instantly', hint: 'Action', run: () => wm.open('notes', { new: true }) },
    { icon: 'users', title: 'Pick a random student', sub: 'Open class tools', hint: 'Action', run: () => wm.open('class') },
    { icon: 'moon', title: 'Toggle theme', sub: 'Switch between dark and light', hint: 'Action', run: () => { const s = settings(); saveSettings({ theme: s.theme === 'light' ? 'dark' : 'light' }); applyTheme(); } },
    ...(!DESKTOP ? [{ icon: 'download', title: 'Install web app', sub: 'Add the app to your device', hint: 'Action', run: installApp }] : []),
    { icon: 'fullscreen', title: 'Fullscreen', sub: 'Toggle fullscreen mode', hint: 'Action', run: () => toggleFullscreen() },
    { icon: 'settings', title: 'Settings', sub: 'Appearance, classroom & data', hint: 'Action', run: () => wm.open('settings') },
  ];
  return [...apps, ...actions];
}

function openPalette() {
  palette.backdrop.hidden = false;
  palette.input.value = '';
  renderPalette('');
  setTimeout(() => palette.input.focus(), 30);
}
function closePalette() {
  palette.backdrop.hidden = true;
  palette.input.blur();
}
function renderPalette(query) {
  const q = query.trim().toLowerCase();
  const all = paletteItems();
  const filtered = q
    ? all.filter((i) => `${i.title} ${i.sub}`.toLowerCase().includes(q))
    : all;
  palette.items = filtered;
  palette.index = 0;
  palette.results.innerHTML = '';
  if (!filtered.length) {
    palette.results.append(el('div', { style: { padding: '20px', textAlign: 'center', color: 'var(--text-3)', fontSize: '12.5px' }, text: 'Nothing found' }));
    return;
  }
  filtered.forEach((item, i) => {
    const row = el('div', { class: `pal-item ${i === 0 ? 'active' : ''}`, onclick: () => { runPaletteItem(item); } },
      el('span', { class: 'pal-ico', html: icon(item.icon) }),
      el('span', { class: 'pal-text' }, el('b', { text: item.title }), el('small', { text: item.sub })),
      el('span', { class: 'pal-hint', text: item.hint })
    );
    row.addEventListener('pointerenter', () => {
      palette.index = i;
      [...palette.results.children].forEach((c, j) => c.classList.toggle('active', j === i));
    });
    palette.results.append(row);
  });
}
function runPaletteItem(item) {
  closePalette();
  setTimeout(() => { try { item.run(); } catch (e) { console.error(e); toast('Action failed', 'err'); } }, 60);
}

palette.input.addEventListener('input', () => renderPalette(palette.input.value));
palette.input.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closePalette();
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    palette.index = Math.min(palette.index + 1, palette.items.length - 1);
    [...palette.results.children].forEach((c, i) => c.classList.toggle('active', i === palette.index));
    palette.results.children[palette.index]?.scrollIntoView({ block: 'nearest' });
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    palette.index = Math.max(palette.index - 1, 0);
    [...palette.results.children].forEach((c, i) => c.classList.toggle('active', i === palette.index));
    palette.results.children[palette.index]?.scrollIntoView({ block: 'nearest' });
  }
  if (e.key === 'Enter') {
    const item = palette.items[palette.index];
    if (item) runPaletteItem(item);
  }
});
palette.backdrop.addEventListener('click', (e) => { if (e.target === palette.backdrop) closePalette(); });

/* =========================================================
   board export from anywhere
   ========================================================= */
async function exportBoardPDF() {
  let inst = wm.windows.get('whiteboard')?.instance;
  if (!inst) { wm.open('whiteboard'); await new Promise((r) => setTimeout(r, 500)); inst = wm.windows.get('whiteboard')?.instance; }
  if (inst?.exportPDF) inst.exportPDF();
  else toast('Open the whiteboard first', 'warn');
}
async function exportBoardPNG() {
  let inst = wm.windows.get('whiteboard')?.instance;
  if (!inst) { wm.open('whiteboard'); await new Promise((r) => setTimeout(r, 500)); inst = wm.windows.get('whiteboard')?.instance; }
  if (inst?.exportPNG) inst.exportPNG();
  else toast('Open the whiteboard first', 'warn');
}

/* =========================================================
   fullscreen / install
   ========================================================= */
async function toggleFullscreen() {
  closeAppMenu();
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (window.smartboardWindow?.toggleFullscreen) await window.smartboardWindow.toggleFullscreen();
    else if (document.fullscreenEnabled && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    else toast('The board already fills this viewport. Your browser controls screen fullscreen.', 'info');
  } catch { toast('Screen fullscreen is unavailable here. The board still fills this viewport.', 'info'); }
}

let installPrompt = null;
function installApp() {
  if (installPrompt) {
    installPrompt.prompt();
    installPrompt.userChoice.then((res) => {
      if (res.outcome === 'accepted') toast('Installing SmartBoardOS…', 'ok');
      installPrompt = null;
      $('#btn-install').hidden = true;
    });
  } else if (window.matchMedia('(display-mode: standalone)').matches) {
    toast('Already installed — you are running the app', 'info');
  } else {
    toast('Use your browser menu → "Install app" / "Add to Home screen"', 'info', 5000);
  }
}

/* =========================================================
   global keyboard
   ========================================================= */
function onGlobalKey(e) {
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  const mod = e.ctrlKey || e.metaKey;
  if (e.defaultPrevented) return;
  if (e.key === 'Escape' && !appMenu.hidden) { e.preventDefault(); closeAppMenu(true); return; }
  if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); palette.backdrop.hidden ? openPalette() : closePalette(); return; }
  if (e.key === 'Escape' && !palette.backdrop.hidden) { closePalette(); return; }
  if (typing) return;
  if (mod && e.shiftKey && e.key.toLowerCase() === 'w') { e.preventDefault(); wm.open('whiteboard'); return; }
  if (mod && e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); openDocumentPicker(); return; }
  if (mod && e.shiftKey && e.key.toLowerCase() === 't') { e.preventDefault(); wm.open('class'); return; }
  if (e.key.toLowerCase() === 'f' && !mod && !e.repeat) {
    e.preventDefault(); toggleFullscreen();
  }
}

/* =========================================================
   boot
   ========================================================= */
function setBoot(pct, msg) {
  const fill = $('#boot-fill');
  const status = $('#boot-status');
  if (fill) fill.style.width = `${pct}%`;
  if (status && msg) status.textContent = msg;
}

async function boot() {
  hydrateIcons(document);
  applyTheme(); applyMotion(); applyWallpaper(); applyGreeting();
  renderLaunch(); renderAppMenu();
  appToggle.onclick = () => {
    if (!appMenu.hidden) { closeAppMenu(); return; }
    appMenu.hidden = false;
    selectLauncherTab(false);
    appToggle.setAttribute('aria-expanded','true');
    appMenu.querySelector('.workspace-tile')?.focus({ preventScroll: true });
  };
  $('#btn-customize').onclick = () => {
    customize.hidden = !customize.hidden;
    $('#btn-customize').setAttribute('aria-expanded', String(!customize.hidden));
    placeAppMenu();
    if (!customize.hidden) customize.querySelector('input')?.focus();
  };
  const appPosition = movableControls({node:shellControls,handle:$('#move-apps'),bounds:$('#os'),key:'apps',start:()=>({x:6,y:5}),enabled:boardVisible,moved:placeAppMenu});
  const syncControls = () => { document.body.classList.toggle('teaching-board', boardVisible()); appPosition.reflow(); };
  wm.onChange(syncControls);
  document.addEventListener('pointerdown',() => requestAnimationFrame(syncControls));
  window.addEventListener('resize',placeAppMenu);
  $('#btn-import').onclick=openDocumentPicker;
  $('#show-app-grid').onclick=()=>selectLauncherTab(false);
  $('#show-board-actions').onclick=()=>selectLauncherTab(true);
  $('#btn-reset-controls').onclick=()=>{ resetBoardControls(); closeAppMenu(true); toast('Apps and toolbox reset to their default positions.', 'ok'); };
  $('#btn-cmd').onclick = () => { closeAppMenu(); openPalette(); };
  $('#btn-theme').onclick = () => { saveSettings({ theme: settings().theme === 'light' ? 'dark' : 'light' }); applyTheme(); };
  $('#btn-fullscreen').onclick = toggleFullscreen;
  $('#btn-home').onclick = showHome;
  $('#btn-install').onclick = installApp;
  document.addEventListener('pointerdown', e => { if (!appMenu.hidden && !appMenu.contains(e.target) && !appToggle.contains(e.target)) closeAppMenu(); });
  window.addEventListener('keydown', onGlobalKey);
  if (!DESKTOP) window.addEventListener('online', () => toast('Back online', 'ok', 1600));
  if (!DESKTOP) window.addEventListener('offline', () => toast('Offline — the app still works', 'info', 2200));

  // PWA — register right away so the app is installable + offline-ready
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((registration) => {
      const notify = () => {
        if (registration.waiting && navigator.serviceWorker.controller) {
          toast('Web update ready. Save your work, then close all SmartBoardOS tabs or windows and reopen.', 'info', 10000);
        }
      };
      notify();
      registration.addEventListener('updatefound', () => registration.installing?.addEventListener('statechange', notify));
    }).catch((e) => console.warn('SW failed', e));
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e;
    $('#btn-install').hidden = false;
  });
  window.addEventListener('appinstalled', () => {
    toast('SmartBoardOS installed 🎉', 'ok');
    $('#btn-install').hidden = true;
  });

  const urlApp = new URLSearchParams(location.search).get('app');
  if (urlApp === 'pdf') wm.open('whiteboard', { document: true });
  else if (urlApp && wm.apps.has(urlApp)) wm.open(urlApp);
  else if (settings().startup !== 'home') wm.open('whiteboard');
  setBoot(100, 'Welcome');
  requestAnimationFrame(() => {
    syncControls();
    $('#boot').classList.add('hide');
    const os = $('#os'); os.classList.add('ready'); os.setAttribute('aria-hidden', 'false');
    document.body.classList.add('booted');
  });
}

/* public API for apps */
window.__sbos = {
  version: VERSION,
  wm,
  applyTheme,
  applyWallpaper,
  applyMotion,
  applyGreeting,
  applyClock: () => {},
  toggleFullscreen,
  desktop: DESKTOP,
  saveWork: async () => {
    const results = await Promise.all([...wm.windows.values()].map(({ instance }) => instance?.save?.()));
    if (results.includes(false)) throw new Error('Some classroom data could not be saved');
  },
  install: installApp,
  open: (id, p) => wm.open(id, p),
  toast,
};

let booted = false;
function start() { if (booted) return; booted = true; boot(); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();

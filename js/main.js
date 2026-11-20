/* SmartBoardOS — system bootstrap */
import { $, el, toast, fmtClock, relTime } from './utils.js';
import { appArt } from './app-art.js';
import { icon, hydrateIcons } from './icons.js';
import { getSettings, saveSettings, store, idb } from './db.js';
import { WindowManager } from './wm.js';
import { initWidgets } from './widgets.js';
import * as Whiteboard from './apps/whiteboard.js';
import * as PDFApp from './apps/pdf.js';
import * as MediaApp from './apps/media.js';
import * as ClassApp from './apps/class.js';
import * as NotesApp from './apps/notes.js';
import * as CalculatorApp from './apps/calculator.js';
import * as RecordingApp from './apps/recording.js';
import * as SettingsApp from './apps/settings.js';
import { capturePhoto } from './camera.js';

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
    id: 'pdf', name: 'Document Studio', tagline: 'Annotate PDFs and documents', icon: 'pdf',
    color: '#ef4444', soft: 'rgba(239,68,68,.14)', width: 1040, height: 720, mount: PDFApp.mount,
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
    id: 'lab', name: 'Smart Lab', tagline: 'Physics, Chemistry & Biology', icon: 'flask',
    color: '#14b8a6', soft: 'rgba(20,184,166,.18)', width: 1100, height: 775, mount: lazyApp(() => import('./apps/lab.js')),
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
const DOCK_ORDER = ['whiteboard', 'pdf', 'media', 'class', 'notes', 'calculator', 'maps', 'lab', 'recording', 'settings'];

/* =========================================================
   system
   ========================================================= */
const wm = new WindowManager($('#window-layer'));
APPS.forEach((a) => wm.register(a));

const settings = () => getSettings();

function applyTheme() {
  const s = settings();
  const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  const theme = s.theme === 'auto' ? (prefersLight ? 'light' : 'dark') : s.theme;
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.accent = s.accent || 'indigo';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#eef1f8' : '#0b1020');
  $('#btn-theme').innerHTML = `<span class="ic">${icon(theme === 'light' ? 'sun' : 'moon')}</span>`;
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
  $('#tb-greeting').textContent = `${part.split(' ')[1]} · Class in session`;
  const day = new Date().toLocaleDateString(undefined, { weekday: 'long' });
  $('#hero-day').textContent = `${day} · SmartBoardOS ready`;
}

function applyClock() {
  const s = settings();
  const now = new Date();
  const { time, suffix } = fmtClock(now, s.use24h);
  $('#tb-time').textContent = s.use24h ? time : `${time} ${suffix}`;
  $('#tb-date').textContent = now.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/* =========================================================
   dock
   ========================================================= */
function renderDock() {
  const dock = $('#dock');
  dock.innerHTML = '';
  DOCK_ORDER.forEach((id) => {
    const app = wm.apps.get(id);
    if (!app) return;
    const item = el('button', {
      class: 'dock-item', 'aria-label': app.name, title: `${app.name} — ${app.tagline}`,
      onclick: () => {
        if (wm.isOpen(id) && wm.isMinimized(id)) wm.toggleMinimize(id, false);
        else if (wm.isOpen(id)) wm.toggleMinimize(id, true);
        else wm.open(id);
      },
    },
      el('span', { class: 'dock-ico', style: { '--d-color': app.color, '--d-soft': app.soft }, html: appArt(id) }),
      el('span', { class: 'dock-label', text: app.name })
    );
    item.dataset.app = id;
    dock.append(item);
  });
  updateDockState();
}

function updateDockState() {
  document.querySelectorAll('.dock-item').forEach((item) => {
    const id = item.dataset.app;
    item.classList.toggle('running', wm.isOpen(id));
    item.classList.toggle('min', wm.isOpen(id) && wm.isMinimized(id));
  });
}

/* =========================================================
   home screen cards
   ========================================================= */
function renderLaunch() {
  const grid = $('#launch-grid');
  grid.innerHTML = '';
  DOCK_ORDER.forEach((id) => {
    const app = wm.apps.get(id);
    const card = el('button', { class: 'launch-card', style: { '--card-color': app.color, '--card-soft': app.soft }, onclick: () => wm.open(id) },
      el('span', { class: 'launch-icon', html: appArt(id) }),
      el('span', { class: 'launch-name', text: app.name }),
      el('span', { class: 'launch-desc', text: app.tagline })
    );
    grid.append(card);
  });

  const heroActions = $('#hero-actions');
  heroActions.innerHTML = '';
  heroActions.append(
    el('button', { class: 'btn primary', onclick: () => wm.open('whiteboard') },
      el('span', { class: 'ic', html: icon('pen') }), el('span', { class: 'lbl', text: 'Open whiteboard' })),
    el('button', { class: 'btn', onclick: () => wm.open('pdf') },
      el('span', { class: 'ic', html: icon('pdf') }), el('span', { class: 'lbl', text: 'Open a document' })),
    el('button', { class: 'btn', onclick: () => wm.open('class') },
      el('span', { class: 'ic', html: icon('timer') }), el('span', { class: 'lbl', text: 'Class tools' }))
  );
  if (!DESKTOP) heroActions.append(el('a', { class: 'btn install-cta', href: './install.html' },
    el('span', { class: 'ic', html: icon('download') }), 'Offline installer'));
}

/* =========================================================
   stats
   ========================================================= */
const TOOLBOX = [
  { icon: 'pen', label: 'Pen', run: () => wm.open('whiteboard', { tool: 'pen' }) },
  { icon: 'highlighter', label: 'Highlight', run: () => wm.open('whiteboard', { tool: 'highlighter' }) },
  { icon: 'eraser', label: 'Eraser', run: () => wm.open('whiteboard', { tool: 'eraser' }) },
  { icon: 'zap', label: 'Laser', run: () => wm.open('whiteboard', { tool: 'laser' }) },
  { icon: 'smile', label: 'Stickers', run: () => wm.open('whiteboard', { picker: true }) },
  { icon: 'camera', label: 'Camera', run: async () => {
      const shot = await capturePhoto({ title: 'Camera → board' });
      if (shot) wm.open('whiteboard', { image: shot, title: 'Camera photo' });
    } },
  { icon: 'file-plus', label: 'New page', run: () => wm.open('whiteboard', { addPage: true }) },
  { icon: 'cursor', label: 'Select', run: () => wm.open('whiteboard', { tool: 'select' }) },
];

function renderToolbox() {
  const host = document.getElementById('toolbox-grid');
  if (!host) return;
  host.innerHTML = '';
  TOOLBOX.forEach((item) => {
    host.append(el('button', {
      class: 'toolbox-btn', title: item.label, onclick: item.run,
    }, el('span', { html: icon(item.icon) }), el('span', { text: item.label })));
  });
}

function renderActivity() {
  const card = $('#activity-card');
  if (!card) return;
  const board = store.get('board-mirror', null);
  const saved = board?.savedAt ? relTime(board.savedAt) : 'not yet';
  const pages = board?.pages?.length ?? 0;
  const objs = board?.pages?.reduce((a, p) => a + (p.objects?.length || 0), 0) ?? 0;
  card.innerHTML = '';
  card.append(
    el('div', { class: 'tips-head' }, el('span', { class: 'ic', html: icon('layers') }), 'Class snapshot'),
    el('div', { class: 'activity-row' }, el('span', { text: 'Board pages' }), el('b', { text: String(pages) })),
    el('div', { class: 'activity-row' }, el('span', { text: 'Board objects' }), el('b', { text: String(objs) })),
    el('div', { class: 'activity-row' }, el('span', { text: 'Last autosave' }), el('b', { text: saved })),
    el('div', { class: 'activity-actions' },
      el('button', { class: 'mini-btn', text: 'Export board PDF', onclick: () => exportBoardPDF() })
    )
  );
}

async function updateStats() {
  try {
    const board = await idb.get('boards', 'current');
    $('#stat-pages').textContent = board?.pages?.length ?? 0;
    const media = await idb.all('media');
    $('#stat-media').textContent = media.length;
  } catch { /* noop */ }
  const notes = store.get('notes', []);
  $('#stat-notes').textContent = notes.length;
  renderActivity();
  renderToolbox();
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
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => toast('Fullscreen not allowed here', 'warn'));
  } else {
    document.exitFullscreen?.();
  }
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
  if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); palette.backdrop.hidden ? openPalette() : closePalette(); return; }
  if (e.key === 'Escape' && !palette.backdrop.hidden) { closePalette(); return; }
  if (typing) return;
  if (mod && e.shiftKey && e.key.toLowerCase() === 'w') { e.preventDefault(); wm.open('whiteboard'); return; }
  if (mod && e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); wm.open('pdf'); return; }
  if (mod && e.shiftKey && e.key.toLowerCase() === 't') { e.preventDefault(); wm.open('class'); return; }
  if (e.key.toLowerCase() === 'f' && !mod && !e.repeat) {
    const present = document.querySelector('.win.focused:not(.min) .wb-present');
    if (present) present.click();
    else toggleFullscreen();
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
  applyTheme(); applyMotion(); applyWallpaper(); applyGreeting(); applyClock();
  setBoot(18, 'Loading display driver…');

  renderDock(); renderLaunch();
  const widgets = initWidgets($('#widgets'), { onOpenApp: (id) => wm.open(id) });
  $('#btn-widget-add').addEventListener('click', () => widgets.openPicker());

  wm.onChange(() => updateDockState());
  setBoot(46, 'Waking up the whiteboard…');
  await new Promise((r) => setTimeout(r, 260));

  setBoot(68, 'Restoring your board…');
  updateStats();

  // top bar wiring
  $('#btn-cmd').addEventListener('click', openPalette);
  $('#btn-theme').addEventListener('click', () => {
    const s = settings();
    saveSettings({ theme: s.theme === 'light' ? 'dark' : 'light' });
    applyTheme();
  });
  $('#btn-fullscreen').addEventListener('click', toggleFullscreen);
  $('#btn-settings').addEventListener('click', () => wm.open('settings'));
  $('#btn-home').addEventListener('click', () => {
    wm.windows.forEach((w) => wm.toggleMinimize(w.id, true));
    toast('Home', 'info', 900);
  });
  $('#btn-install').addEventListener('click', installApp);

  setInterval(applyClock, 1000);
  setInterval(updateStats, 20000);
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

  setBoot(86, 'Almost ready…');
  await new Promise((r) => setTimeout(r, 320));
  setBoot(100, 'Welcome');

  setTimeout(() => {
    $('#boot').classList.add('hide');
    const os = $('#os');
    os.classList.add('ready');
    os.setAttribute('aria-hidden', 'false');
    document.body.classList.add('booted');
  }, 300);

  // deep link (?app=whiteboard) or first run → open the board
  const s = settings();
  const urlApp = new URLSearchParams(location.search).get('app');
  if (urlApp && wm.apps.has(urlApp)) {
    setTimeout(() => wm.open(urlApp), 700);
  } else if (s.firstRun) {
    setTimeout(() => {
      wm.open('whiteboard');
      toast('Tip: Ctrl/⌘ + K opens every app instantly', 'info', 5200);
    }, 900);
  }
  if (s.firstRun) saveSettings({ firstRun: false });
}

/* public API for apps */
window.__sbos = {
  version: VERSION,
  wm,
  applyTheme,
  applyWallpaper,
  applyMotion,
  applyGreeting,
  applyClock,
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

/* Small helpers shared across SmartBoardOS */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'attrs') for (const [a, av] of Object.entries(v)) node.setAttribute(a, av);
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export const uid = (p = 'id') => `${p}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function debounce(fn, wait = 250) {
  let t;
  const wrapped = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
  wrapped.flush = (...args) => { clearTimeout(t); fn(...args); };
  return wrapped;
}

export const isTouch = () => window.matchMedia('(pointer: coarse)').matches;
export const isMobile = () => matchMedia('(max-width: 820px), (max-height: 460px)').matches;

export function fmtClock(date, use24 = false) {
  let h = date.getHours();
  const m = String(date.getMinutes()).padStart(2, '0');
  let suffix = '';
  if (!use24) { suffix = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; }
  return { time: `${use24 ? String(h).padStart(2, '0') : h}:${m}`, suffix };
}

export function fmtDuration(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function fmtDateLong(date) {
  return date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function downloadURL(url, filename) {
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.append(a); a.click(); a.remove();
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  downloadURL(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export function pickFiles({ accept = '', multiple = false } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
    document.body.append(input);
    let done = false;
    const finish = (files) => {
      if (done) return;
      done = true;
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => finish(Array.from(input.files || [])));
    input.addEventListener('cancel', () => finish([]));
    // click synchronously so the browser keeps the user gesture
    input.click();
    // fallback if the user closes the dialog without a change event
    setTimeout(() => {
      const onFocus = () => setTimeout(() => finish([]), 800);
      window.addEventListener('focus', onFocus, { once: true });
    }, 500);
  });
}

/* ---------- toasts ---------- */
const ICONS = { ok: '✓', warn: '!', err: '×', info: 'i' };
export function toast(message, type = 'info', ms = 3200) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const t = el('div', { class: `toast ${type}` },
    el('span', { class: 't-ico', text: ICONS[type] || ICONS.info }),
    el('span', { text: message })
  );
  host.append(t);
  const kill = () => { t.classList.add('out'); setTimeout(() => t.remove(), 220); };
  setTimeout(kill, ms);
  t.addEventListener('click', kill);
}

export function announce(msg) {
  const live = document.getElementById('sr-live');
  if (live) live.textContent = msg;
}

/* ---------- sound ---------- */
let audioCtx = null;
export function beep({ freq = 880, dur = 0.16, type = 'sine', gain = 0.14 } = {}) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type; osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(gain, audioCtx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
    osc.connect(g).connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + dur + 0.02);
  } catch { /* ignore */ }
}
export function chime() {
  [523.25, 659.25, 783.99].forEach((f, i) => setTimeout(() => beep({ freq: f, dur: 0.3, gain: 0.11 }), i * 130));
}

/* ---------- confetti ---------- */
export function confetti(count = 70) {
  if (document.documentElement.dataset.motion === 'off') return;
  const layer = el('div', { class: 'confetti-layer' });
  const colors = ['#6366f1', '#a855f7', '#22d3ee', '#f59e0b', '#22c55e', '#f43f5e'];
  for (let i = 0; i < count; i++) {
    const bit = el('i', { class: 'confetti-bit' });
    bit.style.left = `${Math.random() * 100}%`;
    bit.style.background = colors[(Math.random() * colors.length) | 0];
    bit.style.setProperty('--dx', `${(Math.random() - 0.5) * 220}px`);
    bit.style.animationDuration = `${1.6 + Math.random() * 1.6}s`;
    bit.style.animationDelay = `${Math.random() * 0.5}s`;
    bit.style.opacity = 0.85;
    layer.append(bit);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 4200);
}

/* ---------- misc ---------- */
export function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function downloadText(text, filename, type = 'text/plain') {
  downloadBlob(new Blob([text], { type }), filename);
}

export function relTime(ts) {
  const diff = Date.now() - ts;
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

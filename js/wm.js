/* Window manager — draggable / resizable / minimizable app windows */
import { el, clamp, isMobile } from './utils.js';
import { icon } from './icons.js';

let zCounter = 20;

export class WindowManager {
  constructor(layer) {
    this.layer = layer;
    this.apps = new Map();
    this.windows = new Map();   // appId -> record
    this.changeHandlers = [];
    this.cascade = 0;

    new ResizeObserver(() => this.handleViewportResize()).observe(layer);
  }

  register(def) { this.apps.set(def.id, def); return this; }
  appList() { return Array.from(this.apps.values()); }
  onChange(fn) { this.changeHandlers.push(fn); }
  emit() { this.changeHandlers.forEach((f) => f(this)); }

  isOpen(appId) {
    const rec = this.windows.get(appId);
    return !!(rec && !rec.closed);
  }
  isMinimized(appId) {
    const rec = this.windows.get(appId);
    return !!(rec && rec.minimized);
  }

  /* ---------------- open / focus / close ---------------- */
  open(appId, params = {}) {
    const def = this.apps.get(appId);
    if (!def) return null;

    const existing = this.windows.get(appId);
    if (existing && !existing.closed) {
      if (existing.minimized) this.toggleMinimize(appId, false);
      this.focus(appId);
      if (existing.instance) existing.instance.onParams?.(params);
      else existing.pending.push(params);
      return existing.instance;
    }

    const rec = this.buildWindow(def, params);
    this.windows.set(appId, rec);
    this.focus(appId);
    this.emit();
    return rec.instance;
  }

  close(appId) {
    const rec = this.windows.get(appId);
    if (!rec) return;
    rec.closed = true;
    try { rec.instance?.onClose?.(); } catch (e) { console.warn(e); }
    rec.root.classList.add('closing');
    setTimeout(() => rec.root.remove(), 190);
    this.windows.delete(appId);
    if (rec.root.classList.contains('focused')) this.focusVisible();
    this.emit();
  }

  toggleMinimize(appId, force) {
    const rec = this.windows.get(appId);
    if (!rec) return;
    rec.minimized = force === undefined ? !rec.minimized : force;
    rec.root.classList.toggle('min', rec.minimized);
    if (!rec.minimized) this.focus(appId);
    else if (rec.root.classList.contains('focused')) { rec.root.classList.remove('focused'); this.focusVisible(); }
    this.emit();
  }

  toggleMaximize(appId) {
    const rec = this.windows.get(appId);
    if (!rec || isMobile()) return;
    if (!rec.maxed) rec.prevRect = this.readRect(rec);
    rec.maxed = !rec.maxed;
    this.layoutWindow(rec);
    rec.instance?.onResize?.();
    this.emit();
  }

  focusVisible() {
    const candidates = [...this.windows.values()].filter(w => !w.minimized && !w.closed);
    const top = candidates.reduce((a,b) => !a || Number(b.root.style.zIndex) > Number(a.root.style.zIndex) ? b : a, null);
    if (top) this.focus(top.id);
  }

  returnToBoard(from) {
    this.open('whiteboard', {returnToBoard:true});
    if (from && from !== 'whiteboard') this.toggleMinimize(from, true);
  }

  focus(appId) {
    const rec = this.windows.get(appId);
    if (!rec || rec.minimized || rec.root.classList.contains('focused')) return;
    zCounter += 1;
    rec.root.style.zIndex = String(zCounter);
    this.windows.forEach((r) => r.root.classList.toggle('focused', r === rec));
    this.emit();
  }

  setTitle(appId, title) {
    const rec = this.windows.get(appId);
    if (rec) rec.titleEl.textContent = title;
  }

  /* ---------------- build ---------------- */
  buildWindow(def, params) {
    const mobile = isMobile();
    const layerW = this.layer.clientWidth;
    const layerH = this.layer.clientHeight;

    let width = Math.min(def.width || 960, Math.max(0, layerW - 24));
    let height = Math.min(def.height || 640, Math.max(0, layerH - 24));

    const step = (this.cascade++ % 6) * 26;
    let left = mobile ? 0 : Math.max(12, (layerW - width) / 2 + step - 60);
    let top = mobile ? 0 : Math.max(10, (layerH - height) / 2 + step - 60);
    left = clamp(left, 0, Math.max(0, layerW - width));
    top = clamp(top, 0, Math.max(0, layerH - height));

    const root = el('section', { class: 'win', role: 'dialog', 'aria-label': def.name, dataset: { app: def.id } });
    root.style.width = `${width}px`;
    root.style.height = `${height}px`;
    root.style.left = `${left}px`;
    root.style.top = `${top}px`;

    const dot = (kind, label, path, onClick) => el('button', {
      class: `win-dot ${kind}`, title: label, 'aria-label': label, onclick: onClick,
    }, el('span', { class: 'dot-glyph', html: `<svg viewBox="0 0 12 12" aria-hidden="true"><path d="${path}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>` }));

    const titleEl = el('span', { text: def.name });
    const head = el('header', { class: 'win-head' },
      el('div', { class: 'win-dots' },
        dot('c', 'Close', 'M3.5 3.5l5 5M8.5 3.5l-5 5', (e) => { e.stopPropagation(); this.close(def.id); }),
        dot('m', 'Minimize', 'M3 6h6', (e) => { e.stopPropagation(); this.toggleMinimize(def.id); }),
        dot('z', 'Maximize', 'M3 6h6M6 3v6', (e) => { e.stopPropagation(); this.toggleMaximize(def.id); })
      ),
      el('div', { class: 'win-title' },
        el('span', { class: 'ic', html: icon(def.icon || 'logo') }),
        titleEl
      ),
      el('div', { class: 'win-actions' }, def.id !== 'whiteboard' && el('button', {class:'win-back-board', type:'button', title:'Back to Whiteboard', 'aria-label':'Back to Whiteboard', onclick:()=>this.returnToBoard(def.id)},
        el('span',{html:icon('arrow-left'),'aria-hidden':'true'}),el('b',{text:'Whiteboard'})))
    );

    const body = el('div', { class: 'win-body' });
    ['e', 'w', 's', 'se'].forEach((dir) => {
      const h = el('div', { class: `resize-h ${dir}` });
      this.attachResize(h, dir, def.id);
      root.append(h);
    });

    root.prepend(head);
    root.append(body);
    this.layer.append(root);

    const rec = {
      id: def.id, def, root, body, head, titleEl,
      instance: null, pending: [], minimized: false, closed: false, maxed: !!def.startMaximized, prevRect: { left, top, width, height }, compact: false, restoreSize: mobile,
    };

    this.layoutWindow(rec);
    this.attachDrag(rec);
    root.addEventListener('pointerdown', () => this.focus(def.id), true);
    head.addEventListener('dblclick', () => this.toggleMaximize(def.id));

    const api = {
      wm: this,
      appId: def.id,
      params,
      open: (id, p) => this.open(id, p),
      close: () => this.close(def.id),
      returnToBoard: () => this.returnToBoard(def.id),
      setTitle: (t) => this.setTitle(def.id, t),
      maximize: () => this.toggleMaximize(def.id),
      isMobile,
      head,
      actions: root.querySelector('.win-actions'),
    };

    // mount asynchronously so the window animates in first
    requestAnimationFrame(() => {
      try {
        if (rec.closed) return;
        const finish = (inst) => {
          if (rec.closed) { inst?.onClose?.(); return; }
          rec.instance = inst || {};
          rec.pending.splice(0).forEach((p) => rec.instance.onParams?.(p));
        };
        const result = def.mount ? def.mount({ root: body, params, api, win: root }) : null;
        if (result && typeof result.then === 'function') {
          result
            .then(finish)
            .catch((err) => console.error(`[${def.id}] async mount failed`, err));
        } else {
          finish(result);
        }
      } catch (err) {
        console.error(`[${def.id}] mount failed`, err);
        body.append(el('div', { class: 'media-empty', text: 'This app failed to start. Check the console for details.' }));
      }
    });

    return rec;
  }

  applyRect(rec, rect) {
    if (!rect) return;
    rec.root.style.left = `${rect.left}px`;
    rec.root.style.top = `${rect.top}px`;
    rec.root.style.width = `${rect.width}px`;
    rec.root.style.height = `${rect.height}px`;
  }

  /* ---------------- drag ---------------- */
  attachDrag(rec) {
    const { root, head } = rec;
    let start = null;

    const down = (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      if (e.target.closest('button, input, .win-actions')) return;
      if (root.classList.contains('max')) return;
      start = {
        x: e.clientX, y: e.clientY,
        left: root.offsetLeft, top: root.offsetTop,
        w: root.offsetWidth, h: root.offsetHeight,
      };
      head.setPointerCapture(e.pointerId);
      root.style.transition = 'none';
      root.classList.add('dragging');
      e.preventDefault();
    };
    const move = (e) => {
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const maxL = Math.max(0, this.layer.clientWidth - start.w);
      const maxT = Math.max(0, this.layer.clientHeight - start.h);
      root.style.left = `${clamp(start.left + dx, 0, maxL)}px`;
      root.style.top = `${clamp(start.top + dy, 0, maxT)}px`;
    };
    const up = (e) => {
      if (!start) return;
      start = null;
      root.classList.remove('dragging');
      root.style.transition = '';
      try { head.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    };
    head.addEventListener('pointerdown', down);
    head.addEventListener('pointermove', move);
    head.addEventListener('pointerup', up);
    head.addEventListener('pointercancel', up);
  }

  /* ---------------- resize ---------------- */
  attachResize(handle, dir, appId) {
    let start = null;
    const onDown = (e) => {
      const rec = this.windows.get(appId);
      if (!rec || rec.root.classList.contains('max')) return;
      start = {
        x: e.clientX, y: e.clientY,
        left: rec.root.offsetLeft, top: rec.root.offsetTop,
        w: rec.root.offsetWidth, h: rec.root.offsetHeight,
      };
      handle.setPointerCapture(e.pointerId);
      rec.root.style.transition = 'none';
      e.preventDefault(); e.stopPropagation();
    };
    const onMove = (e) => {
      if (!start) return;
      const rec = this.windows.get(appId);
      if (!rec) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      let { left, top, w, h } = start;
      if (dir.includes('e')) w = Math.max(320, start.w + dx);
      if (dir.includes('s')) h = Math.max(220, start.h + dy);
      if (dir.includes('w')) {
        w = Math.max(320, start.w - dx);
        w = Math.min(w, start.left + start.w);
        left = start.left + (start.w - w);
      }
      w = Math.min(w, this.layer.clientWidth - Math.max(0, left));
      h = Math.min(h, this.layer.clientHeight - Math.max(0, top));
      this.applyRect(rec, { left, top, width: w, height: h });
      rec.instance?.onResize?.();
    };
    const onUp = (e) => {
      if (!start) return;
      start = null;
      const rec = this.windows.get(appId);
      if (rec) { rec.root.style.transition = ''; rec.instance?.onResize?.(); }
      try { handle.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    };
    handle.addEventListener('pointerdown', onDown);
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  }

  readRect(rec) {
    const { left, top, width, height } = rec.root.style;
    return { left: parseFloat(left), top: parseFloat(top), width: parseFloat(width), height: parseFloat(height) };
  }

  layoutWindow(rec) {
    const compact = isMobile();
    const w = this.layer.clientWidth;
    const h = this.layer.clientHeight;
    if (compact && !rec.compact && !rec.maxed) rec.prevRect = this.readRect(rec);
    rec.root.classList.toggle('compact', compact);
    rec.root.classList.toggle('max', compact || rec.maxed);
    if (compact || rec.maxed) {
      this.applyRect(rec, { left: 0, top: 0, width: w, height: h });
    } else {
      let rect = rec.prevRect || this.readRect(rec);
      if (rec.restoreSize) {
        const width = Math.min(rec.def.width || 960, w - 24);
        const height = Math.min(rec.def.height || 640, h - 24);
        rect = { width, height, left: (w - width) / 2, top: (h - height) / 2 };
        rec.restoreSize = false;
      }
      const width = Math.min(rect.width, w);
      const height = Math.min(rect.height, h);
      this.applyRect(rec, {
        width, height,
        left: clamp(rect.left, 0, Math.max(0, w - width)),
        top: clamp(rect.top, 0, Math.max(0, h - height)),
      });
      rec.prevRect = null;
    }
    rec.compact = compact;
  }

  handleViewportResize() {
    this.windows.forEach((rec) => {
      this.layoutWindow(rec);
      rec.instance?.onResize?.();
    });
  }
}

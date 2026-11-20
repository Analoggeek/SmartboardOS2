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

    window.addEventListener('resize', () => this.handleViewportResize());
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
      existing.instance?.onParams?.(params);
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
    this.emit();
  }

  toggleMinimize(appId, force) {
    const rec = this.windows.get(appId);
    if (!rec) return;
    rec.minimized = force === undefined ? !rec.minimized : force;
    rec.root.classList.toggle('min', rec.minimized);
    if (!rec.minimized) this.focus(appId);
    this.emit();
  }

  toggleMaximize(appId) {
    const rec = this.windows.get(appId);
    if (!rec) return;
    if (rec.root.classList.contains('max')) {
      rec.root.classList.remove('max');
      this.applyRect(rec, rec.prevRect);
      rec.maxed = false;
    } else {
      rec.prevRect = { left: rec.root.offsetLeft, top: rec.root.offsetTop, width: rec.root.offsetWidth, height: rec.root.offsetHeight };
      rec.root.classList.add('max');
      this.applyRect(rec, { left: 0, top: 0, width: this.layer.clientWidth, height: this.layer.clientHeight });
      rec.maxed = true;
    }
    rec.instance?.onResize?.();
    this.emit();
  }

  focus(appId) {
    const rec = this.windows.get(appId);
    if (!rec) return;
    zCounter += 1;
    rec.root.style.zIndex = String(zCounter);
    this.windows.forEach((r) => r.root.classList.toggle('focused', r === rec));
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

    let width = Math.min(def.width || 960, layerW - 24);
    let height = Math.min(def.height || 640, layerH - 24);
    if (mobile) { width = layerW; height = layerH; }

    const step = (this.cascade++ % 6) * 26;
    let left = mobile ? 0 : Math.max(12, (layerW - width) / 2 + step - 60);
    let top = mobile ? 0 : Math.max(10, (layerH - height) / 2 + step - 60);
    left = clamp(left, 0, Math.max(0, layerW - width));
    top = clamp(top, 0, Math.max(0, layerH - height));

    const root = el('section', { class: 'win', role: 'dialog', 'aria-label': def.name });
    root.style.width = `${width}px`;
    root.style.height = `${height}px`;
    root.style.left = `${left}px`;
    root.style.top = `${top}px`;
    if (mobile) root.classList.add('max');

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
      el('div', { class: 'win-actions' })
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
      instance: null, minimized: false, closed: false, maxed: mobile,
    };

    this.attachDrag(rec);
    root.addEventListener('pointerdown', () => this.focus(def.id), true);
    head.addEventListener('dblclick', () => this.toggleMaximize(def.id));

    const api = {
      wm: this,
      appId: def.id,
      params,
      open: (id, p) => this.open(id, p),
      close: () => this.close(def.id),
      setTitle: (t) => this.setTitle(def.id, t),
      maximize: () => this.toggleMaximize(def.id),
      isMobile,
      head,
      actions: root.querySelector('.win-actions'),
    };

    // mount asynchronously so the window animates in first
    requestAnimationFrame(() => {
      try {
        const result = def.mount ? def.mount({ root: body, params, api, win: root }) : null;
        if (result && typeof result.then === 'function') {
          result
            .then((inst) => { rec.instance = inst || {}; })
            .catch((err) => console.error(`[${def.id}] async mount failed`, err));
        } else {
          rec.instance = result || {};
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
      const maxL = this.layer.clientWidth - 60;
      const maxT = this.layer.clientHeight - 44;
      root.style.left = `${clamp(start.left + dx, -start.w + 120, maxL)}px`;
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

  handleViewportResize() {
    const mobile = isMobile();
    this.windows.forEach((rec) => {
      if (mobile) {
        rec.root.classList.add('max');
        this.applyRect(rec, { left: 0, top: 0, width: this.layer.clientWidth, height: this.layer.clientHeight });
      } else if (rec.root.classList.contains('max')) {
        this.applyRect(rec, { left: 0, top: 0, width: this.layer.clientWidth, height: this.layer.clientHeight });
      } else {
        const w = Math.min(rec.root.offsetWidth, this.layer.clientWidth);
        const h = Math.min(rec.root.offsetHeight, this.layer.clientHeight);
        const left = clamp(rec.root.offsetLeft, 0, Math.max(0, this.layer.clientWidth - w));
        const top = clamp(rec.root.offsetTop, 0, Math.max(0, this.layer.clientHeight - h));
        this.applyRect(rec, { left, top, width: w, height: h });
      }
      rec.instance?.onResize?.();
    });
  }
}

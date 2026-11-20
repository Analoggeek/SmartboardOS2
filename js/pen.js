/* Pen & touch engine — pressure, tilt, and software palm rejection.
   Works with every stylus that raises Pointer Events (Wacom, Huion, XP-Pen,
   Apple Pencil, S Pen, USI pens) and with plain touch laptops/phones. */
import { store } from './db.js';

export const PEN_DEFAULTS = {
  pressure: true,     // vary stroke width with stylus pressure
  tilt: true,         // use tilt to widen highlighter strokes
  palm: 'auto',       // auto | strong | off
  touchDraw: true,    // allow finger drawing when no pen is around
  palmDelay: 900,     // ms to ignore touch after the pen was used
  palmSize: 44,       // contact size (css px) above which a touch is a palm
  smoothing: 0.4,     // 0 = raw, 0.8 = very smooth
};

export function getPenSettings() {
  return { ...PEN_DEFAULTS, ...store.get('penSettings', {}) };
}

export function savePenSettings(patch) {
  const next = { ...getPenSettings(), ...patch };
  store.set('penSettings', next);
  window.dispatchEvent(new CustomEvent('sbos:pen', { detail: next }));
  return next;
}

/**
 * Tracks every pointer on the page so the board can tell a pen from a palm.
 */
export function createPenTracker() {
  const state = {
    lastPenAt: 0,
    penDown: false,
    kind: 'none',       // pen | touch | mouse | none
    pressure: 0.5,
    tilt: 0,
  };

  const touch = (e) => {
    if (e.pointerType === 'pen') {
      state.lastPenAt = performance.now();
      state.kind = 'pen';
      state.pressure = e.pressure > 0 ? e.pressure : 0.5;
      state.tilt = Math.min(1, Math.hypot(e.tiltX || 0, e.tiltY || 0) / 70);
      if (e.type === 'pointerdown') state.penDown = true;
      if (e.type === 'pointerup' || e.type === 'pointercancel') state.penDown = false;
    } else if (e.pointerType === 'touch') {
      if (state.penDown || performance.now() - state.lastPenAt < 400) return;
      state.kind = 'touch';
    } else if (e.pointerType === 'mouse') {
      if (!state.penDown && performance.now() - state.lastPenAt > 1500) state.kind = 'mouse';
    }
  };

  const opts = { capture: true, passive: true };
  document.addEventListener('pointerdown', touch, opts);
  document.addEventListener('pointermove', touch, opts);
  document.addEventListener('pointerup', touch, opts);
  document.addEventListener('pointercancel', touch, opts);

  // safety: if a pointerup is lost, release the pen state
  setInterval(() => {
    if (state.penDown && performance.now() - state.lastPenAt > 4000) state.penDown = false;
  }, 2000);

  return {
    state,
    penRecent: (ms = 1500) => performance.now() - state.lastPenAt < ms,
    /** true if this pointer event should be treated as an intentional stroke */
    shouldDraw(e, settings = getPenSettings()) {
      if (e.pointerType === 'pen') return true;
      if (e.pointerType === 'mouse') return true;
      if (e.pointerType !== 'touch') return true;

      const size = Math.max(e.width || 0, e.height || 0);
      if (settings.palm === 'off') return settings.touchDraw !== false && size < 220;

      // a palm resting while the stylus is writing, or just after it lifted
      if (state.penDown) return false;
      if (performance.now() - state.lastPenAt < settings.palmDelay) return false;

      // physically large contact = palm / fist
      if (size > settings.palmSize) return false;
      if (size > 160) return false;

      if (settings.palm === 'strong') return settings.touchDraw !== false && size < settings.palmSize * 0.75;
      return settings.touchDraw !== false;
    },
  };
}

/** width multiplier for a stroke point coming from a pressure-aware device */
export function pressureWidth(baseWidth, point, settings = getPenSettings()) {
  if (!settings.pressure) return baseWidth;
  const p = point?.p;
  if (p === undefined || p === null) return baseWidth;
  // 0.35 base → 1.25 at full pressure
  return baseWidth * (0.35 + Math.min(1, Math.max(0, p)) * 0.95);
}

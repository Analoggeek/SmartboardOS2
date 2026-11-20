import { store } from './db.js';
import { clamp } from './utils.js';

const RESET = 'sbos:reset-controls';
export const resetBoardControls = () => window.dispatchEvent(new Event(RESET));

export function movableControls({ node, handle, bounds, key, start, enabled = () => true, moved = () => {} }) {
  const pref = `control-layout-v2:${key}`;
  let ratio = store.get(pref), drag;
  const limits = () => ({ x: Math.max(0, bounds.clientWidth - node.offsetWidth - 16), y: Math.max(0, bounds.clientHeight - node.offsetHeight - 16) });
  function put(x, y) {
    const max = limits();
    node.style.left = `${8 + clamp(x, 0, max.x)}px`;
    node.style.top = `${8 + clamp(y, 0, max.y)}px`;
    moved();
  }
  function reflow() {
    if (!enabled() || !node.offsetWidth) {
      node.style.removeProperty('left'); node.style.removeProperty('top'); moved(); return;
    }
    const max = limits();
    if (Number.isFinite(ratio?.x) && Number.isFinite(ratio?.y)) put(max.x * ratio.x, max.y * ratio.y);
    else { const p = start(max); put(p.x, p.y); }
  }
  function adjust(x, y) {
    const max = limits();
    ratio = { x: max.x ? clamp(x,0,max.x) / max.x : 0, y: max.y ? clamp(y,0,max.y) / max.y : 0 };
    put(x, y);
  }
  function down(event) {
    if (event.button !== 0 || !enabled()) return;
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    drag = { pointer:event.pointerId, x:event.clientX - node.offsetLeft + 8, y:event.clientY - node.offsetTop + 8 };
    node.classList.add('control-dragging');
  }
  function move(event) {
    if (drag?.pointer !== event.pointerId) return;
    adjust(event.clientX - drag.x, event.clientY - drag.y);
  }
  function end(event) {
    if (drag?.pointer !== event.pointerId) return;
    drag = null;
    node.classList.remove('control-dragging');
    if (ratio) store.set(pref, ratio);
  }
  function reset() { ratio = null; store.del(pref); reflow(); }
  function keys(event) {
    if (!enabled()) return;
    if (event.key === 'Home') { event.preventDefault(); reset(); return; }
    const dir = { ArrowLeft:[-1,0], ArrowRight:[1,0], ArrowUp:[0,-1], ArrowDown:[0,1] }[event.key];
    if (!dir) return;
    event.preventDefault(); event.stopPropagation();
    const step = event.shiftKey ? 40 : 12;
    adjust(node.offsetLeft - 8 + dir[0] * step, node.offsetTop - 8 + dir[1] * step);
    store.set(pref, ratio);
  }
  const handlers = { pointerdown:down, pointermove:move, pointerup:end, pointercancel:end, lostpointercapture:end, keydown:keys };
  for (const [event, fn] of Object.entries(handlers)) handle.addEventListener(event, fn);
  window.addEventListener(RESET, reset);
  const ro = new ResizeObserver(reflow); ro.observe(node); ro.observe(bounds);
  reflow();
  return { reflow, close() { ro.disconnect(); window.removeEventListener(RESET, reset); for (const [event, fn] of Object.entries(handlers)) handle.removeEventListener(event,fn); } };
}

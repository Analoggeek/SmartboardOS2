/* Crisp CSS dice faces (no emoji font needed) */
import { el } from './utils.js';

const DOTS = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

export function diceFace(n = 1, size = 0) {
  const on = DOTS[n] || DOTS[1];
  const face = el('div', { class: 'die-face' });
  if (size) { face.style.width = `${size}px`; face.style.height = `${size}px`; }
  for (let i = 0; i < 9; i++) {
    face.append(el('i', { class: on.includes(i) ? 'on' : '' }));
  }
  face.dataset.value = String(n);
  return face;
}

export function setDiceFace(host, n) {
  const fresh = diceFace(n);
  host.replaceChildren(...fresh.childNodes);
  host.dataset.value = String(n);
}

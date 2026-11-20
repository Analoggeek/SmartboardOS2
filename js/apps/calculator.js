/* Calculator — quick class maths */
import { el } from '../utils.js';

const KEYS = [
  ['C', 'fn'], ['⌫', 'fn'], ['%', 'op'], ['÷', 'op'],
  ['7'], ['8'], ['9'], ['×', 'op'],
  ['4'], ['5'], ['6'], ['−', 'op'],
  ['1'], ['2'], ['3'], ['+', 'op'],
  ['±', 'fn'], ['0'], ['.'], ['=', 'eq'],
];

export function mount({ root }) {
  let expr = '';
  let lastResult = '';

  const exprEl = el('div', { class: 'calc-expr', text: '' });
  const valEl = el('div', { class: 'calc-val', text: '0' });
  const display = el('div', { class: 'calc-display' }, exprEl, valEl);
  const keys = el('div', { class: 'calc-keys' });

  function compute(input) {
    // Support + - * / % and decimals safely (no eval)
    const tokens = input.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').match(/(\d+\.?\d*|\.\d+|[+\-*/%()])/g);
    if (!tokens) return null;
    let i = 0;
    const peek = () => tokens[i];
    const next = () => tokens[i++];

    function primary() {
      const t = peek();
      if (t === '(') { next(); const v = sum(); if (peek() === ')') next(); return v; }
      if (t === '-') { next(); return -primary(); }
      const n = parseFloat(next());
      return Number.isFinite(n) ? n : NaN;
    }
    function percentLoop(a) {
      // treat trailing % as /100
      while (peek() === '%') { next(); a = a / 100; }
      return a;
    }
    function product() {
      let a = percentLoop(primary());
      while (peek() === '*' || peek() === '/') {
        const op = next();
        const b = primary();
        a = op === '*' ? a * b : a / b;
      }
      return a;
    }
    function sum() {
      let a = product();
      while (peek() === '+' || peek() === '-') {
        const op = next();
        const b = product();
        a = op === '+' ? a + b : a - b;
      }
      return a;
    }
    const res = sum();
    return Number.isFinite(res) ? res : null;
  }

  function paint() {
    exprEl.textContent = expr || ' ';
    if (!expr) { valEl.textContent = lastResult || '0'; return; }
    const preview = compute(expr);
    valEl.textContent = preview === null ? '…' : formatNum(preview);
  }

  const formatNum = (n) => {
    if (!Number.isFinite(n)) return 'Error';
    const s = Math.abs(n) >= 1e12 ? n.toExponential(6) : String(Math.round(n * 1e10) / 1e10);
    return s;
  };

  function press(k) {
    if (k === 'C') { expr = ''; lastResult = ''; paint(); return; }
    if (k === '⌫') { expr = expr.slice(0, -1); paint(); return; }
    if (k === '=') {
      const r = compute(expr);
      if (r === null) { valEl.textContent = 'Error'; return; }
      lastResult = formatNum(r);
      expr = '';
      valEl.textContent = lastResult;
      exprEl.textContent = ' ';
      return;
    }
    if (k === '±') {
      const m = expr.match(/(-?\d+\.?\d*)$/);
      if (m) {
        const idx = expr.length - m[1].length;
        expr = expr.slice(0, idx) + (m[1].startsWith('-') ? m[1].slice(1) : `-${m[1]}`);
      } else expr = `-(${expr})`;
      paint(); return;
    }
    expr += k;
    paint();
  }

  KEYS.forEach(([k, cls]) => {
    keys.append(el('button', { class: `calc-key ${cls || ''}`, text: k, onclick: () => press(k) }));
  });

  root.append(el('div', { class: 'calc' }, display, keys));
  paint();

  const onKey = (e) => {
    if (!document.body.contains(root) || !root.closest('.win')?.classList.contains('focused')) return;
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    const k = e.key;
    if (/^[0-9.]$/.test(k)) { press(k); e.preventDefault(); }
    else if (k === '+') press('+');
    else if (k === '-') press('−');
    else if (k === '*') press('×');
    else if (k === '/') { press('÷'); e.preventDefault(); }
    else if (k === '%') press('%');
    else if (k === 'Enter' || k === '=') { press('='); e.preventDefault(); }
    else if (k === 'Backspace') press('⌫');
    else if (k === 'Escape' || k.toLowerCase() === 'c') press('C');
  };
  window.addEventListener('keydown', onKey);

  return { onClose: () => window.removeEventListener('keydown', onKey) };
}

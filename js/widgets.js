/* Desktop widgets — clock, quick timer, sticky note, dice */
import { el, clamp, fmtClock, fmtDateLong, fmtDuration, beep, chime, toast, uid } from './utils.js';
import { icon } from './icons.js';
import { store, getSettings, saveSettings } from './db.js';
import { diceFace, setDiceFace } from './diceface.js';

const CATALOG = {
  clock: { name: 'Clock', desc: 'Live time & date', icon: 'clock', span: 2 },
  timer: { name: 'Timer', desc: 'Quick countdown', icon: 'timer' },
  note: { name: 'Sticky note', desc: 'Autosaved memo', icon: 'note', span: 2 },
  dice: { name: 'Dice', desc: 'Roll for activities', icon: 'dice' },
};

let tickHandle = null;
const tickers = new Set();

export function initWidgets(container, { onOpenApp }) {
  let open = getSettings().openWidgets;

  function render() {
    container.innerHTML = '';
    open.forEach((id, i) => {
      const meta = CATALOG[id];
      if (!meta) return;
      const card = el('div', { class: `widget w-${id} ${meta.span === 2 ? 'span2' : ''}`, style: { animationDelay: `${i * 55}ms` } });
      card.append(el('div', { class: 'widget-head' },
        el('span', { class: 'widget-label', text: meta.name }),
        el('button', { class: 'widget-x', html: icon('x'), title: 'Remove widget', onclick: () => removeWidget(id) })
      ));
      if (id === 'clock') renderClock(card);
      if (id === 'timer') renderTimer(card);
      if (id === 'note') renderNote(card);
      if (id === 'dice') renderDice(card);
      container.append(card);
    });

    if (!open.length) {
      container.append(el('div', { class: 'widget span2', style: { textAlign: 'center', color: 'var(--text-3)', fontSize: '12px' } },
        el('div', { text: 'No widgets shown' }),
        el('button', { class: 'link-btn', style: { marginTop: '8px' }, text: '+ Add widgets', onclick: openPicker })
      ));
    }
  }

  function removeWidget(id) {
    open = open.filter((x) => x !== id);
    saveSettings({ openWidgets: open });
    render();
    toast('Widget removed — add it back with "+ Add"', 'info', 2200);
  }

  /* ---------------- clock ---------------- */
  function renderClock(card) {
    const time = el('div', { class: 'w-time', text: '--:--' });
    const suffix = el('small', { class: 'w-ampm', text: '' });
    const date = el('div', { class: 'w-date', text: '' });
    card.append(el('div', { class: 'w-clock' },
      el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '5px' } }, time, suffix),
      date
    ));
    const paint = () => {
      const s = getSettings();
      const now = new Date();
      const { time: t, suffix: sfx } = fmtClock(now, s.use24h);
      time.textContent = t;
      suffix.textContent = s.use24h ? '' : sfx;
      date.textContent = fmtDateLong(now);
    };
    paint();
    const t = setInterval(paint, 10000);
    tickers.add(t);
  }

  /* ---------------- timer ---------------- */
  function renderTimer(card) {
    let total = store.get('widgetTimerMinutes', 5) * 60000;
    let left = total;
    let running = false;
    let last = 0;
    let raf = null;

    const display = el('div', { class: 'w-timer-time', text: fmtDuration(left) });
    const startBtn = el('button', { class: 'mini-btn', text: 'Start' });
    const resetBtn = el('button', { class: 'mini-btn', text: 'Reset' });
    const minusBtn = el('button', { class: 'mini-btn', text: '−1m' });
    const plusBtn = el('button', { class: 'mini-btn', text: '+1m' });

    const paint = () => { display.textContent = fmtDuration(left); startBtn.textContent = running ? 'Pause' : 'Start'; startBtn.classList.toggle('on', running); };
    const loop = (t) => {
      if (!running) return;
      if (!last) last = t;
      left -= t - last; last = t;
      if (left <= 0) {
        left = 0; running = false; paint(); chime(); toast("Time's up!", 'warn', 4000);
        return;
      }
      paint();
      raf = requestAnimationFrame(loop);
    };
    startBtn.onclick = () => {
      running = !running; last = 0;
      if (running) { if (left <= 0) left = total; raf = requestAnimationFrame(loop); }
      else if (raf) cancelAnimationFrame(raf);
      paint();
    };
    resetBtn.onclick = () => { running = false; if (raf) cancelAnimationFrame(raf); left = total; paint(); };
    minusBtn.onclick = () => { total = clamp(total - 60000, 60000, 3600000); left = running ? left : total; store.set('widgetTimerMinutes', total / 60000); paint(); };
    plusBtn.onclick = () => { total = clamp(total + 60000, 60000, 3600000); left = running ? left : total; store.set('widgetTimerMinutes', total / 60000); paint(); };

    card.append(el('div', { class: 'w-timer' }, display, el('div', { class: 'w-timer-row' }, startBtn, resetBtn, minusBtn, plusBtn)));
    paint();
    tickers.add(setInterval(paint, 1000));
  }

  /* ---------------- sticky note ---------------- */
  function renderNote(card) {
    const note = store.get('quickNote', '');
    const ta = el('textarea', { class: 'w-note-area', placeholder: 'Type a quick reminder for this class…', style: { width: '100%', minHeight: '74px', resize: 'vertical', border: '0', outline: '0', background: 'transparent', color: 'var(--text)', fontSize: '12.5px', lineHeight: '1.5' } });
    ta.value = note;
    let timer = null;
    ta.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => store.set('quickNote', ta.value), 350);
    });
    card.append(el('div', { class: 'w-note' }, ta));
  }

  /* ---------------- dice ---------------- */
  function renderDice(card) {
    let count = store.get('diceCount', 2);
    const face = el('div', { class: 'w-dice-face' });
    const caption = el('div', { style: { fontSize: '10.5px', color: 'var(--text-3)', textAlign: 'center' }, text: `${count} dice · tap to roll` });
    const box = el('div', { class: 'w-dice' }, face, caption);
    const show = (vals) => {
      face.replaceChildren(...vals.map((v) => diceFace(v)));
      face.style.display = 'flex';
      face.style.gap = '6px';
      face.style.justifyContent = 'center';
    };
    show(Array.from({ length: count }, () => 1));

    const roll = async () => {
      if (box.classList.contains('rolling')) return;
      box.classList.add('rolling');
      for (let i = 0; i < 8; i++) {
        show(Array.from({ length: count }, () => 1 + ((Math.random() * 6) | 0)));
        beep({ freq: 300 + i * 40, dur: 0.04, gain: 0.04 });
        await new Promise((r) => setTimeout(r, 60));
      }
      const vals = Array.from({ length: count }, () => 1 + ((Math.random() * 6) | 0));
      show(vals);
      caption.textContent = count === 1 ? `Rolled ${vals[0]}` : `Total ${vals.reduce((a, b) => a + b, 0)} (${vals.join(' + ')})`;
      box.classList.remove('rolling');
    };
    box.style.cursor = 'pointer';
    box.addEventListener('click', roll);
    card.append(box);
  }

  /* ---------------- picker ---------------- */
  function openPicker() {
    const backdrop = el('div', { class: 'modal-backdrop' });
    const grid = el('div', { class: 'modal-grid' });
    Object.entries(CATALOG).forEach(([id, meta]) => {
      const isOpen = open.includes(id);
      grid.append(el('button', {
        class: 'modal-card',
        style: isOpen ? { borderColor: 'var(--accent)', background: 'var(--accent-soft)' } : {},
        onclick: () => {
          open = isOpen ? open.filter((x) => x !== id) : [...open, id];
          saveSettings({ openWidgets: open });
          render(); openPickerRefresh();
        },
      },
        el('span', { class: 'launch-icon', style: { width: '32px', height: '32px', borderRadius: '10px' }, html: icon(meta.icon) }),
        el('b', { text: meta.name }),
        el('small', { text: isOpen ? 'Shown ✓' : meta.desc })
      ));
    });
    const modal = el('div', { class: 'modal' },
      el('h3', { text: 'Widgets' }),
      el('p', { text: 'Pick the cards you want on your home screen. They stay in sync across the app.' }),
      grid,
      el('div', { class: 'modal-foot' }, el('button', { class: 'btn primary', text: 'Done', onclick: () => backdrop.remove() }))
    );
    backdrop.append(modal);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
    const openPickerRefresh = () => { backdrop.remove(); openPicker(); };
    document.body.append(backdrop);
  }

  render();
  return { render, openPicker };
}

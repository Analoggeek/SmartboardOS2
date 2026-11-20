import { el, fmtDuration, chime } from './utils.js';
import { state } from './db.js';

export function classroomWidget(openTools) {
  let remaining = 300000, end = 0, timer;
  const duration = el('input', { class: 'field', type: 'number', min: 1, max: 120, value: 5, 'aria-label': 'Timer minutes' });
  const clock = el('output', { class: 'class-widget-clock', text: '05:00', 'aria-label': 'Time remaining' });
  const start = el('button', { class: 'mini-btn', text: 'Start', onclick: toggleTimer });
  const picked = el('p', { role: 'status', class: 'class-widget-picked', text: 'No student picked' });
  const node = el('aside', { class: 'class-widget', 'aria-label': 'Classroom widget', hidden: true },
    el('div', { class: 'class-widget-head' }, el('strong', { text: 'Classroom' }), el('button', { class: 'mini-btn', text: 'All tools', onclick: openTools })),
    el('div', { class: 'class-widget-row' }, clock, start, el('button', { class: 'mini-btn', text: 'Reset', onclick: reset })),
    el('label', { class: 'class-widget-row' }, 'Duration (min)', duration),
    el('div', { class: 'class-widget-row' }, el('button', { class: 'mini-btn', text: 'Pick a student', onclick: pick }), picked));
  function tick() {
    if (end) remaining = Math.max(0,end-Date.now());
    clock.textContent = fmtDuration(Math.ceil(remaining/1000)*1000);
    if (end && !remaining) { end = 0; clearInterval(timer); start.textContent = 'Start'; duration.disabled = false; chime(); }
  }
  function reset() {
    clearInterval(timer); end = 0; duration.disabled = false;
    duration.value = Math.min(120,Math.max(1,Number(duration.value)||5));
    remaining = Number(duration.value)*60000; start.textContent = 'Start'; tick();
  }
  function toggleTimer() {
    if (end) { tick(); end = 0; clearInterval(timer); start.textContent = 'Resume'; duration.disabled = false; return; }
    if (!remaining) reset();
    end = Date.now()+remaining; duration.disabled = true; start.textContent = 'Pause'; timer = setInterval(tick, 180); tick();
  }
  function pick() {
    const roster = state.get('students', []);
    picked.textContent = roster.length ? roster[Math.floor(Math.random()*roster.length)] : 'Add names in All tools → Picker.';
  }
  duration.onchange = reset;
  return { node, toggle: () => { node.hidden = !node.hidden; }, close: () => clearInterval(timer) };
}

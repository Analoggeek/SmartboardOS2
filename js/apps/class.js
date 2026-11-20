/* Class tools — random picker, spinner wheel, timer, stopwatch, scoreboard, seating and polls */
import { el, toast, confetti, beep, chime, fmtDuration, clamp, uid, announce, downloadBlob } from '../utils.js';
import { icon } from '../icons.js';
import { state } from '../db.js';

const TABS = [
  { id: 'pick', name: 'Picker', icon: 'users' },
  { id: 'wheel', name: 'Wheel', icon: 'refresh' },
  { id: 'timer', name: 'Timer', icon: 'timer' },
  { id: 'stopwatch', name: 'Stopwatch', icon: 'stopwatch' },
  { id: 'score', name: 'Scoreboard', icon: 'trophy' },
  { id: 'seats', name: 'Seats', icon: 'users' },
  { id: 'poll', name: 'Quick poll', icon: 'layers' },
];

export function mount({ root }) {
  let active = 'pick';
  const panel = el('div', { class: 'ct-panel' });
  const tabBar = el('div', { class: 'ct-tabs' });
  const tabButtons = new Map();

  TABS.forEach((t) => {
    const b = el('button', {
      class: `ct-tab ${t.id === active ? 'active' : ''}`,
      text: t.name,
      onclick: () => { active = t.id; tabButtons.forEach((x, k) => x.classList.toggle('active', k === t.id)); renderPanel(); },
    });
    tabButtons.set(t.id, b);
    tabBar.append(b);
  });

  const app = el('div', { class: 'app' }, tabBar, panel);
  root.append(app);

  /* ================= helpers ================= */
  const names = () => state.get('students', ['Aarav', 'Diya', 'Ishaan', 'Meera', 'Kabir', 'Ananya', 'Rohan', 'Sara', 'Vivaan', 'Zoya']);
  const setNames = (v) => state.set('students', v);
  let teams = state.get('teams', [{ id: uid('t'), name: 'Team A', score: 0 }, { id: uid('t'), name: 'Team B', score: 0 }]);
  const saveTeams = () => state.set('teams', teams);

  function renderPanel() {
    panel.innerHTML = '';
    if (active === 'pick') panel.append(renderPicker());
    if (active === 'wheel') panel.append(renderWheel());
    if (active === 'timer') panel.append(renderTimer());
    if (active === 'stopwatch') panel.append(renderStopwatch());
    if (active === 'score') panel.append(renderScore());
    if (active === 'seats') panel.append(renderSeats());
    if (active === 'poll') panel.append(renderPoll());
  }

  function renderSeats() {
    const saved = state.get('seats-v1', { rows: 4, cols: 5, assignments: {} });
    const grid = el('div', { class: 'seat-grid' });
    const num = (label, value) => el('input', { class: 'field', type: 'number', min: 1, max: 8, value, 'aria-label': label });
    const rows = num('Rows', saved.rows), cols = num('Columns', saved.cols);
    const box = el('section', { class: 'teacher-tools' }, el('h3', { text: 'Seating plan' }),
      el('p', { text: 'Uses names from Picker. Assign seats by row and column; the plan stays on this device.' }),
      el('div', { class: 'hero-actions' }, el('label', {}, 'Rows ', rows), el('label', {}, 'Columns ', cols),
        el('button', { class: 'btn', text: 'Fill from roster', onclick: () => {
          saved.assignments = {};
          [...new Set(names())].slice(0,saved.rows*saved.cols).forEach((name,i) => { saved.assignments[`${Math.floor(i/saved.cols)}:${i%saved.cols}`] = name; });
          refresh();
        } }), el('button', { class: 'btn', text: 'Clear seats', onclick: () => { if (confirm('Clear this seating plan?')) { saved.assignments = {}; refresh(); } } })),
      el('p', { class: 'seat-front', text: 'BOARD / FRONT OF ROOM' }), grid);
    function refresh() {
      saved.rows = +rows.value || 4; saved.cols = +cols.value || 5;
      state.set('seats-v1',saved);
      grid.style.gridTemplateColumns = `repeat(${saved.cols}, minmax(92px, 1fr))`;
      grid.replaceChildren(...Array.from({ length: saved.rows*saved.cols }, (_,i) => {
        const row = Math.floor(i/saved.cols), col = i%saved.cols, key = `${row}:${col}`;
        const choices = [...new Set(names().concat(saved.assignments[key] || []))];
        const select = el('select', { class: 'field', 'aria-label': `Seat ${row+1}-${col+1}` }, el('option', { value: '', text: 'Empty' }), ...choices.map(n=>el('option',{value:n,text:n})));
        select.value = saved.assignments[key] || '';
        select.onchange = () => {
          if (select.value) for (const k of Object.keys(saved.assignments)) if (k !== key && saved.assignments[k] === select.value) delete saved.assignments[k];
          saved.assignments[key] = select.value; refresh(); grid.children[i]?.querySelector('select')?.focus();
        };
        return el('label', {}, el('small', { text: `${row+1}–${col+1}` }), select);
      }));
    }
    rows.onchange = cols.onchange = () => { rows.value = clamp(+rows.value || 1,1,8); cols.value = clamp(+cols.value || 1,1,8); refresh(); };
    refresh(); return box;
  }

  function renderPoll() {
    const data = state.get('poll-v1', { question: '', counts: [0,0,0,0], labels: ['A','B','C','D'] });
    const field = el('input', { class: 'field', 'aria-label': 'Poll question', placeholder: 'Ask a question or exit-ticket check…', maxlength: 180, value: data.question });
    const result = el('div', { class: 'poll-results' });
    const total = el('p', { role: 'status' });
    const rows = data.labels.map((text,i) => {
      const label = el('input', { class: 'field', 'aria-label': `Option ${i+1}`, value: text, maxlength: 80 });
      const meter = el('progress', { max: 1, value: 0 });
      const count = el('output');
      const adjust = (amount) => { data.counts[i] = Math.max(0, data.counts[i] + amount); save(); };
      label.oninput = () => { data.labels[i] = label.value; save(); };
      result.append(el('div', { class: 'poll-option' }, label, meter, count,
        el('button', { class: 'mini-btn', text: '−', 'aria-label': `Remove vote from option ${i+1}`, onclick: () => adjust(-1) }),
        el('button', { class: 'mini-btn', text: '+', 'aria-label': `Add vote to option ${i+1}`, onclick: () => adjust(1) })));
      return {meter,count};
    });
    const sum = () => data.counts.reduce((a,b)=>a+b,0);
    function save() {
      state.set('poll-v1',data);
      total.textContent = `${sum()} response${sum() === 1 ? '' : 's'}`;
      rows.forEach(({meter,count},i) => { meter.value = sum() ? data.counts[i]/sum() : 0; count.textContent = data.counts[i]; });
    }
    field.oninput = () => { data.question = field.value; save(); };
    function exportPoll() {
      const csv = s => `"${(/^[=+@\-]/.test(String(s).trimStart()) ? "'" : '') + String(s).replaceAll('"','""')}"`;
      downloadBlob(new Blob(['Question,Option,Votes\n', ...data.labels.map((name,i)=>`${csv(data.question)},${csv(name)},${data.counts[i]}\n`)],{type:'text/csv;charset=utf-8'}), 'class-poll.csv');
    }
    save();
    return el('section', { class: 'teacher-tools' }, el('h3', { text: 'Quick poll / exit ticket' }),
      el('p', { text: 'Tally hands or let students vote one at a time on the classroom board. No names, accounts or network connection.' }), field, result, total,
      el('div', { class: 'hero-actions' }, el('button', { class:'btn', text:'Reset votes', onclick: () => { if (confirm('Reset all vote counts?')) { data.counts = [0,0,0,0]; save(); } } }),
        el('button', { class:'btn primary', text:'Export tally CSV', onclick: exportPoll })));
  }

  /* ================= Picker ================= */
  function renderPicker() {
    const nameBox = el('div', { class: 'ct-name-box', text: 'Ready?' });
    let rolling = false;

    const pickBtn = el('button', {
      class: 'btn primary', html: `${icon('shuffle')}<span>Pick a student</span>`,
      onclick: async () => {
        const list = names();
        if (!list.length) return toast('Add at least one student name', 'warn');
        if (rolling) return;
        rolling = true;
        pickBtn.disabled = true;
        const winner = list[(Math.random() * list.length) | 0];
        for (let i = 0; i < 16; i++) {
          nameBox.textContent = list[(Math.random() * list.length) | 0];
          nameBox.classList.remove('picked');
          beep({ freq: 420 + i * 28, dur: 0.045, gain: 0.05 });
          await new Promise((r) => setTimeout(r, 45 + i * 11));
        }
        nameBox.textContent = winner;
        nameBox.classList.add('picked');
        confetti(60);
        chime();
        announce(`Selected: ${winner}`);
        rolling = false;
        pickBtn.disabled = false;
      },
    });

    const input = el('input', { class: 'field', placeholder: 'Add student name + Enter', style: { flex: '1', minWidth: '140px' } });
    const addName = () => {
      const v = input.value.trim();
      if (!v) return;
      setNames([...names(), v]);
      input.value = '';
      refresh();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') addName(); });

    const chips = el('div', { class: 'chips' });
    function refresh() {
      chips.innerHTML = '';
      names().forEach((n, i) => {
        chips.append(el('span', { class: 'chip' },
          n,
          el('button', {
            html: icon('x'), title: `Remove ${n}`,
            onclick: () => { const arr = names(); arr.splice(i, 1); setNames(arr); refresh(); },
          })
        ));
      });
    }
    refresh();

    return el('div', { class: 'ct-center' },
      el('div', { style: { fontSize: '11px', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-3)' }, text: 'Random student' }),
      nameBox,
      pickBtn,
      el('div', { style: { width: '100%', maxWidth: '520px', marginTop: '8px' } },
        el('div', { style: { display: 'flex', gap: '6px', marginBottom: '10px' } }, input, el('button', { class: 'btn', text: 'Add', onclick: addName })),
        chips,
        el('div', { style: { display: 'flex', gap: '6px', justifyContent: 'center', marginTop: '12px' } },
          el('button', {
            class: 'mini-btn', text: 'Load sample class',
            onclick: () => { setNames(['Aarav', 'Diya', 'Ishaan', 'Meera', 'Kabir', 'Ananya', 'Rohan', 'Sara', 'Vivaan', 'Zoya']); refresh(); toast('Sample class loaded', 'ok'); },
          }),
          el('button', {
            class: 'mini-btn', text: 'Clear all',
            onclick: () => { setNames([]); refresh(); },
          })
        )
      )
    );
  }

  /* ================= Wheel ================= */
  function renderWheel() {
    const wrap = el('div', { class: 'wheel-wrap' }, el('div', { class: 'wheel-pointer' }));
    const canvas = el('canvas');
    wrap.append(canvas);
    const result = el('div', { class: 'ct-name-box', text: 'Spin to choose' });
    let angle = 0;
    let spinning = false;

    const colors = ['#6366f1', '#a855f7', '#22d3ee', '#f59e0b', '#22c55e', '#f43f5e', '#0ea5e9', '#ec4899'];

    function paint() {
      const list = names();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const size = wrap.clientWidth || 300;
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      const c = canvas.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, size, size);
      const r = size / 2 - 6;
      const cx = size / 2, cy = size / 2;
      if (!list.length) {
        c.fillStyle = 'rgba(127,127,127,.18)';
        c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(127,127,127,.75)';
        c.font = '600 13px Inter, system-ui, sans-serif';
        c.textAlign = 'center';
        c.fillText('Add names to spin', cx, cy + 4);
        return;
      }
      const slice = (Math.PI * 2) / list.length;
      list.forEach((n, i) => {
        const a0 = angle + i * slice;
        c.beginPath();
        c.moveTo(cx, cy);
        c.arc(cx, cy, r, a0, a0 + slice);
        c.closePath();
        c.fillStyle = colors[i % colors.length];
        c.fill();
        c.strokeStyle = 'rgba(0,0,0,.12)';
        c.stroke();
        c.save();
        c.translate(cx, cy);
        c.rotate(a0 + slice / 2);
        c.textAlign = 'right';
        c.fillStyle = '#fff';
        c.font = `700 ${Math.max(10, Math.min(16, 620 / list.length))}px Inter, system-ui, sans-serif`;
        const label = n.length > 12 ? `${n.slice(0, 11)}…` : n;
        c.fillText(label, r - 12, 5);
        c.restore();
      });
      c.beginPath();
      c.arc(cx, cy, 16, 0, Math.PI * 2);
      c.fillStyle = 'var(--surface-solid)';
      c.fillStyle = '#fff';
      c.fill();
      c.strokeStyle = 'rgba(0,0,0,.15)';
      c.stroke();
    }

    function spin() {
      const list = names();
      if (!list.length) return toast('Add names first', 'warn');
      if (spinning) return;
      spinning = true;
      const start = angle;
      const turns = 4 + Math.random() * 3;
      const target = start + turns * Math.PI * 2 + Math.random() * Math.PI * 2;
      const dur = 3600;
      const t0 = performance.now();
      const step = (t) => {
        const p = clamp((t - t0) / dur, 0, 1);
        const eased = 1 - Math.pow(1 - p, 3.2);
        angle = start + (target - start) * eased;
        paint();
        if (p < 1) requestAnimationFrame(step);
        else {
          spinning = false;
          // Determine winner: pointer at top (-PI/2)
          const slice = (Math.PI * 2) / list.length;
          const norm = ((-Math.PI / 2 - angle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
          const idx = Math.floor(norm / slice) % list.length;
          const winner = list[idx];
          result.textContent = winner;
          result.classList.remove('picked');
          void result.offsetWidth;
          result.classList.add('picked');
          confetti(70);
          chime();
          announce(`Wheel selected: ${winner}`);
        }
      };
      requestAnimationFrame(step);
      beep({ freq: 520, dur: 0.08, gain: 0.06 });
    }

    requestAnimationFrame(paint);
    const ro = new ResizeObserver(() => paint());
    setTimeout(() => ro.observe(wrap), 0);

    return el('div', { class: 'ct-center' },
      wrap,
      result,
      el('button', { class: 'btn primary', html: `${icon('refresh')}<span>Spin wheel</span>`, onclick: spin }),
      el('p', { style: { fontSize: '11.5px', color: 'var(--text-3)', maxWidth: '380px' }, text: 'Names come from the Picker tab — edit them once and both tools stay in sync.' })
    );
  }

  /* ================= Timer ================= */
  function renderTimer() {
    let totalMs = state.get('timerMinutes', 5) * 60000;
    let remaining = totalMs;
    let running = false;
    let last = 0;
    let raf = null;

    const display = el('div', { class: 'ct-big-num', text: fmtDuration(remaining) });
    const ring = el('div', {
      style: {
        width: '12px', height: '12px', borderRadius: '50%', background: 'var(--text-3)',
        transition: '.2s',
      },
    });
    const startBtn = el('button', { class: 'btn primary', html: `${icon('play')}<span>Start</span>` });
    const resetBtn = el('button', { class: 'btn', html: `${icon('refresh')}<span>Reset</span>` });

    const presets = [1, 3, 5, 10, 15, 20];
    const presetRow = el('div', { class: 'pill-group', style: { marginTop: '4px' } });
    presets.forEach((m) => presetRow.append(el('button', {
      class: 'tool-btn', text: `${m}m`,
      onclick: () => { totalMs = m * 60000; remaining = totalMs; state.set('timerMinutes', m); paint(); },
    })));

    function paint() {
      display.textContent = fmtDuration(remaining);
      display.style.color = remaining <= 10000 ? '#f43f5e' : '';
      ring.style.background = running ? '#22c55e' : (remaining <= 10000 ? '#f43f5e' : 'var(--text-3)');
      startBtn.innerHTML = running ? `${icon('pause')}<span>Pause</span>` : `${icon('play')}<span>${remaining === totalMs ? 'Start' : 'Resume'}</span>`;
      startBtn.classList.toggle('primary', !running);
    }

    function loop(t) {
      if (!running) return;
      if (!last) last = t;
      remaining -= (t - last);
      last = t;
      if (remaining <= 0) {
        remaining = 0;
        running = false;
        paint();
        chime();
        setTimeout(() => beep({ freq: 990, dur: 0.5, gain: 0.16 }), 500);
        toast("Time's up!", 'warn', 5000);
        confetti(40);
        return;
      }
      paint();
      raf = requestAnimationFrame(loop);
    }

    startBtn.addEventListener('click', () => {
      running = !running;
      last = 0;
      if (running) { if (remaining <= 0) remaining = totalMs; raf = requestAnimationFrame(loop); }
      else if (raf) cancelAnimationFrame(raf);
      paint();
    });
    resetBtn.addEventListener('click', () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      remaining = totalMs;
      paint();
    });

    paint();
    return el('div', { class: 'ct-center' },
      el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-3)' } }, ring, 'Class timer'),
      display,
      el('div', { style: { display: 'flex', gap: '8px' } }, startBtn, resetBtn),
      presetRow,
      el('p', { style: { fontSize: '11.5px', color: 'var(--text-3)' }, text: 'A chime plays when the timer ends.' })
    );
  }

  /* ================= Stopwatch ================= */
  function renderStopwatch() {
    let start = 0;
    let elapsed = 0;
    let running = false;
    let raf = null;
    let laps = [];
    const display = el('div', { class: 'ct-big-num', text: '00:00' });
    const lapList = el('div', { style: { width: '100%', maxWidth: '320px' } });

    const paint = () => { display.textContent = fmtDuration(elapsed + (running ? performance.now() - start : 0)); };
    const loop = () => {
      paint();
      if (running) raf = requestAnimationFrame(loop);
    };
    const startBtn = el('button', {
      class: 'btn primary', html: `${icon('play')}<span>Start</span>`,
      onclick: () => {
        if (!running) { running = true; start = performance.now() - elapsed; startBtn.innerHTML = `${icon('pause')}<span>Pause</span>`; loop(); }
        else { running = false; elapsed = performance.now() - start; cancelAnimationFrame(raf); startBtn.innerHTML = `${icon('play')}<span>Resume</span>`; }
      },
    });
    const lapBtn = el('button', {
      class: 'btn', html: `${icon('plus')}<span>Lap</span>`,
      onclick: () => {
        const val = elapsed + (running ? performance.now() - start : 0);
        laps.unshift(val);
        lapList.innerHTML = '';
        laps.slice(0, 8).forEach((l, i) => lapList.append(el('div', {
          class: 'score-row', style: { padding: '6px 10px' },
        }, el('span', { class: 's-name', text: `Lap ${laps.length - i}` }), el('b', { class: 's-val', style: { fontSize: '14px' }, text: fmtDuration(l) }))));
      },
    });
    const resetBtn = el('button', {
      class: 'btn', html: `${icon('refresh')}<span>Reset</span>`,
      onclick: () => { running = false; elapsed = 0; laps = []; lapList.innerHTML = ''; cancelAnimationFrame(raf); startBtn.innerHTML = `${icon('play')}<span>Start</span>`; paint(); },
    });

    return el('div', { class: 'ct-center' },
      el('div', { style: { fontSize: '11px', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-3)' }, text: 'Stopwatch' }),
      display,
      el('div', { style: { display: 'flex', gap: '8px' } }, startBtn, lapBtn, resetBtn),
      lapList
    );
  }

  /* ================= Scoreboard ================= */
  function renderScore() {
    const wrap = el('div', { style: { maxWidth: '520px', margin: '0 auto' } });
    function paint() {
      wrap.innerHTML = '';
      teams.forEach((t) => {
        wrap.append(el('div', { class: 'score-row' },
          el('span', { class: 's-name', text: t.name }),
          el('button', { class: 's-btn', html: icon('minus'), onclick: () => { t.score -= 1; saveTeams(); paint(); } }),
          el('b', { class: 's-val', text: String(t.score) }),
          el('button', { class: 's-btn', html: icon('plus'), onclick: () => { t.score += 1; saveTeams(); paint(); } }),
          el('button', {
            class: 's-btn', html: icon('x'), title: 'Remove team',
            onclick: () => { teams = teams.filter((x) => x.id !== t.id); saveTeams(); paint(); },
          })
        ));
      });
      const input = el('input', { class: 'field', placeholder: 'New team name', style: { flex: '1' } });
      const add = () => {
        const v = input.value.trim();
        if (!v) return;
        teams.push({ id: uid('t'), name: v, score: 0 });
        saveTeams(); paint();
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
      wrap.append(
        el('div', { style: { display: 'flex', gap: '6px', marginTop: '12px' } }, input, el('button', { class: 'btn', text: 'Add team', onclick: add })),
        el('div', { style: { display: 'flex', justifyContent: 'flex-end', marginTop: '10px' } },
          el('button', {
            class: 'mini-btn', text: 'Reset scores',
            onclick: () => { teams.forEach((t) => { t.score = 0; }); saveTeams(); paint(); },
          })
        )
      );
    }
    paint();
    return el('div', {},
      el('div', { style: { fontSize: '11px', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-3)', textAlign: 'center', marginBottom: '12px' }, text: 'Team scoreboard' }),
      wrap
    );
  }

  /* ================= Dice ================= */

  renderPanel();

  return { onResize: () => { if (active === 'wheel') renderPanel(); } };
}

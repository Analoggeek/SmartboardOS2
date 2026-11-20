/* Settings — appearance, classroom profile, data, install */
import { el, toast } from '../utils.js';
import { icon } from '../icons.js';
import { getSettings, saveSettings, store, idb } from '../db.js';
import { getPenSettings, savePenSettings } from '../pen.js';
import { capturePhoto } from '../camera.js';

const ACCENTS = [
  { id: 'indigo', color: '#6366f1' },
  { id: 'emerald', color: '#10b981' },
  { id: 'amber', color: '#f59e0b' },
  { id: 'rose', color: '#f43f5e' },
  { id: 'cyan', color: '#0ea5e9' },
];
const WALLS = [
  { id: 'aurora', name: 'Aurora', colors: ['rgba(99,102,241,.24)', 'rgba(168,85,247,.22)', 'rgba(34,211,238,.20)'] },
  { id: 'sunset', name: 'Sunset', colors: ['rgba(249,115,22,.26)', 'rgba(244,63,94,.22)', 'rgba(168,85,247,.22)'] },
  { id: 'forest', name: 'Forest', colors: ['rgba(16,185,129,.24)', 'rgba(59,130,246,.18)', 'rgba(132,204,22,.18)'] },
  { id: 'midnight', name: 'Midnight', colors: ['rgba(30,64,175,.30)', 'rgba(15,23,42,.35)', 'rgba(2,132,199,.24)'] },
];

export function mount({ root }) {
  let s = getSettings();
  const host = el('div', { class: 'settings' });
  root.append(el('div', { class: 'app' }, host));

  function paint() {
    host.innerHTML = '';

    /* appearance */
    const group1 = el('div', { class: 'set-group' }, el('h4', { text: 'Appearance' }));
    group1.append(row('Theme', 'Dark keeps the board easy on the eyes in class', seg([
      { id: 'dark', label: 'Dark' }, { id: 'light', label: 'Light' },
    ], s.theme, (v) => { s = saveSettings({ theme: v }); window.__sbos.applyTheme(); paint(); })));

    const swatches = el('div', { class: 'swatches' });
    ACCENTS.forEach((a) => {
      swatches.append(el('button', {
        class: `swatch ${s.accent === a.id ? 'on' : ''}`,
        style: { background: a.color },
        title: a.id,
        onclick: () => { s = saveSettings({ accent: a.id }); window.__sbos.applyTheme(); paint(); },
      }));
    });
    group1.append(row('Accent colour', 'Used across the system UI', swatches));

    const wallRow = el('div', { style: { display: 'flex', gap: '8px' } });
    WALLS.forEach((w) => {
      wallRow.append(el('button', {
        class: `swatch ${s.wallpaper === w.id ? 'on' : ''}`,
        title: w.name,
        style: {
          width: '34px', height: '26px', borderRadius: '8px',
          background: `radial-gradient(circle at 20% 20%, ${w.colors[0]}, transparent 70%), radial-gradient(circle at 80% 30%, ${w.colors[1]}, transparent 70%), radial-gradient(circle at 50% 90%, ${w.colors[2]}, transparent 70%), #0b1020`,
        },
        onclick: () => { s = saveSettings({ wallpaper: w.id }); window.__sbos.applyWallpaper(); paint(); },
      }));
    });
    group1.append(row('Desktop wallpaper', 'Background glow behind your workspace', wallRow));

    group1.append(row('Animations', 'Turn off for a calmer, faster experience', toggle(s.motion, (v) => {
      s = saveSettings({ motion: v });
      window.__sbos.applyMotion(); paint();
    })));

    /* classroom */
    const group2 = el('div', { class: 'set-group' }, el('h4', { text: 'Classroom' }));
    const nameInput = el('input', {
      class: 'field', value: s.teacherName, style: { width: '170px' },
      oninput: (e) => { s = saveSettings({ teacherName: e.target.value }); window.__sbos.applyGreeting(); },
    });
    group2.append(row('Your name', 'Shown on the home screen and greeting', nameInput));
    group2.append(row('24-hour clock', 'Use 13:00 instead of 1:00 PM', toggle(s.use24h, (v) => {
      s = saveSettings({ use24h: v }); window.__sbos.applyClock(); paint();
    })));

    /* pen, tablet & palm (v1.2) */
    const ps = getPenSettings();
    const groupPen = el('div', { class: 'set-group' }, el('h4', { text: 'Pen, tablet & palm · Pen aur palm' }));
    groupPen.append(row('Palm rejection · Palm guard', 'Works even on laptops that have no palm rejection of their own', seg([
      { id: 'auto', label: 'Auto' }, { id: 'strong', label: 'Strong' }, { id: 'off', label: 'Off' },
    ], ps.palm, (v) => { savePenSettings({ palm: v }); toast(v === 'off' ? 'Palm guard off' : `Palm guard: ${v}`, 'ok', 1600); })));
    groupPen.append(row('Pressure · Dabaav', 'Harder press = thicker line (any pressure-aware pen)', toggle(ps.pressure, (v) => savePenSettings({ pressure: v }))));
    groupPen.append(row('Tilt · Jhukav', 'Tilt the stylus for a wider highlighter', toggle(ps.tilt, (v) => savePenSettings({ tilt: v }))));
    groupPen.append(row('Finger drawing · Ungli se', 'Turn off for pen-only writing on touch laptops', toggle(ps.touchDraw, (v) => savePenSettings({ touchDraw: v }))));
    groupPen.append(row('Palm rest delay', 'Ignore touches for a moment after the pen lifts', ranged(ps.palmDelay, 0, 2000, 100, (v) => savePenSettings({ palmDelay: v }), (v) => `${v} ms`)));
    groupPen.append(row('Stroke smoothing', 'Higher = smoother, slightly slower lines', ranged(Math.round(ps.smoothing * 100), 0, 80, 5, (v) => savePenSettings({ smoothing: v / 100 }), (v) => `${v}%`)));
    groupPen.append(row('Camera · Camera', 'Permission is asked only when you press this', el('button', {
      class: 'btn', html: `${icon('camera')}<span>Test camera</span>`, onclick: testCamera,
    })));

    /* app */
    const group3 = el('div', { class: 'set-group' }, el('h4', { text: 'App' }));
    if (window.__sbos.desktop) {
      const status = el('p', { class: 'update-status', role: 'status' });
      const bridge = window.smartboardUpdates;
      const button = el('button', { class: 'btn', html: `${icon('download')}<span>Check for updates</span>`, onclick: async () => {
        button.disabled = true;
        status.textContent = 'Checking and downloading the full installer if an update is available…';
        try {
          const result = await bridge.prepare();
          if (result.status === 'ready') {
            status.textContent = `Version ${result.version} downloaded. Saving your work…`;
            await window.__sbos.saveWork();
            const launch = await bridge.install();
            status.textContent = ({ opened: 'Update installer opened.', later: 'Installer ready. Check again when you want to install.' })[launch.status]
              || 'Could not open the installer.';
          } else {
            status.textContent = ({ current: 'You have the latest version.', busy: 'An update check is already running.',
              unavailable: 'No published installer found. Update checks only work in the installed desktop app.' })[result.status]
              || 'Could not download a verified update. Check your internet connection and try again.';
          }
        } catch { status.textContent = 'Could not complete the update. Your current app is still installed.'; }
        finally { button.disabled = false; }
      } });
      button.disabled = !bridge;
      group3.append(row('Desktop updates', 'Connect to the internet to download the latest full offline installer.', button), status);
      group3.append(row('Lesson folder', 'Daily board and note checkpoints, PDF ink and recordings in Documents → SmartBoardOS.',
        el('button', { class: 'btn', text: 'Open folder', onclick: async () => {
          try { if (await window.smartboardLibrary.open()) throw new Error(); }
          catch { toast('Could not open the lesson folder', 'warn'); }
        } })));
    } else {
      group3.append(row('Full desktop installer', 'Windows and Mac, including screen recording and local folders.',
        el('a', { class: 'btn', href: './install.html', text: 'Get offline installer' })));
      const installBtn = el('button', { class: 'btn', html: `${icon('download')}<span>Install</span>`, onclick: () => window.__sbos.install() });
      group3.append(row('Install web app', 'After its first online load, the web app also works offline.', installBtn));
    }

    /* data */
    const group4 = el('div', { class: 'set-group' }, el('h4', { text: 'Data' }));
    group4.append(row('Export everything', 'Download your board, notes and settings as JSON', el('button', {
      class: 'btn', html: `${icon('download')}<span>Export</span>`, onclick: exportAll,
    })));
    group4.append(row('Reset this device', 'Clears board, notes, images and PDFs stored locally', el('button', {
      class: 'btn danger', html: `${icon('trash')}<span>Reset</span>`, onclick: resetAll,
    })));

    /* about */
    const about = el('div', { class: 'set-group' },
      el('h4', { text: 'About' }),
      el('div', {
        style: {
          padding: '16px', borderRadius: '14px', background: 'var(--surface-2)',
          border: '1px solid var(--border)', display: 'flex', gap: '14px', alignItems: 'center',
        },
      },
        el('img', { src: './assets/icons/icon-192.png', width: '48', height: '48', style: { borderRadius: '12px' } }),
        el('div', {},
          el('div', { style: { fontWeight: '800', fontSize: '15px' }, html: 'SmartBoard<span style="background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent">OS</span>' }),
          el('div', { style: { fontSize: '11.5px', color: 'var(--text-3)', marginTop: '2px' }, text: `Version ${window.__sbos.version} · open source · runs offline` })
        )
      )
    );

    host.append(group1, group2, groupPen, group3, group4, about);
    host.append(el('div', { style: { fontSize: '11px', color: 'var(--text-3)', textAlign: 'center', padding: '4px 0 20px' }, text: 'Developed by Analoggeek · Made for teachers'  }));
  }

  function row(label, desc, control) {
    return el('div', { class: 'set-row' },
      el('div', {}, el('div', { class: 'set-label', text: label }), el('div', { class: 'set-desc', text: desc })),
      control
    );
  }
  function seg(options, value, onChange) {
    const box = el('div', { class: 'seg' });
    options.forEach((o) => box.append(el('button', {
      class: o.id === value ? 'on' : '', text: o.label,
      onclick: () => onChange(o.id),
    })));
    return box;
  }
  function ranged(value, min, max, step, onChange, fmt) {
    const out = el('span', { class: 'range-val', text: fmt(value) });
    const input = el('input', {
      type: 'range', min: String(min), max: String(max), step: String(step), value: String(value),
      style: { width: '120px' },
      oninput: (e) => { out.textContent = fmt(Number(e.target.value)); },
      onchange: (e) => onChange(Number(e.target.value)),
    });
    return el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, input, out);
  }

  async function testCamera() {
    const shot = await capturePhoto({ title: 'Camera test' });
    if (!shot) return;
    const backdrop = el('div', { class: 'modal-backdrop' });
    const close = () => backdrop.remove();
    backdrop.append(el('div', { class: 'modal' },
      el('h3', { text: 'Camera works' }),
      el('p', { text: 'This photo stays on your device. Send it to the board or discard it.' }),
      el('img', { src: shot, style: { width: '100%', borderRadius: '12px', display: 'block' } }),
      el('div', { class: 'modal-foot', style: { marginTop: '12px' } },
        el('button', { class: 'btn', text: 'Discard', onclick: close }),
        el('button', { class: 'btn primary', text: 'Send to board', onclick: () => { close(); window.__sbos.open('whiteboard', { image: shot, title: 'Camera photo' }); } })
      )
    ));
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
    document.body.append(backdrop);
  }

  function toggle(value, onChange) {
    const t = el('button', { class: `toggle ${value ? 'on' : ''}` });
    t.addEventListener('click', () => { const v = !t.classList.contains('on'); t.classList.toggle('on', v); onChange(v); });
    return t;
  }

  async function exportAll() {
    const data = {
      exportedAt: new Date().toISOString(),
      settings: getSettings(),
      notes: store.get('notes', []),
      students: store.get('students', []),
      teams: store.get('teams', []),
      board: await idb.get('boards', 'current'),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: `smartboard-backup-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    toast('Backup downloaded', 'ok');
  }

  async function resetAll() {
    if (!confirm('Delete all SmartBoardOS data on this device? This cannot be undone.')) return;
    store.clearAll();
    await idb.clear('boards');
    await idb.clear('media');
    await idb.clear('docs');
    await idb.clear('kv');
    toast('All data cleared — reloading', 'ok');
    setTimeout(() => location.reload(), 900);
  }

  paint();
  return {};
}

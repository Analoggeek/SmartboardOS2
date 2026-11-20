const token = new URLSearchParams(location.search).get('board');
const status = document.getElementById('student-status');
const screen = document.getElementById('student-board');
const main = document.querySelector('main');
const fullscreen = document.getElementById('student-fullscreen');
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else main.requestFullscreen?.().catch(() => {});
}
fullscreen.onclick = toggleFullscreen;
document.addEventListener('keydown', (e) => { if (!e.repeat && e.key.toLowerCase() === 'f') toggleFullscreen(); });
document.addEventListener('fullscreenchange', () => { fullscreen.textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen'; });
if (/^[a-f0-9]{32}$/.test(token || '') && typeof BroadcastChannel === 'function') {
  const channel = new BroadcastChannel(`sbos-display-${token}`);
  let src, last = Date.now(), finished = false;
  function clear(message) {
    if (src) URL.revokeObjectURL(src);
    src = undefined; screen.removeAttribute('src'); screen.hidden = true;
    status.hidden = false; status.textContent = message;
  }
  channel.onmessage = ({ data }) => {
    if (data === 'end') { finished = true; clearInterval(beat); clear('Teacher stopped sharing.'); channel.close(); return; }
    if (data === 'alive') { last = Date.now(); return; }
    if (!(data instanceof Blob) || data.type !== 'image/webp' && data.type !== 'image/png' || data.size > 9 * 1024 * 1024) return;
    const old = src;
    src = URL.createObjectURL(data); screen.src = src; screen.hidden = false; status.hidden = true; last = Date.now();
    if (old) URL.revokeObjectURL(old);
  };
  const hello = () => channel.postMessage('ready');
  hello();
  const beat = setInterval(() => { if (!finished && Date.now() - last > 6500) { clear('Waiting for the teacher’s board…'); hello(); } }, 3000);
  window.addEventListener('pagehide', () => { clearInterval(beat); if (!finished) channel.postMessage('bye'); channel.close(); if (src) URL.revokeObjectURL(src); }, { once: true });
} else status.textContent = 'Open this display from Whiteboard → Student display.';

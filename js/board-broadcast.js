// Only send pixels from the board canvas; never send DOM, notes, camera or storage.
export function boardBroadcast(canvas, notify) {
  let channel, timer, hello, beat, connected = false, encoding = false, again = false, session = 0;
  const buffer = document.createElement('canvas');
  const context = buffer.getContext('2d', { alpha: false });
  function update() {
    if (!channel || !connected || timer) return;
    timer = setTimeout(() => {
      timer = 0;
      if (!connected || !canvas.width || !canvas.height) return;
      if (encoding) { again = true; return; }
      const scale = Math.min(1, 1600 / canvas.width, 1050 / canvas.height);
      const w = Math.max(1,Math.round(canvas.width * scale)), h = Math.max(1,Math.round(canvas.height * scale));
      if (w !== buffer.width || h !== buffer.height) { buffer.width = w; buffer.height = h; }
      context.drawImage(canvas, 0, 0, w, h);
      const current = session;
      encoding = true;
      buffer.toBlob(blob => {
        encoding = false;
        if (blob && current === session) channel?.postMessage(blob);
        if (again) { again = false; update(); }
      }, 'image/webp', .92);
    }, 90);
  }
  function stop() {
    session++;
    clearTimeout(timer); timer = 0; clearTimeout(hello); clearInterval(beat); connected = false;
    channel?.postMessage('end'); channel?.close(); channel = undefined;
    notify('off');
  }
  function toggle() {
    if (channel) { stop(); return; }
    if (typeof BroadcastChannel !== 'function') { notify('unavailable'); return; }
    const token = [...crypto.getRandomValues(new Uint8Array(16))].map(x => x.toString(16).padStart(2, '0')).join('');
    channel = new BroadcastChannel(`sbos-display-${token}`);
    channel.onmessage = ({ data }) => {
      if (data === 'ready') {
        channel?.postMessage('alive');
        if (!connected) { connected = true; clearTimeout(hello); notify('on'); }
        update();
      } else if (data === 'bye') stop();
    };
    beat = setInterval(() => { if (connected) channel?.postMessage('alive'); }, 3000);
    hello = setTimeout(() => { stop(); notify('blocked'); }, 7000);
    window.open(`./student.html?board=${token}`, '_blank', 'noopener,popup,width=1024,height=680');
    notify('starting');
  }
  return { update, toggle, stop };
}

import { el } from '../utils.js';

const stopTracks = (stream) => stream?.getTracks().forEach(track => track.stop());
const resolutions = [[1280, 720], [1920, 1080], [2560, 1440], [3840, 2160]];

export function mount({ root }) {
  const host = el('div', { class: 'settings studio' }, el('h2', { text: 'Recording Studio' }));
  root.append(el('div', { class: 'app' }, host));
  const library = window.smartboardLibrary;
  if (!library) {
    host.append(el('p', { text: 'Use the offline installer for full features. Camera video, screen and microphone recording stay on your computer.' }),
      el('a', { class: 'btn primary', href: './install.html', text: 'Get the offline installer' }));
    return {};
  }

  const row = (label, control) => el('label', { class: 'set-row' }, label, control);
  const select = (options) => el('select', { class: 'field' }, options.map(([value, text]) => el('option', { value, text })));
  const mode = select([['screen', 'SmartBoardOS window'], ['camera', 'Camera video'], ['audio', 'Microphone only']]);
  const size = select(resolutions.map(([w, h], i) => [i, `${w} × ${h}${h === 2160 ? ' · 4K' : ''}`]));
  size.value = '1';
  const mic = el('input', { type: 'checkbox' });
  const inset = el('input', { type: 'checkbox' });
  const followCamera = el('input', { type: 'checkbox' });
  const key = el('input', { type: 'checkbox' });
  const keyColor = el('input', { type: 'color', value: '#00a040' });
  const tolerance = el('input', { type: 'range', min: 20, max: 170, value: 85 });
  const device = select([['', 'System default camera']]);
  const status = el('p', { role: 'status', text: 'Nothing is captured until you start preview or recording.' });
  const video = el('video', { muted: true, autoplay: true, playsinline: true });
  video.muted = true;
  const canvas = el('canvas', { width: 640, height: 360 });
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const preview = el('div', { class: 'studio-preview', hidden: true }, video, canvas);
  const overlay = el('div', { class: 'studio-camera-overlay', hidden: true, 'aria-hidden': 'true' }, preview);
  const placeOverlays = () => {
    const layer = document.fullscreenElement || document.body;
    layer.append(overlay);
    if (indicator) layer.append(indicator);
  };
  let known = new Set();
  let camera;
  let animation;
  let recorder;
  let closed = false;
  let pending = false;
  let stopped;
  let generation = 0;
  let active = false;
  let indicator;
  let queueDepth = 0;
  placeOverlays();
  document.addEventListener('fullscreenchange', placeOverlays);
  const lockInputs = locked => [mode, size, mic, inset, followCamera, key, device].forEach(input => { input.disabled = locked; });

  async function refreshDevices(auto = false) {
    const cameras = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput' && d.deviceId);
    const previous = device.value;
    const added = cameras.find(d => !known.has(d.deviceId));
    known = new Set(cameras.map(d => d.deviceId));
    device.replaceChildren(el('option', { value: '', text: 'System default camera' }),
      ...cameras.map((d, i) => el('option', { value: d.deviceId, text: d.label || `Camera ${i + 1}` })));
    device.value = known.has(previous) ? previous : '';
    if (!closed && auto && followCamera.checked && added && !active && !pending) {
      device.value = added.deviceId;
      await startCamera();
    }
  }

  function paint() {
    animation = requestAnimationFrame(paint);
    const keyed = key.checked;
    video.hidden = keyed;
    canvas.hidden = !keyed;
    if (!keyed || video.readyState < 2) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const rgb = keyColor.value.slice(1).match(/../g).map(n => parseInt(n, 16));
    const limit = Number(tolerance.value);
    for (let i = 0; i < image.data.length; i += 4) {
      const distance = Math.hypot(image.data[i] - rgb[0], image.data[i + 1] - rgb[1], image.data[i + 2] - rgb[2]);
      image.data[i + 3] = Math.round(Math.max(0, Math.min(1, (distance - limit + 18) / 36)) * 255);
    }
    ctx.putImageData(image, 0, 0);
  }

  function stopPreview() {
    generation++;
    cancelAnimationFrame(animation);
    stopTracks(camera); camera = null; video.srcObject = null;
    preview.hidden = overlay.hidden = true;
  }

  async function startCamera() {
    stopPreview();
    const request = generation;
    try {
      const [width, height] = resolutions[size.value];
      const stream = await navigator.mediaDevices.getUserMedia({ video: {
        width: { ideal: width, max: width }, height: { ideal: height, max: height }, frameRate: { ideal: 30, max: 30 },
        ...(device.value ? { deviceId: { exact: device.value } } : {}),
      }, audio: false });
      if (closed || request !== generation) { stopTracks(stream); return false; }
      camera = stream;
      video.srcObject = camera;
      overlay.hidden = preview.hidden = false;
      const config = stream.getVideoTracks()[0].getSettings();
      canvas.height = Math.max(1, Math.round(canvas.width * (config.height || 360) / (config.width || 640)));
      paint();
      await refreshDevices();
      status.textContent = `Camera ready · ${config.width || '?'} × ${config.height || '?'}`;
      return true;
    } catch { status.textContent = 'Could not start the camera. Check device connection and camera permissions.'; return false; }
  }

  const begin = el('button', { class: 'btn primary', text: 'Start recording', onclick: start });
  const stop = el('button', { class: 'btn danger', text: 'Stop recording', onclick: () => recorder?.state === 'recording' && recorder.stop() });
  stop.disabled = true;
  const previewButton = el('button', { class: 'btn', text: 'Start / switch camera preview', onclick: startCamera });
  const stopButton = el('button', { class: 'btn', text: 'Turn off camera', onclick: stopPreview });
  const folder = el('button', { class: 'btn', text: 'Open lesson folder', onclick: async () => {
    try { if (await library.open()) throw new Error(); } catch { status.textContent = 'Could not open Documents/SmartBoardOS.'; }
  } });

  async function start() {
    if (pending || active || closed) return;
    pending = true; lockInputs(true); begin.disabled = previewButton.disabled = stopButton.disabled = true;
    const kind = mode.value;
    const [width, height] = resolutions[size.value];
    const streams = [];
    let id;
    let output;
    status.textContent = 'Preparing recording…';
    try {
      if (!window.MediaRecorder) throw new Error('Recording is not supported on this device.');
      if (kind === 'screen') {
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: { width: { ideal: width, max: width }, height: { ideal: height, max: height }, frameRate: { ideal: 30, max: 30 } }, audio: false });
        streams.push(screen);
        output = new MediaStream(screen.getVideoTracks());
        if (inset.checked && !camera && !await startCamera()) throw new Error('Camera inset is enabled, but no camera is available.');
        if (!inset.checked) stopPreview();
      } else if (kind === 'camera') {
        if (!await startCamera()) throw new Error('No camera available.');
        const source = key.checked ? canvas.captureStream(24) : camera;
        if (source !== camera) streams.push(source);
        output = new MediaStream(source.getVideoTracks());
      } else { stopPreview(); output = new MediaStream(); }
      if (kind === 'audio' || mic.checked) {
        const audio = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        streams.push(audio);
        audio.getAudioTracks().forEach(track => output.addTrack(track));
      }
      if (closed) throw new Error('Recording Studio was closed.');
      const mimeType = (kind === 'audio' ? ['audio/webm;codecs=opus', 'audio/webm'] : ['video/webm;codecs=vp8,opus', 'video/webm']).find(x => MediaRecorder.isTypeSupported(x));
      if (!mimeType) throw new Error('No supported WebM encoder.');
      recorder = new MediaRecorder(output, { mimeType, ...(kind === 'audio' ? {} : { videoBitsPerSecond: height === 2160 ? 16000000 : height === 1440 ? 10000000 : 6000000 }) });
      id = await library.start(kind);
      if (closed) throw new Error('Recording Studio was closed.');
      let writes = Promise.resolve();
      let error;
      recorder.ondataavailable = ({ data }) => {
        if (!data.size || error) return;
        if (queueDepth >= 8) { error = new Error('Disk is too slow for this resolution'); if (recorder.state === 'recording') recorder.stop(); return; }
        queueDepth++;
        writes = writes.then(async () => {
          if (!error) await library.append(id, new Uint8Array(await data.arrayBuffer()));
        }).catch(e => { error = e; if (recorder.state === 'recording') recorder.stop(); }).finally(() => queueDepth--);
      };
      recorder.onerror = () => { error = new Error('Camera or encoder stopped'); };
      stopped = new Promise(resolve => {
        recorder.onstop = async () => {
          streams.forEach(stopTracks); stopPreview(); indicator?.remove();
          try {
            await writes;
            const name = await library.finish(id);
            status.textContent = error ? `Recording stopped early. ${name ? `Recovered file: ${name}` : 'No file was saved.'}` : name ? `Saved · ${name}` : 'Nothing was recorded.';
          } catch { status.textContent = 'Could not finish saving. Check free disk space and the Recordings folder.'; }
          active = false; lockInputs(false); stop.disabled = true; begin.disabled = previewButton.disabled = stopButton.disabled = false; resolve();
        };
      });
      output.getTracks().forEach(track => track.addEventListener('ended', () => recorder?.state === 'recording' && recorder.stop(), { once: true }));
      recorder.start(1000);
      active = true; stop.disabled = false;
      indicator = el('button', { class: 'recording-indicator', text: '● Recording · Stop', onclick: () => recorder.state === 'recording' && recorder.stop() });
      placeOverlays();
      const actual = output.getVideoTracks()[0]?.getSettings();
      status.textContent = `Recording${actual?.width ? ` · ${actual.width} × ${actual.height}` : ''}…`;
    } catch (e) {
      streams.forEach(stopTracks); stopPreview();
      if (id) await library.finish(id).catch(() => {});
      status.textContent = `Could not start recording. ${e.message}`;
      lockInputs(false);
      begin.disabled = previewButton.disabled = stopButton.disabled = false;
    } finally { pending = false; }
  }

  const onDevice = () => refreshDevices(true).catch(() => {});
  navigator.mediaDevices?.addEventListener('devicechange', onDevice);
  refreshDevices().catch(() => {});
  host.append(el('p', { text: 'Record this app, a camera, or just your microphone. Resolution depends on the source and hardware. Video uses WebM; no upload.' }),
    row('Capture source', mode), row('Maximum resolution (up to 4K)', size), row('Include microphone', mic), row('Include camera inset in window recording', inset),
    row('Camera device', device), row('Auto-preview newly connected cameras while Studio is open', followCamera),
    row('Chroma key · requires a solid backdrop', key), row('Backdrop colour', keyColor), row('Key tolerance', tolerance),
    el('p', { text: 'A phone must already appear as a webcam on your computer. Keyed camera-only video runs at a lower resolution for responsiveness; use window mode for a keyed inset.' }),
    el('div', { class: 'hero-actions' }, previewButton, stopButton, begin, stop, folder), status);
  return {
    save: () => {
      if (recorder?.state === 'recording') recorder.stop();
      return active ? stopped : undefined;
    },
    onClose: () => {
      closed = true;
      if (recorder?.state === 'recording') recorder.stop();
      stopPreview(); overlay.remove();
      document.removeEventListener('fullscreenchange', placeOverlays);
      navigator.mediaDevices?.removeEventListener('devicechange', onDevice);
    },
  };
}

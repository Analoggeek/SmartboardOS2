import { createChromaRenderer } from '../chroma.js';
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
  const frameRate = select([[15, '15 fps · low load'], [24, '24 fps · balanced'], [30, '30 fps · smooth']]);
  frameRate.value = '24';
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
  const preview = el('div', { class: 'studio-preview', hidden: true }, video);
  let chroma;
  let lastFrame = -Infinity;
  let lastMediaTime = -1;
  let keyRGB = [0, 160, 64];
  keyColor.oninput = () => { keyRGB = keyColor.value.slice(1).match(/../g).map(value => parseInt(value,16)); };
  const initChroma = () => {
    if (!chroma) {
      chroma = createChromaRenderer(el('canvas'), el('canvas'));
      preview.append(chroma.canvas);
      chroma.canvas.hidden = true;
    }
    chroma.resize(video.videoWidth, video.videoHeight);
    return chroma;
  };
  const overlay = el('div', { class: 'studio-camera-overlay', hidden: true, 'aria-hidden': 'true' }, preview);
  const placeOverlays = () => {
    const layer = document.fullscreenElement || document.querySelector('.wb-immersive:not(.min):not(.closing)') || document.body;
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
  document.addEventListener('sbos:presentation', placeOverlays);
  const lockInputs = locked => [mode, size, frameRate, mic, inset, followCamera, key, device].forEach(input => { input.disabled = locked; });

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

  // Raw preview uses the video compositor directly: no per-frame JS work.
  const useVideoFrames = 'requestVideoFrameCallback' in video;
  function stopPaint() {
    if (animation == null) return;
    if (useVideoFrames) video.cancelVideoFrameCallback(animation);
    else cancelAnimationFrame(animation);
    animation = null;
  }
  function queuePaint() {
    if (!camera || !key.checked || animation != null) return;
    animation = useVideoFrames ? video.requestVideoFrameCallback(paint) : requestAnimationFrame(paint);
  }
  function paint(now) {
    animation = null;
    if (!camera || !key.checked) return;
    if (video.readyState >= 2) {
      const renderer = initChroma();
      const rate = Math.min(Number(frameRate.value), renderer.software ? 12 : 30);
      if (now - lastFrame >= 1000/rate - 2 && (useVideoFrames || video.currentTime !== lastMediaTime)) {
        lastFrame = now;
        lastMediaTime = video.currentTime;
        try {
          renderer.paint(video, keyRGB, Number(tolerance.value));
          renderer.canvas.hidden = false;
          video.classList.add('studio-video-source');
        } catch { video.classList.remove('studio-video-source'); renderer.canvas.hidden = true; }
      }
    }
    queuePaint();
  }
  key.onchange = () => {
    if (key.checked) { lastFrame = -Infinity; lastMediaTime = -1; queuePaint(); }
    else { stopPaint(); video.classList.remove('studio-video-source'); if (chroma) chroma.canvas.hidden = true; }
  };

  function stopPreview() {
    generation++;
    stopPaint(); lastFrame = -Infinity; lastMediaTime = -1;
    video.classList.remove('studio-video-source'); if (chroma) chroma.canvas.hidden = true;
    stopTracks(camera); camera = null; video.srcObject = null;
    preview.hidden = overlay.hidden = true;
  }

  async function startCamera(full = false) {
    stopPreview();
    const request = generation;
    try {
      const [width, height] = resolutions[full && !key.checked ? size.value : 0];
      const fps = Math.min(Number(frameRate.value), full ? 30 : 24);
      const stream = await navigator.mediaDevices.getUserMedia({ video: {
        width: { ideal: width, max: width }, height: { ideal: height, max: height }, frameRate: { ideal: fps, max: fps },
        ...(device.value ? { deviceId: { exact: device.value } } : {}),
      }, audio: false });
      if (closed || request !== generation) { stopTracks(stream); return false; }
      camera = stream;
      camera.getVideoTracks()[0].addEventListener('ended', () => {
        if (camera === stream && !active) { stopPreview(); status.textContent = 'Camera disconnected.'; }
      }, { once: true });
      video.srcObject = camera;
      overlay.hidden = preview.hidden = false;
      const config = stream.getVideoTracks()[0].getSettings();
      if (key.checked) { initChroma(); queuePaint(); }
      await refreshDevices();
      status.textContent = `Camera ready · ${config.width || '?'} × ${config.height || '?'}`;
      return true;
    } catch { status.textContent = 'Could not start the camera. Check device connection and camera permissions.'; return false; }
  }

  const begin = el('button', { class: 'btn primary', text: 'Start recording', onclick: start });
  const stop = el('button', { class: 'btn danger', text: 'Stop recording', onclick: () => recorder?.state === 'recording' && recorder.stop() });
  stop.disabled = true;
  const previewButton = el('button', { class: 'btn', text: 'Start / switch camera preview', onclick: () => startCamera() });
  const stopButton = el('button', { class: 'btn', text: 'Turn off camera', onclick: () => { followCamera.checked = false; stopPreview(); } });
  followCamera.onchange = async () => {
    if (followCamera.checked && !camera && !await startCamera()) followCamera.checked = false;
  };
  const folder = el('button', { class: 'btn', text: 'Open lesson folder', onclick: async () => {
    try { if (await library.open()) throw new Error(); } catch { status.textContent = 'Could not open Documents/SmartBoardOS.'; }
  } });

  async function start() {
    if (pending || active || closed) return;
    pending = true; lockInputs(true); begin.disabled = previewButton.disabled = stopButton.disabled = true;
    const kind = mode.value;
    const [width, height] = resolutions[size.value];
    const fps = Number(frameRate.value);
    const streams = [];
    let id;
    let output;
    status.textContent = 'Preparing recording…';
    try {
      if (!window.MediaRecorder) throw new Error('Recording is not supported on this device.');
      if (kind === 'screen') {
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: { width: { ideal: width, max: width }, height: { ideal: height, max: height }, frameRate: { ideal: fps, max: fps } }, audio: false });
        streams.push(screen);
        output = new MediaStream(screen.getVideoTracks());
        if (inset.checked && !camera && !await startCamera()) throw new Error('Camera inset is enabled, but no camera is available.');
        if (!inset.checked) stopPreview();
      } else if (kind === 'camera') {
        if (!await startCamera(true)) throw new Error('No camera available.');
        if (key.checked) await video.play();
        const source = key.checked ? initChroma().canvas.captureStream(Math.min(fps, chroma.software ? 12 : 30)) : camera;
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
      recorder = new MediaRecorder(output, { mimeType, ...(kind === 'audio' ? {} : { videoBitsPerSecond: Math.min(18000000, Math.max(1800000, Math.round((output.getVideoTracks()[0]?.getSettings().width || width) * (output.getVideoTracks()[0]?.getSettings().height || height) * fps * .13))) }) });
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
    row('Capture source', mode), row('Maximum recording resolution', size), row('Frame rate', frameRate), row('Include microphone', mic), row('Include camera inset in window recording', inset),
    row('Camera device', device), row('Enable auto-preview of new cameras (starts a camera preview now)', followCamera),
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
      stopPreview(); chroma?.dispose(); overlay.remove();
      document.removeEventListener('fullscreenchange', placeOverlays);
      document.removeEventListener('sbos:presentation', placeOverlays);
      navigator.mediaDevices?.removeEventListener('devicechange', onDevice);
    },
  };
}

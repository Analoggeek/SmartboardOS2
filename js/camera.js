/* Camera capture sheet — take a photo straight into the board or media library */
import { el, toast } from './utils.js';
import { icon } from './icons.js';

/**
 * Opens a camera sheet and resolves with a data-URL (or null when cancelled).
 * Requires a secure context (https / localhost) and camera permission.
 */
export function capturePhoto({ title = 'Take a photo' } = {}) {
  return new Promise((resolve) => {
    let stream = null;
    let done = false;
    let facing = 'environment';

    const video = el('video', {
      autoplay: true, playsinline: true, muted: true,
      style: { width: '100%', maxHeight: '56vh', background: '#000', borderRadius: '12px', display: 'block', objectFit: 'cover' },
    });
    const status = el('div', { style: { fontSize: '12px', color: 'var(--text-3)', textAlign: 'center', padding: '10px 0 0' }, text: 'Starting camera…' });
    const canvas = document.createElement('canvas');

    const shoot = el('button', { class: 'btn primary', html: `${icon('image')}<span>Capture</span>`, disabled: true });
    const flip = el('button', { class: 'btn', html: `${icon('refresh')}<span>Flip</span>`, title: 'Switch camera' });
    const close = el('button', { class: 'btn ghost', text: 'Cancel' });

    const backdrop = el('div', { class: 'modal-backdrop camera-backdrop' });
    const modal = el('div', { class: 'modal camera-modal' },
      el('h3', { text: title }),
      el('p', { text: 'Photos stay on this device — nothing is uploaded. On phones use the back camera for worksheets.' }),
      el('div', { style: { position: 'relative' } }, video),
      status,
      el('div', { class: 'modal-foot', style: { marginTop: '14px' } }, close, flip, shoot)
    );
    backdrop.append(modal);
    document.body.append(backdrop);

    const stop = () => {
      try { stream?.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
      stream = null;
    };

    const finish = (value) => {
      if (done) return;
      done = true;
      stop();
      backdrop.remove();
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        status.textContent = 'This browser does not expose a camera API.';
        return;
      }
      if (!window.isSecureContext && location.hostname !== 'localhost') {
        status.textContent = 'Camera needs HTTPS. The deployed GitHub Pages site is HTTPS, so it will work there.';
        return;
      }
      try {
        stop();
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        video.srcObject = stream;
        await video.play().catch(() => {});
        shoot.disabled = false;
        status.textContent = 'Camera ready — frame the page and capture.';
      } catch (err) {
        console.warn(err);
        const map = {
          NotAllowedError: 'Camera permission was denied. Allow it in the browser site settings and try again.',
          NotFoundError: 'No camera found on this device.',
          NotReadableError: 'The camera is busy in another app.',
        };
        status.textContent = map[err?.name] || `Camera error: ${err?.message || err}`;
        shoot.disabled = true;
      }
    }

    shoot.addEventListener('click', () => {
      if (!video.videoWidth) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const url = canvas.toDataURL('image/jpeg', 0.92);
      toast('Photo captured', 'ok');
      finish(url);
    });
    flip.addEventListener('click', () => {
      facing = facing === 'environment' ? 'user' : 'environment';
      start();
    });
    close.addEventListener('click', () => finish(null));
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) finish(null); });
    const onKey = (e) => { if (e.key === 'Escape') finish(null); };
    document.addEventListener('keydown', onKey);

    start();
  });
}

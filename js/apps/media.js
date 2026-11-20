/* Media library — images stored on-device, send any image to the board */
import { el, toast, pickFiles, uid, relTime, downloadURL } from '../utils.js';
import { icon } from '../icons.js';
import { idb } from '../db.js';

export function mount({ root, api }) {
  let items = [];
  const urlCache = new Map();

  const grid = el('div', { class: 'media-grid' });
  const countBadge = el('span', { style: { fontSize: '11.5px', color: 'var(--text-3)', marginLeft: '4px' } });

  const fileInputBtn = el('button', { class: 'tool-btn ghost', html: `${icon('upload')}<span>Upload</span>`, onclick: upload });
  const clipVideo = el('video', { controls: '', playsinline: '', preload: 'metadata' });
  const clipPanel = el('section', { class: 'media-player', hidden: true }, clipVideo);
  let videoSrc, captionSrc;
  function closeClip() {
    clipPanel.hidden = true; clipVideo.pause(); clipVideo.removeAttribute('src');
    clipVideo.replaceChildren(); clipVideo.load();
    if (captionSrc) URL.revokeObjectURL(captionSrc);
    if (videoSrc) URL.revokeObjectURL(videoSrc);
    videoSrc = captionSrc = null;
  }
  clipPanel.append(el('div', { class: 'hero-actions' },
    el('button', { class: 'btn', text: 'Add captions (.vtt)', onclick: async () => {
      const [file] = await pickFiles({ accept: '.vtt' });
      if (!file || !videoSrc) return;
      if (file.size > 2_000_000) return toast('Choose a WebVTT file under 2 MB.', 'warn');
      const text = await file.text();
      if (!videoSrc) return;
      if (!/^\uFEFF?WEBVTT(?:[ \t]|\r?\n|$)/.test(text)) return toast('Choose a valid WebVTT file.', 'warn');
      clipVideo.querySelector('track')?.remove();
      if (captionSrc) URL.revokeObjectURL(captionSrc);
      captionSrc = URL.createObjectURL(new Blob([text], { type: 'text/vtt' }));
      const track = el('track', { kind: 'captions', label: 'Lesson captions', src: captionSrc, default: '' });
      clipVideo.append(track); track.track.mode = 'showing';
    } }), el('button', { class: 'btn', text: 'Close playback', onclick: closeClip })));
  const toolbar = el('div', { class: 'app-toolbar' },
    fileInputBtn,
    el('button', { class: 'tool-btn', text: 'Play recording', onclick: async () => {
      const [clip] = await pickFiles({ accept: 'video/webm,video/mp4,.webm,.mp4' });
      if (!clip || !root.isConnected) return;
      closeClip(); videoSrc = URL.createObjectURL(clip); clipVideo.src = videoSrc; clipPanel.hidden = false;
    } }),
    el('button', { class: 'tool-btn', html: `${icon('board')}<span>Send to board</span>`, onclick: () => { if (items[0]) sendToBoard(items[0]); else toast('Upload an image first', 'warn'); } }),
    countBadge,
    el('div', { style: { flex: '1' } }),
    el('button', { class: 'tool-btn', html: icon('trash'), title: 'Clear library', onclick: clearAll })
  );

  const app = el('div', { class: 'app' }, toolbar, clipPanel, grid);
  root.append(app);

  function urlFor(item) {
    if (!item.blob) return '';
    if (!urlCache.has(item.id)) urlCache.set(item.id, URL.createObjectURL(item.blob));
    return urlCache.get(item.id);
  }

  function render() {
    grid.innerHTML = '';
    countBadge.textContent = `${items.length} file${items.length === 1 ? '' : 's'}`;
    if (!items.length) {
      grid.append(el('div', { class: 'media-empty' },
        el('div', { html: icon('image'), style: { width: '44px', height: '44px', margin: '0 auto 12px', color: 'var(--accent)' } }),
        el('b', { text: 'No images yet' }),
        el('p', { style: { fontSize: '12px', marginTop: '6px' }, text: 'Upload diagrams, worksheets or photos. They are saved on this device and can be sent straight to the whiteboard.' })
      ));
      return;
    }
    items.sort((a, b) => b.ts - a.ts).forEach((item) => {
      const card = el('div', { class: 'media-card', title: item.name },
        el('img', { src: urlFor(item), alt: item.name, loading: 'lazy' }),
        el('div', { class: 'media-tools' },
          el('button', { title: 'Send to whiteboard', html: icon('board'), onclick: (e) => { e.stopPropagation(); sendToBoard(item); } }),
          el('button', { title: 'Download', html: icon('download'), onclick: (e) => { e.stopPropagation(); downloadURL(urlFor(item), item.name); } }),
          el('button', { title: 'Delete', html: icon('trash'), onclick: async (e) => { e.stopPropagation(); await remove(item); } })
        )
      );
      card.addEventListener('dblclick', () => sendToBoard(item));
      grid.append(card);
    });
  }

  async function upload() {
    const files = await pickFiles({ accept: 'image/*', multiple: true });
    if (!files.length) return;
    let added = 0;
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      const item = { id: uid('media'), name: file.name, blob: file, ts: Date.now(), size: file.size };
      await idb.set('media', item.id, item);
      items.push(item);
      added++;
    }
    render();
    if (added) toast(`${added} image${added > 1 ? 's' : ''} saved on device`, 'ok');
  }

  async function remove(item) {
    await idb.del('media', item.id);
    if (urlCache.has(item.id)) { URL.revokeObjectURL(urlCache.get(item.id)); urlCache.delete(item.id); }
    items = items.filter((x) => x.id !== item.id);
    render();
    toast('Image removed', 'info', 1600);
  }

  async function clearAll() {
    if (!items.length) return;
    if (!confirm('Delete all images from this device?')) return;
    await idb.clear('media');
    urlCache.forEach((u) => URL.revokeObjectURL(u));
    urlCache.clear();
    items = [];
    render();
    toast('Library cleared', 'info');
  }

  async function sendToBoard(item) {
    const url = urlFor(item);
    api.open('whiteboard', { image: url.includes('blob:') ? await blobToDataURL(item.blob) : url, title: item.name });
  }

  const blobToDataURL = (blob) => new Promise((res) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.readAsDataURL(blob);
  });

  // drag & drop
  ['dragover', 'dragenter'].forEach((t) => grid.addEventListener(t, (e) => { e.preventDefault(); grid.style.outline = '2px dashed var(--accent)'; grid.style.outlineOffset = '-10px'; }));
  ['dragleave', 'drop'].forEach((t) => grid.addEventListener(t, () => { grid.style.outline = 'none'; }));
  grid.addEventListener('drop', async (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer?.files || []).filter((f) => f.type.startsWith('image/'));
    for (const file of files) {
      const item = { id: uid('media'), name: file.name, blob: file, ts: Date.now(), size: file.size };
      await idb.set('media', item.id, item);
      items.push(item);
    }
    if (files.length) { render(); toast(`${files.length} image(s) added`, 'ok'); }
  });

  (async () => {
    items = await idb.all('media');
    render();
  })();

  return {
    onClose: () => { closeClip(); urlCache.forEach(u => URL.revokeObjectURL(u)); },
    count: () => items.length,
  };
}

/* PDF viewer / presenter — powered by pdf.js (bundled locally) */
import { el, toast, pickFiles, clamp, relTime, debounce } from '../utils.js';
import { icon } from '../icons.js';
import { idb } from '../db.js';
import { ACCEPT, isDocument, toPdf } from '../document-import.js';
import { mount as mountBoard } from './whiteboard.js';

const pdfjsLib = window.pdfjsLib;
if (pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.min.js';
}

export function mount({ root, params, api }) {
  let doc = null;
  let pageNum = 1;
  let scale = 1;
  let fitMode = 'width';
  let rotation = 0;
  let renderTask = null;
  let docName = '';
  let annotationSession;
  let closed = false;

  /* ---------- dom ---------- */
  const pageCanvas = el('canvas', { class: 'pdf-page-canvas' });
  const view = el('div', { class: 'pdf-view' });
  const side = el('div', { class: 'pdf-side', style: { display: 'none' } });
  const status = el('div', { class: 'pdf-status', text: 'No document loaded' });

  const drop = el('div', { class: 'pdf-drop' },
    el('div', { class: 'big-ico', html: icon('pdf') }),
    el('h3', { text: 'Open a document to present' }),
    el('p', { text: 'Choose PDF, PPTX, DOCX, TXT or Markdown. Office quick import extracts text; choose a PDF export for the full layout and images. Nothing is uploaded.' }),
    el('button', { class: 'btn primary', html: `${icon('folder')}<span>Choose file</span>`, onclick: openPicker }),
    el('div', { class: 'recent-list', style: { marginTop: '18px', textAlign: 'left' } })
  );

  view.append(drop, pageCanvas);

  const pageInput = el('input', { class: 'field', type: 'text', value: '1', style: { width: '48px', textAlign: 'center', height: '28px' } });
  const pageTotal = el('span', { style: { fontSize: '12px', color: 'var(--text-3)' }, text: '/ 0' });
  const zoomLabel = el('button', { class: 'tool-btn ghost', text: '100%', title: 'Fit width', onclick: () => { fitMode = 'width'; renderCurrent(); } });

  const annotateBtn = el('button', { class: 'tool-btn ghost', html: `${icon('pen')}<span>Write on PDF</span>`,
    title: 'Write on current PDF page', onclick: openAnnotation });
  const annotateBar = el('div', { class: 'app-toolbar pdf-annotation-bar' },
    el('button', { class: 'tool-btn ghost', html: `${icon('chevron-left')}<span>Back to reading</span>`, onclick: closeAnnotation }),
    el('span', { class: 'pdf-annotation-label', text: '' }));
  const annotateHost = el('div', { class: 'pdf-annotation-host' });
  const annotatePanel = el('div', { class: 'pdf-annotation-panel', hidden: true }, annotateBar, annotateHost);
  const toolbar = el('div', { class: 'app-toolbar pdf-toolbar' },
    annotateBtn,
    el('button', { class: 'tool-btn', html: icon('folder'), title: 'Open document', onclick: openPicker }),
    el('div', { class: 'sep' }),
    el('button', { class: 'tool-btn', html: icon('chevron-left'), title: 'Previous page', onclick: () => go(pageNum - 1) }),
    pageInput, pageTotal,
    el('button', { class: 'tool-btn', html: icon('chevron-right'), title: 'Next page', onclick: () => go(pageNum + 1) }),
    el('div', { class: 'sep' }),
    el('button', { class: 'tool-btn', html: icon('minus'), title: 'Zoom out', onclick: () => { fitMode = 'free'; scale = clamp(scale / 1.25, 0.1, 4); renderCurrent(); } }),
    zoomLabel,
    el('button', { class: 'tool-btn', html: icon('plus'), title: 'Zoom in', onclick: () => { fitMode = 'free'; scale = clamp(scale * 1.25, 0.1, 4); renderCurrent(); } }),
    el('button', { class: 'tool-btn', html: icon('rotate'), title: 'Rotate', onclick: () => { rotation = (rotation + 90) % 360; renderCurrent(); } }),
    el('div', { class: 'sep' }),
    el('button', { class: 'tool-btn ghost', html: `${icon('board')}<span>Send to board</span>`, title: 'Send current page to whiteboard', onclick: sendToBoard }),
    el('button', { class: 'tool-btn', html: icon('print'), title: 'Print', onclick: () => window.print() })
  );

  const main = el('div', { class: 'pdf-main' }, view, status);
  const wrap = el('div', { class: 'pdf-wrap' }, side, main);
  const app = el('div', { class: 'app' }, toolbar, wrap, annotatePanel);
  root.append(app);

  /* ---------- file handling ---------- */
  function openPicker() {
    pickFiles({ accept: ACCEPT }).then((files) => { if (files[0]) loadFile(files[0]); });
  }

  async function loadFile(file) {
    try {
      status.textContent = `Loading ${file.name}…`;
      const { buffer: buf, imported } = await toPdf(file);
      await loadBuffer(buf.slice(0), file.name);
      if (imported) toast('Quick text import ready. For original layout and images, use PDF.', 'info', 5000);
      // keep a copy for "recents" (max 8 docs, 40 MB guard)
      if (buf.byteLength < 40 * 1024 * 1024) {
        const recents = (await idb.get('docs', 'recents')) || [];
        let bytes = buf.byteLength;
        const trimmed = recents.filter(r => {
          if (r.name === file.name || bytes + r.size > 80 * 1024 * 1024) return false;
          bytes += r.size; return true;
        }).slice(0, 7);
        trimmed.unshift({ name: file.name, size: buf.byteLength, ts: Date.now(), data: buf });
        await idb.set('docs', 'recents', trimmed);
        renderRecents();
      }
    } catch (e) {
      console.error(e);
      toast(e.message || 'Could not read that document', 'err');
      status.textContent = 'Failed to load document';
    }
  }

  async function loadBuffer(buf, name = 'Document.pdf') {
    if (closed) return;
    await closeAnnotation();
    if (!pdfjsLib) { toast('PDF engine not available', 'err'); return; }
    if (doc) { try { doc.destroy(); } catch { /* noop */ } }
    doc = await pdfjsLib.getDocument({ data: buf, isEvalSupported: false }).promise;
    docName = name;
    pageNum = 1;
    api.setTitle(`PDF · ${name}`);
    drop.style.display = 'none';
    view.style.display = 'flex';
    side.style.display = 'flex';
    pageTotal.textContent = `/ ${doc.numPages}`;
    status.textContent = `${name} · ${doc.numPages} pages`;
    buildThumbs();
    await renderCurrent();
    toast(`${name} opened`, 'ok');
  }

  /* ---------- rendering ---------- */
  async function renderCurrent() {
    if (!doc) return;
    pageNum = clamp(pageNum, 1, doc.numPages);
    pageInput.value = String(pageNum);
    try {
      if (renderTask) { try { renderTask.cancel(); } catch { /* noop */ } }
      const page = await doc.getPage(pageNum);
      const base = page.getViewport({ scale: 1, rotation });
      let targetScale = scale;
      if (fitMode === 'width') {
        const padding = getComputedStyle(view);
        const avail = Math.max(1, view.clientWidth - parseFloat(padding.paddingLeft) - parseFloat(padding.paddingRight));
        targetScale = avail / base.width;
      }
      scale = targetScale;
      const vp = page.getViewport({ scale: targetScale, rotation });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      pageCanvas.width = Math.floor(vp.width * dpr);
      pageCanvas.height = Math.floor(vp.height * dpr);
      pageCanvas.style.width = `${Math.floor(vp.width)}px`;
      pageCanvas.style.height = `${Math.floor(vp.height)}px`;
      const ctx = pageCanvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderTask = page.render({ canvasContext: ctx, viewport: vp });
      await renderTask.promise;
      renderTask = null;
      zoomLabel.textContent = `${Math.round(targetScale * 100)}%`;
      view.scrollTop = 0;
      updateThumbActive();
    } catch (e) {
      if (e?.name !== 'RenderingCancelledException') console.warn(e);
    }
  }

  async function buildThumbs() {
    side.innerHTML = '';
    if (!doc) return;
    const total = Math.min(doc.numPages, 160);
    for (let i = 1; i <= total; i++) {
      const holder = el('button', { class: 'pdf-thumb', dataset: { page: String(i) }, onclick: () => go(i) });
      side.append(holder);
      // lazy render
      const render = async () => {
        try {
          const page = await doc.getPage(i);
          const vp0 = page.getViewport({ scale: 1 });
          const s = 108 / vp0.width;
          const vp = page.getViewport({ scale: s });
          const c = el('canvas');
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          c.width = Math.floor(vp.width * dpr);
          c.height = Math.floor(vp.height * dpr);
          const cx = c.getContext('2d');
          cx.setTransform(dpr, 0, 0, dpr, 0, 0);
          await page.render({ canvasContext: cx, viewport: vp }).promise;
          holder.prepend(c);
          holder.append(el('span', { text: String(i) }));
        } catch { /* ignore */ }
      };
      setTimeout(render, i * 45);
    }
    updateThumbActive();
  }

  function updateThumbActive() {
    side.querySelectorAll('.pdf-thumb').forEach((t) => t.classList.toggle('active', Number(t.dataset.page) === pageNum));
  }

  function go(n) {
    if (!doc) return;
    pageNum = clamp(n, 1, doc.numPages);
    renderCurrent();
  }

  /* ---------- actions ---------- */
  async function pageImage(source, n, angle) {
    const page = await source.getPage(n);
    const base = page.getViewport({ scale: 1, rotation: angle });
    const vp = page.getViewport({ scale: Math.min(2, 2400 / Math.max(base.width, base.height)), rotation: angle });
    const c = el('canvas');
    c.width = Math.max(1, Math.floor(vp.width));
    c.height = Math.max(1, Math.floor(vp.height));
    const cx = c.getContext('2d');
    await page.render({ canvasContext: cx, viewport: vp, background: '#ffffff' }).promise;
    return { src: c.toDataURL('image/jpeg', 0.94), x: 0, y: 0, w: c.width, h: c.height };
  }

  async function openAnnotation() {
    if (!doc) { toast('Open a PDF first', 'warn'); return; }
    if (annotationSession) return;
    const source = doc;
    const n = pageNum;
    const angle = rotation;
    const key = `pdf-ink:${source.fingerprints[0]}:${n}:${angle}`;
    const mountPoint = el('div', { class: 'pdf-annotation-board' });
    const session = annotationSession = { mountPoint };
    annotateBtn.disabled = true;
    try {
      const image = await pageImage(source, n, angle);
      if (annotationSession !== session || closed || doc !== source || n !== pageNum || angle !== rotation) return;
      annotatePanel.hidden = false;
      toolbar.hidden = wrap.hidden = true;
      annotateBar.querySelector('.pdf-annotation-label').textContent = `Page ${n} · Ink saved on this device`;
      annotateHost.append(mountPoint);
      const board = await mountBoard({ root: mountPoint, api, annotation: { key, image } });
      if (annotationSession !== session || closed) board.onClose();
      else session.board = board;
    } catch (error) {
      console.warn(error);
      if (annotationSession === session) {
        await closeAnnotation();
        toast('Could not open annotation mode', 'err');
      }
    } finally {
      if (!session.board && annotationSession === session) annotationSession = null;
      if (!annotationSession) annotateBtn.disabled = false;
    }
  }

  async function closeAnnotation() {
    const session = annotationSession;
    if (!session) return;
    annotationSession = null;
    annotatePanel.hidden = true;
    toolbar.hidden = wrap.hidden = false;
    const saved = session.board?.onClose();
    session.mountPoint.remove();
    await saved;
    annotateBtn.disabled = false;
    if (!closed) renderCurrent();
  }

  async function sendToBoard() {
    if (!doc) { toast('Open a PDF first', 'warn'); return; }
    try {
      const n = pageNum;
      const { src } = await pageImage(doc, n, rotation);
      if (closed) return;
      api.open('whiteboard', { image: src, asBackground: true, newPage: true, title: `${docName} · p${n}` });
    } catch (e) {
      console.error(e);
      toast('Could not send page to board', 'err');
    }
  }

  /* ---------- recents ---------- */
  async function renderRecents() {
    const list = drop.querySelector('.recent-list');
    list.innerHTML = '';
    const recents = (await idb.get('docs', 'recents')) || [];
    if (!recents.length) return;
    list.append(el('div', { style: { fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--text-3)', marginBottom: '8px' }, text: 'Recent on this device' }));
    recents.forEach((r) => {
      list.append(el('button', {
        class: 'pal-item', style: { width: '100%' },
        onclick: async () => {
          const fresh = (await idb.get('docs', 'recents')) || [];
          const found = fresh.find((x) => x.name === r.name && x.ts === r.ts) || r;
          if (!found.data) return toast('File no longer stored', 'warn');
          await loadBuffer(found.data.slice(0), found.name);
        },
      },
        el('span', { class: 'pal-ico', html: icon('pdf') }),
        el('span', { class: 'pal-text' }, el('b', { text: r.name }), el('small', { text: `${(r.size / 1024 / 1024).toFixed(1)} MB · ${relTime(r.ts)}` })),
        el('span', { class: 'pal-hint', text: 'Open' })
      ));
    });
  }

  /* ---------- drag/drop + keys ---------- */
  ['dragenter', 'dragover'].forEach((t) => view.addEventListener(t, (e) => { e.preventDefault(); }));
  view.addEventListener('drop', (e) => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (isDocument(f)) loadFile(f);
  });
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('hover'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('hover'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault(); e.stopPropagation(); drop.classList.remove('hover');
    const f = e.dataTransfer?.files?.[0];
    if (isDocument(f)) loadFile(f);
  });
  pageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { go(Number(pageInput.value) || 1); pageInput.blur(); }
  });
  const isFocused = () => document.body.contains(root) && root.closest('.win')?.classList.contains('focused');
  const onKey = (e) => {
    if (annotationSession || !isFocused() || ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') go(pageNum + 1);
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(pageNum - 1);
  };
  window.addEventListener('keydown', onKey);
  const onResize = debounce(() => { if (fitMode === 'width' && doc && annotatePanel.hidden && !closed) renderCurrent(); }, 200);
  const ro = new ResizeObserver(onResize);
  ro.observe(view);

  renderRecents();
  if (params.file) loadFile(params.file);

  return {
    onParams: (p) => { if (p.file) loadFile(p.file); },
    onResize: () => onResize(),
    save: () => annotationSession?.board?.save(),
    onClose: () => {
      closed = true;
      closeAnnotation();
      window.removeEventListener('keydown', onKey);
      ro.disconnect();
      if (doc) doc.destroy().catch(() => {});
    },
  };
}

/* PDF viewer / presenter — powered by pdf.js (bundled locally) */
import { el, toast, pickFiles, clamp, relTime, debounce, downloadBlob } from '../utils.js';
import { icon } from '../icons.js';
import { idb } from '../db.js';
import { ACCEPT, isDocument, toPdf } from '../document-import.js';
import { paintBoardObject } from '../board-render.js';
import { EMOJI_SVG } from '../emoji-data.js';
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
  let closed = false, exporting = false, annotationNav = false, loadId = 0, renderId = 0, observer;

  /* ---------- dom ---------- */
  const pageCanvas = el('canvas', { class: 'pdf-page-canvas' });
  const view = el('div', { class: 'pdf-view' });
  const side = el('div', { class: 'pdf-side', style: { display: 'none' } });
  const status = el('div', { class: 'pdf-status', text: 'No document loaded' });

  const drop = el('div', { class: 'pdf-drop' },
    el('div', { class: 'big-ico', html: icon('pdf') }),
    el('h3', { text: 'Open a document to present' }),
    el('p', { text: 'Import the entire PDF or PowerPoint (.pptx) to read and annotate here. For older .ppt files or exact PowerPoint fidelity, save a PDF copy first. DOCX, TXT and Markdown use text import. Nothing is uploaded.' }),
    el('button', { class: 'btn primary', html: `${icon('folder')}<span>Choose file</span>`, onclick: openPicker }),
    el('div', { class: 'recent-list', style: { marginTop: '18px', textAlign: 'left' } })
  );

  view.append(drop, pageCanvas);

  const pageInput = el('input', { class: 'field', type: 'text', inputmode: 'numeric', 'aria-label': 'Page number', value: '1', style: { width: '48px', textAlign: 'center', height: '28px' } });
  const pageTotal = el('span', { style: { fontSize: '12px', color: 'var(--text-3)' }, text: '/ 0' });
  const zoomLabel = el('button', { class: 'tool-btn ghost', text: '100%', title: 'Fit width', onclick: () => { fitMode = 'width'; renderCurrent(); } });

  const annotateBtn = el('button', { class: 'tool-btn ghost', html: `${icon('pen')}<span>Annotate</span>`,
    title: 'Write on the current page or slide', onclick: openAnnotation });
  const exportBtn = el('button', { class: 'tool-btn ghost', html: `${icon('download')}<span>Export with ink</span>`, title: 'Export all pages as an annotated PDF', onclick: exportAnnotated });
  const inkPage = el('input', { class: 'field pdf-ink-jump', type: 'text', inputmode: 'numeric', 'aria-label': 'Jump to annotation page' });
  inkPage.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); moveAnnotation(Number(inkPage.value) || pageNum); inkPage.blur(); } };
  const backToBoard = () => api.close();
  const exportInk = el('button', { class: 'tool-btn', text: 'Export with ink', onclick: exportAnnotated });
  const annotateBar = el('div', { class: 'app-toolbar pdf-annotation-bar' },
    el('button', { class: 'tool-btn ghost', html: `${icon('chevron-left')}<span>Back to reading</span>`, onclick: closeAnnotation }),
    el('button', { class: 'tool-btn', title: 'Previous annotation page', 'aria-label': 'Previous annotation page', html: icon('chevron-left'), onclick: () => stepAnnotation(-1) }),
    el('button', { class: 'tool-btn', title: 'Next annotation page', 'aria-label': 'Next annotation page', html: icon('chevron-right'), onclick: () => stepAnnotation(1) }),
    inkPage, el('span', { class: 'pdf-annotation-label', text: '' }), exportInk,
    el('button', { class: 'tool-btn', text: 'Close document', onclick: backToBoard }));
  const annotateHost = el('div', { class: 'pdf-annotation-host' });
  const annotatePanel = el('div', { class: 'pdf-annotation-panel', hidden: true }, annotateBar, annotateHost);
  const toolbar = el('div', { class: 'app-toolbar pdf-toolbar' },
    el('button', { class: 'tool-btn', text: '← Whiteboard', onclick: backToBoard }),
    annotateBtn, exportBtn,
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
    el('span', { class: 'pdf-file-title', 'aria-live': 'polite' })
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
    const request = ++loadId;
    try {
      status.textContent = `Loading ${file.name}…`;
      const { buffer: buf, imported, warnings } = await toPdf(file, (n, total) => { if (closed || request !== loadId) return false; status.textContent = `Importing slide ${n} of ${total}…`; });
      if (closed || request !== loadId || !await loadBuffer(buf.slice(0), file.name, request)) return;
      if (imported === 'text') toast('Text import ready. For original layout and images, use PDF.', 'info', 5000);
      if (warnings?.length) toast(`PowerPoint loaded. Some slides contain unsupported elements (${warnings.join(', ')}). For exact layout, use a PDF export.`, 'warn', 8500);
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
      if (closed || request !== loadId) return;
      console.error(e);
      toast(e.message || 'Could not read that document', 'err');
      status.textContent = 'Failed to load document';
    }
  }

  async function loadBuffer(buf, name = 'Document.pdf', request = ++loadId) {
    if (closed || !pdfjsLib) return false;
    const loaded = await pdfjsLib.getDocument({ data: buf, isEvalSupported: false }).promise;
    if (closed || request !== loadId) { await loaded.destroy(); return false; }
    await closeAnnotation(false);
    if (closed || request !== loadId) { await loaded.destroy(); return false; }
    renderId++;
    renderTask?.cancel();
    doc?.destroy().catch(() => {});
    doc = loaded;
    docName = name;
    pageNum = 1;
    rotation = 0;
    fitMode = 'width';
    toolbar.querySelector('.pdf-file-title').textContent = name;
    drop.style.display = 'none';
    view.style.display = 'flex';
    side.style.display = 'flex';
    pageTotal.textContent = `/ ${doc.numPages}`;
    status.textContent = `${name} · ${doc.numPages} pages`;
    buildThumbs();
    await renderCurrent();
    return true;
  }

  /* ---------- rendering ---------- */
  async function renderCurrent() {
    if (!doc) return;
    pageNum = clamp(pageNum, 1, doc.numPages);
    pageInput.value = String(pageNum);
    const request = ++renderId, source = doc, n = pageNum;
    try {
      const previous = renderTask;
      if (previous) { previous.cancel(); await previous.promise.catch(() => {}); }
      const page = await source.getPage(n);
      if (request !== renderId || source !== doc || closed) return;
      const base = page.getViewport({ scale: 1, rotation });
      let targetScale = scale;
      if (fitMode === 'width') {
        const padding = getComputedStyle(view);
        const avail = Math.max(1, view.clientWidth - parseFloat(padding.paddingLeft) - parseFloat(padding.paddingRight));
        targetScale = avail / base.width;
      }
      scale = targetScale;
      const vp = page.getViewport({ scale: targetScale, rotation });
      const dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(6_000_000 / (vp.width * vp.height)));
      pageCanvas.width = Math.floor(vp.width * dpr);
      pageCanvas.height = Math.floor(vp.height * dpr);
      pageCanvas.style.width = `${Math.floor(vp.width)}px`;
      pageCanvas.style.height = `${Math.floor(vp.height)}px`;
      const ctx = pageCanvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderTask = page.render({ canvasContext: ctx, viewport: vp });
      await renderTask.promise;
      if (request !== renderId || closed) return;
      renderTask = null;
      zoomLabel.textContent = `${Math.round(targetScale * 100)}%`;
      view.scrollTop = 0;
      updateThumbActive();
    } catch (e) {
      if (e?.name !== 'RenderingCancelledException') console.warn(e);
    }
  }

  function buildThumbs() {
    observer?.disconnect();
    side.replaceChildren();
    const source = doc;
    if (!source) return;
    observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        observer.unobserve(entry.target);
        drawThumb(source, entry.target);
      }
    }, { root: side, rootMargin: '180px' });
    const frag = document.createDocumentFragment();
    // A jump field is always available for documents with more thumbnails than the rail can hold.
    for (let i = 1; i <= Math.min(source.numPages, 1500); i++) {
      const holder = el('button', { class: 'pdf-thumb', dataset: { page: String(i) }, 'aria-label': `Go to page ${i}`, onclick: () => go(i) }, el('span', { text: String(i) }));
      frag.append(holder); observer.observe(holder);
    }
    side.append(frag);
    updateThumbActive();
  }
  async function drawThumb(source, holder) {
    try {
      const page = await source.getPage(Number(holder.dataset.page));
      if (source !== doc || closed || !holder.isConnected) return;
      const vp = page.getViewport({ scale: 108 / page.getViewport({ scale: 1 }).width });
      const c = el('canvas', { width: Math.max(1,Math.floor(vp.width)), height: Math.max(1,Math.floor(vp.height)) });
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      if (holder.isConnected) holder.prepend(c);
    } catch { /* optional preview */ }
  }

  function updateThumbActive() {
    side.querySelectorAll('.pdf-thumb').forEach((t) => t.classList.toggle('active', Number(t.dataset.page) === pageNum));
  }

  function go(n) {
    if (!doc) return;
    pageNum = clamp(Math.trunc(n), 1, doc.numPages);
    renderCurrent();
  }

  /* ---------- actions ---------- */
  async function pageRaster(source, n, angle, limit = 2400) {
    const page = await source.getPage(n);
    const base = page.getViewport({ scale: 1, rotation: angle });
    const vp = page.getViewport({ scale: Math.min(2, limit / Math.max(base.width, base.height)), rotation: angle });
    const c = el('canvas');
    c.width = Math.max(1, Math.floor(vp.width));
    c.height = Math.max(1, Math.floor(vp.height));
    const cx = c.getContext('2d');
    await page.render({ canvasContext: cx, viewport: vp, background: '#ffffff' }).promise;
    return { canvas: c, base };
  }
  async function pageImage(source, n, angle) {
    const { canvas } = await pageRaster(source, n, angle);
    return { src: canvas.toDataURL('image/jpeg', 0.94), x: 0, y: 0, w: canvas.width, h: canvas.height };
  }
  const inkKey = (source, n, angle) => `pdf-ink:${source.fingerprints[0]}:${n}:${angle}`;
  const stepAnnotation = delta => moveAnnotation(pageNum + delta);
  async function moveAnnotation(page) {
    if (!doc || !annotationSession?.board || annotationNav) return;
    const next = clamp(Math.trunc(page), 1, doc.numPages);
    if (next === pageNum) return;
    annotationNav = true;
    try {
      if (!await annotationSession.board.save()) { toast('Could not save this page’s ink.', 'err'); return; }
      await closeAnnotation(false);
      pageNum = next;
      await openAnnotation();
    } finally { annotationNav = false; }
  }

  async function exportAnnotated() {
    if (!doc || exporting) return;
    const source = doc, preferredRotation = rotation;
    if (annotationSession?.board && !await annotationSession.board.save()) { toast('Could not save the current page before export.', 'err'); return; }
    if (closed || exporting || source !== doc) return;
    if (source.numPages > 120) { toast('Export supports up to 120 pages. Split the source PDF first.', 'warn'); return; }
    const Pdf = window.jspdf?.jsPDF;
    if (!Pdf) return toast('PDF export unavailable', 'err');
    exporting = exportBtn.disabled = exportInk.disabled = true;
    const progress = el('p', { class: 'pdf-export-status', role: 'status' });
    const cancel = el('button', { class: 'tool-btn', text: 'Cancel export', onclick: () => { cancelled = true; } });
    let cancelled = false;
    const controls = el('div', { class: 'app-toolbar pdf-export-controls' }, progress, cancel);
    (annotationSession ? annotateBar : toolbar).after(controls);
    let output, bytes = 0;
    try {
      for (let n = 1; n <= source.numPages; n++) {
        if (cancelled || closed || source !== doc) return;
        progress.textContent = `Exporting page ${n} of ${source.numPages}…`;
        let angle = preferredRotation, objects = [];
        // Annotations are scoped to a rotation. Use the selected angle when it has ink,
        // otherwise search the remaining orientations for a saved page.
        for (const a of new Set([preferredRotation, 0, 90, 180, 270])) {
          const saved = await idb.get('boards', inkKey(source, n, a));
          if (saved?.pages?.[0]?.objects?.length) { angle = a; objects = saved.pages[0].objects; break; }
        }
        const { canvas, base } = await pageRaster(source, n, angle, 1800);
        const context = canvas.getContext('2d');
        const referenceScale = Math.min(2, 2400 / Math.max(base.width, base.height));
        context.setTransform(canvas.width / Math.max(1, Math.floor(base.width * referenceScale)), 0, 0, canvas.height / Math.max(1, Math.floor(base.height * referenceScale)), 0, 0);
        const sources = new Set(objects.map(o => o.type === 'image' ? o.src : o.type === 'emoji' ? EMOJI_SVG[o.char] : null).filter(Boolean));
        const images = new Map();
        await Promise.all([...sources].map(async src => {
          const image = new Image(); image.src = src;
          try { await image.decode(); } catch { throw new Error(`An annotation image on page ${n} could not be opened`); }
          images.set(src, image);
        }));
        for (const object of objects) paintBoardObject(context, object, src => images.get(src));
        const format = [base.width, base.height], orientation = base.width >= base.height ? 'landscape' : 'portrait';
        if (!output) output = new Pdf({ unit: 'pt', format, orientation, compress: true });
        else output.addPage(format, orientation);
        const jpeg = await new Promise(r => canvas.toBlob(r, 'image/jpeg', .90));
        if (!jpeg) throw new Error(`Could not render page ${n}`);
        bytes += jpeg.size;
        if (bytes > 55 * 1024 * 1024) throw new Error('Export is larger than 55 MB. Split the source PDF first');
        output.addImage(new Uint8Array(await jpeg.arrayBuffer()), 'JPEG', 0, 0, base.width, base.height);
        canvas.width = canvas.height = 1;
      }
      if (!output || cancelled || closed || source !== doc) return;
      downloadBlob(output.output('blob'), `${docName.replace(/\.(pdf|pptx|docx|txt|md)$/i, '')}-annotated.pdf`);
      toast('Annotated PDF downloaded (flattened pages)', 'ok');
    } catch (error) {
      if (!closed && !cancelled && source === doc) toast(error.message || 'Annotated PDF export failed', 'err');
    } finally { controls.remove(); exporting = exportBtn.disabled = exportInk.disabled = false; }
  }

  async function openAnnotation() {
    if (!doc) { toast('Open a PDF first', 'warn'); return; }
    if (annotationSession) return;
    const source = doc;
    const n = pageNum;
    const angle = rotation;
    const key = inkKey(source, n, angle);
    const mountPoint = el('div', { class: 'pdf-annotation-board' });
    const session = annotationSession = { mountPoint };
    annotateBtn.disabled = true;
    try {
      const image = await pageImage(source, n, angle);
      if (annotationSession !== session || closed || doc !== source || n !== pageNum || angle !== rotation) return;
      annotatePanel.hidden = false;
      toolbar.hidden = wrap.hidden = true;
      inkPage.value = String(n);
      annotateBar.querySelector('.pdf-annotation-label').textContent = `of ${source.numPages} · Ink saved on this device`;
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

  async function closeAnnotation(redraw = true) {
    const session = annotationSession;
    if (!session) return;
    annotationSession = null;
    annotatePanel.hidden = true;
    toolbar.hidden = wrap.hidden = false;
    const saved = session.board?.onClose();
    session.mountPoint.remove();
    await saved;
    annotateBtn.disabled = false;
    if (!closed && redraw) renderCurrent();
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
          try { await loadBuffer(found.data.slice(0), found.name); } catch { toast('Could not open the saved document', 'err'); }
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
    if (e.defaultPrevented) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); go(pageNum + 1); }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(pageNum - 1); }
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
    onClose: async () => {
      closed = true; loadId++; renderId++; observer?.disconnect(); renderTask?.cancel();
      await closeAnnotation(false);
      window.removeEventListener('keydown', onKey);
      ro.disconnect();
      if (doc) doc.destroy().catch(() => {});
    },
  };
}

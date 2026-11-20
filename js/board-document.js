import { idb } from './db.js';
import { toPdf } from './document-import.js';

export const MAX_BOARD_PAGES = 300;
const MAX_PAGE_IMAGES = 22 * 1024 * 1024;
export const isBlankBoardPage = (p) => p.bg === 'grid' && !p.objects.length && !p.bgImage && !p.title && !p.bgColor;

export function insertDocumentPages(pages, current, incoming) {
  const replace = pages.length === 1 && isBlankBoardPage(pages[0]);
  const pageIndex = replace ? 0 : current + 1;
  if (pages.length + incoming.length - Number(replace) > MAX_BOARD_PAGES) throw Error(`A board can contain up to ${MAX_BOARD_PAGES} pages. Save this board as a lesson or split the file.`);
  const result = replace ? incoming : [...pages.slice(0, pageIndex), ...incoming, ...pages.slice(pageIndex)];
  const imageBytes = result.reduce((total, p) => total + (p.bgImage?.src?.length || 0), 0);
  if (imageBytes > 46 * 1024 * 1024) throw Error('This board already contains many large pages. Save it as a lesson or export it before importing more.');
  return { pageIndex, pages: result };
}

export async function readDocumentPages(file, { signal, progress, limit = MAX_BOARD_PAGES }) {
  const library = globalThis.pdfjsLib;
  if (!library) throw Error('The document reader could not start. Reopen SmartBoardOS and try again.');
  const active = () => { if (signal.aborted) throw new DOMException('Import cancelled', 'AbortError'); };
  const { buffer, imported, warnings } = await toPdf(file, (n, count) => {
    if (signal.aborted) return false;
    progress(`Converting PowerPoint slide ${n} of ${count}…`, n, count);
  });
  active();
  library.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.js', import.meta.url).href;
  const task = library.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, maxImageSize: 36_000_000 });
  let rendering;
  const cancel = () => { if (rendering) rendering.cancel(); else task.destroy().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  const c = document.createElement('canvas'), ctx = c.getContext('2d', { alpha: false });
  const result = [];
  let used = 0, inkCount = 0;
  try {
    const pdf = await task.promise;
    active();
    if (pdf.numPages > limit) throw Error(`This board has room for ${limit} more pages. Save a separate lesson or split the document first.`);
    const slide = imported === 'slides' || /\.pptx$/i.test(file.name);
    const target = Math.min(1500, Math.max(1000, Math.round(1850 - pdf.numPages * 3)));
    const title = file.name.replace(/\.[^.]+$/, '').slice(0, 59) || 'Document';
    for (let n = 1; n <= pdf.numPages; n++) {
      active();
      progress(`Preparing ${slide ? 'slide' : 'page'} ${n} of ${pdf.numPages}…`, n, pdf.numPages);
      const page = await pdf.getPage(n);
      let rotation = 0, objects = [];
      // Keep handwritten ink from the previous document reader on the corresponding page.
      for (const angle of [0, 90, 180, 270]) {
        const prior = await idb.get('boards', `pdf-ink:${pdf.fingerprints[0]}:${n}:${angle}`);
        if (prior?.pages?.[0]?.objects?.length) { rotation = angle; objects = prior.pages[0].objects; inkCount++; break; }
      }
      active();
      const angle = objects.length ? rotation : (page.rotate || 0);
      const base = page.getViewport({ scale: 1, rotation: angle });
      const reference = page.getViewport({ scale: Math.min(2, 2400 / Math.max(base.width, base.height)), rotation: angle });
      const raster = page.getViewport({ scale: Math.min(2, target / Math.max(base.width, base.height)), rotation: angle });
      c.width = Math.max(1, Math.ceil(raster.width)); c.height = Math.max(1, Math.ceil(raster.height));
      rendering = page.render({ canvasContext: ctx, viewport: raster, background: '#ffffff' });
      await rendering.promise;
      rendering = null;
      let src = c.toDataURL('image/jpeg', .88);
      const fairShare = Math.max(48000, (MAX_PAGE_IMAGES - used) / (pdf.numPages - n + 1) * 1.16);
      if (src.length > fairShare) src = c.toDataURL('image/jpeg', .71);
      if ((used += src.length) > MAX_PAGE_IMAGES) throw Error('Rendered pages are too large for one editable board. Split the file into smaller sections and import each into its own lesson.');
      const dimensions = objects.length ? reference : raster;
      result.push({ title: `${title} · ${slide ? 'Slide' : 'Page'} ${n}`, bg: 'plain', bgColor: '#ffffff', objects, source: slide ? 'slide' : 'document',
        bgImage: { src, x: 0, y: 0, w: Math.max(1, Math.floor(dimensions.width)), h: Math.max(1, Math.floor(dimensions.height)) } });
      page.cleanup();
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    active();
    return { pages: result, imported, warnings, inkCount };
  } catch (error) {
    active();
    throw error;
  } finally {
    signal.removeEventListener('abort', cancel);
    c.width = c.height = 1;
    await task.destroy().catch(() => {});
  }
}

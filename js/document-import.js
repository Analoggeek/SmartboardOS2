import { unzipSync, strFromU8 } from '../vendor/fflate/fflate.js';

export const ACCEPT = '.pdf,.ppt,.pptx,.docx,.txt,.md,application/pdf';
const MAX_SOURCE = 50 * 1024 * 1024;
const MAX_PART = 2 * 1024 * 1024;
const MAX_PARTS = 150;
export const isDocument = file => !!file && (/\.(pdf|ppt|pptx|docx|txt|md)$/i.test(file.name) || file.type === 'application/pdf');
const names = (root, local) => [...root.getElementsByTagNameNS('*', local)];

function paragraphs(part) {
  const xml = new DOMParser().parseFromString(strFromU8(part), 'application/xml');
  if (names(xml, 'parsererror').length) throw new Error('Invalid document XML.');
  return names(xml, 'p').map(p => names(p, 't').map(t => t.textContent).join('').trim()).filter(Boolean);
}

function extract(bytes, extension) {
  if (extension === 'txt' || extension === 'md') return [strFromU8(bytes).slice(0, 120000).split(/\r?\n/)];
  const pattern = /^word\/document\.xml$/;
  let count = 0, total = 0;
  const parts = unzipSync(bytes, { filter: info => {
    if (!pattern.test(info.name)) return false;
    if (++count > MAX_PARTS || info.originalSize > MAX_PART || (total += info.originalSize) > 24 * 1024 * 1024) throw new Error('Document is too large for the quick import. Export it to PDF first.');
    return true;
  } });
  const pages = Object.keys(parts).sort((a,b) => a.localeCompare(b, 'en', { numeric: true })).map(path => paragraphs(parts[path]));
  if (!pages.length) throw new Error('No supported document content found. Export to PDF to retain the original layout.');
  return pages;
}

export async function toPdf(file, progress) {
  if (!isDocument(file)) throw new Error('Use PDF, PPTX, DOCX, TXT or Markdown.');
  if (file.size > MAX_SOURCE) throw new Error('Use a file under 50 MB.');
  const extension = file.name.split('.').pop().toLowerCase();
  const buffer = await file.arrayBuffer();
  if (extension === 'pdf' || file.type === 'application/pdf') return { buffer, imported: false };
  if (extension === 'ppt') throw Error('This is the older .ppt format. Save it as .pptx or PDF in PowerPoint or LibreOffice, then import it.');
  const fileId = crypto.subtle ? [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)).slice(0,16)].map(b=>b.toString(16).padStart(2,'0')).join('') : undefined;
  if (extension === 'pptx') {
    const { pptxToPdf } = await import('./pptx-import.js');
    return pptxToPdf(new Uint8Array(buffer), { progress, fileId });
  }
  const pages = extract(new Uint8Array(buffer), extension);
  const pdf = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4', compress: true });
  if (fileId) pdf.setFileId(fileId);
  const width = pdf.internal.pageSize.getWidth(), height = pdf.internal.pageSize.getHeight();
  const canvas = document.createElement('canvas');
  canvas.width = width * 1.5; canvas.height = height * 1.5;
  const ctx = canvas.getContext('2d'); ctx.scale(1.5,1.5);
  let generated = 0, line;
  function start() {
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,width,height);
    ctx.fillStyle = '#152a45'; ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText(file.name.slice(0,75), 34, 33);
    ctx.font = `17px system-ui, sans-serif`;
    line = 72;
  }
  function finish() {
    if (++generated > MAX_PARTS) throw new Error('Too many pages; export to PDF instead.');
    if (generated > 1) pdf.addPage();
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.88), 'JPEG', 0, 0, width, height);
  }
  function add(text) {
    if (line > height-35) { finish(); start(); }
    ctx.fillText(text, 34, line); line += 26;
  }
  for (const content of pages) {
    start();
    for (const paragraph of content.length ? content : ['No editable text on this page. For the original layout, import a PDF export.']) {
      let row = '';
      for (const word of paragraph.slice(0, 24000).split(/\s+/)) {
        const next = row ? `${row} ${word}` : word;
        if (row && ctx.measureText(next).width > width-68) { add(row); row = ''; }
        for (const char of (row ? ` ${word}` : word)) {
          if (row && ctx.measureText(row+char).width > width-68) { add(row); row = ''; }
          row += char;
        }
      }
      add(row); line += 6;
    }
    finish();
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return { buffer: pdf.output('arraybuffer'), imported: 'text' };
}

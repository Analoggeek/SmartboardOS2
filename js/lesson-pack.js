import { strFromU8, strToU8, unzipSync, zipSync } from '../vendor/fflate/fflate.js';

export const PACK_LIMIT = 64 * 1024 * 1024;
export const BOARD_LIMIT = 24 * 1024 * 1024;
const supported = new Set(['stroke', 'shape', 'image', 'text', 'emoji', 'card']);
const bounded = (n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1e7;
const positive = n => bounded(n) && n > 0;
const text = (s,n) => typeof s === 'string' && s.length <= n;
const color = s => typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s);
const point = o => o && bounded(o.x) && bounded(o.y);
const raster = s => text(s, BOARD_LIMIT) && /^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(s);
export const attachmentName = s => text(s, 140) && !/[/\\\x00-\x1f]/.test(s) && /\.(pdf|pptx|docx|txt|md|png|jpe?g|webp|webm|vtt)$/i.test(s);
const image = o => point(o) && positive(o.w) && positive(o.h) && raster(o.src);

export function checkBoard(board) {
  if (!board || board.version !== 1 || !Array.isArray(board.pages) || !board.pages.length || board.pages.length > 300 ||
      !Number.isInteger(board.pageIndex) || board.pageIndex < 0 || board.pageIndex >= board.pages.length) throw Error('Invalid board in this lesson');
  let objects = 0, points = 0;
  for (const p of board.pages) {
    if (!p || !Array.isArray(p.objects) || (objects += p.objects.length) > 50000 || !text(p.bg, 24) ||
        (p.bgColor != null && !color(p.bgColor)) || (p.bgImage != null && !image(p.bgImage))) throw Error('Invalid board page or unsupported image format');
    if (p.title != null && !text(p.title, 80)) throw Error('Invalid page title');
    for (const o of p.objects) {
      if (!o || !supported.has(o.type)) throw Error('Unsupported item in lesson');
      switch(o.type) {
        case 'stroke':
          if (!color(o.color) || !positive(o.size) || !Array.isArray(o.points) || !o.points.length ||
              (points += o.points.length) > 700000 || !o.points.every(v => point(v) && (v.p == null || bounded(v.p)))) throw Error('Invalid pen stroke');
          break;
        case 'shape':
          if (!['line','arrow','rect','ellipse'].includes(o.shape) || !color(o.color) || !positive(o.size) || ![o.x0,o.y0,o.x1,o.y1].every(bounded)) throw Error('Invalid shape');
          break;
        case 'image': if (!image(o)) throw Error('Unsupported image in lesson (use PNG, JPEG, GIF or WebP)'); break;
        case 'text': if (!point(o) || !positive(o.fontSize) || !color(o.color) || !text(o.text, 50000)) throw Error('Invalid text'); break;
        case 'emoji': if (!point(o) || !positive(o.size) || !text(o.char, 36)) throw Error('Invalid sticker'); break;
        case 'card': if (!point(o) || !positive(o.w) || !positive(o.h) || !text(o.url, 2000) || !/^https?:\/\//i.test(o.url) || (o.title != null && !text(o.title, 2000)) || (o.desc != null && !text(o.desc, 5000))) throw Error('Invalid reference card'); break;
      }
    }
  }
  return board;
}

function manifest(meta, files) {
  const title = meta?.title?.trim?.();
  if (!title || !text(title, 100)) throw Error('Enter a lesson title (up to 100 characters)');
  if (!Array.isArray(files) || files.length > 16 || !files.every(attachmentName)) throw Error('Unsupported attachment name or too many files');
  const values = { title, savedAt: Number.isSafeInteger(meta.savedAt) && meta.savedAt > 0 ? meta.savedAt : Date.now() };
  for (const [key,max] of [['className',80],['subject',80],['chapter',100],['notes',16000]]) {
    const value = meta[key] ?? '';
    if (!text(value,max)) throw Error(`${key} is too long`);
    values[key] = value;
  }
  return { format: 'smartboardos-lesson', version: 1, ...values, files };
}

export async function encodeLesson(lesson) {
  const files = lesson.files || [];
  const meta = manifest(lesson, files.map(file => file.name));
  const board = strToU8(JSON.stringify(checkBoard(lesson.board)));
  if (board.length > BOARD_LIMIT || board.length + files.reduce((n,f) => n+f.blob.size,0) > PACK_LIMIT * .98) throw Error('This lesson is too large to export (64 MB limit)');
  const entries = { 'lesson.json': strToU8(JSON.stringify(meta)), 'board.json': board };
  for (let i = 0; i < files.length; i++) entries[`files/${i}`] = new Uint8Array(await files[i].blob.arrayBuffer());
  return zipSync(entries, { level: 0 }); // files are typically already compressed; avoid blocking the board.
}

export function decodeLesson(bytes) {
  if (bytes.byteLength > PACK_LIMIT) throw Error('Use a lesson pack under 64 MB');
  let total = 0;
  const seen = new Set();
  const files = unzipSync(bytes, { filter: info => {
    const { name, originalSize } = info;
    if (!/^(?:lesson\.json|board\.json|files\/(?:\d|1[0-5]))$/.test(name) || seen.has(name) ||
        // Only accept our own bounded, stored archive format. No expansion of untrusted compressed data.
        info.compression !== 0 || info.size !== originalSize || (total += originalSize) > PACK_LIMIT ||
        (name === 'board.json' && originalSize > BOARD_LIMIT) || (name === 'lesson.json' && originalSize > 100000)) throw Error('Invalid or oversized lesson pack');
    seen.add(name); return true;
  } });
  if (!files['lesson.json'] || !files['board.json']) throw Error('Missing lesson or board data');
  const raw = JSON.parse(strFromU8(files['lesson.json']));
  if (raw?.format !== 'smartboardos-lesson' || raw?.version !== 1) throw Error('Unsupported lesson pack version');
  const meta = manifest(raw, raw.files);
  const attachments = meta.files.map((name,i) => {
    if (!files[`files/${i}`]) throw Error('Lesson attachment is missing');
    return { name, blob: new Blob([files[`files/${i}`]]) };
  });
  if (seen.size !== attachments.length + 2) throw Error('Unexpected lesson attachments');
  return { ...meta, board: checkBoard(JSON.parse(strFromU8(files['board.json']))), files: attachments };
}

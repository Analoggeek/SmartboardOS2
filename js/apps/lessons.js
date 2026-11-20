import { idb, store } from '../db.js';
import { attachmentName, decodeLesson, encodeLesson, PACK_LIMIT, checkBoard } from '../lesson-pack.js';
import { listCheckpoints } from '../board-checkpoints.js';
import { isDocument } from '../document-import.js';
import { downloadBlob, el, pickFiles, toast, uid } from '../utils.js';

const INDEX = 'lesson-index-v1';
const index = () => store.get(INDEX, []);
const fileTypes = '.pdf,.pptx,.docx,.md,.txt,.png,.jpg,.jpeg,.webp,.webm,.vtt';
const nameFor = (title) => `${title.replace(/[^\p{L}\p{N} -]+/gu, '').trim() || 'lesson'}.sboslesson`;

export function mount({ root, api }) {
  const filter = el('input', { class: 'field', type: 'search', placeholder: 'Search class, subject, chapter…', 'aria-label': 'Search lessons', oninput: list });
  const name = field('Lesson title', 100), className = field('Class', 80), subject = field('Subject', 80), chapter = field('Chapter', 100);
  const notes = el('textarea', { class: 'field', placeholder: 'Private teaching notes', 'aria-label': 'Private teaching notes', maxlength: 16000, rows: 4 });
  const status = el('p', { role: 'status', class: 'lesson-status' });
  const attachments = el('div', { class: 'lesson-files' });
  const results = el('div', { class: 'lesson-list' });
  const recovery = el('div', { class: 'lesson-list' });
  const editor = [name,className,subject,chapter,notes];
  let files = [], busy = false, selectedId, closed = false;
  const button = (title, onclick, cls='btn') => el('button', { class: cls, text: title, onclick });
  function field(placeholder, max) { return el('input', { class: 'field', placeholder, maxlength: max, 'aria-label': placeholder }); }
  async function task(action) {
    if (busy) return;
    busy = true;
    try { await action(); } catch (e) { console.warn('[Lesson Library]',e); status.textContent = e.message || 'Could not complete the lesson action.'; }
    finally { busy = false; }
  }
  const save = button('Save current board to lesson', () => task(saveLesson), 'btn primary');
  root.append(el('div', { class: 'settings lesson-library' },
    el('p', { class: 'hero-eyebrow', text: 'TEACHING WORKSPACE · OFFLINE' }), el('h2', { text: 'Lesson Library' }),
    el('p', { text: 'Organize boards by class, subject and chapter. Export a portable Lesson Pack for USB transfer.' }),
    el('div', { class: 'lesson-grid' }, el('section', {},
      el('h3', { text: 'Prepare a lesson' }), el('div', { class: 'lesson-fields' }, editor), attachments,
      el('div', { class: 'lesson-actions' }, button('Attach files', attach), save, button('New lesson', reset)), status),
      el('section', {}, el('h3', { text: 'Saved lessons' }),
        el('div', { class: 'lesson-actions' }, filter, button('Import Lesson Pack', importPack)), results,
        el('h3', { text: 'Recent board recovery points' }), recovery))));

  function updateFiles() {
    attachments.replaceChildren(...files.map((f,i) => el('div', {}, el('span', { text: f.name }),
      button(isDocument(f) ? 'Open' : 'Download', () => {
        if (isDocument(f)) api.open('pdf', { file: new File([f.blob], f.name) });
        else downloadBlob(f.blob,f.name);
      }, 'mini-btn'), button('Remove', () => { if (!busy) { files.splice(i, 1); updateFiles(); } }, 'mini-btn'))));
  }
  async function attach() {
    if (busy) return;
    const chosen = await pickFiles({ accept: fileTypes, multiple: true });
    if (closed || !chosen.length || busy) return;
    const next = [...files, ...chosen.map(file => ({ name: file.name, blob: file }))];
    if (next.length > 16 || next.some(f => !attachmentName(f.name)) || next.reduce((n,f)=>n+f.blob.size,0) > PACK_LIMIT / 1.4) {
      status.textContent = 'Use up to 16 supported files, under 45 MB total.'; return;
    }
    files = next; updateFiles();
  }
  function reset() {
    if (busy) return;
    selectedId = null; files = []; editor.forEach(x => x.value = ''); updateFiles(); status.textContent = '';
  }
  async function currentBoard() {
    const rec = api.wm.windows.get('whiteboard');
    if (rec && !rec.instance) throw Error('Wait for the whiteboard to finish opening');
    if (rec?.instance?.save && !await rec.instance.save()) throw Error('Could not save your current board');
    return (await idb.get('boards', 'current')) || { pages: [{ bg: 'plain', objects: [] }], pageIndex: 0, version: 1 };
  }
  async function write(lesson) {
    const { id, title, className, subject, chapter, savedAt } = lesson;
    if (!await idb.set('kv', `lesson:${id}`, lesson)) throw Error('Could not store this lesson. Check free disk space.');
    if (!store.set(INDEX, [{ id, title, className, subject, chapter, savedAt }, ...index().filter(x => x.id !== id)])) throw Error('Could not update the lesson index. Check storage permissions.');
    list();
  }
  async function saveLesson() {
    if (!name.value.trim()) { name.focus(); throw Error('Enter a lesson title first.'); }
    const board = checkBoard(await currentBoard());
    if (JSON.stringify(board).length > 20_000_000) throw Error('Board is too large for a portable lesson. Split its pages.');
    const lesson = { id: selectedId || uid('lesson'), title: name.value.trim(), className: className.value.trim(), subject: subject.value.trim(), chapter: chapter.value.trim(), notes: notes.value, savedAt: Date.now(), board, files: [...files] };
    await write(lesson); selectedId = lesson.id; status.textContent = `Saved ${lesson.title}.`;
  }
  async function importPack() {
    if (busy) return;
    const [file] = await pickFiles({ accept: '.sboslesson' });
    if (!file || closed) return;
    await task(async () => {
      if (file.size > PACK_LIMIT) throw Error('Use a lesson pack under 64 MB');
      const lesson = decodeLesson(new Uint8Array(await file.arrayBuffer()));
      await write({ ...lesson, id: uid('lesson'), savedAt: Date.now() }); status.textContent = `Imported ${lesson.title} as a new lesson.`;
    });
  }
  async function get(id) {
    const lesson = await idb.get('kv', `lesson:${id}`);
    if (!lesson) throw Error('Lesson data unavailable. Import a backup if you have one.');
    return lesson;
  }
  function openBoard(board, title) {
    if (confirm(`Open “${title}” on the board? The current board will be saved as a recovery point first.`)) api.open('whiteboard', { lessonBoard: board, title });
  }
  function list() {
    const key = filter.value.trim().toLowerCase();
    const shown = index().filter(x => [x.title,x.className,x.subject,x.chapter].join(' ').toLowerCase().includes(key));
    results.replaceChildren(...shown.map(info => el('article', { class: 'lesson-card' },
      el('strong', { text: info.title }), el('small', { text: [info.className,info.subject,info.chapter].filter(Boolean).join(' / ') || 'Unfiled lesson' }),
      el('div', { class: 'lesson-actions' },
        button('Open board', () => task(async () => openBoard((await get(info.id)).board, info.title))),
        button('Notes & files', () => task(async () => {
          const l = await get(info.id); selectedId = l.id;
          [name.value,className.value,subject.value,chapter.value,notes.value] = [l.title,l.className,l.subject,l.chapter,l.notes];
          files = l.files.slice(); updateFiles();
        })),
        button('Export pack', () => task(async () => {
          const lesson = await get(info.id);
          downloadBlob(new Blob([await encodeLesson(lesson)], { type: 'application/zip' }), nameFor(lesson.title));
          toast('Lesson Pack downloaded', 'ok');
        })),
        button('Delete', () => task(async () => {
          if (!confirm(`Delete “${info.title}” from this device?`)) return;
          if (!await idb.del('kv',`lesson:${info.id}`)) throw Error('Could not delete lesson');
          store.set(INDEX,index().filter(x => x.id !== info.id)); list();
        }), 'btn danger')))));
    if (!shown.length) results.append(el('p', { text: key ? 'No matching lessons.' : 'No saved lessons yet.' }));
  }
  async function versions() {
    const items = await listCheckpoints();
    if (closed) return;
    recovery.replaceChildren(...items.map(item => el('div', { class: 'lesson-card' },
      el('small', { text: `${item.label} · ${new Date(item.ts).toLocaleString()}` }),
      button('Restore', () => task(async () => openBoard(JSON.parse(item.json), 'Board recovery point'))))));
    if (!items.length) recovery.append(el('p', { text: 'Recovery points appear after you write on the board.' }));
  }
  list(); versions();
  return { onParams: versions, onClose() { closed = true; } };
}

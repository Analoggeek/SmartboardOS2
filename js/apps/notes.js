/* Lesson notes — quick, autosaving notes for the teacher */
import { el, toast, relTime, uid, debounce, downloadText } from '../utils.js';
import { archiveWriter } from '../archive.js';
import { icon } from '../icons.js';
import { state } from '../db.js';

export function mount({ root, api }) {
  let notes = state.get('notes', []);
  let currentId = notes[0]?.id || null;

  const list = el('div', { class: 'notes-list' });
  const titleInput = el('input', { placeholder: 'Note title', spellcheck: 'false' });
  const bodyInput = el('textarea', { placeholder: 'Type your lesson plan, homework, or reminders…' });
  const meta = el('div', { class: 'notes-meta', text: '' });
  const editor = el('div', { class: 'notes-editor' }, titleInput, bodyInput, meta);
  const wrap = el('div', { class: 'notes-wrap' }, list, editor);

  const toolbar = el('div', { class: 'app-toolbar' },
    el('button', { class: 'tool-btn ghost', html: `${icon('plus')}<span>New note</span>`, onclick: () => newNote() }),
    el('div', { class: 'sep' }),
    el('button', { class: 'tool-btn', html: icon('trash'), title: 'Delete note', onclick: deleteNote }),
    el('button', { class: 'tool-btn', html: icon('download'), title: 'Export notes as text', onclick: exportNotes })
  );

  const app = el('div', { class: 'app' }, toolbar, wrap);
  root.append(app);

  const archive = archiveWriter('notes');
  const persist = debounce(() => { state.set('notes', notes); archive.schedule(notes); }, 400);
  const save = () => { state.set('notes', notes); return archive.write(notes); };

  function current() { return notes.find((n) => n.id === currentId) || null; }

  function renderList() {
    list.innerHTML = '';
    if (!notes.length) {
      list.append(el('div', { style: { padding: '14px', fontSize: '12px', color: 'var(--text-3)' }, text: 'No notes yet' }));
    }
    notes
      .slice()
      .sort((a, b) => b.updated - a.updated)
      .forEach((n) => {
        list.append(el('button', {
          class: `note-item ${n.id === currentId ? 'active' : ''}`,
          onclick: () => { currentId = n.id; renderList(); loadIntoEditor(); },
        },
          el('b', { text: n.title || 'Untitled note' }),
          el('small', { text: relTime(n.updated) })
        ));
      });
  }

  function loadIntoEditor() {
    const n = current();
    titleInput.value = n?.title || '';
    bodyInput.value = n?.body || '';
    meta.textContent = n ? `Last edited ${relTime(n.updated)} · ${(n.body || '').trim().split(/\s+/).filter(Boolean).length} words` : 'Select or create a note';
    api.setTitle(n ? `Notes · ${n.title || 'Untitled'}` : 'Notes');
  }

  function newNote() {
    const n = { id: uid('note'), title: '', body: '', updated: Date.now() };
    notes.unshift(n);
    currentId = n.id;
    persist();
    renderList(); loadIntoEditor();
    titleInput.focus();
  }

  function deleteNote() {
    const n = current();
    if (!n) return;
    notes = notes.filter((x) => x.id !== n.id);
    currentId = notes[0]?.id || null;
    persist(); renderList(); loadIntoEditor();
    toast('Note deleted', 'info', 1600);
  }

  function exportNotes() {
    const text = notes.map((n) => `# ${n.title || 'Untitled'}\n${n.body}\n`).join('\n---\n\n');
    downloadText(text || 'No notes yet', 'smartboard-notes.md', 'text/markdown');
    toast('Notes exported', 'ok');
  }

  titleInput.addEventListener('input', () => {
    const n = current(); if (!n) return;
    n.title = titleInput.value; n.updated = Date.now();
    persist(); renderList();
    api.setTitle(`Notes · ${n.title || 'Untitled'}`);
  });
  bodyInput.addEventListener('input', () => {
    const n = current(); if (!n) return;
    n.body = bodyInput.value; n.updated = Date.now();
    persist();
    meta.textContent = `Last edited just now · ${bodyInput.value.trim().split(/\s+/).filter(Boolean).length} words`;
  });

  if (!notes.length) newNote(); else { renderList(); loadIntoEditor(); }

  return {
    onParams: async (p = {}) => {
      if (p.new) newNote();
      if (p.text) {
        const n = { id: uid('note'), title: p.title || 'Quick note', body: p.text, updated: Date.now() };
        notes.unshift(n); currentId = n.id; persist(); renderList(); loadIntoEditor();
      }
    },
    save,
    onClose: save,
  };
}

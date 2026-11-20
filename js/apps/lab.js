import { diagrams, subjects, levels, diagramSVG } from '../lab-diagrams.js';
import { answers, chapterFor } from '../lab-practice.js';
import { experiment } from './lab-experiments.js';
import { downloadBlob, el } from '../utils.js';

const option = (name) => el('option', { value: name, text: name });
const blobFor = (item, labelled) => new Blob([diagramSVG(item, { labelled })], { type: 'image/svg+xml' });

export function mount({ root, api }) {
  let active = diagrams[0], closed = false, busy = false;
  const subject = el('select', { class: 'field', 'aria-label': 'Subject' }, ['All subjects', ...subjects].map(option));
  const level = el('select', { class: 'field', 'aria-label': 'Level' }, ['All levels', ...levels].map(option));
  const search = el('input', { class: 'field', type: 'search', placeholder: 'Search diagrams…', 'aria-label': 'Search science diagrams' });
  const chapter = el('select', { class: 'field', 'aria-label': 'Chapter' }, option('All chapters'));
  const list = el('div', { class: 'lab-list', 'aria-label': 'Diagrams' });
  const count = el('p', { class: 'lab-count', role: 'status' });
  const preview = el('div', { class: 'lab-preview' });
  const note = el('p', { class: 'lab-note' });
  const prompt = el('p', { class: 'lab-prompt' });
  const answerText = el('p');
  const answer = el('details', { class: 'lab-answer' }, el('summary', { text: 'Reveal teacher answer' }), answerText);
  const sim = el('div');
  const status = el('span', { class: 'lab-status', role: 'status' });
  const labels = el('input', { type: 'checkbox', checked: '' });
  const save = el('button', { class: 'btn', text: 'Download SVG', onclick: () => {
    if (active) downloadBlob(blobFor(active, labels.checked), `smart-lab-${active.id}.svg`);
  } });
  const worksheet = el('button', { class: 'btn', text: 'Worksheet', onclick: () => {
    if (!active) return;
    const parts = active.prompt.match(/.{1,74}(?:\s|$)|.{1,74}/g).map(x => x.trim());
    const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const drawing = diagramSVG(active, { labelled: false }).replace(/width="1800" height="1200"/, 'width="900" height="600"');
    const xml = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="840" viewBox="0 0 900 840" font-family="system-ui"><rect width="900" height="840" fill="white"/>${drawing}<g fill="#172b49" font-size="21"><text x="60" y="630">Name: ________________________  Date: ______________</text><text x="60" y="664">Label the diagram, then answer:</text>${parts.map((line,i)=>`<text x="60" y="${696+i*23}">${esc(line)}</text>`).join('')}</g><path d="M60 762H838M60 797H838" stroke="#8e9db0"/></svg>`;
    downloadBlob(new Blob([xml], { type: 'image/svg+xml' }), `worksheet-${active.id}.svg`);
  } });
  const board = el('button', { class: 'btn primary', text: 'Annotate on board', onclick: send });
  const details = el('div', { class: 'lab-detail' }, preview,
    el('div', { class: 'lab-actions' }, el('label', {}, labels, ' Show labels'), worksheet, save, board),
    el('div', { class: 'lab-teaching' }, note, prompt, answer, sim, status));
  root.append(el('section', { class: 'lab' },
    el('header', { class: 'lab-head' }, el('p', { class: 'hero-eyebrow', text: 'OFFLINE DIAGRAM LIBRARY' }),
      el('h2', { text: 'Smart Lab' }), el('p', { text: 'Physics, Chemistry, Biology and Mathematics · school to selected master’s topics' })),
    el('div', { class: 'lab-filters' }, search, subject, level, chapter),
    el('div', { class: 'lab-workspace' }, el('aside', { class: 'lab-index' }, count, list), details)));

  let renderedItem;
  function render() {
    details.hidden = !active;
    if (!active) return;
    preview.innerHTML = diagramSVG(active, { labelled: labels.checked });
    note.textContent = active.summary;
    prompt.textContent = `Discuss: ${active.prompt}`;
    if (renderedItem !== active) {
      renderedItem = active; answer.open = false; answerText.textContent = answers[active.id];
      const model = experiment(active.id); sim.replaceChildren(...(model ? [model] : []));
    }
    board.disabled = busy;
  }
  function filter() {
    const words = search.value.trim().toLowerCase().split(/\s+/);
    const items = diagrams.filter(item => (!subject.selectedIndex || subject.value === item.subject) &&
      (!level.selectedIndex || level.value === item.level) && (!chapter.selectedIndex || chapter.value === chapterFor(item)) && words.every(word => `${item.title} ${item.summary} ${item.subject} ${item.level} ${chapterFor(item)}`.toLowerCase().includes(word)));
    if (!items.includes(active)) active = items[0];
    count.textContent = `${items.length} of ${diagrams.length} diagrams`;
    list.replaceChildren(...items.map(item => el('button', { class: 'lab-entry', 'aria-pressed': String(item === active), onclick: (event) => {
      active = item; status.textContent = '';
      for (const button of list.children) button.setAttribute('aria-pressed', String(button === event.currentTarget));
      render();
    } }, el('strong', { text: item.title }), el('small', { text: `${item.subject} · ${chapterFor(item)} · ${item.level}` }))));
    if (!items.length) list.append(el('p', { class: 'lab-empty', text: 'No diagrams match. Try a different search or level.' }));
    status.textContent = '';
    render();
  }
  async function send() {
    if (!active || busy) return;
    const item = active;
    const url = URL.createObjectURL(blobFor(item, labels.checked));
    busy = board.disabled = true;
    status.textContent = 'Preparing diagram…';
    try {
      const image = new Image(); image.src = url; await image.decode();
      if (closed) return;
      const canvas = document.createElement('canvas'); canvas.width = 1800; canvas.height = 1200;
      canvas.getContext('2d').drawImage(image, 0, 0);
      api.open('whiteboard', { image: canvas.toDataURL('image/png'), asBackground: true, newPage: true, title: `Smart Lab · ${item.title}` });
      status.textContent = 'Diagram added to a new board page.';
    } catch (error) {
      console.warn('[Smart Lab]', error);
      if (!closed) status.textContent = 'Could not open the board. You can still download the SVG.';
    } finally { URL.revokeObjectURL(url); busy = board.disabled = false; }
  }
  function chapters() {
    const list = diagrams.filter(d => !subject.selectedIndex || d.subject === subject.value).map(chapterFor);
    chapter.replaceChildren(option('All chapters'), ...[...new Set(list)].sort().map(option)); filter();
  }
  subject.addEventListener('change', chapters); level.addEventListener('change', filter); chapter.addEventListener('change', filter);
  search.addEventListener('input', filter); labels.addEventListener('change', render);
  chapters();
  return { onClose() { closed = true; } };
}

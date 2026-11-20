import { diagrams, subjects, levels, diagramSVG } from '../lab-diagrams.js';
import { downloadBlob, el } from '../utils.js';

const option = (name) => el('option', { value: name, text: name });
const blobFor = (item, labelled) => new Blob([diagramSVG(item, { labelled })], { type: 'image/svg+xml' });

export function mount({ root, api }) {
  let active = diagrams[0], closed = false, busy = false;
  const subject = el('select', { class: 'field', 'aria-label': 'Subject' }, ['All subjects', ...subjects].map(option));
  const level = el('select', { class: 'field', 'aria-label': 'Level' }, ['All levels', ...levels].map(option));
  const search = el('input', { class: 'field', type: 'search', placeholder: 'Search diagrams…', 'aria-label': 'Search science diagrams' });
  const list = el('div', { class: 'lab-list', 'aria-label': 'Diagrams' });
  const count = el('p', { class: 'lab-count', role: 'status' });
  const preview = el('div', { class: 'lab-preview' });
  const note = el('p', { class: 'lab-note' });
  const prompt = el('p', { class: 'lab-prompt' });
  const status = el('span', { class: 'lab-status', role: 'status' });
  const labels = el('input', { type: 'checkbox', checked: '' });
  const save = el('button', { class: 'btn', text: 'Download SVG', onclick: () => {
    if (active) downloadBlob(blobFor(active, labels.checked), `smart-lab-${active.id}.svg`);
  } });
  const board = el('button', { class: 'btn primary', text: 'Annotate on board', onclick: send });
  const details = el('div', { class: 'lab-detail' }, preview,
    el('div', { class: 'lab-actions' }, el('label', {}, labels, ' Show labels'), save, board),
    el('div', { class: 'lab-teaching' }, note, prompt, status));
  root.append(el('section', { class: 'lab' },
    el('header', { class: 'lab-head' }, el('p', { class: 'hero-eyebrow', text: 'OFFLINE DIAGRAM LIBRARY' }),
      el('h2', { text: 'Smart Lab' }), el('p', { text: 'Physics, Chemistry and Biology teaching diagrams · school to selected master’s topics' })),
    el('div', { class: 'lab-filters' }, search, subject, level),
    el('div', { class: 'lab-workspace' }, el('aside', { class: 'lab-index' }, count, list), details)));

  function render() {
    details.hidden = !active;
    if (!active) return;
    preview.innerHTML = diagramSVG(active, { labelled: labels.checked });
    note.textContent = active.summary;
    prompt.textContent = `Discuss: ${active.prompt}`;
    board.disabled = busy;
  }
  function filter() {
    const words = search.value.trim().toLowerCase().split(/\s+/);
    const items = diagrams.filter(item => (!subject.selectedIndex || subject.value === item.subject) &&
      (!level.selectedIndex || level.value === item.level) && words.every(word => `${item.title} ${item.summary} ${item.subject} ${item.level}`.toLowerCase().includes(word)));
    if (!items.includes(active)) active = items[0];
    count.textContent = `${items.length} of ${diagrams.length} diagrams`;
    list.replaceChildren(...items.map(item => el('button', { class: 'lab-entry', 'aria-pressed': String(item === active), onclick: (event) => {
      active = item; status.textContent = '';
      for (const button of list.children) button.setAttribute('aria-pressed', String(button === event.currentTarget));
      render();
    } }, el('strong', { text: item.title }), el('small', { text: `${item.subject}  ·  ${item.level}` }))));
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
  subject.addEventListener('change', filter); level.addEventListener('change', filter);
  search.addEventListener('input', filter); labels.addEventListener('change', render);
  filter();
  return { onClose() { closed = true; } };
}

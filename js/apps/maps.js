import { el } from '../utils.js';

const regions = ['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania', 'Antarctica'];
// Pedagogical viewports, not territorial definitions.
const bounds = { World: [-180, -90, 180, 90], Africa: [-27, -39, 59, 40], Asia: [24, -12, 181, 83], Europe: [-28, 33, 65, 84],
  'North America': [-180, 4, -12, 86], 'South America': [-92, -60, -30, 16], Oceania: [102, -55, 180, 12], Antarctica: [-180, -90, 180, -58] };
const colours = ['#f3c776', '#a6b6fd', '#9ee0cb', '#f6acaa', '#badd99', '#dab5e7', '#e8eff9'];

export function mount({ root, api }) {
  const canvas = el('canvas', { width: 1280, height: 700, role: 'img', 'aria-label': 'Classroom map' });
  const region = el('select', { class: 'field', 'aria-label': 'Map region' }, ['World', ...regions].map(name => el('option', { text: name })));
  const theme = el('select', { class: 'field', 'aria-label': 'Map lesson' }, [['political','Geography · countries'], ['grid','Coordinates · latitude / longitude'], ['blank','Practice · unlabelled map']].map(([value,text]) => el('option', { value, text })));
  const country = el('select', { class: 'field', 'aria-label': 'Highlight country' });
  const status = el('p', { text: 'Loading bundled maps…', role: 'status' });
  let data;
  let closed = false;
  const insert = el('button', { class: 'btn primary', text: 'Annotate on board', onclick: () => {
    if (data) api.open('whiteboard', { image: canvas.toDataURL('image/png'), asBackground: true, newPage: true, title: `${region.value} map` });
  } });
  const layout = el('div', { class: 'settings map-studio' }, el('h2', { text: 'Map Atlas' }),
    el('div', { class: 'map-controls' }, region, theme, country, insert), canvas, status,
    el('p', { text: 'Source: Natural Earth 1:110m. Simplified teaching maps; not a statement of official borders.' }));
  root.append(el('div', { class: 'app' }, layout));

  function draw() {
    if (!data) return;
    const ctx = canvas.getContext('2d');
    const [left, bottom, right, top] = bounds[region.value];
    const scale = Math.min((canvas.width - 50)/(right-left), (canvas.height - 76)/(top-bottom));
    const x = lon => (canvas.width-(right-left)*scale)/2+(lon-left)*scale;
    const y = lat => (canvas.height-(top-bottom)*scale)/2+(top-lat)*scale;
    ctx.fillStyle = '#e5f3fb'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.beginPath(); ctx.rect(x(left), y(top), (right-left)*scale, (top-bottom)*scale); ctx.clip();
    for (const [name, group, polygons] of data) {
      const selected = country.value === name && theme.value !== 'blank';
      ctx.fillStyle = selected ? '#de744e' : theme.value !== 'political' ? '#f4f1e6' : colours[regions.indexOf(group)] || '#bfcdd7';
      ctx.strokeStyle = selected ? '#8b341a' : '#667d91';
      ctx.lineWidth = selected ? 2.6 : 0.75;
      for (const polygon of polygons) {
        ctx.beginPath();
        for (const ring of polygon) {
          ring.forEach(([lon, lat], i) => { if (i) ctx.lineTo(x(lon), y(lat)); else ctx.moveTo(x(lon), y(lat)); });
          ctx.closePath();
        }
        ctx.fill('evenodd'); ctx.stroke();
      }
    }
    if (theme.value === 'grid') {
      ctx.strokeStyle = '#566d91'; ctx.fillStyle = '#263951'; ctx.font = '16px system-ui';
      for (let lon = Math.ceil(left/15)*15; lon < right; lon+=15) {
        ctx.beginPath(); ctx.moveTo(x(lon), y(top)); ctx.lineTo(x(lon), y(bottom)); ctx.stroke();
        ctx.fillText(`${Math.abs(lon)}°${lon < 0 ? 'W' : lon ? 'E' : ''}`, x(lon)+3,y(top)+16);
      }
      for (let lat = Math.ceil(bottom/15)*15; lat < top; lat+=15) {
        ctx.beginPath(); ctx.moveTo(x(left), y(lat)); ctx.lineTo(x(right), y(lat)); ctx.stroke();
        ctx.fillText(`${Math.abs(lat)}°${lat < 0 ? 'S' : lat ? 'N' : ''}`, x(left)+3,y(lat)-3);
      }
    }
    ctx.restore(); ctx.fillStyle = '#142944'; ctx.font = 'bold 22px system-ui';
    ctx.fillText(`${region.value}${country.value && theme.value !== 'blank' ? ` · ${country.value}` : ''}`, 18, 26);
    ctx.font = '14px system-ui'; ctx.fillText('Natural Earth · simplified teaching map', 18, canvas.height-12);
    status.textContent = theme.value === 'blank' ? 'Practice map · add labels and answers on the board.' : 'Choose a country to highlight, or add the map to the board.';
  }
  function countries() {
    if (!data) return;
    country.replaceChildren(el('option', { value: '', text: 'Highlight a country…' }), ...data.filter(([, group]) => region.value === 'World' || region.value === group)
      .map(([name]) => name).sort((a,b) => a.localeCompare(b)).map(text => el('option', { text })));
    draw();
  }
  region.onchange = countries;
  theme.onchange = () => { country.disabled = theme.value === 'blank'; draw(); };
  country.onchange = draw;
  import('../map-data.js').then(module => { if (!closed) { data = module.default; countries(); } }).catch(() => { status.textContent = 'The bundled map could not be loaded.'; });
  return { onClose() { closed = true; } };
}

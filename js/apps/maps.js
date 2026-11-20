import { clamp, el } from '../utils.js';

const regions = ['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania', 'Antarctica'];
const views = { Political: 'Country and covered state boundaries', Plain: 'Neutral base map', Outline: 'Printable boundary exercise',
  Simple: 'Selected area with minimal detail', Physical: 'Terrain regions, major rivers, lakes and peaks', Rivers: 'Major rivers and lakes',
  Mountains: 'Mountain ranges and selected summits', Coordinates: 'Latitude and longitude grid' };
const bounds = { World: [-180, -86, 180, 86], Africa: [-28, -39, 61, 40], Asia: [23, -14, 192, 83], Europe: [-31, 30, 67, 84],
  'North America': [-173, 4, -9, 86], 'South America': [-94, -60, -28, 16], Oceania: [101, -56, 187, 13], Antarctica: [-180, -90, 180, -55] };
const colours = ['#f3c776','#a6b6fd','#9ee0cb','#f6acaa','#badd99','#dab5e7','#e8eff9','#cbdf9a','#f1d2bb'];
const shapeCache = new WeakMap();
const imports = {};
const extended = (key, load) => imports[key] ||= load().then(module => module.default).catch(error => { delete imports[key]; throw error; });

function shape(geometry, polygon = true) {
  if (shapeCache.has(geometry)) return shapeCache.get(geometry);
  const path = new Path2D();
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  const wrapped = [Infinity, Infinity, -Infinity, -Infinity];
  for (const ring of polygon ? geometry.flat() : geometry) {
    for (let i = 0; i < ring.length; i++) {
      const [x, y] = ring[i];
      box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y);
      box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y);
      const q = x < 0 ? x + 360 : x;
      wrapped[0] = Math.min(wrapped[0], q); wrapped[2] = Math.max(wrapped[2], q);
      if (i === 0 || (!polygon && Math.abs(x - ring[i-1][0]) > 180)) path.moveTo(x,y);
      else path.lineTo(x,y);
    }
    if (polygon) path.closePath();
  }
  wrapped[1] = box[1]; wrapped[3] = box[3];
  const result = { path, box, fit: wrapped[2]-wrapped[0] < box[2]-box[0] ? wrapped : box };
  shapeCache.set(geometry, result);
  return result;
}

const option = (value, text = value) => el('option', { value, text });

export function mount({ root, api }) {
  const canvas = el('canvas', { width: 1280, height: 720, role: 'img', 'aria-label': 'Classroom map', tabindex: 0 });
  const ctx = canvas.getContext('2d');
  const region = el('select', { class: 'field', 'aria-label': 'Map region' }, ['World', ...regions].map(name => option(name)));
  const theme = el('select', { class: 'field', 'aria-label': 'Map layer' }, Object.keys(views).map(name => option(name)));
  const country = el('select', { class: 'field', 'aria-label': 'Country map' }, option('', 'Region overview'));
  const search = el('input', { class: 'field', type: 'search', placeholder: 'Find a country…', 'aria-label': 'Filter countries' });
  const status = el('p', { class: 'atlas-status', text: 'Loading bundled maps…', role: 'status' });
  const title = el('h2', { text: 'Map Atlas' });
  const reset = el('button', { class: 'btn', text: 'Reset view', onclick: () => { camera = { x: 0, y: 0, zoom: 1 }; queue(); } });
  const india = el('button', { class: 'btn atlas-shortcut', text: 'India', onclick: () => quick('Asia', 'IND') });
  const asia = el('button', { class: 'btn atlas-shortcut', text: 'Asia', onclick: () => quick('Asia') });
  const insert = el('button', { class: 'btn primary', text: 'Annotate on board', onclick: () => {
    if (!data || layerLoading) return;
    draw();
    api.open('whiteboard', { image: canvas.toDataURL('image/png'), asBackground: true, newPage: true, title: `${label()} · ${theme.value}` });
  } });
  root.append(el('div', { class: 'app' }, el('div', { class: 'settings map-studio' },
    el('header', { class: 'atlas-heading' }, el('div', {}, el('div', { class: 'hero-eyebrow', text: 'Offline classroom atlas' }), title), el('div', { class: 'atlas-shortcuts' }, india, asia)),
    el('div', { class: 'map-controls' }, region, search, country, theme), canvas,
    el('div', { class: 'map-controls atlas-footer' }, status, reset, insert),
    el('p', { class: 'atlas-credit', text: 'Natural Earth 1:50m · simplified teaching map, not an official boundary or survey. Drag to pan; scroll or use + / − to zoom.' }))));
  let data, subdivisions, physical;
  let camera = { x: 0, y: 0, zoom: 1 };
  let frame = 0, closed = false, layerLoading = false, layerError = false, loadId = 0;
  let drag;
  const selected = () => data?.find(row => row[3] === country.value);
  const label = () => selected()?.[0] || region.value;
  const queue = () => { if (!frame && !closed) frame = requestAnimationFrame(() => { frame = 0; draw(); }); };
  asia.disabled = india.disabled = insert.disabled = true;

  function populate(value = country.value) {
    if (!data) return;
    const text = search.value.toLowerCase().trim();
    const filtered = data.filter(([name, area]) => (region.value === 'World' || region.value === area) && name.toLowerCase().includes(text));
    country.replaceChildren(option('', 'Region overview'), ...filtered.map(([name,,, id]) => option(id, name)));
    if (filtered.some(row => row[3] === value)) country.value = value;
  }
  function quick(area, id = '') { search.value = ''; region.value = area; populate(id); selectionChanged(); }
  function selectionChanged() { camera = { x: 0, y: 0, zoom: 1 }; chooseLayer(); }
  async function chooseLayer() {
    const request = ++loadId; layerError = false;
    const style = theme.value;
    const isPhysical = ['Physical','Rivers','Mountains'].includes(style);
    const needsStates = style === 'Political' && !!selected();
    layerLoading = (isPhysical && !physical) || (needsStates && !subdivisions);
    insert.disabled = layerLoading || !data;
    queue();
    try {
      if (needsStates) subdivisions = await extended('states', () => import('../map-states.js'));
      if (isPhysical) physical = await extended('physical', () => import('../map-physical.js'));
    } catch {
      if (request === loadId && !closed) layerError = true;
    } finally {
      if (request === loadId && !closed) { layerLoading = false; insert.disabled = !data || layerError; queue(); }
    }
  }

  function draw() {
    if (!data) return;
    const target = selected();
    const style = theme.value;
    const political = style === 'Political';
    const minimal = style === 'Outline' || style === 'Simple';
    const landOnly = target && minimal;
    const width = canvas.width;
    const height = canvas.height;
    const box = target ? shape(target[2]).fit : bounds[region.value];
    const [left,bottom,right,top] = box;
    const mid = (top + bottom)/2;
    const ratio = clamp(Math.cos(mid * Math.PI/180), .38, 1);
    const xScale = ratio * Math.min((width-140)/Math.max(.12, (right-left)*ratio), (height-156)/Math.max(.12, top-bottom)) * camera.zoom;
    const yScale = xScale/ratio;
    const cx = (left+right)/2 + camera.x;
    const cy = mid + camera.y;
    const originX = width/2 - cx*xScale;
    const originY = (height+20)/2 + cy*yScale;
    const clip = [(24-originX)/xScale, (height-43-originY)/-yScale, (width-24-originX)/xScale, (51-originY)/-yScale];
    const water = style === 'Outline' ? '#fff' : '#e5f3fb';
    ctx.setTransform(1,0,0,1,0,0);
    ctx.fillStyle = water; ctx.fillRect(0,0,width,height);
    ctx.save(); ctx.beginPath(); ctx.rect(24,51,width-48,height-94); ctx.clip();
    const labels = [];
    function addLabel(name, point, priority = 1, colour = '#253851', icon = '') {
      if (!name || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) return;
      const [lon, lat] = point;
      if (lat < clip[1] || lat > clip[3]) return;
      const adjusted = lon + Math.round((cx-lon)/360)*360;
      if (adjusted < clip[0] || adjusted > clip[2]) return;
      labels.push({ name, x: originX + adjusted*xScale, y: originY - lat*yScale, priority, colour, icon });
    }
    function paint(geom, { polygon = true, fill, stroke, thickness = .8 } = {}) {
      const { path, box: b } = shape(geom, polygon);
      if (b[1] > clip[3] || b[3] < clip[1]) return;
      for (const shift of [-360,0,360]) {
        if (b[0]+shift > clip[2] || b[2]+shift < clip[0]) continue;
        ctx.save(); ctx.setTransform(xScale,0,0,-yScale,originX+shift*xScale,originY);
        if (fill) { ctx.fillStyle = fill; ctx.fill(path, 'evenodd'); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = thickness/yScale; ctx.stroke(path); }
        ctx.restore();
      }
    }
    for (const item of data) {
      if (landOnly && item !== target) continue;
      const [name, area, geom, id] = item;
      const hit = item === target;
      const fill = style === 'Outline' ? '#fff' : style === 'Simple' ? '#bfdcc6' : target && !hit ? '#f0f0e9' : political ? colours[(id.charCodeAt(0)+id.charCodeAt(2)) % colours.length] : '#f4efdd';
      paint(geom, { fill, stroke: style === 'Outline' ? '#17263a' : hit ? '#45536b' : '#80919d', thickness: hit ? 1.8 : .8 });
      if (political && !target && region.value !== 'World' && area === region.value) {
        const [x0,y0,x1,y1] = shape(geom).fit;
        if (Math.min((x1-x0)*xScale,(y1-y0)*yScale) > 22) addLabel(name, [(x0+x1)/2,(y0+y1)/2], 20);
      }
    }
    if (target && political) {
      for (const [id,name,geom,point] of subdivisions || []) {
        if (id !== target[3]) continue;
        paint(geom, { fill: colours[name.length % colours.length] + 'a0', stroke: '#647184', thickness: .9 });
        addLabel(name, point, 4);
      }
    }
    if (physical && ['Physical','Rivers','Mountains'].includes(style)) {
      const limit = target ? 8 : region.value === 'World' ? 3 : 5;
      if (style !== 'Rivers') {
        for (const [name,rank,geom,category] of physical.ranges) {
          if (rank > limit || (style === 'Mountains' && category !== 'Range/mtn')) continue;
          const fill = { 'Range/mtn': '#a98567a0', Plateau: '#e4c28b99', Desert: '#edce82a0', Plain: '#b4c89499' }[category];
          paint(geom, { fill, stroke: '#96774a66' });
          const [x0,y0,x1,y1] = shape(geom).fit;
          if (rank <= limit-1) addLabel(name, [(x0+x1)/2,(y0+y1)/2], 10+rank, '#6c4830');
        }
        for (const [name,rank,point,elevation] of physical.peaks) {
          if (rank <= limit) addLabel(`${name}${elevation && (target || style === 'Mountains') ? ` · ${elevation} m` : ''}`, point, rank, '#674329', '▲');
        }
      }
      if (style !== 'Mountains') {
        for (const [,rank,geom] of physical.lakes) if (rank <= limit) paint(geom, { fill: '#9fcdef', stroke: '#6ea8d3' });
        for (const [name,rank,geom] of physical.rivers) if (rank <= limit) {
          paint(geom, { polygon: false, stroke: '#3c88bd', thickness: rank <= 2 ? 2.0 : 1.15 });
          if (rank <= limit-1) {
            const part = geom.reduce((a,b) => b.length > a.length ? b : a, []);
            if (part.length) addLabel(name, part[Math.floor(part.length/2)], 14+rank, '#1d6caa');
          }
        }
      }
    }
    if (style === 'Coordinates') {
      const step = yScale > 40 ? 1 : yScale > 13 ? 5 : 15;
      ctx.strokeStyle = '#637da0a8'; ctx.lineWidth = 1; ctx.fillStyle = '#2a4a6c'; ctx.font = '14px system-ui';
      for (let lon = Math.ceil(clip[0]/step)*step; lon < clip[2]; lon+=step) {
        const x = originX + lon*xScale;
        const l = ((lon+180)%360+360)%360-180;
        ctx.beginPath(); ctx.moveTo(x,51); ctx.lineTo(x,height-43); ctx.stroke(); ctx.fillText(`${Math.abs(l)}°${l < 0 ? 'W' : l ? 'E' : ''}`, x+4,70);
      }
      for (let lat = Math.ceil(Math.max(-90,clip[1])/step)*step; lat < Math.min(90,clip[3]); lat+=step) {
        const y = originY-lat*yScale;
        ctx.beginPath(); ctx.moveTo(24,y); ctx.lineTo(width-24,y); ctx.stroke(); ctx.fillText(`${Math.abs(lat)}°${lat < 0 ? 'S' : lat ? 'N' : ''}`, 28,y-4);
      }
    }
    ctx.font = '600 15px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const placed = [];
    for (const { name,x,y,priority,colour,icon } of labels.sort((a,b) => a.priority-b.priority)) {
      const text = icon ? `${icon} ${name}` : name;
      const w = ctx.measureText(text).width + 14;
      const rect = [x-w/2,y-10,x+w/2,y+10];
      if (rect[0]<26 || rect[2]>width-26 || rect[1]<53 || rect[3]>height-45 || placed.some(a => a[0]<rect[2] && a[2]>rect[0] && a[1]<rect[3] && a[3]>rect[1])) continue;
      placed.push(rect);
      if (priority < 12 && icon) { ctx.fillStyle = colour; ctx.fillRect(x-2,y-4,4,4); }
      ctx.lineWidth = 4; ctx.strokeStyle = '#fffffff0'; ctx.strokeText(text,x,y); ctx.fillStyle = colour; ctx.fillText(text,x,y);
    }
    ctx.restore();
    ctx.fillStyle = '#142944'; ctx.font = 'bold 26px system-ui'; ctx.fillText(`${label()} · ${style}`, 24,36);
    ctx.font = '15px system-ui'; ctx.fillText('Natural Earth · illustrative boundaries and features',24,height-18);
    ctx.textAlign = 'right'; ctx.fillText(views[style],width-24,height-18); ctx.textAlign = 'start';
    const extra = target && political && subdivisions && !subdivisions.some(x => x[0] === target[3]) ? ' · No subdivisions in the bundled source' : '';
    const text = layerLoading ? 'Loading map layer…' : layerError ? 'Layer unavailable. Switch layers or reload the app.' : `${label()} · ${views[style]}${extra}`;
    if (status.textContent !== text) status.textContent = text;
    canvas.setAttribute('aria-label', `${label()} ${style.toLowerCase()} map`);
  }

  region.onchange = () => { search.value = ''; populate(''); selectionChanged(); };
  country.onchange = selectionChanged;
  theme.onchange = chooseLayer;
  search.oninput = () => { const old = country.value; populate(old); if (country.value !== old) selectionChanged(); };
  search.onkeydown = e => { if (e.key === 'Enter' && country.options.length === 2) { country.selectedIndex = 1; selectionChanged(); } };
  const zoom = f => { camera.zoom = clamp(camera.zoom*f,.85,7); queue(); };
  canvas.addEventListener('wheel', e => { if (!e.ctrlKey && !e.metaKey && document.activeElement !== canvas) return; e.preventDefault(); zoom(e.deltaY < 0 ? 1.12 : 1/1.12); }, { passive: false });
  canvas.addEventListener('keydown', e => { if (['+','=','-'].includes(e.key)) { e.preventDefault(); zoom(e.key === '-' ? .85 : 1.18); } });
  canvas.addEventListener('pointerdown', e => { if (e.button !== 0) return; canvas.setPointerCapture(e.pointerId); drag = [e.clientX,e.clientY]; });
  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    const b = selected() ? shape(selected()[2]).fit : bounds[region.value];
    camera.x = clamp(camera.x-(e.clientX-drag[0])*Math.max(.12,b[2]-b[0])/canvas.clientWidth/camera.zoom,-170,170);
    camera.y = clamp(camera.y+(e.clientY-drag[1])*Math.max(.12,b[3]-b[1])/canvas.clientHeight/camera.zoom,-75,75);
    drag = [e.clientX,e.clientY]; queue();
  });
  canvas.addEventListener('lostpointercapture', () => { drag = null; });
  extended('countries', () => import('../map-data.js')).then(rows => {
    if (closed) return;
    data = rows.slice().sort((a,b) => a[0].localeCompare(b[0]));
    populate(); asia.disabled = india.disabled = insert.disabled = false; queue();
  }).catch(() => { status.textContent = 'The bundled atlas could not be loaded.'; });
  return { onClose() { closed = true; cancelAnimationFrame(frame); } };
}

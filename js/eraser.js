// Clip a polyline against a circular eraser, keeping pressure on the cut ends.
export function eraseStroke(points, p, radius) {
  const rr = radius * radius;
  const inside = a => (a.x - p.x) ** 2 + (a.y - p.y) ** 2 < rr;
  if (points.length < 2) return points.some(inside) ? [] : null;
  const result = [];
  let part = [];
  let changed = false;
  const end = () => { if (part.length) result.push(part); part = []; };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (Math.min(a.x,b.x)>p.x+radius || Math.max(a.x,b.x)<p.x-radius || Math.min(a.y,b.y)>p.y+radius || Math.max(a.y,b.y)<p.y-radius) {
      if (!part.length) part.push(a);
      part.push(b); continue;
    }
    const x = a.x - p.x, y = a.y - p.y;
    const dx = b.x - a.x, dy = b.y - a.y;
    const aa = dx * dx + dy * dy, bb = x * dx + y * dy, cc = x * x + y * y - rr;
    const det = bb * bb - aa * cc;
    const delta = aa && det > 0 ? Math.sqrt(det) : 0;
    const lo = Math.max(0, (-bb - delta) / aa), hi = Math.min(1, (-bb + delta) / aa);
    if ((!aa && cc < 0) || (delta > 0 && hi - lo > 1e-9)) {
      const at = t => ({ x: a.x + dx * t, y: a.y + dy * t, p: (a.p ?? .5) + ((b.p ?? .5) - (a.p ?? .5)) * t });
      changed = true;
      if (aa && lo > 0) { if (!part.length) part.push(a); part.push(at(lo)); }
      end();
      if (aa && hi < 1) part.push(at(hi), b);
    } else {
      if (!part.length) part.push(a);
      part.push(b);
    }
  }
  end();
  return changed ? result : null;
}

// Indexed for the duration of a gesture. A slot preserves drawing order even when a stroke splits.
export function createEraserIndex(objects, getBounds, padding, cell = 128) {
  const grid = new Map();
  const large = [];
  const slots = objects.map(o => [o]);
  const boxes = objects.map(o => {
    const b = getBounds(o);
    return b && [b.x-padding,b.y-padding,b.x+b.w+padding,b.y+b.h+padding];
  });
  for (let i=0;i<boxes.length;i++) {
    const b = boxes[i];
    if (!b || !b.every(Number.isFinite)) continue;
    const x0 = Math.floor(b[0]/cell), y0 = Math.floor(b[1]/cell), x1 = Math.floor(b[2]/cell), y1 = Math.floor(b[3]/cell);
    if ((x1-x0+1)*(y1-y0+1)>64) { large.push(i); continue; }
    for (let y=y0;y<=y1;y++) for (let x=x0;x<=x1;x++) {
      const key = `${x},${y}`;
      if (!grid.has(key)) grid.set(key,[]);
      grid.get(key).push(i);
    }
  }
  return {
    visit(point, clip) {
      let changed = false;
      const key = `${Math.floor(point.x/cell)},${Math.floor(point.y/cell)}`;
      const visitSlot = (i) => {
        const b = boxes[i];
        if (point.x < b[0] || point.x > b[2] || point.y < b[1] || point.y > b[3] || !slots[i].length) return;
        let edited = false;
        const next = slots[i].flatMap(o => {
          const remains = clip(o, point);
          if (remains === null) return [o];
          edited = true; return remains;
        });
        if (edited) { slots[i] = next; changed = true; }
      };
      for (const i of grid.get(key) || []) visitSlot(i);
      for (const i of large) visitSlot(i);
      return changed;
    },
    objects: () => slots.flat(),
  };
}

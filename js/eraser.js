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
    const x = a.x - p.x, y = a.y - p.y;
    const dx = b.x - a.x, dy = b.y - a.y;
    const aa = dx * dx + dy * dy, bb = x * dx + y * dy, cc = x * x + y * y - rr;
    const det = bb * bb - aa * cc;
    const delta = aa && det > 0 ? Math.sqrt(det) : 0;
    const lo = Math.max(0, (-bb - delta) / aa), hi = Math.min(1, (-bb + delta) / aa);
    const at = t => ({ x: a.x + dx * t, y: a.y + dy * t, p: (a.p ?? .5) + ((b.p ?? .5) - (a.p ?? .5)) * t });
    if ((!aa && cc < 0) || (delta > 0 && hi > lo)) {
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

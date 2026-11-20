import { clamp } from './utils.js';
import { EMOJI_SVG } from './emoji-data.js';

function roundRect(c, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}

function truncate(str, n) {
  const t = String(str || '');
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function wrapText(c, text, x, y, maxWidth, lineHeight, maxLines = 3) {
  const words = String(text || '').split(/\s+/);
  let line = '';
  let lines = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (c.measureText(test).width > maxWidth && line) {
      c.fillText(line, x, y + lines * lineHeight);
      line = words[i];
      lines++;
      if (lines >= maxLines) return;
    } else {
      line = test;
    }
  }
  if (line) c.fillText(line, x, y + lines * lineHeight);
}

function strokePath(c, o) {
  const pts = o.points;
  if (pts.length === 1) {
    c.beginPath();
    c.arc(pts[0].x, pts[0].y, Math.max(c.lineWidth / 2, 0.6), 0, Math.PI * 2);
    c.fillStyle = c.strokeStyle;
    c.fill();
    return;
  }
  if (o.pressured) {
    // variable width stroke: each segment uses its own pressure value
    const base = o.size;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const pr = clamp((a.p ?? 0.5) * 0.45 + (b.p ?? 0.5) * 0.55, 0, 1);
      c.lineWidth = Math.max(0.6, base * (0.3 + pr * 1.35));
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.stroke();
    }
    return;
  }
  c.beginPath();
  c.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    c.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  const last = pts[pts.length - 1];
  c.lineTo(last.x, last.y);
  c.stroke();
}

export function paintBoardObject(c, o, getImage) {
  c.save();
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.strokeStyle = o.color;
  c.fillStyle = o.color;
  if (o.type === 'stroke') {
    const hi = o.tool === 'highlighter';
    c.lineWidth = hi ? o.size * 3.2 : o.size;
    c.globalAlpha = hi ? 0.32 : 1;
    if (o.tool === 'laser') {
      c.shadowColor = '#ff3b5c';
      c.shadowBlur = 18;
      c.strokeStyle = '#ff3b5c';
      c.lineWidth = o.size + 1;
    }
    strokePath(c, o);
  } else if (o.type === 'shape') {
    c.lineWidth = o.size;
    c.globalAlpha = 1;
    const { x0, y0, x1, y1 } = o;
    if (o.shape === 'line') {
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    } else if (o.shape === 'arrow') {
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      const ang = Math.atan2(y1 - y0, x1 - x0);
      const head = Math.max(10, o.size * 3.2);
      c.beginPath();
      c.moveTo(x1, y1);
      c.lineTo(x1 - head * Math.cos(ang - 0.42), y1 - head * Math.sin(ang - 0.42));
      c.lineTo(x1 - head * Math.cos(ang + 0.42), y1 - head * Math.sin(ang + 0.42));
      c.closePath();
      c.fill();
    } else if (o.shape === 'rect') {
      c.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    } else if (o.shape === 'ellipse') {
      c.beginPath();
      c.ellipse((x0 + x1) / 2, (y0 + y1) / 2, Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, 0, 0, Math.PI * 2);
      c.stroke();
    }
  } else if (o.type === 'text') {
    c.font = `600 ${o.fontSize}px Inter, "Segoe UI", system-ui, sans-serif`;
    c.textBaseline = 'top';
    c.fillStyle = o.color;
    String(o.text).split('\n').forEach((line, i) => {
      c.fillText(line, o.x, o.y + i * o.fontSize * 1.28);
    });
  } else if (o.type === 'image') {
    const img = getImage(o.src);
    if (img && img.complete && img.naturalWidth) {
      c.drawImage(img, o.x, o.y, o.w, o.h);
    } else {
      c.fillStyle = 'rgba(127,127,127,.15)';
      c.fillRect(o.x, o.y, o.w, o.h);
    }
  } else if (o.type === 'emoji') {
    const src = EMOJI_SVG[o.char];
    const art = src ? getImage(src) : null;
    if (art && art.complete && art.naturalWidth) {
      c.drawImage(art, o.x - o.size / 2, o.y - o.size / 2, o.size, o.size);
    } else {
      c.fillStyle = o.color || (document.documentElement.dataset.theme === 'light' ? '#0f172a' : '#ffffff');
      c.font = `${o.size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(o.char, o.x, o.y);
    }
  } else if (o.type === 'card') {
    const light = document.documentElement.dataset.theme === 'light';
    c.shadowColor = 'rgba(0,0,0,.34)';
    c.shadowBlur = 22;
    c.shadowOffsetY = 10;
    roundRect(c, o.x, o.y, o.w, o.h, 18);
    c.fillStyle = light ? '#ffffff' : '#151c31';
    c.fill();
    c.shadowColor = 'transparent';
    c.shadowBlur = 0;
    c.shadowOffsetY = 0;
    roundRect(c, o.x, o.y, o.w, o.h, 18);
    c.strokeStyle = 'rgba(99,102,241,.7)';
    c.lineWidth = 2;
    c.stroke();
    c.fillStyle = 'rgba(99,102,241,.95)';
    roundRect(c, o.x, o.y + 6, 6, o.h - 12, 3);
    c.fill();
    c.beginPath();
    c.arc(o.x + 46, o.y + 44, 18, 0, Math.PI * 2);
    c.fillStyle = 'rgba(99,102,241,.18)';
    c.fill();
    c.strokeStyle = '#6366f1';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(o.x + 46, o.y + 44, 18, 0, Math.PI * 2);
    c.moveTo(o.x + 28, o.y + 44);
    c.lineTo(o.x + 64, o.y + 44);
    c.stroke();
    c.save();
    c.beginPath();
    c.arc(o.x + 46, o.y + 44, 18, 0, Math.PI * 2);
    c.clip();
    c.beginPath();
    c.ellipse(o.x + 46, o.y + 44, 8, 18, 0, 0, Math.PI * 2);
    c.stroke();
    c.restore();
    c.fillStyle = light ? '#0f172a' : '#eef2ff';
    c.font = '700 19px Inter, "Segoe UI", system-ui, sans-serif';
    wrapText(c, o.title || 'Web page', o.x + 78, o.y + 38, o.w - 104, 24, 2);
    c.fillStyle = '#6366f1';
    c.font = '600 12px Inter, "Segoe UI", system-ui, sans-serif';
    c.fillText(truncate(o.url, 52), o.x + 78, o.y + 62);
    if (o.desc) {
      c.fillStyle = light ? '#475569' : '#a9b2cd';
      c.font = '400 14px Inter, "Segoe UI", system-ui, sans-serif';
      wrapText(c, o.desc, o.x + 24, o.y + 100, o.w - 48, 20, Math.max(1, Math.floor((o.h - 140) / 20)));
    }
    c.fillStyle = light ? '#8b96b8' : '#7480a0';
    c.font = '700 10.5px Inter, "Segoe UI", system-ui, sans-serif';
    c.fillText('SAVED REFERENCE', o.x + 24, o.y + o.h - 18);
  }
  c.restore();
}


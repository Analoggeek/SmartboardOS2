export const templates = {
  blueprint: { name:'Blueprint', fill:'#132c55', ink:'#ffffff', pattern:'blueprint', detail:'Engineering & diagrams' },
  cornell: { name:'Cornell Notes', fill:'#fcf6e8', ink:'#17223b', pattern:'cornell', detail:'Cues, notes & summary' },
  coordinate: { name:'Coordinate Plane', fill:'#f3f7ff', ink:'#17223b', pattern:'coordinate', detail:'Axes & graphing' },
  storyboard: { name:'Storyboard', fill:'#fff7fa', ink:'#341c37', pattern:'storyboard', detail:'Six-panel visual planning' },
  hex: { name:'Hex Grid', fill:'#112c30', ink:'#ffffff', pattern:'hex', detail:'Science & design' },
  kraft: { name:'Warm Paper', fill:'#f4ead4', ink:'#34291d', pattern:'kraft', detail:'Reading & free writing' },
};
export const BG_NAMES = { plain:'Plain', grid:'Grid', dots:'Dots', lines:'Vertical lines', ruled:'Ruled paper', music:'Music staves',
  graph:'Graph paper', handwriting:'Handwriting', isometric:'Isometric', white:'Whiteboard', chalk:'Green chalkboard', black:'Blackboard',
  ...Object.fromEntries(Object.entries(templates).map(([id, t]) => [id, t.name])) };
export const BG_FILLS = { white:'#ffffff', chalk:'#143b31', black:'#101114', ...Object.fromEntries(Object.entries(templates).map(([id,t]) => [id,t.fill])) };

function paintTemplate(c, rect, type, px) {
  const { x,y,w,h } = rect, r=x+w,b=y+h;
  const line = (x1,y1,x2,y2) => { c.moveTo(x1,y1); c.lineTo(x2,y2); };
  c.save(); c.beginPath(); c.rect(x,y,w,h); c.clip();
  c.lineWidth=px;
  if (type === 'blueprint' || type === 'coordinate') {
    const step=24;
    c.strokeStyle=type==='blueprint'?'#9ab8e645':'#839bc457'; c.beginPath();
    for (let i=Math.floor(x/step)*step;i<=r;i+=step) line(i,y,i,b);
    for (let j=Math.floor(y/step)*step;j<=b;j+=step) line(x,j,r,j);
    c.stroke();
    c.strokeStyle=type==='blueprint'?'#a3c2ff70':'#465e9f'; c.lineWidth=1.65*px; c.beginPath();
    if (type==='blueprint') {
      for (let i=Math.floor(x/120)*120;i<=r;i+=120) line(i,y,i,b);
      for (let j=Math.floor(y/120)*120;j<=b;j+=120) line(x,j,r,j);
    } else {
      // A stable origin in board coordinates, including when the board is panned or exported.
      const ox=192,oy=240;
      line(x,oy,r,oy);line(ox,y,ox,b);
      for (let i=Math.floor(x/step)*step;i<=r;i+=step) line(i,oy-4*px,i,oy+4*px);
      for (let j=Math.floor(y/step)*step;j<=b;j+=step) line(ox-4*px,j,ox+4*px,j);
    }
    c.stroke();
  } else if (type==='hex') {
    const radius=22, dx=radius*1.5, dy=radius*Math.sqrt(3);
    c.strokeStyle='#8de3d454';c.beginPath();
    for (let i=Math.floor(x/dx)-1;i<=Math.ceil(r/dx)+1;i++) for(let j=Math.floor(y/dy)-1;j<=Math.ceil(b/dy)+1;j++) {
      const cx=i*dx, cy=(j+(Math.abs(i)%2)*.5)*dy;
      for (let k=0;k<6;k++) {const a=k*Math.PI/3;const vx=cx+radius*Math.cos(a),vy=cy+radius*Math.sin(a);if(k)c.lineTo(vx,vy);else c.moveTo(vx,vy);}
      c.closePath();
    }
    c.stroke();
  } else if (type==='cornell') {
    const left=x+18*px,right=r-18*px,top=y+Math.min(84*px,h*.19),bottom=b-Math.min(98*px,h*.22),cut=x+w*.28;
    c.strokeStyle='#af987262';c.beginPath();
    for(let j=top+30*px;j<bottom;j+=30*px) line(left,j,right,j);
    c.stroke();c.strokeStyle='#a17e55'; c.beginPath();c.rect(left,top,Math.max(1,right-left),Math.max(1,bottom-top));line(cut,top,cut,bottom);c.stroke();
    c.fillStyle='#705638';c.font=`600 ${13*px}px system-ui`;c.fillText('CUES',left+10*px,top-8*px);c.fillText('NOTES',cut+10*px,top-8*px);c.fillText('SUMMARY',left+10*px,bottom+20*px);
  } else if (type==='storyboard') {
    const cols=w/h < .85 ? 2 : 3, rows=6/cols, gap=15*px, pw=Math.max(4,(w-gap*(cols+1))/cols), ph=Math.max(4,(h-gap*(rows+2))/rows);
    c.strokeStyle='#a67591';c.fillStyle='#76526e';c.font=`600 ${12*px}px system-ui`;
    for(let i=0;i<6;i++){const sx=x+gap+(i%cols)*(pw+gap),sy=y+gap*2+Math.floor(i/cols)*(ph+gap);c.strokeRect(sx,sy,pw,ph);c.fillText(String(i+1).padStart(2,'0'),sx+9*px,sy+17*px);}
  } else if (type==='kraft') {
    c.fillStyle='#916d4528';
    for(let j=Math.floor(y/18)*18;j<b;j+=18) for(let i=Math.floor(x/18)*18;i<r;i+=18) {c.fillRect(i,j,1.3*px,1.3*px);}
  }
  c.restore();
}

export function templatePreview(id) {
  const c=document.createElement('canvas');c.width=210;c.height=124;c.className='board-template-preview';c.setAttribute('aria-hidden','true');
  const ctx=c.getContext('2d');ctx.fillStyle=BG_FILLS[id]||'#202948';ctx.fillRect(0,0,c.width,c.height);
  const tiny = ['coordinate','blueprint','hex'].includes(id);
  if(tiny){ctx.scale(.46,.46);ctx.translate(0,-100);paintBgPattern(ctx,{x:0,y:100,w:c.width/.46,h:c.height/.46},id,false,1.5);}
  else paintBgPattern(ctx,{x:0,y:0,w:c.width,h:c.height},id,false,.75);
  return c;
}

export function paintBgPattern(c, rect, bgMode, light, px = 1) {
    if (templates[bgMode]?.pattern) return paintTemplate(c, rect, templates[bgMode].pattern, px);
    if (bgMode === 'plain' || BG_FILLS[bgMode]) return;
    const col = light ? 'rgba(16,24,46,0.10)' : 'rgba(255,255,255,0.085)';
    c.save();
    c.strokeStyle = col;
    c.fillStyle = col;
    c.lineWidth = px;
    const x0 = Math.floor(rect.x / 40) * 40;
    const y0 = Math.floor(rect.y / 40) * 40;
    const x1 = rect.x + rect.w;
    const y1 = rect.y + rect.h;
    if (['graph', 'handwriting', 'isometric'].includes(bgMode)) {
      c.beginPath();
      const step = bgMode === 'graph' ? 20 : 36;
      for (let y = Math.floor(rect.y / step) * step; y < y1; y += step) {
        c.moveTo(rect.x, y); c.lineTo(x1, y);
        if (bgMode === 'handwriting') { c.moveTo(rect.x, y + step / 2); c.lineTo(x1, y + step / 2); }
      }
      if (bgMode === 'graph') {
        for (let x = Math.floor(rect.x / step) * step; x < x1; x += step) { c.moveTo(x, rect.y); c.lineTo(x, y1); }
      } else if (bgMode === 'isometric') {
        const span = rect.h / Math.sqrt(3);
        for (let x = Math.floor((rect.x - span) / step) * step; x < x1 + span; x += step) {
          c.moveTo(x, rect.y); c.lineTo(x + span, y1);
          c.moveTo(x, rect.y); c.lineTo(x - span, y1);
        }
      }
      c.stroke();
    } else if (bgMode === 'grid' || bgMode === 'lines') {
      c.beginPath();
      for (let x = x0; x < x1; x += 40) { c.moveTo(x, rect.y); c.lineTo(x, y1); }
      if (bgMode === 'grid') for (let y = y0; y < y1; y += 40) { c.moveTo(rect.x, y); c.lineTo(x1, y); }
      c.stroke();
    } else if (bgMode === 'dots') {
      for (let x = x0; x < x1; x += 40) {
        for (let y = y0; y < y1; y += 40) {
          c.beginPath();
          c.arc(x, y, 1.4 * px, 0, Math.PI * 2);
          c.fill();
        }
      }
    } else if (bgMode === 'ruled') {
      c.beginPath();
      for (let y = y0; y < y1; y += 44) { c.moveTo(rect.x, y); c.lineTo(x1, y); }
      c.stroke();
      c.strokeStyle = light ? 'rgba(239,68,68,0.28)' : 'rgba(248,113,113,0.34)';
      c.beginPath();
      c.moveTo(72, rect.y);
      c.lineTo(72, y1);
      c.stroke();
    } else if (bgMode === 'music') {
      c.beginPath();
      for (let base = Math.floor(rect.y / 96) * 96; base < y1; base += 96) {
        for (let i = 0; i < 5; i++) {
          const y = base + i * 14;
          if (y < rect.y) continue;
          c.moveTo(rect.x, y);
          c.lineTo(x1, y);
        }
      }
      c.stroke();
    }
    c.restore();
  }


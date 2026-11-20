/* Static OOXML slide rendering. Never executes embedded content or follows external relations. */
import { unzipSync, strFromU8 } from '../vendor/fflate/fflate.js';

const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const XML_PATH = /^ppt\/(?:presentation\.xml|_rels\/presentation\.xml\.rels|(?:slides|slideLayouts|slideMasters|theme)\/(?:_rels\/)?[a-z0-9_.-]+\.xml(?:\.rels)?)$/i;
const MEDIA_PATH = /^ppt\/media\/[a-z0-9_. -]+\.(?:png|jpe?g|webp|gif)$/i;
const MB = 1024 * 1024;
const MAX_SLIDES = 200;
const kids = (node, key) => [...(node?.children || [])].filter(n => !key || n.localName === key);
const child = (node, key) => kids(node, key)[0];
const all = (node, key) => node ? [...node.getElementsByTagNameNS('*', key)] : [];
const attr = (node,key) => node?.getAttribute(key) ?? '';
const num = (node,key,fallback=0) => {
  const val = attr(node,key);
  return val && Number.isFinite(Number(val)) ? Math.min(1e9,Math.max(-1e9, Number(val))) : fallback;
};
const flag = (node,key) => ['1','true'].includes(attr(node,key));
const rid = (node,key) => node?.getAttributeNS(REL,key) || attr(node,`r:${key}`);

export function localPart(source, target) {
  if (!target || /[\\?#:%\x00-\x1f]/.test(target)) return '';
  const parts = target.startsWith('/') ? [] : source.split('/').slice(0,-1);
  for (const part of target.split('/')) {
    if (part === '..') { if (!parts.length) return ''; parts.pop(); }
    else if (part && part !== '.') parts.push(part);
  }
  const path = parts.join('/');
  return XML_PATH.test(path) || MEDIA_PATH.test(path) ? path : '';
}

function zipParts(input) {
  let total = 0, count = 0;
  const seen = new Set();
  return unzipSync(input, { filter({name,originalSize}) {
    const media = MEDIA_PATH.test(name);
    if (!media && !XML_PATH.test(name)) return false;
    if (seen.has(name) || ++count > 3000 || originalSize > (media ? 18 : 3)*MB || (total += originalSize) > 100*MB) throw Error('PowerPoint is too large or invalid. Save a PDF copy to import it.');
    seen.add(name); return true;
  } });
}
const colours = { dk1:'#101828',lt1:'#ffffff',dk2:'#172d4d',lt2:'#e8eef7',accent1:'#316bc4',accent2:'#b94943',accent3:'#389270',accent4:'#813ca5',accent5:'#3c7d9d',accent6:'#d8873c' };
const mapColour = { tx1:'dk1',tx2:'dk2',bg1:'lt1',bg2:'lt2',hlink:'accent1',folHlink:'accent4' };
const knownRGB = hex => /^[0-9a-f]{6}$/i.test(hex) ? `#${hex}` : null;
function colour(node, theme, fallback) {
  for (const item of kids(node)) {
    const value = attr(item,'val');
    if (item.localName === 'srgbClr') return knownRGB(value) || fallback;
    if (item.localName === 'sysClr') return knownRGB(attr(item,'lastClr')) || fallback;
    if (item.localName === 'schemeClr') return theme[mapColour[value] || value] || fallback;
  }
  return fallback;
}
function paintFill(ctx, properties, theme, rect, fallback) {
  if (!properties) return fallback;
  if (child(properties,'noFill')) return null;
  const solid = child(properties,'solidFill');
  if (solid) return colour(solid,theme,fallback);
  const stops = all(child(properties,'gradFill'),'gs');
  if (stops.length) {
    const g = ctx.createLinearGradient(rect.x,rect.y,rect.x+rect.w,rect.y+rect.h);
    for (const s of stops) g.addColorStop(Math.min(1,Math.max(0,num(s,'pos')/100000)),colour(s,theme,'#ffffff'));
    return g;
  }
  return fallback;
}
function bounds(geom, scale) {
  const off=child(geom,'off'), size=child(geom,'ext');
  if (!off || !size) return null;
  return { x:num(off,'x')*scale,y:num(off,'y')*scale,w:Math.max(0,num(size,'cx')*scale),h:Math.max(0,num(size,'cy')*scale) };
}
function placeholder(shape) { return all(shape,'ph')[0]; }
function matchPlaceholder(list, shape) {
  const p = placeholder(shape);
  if (!p) return null;
  const idx = attr(p,'idx'), type = attr(p,'type') || 'body';
  return list.find(x => idx && attr(placeholder(x),'idx') === idx) || list.find(x => (attr(placeholder(x),'type') || 'body') === type);
}
const properties = shape => child(shape,'spPr');
const tx = shape => child(shape,'txBody');
const rootShapes = slide => kids(child(child(slide,'cSld'),'spTree'));

function shapePath(ctx, name, {w,h}) {
  ctx.beginPath();
  if (name === 'ellipse') ctx.ellipse(w/2,h/2,w/2,h/2,0,0,2*Math.PI);
  else if (name === 'triangle' || name === 'rtTriangle') { ctx.moveTo(name==='triangle' ? w/2 : 0,0); ctx.lineTo(w,h); ctx.lineTo(0,h); ctx.closePath(); }
  else if (name === 'diamond') { ctx.moveTo(w/2,0); ctx.lineTo(w,h/2); ctx.lineTo(w/2,h); ctx.lineTo(0,h/2); ctx.closePath(); }
  else if (name === 'line' || name.includes('Connector')) { ctx.moveTo(0,0); ctx.lineTo(w,h); }
  else if (name === 'roundRect') ctx.roundRect(0,0,w,h,Math.min(w,h)*.16);
  else ctx.rect(0,0,w,h);
}
function drawText(ctx, node, inherited, rect, theme, scale, type, warnings) {
  const body = child(node,'bodyPr'), base = 12700 * scale;
  const margin = (k, fallback) => Math.max(0,num(body,k,fallback)*scale);
  const left=margin('lIns',91440), top=margin('tIns',45720), right=margin('rIns',91440), bottom=margin('bIns',45720);
  const maxWidth = Math.max(1,rect.w-left-right);
  const rows = [];
  const isTitle = /title/i.test(type);
  for (const p of kids(node,'p')) {
    const style = child(p,'pPr'), level = Math.min(8,num(style,'lvl'));
    const levelStyle = child(child(inherited,'lstStyle'),`lvl${level+1}pPr`);
    const def = child(style,'defRPr') || child(levelStyle,'defRPr');
    const alignment = attr(style,'algn') || attr(levelStyle,'algn') || 'l';
    const bullet = child(style,'buNone') ? '' : attr(child(style,'buChar') || child(levelStyle,'buChar'),'char');
    const indent = Math.max(0,num(style,'marL',num(levelStyle,'marL'))*scale);
    const lines = []; let line = [], lineW = 0, lineHeight = 0;
    const finish = () => { lines.push({ fragments:line, width:lineW, height: lineHeight || (isTitle ? 31 : 18)*base*1.25 }); line=[];lineW=0;lineHeight=0; };
    function append(text, own) {
      const size = Math.max(3,Math.min(300,num(own,'sz',num(def,'sz',isTitle ? 3400 : 2000))/100*base));
      const bold = own?.hasAttribute('b') ? flag(own,'b') : flag(def,'b') || isTitle;
      const face = attr(child(own,'latin') || child(def,'latin'),'typeface');
      const font = `${flag(own,'i') ? 'italic ' : ''}${bold?'700 ':'400 '}${size}px ${face && !face.startsWith('+') ? JSON.stringify(face) : 'system-ui'}, sans-serif`;
      const color = colour(child(own,'solidFill'),theme,colour(child(def,'solidFill'),theme,theme.dk1));
      ctx.font = font;
      for (let token of text.match(/\s+|\S+/gu) || []) {
        let width = ctx.measureText(token).width;
        if (lineW + width > maxWidth-indent && line.length) { finish(); if (!token.trim()) continue; }
        if (width > maxWidth && token.length > 1) {
          for (const ch of token) { const w=ctx.measureText(ch).width; if (lineW+w>maxWidth-indent && line.length) finish(); line.push({text:ch,font,color,width:w}); lineW+=w; lineHeight=Math.max(lineHeight,size*1.23); }
          continue;
        }
        line.push({text:token,font,color,width});lineW+=width;lineHeight=Math.max(lineHeight,size*1.23);
      }
    }
    if (bullet) append(`${bullet} `,def);
    for (const r of kids(p)) {
      if (r.localName === 'br') finish();
      if (r.localName === 'r' || r.localName === 'fld') append(child(r,'t')?.textContent?.slice(0,18000) || '',child(r,'rPr'));
    }
    finish();
    for (const l of lines) rows.push({...l,indent,alignment});
  }
  const height = rows.reduce((n,l)=>n+l.height,0), free = Math.max(0,rect.h-top-bottom-height);
  const anchor = attr(body,'anchor') || attr(child(inherited,'bodyPr'),'anchor');
  let y = top + (anchor==='ctr' ? free/2 : anchor==='b' ? free : 0);
  ctx.save(); ctx.beginPath(); ctx.rect(0,0,rect.w,rect.h); ctx.clip(); ctx.textBaseline='top';
  for (const row of rows) {
    let x=left+row.indent;
    if (row.alignment==='ctr') x += Math.max(0,(maxWidth-row.indent-row.width)/2);
    if (row.alignment==='r') x += Math.max(0,maxWidth-row.indent-row.width);
    for (const part of row.fragments) { ctx.font=part.font;ctx.fillStyle=part.color;ctx.fillText(part.text,x,y);x+=part.width; }
    y+=row.height;
    if (y>rect.h) { warnings.add('text overflow'); break; }
  }
  ctx.restore();
}

export async function pptxToPdf(input, { progress = () => {}, fileId } = {}) {
  const parts = zipParts(input), cache=new Map(), warnings=new Set();
  const parse = path => {
    if (!parts[path]) return null;
    if (!cache.has(path)) {
      const xml = strFromU8(parts[path]);
      if (/<!DOCTYPE/i.test(xml)) throw Error('PowerPoint parts must not contain a document type declaration.');
      const doc = new DOMParser().parseFromString(xml,'application/xml');
      if (all(doc,'parsererror').length) throw Error('Invalid PowerPoint XML.');
      cache.set(path,doc.documentElement);
    }
    return cache.get(path);
  };
  const rels = path => {
    const dirs=path.split('/'), name=dirs.pop();
    const data=parse([...dirs,'_rels',`${name}.rels`].join('/'));
    return new Map(kids(data,'Relationship').filter(x=>attr(x,'TargetMode') !== 'External').map(x=>[attr(x,'Id'),{path:localPart(path,attr(x,'Target')),type:attr(x,'Type').split('/').at(-1)}]));
  };
  const relationshipOf = (map,type) => [...map.values()].find(x=>x.type===type)?.path || '';
  const deckPath = 'ppt/presentation.xml', deck=parse(deckPath), order=all(deck,'sldId'), deckRels=rels(deckPath);
  const slides = order.length ? order.map(id=>deckRels.get(rid(id,'id'))?.path || '') : Object.keys(parts).filter(p=>/^ppt\/slides\/slide\d+\.xml$/i.test(p)).sort((a,b)=>a.localeCompare(b,'en',{numeric:true}));
  if (!slides.length || slides.length>MAX_SLIDES || slides.some(x=>!/^ppt\/slides\/[^/]+\.xml$/i.test(x) || !parts[x])) throw Error('Invalid deck or more than 200 slides. Split it or export to PDF first.');
  const size=child(deck,'sldSz'), ew=num(size,'cx',12192000), eh=num(size,'cy',6858000);
  if (ew<1 || eh<1 || ew/eh<.12 || ew/eh>8) throw Error('Unsupported slide size');
  const scale=1440/Math.max(ew,eh), width=Math.round(ew*scale), height=Math.round(eh*scale);
  const orientation=width>=height?'landscape':'portrait';
  const canvas=document.createElement('canvas'); canvas.width=width; canvas.height=height;
  const ctx=canvas.getContext('2d',{alpha:false});
  const pdf=new window.jspdf.jsPDF({unit:'pt',format:[width/1.5,height/1.5],orientation,compress:true});
  if (fileId) pdf.setFileId(fileId);
  let imageBytes=0;
  async function drawPicture(shape, map, {w,h}) {
    const fill=child(shape,'blipFill');
    const path=map.get(rid(child(fill,'blip'),'embed'))?.path;
    if (!path || !MEDIA_PATH.test(path) || !parts[path]) { warnings.add('linked or vector images');return; }
    const extension=path.split('.').at(-1).toLowerCase();
    const img=new Image();
    const url=URL.createObjectURL(new Blob([parts[path]],{type:`image/${extension==='jpg'?'jpeg':extension}`}));
    img.src=url;
    try {
      await img.decode();
      const clip=child(fill,'srcRect'), crop=k=>Math.max(0,Math.min(.99,num(clip,k)/100000));
      const sx=img.naturalWidth*crop('l'), sy=img.naturalHeight*crop('t');
      const sw=img.naturalWidth*(1-crop('r'))-sx, sh=img.naturalHeight*(1-crop('b'))-sy;
      if (sw>0&&sh>0) ctx.drawImage(img,sx,sy,sw,sh,0,0,w,h);
    } catch { warnings.add('image decoding'); } finally { URL.revokeObjectURL(url); }
  }
  async function paint(shapes,map,theme,inherited=[],decorative=false,depth=0) {
    if (depth>16) { warnings.add('nested groups'); return; }
    for (const s of shapes) {
      const kind=s.localName, ph=placeholder(s);
      if (decorative && ph) continue;
      if (kind==='graphicFrame' || kind==='AlternateContent') { warnings.add('charts, tables or embedded objects');continue; }
      if (kind==='grpSp') {
        const geom=child(child(s,'grpSpPr'),'xfrm'), r=bounds(geom,scale), o=child(geom,'chOff'), d=child(geom,'chExt');
        if (!r || num(d,'cx')<=0 || num(d,'cy')<=0) continue;
        ctx.save();
        ctx.translate(r.x+r.w/2,r.y+r.h/2); ctx.rotate(num(geom,'rot')*Math.PI/10800000);ctx.scale(flag(geom,'flipH')?-1:1,flag(geom,'flipV')?-1:1);ctx.translate(-r.w/2,-r.h/2);
        ctx.scale(r.w/(num(d,'cx')*scale),r.h/(num(d,'cy')*scale)); ctx.translate(-num(o,'x')*scale,-num(o,'y')*scale);
        await paint(kids(s),map,theme,[],decorative,depth+1); ctx.restore();continue;
      }
      if (!['sp','pic','cxnSp'].includes(kind)) continue;
      const own=properties(s), ancestor=matchPlaceholder(inherited,s), backup=properties(ancestor);
      const geom=child(own,'xfrm') || child(backup,'xfrm');
      const type=attr(ph,'type') || attr(placeholder(ancestor),'type');
      let r=bounds(geom,scale);
      if (!r && ph) r=/title/i.test(type) ? {x:width*.07,y:height*.045,w:width*.86,h:height*.23} : {x:width*.075,y:height*.28,w:width*.85,h:height*.62};
      if (!r || !(r.w||r.h)) continue;
      ctx.save(); ctx.translate(r.x+r.w/2,r.y+r.h/2); ctx.rotate(num(geom,'rot')*Math.PI/10800000); ctx.scale(flag(geom,'flipH')?-1:1,flag(geom,'flipV')?-1:1); ctx.translate(-r.w/2,-r.h/2);
      if (kind==='pic') await drawPicture(s,map,r);
      else {
        const preset=attr(child(own,'prstGeom'),'prst') || attr(child(backup,'prstGeom'),'prst') || (kind==='cxnSp'?'line':'rect');
        if (child(own,'custGeom') || !/^(rect|roundRect|ellipse|triangle|rtTriangle|diamond|line|.*Connector.*)$/.test(preset)) warnings.add('special shapes');
        const coords={...r,x:0,y:0}, style=child(s,'style');
        const fills=child(style,'fillRef');
        const fill=paintFill(ctx,own,theme,coords,paintFill(ctx,backup,theme,coords,num(fills,'idx')>0?colour(fills,theme,theme.accent1):null));
        const line=child(own,'ln') || child(backup,'ln'), lineRef=child(style,'lnRef');
        const stroke=paintFill(ctx,line,theme,coords,kind==='cxnSp'||num(lineRef,'idx')>0?colour(lineRef,theme,theme.dk1):null);
        shapePath(ctx,preset,r);
        if (fill && kind!=='cxnSp') { ctx.fillStyle=fill;ctx.fill(); }
        if (stroke) { ctx.strokeStyle=stroke; ctx.lineWidth=Math.max(1,num(line,'w',12700)*scale); ctx.stroke(); }
        const t=tx(s);
        if (t) drawText(ctx,t,tx(ancestor),r,theme,scale,type,warnings);
      }
      ctx.restore();
    }
  }
  for (const [i,path] of slides.entries()) {
    if (progress(i+1,slides.length) === false) throw Error('Import cancelled.');
    const slide=parse(path), slideLinks=rels(path);
    const layoutPath=relationshipOf(slideLinks,'slideLayout'), layout=parse(layoutPath), layoutLinks=rels(layoutPath);
    const masterPath=relationshipOf(layoutLinks,'slideMaster'), master=parse(masterPath), masterLinks=rels(masterPath);
    const style=parse(relationshipOf(masterLinks,'theme'));
    const theme={...colours};
    for (const item of kids(all(style,'clrScheme')[0])) theme[item.localName]=colour(item,theme,theme[item.localName]);
    const bg=child(child(slide,'cSld'),'bg') || child(child(layout,'cSld'),'bg') || child(child(master,'cSld'),'bg');
    ctx.fillStyle=paintFill(ctx,child(bg,'bgPr'),theme,{x:0,y:0,w:width,h:height},theme.lt1);ctx.fillRect(0,0,width,height);
    if (attr(slide,'showMasterSp')!=='0' && attr(layout,'showMasterSp')!=='0') await paint(rootShapes(master),masterLinks,theme,[],true);
    await paint(rootShapes(layout),layoutLinks,theme,rootShapes(master),true);
    await paint(rootShapes(slide),slideLinks,theme,[...rootShapes(layout),...rootShapes(master)]);
    if (all(slide,'timing').length) warnings.add('animation');
    if (i) pdf.addPage();
    const jpg=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.9));
    if (!jpg || (imageBytes+=jpg.size)>72*MB) throw Error('Rendered deck is too large. Split it into smaller files.');
    pdf.addImage(new Uint8Array(await jpg.arrayBuffer()),'JPEG',0,0,width/1.5,height/1.5);
    await new Promise(r=>setTimeout(r,0));
  }
  canvas.width=canvas.height=1;
  return { buffer:pdf.output('arraybuffer'),imported:'slides',warnings:[...warnings].slice(0,5) };
}

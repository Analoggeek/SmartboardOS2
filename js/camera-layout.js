export const cameraShapes = ['wide','square','rounded','circle'];
export const cameraPositions = ['bottom-right','bottom-left','top-right','top-left'];
export function cameraFrame(width, height, limit, shape) {
  const sourceW = Math.max(1,width), sourceH=Math.max(1,height);
  const square = shape !== 'wide';
  const w = square ? Math.min(sourceW,sourceH,limit,1080) : sourceW * Math.min(1,limit/Math.max(sourceW,sourceH));
  const h = square ? w : sourceH * Math.min(1,limit/Math.max(sourceW,sourceH));
  return {width:Math.max(2,2*Math.floor(w/2)),height:Math.max(2,2*Math.floor(h/2))};
}
export function paintCameraFrame(ctx, source, width, height, shape) {
  const sw = source.videoWidth || source.width, sh = source.videoHeight || source.height;
  if (!sw || !sh) return;
  ctx.clearRect(0,0,width,height);
  ctx.fillStyle = '#101827';
  ctx.fillRect(0,0,width,height);
  ctx.save();
  if (shape === 'circle' || shape === 'rounded') {
    ctx.beginPath();
    if (shape === 'circle') ctx.ellipse(width/2,height/2,width/2,height/2,0,0,2*Math.PI);
    else ctx.roundRect(0,0,width,height,Math.min(width,height)*.16);
    ctx.clip();
  }
  const aspect=width/height, cw=Math.min(sw,sh*aspect), ch=Math.min(sh,sw/aspect);
  ctx.drawImage(source,(sw-cw)/2,(sh-ch)/2,cw,ch,0,0,width,height);
  ctx.restore();
}

// Process only new camera frames. Prefer a GPU shader to copying pixels to the CPU.
export function createChromaRenderer(gpu, fallback) {
  const gl = gpu.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false, depth: false });
  let paintGPU;
  if (gl) {
    const program = gl.createProgram();
    const compile = (type, code) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, code); gl.compileShader(shader);
      gl.attachShader(program, shader); gl.deleteShader(shader);
    };
    compile(gl.VERTEX_SHADER, `attribute vec2 p; varying vec2 uv;
      void main(){ gl_Position=vec4(p,0.,1.); uv=vec2(p.x,-p.y)*.5+.5; }`);
    compile(gl.FRAGMENT_SHADER, `precision mediump float; varying vec2 uv;
      uniform sampler2D camera; uniform vec3 colour; uniform float cutoff;
      void main(){ vec3 c=texture2D(camera,uv).rgb; float d=distance(c,colour);
      float a=smoothstep(max(0.,cutoff-.07),cutoff+.07,d); gl_FragColor=vec4(c,a); }`);
    gl.linkProgram(program);
    if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.useProgram(program);
      const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(program, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
      const texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
      for (const name of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D,name,gl.CLAMP_TO_EDGE);
      for (const name of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D,name,gl.LINEAR);
      let textureWidth = 0, textureHeight = 0;
      const colour = gl.getUniformLocation(program,'colour'), cutoff = gl.getUniformLocation(program,'cutoff');
      paintGPU = (video,[r,g,b],limit) => {
        gl.viewport(0,0,gpu.width,gpu.height);
        gl.uniform3f(colour,r/255,g/255,b/255); gl.uniform1f(cutoff,limit/255);
        if (textureWidth !== video.videoWidth || textureHeight !== video.videoHeight) {
          gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,video);
          textureWidth = video.videoWidth; textureHeight = video.videoHeight;
        } else gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,video);
        gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      };
    }
  }
  const software = !paintGPU;
  const canvas = software ? fallback : gpu;
  const ctx = software ? fallback.getContext('2d',{ willReadFrequently:true }) : null;
  return {
    canvas, software,
    resize(width,height) {
      if (!width || !height) return;
      const max = software ? 320 : 960;
      const f = Math.min(1,max/Math.max(width,height));
      const w = Math.max(1,Math.round(width*f)), h = Math.max(1,Math.round(height*f));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
    },
    paint(video,rgb,limit) {
      if (paintGPU) return paintGPU(video,rgb,limit);
      if (!ctx) return;
      const { width,height } = fallback;
      ctx.drawImage(video,0,0,width,height);
      const frame = ctx.getImageData(0,0,width,height);
      const [r,g,b] = rgb, inner = Math.max(0,limit-18), outer = limit+18;
      const pixels = frame.data;
      for (let i=0;i<pixels.length;i+=4) {
        const dr=pixels[i]-r,dg=pixels[i+1]-g,db=pixels[i+2]-b;
        const d=dr*dr+dg*dg+db*db;
        pixels[i+3]=d<=inner*inner?0:d>=outer*outer?255:Math.round((Math.sqrt(d)-inner)*255/(outer-inner));
      }
      ctx.putImageData(frame,0,0);
    },
    dispose() { gl?.getExtension('WEBGL_lose_context')?.loseContext(); },
  };
}

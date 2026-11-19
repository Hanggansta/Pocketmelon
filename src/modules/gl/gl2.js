/**
 * Tiny WebGL2 kit shared by the ink engine and the labs (no three.js).
 */
export const VS = /* glsl */ `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

export const HEAD = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 o;
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = r * p; a *= 0.5; }
  return v;
}
`;

export function supportsGL2(float = true) {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    const ok = !!gl && (!float || !!gl.getExtension('EXT_color_buffer_float'));
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return ok;
  } catch {
    return false;
  }
}

export class GL {
  constructor(canvas, attrs = {}) {
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance', ...attrs });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.float = !!gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');
    this.gl = gl;
    this.canvas = canvas;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.quad = buf;
  }

  program(fs, vs = VS) {
    const gl = this.gl;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      u[info.name.replace(/\[0\]$/, '')] = { loc: gl.getUniformLocation(p, info.name), type: info.type };
    }
    return { p, u };
  }

  target(w, h, { internal, format, type, filter } = {}) {
    const gl = this.gl;
    internal ??= gl.RGBA16F; format ??= gl.RGBA; type ??= gl.HALF_FLOAT; filter ??= gl.LINEAR;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex, fb, w, h, texel: [1 / w, 1 / h] };
  }

  pair(w, h, opts) {
    const a = this.target(w, h, opts), b = this.target(w, h, opts);
    return { read: a, write: b, w, h, texel: a.texel, swap() { [this.read, this.write] = [this.write, this.read]; } };
  }

  free(t) {
    if (!t) return;
    const gl = this.gl;
    for (const x of t.read ? [t.read, t.write] : [t]) { gl.deleteTexture(x.tex); gl.deleteFramebuffer(x.fb); }
  }

  /** upload a canvas/image as a texture */
  texture(source, { filter, flip = true } = {}) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flip);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter ?? gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter ?? gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    return tex;
  }

  /** draw a full-screen pass into target (or the canvas when target is null) */
  run(prog, target, uniforms = {}, { blend = false } = {}) {
    const gl = this.gl;
    gl.useProgram(prog.p);
    let unit = 0;
    for (const k in uniforms) {
      const e = prog.u[k];
      if (!e) continue;
      const v = uniforms[k];
      if (e.type === gl.SAMPLER_2D) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, v?.tex ?? v?.read?.tex ?? v);
        gl.uniform1i(e.loc, unit++);
      } else if (typeof v === 'number') gl.uniform1f(e.loc, v);
      else if (v.length === 2) gl.uniform2f(e.loc, v[0], v[1]);
      else if (v.length === 3) gl.uniform3f(e.loc, v[0], v[1], v[2]);
      else if (v.length === 4) gl.uniform4f(e.loc, v[0], v[1], v[2], v[3]);
    }
    if (target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
      gl.viewport(0, 0, target.w, target.h);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }
    if (blend) { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); } else gl.disable(gl.BLEND);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** size the canvas to its CSS box; returns true when it changed */
  fit(maxDpr = 2, scale = 1) {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr) * scale;
    const w = Math.max(2, Math.round(r.width * dpr)), h = Math.max(2, Math.round(r.height * dpr));
    if (this.canvas.width === w && this.canvas.height === h) return false;
    this.canvas.width = w;
    this.canvas.height = h;
    return true;
  }

  lose() { this.gl.getExtension('WEBGL_lose_context')?.loseContext(); }
}

/** run a render loop only while the element is on screen */
export function visibleLoop(el, frame) {
  if (import.meta.env.DEV && window.__loops) { window.__loops.push({ el, frame }); return { stop() {} }; }
  let raf = 0, on = false, last = 0;
  const tick = (now) => {
    const dt = Math.min(1 / 30, (now - last) / 1000 || 1 / 60);
    last = now;
    frame(dt, now / 1000);
    if (on) raf = requestAnimationFrame(tick);
  };
  const io = new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !on) { on = true; last = performance.now(); raf = requestAnimationFrame(tick); }
    else if (!e.isIntersecting && on) { on = false; cancelAnimationFrame(raf); }
  }, { rootMargin: '80px' });
  io.observe(el);
  return { stop() { on = false; cancelAnimationFrame(raf); io.disconnect(); } };
}

/** text → canvas mask (alpha = glyph), optional blur for a soft attraction field */
export function textMask(w, h, text, { font = '"KingHwa_OldSong", "Noto Serif SC Variable", serif', size = 0.5, y = 0.5, x = 0.5, blur = 0, spacing = 0 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const px = Math.round(Math.min(w / Math.max(1, [...text].length * (1 + spacing)), h) * size * (text.length > 1 ? 1 : 1));
  g.font = `${px}px ${font}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (spacing) g.letterSpacing = `${px * spacing}px`;
  if (blur) g.filter = `blur(${blur}px)`;
  g.fillStyle = '#fff';
  g.fillText(text, w * x, h * y);
  if (blur) {
    // a second, crisper pass keeps the core strong inside the halo
    g.filter = `blur(${blur * 0.35}px)`;
    g.fillText(text, w * x, h * y);
  }
  return c;
}

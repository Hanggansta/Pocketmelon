import { GL, HEAD, visibleLoop } from '../gl/gl2.js';
import { isZh } from '../i18n.js';

/**
 * Case 02 · Whisperleaf — the reading engine, live.
 *
 * A real page (Austen, 1813, public domain) is set large. Scrolling runs the "analysis": a scan line
 * sweeps the page and grades every word by CEFR level. The cursor is a glass lens (the studio's square
 * frame) that magnifies with refraction and dispersion; the word under it is looked up in context and
 * every other place it occurs on the page is threaded to it — the product's core idea, one continuous
 * thread from a lookup back to the text.
 *
 * Text and highlights are drawn with Canvas 2D (only when they change); the lens, the scan and the
 * grade are composed in one WebGL2 pass.
 */
const TEXT =
  'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife. ' +
  'However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed ' +
  'in the minds of the surrounding families, that he is considered the rightful property of some one or other of their daughters.';

// lemma → [level, gloss zh, gloss en]
const LEX = {
  truth: ['B1', '真理；事实', 'a fact or principle accepted as true'],
  universally: ['C1', '普遍地', 'by everyone, everywhere'],
  acknowledged: ['B2', '公认的', 'accepted as true by most people'],
  single: ['B1', '单身的', 'not married'],
  possession: ['B2', '拥有', 'the state of owning something'],
  fortune: ['B1', '财富', 'a large amount of money'],
  want: ['C2', '缺少（旧义，in want of）', 'lack of something (archaic: in want of)'],
  feelings: ['B1', '感受', 'emotions'],
  views: ['B1', '看法', 'opinions'],
  entering: ['B1', '进入；初到', 'coming into a place'],
  neighbourhood: ['B1', '街坊；一带', 'the area around where you live'],
  fixed: ['B2', '牢固的', 'firmly held, not changing'],
  surrounding: ['B2', '周围的', 'all around a place'],
  considered: ['B1', '被认为', 'thought of as'],
  rightful: ['C1', '理所应得的', 'having a legal or moral right'],
  property: ['B1', '财产', 'something that belongs to someone'],
  daughters: ['A2', '女儿', 'female children'],
};
const LEVEL_RGB = { A2: [150, 150, 160], B1: [110, 128, 255], B2: [62, 224, 192], C1: [230, 255, 74], C2: [255, 107, 74] };

const FS = HEAD + `
uniform sampler2D uText, uHi;
uniform vec2 uRes, uMouse;
uniform float uTime, uScan, uLens, uLensSize, uPx;

vec2 lensWarp(vec2 px, out float inL, out float edge) {
  vec2 d = px - uMouse;
  float half_ = uLensSize * 0.5;
  // rounded square (superellipse) distance: the studio's frame, as glass
  vec2 q = abs(d) / half_;
  float r = pow(pow(q.x, 6.0) + pow(q.y, 6.0), 1.0 / 6.0);
  inL = (1.0 - smoothstep(0.98, 1.0, r)) * uLens;
  edge = smoothstep(0.82, 1.0, r) * inL;
  // magnify 1.45x at the centre, refracting harder towards the rim
  float mag = mix(1.0, 1.0 / 1.45, inL) + edge * 0.06;
  return uMouse + d * mag;
}

void main() {
  vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uRes;
  float inL, edge;
  vec2 w = lensWarp(px, inL, edge);
  // chromatic dispersion near the rim
  vec2 disp = (px - uMouse) * edge * 0.018;
  vec2 uvR = (w + disp) / uRes, uvG = w / uRes, uvB = (w - disp) / uRes;
  float tR = texture(uText, uvR).a, tG = texture(uText, uvG).a, tB = texture(uText, uvB).a;
  vec4 hi = texture(uHi, uvG);
  vec4 glow = textureLod(uHi, uvG, 3.0);

  // the scan: grading appears above the line; the line itself is a bright hairline with a soft wake
  float y = px.y / uRes.y;
  float graded = smoothstep(uScan + 0.004, uScan - 0.004, y);
  float line = exp(-pow((y - uScan) * uRes.y / 1.5, 2.0)) * step(0.001, uScan) * step(uScan, 0.999);
  float wake = exp(-max(0.0, uScan - y) * 18.0) * graded * step(uScan, 0.999);

  vec3 bg = vec3(0.035, 0.038, 0.045);
  bg += vec3(0.02, 0.03, 0.05) * wake;
  vec3 ink = vec3(0.86, 0.87, 0.9);
  vec3 col = bg;
  col = mix(col, ink * vec3(tR, tG, tB) + bg * (1.0 - vec3(tR, tG, tB)), 1.0);
  // graded words take their level colour; hovered threads glow
  col = mix(col, hi.rgb, hi.a * graded);
  col += glow.rgb * glow.a * 0.55 * graded;
  col += vec3(0.6, 0.75, 1.0) * line * 0.7;
  // lens: slight lift inside, a hairline rim
  col += vec3(0.02) * inL;
  col = mix(col, vec3(1.0), edge * 0.12 + (smoothstep(0.96, 0.99, edge) * 0.0));
  vec2 c = vUv - 0.5;
  col *= 1.0 - 0.3 * dot(c, c);
  col += (hash(px + fract(uTime) * 71.0) - 0.5) * 0.02;
  o = vec4(col, 1.0);
}`;

export function initReadStage(host, { onStats, card } = {}) {
  const canvas = host.querySelector('canvas');
  let g;
  try {
    g = new GL(canvas);
  } catch {
    host.classList.add('no-gl');
    return null;
  }
  const gl = g.gl;
  const prog = g.program(FS);
  const tc = document.createElement('canvas');
  const hc = document.createElement('canvas');
  let words = [], texT = null, texH = null, scale = 1;
  const state = { scan: 0, lens: 0, lensTarget: 0, mouse: null, auto: true, t: 0, hover: null, nextAuto: 0, autoIdx: 0 };
  const font = '"Instrument Serif", "Times New Roman", serif';

  function layout() {
    const W = canvas.width, H = canvas.height;
    tc.width = W; tc.height = H;
    hc.width = W; hc.height = H;
    const x = tc.getContext('2d');
    const padX = W * 0.08, maxW = W - padX * 2;
    // find the largest size that keeps the passage inside ~76% of the height
    let fs = H * 0.11, lines;
    const wrap = (size) => {
      x.font = `${size}px ${font}`;
      const out = [];
      let line = [], lw = 0;
      const sp = x.measureText(' ').width;
      for (const t of TEXT.split(' ')) {
        const tw = x.measureText(t).width;
        if (line.length && lw + sp + tw > maxW) { out.push(line); line = []; lw = 0; }
        line.push({ t, w: tw });
        lw += (line.length > 1 ? sp : 0) + tw;
      }
      out.push(line);
      return { out, sp };
    };
    for (let i = 0; i < 30; i++) {
      lines = wrap(fs);
      if (lines.out.length * fs * 1.12 < H * 0.76) break;
      fs *= 0.94;
    }
    const lh = fs * 1.12;
    const top = (H - lines.out.length * lh) / 2 + fs * 0.85;
    x.clearRect(0, 0, W, H);
    x.fillStyle = '#fff';
    x.font = `${fs}px ${font}`;
    words = [];
    lines.out.forEach((line, li) => {
      let cx = padX;
      const y = top + li * lh;
      for (const wd of line) {
        x.fillText(wd.t, cx, y);
        const lemma = wd.t.toLowerCase().replace(/[^a-z]/g, '');
        const bare = wd.t.replace(/[.,;:!?]+$/, '');
        words.push({ t: wd.t, lemma, x: cx, y: y - fs * 0.78, w: x.measureText(bare).width, h: fs * 0.98, base: y, level: LEX[lemma]?.[0] });
        cx += wd.w + lines.sp;
      }
    });
    if (texT) gl.deleteTexture(texT);
    texT = g.texture(tc, { flip: false });
    drawHi();
    const graded = words.filter((w) => w.level && w.level !== 'A2').length;
    onStats?.({ words: words.length, lemmas: new Set(words.map((w) => w.lemma)).size, graded });
  }

  function drawHi() {
    const x = hc.getContext('2d');
    x.clearRect(0, 0, hc.width, hc.height);
    for (const w of words) {
      if (!w.level || w.level === 'A2') continue;
      const [r, gg, b] = LEVEL_RGB[w.level];
      const on = state.hover && w.lemma === state.hover;
      // the grade: an underline in the level's colour; the word itself tints when it's the one looked up
      x.fillStyle = `rgba(${r},${gg},${b},${on ? 1 : 0.9})`;
      x.fillRect(w.x, w.base + w.h * 0.12, w.w, Math.max(2, w.h * (on ? 0.05 : 0.025)));
    }
    if (state.hover) {
      const hits = words.filter((w) => w.lemma === state.hover);
      const lv = LEX[state.hover]?.[0] || 'B1';
      const [r, gg, b] = LEVEL_RGB[lv];
      x.font = `${hits[0]?.h / 0.98}px ${font}`;
      for (const w of hits) {
        x.fillStyle = `rgba(${r},${gg},${b},1)`;
        x.fillText(w.t, w.x, w.base);
      }
      // the thread: every occurrence is tied to the first one
      if (hits.length > 1) {
        x.strokeStyle = `rgba(${r},${gg},${b},.85)`;
        x.lineWidth = Math.max(1.5, hits[0].h * 0.018);
        x.setLineDash([hits[0].h * 0.06, hits[0].h * 0.05]);
        const a = hits[0];
        for (const w of hits.slice(1)) {
          const ax = a.x + a.w / 2, ay = a.base + a.h * 0.2, bx = w.x + w.w / 2, by = w.base + w.h * 0.2;
          x.beginPath();
          x.moveTo(ax, ay);
          x.bezierCurveTo(ax, ay + a.h * 1.2, bx, by + a.h * 1.2, bx, by);
          x.stroke();
        }
        x.setLineDash([]);
      }
    }
    if (!texH) {
      texH = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texH);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    gl.bindTexture(gl.TEXTURE_2D, texH);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, hc);
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  function setHover(lemma, w) {
    if (lemma === state.hover) return;
    state.hover = lemma;
    drawHi();
    if (!card) return;
    if (!lemma || !LEX[lemma]) { card.classList.remove('is-on'); return; }
    const [lv, zh, en] = LEX[lemma];
    const n = words.filter((x) => x.lemma === lemma).length;
    card.querySelector('[data-w]').textContent = w.t.replace(/[^A-Za-z]/g, '');
    card.querySelector('[data-lv]').textContent = lv;
    card.querySelector('[data-lv]').style.setProperty('--lv', `rgb(${LEVEL_RGB[lv].join(',')})`);
    card.querySelector('[data-gloss]').textContent = isZh ? zh : en;
    card.querySelector('[data-n]').textContent = isZh ? `本页出现 ${n} 次` : `${n}× on this page`;
    const r = canvas.getBoundingClientRect();
    const k = r.width / canvas.width;
    card.style.transform = `translate3d(${(w.x + w.w / 2) * k}px, ${(w.base + w.h * 0.35) * k}px, 0)`;
    card.classList.add('is-on');
  }

  const hit = (px, py) => words.find((w) => px >= w.x - 4 && px <= w.x + w.w + 4 && py >= w.y && py <= w.y + w.h);
  host.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    const k = canvas.width / r.width;
    state.mouse = [(e.clientX - r.left) * k, (e.clientY - r.top) * k];
    state.auto = false;
    state.lensTarget = 1;
    if (state.scan < 0.98) return;
    const w = hit(...state.mouse);
    if (w && LEX[w.lemma] && LEX[w.lemma][0] !== 'A2') setHover(w.lemma, w);
    else if (!w) setHover(null);
  }, { passive: true });
  host.addEventListener('pointerleave', () => { state.auto = true; setHover(null); });

  let resized = true;
  new ResizeObserver(() => (resized = true)).observe(canvas);
  const fontReady = document.fonts.load(`64px ${font}`, 'Truth').catch(() => {});
  let ready = false;
  fontReady.then(() => (ready = true));

  const cur = [0, 0];
  visibleLoop(host, (dt) => {
    if (!ready) return;
    if (resized) { g.fit(1.5); layout(); resized = false; }
    state.t += dt;
    const W = canvas.width, H = canvas.height;
    let target = state.mouse;
    if (state.auto || !target) {
      // nobody steering: the lens reads by itself, word to word
      const graded = words.filter((w) => w.level && w.level !== 'A2');
      if (state.scan >= 0.98 && graded.length && state.t > state.nextAuto) {
        const w = graded[state.autoIdx++ % graded.length];
        state.autoW = w;
        state.nextAuto = state.t + 2.4;
        state.lensTarget = 1;
        setHover(w.lemma, w);
      }
      const w = state.autoW;
      target = w ? [w.x + w.w / 2, w.y + w.h / 2] : [W * 0.5, H * 0.5];
    }
    if (!cur.seeded) { cur[0] = target[0]; cur[1] = target[1]; cur.seeded = true; }
    const k = 1 - Math.exp(-dt * (state.auto ? 4 : 16));
    cur[0] += (target[0] - cur[0]) * k;
    cur[1] += (target[1] - cur[1]) * k;
    state.lens += (state.lensTarget - state.lens) * (1 - Math.exp(-dt * 5));
    g.run(prog, null, {
      uText: texT, uHi: texH, uRes: [W, H], uMouse: cur, uTime: state.t,
      uScan: state.scan, uLens: state.lens, uLensSize: Math.min(W, H) * 0.3, uPx: 1,
    });
  });

  return {
    set scan(v) { state.scan = v; if (v < 0.98 && state.hover) setHover(null); },
    get scan() { return state.scan; },
    set lens(v) { state.lensTarget = v; },
  };
}

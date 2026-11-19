import { reduced } from './env.js';

/**
 * Pixel-resolve imagery.
 * Images enter as chunky pixels that resolve to full detail, and pixelate
 * into an alternate frame on hover. The <img> stays in the DOM for semantics,
 * SEO and no-JS; the canvas sits on top once the image is decoded.
 *
 *   <figure class="mosaic" data-mosaic data-alt="/work/x/detail.webp">
 *     <img src="/work/x/hero.webp" alt="…">
 *   </figure>
 */
const STEPS = [56, 40, 28, 20, 14, 10, 7, 5, 3, 2, 1];
const PAPER = '#efebe3';
const LADDER = [1, 2, 3, 5, 7, 10, 14, 20, 28];
const GRID_MIN = 7; // from this block size up, cells render as discrete screen pixels with a hairline gap

/* ---- shared scroll velocity: fast scrolling breaks every visible photo into pixels */
const live = new Set();
let vBlock = 1;
let lastY = 0;
let lastT = 0;
let looping = false;
function velocityLoop(now) {
  const dt = Math.max(1, now - (lastT || now - 16));
  const speed = (Math.abs(scrollY - lastY) / dt) * 16.67; // px per 60fps frame
  lastY = scrollY;
  lastT = now;
  const target = speed < 24 ? 1 : Math.min(20, (speed - 18) * 0.5); // only real flicks
  vBlock = Math.max(target, vBlock * 0.86 + 0.14);
  const q = LADDER.filter((b) => b <= vBlock).pop() || 1;
  live.forEach((m) => m.velocity(q));
  requestAnimationFrame(velocityLoop);
}

export function initMosaics(root = document) {
  root.querySelectorAll('[data-mosaic]').forEach((el) => mosaic(el));
  if (!reduced && !looping) {
    looping = true;
    lastY = scrollY;
    requestAnimationFrame(velocityLoop);
  }
}

function load(src) {
  return new Promise((res) => {
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = src;
  });
}

function mosaic(el) {
  const img = el.querySelector('img');
  if (!img) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'mosaic__canvas';
  canvas.setAttribute('aria-hidden', 'true');
  el.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const small = document.createElement('canvas');
  const sctx = small.getContext('2d');

  let frames = [];
  let current = 0;
  let block = reduced ? 1 : STEPS[0];
  let dpr = 1;
  let ready = false;
  let anim = null;
  const scrub = 'mosaicScrub' in el.dataset;
  let revealed = reduced || scrub;
  let tweening = false;
  let vq = 1;
  const api = {
    velocity(q) {
      if (!ready || tweening || !revealed || q === vq) return;
      vq = q;
      block = q;
      draw();
    },
  };
  // scroll-scrubbed hosts drive the pixel size themselves: el._mosaic.set(px)
  let want = scrub && !reduced ? Math.max(14, Math.min(28, innerWidth / 50)) : 1;
  want = LADDER.filter((b) => b <= want).pop();
  el._mosaic = {
    set(px) {
      const q = LADDER.filter((b) => b <= px).pop() || 1;
      if (q === want) return;
      want = q;
      if (ready) { block = q; draw(); }
    },
  };
  if (scrub) block = want;

  const fit = (im, w, h) => {
    const r = Math.max(w / im.naturalWidth, h / im.naturalHeight);
    const sw = w / r, sh = h / r;
    return [(im.naturalWidth - sw) / 2, (im.naturalHeight - sh) / 2, sw, sh];
  };

  const draw = () => {
    if (!ready) return;
    const im = frames[current];
    const w = canvas.width, h = canvas.height;
    if (!w || !h || !im) return;
    const [sx, sy, sw, sh] = fit(im, w, h);
    const b = Math.max(1, Math.round(block * dpr));
    if (b <= 1) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(im, sx, sy, sw, sh, 0, 0, w, h);
      return;
    }
    const cw = Math.max(1, Math.ceil(w / b)), ch = Math.max(1, Math.ceil(h / b));
    small.width = cw;
    small.height = ch;
    sctx.imageSmoothingEnabled = true;
    sctx.drawImage(im, sx, sy, sw, sh, 0, 0, cw, ch);
    ctx.imageSmoothingEnabled = false;
    if (block < GRID_MIN) {
      ctx.drawImage(small, 0, 0, cw, ch, 0, 0, cw * b, ch * b);
      return;
    }
    // large blocks: discrete pixels on the page colour, the same language as the hero mascot
    const data = sctx.getImageData(0, 0, cw, ch).data;
    const gap = Math.max(1, Math.round(b * 0.1));
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const i = (y * cw + x) * 4;
        ctx.fillStyle = `rgb(${data[i]},${data[i + 1]},${data[i + 2]})`;
        ctx.fillRect(x * b, y * b, b - gap, b - gap);
      }
    }
  };

  const size = () => {
    const r = el.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    draw();
  };

  const tween = (seq, ms, onMid) =>
    new Promise((resolve) => {
      cancelAnimationFrame(anim);
      tweening = true;
      const start = performance.now();
      let lastIdx = -1;
      const tick = (now) => {
        const t = Math.min(1, (now - start) / ms);
        const idx = Math.min(seq.length - 1, Math.floor(t * seq.length));
        if (idx !== lastIdx) {
          lastIdx = idx;
          if (onMid && idx === Math.floor(seq.length / 2)) onMid();
          block = seq[idx];
          draw();
        }
        if (t < 1) anim = requestAnimationFrame(tick);
        else {
          tweening = false;
          vq = block;
          resolve();
        }
      };
      anim = requestAnimationFrame(tick);
    });

  const resolveIn = () => {
    if (revealed) return;
    revealed = true;
    tween(STEPS, 900);
  };

  Promise.all([load(img.currentSrc || img.src), el.dataset.alt ? load(el.dataset.alt) : null]).then(([a, b]) => {
    frames = [a, b].filter(Boolean);
    if (!frames.length) return;
    ready = true;
    el.classList.add('is-ready');
    size();
    new ResizeObserver(size).observe(el);
    if (scrub) {
      block = want;
      draw();
    } else if (!reduced) {
      new IntersectionObserver(
        ([e], o) => {
          if (e.isIntersecting) {
            resolveIn();
            o.disconnect();
          }
        },
        { threshold: 0.25 }
      ).observe(el);
      // only on-screen images listen to scroll velocity
      new IntersectionObserver(([e]) => (e.isIntersecting ? live.add(api) : live.delete(api))).observe(el);
    }
  });

  if (el.dataset.alt && !reduced && !scrub) {
    const swapTo = (i) => {
      if (!ready || frames.length < 2 || current === i) return;
      const up = [1, 2, 4, 8, 14, 22, 32];
      const seq = [...up, ...up.slice().reverse()];
      tween(seq, 620, () => (current = i));
    };
    const host = el.closest('[data-mosaic-host]') || el;
    host.addEventListener('pointerenter', () => swapTo(1));
    host.addEventListener('pointerleave', () => swapTo(0));
  }
}

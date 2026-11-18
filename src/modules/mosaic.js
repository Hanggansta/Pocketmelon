import { reduced } from './env.js';

/**
 * Bead-resolve imagery.
 * Images enter as chunky "beads" that resolve to full detail, and pixelate
 * into an alternate frame on hover. The <img> stays in the DOM for semantics,
 * SEO and no-JS; the canvas sits on top once the image is decoded.
 *
 *   <figure class="mosaic" data-mosaic data-alt="/work/x/detail.webp">
 *     <img src="/work/x/hero.webp" alt="…">
 *   </figure>
 */
const STEPS = [56, 40, 28, 20, 14, 10, 7, 5, 3, 2, 1];

export function initMosaics(root = document) {
  root.querySelectorAll('[data-mosaic]').forEach((el) => mosaic(el));
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
  let revealed = reduced;

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
    ctx.drawImage(small, 0, 0, cw, ch, 0, 0, cw * b, ch * b);
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
        else resolve();
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
    if (!reduced) {
      new IntersectionObserver(
        ([e], o) => {
          if (e.isIntersecting) {
            resolveIn();
            o.disconnect();
          }
        },
        { threshold: 0.25 }
      ).observe(el);
    }
  });

  if (el.dataset.alt && !reduced) {
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

import { drawStaticCat, CAT_SIZE } from './pixelcat.js';
import { reduced } from './env.js';

/**
 * Pixel-dissolve page transitions.
 * Leaving a page: square pixels fill the screen in a diagonal wave with jitter,
 * the mascot appears in the middle, then we navigate. On arrival the page starts
 * covered (see the inline guard in each HTML <head>) and the pixels clear in the
 * same order.
 */
const KEY = 'pm:transition';
const COLORS = ['#15231a', '#15231a', '#15231a', '#1c2e22'];

export function initTransitions() {
  const canvas = document.createElement('canvas');
  canvas.className = 'px-transition';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let cells = [];
  let cols = 0, rows = 0, size = 0, dpr = 1, maxDelay = 1;

  const build = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    size = Math.ceil(Math.max(innerWidth, innerHeight) / (innerWidth < 700 ? 12 : 22));
    cols = Math.ceil(innerWidth / size);
    rows = Math.ceil(innerHeight / size);
    cells = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        cells.push({ x, y, d: (x / cols) * 0.55 + (1 - y / rows) * 0.25 + Math.random() * 0.2, c: COLORS[(x * 7 + y * 3) % COLORS.length] });
      }
    }
    maxDelay = 1;
  };

  const draw = (t, dir) => {
    // t: 0..1 coverage progress. dir 'in' = covering, 'out' = clearing
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const c of cells) {
      const local = Math.min(1, Math.max(0, (t * 1.25 - c.d) / 0.25));
      const k = dir === 'in' ? local : 1 - local;
      if (k <= 0) continue;
      const s = Math.ceil(size * (k < 1 ? Math.round(k * 4) / 4 : 1));
      ctx.fillStyle = c.c;
      ctx.fillRect(c.x * size + (size - s) / 2, c.y * size + (size - s) / 2, s + 0.5, s + 0.5);
    }
    // mascot when mostly covered
    const catK = dir === 'in' ? (t - 0.7) / 0.3 : 1 - t / 0.35;
    if (catK > 0) {
      const scale = Math.max(2, Math.floor(Math.min(innerWidth, innerHeight) / 7 / CAT_SIZE.w));
      ctx.globalAlpha = Math.min(1, catK);
      drawStaticCat(ctx, innerWidth / 2 - (CAT_SIZE.w * scale) / 2, innerHeight / 2 - (CAT_SIZE.h * scale) / 2, scale);
      ctx.globalAlpha = 1;
    }
  };

  const run = (dir, duration) =>
    new Promise((resolve) => {
      const start = performance.now();
      canvas.style.visibility = 'visible';
      const frame = (now) => {
        const t = Math.min(1, (now - start) / duration);
        // stepped easing for a pixel feel
        const stepped = Math.round(t * 18) / 18;
        draw(stepped, dir);
        if (t < 1) requestAnimationFrame(frame);
        else {
          if (dir === 'out') canvas.style.visibility = 'hidden';
          resolve();
        }
      };
      requestAnimationFrame(frame);
    });

  build();
  window.addEventListener('resize', build);

  // arrival
  const arriving = sessionStorage.getItem(KEY) === '1';
  sessionStorage.removeItem(KEY);
  const reveal = () => {
    document.documentElement.classList.remove('is-arriving');
    if (reduced) return Promise.resolve();
    draw(1, 'in');
    return run('out', 750);
  };

  // departures
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target === '_blank' || a.hasAttribute('download') || a.dataset.noTransition !== undefined) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return;
    if (url.pathname === location.pathname && url.hash) return; // in-page anchor
    if (url.protocol === 'mailto:') return;
    e.preventDefault();
    sessionStorage.setItem(KEY, '1');
    if (reduced) {
      location.href = url.href;
      return;
    }
    run('in', 700).then(() => (location.href = url.href));
  });

  // bfcache restore: make sure nothing is left covering the page
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.style.visibility = 'hidden';
      document.documentElement.classList.remove('is-arriving');
    }
  });

  return { arriving, reveal };
}

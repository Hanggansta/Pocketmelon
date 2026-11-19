import { reduced } from './env.js';

/**
 * 12×12 pixel icons for the service cards. They render in pixel by pixel when
 * a card scrolls into view and re-render (scrambled order) on hover, the same
 * pixel language as the hero mascot at icon scale.
 *
 *   <canvas class="px-icon" data-icon="target"></canvas>
 */
const ICONS = {
  target: [
    '....####....',
    '..##....##..',
    '.#........#.',
    '.#..####..#.',
    '#..#....#..#',
    '#..#.##.#..#',
    '#..#.##.#..#',
    '#..#....#..#',
    '.#..####..#.',
    '.#........#.',
    '..##....##..',
    '....####....',
  ],
  cat: [
    '#..........#',
    '##........##',
    '#.#......#.#',
    '#..######..#',
    '#..........#',
    '#..#....#..#',
    '#..#....#..#',
    '#....##....#',
    '#..........#',
    '.#........#.',
    '..########..',
    '............',
  ],
  // a calligraphy brush, tip down, with a drop of ink
  brush: [
    '.........##.',
    '........###.',
    '.......###..',
    '......###...',
    '.....###....',
    '....###.....',
    '...####.....',
    '..#####.....',
    '..####......',
    '.###........',
    '.#..........',
    '#.......#...',
  ],
  browser: [
    '############',
    '#.#.#......#',
    '############',
    '#..........#',
    '#..#.......#',
    '#..##......#',
    '#..###.....#',
    '#..####....#',
    '#..#####...#',
    '#..##......#',
    '#...#......#',
    '############',
  ],
  code: [
    '............',
    '.......#....',
    '...#...#.#..',
    '..#...#...#.',
    '.#....#....#',
    '#.....#.....',
    '.#...#.....#',
    '..#..#....#.',
    '...#.#...#..',
    '....#.......',
    '....#.......',
    '............',
  ],
};

export function initPixelIcons(root = document) {
  root.querySelectorAll('canvas[data-icon]').forEach((c) => icon(c));
}

function icon(canvas) {
  const rows = ICONS[canvas.dataset.icon];
  if (!rows) return;
  const cells = [];
  rows.forEach((r, y) => [...r.padEnd(12, '.')].forEach((ch, x) => ch === '#' && cells.push([x, y])));
  const ctx = canvas.getContext('2d');
  const host = canvas.closest('article') || canvas.parentElement;
  let shown = reduced ? cells.length : 0;
  let order = cells;
  let anim = 0;

  const size = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    canvas.width = canvas.height = Math.round(w * dpr);
    draw();
  };
  const draw = () => {
    const W = canvas.width;
    const p = W / 12;
    const g = Math.max(1, Math.round(p * 0.12));
    ctx.clearRect(0, 0, W, W);
    ctx.fillStyle = getComputedStyle(canvas).color;
    for (let i = 0; i < shown; i++) {
      const [x, y] = order[i];
      ctx.fillRect(Math.round(x * p), Math.round(y * p), Math.ceil(p) - g, Math.ceil(p) - g);
    }
  };
  const play = (scramble) => {
    if (reduced) return draw();
    cancelAnimationFrame(anim);
    order = scramble ? [...cells].sort(() => Math.random() - 0.5) : [...cells].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    shown = 0;
    const t0 = performance.now();
    const dur = scramble ? 420 : 700;
    const tick = (now) => {
      shown = Math.min(cells.length, Math.ceil(((now - t0) / dur) * cells.length));
      draw();
      if (shown < cells.length) anim = requestAnimationFrame(tick);
    };
    anim = requestAnimationFrame(tick);
  };

  size();
  new ResizeObserver(size).observe(canvas);
  new IntersectionObserver(([e], o) => {
    if (e.isIntersecting) {
      play(false);
      o.disconnect();
    }
  }, { threshold: 0.4 }).observe(canvas);
  host.addEventListener('pointerenter', () => play(true));
  // colour follows the card's hover state
  host.addEventListener('transitionend', draw);
  host.addEventListener('pointerleave', () => setTimeout(draw, 650));
}

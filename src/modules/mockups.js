/**
 * Interface studies.
 *
 * The bead plate on the case page is not a screenshot: it is the real photo,
 * sampled to the bead grid, quantised against a palette of real bead colours in
 * OKLab, and rebuilt as 880 CSS beads at desktop size. Everything else in the frame is
 * HTML and CSS, so it stays crisp at any size and costs one small DOM build.
 */

/* a working palette of fuse-bead colours, warm through cool */
const BEADS = [
  '#111214', '#26282c', '#42454a', '#63666c', '#8b8e94', '#b7b6ae', '#f1ede2',
  '#2a1610', '#3b2318', '#52241a', '#6b3d29', '#7d2f1f', '#8a5a3f', '#a83a24', '#b87a58',
  '#d2492a', '#e07a52', '#f0642f', '#ff8a4c', '#ffb47a', '#ffd7ad',
  '#14233f', '#1d3566', '#274d93', '#3368c4', '#4a87ea', '#7fb2ff', '#b9d9ff',
  '#6b4d14', '#b08a1f', '#e0b93c', '#f2e3a3',
  '#33462c', '#5d7d42', '#93b35f',
];

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

function oklab(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = toLinear(((n >> 16) & 255) / 255);
  const g = toLinear(((n >> 8) & 255) / 255);
  const b = toLinear((n & 255) / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

const PALETTE = BEADS.map((hex) => ({ hex, lab: oklab(hex) }));

function nearest(lab) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < PALETTE.length; i++) {
    const p = PALETTE[i].lab;
    const dl = (lab[0] - p[0]) * 1.15;
    const da = lab[1] - p[1];
    const db = lab[2] - p[2];
    const d = dl * dl + da * da + db * db;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

function sample(img, cols, rows) {
  const c = document.createElement('canvas');
  c.width = cols;
  c.height = rows;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  // cover-crop the source into the bead grid
  const ra = cols / rows;
  const ia = img.naturalWidth / img.naturalHeight;
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;
  let sx = 0;
  let sy = 0;
  if (ia > ra) { sw = img.naturalHeight * ra; sx = (img.naturalWidth - sw) / 2; }
  else { sh = img.naturalWidth / ra; sy = (img.naturalHeight - sh) * 0.12; }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cols, rows);
  const data = ctx.getImageData(0, 0, cols, rows).data;
  const cells = [];
  const count = new Map();
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4;
      // ordered dither so a photograph doesn't posterise into flat colour fields
      const n = (BAYER[(y % 4) * 4 + (x % 4)] / 15 - 0.5) * 12;
      const r = clamp01((data[i] + n) / 255);
      const g = clamp01((data[i + 1] + n) / 255);
      const b = clamp01((data[i + 2] + n) / 255);
      const lab = oklabRGB(r, g, b);
      const idx = nearest(lab);
      const hex = PALETTE[idx].hex;
      cells.push(hex);
      count.set(hex, (count.get(hex) || 0) + 1);
    }
  }
  return { cells, count };
}

function oklabRGB(r, g, b) {
  const rl = toLinear(r);
  const gl = toLinear(g);
  const bl = toLinear(b);
  const l = Math.cbrt(0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl);
  const m = Math.cbrt(0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl);
  const s = Math.cbrt(0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function beadGrid(host) {
  const src = host.dataset.src || '/work/beads/source.webp';
  let built = false;

  const build = (img) => {
    const mobile = innerWidth < 700;
    const cols = mobile ? 24 : Number(host.dataset.cols) || 34;
    const rows = Math.max(10, Math.round(cols / ((img ? img.naturalWidth / img.naturalHeight : 1.54))));
    host.style.setProperty('--cols', cols);
    host.style.setProperty('--ratio', (cols / rows).toFixed(4));

    let cells;
    let count;
    if (img) {
      const sampled = sample(img, cols, rows);
      cells = sampled.cells;
      count = sampled.count;
    } else {
      // graceful fallback: a quiet procedural field
      cells = [];
      count = new Map();
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const v = Math.sin(x * 0.5) + Math.cos(y * 0.42) + Math.sin((x + y) * 0.28);
          const hex = PALETTE[Math.abs(Math.round(v * 2)) % PALETTE.length].hex;
          cells.push(hex);
          count.set(hex, (count.get(hex) || 0) + 1);
        }
      }
    }

    const frag = document.createDocumentFragment();
    cells.forEach((hex) => {
      const bead = document.createElement('span');
      bead.className = 'bead';
      bead.style.setProperty('--c', hex);
      frag.appendChild(bead);
    });
    host.replaceChildren(frag);
    built = true;

    // the numbers printed beside the plate come from the same sample
    const stat = document.querySelector('[data-bead-stat] b');
    if (stat) stat.textContent = cells.length.toLocaleString(document.documentElement.lang.startsWith('en') ? 'en-US' : 'zh-CN');
    const gridLabel = document.querySelector('[data-bead-grid]');
    if (gridLabel) gridLabel.textContent = `${cols} × ${rows}`;
    const colourLabel = document.querySelector('[data-bead-colors]');
    if (colourLabel) colourLabel.textContent = `${count.size} / 48`;

    const swatches = document.querySelector('[data-swatches]');
    if (swatches) {
      const top = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16);
      swatches.replaceChildren(
        ...top.map(([hex]) => {
          const s = document.createElement('span');
          s.style.setProperty('--c', hex);
          s.title = hex;
          return s;
        })
      );
    }
  };

  const img = new Image();
  img.decoding = 'async';
  img.onload = () => build(img);
  img.onerror = () => build(null);
  img.src = src;

  // rebuild only when the layout crosses the mobile threshold
  let wasMobile = innerWidth < 700;
  let timer;
  addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const isMobile = innerWidth < 700;
      if (isMobile !== wasMobile && built) {
        wasMobile = isMobile;
        if (img.complete && img.naturalWidth) build(img);
      }
    }, 220);
  }, { passive: true });
}

export function initMockups(root = document) {
  root.querySelectorAll('[data-beadgrid]').forEach((el) => {
    if (!el.dataset.built) {
      el.dataset.built = '1';
      beadGrid(el);
    }
  });
}

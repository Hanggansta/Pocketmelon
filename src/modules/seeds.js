import gsap from 'gsap';
import { pointer, reduced, lerp, clamp } from './env.js';

/**
 * Hero "seed field": a lattice of melon seeds that turn to face the cursor,
 * swell and ripen to melon-red as it passes, and drift on an idle current
 * when there is no pointer (touch devices).
 */
export function initSeeds(canvas) {
  const ctx = canvas.getContext('2d');
  const hero = canvas.parentElement;
  let w = 0, h = 0, dpr = 1, seeds = [], visible = true, t = 0;
  let inkColor = '#121611';
  const melon = [255, 79, 63];

  // teardrop seed path (pointing along +x)
  const seedPath = new Path2D();
  seedPath.moveTo(5, 0);
  seedPath.bezierCurveTo(3, 2.6, -3.5, 2.6, -4, 0);
  seedPath.bezierCurveTo(-3.5, -2.6, 3, -2.6, 5, 0);
  seedPath.closePath();

  const readColors = () => {
    inkColor = getComputedStyle(document.documentElement).getPropertyValue('--seed').trim() || '#121611';
  };

  function build() {
    const rect = hero.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = rect.width;
    h = rect.height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const gap = w < 600 ? 30 : w < 1200 ? 36 : 42;
    const cols = Math.ceil(w / gap) + 1;
    const rows = Math.ceil(h / gap) + 1;
    const ox = (w - (cols - 1) * gap) / 2;
    const oy = (h - (rows - 1) * gap) / 2;
    seeds = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = ox + c * gap + (r % 2 ? gap / 2 : 0);
        const y = oy + r * gap;
        seeds.push({ x, y, a: Math.random() * Math.PI * 2, s: 1, heat: 0, dx: 0, dy: 0 });
      }
    }
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const rect = hero.getBoundingClientRect();
    const mx = pointer.x - rect.left;
    const my = pointer.y - rect.top;
    const hasPointer = pointer.active && my > 0 && my < h;
    const radius = Math.max(160, Math.min(w, h) * 0.26);
    t += 0.006;

    for (const s of seeds) {
      let target, heat = 0, push = 0;
      const ddx = mx - s.x;
      const ddy = my - s.y;
      const dist = Math.hypot(ddx, ddy);
      if (hasPointer) {
        target = Math.atan2(ddy, ddx);
        heat = clamp(1 - dist / radius, 0, 1);
        push = heat * heat * 18;
      } else {
        // idle current
        target = Math.sin(s.x * 0.004 + t) * 1.6 + Math.cos(s.y * 0.005 - t * 0.8) * 1.4;
      }
      // shortest-path angle easing
      let diff = target - s.a;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      s.a += diff * 0.08;
      s.heat = lerp(s.heat, heat, 0.1);
      const nx = dist ? -ddx / dist : 0;
      const ny = dist ? -ddy / dist : 0;
      s.dx = lerp(s.dx, nx * push, 0.1);
      s.dy = lerp(s.dy, ny * push, 0.1);

      const scale = 0.85 + s.heat * 1.25;
      const cos = Math.cos(s.a) * scale;
      const sin = Math.sin(s.a) * scale;
      ctx.setTransform(cos * dpr, sin * dpr, -sin * dpr, cos * dpr, (s.x + s.dx) * dpr, (s.y + s.dy) * dpr);
      if (s.heat > 0.04) {
        ctx.fillStyle = `rgba(${melon[0]},${melon[1]},${melon[2]},${0.15 + s.heat * 0.85})`;
      } else {
        ctx.fillStyle = inkColor;
        ctx.globalAlpha = 0.13;
      }
      ctx.fill(seedPath);
      ctx.globalAlpha = 1;
    }
  }

  build();
  readColors();
  new ResizeObserver(build).observe(hero);
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(hero);
  new MutationObserver(readColors).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  if (reduced) {
    draw();
    return;
  }
  gsap.ticker.add(() => visible && draw());
}

/* ---------------------------------------------------------
   Capability specimens: each service card carries a small live drawing of the
   craft itself, not an icon. All hairline, all in the card's current colour,
   all bent by the pointer.
     graph  · a journey finding its way through a system of nodes
     ease   · a motion curve, with the eased and linear clocks side by side
     grid   · a 12-column layout reflowing between two compositions
     field  · a flow field of particles (the real-time graphics bit)
   --------------------------------------------------------- */
import { visibleLoop } from './gl/gl2.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
// cheap value noise for the flow field
const hash = (x, y) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const vnoise = (x, y) => {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(hash(xi, yi), hash(xi + 1, yi), u), lerp(hash(xi, yi + 1), hash(xi + 1, yi + 1), u), v);
};

function graph() {
  let nodes = [], path = [];
  return {
    init(W, H) {
      nodes = [];
      const cols = 7, rows = 4;
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
          nodes.push({ x: ((c + 0.5 + (hash(c, r) - 0.5) * 0.7) / cols) * W, y: ((r + 0.5 + (hash(r, c + 9) - 0.5) * 0.6) / rows) * H, c, r });
      // a route that moves left → right, choosing a row at each column
      path = [];
      let r = 1;
      for (let c = 0; c < cols; c++) {
        r = clamp(r + Math.round((hash(c, 3.3) - 0.5) * 2.4), 0, rows - 1);
        path.push(nodes[r * cols + c]);
      }
    },
    draw(x, W, H, t, m) {
      const near = (n) => (m ? Math.exp(-((n.x - m[0]) ** 2 + (n.y - m[1]) ** 2) / (W * W * 0.02)) : 0);
      x.lineWidth = 1;
      x.globalAlpha = 0.18;
      x.beginPath();
      nodes.forEach((a, i) => nodes.forEach((b, j) => {
        if (j <= i) return;
        if (Math.abs(a.c - b.c) <= 1 && Math.abs(a.r - b.r) <= 1) { x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); }
      }));
      x.stroke();
      x.globalAlpha = 1;
      nodes.forEach((n) => {
        const k = near(n);
        x.globalAlpha = 0.35 + k * 0.65;
        x.fillRect(n.x - 1.5 - k * 2, n.y - 1.5 - k * 2, 3 + k * 4, 3 + k * 4);
      });
      // the journey draws itself, then rests, then redraws
      const cyc = (t * 0.22) % 1.25, p = clamp(cyc, 0, 1) * (path.length - 1);
      x.globalAlpha = 1;
      x.lineWidth = 1.6;
      x.beginPath();
      x.moveTo(path[0].x, path[0].y);
      for (let i = 1; i <= Math.floor(p); i++) x.lineTo(path[i].x, path[i].y);
      const i0 = Math.floor(p), f = p - i0;
      let hx = path[i0].x, hy = path[i0].y;
      if (i0 < path.length - 1) {
        hx = lerp(path[i0].x, path[i0 + 1].x, ease(f));
        hy = lerp(path[i0].y, path[i0 + 1].y, ease(f));
        x.lineTo(hx, hy);
      }
      x.stroke();
      x.strokeRect(hx - 6, hy - 6, 12, 12);
      for (let i = 0; i <= i0; i++) x.fillRect(path[i].x - 3, path[i].y - 3, 6, 6);
    },
  };
}

function easeCurve() {
  return {
    init() {},
    draw(x, W, H, t, m) {
      const pad = 18, gw = Math.min(W * 0.62, H - pad * 2), gh = gw, gx = pad, gy = (H - gh) / 2;
      // pointer bends the curve: control points follow it
      const mx = m ? clamp(m[0] / W, 0, 1) : 0.5 + 0.3 * Math.sin(t * 0.5);
      const my = m ? clamp(m[1] / H, 0, 1) : 0.5 + 0.3 * Math.cos(t * 0.4);
      const c1 = [0.12 + mx * 0.6, my * 0.3], c2 = [1 - (0.12 + (1 - mx) * 0.4), 1 - (1 - my) * 0.25];
      const bez = (u) => {
        const a = (1 - u) ** 3, b = 3 * (1 - u) ** 2 * u, c = 3 * (1 - u) * u * u, d = u ** 3;
        return [b * c1[0] + c * c2[0] + d, b * c1[1] + c * c2[1] + d];
      };
      const P = (v) => [gx + v[0] * gw, gy + gh - v[1] * gh];
      x.lineWidth = 1;
      x.globalAlpha = 0.16;
      for (let i = 0; i <= 4; i++) {
        x.beginPath(); x.moveTo(gx + (gw * i) / 4, gy); x.lineTo(gx + (gw * i) / 4, gy + gh); x.stroke();
        x.beginPath(); x.moveTo(gx, gy + (gh * i) / 4); x.lineTo(gx + gw, gy + (gh * i) / 4); x.stroke();
      }
      x.globalAlpha = 0.4;
      x.setLineDash([3, 4]);
      x.beginPath(); x.moveTo(...P([0, 0])); x.lineTo(...P(c1)); x.moveTo(...P([1, 1])); x.lineTo(...P(c2)); x.stroke();
      x.setLineDash([]);
      x.strokeRect(P(c1)[0] - 3, P(c1)[1] - 3, 6, 6);
      x.strokeRect(P(c2)[0] - 3, P(c2)[1] - 3, 6, 6);
      x.globalAlpha = 1;
      x.lineWidth = 1.6;
      x.beginPath();
      for (let i = 0; i <= 60; i++) { const q = P(bez(i / 60)); i ? x.lineTo(...q) : x.moveTo(...q); }
      x.stroke();
      // a playhead runs the curve; two tracks on the right compare linear and eased
      const u = ((t * 0.45) % 1.4) / 1.2, uu = clamp(u, 0, 1);
      const b = bez(uu), q = P(b);
      x.fillRect(q[0] - 3, q[1] - 3, 6, 6);
      const tx = gx + gw + 26, tw = W - tx - pad;
      if (tw > 30) {
        [[0.38, uu, 0.4], [0.62, b[1], 1]].forEach(([yy, v, a]) => {
          const y = gy + gh * yy;
          x.globalAlpha = 0.2; x.lineWidth = 1;
          x.beginPath(); x.moveTo(tx, y); x.lineTo(tx + tw, y); x.stroke();
          x.globalAlpha = a;
          x.fillRect(tx + clamp(v, 0, 1.2) * tw - 5, y - 5, 10, 10);
        });
      }
    },
  };
}

function grid() {
  // two compositions of the same six blocks on a 12-col grid: [col, span, row, rowspan]
  const A = [[0, 7, 0, 3], [7, 5, 0, 2], [7, 5, 2, 1], [0, 4, 3, 2], [4, 4, 3, 2], [8, 4, 3, 2]];
  const B = [[0, 4, 0, 2], [4, 8, 0, 4], [0, 4, 2, 2], [0, 6, 4, 1], [6, 3, 4, 1], [9, 3, 4, 1]];
  return {
    init() {},
    draw(x, W, H, t, m) {
      const cols = 12, rows = 5, g = 6;
      const cw = (W - g * (cols - 1)) / cols, rh = (H - g * (rows - 1)) / rows;
      x.lineWidth = 1;
      x.globalAlpha = 0.05;
      for (let c = 0; c < cols; c++) x.fillRect(c * (cw + g), 0, cw, H);
      // reflow back and forth; the pointer's x scrubs it directly
      const auto = 0.5 - 0.5 * Math.cos(clamp(((t * 0.35) % 2) - 0.25, 0, 1.5) / 1.5 * TAU);
      const k = m ? clamp((m[0] / W - 0.2) / 0.6, 0, 1) : auto;
      A.forEach((a, i) => {
        const b = B[i], e = ease(clamp(k * 1.4 - i * 0.08, 0, 1));
        const c = lerp(a[0], b[0], e), s = lerp(a[1], b[1], e), r = lerp(a[2], b[2], e), rs = lerp(a[3], b[3], e);
        const X = c * (cw + g), Y = r * (rh + g), w = s * (cw + g) - g, h = rs * (rh + g) - g;
        x.globalAlpha = i === 1 ? 0.9 : 0.55;
        x.strokeRect(X + 0.5, Y + 0.5, w - 1, h - 1);
        if (i === 1) { x.globalAlpha = 0.12; x.fillRect(X, Y, w, h); }
        x.globalAlpha = 0.6;
        x.fillRect(X + 8, Y + 8, Math.min(w - 16, 46), 2);
        x.fillRect(X + 8, Y + 14, Math.min(w - 16, 28), 2);
      });
    },
  };
}

function field() {
  let pts = [];
  return {
    trails: true,
    init(W, H) {
      pts = Array.from({ length: 420 }, () => ({ x: Math.random() * W, y: Math.random() * H, a: Math.random() }));
    },
    draw(x, W, H, t, m, dt) {
      x.lineWidth = 1;
      const s = 0.006 * (300 / Math.max(200, W)) * 1.4;
      x.beginPath();
      pts.forEach((p) => {
        let ang = vnoise(p.x * s + t * 0.05, p.y * s - t * 0.03) * TAU * 2;
        if (m) {
          const dx = p.x - m[0], dy = p.y - m[1], d2 = dx * dx + dy * dy, r = W * 0.18;
          if (d2 < r * r) ang = lerp(ang, Math.atan2(dy, dx) + Math.PI / 2, 1 - Math.sqrt(d2) / r);
        }
        const v = 38 * dt * 1.6;
        const nx = p.x + Math.cos(ang) * v, ny = p.y + Math.sin(ang) * v;
        x.moveTo(p.x, p.y); x.lineTo(nx, ny);
        p.x = nx; p.y = ny; p.a += dt * 0.1;
        if (p.x < 0 || p.x > W || p.y < 0 || p.y > H || p.a > 1) { p.x = Math.random() * W; p.y = Math.random() * H; p.a = 0; }
      });
      x.globalAlpha = 0.75;
      x.stroke();
    },
  };
}

const KINDS = { graph, ease: easeCurve, grid, field };

export function initCapabilities(root = document) {
  root.querySelectorAll('[data-spec]').forEach((canvas) => {
    const make = KINDS[canvas.dataset.spec];
    if (!make) return;
    const spec = make();
    const x = canvas.getContext('2d');
    const card = canvas.closest('.svc') || canvas;
    let W = 0, H = 0, dpr = 1, t = Math.random() * 10, m = null, colour = '#fff';
    const fit = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(2, devicePixelRatio || 1);
      W = r.width; H = r.height;
      if (!W || !H) return;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      spec.init(W, H);
      colour = getComputedStyle(canvas).color;
    };
    new ResizeObserver(fit).observe(canvas);
    card.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      m = [e.clientX - r.left, e.clientY - r.top];
    }, { passive: true });
    card.addEventListener('pointerleave', () => (m = null));
    // the card flips colour on hover; re-read it as the transition runs
    card.addEventListener('pointerenter', () => { let n = 0; const id = setInterval(() => { colour = getComputedStyle(canvas).color; if (++n > 14) clearInterval(id); }, 50); });
    card.addEventListener('pointerleave', () => { let n = 0; const id = setInterval(() => { colour = getComputedStyle(canvas).color; if (++n > 14) clearInterval(id); }, 50); });
    let since = 0;
    visibleLoop(canvas, (dt) => {
      if (!W) return;
      t += dt;
      // the page theme flips as sections pass; keep the ink in step with the card's colour
      const now = performance.now();
      if (now - since > 300) { since = now; colour = getComputedStyle(canvas).color; }
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (spec.trails) {
        // fade the previous frame rather than clearing, so particles leave hairline trails
        x.globalCompositeOperation = 'destination-out';
        x.globalAlpha = 0.08;
        x.fillRect(0, 0, W, H);
        x.globalCompositeOperation = 'source-over';
      } else x.clearRect(0, 0, W, H);
      x.globalAlpha = 1;
      x.strokeStyle = x.fillStyle = colour;
      spec.draw(x, W, H, t, m, dt);
    });
  });
}

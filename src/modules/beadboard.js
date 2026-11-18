import { getCatPixels, CAT_SIZE } from './pixelcat.js';
import { reduced } from './env.js';

/**
 * BeadBoard — a playable miniature of Pocketmelon Beads.
 * Paint fuse beads onto a pegboard, load the mascot as a pattern, iron it,
 * count your beads and save the sheet. Keyboard: arrows to move, Space to place.
 */
export const BEAD_COLORS = [
  { name: 'Ink', hex: '#2b2421' },
  { name: 'Peach', hex: '#f6b98a' },
  { name: 'Cream', hex: '#fff4e2' },
  { name: 'Blush', hex: '#f2877a' },
  { name: 'Melon', hex: '#f26d60' },
  { name: 'Leaf', hex: '#6b8a4e' },
  { name: 'Moss', hex: '#536f3b' },
  { name: 'Sky', hex: '#5b7fb8' },
  { name: 'Butter', hex: '#f4c85b' },
  { name: 'White', hex: '#ffffff' },
];

export class BeadBoard {
  constructor(root, opts = {}) {
    this.root = root;
    this.opts = { n: CAT_SIZE.w, compact: false, autoplay: false, ...opts };
    this.n = this.opts.n;
    this.cells = new Array(this.n * this.n).fill(null);
    this.placed = new Float32Array(this.n * this.n);
    this.color = BEAD_COLORS[4].hex;
    this.erasing = false;
    this.iron = 0; // 0 loose → 1 fused
    this.ironTarget = 0;
    this.focus = { x: Math.floor(this.n / 2), y: Math.floor(this.n / 2), show: false };
    this.build();
    this.resize = this.resize.bind(this);
    new ResizeObserver(this.resize).observe(this.stage);
    this.resize();
    this.bind();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
    if (this.opts.autoplay && !reduced) this.startAutoplay();
    else if (this.opts.preset === 'cat') this.loadCat(false);
  }

  build() {
    const r = this.root;
    r.classList.add('bb');
    if (this.opts.compact) r.classList.add('bb--compact');
    r.innerHTML = `
      <div class="bb__stage"><canvas class="bb__canvas" tabindex="0" role="img"
        aria-label="Bead pegboard. Use arrow keys to move and Space to place a bead."></canvas></div>
      ${this.opts.compact ? '' : `
      <div class="bb__bar">
        <div class="bb__palette" role="radiogroup" aria-label="Bead colour">
          ${BEAD_COLORS.map((c, i) => `<button class="bb__swatch" role="radio" aria-checked="${i === 4}" aria-label="${c.name}" style="--c:${c.hex}" data-color="${c.hex}"></button>`).join('')}
        </div>
        <div class="bb__tools">
          <button class="bb__btn" data-act="erase" aria-pressed="false">Eraser</button>
          <button class="bb__btn" data-act="cat">Load mascot</button>
          <button class="bb__btn" data-act="clear">Clear</button>
          <button class="bb__btn bb__btn--hot" data-act="iron" aria-pressed="false">Iron it</button>
          <button class="bb__btn" data-act="save">Save PNG</button>
        </div>
        <p class="bb__count mono" aria-live="polite"><b data-count>0</b> beads · <b data-colors>0</b> colours</p>
      </div>`}
    `;
    this.stage = r.querySelector('.bb__stage');
    this.canvas = r.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
  }

  resize() {
    const w = this.stage.getBoundingClientRect().width;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cs = Math.floor((w * this.dpr) / this.n);
    const px = this.cs * this.n;
    this.canvas.width = px;
    this.canvas.height = px;
    this.canvas.style.width = `${px / this.dpr}px`;
    this.canvas.style.height = `${px / this.dpr}px`;
    this.dirty = true;
  }

  bind() {
    const c = this.canvas;
    let down = false;
    const at = (e) => {
      const r = c.getBoundingClientRect();
      const x = Math.floor(((e.clientX - r.left) / r.width) * this.n);
      const y = Math.floor(((e.clientY - r.top) / r.height) * this.n);
      return x >= 0 && y >= 0 && x < this.n && y < this.n ? [x, y] : null;
    };
    c.addEventListener('pointerdown', (e) => {
      this.stopAutoplay();
      down = true;
      c.setPointerCapture(e.pointerId);
      const p = at(e);
      if (p) this.paint(...p, e.button === 2 || this.erasing);
    });
    c.addEventListener('pointermove', (e) => {
      if (!down) return;
      const p = at(e);
      if (p) this.paint(...p, this.erasing);
    });
    c.addEventListener('pointerup', () => (down = false));
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('focus', () => ((this.focus.show = true), (this.dirty = true)));
    c.addEventListener('blur', () => ((this.focus.show = false), (this.dirty = true)));
    c.addEventListener('keydown', (e) => {
      const f = this.focus;
      const k = e.key;
      if (k === 'ArrowLeft') f.x = Math.max(0, f.x - 1);
      else if (k === 'ArrowRight') f.x = Math.min(this.n - 1, f.x + 1);
      else if (k === 'ArrowUp') f.y = Math.max(0, f.y - 1);
      else if (k === 'ArrowDown') f.y = Math.min(this.n - 1, f.y + 1);
      else if (k === ' ' || k === 'Enter') this.paint(f.x, f.y, this.erasing);
      else if (k === 'Backspace' || k === 'Delete') this.paint(f.x, f.y, true);
      else return;
      e.preventDefault();
      this.dirty = true;
    });

    this.root.querySelectorAll('.bb__swatch').forEach((b) =>
      b.addEventListener('click', () => {
        this.color = b.dataset.color;
        this.setErase(false);
        this.root.querySelectorAll('.bb__swatch').forEach((s) => s.setAttribute('aria-checked', s === b));
      })
    );
    this.root.querySelectorAll('[data-act]').forEach((b) =>
      b.addEventListener('click', () => {
        this.stopAutoplay();
        const act = b.dataset.act;
        if (act === 'erase') this.setErase(!this.erasing);
        if (act === 'clear') this.clear();
        if (act === 'cat') this.loadCat(true);
        if (act === 'iron') this.toggleIron();
        if (act === 'save') this.save();
      })
    );
  }

  setErase(v) {
    this.erasing = v;
    this.root.querySelector('[data-act="erase"]')?.setAttribute('aria-pressed', v);
  }

  paint(x, y, erase) {
    const i = y * this.n + x;
    const next = erase ? null : this.color;
    if (this.cells[i] === next) return;
    if (this.iron > 0) this.toggleIron(false);
    this.cells[i] = next;
    this.placed[i] = performance.now();
    this.dirty = true;
    this.updateCount();
  }

  clear() {
    this.cells.fill(null);
    this.toggleIron(false);
    this.dirty = true;
    this.updateCount();
  }

  loadCat(animate) {
    const px = getCatPixels();
    const off = Math.floor((this.n - CAT_SIZE.w) / 2);
    this.cells.fill(null);
    this.toggleIron(false);
    const now = performance.now();
    px.forEach((hex, i) => {
      if (!hex) return;
      const x = (i % CAT_SIZE.w) + off, y = Math.floor(i / CAT_SIZE.w) + off;
      if (x < 0 || y < 0 || x >= this.n || y >= this.n) return;
      const j = y * this.n + x;
      this.cells[j] = hex;
      this.placed[j] = animate ? now + (x + y) * 12 : 0;
    });
    this.dirty = true;
    this.updateCount();
  }

  toggleIron(force) {
    this.ironTarget = force === undefined ? (this.ironTarget ? 0 : 1) : force ? 1 : 0;
    if (force === false) this.iron = 0;
    this.root.querySelector('[data-act="iron"]')?.setAttribute('aria-pressed', !!this.ironTarget);
    const b = this.root.querySelector('[data-act="iron"]');
    if (b) b.textContent = this.ironTarget ? 'Un-iron' : 'Iron it';
    this.dirty = true;
  }

  updateCount() {
    const used = this.cells.filter(Boolean);
    const a = this.root.querySelector('[data-count]');
    const b = this.root.querySelector('[data-colors]');
    if (a) a.textContent = used.length;
    if (b) b.textContent = new Set(used).size;
  }

  save() {
    const a = document.createElement('a');
    a.download = 'pocketmelon-pattern.png';
    a.href = this.canvas.toDataURL('image/png');
    a.dataset.noTransition = '';
    a.click();
  }

  /* autoplay: a little timelapse of the mascot being beaded, ironed, cleared */
  startAutoplay() {
    const px = getCatPixels();
    const off = Math.floor((this.n - CAT_SIZE.w) / 2);
    this.queue = [];
    px.forEach((hex, i) => {
      if (!hex) return;
      this.queue.push([(i % CAT_SIZE.w) + off, Math.floor(i / CAT_SIZE.w) + off, hex]);
    });
    // fill by colour layers, like a real bead session
    this.queue.sort((a, b) => (a[2] > b[2] ? 1 : a[2] < b[2] ? -1 : a[1] - b[1] || a[0] - b[0]));
    this.auto = { i: 0, phase: 'bead', wait: 0 };
    let visible = false;
    new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(this.root);
    this.autoTick = () => {
      if (!this.auto || !visible) return;
      const A = this.auto;
      if (A.phase === 'bead') {
        for (let k = 0; k < 9 && A.i < this.queue.length; k++, A.i++) {
          const [x, y, hex] = this.queue[A.i];
          const j = y * this.n + x;
          this.cells[j] = hex;
          this.placed[j] = performance.now();
        }
        this.dirty = true;
        if (A.i >= this.queue.length) ((A.phase = 'iron'), (A.wait = 40));
      } else if (A.phase === 'iron') {
        if (--A.wait === 0) this.toggleIron(true);
        if (A.wait < -150) ((A.phase = 'clear'), (A.wait = 0));
      } else if (A.phase === 'clear') {
        this.clear();
        A.i = 0;
        A.phase = 'bead';
      }
    };
  }

  stopAutoplay() {
    if (this.auto) {
      this.auto = null;
    }
  }

  /* ------------------------------------------------------------ render */
  loop(now) {
    requestAnimationFrame(this.loop);
    this.autoTick?.();
    if (this.iron !== this.ironTarget) {
      const d = this.ironTarget - this.iron;
      this.iron += Math.sign(d) * Math.min(Math.abs(d), 0.018);
      this.dirty = true;
    }
    // keep animating while beads are popping in
    if (!this.dirty) {
      for (let i = 0; i < this.placed.length; i++) {
        if (this.cells[i] && now - this.placed[i] < 260 && now - this.placed[i] > -2000) {
          this.dirty = true;
          break;
        }
      }
    }
    if (this.dirty) {
      this.dirty = false;
      this.draw(now);
    }
  }

  draw(now) {
    const { ctx, cs, n } = this;
    const size = cs * n;
    ctx.clearRect(0, 0, size, size);
    // board
    ctx.fillStyle = this.opts.board || '#f4eee2';
    roundRect(ctx, 0, 0, size, size, cs * 1.2);
    ctx.fill();

    const front = this.iron * (2 * n + 8) - 4; // diagonal iron sweep
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        const cx = x * cs + cs / 2, cy = y * cs + cs / 2;
        const hex = this.cells[i];
        if (!hex) {
          ctx.fillStyle = 'rgba(43,36,33,0.13)';
          ctx.beginPath();
          ctx.arc(cx, cy, Math.max(0.8, cs * 0.09), 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        const age = now - this.placed[i];
        if (age < 0) {
          ctx.fillStyle = 'rgba(43,36,33,0.13)';
          ctx.beginPath();
          ctx.arc(cx, cy, Math.max(0.8, cs * 0.09), 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        const pop = age < 220 ? 1 + 0.45 * (1 - age / 220) : 1;
        const fused = Math.min(1, Math.max(0, front - (x + y))) ;
        ctx.fillStyle = hex;
        if (fused <= 0) {
          // loose bead: ring with hole
          const R = cs * 0.46 * pop;
          ctx.beginPath();
          ctx.arc(cx, cy, R, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.28)';
          ctx.beginPath();
          ctx.arc(cx - R * 0.25, cy - R * 0.25, R * 0.38, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(43,36,33,0.32)';
          ctx.beginPath();
          ctx.arc(cx, cy, R * 0.36, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // melted bead: grows towards a rounded square, hole shrinks
          const s = cs * (0.86 + 0.16 * fused);
          roundRect(ctx, cx - s / 2, cy - s / 2, s, s, cs * (0.46 - 0.3 * fused));
          ctx.fill();
          ctx.fillStyle = `rgba(43,36,33,${0.3 - 0.18 * fused})`;
          ctx.beginPath();
          ctx.arc(cx, cy, cs * (0.17 - 0.08 * fused), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    // heat glow along the sweep
    if (this.iron > 0 && this.iron < 1) {
      const p = (front * cs) / 2;
      const g = ctx.createLinearGradient(p - cs * 6, p - cs * 6, p + cs * 2, p + cs * 2);
      g.addColorStop(0, 'rgba(255,190,120,0)');
      g.addColorStop(0.7, 'rgba(255,190,120,0.35)');
      g.addColorStop(1, 'rgba(255,190,120,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    }
    if (this.focus.show) {
      ctx.strokeStyle = '#f26d60';
      ctx.lineWidth = Math.max(2, cs * 0.12);
      ctx.strokeRect(this.focus.x * cs + 1, this.focus.y * cs + 1, cs - 2, cs - 2);
    }
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

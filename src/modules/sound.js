/**
 * Tiny synthesized sound layer, off by default and remembered per session.
 * No audio files: short filtered noise ticks for voxels, a soft two-note "nom" for bites.
 */
let ctx = null;
let master = null;
let on = sessionStorage.getItem('pm:sound') === '1';
let lastTick = 0;
const listeners = new Set();

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);
  return ctx;
}

export const sound = {
  get on() { return on; },
  toggle(force) {
    on = typeof force === 'boolean' ? force : !on;
    sessionStorage.setItem('pm:sound', on ? '1' : '0');
    if (on) {
      ensure();
      ctx?.resume();
      this.chime();
    }
    listeners.forEach((fn) => fn(on));
    return on;
  },
  subscribe(fn) {
    listeners.add(fn);
    fn(on);
    return () => listeners.delete(fn);
  },

  /** a clack of plastic cubes; intensity 0..1, rate-limited */
  tick(intensity = 0.5) {
    if (!on || !ensure()) return;
    const now = ctx.currentTime;
    if (now - lastTick < 0.035) return;
    lastTick = now;
    const len = 0.05;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 6);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800 + Math.random() * 2600;
    bp.Q.value = 6;
    const g = ctx.createGain();
    g.gain.value = 0.12 + Math.min(1, intensity) * 0.35;
    src.connect(bp).connect(g).connect(master);
    src.start(now);
  },

  /** bite: a pitched pluck down a fourth */
  nom() {
    if (!on || !ensure()) return;
    const now = ctx.currentTime;
    [[660, 0], [495, 0.09]].forEach(([f, t]) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(f, now + t);
      o.frequency.exponentialRampToValueAtTime(f * 0.7, now + t + 0.12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now + t);
      g.gain.exponentialRampToValueAtTime(0.18, now + t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.16);
      o.connect(g).connect(master);
      o.start(now + t);
      o.stop(now + t + 0.2);
    });
  },

  chime() {
    if (!on || !ensure()) return;
    const now = ctx.currentTime;
    [784, 1175].forEach((f, k) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now + k * 0.07);
      g.gain.exponentialRampToValueAtTime(0.08, now + k * 0.07 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + k * 0.07 + 0.5);
      o.connect(g).connect(master);
      o.start(now + k * 0.07);
      o.stop(now + k * 0.07 + 0.6);
    });
  },
};

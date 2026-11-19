// Shared environment flags + tiny helpers
export const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
export const isDesktop = () => window.matchMedia('(min-width: 901px)').matches;

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

// Shared pointer state (client coordinates)
export const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2, active: false };
window.addEventListener(
  'pointermove',
  (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.active = true;
  },
  { passive: true }
);
document.documentElement.addEventListener('pointerleave', () => (pointer.active = false));

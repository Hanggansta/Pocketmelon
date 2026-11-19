/** Resolves once the CJK stylesheet is in and the faces used on screen have loaded (or 1.4 s pass). */
export const cjkCSS = import('../fonts-cjk.js').catch(() => {});
export const cjkReady = Promise.race([
  cjkCSS.then(() => document.fonts?.ready),
  new Promise((r) => setTimeout(r, 1400)),
]).catch(() => {});

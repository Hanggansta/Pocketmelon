import { ScrollTrigger } from 'gsap/ScrollTrigger';
import gsap from 'gsap';
import { reduced } from './env.js';
import { InkWater } from './ink/water.js';
import { supportsGL2, visibleLoop } from './gl/gl2.js';

/**
 * 三口成品: three drops of milk-white ink fall into black water, one per 口,
 * then the three plumes are drawn together into 品. Stir it apart; it gathers again.
 */
export function initPinInk(fig, { fontsReady = Promise.resolve() } = {}) {
  const canvas = fig?.querySelector('.pin__ink');
  if (!canvas || !supportsGL2()) return fig?.classList.add('no-ink'), null;
  let ink;
  try {
    ink = new InkWater(canvas, { host: fig, mode: 1, paper: '#0a0b0d', ink: '#0a0b0d', pigments: ['ink', 'cinnabar', 'azurite', 'gold'], vorticity: 26, buoyancy: 55, noise: 7, dyeDiss: 0.18, sim: 160, dye: 640, maxDpr: 1.5 });
  } catch (e) {
    console.warn('[pin] ink disabled:', e.message);
    return fig.classList.add('no-ink'), null;
  }
  fig.classList.add('has-ink');
  ink.u.vignette = 0.3;
  ink.trail = 0.6;
  ink.clickChannel = () => (Math.random() < 0.3 ? 1 : 0);
  visibleLoop(fig, (dt) => ink.frame(dt));

  const font = '"KingHwa_OldSong", "Noto Serif SC Variable", serif';
  const ready = (async () => {
    await fontsReady;
    for (let i = 0; i < 20; i++) {
      if ((await document.fonts.load(`100px ${font}`, '品')).length) break;
      await new Promise((r) => setTimeout(r, 150));
    }
  })().catch(() => {});

  const gather = { attract: 0, source: 0 };
  const apply = () => Object.assign(ink.u, gather, { buoyancy: 55 * (1 - gather.attract), vorticity: 26 - 16 * gather.attract, velDiss: 0.35 + 1.8 * gather.attract });
  const play = () => {
    // the three mouths of 品: top centre, bottom left, bottom right
    const tl = gsap.timeline({ onUpdate: apply });
    [[0.5, 0.83], [0.29, 0.5], [0.71, 0.5]].forEach(([x, y], i) => tl.add(() => ink.drop(x, y, { size: 0.95, amount: 3.2 }), i * 0.55));
    tl.add(() => ready.then(() => ink.setGlyph('品', { font, size: 0.8, dy: 0.03 })), 1.7)
      .to(gather, { attract: 1, source: 0.9, duration: 2.4, ease: 'power2.inOut' }, 1.75)
      .add(() => ink.drop(0.79, 0.2, { size: 0.45, channel: 1, amount: 3, force: 0.6 }), 3.6);
    return tl;
  };
  if (reduced) {
    ready.then(() => {
      ink.setGlyph('品', { font, size: 0.8, dy: 0.03 });
      Object.assign(gather, { attract: 1, source: 0.9 });
      apply();
      for (let i = 0; i < 150; i++) ink.step(1 / 60);
    });
  } else {
    ScrollTrigger.create({ trigger: fig, start: 'top 70%', once: true, onEnter: play });
  }
  return ink;
}

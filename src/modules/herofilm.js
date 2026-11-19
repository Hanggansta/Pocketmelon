import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { reduced } from './env.js';
import { InkWater } from './ink/water.js';
import { supportsGL2, visibleLoop } from './gl/gl2.js';
import { isZh, splitCJK } from './i18n.js';

/**
 * The hero is directed like a film opener.
 *
 *   00s  black. Two bars meet in the middle of the screen; a credit sits on the seam.
 *   01s  the bars part to a letterbox while the camera pulls back.
 *   02s  a single drop falls and hits the water. It mushrooms; two smaller drops follow.
 *   04s  the smoke is drawn together into the studio's name. Strokes keep breathing.
 *   05s  one line of copy resolves out of blur; the letterbox opens; the header arrives.
 *
 * Scrolling dissolves the name back into smoke, pushes the camera in and floods the frame
 * with ink, cutting straight into the black of the next section.
 *
 * Intro and scroll write to separate state; the frame loop blends them, so scrolling mid-intro
 * never fights a tween.
 */
const REST = { attract: 0, source: 0, buoyancy: 70, vorticity: 22, noise: 9, velDiss: 0.35, dyeDiss: 0.12 };
const SET = { attract: 1, source: 1.05, buoyancy: 0, vorticity: 8, noise: 4, velDiss: 2.2, dyeDiss: 0.12 };
const GONE = { attract: 0, source: 0, buoyancy: -60, vorticity: 26, noise: 16, velDiss: 0.5, dyeDiss: 0.35 };

export function initHeroFilm(section, { fontsReady = Promise.resolve() } = {}) {
  const frame = section.querySelector('.hero__frame');
  const canvas = section.querySelector('.hero__ink');
  const name = section.querySelector('.hero__name');
  const line = section.querySelector('.hero__line');
  const bars = section.querySelectorAll('.hero__bar');
  const credit = section.querySelector('.hero__credit');
  const tc = section.querySelector('.hero__tc');
  const drop = section.querySelector('.hero__drop');
  const cue = section.querySelector('.hero__cue');
  const header = document.querySelector('.header');

  const lineParts = isZh ? splitCJK(line, 'char') : SplitText.create(line, { type: 'words', wordsClass: 'word' }).words;

  let ink = null;
  if (supportsGL2()) {
    try {
      ink = new InkWater(canvas, { host: frame, ...REST });
    } catch (e) {
      console.warn('[hero] ink disabled:', e.message);
    }
  }
  section.classList.add(ink ? 'has-ink' : 'no-ink');
  if (import.meta.env.DEV) window.__ink = ink;

  // state: I = intro (tweened by the timeline), S = scroll (scrubbed)
  const I = { ...REST, zoom: 1.22 };
  const S = { k: 0, flood: 0, zoom: 0 };
  let t0 = 0;

  if (ink) {
    gsap.set(bars, { '--bar': 1 });
    header?.classList.add('is-film');
    if (!reduced) gsap.set(lineParts, { autoAlpha: 0, filter: 'blur(12px)', yPercent: 40 });
    visibleLoop(frame, (dt) => {
      const u = ink.u, k = S.k;
      for (const key in REST) u[key] = I[key] + (GONE[key] - I[key]) * k;
      u.zoom = I.zoom * (1 + 0.35 * S.zoom);
      u.flood = S.flood;
      ink.frame(dt);
      if (t0) {
        const s = Math.max(0, (performance.now() - t0) / 1000);
        const f = Math.floor((s % 1) * 24), ss = Math.floor(s) % 60, mm = Math.floor(s / 60) % 60;
        tc.textContent = `00:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
      }
    });
  } else {
    gsap.set(cue, { opacity: 1 });
  }

  const glyphReady = (async () => {
    const fam = getComputedStyle(name).fontFamily;
    try {
      await fontsReady;
      // freshly injected @font-face rules can resolve load() before the face exists: poll briefly
      for (let i = 0; i < 20; i++) {
        const got = await document.fonts.load(`100px ${fam}`, name.textContent);
        if (got.length) break;
        await new Promise((r) => setTimeout(r, 150));
      }
    } catch {}
  })();

  const condense = () => {
    if (!ink) return;
    ink.setGlyph(name.textContent.trim(), { el: name, font: getComputedStyle(name).fontFamily, spacing: 0.04 });
  };

  /** play the opener; resolves when the title is on screen */
  function intro() {
    if (!ink) return Promise.resolve();
    if (reduced) {
      gsap.set(bars, { '--bar': 0 });
      header?.classList.remove('is-film');
      return glyphReady.then(() => {
        condense();
        Object.assign(I, SET, { zoom: 1 });
        ink.drop(0.5, 0.56, { size: 1.2 });
        for (let i = 0; i < 160; i++) {
          for (const key in REST) ink.u[key] = I[key];
          ink.step(1 / 60);
        }
        gsap.set(cue, { opacity: 1 });
      });
    }
    t0 = performance.now();
    const H = () => frame.clientHeight;
    const tl = gsap.timeline();
    // credit on the seam
    tl.fromTo(credit, { opacity: 0, letterSpacing: isZh ? '1.1em' : '0.12em' }, { opacity: 1, letterSpacing: isZh ? '.6em' : '0.02em', duration: 1.4, ease: 'power2.out' }, 0.1)
      .fromTo(tc, { opacity: 0 }, { opacity: 1, duration: 0.6 }, 0.4)
      .to([credit, tc], { opacity: 0, duration: 0.5, ease: 'power1.in' }, 1.5)
      // the bars part to a 2.39:1 letterbox, camera pulls back
      .to(bars, { '--bar': () => Math.max(0, (1 - frame.clientWidth / 2.39 / H())), duration: 1.7, ease: 'expo.inOut' }, 1.55)
      .to(I, { zoom: 1, duration: 4.5, ease: 'power2.out' }, 1.55)
      // a drop falls…
      .fromTo(drop, { opacity: 1, y: () => -30, scaleY: 0.9 }, { y: () => H() * 0.42, scaleY: 1.5, duration: 0.62, ease: 'power2.in' }, 2.35)
      // …and hits the water
      .add(() => {
        gsap.set(drop, { opacity: 0 });
        ink.drop(0.5, 0.56, { size: 1.35 });
        gsap.fromTo(I, { zoom: 1.035 }, { zoom: I.zoom, duration: 0.9, ease: 'expo.out', overwrite: false });
      }, 2.97)
      .add(() => ink.drop(0.33, 0.6, { size: 0.75 }), 3.45)
      .add(() => ink.drop(0.68, 0.53, { size: 0.85, red: true }), 3.8)
      // the smoke condenses into the name
      .add(() => glyphReady.then(condense), 4.0)
      .to(I, { ...SET, duration: 2.6, ease: 'power2.inOut' }, 4.05)
      .to(lineParts, { autoAlpha: 1, filter: 'blur(0px)', yPercent: 0, duration: 1.4, stagger: isZh ? 0.06 : 0.08, ease: 'expo.out', clearProps: 'filter' }, 5.4)
      // letterbox opens; the page takes over
      .to(bars, { '--bar': 0, duration: 1.3, ease: 'expo.inOut' }, 5.9)
      .add(() => header?.classList.remove('is-film'), 6.3)
      .to(cue, { opacity: 1, duration: 0.8 }, 6.6);
    return new Promise((res) => tl.add(res, 5.6));
  }

  /** scroll: dissolve, push in, flood */
  function scroll() {
    if (!ink || reduced) return;
    gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 0.6,
        onUpdate: (self) => header?.classList.toggle('on-media', self.progress > 0.62),
        onLeaveBack: () => header?.classList.remove('on-media'),
      },
    })
      .to(S, { k: 1, duration: 0.55, ease: 'power1.in' }, 0)
      .to(S, { zoom: 1, duration: 1, ease: 'power2.in' }, 0)
      .to(lineParts, { autoAlpha: 0, yPercent: -60, filter: 'blur(10px)', stagger: 0.01, duration: 0.25, ease: 'power2.in' }, 0)
      .to(cue, { opacity: 0, duration: 0.1 }, 0)
      .to(S, { flood: 1, duration: 0.6, ease: 'power2.in' }, 0.4);
  }

  return { ink, intro, scroll };
}

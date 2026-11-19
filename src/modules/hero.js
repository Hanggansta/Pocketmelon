import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { reduced } from './env.js';

/**
 * Hero headline: each character soaks into the paper like ink.
 * Starts as a soft, pale bloom and contracts into a crisp letterform.
 */
export function prepareHero() {
  const words = document.querySelectorAll('.hero__words');
  const split = SplitText.create(words, { type: 'chars', charsClass: 'char' });
  const chars = split.chars;
  if (!reduced) {
    gsap.set(chars, { autoAlpha: 0, filter: 'blur(22px)', scale: 1.18, transformOrigin: '50% 60%' });
    gsap.set('.hero .reveal-up', { y: 18, autoAlpha: 0 });
  }
  return chars;
}

export function introHero(chars) {
  const tl = gsap.timeline();
  tl.to(chars, {
    keyframes: [
      { autoAlpha: 0.55, filter: 'blur(9px)', scale: 1.06, duration: 0.5, ease: 'power1.in' },
      { autoAlpha: 1, filter: 'blur(0px)', scale: 1, duration: 1.1, ease: 'expo.out' },
    ],
    stagger: { each: 0.075, from: 'start' },
    clearProps: 'filter',
  }, 0.15)
    .to('.hero .reveal-up', { y: 0, autoAlpha: 1, duration: 1.2, stagger: 0.05, ease: 'expo.out' }, 0.7);
  return tl;
}

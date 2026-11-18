import gsap from 'gsap';
import { pointer, lerp, clamp, finePointer } from './env.js';

/**
 * Work index: a floating preview follows the cursor with inertia, tilting
 * with horizontal velocity; images wipe in as you move between rows.
 */
export function initWorkHover() {
  if (!finePointer) return;
  const list = document.querySelector('.work__list');
  const items = [...list.querySelectorAll('.work__item')];
  const preview = document.querySelector('.work__preview');
  const inner = preview.querySelector('.work__preview-inner');

  const imgs = items.map((item) => {
    const img = new Image();
    img.src = item.dataset.img;
    img.alt = '';
    inner.appendChild(img);
    return img;
  });

  const pos = { x: pointer.x, y: pointer.y, r: 0 };
  let active = false;
  let z = 1;

  items.forEach((item, i) => {
    item.addEventListener('pointerenter', () => {
      items.forEach((it) => it.classList.remove('is-active'));
      item.classList.add('is-active');
      list.classList.add('is-hovering');
      imgs.forEach((im) => im.classList.remove('is-current'));
      imgs[i].style.zIndex = ++z;
      // force reflow so the wipe replays
      void imgs[i].offsetWidth;
      imgs[i].classList.add('is-current');
      if (!active) {
        pos.x = pointer.x;
        pos.y = pointer.y;
      }
      active = true;
      preview.classList.add('is-visible');
    });
  });

  list.addEventListener('pointerleave', () => {
    active = false;
    preview.classList.remove('is-visible');
    list.classList.remove('is-hovering');
    items.forEach((it) => it.classList.remove('is-active'));
  });

  gsap.ticker.add(() => {
    const dx = pointer.x - pos.x;
    pos.x = lerp(pos.x, pointer.x, 0.12);
    pos.y = lerp(pos.y, pointer.y, 0.12);
    pos.r = lerp(pos.r, clamp(dx * 0.06, -14, 14), 0.1);
    preview.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) rotate(${pos.r}deg)`;
  });
}

import gsap from 'gsap';
import { reduced } from './env.js';

/**
 * Reading desk — a playable miniature of Whisperleaf's loop:
 * Read → Understand (lookup / XRay) → Keep → Return (review with context).
 * Text: Pride and Prejudice, Jane Austen (public domain).
 */
const SENTENCES = [
  'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.',
  'However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered the rightful property of some one or other of their daughters.',
];

const GLOSS = {
  universally: ['adverb', 'By everyone; in every case.'],
  acknowledged: ['adjective', 'Accepted or admitted to be true.'],
  possession: ['noun', 'The state of owning or having something.'],
  fortune: ['noun', 'A large amount of money or property.'],
  want: ['noun', 'Old use: a lack of something. “In want of” means needing.'],
  neighbourhood: ['noun', 'The area around a place, and the people who live there.'],
  fixed: ['adjective', 'Firmly established; not likely to change.'],
  surrounding: ['adjective', 'Nearby; all around a place.'],
  rightful: ['adjective', 'Having a fair or legal claim to something.'],
  property: ['noun', 'Something that is owned. Here used ironically, of a person.'],
};

const XRAY = [
  { text: 'It is a truth', role: 'Main clause', note: 'Dummy “it” points forward to the that-clause.' },
  { text: 'universally acknowledged,', role: 'Modifier', note: 'Past participle phrase describing “truth”.' },
  { text: 'that a single man in possession of a good fortune,', role: 'Subject', note: 'Who the truth is about.' },
  { text: 'must be in want of a wife.', role: 'Predicate', note: 'The famously ironic claim.' },
];

export function initReader(root) {
  if (!root) return;
  const kept = [];
  root.classList.add('rd');
  root.innerHTML = `
    <div class="rd__page">
      <p class="rd__meta mono"><span>Pride and Prejudice</span><span>Chapter 1</span><span>Jane Austen</span></p>
      <div class="rd__text">${SENTENCES.map(
        (s, si) =>
          `<span class="rd__s" data-s="${si}">${s
            .split(/(\s+)/)
            .map((tok) => {
              const clean = tok.toLowerCase().replace(/[^a-z]/g, '');
              return GLOSS[clean] ? `<button class="rd__w" data-w="${clean}" data-s="${si}">${tok}</button>` : tok;
            })
            .join('')}</span>`
      ).join(' ')}</div>
      <div class="rd__actions">
        <button class="rd__btn" data-xray aria-expanded="false">XRay sentence one</button>
        <span class="rd__hint mono">Tap a dotted word</span>
      </div>
      <ol class="rd__xray" hidden>
        ${XRAY.map((x, i) => `<li style="--i:${i}"><span class="rd__xtext">${x.text}</span><span class="rd__xrole mono">${x.role}</span><span class="rd__xnote">${x.note}</span></li>`).join('')}
      </ol>
    </div>
    <aside class="rd__side">
      <div class="rd__card" aria-live="polite">
        <p class="rd__empty">Look something up and it appears here, with the passage still attached.</p>
      </div>
      <div class="rd__deck">
        <div class="rd__deck-head"><p class="mono">Kept <b data-kept>0</b></p><button class="rd__btn rd__btn--ghost" data-review disabled>Review</button></div>
        <ul class="rd__kept" aria-label="Kept words"></ul>
      </div>
    </aside>
  `;

  const card = root.querySelector('.rd__card');
  const keptList = root.querySelector('.rd__kept');
  const keptCount = root.querySelector('[data-kept]');
  const reviewBtn = root.querySelector('[data-review]');

  const context = (w, si) =>
    SENTENCES[si].replace(new RegExp(`\\b(${w})\\b`, 'i'), '<mark>$1</mark>');

  const show = (w, si, mode = 'lookup') => {
    const [pos, def] = GLOSS[w];
    const isKept = kept.some((k) => k.w === w);
    card.innerHTML = `
      <p class="rd__card-mode mono">${mode === 'review' ? 'Review' : 'Lookup'}</p>
      <h4 class="rd__word">${w}</h4>
      <p class="rd__pos mono">${pos}</p>
      <p class="rd__def">${def}</p>
      <p class="rd__ctx-label mono">In context</p>
      <p class="rd__ctx">${context(w, si)}</p>
      <div class="rd__card-actions">
        ${mode === 'review'
          ? `<button class="rd__btn" data-return="${w}" data-si="${si}">Return to the page</button><button class="rd__btn rd__btn--ghost" data-next>Next card</button>`
          : `<button class="rd__btn" data-keep="${w}" data-si="${si}" ${isKept ? 'disabled' : ''}>${isKept ? 'Kept ✓' : 'Keep this word'}</button>`}
      </div>`;
    if (!reduced) gsap.from(card.children, { y: 12, autoAlpha: 0, stagger: 0.04, duration: 0.5, ease: 'power3.out' });
  };

  root.querySelectorAll('.rd__w').forEach((b) =>
    b.addEventListener('click', () => {
      root.querySelectorAll('.rd__w').forEach((x) => x.classList.toggle('is-active', x === b));
      show(b.dataset.w, +b.dataset.s);
    })
  );

  let reviewIdx = 0;
  card.addEventListener('click', (e) => {
    const keep = e.target.closest('[data-keep]');
    const ret = e.target.closest('[data-return]');
    const next = e.target.closest('[data-next]');
    if (keep) {
      const w = keep.dataset.keep;
      kept.push({ w, si: +keep.dataset.si });
      const li = document.createElement('li');
      li.textContent = w;
      keptList.appendChild(li);
      keptCount.textContent = kept.length;
      reviewBtn.disabled = false;
      keep.textContent = 'Kept ✓';
      keep.disabled = true;
      root.querySelector(`.rd__w[data-w="${w}"]`)?.classList.add('is-kept');
      if (!reduced) {
        const from = keep.getBoundingClientRect();
        const to = li.getBoundingClientRect();
        gsap.from(li, { x: from.left - to.left, y: from.top - to.top, scale: 1.4, duration: 0.8, ease: 'expo.out' });
      }
    }
    if (ret) {
      const w = root.querySelector(`.rd__w[data-w="${ret.dataset.return}"]`);
      root.querySelectorAll('.rd__w').forEach((x) => x.classList.toggle('is-active', x === w));
      w?.classList.add('is-returned');
      setTimeout(() => w?.classList.remove('is-returned'), 1600);
      w?.focus({ preventScroll: true });
    }
    if (next) {
      reviewIdx = (reviewIdx + 1) % kept.length;
      showReview();
    }
  });

  const showReview = () => {
    const k = kept[reviewIdx];
    card.innerHTML = `
      <p class="rd__card-mode mono">Review ${reviewIdx + 1} / ${kept.length}</p>
      <h4 class="rd__word">${k.w}</h4>
      <p class="rd__ctx rd__ctx--blur">${context(k.w, k.si)}</p>
      <div class="rd__card-actions"><button class="rd__btn" data-reveal>Reveal meaning</button></div>`;
    card.querySelector('[data-reveal]').addEventListener('click', () => show(k.w, k.si, 'review'));
    if (!reduced) gsap.from(card.children, { rotateX: -40, autoAlpha: 0, stagger: 0.05, duration: 0.6, ease: 'expo.out' });
  };
  reviewBtn.addEventListener('click', () => {
    reviewIdx = 0;
    showReview();
  });

  const xBtn = root.querySelector('[data-xray]');
  const xList = root.querySelector('.rd__xray');
  xBtn.addEventListener('click', () => {
    const open = xList.hidden;
    xList.hidden = !open;
    xBtn.setAttribute('aria-expanded', open);
    root.querySelector('.rd__s[data-s="0"]').classList.toggle('is-xray', open);
    if (open && !reduced) gsap.from(xList.children, { y: 16, autoAlpha: 0, stagger: 0.08, duration: 0.6, ease: 'expo.out' });
  });
}

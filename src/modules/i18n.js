/** Language of the current page (set at build time on <html lang>). Chinese is the default. */
export const lang = document.documentElement.lang.toLowerCase().startsWith('en') ? 'en' : 'zh';
export const isZh = lang === 'zh';
/** t('中文', 'English') */
export const t = (zh, en) => (isZh ? zh : en);
/** prefix an internal path for the current language */
export const href = (path) => (isZh ? path : `/en${path}`);

/* ---------------------------------------------------------------- 避头尾
 * Split CJK text into per-character spans for scroll reveals without breaking
 * Chinese line-breaking rules: closing punctuation (，。、：”」…) is glued to the
 * character before it, opening punctuation (“「《（) to the character after it.
 * Glued groups are nowrap, so no line ever starts with a comma or ends with a
 * quote. Returns the character spans (punctuation included).
 */
const NO_START = '，。、：；！？）》」』】〉”’…—·%,.!?:;)';
const NO_END = '（《「『【〈“‘(';
export function splitCJK(el, cls = 'word') {
  const out = [];
  const walk = (node) => {
    [...node.childNodes].forEach((n) => {
      if (n.nodeType === 1) return walk(n);
      if (n.nodeType !== 3 || !n.textContent.trim()) return;
      const chars = [...n.textContent];
      const frag = document.createDocumentFragment();
      // group: [opening*] char [closing*]
      let i = 0;
      while (i < chars.length) {
        const g = [];
        while (i < chars.length && NO_END.includes(chars[i])) g.push(chars[i++]);
        if (i < chars.length) g.push(chars[i++]);
        while (i < chars.length && NO_START.includes(chars[i])) g.push(chars[i++]);
        const spans = g.map((c) => {
          if (/\s/.test(c)) return document.createTextNode(c);
          const s = document.createElement('span');
          s.className = cls;
          s.textContent = c;
          out.push(s);
          return s;
        });
        if (spans.length > 1) {
          const wrap = document.createElement('span');
          wrap.style.whiteSpace = 'nowrap';
          spans.forEach((s) => wrap.appendChild(s));
          frag.appendChild(wrap);
        } else frag.appendChild(spans[0]);
      }
      n.replaceWith(frag);
    });
  };
  walk(el);
  return out;
}

/* SplitText options for Chinese: segment into real words (Intl.Segmenter), glue
 * punctuation per 避头尾, and join with a zero-width delimiter so SplitText can
 * find line breaks inside space-less CJK text. English gets the defaults. */
const ZW = '\u200c';
const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('zh', { granularity: 'word' }) : null;
export function cjkPrepare(text) {
  const parts = seg ? [...seg.segment(text)].map((s) => s.segment) : [...text];
  const out = [];
  let carry = '';
  for (const p of parts) {
    if (/^\s+$/.test(p)) { out.push(carry + p); carry = ''; continue; }
    if (out.length && [...p].every((c) => NO_START.includes(c)) && !carry) { out[out.length - 1] += p; continue; }
    if ([...p].every((c) => NO_END.includes(c))) { carry += p; continue; }
    out.push(carry + p);
    carry = '';
  }
  if (carry) out.push(carry);
  return out.join(ZW);
}
export const splitOpts = isZh ? { prepareText: cjkPrepare, wordDelimiter: { delimiter: new RegExp(ZW), replaceWith: '' } } : {};

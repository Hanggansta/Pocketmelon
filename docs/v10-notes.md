# v10 notes: from competent to directed

## The critique this pass answers

The v9 site had the right ingredients — real engines, a film-like hero, a strict grid — but the
direction was flat:

1. **Motion was a formula.** Nearly every element arrived with `y: 50, autoAlpha: 0`. The same
   easing, the same duration, the same order. Nothing had anticipation, overlap or a reason to
   move the way it did.
2. **The page had no instrument layer.** It read as a stack of sections, not as a measured,
   authored object. Nothing told you where you were, how much was left, or that someone had
   placed each hairline on purpose.
3. **The case studies were thin.** No real product interface was shown anywhere. The "Screens"
   section was empty by design, so the two cases leaned on mood photographs and a canvas.
4. **There was almost no CSS craft.** Everything worth looking at needed WebGL or GSAP. Scroll,
   hover and layout effects that CSS can do beautifully were left on the table.

## What v10 changes

### 1. An instrument layer

| Piece | What it does | Where |
|---|---|---|
| Scroll read-out | A 2 px melon hairline at the top of the viewport, driven by `animation-timeline: scroll(root block)`. No JS. | `fx.css` |
| Crop marks | Four fixed corner brackets. The viewport is a frame. | `header.html`, `fx.css` |
| Side index | 序 / 作 / 室 / 览 / 验 / 能 / 流 / 信. The active dot stretches and names itself. | `index.html`, `motion.js` |
| Case index | The same rail on case pages: 题 演 述 节 面 记 下 信, with 信 lighting up over the next-case and footer block. | case pages |
| Hero chrome | Corner data, coordinates, a dripping play cue and two vertical rails around the film. Covered by the letterbox bars until they part. | `index.html`, `v10.css` |
| Section rule | A hairline draws under each section title as it settles (`--rule` tweened by GSAP). | `motion.js`, `v10.css` |
| Footer sign-off | A full-width POCKETMELON wordmark that fills from left to right with scroll (`background-clip: text` + `animation-timeline: view()`). | `footer.html`, `v10.css` |

### 2. Pure CSS effects (the brief asked for them)

`src/styles/fx.css` is a reusable effects layer. Every item has a finished state when the
feature is unsupported:

- **Marquees** with two identical sets per track, so `-50%` loops seamlessly; hover pauses them.
- **Scroll-driven timelines**: progress bar, rules that draw, captions that unmask, the footer
  wordmark fill, sections that lift into place — all `animation-timeline`.
- **Conic hairline edge** (`.fx-frame`) on the showcase CTA, animated with a registered
  `@property` angle.
- **Pointer tilt** (`[data-tilt]`) with a CSS radial glare, used on the interface studies.
- **Hover crop** (`.fxD-crop`), underline draw (`.fxD-link`), spreadsheet-thin focus sweeps on
  form fields, chip check dots, a seal that stamps itself (`.fx-stamp`).
- **Typography details**: `text-wrap: balance/pretty`, optical sizing, a real hairline scrollbar.
- **A loader hairline**: the 000→100 counter also drives a 2 px rule (a CSS variable written by
  one `requestAnimationFrame` loop), so the wait has a measure.

Reduced motion: every loop freezes at a composed frame, the services wrap instead of dying on a
horizontal track, and nothing is hidden behind an animation.

#### No JavaScript

The `<noscript>` block in `partials/head.html` is not a banner: it rebuilds the page out of CSS.

- The hero becomes a single screen: letterbox bars and the loader disappear, the brush name keeps
  its ink colour, and the dot field stays.
- The pinned showcase opens its window (`--in: 0`) onto the real engine stills, with the HUD and
  copy band intact; on desktop each case becomes one screen instead of 250 vh of sticky scroll.
- Capabilities stack into a column; progress rail hidden.
- Labs become CSS-only stills — a halftone dot field over a spectral gradient for Grains, layered
  conic/radial ink for Marbled paper, a jade disc for the seal — and the dead controls are hidden.
- Both case engines show their stills (beads source / reading desk), and the Beads interface study
  shows the source photograph in place of the 880 generated beads.
- Section titles, the band, the footer fill and the figure captions still move, because those
  effects never needed script.

### 3. GSAP that behaves like direction, not decoration

- Reveals now use a masked line rise with a slight rotation (`expo.out`, 1.15 s) and a soft
  stagger, instead of the same fade-up everywhere.
- Labels arrive a beat before their content; ledger cells land one by one; process steps read as
  one ledger.
- Scroll velocity leans the marquee (`skewX` via `quickTo`) and the capability cards as they
  travel sideways, then settles them.
- The CTA opens from a clip instead of spinning in from nothing.
- A new `motion.js` holds the continuous layer (rail, progress, tilt, velocity, counters) so
  page choreography stays in `home.js` / `case.js`. The proof-strip numbers (48 bead colours,
  the four-step loop) count once when they enter, via `[data-count]`.

### 4. Cases with a product in them

- **Interface studies**: the Beads app is rebuilt in HTML/CSS — browser chrome, tools, a live
  40 × 22 bead plate, palette, bead count, grid, colours, export. The plate is the real source
  photograph sampled down and quantised in OKLab against a bead palette, then drawn as 880 CSS
  beads. The Whisperleaf app is a warm-paper reading desk: shelf spines, Austen in an editorial
  serif, a gloss popover, CEFR rail, kept words and a review card.
- **Proof strip**: four facts between the engine and the brief (48 bead colours, one shader,
  zero uploads, PWA / A1–C2, the four-step loop, private by default, three import formats).
- **Renumbered chapters** and a seal stamp in the hero margin; both cases now read as one
  argument instead of a gallery.

### 5. Editorial furniture on the home page

- A light **marquee band** between the dark film and the studio: four statements, an asterisk
  from the site's own pixel face, and a reversed technical line.
- A **ledger** under the studio statement (base / size / model / reply) so credibility is
  concrete rather than adjectival.
- **Three things we don't bend** is now a ledger of rules, not three cards. Hover inverts the
  whole row to ink.
- The work index gained a real table header and a status column.
- Labs and capabilities got introductions; the process became a sticky note beside a four-step
  ledger with deliverables.

## Verification

- `npx vite build` is clean.
- HTML checked for balanced tags and unresolved `[[zh||en]]` strings in zh and en.
- No new dependency; no three.js; all canvases still pause off-screen.
- Visual QA checklist for a browser pass: 1440 × 900 and 390 × 844, the hero intro, the pinned
  showcase, the horizontal capabilities at 700 px viewport height, both interface studies,
  reduced motion, and no-JS (hero still, showcase stills, stacked capabilities, CSS lab stills,
  case engine stills, study caption).

# Pocketmelon — Studio site

The studio site for **Pocketmelon 口袋瓜**, an independent design & engineering studio in Tokyo.
Benchmark: Awwwards / FWA / Webby winning entries, extended with the "phenomenal" criteria below.

## Pages
| Path | What |
|---|---|
| `/` | Home: hero, feature, studio principles, selected work, Labs, services, process, inquiry |
| `/work/whisperleaf/` | Case study: Whisperleaf, with a playable reading-desk demo (lookup → keep → review → return, sentence XRay) |
| `/work/beads/` | Case study: 口袋瓜拼豆 Beads, with a playable bead board (paint, load mascot, iron, save PNG) |

Pages are plain HTML in a multi-page Vite build. Shared markup lives in `partials/` and is inlined with `<!-- @include name -->` (see `vite.config.js`).

## Run
```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build → dist/
```

## The mascot
The pixel cat from the logo is rebuilt as a **44×44 living sprite** (`src/modules/pixelcat.js`) and drawn on canvas at a stepped 12 fps:
it blinks, watches the cursor, nibbles the melon bite by bite (with crumbs), celebrates and regrows the slice.
It shows up in the header logo, the loader (it eats the melon as the page loads), page transitions, Labs, the Beads hero and the inquiry form (it pops when you pick options).

- Source of truth: `tools/build-sprite.py`. It writes `src/modules/cat-sprite.json`, `public/favicon.svg` and `public/brand/pocketmelon-mark.svg`.
- Run it with `python3 tools/build-sprite.py` (needs Pillow for the preview image).

## Adding real captures (screenshots / screen recordings)
1. Put files in `public/work/<slug>/captures/` (`slug` = `whisperleaf` or `beads`).
2. List them in `src/data/captures.json`:
   ```json
   { "whisperleaf": [
       { "src": "/work/whisperleaf/captures/desk.webp", "type": "image", "device": "desktop", "caption": "The reading desk" },
       { "src": "/work/whisperleaf/captures/review.mp4", "type": "video", "device": "mobile", "caption": "Review with context" }
   ] }
   ```
3. The "Screens" section on the case page appears automatically, using desktop browser or phone frames.

Videos autoplay muted and loop, and pause when off-screen. Use H.264 MP4 at 1440px wide or less, 8–15 s, no audio.

## Art direction: everything is made of beads

One material carries the whole site: **fuse beads on a pegboard** (our Beads product, our pixel mascot).

| Moment | What happens | Module |
|---|---|---|
| Hero | ~1,900 beads pour onto a pegboard and become the cat. Brush them to part them, click for a shockwave. On the first bite, melon beads fall off. On scroll every bead flies back into the header logo ("back in its pocket"). | `src/modules/beadhero.js` |
| Headline | The full stop in "into." is a square pixel, like the dot in the wordmark. It hops when the cat bites. | `home.css` `.px-dot` |
| Feature | The Whisperleaf card starts as a bead pattern and sharpens into the photograph as it expands to full bleed. | `mosaic.js` (`data-mosaic-scrub`) |
| Any photo | A fast scroll flick breaks every on-screen image into beads, which settle back when you stop. | `mosaic.js` velocity loop |
| Case images | Bead-resolve on enter, pixel-swap on hover. | `mosaic.js` |
| Footer | The closing "Pocketmelon" wordmark is rebuilt in beads. It pours in column by column and parts under the cursor. | `src/modules/beadtext.js` |

Everything respects `prefers-reduced-motion` and falls back to a finished, static state.

## Design system
| Token | Value | Role |
|---|---|---|
| Paper | `#EFEBE3` | Light canvas |
| Rind | `#15231A` | Dark canvas |
| Ink | `#121611` | Text |
| Melon | `#FF4F3F` | Single accent |
| Rind light | `#B9D98A` | Accent on dark |
| Beads cream | `#FDF9EF` | Mascot stages (from the Beads app) |

Type:
- **Fraunces** for display (opsz · SOFT · WONK);
- **Geist** for body and **Geist Mono** for labels;
- **Pixelify Sans** for the pixel wordmark and loader;
- **PM Glyphs** (`tools/build-glyphs.py`), a 572-byte pixel font for the arrows and symbols, which none of the brand fonts include.

Styles are split by concern in `src/styles/`: base, brand, home, sections, case, footer, responsive.

## Benchmark, extended
On top of the Awwwards criteria (design, usability, creativity, content), the site is held to:
1. **One idea, everywhere.** The pixel/bead grid drives the logo, loader, transitions, image reveals, glyphs and demos.
2. **Proof over claims.** No made-up clients or awards. Two live products, each with a playable demo.
3. **Craft details.** Every interaction has its own micro-motion, the custom glyphs match the brand, and there are no font fallbacks.
4. **Inclusive by default.** `prefers-reduced-motion` gets a complete static site, focus styles are visible, demos work by keyboard, hover effects are limited to fine pointers, and pages never scroll sideways on mobile.
5. **Performance.** All canvas loops pause when off-screen, there is no WebGL dependency, and images are WebP.
6. **A conversion path.** The inquiry builder (need, timeline, details) creates a pre-filled email; the reply time is stated up front.

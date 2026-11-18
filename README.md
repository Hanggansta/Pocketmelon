# Pocketmelon — Digital Studio Website

An award-benchmark (Awwwards / FWA / Webby) single-page site for **Pocketmelon**, an independent design & technology studio in Tokyo & Lisbon.

## Stack
- **Vite** (vanilla JS, ES modules)
- **GSAP 3** — ScrollTrigger + SplitText
- **Lenis** — smooth scrolling
- Self-hosted variable fonts: **Fraunces** (opsz · wght · SOFT · WONK), **Geist**, **Geist Mono**

## Run
```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build → dist/
```

## Design system
| Token | Value | Role |
|---|---|---|
| Paper | `#EFEBE3` | Light canvas |
| Rind | `#15231A` | Dark canvas (services, footer) |
| Ink | `#121611` | Text |
| Melon | `#FF4F3F` | Single accent |
| Rind light | `#B9D98A` | Accent on dark |

Type: Fraunces for display (italic + WONK for emphasis), Geist for body, Geist Mono for labels. Fluid `clamp()` scale, 12-column grid.

## Signature interactions
- **Loader**: a melon slice fills as the counter runs to 100, then the panel wipes away
- **Seed field** (hero canvas): a grid of melon seeds turns toward the cursor, swells, ripens to red and gets pushed aside; drifts on its own on touch screens
- **Variable-font proximity**: hero letters get heavier and softer near the cursor (Fraunces `wght` + `SOFT`)
- **Inline image pill** in the headline cycles through project work
- **Feature expand**: a pinned card grows to full-bleed as you scroll
- **Manifesto**: words light up one by one as you scroll
- **Work index**: a floating preview follows the cursor with inertia and tilts with speed; images wipe in; rows switch to italic
- **Services**: pinned horizontal scroll with a progress rule; melon fill rises on hover
- **Theme shift**: the page background moves between paper and rind section by section
- **Marquees** react to scroll speed (direction + skew)
- Magnetic CTAs, a context-aware cursor with velocity stretch, text-roll links, copy-to-clipboard email, live Tokyo/Lisbon clocks

## Accessibility & responsive
- Respects `prefers-reduced-motion` (no smooth scroll, loader or scroll animations; content stays fully visible)
- Custom cursor and hover-only effects only turn on for fine pointers
- Mobile: full-screen menu, stacked services, inline work thumbnails
- Skip link, focus-visible styles, aria labels on split headlines

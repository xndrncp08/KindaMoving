# KindaMoving design system

One system, three experiences: **KM Home** (an athletic command centre), **KM Routes** (a map-first geospatial workspace) and **KM Analyze** (a performance instrument). They share these tokens, type, components and navigation model. Every other module (Training, Conditions, Ghost, Gear, Form, Settings) is built from the same parts.

| Document | Covers |
| --- | --- |
| [TOKENS.md](TOKENS.md) | Colour (with measured contrast), type scale, space, radii, motion |
| [COMPONENTS.md](COMPONENTS.md) | Primitives in `@km/ui` and the app-level patterns built from them |
| [NAVIGATION.md](NAVIGATION.md) | Information architecture, desktop rail vs mobile tab bar, interaction rules |
| [ACCESSIBILITY.md](ACCESSIBILITY.md) | WCAG 2.2 AA commitments, how they are met, and the visual QA checklist |

Source of truth: `apps/web/src/app/globals.css` (tokens and styles) and `packages/ui/src/index.tsx` (primitives). UI changes are reviewed against the [Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines) using the installed `web-design-guidelines` agent skill.

## Brand

- **Voice**: plain, specific, a little dry. Numbers first, adjectives last. Never claim certainty the data does not have.
- **Palette**: charcoal ink on warm off-white paper (dark theme inverts to off-white on charcoal), and exactly **one** accent, *Volt* `#d4ff3a`. Volt marks the single most important thing on a screen: the primary action, the selected route, the current position. If two things are Volt, one of them is wrong.
- **Mark**: the KM monogram on a Volt tile. The wordmark is set in Archivo at an expanded width (118%) and is marked `translate="no"`.
- **Not used**: gradients as decoration, glassy cards, emoji, stock imagery, illustration filler, "AI" sparkle iconography.

## Typography

| Role | Face | Setting |
| --- | --- | --- |
| UI and body | Archivo (variable `wght` 100–900, `wdth` 62–125) | 15px base, 1.5 line height |
| Headings | Archivo, `font-stretch: 112%`, 700–800 | tight tracking (−0.02 to −0.035em), `text-wrap: balance` |
| Hero numbers | Archivo, 118% width, 800 | tabular, unit set at 0.3em in muted ink |
| Labels, axes, provenance | JetBrains Mono, 500 | 11–12px uppercase, +0.06–0.08em tracking |

Both fonts are self-hosted by `next/font` at build time (no runtime request to Google; compatible with the `font-src 'self'` CSP) and load with `font-display: swap`.

**Numbers** are always tabular (`font-variant-numeric: tabular-nums`) wherever they are compared: metrics, tables, charts, timers. Units are separated from values, smaller and muted. Durations under an hour read `m:ss`; at an hour or more `h:mm:ss`; totals of time read `1 h 20 min` so they can never be confused with a pace.

## The three experiences

- **KM Home** answers "how is my week going and what's next?". Its hero is this week's distance against the goal, with a per-day bar strip, then next workout, last run, recent runs and shoe rotation.
- **KM Routes** is map-first. The map fills the workspace; controls float in a collapsible panel (desktop) or a bottom sheet (mobile). Candidates are compared with a segmented switcher; start points have undo and redo.
- **KM Analyze** is an instrument. Every summary value is labelled *Measured*, *Estimated* or *Inferred*; pace, heart rate and elevation share one crosshair which also drives a marker on the map; splits show deviation from the run's own average.

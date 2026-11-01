# Tokens

Defined once on `:root` (light, "paper") and `.dark` (dark, "night") in `apps/web/src/app/globals.css`. Components use only these custom properties. Theme follows the system by default (`next-themes`, class strategy); `color-scheme` and `<meta name="theme-color">` match each theme.

## Colour

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg` | `#f3f1ea` | `#111311` | Page |
| `--surface` | `#fbfaf6` | `#181b18` | Cards, panels, tables |
| `--surface-2` | `#ebe8df` | `#20241f` | Sunken fills, segmented track, hover |
| `--ink` | `#161816` | `#f1efe8` | Primary text, focus outline |
| `--ink-2` | `#3b3f3b` | `#d2d0c8` | Secondary text |
| `--muted` | `#5b6058` | `#a3a89f` | Supporting text, axis labels |
| `--line` | `#dcd8cd` | `#2b302b` | Decorative dividers only |
| `--line-strong` | `#8a8579` | `#6b7268` | Control boundaries (inputs, checkboxes, outline buttons) |
| `--accent` (Volt) | `#d4ff3a` | `#d4ff3a` | Primary action fill, selected route, focus halo |
| `--accent-ink` | `#161816` | `#161816` | Text on Volt |
| `--accent-strong` | `#4a6600` | `#d4ff3a` | Volt's text/stroke form (pace series, active indicator) |
| `--meter` | `#4a6600` | `#d4ff3a` | Progress fills (Volt fails 3:1 on light paper) |
| `--danger` / `--warn` / `--good` | `#b42318` / `#92400e` / `#2c6e2f` | `#ff8a7a` / `#f5b84a` / `#8fd694` | Status, sparingly |
| `--series-pace` / `--series-hr` / `--series-terrain` | accent-strong / `#c2410c` / `#8f8a7d` | Volt / `#ff7a45` / `#6f7469` | Chart series |
| `--measured` / `--estimated` / `--inferred` | ink / `#6a5a00` / `#6c4ab6` | ink / `#e8d36a` / `#b9a2f5` | Provenance chips |

### Measured contrast (WCAG 2.x relative luminance)

Text tokens against each background they appear on, computed from the hex values above:

| Foreground | Light: bg / surface / surface-2 | Dark: bg / surface / surface-2 |
| --- | --- | --- |
| ink | 15.8 / 17.1 / 14.6 | 16.2 / 15.1 / 13.7 |
| muted | 5.70 / 6.17 / 5.26 | 7.70 / 7.16 / 6.49 |
| accent-strong | 5.82 / 6.30 / 5.37 | 16.2 / 15.0 / 13.6 |
| danger | 5.82 / 6.29 / 5.37 | 8.15 / 7.58 / 6.88 |
| warn | 6.27 / 6.79 / 5.79 | 10.5 / 9.79 / 8.88 |
| series-hr | 4.58 / 4.96 / 4.23 | 7.22 / 6.72 / 6.09 |
| estimated | 6.04 / 6.54 / 5.57 | 12.4 / 11.6 / 10.5 |
| inferred | 5.64 / 6.11 / 5.21 | 8.49 / 7.90 / 7.16 |
| line-strong (non-text) | 3.25 / 3.52 / 3.00 | 3.76 / 3.50 / 3.17 |

Ink on Volt: 15.4:1. All text pairs meet AA (4.5:1) on the surfaces where they are used. `series-hr` is used as a chart stroke and, as text, only on `bg`/`surface`. `--line` is decorative (card edges where the card is also distinguished by its contents) and is never the only boundary of a control.

## Type scale

`--text-xs` 12 · `--text-sm` 13 · `--text-base` 15 · `--text-md` 17 · `--text-lg` 22 · `--text-xl` 28 · `--text-2xl` clamp(32–44) · `--text-display` clamp(42–92). Form controls render at a minimum of 16px so iOS does not zoom on focus.

## Space, shape, elevation

- Space (4px grid): `--s-1` 4 · `--s-2` 8 · `--s-3` 12 · `--s-4` 16 · `--s-5` 24 · `--s-6` 32 · `--s-7` 48 · `--s-8` 64.
- Radii: `--r-sm` 4 (chips, focus) · `--r-md` 8 (controls) · `--r-lg` 12 (cards, panels, sheets) · `--r-pill`.
- Elevation: borders do the work. One shadow, `--shadow-float`, is reserved for things floating over a map or page (panels, dialogs, map tools).
- Hit targets: 44×44px minimum for every control (tab bar items 48px).

## Motion

`--dur-1` 120ms (hover, press) · `--dur-2` 200ms (dialogs, fades) · `--dur-3` 320ms (sheets, meters). Easing `--ease-out` cubic-bezier(.2,.8,.2,1). Only `transform`, `opacity` and colours animate; transitions list their properties (never `all`). Press feedback is `scale(0.98)`. Under `prefers-reduced-motion: reduce`, durations collapse to ~0 and iteration counts to one.

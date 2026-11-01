# Navigation and interaction

## Information architecture

Grouped by what the runner is trying to do, not by module name:

| Group | Destinations |
| --- | --- |
| — | **Home** |
| Review | **Runs** (log, import, per-run analysis) · **Trends** (load, consistency, bests) · **Ghost** |
| Plan | **Routes** · **Training** · **Conditions** |
| Equip | **Gear** · **Form** |
| — | **Settings** (profile, units, COROS, data export, account deletion) |

There are no *Tracks* or *Community* destinations: those features do not exist, so they are not shown.

## One mental model, two layouts

- **Desktop (>720px)**: a 248px left rail with the groups above, a persistent **Import Run** primary action, and theme/log-out at the foot. The active item gets a surface fill and a 3px accent-strong bar.
- **Mobile (≤720px)**: a sticky header (brand + Import) and a bottom **tab bar** with the four most frequent destinations (Home, Runs, Routes, Training) plus **More**. More opens a bottom sheet containing the *same grouped list* as the desktop rail, so nothing moves between groups. More shows as current when the active page lives inside it. The tab bar respects `env(safe-area-inset-bottom)`; toasts sit above it.

## Interaction rules

- Navigation is always `<a>`/`<Link>` (Cmd/Ctrl-click works); actions are `<button>`.
- Stateful UI that should survive reload or be shareable lives in the URL: route start point (`?lat&lon`), requested distance and tempo (`?km&tempo`), ghost pair (`?a&b`).
- Destructive actions confirm in an in-app dialog (`ConfirmButton` or the record delete dialog): deleting records, condition reports and form analyses, and disconnecting COROS. Account deletion additionally requires typing DELETE. Synchronous navigation guards (leaving a dirty form) still use the browser's native prompt, because they must block navigation.
- Unsaved work warns before leaving: route candidates that have not been saved trigger `beforeunload`.
- Gestures always have alternatives: map click to set a start point has **My Location** and **Map Centre** (pan with arrow keys, then press it); undo/redo are buttons as well as Cmd/Ctrl+Z / Shift+Cmd/Ctrl+Z (ignored while typing in a field).
- Loading copy ends with an ellipsis ("Searching the Network…"); async results announce through `aria-live="polite"` regions.
- External workout or route pushes (COROS) always require an explicit confirmation step; imports are read-only.

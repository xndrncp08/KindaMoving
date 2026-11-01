# Components

## Primitives (`@km/ui`)

| Component | Notes |
| --- | --- |
| `Button` | Variants `default` (Volt), `outline`, `ghost`, `destructive`; `asChild` for links. Labels are specific Title Case verbs ("Save Route A", "Import Run"). Add `className="button-icon"` plus `aria-label` for icon-only buttons. |
| `Input`, native `select`, `textarea` | 44px min height, 16px text, `--line-strong` boundary, `aria-invalid` turns the border red. Labels wrap their control. |
| `Card` | Surface + hairline + 12px radius. Not a click target; interactive cards are `<button>`s or contain links. |
| `Metric` | Label, tabular value, optional `unit`, `detail` and `provenance`. |
| `Provenance` | `measured` (solid dot), `estimated` (dashed ring), `inferred` (hatched ring). Shape differs, not only colour. |
| `EmptyState`, `ErrorState` | Errors say what failed and what to do next; `ErrorState` takes `retry`. |
| `Skeleton` | Shimmer (stops under reduced motion), `role="status"`. |
| `DataTable` | Horizontal scroll container; use `className="n"` on numeric `th`/`td` for right alignment. |
| `Dialog` | Radix dialog. `drawer` (side) or `sheet` (bottom, with grab handle and safe-area padding). Focus is trapped and restored; content uses `overscroll-behavior: contain`. |
| `Tabs` | Radix tabs styled as a segmented control (`className="tabs"` on `TabsList`). |

## App patterns

| Pattern | Where | Rules |
| --- | --- | --- |
| Page head | Every page | Mono eyebrow, balanced H1, one sentence of context; actions right-aligned (`.page-head.row`). |
| Instrument strip (`.instrument`) | Run analysis, best efforts | Bordered grid of cells; each value has a provenance chip; values never wrap. |
| Week strip (`.week-days`) | Home | Seven bars scaled to the week's peak or a fifth of the goal; today uses `--meter`; future days are hatched lines. |
| Segmented switcher (`.segmented`) | Route candidates | Real `<button aria-pressed>`; letter plus key number. |
| Workspace (`.workspace`) | Route planner | Full-bleed map; `.workspace-panel` floats (desktop) or docks as a sheet (≤720px); `.map-tools` toolbar for undo/redo/overlays; `fitPadding` keeps geometry clear of the panel. |
| Split bar (`.splitbar`) | Splits tables | Centre line is the run's average pace; Volt-strong right = faster, terrain grey left = slower; ±15% fills the half; a signed percentage sits beside it. |
| Map symbology (`MapLegend`, `mapColor`) | All maps | Selected route: Volt core with charcoal casing. Alternatives: dashed grey. Tempo: orange. Crossings: red (major) / amber (minor). Conditions: violet. Start/runner: charcoal with white ring. |
| Synced streams (`ActivityCharts`) | Run analysis | Shared `syncId`, distance x-axis, mono ticks, reversed pace axis, a cursor readout line and map marker. |

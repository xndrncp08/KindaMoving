# Components

## Primitives (`@km/ui`)

| Component                            | Notes                                                                                                                                                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Button`                             | Variants `default` (Volt), `outline`, `ghost`, `destructive`; `asChild` for links. Labels are specific Title Case verbs ("Save Route A", "Import Run"). Add `className="button-icon"` plus `aria-label` for icon-only buttons. |
| `Input`, native `select`, `textarea` | 44px min height, 16px text, `--line-strong` boundary, `aria-invalid` turns the border red. Labels wrap their control.                                                                                                          |
| `Card`                               | Surface + hairline + 12px radius. Not a click target; interactive cards are `<button>`s or contain links.                                                                                                                      |
| `Metric`                             | Label, tabular value, optional `unit`, `detail` and `provenance`.                                                                                                                                                              |
| `Provenance`                         | `measured` (solid dot), `estimated` (dashed ring), `inferred` (hatched ring). Shape differs, not only colour.                                                                                                                  |
| `EmptyState`, `ErrorState`           | Errors say what failed and what to do next; `ErrorState` takes `retry`.                                                                                                                                                        |
| `Skeleton`                           | Shimmer (stops under reduced motion), `role="status"`.                                                                                                                                                                         |
| `DataTable`                          | Horizontal scroll container; use `className="n"` on numeric `th`/`td` for right alignment.                                                                                                                                     |
| `Dialog`                             | Radix dialog. `drawer` (side) or `sheet` (bottom, with grab handle and safe-area padding). Focus is trapped and restored; content uses `overscroll-behavior: contain`.                                                         |
| `Tabs`                               | Radix tabs styled as a segmented control (`className="tabs"` on `TabsList`).                                                                                                                                                   |

## App patterns

| Pattern                                 | Where                      | Rules                                                                                                                                                                                         |
| --------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page head                               | Every page                 | Balanced H1, optional useful eyebrow and concise context; actions right-aligned (`.page-head.row`).                                                                                           |
| Instrument strip (`.instrument`)        | Run analysis, best efforts | Bordered grid of cells; recorded values may share a scope note; estimates and inferences stay explicitly labelled; values never wrap.                                                         |
| Week strip (`.week-days`)               | Home                       | Seven bars scaled to the week's peak or a fifth of the goal; today uses `--meter`; future days are hatched lines.                                                                             |
| Segmented switcher (`.segmented`)       | Route candidates           | Real `<button aria-pressed>`; letter plus key number.                                                                                                                                         |
| Workspace (`.workspace`)                | Route planner              | Full-bleed map; `.workspace-panel` floats (desktop) or docks as a sheet (≤720px); `.map-tools` toolbar for undo/redo/overlays; `fitPadding` keeps geometry clear of the panel.                |
| Split bar (`.splitbar`)                 | Splits tables              | Centre line is the run's average pace; Volt-strong right = faster, terrain grey left = slower; ±15% fills the half; a signed percentage sits beside it.                                       |
| Map symbology (`MapLegend`, `mapColor`) | All maps                   | Selected route: Volt core with charcoal casing. Alternatives: dashed grey. Tempo: orange. Crossings: red (major) / amber (minor). Conditions: violet. Start/runner: charcoal with white ring. |
| Synced streams (`ActivityCharts`)       | Run analysis               | Shared `syncId`, distance x-axis, mono ticks, reversed pace axis, a cursor readout line and map marker.                                                                                       |

## Refinement patterns

- **Disclosures** (`.disclosure`): native `details`/`summary`, 44px minimum summary. Use for imports, advanced readings, editing, training paces and account management. Keep child forms mounted so collapsing does not discard input. Open Import through its existing `#import` link on initial and same-page navigation.
- **Record management** (`.record-actions`): editing, save/unsave and confirmed deletion share a contextual disclosure. Primary activity links and key metrics remain visible.
- **Gear**: each shoe appears once in the library with total mileage, `ShoeStats`, default/retired state and management. Rotation and unassigned-run tools remain separate; detailed breakdowns remain on the shoe page. Wear uses `--meter`, with clamped meter semantics.
- **Settings** (`.settings-section`, `.settings-subsection`): use section dividers rather than nested cards. Keep connected devices ahead of password/account management.
- **Badges and provenance**: neutral statuses use Archivo and existing neutral surfaces. Volt is reserved for meaningful selection/progress or the primary action. Keep technical axes in Mono; ordinary metric labels use Archivo.
- **Dialogs**: programmatic opening captures the initiating element and restores focus on close when it still exists. Radix still owns modal focus containment and Escape behavior.

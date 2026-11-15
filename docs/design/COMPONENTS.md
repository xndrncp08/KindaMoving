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

## Authentication patterns

- **Auth shell** (`AuthShell`, `.auth`): one 440px column with the brand, content and legal links. At ≥960px a charcoal route panel (`RouteArt`, decorative and `aria-hidden`) joins it. Phones top-align content so the form does not jump when the keyboard resizes the viewport. Used by login, signup, reset request, `/auth/reset` and onboarding.
- **Password field** (`PasswordField`): label wraps the input, and the 44px show/hide toggle sits outside the label so it never joins the input's accessible name. It uses `aria-pressed`.
- **Password rules** (`PasswordRules`): a two-column checklist under new-password fields (12+ characters, letter, number, passwords match). Unmet rules show a hollow circle in muted text; met rules show a check in `--good`. Linked to the password input by `aria-describedby`, with screen-reader “(met)/(not yet)” text.
- **Field feedback**: `.field-error` (danger) or `.field-hint` (muted; `.met` turns it `--good` with a check) directly under the control, linked by `aria-describedby`. Validation runs when a field is left, then live while it is corrected.
- **Inbox state**: after signup/reset, the form gives way to "Check your inbox" with the address, a disabled "Resend in Ns" button and a way back. Copy is conditional ("If … has an account") so it never confirms an account exists.
- **Buttons**: auth screens use one full-width 48px Volt action; Google, if enabled, is an outline button below an "or" divider.

## Landing

- **Night bands** (`.night`): the hero and closing statement scope the documented dark tokens (same values as `.dark`) to a region in either theme, so focus rings, buttons and badges adapt without new colours. The auth side panel uses the same scope.
- **Run preview** (`RunPreview`): the app's own language (route, tabular stats, split bars with the fastest in Volt), captioned "Illustrative preview · sample data". It's shared by the landing hero and the auth panel.
- **Bands, not card grids**: the section titles use `--text-2xl`, the pillars are separated by top rules, and the spotlights pair copy with one real-language visual each (provenance metrics, map symbology, watch face). Sample visuals are always captioned as sample data.

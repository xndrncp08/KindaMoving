# Accessibility (WCAG 2.2 AA)

| Criterion                                  | How it is met                                                                                                                                                               |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1.1 Non-text content                     | Decorative icons `aria-hidden`; maps carry a descriptive `aria-label` and every map fact also exists as text (metrics, reasons, tables).                                    |
| 1.3.1 Info and relationships               | Landmarks (`nav` ×2 with distinct labels, `main#main`), headings in order (page H1 visually hidden only on the map workspace), `dl` for stat strips, real tables with `th`. |
| 1.4.1 Use of colour                        | Provenance chips differ by shape; split bars carry a signed percentage; route candidates are lettered; crossings are counted in text.                                       |
| 1.4.3 / 1.4.11 Contrast                    | All text ≥4.5:1, control boundaries ≥3:1 in both themes (see TOKENS.md). Progress uses `--meter`, not Volt, on light paper.                                                 |
| 1.4.4 / 1.4.10 Resize and reflow           | Fluid type, no fixed-width layouts; 320px wide works without horizontal page scroll (tables scroll inside their container). Zoom is never disabled.                         |
| 1.4.13 Content on hover                    | Chart tooltips are supplementary; the cursor readout duplicates them as text.                                                                                               |
| 2.1.1 Keyboard                             | Every action is a button or link; candidate selection, undo/redo, panel collapse, start-point setting all work without a pointer.                                           |
| 2.4.1 Bypass blocks                        | "Skip to content" link, first focusable element.                                                                                                                            |
| 2.4.7 / 2.4.11 Focus visible, not obscured | Two-tone ring (2px ink outline + 5px Volt halo) on `:focus-visible`; sticky header/tab bar use `scroll-margin` on anchored targets.                                         |
| 2.5.7 Dragging                             | No drag-only interactions (map panning also via keyboard and buttons).                                                                                                      |
| 2.5.8 Target size                          | 44px minimum controls; tab bar 48px.                                                                                                                                        |
| 3.3.1 / 3.3.3 Errors                       | Errors are worded with the fix ("Distance must be 1–42.2 km."), announced with `role="alert"` and fields get `aria-invalid`.                                                |
| 4.1.3 Status messages                      | Toasts (sonner), route search results and cursor readouts use live regions where appropriate.                                                                               |
| Motion                                     | `prefers-reduced-motion` disables animation; no autoplaying motion.                                                                                                         |

## Visual QA checklist (run per change)

1. Light and dark, at 390, 820, 1440 and 1920px wide; no horizontal page scroll.
2. Tab through the page: skip link first, visible ring on every stop, nothing hidden under the header or tab bar.
3. Every number tabular; units muted and separated; no hard-coded date formats (use `Intl` helpers in `lib/metrics.ts`).
4. Only one Volt element competes for attention per view.
5. Empty, loading and error states render sensibly with zero, one and many records and very long names.
6. Forms: labels, `autocomplete`, correct `type`/`inputMode`, worded inline errors, submit stays enabled until the request starts.
7. Maps: the selected route is identifiable without colour (casing, legend, text metrics); panels don't cover fitted geometry.
8. Run the `web-design-guidelines` skill on changed files and resolve findings.

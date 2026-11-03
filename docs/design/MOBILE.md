# Mobile-first design

Phones are KindaMoving's primary surface; desktop enhances the same structure. Layouts start from 320 px wide and add columns, rails and side panels as space allows. This document records the breakpoints, interaction patterns and the device-testing procedure.

## Breakpoints and layout modes

| Range                                      | Shell                                                                               | Notes                                                        |
| ------------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| ≤ 720 px, portrait                         | Sticky brand header (+ Import), bottom tab bar (Home, Runs, Routes, Training, More) | Single column; tables keep 3–4 columns with tight cells      |
| ≤ 720 px, landscape (phones on their side) | Same as above                                                                       | Route planner docks its panel to the side instead of a sheet |
| 721–1000 px (tablets)                      | 216 px rail                                                                         | Two-column grids                                             |
| > 1000 px                                  | 248 px rail                                                                         | Up to four columns                                           |

Measured against the matrix in `apps/web/e2e/mobile-audit.ts`: 320×568, 360×800, 375×667, 390×844, 393×852, 414×896, 430×932, 568×320, 932×430, 768×1024, 1024×768, 1280×800, 1440×900 and 1920×1080.

## Safe areas, viewport units and the keyboard

- `viewport-fit=cover`; the header, tab bar, map tools and sheets pad with `env(safe-area-inset-*)`.
- Full-height surfaces use `dvh` or fixed insets, never `vh`, so expanding and collapsing browser chrome never leaves a gap or hides controls.
- `interactive-widget=resizes-content`: on Android, the on-screen keyboard shrinks the layout viewport, so a focused field and its error stay visible. iOS Safari pans instead; both are covered.
- While a text field, select or textarea in the page has focus, the tab bar is removed (`body:has(main input:focus) .tabbar`). Otherwise it would sit on top of the keyboard and cover the field.
- Zoom is never disabled. Inputs render at 16 px or more so iOS does not auto-zoom on focus.

## Navigation

- The tab bar holds the four most frequent destinations. Everything else is in **More**, a bottom sheet with the same Review / Plan / Equip groups as the desktop rail.
- **Back closes sheets.** Opening More pushes one history entry (native `pushState`, which the App Router supports). Browser Back and Android Back pop it and close the sheet; Escape or the close button pop it too, so no stray entry remains. Following a link from the sheet replaces it.
- Deep links keep state: planner start/distance (`?lat&lon&km`), Ghost pair (`?a&b`), list filters (`?q&status&week`).

## KM Home: glance first

On phones the order is: **next workout** (one line when nothing is scheduled), **this week** (hero distance, goal meter, day strip, time on feet and consistency), **last run**, the **status strip** (COROS sync state, current condition reports near the last map area), recent runs, then shoes. One DOM serves both layouts: CSS `order`, with `display: contents` on the desktop two-up wrapper.

## KM Routes: the map is the screen

- On phones the workspace is fixed from the top edge to the tab bar. The brand header steps aside on this page only, and map tools respect the top safe area.
- **Portrait: three-stop bottom sheet** (`lib/use-sheet.ts`): _peek_ (72 px, shows the title and candidate count), _half_ (50%), _full_ (the screen minus a 64 px map strip, so the map tools stay reachable).
  - **Gesture coordination:** only the handle starts a drag (`touch-action: none` on the handle). The map keeps pan and pinch everywhere else, and the sheet body scrolls normally with `overscroll-behavior: contain`.
  - **Rendering:** the drag writes a CSS variable, not React state, so nothing re-renders per frame. The sheet moves with `transform`, and its body is capped to the visible height so the last control is always reachable.
  - **Settling:** a fling moves one stop; a slow release picks the nearest.
  - **Keyboard and tap:** tap or Enter toggles peek and half; ArrowUp/ArrowDown step between stops.
  - **Map fit:** routes refit into the visible map whenever the stop changes. The map itself is never resized, because the sheet overlays it.
- **Landscape phones:** the panel docks left (at most 340 px or 55%). The tools stack in a column beside it, clear of the zoom controls.
- **Fewer keystrokes:** one-tap distance chips (5, 8, 10, 16, 21.1 km). Route preferences collapse into a disclosure with a one-line summary of the current choices.
- **Kept from desktop:** candidate switcher, undo/redo (buttons plus Cmd/Ctrl+Z), Map Centre and My Location as non-gesture start points, conditions overlay, GPX export, and the unsaved-candidates guard.

## KM Analyze: an instrument that fits

- A sticky, horizontally scrolling **section bar** (Summary, Streams, Map, Splits, Efforts, Context). Links only appear for sections that exist; Splits renders a placeholder while loading, so its anchor always works.
- **Charts:** a labelled sample slider supports keyboard arrows and touch without relying on a hover. Secondary charts/maps mount when visible, keep their reserved space, and have an explicit Load button. A horizontal drag scrubs the synced cursor (`touch-action: pan-y` keeps vertical page scrolling). The cursor readout repeats the values as text, and per-km values are also in the Splits table, which is the accessible alternative to the charts.
- **Splits at 320 px:** Km, Pace, deviation bar with a signed %, and HR. Distance, time and climb return on wider screens.
- **Embedded maps** (run, Ghost, Conditions) use MapLibre cooperative gestures: one finger scrolls the page, two fingers move the map. The full-screen planner opts out.

## Other modules

- **Conditions** (for reporting outdoors): map first, **Use My Location**, and one-tap chips for kind, severity and when. Details are optional.
- **Training:** the week renders as a vertical agenda (day | workouts, or "Rest"), not seven 140 px columns.
- **Ghost:** the scrubber spans the full width above Play and Speed.
- **Runs:** a compact import card with the platform file chooser styled as a full-width button. Phone rows keep date, distance, pace and compare; edit and delete live on the run's page (delete is confirmed).
- **Settings and onboarding:** the weekly goal is entered in km or mi (stored as metres).

## Automated checks

- `e2e/mobile.spec.ts` checks every page at every matrix viewport:
  - page-level horizontal overflow
  - text clipped without an ellipsis
  - controls under 44×44 px (inline text links excepted)
  - fixed bars covering the last control
  - console errors

  It also saves a full-page screenshot per page and viewport. Public pages run in CI; signed-in pages run when `KM_E2E_EMAIL` and `KM_E2E_PASSWORD` name a dedicated test account.

- `e2e/mobile-flows.spec.ts` runs on a Pixel 7 profile and covers:
  - Back closing More
  - sheet drag and keyboard snaps
  - the keyboard hiding the tab bar
  - Home order, condition chips, the training agenda, and run sections fitting
- All of this is **emulated Chromium**: touch events, viewport and device scale, but not real Safari, real keyboards or real GPS.

## Physical-device acceptance (manual)

Run on at least one recent iPhone (Safari, and installed to the Home Screen) and one mid-range Android phone (Chrome, and installed):

1. Sign in; rotate through portrait and landscape on Home, Routes and a run; check nothing is hidden behind the notch, Dynamic Island or home indicator.
2. Routes: drag the sheet through all three stops with one thumb; pan and pinch the map with the sheet at half; set a start with My Location (grant, then deny, permission); generate, switch candidates, export GPX and open it in the COROS app or Files.
3. Tap Distance and type: the field and its error stay above the keyboard and the tab bar disappears; dismiss the keyboard and the tab bar returns.
4. Open More, then press Back (Android) or swipe back (iOS): the sheet closes and the page stays.
5. Runs: import a FIT file from Files/Drive; Form: record or pick a video.
6. Conditions: report with My Location in bright light; check contrast and target size outdoors.
7. Turn on airplane mode, report a condition (queued), turn it off: it is sent. Reload: still signed in, on the same page.

Record device model, OS and browser versions, and results in the release report. Emulated results must not be reported as device results.

### Phase 5 hardware sign-off worksheet (all pending)

Use protected staging, an **isolated** synthetic account/project, and a reviewed
synthetic GPX/FIT and short video. Do not publish test condition reports to the
shared database. Keep the reviewer within the existing staging access boundary.
Record deployment ID/SHA, device model, OS/browser version, CSS viewport,
standalone/browser mode, network, date/time, result and a redacted recording.

| Required surface              | Sizes                            | Portrait/landscape | Hardware result |
| ----------------------------- | -------------------------------- | ------------------ | --------------- |
| iOS Safari                    | Small (e.g. SE) and large iPhone | Both               | Pending         |
| Installed iOS Home Screen app | Same devices                     | Both               | Pending         |
| Android Chrome                | Small/mid-range and large phone  | Both               | Pending         |
| Installed Android PWA         | Same devices                     | Both               | Pending         |

Repeat the following on each surface. A Playwright device profile does not fill
any cell in this table.

| Case                 | Exact actions                                                                                                                                                                                                                        | Pass condition                                                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cold Home/date       | Clear only site cache/storage, sign in with synthetic account; open Home before locale cookies exist, then reload. Repeat near local midnight.                                                                                       | Correct week/date after hydration, no React error, no flashing wrong day; remembered visit paints server content. Capture a remote-inspector trace separately from lab Lighthouse.    |
| Insets/chrome        | Home, run, planner: expand/collapse address bar, rotate both ways, scroll to the last control, zoom text to 200%.                                                                                                                    | No notch/home-indicator overlap, blank viewport strip, horizontal page scroll or unreachable controls. Browser zoom remains enabled.                                                  |
| Keyboard             | Focus planner distance then Conditions details; type, show validation, switch fields, rotate while keyboard is open, dismiss via platform action.                                                                                    | Field/error reachable above keyboard; fixed tabs hide for text entry and return after blur. No sheet jump or trapped scroll.                                                          |
| GPS                  | From fresh permission state tap My Location; grant, deny, revoke in OS settings, then retry (include timeout/disabled GPS).                                                                                                          | Honest error/status, no fabricated position, map-centre/manual selection remains usable. No repeated permission loop.                                                                 |
| Map gestures         | Embedded run/Conditions/Ghost: swipe one finger vertically, then pan with two and pinch. Full-screen planner: pan with one finger and pinch.                                                                                         | Page scroll remains available on embedded maps; cooperative hint works; map remains interactive without scrolling the page in full-screen mode.                                       |
| Sheet                | Slow drag and fling through all stops; scroll a long sheet to both ends; interrupt a handle drag by rotating; use handle keyboard alternatives with a hardware keyboard. Reload `?sheet=full` and return from another screen.        | No scroll/drag conflict or lost last action, cancellation keeps last committed stop, URL/reload restores it. Momentum does not move the map unexpectedly.                             |
| Back/navigation      | Open More, Android Back / iOS edge swipe; follow a More link, then Back. Repeat standalone, including system app switch/resume.                                                                                                      | Sheet closes before page navigation, no duplicate history entry, expected page restored. Record standalone iOS behavior explicitly.                                                   |
| File chooser/failure | Choose synthetic FIT/GPX from Files/Drive, cancel once, select a malformed file and one above 4 MiB; in isolated staging, interrupt a valid upload then retry. Pick/record a short synthetic video only if Form capacity is enabled. | Cancel is harmless, validation honest, retry retains selection where the OS permits it; no duplicate import. A 202 response alone is not a processed import.                          |
| Offline recovery     | Load Conditions online, airplane mode, queue a synthetic report; reload, force-close/reopen, reconnect. Repeat lost-response retry; switch/logout accounts with pending items.                                                       | Queue survives restart for the same account, one server `client_id`, rejection displayed, other accounts cannot see or replay it. Run only with isolated data and verify server rows. |
| GPX/COROS handoff    | Export a reviewed saved route; save/open GPX via iOS share/Files and Android Downloads. Open in installed COROS if supported. OAuth/sync only with an expressly authorized account.                                                  | Valid GPX/coordinates, download reachable after resume, actual app handoff recorded. File opening is not OAuth/sync acceptance.                                                       |
| Accessibility        | VoiceOver/TalkBack: navigate headings, sheet handle, chart sample slider, file input, error and offline status. Test reduced motion and both themes outdoors.                                                                        | Controls have meaningful names, slider values include units, focus is visible/ordered, no gesture-only action, status/rejection announced without continuous chart chatter.           |

A release reviewer must attach actual results and unresolved defects before private
beta invitations. Installed PWA, Safari, OS keyboards, GPS, native pickers, pinch
latency and momentum remain hardware gates even when emulation passes.

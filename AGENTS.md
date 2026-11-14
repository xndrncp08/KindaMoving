# KindaMoving interface standards

Read `docs/design/` before changing UI. Refine the existing product; preserve charcoal, warm paper, Volt, Archivo and JetBrains Mono. Home is a training command centre, Routes a map workspace, Analyze a performance instrument.

- Inspect rendered screens before deciding what to change. Record prioritized evidence in `docs/release/UI_REFINEMENT_AUDIT.md`; compare actual before/after screenshots in both themes.
- Use the installed `web-design-guidelines`, `ui-ux-pro-max`, `frontend-design`, `vercel-react-best-practices` and `playwright` skills when relevant. Fetch current [Vercel guidelines](https://vercel.com/design/guidelines). Recommendations supplement the product's documented tokens; they do not authorize a new visual identity or dependencies.
- Give each page one clear primary action. Use Volt for that action, selection or meaningful progress. Keep routine statuses neutral and destructive actions contextual, with confirmation.
- Use typography and spacing to group content. Avoid nested cards, repeated metrics, decorative eyebrows and always-visible editing controls. Use native disclosures for secondary information, without losing user input or hiding errors.
- Keep measured, estimated and inferred values distinguishable. Group provenance where accurate; never present a model estimate as a measurement. Missing data is not zero.
- Build for 320px first, with 44px minimum controls, safe areas, usable landscape layouts and visible keyboard focus. Keep the existing sheet gestures, Back behavior, chart alternatives and reduced-motion support.
- Preserve Zustand, TanStack Query, React Hook Form, Zod, URL state, offline drafts, authentication, APIs and user-scoped caches. Keep maps/charts dynamically loaded and secondary visualizations deferred. No infrastructure, schema or live-data changes for UI work.
- Reuse `@km/ui` and existing CSS tokens. Fix shared rules at their source instead of appending conflicting overrides or introducing new wrappers and variants.
- Run `npm run check`, existing E2E tests and `npm run test:ui`. Use `KM_UI_MATRIX=1` for all 14 viewports. Synthetic tests use a loopback read-only upstream; they do not prove hosted authentication, map accuracy, COROS integration or physical-device acceptance.

See `apps/web/AGENTS.md` for installed Next.js documentation requirements.

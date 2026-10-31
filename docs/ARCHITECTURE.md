# Architecture

## Layout

```
apps/web/src/app       Next.js pages, layouts and route handlers
apps/web/src/components Product UI and domain forms
apps/web/src/lib       Auth, queries, interaction stores, metrics, ingestion
packages/ui           shadcn-style owned primitives built on Radix/CVA
packages/types        Zod input schemas, domain interfaces, future service contracts
packages/config       Shared strict TypeScript configuration
services/analytics    Reserved, no fake Python service
supabase/migrations   Ordered SQL source of truth
supabase/tests        Ownership and relational integration assertions
docs                  Engineering decisions and handoff
```

npm workspaces provide local package linking and one lockfile without a task-runner dependency. The web application is the only runtime. Shared packages export TypeScript source; Next transpiles them. Keep domain UI in the app until a second consumer justifies moving it.

## Request path

A protected server layout verifies the Supabase user and checks for a profile. Each route handler separately verifies the current user; authorization never depends on a layout. The request-scoped Supabase client uses the caller's cookies and publishable key. PostgreSQL RLS is the final ownership boundary, including requests made directly to the Data API.

React Query owns remote data; mutation success invalidates related user queries. Zustand owns transient interaction state only. React Hook Form and Zod own editable form values. Search/status/week filters live in the URL.

## Rendering and delivery

Marketing is prerendered. Application shells are server rendered and personalized records load through Query. Maps and charts are dynamic imports; MapLibre is absent from the marketing and dashboard execution paths. Route maps do not invent geometry for manual route metadata. No external image dependency or tracking script is installed; route illustrations and brand assets are original SVG. UI uses system sans-serif plus a serif accent, avoiding font downloads.

## Design system

Warm off-white/deep forest surfaces, citron accent, compact uppercase instrument labels, generous headline scale, quiet cards. `globals.css` contains tokens for both themes and responsive layouts. Radix supplies dialog focus management, drawers use the same behavior, and reduced-motion disables transitions. Reusable buttons, inputs, cards, tables, dialogs/drawers, tabs, metrics, skeletons, empty/error states, chart/map wrappers and domain cards live in `@km/ui`. Sonner supplies notifications. The SVG KM monogram also supplies favicon/app imagery.

## Deliberate limits

Resource lists show at most 500 records; this is disclosed when reached. Database summary totals include all activities. Detail endpoints retrieve any owned ID regardless of the list limit. Add cursor pagination before high-volume ingestion. Shoe history is a list of currently assigned runs, not an immutable assignment audit log. No dependency injection framework, queue, workers or placeholder AI service is introduced.

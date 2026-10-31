# Contributing

Use Node 22+, `npm ci`, and a feature branch. Keep PRs bounded, use Conventional Commits, and run `npm run check` plus relevant browser/database tests before merging. Never force-push shared branches or commit `.env` credentials. One workspace lockfile belongs at the root.

Changes to a schema must include a new ordered Supabase migration, input/interface updates in `packages/types`, ownership tests, and affected UI/query invalidation. Test with two identities. Keep owner IDs server-derived. Changes to server state belong in Query, not Zustand; new UI state uses a domain store and selective subscriptions. Preserve metres/seconds at storage boundaries.

Use owned primitives in `@km/ui`. Preserve keyboard navigation, accessible labels, dark theme and reduced-motion behavior. Prefer platform functionality and installed dependencies before new packages. Keep maps/charts lazy and planned features visibly unavailable.

External-service tests must say exactly what was verified and which credentials were missing. Never call mock-backed UI tests a live integration test. Do not alter another project's database to validate this one.

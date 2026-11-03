# State management

| State                                                                                                                  | Owner                                    |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Activities, routes, shoes, workouts, profiles, summaries, saved routes                                                 | TanStack Query                           |
| Submitted forms, validation and dirty tracking                                                                         | React Hook Form + Zod                    |
| Search, status, calendar week                                                                                          | URL search parameters                    |
| Theme                                                                                                                  | next-themes, local device persistence    |
| Compact lists                                                                                                          | Zustand persist, local device preference |
| Dashboard visibility, map viewport/selection, route dirty UI, workout draft title, comparison IDs, dialog/announcement | Domain Zustand stores                    |

`queries.ts` exposes typed query factories and the shared mutation hook. Keys start with `['user', userId]`. Never key private data only by resource name. A QueryClient is instantiated per mounted provider using lazy state, never as a shared server singleton. No API response is copied to Zustand.

A confirmed CRUD mutation invalidates the user's query prefix, including summaries and gear totals. Failures preserve inputs and display errors. Phase 1 uses confirmed mutations instead of optimistic changes because creation IDs, assignment constraints and cascades require database acceptance. Future optimistic interactions must cancel queries, snapshot caches, roll back errors and invalidate on settlement; never display an unconfirmed successful import.

Zustand selectors subscribe to individual fields/actions. Persistent state uses skipHydration and rehydrates after mounting. Only the non-sensitive compact preference persists; comparison IDs, drafts and maps reset on identity changes. Logout clears Query and transient stores, then performs document navigation to discard the personalized component tree. Device theme/compact preferences survive logout by design. Stores are never mutated during server rendering; new server-side consumers must use scoped factories if they need request-specific interaction initialization.

`useUnsaved` guards browser unload and in-app anchor navigation. Dialog closure warns before discarding an editor. This is protection against ordinary navigation, not crash-proof draft persistence. Route-editor and workout-builder stores are reserved minimal interaction slices; current text forms use React Hook Form as their sole source of editable values.

## Phase 2

| State                                                                       | Owner                                                    |
| --------------------------------------------------------------------------- | -------------------------------------------------------- |
| Jobs, analytics, routes, conditions, training, gear analytics, form results | TanStack Query, keys `['user', id, <module>, …]`         |
| Route-editor waypoints, ghost playback, map viewport                        | Zustand (`useRouteEditor`, `useGhostPlayback`, `useMap`) |
| Planner start point and parameters, compare/ghost run IDs, calendar week    | URL search params                                        |
| Outbox (pending condition reports), editor drafts, saved-route snapshots    | IndexedDB `kindamoving` v1, user-scoped                  |
| Connectivity and outbox counts                                              | Zustand `useOffline`                                     |

**Explicit state machines**

1. _Server job_: `queued → running → succeeded | failed | retry_wait | cancelled`, `retry_wait → running`, `failed → queued` (manual retry), and `running → queued` on lease expiry. A trigger enforces it for every role.
2. _Client job sync_ (`lib/sync.ts`, `JobSync`): diffs snapshots by `updated_at` (stale responses ignored) and acts once per transition. `succeeded` invalidates `jobEffects[kind]`; `failed` shows a toast. It polls every 2 s only while a job is active.
3. _Connectivity_ (`OfflineSync`): `online ⇄ offline`. Entering `online` (and app start) flushes the outbox, single-flight and in order. Network errors keep items queued; server rejections become visible `rejected` items, never silent drops.
4. _Drafts_ (`useDraft`): `none | restorable | conflict` by comparing the draft's base `updated_at` with the server's. A conflict is shown before restoring.

**Optimism**: writes stay confirmed rather than optimistic where IDs, constraints or external effects matter (imports, plans, COROS pushes). Link-only training reconciliation is applied automatically because it is non-destructive and idempotent.

**Account switching**: identity change or logout clears Query and Zustand, purges every IndexedDB store and tells the service worker to drop its caches. On mount, records belonging to another user are purged as well.

## Phase 6 identity transitions

Outbox replay is single-flight per user and carries an abort signal. Logout, account transition and component cleanup cancel previous work; late results cannot update the next account’s banner or send a second old report. Cancelled reports are not marked rejected. IndexedDB purge remains the existing identity boundary, and server records stay in Query. No new state library was added.

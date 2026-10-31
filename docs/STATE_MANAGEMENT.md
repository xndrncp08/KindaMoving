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

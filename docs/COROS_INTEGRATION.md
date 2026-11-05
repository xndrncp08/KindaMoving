# COROS integration

KindaMoving connects to COROS through **COROS's official MCP service** (<https://github.com/coroslab/COROS-MCP>, `https://mcp.coros.com/mcp`). No undocumented endpoints, webhooks, scraping, live GPS streaming or watch control are used.

## Verification status (be precise)

| Item                                                                                                   | Status                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Discovery documents, OAuth endpoints, PKCE S256, DCR support, unauthenticated 401 + `WWW-Authenticate` | **Verified live** against `mcp.coros.com` on 2026-10-31 (fixtures in `apps/web/tests/coros.test.ts`)                                        |
| Dynamic client registration with an `https://<site>/api/coros/callback` redirect URI                   | Implemented; **not yet exercised live** (needs a deployed origin)                                                                           |
| Token exchange, refresh, revocation, `tools/list`, `tools/call`                                        | Implemented against the documented protocol and the official helper's behaviour; **not verified with a real COROS account** in this session |
| Machine format of `querySportRecords` / `queryActivityFitFileDownloadUrls` results                     | The guide documents parameters and _example_ text only. Parsing is defensive (see below) and **must be confirmed on first live sync**       |

The UI shows "Connected (verified)" only after a real token exchange **and** a successful `tools/list` against COROS. Nothing in the codebase simulates a COROS success.

## Flow

```
Settings ─POST /api/coros/connect {region}──▶ discover(region base)
   RFC 9728 /.well-known/oauth-protected-resource/mcp → authorization server (e.g. mcpus.coros.com)
   RFC 8414 /.well-known/oauth-authorization-server    → endpoints (all must be https://*.coros.com)
   vault_client(issuer, redirect) or RFC 7591 registration (public client, auth method none)
   PKCE verifier + state sealed (AES-256-GCM) in httpOnly cookie km_coros_oauth (10 min, path /api/coros)
◀── {url} → browser → COROS sign-in & consent
GET /api/coros/callback?code&state
   cookie state == param state, cookie user == signed-in user, single use
   token exchange (code_verifier, resource=mcp_url) → vault_put (sealed tokens)
   tools/list → capabilities → status 'connected' → initial 30-day sync job
```

**Regions:** "Automatic" uses the `mcp.coros.com` gateway. Its discovery currently resolves to a regional issuer (US from our test location). Users whose COROS account lives in Europe or Mainland China should choose that region explicitly, as COROS's own FAQ advises for clients that can't follow redirects.

## Credentials

- Tokens are sealed with AES-256-GCM (`TOKEN_ENCRYPTION_KEY`, 32 bytes base64) with additional authenticated data `coros:<account>:<kind>`, so a ciphertext only decrypts for its own account.
- Ciphertext lives in `private.provider_tokens`. The `private` schema is not exposed through the Data API, and `vault_*` RPCs are executable by `service_role` only (tested in `supabase/tests/phase2_coros.sql`).
- Access tokens last 30 days and refresh tokens 180 days, rotating on use (COROS FAQ). Refresh happens proactively 5 minutes before expiry and reactively once on HTTP 401.
- **Rotation race:** if two workers refresh at once, the loser's refresh token is already revoked. After a failed refresh the vault is re-read, and a newer token is used if one exists. `reauth_required` is set only when the stored token is unchanged and COROS returns `invalid_grant`.
- **Disconnect** revokes the refresh token at COROS's revocation endpoint (best effort, with the result reported to the user), deletes the vault row, cancels pending COROS jobs, and keeps imported activities.

## Activity synchronization (`coros_sync` job)

1. **Window:** first sync covers 30 days. Later syncs run from `sync_cursor − 2 days` (late watch uploads). "Import last 90 days" sets an explicit backfill (max 365).
2. **Listing:** `querySportRecords(startDate, endDate, limit 50)` in 7-day windows. A window returning ≥ 50 records is halved recursively. A full single day fails with `coros_truncated` and does not advance the cursor, because the documented API provides no pagination guarantee for that case.
3. **Records:** each `labelId` is stored once in `provider_records` (unique per account). Non-running sport codes (anything outside 100–103) are recorded as `skipped` with a reason.
4. **Import:** `queryActivityFitFileDownloadUrls(labelId, sportType, limit 1)` → HTTPS download (≤ 25 MB, 30 s) → the same analytics parser as uploads → `import_activity(user, 'coros', labelId)`. Deduplication against files and manual entries is the same as for uploads (see [ACTIVITY_PROCESSING.md](ACTIVITY_PROCESSING.md)).
5. **Quota:** COROS allows 50 FIT files (downloads and links) per platform user per fixed 24 h window. KindaMoving reserves a slot in `fit_quota` **before** requesting a link, stops at 48, marks the rest `deferred_quota`, and schedules a continuation job at the window reset. The reservation compares the previous JSONB value and connected status atomically; a stale/disconnected worker retries without requesting a link. An interrupted call retains its reservation because COROS may have spent it. This can conservatively defer imports early; it cannot establish usage by other clients. A quota error reported by COROS triggers the same deferral.
6. **Failures:** permanent per-record errors mark only that record `failed`. Transient errors (network, 5xx, 429 with `Retry-After`) retry the job with backoff. Failed persistence of listing, quota, record status, continuation or completion also retries with redacted errors. Completion advances the cursor last. A retried continuation insert accepts a uniqueness conflict only after finding the same owner's matching continuation. The time budget (40 s) hands remaining work to that job.

OAuth registration/exchange/revocation and MCP POSTs reject redirects; discovery resolves the regional endpoint before credentials are sent. FIT downloads also reject redirects, enforce the 25 MiB cap while streaming (including missing/false Content-Length), cancel oversized bodies and retry interrupted bodies. A future provider redirect/CDN change needs reviewed endpoint handling and live acceptance; do not re-enable unrestricted redirects to make it pass. These controls are covered by synthetic PostgREST/stream tests, real loopback HTTP 307 tests and the disposable PostgreSQL quota contract. No authorized COROS account or PACE 4 acceptance is implied.

### Defensive result parsing

The parser reads `structuredContent` first, then JSON in text content, then the documented text layout. A record is imported only when a numeric `labelId` and `sportType` are both present. The official example text (`1. Sport(9807) — …`) has no `labelId`, so such records are counted as `unparsed_records` in the job result and imported as nothing. If the first live sync reports `unparsed_records > 0`, adapt `lib/coros/parse.ts` to the observed format.

## Writes to COROS

Writing uses the documented `uploadRouteFile` (GPX) and workout tools, and always requires an explicit per-item confirmation in the UI (see [ROUTING.md](ROUTING.md) and [TRAINING.md](TRAINING.md)). Following COROS's own guidance, a write whose outcome is uncertain (timeout or interrupted response) is **not** retried automatically. The user is asked to check the COROS app first.

## Developer access fallback

Everything above needs only the public MCP service and a user's COROS account. No partner credentials are needed. Without a COROS account, users import via GPX/FIT upload, and routes export as GPX with COROS app import instructions.

## Phase 6 acceptance

Current official tools/FAQ still document the fixed 50-file/24-hour FIT budget and 30/180-day access/rotating-refresh lifecycle. PACE 4 uses the supported watch→COROS app→MCP FIT flow; no direct watch communication is claimed. The [Phase 6 checklist](release/PHASE6_BETA_READINESS.md#coros-pace-4-acceptance) requires an expressly authorized account and per-item confirmation for external writes. No live account acceptance has occurred.

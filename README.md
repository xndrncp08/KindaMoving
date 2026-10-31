# KindaMoving ↗

**Run smarter. Suffer better.**

A running log with a considered interface and a deliberately modest Phase 1 scope. Next.js App Router, Supabase Auth/Postgres, private records, manual workouts, route metadata, and shoe mileage. No wearable connection or analytics engine is simulated.

## Start

```sh
npm ci
cp apps/web/.env.example apps/web/.env.local
# Set Supabase URL and publishable key; apply migrations first.
npm run dev
```

Marketing pages work without credentials. Accounts and application data require Supabase. Use Node 22+.

## Verify

```sh
npm run check
npx playwright install chromium
npm run test:e2e
python3 scripts/test-database.py # needs PostgreSQL binaries and PostGIS
# Explicit relational-only alternative when PostGIS isn't installed:
python3 scripts/test-database.py --without-postgis
```

## What works

- Responsive marketing, legal drafts, light/dark/system themes and original KM identity.
- Email/password, optional configured Google OAuth, PKCE callback, recovery, logout and onboarding.
- Private manual activity CRUD, pace/distance calculations, basic comparison, search and shoe assignment.
- Route metadata CRUD, saved routes, lazy MapLibre infrastructure for existing GeoJSON geometry.
- Workout CRUD, weekly calendar and manual completion; profile training goals.
- Shoe CRUD/retirement, baseline mileage and activity history; database-wide totals.
- Bounded private GPX/FIT storage with admission checks. **No activity extraction.**

## Engineering guides

- [Local setup](docs/LOCAL_SETUP.md) and [environment variables](docs/ENVIRONMENT.md)
- [Architecture](docs/ARCHITECTURE.md), [database](docs/DATABASE.md), [authentication](docs/AUTHENTICATION.md)
- [State conventions](docs/STATE_MANAGEMENT.md), [API contracts](docs/API_CONTRACTS.md)
- [Testing and verification limits](docs/TESTING.md), [contribution guide](CONTRIBUTING.md)
- **[Claude Phase 2 handoff](docs/CLAUDE_HANDOFF.md)**

This is a verified foundation, not a deployed public service. Live Supabase configuration, SMTP, operational policies and integration acceptance remain launch requirements.

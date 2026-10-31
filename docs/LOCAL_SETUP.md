# Local setup

1. Install Node 22+, npm, Docker Desktop (for local Supabase), and Python 3 for the standalone database contract test.
2. `npm ci` at the repository root.
3. `npx supabase start` starts the isolated local Supabase stack. `npx supabase db reset` applies migrations and the intentionally empty automatic seed. **Reset destroys this local project's database. Do not target a hosted database.**
4. Copy `apps/web/.env.example` to `apps/web/.env.local`. Use the URL and publishable key printed by the local stack. A legacy local anon key is compatible; never use the service-role key.
5. `npm run dev` starts http://127.0.0.1:3000. Use one hostname consistently for redirects and cookie sessions.
6. Sign up, confirm email with local Inbucket, and complete onboarding. Add a shoe before assigning it to a manual activity.

For a hosted project, create a dedicated development Supabase project, link the CLI after verifying its project ID, and apply migrations through the normal Supabase migration workflow. No hosted project has been provisioned or altered by this repository initialization. Configure allowed redirect URLs before authentication testing.

To stop: terminate Next and run `npx supabase stop`. Production build: `npm run build`; serve with `npm run start -w @km/web`. A deployment must provide the same public environment variables at build time and runtime.

## Optional realistic development data

After signup, run `psql <LOCAL_DATABASE_URL> -v user_id='<local-user-uuid>' -f scripts/seed-development.sql`. It inserts explicitly labelled shoes, runs, routes and workouts for that existing user. Run once in a disposable development database; this script does not modify auth users or run automatically. You may also enter the same records through the UI.

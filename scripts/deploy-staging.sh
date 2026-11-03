#!/usr/bin/env bash
# Protected staging preview on Vercel Hobby: export HEAD, swap in the staging
# config (Hobby rejects sub-daily crons), deploy as a *preview* (never --prod).
set -euo pipefail
# Extra CLI arguments could override the preview target or its environment.
if (( $# )); then echo 'This helper accepts no CLI overrides.' >&2; exit 1; fi
: "${KM_STAGING_SUPABASE_REF:?Set the approved isolated Supabase project ref first}"
if [[ ! "$KM_STAGING_SUPABASE_REF" =~ ^[a-z0-9]{20}$ || "$KM_STAGING_SUPABASE_REF" == yqzbsuandpdlvgtgnwln ]]; then
  echo 'Refusing a missing, invalid or shared staging project.' >&2; exit 1
fi
root=$(git rev-parse --show-toplevel)
out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
git -C "$root" archive HEAD | tar -x -C "$out"
cp -R "$root/.vercel" "$out/.vercel"
cp "$out/apps/web/vercel.staging.json" "$out/apps/web/vercel.json"
cd "$out"
vercel deploy --yes --meta "kmGitSha=$(git -C "$root" rev-parse HEAD)" \
  --build-env KM_DEPLOYMENT=staging --env KM_DEPLOYMENT=staging \
  --build-env "KM_STAGING_SUPABASE_REF=$KM_STAGING_SUPABASE_REF" \
  --env "KM_STAGING_SUPABASE_REF=$KM_STAGING_SUPABASE_REF"

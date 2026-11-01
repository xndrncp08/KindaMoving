#!/usr/bin/env bash
# Protected staging preview on Vercel Hobby: export HEAD, swap in the staging
# config (Hobby rejects sub-daily crons), deploy as a *preview* (never --prod).
set -euo pipefail
root=$(git rev-parse --show-toplevel)
out=$(mktemp -d)
git -C "$root" archive HEAD | tar -x -C "$out"
cp -R "$root/.vercel" "$out/.vercel"
cp "$out/apps/web/vercel.staging.json" "$out/apps/web/vercel.json"
cd "$out"
vercel deploy --yes "$@"

#!/usr/bin/env bash
# Switch every app's ACTIVE local env between DEV and PROD.
#
#   ./use-env.sh dev    → local apps talk to easyclz-dev (safe testing)
#   ./use-env.sh prod   → local apps talk to the live ClassPay project
#
# For the Next.js apps it copies .env.<target> over the gitignored .env.local
# (Next reads .env.local first). For the Expo app it writes .env.local, which
# Expo loads with higher priority than the committed .env — so switching to
# prod just removes that override and the committed .env (= prod) takes over.
#
#   super-admin/.env.local   ← .env.<target>
#   student-app/.env.local   ← .env.<target>
#   teacher-app/.env.local   ← .env.dev  (dev only; removed for prod)
#
# The live web apps on Vercel are NOT affected — they use Vercel's own
# environment variables. This only changes what YOUR machine points at.
set -euo pipefail

TARGET="${1:-}"
if [[ "$TARGET" != "dev" && "$TARGET" != "prod" ]]; then
  echo "Usage: ./use-env.sh [dev|prod]"
  exit 1
fi

root="$(cd "$(dirname "$0")" && pwd)"

copy() { # src -> dest
  if [[ -f "$1" ]]; then cp "$1" "$2"; echo "  $2  ←  $(basename "$1")"; else
    echo "  ! missing $1 — skipped"; fi
}

echo "Switching local environment to: $TARGET"
copy "$root/super-admin/.env.$TARGET" "$root/super-admin/.env.local"
copy "$root/student-app/.env.$TARGET" "$root/student-app/.env.local"

# Expo: committed .env is always PROD. Dev uses a .env.local override.
if [[ "$TARGET" == "dev" ]]; then
  copy "$root/teacher-app/.env.dev" "$root/teacher-app/.env.local"
else
  rm -f "$root/teacher-app/.env.local"
  echo "  teacher-app/.env.local removed (committed .env = prod)"
fi
echo "Done. Restart dev servers / Expo (clear cache: expo start -c) for the change to take effect."

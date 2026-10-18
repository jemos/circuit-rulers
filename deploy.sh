#!/usr/bin/env bash
# Manual, on-demand deploy to Cloudflare Workers static assets
# (https://circuits.jemos.net). Settings live in wrangler.jsonc.
#
# First time only: npx wrangler@4.146.0 login
#
# Usage: ./deploy.sh [--skip-checks]
set -euo pipefail

WRANGLER=(npx --yes wrangler@4.146.0)

cd "$(dirname "$0")"

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "Working tree has uncommitted changes:" >&2
  git status --short >&2
  read -r -p "Deploy anyway? [y/N] " ok
  [[ "$ok" == [yY] ]] || exit 1
fi

npm ci
if [[ "${1:-}" != "--skip-checks" ]]; then
  npm run typecheck
  npm test
fi
npm run build

"${WRANGLER[@]}" deploy --message "$(git rev-parse --short HEAD) $(git log -1 --pretty=%s)"

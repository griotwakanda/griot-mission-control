#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/griotbot/.openclaw/workspace/mission-control"
cd "$ROOT"

npm run refresh:data
npm run build
npx vercel deploy --prod --yes

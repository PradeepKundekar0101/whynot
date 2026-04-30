#!/usr/bin/env bash
# Re-deploy the API on the droplet after pulling new code.
# Run from the repo root on the droplet:  bash deploy/redeploy.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> git pull"
git pull --ff-only

echo "==> docker compose up -d (postgres + redis)"
docker compose up -d

echo "==> install + build server"
cd server
npm ci
npm run build

echo "==> prisma migrate deploy"
npx prisma migrate deploy

echo "==> reload PM2"
pm2 reload ecosystem.config.js --update-env || pm2 start ecosystem.config.js
pm2 save

echo "==> done. tail logs with:  pm2 logs whatnot-server"

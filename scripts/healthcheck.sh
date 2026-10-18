#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
test -s "$ROOT/src/server.js"
test -s "$ROOT/src/app.js"
test -s "$ROOT/package.json"
test -s "$ROOT/database/schema.sql"
test -s "$ROOT/api/openapi.yaml"
grep -q '"fastify"' "$ROOT/package.json"
grep -q 'AUTH0_ISSUER' "$ROOT/src/config.js"
grep -q 'enabled: false' "$ROOT/config/chain.config.js"
printf 'xCLOUD OS source health: OK\n'

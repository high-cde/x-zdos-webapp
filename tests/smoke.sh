#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
bash "$ROOT/scripts/healthcheck.sh"
node --test "$ROOT/tests/unit.test.js" "$ROOT/tests/static-status.test.js"
node --check "$ROOT/src/app.js"
node --check "$ROOT/database/migrations/001_initial.js"
printf 'Smoke tests: OK\n'

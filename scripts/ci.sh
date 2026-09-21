#!/bin/sh
# Local CI for this template: Day-0 tests only. No extra deps.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"
sh tests/test_day0.sh

# Spoken-card grounding EVAL wire. Day-0 stays POSIX; run the Node eval when dist exists.
EVAL="$ROOT/mcp/test/spoken-card-eval.test.mjs"
test -s "$EVAL"
grep -q 'spoken-card-eval.test.mjs' "$ROOT/mcp/package.json"
if command -v node >/dev/null 2>&1 && test -f "$ROOT/mcp/dist/initiative-card.js"; then
  (cd "$ROOT/mcp" && node --test test/spoken-card-eval.test.mjs)
fi

echo "CI OK"

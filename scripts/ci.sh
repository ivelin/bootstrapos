#!/bin/sh
# Local + GitHub CI for this template.
# Day-0 stays POSIX. Spoken-card eval is required, not optional.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"
sh tests/test_day0.sh

# Spoken-card grounding EVAL wire (format A + grounding B + snapshot C).
# Alpha / bravo fixtures only. No mentee PII. No live put_journey.
EVAL="$ROOT/mcp/test/spoken-card-eval.test.mjs"
test -s "$EVAL"
grep -q 'spoken-card-eval.test.mjs' "$ROOT/mcp/package.json"
grep -q 'spoken-card-eval.test.mjs' "$ROOT/mcp/package.json" >/dev/null

if ! command -v node >/dev/null 2>&1; then
  echo "node is required for spoken-card-eval" >&2
  exit 1
fi

if ! test -f "$ROOT/mcp/dist/initiative-card.js"; then
  if ! test -f "$ROOT/mcp/package-lock.json"; then
    echo "mcp/package-lock.json missing; cannot build spoken-card-eval" >&2
    exit 1
  fi
  (cd "$ROOT/mcp" && npm ci && npm run build)
fi

test -f "$ROOT/mcp/dist/initiative-card.js"
(cd "$ROOT/mcp" && node --test test/spoken-card-eval.test.mjs)

echo "CI OK"

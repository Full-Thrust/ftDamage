#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

normalize_vitest_output() {
  perl -pe 's/\e\[[0-9;]*[A-Za-z]//g' | \
    sed -E 's/[0-9]+ms/<ms>/g' | \
    sed -E '/Start at/d;/Duration/d;/RUN[[:space:]]+v/d'
}

echo "[1/4] Running unit tests (pass 1)..."
npm run --silent test:unit 2>&1 | normalize_vitest_output > "$TMP_DIR/unit-pass-1.txt"

echo "[2/4] Running unit tests (pass 2)..."
npm run --silent test:unit 2>&1 | normalize_vitest_output > "$TMP_DIR/unit-pass-2.txt"

if ! diff -u "$TMP_DIR/unit-pass-1.txt" "$TMP_DIR/unit-pass-2.txt" > "$TMP_DIR/unit-diff.txt"; then
  echo "Unit test output is not reproducible after normalization."
  cat "$TMP_DIR/unit-diff.txt"
  exit 1
fi

echo "[3/4] Running simulation test (pass 1)..."
npm run --silent test:ship-sim > "$TMP_DIR/sim-pass-1.log"
find test-output/ship-damage-sim -type f -print0 | sort -z | xargs -0 shasum > "$TMP_DIR/sim-hash-1.txt"

echo "[4/4] Running simulation test (pass 2)..."
npm run --silent test:ship-sim > "$TMP_DIR/sim-pass-2.log"
find test-output/ship-damage-sim -type f -print0 | sort -z | xargs -0 shasum > "$TMP_DIR/sim-hash-2.txt"

if ! diff -u "$TMP_DIR/sim-hash-1.txt" "$TMP_DIR/sim-hash-2.txt" > "$TMP_DIR/sim-diff.txt"; then
  echo "Simulation output files are not reproducible."
  cat "$TMP_DIR/sim-diff.txt"
  exit 1
fi

echo "Reproducibility check passed: unit tests and simulation outputs are stable."

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${REPO_ROOT}"

echo "[bootstrap] Installing dependencies..."
npm install

echo "[bootstrap] Generating fresh fleets..."
npm run generate:fleets

echo "[bootstrap] Done."
echo "Open tests/damage.html and tests/fleet.html in Chrome/Edge."

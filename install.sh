#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "============================================="
echo "  pi-review-agent installer"
echo "============================================="
echo

echo "[1/5] Checking Node.js..."
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js was not found."
  echo "Install Node.js 22 or newer from https://nodejs.org/"
  exit 1
fi

NODE_VERSION="$(node -v)"
NODE_MAJOR="$(node -e "console.log(process.versions.node.split('.')[0])")"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "ERROR: Node.js $NODE_VERSION is too old. Node.js 22 or newer is required."
  exit 1
fi
echo "OK: Node.js $NODE_VERSION"
echo

echo "[2/5] Checking pi-agent..."
if ! command -v pi >/dev/null 2>&1; then
  echo "pi-agent was not found. Installing @earendil-works/pi-coding-agent..."
  npm install -g @earendil-works/pi-coding-agent
fi

if ! command -v pi >/dev/null 2>&1; then
  echo "ERROR: pi command is still unavailable. Restart this terminal and try again."
  exit 1
fi
echo "OK: pi-agent $(pi --version 2>/dev/null || echo installed)"
echo

echo "[3/5] Installing package dependencies..."
cd "$ROOT"
npm install
if [ -f "$ROOT/workspace/package.json" ]; then
  npm --prefix "$ROOT/workspace" install
fi
echo "OK: dependencies installed"
echo

echo "[4/5] Registering this package with pi..."
pi install "$ROOT"
echo "OK: package registered"
echo

echo "[5/5] Verifying project..."
npm run check-package
npm run check

echo
echo "============================================="
echo "  Install complete"
echo "============================================="
echo
echo "Next steps:"
echo "  1. Run: pi"
echo "  2. Inside pi, type: /review"
echo
echo "If you installed an older git copy before, run:"
echo "  pi update git:git@github.com:0liveiraaa/pi-review-agent"
echo "or remove and reinstall it."

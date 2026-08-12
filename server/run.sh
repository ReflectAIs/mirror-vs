#!/usr/bin/env bash
#
# Mirror XR Backend — run script for macOS.
#
# Creates an isolated virtualenv (if missing), installs dependencies, and
# starts the FastAPI server with uvicorn on 0.0.0.0:8000 so the Meta Quest
# can reach it over the local network (use your Mac's LAN IP in Unity).
#
# Usage:
#   ./run.sh          # start server (foreground)
#   ./run.sh --setup  # only create venv + install deps, then exit
#
set -euo pipefail

cd "$(dirname "$0")"

PYTHON="${PYTHON:-python3}"
VENV_DIR=".venv"

if [ ! -d "$VENV_DIR" ]; then
  echo "==> Creating virtualenv at $VENV_DIR"
  "$PYTHON" -m venv "$VENV_DIR"
fi

# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

if [ "${1:-}" = "--setup" ]; then
  echo "==> Installing dependencies"
  pip install --quiet --upgrade pip
  pip install --quiet -r requirements.txt
  echo "==> Setup complete. Run ./run.sh to start the server."
  exit 0
fi

echo "==> Installing dependencies (if needed)"
pip install --quiet -r requirements.txt

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8000}"

echo "==> Starting Mirror XR backend on ws://$HOST:$PORT/ws/chat"
exec uvicorn app.main:app --host "$HOST" --port "$PORT" --reload

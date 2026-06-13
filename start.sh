#!/bin/bash
# LayCode — 一键启动
# Usage:
#   ./start.sh --token <token>              同时启动 bridge + app（默认）
#   ./start.sh bridge --token <token>       只启动 bridge（电脑端）
#   ./start.sh app                          只启动 APP（手机端）

set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

start_bridge() {
  if ! command -v opencode &> /dev/null; then
    echo "Error: opencode not found in PATH"
    exit 1
  fi
  echo "╔══════════════════════════════════╗"
  echo "║    LayCode Bridge — 电脑端      ║"
  echo "╚══════════════════════════════════╝"
  cd "$ROOT_DIR/bridge"
  exec npx tsx watch src/index.ts "$@"
}

start_app() {
  echo "╔══════════════════════════════════╗"
  echo "║   LayCode App — 手机端          ║"
  echo "╚══════════════════════════════════╝"
  cd "$ROOT_DIR/app"
  npx expo start
}

mode="${1:-}"
case "$mode" in
  bridge)
    shift
    start_bridge "$@"
    ;;
  app)
    start_app
    ;;
  *)
    # 默认：同时启动 bridge（后台）+ app
    echo "╔══════════════════════════════════╗"
    echo "║          LayCode                 ║"
    echo "║    躺着码，一样 Vibe            ║"
    echo "╚══════════════════════════════════╝"
    echo ""
    echo "  Starting bridge in background..."
    start_bridge "$@" &
    BRIDGE_PID=$!
    cleanup() { kill $BRIDGE_PID 2>/dev/null || true; }
    trap cleanup EXIT
    sleep 2
    echo ""
    echo "  Starting Expo app..."
    echo ""
    start_app
    ;;
esac

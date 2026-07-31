#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
PORT="${1:-8080}"
echo "PIDM UI 原型已启动"
echo "请在浏览器打开: http://127.0.0.1:${PORT}/"
echo "按 Ctrl+C 停止"
python3 -m http.server "$PORT"

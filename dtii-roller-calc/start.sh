#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
PORT="${1:-8081}"
echo "DTII(A) 托辊选型计算页已启动"
echo "请在浏览器打开: http://127.0.0.1:${PORT}/"
echo "也可直接双击打开 index.html"
echo "按 Ctrl+C 停止"
python3 -m http.server "$PORT"

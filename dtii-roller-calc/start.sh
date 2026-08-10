#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
PORT="${1:-8081}"
echo "DTII(A) 托辊选型工具已启动"
echo "请在浏览器打开: http://127.0.0.1:${PORT}/"
echo "手机同网访问本机 IP 后可「添加到主屏幕」以便离线使用"
echo "按 Ctrl+C 停止"
python3 -m http.server "$PORT"

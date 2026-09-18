#!/usr/bin/env bash
cd "$(dirname "$0")"
echo ""
echo "  正在启动【螺纹几何工具】..."
echo "  请确认浏览器标题是：螺纹尺寸推导"
echo "  打开地址：http://127.0.0.1:8080/"
echo ""
(command -v xdg-open >/dev/null && xdg-open "http://127.0.0.1:8080/" >/dev/null 2>&1) || \
(command -v open >/dev/null && open "http://127.0.0.1:8080/" >/dev/null 2>&1) || true
python3 -m http.server 8080

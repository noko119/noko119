# DTII(A) 托辊与轴承计算选型 · 手机离线动态页

纯前端选型工具：带宽 / 带速 / 输送能力 → 托辊受力、轴承反算、L10h 寿命与 DTII(A) 图号。

## 本地打开

直接双击打开（无需网络，计算全在浏览器内）：

```bash
dtii-roller-calc/index.html
```

或启动本地服务（便于 PWA 安装与 Service Worker 缓存）：

```bash
cd dtii-roller-calc
chmod +x start.sh
./start.sh          # 默认端口 8081
# 或: ./start.sh 8090
```

浏览器访问：`http://127.0.0.1:8081/`

## 手机离线使用

1. **局域网一次打开**：电脑 `./start.sh` 后，手机浏览器访问 `http://<电脑局域网IP>:8081/`
2. **添加到主屏幕**（Safari / Chrome 菜单）→ 以独立应用方式打开
3. 首次加载后 Service Worker 会缓存页面；断网后仍可打开并完成选型计算
4. **备选**：把 `index.html` 拷到手机本地用浏览器打开（`file://` 下无 SW，但计算仍可离线）

## 功能

- GB/T 10595、DTII(A)、ISO/CEMA 带速系列 + 自定义带速
- 手册推荐轴承自动反算 / 手动指定
- 静载、动载、C_req、L10h、转速与轴挠度校核
- DTII(A) 标注图号、部件号与采购编码
- **复制报告**（Clipboard + 回退）
- **保存报告**（下载 `.txt` + `localStorage` 本地缓存）

## 说明

- 不连接后端，不上传数据
- 公式与轴承库为工程选型辅助，最终以手册与项目规范为准

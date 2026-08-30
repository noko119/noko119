---
tags:
  - 计算机
---

# Git 约定

- 提交内容：Markdown 卡片、模板、`.obsidian` 配置、小体积 PDF
- 不要提交：`*.sldprt` `*.sldasm` `*.slddrw` `*.dwg` `*.dxf` `*.step` `*.stp` 以及对应大写后缀
- **工程图源文件 `.slddrw` / `.SLDDRW` 一律不进 Git**，只把路径写入卡片 `cad路径`
- 忽略文件见仓库根目录 `.gitignore`（已含 `*.slddrw` `*.SLDDRW`）
- 一人一图号一提交，提交说明写图号和状态变化，例如：`图纸: 入库 100C414M 现行`
- 提交前自检：`git status` 不得出现 `.slddrw`

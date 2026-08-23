# 本机部署 · 第 1 步（运量–带宽–带速）

目录可以放在任何位置，不必使用 `C:\Users\HP\noko119`。

你现在这种也可以直接用：

`C:\Users\HP\Downloads\noko119-cursor-dtii-m01-capacity-876d\noko119-cursor-dtii-m01-capacity-876d\`

在这个文件夹里双击 `打开本机计算.bat`。

## 拷到其他电脑

可以。把**整个文件夹**拷过去（U 盘或共享盘都行），在那台电脑上同样双击 `打开本机计算.bat`。

那台电脑还需要：

- 已安装 Miniconda 或 Python（会自动找当前用户下的 `miniconda3`）
- 第一次打开后，菜单选「安装抽手册依赖」
- 菜单「登记本机手册 PDF 路径」，填那台电脑上的手册位置（路径每台机器不同）

手册 PDF 不会打进工具包里，要单独带着或在那台电脑上另放。

## 菜单

1. 检查环境
2. 登记手册 PDF 路径
3. 如未安装则安装 pymupdf4llm
4. 只抽输送能力那几页
5. 输入运量/密度/带速做计算

手册始终在你电脑上，不会上传。

## 把表抄进 csv（这一步才算进计算）

对照原书填写：

- `catalogs\dtII\incline_factor.csv`：倾角、倾斜系数 k
- `catalogs\dtII\trough_section.csv`：带宽、槽角、堆积角、截面积 A
- `catalogs\dtII\lump_limit.csv`：带宽、允许最大粒度

没抄截面表之前，程序只会算所需截面，不会推荐带宽。这是故意的。

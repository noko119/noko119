# 本机部署 · 第 1 步（运量–带宽–带速）

在你自己的 Windows 上跑。手册 PDF 也放在本机，不必上传。

Python 用：`C:\Users\HP\miniconda3\python.exe`

最省事：仓库放到本机后，双击根目录 `打开本机计算.bat`，按菜单选：

1. 检查环境  
2. 登记手册 PDF 路径  
3. 如未安装则安装 pymupdf4llm  
4. 只抽输送能力那几页  
5. 输入运量/密度/带速做计算  

手册始终在你电脑上，不会上传。

## 1. 拿到这份代码

把仓库放到本机任意目录，例如：

`C:\Users\HP\noko119`

下面命令都在 **Anaconda Prompt** 里执行，窗口要有 `(base)`，**不要**出现 `>>>`。

```text
cd /d C:\Users\HP\noko119
```

路径按你实际放置位置改。

## 2. 告诉程序手册在哪

复制一份路径文件，改成你的 PDF 真实位置：

```text
copy local\handbook.path.example local\handbook.path
notepad local\handbook.path
```

文件里只留一行，例如：

```text
C:\Users\HP\Desktop\DTII手册.pdf
```

## 3. 只转「输送能力 / 带宽带速」那几页

先翻开纸质或 PDF，记住页码（例如 80 到 95），再转。不要先转全书。

```text
scripts\extract-handbook.bat --pages 80-95
```

或：

```text
C:\Users\HP\miniconda3\python.exe calc\extract_handbook.py --pages 80-95
```

生成文件在 `catalogs\dtII\raw\`。用记事本打开，对照原书看表。

## 4. 把表抄进 csv（这一步才算部署进计算）

打开这三个空表，按原书填数，并写上页码：

- `catalogs\dtII\incline_factor.csv`：倾角、倾斜系数 k
- `catalogs\dtII\trough_section.csv`：带宽、槽角、堆积角、截面积 A
- `catalogs\dtII\lump_limit.csv`：带宽、允许最大粒度

`belt_speed.csv` 和 `belt_width.csv` 已按国标系列填好，一般不用改。

`trough_section.csv` 一行示例（数字必须来自你的手册）：

```text
width_mm,trough_deg,surcharge_deg,A_m2,page,source,status
1000,35,20,0.138,88,DTII(A)你的版本,checked
```

没抄表之前，程序只会算所需截面，不会推荐带宽。这是故意的。

## 5. 跑第一步计算

```text
scripts\run-m01.bat --Q 800 --rho 1.6 --v 2.5 --incline 0 --trough 35 --surcharge 20 --lump 150
```

含义：运量 800 t/h，密度 1.6 t/m3，带速 2.5 m/s，水平，槽角 35°，堆积角 20°，最大粒度 150 mm。

把数字换成你项目里的。

## 6. 怎样才算第一步落地

- 本机能算出 `A_req`
- 你已按手册填进至少一行截面表
- 用手册里一个例题对拍，运量误差你能接受（建议 ±2% 内）

对拍过再做第 2 步（十二区段接线）。未对拍的表不要当设计依据。

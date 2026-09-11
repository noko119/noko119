# 本机 Miniconda3 诊断

目标安装路径：`C:\Users\HP\miniconda3`

云端读不到这个目录。请在 **本机 Windows PowerShell** 跑诊断脚本，把完整输出贴回来。

## 运行方法

在仓库根目录执行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\diagnose-miniconda.ps1
```

安装不在默认路径时：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\diagnose-miniconda.ps1 -Root "D:\miniconda3"
```

如果提示无法加载脚本，先执行：

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

然后再跑上面的诊断命令。

## 输出怎么看

每一项前面是状态：

- `[OK]` 正常
- `[WARN]` 可能抢优先级或配置不完整，先对照下面修
- `[FAIL]` 需要处理
- `[SKIP]` 因为缺前置文件，这一项没跑

把从 `Miniconda3 diagnostic` 到 `==== Done ====` 的全部文字复制发回即可。

## 按症状修复（先对症，不要先重装）

按优先级往下做。做完一项后新开一个 PowerShell 窗口再试 `conda --version`。

### 1. 命令找不到：`conda` 不是内部或外部命令

把 `condabin` 加到**用户** PATH（当前用户即可，不必改系统 PATH）：

```powershell
$condabin = "C:\Users\HP\miniconda3\condabin"
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$condabin*") {
    [Environment]::SetEnvironmentVariable("Path", "$userPath;$condabin", "User")
}
```

或直接初始化当前 shell：

```powershell
& "C:\Users\HP\miniconda3\Scripts\conda.exe" init powershell
```

然后**关掉终端再开一个新的**，执行：

```powershell
conda --version
```

### 2. 能找到 conda，但 `conda activate` 失败

补初始化，并确认 PowerShell 允许本地脚本：

```powershell
& "C:\Users\HP\miniconda3\Scripts\conda.exe" init powershell
& "C:\Users\HP\miniconda3\Scripts\conda.exe" init cmd.exe
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

新开终端后再激活：

```powershell
conda activate base
```

如果 `Get-Command python` 指向 `WindowsApps` 或其它 Python，先关掉 Microsoft Store 的 python 别名：

设置 → 应用 → 高级应用设置 → 应用执行别名 → 关闭 `python.exe` / `python3.exe`。

### 3. 下载失败、SSL 报错、卡住

先写用户 `.condarc`，切清华镜像（也可改成中科大）：

```powershell
@'
channels:
  - defaults
show_channel_urls: true
default_channels:
  - https://mirrors.tuna.tsinghua.edu.cn/anaconda/pkgs/main
  - https://mirrors.tuna.tsinghua.edu.cn/anaconda/pkgs/r
  - https://mirrors.tuna.tsinghua.edu.cn/anaconda/pkgs/msys2
custom_channels:
  conda-forge: https://mirrors.tuna.tsinghua.edu.cn/anaconda/cloud
ssl_verify: true
'@ | Set-Content -Encoding utf8 "$env:USERPROFILE\.condarc"
```

中科大镜像把上面的主机名换成 `https://mirrors.ustc.edu.cn/anaconda/` 对应路径。

仅作临时排查、确认是证书问题时，可再试：

```powershell
conda config --set ssl_verify false
```

能装包后再改回 `true`。不要长期关 SSL。

清一次索引后再装：

```powershell
conda clean -i
conda update -n base -c defaults conda
```

### 4. 某个环境损坏，base 还在

不要删整个 `miniconda3`。先看坏的是哪一个：

```powershell
conda env list
conda list -n 环境名
```

只重建那个环境（把 `坏掉的环境名` 和 `environment.yml` 换成你的）：

```powershell
conda deactivate
conda env remove -n 坏掉的环境名
conda env create -n 坏掉的环境名 -f environment.yml
```

没有 yml 时，记下原来装过的包再新建：

```powershell
conda create -n 坏掉的环境名 python=3.11
```

### 5. 安装目录缺关键文件

诊断里如果 `python.exe`、`Scripts\conda.exe`、`condabin\` 大量 `[FAIL]`，才考虑修复/重装到**同一路径**：

1. 从 https://docs.conda.io/en/latest/miniconda.html 下载 Windows 64-bit 安装包
2. 安装到 `C:\Users\HP\miniconda3`（不要换盘、不要加空格路径）
3. 勾选 “Add Miniconda3 to my PATH” 仅当你清楚自己在改用户 PATH；更稳妥是装完再执行上面的 `conda init powershell`
4. 重装前可先把 `C:\Users\HP\miniconda3\envs` 拷到别处，装完再拷回

## 常见对照

| 诊断输出 | 先做哪一步 |
| --- | --- |
| Install root `[FAIL]` | 路径不对或未安装；确认资源管理器里是否真有该文件夹 |
| Miniconda on PATH `[FAIL]` | 第 1 步：加 `condabin` 或 `conda init` |
| Get-Command conda `[FAIL]` | 同上，然后新开终端 |
| python points at this Miniconda `[WARN]` | 第 2 步：关 Store 别名，检查其它 Python |
| PowerShell profile / cmd AutoRun `[FAIL]` | 第 2 步：`conda init` |
| `.condarc` `[FAIL]` 且下载失败 | 第 3 步：写镜像配置 |
| repo.anaconda.com `[FAIL]`、清华 `[OK]` | 第 3 步：用清华/中科大 |
| 某个 `env ... python.exe missing` | 第 4 步：只重建该环境 |
| `python.exe` / `conda.exe` 缺失 | 第 5 步：修复或重装到同一路径 |

## 跑完后请发回

1. 脚本完整输出
2. 你原来的报错（命令 + 原文）
3. 你想激活的环境名（如果有）

有这三项才能把上面的通用步骤收成一条针对你这台机器的命令序列。

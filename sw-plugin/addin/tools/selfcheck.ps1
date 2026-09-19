<#
.SYNOPSIS
  本地自检：环境 / 编译产物 / 注册状态 / SW 版本匹配。结果写到 selfcheck-report.txt，可直接贴回给开发者。
.EXAMPLE
  .\selfcheck.ps1
#>
$ErrorActionPreference = "Continue"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$report = Join-Path $PSScriptRoot "selfcheck-report.txt"
$lines = New-Object System.Collections.Generic.List[string]
function Say($ok, $msg) { $tag = if ($ok -eq $true) { "[OK]  " } elseif ($ok -eq $false) { "[FAIL]" } else { "[INFO]" }; $l = "$tag $msg"; Write-Host $l; $lines.Add($l) }

$lines.Add("PIDM DTII SW Add-in selfcheck  $(Get-Date -Format s)")
$lines.Add("OS: $([Environment]::OSVersion.VersionString)  64bit: $([Environment]::Is64BitOperatingSystem)")

# 1. .NET Framework 4.8
$rel = (Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full" -ErrorAction SilentlyContinue).Release
Say ($rel -ge 528040) ".NET Framework 4.8 (Release=$rel)"

# 2. .NET SDK
$sdk = (& dotnet --version 2>$null)
Say ([bool]$sdk) ".NET SDK: $sdk"

# 3. SolidWorks 安装与版本
$swKey = Get-ChildItem "HKLM:\SOFTWARE\SolidWorks" -ErrorAction SilentlyContinue | Where-Object { $_.PSChildName -like "SOLIDWORKS 20*" -or $_.PSChildName -like "SolidWorks 20*" } | Select-Object -Last 1
$swYear = $null
if ($swKey) {
  $swYear = [int]($swKey.PSChildName -replace '\D', '')
  $swPath = (Get-ItemProperty $swKey.PSPath -ErrorAction SilentlyContinue).SolidWorksFolder
  Say $true "SolidWorks $swYear  ($swPath)"
} else { Say $false "未在注册表找到 SolidWorks 安装（HKLM\SOFTWARE\SolidWorks\SOLIDWORKS 20xx）" }

# 4. 编译产物
$dll = Join-Path $root "PidmPath.AddIn\bin\Release\PidmPath.AddIn.dll"
Say (Test-Path $dll) "插件 DLL: $dll"
if (Test-Path $dll) {
  $dir = Split-Path $dll
  foreach ($f in "PidmPath.Core.dll", "Newtonsoft.Json.dll", "SolidWorks.Interop.sldworks.dll", "SolidWorks.Interop.swconst.dll", "SolidWorks.Interop.swpublished.dll") {
    Say (Test-Path (Join-Path $dir $f)) "依赖: $f"
  }
  Say (Test-Path (Join-Path $dir "Icons\carry_20.png")) "图标目录 Icons\"
  $blocked = Get-Item $dll -Stream Zone.Identifier -ErrorAction SilentlyContinue
  Say (-not $blocked) "DLL 未被系统标记为'来自网络'（Zone.Identifier）"
  try {
    $asm = [System.Reflection.AssemblyName]::GetAssemblyName($dll)
    Say ($asm.ProcessorArchitecture -in "Amd64", "MSIL") "DLL 架构: $($asm.ProcessorArchitecture)"
  } catch { Say $null "无法读取 DLL 元数据: $_" }
  # interop 版本 vs SW 年份
  $interop = Join-Path $dir "SolidWorks.Interop.sldworks.dll"
  if ((Test-Path $interop) -and $swYear) {
    $iv = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($interop).FileMajorPart
    $expected = $swYear - 1992   # 2024 -> 32
    Say ($iv -le $expected) "Interop 主版本 $iv（SW$swYear 对应 $expected；Interop 不能高于 SW 版本）"
  }
}

# 5. 注册状态
$guid = "{D3F0A6C1-8B2E-4F5A-9C7D-1E2B3A4C5D6F}"
$addinKey = "HKLM:\SOFTWARE\SolidWorks\Addins\$guid"
Say (Test-Path $addinKey) "HKLM Addins 注册键 $addinKey"
if (Test-Path $addinKey) { $lines.Add("        Title=" + (Get-ItemProperty $addinKey).Title) }
Say (Test-Path "HKCU:\Software\SolidWorks\AddInsStartup\$guid") "HKCU AddInsStartup（启动时加载）"
$clsid = "Registry::HKEY_CLASSES_ROOT\CLSID\$guid\InprocServer32"
if (Test-Path $clsid) {
  $cb = (Get-ItemProperty $clsid).CodeBase
  Say $true "COM CLSID 已注册, CodeBase=$cb"
  if ($cb -and -not (Test-Path ([Uri]$cb).LocalPath)) { Say $false "CodeBase 指向的文件不存在（DLL 被移动？重新 register.ps1）" }
} else { Say $false "COM CLSID 未注册 → 以管理员运行 .\register.ps1" }
$tp = "Registry::HKEY_CLASSES_ROOT\PidmPath.AddIn.TaskPaneHost"
Say (Test-Path $tp) "任务窗格控件 ProgId 已注册"

# 6. RegAsm 可用
$regasm = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\RegAsm.exe"
Say (Test-Path $regasm) "64 位 RegAsm: $regasm"

# 7. 管理员？
$isAdmin = (New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Say $null "当前 PowerShell 管理员: $isAdmin（注册需要）"

$lines | Set-Content -Encoding UTF8 $report
Write-Host "`n报告已写入 $report —— 有 [FAIL] 时把整份报告贴给开发者。"

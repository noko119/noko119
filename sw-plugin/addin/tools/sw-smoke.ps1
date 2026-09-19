<#
.SYNOPSIS
  真机无界面冒烟：通过 COM 启动 SolidWorks，调用插件 RunSmokeTest，打印并保存报告。
  不需要手点任何按钮。可由人或本地 Cursor agent 直接运行。
.EXAMPLE
  .\sw-smoke.ps1                      # 侧型 C1
  .\sw-smoke.ps1 -SideType L1 -KeepOpen
#>
param(
  [string]$SideType = "C1",
  [string]$OutDir = (Join-Path $env:TEMP "pidm-sw-smoke"),
  [switch]$KeepOpen,
  [int]$TimeoutSec = 180
)
$ErrorActionPreference = "Stop"
$report = Join-Path $PSScriptRoot "sw-smoke-report.txt"

Write-Host "启动 SolidWorks（COM）..." 
$sw = $null
try { $sw = [System.Runtime.InteropServices.Marshal]::GetActiveObject("SldWorks.Application"); Write-Host "已连接到运行中的 SolidWorks" }
catch { $sw = New-Object -ComObject SldWorks.Application; $sw.Visible = $true; Write-Host "已新启动 SolidWorks" }

# 等待插件加载（AddInsStartup 注册后 SW 启动时自动加载；否则尝试手动加载）
$addin = $null
$deadline = (Get-Date).AddSeconds($TimeoutSec)
while (-not $addin -and (Get-Date) -lt $deadline) {
  try { $addin = $sw.GetAddInObject("PidmPath.AddIn.SwAddin") } catch { $addin = $null }
  if (-not $addin) {
    try {
      $dll = Resolve-Path (Join-Path $PSScriptRoot "..\PidmPath.AddIn\bin\Release\PidmPath.AddIn.dll") -ErrorAction SilentlyContinue
      if ($dll) { $null = $sw.LoadAddIn($dll.Path) }
    } catch {}
    Start-Sleep -Seconds 2
  }
}
if (-not $addin) {
  "[FAIL] 插件未加载：GetAddInObject('PidmPath.AddIn.SwAddin') 为空。请先以管理员运行 register.ps1，并在 SW 工具→插件 中勾选。" | Tee-Object $report
  exit 2
}
Write-Host ("Ping: " + $addin.Ping())

Write-Host "运行 RunSmokeTest($OutDir, $SideType) ..."
$text = $addin.RunSmokeTest($OutDir, $SideType)
$text | Tee-Object $report
Write-Host "`n报告：$report"

if (-not $KeepOpen) {
  try { $sw.ExitApp() } catch {}
}
if ($text -match "\[FAIL\]") { exit 1 } else { exit 0 }

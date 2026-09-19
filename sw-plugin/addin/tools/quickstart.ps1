<#
.SYNOPSIS
  一键：注册插件 → 自检 → 启动 SolidWorks 跑无界面冒烟。适用于解压即用的 zip 发行包（无需 Git / .NET SDK）。
  以管理员身份运行 PowerShell，然后：
      cd <解压目录>\tools
      .\quickstart.ps1
#>
param([string]$SideType = "C1", [switch]$KeepOpen)
$ErrorActionPreference = "Stop"
$here = $PSScriptRoot

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host "请右键 PowerShell → 以管理员身份运行，再执行本脚本。" -ForegroundColor Red; exit 1
}
if ((Get-ExecutionPolicy) -eq "Restricted") { Set-ExecutionPolicy RemoteSigned -Scope LocalMachine -Force }

Write-Host "`n=== 1/3 注册插件 ===" -ForegroundColor Cyan
& "$here\register.ps1"

Write-Host "`n=== 2/3 自检 ===" -ForegroundColor Cyan
& "$here\selfcheck.ps1"

Write-Host "`n=== 3/3 启动 SolidWorks 冒烟（约 1 分钟，SW 窗口会自动弹出）===" -ForegroundColor Cyan
if ($KeepOpen) { & "$here\sw-smoke.ps1" -SideType $SideType -KeepOpen } else { & "$here\sw-smoke.ps1" -SideType $SideType }
$code = $LASTEXITCODE

Write-Host "`n完成。请把以下两个文件内容发给开发者：" -ForegroundColor Cyan
Write-Host "  $here\selfcheck-report.txt"
Write-Host "  $here\sw-smoke-report.txt"
exit $code

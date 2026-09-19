<#
.SYNOPSIS
  注册 / 反注册 PIDM DTⅡ 路径 SolidWorks 插件（需要管理员 PowerShell）。
.EXAMPLE
  .\register.ps1                 # 注册 ..\PidmPath.AddIn\bin\Release\PidmPath.AddIn.dll
  .\register.ps1 -Unregister     # 反注册
  .\register.ps1 -Dll C:\PIDM\PidmPath.AddIn.dll
#>
param(
  [string]$Dll = (Join-Path $PSScriptRoot "..\PidmPath.AddIn\bin\Release\PidmPath.AddIn.dll"),
  [switch]$Unregister
)
$ErrorActionPreference = "Stop"
$Dll = (Resolve-Path $Dll).Path
$regasm = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\RegAsm.exe"
if (-not (Test-Path $regasm)) { throw "找不到 64 位 RegAsm：$regasm（需要 .NET Framework 4.x）" }

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "请以管理员身份运行 PowerShell（写 HKLM\SOFTWARE\SolidWorks\Addins 需要）。"
}

if ($Unregister) {
  & $regasm $Dll /unregister
  Write-Host "已反注册：$Dll"
  exit 0
}

# 解除从网络/压缩包下载的阻止标记，避免 SW 加载被拦
Get-ChildItem (Split-Path $Dll) -Recurse -File | Unblock-File -ErrorAction SilentlyContinue

& $regasm $Dll /codebase
if ($LASTEXITCODE -ne 0) { throw "RegAsm 失败，退出码 $LASTEXITCODE" }

$guid = "{D3F0A6C1-8B2E-4F5A-9C7D-1E2B3A4C5D6F}"
$key = "HKLM:\SOFTWARE\SolidWorks\Addins\$guid"
if (Test-Path $key) {
  Write-Host "已注册。SolidWorks → 工具 → 插件 中应出现「PIDM DTⅡ 皮带机路径」；打开零件/装配后看 CommandManager 选项卡「DTⅡ 路径」。"
} else {
  Write-Warning "RegAsm 成功但未发现 $key，请检查是否用 64 位 RegAsm 且 DLL 目标为 x64。"
}

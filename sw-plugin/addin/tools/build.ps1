<#
.SYNOPSIS
  编译插件（Release）。需要 .NET SDK 8（含 net48 目标包，SDK 会自动拉取 Microsoft.NETFramework.ReferenceAssemblies）。
.EXAMPLE
  .\build.ps1            # 编译 + 跑核心单元测试
  .\build.ps1 -NoTest
#>
param([switch]$NoTest)
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Push-Location $root
try {
  dotnet --version | Out-Null
  dotnet build "$root\PidmPath.AddIn\PidmPath.AddIn.csproj" -c Release
  if ($LASTEXITCODE -ne 0) { throw "编译失败" }
  if (-not $NoTest) {
    dotnet test "$root\PidmPath.Core.Tests\PidmPath.Core.Tests.csproj" -c Release
    if ($LASTEXITCODE -ne 0) { throw "单元测试失败" }
  }
  Write-Host "`n输出：$root\PidmPath.AddIn\bin\Release\PidmPath.AddIn.dll"
  Write-Host "下一步：管理员 PowerShell 运行 .\tools\register.ps1"
} finally { Pop-Location }

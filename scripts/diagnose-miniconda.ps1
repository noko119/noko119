# Diagnose a local Windows Miniconda3 install.
# Default target: C:\Users\HP\miniconda3
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\diagnose-miniconda.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\diagnose-miniconda.ps1 -Root "D:\miniconda3"

[CmdletBinding()]
param(
    [string]$Root = "C:\Users\HP\miniconda3"
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"

function Write-Section {
    param([string]$Title)
    Write-Host ""
    Write-Host "==== $Title ===="
}

function Write-Check {
    param(
        [string]$Name,
        [string]$Status,
        [string]$Detail = ""
    )
    $line = "[{0}] {1}" -f $Status, $Name
    if ($Detail) {
        $line = "{0}  {1}" -f $line, $Detail
    }
    Write-Host $line
}

function Test-HttpUrl {
    param(
        [string]$Url,
        [int]$TimeoutSec = 8
    )
    try {
        $req = [System.Net.HttpWebRequest]::Create($Url)
        $req.Method = "HEAD"
        $req.Timeout = $TimeoutSec * 1000
        $req.AllowAutoRedirect = $true
        $req.UserAgent = "miniconda-diagnose"
        $resp = $req.GetResponse()
        $code = [int]$resp.StatusCode
        $resp.Close()
        return "OK HTTP $code"
    } catch {
        $msg = $_.Exception.Message
        if ($_.Exception.InnerException) {
            $msg = "{0} | {1}" -f $msg, $_.Exception.InnerException.Message
        }
        return "FAIL $msg"
    }
}

function Get-CondaExe {
    param([string]$InstallRoot)
    $candidates = @(
        (Join-Path $InstallRoot "Scripts\conda.exe"),
        (Join-Path $InstallRoot "condabin\conda.bat"),
        (Join-Path $InstallRoot "condabin\conda.exe")
    )
    foreach ($path in $candidates) {
        if (Test-Path -LiteralPath $path) {
            return $path
        }
    }
    return $null
}

function Invoke-Conda {
    param(
        [string]$CondaPath,
        [string[]]$CondaArgs
    )
    $output = & $CondaPath @CondaArgs 2>&1
    return [pscustomobject]@{
        ExitCode = $LASTEXITCODE
        Output   = ($output | Out-String).TrimEnd()
    }
}

Write-Host "Miniconda3 diagnostic"
Write-Host ("Time: {0}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"))
Write-Host ("User: {0}" -f $env:USERNAME)
Write-Host ("Computer: {0}" -f $env:COMPUTERNAME)
Write-Host ("PowerShell: {0}" -f $PSVersionTable.PSVersion)
Write-Host ("Root: {0}" -f $Root)

# --- 1. Install completeness ---
Write-Section "1. Install files"
$rootExists = Test-Path -LiteralPath $Root
if ($rootExists) {
    Write-Check "Install root exists" "OK" $Root
} else {
    Write-Check "Install root exists" "FAIL" "Directory not found: $Root"
}

$required = @(
    @{ Name = "python.exe"; Rel = "python.exe" },
    @{ Name = "Scripts\"; Rel = "Scripts" },
    @{ Name = "condabin\"; Rel = "condabin" },
    @{ Name = "Scripts\conda.exe"; Rel = "Scripts\conda.exe" },
    @{ Name = "condabin\conda.bat"; Rel = "condabin\conda.bat" },
    @{ Name = "Library\bin\"; Rel = "Library\bin" },
    @{ Name = "envs\"; Rel = "envs" }
)

foreach ($item in $required) {
    $full = Join-Path $Root $item.Rel
    if (Test-Path -LiteralPath $full) {
        Write-Check $item.Name "OK" $full
    } else {
        Write-Check $item.Name "FAIL" "Missing: $full"
    }
}

$condaExe = Get-CondaExe -InstallRoot $Root
if ($condaExe) {
    Write-Check "Resolved conda launcher" "OK" $condaExe
} else {
    Write-Check "Resolved conda launcher" "FAIL" "No conda.exe / conda.bat under $Root"
}

# --- 2. PATH and competing Pythons ---
Write-Section "2. PATH and competing Python"
$pathEntries = @()
if ($env:PATH) {
    $pathEntries = $env:PATH -split ";" | Where-Object { $_ -and $_.Trim() }
}
Write-Host ("PATH entry count: {0}" -f $pathEntries.Count)

$rootNorm = $Root.TrimEnd("\").ToLowerInvariant()
$condaPathHits = @()
$otherPythonHits = @()
$i = 0
foreach ($entry in $pathEntries) {
    $i++
    $norm = $entry.TrimEnd("\").ToLowerInvariant()
    $isConda = $norm.StartsWith($rootNorm)
    $looksPython = $norm -match "python|conda|anaconda|miniconda|windowsapps"
    if ($isConda) {
        $condaPathHits += "{0}. {1}" -f $i, $entry
    } elseif ($looksPython) {
        $otherPythonHits += "{0}. {1}" -f $i, $entry
    }
}

if ($condaPathHits.Count -gt 0) {
    Write-Check "Miniconda on PATH" "OK" ("{0} entries" -f $condaPathHits.Count)
    $condaPathHits | ForEach-Object { Write-Host "    $_" }
} else {
    Write-Check "Miniconda on PATH" "FAIL" "Neither condabin nor Scripts is on PATH"
}

if ($otherPythonHits.Count -gt 0) {
    Write-Check "Other Python-like PATH entries" "WARN" "These can shadow conda"
    $otherPythonHits | ForEach-Object { Write-Host "    $_" }
} else {
    Write-Check "Other Python-like PATH entries" "OK" "None obvious"
}

$whereConda = Get-Command conda -ErrorAction SilentlyContinue
if ($whereConda) {
    Write-Check "Get-Command conda" "OK" $whereConda.Source
} else {
    Write-Check "Get-Command conda" "FAIL" "conda is not a recognized command in this shell"
}

$wherePython = Get-Command python -ErrorAction SilentlyContinue
if ($wherePython) {
    Write-Check "Get-Command python" "OK" $wherePython.Source
    if ($rootExists -and -not $wherePython.Source.ToLowerInvariant().StartsWith($rootNorm)) {
        Write-Check "python points at this Miniconda" "WARN" "A different python is first on PATH"
    }
} else {
    Write-Check "Get-Command python" "FAIL" "python is not a recognized command in this shell"
}

$wherePy = Get-Command py -ErrorAction SilentlyContinue
if ($wherePy) {
    Write-Check "Get-Command py" "WARN" ("Windows py launcher: {0}" -f $wherePy.Source)
}

# --- 3. conda commands ---
Write-Section "3. conda commands"
if ($condaExe) {
    $ver = Invoke-Conda -CondaPath $condaExe -CondaArgs @("--version")
    if ($ver.ExitCode -eq 0) {
        Write-Check "conda --version" "OK" $ver.Output
    } else {
        Write-Check "conda --version" "FAIL" ("exit {0}: {1}" -f $ver.ExitCode, $ver.Output)
    }

    $info = Invoke-Conda -CondaPath $condaExe -CondaArgs @("info")
    if ($info.ExitCode -eq 0) {
        Write-Check "conda info" "OK"
        Write-Host $info.Output
    } else {
        Write-Check "conda info" "FAIL" ("exit {0}" -f $info.ExitCode)
        if ($info.Output) { Write-Host $info.Output }
    }

    $envs = Invoke-Conda -CondaPath $condaExe -CondaArgs @("env", "list")
    if ($envs.ExitCode -eq 0) {
        Write-Check "conda env list" "OK"
        Write-Host $envs.Output
    } else {
        Write-Check "conda env list" "FAIL" ("exit {0}" -f $envs.ExitCode)
        if ($envs.Output) { Write-Host $envs.Output }
    }
} else {
    Write-Check "conda commands" "SKIP" "conda launcher missing; cannot run --version / info / env list"
}

# --- 4. conda init ---
Write-Section "4. conda init"
$profileFiles = @(
    $PROFILE,
    (Join-Path $HOME "Documents\WindowsPowerShell\profile.ps1"),
    (Join-Path $HOME "Documents\PowerShell\Microsoft.PowerShell_profile.ps1")
) | Select-Object -Unique

$initHit = $false
foreach ($profilePath in $profileFiles) {
    if (-not $profilePath) { continue }
    if (Test-Path -LiteralPath $profilePath) {
        $text = Get-Content -LiteralPath $profilePath -Raw -ErrorAction SilentlyContinue
        if ($text -and $text -match "conda") {
            Write-Check "PowerShell profile has conda hook" "OK" $profilePath
            $initHit = $true
        } else {
            Write-Check "PowerShell profile has conda hook" "FAIL" $profilePath
        }
    } else {
        Write-Check "PowerShell profile exists" "FAIL" $profilePath
    }
}

$cmdAutoRun = $null
try {
    $cmdAutoRun = Get-ItemProperty -Path "HKCU:\Software\Microsoft\Command Processor" -Name AutoRun -ErrorAction SilentlyContinue
} catch {}
if ($cmdAutoRun -and $cmdAutoRun.AutoRun) {
    Write-Check "cmd.exe AutoRun" "OK" $cmdAutoRun.AutoRun
} else {
    Write-Check "cmd.exe AutoRun" "FAIL" "No HKCU Command Processor AutoRun (conda init cmd.exe not applied)"
}

if (-not $initHit) {
    Write-Host "Hint: C:\Users\HP\miniconda3\Scripts\conda.exe init powershell"
}

# --- 5. .condarc ---
Write-Section "5. .condarc and channels"
$condarcPaths = @(
    (Join-Path $HOME ".condarc"),
    (Join-Path $Root ".condarc")
)
$foundCondarc = $false
foreach ($cfg in $condarcPaths) {
    if (Test-Path -LiteralPath $cfg) {
        $foundCondarc = $true
        Write-Check ".condarc found" "OK" $cfg
        Write-Host "----- $cfg -----"
        Get-Content -LiteralPath $cfg | ForEach-Object { Write-Host $_ }
    } else {
        Write-Check ".condarc found" "FAIL" $cfg
    }
}
if (-not $foundCondarc) {
    Write-Host "Hint: no .condarc yet. Default Anaconda defaults apply; China networks often need a mirror."
}

# --- 6. envs directory ---
Write-Section "6. Environments on disk"
$envsDir = Join-Path $Root "envs"
if (Test-Path -LiteralPath $envsDir) {
    $envDirs = Get-ChildItem -LiteralPath $envsDir -Directory -ErrorAction SilentlyContinue
    if ($envDirs) {
        Write-Check "envs\ subdirectories" "OK" ("{0} found" -f @($envDirs).Count)
        foreach ($dir in $envDirs) {
            $py = Join-Path $dir.FullName "python.exe"
            $pyOk = Test-Path -LiteralPath $py
            $status = if ($pyOk) { "OK" } else { "FAIL" }
            $detail = if ($pyOk) { $py } else { "python.exe missing" }
            Write-Check ("env {0}" -f $dir.Name) $status $detail
        }
    } else {
        Write-Check "envs\ subdirectories" "OK" "empty (only base is expected)"
    }
} else {
    Write-Check "envs\" "FAIL" "Directory missing"
}

# --- 7. Network ---
Write-Section "7. Channel connectivity"
$urls = @(
    "https://repo.anaconda.com/pkgs/main/",
    "https://mirrors.tuna.tsinghua.edu.cn/anaconda/pkgs/main/",
    "https://mirrors.ustc.edu.cn/anaconda/pkgs/main/"
)
foreach ($url in $urls) {
    $result = Test-HttpUrl -Url $url
    $status = if ($result.StartsWith("OK")) { "OK" } else { "FAIL" }
    Write-Check $url $status $result
}

Write-Section "Done"
Write-Host "Copy everything above and send it back (or paste your original error)."
Write-Host "See scripts/README-miniconda.md for the matching fix for each FAIL/WARN."

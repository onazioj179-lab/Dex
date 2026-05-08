#requires -Version 5.1
<#
.SYNOPSIS
    Removes DEX user-data, orphan installs, and updater caches on Windows.

.DESCRIPTION
    Targets these paths (each only if it exists):
      %APPDATA%\dex                         user data (settings, sessions, IndexedDB)
      %LOCALAPPDATA%\dex-updater            electron-updater download cache
      %LOCALAPPDATA%\Programs\DEX           per-user NSIS install
      %APPDATA%\Electron                    Electron dev/test data
      %LOCALAPPDATA%\Electron               Electron build download cache (only with -DeepClean)

    By default the Electron build cache is preserved because rebuilding pulls
    hundreds of MB. Pass -DeepClean to nuke it too.

.PARAMETER WhatIf
    Show what would be removed without deleting anything.

.PARAMETER KeepUserData
    Preserve %APPDATA%\dex (your settings and unlocked Creator token).

.PARAMETER DeepClean
    Also remove %LOCALAPPDATA%\Electron (build cache).

.EXAMPLE
    pwsh scripts/clean-dex-cache.ps1 -WhatIf
    pwsh scripts/clean-dex-cache.ps1 -KeepUserData
    pwsh scripts/clean-dex-cache.ps1 -DeepClean
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [switch]$KeepUserData,
    [switch]$DeepClean
)

$ErrorActionPreference = 'Stop'

# Stop any running DEX before touching files.
$running = Get-Process -Name 'DEX', 'dex' -ErrorAction SilentlyContinue
if ($running) {
    Write-Host "Stopping running DEX processes..." -ForegroundColor Yellow
    $running | Stop-Process -Force
    Start-Sleep -Seconds 1
}

$targets = [System.Collections.ArrayList]::new()
if (-not $KeepUserData) { [void]$targets.Add("$env:APPDATA\dex") }
[void]$targets.Add("$env:LOCALAPPDATA\dex-updater")
[void]$targets.Add("$env:LOCALAPPDATA\Programs\DEX")
[void]$targets.Add("$env:APPDATA\Electron")
if ($DeepClean) { [void]$targets.Add("$env:LOCALAPPDATA\Electron") }

$totalFreed = 0L

foreach ($path in $targets) {
    if (-not (Test-Path -LiteralPath $path)) {
        Write-Host ("skip   {0}  (not present)" -f $path) -ForegroundColor DarkGray
        continue
    }

    $size = (Get-ChildItem -LiteralPath $path -Recurse -Force -ErrorAction SilentlyContinue |
             Measure-Object -Property Length -Sum).Sum
    $mb = if ($size) { [math]::Round($size / 1MB, 1) } else { 0 }

    if ($PSCmdlet.ShouldProcess($path, "Remove $mb MB")) {
        try {
            Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction Stop
            $totalFreed += [int64]$size
            Write-Host ("wiped  {0,8} MB  {1}" -f $mb, $path) -ForegroundColor Green
        } catch {
            Write-Host ("FAIL              {0}  {1}" -f $path, $_.Exception.Message) -ForegroundColor Red
        }
    }
}

$freedMb = [math]::Round($totalFreed / 1MB, 1)
Write-Host ""
Write-Host ("Done. Freed {0} MB." -f $freedMb) -ForegroundColor Cyan

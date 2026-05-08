#requires -Version 5.1
[CmdletBinding()]
param([switch]$NoPush)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$pkg = Get-Content -LiteralPath (Join-Path $repoRoot 'package.json') -Raw | ConvertFrom-Json
$version = $pkg.version
$tag = "v$version"
Write-Host ("Publishing DEX {0} to onazioj179-lab/dex-updates..." -f $version) -ForegroundColor Cyan

$releaseDir = Join-Path $repoRoot 'release'
$expected = @("DEX-$version-win-x64.exe", "DEX-$version-win-x64.exe.blockmap", 'latest.yml')
$missing = $expected | Where-Object { -not (Test-Path -LiteralPath (Join-Path $releaseDir $_)) }
if ($missing) { throw "Missing artifacts in $releaseDir : $($missing -join ', '). Run 'npm run package:win' first." }
$assetPaths = $expected | ForEach-Object { Join-Path $releaseDir $_ }

if ($NoPush) { Write-Host "Would create release $tag with assets:" -ForegroundColor Yellow; $assetPaths | ForEach-Object { Write-Host "  $_" }; return }

& gh release view $tag --repo onazioj179-lab/dex-updates --json tagName *> $null
if ($LASTEXITCODE -eq 0) {
  Write-Host ("Replacing existing release {0}..." -f $tag) -ForegroundColor Yellow
  & gh release delete $tag --repo onazioj179-lab/dex-updates --yes --cleanup-tag | Out-Null
}

$notes = "DEX desktop for Windows x64.`n`nApplication source is private; this page hosts only the installer and electron-updater manifest.`n`nAuto-update feed: https://github.com/onazioj179-lab/dex-updates/releases/latest/download/latest.yml"

& gh release create $tag --repo onazioj179-lab/dex-updates --title "DEX $version" --notes $notes @assetPaths
if ($LASTEXITCODE -ne 0) { throw "gh release create failed" }

Write-Host ""
Write-Host "Done." -ForegroundColor Green
Write-Host ("Release page:     https://github.com/onazioj179-lab/dex-updates/releases/tag/{0}" -f $tag) -ForegroundColor Cyan
Write-Host ("Latest installer: https://github.com/onazioj179-lab/dex-updates/releases/latest/download/DEX-{0}-win-x64.exe" -f $version) -ForegroundColor Cyan
Write-Host  "Update feed:      https://github.com/onazioj179-lab/dex-updates/releases/latest/download/latest.yml" -ForegroundColor Cyan

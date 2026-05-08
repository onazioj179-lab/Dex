#requires -Version 5.1
# =============================================================================
# DEX -- Prune old GitHub releases on a repo, keeping only the N newest.
# Usage:  pwsh -File scripts/prune-releases.ps1 -Repo onazioj179-lab/Dex -Keep 3
# =============================================================================
[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string] $Repo,
  [int] $Keep = 3
)
$ErrorActionPreference = 'Stop'
$all = & gh release list --repo $Repo --limit 200 --json tagName,createdAt | ConvertFrom-Json
$old = $all | Sort-Object { [datetime]$_.createdAt } -Descending | Select-Object -Skip $Keep
if (-not $old) { Write-Host "Nothing to prune on $Repo (have $($all.Count), keep $Keep)." -ForegroundColor Green; return }
foreach ($r in $old) {
  Write-Host ("Deleting {0} {1}..." -f $Repo, $r.tagName) -ForegroundColor DarkGray
  & gh release delete $r.tagName --repo $Repo --yes --cleanup-tag | Out-Null
}
Write-Host ("Pruned {0} old release(s) on {1}." -f $old.Count, $Repo) -ForegroundColor Green

# Migrate boxShadow literals to design-system tokens.
# Idempotent: only writes files whose content actually changes.
$ErrorActionPreference = 'Stop'

$pairs = [System.Collections.Generic.List[object]]::new()
function Add-Pair([string]$from, [string]$to) {
  $pairs.Add([pscustomobject]@{ From = $from; To = $to }) | Out-Null
}

Add-Pair "'0 8px 32px rgba(0,0,0,0.5)'" "'var(--pg-shadow-popover)'"
Add-Pair "'0 8px 32px rgba(0,0,0,0.4)'" "'var(--pg-shadow-panel)'"
Add-Pair "'0 8px 32px rgba(0,0,0,0.35)'" "'var(--pg-shadow-panel)'"
Add-Pair "'0 8px 32px rgba(0,0,0,0.3)'" "'var(--pg-shadow-panel)'"
Add-Pair "'0 8px 32px rgba(0,0,0,0.6)'" "'var(--pg-shadow-popover)'"
Add-Pair "'0 8px 24px rgba(0,0,0,0.5)'" "'var(--pg-shadow-context)'"
Add-Pair "'0 8px 24px rgba(0,0,0,0.6)'" "'var(--pg-shadow-context)'"
Add-Pair "'0 8px 24px rgba(0,0,0,0.45)'" "'var(--pg-shadow-context)'"
Add-Pair "'0 8px 24px rgba(0,0,0,0.4)'" "'var(--pg-shadow-context)'"
Add-Pair "'0 8px 24px rgba(0,0,0,0.35)'" "'var(--pg-shadow-tooltip)'"
Add-Pair "'0 12px 40px rgba(0,0,0,0.6)'" "'var(--pg-shadow-popover)'"
Add-Pair "'0 12px 40px rgba(0,0,0,0.4)'" "'var(--pg-shadow-popover)'"
Add-Pair "'0 12px 40px rgba(0,0,0,0.5)'" "'var(--pg-shadow-popover)'"
Add-Pair "'0 12px 32px rgba(0,0,0,0.5)'" "'var(--pg-shadow-popover)'"
Add-Pair "'0 12px 48px rgba(0,0,0,0.5)'" "'var(--pg-shadow-popover)'"
Add-Pair "'0 16px 48px rgba(0,0,0,0.5)'" "'var(--pg-shadow-popover)'"
Add-Pair "'0 16px 48px rgba(0,0,0,0.4)'" "'var(--pg-shadow-popover)'"
Add-Pair "'0 16px 64px rgba(0,0,0,0.55)'" "'var(--pg-shadow-popover-strong)'"
Add-Pair "'0 24px 80px rgba(0,0,0,0.5)'" "'var(--pg-shadow-modal)'"
Add-Pair "'0 24px 64px rgba(0,0,0,0.45)'" "'var(--pg-shadow-modal)'"
Add-Pair "'0 24px 64px rgba(0,0,0,0.7)'" "'var(--pg-shadow-modal)'"

$files = Get-ChildItem -Path src\renderer -Recurse -Include *.ts,*.tsx -File |
  Where-Object { $_.Name -ne 'design-system.css' }

$totalFiles = 0
$totalReps = 0
$enc = [System.Text.UTF8Encoding]::new($false)
$touched = @()
foreach ($f in $files) {
  $orig = [System.IO.File]::ReadAllText($f.FullName)
  $new = $orig
  $fileReps = 0
  foreach ($p in $pairs) {
    if ($new.Contains($p.From)) {
      $count = ([regex]::Matches($new, [regex]::Escape($p.From))).Count
      $new = $new.Replace($p.From, $p.To)
      $fileReps += $count
    }
  }
  if ($fileReps -gt 0 -and $new -ne $orig) {
    [System.IO.File]::WriteAllText($f.FullName, $new, $enc)
    $totalFiles += 1
    $totalReps += $fileReps
    $rel = $f.FullName.Substring((Resolve-Path .).Path.Length + 1)
    $touched += "$rel ($fileReps)"
  }
}
Write-Host "total_files_modified=$totalFiles"
Write-Host "total_replacements=$totalReps"
$touched | ForEach-Object { Write-Host "  $_" }

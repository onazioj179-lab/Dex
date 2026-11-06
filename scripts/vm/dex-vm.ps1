# =============================================================================
# DEX Platform
# Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
# Created by Onazi Treasure OJ <onazi75@gmail.com>
# Licensed under the DEX Software License Agreement v1.0. See LICENSE.
# =============================================================================
<#
.SYNOPSIS
  Clean-machine install tests for the DEX setup in a VirtualBox Windows 11 VM,
  so nothing is installed on this PC.

.DESCRIPTION
  create   Build the VM from a Windows 11 ISO with an unattended install
           (Guest Additions included), wait until the desktop is up, and take a
           snapshot named "clean". Run once; takes 30-60 minutes.
  test     Restore "clean", then: fresh install, launch, uninstall; and
           (with -OldSetup) install the old version, upgrade over it, check the
           data survived. Writes a report to scripts/vm/out/<time>/report.json.
  status   Show the VM and its snapshots.
  remove   Unregister the VM and delete its disk (asks first).

  The VM account is a local test account that exists only inside the VM.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\vm\dex-vm.ps1 create -Iso "$env:USERPROFILE\Downloads\Win11_25H2_English_x64.iso"
  powershell -ExecutionPolicy Bypass -File scripts\vm\dex-vm.ps1 test -Setup "src-tauri\target\release\bundle\nsis\DEX_7.0.1_x64-setup.exe"
#>
param(
  [Parameter(Mandatory, Position = 0)][ValidateSet('create', 'test', 'status', 'remove')][string]$Action,
  [string]$Iso,
  [string]$Setup,
  [string]$OldSetup,
  [string]$Name = 'dex-test-win11',
  [int]$MemoryMB = 4096,
  [int]$Cpus = 2,
  [int]$DiskGB = 64
)
$ErrorActionPreference = 'Stop'
$VB = Join-Path $env:ProgramFiles 'Oracle\VirtualBox\VBoxManage.exe'
if (-not (Test-Path $VB)) { throw "VirtualBox not found at $VB" }

# Test account inside the VM only (never a real password).
$GuestUser = 'dextest'
$GuestPass = 'dex-vm-test-only'

function VB { & $VB @args; if ($LASTEXITCODE -ne 0) { throw "VBoxManage $($args -join ' ') failed ($LASTEXITCODE)" } }
function VBq { & $VB @args 2>$null }
function Log($m) { Write-Host "[dex-vm $(Get-Date -Format HH:mm:ss)] $m" }

function Wait-Guest([int]$timeoutMin = 90) {
  Log "Waiting for Windows and Guest Additions (up to $timeoutMin min)..."
  $deadline = (Get-Date).AddMinutes($timeoutMin)
  while ((Get-Date) -lt $deadline) {
    $ga = VBq guestproperty get $Name '/VirtualBox/GuestAdd/Version'
    $users = VBq guestproperty get $Name '/VirtualBox/GuestInfo/OS/LoggedInUsers'
    if ($ga -match 'Value' -and $users -match 'Value: [1-9]') {
      # Guest control can lag the properties by a few seconds.
      for ($i = 0; $i -lt 30; $i++) {
        & $VB guestcontrol $Name --username $GuestUser --password $GuestPass run --exe 'C:\Windows\System32\cmd.exe' -- cmd /c ver 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { Log 'Guest is ready.'; return }
        Start-Sleep 5
      }
    }
    Start-Sleep 15
  }
  throw 'Timed out waiting for the guest.'
}

function GuestRun([string]$exe, [string[]]$argv, [int]$timeoutSec = 600) {
  $out = & $VB guestcontrol $Name --username $GuestUser --password $GuestPass run --timeout ($timeoutSec * 1000) --exe $exe -- @argv 2>&1
  [pscustomobject]@{ code = $LASTEXITCODE; out = ($out -join "`n") }
}
function GuestPs([string]$script, [int]$timeoutSec = 600) {
  $enc = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($script))
  GuestRun 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' @('powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', $enc) $timeoutSec
}
function CopyIn([string]$file) {
  VB guestcontrol $Name --username $GuestUser --password $GuestPass copyto --target-directory 'C:\Users\Public\' (Resolve-Path $file).Path
  'C:\Users\Public\' + (Split-Path $file -Leaf)
}

# Inspects the guest after an install step. Returns a hashtable of facts.
$InspectScript = @'
$r = [ordered]@{}
$key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\DEX'
$r.uninstallKey = Test-Path $key
if ($r.uninstallKey) { $p = Get-ItemProperty $key; $r.displayVersion = $p.DisplayVersion; $r.installLocation = $p.InstallLocation; $r.uninstallString = $p.UninstallString }
$r.exe = Test-Path "$env:LOCALAPPDATA\DEX\dex-tauri.exe"
$r.startMenu = @(Get-ChildItem "$env:APPDATA\Microsoft\Windows\Start Menu\Programs" -Recurse -Filter 'DEX*.lnk' -ErrorAction SilentlyContinue).Count
$r.dataDir = Test-Path "$env:LOCALAPPDATA\com.onazioj.dex"
$r.webview2 = [bool](Get-ItemProperty 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}' -ErrorAction SilentlyContinue)
$r | ConvertTo-Json -Compress
'@

$LaunchScript = @'
$exe = "$env:LOCALAPPDATA\DEX\dex-tauri.exe"
$p = Start-Process $exe -PassThru
Start-Sleep 25
$alive = -not $p.HasExited
$log = Get-ChildItem "$env:LOCALAPPDATA\com.onazioj.dex" -Recurse -Filter 'startup.log' -ErrorAction SilentlyContinue | Select-Object -First 1
$tail = if ($log) { (Get-Content $log.FullName -Tail 8) -join ' | ' } else { '' }
$kids = @(Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" | Where-Object { $_.CommandLine -match 'com.onazioj.dex|DEX' }).Count
if ($alive) { Stop-Process -Id $p.Id -Force }
[ordered]@{ alive25s = $alive; exitCode = $(if ($p.HasExited) { $p.ExitCode } else { $null }); webviewProcesses = $kids; startupLog = $tail } | ConvertTo-Json -Compress
'@

switch ($Action) {
  'status' {
    VBq showvminfo $Name --machinereadable | Select-String '^(name|VMState|memory|cpus)='
    VBq snapshot $Name list
  }

  'create' {
    if (-not $Iso -or -not (Test-Path $Iso)) { throw 'Pass -Iso <path to a Windows 11 x64 ISO>.' }
    if (VBq showvminfo $Name) { throw "A VM named $Name already exists (use 'remove' first)." }
    Log 'Images in this ISO:'
    $detect = & $VB unattended detect --iso $Iso 2>&1
    $detect | Select-String 'Image' | ForEach-Object { Write-Host "  $_" }
    # Prefer Pro, then Home.
    $index = 1
    $m = $detect | Select-String "ImageIndex.?=.?(\d+).*Pro\b" | Select-Object -First 1
    if (-not $m) { $m = [regex]::Matches(($detect -join "`n"), 'Image #?(\d+)[^\n]*Windows 11 Pro\b') | Select-Object -First 1 }
    if ($m) { $index = [int]($m.Matches[0].Groups[1].Value) }
    Log "Using image index $index"

    $vmDir = Join-Path $env:USERPROFILE "VirtualBox VMs\$Name"
    VB createvm --name $Name --ostype Windows11_64 --register
    VB modifyvm $Name --memory $MemoryMB --cpus $Cpus --firmware efi --tpm-type 2.0 --graphicscontroller vboxsvga --vram 128 --nic1 nat --audio-enabled off --clipboard-mode disabled --drag-and-drop disabled
    VB storagectl $Name --name SATA --add sata --controller IntelAhci --portcount 2
    $vdi = Join-Path $vmDir "$Name.vdi"
    VB createmedium disk --filename $vdi --size ($DiskGB * 1024) --format VDI
    VB storageattach $Name --storagectl SATA --port 0 --device 0 --type hdd --medium $vdi
    VB unattended install $Name --iso $Iso --image-index $index --user $GuestUser --password $GuestPass --full-user-name 'DEX Test' --install-additions --locale en_US --country US --time-zone UTC --hostname dex-test --post-install-command 'cmd /c reg add HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System /v EnableLUA /t REG_DWORD /d 0 /f'
    VB startvm $Name --type headless
    Log 'Installing Windows (no input needed). Open VirtualBox to watch if you like.'
    Wait-Guest 120
    Start-Sleep 60   # let first-logon tasks settle
    VB controlvm $Name acpipowerbutton
    for ($i = 0; $i -lt 60 -and ((VBq showvminfo $Name --machinereadable) -match 'VMState="running"'); $i++) { Start-Sleep 5 }
    VB snapshot $Name take clean --description 'Fresh Windows 11 + Guest Additions, nothing installed'
    Log "Done. Snapshot 'clean' is ready; run: dex-vm.ps1 test -Setup <setup.exe>"
  }

  'test' {
    if (-not $Setup -or -not (Test-Path $Setup)) { throw 'Pass -Setup <DEX setup.exe>.' }
    $outDir = Join-Path $PSScriptRoot ("out\" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
    New-Item -ItemType Directory -Force $outDir | Out-Null
    $report = [ordered]@{ setup = (Split-Path $Setup -Leaf); sha256 = (Get-FileHash $Setup).Hash; steps = @() }
    function Step($name, $ok, $detail) {
      $script:report.steps += [ordered]@{ step = $name; ok = [bool]$ok; detail = $detail }
      Log ("{0} {1}: {2}" -f ($(if ($ok) { 'PASS' } else { 'FAIL' })), $name, $detail)
    }
    function Reset-Clean {
      if ((VBq showvminfo $Name --machinereadable) -match 'VMState="running"') { VB controlvm $Name poweroff; Start-Sleep 3 }
      VB snapshot $Name restore clean
      VB startvm $Name --type headless
      Wait-Guest 20
    }

    # 1. Fresh install -> launch -> uninstall -> reinstall.
    Reset-Clean
    $g = CopyIn $Setup
    $r = GuestRun $g @((Split-Path $g -Leaf), '/S') 900
    $i = (GuestPs $InspectScript).out | ConvertFrom-Json
    Step 'fresh install' ($r.code -eq 0 -and $i.uninstallKey -and $i.exe) ("exit $($r.code); version $($i.displayVersion); start menu links $($i.startMenu); WebView2 $($i.webview2)")
    $l = (GuestPs $LaunchScript 120).out | ConvertFrom-Json
    Step 'first launch' ($l.alive25s -and $l.webviewProcesses -gt 0) ("running after 25 s: $($l.alive25s); WebView2 processes $($l.webviewProcesses); log: $($l.startupLog)")
    GuestPs "`$s=(Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\DEX').UninstallString.Trim('`"'); Start-Process -Wait `$s '/S'; Start-Sleep 5" 300 | Out-Null
    $i2 = (GuestPs $InspectScript).out | ConvertFrom-Json
    Step 'uninstall' (-not $i2.uninstallKey -and -not $i2.exe) ("key left: $($i2.uninstallKey); exe left: $($i2.exe); start menu links $($i2.startMenu); user data kept: $($i2.dataDir)")
    $r = GuestRun $g @((Split-Path $g -Leaf), '/S') 900
    $i3 = (GuestPs $InspectScript).out | ConvertFrom-Json
    $l3 = (GuestPs $LaunchScript 120).out | ConvertFrom-Json
    Step 'reinstall' ($r.code -eq 0 -and $i3.exe -and $l3.alive25s) ("exit $($r.code); launches: $($l3.alive25s)")

    # 2. Upgrade over the previous version, keeping data.
    if ($OldSetup) {
      Reset-Clean
      $go = CopyIn $OldSetup
      $r = GuestRun $go @((Split-Path $go -Leaf), '/S') 900
      $io = (GuestPs $InspectScript).out | ConvertFrom-Json
      $lo = (GuestPs $LaunchScript 120).out | ConvertFrom-Json
      Step 'old version install' ($r.code -eq 0 -and $io.exe) ("version $($io.displayVersion); launches: $($lo.alive25s)")
      GuestPs "New-Item -ItemType Directory -Force `"`$env:LOCALAPPDATA\com.onazioj.dex`" | Out-Null; Set-Content `"`$env:LOCALAPPDATA\com.onazioj.dex\upgrade-marker.txt`" 'kept'" | Out-Null
      $g = CopyIn $Setup
      $r = GuestRun $g @((Split-Path $g -Leaf), '/S') 900
      $iu = (GuestPs $InspectScript).out | ConvertFrom-Json
      $marker = (GuestPs "Test-Path `"`$env:LOCALAPPDATA\com.onazioj.dex\upgrade-marker.txt`"").out.Trim()
      $lu = (GuestPs $LaunchScript 120).out | ConvertFrom-Json
      $entries = (GuestPs "@(Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall' | Where-Object { (Get-ItemProperty `$_.PSPath).DisplayName -match '^DEX' }).Count").out.Trim()
      Step 'upgrade' ($r.code -eq 0 -and $iu.exe -and $marker -eq 'True' -and $lu.alive25s -and $entries -eq '1') ("now $($iu.displayVersion); data kept: $marker; uninstall entries: $entries; launches: $($lu.alive25s)")
    }

    VB controlvm $Name poweroff
    $report.passed = -not ($report.steps | Where-Object { -not $_.ok })
    $report | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $outDir 'report.json')
    Log "Report: $(Join-Path $outDir 'report.json')  passed=$($report.passed)"
    if (-not $report.passed) { exit 1 }
  }

  'remove' {
    $ans = Read-Host "Delete VM '$Name' and its disk? Type yes"
    if ($ans -eq 'yes') { VB unregistervm $Name --delete; Log 'Removed.' }
  }
}

// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//! macOS / Linux commands in DEX's PowerShell sessions.
//!
//! People coming from a Mac or Linux type `ls -la`, `touch notes.md`, `open .`,
//! `which git`, `grep -i todo *.md`, `rm -rf build`, `export KEY=1`. Windows
//! PowerShell either has no such command or rejects the flags. Every DEX
//! PowerShell session starts with this small layer, silently (no banner):
//! a command is only defined when the user's own setup does not already
//! provide it, and nothing here runs anything on its own.
//!
//! It is passed with `-NoExit -EncodedCommand` (UTF-16LE base64), so quoting
//! never breaks and the user's profile still loads.

use base64::Engine;

/// The PowerShell source of the layer.
pub const POWERSHELL_COMPAT: &str = r#"
# Built-in ls/rm/cp aliases outrank functions and are AllScope, so they are
# removed here at global scope (inside a script block they would come back).
foreach ($__a in 'ls','rm','cp') { if (Test-Path "Alias:$__a") { Remove-Item "Alias:$__a" -Force -ErrorAction SilentlyContinue } }
Remove-Variable __a -ErrorAction SilentlyContinue
& {
  $defs = @{
    'touch'   = { param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Paths) foreach ($p in $Paths) { if (Test-Path -LiteralPath $p) { (Get-Item -LiteralPath $p).LastWriteTime = Get-Date } else { New-Item -ItemType File -Path $p | Out-Null } } }
    'open'    = { param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Targets) if (-not $Targets) { $Targets = @('.') }; foreach ($t in $Targets) { if ($t -match '^[a-z]+://') { Start-Process $t } else { Invoke-Item -LiteralPath $t } } }
    'which'   = { param([Parameter(Mandatory=$true)][string]$Name) $c = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1; if (-not $c) { Write-Error "$Name not found"; return }; if ($c.Source) { $c.Source } else { $c.Definition } }
    'grep'    = { param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Rest)
                  $i = $false; $r = $false; $v = $false; $n = $false; $args2 = @()
                  foreach ($a in $Rest) { if ($a -match '^-[a-zA-Z]+$') { if ($a -match 'i') { $i = $true }; if ($a -match 'r|R') { $r = $true }; if ($a -match 'v') { $v = $true }; if ($a -match 'n') { $n = $true } } else { $args2 += $a } }
                  if (-not $args2) { Write-Error 'usage: grep [-i -r -v -n] PATTERN [FILE...]'; return }
                  $pat = $args2[0]; $files = @($args2 | Select-Object -Skip 1)
                  $p = @{ Pattern = $pat; CaseSensitive = (-not $i); NotMatch = $v }
                  if ($files.Count -eq 0 -and $MyInvocation.ExpectingInput) { $input | Out-String -Stream | Select-String @p | ForEach-Object { $_.Line } ; return }
                  if ($files.Count -eq 0) { $files = @('.') ; $r = $true }
                  $items = if ($r) { Get-ChildItem -Path $files -Recurse -File -ErrorAction SilentlyContinue } else { Get-Item -Path $files -ErrorAction SilentlyContinue }
                  $items | Select-String @p | ForEach-Object { if ($n) { '{0}:{1}:{2}' -f $_.Path, $_.LineNumber, $_.Line } else { '{0}:{1}' -f $_.Path, $_.Line } } }
    'head'    = { param([Alias('n')][int]$Lines = 10, [Parameter(ValueFromRemainingArguments=$true)][string[]]$Paths) if ($Paths) { Get-Content -Path $Paths -TotalCount $Lines } else { $input | Select-Object -First $Lines } }
    'tail'    = { param([Alias('n')][int]$Lines = 10, [switch]$f, [Parameter(ValueFromRemainingArguments=$true)][string[]]$Paths) if ($Paths) { if ($f) { Get-Content -Path $Paths -Tail $Lines -Wait } else { Get-Content -Path $Paths -Tail $Lines } } else { $input | Select-Object -Last $Lines } }
    'pbcopy'  = { $input | Out-String | Set-Clipboard }
    'pbpaste' = { Get-Clipboard }
    'll'      = { param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Paths) Get-ChildItem -Force @Paths }
    'la'      = { param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Paths) Get-ChildItem -Force @Paths }
    'export'  = { param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Pairs) foreach ($kv in $Pairs) { $k, $v = $kv -split '=', 2; Set-Item -Path "Env:$k" -Value $v } }
    'uname'   = { param([switch]$a) if ($a) { "Windows $([Environment]::OSVersion.Version) $env:PROCESSOR_ARCHITECTURE $env:COMPUTERNAME" } else { 'Windows' } }
    'df'      = { Get-PSDrive -PSProvider FileSystem | Select-Object Name, @{n='Used(GB)';e={[math]::Round($_.Used/1GB,1)}}, @{n='Free(GB)';e={[math]::Round($_.Free/1GB,1)}}, Root }
    'ifconfig'= { ipconfig @args }
    'top'     = { Get-Process | Sort-Object CPU -Descending | Select-Object -First 20 Id, ProcessName, CPU, @{n='MB';e={[math]::Round($_.WorkingSet64/1MB)}} }
    'nproc'   = { [Environment]::ProcessorCount }
  }
  foreach ($k in $defs.Keys) {
    if (-not (Get-Command $k -CommandType Function,Application,Cmdlet -ErrorAction SilentlyContinue)) {
      Set-Item -Path "Function:global:$k" -Value $defs[$k]
    }
  }
  # ls/rm/cp/mkdir: keep PowerShell's commands, but accept the Unix flags.
  function global:__dex_unix_flags([string[]]$a) {
    $out = @{ rest = @(); r = $false; f = $false; all = $false; p = $false }
    foreach ($x in $a) { if ($x -match '^-[a-zA-Z]+$' -and $x -notmatch '^-(Recurse|Force|Path|Filter|Include|Exclude|Name|Directory|File|Hidden)$') { if ($x -match 'r|R') { $out.r = $true }; if ($x -match 'f') { $out.f = $true }; if ($x -match 'a') { $out.all = $true }; if ($x -match 'p') { $out.p = $true } } else { $out.rest += $x } }
    $out
  }
  function global:ls { $o = __dex_unix_flags $args; Get-ChildItem -Force:$o.all @($o.rest) }
  function global:rm { $o = __dex_unix_flags $args; if (-not $o.rest) { Write-Error 'usage: rm [-r] [-f] PATH...'; return }; Remove-Item -Path $o.rest -Recurse:$o.r -Force:$o.f }
  function global:cp { $o = __dex_unix_flags $args; if ($o.rest.Count -lt 2) { Write-Error 'usage: cp [-r] SOURCE... DEST'; return }; Copy-Item -Path ($o.rest | Select-Object -SkipLast 1) -Destination ($o.rest | Select-Object -Last 1) -Recurse:$o.r -Force:$o.f }
  function global:mkdir { $o = __dex_unix_flags $args; foreach ($d in $o.rest) { New-Item -ItemType Directory -Force -Path $d | Out-Null } }
}
"#;

/// `-EncodedCommand` payload: UTF-16LE, base64.
pub fn encoded_powershell_compat() -> String {
    let bytes: Vec<u8> = POWERSHELL_COMPAT.encode_utf16().flat_map(|u| u.to_le_bytes()).collect();
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

/// PowerShell arguments for an interactive DEX session with the layer loaded.
pub fn powershell_args() -> Vec<String> {
    vec!["-NoLogo".into(), "-NoExit".into(), "-EncodedCommand".into(), encoded_powershell_compat()]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encodes_as_utf16le_base64() {
        let enc = encoded_powershell_compat();
        let raw = base64::engine::general_purpose::STANDARD.decode(enc).unwrap();
        let units: Vec<u16> = raw.chunks(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
        assert_eq!(String::from_utf16(&units).unwrap(), POWERSHELL_COMPAT);
        assert_eq!(powershell_args()[..3], ["-NoLogo", "-NoExit", "-EncodedCommand"]);
    }

    /// Run the layer in a real Windows PowerShell and use the commands.
    #[cfg(windows)]
    #[test]
    fn unix_commands_work_in_windows_powershell() {
        let dir = std::env::temp_dir().join(format!("dex-compat-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let d = dir.to_string_lossy().replace('\'', "''");
        let script = format!(
            "{POWERSHELL_COMPAT}\nSet-Location -LiteralPath '{d}'\nmkdir -p a/b\ntouch a/b/x.txt\nSet-Content a/b/x.txt 'hello TODO'\n\
             'GREP=' + ((grep -i todo a/b/x.txt) -join ',')\n'WHICH=' + [bool](which powershell)\n'HEAD=' + ((Get-Content a/b/x.txt | head -n 1))\n\
             'LS=' + ((ls -la | Select-Object -ExpandProperty Name) -join ',')\nrm -rf a\n'GONE=' + (-not (Test-Path a))\n"
        );
        let enc = {
            let bytes: Vec<u8> = script.encode_utf16().flat_map(|u| u.to_le_bytes()).collect();
            base64::engine::general_purpose::STANDARD.encode(bytes)
        };
        let out = std::process::Command::new("powershell.exe")
            .args(["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", &enc])
            .output()
            .expect("powershell runs");
        let text = String::from_utf8_lossy(&out.stdout).to_string();
        let err = String::from_utf8_lossy(&out.stderr).to_string();
        let _ = std::fs::remove_dir_all(&dir);
        assert!(text.contains("GREP=") && text.contains("hello TODO"), "stdout: {text}\nstderr: {err}");
        assert!(text.contains("WHICH=True"), "stdout: {text}\nstderr: {err}");
        assert!(text.contains("HEAD=hello TODO"), "stdout: {text}\nstderr: {err}");
        assert!(text.contains("LS=a"), "stdout: {text}\nstderr: {err}");
        assert!(text.contains("GONE=True"), "stdout: {text}\nstderr: {err}");
    }
}

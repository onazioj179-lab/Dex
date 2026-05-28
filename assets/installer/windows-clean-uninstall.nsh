; ============================================================================
; DEX Windows Installer — Custom NSIS Hooks
; Handles: stale startup entries, forced process kill on upgrade, data cleanup
; ============================================================================

!macro customInstall
  ; Remove all legacy auto-start variants from before v4
  DetailPrint "Clearing stale DEX startup registrations..."
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "DEX"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Dex"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "dex"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.onazioj.dex"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.dex.app"
  Delete "$SMSTARTUP\DEX.lnk"
  Delete "$SMSTARTUP\Dex.lnk"
  Delete "$SMSTARTUP\dex.lnk"

  ; If a prior version is running during upgrade, shut it down gracefully
  DetailPrint "Stopping any running DEX instance..."
  nsExec::ExecToLog 'taskkill /IM "DEX.exe" /F'
  nsExec::ExecToLog 'taskkill /IM "Dex.exe" /F'
  Sleep 800

  ; Write install timestamp for update tracking
  WriteRegStr HKCU "Software\Onazi\DEX" "InstalledAt" "$%DATE% $%TIME%"
  WriteRegStr HKCU "Software\Onazi\DEX" "InstalledVersion" "${VERSION}"
!macroend

!macro customUnInstall
  DetailPrint "Stopping DEX before uninstall..."
  ; Ask app to clean up first, then force-kill
  nsExec::ExecToLog '"$INSTDIR\DEX.exe" --cleanup-before-uninstall'
  Sleep 1500
  nsExec::ExecToLog 'taskkill /F /IM "DEX.exe"'
  nsExec::ExecToLog 'taskkill /F /IM "Dex.exe"'
  nsExec::ExecToLog 'taskkill /F /IM "dex.exe"'

  DetailPrint "Removing DEX startup registrations..."
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "DEX"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Dex"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "dex"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.onazioj.dex"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.dex.app"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "DEX"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "Dex"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "dex"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "com.onazioj.dex"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "com.dex.app"
  Delete "$SMSTARTUP\DEX.lnk"
  Delete "$SMSTARTUP\Dex.lnk"
  Delete "$SMSTARTUP\dex.lnk"

  DetailPrint "Removing DEX install registry entries..."
  DeleteRegKey HKCU "Software\Onazi\DEX"

  DetailPrint "Removing DEX app data and caches..."
  RMDir /r "$APPDATA\DEX"
  RMDir /r "$APPDATA\Dex"
  RMDir /r "$APPDATA\dex"
  RMDir /r "$LOCALAPPDATA\DEX"
  RMDir /r "$LOCALAPPDATA\Dex"
  RMDir /r "$LOCALAPPDATA\dex"
  ; Remove update cache
  RMDir /r "$TEMP\dex-cache"
!macroend

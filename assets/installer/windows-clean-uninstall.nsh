!macro customInstall
  DetailPrint "Clearing stale DEX startup registrations..."
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "DEX"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Dex"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "dex"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.onazioj.dex"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.dex.app"
  Delete "$SMSTARTUP\DEX.lnk"
  Delete "$SMSTARTUP\Dex.lnk"
  Delete "$SMSTARTUP\dex.lnk"
!macroend

!macro customUnInstall
  DetailPrint "Stopping DEX before uninstall..."
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
  DetailPrint "Removing DEX app data and caches..."
  RMDir /r "$APPDATA\DEX"
  RMDir /r "$APPDATA\Dex"
  RMDir /r "$APPDATA\dex"
  RMDir /r "$LOCALAPPDATA\DEX"
  RMDir /r "$LOCALAPPDATA\Dex"
  RMDir /r "$LOCALAPPDATA\dex"
!macroend
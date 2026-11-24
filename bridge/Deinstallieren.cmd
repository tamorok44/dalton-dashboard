@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall-windows.ps1"
if errorlevel 1 (
  echo.
  echo Deinstallation fehlgeschlagen.
  pause
)

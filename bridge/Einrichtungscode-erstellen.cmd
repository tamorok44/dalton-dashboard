@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0create-enroll-windows.ps1"
if errorlevel 1 (
  echo.
  echo Einrichtungscode konnte nicht erstellt werden.
  pause
)

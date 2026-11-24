$ErrorActionPreference = "Stop"

$targetDir = Join-Path $env:LOCALAPPDATA "DaltonDashboardBridge"
$target = Join-Path $targetDir "DaltonDashboardBridge.exe"
$startup = [Environment]::GetFolderPath("Startup")
$startupLink = Join-Path $startup "Dalton Dashboard Bridge.lnk"
$programs = [Environment]::GetFolderPath("Programs")
$uninstallLink = Join-Path $programs "Dalton Dashboard Bridge deinstallieren.lnk"
$enrollLink = Join-Path $programs "Dalton Dashboard Einrichtungscode erstellen.lnk"

Write-Host "Dalton Dashboard Bridge deinstallieren"
Write-Host ""

if (Test-Path $target) {
  Write-Host "Gerätezugang wird widerrufen ..."
  & $target --revoke-device
  if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Deinstallation abgebrochen: Der Gerätezugang konnte nicht sicher widerrufen werden."
    Write-Host "Bitte Internetverbindung prüfen und erneut versuchen."
    Read-Host "Enter zum Schließen"
    exit 1
  }
}

Get-Process "DaltonDashboardBridge" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Remove-Item $startupLink -Force -ErrorAction SilentlyContinue
Remove-Item $uninstallLink -Force -ErrorAction SilentlyContinue
Remove-Item $enrollLink -Force -ErrorAction SilentlyContinue

if (Test-Path $targetDir) {
  Remove-Item $targetDir -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "Dalton Dashboard Bridge wurde vollständig entfernt."
Write-Host "Das WoW-AddOn selbst wurde nicht verändert."
Read-Host "Enter zum Schließen"

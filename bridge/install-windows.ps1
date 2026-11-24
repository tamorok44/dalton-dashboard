param(
  [string]$Code
)

$ErrorActionPreference = "Stop"
$source = Join-Path $PSScriptRoot "DaltonDashboardBridge.exe"
if (-not (Test-Path $source)) { throw "DaltonDashboardBridge.exe fehlt im Installationspaket." }

if ([string]::IsNullOrWhiteSpace($Code)) {
  $Code = Read-Host "Einrichtungscode"
}
if ([string]::IsNullOrWhiteSpace($Code)) { throw "Kein Einrichtungscode angegeben." }

$targetDir = Join-Path $env:LOCALAPPDATA "DaltonDashboardBridge"
$target = Join-Path $targetDir "DaltonDashboardBridge.exe"
New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
Copy-Item $source $target -Force

& $target --enroll $Code
if ($LASTEXITCODE -ne 0) { throw "Die Bridge konnte nicht gekoppelt werden." }

$startup = [Environment]::GetFolderPath("Startup")
$linkPath = Join-Path $startup "Dalton Dashboard Bridge.lnk"
$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut($linkPath)
$link.TargetPath = $target
$link.Arguments = "--watch"
$link.WorkingDirectory = $targetDir
$link.WindowStyle = 7
$link.Description = "Dalton Dashboard Bridge"
$link.Save()

Get-Process "DaltonDashboardBridge" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Process -FilePath $target -ArgumentList "--watch" -WindowStyle Hidden

Write-Host ""
Write-Host "Dalton Dashboard Bridge ist eingerichtet."
Write-Host "Sie startet künftig automatisch und läuft ohne sichtbares Fenster."
Write-Host "Dieses Installationsfenster kann geschlossen werden."

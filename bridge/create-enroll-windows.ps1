$ErrorActionPreference = "Stop"

$targetDir = Join-Path $env:LOCALAPPDATA "DaltonDashboardBridge"
$target = Join-Path $targetDir "DaltonDashboardBridge.exe"
$configFile = Join-Path $targetDir "config.json"

if (-not (Test-Path $target) -or -not (Test-Path $configFile)) {
  Write-Host "Die Dalton Dashboard Bridge ist nicht eingerichtet."
  Read-Host "Enter zum Schließen"
  exit 1
}
$config = Get-Content $configFile -Raw | ConvertFrom-Json
if ($config.characterSlug -ne "cole-dalton") {
  Write-Host "Einrichtungscodes können nur auf Coles Hub-Rechner erzeugt werden."
  Read-Host "Enter zum Schließen"
  exit 1
}

Write-Host "Einrichtungscode erstellen"
Write-Host ""
Write-Host "1) Chucky Dalton"
Write-Host "2) Dolly Dalton"
Write-Host "3) Viola Dalton"
$choice = Read-Host "Auswahl"

switch ($choice) {
  "1" { $slug = "chucky-dalton" }
  "2" { $slug = "dolly-dalton" }
  "3" { $slug = "viola-dalton" }
  default {
    Write-Host "Ungültige Auswahl."
    Read-Host "Enter zum Schließen"
    exit 1
  }
}

$output = & $target --create-enroll $slug 2>&1
if ($LASTEXITCODE -ne 0) {
  $output | ForEach-Object { Write-Host $_ }
  Read-Host "Enter zum Schließen"
  exit 1
}
$code = $output | Where-Object { $_ -match '^dalton-' } | Select-Object -Last 1
if ([string]::IsNullOrWhiteSpace($code)) {
  $output | ForEach-Object { Write-Host $_ }
  throw "Es konnte kein Einrichtungscode gelesen werden."
}

Set-Clipboard -Value $code
Write-Host ""
$output | ForEach-Object { Write-Host $_ }
Write-Host ""
Write-Host "Der Einrichtungscode wurde in die Zwischenablage kopiert."
Write-Host "Er ist 24 Stunden gültig und kann genau einmal verwendet werden."
Read-Host "Enter zum Schließen"

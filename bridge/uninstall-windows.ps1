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

$lock = "$targetDir.mutation.lock"
$owner = [Guid]::NewGuid().ToString("N")
$marker = Join-Path $lock "owner"
New-Item -ItemType Directory -Path $lock -ErrorAction Stop | Out-Null
try {
  Set-Content -LiteralPath $marker -Value $owner -Encoding Ascii
  if (Test-Path -LiteralPath $target) {
    Write-Host "Gerätezugang wird widerrufen ..."
    try {
      $env:DALTON_BRIDGE_INSTALL_LOCK = $owner
      & $target --revoke-device
      if ($LASTEXITCODE -ne 0) { throw "Deinstallation abgebrochen: Der Gerätezugang konnte nicht sicher widerrufen werden." }
    } finally {
      Remove-Item Env:DALTON_BRIDGE_INSTALL_LOCK -ErrorAction SilentlyContinue
    }
  } elseif (Test-Path -LiteralPath (Join-Path $targetDir "config.json")) {
    throw "Bridge-Datei fehlt. Die Kopplung bleibt bis zum bestätigten Widerruf erhalten."
  }

  foreach ($link in @($startupLink, $uninstallLink, $enrollLink)) {
    if (Test-Path -LiteralPath $link) { Remove-Item -LiteralPath $link -Force }
  }
  Get-Process "DaltonDashboardBridge" -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -eq $target } |
    ForEach-Object { Stop-Process -InputObject $_ -Force; Wait-Process -InputObject $_ -Timeout 10 }
  if (Test-Path -LiteralPath $targetDir) {
    Remove-Item -LiteralPath $targetDir -Recurse -Force
  }
} finally {
  if (Test-Path -LiteralPath $marker) { Remove-Item -LiteralPath $marker -Force }
  Remove-Item -LiteralPath $lock
}

Write-Host ""
Write-Host "Dalton Dashboard Bridge wurde vollständig entfernt."
Write-Host "Das WoW-AddOn selbst wurde nicht verändert."
Read-Host "Enter zum Schließen"

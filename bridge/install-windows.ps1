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
$uninstallSource = Join-Path $PSScriptRoot "uninstall-windows.ps1"
$uninstallTarget = Join-Path $targetDir "uninstall-windows.ps1"
$enrollHelperSource = Join-Path $PSScriptRoot "create-enroll-windows.ps1"
$enrollHelperTarget = Join-Path $targetDir "create-enroll-windows.ps1"
$lock = "$targetDir.mutation.lock"
$owner = [Guid]::NewGuid().ToString("N")
$marker = Join-Path $lock "owner"
$staged = Join-Path $targetDir (".bridge-install-" + $owner + ".exe")
New-Item -ItemType Directory -Path $lock -ErrorAction Stop | Out-Null
try {
  Set-Content -LiteralPath $marker -Value $owner -Encoding Ascii
  New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
  Copy-Item -LiteralPath $source -Destination $staged
  try {
    $env:DALTON_BRIDGE_INSTALL_LOCK = $owner
    & $staged --enroll $Code
    if ($LASTEXITCODE -ne 0) { throw "Die Bridge konnte nicht gekoppelt werden." }
  } finally {
    Remove-Item Env:DALTON_BRIDGE_INSTALL_LOCK -ErrorAction SilentlyContinue
  }
  Get-Process "DaltonDashboardBridge" -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -eq $target } |
    ForEach-Object { Stop-Process -InputObject $_ -Force; Wait-Process -InputObject $_ -Timeout 10 }
  if (Test-Path -LiteralPath $target) {
    [IO.File]::Replace($staged, $target, $null)
  } else {
    [IO.File]::Move($staged, $target)
  }
  if (Test-Path $uninstallSource) { Copy-Item $uninstallSource $uninstallTarget -Force }
  if (Test-Path $enrollHelperSource) { Copy-Item $enrollHelperSource $enrollHelperTarget -Force }

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

  $programs = [Environment]::GetFolderPath("Programs")
  if (Test-Path $uninstallTarget) {
    $uninstallLinkPath = Join-Path $programs "Dalton Dashboard Bridge deinstallieren.lnk"
    $uninstallLink = $shell.CreateShortcut($uninstallLinkPath)
    $uninstallLink.TargetPath = "powershell.exe"
    $uninstallLink.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $uninstallTarget + '"'
    $uninstallLink.WorkingDirectory = $targetDir
    $uninstallLink.WindowStyle = 1
    $uninstallLink.Description = "Dalton Dashboard Bridge vollständig deinstallieren"
    $uninstallLink.Save()
  }

  $configFile = Join-Path $targetDir "config.json"
  $enrollLinkPath = Join-Path $programs "Dalton Dashboard Einrichtungscode erstellen.lnk"
  if ((Test-Path $enrollHelperTarget) -and (Test-Path $configFile)) {
    $config = Get-Content $configFile -Raw | ConvertFrom-Json
    if ($config.characterSlug -eq "cole-dalton") {
      $enrollLink = $shell.CreateShortcut($enrollLinkPath)
      $enrollLink.TargetPath = "powershell.exe"
      $enrollLink.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $enrollHelperTarget + '"'
      $enrollLink.WorkingDirectory = $targetDir
      $enrollLink.WindowStyle = 1
      $enrollLink.Description = "Einmaligen Dalton-Bridge-Einrichtungscode erstellen"
      $enrollLink.Save()
    } else {
      Remove-Item $enrollLinkPath -Force -ErrorAction SilentlyContinue
    }
  }

  Start-Process -FilePath $target -ArgumentList "--watch" -WindowStyle Hidden

  Write-Host ""
  Write-Host "Dalton Dashboard Bridge ist eingerichtet."
  Write-Host "Sie startet künftig automatisch und läuft ohne sichtbares Fenster."
  Write-Host "Dieses Installationsfenster kann geschlossen werden."
  Write-Host "Deinstallation: Windows-Startmenü -> Dalton Dashboard Bridge deinstallieren"
  if (Test-Path $enrollLinkPath) { Write-Host "Peer-Einrichtung: Windows-Startmenü -> Dalton Dashboard Einrichtungscode erstellen" }
} finally {
  if (Test-Path -LiteralPath $staged) { Remove-Item -LiteralPath $staged -Force }
  if (Test-Path -LiteralPath $marker) { Remove-Item -LiteralPath $marker -Force }
  Remove-Item -LiteralPath $lock
}

#!/bin/zsh
set -eu

TARGET_DIR="$HOME/Library/Application Support/DaltonDashboardBridge"
TARGET="$TARGET_DIR/DaltonDashboardBridge"
PLIST="$HOME/Library/LaunchAgents/de.dalton.dashboard.bridge.plist"
INSTALLED_UNINSTALL="$HOME/Applications/Dalton Dashboard Bridge deinstallieren.command"
INSTALLED_ENROLL_HELPER="$HOME/Applications/Dalton Dashboard Einrichtungscode erstellen.command"

echo "Dalton Dashboard Bridge deinstallieren"
echo ""

LOCK="$TARGET_DIR.mutation.lock"
mkdir -p "${TARGET_DIR:h}"
if ! (umask 077; mkdir "$LOCK"); then
  echo "Andere Geräteverwaltung aktiv oder unterbrochen."
  exit 1
fi
trap 'rm -f "$LOCK/owner"; rmdir "$LOCK"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
OWNER="$(uuidgen | tr -d '-')"
printf '%s\n' "$OWNER" > "$LOCK/owner"

if [[ ! -x "$TARGET" && ( -e "$TARGET_DIR/config.json" || -e "$TARGET_DIR/pending-enrollment.json" ) ]]; then
  echo "Bridge-Datei fehlt. Die Kopplung bleibt bis zum bestätigten Widerruf erhalten."
  exit 1
fi
if [[ -x "$TARGET" ]]; then
  echo "Gerätezugang wird widerrufen …"
  if ! DALTON_BRIDGE_INSTALL_LOCK="$OWNER" "$TARGET" --revoke-device; then
    echo ""
    echo "Deinstallation abgebrochen: Der Gerätezugang konnte nicht sicher widerrufen werden."
    echo "Bitte Internetverbindung prüfen und erneut versuchen."
    read -r "?Enter zum Schließen …"
    exit 1
  fi
fi

launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
rm -f "$PLIST"
rm -rf "$TARGET_DIR"
rm -f "$INSTALLED_UNINSTALL"
rm -f "$INSTALLED_ENROLL_HELPER"

echo ""
echo "Dalton Dashboard Bridge wurde vollständig entfernt."
echo "Das WoW-AddOn selbst wurde nicht verändert."
read -r "?Enter zum Schließen …" || true

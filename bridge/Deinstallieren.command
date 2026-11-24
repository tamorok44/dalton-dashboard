#!/bin/zsh
set -u

TARGET_DIR="$HOME/Library/Application Support/DaltonDashboardBridge"
TARGET="$TARGET_DIR/DaltonDashboardBridge"
PLIST="$HOME/Library/LaunchAgents/de.dalton.dashboard.bridge.plist"
INSTALLED_UNINSTALL="$HOME/Applications/Dalton Dashboard Bridge deinstallieren.command"

echo "Dalton Dashboard Bridge deinstallieren"
echo ""

if [[ -x "$TARGET" ]]; then
  echo "Gerätezugang wird widerrufen …"
  if ! "$TARGET" --revoke-device; then
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

echo ""
echo "Dalton Dashboard Bridge wurde vollständig entfernt."
echo "Das WoW-AddOn selbst wurde nicht verändert."
read -r "?Enter zum Schließen …"

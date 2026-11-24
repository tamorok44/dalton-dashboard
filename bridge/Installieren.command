#!/bin/zsh
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
ARCH="$(uname -m)"
case "$ARCH" in
  arm64) SOURCE="$DIR/DaltonDashboardBridge-macos-arm64" ;;
  x86_64) SOURCE="$DIR/DaltonDashboardBridge-macos-x64" ;;
  *) echo "Nicht unterstützte Architektur: $ARCH"; exit 1 ;;
esac

if [[ ! -f "$SOURCE" ]]; then
  echo "Bridge-Datei fehlt: $SOURCE"
  exit 1
fi

printf "Einrichtungscode: "
read -r CODE
if [[ -z "$CODE" ]]; then
  echo "Kein Einrichtungscode angegeben."
  exit 1
fi

TARGET_DIR="$HOME/Library/Application Support/DaltonDashboardBridge"
TARGET="$TARGET_DIR/DaltonDashboardBridge"
PLIST="$HOME/Library/LaunchAgents/de.dalton.dashboard.bridge.plist"
UNINSTALL_SOURCE="$DIR/Deinstallieren.command"
UNINSTALL_TARGET="$HOME/Applications/Dalton Dashboard Bridge deinstallieren.command"
mkdir -p "$TARGET_DIR" "$HOME/Library/LaunchAgents" "$HOME/Applications"
cp "$SOURCE" "$TARGET"
chmod 700 "$TARGET"
if [[ -f "$UNINSTALL_SOURCE" ]]; then
  cp "$UNINSTALL_SOURCE" "$UNINSTALL_TARGET"
  chmod 700 "$UNINSTALL_TARGET"
fi
xattr -dr com.apple.quarantine "$TARGET_DIR" >/dev/null 2>&1 || true
xattr -d com.apple.quarantine "$UNINSTALL_TARGET" >/dev/null 2>&1 || true

"$TARGET" --enroll "$CODE"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>de.dalton.dashboard.bridge</string>
  <key>ProgramArguments</key>
  <array>
    <string>$TARGET</string>
    <string>--watch</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>$TARGET_DIR/bridge.log</string>
  <key>StandardErrorPath</key><string>$TARGET_DIR/bridge-error.log</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl kickstart -k "gui/$(id -u)/de.dalton.dashboard.bridge"

echo ""
echo "Dalton Dashboard Bridge ist eingerichtet."
echo "Sie startet künftig automatisch im Hintergrund."
echo "Deinstallation: ~/Applications/Dalton Dashboard Bridge deinstallieren.command"

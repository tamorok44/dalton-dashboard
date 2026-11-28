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

printf "Einrichtungscode (leer lassen, um eine offene Installation fortzusetzen): "
read -r CODE

TARGET_DIR="$HOME/Library/Application Support/DaltonDashboardBridge"
TARGET="$TARGET_DIR/DaltonDashboardBridge"
PLIST="$HOME/Library/LaunchAgents/de.dalton.dashboard.bridge.plist"
UNINSTALL_SOURCE="$DIR/Deinstallieren.command"
UNINSTALL_TARGET="$HOME/Applications/Dalton Dashboard Bridge deinstallieren.command"
ENROLL_HELPER_SOURCE="$DIR/Einrichtungscode-erstellen.command"
ENROLL_HELPER_TARGET="$HOME/Applications/Dalton Dashboard Einrichtungscode erstellen.command"
mkdir -p "${TARGET_DIR:h}" "$HOME/Library/LaunchAgents" "$HOME/Applications"
LOCK="$TARGET_DIR.mutation.lock"
if ! (umask 077; mkdir "$LOCK"); then
  echo "Andere Geräteverwaltung aktiv oder unterbrochen."
  exit 1
fi
STAGED="$TARGET_DIR/.bridge-install"
trap 'rm -f "$STAGED" "$LOCK/owner"; rmdir "$LOCK"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
OWNER="$(uuidgen | tr -d '-')"
printf '%s\n' "$OWNER" > "$LOCK/owner"
mkdir -p "$TARGET_DIR"
cp "$SOURCE" "$STAGED"
chmod 700 "$STAGED"
xattr -d com.apple.quarantine "$STAGED" >/dev/null 2>&1 || true
if [[ -n "$CODE" ]]; then
  DALTON_BRIDGE_INSTALL_LOCK="$OWNER" DALTON_BRIDGE_KEEP_ENROLLMENT=1 "$STAGED" --enroll "$CODE"
else
  DALTON_BRIDGE_INSTALL_LOCK="$OWNER" DALTON_BRIDGE_KEEP_ENROLLMENT=1 "$STAGED" --resume-enrollment
fi
mv -f "$STAGED" "$TARGET"
if [[ -f "$UNINSTALL_SOURCE" ]]; then
  cp "$UNINSTALL_SOURCE" "$UNINSTALL_TARGET"
  chmod 700 "$UNINSTALL_TARGET"
fi
xattr -d com.apple.quarantine "$UNINSTALL_TARGET" >/dev/null 2>&1 || true

if grep -q '"characterSlug": "cole-dalton"' "$TARGET_DIR/config.json" 2>/dev/null && [[ -f "$ENROLL_HELPER_SOURCE" ]]; then
  cp "$ENROLL_HELPER_SOURCE" "$ENROLL_HELPER_TARGET"
  chmod 700 "$ENROLL_HELPER_TARGET"
  xattr -d com.apple.quarantine "$ENROLL_HELPER_TARGET" >/dev/null 2>&1 || true
else
  rm -f "$ENROLL_HELPER_TARGET"
fi

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
DALTON_BRIDGE_INSTALL_LOCK="$OWNER" "$TARGET" --finish-install

echo ""
echo "Dalton Dashboard Bridge ist eingerichtet."
echo "Sie startet künftig automatisch im Hintergrund."
echo "Deinstallation: ~/Applications/Dalton Dashboard Bridge deinstallieren.command"
if [[ -f "$ENROLL_HELPER_TARGET" ]]; then
  echo "Peer-Einrichtung: ~/Applications/Dalton Dashboard Einrichtungscode erstellen.command"
fi

#!/bin/zsh
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
ARCH="$(uname -m)"
case "$ARCH" in
  arm64) BRIDGE="$DIR/DaltonDashboardBridge-macos-arm64" ;;
  x86_64) BRIDGE="$DIR/DaltonDashboardBridge-macos-x64" ;;
  *) echo "Nicht unterstützte Architektur: $ARCH"; read -r "?Enter zum Schließen …"; exit 1 ;;
esac

chmod +x "$BRIDGE" 2>/dev/null || true
xattr -d com.apple.quarantine "$BRIDGE" >/dev/null 2>&1 || true

echo "Dalton Dashboard Bridge · Alpha 11"
echo "Lokaler Test ohne Upload"
echo ""

"$BRIDGE" --dry-run

echo ""
echo "Test abgeschlossen. Es wurden keine Daten ins Internet übertragen."
read -r "?Enter zum Schließen …"

#!/bin/zsh
set -u

TARGET_DIR="$HOME/Library/Application Support/DaltonDashboardBridge"
TARGET="$TARGET_DIR/DaltonDashboardBridge"
CONFIG="$TARGET_DIR/config.json"

if [[ ! -x "$TARGET" || ! -f "$CONFIG" ]]; then
  echo "Die Dalton Dashboard Bridge ist nicht eingerichtet."
  read -r "?Enter zum Schließen …"
  exit 1
fi
if ! grep -q '"characterSlug": "cole-dalton"' "$CONFIG"; then
  echo "Einrichtungscodes können nur auf Coles Hub-Rechner erzeugt werden."
  read -r "?Enter zum Schließen …"
  exit 1
fi

echo "Einrichtungscode erstellen"
echo ""
echo "1) Chucky Dalton"
echo "2) Dolly Dalton"
echo "3) Viola Dalton"
printf "Auswahl: "
read -r CHOICE

case "$CHOICE" in
  1) SLUG="chucky-dalton" ;;
  2) SLUG="dolly-dalton" ;;
  3) SLUG="viola-dalton" ;;
  *) echo "Ungültige Auswahl."; read -r "?Enter zum Schließen …"; exit 1 ;;
esac

if ! OUTPUT="$("$TARGET" --create-enroll "$SLUG" 2>&1)"; then
  echo "$OUTPUT"
  read -r "?Enter zum Schließen …"
  exit 1
fi
CODE="$(printf "%s\n" "$OUTPUT" | grep '^dalton-' | tail -1)"
if [[ -z "$CODE" ]]; then
  echo "$OUTPUT"
  echo "Es konnte kein Einrichtungscode gelesen werden."
  read -r "?Enter zum Schließen …"
  exit 1
fi

printf "%s" "$CODE" | pbcopy
echo ""
echo "$OUTPUT"
echo ""
echo "Der Einrichtungscode wurde in die Zwischenablage kopiert."
echo "Er ist 24 Stunden gültig und kann genau einmal verwendet werden."
read -r "?Enter zum Schließen …"

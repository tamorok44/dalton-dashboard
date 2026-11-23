# Dalton Dashboard Sync

Entwicklungsfassung eines kleinen WoW-Forever-Addons für das Dalton Dashboard.

## Ziel

Das Addon ergänzt gezielt Daten, die das Dashboard nicht zuverlässig über Blizzard oder Armory erhält. Datenerfassung und spätere Nutzung im Dashboard sind bewusst getrennt.

Aktuell werden lokal erfasst:

- Charakteridentität, Klasse, Volk und Level
- vollständiger lesbarer Spieler-Spellbook-Stand inklusive Spell-ID, Name, Rang und SkillLine
- aktueller Standort, Zone, Unterzone, Karten-ID, Koordinaten soweit der Client sie freigibt, Ruhestein-Ort und aktuelle Instanz
- schlanke Standorthistorie: ein neuer Eintrag nur bei tatsächlichem Gebiets-/Untergebiets-/Instanzwechsel, niemals permanentes Positions-Polling
- vollständige Händler- und Lehrerbeobachtungen beim Öffnen/Ändern des jeweiligen Fensters, inklusive NPC, Standort, Angebot, Preis und Forever-Build soweit lesbar
- Instanz- und Raid-Lockouts; wenn der Client keine vollständige Saved-Instance-Liste bereitstellt, wird der aktuelle Instanz-Lockout als bestätigter Fallback gespeichert
- Tascheninhalt
- letzter bekannter Bankinhalt, sobald die Bank geöffnet wurde
- Goldbestand
- bei Jägern: aktives Pet, XP, Zufriedenheit, Loyalität, Trainingspunkte, Pet-Spellbook sowie aktive und gestallte Pets soweit der Forever-Client sie liefert

## Datenschutz und Synchronisierung

Das WoW-Addon selbst sendet weiterhin keinerlei Daten ins Internet. Alles wird zunächst in den WoW-SavedVariables auf dem jeweiligen Rechner gespeichert.

Für Alpha 5 gibt es zusätzlich einen separaten lokalen Sync-Companion. Er liest die gespeicherten SavedVariables nach Logout oder /reload und überträgt ausschließlich die freigegebenen Bereiche Charakter, Spellbook, Standort/Standorthistorie, Lockouts, Hunter/Pet und Händler-/Lehrerbeobachtungen. **Gold, Taschen und Bank sind ausdrücklich nicht Teil des Standard-Syncs.**

Damit bleiben Datenerfassung und Transport technisch getrennt. Das Addon benötigt weder Netzwerkzugriff noch einen eingebetteten Schlüssel.

## Technische Hinweise

- Zielclient: WoW Forever 1.60.1
- Interface: 16001
- Charakterdaten: DaltonDashboardCharDB
- globale Addon-Einstellungen: DaltonDashboardDB
- Datenmodell: Schema 1
- neu gelernte Klassenzauber werden über SPELLS_CHANGED aktualisiert
- in Instanzen können Kartenkoordinaten absichtlich nicht verfügbar sein; das Addon erfindet keine Werte
- Taschen- und Bankdaten überschreiben einen gültigen Stand niemals mit einem unlesbaren Logout-/Ladezustand
- Banktabs werden dynamisch über die aktuelle Forever-C_Bank-API ermittelt; die Lesbarkeit der Charakterbank wird live mit C_Bank.CanViewBank geprüft
- zusätzlich reagiert die Bankerfassung auf BANK_TABS_CHANGED, damit sie nicht von einem einzelnen Öffnen-Event abhängt
- Händler-/Lehrerbeobachtungen werden ausschließlich über MERCHANT_SHOW/UPDATE bzw. TRAINER_SHOW/UPDATE ausgelöst und als vollständige Momentaufnahme markiert, wenn alle Einträge lesbar waren
- der Sync-Companion arbeitet ausserhalb von WoW; er beobachtet die SavedVariables-Datei ereignisgesteuert und erzeugt keine dauerhafte Last im Spielclient
- Pet-Daten werden nur gespeichert, wenn der Forever-Client sie tatsächlich liefert
- nicht unterstützte oder geschützte Werte werden ausgelassen statt geschätzt
- nicht unterstützte Events landen als Kompatibilitätshinweis und nicht mehr im eigentlichen Fehlerprotokoll

## Befehle

- /dalton: Status der lokalen Datenerfassung
- /dalton scan: manueller Gesamtscan mit Erfolg-/Fehlerstatus
- /dalton errors: letzte echten Addonfehler
- /dalton compat: letzte Kompatibilitätshinweise

Die frühere Copy/Paste-Spellbook-Lösung und ein eingebetteter privater Sync-Schlüssel sind nicht mehr Bestandteil des Addons.


## Lokaler Alpha-5-Sync-Test

Der Companion liegt unter `scripts/dalton-sync-client.mjs`. Ohne Argument sucht er auf macOS und Windows nach der zuletzt geänderten `DaltonDashboard.lua`. Alternativ kann die Datei mit `--file` explizit angegeben werden.

- `node scripts/dalton-sync-client.mjs --dry-run` prüft Parser und Privacy-Whitelist ohne Upload.
- `node scripts/dalton-sync-client.mjs --watch` synchronisiert nach jeder Änderung der SavedVariables-Datei.
- Für echte Übertragung wird der private Schlüssel ausschließlich lokal als `DALTON_SYNC_TOKEN` gesetzt; er wird niemals in Addon oder Repository geschrieben.
- Der Endpunkt kann für den Test über `DALTON_SYNC_ENDPOINT` bzw. `--endpoint` auf einen Preview-Build gesetzt werden.

Wichtig: WoW schreibt SavedVariables regulär bei Logout bzw. `/reload`. Der Companion kann daher erst danach neue Daten sehen; das Addon führt dafür absichtlich keinen Hintergrund-Dateizugriff oder Netzwerkverkehr aus.

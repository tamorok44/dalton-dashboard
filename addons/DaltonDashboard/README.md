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
- Taschen-/Bank-/Goldinformationen nur noch als lokaler manueller Diagnosebestand über `/dalton scan`; sie werden weder automatisch im Spielbetrieb erfasst noch synchronisiert
- bei Jägern: aktives Pet, XP, Zufriedenheit, Loyalität, Trainingspunkte, Pet-Spellbook sowie aktive und gestallte Pets soweit der Forever-Client sie liefert

## Datenschutz und Synchronisierung

Das WoW-Addon führt **keinen HTTP-Zugriff** aus und enthält keinen privaten Server-Schlüssel.

Ab Beta 1 gibt es für die vier Dalton-Charaktere einen sehr kleinen Ingame-Relay:

- Cole Dalton ist der Relay-Hub.
- Chucky Dalton, Dolly Dalton und Viola Dalton senden ausschließlich die freigegebenen Dashboard-Bereiche über die offizielle WoW-AddOn-Kommunikation direkt an Cole.
- Cole muss dafür nicht in derselben Gruppe sein. Ist er offline, wird der fehlgeschlagene Direktversand erkannt und für fünf Minuten unterdrückt; es gibt weder permanentes Polling noch eine Whisper-Schleife.
- Befindet sich Cole in derselben Gruppe, kann der Hub zusätzlich eine gezielte Aktualisierung der bekannten Dalton-Mitglieder anfordern.
- Vor dem Versand wird der Datensatz per CBOR serialisiert, auf Geschwindigkeit komprimiert und Base64-kodiert. Die Übertragung erfolgt in kleinen, gedrosselten Paketen.
- Ein deterministischer Inhaltsfingerabdruck verhindert erneute Komprimierung und Übertragung, wenn sich fachlich nichts geändert hat.
- Der Empfänger akzeptiert nur das fest definierte Dalton-Roster und entfernt die privaten Bereiche `inventory` und `economy` zusätzlich.
- Coles Account-SavedVariables speichern die zuletzt empfangenen Peer-Datensätze im Relay-Postfach.

Optional kann auf jedem Rechner eine kleine lokale Bridge installiert werden. Sie läuft nach der einmaligen Kopplung unsichtbar im Benutzerhintergrund, beobachtet nur die Dalton-SavedVariables und lädt freigegebene Daten nach `/reload` oder Logout direkt hoch. Dadurch funktioniert der Solo-Sync auch dann, wenn Cole komplett offline ist. Ist keine Bridge installiert, bleibt der direkte Ingame-Relay zu Cole als kostenloser Fallback bestehen. Coles Rechner kann zusätzlich die über das Relay empfangenen Dalton-Datensätze zum Dashboard übertragen.

**Gold, Taschen und Bank sind niemals Teil des Standard-Syncs.**

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
- der Sync-Companion arbeitet ausschließlich auf Christians Rechner ausserhalb von WoW; er beobachtet Coles SavedVariables und das Relay-Postfach ereignisgesteuert
- Pet-Daten werden nur gespeichert, wenn der Forever-Client sie tatsächlich liefert
- nicht unterstützte oder geschützte Werte werden ausgelassen statt geschätzt
- nicht unterstützte Events landen als Kompatibilitätshinweis und nicht mehr im eigentlichen Fehlerprotokoll

## Befehle

- /dalton: Status der lokalen Datenerfassung
- /dalton scan: manueller Gesamtscan mit Erfolg-/Fehlerstatus
- /dalton errors: letzte echten Addonfehler
- /dalton compat: letzte Kompatibilitätshinweise
- /dalton perf: ereignisbasierte Modul-Laufzeiten seit Login
- /dalton relay: Rolle, Gruppenstatus und letzter Relay-Stand

Die frühere Copy/Paste-Spellbook-Lösung und ein eingebetteter privater Sync-Schlüssel sind nicht mehr Bestandteil des Addons.


## Lokaler Beta-1-Sync-Test

Der Companion liegt unter `scripts/dalton-sync-client.mjs`. Ohne Argument sucht er auf macOS und Windows nach der zuletzt geänderten `DaltonDashboard.lua`. Alternativ kann die Datei mit `--file` explizit angegeben werden.

- `node scripts/dalton-sync-client.mjs --dry-run` prüft Parser und Privacy-Whitelist ohne Upload.
- `node scripts/dalton-sync-client.mjs --watch` synchronisiert nach jeder Änderung der SavedVariables-Datei.
- Für echte Übertragung wird der private Schlüssel ausschließlich lokal als `DALTON_SYNC_TOKEN` gesetzt; er wird niemals in Addon oder Repository geschrieben.
- Der Endpunkt kann für den Test über `DALTON_SYNC_ENDPOINT` bzw. `--endpoint` auf einen Preview-Build gesetzt werden.

Wichtig: WoW schreibt SavedVariables regulär bei Logout bzw. `/reload`. Erst dann sieht der Companion neue lokale oder empfangene Relay-Daten. Innerhalb von WoW gibt es weiterhin keinen Dateizugriff und keinen Internetzugriff.

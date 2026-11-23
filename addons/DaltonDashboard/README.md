# Dalton Dashboard Sync

Entwicklungsfassung eines kleinen WoW-Forever-Addons für das Dalton Dashboard.

## Ziel

Das Addon ergänzt gezielt Daten, die das Dashboard nicht zuverlässig über Blizzard oder Armory erhält. Datenerfassung und spätere Nutzung im Dashboard sind bewusst getrennt.

Aktuell werden lokal erfasst:

- Charakteridentität, Klasse, Volk und Level
- vollständiger lesbarer Spieler-Spellbook-Stand inklusive Spell-ID, Name, Rang und SkillLine
- aktueller Standort, Zone, Unterzone, Karten-ID, Koordinaten soweit der Client sie freigibt, Ruhestein-Ort und aktuelle Instanz
- Instanz- und Raid-Lockouts inklusive Reset und, soweit verfügbar, Encounter-Status
- Tascheninhalt
- letzter bekannter Bankinhalt, sobald die Bank geöffnet wurde
- Goldbestand
- bei Jägern: aktives Pet, XP, Zufriedenheit, Loyalitätsrate, Pet-Spellbook, Stallinformationen und Beast-Training-Wissensstand soweit lesbar

## Datenschutz und Synchronisierung

Version 0.1.0-alpha.1 sendet keinerlei Daten ins Internet. Alles bleibt in den WoW-SavedVariables auf dem jeweiligen Rechner.

Gold, Taschen und Bank werden bewusst bereits erfasst, aber noch nicht im Dalton Dashboard angezeigt oder verwendet. Ob und wie einzelne Datenbereiche später synchronisiert werden, wird separat entschieden.

Der spätere Sync ist ein eigener Transport-Schritt. Dadurch muss die Datenerfassung nicht erneut umgebaut werden, wenn sich die Dashboard-Nutzung einzelner Bereiche ändert.

## Technische Hinweise

- Zielclient: WoW Forever 1.60.1
- Interface: 16001
- Charakterdaten: DaltonDashboardCharDB
- globale Addon-Einstellungen: DaltonDashboardDB
- Datenmodell: Schema 1
- in Instanzen können Kartenkoordinaten absichtlich nicht verfügbar sein; das Addon erfindet keine Werte
- Bankdaten sind immer der letzte erfolgreich lesbare Stand und werden beim Öffnen der Bank aktualisiert
- Pet-Daten werden nur gespeichert, wenn der Forever-Client sie tatsächlich liefert
- nicht unterstützte oder geschützte Werte werden ausgelassen statt geschätzt

## Befehle

- /dalton: Status der lokalen Datenerfassung
- /dalton scan: manueller Gesamtscan
- /dalton errors: letzte abgefangene Addonfehler

Die frühere Copy/Paste-Spellbook-Lösung und ein eingebetteter privater Sync-Schlüssel sind nicht mehr Bestandteil des Addons.

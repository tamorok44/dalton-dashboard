# Changelog

## 0.1.0-alpha.11

### Neu
- Ereignisgesteuerte Erfassung von Charakter, Spellbook, Standort, Instanz-Lockouts sowie Händler- und Lehrerbeobachtungen.
- Jäger-/Begleiterdaten soweit der WoW-Forever-Client sie bereitstellt.
- Schlanke Standorthistorie ohne permanentes Positions-Polling.
- Ingame-Relay für die vier Dalton-Charaktere über die offizielle WoW-AddOn-Kommunikation.
- Direkter Relay-Versand zu Cole Dalton auch außerhalb einer Gruppe; bei offline erkanntem Cole gilt eine fünfminütige Sperrzeit statt einer Retry-Schleife.
- Inhaltsfingerabdruck verhindert erneute Komprimierung und Übertragung unveränderter Daten.
- Lokale Performance-Diagnose über `/dalton perf` und Relay-Status über `/dalton relay`.
- Optionale lokale Bridge für macOS und Windows: automatischer Solo-Sync nach `/reload` oder Logout, auch wenn Cole offline ist.

### Datenschutz
- Das WoW-AddOn selbst führt keinen HTTP-Zugriff aus und enthält keine Server-Zugangsdaten.
- Gold, Taschen und Bank sind nicht Teil des Standard-Syncs.
- Empfangene Relay-Daten werden vor der Speicherung nochmals um private Bereiche bereinigt.

### Performance
- Keine permanente `OnUpdate`-Schleife.
- Keine automatischen Taschen-/Bank- oder Goldscans im normalen Spielbetrieb.
- Datenerfassung erfolgt über konkrete WoW-Ereignisse und kurze, gebündelte Aktualisierungen.

# CurseForge-Freigabe · Dalton Dashboard Sync 0.1.0-beta.1

## Projektname
Dalton Dashboard Sync

## Kurzbeschreibung
Leichtgewichtiges WoW-Forever-AddOn für das Dalton Dashboard: erfasst ausgewählte Charakter-, Spellbook-, Standort-, Händler-, Lehrer-, Instanz- und Begleiterdaten und kann sie sicher über einen optionalen Relay-/Bridge-Weg synchronisieren.

## Projektbeschreibung
**Dalton Dashboard Sync** ergänzt das private Dalton Dashboard um Informationen, die über Blizzard-API oder Armory nicht zuverlässig verfügbar sind.

Das AddOn arbeitet bewusst ereignisgesteuert und ohne permanente Hintergrundschleife. Es erfasst unter anderem den Spieler-Spellbook-Stand, Standort und Ruhestein, Instanz-Lockouts, Händler- und Lehrerbeobachtungen sowie bei Jägern verfügbare Begleiterdaten.

Für die Synchronisierung gibt es zwei Wege:

- **Ingame-Relay:** Chucky Dalton, Dolly Dalton und Viola Dalton können freigegebene Daten über die offizielle WoW-AddOn-Kommunikation direkt an Cole Dalton senden. Cole muss dafür nicht in derselben Gruppe sein. Ist Cole offline, entsteht keine Retry-Schleife.
- **Optionale lokale Bridge:** Nach einmaliger Einrichtung kann ein kleiner Hintergrunddienst auf macOS oder Windows die freigegebenen SavedVariables nach `/reload` oder Logout direkt zum Dashboard übertragen. Dadurch funktioniert der Solo-Sync auch dann, wenn Cole offline ist.

### Datenschutz
Das WoW-AddOn selbst führt **keinen HTTP-Zugriff** aus und enthält keine privaten Server-Schlüssel.

**Gold, Taschen und Bank werden nicht über den Standard-Sync übertragen.**

### Performance
Das AddOn ist auf geringe Last ausgelegt:

- keine permanente `OnUpdate`-Schleife
- keine dauernden Vollscans
- keine automatischen Taschen-/Bank- oder Goldscans
- ereignisgesteuerte Aktualisierung
- Deduplizierung unveränderter Relay-Daten vor Komprimierung und Versand

### Befehle
- `/dalton` – Status
- `/dalton relay` – Relay-Status
- `/dalton perf` – lokale Performance-Messwerte
- `/dalton errors` – letzte AddOn-Fehler
- `/dalton compat` – Kompatibilitätshinweise
- `/dalton scan` – manueller lokaler Diagnose-Scan

## Datei für den ersten Dalton-Test
- **Display Name:** Dalton Dashboard Sync 0.1.0-beta.1
- **Release Type:** Beta
- **Changelog Type:** Markdown
- **Supported Version:** WoW Forever / passend zur in CurseForge angebotenen Forever-Version
- **Dependencies:** keine

Warum Beta: Der Stand soll über den CurseForge-Client an die Testspieler verteilt werden, ist aber noch kein endgültiger Release. Eine reine Alpha-Datei wird im CurseForge-Client nicht regulär verteilt.

## Changelog für das Upload-Feld
## 0.1.0-beta.1

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


## Separater Bridge-Weg
Die macOS-/Windows-Bridge wird **nicht** in das CurseForge-AddOn-ZIP gelegt. Externe Bridge-Dateien werden über das Dalton Dashboard als einmalige, plattformspezifische Installation angeboten. CurseForge installiert das eigentliche WoW-AddOn und dessen Updates.

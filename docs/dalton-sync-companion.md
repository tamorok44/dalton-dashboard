# Dalton Dashboard Sync Companion · Alpha 7

Dieses Paket ist **nur für den lokalen Entwicklungstest mit Cole** gedacht. Es ist bewusst getrennt vom WoW-Addon.

## Voraussetzungen

- Node.js 22 oder neuer.
- Das WoW-Addon Dalton Dashboard Sync Alpha 7 ist installiert.
- Für einen echten Upload muss lokal die Umgebungsvariable `DALTON_SYNC_TOKEN` gesetzt sein.
- Für einen Preview-Test kann `DALTON_SYNC_ENDPOINT` auf den Preview-Endpunkt gesetzt werden.
- Ist der Preview durch Vercel Authentication geschützt, wird zusätzlich `DALTON_SYNC_PREVIEW_SHARE_URL` mit einem temporären Vercel-Share-Link gesetzt. Der Companion holt daraus selbstständig den Zugangscookie.

## Datenschutz

Der Standard-Sync überträgt ausschließlich:

- Charakteridentität
- Spieler-Spellbook
- aktuellen Standort und die schlanke Standorthistorie
- Instanz-/Raid-Lockouts
- Hunter-/Pet-Daten
- Händler- und Lehrerbeobachtungen

**Gold, Taschen und Bank werden nicht übertragen.** Diese Bereiche werden bereits vor Erzeugung des Sync-Payloads verworfen. Der Server weist Payloads mit diesen Bereichen zusätzlich ab.

## Erster Test ohne Upload

Im entpackten Ordner:

```bash
node dalton-sync-client.mjs --dry-run
```

Der Companion sucht die zuletzt geänderte `DaltonDashboard.lua` in den üblichen World-of-Warcraft-Verzeichnissen. Falls nötig:

```bash
node dalton-sync-client.mjs --dry-run --file "/vollständiger/Pfad/DaltonDashboard.lua"
```

## Beobachtungsmodus

```bash
node dalton-sync-client.mjs --watch
```

WoW schreibt SavedVariables regulär bei **Logout** bzw. **/reload**. Erst dann kann der Companion neue Daten sehen und synchronisieren. Innerhalb des Spiels läuft dadurch kein Dateimonitoring und kein Netzwerkverkehr.

## Echter Preview-Sync

Der private Schlüssel wird niemals als Kommandozeilenargument oder im Addon gespeichert. Er liegt nur in der lokalen Umgebung:

```bash
export DALTON_SYNC_TOKEN='...'
export DALTON_SYNC_ENDPOINT='https://<preview>/api/addon-sync'
export DALTON_SYNC_PREVIEW_SHARE_URL='https://<preview>/?_vercel_share=...'
node dalton-sync-client.mjs --watch
```

Für den finalen CurseForge-Betrieb wird dieser Entwicklungsablauf noch durch eine benutzerfreundliche Companion-Verteilung ersetzt.

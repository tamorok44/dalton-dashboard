# Dalton Dashboard Sync Companion · Alpha 10

Dieses Paket läuft **nur auf Christians Rechner** und ist bewusst vom WoW-Addon getrennt. Die übrigen Spieler benötigen keinen Companion.

## Voraussetzungen

- Node.js 22 oder neuer.
- Das WoW-Addon Dalton Dashboard Sync Alpha 10 ist bei Cole installiert.
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

Der Companion sucht automatisch den neuesten vertrauenswürdigen Dalton-Charakterdatensatz und zusätzlich Coles accountweites Relay-Postfach. Dadurch können Chucky, Dolly und Viola nach einem Ingame-Relay ohne eigene Zusatzsoftware mit synchronisiert werden. Falls nötig kann der lokale Charakterpfad explizit angegeben werden:

```bash
node dalton-sync-client.mjs --dry-run --file "/vollständiger/Pfad/DaltonDashboard.lua"
```

## Beobachtungsmodus

```bash
node dalton-sync-client.mjs --watch
```

WoW schreibt SavedVariables regulär bei **Logout** bzw. **/reload**. Danach synchronisiert der Companion Coles eigenen Datensatz und alle neuen Einträge aus dem Relay-Postfach nacheinander. Innerhalb des Spiels läuft dadurch kein Dateimonitoring und kein Internetverkehr.

## Echter Preview-Sync

Der private Schlüssel wird niemals als Kommandozeilenargument oder im Addon gespeichert. Er liegt nur in der lokalen Umgebung:

```bash
export DALTON_SYNC_TOKEN='...'
export DALTON_SYNC_ENDPOINT='https://<preview>/api/addon-sync'
export DALTON_SYNC_PREVIEW_SHARE_URL='https://<preview>/?_vercel_share=...'
node dalton-sync-client.mjs --watch
```

Für Max, Valentin und Stephan ist keine Companion-Verteilung vorgesehen: deren AddOn reicht die freigegebenen Daten ingame an Cole weiter. Der Companion bleibt ausschließlich Christians lokale Brücke zum Dashboard.

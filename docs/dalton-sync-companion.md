# Dalton Dashboard Sync Companion · Alpha 11

Die Bridge ist bewusst vom WoW-Addon getrennt. Auf Christians Rechner läuft sie als Master-Hub; optional kann jeder weitere Dalton-Spieler dieselbe Bridge einmalig koppeln. Danach läuft sie ohne sichtbares Fenster automatisch im Benutzerhintergrund.

## Voraussetzungen

- Node.js 22 oder neuer.
- Das WoW-Addon Dalton Dashboard Sync Alpha 11 ist bei Cole installiert.
- Christians Master-Hub verwendet weiterhin lokal `DALTON_SYNC_TOKEN`.
- Chucky, Dolly und Viola erhalten stattdessen jeweils einen einmaligen Einrichtungscode. Daraus wird ein eigener Gerätezugang erzeugt, der ausschließlich den zugeordneten Charakter synchronisieren darf.
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

Für Max, Valentin und Stephan bleibt der Ingame-Relay zu Cole der erste Fallback. Wer die optionale Bridge installiert, bekommt zusätzlich den Solo-Weg: Nach `/reload` oder Logout werden die freigegebenen Daten selbst dann hochgeladen, wenn Christian komplett offline ist. Die Windows-Bridge startet über den Benutzer-Autostart ohne sichtbares Fenster; macOS nutzt einen LaunchAgent.

# Dalton Dashboard Sync Companion · Beta 1

Die Bridge ist bewusst vom WoW-Addon getrennt. Auf Christians Rechner läuft sie als Master-Hub; optional kann jeder weitere Dalton-Spieler dieselbe Bridge einmalig koppeln. Danach läuft sie ohne sichtbares Fenster automatisch im Benutzerhintergrund.

## Voraussetzungen

- Das WoW-Addon Dalton Dashboard ist installiert.
- Für die normale Nutzung ist **kein Node.js, Bun oder Terminal** erforderlich: Windows und macOS erhalten jeweils eine eigenständige Bridge-Datei.
- Jeder Dalton-Spieler erhält einen einmaligen Einrichtungscode. Daraus wird ein eigener Gerätezugang erzeugt, der ausschließlich den zugeordneten Charakter synchronisieren darf.
- Windows und macOS sind gleichwertig unterstützt. Windows nutzt den Benutzer-Autostart, macOS einen LaunchAgent.
- Preview-Endpunkt und Vercel-Share-Link sind ausschließlich für interne Tests gedacht und gehören nicht in das spätere Benutzerpaket.

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


## Installation für Spieler

### macOS

1. Bridge-Paket entpacken.
2. `Installieren.command` starten und den einmaligen Einrichtungscode eingeben.
3. Die Bridge wird nach `~/Library/Application Support/DaltonDashboardBridge/` installiert.
4. Ein LaunchAgent startet sie bei jeder Anmeldung automatisch im Hintergrund.
5. Zusätzlich wird `~/Applications/Dalton Dashboard Bridge deinstallieren.command` angelegt.

Die heruntergeladenen Installationsdateien können danach gelöscht werden.

### Windows

1. Bridge-Paket entpacken.
2. `Installieren.cmd` starten und den einmaligen Einrichtungscode eingeben.
3. Die Bridge wird unter `%LOCALAPPDATA%\DaltonDashboardBridge\` installiert.
4. Eine Verknüpfung im Benutzer-Autostart startet sie künftig unsichtbar.
5. Im Windows-Startmenü wird **Dalton Dashboard Bridge deinstallieren** angelegt.

Die heruntergeladenen Installationsdateien können danach gelöscht werden.

## Deinstallation und Geräte-Widerruf

Die Deinstallation ist auf beiden Plattformen absichtlich zweistufig abgesichert:

1. Die installierte Bridge widerruft ihren eigenen Gerätezugang serverseitig.
2. Erst nach erfolgreichem Widerruf werden Autostart, lokale Konfiguration und Bridge-Dateien entfernt.

Dadurch kann eine alte Kopie der lokalen Geräte-Konfiguration nach der Deinstallation nicht weiter synchronisieren. Für den serverseitigen Widerruf ist während der Deinstallation eine Internetverbindung erforderlich. Das WoW-Addon selbst wird durch die Bridge-Deinstallation nicht entfernt und kann unabhängig über CurseForge deinstalliert werden.


## Peer-Einrichtung durch Cole

Coles Hub-Gerät darf Einmal-Codes ausschließlich für **Chucky Dalton, Dolly Dalton und Viola Dalton** erzeugen. Es darf keinen neuen Cole-Zugang erstellen.

Nach der Installation wird nur auf Coles Hub-Rechner ein Helfer angeboten:

- macOS: `~/Applications/Dalton Dashboard Einrichtungscode erstellen.command`
- Windows: Startmenü **Dalton Dashboard Einrichtungscode erstellen**

Der Helfer fragt den Zielcharakter ab, erzeugt einen 24 Stunden gültigen Einmal-Code und kopiert ihn in die Zwischenablage. Peer-Geräte erhalten diesen Helfer nicht.

Die Geräteberechtigungen bleiben eng begrenzt:
- jedes Gerät darf seinen eigenen Dalton-Charakter direkt synchronisieren;
- nur Coles Hub-Gerät darf zusätzlich einen echten `dalton-peer-relay`-Datensatz von Chucky, Dolly oder Viola weiterleiten;
- Coles Hub-Gerät darf **keinen** fremden Direkt-Sync vortäuschen;
- Peer-Geräte dürfen weder andere Dalton-Charaktere synchronisieren noch weitere Einrichtungscodes erzeugen.

## Getrennte Kopplung von Preview und Produktion

Die automatische Übernahme eines Preview-Geräts in die Produktion ist abgeschaltet. Für eine neue Produktionskopplung ist ein regulär autorisierter Einrichtungscode aus der Produktionsumgebung erforderlich. Bereits gültige Produktionsgeräte bleiben unverändert gekoppelt. Ein Preview-Code oder Preview-Gerät gilt nicht als Produktionsberechtigung. Historische Deployments und bestehende Gerätezugänge müssen bei der betrieblichen Abnahme separat inventarisiert und gegebenenfalls widerrufen werden.

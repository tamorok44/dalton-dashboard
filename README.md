# Die Daltons – WoW Forever Dashboard

Western-Dashboard für vier Dalton-Charaktere. Statische Website mit Vercel-Funktionen, Upstash Redis und Vercel Blob.

## Persistenter Betrieb

- `GET /api/characters` liest den letzten vollständigen Datensatz aus Redis, beim erstmaligen Start aus `data/characters.json`.
- Ein Klick auf **Aktualisieren** löst `GET /api/refresh` aus und speichert erfolgreich abgerufene Daten dauerhaft. Der manuelle Abruf ist global auf einmal pro Minute begrenzt.
- Es gibt **keinen 30-Minuten-Deployment- oder GitHub-Datenabruf**. Code-Pushes führen nur die Tests aus. Datenaktualisierung und Website-Deployment sind getrennt.
- Der einzige planmäßige Serverlauf ist der Vercel-Cron in `vercel.json`: `7 4 * * *` (04:07 UTC, also 05:07 Uhr Berlin im Winter und 06:07 Uhr im Sommer). Er erstellt den täglichen Roh-Snapshot und aktualisiert danach die persistenten Charakterdaten.
- Redis-basierte Sperren schützen gegen parallele Serverinstanzen und verhindern veraltete Überschreibungen.
- Teilfehler behalten den letzten Datenstand des betroffenen Charakters. Bei einem vollständigen Blizzard-Ausfall wird kein neuer Charakterstand gespeichert.
- Vercel Blob archiviert tägliche Voll-Snapshots sowie optional Porträts, Avatare und Ausrüstungs-Icons.
- Jägerprofile laden zusätzlich Blizzards öffentliche Forever-Stall-JSON (`collections/stable.json`). Aktiver Begleiter, Stallplätze, Name, Familie, Stufe und Blizzard-Render werden persistent gespeichert und bei Änderungen historisiert.
- Treue, Zufriedenheit, freie/verbrauchte Ausbildungspunkte und tatsächlich gelernte Pet-Ränge werden nicht geschätzt, weil Blizzard diese Clientwerte derzeit nicht in der Online-Armory veröffentlicht.
- Die Website wird bei normalen Datenaktualisierungen **nicht neu deployed**.

## Pet-Regelwerk und Fail-closed-Prinzip

Regelbasierte Begleiterdaten werden strikt von Blizzard-Livedaten getrennt.

- **Blizzard-Livedaten** wie Name, Stufe, Familie, Aktiv-/Stallstatus und Bilder bleiben unabhängig vom Regelwächter sichtbar.
- **Regelwerte** wie Familienmodifikatoren, Ausbildungsstufen oder künftige Berechnungsformeln besitzen eine eigene Regel-ID, Version, Quellen und ein Prüfdatum.
- Der tägliche Ablauf ist verbindlich: **Pet-Regeln prüfen → Roh-Snapshot erstellen → Charaktere/API aktualisieren → nur bestätigte Regeln verwenden → speichern**.
- Der manuelle Refresh verwendet einen höchstens 20 Stunden alten Regelstand. Fehlt er oder ist er älter, wird die Regelprüfung ebenfalls **vor** dem Blizzard-Profilabruf ausgeführt.
- Das Regelwerk beobachtet aktuell:
  - die offizielle Blizzard-Forever-Hotfixseite,
  - Wowheads Forever-Hunter-Skalierungsregeln,
  - Bind on Forever für Fuchsfamilie und Ausbildungsstufen,
  - WoW-Forever.gg als zweite Quelle für Familienmodifikatoren.
- Quellen werden nicht automatisch „neu angelernt“. Der erste geprüfte Stand einer Regelwerk-Version wird als Baseline gespeichert. Ändert sich ein relevanter Text, ein beobachteter Forever-Build oder fehlt eine erwartete Regel-Aussage, erhält die betroffene Regel `review_required`.
- Ist eine benötigte Quelle nicht erreichbar, erhält die betroffene Regel `source_unavailable`.
- Bei `review_required` oder `source_unavailable` gilt **fail closed**: Der betreffende regelbasierte Wert wird im Dashboard ausgeblendet. Es wird niemals mit einer möglicherweise veralteten Formel weitergerechnet.
- Eine bestätigte Änderung wird erst durch eine bewusst neue Regelwerk-Version im Repository freigegeben. Historische Regelversionen werden dadurch nicht stillschweigend überschrieben.
- Eine serverseitige, nicht veröffentlichte Blizzard-Änderung kann technisch nicht vor ihrer Beobachtbarkeit garantiert erkannt werden. Das System minimiert dieses Restrisiko, indem es keine unbestätigten Ableitungen anzeigt.

## Zeitplan

Der Vercel-Cron läuft einmal täglich um `04:07 UTC`.

1. Prüfen, ob der Tageslauf bereits gespeichert wurde.
2. Pet-Regelwerk gegen die aktuellen Quellen prüfen und den Status in Redis speichern.
3. Vollständigen Blizzard-Forever-Snapshot in Blob archivieren.
4. Live-Profile aller Daltons einschließlich Jägerstall aktualisieren.
5. Nur weiterhin verifizierte Regelwerte im Frontend freigeben.
6. Änderungen der Charakterdaten historisieren.

Der Cron aktualisiert Redis/Blob und **niemals** das GitHub-Repository. GitHub Actions führt bei Pushes und Pull Requests ausschließlich `npm test` aus.

## Produktionsvoraussetzungen

In Vercel sind für Production erforderlich:

- `UPSTASH_REDIS_REST_URL` und `UPSTASH_REDIS_REST_TOKEN` oder die entsprechenden `KV_REST_API_*` Variablen,
- `BLOB_STORE_ID` beziehungsweise bei älteren Verbindungen `BLOB_READ_WRITE_TOKEN`,
- `CRON_SECRET`,
- `BLIZZARD_CLIENT_ID` und `BLIZZARD_CLIENT_SECRET`.

Geheimnisse gehören ausschließlich in Vercel-Umgebungsvariablen und niemals ins Repository.

## Entwicklung

`npm test` prüft Syntax, Parser, UI, Blizzard-Datenformate, Persistenz, Historisierung und das Pet-Regelwerk einschließlich Buildwechsel, neuen Pet-Hotfixes, Quellenausfällen und Fail-closed-Verhalten.

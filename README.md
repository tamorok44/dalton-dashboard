# Die Daltons – WoW Forever Dashboard

Western-Dashboard für vier Dalton-Charaktere. Statische Website mit Vercel-Funktionen, Upstash Redis und optional Vercel Blob.

## Persistenter Betrieb

- `GET /api/characters` liest den letzten vollständigen Datensatz aus Redis, beim erstmaligen Start aus `data/characters.json`.
- Ein Klick auf **Aktualisieren** löst `GET /api/refresh` aus und speichert erfolgreich abgerufene Daten dauerhaft. Der manuelle Abruf ist global auf einmal pro Minute begrenzt.
- Die GitHub-Aktion `.github/workflows/refresh-characters.yml` ruft **alle 30 Minuten** `GET /api/refresh` auf, unabhängig vom manuellen Aktualisieren. Sie benötigt keine zusätzlichen Konten oder Zugangsdaten und führt **kein Deployment** aus. GitHub-Zeitpläne können verzögert ausfallen. Der bereits vorhandene geschützte `POST`-Endpunkt bleibt für eine eventuelle spätere QStash-Umstellung verfügbar.
- Redis-basierte Sperre (`SET NX EX`) schützt gegen parallele Serverinstanzen. Ein per Lua validierter Schreibvorgang verhindert Überschreiben nach abgelaufener Sperre. Eine laufende Aktualisierung erhält HTTP 202 (manuell) oder 200 (QStash).
- Teilfehler behalten den letzten Datenstand des betroffenen Charakters. Bei einem vollständigen Blizzard-Ausfall wird kein neuer Stand gespeichert.
- Vercel Blob speichert optional Porträts, Avatare und Ausrüstungs-Icons. Neue Icons werden schrittweise archiviert. Die Originale bleiben als Fallback erhalten. Alle Blob-Adressen werden in Redis gespeichert.
- Jägerprofile laden zusätzlich Blizzards öffentliche Forever-Stall-JSON (`collections/stable.json`). Aktiver Begleiter, Stallplätze, Name, Familie, Stufe und Blizzard-Render werden persistent gespeichert und bei Änderungen historisiert. Treue, Zufriedenheit, Ausbildungspunkte und tatsächlich gelernte Pet-Ränge werden nicht geschätzt, weil Blizzard diese Clientwerte online nicht veröffentlicht.
- Die Website wird bei normalen Datenaktualisierungen **nicht neu deployed**.

## Noch nötige Einrichtung vor Produktionsstart

1. In Vercel prüfen, dass beim Projekt `dalton-dashboard` die Variablen `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` und `BLOB_STORE_ID` für **Production** vorhanden sind. Alternativ funktionieren für Redis `KV_REST_API_URL` / `KV_REST_API_TOKEN`. Vercel Blob verwendet bei neuen Projekt-Verbindungen standardmässig kurzlebige OIDC-Anmeldedaten mit `BLOB_STORE_ID` (kein `BLOB_READ_WRITE_TOKEN` nötig). Ältere Token-basierte Blob-Verbindungen bleiben ebenfalls unterstützt.
2. Eine **zusätzliche** Vercel-Umgebungsvariable `CRON_SECRET` für Production mit einem langen zufälligen Passwort einrichten. Geheimnisse nur im Vercel-Dashboard eingeben.
3. Nach grünem GitHub-Test die Änderungen einmalig nach Production deployen, `/api/characters` aufrufen und anschliessend den Aktualisieren-Button testen. Datenstand nach Neuladen prüfen.
4. Nach dem Merge in `main` ist der GitHub-Actions-Zeitplan `7,37 * * * *` (UTC) automatisch aktiv. Unter **Actions → Dalton-Profile automatisch aktualisieren** den ersten Lauf ansehen und unter `/api/characters` den neuen Zeitstempel prüfen.
5. **Keinen zweiten QStash-Zeitplan** einrichten, solange dieser GitHub-Actions-Zeitplan aktiv ist.

**Wichtig:** Der Zeitplan aktualisiert Redis/Blob und niemals das GitHub-Repository. Der erste planmäßige Abruf startet erst nach dem Merge (die Produktionswebsite muss dafür bereits deployed sein). Der öffentliche GET-Endpunkt nutzt die bestehende globale Redis-Drosselung und verteilte Sperre.

## Entwicklung

`npm test`: Syntax-, Parser-, UI- und API-Tests. Der Draft-PR löst GitHub Actions aus.

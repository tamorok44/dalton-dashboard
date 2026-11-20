# Die Daltons – WoW Forever Dashboard

Western-Dashboard für vier Dalton-Charaktere. Statische Website mit Vercel-Funktionen, Upstash Redis und optional Vercel Blob.

## Persistenter Betrieb

- `GET /api/characters` liest den letzten vollständigen Datensatz aus Redis, beim erstmaligen Start aus `data/characters.json`.
- Ein Klick auf **Aktualisieren** löst `GET /api/refresh` aus und speichert erfolgreich abgerufene Daten dauerhaft. Der manuelle Abruf ist global auf einmal pro Minute begrenzt.
- QStash soll `POST /api/refresh` alle 30 Minuten auslösen. Der POST-Endpunkt setzt `Authorization: Bearer <CRON_SECRET>` voraus.
- Redis-basierte Sperre (`SET NX EX`) schützt gegen parallele Serverinstanzen. Ein per Lua validierter Schreibvorgang verhindert Überschreiben nach abgelaufener Sperre. Eine laufende Aktualisierung erhält HTTP 202 (manuell) oder 200 (QStash).
- Teilfehler behalten den letzten Datenstand des betroffenen Charakters. Bei einem vollständigen Blizzard-Ausfall wird kein neuer Stand gespeichert.
- Vercel Blob speichert optional Porträts, Avatare und Ausrüstungs-Icons. Neue Icons werden schrittweise archiviert. Die Originale bleiben als Fallback erhalten. Alle Blob-Adressen werden in Redis gespeichert.
- Die Website wird bei normalen Datenaktualisierungen **nicht neu deployed**.

## Noch nötige Einrichtung vor Produktionsstart

1. In Vercel prüfen, dass beim Projekt `dalton-dashboard` die Variablen `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` und `BLOB_READ_WRITE_TOKEN` für **Production** vorhanden sind. Alternativ funktionieren für Redis `KV_REST_API_URL` / `KV_REST_API_TOKEN`.
2. Eine **zusätzliche** Vercel-Umgebungsvariable `CRON_SECRET` für Production mit einem langen zufälligen Passwort einrichten. Geheimnisse nur im Vercel-Dashboard eingeben.
3. Nach grünem GitHub-Test die Änderungen einmalig nach Production deployen, `/api/characters` aufrufen und anschliessend den Aktualisieren-Button testen. Datenstand nach Neuladen prüfen.
4. In [Upstash QStash](https://console.upstash.com/qstash) unter **Schedules** einen Zeitplan für `https://dalton-dashboard-eight.vercel.app/api/refresh` einrichten. HTTP-Methode **POST**, CRON `*/30 * * * *` (UTC); beim Erstellen als **weitergeleiteten** Header `Authorization: Bearer <CRON_SECRET>` setzen. Für QStash API wird dieser Header als `Upstash-Forward-Authorization` übergeben. QStash verwendet für die API-Anmeldung einen getrennten QStash-Token, nicht den CRON_SECRET.
5. Testen, ob QStash die Route erfolgreich erreicht und `generatedAt` neu gespeichert wird. Nur **einen** Zeitplan aktivieren; kein paralleler GitHub-Actions-Cron.

**Wichtig:** QStash wird nicht allein dadurch aktiviert, dass Redis verbunden ist. Den Zeitplan erst nach dem Produktionsdeployment erstellen. Keine Geheimnisse an ChatGPT oder in GitHub-Dateien senden.

## Entwicklung

`npm test`: Syntax-, Parser-, UI- und API-Tests. Der Draft-PR löst GitHub Actions aus.

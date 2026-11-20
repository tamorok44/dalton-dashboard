# Die Daltons – WoW Forever Dashboard

Western-Dashboard für vier Dalton-Charaktere. Statische Website plus Vercel-Funktionen, Redis-Datenbank und optional Vercel Blob.

## Dauerhafte Aktualisierung

- `/api/characters` liest die jüngste dauerhafte Momentaufnahme aus Redis. Bei erstmaligem leerem Speicher liefert es `data/characters.json` als Startwert.
- `/api/refresh` fragt die vier Blizzard-Profile parallel ab und speichert das Ergebnis **vor** einer erfolgreichen HTTP-Antwort in Redis. Teilfehler behalten die zuvor gespeicherten Werte des jeweiligen Charakters.
- Der Aktualisieren-Button verwendet `GET /api/refresh`; ein GitHub-Actions-Zeitplan ruft alle 30 Minuten `POST /api/refresh` mit einem geheimen Bearer-Token auf. **Keine Pushes und keine Deployments bei Datenaktualisierungen.**
- Charakterporträts, Avatare und Ausrüstungs-Icons werden bei konfiguriertem Vercel Blob im Objektspeicher archiviert; ihre URLs sind Bestandteile des Redis-Datensatzes. Je Durchgang werden höchstens zwölf neue Ausrüstungs-Icons hochgeladen, bis die Ersterfassung abgeschlossen ist. Original-URLs dienen als Fallback. Unveränderte Grafiken werden wiederverwendet.
- `data/characters.json` bleibt ein festes Sicherheitsnetz für den ersten Start oder einen Fehler beim Laden.

## Aktivierung (vor dem Zusammenführen des Pull Requests)

1. Eine Upstash-Redis-Datenbank anlegen und in der zugehörigen Vercel-Website `UPSTASH_REDIS_REST_URL` und `UPSTASH_REDIS_REST_TOKEN` als **serverseitige** Umgebungsvariablen eintragen. Alternativ funktionieren die Namen `KV_REST_API_URL` und `KV_REST_API_TOKEN`.
2. Einen **öffentlichen** Vercel-Blob-Speicher an das Projekt anbinden. Dabei wird üblicherweise `BLOB_READ_WRITE_TOKEN` im Projekt gesetzt. Die archivierten Bilder sind dann über öffentliche URLs sichtbar; das Token bleibt serverseitig.
3. In Vercel einen zufälligen `CRON_SECRET` konfigurieren. Diesen gleichen Wert als GitHub-Actions-Repository-Secret `CRON_SECRET` speichern. In GitHub zusätzlich `DASHBOARD_URL` als Secret auf die vollständige **produktive** Dashboard-Adresse setzen.
4. Änderungen deployen, `GET /api/characters` testen, dann einmal manuell aktualisieren. Website neu laden und das erhaltene `generatedAt` prüfen.
5. Der GitHub-Zeitplan wird automatisch nach Übernahme in `main` aktiv. Der Task kann in GitHub Actions auch manuell gestartet werden. Zeitpläne sind best effort und können bei GitHub Actions verzögert werden.

**Keine Zugangstokens ins Repository schreiben.** Ohne Redis-Konfiguration schlägt ein manueller Aktualisierungsversuch mit 503 fehl, damit niemals ein nur scheinbar gespeicherter Zustand angezeigt wird. Ohne Blob-Konfiguration bleibt Redis funktionsfähig, zeigt dann aber die ursprünglichen Blizzard-Bildadressen.

## Entwicklung

`npm test` führt Parser-, UI- und API-Tests aus. Ein Pull Request startet denselben Test-Workflow.


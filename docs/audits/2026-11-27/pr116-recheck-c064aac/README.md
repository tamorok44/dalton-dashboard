# Neunte unabhängige Gegenprüfung von PR #116

**Die technische Sanierung kann noch nicht abgeschlossen werden. PR #116 sollte Draft bleiben.** Die drei Blocker der achten Gegenprüfung sind in ihren ursprünglichen Reproduktionsfällen behoben. Die vollständige Zustandsprüfung zeigt zwei weitere Freigabeblocker. Der bedingte Commit kann einen zwischenzeitlich angelegten leeren v2-Rohwert überschreiben. Drei aufeinanderfolgende Belegabfrage-Timeouts überschreiten die konfigurierte Gesamtlaufzeit des Sync-Handlers.

Prüfdatum 27. November 2026. Kandidat `c064aacffe33e2533a6eb96b475010489bdbe50a`, Vergleich `6a6275e63270f6baf09ae3e2d0d4a4abc54e76db`. Die Auditbasis ist `0608cf5`, der erste P0-Stand `42d6511` und der historische v1-Schreiber `5a57723`. [Systemaudit #115](https://github.com/tamorok44/dalton-dashboard/pull/115) · [Achte Gegenprüfung](https://github.com/tamorok44/dalton-dashboard/pull/116#issuecomment-7219387396) · [Sanierungsnotiz](https://github.com/tamorok44/dalton-dashboard/pull/116#issuecomment-7219595156)

## Ausführung und Reichweite

- Alle **111 bisherigen Prüfgruppen** liefen als unveränderte Kontrolle am Vorgänger und mit identischen IDs am neuen Commit. **13 zusätzliche Gruppen** decken Zustandsübergänge und deren Kombinationen ab. Damit liefen je **124 Gruppen** unter Redis **7.0.15** und **8.0.2**. Erfolgreiche Assertions umfassen ausdrücklich reproduzierte Fehlerzustände.
- Beide Redis-Instanzen liefen isoliert über private Unix-Sockets. Lua, Sperren, ACLs, native RDB-Wiederherstellung, die tatsächlichen Handler und historische Leser wurden lokal mit synthetischen Daten ausgeführt. Der Blob-HTTP-Transport wurde abgefangen. Aufrufdauer im lokalen Fehlerfixture und tatsächliche Ausführung bei Vercel werden getrennt bewertet.
- Die Repository-Suite bestand mit **165 von 165** unter Node 22.23.5 / Redis 7 und Node 26.13.1 / Redis 8. Die drei GitHub-Workflows waren grün. [Gesamttest](https://github.com/tamorok44/dalton-dashboard/actions/runs/46007840247) · [Browser und Performance](https://github.com/tamorok44/dalton-dashboard/actions/runs/46007840248) · [Add-on](https://github.com/tamorok44/dalton-dashboard/actions/runs/46007840312)

## Geprüfte Zustände und Übergänge

| Ausgangslage | Übergang und überprüftes Ergebnis |
| --- | --- |
| Beleg verfügbar und gültig | Beide Reparaturreferenzen werden verarbeitet. Der Redis-Commit vergleicht die beobachteten Bytes mit dem aktuellen Zustand. Ein betroffener Wiederholungsversuch prüft die Belege erneut, wenn die Beobachtung noch ausstehend ist. Bereits bestätigte API-Duplikate sind historische Empfangsbelege. |
| Einmaliger Abfragefehler | Im ursächlichen Testfall wiederholte der Handler die Prüfung und veröffentlichte den neuen Preis. Es entstand keine terminale Quarantäne und der Empfangsbeleg wurde erst nach dem Commit bestätigt. |
| Längere Belegabfragestörung | Drei schnelle Fehlversuche führten pro Handler zu 503. Identischer Retry und neuer Sync desselben Charakters hielten den exakten ausstehenden Nutzinhalt ohne TTL fest, auch nach RDB-Neustart. Ein anderer Charakter blieb zwischen diesen Aufrufen synchronisierbar. Ein späterer gültiger Sync verarbeitete den ausstehenden Eingang vor seiner eigenen Arbeit. |
| Eine Referenz fehlt, die zweite ist nicht abfragbar | Keine abschließende Quarantäneentscheidung. Nach drei Versuchen blieb die Aufnahme ausstehend. Nach Wiederherstellung war der exakte Replay erfolgreich. |
| Eine von zwei Referenzen fehlt oder ist beschädigt, wird aber vor HSET restauriert | Das Lua-Argument enthielt beide Referenzen. Für die beschädigte Referenz enthielt es die exakten Bytes, bei Abwesenheit explizites JSON `null`. Die erste Commit-Bedingung wurde abgewiesen. Der Wiederholungsversuch veröffentlichte den neuen Wert. |
| Beleg fehlt stabil im Commit, wird danach wiederhergestellt | Die Beobachtung wurde terminal und bytegetreu in Quarantäne gesichert. Wiederherstellung direkt nach HSET vor der Empfangsbestätigung und Wiederherstellung nach der Bestätigung verhielten sich gleich. Der alte Preis blieb aktiv, ein Duplikat verarbeitete den Eingang nicht automatisch erneut. Das entspricht dem dokumentierten Vertrag für dauerhafte Befunde. Ein sicherer Wiederaufnahmeprozess ist für den Betrieb nachzuweisen. |
| Kollision und gleichzeitige Leser | Zwei Leser trafen auf denselben beschädigten Primärbeleg und bestätigten denselben alternativen Beleg. Beide Paarhälften und die kollidierenden Bytes blieben erhalten. Der Folgeabruf löste keinen weiteren Schreibaufruf aus. Vier besetzte Kandidaten ergaben beim Leser `preserved:false`, beim Schreiber 503 und dauerhafte ausstehende Arbeit. Keiner der Originalwerte wurde ersetzt. |
| Teilerfolg, Antwortverlust oder Prozessabbruch | Ein Paket mit drei Beobachtungen schrieb den ersten Record, stoppte beim zweiten und ließ den dritten unverarbeitet. Der Replay ergänzte beide ausstehenden Records ohne eine zweite Version des ersten Records. Die bisherigen Tests zu verlorener Antwort und `SIGKILL` vor und nach HSET blieben erfolgreich. Ein echter Prozessabbruch während der Beleg-Retry-Sequenz ließ die ausstehende Aufnahme samt globaler Sperre zurück. |
| Offline-Wiederherstellung | Bekannte vollständige Exporte blieben mit den historischen Lesern kompatibel. Die strikte Inventur wies veränderte Eingaben und fehlende Referenzen ab. Eine korrekt inventarisierte Kollision mit beschädigtem Primärbeleg blieb für die JSON-Projektion gesperrt. Der native lokale RDB-Restore erhielt beide Felder exakt, und der aktuelle Leser lieferte den wiederhergestellten Preis. |

## 1. Technische Freigabeblocker

| Befund | Reproduktion und Abnahmekriterium |
| --- | --- |
| **P1 · Der v2-Commit unterscheidet Abwesenheit und leere Originalbytes nicht.** | Das v2-Feld fehlte beim ersten Lesen. Vor dem atomaren Redis-Befehl legte die Konkurrenzprobe das Feld als echte leere Zeichenkette an. Der Lua-Vergleich wertet beide Zustände als dieselbe leere Zeichenkette. Der Handler antwortete 200, überschrieb den vorhandenen Rohwert und erzeugte keinen Quarantänebeleg. Die Testprobe benötigte keinen alten Writer. Der CAS muss Präsenz und Inhalt wie beim Belegvergleich getrennt abgleichen und den abweichenden Stand erneut prüfen. |
| **P1 · Kein übergreifendes Zeitbudget für den Sync-Wiederanlauf.** | Die gewöhnlichen Redis-Operationen liefen auf echtem lokalem Redis. Für einen Reparaturbeleg hielt die Testharness jede Antwort bis zum unveränderten 10-Sekunden-`AbortSignal` zurück. Drei sequenzielle Versuche brauchten insgesamt rund **30,1 Sekunden** vor der lokalen 503-Antwort, bei **30 Sekunden** konfigurierter Functions-Dauer. Die ausstehende Aufnahme blieb erhalten. Eine separate echte `SIGKILL`-Probe zeigte, dass ein abgebrochener Prozess die globale Sperre zurücklässt und ein anderer Charakter 409 erhält. Die Freigabe braucht ein gemeinsames monotones Zeitbudget mit Reserve für eine kontrollierte Antwort und Sperraufräumung. Die tatsächliche Vercel-Unterbrechung und Dauer bis zum Ablaufen der Sperre wurden getrennt vom lokalen Nachweis behandelt. |

Die globale Sperre ist mit 120 Sekunden TTL konfiguriert. In der Abbruchprobe wurde ihr Ablauf gezielt vorgezogen, um den Retry zu verifizieren. Daraus lässt sich keine gemessene Anbieter-Ausfallzeit ableiten. [Lua-CAS und Retry](https://github.com/tamorok44/dalton-dashboard/blob/c064aacffe33e2533a6eb96b475010489bdbe50a/scripts/live-knowledge-store.mjs#L276) · [Redis-Timeout und Sperre](https://github.com/tamorok44/dalton-dashboard/blob/c064aacffe33e2533a6eb96b475010489bdbe50a/scripts/character-store.mjs#L24) · [Functions-Dauer und Empfangsbestätigung](https://github.com/tamorok44/dalton-dashboard/blob/c064aacffe33e2533a6eb96b475010489bdbe50a/api/addon-sync.js#L11)

## 2. Betriebliche Freigabevoraussetzungen

- Alte Writer vor dem autoritativen Export und der Umschaltung direkt am Speicher sperren. Die Lock- und Exportnachweise bleiben verbindlich. Die für den Export maßgeblichen Originaldaten umfassen Primärfelder, Ausweichbelege und ausstehende Arbeit. Historische Endzustände mit `repair_evidence_unavailable` und Aufnahmen, deren Beleg erst nach einem terminalen Commit restauriert wird, separat bilanzieren. Den Wiederanlauf in einem isolierten Klon nachweisen. [Writer-Stilllegung und Quarantäne-Wiederaufnahme](WRITER-CUTOVER.md)
- Der auf den exakten Commit gepinnte Probelauf prüfte gemeinsame Kollisionsbehandlung, Belegentzug und -wiederherstellung während des CAS, vorübergehenden Lesefehler und privaten Blob-Zugriff in der Testharness. Er bestand mit **136 angefragten Redis-REST-Operationen** und anschließender Bereinigung. Die reale Upstash-/Blob-Abnahme, tatsächliche Kontingente, aktives Abschalten der Alt-Writer, verifizierter Provider-Restore, Produktionsbindung und Functions-Laufzeit bleiben offen. [Ausführbarer Abnahmeplan](INFRASTRUCTURE-ACCEPTANCE.md) · [Lokaler Probelauf](provider-smoke.jsonl)

## 3. Ressourcen und optionale Optimierungen

- Im einfachen Paket mit 32 gültigen Beobachtungen und 4.756 Eingabebytes entstanden **96 Redis-Aufrufe für Beobachtungen** und **104 insgesamt**. Die Beobachtungsrequests transportierten zusammen 117.312 Byte einschließlich wiederholtem Lua-Text und Parameterdaten. Zwölf erstmals erkannte Konflikte eines normalen Lesevorgangs benötigten weiterhin 42 Requests, die unveränderte Wiederholung 18 ohne neuen Schreibzugriff.
- Gebündelte Reads, kompaktere Redis-Argumente oder kleinere verarbeitbare Pakete können die Kosten senken. Die Sicherheit der Vergleichsbedingungen und die garantierte Freigabe der Sperre haben Vorrang. Ausweisbare Providerquoten und die tatsächlichen Latenzen für große Belege bleiben Bestandteil der Abnahme.

## Reproduktion

Node 22 oder 26 und Redis 7 bzw. 8 auf `PATH` verwenden. Die Auditprogramme starten private Unix-Sockets. Mit `AUDIT_REDIS_SERVER` und `AUDIT_REDIS_CLI` lassen sich getrennte Installationen auswählen. Die Timeout-Gruppe dauert gut 30 Sekunden.

```sh
git fetch origin refs/heads/audit-remediation/p0-20261126
git worktree add --detach ../dalton-check-base 0608cf575f6e46e3bbdee800c790ce5ae7c13235
git worktree add --detach ../dalton-check-first 42d651179b0928356568ce882703031e67b4b88e
git worktree add --detach ../dalton-check-v1 5a577232d4a07ef8cc032e100fccaed97d77c93d
git worktree add --detach ../dalton-check-reference 6a6275e63270f6baf09ae3e2d0d4a4abc54e76db
git worktree add --detach ../dalton-check-current c064aacffe33e2533a6eb96b475010489bdbe50a
for tree in ../dalton-check-base ../dalton-check-first ../dalton-check-v1 ../dalton-check-reference ../dalton-check-current; do
  npm --prefix "$tree" ci --ignore-scripts
done
node docs/audits/2026-11-27/pr116-recheck-6a6275e/check.mjs \
  ../dalton-check-base ../dalton-check-first ../dalton-check-v1 ../dalton-check-reference
node docs/audits/2026-11-27/pr116-recheck-c064aac/check.mjs \
  ../dalton-check-base ../dalton-check-first ../dalton-check-v1 ../dalton-check-current
DALTON_REQUIRE_LOCAL_REDIS=1 npm --prefix ../dalton-check-current test
```

[Prüfskript](check.mjs) · [Zustands- und Wiederanlaufproben](final-integrity-cases.mjs) · [Kandidat Redis 7](results-redis7.jsonl) · [Kandidat Redis 8](results-redis8.jsonl) · [Kontrolle Redis 7](control-6a6275e-redis7.jsonl) · [Kontrolle Redis 8](control-6a6275e-redis8.jsonl) · [Prüfmetadaten](verification.json)

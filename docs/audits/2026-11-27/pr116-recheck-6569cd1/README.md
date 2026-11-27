# Zehnte unabhängige Gegenprüfung von PR #116

**Die technische Sanierung kann noch nicht abgeschlossen werden. PR #116 sollte Draft bleiben.** Die Präsenzprüfung und die lokale Sync-Frist sind korrigiert. Ein bereits abgesandter Redis-Schreibvorgang oder eine Sperrakquisition kann jedoch nach der Antwort wirksam werden. Beide Fälle wurden ohne einen alten Writer und mit tatsächlichen Lua- bzw. SET-Operationen auf isoliertem Redis nachgestellt.

Prüfdatum 27. November 2026. Kandidat `6569cd13173d23ce8be1b57aa40d4afc6aeab7bd`, Vergleich `c064aacffe33e2533a6eb96b475010489bdbe50a`. [Systemaudit #115](https://github.com/tamorok44/dalton-dashboard/pull/115) · [Neunte Gegenprüfung](https://github.com/tamorok44/dalton-dashboard/pull/116#issuecomment-7219954732) · [Sanierungsnotiz](https://github.com/tamorok44/dalton-dashboard/pull/116#issuecomment-7221023800)

## Ausführung und Reichweite

- **124 bisherige Prüfgruppen** wurden am Vorgänger kontrolliert und mit identischen IDs am Kandidaten erneut ausgeführt. Dazu kamen **acht zusätzliche Gruppen** unter echtem lokalem Redis **7.0.15** und **8.0.2**. Je Version wurden damit **132 Gruppen** abgeschlossen.
- Die eigentlichen Zeitproben nutzten den unveränderten Handler und keine verkürzten Fristen. Sie maßen die 22- und 27-Sekunden-Grenzen gegen das konfigurierte 30-Sekunden-Functions-Limit und warteten nach echtem `SIGKILL` auf die natürliche 35-Sekunden-Lease-Expiry. Der Netzwerktransport war kontrolliert. Redis schrieb tatsächlich über private Unix-Sockets. Die Proben belegen die gemessene lokale Laufzeit und die Folgen bestimmter Transportzustände. Das Verhalten echter Provider und die Vercel-Terminierung sind getrennt abzunehmen.
- Die Repository-Suite bestand unter Node 22.23.5 / Redis 7 und Node 26.13.1 / Redis 8 jeweils mit **166 von 166**. Dashboard- und Add-on-CI waren grün. Der erste Browserlauf meldete vier erfolgreiche Jobs und einen abgebrochenen macOS-WebKit/iPhone-Job ohne verfügbare Schritte. Der separat neu angestoßene macOS-Job war bei Abschluss der Gegenprüfung in der Warteschlange. [Gesamttest](https://github.com/tamorok44/dalton-dashboard/actions/runs/46017422532) · [Add-on](https://github.com/tamorok44/dalton-dashboard/actions/runs/46017425015) · [Browser](https://github.com/tamorok44/dalton-dashboard/actions/runs/46017423084)

## Bestätigte Korrekturen und Zustandsübergänge

| Prüfbereich | Ergebnis |
| --- | --- |
| Präsenz und exakte Originalbytes | Ein zwischen Lesen und Commit angelegter leerer v2-Wert verwarf den ersten Commit. Die erneute Prüfung schrieb den leeren Wert und die neue Aufnahme in Quarantäne und ließ den leeren aktiven Rohwert unverändert. Dieselbe Matrix prüfte einen leeren v1-Wert, die Entfernung jeweils eines leeren v1-/v2-Werts und ein rein durch Leerzeichen verändertes v2-JSON. Der Commit reagierte auf alle vier Änderungen. |
| 22 Sekunden Arbeitszeit | Drei aufeinanderfolgende Redis-Belegtimeouts lieferten lokal bei rund **22,0 Sekunden** 503. Nach dem nachweisbaren Sperr-Cleanup blieb die ursprüngliche Aufnahme ausstehend. Der identische Wiederholungsversuch verarbeitete sie einmal. |
| 27 Sekunden einschließlich Cleanup | Verzögerte Ausführung des Freigabebefehls ließ den Handler nach rund **27,0 Sekunden** antworten. Das lokale 30-Sekunden-Limit blieb in diesen Proben eingehalten. |
| Späte Ergebnisse und geschlossene Kontexte | Ein unkooperativer Redis-JSON-Body und ein nach 23,5 Sekunden weitergelaufener Request-Body lösten keine neuen Redis-Anfragen nach Kontextschluss aus. War die Sperrfreigabe vorher erfolgreich, wurde auch ein danach wirklich ausgeführter alter Lua-Befehl von der inzwischen gültigen Sperre des Nachfolgers abgefangen. |
| Mehrdeutiger Erwerb und fehlgeschlagene Freigabe | Ging die Antwort eines bereits ausgeführten SET verloren, bestätigte ein Token-GET die Sperre. Ein fremder Besitzer blieb bei mehrdeutiger Antwort und Cleanup geschützt. Ein erfolgreich gespeicherter Sync behielt bei ausdrücklicher Freigabeverweigerung den HTTP-200-Empfangsbeleg. Andere Charaktere erhielten bis zur Sperrfreigabe 409. |
| Prozessabbruch, 35-Sekunden-Lease und andere Handler | Der gekillte Prozess hinterließ den ausstehenden Inhalt unverändert. Der reale manuelle Refresh meldete 202 und der Tageslauf 503 ohne fälschlichen Profilbeleg. Nach der natürlichen Lease-Expiry nach rund 35 Sekunden konnte ein anderer Charakter synchronisieren. Der Tageslauf speicherte seinen Profilbeleg unter seiner unveränderten 120-Sekunden-Sperre. Der Retry des ursprünglichen Add-ons verarbeitete die Aufnahme genau einmal. Eine alte Freigabe konnte den Nachfolger nicht entsperren. |
| Datenintegrität und Restore | Die bisherigen Nachweise für F01/F02, atomare Speicheroperationen, Reparaturbelege und historische Leser bleiben lokal bestehen. Der native RDB-Restore reproduzierte die exakten Kollisionsoriginale und den Ausweichbeleg. Die strikte JSON-Projektion sperrt einen beschädigten Bestand weiterhin für alte Leser. |

## 1. Technische Freigabeblocker

| Befund | Reproduktion und Abnahmekriterium |
| --- | --- |
| **P1 · Ein bereits abgesandter Beobachtungscommit schreibt nach 503.** | Zwei real dauernde, langsame Vorabfragen schoben die Absendung des Lua-Commits in die spätere Arbeitsphase. Seine tatsächliche Redis-Ausführung wurde bis rund 28,2 Sekunden verzögert. Die Freigabe war gleichzeitig noch ausstehend. Der Handler antwortete nach rund 27 Sekunden mit 503, der aktive Record war zu diesem Zeitpunkt leer. Der danach ausgeführte Lua-Befehl fand weiterhin denselben Besitzer und erzeugte den aktiven Record. Die Outbox blieb unverändert, ein späterer Replay war idempotent. Der Redis-Commit muss die Wirksamkeit des Verarbeitungskontexts auch nach Transportverzögerung und bei ausbleibender Freigabe atomar begrenzen. |
| **P1 · Ein verspäteter SET-NX kann nach abgeschlossenem Cleanup eine neue Sperre erzeugen.** | SET war abgesandt, beim Anbieter in der Testharness aber noch nicht ausgeführt. Nach dem 10-Sekunden-Timeout las die Anwendung eine leere Sperre, die Aufräumprüfung fand ebenfalls keinen Schlüssel und der Handler antwortete 503. Redis führte das ursprüngliche SET erst nach rund 28,2 Sekunden aus. Es entstand eine neu beginnende 35-Sekunden-Lease, und der Sync des anderen Charakters erhielt 409. Der Sperrerwerb braucht ein bei tatsächlicher serverseitiger Ausführung geprüftes spätestes Gültigkeitsfenster. Eine nachträgliche Freigabe darf dabei keinen fremden Besitzer entfernen. |

Die beiden Fälle geben keine Auskunft darüber, wie häufig ein realer Upstash-Transport so spät ausführt. Der Auditnachweis zeigt, dass das aktuelle serverseitige Sperr- und Schreibprotokoll diese Ausführung zulässt. [Zeitbudget](https://github.com/tamorok44/dalton-dashboard/blob/6569cd13173d23ce8be1b57aa40d4afc6aeab7bd/scripts/sync-deadline.mjs) · [Sperrakquisition und Freigabe](https://github.com/tamorok44/dalton-dashboard/blob/6569cd13173d23ce8be1b57aa40d4afc6aeab7bd/scripts/character-store.mjs#L44) · [Beobachtungscommit](https://github.com/tamorok44/dalton-dashboard/blob/6569cd13173d23ce8be1b57aa40d4afc6aeab7bd/scripts/live-knowledge-store.mjs#L275)

## 2. Notwendige betriebliche Abnahmen

- Die Provider-Abnahme muss das Verhalten bereits abgesandter Aufrufe bei Verbindungsabbruch, die tatsächliche Vercel-Terminierung, den Lua-Zeit- und Rechteschutz sowie das Auslaufen der Add-on-Lease in einer isolierten Infrastruktur belegen. Der lokal ausgeführte Provider-Probelauf ist an den neuen Commit gebunden und prüft die Lease zusätzlich zu Quarantäne, CAS, Rechten und Blob-Transport. Reale Upstash-/Blob-Bindung, Kontingente und nativer Provider-Restore bleiben offen. [Ausführbarer Abnahmeplan](INFRASTRUCTURE-ACCEPTANCE.md) · [Lokaler Probelauf](provider-smoke.jsonl)
- Die Stilllegung muss alte Writer am Speicher sperren und bereits abgesandte Befehle in der Drain-Phase berücksichtigen. Eine freie Sperre zu einem einzelnen Messzeitpunkt genügt wegen des verspäteten SET nicht. Erst nach nachgewiesenem Rechteentzug, beendetem Provider-Schreibverkehr, stabilen Fingerabdrücken und aufgelöster Outbox kann der autoritative Export beginnen. [Stilllegungsverfahren](WRITER-CUTOVER.md)

## 3. Optionale Optimierungen

32 einfache Beobachtungen lösten **96 Beobachtungsaufrufe** und **104 Redis-Aufrufe insgesamt** aus. Die Beobachtungsrequests stiegen durch die präzisere Lua-Prüfung von 117.312 auf **122.496 Byte** im Fixture. Bündelung und kompaktere Argumente können den Overhead senken, wenn die Präsenz- und Byteprüfungen sowie die Wiederaufnahme erhalten bleiben. Die realen Providerquoten und Laufzeiten großer Bestände sind betrieblich zu messen.

## Reproduktion

Node 22 oder 26 und die Redis-Zielversion auf `PATH` verwenden. Beide Programme starten private lokale Redis-Instanzen. `AUDIT_REDIS_SERVER` und `AUDIT_REDIS_CLI` können bei getrennten Installationen gesetzt werden. Zeitproben bei vergleichbarer Last parallel auf getrennten Instanzen starten oder je einzeln ausführen.

```sh
git fetch origin refs/heads/audit-remediation/p0-20261126
git worktree add --detach ../dalton-check-base 0608cf575f6e46e3bbdee800c790ce5ae7c13235
git worktree add --detach ../dalton-check-first 42d651179b0928356568ce882703031e67b4b88e
git worktree add --detach ../dalton-check-v1 5a577232d4a07ef8cc032e100fccaed97d77c93d
git worktree add --detach ../dalton-check-reference c064aacffe33e2533a6eb96b475010489bdbe50a
git worktree add --detach ../dalton-check-current 6569cd13173d23ce8be1b57aa40d4afc6aeab7bd
for tree in ../dalton-check-base ../dalton-check-first ../dalton-check-v1 ../dalton-check-reference ../dalton-check-current; do
  npm --prefix "$tree" ci --ignore-scripts
done
node docs/audits/2026-11-27/pr116-recheck-c064aac/check.mjs \
  ../dalton-check-base ../dalton-check-first ../dalton-check-v1 ../dalton-check-reference
audit=docs/audits/2026-11-27/pr116-recheck-6569cd1
node "$audit/check.mjs" ../dalton-check-base ../dalton-check-first ../dalton-check-v1 ../dalton-check-current
for scenario in late-observation late-observation-fenced late-acquisition late-read-resume late-request-body crash-and-shared-lease acquisition-and-release-loss byte-cas; do
  node "$audit/deadline-cases.mjs" ../dalton-check-current "$scenario" || exit
done
DALTON_REQUIRE_LOCAL_REDIS=1 npm --prefix ../dalton-check-current test
```

[124 Prüfgruppen](check.mjs) · [Zusätzliche Standalone-Proben](deadline-cases.mjs) · [Ergebnisse Redis 7](results-redis7.jsonl) · [Ergebnisse Redis 8](results-redis8.jsonl) · [Kontrolle Redis 7](control-c064aac-redis7.jsonl) · [Kontrolle Redis 8](control-c064aac-redis8.jsonl) · [Prüfmetadaten](verification.json)

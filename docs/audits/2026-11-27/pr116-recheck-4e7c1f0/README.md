# Elfte unabhängige Gegenprüfung von PR #116

**Die technische Sanierung kann noch nicht abgeschlossen werden. PR #116 sollte Draft bleiben.** Die Verlagerung der Arbeitsfrist in Redis behebt die beiden Fälle der zehnten Gegenprüfung bei konsistenter Redis-Zeit. Der bestätigte Widerruf ist jedoch gegenüber wiederholter Ausstellung nicht endgültig. Außerdem erzwingen Ausstellung und Erwerb keine Höchstfrist gegenüber der Uhr der ausführenden Redis-Instanz.

Prüfdatum 27. November 2026. Kandidat `4e7c1f0d7dda5021cb5ea062e9ac10abbc6a7c13`, Vorgänger `6569cd13173d23ce8be1b57aa40d4afc6aeab7bd`. [Systemaudit #115](https://github.com/tamorok44/dalton-dashboard/pull/115) · [Zehnte Gegenprüfung](https://github.com/tamorok44/dalton-dashboard/pull/116#issuecomment-7222629105) · [Sanierungsnotiz](https://github.com/tamorok44/dalton-dashboard/pull/116#issuecomment-7222909307)

## Ausführung und Reichweite

- Die **132 bisherigen Prüfgruppen** liefen unverändert als Kontrolle am Vorgänger und mit denselben IDs am Kandidaten. Die Ergebnisse wurden an die bewusst ersetzte 35-Sekunden-Lease angepasst. **Neun zusätzliche Gruppen** ergänzen die Matrix. Je Version wurden damit **141 Gruppen** unter echtem Redis **7.0.15** bzw. **8.0.2** abgeschlossen.
- Die Zeitproben liefen mit dem unveränderten **22-Sekunden-Arbeitsbudget**, der **27-Sekunden-Cleanup-Grenze** und dem konfigurierten **30-Sekunden-Functions-Limit**. Die Lease lief nach echtem `SIGKILL` natürlich ab. Alle Mutationen, Redis-Berechtigungen und Lua-Prüfungen liefen auf privaten Unix-Sockets. Mehrfachzustellung, verspätete Ausführung und die abweichende Zeitantwort wurden durch die Testharness ausgelöst.
- Die Repository-Suite bestand unter Node 22.23.5 / Redis 7 und Node 26.13.1 / Redis 8 jeweils mit **166 von 166**. Dashboard- und Add-on-CI waren grün. Vier Browserjobs waren erfolgreich. macOS WebKit/iPhone wurde im ersten Lauf abgebrochen; der gezielte Versuch stand beim Audit in der Warteschlange. [Dashboard](https://github.com/tamorok44/dalton-dashboard/actions/runs/46030878866) · [Add-on](https://github.com/tamorok44/dalton-dashboard/actions/runs/46030878835) · [Browser](https://github.com/tamorok44/dalton-dashboard/actions/runs/46030878780)

## Bestätigte Korrekturen und Zustandsübergänge

| Prüfbereich | Lokaler Nachweis |
| --- | --- |
| Absolute Frist und Ablauf | Unter konsistenter Redis-Zeit endet ein bereits ausgestelltes Permit am ursprünglichen absoluten Stichtag. Eine isolierte, verspätete Erstausstellung nach etwa 13,5 Sekunden war nach HTTP 503 vorübergehend vorhanden, erzeugte aber keinen gemeinsamen Lock. Die Erstausstellung nach etwa 28,2 Sekunden wurde serverseitig abgewiesen. Acht Stunden vor- und nachgehende Client-Wallclock änderten Permit und Lease nicht. |
| Widerruf und verspätete Sperrakquisition | Der normale Widerruf entfernte Permit und eigenen Token. Ein verzögerter Erwerb **vor** der ursprünglichen Frist wurde mit `ADDON_PERMIT_REVOKED` abgewiesen. Ein Erwerb **nach** der Frist wurde mit `ADDON_SYNC_DEADLINE` abgewiesen. Nach einer verlorenen Erwerbsantwort konnte die Anwendung den bereits gesetzten eigenen Token samt Permit bestätigen. Fremde Tokens blieben unverändert. |
| Späte Schreiboperationen und verlorene Antworten | Bei hängendem Cleanup antwortete der Handler nach rund **27,0 Sekunden**. Der tatsächlich anschließend zugestellte Beobachtungs-HSET wurde um **28,2 Sekunden** abgewiesen. Ein separates Core-MSET blieb nach Ablauf auch dann gesperrt, als der Test den alten Token nochmals in Redis eintrug. Charakterstand, Versionsstand und Empfangsbeleg blieben unverändert. Gefencete Cache-HSET- und Chronik-RPUSH-Aufrufe schrieben innerhalb der Frist und wurden nach ihr abgewiesen. |
| Atomarität und Recovery | Die Prüfungen der einzelnen MSET-/HSET-Commits, exakten v1-/v2-Originalbytes, alternativen Quarantänebelege und Belegreferenzen blieben stabil. Ein abgelehnter Beobachtungs-HSET beließ die genaue Outbox ohne falschen Empfangsbeleg. Der Retry verarbeitete die Aufnahme einmal. Ein nichtkooperativer Response-Body setzte keine neuen Redis-Operationen in Gang. |
| Echtes Prozessende und anderer Arbeitsablauf | Nach `SIGKILL` blieben die Outbox und die Sperre bis zur Originalfrist erhalten. Manueller Refresh und Tageslauf warteten bzw. meldeten die belegte Sperre. Nach natürlichem Ablauf konnte ein anderer Charakter synchronisieren. Der Tageslauf speicherte seinen Profilbeleg mit eigener unveränderter 120-Sekunden-Lease. |
| Redis-Rechte und Restore | Lokale ACLs für verweigertes `TIME` und `HSET` stoppten den betroffenen Pfad. Ohne `TIME` entstand kein Add-on-Permit, der normale Refresh-Lock blieb nutzbar. Bei verweigertem HSET blieb die Aufnahme ausstehend und war nach Wiedererteilung genau einmal verarbeitbar. Native lokale RDB-Wiederherstellung und historische Leser für vollständig belegte Exporte blieben kompatibel. |

## 1. Technische Freigabeblocker

| Befund | Reproduktion und Abnahmekriterium |
| --- | --- |
| **P1 · Derselbe Ausstellungsbefehl kann ein bereits widerrufenes Permit wieder anlegen.** | Die erste Ausstellung wurde bestätigt, der Erwerbsbefehl verzögerte sich. Nach seinem 10-Sekunden-Timeout bestätigte das Cleanup die Löschung des Permits. Die Anwendung antwortete 503. Die Harness stellte danach denselben Ausstellungsbefehl bei rund 13,5 Sekunden ein zweites Mal zu. Redis akzeptierte ihn und führte auch den ausstehenden Erwerb erfolgreich aus. Der neu belegte gemeinsame Lock blockierte den Sync eines anderen Charakters bis zur **ursprünglichen** Frist. Auf Redis wurde ein tatsächlicher wiederholter Befehl ausgeführt. Es wurde kein Verhalten des realen Upstash-Transportwegs behauptet. Der Widerruf muss innerhalb der restlichen Originalfrist dauerhaft gegen Mehrfachzustellung derselben Ausstellung wirken. |
| **P1 · Das maximale Zeitfenster ist gegenüber der ausführenden Uhr nicht begrenzt.** | Eine synthetische `TIME`-Antwort lag 40 Sekunden vor der tatsächlichen Uhr des ausführenden Redis. Ausstellung und Erwerb nahmen die daraus abgeleitete Frist an. Nach der lokalen 503-Antwort um 22 Sekunden zeigte Redis noch etwa **40 Sekunden** Lease. Der verzögerte echte Beobachtungs-HSET wurde danach angenommen. Die Testharness änderte keine Hostuhr. Das Ergebnis belegt die fehlende serverseitige Obergrenze für abweichende Zeitantworten, keine gemessene Anbieterabweichung. Freigabefähig sind eine innerhalb der ausführenden Uhr begrenzte Arbeitsfrist und ein Nachweis, wie Zeitquellen über Failover und Transport konsistent bleiben. |

Bei einer normalen einzelnen Zustellung mit konsistenter Redis-Zeit tragen Zeitprüfung und Token-Fencing am Speicher. Damit hängt der Beobachtungsschutz weniger vom rechtzeitigen HTTP-Abbruch ab. Das Zustandspaar für Ausstellung und Widerruf braucht zusätzlich eine endgültige Sperre gegen Wiederholung. Bei Zeitabweichung muss die Autorisierung mit einer sicheren Obergrenze fehlschlagen. [Ausstellung, Erwerb und Widerruf](https://github.com/tamorok44/dalton-dashboard/blob/4e7c1f0d7dda5021cb5ea062e9ac10abbc6a7c13/scripts/character-store.mjs#L44) · [Redis-Schreibschutz](https://github.com/tamorok44/dalton-dashboard/blob/4e7c1f0d7dda5021cb5ea062e9ac10abbc6a7c13/scripts/sync-deadline.mjs#L65)

## 2. Betriebliche Freigabevoraussetzungen

- Der lokal bestandene Anbieter-Probelauf mit **148 Redis-REST-Operationen** verwendet die echten Kandidatenskripte. Neu prüft er `TIME`, Permit und Lease mit `PXAT`, einen gefenceten Cache-Schreibvorgang, kontrollierten Widerruf und abgewiesene Wiederholung eines bereits abgesandten Schreibbefehls. Offen bleiben die realen Upstash-Rechte und Lua-Kompatibilität für alle verwendeten Schlüssel, die Konsistenz der Ausführungsuhr, tatsächliche Vercel-Terminierung, Blob-Bindung, Kontingente und Provider-Restore. [Ausführbarer Abnahmeplan](INFRASTRUCTURE-ACCEPTANCE.md) · [Lokaler Anbieter-Probelauf](provider-smoke.jsonl)
- Alte Writer vor dem autoritativen Export auf Speicherebene nachweislich stilllegen. Die aktualisierte Drain-Prüfung berücksichtigt bereits abgesandte Redis-Befehle, beide eigenen Lease-Schlüssel und möglichen Wiedererwerb nach einem vermeintlich leeren Lock. Reale Alt-Writer-Stilllegung und repräsentativer Provider-Restore stehen aus. [Stilllegungsverfahren](WRITER-CUTOVER.md)

## 3. Ressourcen und optionale Optimierungen

Bei 32 einfachen Beobachtungen blieben es **96 Beobachtungsaufrufe**. Die Gesamtzahl stieg von 104 auf **106 Redis-REST-Aufrufe**. Die Beobachtungsrequests stiegen einschließlich Lua und Argumenten von 122.496 auf **195.776 Byte**, rund 60 Prozent mehr. Die neue Lua-Hülle prüft `TIME` und den Token auch intern. Deren Betreiberabrechnung und Latenz sind gesondert zu messen. Kleinere oder wiederverwendete Skripte sowie sichere Bündelung kommen als Optimierungen in Betracht, wenn dieselben atomaren Prüfungen erhalten bleiben.

## Reproduktion

Node 22 oder 26 und die passende Redis-Version auf `PATH` verwenden. Die Auditprogramme starten eigene lokale Redis-Instanzen ohne TCP. `AUDIT_REDIS_SERVER` und `AUDIT_REDIS_CLI` lassen sich bei getrennten Installationen setzen.

```sh
git fetch origin refs/heads/audit-remediation/p0-20261126
git worktree add --detach ../dalton-check-base 0608cf575f6e46e3bbdee800c790ce5ae7c13235
git worktree add --detach ../dalton-check-first 42d651179b0928356568ce882703031e67b4b88e
git worktree add --detach ../dalton-check-v1 5a577232d4a07ef8cc032e100fccaed97d77c93d
git worktree add --detach ../dalton-check-reference 6569cd13173d23ce8be1b57aa40d4afc6aeab7bd
git worktree add --detach ../dalton-check-current 4e7c1f0d7dda5021cb5ea062e9ac10abbc6a7c13
for tree in ../dalton-check-base ../dalton-check-first ../dalton-check-v1 ../dalton-check-reference ../dalton-check-current; do
  npm --prefix "$tree" ci --ignore-scripts
done
reference=docs/audits/2026-11-27/pr116-recheck-6569cd1
audit=docs/audits/2026-11-27/pr116-recheck-4e7c1f0
node "$reference/check.mjs" ../dalton-check-base ../dalton-check-first ../dalton-check-v1 ../dalton-check-reference
node "$audit/check.mjs" ../dalton-check-base ../dalton-check-first ../dalton-check-v1 ../dalton-check-current
for scenario in late-observation late-observation-fenced late-acquisition late-read-resume late-request-body crash-and-shared-lease acquisition-and-release-loss byte-cas; do
  node "$reference/deadline-cases.mjs" ../dalton-check-reference "$scenario" || exit
  node "$audit/deadline-cases.mjs" ../dalton-check-current "$scenario" || exit
done
for scenario in delayed-permit issue-after-cutoff late-acquire-before-deadline permit-replay-after-revoke client-clock-offset provider-clock-divergence late-core-commit late-cache-and-history permissions; do
  node "$audit/deadline-cases.mjs" ../dalton-check-current "$scenario" || exit
done
DALTON_REQUIRE_LOCAL_REDIS=1 npm --prefix ../dalton-check-current test
```

[124 Kernprüfgruppen](check.mjs) · [17 Zeit- und Berechtigungsproben](deadline-cases.mjs) · [Kandidat Redis 7](results-redis7.jsonl) · [Kandidat Redis 8](results-redis8.jsonl) · [Kontrolle Redis 7](control-6569cd1-redis7.jsonl) · [Kontrolle Redis 8](control-6569cd1-redis8.jsonl) · [Prüfmetadaten](verification.json)

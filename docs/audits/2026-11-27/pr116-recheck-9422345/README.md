# Sechste unabhängige Gegenprüfung von PR #116

**Die technische Sanierung ist noch offen. PR #116 sollte Draft bleiben.** Die zentralen lokalen Nachweise für die ursprünglichen F01-/F02-Korrekturen halten. Der Kandidat kann aber einen fehlenden Originalbeleg als gesichert melden, beim beschädigten Speicher eine unbelegte Reparatur freigeben und einen unvollständig verifizierten Restore als vollständig ausweisen.

Prüfdatum 27. November 2026. Geprüfter Commit `94223457bd8a6d4986e49c2580efd4af638fa068`, Vorgänger `177b14712a1dbd26c569ecb670cc2906b10920d7`. Die Prüfprogramme berücksichtigen die ursprüngliche Auditbasis `0608cf5`, den ersten Sanierungsstand `42d6511` und den früheren v1-Schreiber `5a57723`. [Ursprüngliches Systemaudit](https://github.com/tamorok44/dalton-dashboard/pull/115) · [Fünfte Gegenprüfung](https://github.com/tamorok44/dalton-dashboard/pull/116#issuecomment-7215789960)

## Prüfaufbau und Reichweite

- Alle **74 bisherigen Prüfgruppen** liefen unverändert am Vorgänger erneut und wurden mit identischen Prüfgruppen-IDs am neuen Commit ausgeführt. Mit **14 Zusatzgruppen** wurden auf Redis **7.0.15** und **8.0.2** jeweils **88 Gruppen** abgeschlossen. Ein erfolgreicher Assert kann einen reproduzierten Fehler belegen. Die Ergebnistabelle erfasst die Bedeutung der neuen Proben.
- Redis lief isoliert über private Unix-Sockets ohne TCP. Getestet wurden echte ACL-Verweigerungen, Lua-Schreiboperationen und Sperren, tatsächliche `SIGKILL`-Abbrüche vor und nach Redis-Schreibbefehlen, RDB-Restore sowie historische Leser. Alle Nutzdaten waren synthetisch. Blob, Blizzard und weitere HTTP-Quellen wurden im Test abgefangen. Anbieterrechte, realer Verbrauch, Provider-Dauer und produktiver Restore bleiben eigenständige Nachweise.
- Die Repository-Suite meldete unter Node 22.23.5 mit Redis 7 und Node 26.13.1 mit Redis 8 jeweils **165/165**. [GitHub-Gesamttest](https://github.com/tamorok44/dalton-dashboard/actions/runs/45986972824) · [Add-on-CI](https://github.com/tamorok44/dalton-dashboard/actions/runs/45986972840) · [Browser und Performance](https://github.com/tamorok44/dalton-dashboard/actions/runs/45986972826) · [Prüfmetadaten](verification.json)

## Bestätigte Korrekturen

| Bereich | Beobachtung |
| --- | --- |
| **F01 und F02** | Der ursprüngliche F01-Schreibpfad und der F02-Datenverlust wurden an der Auditbasis reproduziert. Neue Roharchive verwenden den privaten, rostergebundenen Pfad. Zwei erfolgreiche parallele Add-on-Syncs erhalten beide Charakterstände. MSET sichert Kernbestand, Sync-Status und Version gemeinsam. HSET sichert Beobachtung/Versionsfeld beziehungsweise Tageszeile/Zeiger zusammen. Sperrverlust, abgewiesene Schreibbefehle, Wiederholung nach verlorener Antwort und ältere Wiederholungen wurden erneut geprüft. |
| **Quarantäne im Leser** | Der Leser sicherte beide Originalzeichenketten exakt, obwohl der tatsächliche alte Writer den v1-Gegenwert zwischen Erkennung und `HSETNX` ersetzte. Zwei konkurrierende Leser lösten zwei `HSETNX` aus und erzeugten ein einziges Feld. Ein nachfolgender identischer Abruf löste keinen weiteren Schreibvorgang aus. Der aktive v2-Record blieb gleich. |
| **Schreibverweigerung und Antwortverlust** | Die Redis-ACL verweigerte `HSETNX`. Der gefilterte Leser lieferte den konfliktfreien Nachbarrecord und meldete `preserved:false` sowie einen ungesicherten Konflikt. Bei verlorener Antwort nach vom Server ausgeführtem `HSETNX` meldete er zunächst ebenfalls `false`. Der nächste Abruf fand den exakten Beleg ohne weiteren Schreibvorgang. |
| **Zeit und Identität** | Bei strukturell beschädigtem Legacy-Record mit lesbarer Zeitgrenze bei +15 Sekunden blieb eine Aufnahme bei +5 Sekunden in Quarantäne. +16 Sekunden reparierte den Record. Abweichende NPCs zwischen Schlüssel, Record und Snapshot sowie ein falscher Beobachter im Händler-Snapshot wurden ausgeschlossen und gesichert. |
| **Legacy-Erkennung und Planer** | Ein fehlender Indexeintrag verhindert das Erkennen eines physisch vorhandenen v1-Strings bei bekanntem v2-Schlüssel nicht mehr. Nach einem unmarkierten Legacy-Schreibvorgang umging der Server die alte historische Cache-Projektion und isolierte den defekten Rohwert. Werkstatt, Ortsplaner und Berufsplaner lieferten HTTP 200 mit dem unabhängigen Katalogpreis 2.345. Physisch vorhandene Schlüssel ohne aktiven v2-Eintrag und ohne Legacy-Indexzugehörigkeit bleiben Aufgabe der Offline-Inventur. |
| **Inventur und alte Leser** | Fehlende, unerwartet auf `null` gesetzte oder veränderte Hälften eines bekannten Beobachtungspaars wurden erkannt. Historische Lesefunktionen aus `0608cf5` und `5a57723` lasen eine vollständige Projektion nach Restore in einen leeren Redis. Fertige konfliktbehaftete Projektionen setzen `completeForLegacyReaders:false`, wenn Konflikt oder Quarantäne vorliegt. Die historische Lernquellenlogik kann bei umgangener Sperre einen Rohpreis trotzdem heranziehen. |
| **Tageslauf und Fristen** | Tatsächlich ausgeführte Profilaktualisierung, semantisch gleicher Tagesbeleg, kanonischer Pfad, private Archivwiederaufnahme und atomarer Tagesabschluss blieben in den lokalen Proben nachweisbar. Der eigenständige Caller-Timer beendet das Warten auf eine hängende Operation. Der reale Provider-Abbruch bleibt separat zu messen. |

## 1. Technische Freigabeblocker

| Befund | Reproduktion und Abnahmekriterium |
| --- | --- |
| **P1 · Der Leser bestätigt fehlende oder falsche Quarantäne.** | Ein bereits vorhandenes Feld mit falschem Inhalt, das Entfernen nach der Feldauflistung und ein zeitgleich eingefügter falscher Inhalt führten auf beiden Redis-Versionen zu `preserved:true` und null gemeldeten ungesicherten Fällen. Anschließend ersetzte der echte ältere Writer den ursprünglichen v1-Wert. Eine Feldliste oder `HSETNX=0` belegt die Rohwerte nicht. Die Bestätigung muss den tatsächlichen, dauerhaft gespeicherten Beleg gegen den erwarteten Inhalt prüfen. Konkurrierende Leser müssen korrekte Rückgaben behalten. |
| **P1 · Beim Prozessabbruch vor dem ersten Sicherungsbefehl kann erkannte Evidenz verloren gehen.** | Nach `SIGKILL` zwischen Erkennung und `HSETNX` ersetzte der alte Writer den ursprünglichen Wert. Ein späterer Abruf beobachtete nur den neuen Wert. Beim Abbruch nach dem ausgeführten `HSETNX` blieben die exakten Originale erhalten. Ein sicherer Betrieb bei gleichzeitig aktiven Legacy-Writern erfordert einen abgesicherten Übergang oder die dauerhafte Erfassung vor dem Überschreiben. Für den Cutover ist die vorgezogene Schreibstilllegung zwingend, wenn der alte Writer keine Historie sichert. |
| **P1 · Falscher Redis-Schlüsseltyp wird beim Lesen als Abwesenheit behandelt.** | Ein nicht indizierter v1-Gegenwert vom Typ `list` ergab in `MGET` ein `null`. Der v2-Preis blieb ohne Integritätshinweis sichtbar. Der nächste Add-on-Sync und die identische Wiederholung lieferten 503. Der Kernstatus enthielt weiterhin ausstehende Beobachtungen. Typabweichungen müssen erkannt, der betroffene Gegenwert isoliert und ein überprüfbarer Wiederanlauf ermöglicht werden. |
| **P1 · Bei fehlender Datierung ist die automatische Reparaturgrenze offen.** | Bei zwei beschädigten Rohwerten ohne parsebare Zeit akzeptierte der Code eine 120 Sekunden alte Aufnahme automatisch als Reparatur. Die Quarantäne hielt die Originale, die zeitliche Reihenfolge blieb unbelegt. Für diesen Zustand braucht es eine belastbare Schranke oder einen expliziten Freigabepfad vor erneuter Veröffentlichung von Preisen. |
| **P1 · Der Rollback-Nachweis deckt nicht alle verwendeten Daten und Referenzen ab.** | Dieselbe unabhängige Kerninventur akzeptierte ein geändertes Pet-Metadatum, einen veränderten Tagesbeleg mit gewechselter v1/v2-Herkunft und ein anderes Datum/Scope. Beide Flags blieben `true` (`inventoryVerified` und `completeForLegacyReaders`). Ein aktiver Reparaturmarker ohne referenzierten Quarantänebeleg erzielte dieselben Flags. Der produktionsnahe Restore muss alle Projektionswerte und Belegreferenzen unabhängig binden und bei Abweichung hart stoppen. Die Prüfstufe auf diesem Audit-Branch weist beide Fälle ab. Die Software-Ausgabe des Kandidaten ist unverändert. |

Zwei frühere begrenzte Betriebsrisiken blieben reproduzierbar. Bei dauerhaftem Beobachtungsausfall blockiert die ausstehende Beobachtung sechs spätere Syncs desselben Charakters. Andere Charaktere konnten synchronisieren, nach Wiederanlauf wurde die Beobachtung einmal gespeichert. Für den Betrieb braucht es Sichtbarkeit und ein Erholungsverfahren. Die Archivkennzeichnung `complete` deckt Transport und Kernidentität ab. Ein optionaler Endpunkt kann mit fachlich nicht identifizierbarem Inhalt als vollständig eingehen. Beide Risiken müssen bei der Betriebsabnahme passend zum festgelegten Vertrag geprüft werden. [Leser und Speicher](https://github.com/tamorok44/dalton-dashboard/blob/94223457bd8a6d4986e49c2580efd4af638fa068/scripts/live-knowledge-store.mjs#L231) · [Reparatur und Identität](https://github.com/tamorok44/dalton-dashboard/blob/94223457bd8a6d4986e49c2580efd4af638fa068/scripts/storage-reconciliation.mjs#L82) · [Inventur](https://github.com/tamorok44/dalton-dashboard/blob/94223457bd8a6d4986e49c2580efd4af638fa068/scripts/restore-inventory.mjs) · [Offline-Restore](https://github.com/tamorok44/dalton-dashboard/blob/94223457bd8a6d4986e49c2580efd4af638fa068/scripts/storage-rollback-projection.mjs)

## 2. Notwendige Infrastrukturmaßnahmen

- Der bestehende Abnahmeplan wurde auf diesen Kandidaten angepasst. Die Providerprobe deckt jetzt Rechte für `HSETNX`, Read-only-Verweigerung bei einem echten Konfliktpfad, exakte Beleg-Rohwerte, Deduplizierung und die Trennung von aktivem Stand und Leserquarantäne ab. Der netzwerkfreie Probelauf verbrauchte **63 Redis-REST-Requests** in der Testharness und räumte seine synthetischen Daten auf. Die tatsächliche Upstash- und Vercel-Blob-Prüfung, Anbieter-Kontingente und Functions-Messungen stehen aus. [Abnahmeplan](INFRASTRUCTURE-ACCEPTANCE.md) · [Probelauf](provider-smoke.jsonl)
- Alte Writer vor der Exportinventur und Umschaltung stilllegen. Alle physischen Gegenwerte einschließlich nicht indizierter Schlüssel und Typabweichungen aus einer eingefrorenen Quelle erheben. Den unabhängigen SHA-256-Abgleich um Metadaten, Tagesbelege, Datum, Scope und Quarantänereferenzen ergänzen. Einen vollständigen Restore in einem leeren isolierten Ziel mit historischer und kompatibler Leselogik nachweisen. Den historischen schreibenden Betrieb aus der Rollback-Freigabe ausschließen.
- Private Store-Bindung, authentifizierten Abruf und anonymen Ausschluss, Unveränderlichkeit und Wiederaufnahme auf einem getrennten realen Blob-Teststore belegen. Öffentliche Altarchive inventarisieren. Für Quarantäne und private Archive verbindliche Kapazitäts-, Aufbewahrungs- und Exportgrenzen festlegen. Maßgeblich sind gemessene Kontingente im bestehenden Tarif und die realen Laufzeiten des Tagesjobs.

## 3. Optionale Optimierungen

- Im Fixture mit zwölf frischen Konflikten stieg der erste Lesevorgang von sechs auf **18 Redis-Befehle**, darunter zwölf serielle `HSETNX`. Deren Request-Bodys umfassten zusammen **46.344 Byte**. Die Wiederholung benötigte sechs Befehle und null Schreibaufrufe. Ein schlankerer Index, begrenzte parallele Prüfschritte und vom aktiven Hash getrennte, referenzierte Rohwerte können Abrufzeit und Wachstum mindern. Das Testfixture schätzt die Anbieterabrechnung nicht.
- Der Browser hält Werkstatt- und Ortsplaner-Abfragen 60 Sekunden im flüchtigen Anfragecache. Die reine Quarantänesicherung ändert keine Versionsmarke. Ein auf den Cutover begrenztes Cache-Invalidierungssignal könnte das Zeitfenster für früher geladene Ansichten weiter verkürzen. Der serverseitige historische Abruf wurde erfolgreich nach einem unmarkierten Legacy-Schreibvorgang geprüft. [Browser-Cache](https://github.com/tamorok44/dalton-dashboard/blob/94223457bd8a6d4986e49c2580efd4af638fa068/app.js#L1541)

## Reproduktion

Node 22 oder 26 und die jeweilige Redis-Version auf `PATH` verwenden. Ein Redis-Dienst ist entbehrlich. Die Skripte starten eine eigene Instanz ohne TCP in einem temporären Verzeichnis. `AUDIT_REDIS_SERVER` und `AUDIT_REDIS_CLI` können bei getrennten Installationen explizit gesetzt werden. Die Worktrees brauchen ihre jeweils festgeschriebenen Abhängigkeiten.

```sh
git fetch origin refs/heads/audit-remediation/p0-20261126
git worktree add --detach ../dalton-check-base 0608cf575f6e46e3bbdee800c790ce5ae7c13235
git worktree add --detach ../dalton-check-first 42d651179b0928356568ce882703031e67b4b88e
git worktree add --detach ../dalton-check-v1 5a577232d4a07ef8cc032e100fccaed97d77c93d
git worktree add --detach ../dalton-check-reference 177b14712a1dbd26c569ecb670cc2906b10920d7
git worktree add --detach ../dalton-check-current 94223457bd8a6d4986e49c2580efd4af638fa068
for tree in ../dalton-check-base ../dalton-check-first ../dalton-check-v1 ../dalton-check-reference ../dalton-check-current; do
  npm --prefix "$tree" ci --ignore-scripts
done
node docs/audits/2026-11-27/pr116-recheck-177b147/check.mjs \
  ../dalton-check-base ../dalton-check-first ../dalton-check-v1 ../dalton-check-reference
node docs/audits/2026-11-27/pr116-recheck-9422345/check.mjs \
  ../dalton-check-base ../dalton-check-first ../dalton-check-v1 ../dalton-check-current
DALTON_REQUIRE_LOCAL_REDIS=1 npm --prefix ../dalton-check-current test
```

Die JSONL-Dateien enthalten ausschließlich die bereinigten Ergebnisrecords. Ungefilterte Fehlertraces und Rohdaten werden für diesen Nachweis nicht benötigt.

- [Prüfskript](check.mjs) · [Neue Fehler- und Konkurrenzproben](read-evidence-cases.mjs) · [Kandidat Redis 7](results-redis7.jsonl) · [Kandidat Redis 8](results-redis8.jsonl)
- [Kontrolllauf Redis 7](control-177b147-redis7.jsonl) · [Kontrolllauf Redis 8](control-177b147-redis8.jsonl) · [Prüfmetadaten](verification.json)

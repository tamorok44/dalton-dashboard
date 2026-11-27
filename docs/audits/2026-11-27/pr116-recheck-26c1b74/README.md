# Siebte unabhängige Gegenprüfung von PR #116

**Die technische Sanierung bleibt offen. PR #116 sollte Draft bleiben.** Mehrere Befunde der sechsten Gegenprüfung sind behoben. Die Laufzeit prüft Reparaturbelege jedoch noch nicht in allen Speicherpfaden. Ein beschädigter Beleg kann weiterhin gültige Synchronisationen blockieren, und ein neuer Commit kann eine bereits entfallene Reparaturreferenz übernehmen.

Prüfdatum 27. November 2026. Kandidat `26c1b74065616d0b5f44b59ec9c0af990df7b2b0`, Vorgänger `94223457bd8a6d4986e49c2580efd4af638fa068`. Ursprüngliche Auditbasis `0608cf5`, erster P0-Stand `42d6511`, historischer v1-Schreiber `5a57723`. [Systemaudit #115](https://github.com/tamorok44/dalton-dashboard/pull/115) · [Sechste Gegenprüfung](https://github.com/tamorok44/dalton-dashboard/pull/116#issuecomment-7216892915)

## Prüfaufbau und Umfang

- Die **88 bisherigen Prüfgruppen** liefen als unabhängige Kontrolle am Vorgänger und mit identischen IDs auf dem neuen Kandidaten. Mit **11 Zusatzgruppen** wurden **99 Gruppen** auf Redis **7.0.15** und **8.0.2** abgeschlossen. Erfolgreiche Assertions dokumentieren auch absichtlich reproduzierte Fehler.
- Die Instanzen verwendeten private Unix-Sockets und synthetische Daten. ACLs, Sperrverlust, Redis-Typen, echte Prozessabbrüche, RDB-Restore sowie historische und aktuelle Handler liefen lokal. HTTP-Transport für Blob und externe Quellen wurde abgefangen. Der Provider-Probelauf ersetzte weder echte Kosten- noch Berechtigungs- oder Restore-Nachweise.
- Die Repository-Suite bestand unter Node 22.23.5 mit Redis 7 und Node 26.13.1 mit Redis 8 jeweils mit **165 von 165 Prüfungen**. Alle drei GitHub-Workflows waren grün. [Gesamttest](https://github.com/tamorok44/dalton-dashboard/actions/runs/45989793209) · [Add-on](https://github.com/tamorok44/dalton-dashboard/actions/runs/45989793147) · [Browser und Performance](https://github.com/tamorok44/dalton-dashboard/actions/runs/45989793299)

## Bestätigte Korrekturen

| Bereich | Nachweis |
| --- | --- |
| Inhalt der Quarantäne | Fehlende Felder werden erneut geschrieben und zurückgelesen. Ein vorhandener schlechter oder konkurrierend angelegter falscher Beleg bleibt unverändert und wird als ungesichert gemeldet. Bei zwei konkurrierenden identischen Lesern entsteht ein Beleg. Verweigerung und verlorene Antwort bleiben konservativ sichtbar. |
| Reparaturreferenzen | Für den v2-Marker schließen fehlende oder manipulierte Referenzen, falscher Feld-Digest, anderer Record, Legacy-Hash oder Reparaturzeit den Preis aus. Die Offline-Projektion prüft beide Paarhälften und lehnt diese Fälle ab. Syntaktische JSON-Formatierung bleibt bei der kanonischen Referenzprüfung irrelevant. Der Bytevergleich des gespeicherten Leserbelegs und die exakten Exporthashes wurden separat getestet. |
| Falscher Redis-Typ | Bei Legacy-Listen, Hashes und Sorted Sets scheidet der Preis aus. Die gesonderte Eingangevidenz enthält den Typmarker, der native Wert bleibt am Originalschlüssel. Der Charakter-Sync antwortet mit 200, Pending wird abgeräumt und der nächste gültige Sync läuft weiter. Der Leser markiert das nicht als vollständige Sicherung des nativen Originals. |
| Unbekannte Reihenfolge | Ohne parsebare Zeit oder bei einer unbekannten Paarhälfte neben einer eindeutig datierten bleibt der neue Eingang gesichert und der Preis ausgeschlossen. Mit einem lesbaren Mindestzeitpunkt in beschädigtem JSON blieb die zu alte Aufnahme ausgeschlossen, die eindeutig jüngere reparierte. |
| Inventur und Restore | Präsenz und SHA-256 beider Seiten, Scope, Datum, Pet-Metadaten, beide Tagesbelege sowie Quarantäne und Referenzen sind gebunden. Historische Leser aus `0608cf5` und `5a57723` funktionierten mit intakter Projektion im leeren Redis nach RDB-Neustart. Der Prüfkandidat gibt bei Quarantäne `completeForLegacyReaders:false` aus. Das zusätzliche Offline-Gate verweigerte auf dieser realen Projektionsausgabe die Freigabe historischer Leser. |
| Ursprüngliche F01 und F02 | Privater kanonischer Archivpfad, Wiederaufnahme nach akzeptiertem Upload, dauerhafter Tagesbeleg, atomarer Tageszeiger sowie beide Charakterstände nach konkurrierenden erfolgreichen Syncs blieben nachweisbar. Das tatsächliche Verhalten der Produktionsbindung ist Teil der Provider-Abnahme. |

## 1. Zwingende technische Freigabeblocker

| Befund | Reproduktion und Abnahmekriterium |
| --- | --- |
| **P1 · Reparaturreferenz der Legacy-Hälfte bleibt zur Laufzeit ungeprüft.** | Ein reparierter Record lag ausschließlich in v1. Sein Quarantänebeleg fehlte. Der aktuelle Leser lieferte den synthetischen Preis 31 ohne Integritätsmeldung. Dieselbe Eingabe wurde von der Offline-Projektion abgelehnt. Beide Hälften müssen vor Übernahme einer Reparatur nach denselben Regeln geprüft werden. |
| **P1 · Beschädigter Quarantänebeleg blockiert gültige Folge-Syncs.** | Ein beim HSET-Commit vorgefundenes Feld mit falschen Bytes löste korrekt eine Schreibverweigerung aus. Der Kernstatus blieb ausstehend. Eine spätere gültige reine Charakter-Synchronisation desselben Charakters erhielt erneut 503. Ein anderer Charakter erhielt 200. Erst manuelle Bearbeitung des kollidierenden Testbelegs ermöglichte die Fortsetzung. Der neue Pfad muss die angekommene Beobachtung dauerhaft und überprüfbar isolieren, ohne falschen Beleg zu überschreiben oder alle Folge-Syncs des Charakters an die Reparatur zu binden. |
| **P1 · Referenzprüfung und Commit können auseinanderlaufen.** | Nach erfolgreichem `HGET` des Reparaturbelegs und vor dem geschützten `HSET` wurde der Beleg im Test entfernt. Der neue Sync meldete 200 und räumte Pending ab, obwohl seine referenzierte Reparaturbasis bereits fehlte. Der nächste Lesevorgang schloss die neue Beobachtung aus. Das Interleaving lief ohne alten Writer. Die Integritätsprüfung der übernommenen Referenz muss Teil derselben Commit-Bedingung sein oder einen überprüfbaren Wiederanlauf auslösen. |
| **P1 · Ein Fehler beim Lesen eines Reparaturbelegs betrifft den ganzen Abruf.** | Eine einzelne fehlgeschlagene `HGET`-Antwort für einen Reparaturbeleg ließ `loadLiveKnowledge` insgesamt fehlschlagen, obwohl eine zweite gesunde Beobachtung vorlag. Bei Wiederholung ohne Störung waren beide wieder verfügbar. Eine fehlende Bestätigung muss den betroffenen Record ausschließen und die übrigen unabhängig lesbaren Records erhalten. |

Quellstellen. [Typprüfung, Reparaturbeleg und Commit](https://github.com/tamorok44/dalton-dashboard/blob/26c1b74065616d0b5f44b59ec9c0af990df7b2b0/scripts/live-knowledge-store.mjs#L223) · [Iterativer Abruf](https://github.com/tamorok44/dalton-dashboard/blob/26c1b74065616d0b5f44b59ec9c0af990df7b2b0/scripts/live-knowledge-store.mjs#L338) · [Belegvalidierung](https://github.com/tamorok44/dalton-dashboard/blob/26c1b74065616d0b5f44b59ec9c0af990df7b2b0/scripts/storage-reconciliation.mjs#L134) · [Offline-Inventur](https://github.com/tamorok44/dalton-dashboard/blob/26c1b74065616d0b5f44b59ec9c0af990df7b2b0/scripts/restore-inventory.mjs#L33)

## 2. Betriebliche Freigabevoraussetzungen

- **Stilllegung vor dem autoritativen Export ist fachlich tragfähig und zwingend.** Der Originalverlust bei `SIGKILL` vor `HSETNX` und danach weiterlaufendem altem Writer blieb reproduzierbar. Dieses Szenario liegt außerhalb der neuen Betriebsgrenze. Die unabhängige Testprobe mit echtem Legacy-Handler zeigte lokal einen wirksamen Speicherentzug. Der alte Handler schrieb vor dem Entzug, lieferte danach 503 und der Datenstand blieb gleich. Der neu zugelassene Testbenutzer konnte schreiben. Für den realen Cutover sind sämtliche alte und fremde Writer, gespeicherte Zugangsdaten, direkte Deployment-URLs, laufende Jobs, Cron, Wartezeiten und Seiteneffekte lesender Endpunkte zu erfassen und technisch zu sperren. [Writer-Stilllegung](WRITER-CUTOVER.md)
- **Physische Inventur, Restore und Sperre alter Leser.** Ein physisch vorhandener Nicht-String kann im reinen Offline-JSON als `legacy:null` durchgehen, wenn sowohl Export als auch abgeglichene Inventur die falsche Annahme teilen. Daher die eingefrorene Quelle separat typbewusst inventarisieren, Originalwerte im nativen Backup erhalten und jede Type-/Index-Abweichung vor der Umschaltung auflösen. Ein inkompatibles Manifest sperrt ältere Leser im Abnahme-Gate. Die forensische Kandidatenprojektion kann trotzdem ausführbare Redis-Befehle für den Klon ausgeben. Umschaltwerkzeuge müssen das Gate verbindlich auswerten. Der alte Lernquellenpfad kann andernfalls ausgeschlossene Preise aus rohen Add-on-Daten ableiten. [Prüf-Gate](migration-gate.mjs)
- **Tatsächliche Provider-Abnahme.** Der aktualisierte Probelauf bestand mit **94 simulierten REST-Aufrufen** über echtes Redis und abgefangenen Blob-Transport. Geprüft wurden typbewusstes Lua, gezielte `HSETNX`-Verweigerung, Inhaltsvergleich, falscher Typ und private Blob-Wiederaufnahme. Der echte Upstash- und Blob-Lauf, Berechtigungen, Tarifkontingente, Provider- und Functions-Dauer, Inventur öffentlicher Altarchive, Quarantäneaufbewahrung und ein repräsentativer Restore stehen aus. Bei Dauerstörung der Beobachtungsspeicherung braucht der bestehende 503-/Outbox-Pfad ein Erholungs- und Überwachungsverfahren. Archiv-`complete` belegt weiterhin die geprüfte Kernidentität und Transportqualität. [Infrastruktur-Abnahme](INFRASTRUCTURE-ACCEPTANCE.md) · [Lokaler Probelauf](provider-smoke.jsonl)

## 3. Optionale Optimierungen

- Bei zwölf neuen Konflikten brauchte der Abruf **42 REST-Operationen** gegenüber 18 im Vorgänger. Die Wiederholung benötigte **18 statt 6**, jeweils ohne neuen Schreibzugriff. Der Mehraufwand besteht aus je zwei Inhaltsabfragen bei neuem Beleg bzw. einer beim bereits vorhandenen. Ein intakter reparierter Record verursachte fünf statt vier Aufrufe. Die zwölf `HSETNX`-Requestbodys umfassten zusammen 46.344 Byte. Das sind Testharnesswerte, Anbieterabrechnung und interne Lua-Aufrufe bleiben gesondert zu messen.
- Felder eines Batches lesen und Inhaltsprüfungen gebündelt auswerten, ohne einzelne Fehler in den gesunden Bestand zu tragen. Ein aktiver Index ohne Quarantänefelder mindert `HKEYS`-Volumen. Eine vollständige, überprüfbare Aufbewahrung und ein Größenbudget für Quarantäne bleiben Betriebsbedingungen.

## Reproduktion

Node 22 oder 26 und Redis 7 bzw. 8 auf `PATH` verwenden. Die Skripte starten isolierte Redis-Instanzen ohne TCP. Bei getrennten Installationen `AUDIT_REDIS_SERVER` und `AUDIT_REDIS_CLI` setzen.

```sh
git fetch origin refs/heads/audit-remediation/p0-20261126
git worktree add --detach ../dalton-check-base 0608cf575f6e46e3bbdee800c790ce5ae7c13235
git worktree add --detach ../dalton-check-first 42d651179b0928356568ce882703031e67b4b88e
git worktree add --detach ../dalton-check-v1 5a577232d4a07ef8cc032e100fccaed97d77c93d
git worktree add --detach ../dalton-check-reference 94223457bd8a6d4986e49c2580efd4af638fa068
git worktree add --detach ../dalton-check-current 26c1b74065616d0b5f44b59ec9c0af990df7b2b0
for tree in ../dalton-check-base ../dalton-check-first ../dalton-check-v1 ../dalton-check-reference ../dalton-check-current; do
  npm --prefix "$tree" ci --ignore-scripts
done
node docs/audits/2026-11-27/pr116-recheck-9422345/check.mjs \
  ../dalton-check-base ../dalton-check-first ../dalton-check-v1 ../dalton-check-reference
node docs/audits/2026-11-27/pr116-recheck-26c1b74/check.mjs \
  ../dalton-check-base ../dalton-check-first ../dalton-check-v1 ../dalton-check-current
DALTON_REQUIRE_LOCAL_REDIS=1 npm --prefix ../dalton-check-current test
```

[Prüfskript](check.mjs) · [Zusatzproben](final-integrity-cases.mjs) · [Kandidat Redis 7](results-redis7.jsonl) · [Kandidat Redis 8](results-redis8.jsonl) · [Kontrolle Redis 7](control-9422345-redis7.jsonl) · [Kontrolle Redis 8](control-9422345-redis8.jsonl) · [Prüfmetadaten](verification.json)

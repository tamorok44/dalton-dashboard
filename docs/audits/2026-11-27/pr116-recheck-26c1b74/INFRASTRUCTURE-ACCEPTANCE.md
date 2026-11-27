# Abnahmeplan für Upstash und Vercel Blob

Stand 27. November 2026. Für Commit `26c1b74065616d0b5f44b59ec9c0af990df7b2b0`. Alle schreibenden Prüfungen dieses Plans laufen erst nach separater Freigabe auf dafür vorgesehenen, isolierten Testressourcen mit synthetischen Daten. Der aktualisierte Plan deckt typbewusste Lua-Lesezugriffe, bytegenaue Bestätigung von Leserquarantäne, Scope-/Datumsbindung und Reparaturreferenzen ab. Die [nachweisbare Stilllegung alter Writer](WRITER-CUTOVER.md) ist vor jedem autoritativen Export verbindlich. Der lokale Probelauf nutzte echtes Redis und abgefangenen Blob-Transport. Der Providerlauf, der repräsentative Restore und die Prüfung der produktiven Bindungen stehen aus. Die offenen Softwarefehler im [Prüfbericht](README.md) bleiben auch bei bestandener Infrastrukturprobe Freigabestopps.

## 1. Ziele, Berechtigungen und Kostenrahmen prüfen

1. Eine zugängliche, dedizierte Upstash-Testdatenbank und einen dedizierten privaten Blob-Teststore aus dem richtigen Team auswählen. Herkunft, Tarif, Region, Grenzwerte und verbleibenden Verbrauch dokumentieren. Keine Tarifänderung vornehmen. Provider-ID und Projektzuordnung anhand der Verwaltungsoberfläche abgleichen. Für beide Systeme die Produktionskennung getrennt und ohne Geheimnisse erfassen, damit der Prüflauf ein identisches Ziel ablehnt.
2. Temporäre Schreibberechtigungen für die beiden Testressourcen sowie einen separaten Upstash-Read-only-Token für die Negativprobe verwenden. Die bereits vorgesehene OAuth-Leseberechtigung für Admin-/Verbrauchsprüfungen bleibt vom REST-Testzugang getrennt. Secrets über eine lokale Secret-Verwaltung oder einen geschützten Testjob einbinden. Werte weder in Trace noch in Shell-Verlauf, Audit-Branch oder PR kopieren.
3. Für den kleinen Befehlslauf mindestens 122 Redis-REST-Aufrufe Platz im vorhandenen Kontingent einplanen. Das Skript stoppt nach 120 Testaufrufen und reserviert zwei weitere für gezielte Bereinigung und deren Prüfung. Es begrenzt Redis-Requestbodys auf 64 KiB, verwendet eine zufällige Redis-Präfixgruppe ohne Hash-Tag und ein eigenes kleines, kanonisches Blob-Objekt. Separat Platz für die repräsentative Wiederherstellung kalkulieren. Bei Budgetüberschreitung, falschem Ziel oder unsicherer Bindung aussetzen. [Upstash-REST-Schnittstelle und Token](https://upstash.com/docs/redis/features/restapi) · [Vercel Private Storage](https://vercel.com/docs/vercel-blob/private-storage)

## 2. Kleine Befehls- und Berechtigungsprobe ausführen

Node 22 oder 26, Git und die Abhängigkeiten des exakten Kandidaten voraussetzen. Zuerst lokal aus dem Audit-Branch prüfen.

```sh
candidate=../dalton-check-current
audit=docs/audits/2026-11-27/pr116-recheck-26c1b74
npm --prefix "$candidate" ci --ignore-scripts
node "$audit/provider-acceptance.mjs" --self-test
node "$audit/verify-restore-inventory.mjs" --self-test
node "$audit/migration-gate.mjs" --self-test
node "$audit/provider-acceptance-smoke.mjs" "$candidate"
```

Für den freigegebenen tatsächlichen Lauf folgende Werte aus der Secret-Verwaltung in den Prozess geben. Die Herkunft des Blob-Tokens und der REST-Tokens direkt beim Anbieter prüfen.

| Umgebungsvariable | Erwarteter Inhalt |
| --- | --- |
| `DALTON_AUDIT_TARGET_CONFIRMATION` | `ISOLATED_DISPOSABLE_TEST_RESOURCES` nach Zuordnungsprüfung |
| `DALTON_AUDIT_UPSTASH_TEST_ORIGIN` | Eigener HTTPS-Origin der Testdatenbank |
| `DALTON_AUDIT_UPSTASH_PRODUCTION_ORIGIN` | Produktions-Origin als Sperrvergleich |
| `DALTON_AUDIT_UPSTASH_TEST_WRITE_TOKEN` | Temporärer Schreibtoken ausschließlich für das Testziel |
| `DALTON_AUDIT_UPSTASH_TEST_READ_TOKEN` | Eigenständiger ausschließlich lesender Testtoken |
| `DALTON_AUDIT_BLOB_TEST_STORE_ID` | ID des dedizierten privaten Teststores, ohne `store_`-Präfix |
| `DALTON_AUDIT_BLOB_PRODUCTION_STORE_ID` | Produktions-Store-ID als Sperrvergleich, ohne Präfix |
| `DALTON_AUDIT_BLOB_TEST_WRITE_TOKEN` | Server-Token passend zur privaten Teststore-ID |

```sh
node "$audit/provider-acceptance.mjs" "$candidate" > provider-acceptance.jsonl
```

**Abnahmebedingungen.** Der geprüfte Commit und die isolierten Ziele müssen übereinstimmen. Das Skript muss `finished.result=passed` und `cleanupPassed=true` ausgeben. Die tatsächlichen Redis-Lua-Operationen aus dem Kandidaten führen gemeinsam `MSET` für Roster, Sync-Status und Version sowie `HSET` für Tageszeile/Zeiger und Beobachtung/Quarantäne aus. Das Skript prüft typbewussten Lua-Transport (`EVAL` mit `TYPE` und ggf. `GET`) unter dem abgestuften serverseitigen App-Zugang. Für den separaten Read-only-REST-Token dokumentiert es ausdrücklich, ob ein reines Typ-Lua-Skript erlaubt ist. Die `HSETNX`-Negativprobe schränkt nur den Aufruf des Schreibbefehls auf Read-only ein, damit eine vorgelagerte Lua-Verweigerung den Test nicht verdeckt. Bei erlaubtem serverseitigem `HSETNX` muss der Leser genau einen Beleg mit beiden exakten Rohwerten sichern. Ein wiederholter Abruf bestätigt seinen Inhalt per `HGET`. Ein manipulierter Beleg muss als ungesichert gemeldet und unverändert gelassen werden. Aktiver Record und Version bleiben beim reinen Lesepfad unverändert. Ein falsch typisierter v1-Listenwert muss getrennt gemeldet und physisch erhalten werden, während die neue synthetische Beobachtung kontrolliert in Quarantäne eingeht. Abgewiesene MSET-/HSET-Schreibpfade und ein fremder Lock müssen den vorherigen Zustand erhalten.


Für Blob authentifiziert dieselben gzip-Bytes per `get` abrufen und SHA-256 vergleichen. Ohne Auth muss der Abruf des existierenden privaten Objekts 401, 403 oder 404 liefern. Ein zweiter Schreibversuch unter demselben Pfad muss abgewiesen werden, der anschließende authentifizierte Hash muss übereinstimmen. Das Skript verifiziert die kanonische private URL und prüft nach der Bereinigung die Abwesenheit des eigenen Objekts. Anbieterfehler separat anhand des isolierten Testprojekts diagnostizieren. [Blob-SDK](https://vercel.com/docs/vercel-blob/using-blob-sdk)

## 3. Vollständigkeit des Exports unabhängig belegen

1. Die Stilllegung nach dem [Writer-Verfahren](WRITER-CUTOVER.md) inklusive providerseitiger Sperren, Drain und zweifachem Fingerabdruck belegen. Erst danach die eingefrorene Quelle als unveränderten Anbieter-Export sichern und protokollieren. Für eine Abnahme zunächst synthetischen oder bereits bereinigten repräsentativen Inhalt verwenden. Niemals aus dem Audit-Branch produktive Schreibpfade aktivieren.
2. Zwei voneinander unabhängige Durchläufe aus demselben eingefrorenen Bestand verwenden. Ein Durchlauf exportiert die Rohwerte. Der andere erfasst schrittweise per `SCAN` (physische v1-Sync- und Legacy-Record-Keys) sowie `HSCAN` (aktive v2- und Quarantänefelder, Tageszeilen) alle relevanten Schlüssel bis Cursor 0. `SSCAN` des alten Beobachtungsindex separat mit den physisch vorhandenen v1-Records vergleichen. Waisen in beide Richtungen als Inventurdifferenz ausweisen. Bei doppelten Seitenergebnissen nach Schlüssel deduplizieren, dann Anzahl, physische Keytypen, exakte Hashes und Präsenz je Quelle vergleichen. Bei jedem aktiven v2-Schlüssel den physischen v1-Gegenwert auch ohne Indexeintrag erfassen. Erst `TYPE` kann Abwesenheit von einem Nicht-String-Schlüssel trennen. Ein Nicht-String ist eine Abweichung mit eigenem physisch gesichertem Original und blockiert den Rollback. Das Quarantäne-JSON enthält für solche Fälle einen Typmarker und keine Kopie des nativen Redis-Werts.
3. Die unabhängige JSON-Inventur enthält `rosterSha256`, `addons` mit `slug` und `sha256`, `knowledge` mit `key`, `modernSha256` und `legacySha256`, `days` mit `date` und `sha256` sowie `quarantine` mit `field` und `sha256`. Ein tatsächlich fehlender Wert wird explizit als `null` erfasst. Quarantäne und beide Seiten eines Beobachtungspaars als exakte ursprüngliche UTF-8-Zeichenketten hashen. Zusätzlich den unabhängigen Block `projectionInputs` mit `scope`, `date`, `petMetadataSha256`, `modernReceiptSha256` und `legacyReceiptSha256` erfassen. Für Roster, Sync, Tagesobjekt, Pet-Metadaten und Tagesbelege rekursiv sortierte JSON-Objektschlüssel und unveränderte Arrayreihenfolge verwenden. Ein fehlender Beleg oder fehlende Pet-Metadaten werden mit dem SHA-256 der JSON-Zeichenkette `null` ohne Anführungszeichen erfasst. Die Projektionsdatei muss die fünf Eingaben explizit liefern. Vollbackup und sensible Rohdaten ausschließlich in geschützter Ablage halten.
4. Das aus der unabhängigen Erfassung stammende Inventar gegen den Offline-Export prüfen. Die Exportdatei folgt der Eingabe von `buildLegacyReadProjection`. Bei `knowledgePairs` werden `modern` und `legacy` für jedes Paar explizit geliefert und vorhandene Rohwerte bleiben Zeichenketten. Fehlende Seiten, falsche Hashes, fehlende Quarantäne und nicht auflösbare Waisen sind Stoppsignale. Der Kandidat prüft die SHA-256-Hashes des Kernbestands. Die unabhängige Prüfstufe bindet zusätzlich die Eingaben für Metadaten und kontrolliert den Feld-Digest sowie die Referenzen aus beiden Speicherformaten auf den jeweils zugehörigen Quarantänebeleg. Die Inventur und der Export müssen aus separaten Durchläufen stammen.

```sh
node "$audit/verify-restore-inventory.mjs" /sicher/export.json /sicher/inventur.json
node "$audit/migration-gate.mjs" restore /sicher/stilllegung.json /sicher/export.json /sicher/inventur.json "$candidate"
```

## 4. Projizieren, wiederherstellen und Leser vergleichen

1. Vollbackup in eine zweite leere isolierte Redis-Testinstanz laden. Die Projektion zusätzlich in einen separaten leeren Klon schreiben, damit der Vergleich v1/v2 und der Rücksprung getrennt beobachtbar sind. `buildLegacyReadProjection` liefert Befehle und Manifest. Befehle vor Ausführung gegen das Testziel und erlaubte Schlüsseltypen prüfen. Die JSON-Ausgabe enthält Rohdaten und verbleibt in der geschützten Ablage. Die ursprüngliche Quelle nur lesend verwenden. [Upstash Backup und Restore](https://upstash.com/docs/redis/features/backuprestore)
2. Die unveränderten Lesefunktionen aus `0608cf5` und `5a57723` sowie den für Rollback vorgesehenen kompatiblen Code mit demselben synthetischen Input ausführen. Roster, Sync-Status, Preis-/Beobachtungsprojektion, Tageszeiger, Tagesbeleg und Quarantäne-Originalwerte mit dem eingefrorenen Manifest abgleichen. Wiederanlauf nach Neustart, Quarantäne-Auflösung nach erneutem Legacy-Write und Abbruch nach akzeptiertem Blob-Upload jeweils in der isolierten Instanz nachstellen. Konflikte, `completeForLegacyReaders:false`, fehlende Daten, ein fehlender Quarantänebeleg und Leaks über rohe Add-on-Quellen blockieren die Umschaltung. `inventoryVerified:true` des Kandidaten allein gibt die Umschaltung nicht frei. Vor einer späteren Aktivierung alter Leser zusätzlich `migration-gate.mjs legacy-reader` ausführen und Exitcode 0 verlangen. Das freigegebene Manifest samt Datum, Scope, Versionsanker und Hash der Befehlsliste sowie die Resultate der historischen Reader-Proben sichern.
3. Vor einer späteren Betriebsfreigabe einen kompatiblen, geprüften Deployment-Anker benennen. Schreibstilllegung, Umschaltreihenfolge, Restore-Zeit, maximal tolerierbaren Verlustzeitraum und Abbruchsignal schriftlich verifizieren. Frühere P0-Writer eignen sich als alte Reader für Nachweise. Der Test gibt deren schreibende Aktivierung nicht frei.

## 5. Ressourcen und Betriebsgrenzen nachweisen

Die Testabrechnung vor und nach genau einem Lauf erfassen und mit den ausgegebenen JSON-Requestcounts abgleichen. HTTP-Rundlaufzeiten und tatsächliche Functions-Dauer getrennt messen. Die kleine Probe belegt den Provider-Transport und seine Rechte. Sie ersetzt kein geschütztes End-to-End-Fixture für den täglichen Refresh.

Auf einer freigegebenen geschützten Preview-Teststrecke mit ausschließlich isolierten Diensten Tagesablauf, Archivqualität, Wiederaufnahme und Fehlersignale messen. Die normale Preview sperrt Produktions-Cron/Archivierung. Der Test benötigt einen getrennten internen Runner oder eine überprüfte Testharness mit synthetisch injizierter Uhr. Die echten Produktions-Endpunkte bleiben aus dem Versuch ausgeschlossen. Als Abnahmeziel sind mindestens 10 Sekunden Abstand zum 60-Sekunden-Tageslimit und 5 Sekunden zum 30-Sekunden-Sync-Limit vorgesehen. Einen kleinen Erfolgsdurchlauf und je einen Fall für langsamen Provider, abgewiesenen HSET und Wiederaufnahme nach Upload dokumentieren. Im Ausfalltest zusätzlich nach dem Lesen, vor dem bestätigten `HSETNX` und nach dessen serverseitiger Ausführung abbrechen. Ohne gesicherte Kopie dürfen alte Schreiber die Rohquelle während Migration oder Wiederanlauf nicht ersetzen können. Quarantänegröße, Anzahl, Alter, zusätzliche `HGET`- und `HSETNX`-Aufrufe, Provider-Kosten interner Lua-Befehle, p95-Dauer der ersten und wiederholten Konfliktabfrage sowie Auswirkungen auf `HKEYS`, Redis-Limit und Exportgröße erfassen. Ein wiederholter identischer Abruf muss ohne weitere Schreibvorgänge auskommen, sobald die exakten Quarantäneoriginale vorliegen. Den zusätzlichen Prüf-`HGET` je bereits erkanntem Konflikt sowie je aktivem Reparaturmarker getrennt messen. [Vercel Functions Limits](https://vercel.com/docs/functions/limitations)

Eine Freigabe setzt außerdem die Inventur möglicher öffentlicher Altarchive, eine festgelegte private Aufbewahrung sowie einen Kapazitäts- und Bereinigungsvertrag für die Quarantäne voraus. Treffer werden im PR als Status, Anzahl, synthetischer SHA-256 und gerundete Laufzeit veröffentlicht. Zugangswerte, Provider-URLs, Rohdaten und vollständige Fehlermeldungen bleiben geschützt.

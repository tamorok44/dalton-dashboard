# Abnahmeplan für Upstash und Vercel Blob

Stand 27. November 2026. Für Commit `177b14712a1dbd26c569ecb670cc2906b10920d7`. Alle schreibenden Prüfungen dieses Plans laufen erst nach separater Freigabe auf dafür vorgesehenen, isolierten Testressourcen mit synthetischen Daten. Der Plan wurde lokal gegen echtes Redis und abgefangenen Blob-Transport geprüft. Der Providerlauf, der repräsentative Restore und die Prüfung der produktiven Bindungen stehen aus.

## 1. Ziele, Berechtigungen und Kostenrahmen prüfen

1. Eine zugängliche, dedizierte Upstash-Testdatenbank und einen dedizierten privaten Blob-Teststore aus dem richtigen Team auswählen. Herkunft, Tarif, Region, Grenzwerte und verbleibenden Verbrauch dokumentieren. Keine Tarifänderung vornehmen. Provider-ID und Projektzuordnung anhand der Verwaltungsoberfläche abgleichen. Für beide Systeme die Produktionskennung getrennt und ohne Geheimnisse erfassen, damit der Prüflauf ein identisches Ziel ablehnt.
2. Temporäre Schreibberechtigungen für die beiden Testressourcen sowie einen separaten Upstash-Read-only-Token für die Negativprobe verwenden. Die bereits vorgesehene OAuth-Leseberechtigung für Admin-/Verbrauchsprüfungen bleibt vom REST-Testzugang getrennt. Secrets über eine lokale Secret-Verwaltung oder einen geschützten Testjob einbinden. Werte weder in Trace noch in Shell-Verlauf, Audit-Branch oder PR kopieren.
3. Für den kleinen Befehlslauf mindestens 92 Redis-REST-Aufrufe Platz im vorhandenen Kontingent einplanen. Das Skript stoppt nach 90 Testaufrufen und reserviert zwei weitere für gezielte Bereinigung und deren Prüfung. Es begrenzt Redis-Requestbodys auf 64 KiB, verwendet eine zufällige Redis-Präfixgruppe ohne Hash-Tag und ein eigenes kleines, kanonisches Blob-Objekt. Separat Platz für die repräsentative Wiederherstellung kalkulieren. Bei Budgetüberschreitung, falschem Ziel oder unsicherer Bindung aussetzen. [Upstash-REST-Schnittstelle und Token](https://upstash.com/docs/redis/features/restapi) · [Vercel Private Storage](https://vercel.com/docs/vercel-blob/private-storage)

## 2. Kleine Befehls- und Berechtigungsprobe ausführen

Node 22 oder 26, Git und die Abhängigkeiten des exakten Kandidaten voraussetzen. Zuerst lokal aus dem Audit-Branch prüfen.

```sh
candidate=../dalton-check-current
audit=docs/audits/2026-11-27/pr116-recheck-177b147
npm --prefix "$candidate" ci --ignore-scripts
node "$audit/provider-acceptance.mjs" --self-test
node "$audit/verify-restore-inventory.mjs" --self-test
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

**Abnahmebedingungen.** Der geprüfte Commit und die isolierten Ziele müssen übereinstimmen. Das Skript muss `finished.result=passed` und `cleanupPassed=true` ausgeben. Die tatsächlichen Redis-Lua-Operationen aus dem Kandidaten führen gemeinsam `MSET` für Roster, Sync-Status und Version sowie `HSET` für Tageszeile/Zeiger und Beobachtung/Quarantäne aus. Schreibversuche mit dem Read-only-Token und dem alten Lock waren erfolglos und haben den vorherigen Zustand erhalten. Ein eindeutig jüngeres Fixture repariert den Record und beide Rohwerte stimmen bytegenau mit den gespeicherten Quarantänefeldern überein.

Für Blob authentifiziert dieselben gzip-Bytes per `get` abrufen und SHA-256 vergleichen. Ohne Auth muss der Abruf des existierenden privaten Objekts 401, 403 oder 404 liefern. Ein zweiter Schreibversuch unter demselben Pfad muss abgewiesen werden, der anschließende authentifizierte Hash muss übereinstimmen. Das Skript verifiziert die kanonische private URL und prüft nach der Bereinigung die Abwesenheit des eigenen Objekts. Anbieterfehler separat anhand des isolierten Testprojekts diagnostizieren. [Blob-SDK](https://vercel.com/docs/vercel-blob/using-blob-sdk)

## 3. Vollständigkeit des Exports unabhängig belegen

1. Sämtliche Schreiber im Cutover-/Restore-Fixture identifizieren und stilllegen. Dazu gehören Jobs, Cron, manuelle Refreshs, Add-on-Syncs und alte Deployment-URLs. Die eingefrorene Quelle als unveränderten Anbieter-Export sichern und protokollieren. Für eine Abnahme zunächst synthetischen oder bereits bereinigten repräsentativen Inhalt verwenden. Niemals aus dem Audit-Branch produktive Schreibpfade aktivieren.
2. Zwei voneinander unabhängige Durchläufe aus demselben eingefrorenen Bestand verwenden. Ein Durchlauf exportiert die Rohwerte. Der andere erfasst schrittweise per `SCAN` (physische v1-Sync- und Legacy-Record-Keys) sowie `HSCAN` (aktive v2- und Quarantänefelder, Tageszeilen) alle relevanten Schlüssel bis Cursor 0. `SSCAN` des alten Beobachtungsindex separat mit den physisch vorhandenen v1-Records vergleichen. Waisen in beide Richtungen weisen als Inventurdifferenz aus. Bei doppelten Seitenergebnissen nach Schlüssel deduplizieren, dann Anzahl, Keytypen, exakte Hashes und Präsenz je Quelle vergleichen.
3. Die unabhängige JSON-Inventur enthält `rosterSha256`, `addons` mit `slug` und `sha256`, `knowledge` mit `key`, `modernSha256` und `legacySha256`, `days` mit `date` und `sha256` sowie `quarantine` mit `field` und `sha256`. Ein tatsächlich fehlender Wert wird explizit als `null` erfasst. Quarantäne und beide Seiten eines Beobachtungspaars als exakte ursprüngliche UTF-8-Zeichenketten hashen. Für Roster/Sync/Tagesobjekt rekursiv sortierte JSON-Objektschlüssel und unveränderte Arrayreihenfolge verwenden. Vollbackup und sensible Rohdaten ausschließlich in geschützter Ablage halten.
4. Das aus der unabhängigen Erfassung stammende Inventar gegen den Offline-Export prüfen. Die Exportdatei folgt der Eingabe von `buildLegacyReadProjection`. Bei `knowledgePairs` werden `modern` und `legacy` für jedes Paar explizit geliefert und vorhandene Rohwerte bleiben Zeichenketten. Fehlende Seiten, falsche Hashes, fehlende Quarantäne und nicht auflösbare Waisen sind Stoppsignale. Der eingebaute Kandidatenabgleich mit bloßer Schlüsselliste allein reicht für die Freigabe nicht.

```sh
node "$audit/verify-restore-inventory.mjs" /sicher/export.json /sicher/inventur.json
```

## 4. Projizieren, wiederherstellen und Leser vergleichen

1. Vollbackup in eine zweite leere isolierte Redis-Testinstanz laden. Die Projektion zusätzlich in einen separaten leeren Klon schreiben, damit der Vergleich v1/v2 und der Rücksprung getrennt beobachtbar sind. `buildLegacyReadProjection` liefert Befehle und Manifest. Befehle vor Ausführung gegen das Testziel und erlaubte Schlüsseltypen prüfen. Die JSON-Ausgabe enthält Rohdaten und verbleibt in der geschützten Ablage. Die ursprüngliche Quelle nur lesend verwenden. [Upstash Backup und Restore](https://upstash.com/docs/redis/features/backuprestore)
2. Die unveränderten Lesefunktionen aus `0608cf5` und `5a57723` sowie den für Rollback vorgesehenen kompatiblen Code mit demselben synthetischen Input ausführen. Roster, Sync-Status, Preis-/Beobachtungsprojektion, Tageszeiger, Tagesbeleg und Quarantäne-Originalwerte mit dem eingefrorenen Manifest abgleichen. Wiederanlauf nach Neustart, Quarantäne-Auflösung nach erneutem Legacy-Write und Abbruch nach akzeptiertem Blob-Upload jeweils in der isolierten Instanz nachstellen. Konflikte, `completeForLegacyReaders:false`, fehlende Daten und Leaks über rohe Add-on-Quellen blockieren die Umschaltung.
3. Vor einer späteren Betriebsfreigabe einen kompatiblen, geprüften Deployment-Anker benennen. Schreibstilllegung, Umschaltreihenfolge, Restore-Zeit, maximal tolerierbaren Verlustzeitraum und Abbruchsignal schriftlich verifizieren. Frühere P0-Writer eignen sich als alte Reader für Nachweise. Der Test gibt deren schreibende Aktivierung nicht frei.

## 5. Ressourcen und Betriebsgrenzen nachweisen

Die Testabrechnung vor und nach genau einem Lauf erfassen und mit den ausgegebenen JSON-Requestcounts abgleichen. HTTP-Rundlaufzeiten und tatsächliche Functions-Dauer getrennt messen. Die kleine Probe belegt den Provider-Transport und seine Rechte. Sie ersetzt kein geschütztes End-to-End-Fixture für den täglichen Refresh.

Auf einer freigegebenen geschützten Preview-Teststrecke mit ausschließlich isolierten Diensten Tagesablauf, Archivqualität, Wiederaufnahme und Fehlersignale messen. Die normale Preview sperrt Produktions-Cron/Archivierung. Der Test benötigt einen getrennten internen Runner oder eine überprüfte Testharness mit synthetisch injizierter Uhr. Die echten Produktions-Endpunkte bleiben aus dem Versuch ausgeschlossen. Als Abnahmeziel sind mindestens 10 Sekunden Abstand zum 60-Sekunden-Tageslimit und 5 Sekunden zum 30-Sekunden-Sync-Limit vorgesehen. Einen kleinen Erfolgsdurchlauf und je einen Fall für langsamen Provider, abgewiesenen HSET und Wiederaufnahme nach Upload dokumentieren. Quarantänegröße, Anzahl, Alter und Auswirkung auf `HKEYS`, Redis-Limit und Exportgröße erfassen. [Vercel Functions Limits](https://vercel.com/docs/functions/limitations)

Eine Freigabe setzt außerdem die Inventur möglicher öffentlicher Altarchive, eine festgelegte private Aufbewahrung sowie einen Kapazitäts- und Bereinigungsvertrag für die Quarantäne voraus. Treffer werden im PR als Status, Anzahl, synthetischer SHA-256 und gerundete Laufzeit veröffentlicht. Zugangswerte, Provider-URLs, Rohdaten und vollständige Fehlermeldungen bleiben geschützt.

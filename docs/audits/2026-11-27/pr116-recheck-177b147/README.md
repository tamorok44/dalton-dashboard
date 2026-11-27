# Fünfte unabhängige Gegenprüfung von PR #116

**Freigabeurteil. PR #116 bleibt Draft.** Der Commit behebt die Blockade des gesamten Beobachtungsabrufs durch erkennbare Einzelkonflikte und beschädigte JSON-Werte. Er behebt außerdem die gleichwertigen Tagesbelege, den nicht kanonischen Archivpfad und die zuvor fehlende unabhängige Caller-Deadline. Die Freigabe bleibt wegen Lücken bei Beobachtungsintegrität, Originalerhaltung und Exportvollständigkeit offen.

Prüfdatum 27. November 2026. Geprüfter Kandidat `177b14712a1dbd26c569ecb670cc2906b10920d7`. Referenz `33aad3cf0f61b09d4cb88ecc81a17ccc4032dfa4`, Auditbasis `0608cf575f6e46e3bbdee800c790ce5ae7c13235`, älterer tatsächlicher v1-Writer `5a577232d4a07ef8cc032e100fccaed97d77c93d`. [Originalaudit #115](https://github.com/tamorok44/dalton-dashboard/pull/115) · [Vierte Gegenprüfung](https://github.com/tamorok44/dalton-dashboard/pull/116#issuecomment-7214686199)

## Prüfaufbau und Ergebnis

- Die bisherigen **62 Prüfgruppen** wurden auf dem vorigen Kandidaten unter echtem Redis 7.0.15 und 8.0.2 unverändert wiederholt. Die gleichen Gruppen wurden am neuen Commit mit den erwarteten neuen Zuständen geprüft. Mit **zwölf zusätzlichen Proben** liegen auf beiden Redis-Versionen je **74 Prüfgruppen** vor. Erfolgreiche Testprozesse belegen auch ausdrücklich reproduzierte Fehlerzustände.
- Beide Redis-Versionen liefen über private Unix-Sockets ohne TCP. ACL-Befehlsverweigerung, Lua-CAS, Sperrverlust, echte `SIGKILL`-Abbruchpunkte und RDB-Restore liefen in den lokalen Instanzen. Zusätzlich rief die Prüfung die tatsächlichen Handler für Werkstatt, Ortsplaner und Berufsplaner sowie historische Lesefunktionen aus `0608cf5` und `5a57723` auf. Die Blob-SDK-Aufrufe verwendeten abgefangenen HTTP-Transport. Die Testdaten waren synthetisch.
- Die Repository-Suite bestand lokal unter Node 22.23.5/Redis 7 und Node 26.13.1/Redis 8 jeweils **164/164**. GitHub-Gesamttest, Browser und Add-on waren grün. `git diff --check` war sauber. [Gesamttest](https://github.com/tamorok44/dalton-dashboard/actions/runs/45978976974) · [Browser](https://github.com/tamorok44/dalton-dashboard/actions/runs/45978976838) · [Add-on](https://github.com/tamorok44/dalton-dashboard/actions/runs/45978976827)

## Bestätigte Korrekturen

| Bereich | Ergebnis |
| --- | --- |
| **Isolation** | Zwei echte alte/neue Writer lieferten für widersprüchliche Trainerpreise derselben Sekunde jeweils 200. Der neue gefilterte Abruf übersprang nur den Konfliktdatensatz und lieferte den intakten Trainer. Ein defekter einzelner Legacy-JSON-Wert blieb ebenfalls lokal isoliert. Ein eindeutig neuerer gültiger Sync reparierte den Gleichzeitkonflikt, und der nächste Kernsync konnte weiterlaufen. |
| **Quarantäne und Originale** | Bei einem durch den Schreibpfad erkannten Konflikt enthielt die Quarantäne die v1- und v2-Originalzeichenketten exakt, einschließlich unveränderter Legacy-Rohwerte. Ältere eingehende Evidenz blieb als normalisierte Aufnahme in Quarantäne. Eine genau identische Wiederholung erhöhte die Feldzahl um null. Eine erneute Legacy-Änderung mit Konflikt zur selben Sekunde machte die Reparatur wieder prüfpflichtig. Eine weitere jüngere Aufnahme reparierte ihn. |
| **Atomarität** | `SIGKILL` unmittelbar vor und nach dem Quarantäne-Commit zeigte gemeinsam entweder keine neuen Werte oder den reparierten Record, Quarantäne und Versionsfeld. Verweigertes `HSET` sowie ein fremder Lock ließen alle drei Werte unverändert. Nach Wiederaufnahme entstand genau ein Eintrag. Die bisherigen MSET-/HSET-Fehler-, Speichergrenzen-, Preview- und Sync-Beleggruppen blieben stabil. |
| **Reale Planer-Handler** | Der aktuelle, indizierte Händlerkonflikt unterdrückte die rohe Add-on-Preisquelle. Werkstatt, Ortsplaner und Berufsplaner lieferten jeweils HTTP 200 und den unabhängigen Katalogpreis 2.345 statt der widersprüchlichen synthetischen Add-on-Preise. Der unveränderte alte Lernquellenpfad konnte bei denselben Rohdaten den Add-on-Preis noch übernehmen. |
| **Offline-Projektion und historische Reader** | Der Export enthält jetzt die benötigten Roster- und Sync-Payloads. Die tatsächlichen alten Leser funktionierten allein mit den projizierten Befehlen im leeren Redis nach RDB-Neustart, einschließlich drei zusammengeführter Beobachtungsbelege. Das Weglassen eines ganzen Keys, Syncs, Tages oder Quarantänefelds wurde abgewiesen. Vorhandene Quarantänefelder und ein neu projiziertes konfliktbehaftetes Paar blieben mit Originalrohwerten im Ziel. Bei Ausschluss markierte das Manifest `completeForLegacyReaders:false`. |
| **Tagesbeleg, Archiv und Deadline** | Feldweise gleiche Belege mit unterschiedlicher JSON-Reihenfolge wurden wiederverwendet. Der nicht kanonische private Pfad erfüllte den Tagesabschluss nicht und löste eine Wiederaufnahmeprobe aus. Der eigenständige Timer wies eine wartende Operation auch ohne ausgelöstes AbortSignal ab. Im Test mit abgeschlossenem CPU-Budget startete kein PUT. Aufruferdeadline und anbieterinterne Abbruchzeit bleiben unterschiedliche Messungen. |

## 1. Technische Freigabeblocker

| Befund | Reproduktion und erforderlicher Nachweis |
| --- | --- |
| **P1 · Lesen isoliert, sichert das Original aber nicht** | Nach dem ersten konfliktisolierenden Abruf existierte noch kein Quarantänefeld. Anschließend ersetzte der tatsächliche alte Beobachtungs-Writer den Legacy-Wert. Die ursprüngliche, bereits erkannte Konfliktversion fehlte danach sowohl im aktiven Record als auch in Quarantäne. Quarantäne für beim Lesen entdeckte Konflikte braucht einen nachweisbaren Erhaltungsweg. Die Stilllegung alter Writer bleibt zusätzlich eine Infrastrukturvoraussetzung. |
| **P1 · Reparatur kann zeitlich zurückspringen** | Ein strukturell beschädigter Legacy-Record enthielt einen lesbaren Aufnahmezeitpunkt bei `+15 s`. Der Prüfer berücksichtigte ihn wegen eines falschen Belegfeldtyps nicht als Zeitgrenze. Eine Aufnahme bei `+5 s` wurde als Reparatur und aktueller Stand übernommen. Die Originalzeichenkette blieb erhalten. Der Reparaturvertrag braucht belegte Frische oder eine explizite Freigabe für zeitlich nicht einordenbare Schäden. |
| **P1 · Erkennbarkeit hängt von Index, Cache und Schlüsselbezug ab** | Ein physisch vorhandener, nicht indizierter v1-Wert wurde beim gefilterten Lesen übergangen. Der widersprüchliche v2-Preis wurde ausgeliefert. Bei beschädigtem Legacy-Wert ohne aktualisierte Versionsmarke lieferte eine bereits gecachte historische Projektion weiterhin den früheren Preis ohne Ausschlussmerkmal. Ein formal gültiger Datensatz unter dem Schlüssel für NPC 839 konnte zudem als NPC 899 ausgeliefert werden. Für die Freigabe sind physische Inventurdifferenzen, Cache-Invalidierung und Schlüsselidentität abzudecken. |
| **P1 · Inventur erkennt fehlende Hälfte eines Paars nicht** | Dieselbe unabhängige Schlüsselliste akzeptierte den Export eines Konfliktpaars, nachdem die Legacy-Hälfte entfernt wurde. `inventoryVerified` und `completeForLegacyReaders` meldeten beide `true`. Die Inventur muss Präsenz und Hash jeder Hälfte unabhängig belegen. Bei korrekt als unvollständig markierter Projektion kann der unveränderte alte Lernquellenpfad den konfliktbehafteten Preis weiterhin aus dem restaurierten rohen Add-on-Payload ableiten. Dieser Zustand bleibt ein harter Rollback-Stopp für alte Reader-Flows. |

Begrenzte zusätzliche Risiken. Ein vollständiger Beobachtungs-Speicherausfall blockierte sechs spätere Syncs des betroffenen Charakters weiterhin mit 503. Andere Charaktere konnten synchronisieren. Nach Neustart blieb Pending erhalten und nach Erholung wurde einmal geschrieben. Diese beabsichtigte Sicherung braucht Erkennung und ein Betreiberverfahren. `complete` beim Archiv bedeutet weiterhin Transport und Kernidentität. Der vorangegangene semantische Optional-Endpunkt-Fall bleibt reproduzierbar.

Quellpfade. [Live-Wissensspeicher](https://github.com/tamorok44/dalton-dashboard/blob/177b14712a1dbd26c569ecb670cc2906b10920d7/scripts/live-knowledge-store.mjs) · [Konfliktbewertung und Rohwerte](https://github.com/tamorok44/dalton-dashboard/blob/177b14712a1dbd26c569ecb670cc2906b10920d7/scripts/storage-reconciliation.mjs) · [Offline-Projektion](https://github.com/tamorok44/dalton-dashboard/blob/177b14712a1dbd26c569ecb670cc2906b10920d7/scripts/storage-rollback-projection.mjs) · [Lernquellenfilter](https://github.com/tamorok44/dalton-dashboard/blob/177b14712a1dbd26c569ecb670cc2906b10920d7/scripts/learning-source-evidence.mjs#L547)

## 2. Notwendige Infrastrukturmaßnahmen

- Die tatsächliche Upstash-Kompatibilität für die verwendeten Lua-, MSET-, HSET- und Lesebefehle, die Berechtigungen und Fehlerantworten mit einem dedizierten Testziel nachweisen. Private Blob-Bindung, authentifizierten und verweigerten anonymen Zugriff, Unveränderlichkeit, Wiederaufnahme und Integrität auf einem separaten realen Teststore prüfen. Die read-only Vercel-Abfrage listete `0608cf5` als jüngsten Produktionsstand.
- Ein vollständiger, ruhiggestellter Export mit separat überprüften Rohwert-Hashes, getrennte Zielinstanz, ein kompatibler Rollback-Anker und die belegte Stilllegung aller alten Writer bleiben Voraussetzung. Öffentliche Altarchive vollständig inventarisieren. Aufbewahrung und Zugriff für private Archive und Quarantäne festlegen. Weder Archive noch Quarantäne-Originale dürfen durch eine ungeprüfte Datenbereinigung verschwinden.
- Quarantäne hat bisher keine TTL oder Kapazitätsgrenze. Ein dauerhaft betriebener Pfad braucht ein Größen- und Altersbudget sowie überprüfbare Aufbewahrung und Export, bevor einzelne Einträge ausgelagert oder entfernt werden. Anbieterquoten und tatsächliche Functions-Laufzeiten separat messen.

Der ausführbare Plan enthält ein eng begrenztes Provider-Skript, einen vollständig lokalen Probelauf gegen echtes Redis und simulierten Blob-Transport sowie einen Offline-Prüfer für paarweise Hashes. Der Probelauf verbrauchte simulierte 43 Redis-Requests und räumte sämtliche eigenen Testdaten auf. Die realen Provider-Schritte sind offen. [Infrastruktur-Abnahmeplan](INFRASTRUCTURE-ACCEPTANCE.md) · [Lokaler Abnahmeskript-Probelauf](provider-smoke.jsonl)

## 3. Optionale Optimierungen

- Acht inhaltlich verschiedene Eingänge für denselben ungeklärten Konflikt erzeugten acht permanente Felder mit zusammen **27.968 JSON-Bytes**. Exakter Replay erzeugte null weitere Felder. Das aktive `HKEYS` lädt dabei auch sämtliche Quarantäne-Feldnamen. Rohdubletten zwischen verschiedenen Konfliktereignissen und ein separater, schmaler aktiver Index sind konkrete Optimierungsansätze. Die Erhaltung der Originale und Kapazitätsmessung bleiben Pflicht.
- Der warme Versionspoll nutzte vier Redis-Befehle ohne Vollpayload. Der gefilterte Abruf erhielt im Fixture weiterhin 256 fremde Indexnamen. Streng buildbezogene Indizes oder ein kompakterer Versionspoll sind optionale Transportoptimierungen. Eine separat abarbeitbare Beobachtungswarteschlange verbessert die Verfügbarkeit, wenn der zusätzliche Konsistenzvertrag festgelegt ist.

## Reproduktion

Node 22 oder 26 mit Redis 7.0.15 beziehungsweise 8.0.2 auf `PATH` voraussetzen. Die vier Kandidatenworktrees verwenden ihre eigenen Lockfiles. Der historische Referenzlauf aus der vierten Gegenprüfung liegt auf demselben Audit-Branch.

```sh
git fetch origin refs/heads/audit-remediation/p0-20261126
git worktree add --detach ../dalton-check-base 0608cf575f6e46e3bbdee800c790ce5ae7c13235
git worktree add --detach ../dalton-check-first 42d651179b0928356568ce882703031e67b4b88e
git worktree add --detach ../dalton-check-v1 5a577232d4a07ef8cc032e100fccaed97d77c93d
git worktree add --detach ../dalton-check-reference 33aad3cf0f61b09d4cb88ecc81a17ccc4032dfa4
git worktree add --detach ../dalton-check-current 177b14712a1dbd26c569ecb670cc2906b10920d7
for tree in ../dalton-check-base ../dalton-check-first ../dalton-check-v1 ../dalton-check-reference ../dalton-check-current; do
  npm --prefix "$tree" ci --ignore-scripts
done
node docs/audits/2026-11-26/pr116-recheck-33aad3c/check.mjs \
  ../dalton-check-base ../dalton-check-first ../dalton-check-v1 ../dalton-check-reference
node docs/audits/2026-11-27/pr116-recheck-177b147/check.mjs \
  ../dalton-check-base ../dalton-check-first ../dalton-check-v1 ../dalton-check-current
DALTON_REQUIRE_LOCAL_REDIS=1 npm --prefix ../dalton-check-current test
```

- [Prüfskript](check.mjs) · [Quarantäne, Preisfilter und Projektion](quarantine-cases.mjs) · [Kandidat unter Redis 7](results-redis7.jsonl) · [Kandidat unter Redis 8](results-redis8.jsonl)
- [Kontrolllauf unter Redis 7](control-33aad3c-redis7.jsonl) · [Kontrolllauf unter Redis 8](control-33aad3c-redis8.jsonl) · [Prüfmetadaten](verification.json)

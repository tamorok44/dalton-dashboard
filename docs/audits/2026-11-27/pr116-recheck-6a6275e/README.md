# Achte unabhängige Gegenprüfung von PR #116

**Die technische Sanierung kann noch nicht abgeschlossen werden. PR #116 sollte Draft bleiben.** Der Commit schließt die vier Laufzeitbefunde des Vorgängers in den ursprünglichen Testfällen. Der neue Schreibpfad kann nach einer vorübergehenden Störung trotzdem eine frische Beobachtung abschließend quittieren und dauerhaft von der aktuellen Auswertung ausschließen.

Prüfdatum 27. November 2026. Kandidat `6a6275e63270f6baf09ae3e2d0d4a4abc54e76db`, Vergleich `26c1b74065616d0b5f44b59ec9c0af990df7b2b0`. Ursprüngliche Auditbasis `0608cf5`, erster P0-Stand `42d6511`, historischer v1-Schreiber `5a57723`. [Systemaudit #115](https://github.com/tamorok44/dalton-dashboard/pull/115) · [Siebte Gegenprüfung](https://github.com/tamorok44/dalton-dashboard/pull/116#issuecomment-7219093272)

## Prüfaufbau und Umfang

- Alle **99 bisherigen Prüfgruppen** liefen als unveränderte Kontrolle auf dem Vorgänger und mit denselben IDs auf dem Kandidaten. Mit **12 Zusatzgruppen** liefen unter Redis **7.0.15** und **8.0.2** je **111 Gruppen**. Erfolgreiche Assertions dokumentieren auch reproduzierte Fehlerzustände.
- Beide Instanzen verwendeten private Unix-Sockets ohne TCP. Getestet wurden echte Redis-Lua-Operationen und ACLs, kontrollierte konkurrierende Änderungen, tatsächliche `SIGKILL`-Abbrüche, native RDB-Wiederherstellung und unveränderte historische Leser. Sämtliche Nutzdaten waren synthetisch. Der lokale Blob-Transport wurde abgefangen.
- Die Repository-Suite bestand unter Node 22.23.5 mit Redis 7 und Node 26.13.1 mit Redis 8 jeweils mit **165 von 165 Prüfungen**. Alle drei GitHub-Workflows waren grün. [Gesamttest](https://github.com/tamorok44/dalton-dashboard/actions/runs/46004996769) · [Add-on](https://github.com/tamorok44/dalton-dashboard/actions/runs/46004996701) · [Browser und Performance](https://github.com/tamorok44/dalton-dashboard/actions/runs/46004996770)

## Bestätigte Korrekturen

| Bereich | Unabhängiger Nachweis |
| --- | --- |
| v1- und v2-Reparaturreferenzen | Ein ausschließlich in v1 liegender Record mit fehlendem Reparaturbeleg blieb nun auch im laufenden Abruf ausgeschlossen. Beide Speicherhälften werden mit denselben Kriterien geprüft. Die isoliert fehlgeschlagene Belegabfrage meldete nur den betroffenen Record als unbestätigt. Ein intakter Nachbar blieb lesbar. |
| Atomarer Commit | Bei Löschung **und** Ersetzung eines zuvor gelesenen Belegs verhinderte Redis den vorbereiteten Schreibvorgang. Im zweiten Versuch blieb der aktive Record bytegleich, der neue Eingang ging in Quarantäne und der Kernsync konnte weiterlaufen. Drei aufeinanderfolgende Byteänderungen stoppten nach dem dritten CAS-Versuch mit 503 und dauerhaft ausstehender Arbeit. Der identische Retry gelang nach Stabilisierung. |
| Alternative Quarantäne | Beim konkurrierenden Besetzen des vorgesehenen Feldes fand der Retry ein anderes inhaltsadressiertes Feld. Es enthielt beide Originalhälften und die unveränderten Kollisionsbytes. Für drei zuvor besetzte Felder enthielt der Beleg nach Auflösen der vierten Kollision alle drei Originale in der richtigen Kette. Ein weiterer Sync desselben Charakters gelang bei erfolgreichem Ausweichen. |
| Abbruch | Ein echtes `SIGKILL` vor dem alternativen HSET ließ den Originalstand und ausstehende Arbeit zurück. Unmittelbar danach lagen neuer Record und Ausweichbeleg gemeinsam vor. Die exakten Kollisionsbytes mit Unicode, Zeilenumbruch und NUL sowie beide Beobachtungsrohwerte blieben erhalten. Nach Retry gab es genau einen Ausweichbeleg. |
| Duplikate und Antwortverlust | Nach Verlust der Antwort eines erfolgreichen Beobachtungs-HSET prüfte der ausstehende Wiederholungsversuch seine Reparaturreferenz nochmals per CAS. Bei Löschung wurde der Preis ausgeschlossen und die Beobachtung erneut separat gesichert. Ein bereits final quittierter API-Sync bestätigte dagegen nur den historischen Kernbeleg, ohne Live-Wissen erneut zu lesen. Der Preis blieb bei inzwischen fehlendem Beleg ausgeschlossen. |
| Offline und ursprüngliche F01/F02 | Vollständige, intakte Exporte blieben mit den historischen Lesern aus `0608cf5` und `5a57723` kompatibel. Unvollständige Manifeste blockierten deren Aktivierung. Die ursprünglichen Nachweise für privaten Archivpfad, atomaren Tageszeiger, tatsächlichen Tagesbeleg und vollständige parallele Charakterstände blieben lokal stabil. |

## 1. Zwingende technische Freigabeblocker

| Befund | Reproduktion und Abnahmekriterium |
| --- | --- |
| **P1 · Vorübergehender Lesefehler beendet eine ausstehende Beobachtung endgültig.** | Nur die erste `HGET`-Anfrage für einen intakten Reparaturbeleg schlug fehl. Der Handler antwortete 200, schrieb den frischen Eingang mit `repair_evidence_unavailable` in Quarantäne und räumte Pending ab. Der exakte Retry erhielt `duplicate:true` ohne Beobachtungsabgleich. Die aktive Auswertung blieb beim alten Preis 31. Ein temporär nicht bestätigter Beleg braucht einen dauerhaft wiederanlaufbaren Zustand oder eine nachweisbare spätere Wiedervorlage. Quarantäne erhält Daten, der aktuelle Preis bleibt fachlich veraltet. |
| **P1 · Der CAS vergleicht erfolgreiche Prüfergebnisse, aber keine festgestellte Beleglücke.** | Der Beleg fehlte bei der Prüfung und wurde vor dem Commit exakt wiederhergestellt. Der Quarantäne-Commit hatte eine leere Liste geprüfter Belege, lief erfolgreich und räumte Pending ab. Der exakte Retry reconciliert die frische Beobachtung nicht. Dieser Fall braucht eine CAS-Prüfung des beobachteten Fehlens oder einen wiederanlaufbaren Zustand nach veränderter Beleglage. |
| **P1 · Für ausschließlich lesend entdeckte Konflikte fehlt der Ausweichpfad.** | Ein falsch belegtes Leserfeld wurde korrekt als `preserved:false` ausgewiesen. Der Leser sicherte die aktuelle Konfliktpaarung in keinem alternativen Feld. Der beschädigte Primärbeleg und die aktiven Rohwerte blieben unverändert. Der Schreibpfad kann ausweichen, der reine Lesepfad braucht eine belegbare Nachsicherung oder einen dauerhaften Wiederholungsauftrag. |

Die begrenzte Suche verhinderte Endlosschleifen. Vier belegte Feldkandidaten lieferten `QUARANTINE_COLLISION_LIMIT` und 503, auch beim nächsten gültigen Kernsync desselben Charakters. Die Originale und Pending blieben erhalten. Der Fall braucht ein beobachtbares Betreiberverfahren, das den Bestand sichert und den Rückstau gezielt auflöst. Er unterscheidet sich von der verlorenen Wiedervorlage nach einem 200. [Laufzeitprüfung, Ausweichpfad und CAS](https://github.com/tamorok44/dalton-dashboard/blob/6a6275e63270f6baf09ae3e2d0d4a4abc54e76db/scripts/live-knowledge-store.mjs#L230) · [Pending und Empfangsbelege](https://github.com/tamorok44/dalton-dashboard/blob/6a6275e63270f6baf09ae3e2d0d4a4abc54e76db/api/addon-sync.js#L90)

## 2. Betriebliche Freigabevoraussetzungen

- **Stilllegung vor Export.** Die bisherige Betriebsgrenze bleibt tragfähig. Der alte Writer muss beim Provider gesperrt sein, bevor ein autoritativer Bestand gezogen wird. Der historische Abbruchversuch reproduziert Originalverlust nur mit einem anschließend weiterlaufenden unkontrollierten alten Writer. Das aktualisierte Verfahren nimmt beschädigte Primärfelder, Ausweichbelege und quarantänisierte Eingänge ohne Wiedervorlage in den Abgleich auf. Die reale Abschaltung bleibt offen. [Writer-Stilllegung](WRITER-CUTOVER.md)
- **Native Wiederherstellung bei Kollisionen.** Die strikte JSON-Projektion lehnte den vollständigen, korrekt inventarisierten Bestand mit beschädigtem Primärfeld und gültigem Ausweichbeleg ab. Weglassen des Primärfelds verstieß gegen die unveränderte Inventur. Ein isolierter nativer RDB-Restore erhielt beide Felder bytegenau, und der aktuelle Leser fand danach den reparierten Preis. Das Verfahren verlangt bei Kollisionen ein natives Backup mit geprüftem Restore und erhält die Sperre alter Leser. Die tatsächliche native Provider-Wiederherstellung steht aus. [Offline-Gate](migration-gate.mjs) · [Inventur und Restore](INFRASTRUCTURE-ACCEPTANCE.md)
- **Anbieterprobe.** Der auf den neuen Commit gepinnte lokale Probelauf bestand mit **110 Redis-REST-Aufrufen in der Testharness**. Er enthält erstmals den originalgetreuen Ausweichbeleg und die Zweifachausführung nach sichtbarer CAS-Ablehnung. Echter Upstash-/Blob-Zugriff, Quoten, Langzeitaufbewahrung, Freigabe eines Rollback-Ankers und gemessene Functions-Dauer bleiben separate Nachweise. [Abnahmeplan](INFRASTRUCTURE-ACCEPTANCE.md) · [Lokaler Probelauf](provider-smoke.jsonl)

## 3. Ressourcen und optionale Optimierungen

- Im bisherigen Lesefixture blieben zwölf neue Konflikte bei **42 Aufrufen**, die Wiederholung bei **18** ohne Schreibzugriff. Beim Ingest kommen bis zu vier vorbereitende Belegabfragen je Kollisionssuche hinzu. Ein CAS-Versuch überträgt die geprüften Belegbytes erneut, auch für eine prüfpflichtige Duplikatbestätigung. Die Messwerte erfassen lokale Anfragen. Die tatsächlichen Anbieterquoten bleiben separat zu prüfen.
- Die Ausweichbelege enthalten neben beiden Paarhälften sämtliche kollidierenden Rohwerte. Mehrere Versuche und große Belege erhöhen Requestgröße und Zeitverbrauch, während die Add-on-Funktion ein 30-Sekunden-Limit hat. Restkontingente, reale Latenzen bei großen Beständen und die größten dauerhaft zugelassenen Rohwerte gehören in die Anbieterabnahme. Bündelung kann den Overhead reduzieren, sofern Verlust- und Authentizitätsnachweise erhalten bleiben.

## Reproduktion

Node 22 oder 26 und Redis 7 bzw. 8 auf `PATH` verwenden. Die Skripte starten private lokale Instanzen. Bei getrennten Installationen `AUDIT_REDIS_SERVER` und `AUDIT_REDIS_CLI` setzen.

```sh
git fetch origin refs/heads/audit-remediation/p0-20261126
git worktree add --detach ../dalton-check-base 0608cf575f6e46e3bbdee800c790ce5ae7c13235
git worktree add --detach ../dalton-check-first 42d651179b0928356568ce882703031e67b4b88e
git worktree add --detach ../dalton-check-v1 5a577232d4a07ef8cc032e100fccaed97d77c93d
git worktree add --detach ../dalton-check-reference 26c1b74065616d0b5f44b59ec9c0af990df7b2b0
git worktree add --detach ../dalton-check-current 6a6275e63270f6baf09ae3e2d0d4a4abc54e76db
for tree in ../dalton-check-base ../dalton-check-first ../dalton-check-v1 ../dalton-check-reference ../dalton-check-current; do
  npm --prefix "$tree" ci --ignore-scripts
done
node docs/audits/2026-11-27/pr116-recheck-26c1b74/check.mjs \
  ../dalton-check-base ../dalton-check-first ../dalton-check-v1 ../dalton-check-reference
node docs/audits/2026-11-27/pr116-recheck-6a6275e/check.mjs \
  ../dalton-check-base ../dalton-check-first ../dalton-check-v1 ../dalton-check-current
DALTON_REQUIRE_LOCAL_REDIS=1 npm --prefix ../dalton-check-current test
```

[Prüfskript](check.mjs) · [Zusatzproben und Interleavings](final-integrity-cases.mjs) · [Kandidat Redis 7](results-redis7.jsonl) · [Kandidat Redis 8](results-redis8.jsonl) · [Kontrolle Redis 7](control-26c1b74-redis7.jsonl) · [Kontrolle Redis 8](control-26c1b74-redis8.jsonl) · [Prüfmetadaten](verification.json)

# Produktions-Datenschutzprüfung 27.11.2026

Basis: Produktion 0608cf575f6e46e3bbdee800c790ce5ae7c13235; PR #116 4e7c1f0 bleibt Draft. Keine produktiven Schreibtests.

## Nachweise
- GitHub-Repository ist öffentlich. Sämtliche 38 per GitHub für main und data/characters.json gefundenen Dateiversionen konnten gelesen und strukturell geprüft werden. Spielerzuordnungen und Spielwerte öffentlich. Kein Treffer für die geprüften E-Mail-, GitHub-Token-, Dalton-Device-Token-, Blob-Token- oder Private-Key-Muster in dieser Datei über diese 38 Versionen. Das ist kein vollständiger Secret-Scan.
- Weiterer historischer Scan im isolierten read-only GitHub-Workflow: Produktionshistorie und alle tatsächlich ausgecheckten refs; keine Rohwerte/Adressen oder Fundpfade in Logs. Binärdaten, externe Release-Artefakte, nicht erreichbare Git-Objekte, Provider-Secret-Werte und andere Dienste nicht erfasst. Regex-Treffer sind Hinweise und fehlende Treffer keine Sicherheitsgarantie.
- Vercel-Produktionsdomain zeigt auf 0608cf575f6e46e3bbdee800c790ce5ae7c13235; 10 jüngste Produktionsdeployments sind READY (Erreichbarkeit jedes einzelnen alten Endpoints nicht anonym getestet). SSO-Schutz laut Konfiguration all_except_custom_domains. Produktive Domain bleibt öffentlich. Keine Auth-Schutzumstellung vorgenommen.
- Sichtbare Env-Metadaten: Redis-Zugänge und Blob-Store-Bindung für Preview/Produktion ausgewiesen, keine Secret-Werte gelesen, dedizierter privater Archivtoken nicht sichtbar. Blob-Objektinventur nicht zugänglich, kein Nachweis einzelner alter Archivobjekte oder deren tatsächlicher Inhalte.
- Add-on: keine HTTP-Schnittstelle im Lua-Relay; ausgewählte Spieldaten per Whisper, namensgebundene Vertrauensprüfung; Bank/Taschen lokaler Diagnosebereich. Bridge liest DaltonDashboard.lua aus SavedVariables, verwendet HTTPS und Geräte-Token; Konfigurationsdatei mit mode 0600 beim Schreiben (effektive Rechte auf Mac/Windows nicht vor Ort geprüft). Erlaubte Sync-Sektionen werden als ganze Unterobjekte kopiert; strikte Feld-Whitelist fehlt. Kein Nachweis eines Passwort-/Kontenzugriffs außerhalb der App.
- Authentifizierter Roh-Sync-Status; Preview-Gerätepromotion in Produktion, öffentlich auslösbarer manueller Refresh und gemeinsame Speicherbindung sind separate Risiken.

## Sofortmaßnahme
PR #117 (cfad310) schaltet neue öffentliche Roharchive aus; täglicher Refresh, Pet-Regelprüfung und Retry bleiben. CI Node22/26 159/159, synthetischer Privacy-Test bestanden. Noch nicht produktiv. Keine neuen Rohdaten-Backups während der Pause. Altarchive und alte Deployment-Zugänge separat inventarisieren/absichern. Kein Löschen ohne Freigabe.

## Reihenfolge
1. PR #117 klein und unabhängig prüfen/freigeben; Alt-Writer und erreichbare Altdeployments im selben Datenschutz-Cutover berücksichtigen.
2. Tatsächliche Blob-Objektliste, Zugriff, Feldklassifikation, Aufbewahrung (autorisierte lesende Provider-Abnahme). Private Roharchive erst nach Abnahme.
3. Preview-Promotion schließen, Speicherumgebungen trennen, manuellen Refresh mit vertrauenswürdigem Zugriff absichern, ohne Team-Workflow versehentlich zu brechen.
4. Übertragungs-Feldvertrag und öffentliche UI-Projektion einschließlich Spielerzuordnung/Zeiten prüfen; effektive Bridge-Dateirechte und Relay-Identität testen.
5. PR #116 bleibt getrennt; Original-F02-Korrektur in möglichst kleiner separater Änderung prüfen. Kein neuer Kosten-/Ressourcenbedarf ohne Freigabe.

## Abgeschlossener Git-Historien-Scan

[Workflow 46039378480](https://github.com/tamorok44/dalton-dashboard/actions/runs/46039378480), exakter Audit-Commit 12053beaba36dffcd51e644bbd0c2aea8dc51fd2, erfolgreich. Produktionshistorie: 1.353 Textblobs von 1.357; alle ausgecheckten refs: 2.707 Textblobs von 2.711. Keine Treffer für die geprüften Muster. Je vier Binärblobs ausgenommen. Git-Autormetadaten: zwei unterschiedliche Adressen im Produktionsstamm bzw. drei über alle ausgecheckten refs; jeweils eine außerhalb GitHub-Noreply. Adresse wird bewusst nicht veröffentlicht; prüfen, ob persönliche oder Funktionsadresse. GitHub-Privatsphäreneinstellung schützt neue Commits, nicht bestehende Historie. Kein Beweis der Abwesenheit beliebiger oder anders formatierter Secrets. Provider-/Release-/Binärprüfung weiterhin offen.

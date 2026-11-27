# Datenschutz-Sofortmaßnahme (F01)

Basis: produktiver Commit 0608cf575f6e46e3bbdee800c790ce5ae7c13235. PR #116 bleibt unverändert Draft.

## Bestätigt
- Der veröffentlichte Tageslauf archiviert vollständige Blizzard-Profilantworten öffentlich. Das öffentliche GitHub-Repository enthält einen Charakter-Fallback mit Spielerzuordnung und Spielwerten. Kein Beleg für Passwort-/Token-/E-Mail-Felder in dieser Fallback-Datei. Keine vollständige Historien-/Secret- oder Live-Rohdateninventur.
- Produktions- und Preview-Ziel sind für Redis-Umgebungsvariablen gemeinsam ausgewiesen (keine Werte abgerufen). Der dedizierte private Archivtoken ist in sichtbarer Konfiguration nicht ausgewiesen. Gerätepromotion kann aus Preview in den Produktions-Namespace schreiben; manueller GET-Refresh ist ohne Anwendungsautorisierung auslösbar. Diese Befunde sind separate Arbeitspakete.

## Dieser kleine PR
Die öffentliche Rohdatenerfassung und der Upload werden vorübergehend vollständig abgeschaltet; kein alternativer öffentlicher Store, kein neuer Token, keine neue Ressource. Der bestehende Tageslauf, Pet-Regelprüfung, Profil-Refresh, Änderungsverlauf und Retry bleiben. Metadaten kennzeichnen den Archivstatus ausdrücklich als disabled und behalten historische URL-Referenzen unverändert. Der separate Raw-Upload-Helfer verweigert jeden Aufruf. Kein vollständiger Rohdaten-Backup während der Pause. Kein Löschen bestehender Archive, keine Änderung von Berechtigungen oder produktiven Daten.

## Abnahme vor Veröffentlichung
Repository-CI, synthetischer Handler-Test (Auth, erste Ausführung, fehlgeschlagener Refresh, Retry, alte Referenzen, kein Raw-Fetch/Blob-Upload), unabhängig vom Sanierungs-PR. Tatsächlicher Provider-Bestand, öffentliche Altarchive, frühere Deployments mit weiterhin gültigen Zugangsdaten und Entzug alter Writer bleiben offen. Nach Veröffentlichung muss die alte öffentliche Upload-Route auch in früheren Deployments gesperrt werden; bloßer Aliaswechsel garantiert das nicht. Private Archivierung erst nach autorisierter isolierter Provider-Abnahme und genehmigter Aufbewahrung. Keine echten Datensätze oder Secret-Werte im Bericht.

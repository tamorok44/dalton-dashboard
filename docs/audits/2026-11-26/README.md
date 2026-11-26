# Systemaudit Dalton-Dashboard

Auditstand ist der 26. November 2026 auf Commit [0608cf5](https://github.com/tamorok44/dalton-dashboard/commit/0608cf575f6e46e3bbdee800c790ce5ae7c13235). Die Dateien dokumentieren den damaligen Prüfstand. Die Nachweise sind nach Prüfart und Zugriff getrennt.

| Bestandteil | Dateien |
| --- | --- |
| Bericht und Entscheidungen | [Prüfbericht](Prüfbericht.md), [Prüfmatrix](Prüfmatrix.csv), [Maßnahmenliste](Maßnahmenliste.csv) |
| Vorgehen und Evidenzgrenzen | [Bewertungsmethodik](Bewertungsmethodik.md), [Offene Nachweise](Offene-Nachweise.md) |
| Statisches Inventar | [Dateien](Dateiinventar.csv), [Abhängigkeiten](Abhängigkeiten.csv), [Redis-Schlüsselmuster](Redis-Schlüssel.csv), [Quellenhosts](Quelleninventar.csv), [Kennzahlen](Inventar-Kennzahlen.json) |
| Testnachweise | [Node 22](Tests-Node22.json), [Node 24](Tests-Node24.json), [Node 26](Tests-Node26.json), [isolierte Funktionsprüfungen](Isolierte-Testergebnisse.json), [Chromium](Browser-Chromium.json), [Firefox](Browser-Firefox.json), [Browser-Gesamtmessung](Browser-Gesamtmessung.json), [Paket-Advisories](Abhängigkeiten-Advisories.json) |
| Quellen- und Betriebsbeobachtung | [Öffentliche Talentquellen](Live-Quellenbeobachtung.json), [bereinigte Abrechnungsbeobachtung](Vercel-Abrechnung.json) |

## Reproduktion

Die Audit-Skripte liegen in diesem Verzeichnis. Starte die Beispiele aus dem Stammverzeichnis dieses Audit-Branches. Optional kannst du den Pfad eines separaten Checkouts des geprüften Commits statt des letzten Arguments verwenden.

~~~sh
node "docs/audits/2026-11-26/Isolierte-Prüfungen.mjs" .
DALTON_PLAYWRIGHT_MODULE=/absoluter/pfad/zu/playwright/index.mjs \
  node docs/audits/2026-11-26/Browser-Gesamtmessung.mjs .
~~~

Die Browserprüfung verwendet Playwright 1.56.1 und standardmäßig Chromium aus dem System. Bei einem anderen Chromium-Pfad kann die Variable DALTON_AUDIT_CHROMIUM gesetzt werden. Die Browserprüfung bindet ausschließlich die lokale Loopback-Adresse und blockiert externe Requests. Für die Nachprüfung der veröffentlichten Skriptfassung wurden Profilidentitäten und Zeitstempel durch Testwerte ersetzt. Die JSON-Messwerte halten den ursprünglichen Audit-Lauf fest.

## Bereinigung für GitHub

Die im Audit beobachteten Befunde, reproduzierbaren Prüffälle und Prioritäten bleiben nachvollziehbar. Kontobezogene Abrechnungsbeträge, Rohabrechnungen, personenbezogene Identitätsangaben und lokale Arbeitsverzeichnisse sind aus der GitHub-Fassung entfernt. Das Quellen- und Dateiinventar enthält öffentliche Referenzen des geprüften Repository-Commits und synthetische Testreferenzen. Das Abrechnungsdokument hält nur die qualitativen Schlussfolgerungen fest.

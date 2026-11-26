# Bewertungsmethodik

Auditstand 26. November 2026, Commit `0608cf575f6e46e3bbdee800c790ce5ae7c13235`. [Vollständiger Prüfbericht](Prüfbericht.md)

Pro Prüfbereich stehen fünf Sollkriterien mit je 20 Punkten. 20 bedeutet durch passende Evidenz gut abgedeckt; 15 überwiegend erfüllt; 10 Teilerfüllung; 5 grundlegender Ansatz mit erheblicher Lücke; 0 keine positive Evidenz für das Kriterium. **N/E** bezeichnet ungeprüfte Teilfragen. Solche Teilfragen erhalten keine positiven Punkte aus Annahmen. Die Zahl bewertet den vorliegenden Nachweis, bildet keine Eintrittswahrscheinlichkeit oder Zertifizierung ab. Gewichte erhöhen den Einfluss möglicher Datenverluste und der Vertraulichkeit. Die Matrix weist die Grenzen je Test aus.

| Bereich | Teilkriterien mit Punkten | Ergebnis | Gewicht |
| --- | --- | ---: | ---: |
| Architektur | Zerlegung 20, gemeinsame Master 15, Versionierung 15, Grenzen/Isolation 10, Betriebsverträge 10 | 70 | 10 % |
| Programmcode | Syntax 20, Lesbarkeit/Wiederverwendung 15, Fehlerpfade 10, Konkurrenz/Monotonie 5, Eingabeverträge 10 | 60 | 8 % |
| Datenbanken | Modell 15, Transaktionen 10, Cache/Kompression 15, Live-/Restore-Beleg N/E 0, Aufbewahrung/Datenschutz 5 | 45 | 13 % |
| Quellen und Datenqualität | Zuordnung 20, Übersetzungs-/Buildbelege 15, Aktualität 15, Nutzungsrechte/Live-Rohprofile 5, Lückenführung 10 | 65 | 8 % |
| Fachmodule | Basisabläufe 20, Quellenkontrolle 15, Regelmodell 15, Grenzfälle 10, Spiel-/Personevidenz 10 | 70 | 14 % |
| Sicherheit und Datenschutz | Auth-Bausteine 15, tatsächliche Zugriffsgrenzen 5, Validierung/Secrets 10, Archiv-/Replaygrenzen 5, Scope/Rechte 5 | 40 | 16 % |
| Performance und Ressourcen | App-Warmtest 20, DOM-Effizienz 10, Cache/Budget 15, Nutzergeräte/Serverlast 10, Kostenbelege 10 | 65 | 8 % |
| UI und PWA | Struktur/Wiedererkennung 20, Barrierefreiheit 15, responsive Stichproben 20, Update/Offline-Breite 10, native Plattformabdeckung 10 | 75 | 8 % |
| Betrieb und Infrastruktur | Deployment-Identität 20, Cron-Stabilität 10, CI/Beobachtbarkeit 10, Wiederherstellungspraxis 5, reale Kontingente 5 | 50 | 7 % |
| Qualitätssicherung | Node-Matrix 20, Module/Negativfälle 20, Browsertests 15, unabhängige Referenztests 15, echte Storage-/Gameplay-Tests 10 | 80 | 5 % |
| Zukunftsfähigkeit | Spielklassen 20, versionsgebundene Regeln 15, Roster/Bridge 10, Code-/Datenwachstum 10, Übergabe 10 | 65 | 3 % |

Arithmetik: Summe aus Bereichswert × Gewicht. P0-Befunde sperren die Gesamtfreigabe unabhängig vom Zahlenwert.

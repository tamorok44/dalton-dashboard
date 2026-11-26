# Verbindliche Entwicklungsregeln – Dalton-Dashboard

Gültig seit 25.11.2026 für sämtliche bestehenden und zukünftigen Dashboard-Bereiche, APIs, Datenbanken, Cronjobs, Tests, Add-on, Relay und Sync-Companion. Vor jeder Änderung lesen und beachten. Ergänzt DATA_ARCHITECTURE.md, UI_CI.md und WOW_CI.md; deren übrige Qualitäts- und Sicherheitsvorgaben bleiben gültig.

## Eigenentwicklung, Datenherkunft und Erklärlogik (verbindlich seit 26.11.2026)

Das Dalton-Dashboard ist eine eigenständige Anwendung für WoW Forever. Grundsatz: **Externe Datenquellen. Eigene Datenanreicherung. Eigene Logik. Eigenes Design. Eigenständige Anwendung.**

- In allen bestehenden und künftigen Ansichten, Modulen, Hilfetexten, der Projektdokumentation und Außendarstellung zuerst den Spielernutzen und die eigene Funktion erklären. Externe Datenbanken, APIs und Clientdaten als Datenquellen benennen, nicht als Anbieter unserer selbst entwickelten Funktionen.
- Eigene Datenaufbereitung, Beobachtungen, Add-on-Erhebungen, Korrekturen, Validierungen, charakterbezogene Planungs- und Berechnungslogik sowie Benutzeroberfläche sachlich als Eigenleistung erklären, soweit tatsächlich selbst entwickelt.
- Quellen und fremde Komponenten korrekt zuordnen und transparent, möglichst dezent und gemäß ihren Nutzungsbedingungen nennen. Quellenhinweise, Evidenzstufen, Unsicherheiten und wichtige Datenlücken nicht verschleiern.
- Im normalen Spielerbereich verständliche deutsche Funktions- und Statusmeldungen statt API-, Schlüssel- oder Verbindungsdetails. Technische Diagnosen gehören in die Entwicklungs-/Betriebsdokumentation; fachlich relevante Einschränkungen bleiben sichtbar.
- Gilt insbesondere für Charaktere, Vergleich, Werkstatt, Ortsplaner, Talente/Talentplaner, Begleiter und das eigene Add-on. Bei jeder UI-/Textänderung auf diese Erklärlogik prüfen; keine fremden Leistungen als eigene und keine unbestätigten Daten als gesichert darstellen.

## Erweiterbarkeit von Charakteren und Klassen (verbindlich)

Das Dalton-Dashboard ist ein universelles WoW-Forever-Gruppendashboard. Die vier ursprünglichen Daltons sind der aktuelle Bestand, keine technische Grenze. Weitere Freunde, mehrere Charaktere desselben Spielers, andere Klassen und Völker müssen integrierbar sein.

- Eine zentrale, konfigurierbare Charakterverwaltung ist die Quelle für den aktiven und zugelassenen Charakterbestand. Keine neuen fest codierten Charakternamen, exakten Roster-Größen oder auf die heutige Gruppenzusammensetzung zugeschnittenen Geschäftsregeln. Historische Testfixtures, Seed-Daten und ausdrücklich dokumentierte Legacy-Migrationen sind zulässig, nicht als Laufzeit-Wahrheit.
- Charakteridentität über stabile Spiel-/Profil-ID und geeigneten Realm-/Regionskontext, nicht bloß über Anzeigenamen. Spieleridentität und Charakteridentität getrennt halten; mehrere Charaktere pro Spieler ermöglichen.
- Alle im jeweiligen Forever-Client verfügbaren Klassen, Völker und Talentbäume müssen im Datenmodell unterstützt werden. Klassenabhängige Inhalte über stabile Klassen-IDs und fachliche Fähigkeiten/Module auflösen, nicht über die Namen oder Zusammensetzung der aktuellen Gruppe. Datenlücken kenntlich machen, niemals Inhalte erfinden oder andere Klassen als Ersatz verwenden.
- Gemeinsame Spielstammdaten (Talente, Fähigkeiten, Rezepte, Berufe, NPCs, Orte, Quests, Items, Ruf, Begleiter, Medien, Talentempfehlungen usw.) unabhängig vom Roster und einmalig im zentralen Katalog pflegen. Charakterdaten speichern individuellen Zustand und Referenzen. Neue Charaktere oder bereits unterstützte Klassen dürfen keine grundlegende Schemaänderung, duplizierten Masterkatalog oder vollständige Neuanlage bestehender Datenbanken erfordern. Fehlende verifizierte Klassendaten können additiv ergänzt werden.
- Alle Ansichten, Filter, Auswahllisten, Aktualisierungsläufe, Historisierung und Planungsfunktionen leiten ihren Charakterbestand dynamisch ab. Eine sinnvolle Begrenzung gleichzeitig sichtbarer Vergleichsspalten ist zulässig, niemals eine globale Rostergrenze. UI_CI gilt auch bei größeren Rostern.
- Add-on, Relay, Companion und API-Zulassung müssen perspektivisch neue autorisierte Charaktere über Konfiguration/Registrierung aufnehmen können, ohne neue Add-on-Version allein wegen eines neuen Namens. Relay-Hub und Peers nicht neu fest verdrahten. Unbekannte oder nicht autorisierte Charaktere bleiben ausgeschlossen (fail closed); private Schlüssel niemals ins Add-on oder Repository; Gold, Taschen und Bank bleiben vom Standard-Sync ausgeschlossen. Kein zusätzliches permanentes Polling, keine Vollscans oder unnötige CPU-/RAM-/Netzlast.
- Bestehende feste Roster- und Relay-Annahmen sind dokumentierte technische Altlasten, keine Zielvorgabe. Bei Berührung des jeweiligen Bereichs identifizieren und kontrolliert ablösen; bestehende Historie, Daten, Berechtigungen und Synchronisation erhalten. Keine ungeprüfte pauschale Migration oder automatische Freischaltung fremder Charaktere.
- Architektur frühzeitig erweiterbar gestalten, konkrete neue Oberflächen und Funktionen bedarfsgerecht entwickeln. Kein Zwang, sämtliche zukünftigen Funktionen oder unvollständigen Klassendaten sofort zu implementieren.

## Pflichtprüfung bei jeder Änderung

Vor Umsetzung prüfen: (1) funktioniert die Lösung unabhängig von Namen und Zahl der aktuellen Daltons? (2) bleiben Spielstammdaten von Charakterzustand getrennt? (3) können weitere Klassen und mehrere Charaktere eines Spielers ohne Schema-Neubau ergänzt werden? (4) bleiben Datenschutz, Autorisierung, Performance und Mobile-Layout erhalten?

Bei Änderungen an Roster-, Klassen-, Daten- oder Sync-Logik passende Regressionstests ergänzen: zusätzlicher registrierter Charakter, neue/noch nicht vertretene unterstützte Klasse, mehrere Charaktere pro Spieler, kleinerer/größerer Roster, fehlende Klassendaten sowie abgewiesener nicht autorisierter Charakter, soweit für die Änderung relevant. Tests dürfen den aktuellen Viererbestand nicht als allgemeine Invariante festschreiben. Relevante nicht aufgelöste Altlasten vor Freigabe offen dokumentieren.

Diese Vorgaben gelten auch für den Talentplaner: Empfehlungen klassengebunden, versioniert und rosterunabhängig; tatsächlicher Lernstand und persönliche Planung charaktergebunden. Alternative Planung bei Abweichungen und mehrere gespeicherte Pläne erst beim Erreichen von Stufe 35 durch einen unserer Charaktere im Hinblick auf Stufe 40 erneut besprechen, nicht vorzeitig implementieren.

## Talentplaner – verbindliches Beratungsziel

Pro unterstütztem Auswahlprofil genau einen durchgängigen, fachlich begründeten und technisch geprüften Talententwicklungspfad empfehlen. Die ursprüngliche Spielerentscheidung bleibt maßgeblich; keine stillen Planwechsel bei Levelaufstieg, Quellenänderung oder Rosterwechsel. Interne Quellenwidersprüche fachlich klären statt dem Spieler konkurrierende Empfehlungen vorzulegen. Ungeklärte oder ungültige Empfehlungen nicht als geprüft ausgeben. Details, Quellenregister und Freigabekonzept: `docs/talent-planner-foundation.md`. Alternative Reparaturplanung und mehrere gespeicherte Spielerpläne bleiben bis zum vereinbarten Stufe-35-Gespräch zurückgestellt.

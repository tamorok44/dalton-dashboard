# Die Daltons – WoW Forever Dashboard

Western-Dashboard für vier Dalton-Charaktere. Statische Website mit Vercel-Funktionen, Upstash Redis und Vercel Blob.

Verbindliche UI- und Responsive-Regeln für bestehende und neue Hauptreiter stehen in `UI_CI.md`. Der CI-Test `scripts/test-layout-contract.mjs` verhindert seitenweiten horizontalen Mobile-Overflow und erlaubt horizontales Scrollen nur in ausdrücklich freigegebenen Innencontainern.

## Persistenter Betrieb

- `GET /api/characters` liest den letzten vollständigen Datensatz aus Redis, beim erstmaligen Start aus `data/characters.json`.
- Ein Klick auf **Aktualisieren** löst `GET /api/refresh` aus und speichert erfolgreich abgerufene Daten dauerhaft. Der manuelle Abruf ist global auf einmal pro Minute begrenzt.
- Es gibt **keinen 30-Minuten-Deployment- oder GitHub-Datenabruf**. Code-Pushes führen nur die Tests aus. Datenaktualisierung und Website-Deployment sind getrennt.
- Der tägliche Vercel-Lauf startet um `04:07 UTC` und besitzt um `04:37 UTC` einen idempotenten zweiten Versuch. Der erste erfolgreiche Lauf archiviert den Roh-Snapshot und aktualisiert die persistenten Charakterdaten; der zweite Lauf beendet sich sofort, wenn beides bereits vollständig abgeschlossen wurde, und wiederholt andernfalls nur den noch fehlenden Charakter-Refresh.
- Redis-basierte Sperren schützen gegen parallele Serverinstanzen und verhindern veraltete Überschreibungen. Sperren werden auch bei Fehlern in vorgelagerten Regelprüfungen garantiert wieder freigegeben.
- Vercel Functions, Upstash Redis und Vercel Blob laufen gemeinsam in Frankfurt (`fra1`), damit persistente Lese- und Schreibpfade keinen unnötigen Regionswechsel verursachen.
- Teilfehler behalten den letzten Datenstand des betroffenen Charakters. Bei einem vollständigen Blizzard-Ausfall wird kein neuer Charakterstand gespeichert.
- Vercel Blob archiviert tägliche Voll-Snapshots sowie optional Porträts, Avatare und Ausrüstungs-Icons.
- Spielobjekte verwenden eine gemeinsame ID-basierte Katalogschicht für Items, Ruf-Fraktionen, Quests, Berufe, Rezepte, Spells, Talente und Begleiter. Beobachtete Charakterdaten registrieren Objekte dort zusätzlich, definieren aber nicht den vollständigen Masterkatalog.
- Der Rufbereich hält einen vollständigen, an den aktuellen Forever-Clientbuild gebundenen Fraktions-Masterkatalog. Beobachtete Blizzard-Fraktions-IDs werden darauf gemappt; ein möglicherweise älterer Blizzard-`static-...`-Namespace wird separat behandelt. Die verbindlichen Ruffarben und Symbolregeln stehen in `WOW_CI.md`.
- Medienassets verwenden ein gemeinsames Register. Ausrüstungsicons und Jägerbegleiter-Bilder werden bei Bedarf einmalig in Vercel Blob archiviert und danach über die Objekt-ID wiederverwendet. Details stehen in `DATA_ARCHITECTURE.md`.
- Jägerprofile laden zusätzlich Blizzards öffentliche Forever-Stall-JSON (`collections/stable.json`). Aktiver Begleiter, Stallplätze, Name, Familie, Stufe und Blizzard-Render werden persistent gespeichert und bei Änderungen historisiert.
- Treue, Zufriedenheit, freie/verbrauchte Ausbildungspunkte und tatsächlich gelernte Pet-Ränge werden nicht geschätzt, weil Blizzard diese Clientwerte derzeit nicht in der Online-Armory veröffentlicht.
- Das Begleiter-Kampfprofil trennt Rechenwert und Evidenzstufe. Gesundheit aus Ausdauer, Rüstung aus Jägerrüstung, 10 % der höheren Jäger-AP und die 100-%-Krit-Skalierung bleiben **Referenzmodell**. Der Kritwert wird im Frontend ausdrücklich nur als **vererbte Krit-Komponente** angezeigt: Blizzard bestätigt als Quelle den höheren Nahkampf- oder Fernkampf-Kritwert, nicht aber den numerischen Faktor. Kontrollierte aktuelle Messungen zeigen zudem eine Abweichung der weißen Pet-Autoattacks, daher wird daraus keine effektive Autoattack-Kritchance abgeleitet. Gesamtleben, Gesamtrüstung, Gesamt-AP und Pet-DPS bleiben bewusst unberechnet.
- Live ausgelesene Jägertalente wie **Belastbarkeit-Ausbildung** werden als eigener Modifikator angezeigt, aber nicht in einen Gesamtwert eingerechnet, solange Reihenfolge und fehlende Pet-Grundwerte nicht vollständig verifiziert sind.
- Trefferchance und Expertise werden nicht numerisch aus dem Jäger hochgerechnet: Für Trefferchance fehlt ein belastbarer Vererbungsfaktor; Blizzard bestätigt lediglich, dass Begleiter von Expertise profitieren, ohne einen Hunter→Pet-Faktor zu veröffentlichen.
- Forever-Fokuswerte werden als eigene Regel überwacht: 150 maximaler Fokus und 10 Fokus/Sekunde kontinuierliche Regeneration.
- Die Website wird bei normalen Datenaktualisierungen **nicht neu deployed**.

## Klassenfähigkeiten und persönliches Spellbook

- Der Klassenfähigkeiten-Master kommt zentral aus ForeverDB: Spell-ID, Rang, Lernlevel und Erwerbsart werden von der Klassenquelle übernommen; bestätigte Klassenlehrer stammen aus der aktuellen Forever-Lehrerliste plus ausdrücklich belegten Forever-Fallbacks.
- Blizzard veröffentlicht den persönlichen Klassen-Spellbook-Stand derzeit nicht über die Forever-Profil-API. Deshalb wird **niemals** aus Level oder Klassenmaster abgeleitet, dass ein Rang bereits gelernt wurde.
- Das mitgelieferte kleine Forever-Addon `addons/DaltonDashboard` liest den tatsächlichen Player-Spellbook-Stand über `C_SpellBook`. Mit `/dalton` wird ein privater Sync-Code erzeugt.
- Der Code wird im Charakterreiter **Klassenfähigkeiten** eingefügt und serverseitig persistent gespeichert. Der private Schreibschlüssel liegt ausschließlich als sensibles Vercel-Environment und im persönlichen lokalen Addon-Paket.
- Nach einem verifizierten Sync zeigt der Charakterbereich die tatsächlich bekannten Klassenränge. Der Ortsplaner blendet diese Ränge aus offenen Klassenausbildungen aus und dokumentiert den gelernten Stand weiterhin sichtbar.

## Pet-Regelwerk und Fail-closed-Prinzip

Regelbasierte Begleiterdaten werden strikt von Blizzard-Livedaten getrennt.

- **Blizzard-Livedaten** wie Name, Stufe, Familie, Aktiv-/Stallstatus und Bilder bleiben unabhängig vom Regelwächter sichtbar.
- **Regelwerte** wie Familienmodifikatoren, Ausbildungsstufen oder künftige Berechnungsformeln besitzen eine eigene Regel-ID, Version, Quellen und ein Prüfdatum.
- Zusätzlich besitzt jede Regel eine **Evidenzstufe**: `official` (Blizzard dokumentiert), `client` (aktuelle Clientdaten), `measured` (reproduzierbar im Spiel gemessen), `reference_model` (mehrfach gestütztes aktuelles Modell, aber Serverkoeffizient nicht direkt veröffentlicht) oder `provisional` (vorläufige Arbeitsannahme).
- `verified` bedeutet im Regelstatus nur: **die hinterlegte Quellenaussage ist seit der Baseline unverändert und aktuell erreichbar**. Es bedeutet ausdrücklich nicht, dass jede Formel dieselbe Evidenzstärke hat.
- Der tägliche Ablauf ist verbindlich: **Pet-Regeln prüfen → Roh-Snapshot erstellen → Charaktere/API aktualisieren → nur bestätigte Regeln verwenden → speichern**.
- Der manuelle Refresh verwendet einen höchstens 20 Stunden alten Regelstand. Fehlt er oder ist er älter, wird die Regelprüfung ebenfalls **vor** dem Blizzard-Profilabruf ausgeführt.
- Das Regelwerk beobachtet aktuell:
  - die offizielle Blizzard-Forever-Hotfixseite,
  - Blizzards Forever-Beta-Entwicklungsnotizen für Krit-Quelllogik und Expertise,
  - ForeverDB als aktuellen Clientbuild-Prüfanker; geprüfte Baseline am 22.11.2026: **1.60.1.71037**,
  - Wowheads Forever-Hunter-Skalierungsregeln,
  - die Forever-Hunter-Community-Dokumentation als zweite Skalierungs- und Fokusquelle,
  - einen separaten Clientdaten-Audit des WoW-Forever-Simulators für Fokus,
  - 4evrbugs #556 als reproduzierbare Messquelle für die derzeitige Autoattack-Krit-Abweichung,
  - Bind on Forever für Fuchsfamilie und Ausbildungsstufen,
  - 60.tools und StatRat für clientbasierte Familienmodifikatoren,
  - Efficient Games für Ausbildungsstufen und bekannte Trainingspunktkosten.
- Quellen werden nicht automatisch „neu angelernt“. Der erste geprüfte Stand einer Regelwerk-Version wird als Baseline gespeichert. Ändert sich ein relevanter Text, ein beobachteter Forever-Build oder fehlt eine erwartete Regel-Aussage, erhält die betroffene Regel `review_required`.
- Ist eine benötigte Quelle nicht erreichbar, erhält die betroffene Regel `source_unavailable`.
- Bei `review_required` oder `source_unavailable` gilt **fail closed**: Der betreffende regelbasierte Wert wird im Dashboard ausgeblendet. Es wird niemals mit einer möglicherweise veralteten Formel weitergerechnet.
- Eine bestätigte Änderung wird erst durch eine bewusst neue Regelwerk-Version im Repository freigegeben. Historische Regelversionen werden dadurch nicht stillschweigend überschrieben.
- Ein vorübergehender Quellenausfall kann sich bei einem späteren erfolgreichen Prüfzyklus automatisch erholen; dann wird der Wert ohne Codeänderung wieder freigegeben. Eine echte inhaltliche Abweichung (`review_required`) bleibt dagegen gesperrt, bis eine bewusst geprüfte neue Regelwerk-Version veröffentlicht wurde.
- Jeder relevante Status-, Versions- oder Evidenzwechsel wird im Redis-Regelstatus protokolliert und im Begleiterbereich als **Regelstatus-Protokoll** angezeigt.
- Eine serverseitige, nicht veröffentlichte Blizzard-Änderung kann technisch nicht vor ihrer Beobachtbarkeit garantiert erkannt werden. Das System minimiert dieses Restrisiko, indem es keine unbestätigten Ableitungen anzeigt.

## Zeitplan

Der Vercel-Cron läuft einmal täglich um `04:07 UTC`.

1. Prüfen, ob der Tageslauf bereits gespeichert wurde.
2. Pet-Regelwerk gegen die aktuellen Quellen prüfen und den Status in Redis speichern.
3. Vollständigen Blizzard-Forever-Snapshot in Blob archivieren.
4. Live-Profile aller Daltons einschließlich Jägerstall aktualisieren.
5. Nur Regeln mit aktuellem Quellenstatus freigeben; im Frontend zusätzlich die jeweilige Evidenzstufe anzeigen.
6. Regelstatus-, Versions- und Evidenzwechsel protokollieren.
7. Änderungen der Charakterdaten historisieren.

Der Cron aktualisiert Redis/Blob und **niemals** das GitHub-Repository. GitHub Actions führt bei Pushes und Pull Requests ausschließlich `npm test` aus.

## Produktionsvoraussetzungen

In Vercel sind für Production erforderlich:

- `UPSTASH_REDIS_REST_URL` und `UPSTASH_REDIS_REST_TOKEN` oder die entsprechenden `KV_REST_API_*` Variablen,
- `BLOB_STORE_ID` beziehungsweise bei älteren Verbindungen `BLOB_READ_WRITE_TOKEN`,
- `CRON_SECRET`,
- `BLIZZARD_CLIENT_ID` und `BLIZZARD_CLIENT_SECRET`.

Geheimnisse gehören ausschließlich in Vercel-Umgebungsvariablen und niemals ins Repository.

## Entwicklung

`npm test` prüft Syntax, Parser, UI, Blizzard-Datenformate, Persistenz, Historisierung und das Pet-Regelwerk einschließlich Evidenzklassen, Trainingspunktkosten, Buildwechseln, neuen Pet-Hotfixes, Quellenausfällen, Regelversionswechseln und Fail-closed-Verhalten.

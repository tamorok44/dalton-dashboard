# Spielobjekt- und Medienarchitektur

## Ziel

Das Dashboard trennt konsequent zwischen **Stammdaten eines WoW-Spielobjekts**, **dem individuellen Zustand eines registrierten Charakters** und **Medienassets**. Ein Objekt soll im System nicht erst dadurch eine eigene Identität bekommen, dass ein Dalton es zum ersten Mal trägt, entdeckt, lernt oder zähmt.

## Rosterunabhängigkeit (verbindlich seit 25.11.2026)

Es gilt zusätzlich der projektweite Architekturvertrag in `AGENTS.md`: Der Charakterbestand ist dynamisch und darf die Vollständigkeit des Spielkatalogs nicht bestimmen. Alle Forever-Klassen und Völker müssen im Modell unterstützt werden; fehlende verifizierte Stammdaten werden additiv ergänzt. Spieler und Charaktere sind getrennte Identitäten. Neue registrierte Charaktere und bereits unterstützte Klassen benötigen keinen grundlegenden Schemaumbau. Bestehende Roster-Bindungen sind technische Altlasten, die kontrolliert abgelöst werden.

## Verbindliches Identitätsmodell

Spielobjekte werden über ihren stabilen Spiel-Identifier referenziert. Unterstützte Katalogtypen sind derzeit:

- `item`
- `faction`
- `quest`
- `profession`
- `recipe`
- `spell`
- `talent`
- `pet`
- `pet-family`

Charakterdaten enthalten den individuellen Zustand, zum Beispiel Slot, Rufstand, Rezeptkenntnis oder Stallplatz. Allgemeine Informationen gehören in den zentralen Katalog.

## Zentraler Katalog

`scripts/game-catalog-store.mjs` stellt die gemeinsame Katalogschicht bereit.

- Redis hält einzelne, schnell lesbare Datensätze unter `dalton-dashboard:game-catalog:v1:<type>`.
- Katalogmetadaten werden getrennt unter `dalton-dashboard:game-catalog:meta:v1` geführt.
- Vollständige bzw. grössere Katalogstände können build-versioniert in Vercel Blob unter `catalog/<build>/<type>.json` archiviert werden.
- Jeder normale Charakter-Refresh registriert die dabei beobachteten Spielobjekte zusätzlich im gemeinsamen Katalog.
- Vollständige externe Forever-Kataloge werden später über dieselbe Schnittstelle importiert und ersetzen damit keine Charakterdaten.

Der beobachtete Charakterbestand ist ausdrücklich **nicht** die Definition des vollständigen Katalogs. Er ist nur eine zusätzliche Quelle für bereits bekannte Datensätze.

## Zentrales Medienregister

`scripts/media-registry.mjs` verwaltet die Zuordnung

`Objekttyp + Objekt-ID + Medienrolle -> Quell-URL + archivierte URL`.

Die Binärdateien selbst liegen in Vercel Blob. Neue Medien werden nach Möglichkeit unter

`media/<type>/<id>/<role>-<hash>.<ext>`

abgelegt.

Das verhindert doppelte Downloads und macht die Darstellung unabhängig davon, ob eine ursprüngliche Blizzard-/Forever-Quelle später ihre URL ändert.

### Medienrollen

Typische Rollen:

- `icon`
- `render`
- künftig `crest`, `banner`, `portrait`

### Quellpriorität

1. offizielles Blizzard-/Forever-Asset,
2. bestätigte Forever-Datenquelle,
3. bereits archivierte eigene Kopie,
4. einheitlicher neutraler Platzhalter.

Es werden keine KI-generierten oder frei erfundenen Spielwappen/-icons als vermeintlich offizielle Assets verwendet.

## Aktuelle Migration

### Ausrüstung

Ausrüstungsgegenstände behalten ab jetzt ihre echte Item-ID. Das bereits bestehende `storedIcon` bleibt zur Abwärtskompatibilität erhalten; neue Icons werden über das zentrale Medienregister unter `media/item/... ` archiviert.

### Jägerbegleiter

Aktiver Begleiter und Stall behalten vorhandene Blizzard-IDs, Creature-ID und Display-ID, soweit Blizzard sie liefert. Pet-Icon und Pet-Render werden zentral archiviert und über `storedIconUrl` bzw. `storedImageUrl` bevorzugt dargestellt.

### Ruf, Quests, Rezepte und weitere Bereiche

Ruf ist als erster vollständiger Masterkatalog umgesetzt. Der vollständige Fraktionsbestand und sein Forever-Clientbuild stammen aus der verifizierten Clientextraktion von ForeverDB. Blizzard liefert bei beobachteten Charakter-Rufständen die stabilen numerischen Fraktions-IDs; diese werden per normalisiertem Fraktionsnamen/Slug mit dem Masterkatalog verknüpft. Ein Blizzard-`static-...-forever-eu`-Namespace kann zeitlich hinter dem aktuellen Forever-Clientbuild liegen und ist deshalb nur eine separate API-Version, nicht die Buildquelle des Masterkatalogs.

Ruf-Fraktionen, Quests, Berufe, Rezepte, Items, Talente und Spells werden beim Refresh bereits als Katalogobjekte registriert. Vollständige Forever-Masterkataloge werden über dieselbe Struktur ergänzt, sobald die jeweilige vollständige Quelle/API verfügbar und verifiziert ist.

## Build-Versionierung

Vollständige Masterkataloge sind an den verifizierten Forever-Clientbuild zu binden. Der Blizzard-Game-Data-Namespace wird separat betrachtet und darf diesen Build nicht überschreiben. Bei unverändertem Clientbuild muss kein vollständiger Katalog neu geschrieben werden. Bei einem verifizierten Buildwechsel kann ein neuer Blob-Snapshot angelegt und der aktive Katalog gezielt aktualisiert werden.

## Historisierung

Die Änderungschronik speichert fachliche Charakteränderungen. Stammdaten und Medien werden nicht bei jedem Charakter-Snapshot dupliziert. Item-, Pet- und andere Spielobjekt-IDs bleiben in der Historie erhalten, damit historische Zustände später eindeutig gegen den passenden Katalog aufgelöst werden können.


### Berufe, Rezepte und Fähigkeiten

Alle Berufe führen die einheitliche UI-Bezeichnung „Rezepte & Fähigkeiten“. Icons werden zentral nach Spielobjekttyp und stabiler ID aufgelöst: Beruf (Skill-Line-ID), hergestellter Gegenstand (Item-ID), nicht herstellende Kenntnis (Blizzard-Rezept-ID), Talent/Zauber/Begleiterfähigkeit (Spell-ID). Eine Rezept-ID darf nie ersatzweise als Spell-ID verwendet werden. Ortsplaner, Charakteransicht, Vergleich und Werkstatt nutzen dieselben registrierten Blob-Icons. Fehlende Quellen zeigen neutrale Platzhalter. Medien bleiben außerhalb des individuellen Lernstands; kalte Abrufe sind serverseitig begrenzt, bereits archivierte Bilder werden wiederverwendet.


### Ortsnamen und Identität (24.11.2026)

Die deutsche Forever-Clientbezeichnung ist maßgeblich, einschließlich englischer Eigennamen. Der zentrale Resolver in `scripts/player-terminology.mjs` führt aktuelle, quellengestützte Kartenbezeichnungen und ausschließlich interne historische Aliasnamen. Ortsplaner, Berufsplaner, Werkstatt und AddOn-Standortanzeige verwenden diese gemeinsame Namenslogik. Andere Namen bleiben unverändert; Rohbeobachtungen und Lernziel-IDs werden nicht umgeschrieben.


### Gemeinsamer Ortskatalog

`scripts/location-catalog.mjs` vereinigt verifizierte Kartennamen, Roh- und ausgewertete Rezeptquellen, alle Klassenmaster des Rosters und gemeinsame Beobachtungen. Der additive Redis-Ortsindex ist charakterunabhängig und bleibt bei temporärem Quellverlust erhalten; Preview und Produktion sind getrennt. Er speichert ausschließlich Ortsnamen, keine Kopie von NPCs, Rezepten oder Erledigungen. Aliasnamen werden bei jeder Auswertung kanonisiert.

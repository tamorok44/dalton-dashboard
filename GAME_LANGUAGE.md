# Sprachregel: deutsche WoW-Forever-Spielstrings

## Verbindlicher Grundsatz

Das Dalton-Dashboard übersetzt **keine sichtbaren WoW-Spielbegriffe selbst**.

Für Namen und Bezeichnungen aus dem Spiel gilt:

1. Primärquelle ist Blizzard WoW Forever mit `de_DE` bzw. `de-de`.
2. Eine verifizierte deutsche Forever-Datenquelle darf ergänzen, wenn Blizzard den benötigten Datensatz nicht öffentlich liefert.
3. Englische IDs, Enums und Quellnamen dürfen intern zur Identifikation gespeichert werden, aber nicht als selbst übersetzter sichtbarer Ersatz dienen.
4. Liefert die deutsche Quelle keinen bestätigten Spielstring, zeigt das Frontend einen neutralen UI-Hinweis wie „nicht verfügbar“ oder blendet den konkreten Spielbegriff aus.
5. Ein Begriff bleibt unverändert, wenn Blizzard ihn in der deutschen Forever-Version so liefert — auch wenn er englisch aussieht, z. B. `Stormwind`, `Ironforge`, `Kirin Tor`.
6. Eigene UI-Texte des Dashboards (z. B. „Aktualisieren“, „letzter Stand“, „Materialien“) sind von dieser Regel nicht betroffen.

## Gilt insbesondere für

- Klasse, Volk und Fraktionszugehörigkeit
- Charakterwerte
- Ausrüstungsslots und Gegenstandsnamen
- Gegenstandsqualität, sofern als Text angezeigt
- Berufe, Rezepte, hergestellte Gegenstände und Reagenzien
- Talentbäume, Talente und Beschreibungen
- Quests
- Ruf-Fraktionen und Rufstatus
- Begleiterfamilien, Fähigkeiten, Futterarten und Fähigkeitsbeschreibungen
- sonstige Spielobjekte aus künftigen Masterkatalogen

## Aktuelle Datenquellen

- Charakterprofil/Armory: `de-de`
- Blizzard Profile API: `de_DE`
- Professionen, Talente, Ruf, Quests und Rezeptdetails: `de_DE`
- Jägerstall: `de-de`
- Fraktions-Masterkatalog: technische Identität aus dem Forever-Bestand; sichtbarer Charakter-Rufname kommt aus dem deutschen Blizzard-Charakterdatensatz.

## Fail-Closed

Eine englische Quelle darf intern für IDs oder Gegenprüfungen dienen. Sie darf aber nicht dazu führen, dass das Frontend einen selbst übersetzten deutschen Namen anzeigt.

Beispiel: Wenn ein deutscher Pet-Fähigkeitsname noch nicht aus einer verifizierten deutschen Datenquelle vorliegt, wird die Fähigkeit nicht mit einer von uns übersetzten Bezeichnung angezeigt.

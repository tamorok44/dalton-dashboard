# WoW-CI / verbindliche Spiel-Farben

Diese Datei hält WoW-spezifische Darstellungsregeln fest, die im Dalton-Dashboard nicht frei interpretiert werden sollen.

## Ruf

Die Rufdarstellung bleibt segmentiert. Die Geometrie und Gewichtung der acht bestehenden Segmente wird nicht verändert.

### Blizzard-Farben

| Rufstufe | Farbe |
| --- | --- |
| Hasserfüllt | `#CC4D38` |
| Feindselig | `#CC4D38` |
| Unfreundlich | `#BF4500` |
| Neutral | `#E6B300` |
| Freundlich | `#00991A` |
| Wohlwollend | `#00991A` |
| Respektvoll | `#00991A` |
| Ehrfürchtig | `#00991A` |

Die Werte entsprechen der aktuellen Blizzard-Forever-Logik aus `FACTION_BAR_COLORS` und den zugehörigen `FACTION_*_COLOR`-Konstanten.

Verbindliche Anwendung:

- Jedes erreichte Segment verwendet die Farbe seiner Rufstufe.
- Das aktuelle Segment wird zusätzlich durch eine Kontur hervorgehoben.
- Die Statusbezeichnung rechts verwendet exakt die Farbe der aktuellen Rufstufe.
- Neutral bleibt Blizzard-Gelb/Gold und wird nicht grau dargestellt.
- Höhere positive Rufstufen werden nicht künstlich blau oder violett eingefärbt.

## Fraktionssymbole

Priorität:

1. eindeutig belegtes WoW-Fraktions-/Volkswappen,
2. andernfalls offizielles Allianz- oder Horde-Zugehörigkeitssymbol,
3. bei neutralen Fraktionen ein neutrales Fraktionssymbol,
4. nur wenn kein bestätigtes Asset verfügbar ist: der einheitliche neutrale Dashboard-Platzhalter.

Es werden keine erfundenen oder KI-generierten Embleme als offizielle Fraktionswappen ausgegeben.

## Datenmodell

Der Ruf-Masterkatalog ist charakterunabhängig. Er enthält alle im aktuellen Forever-Client bekannten Ruf-Fraktionen und wird über stabile Blizzard-Fraktions-IDs mit den Charakterständen verbunden. Der aktuelle Referenzbestand umfasst 54 Fraktionen im Forever-Build 1.60.1.70959; 14 davon sind neu in Forever.

Die konkrete Buildnummer wird bei der Synchronisierung aus dem Blizzard-`static-...-forever-eu`-Namespace übernommen. Ein neuer Forever-Build darf einen neuen Katalogstand erzeugen, ohne historische Charakterzustände umzudeuten.

# Paladin — unabhängige Pfad-Nachprüfung, 26.11.2026

Ausgangscommit ad35115c4fa49386d15e3d349c684ea270d8db23; Client 1.60.1.71139; Katalog 8b6b219cd39f596ee51aa72c45ebb81100792323e6c7925f253721c0db9e75ae; Quelle 9600e28baa503d22d80ea631dc48f6844aa7be3b02576ff9bd7094e67b8e318b. Nur Rang 0. Kein Produktiv-Rollout.

## Unabhängiger Replay
Alle 7 offenen Pfade einzeln aus den gespeicherten 51-Talent-Knoten-Belegen replayed: 357 Vergaben. Kontrolliert: fortlaufende Ränge, Maximalrang, Stufenminimum, ausschließlich vorherige Reihen für Punkte-Gates, bekannte Voraussetzungen samt erforderlichem Rang, 51 Punkte und Endverteilung. Keine Fehler. Die transitive Voraussetzungskette enthält in keinem Pfad 113631 (Boundless Light); die unbekannte zusätzliche Bedingung dieses Talents bleibt gesperrt.

| Pfad | Heilig/Schutz/Vergeltung | Betroffene Konflikt-IDs | Kernentscheidung |
|---|---|---|---|
| holy-leveling | 31/5/15 | 105330, 105696 | 5 frühe Benediction-Punkte bewusst als gemischter Solo/Heil-Kompromiss; Eid 30, Holy Shock 35, Vigil 45; Command 51 nur Solooption. |
| holy-dungeons | 31/20/0 | 105330 | Eid 25, Holy Shock 30, Vigil 40; früh Heilkern, spät Schild-/Unterstützungspunkte. |
| holy-pvp | 31/20/0 | 105330 | Gleicher Heilkern; Freiheit, Schutz, Stun vor vollständigem Blocken. Keine Stilleimmunität. |
| protection-pvp | 0/31/20 | 105696 | Schildkern 20/30/40; Parieren statt Zweihandbonus, Command 51 nur situativ. Keine dauerhafte Zauberblockade. |
| retribution-leveling | 12/8/31 | 105696, 105702 | Command 20, Bewegung, Vengeance vor Repentance 33, Unsealed Wrath 40; bewusst später Trefferbonus. |
| retribution-dungeons | 12/8/31 | 105696, 105702 | Repentance 30 statt 33 für kontrollierte Gruppenpulls; kein automatischer AoE-Break; Trefferbonus ab 46. |
| retribution-pvp | 0/20/31 | 105696, 105702 | Repentance 30, Unsealed Wrath 40, später Freiheit/Schutz; Zweihanddruck, Schild nur situativ. |

## Quellengestützte Auflösung — begrenzter Geltungsbereich
- 105330 / 1328548 Eid des Lichts: offizieller Hotfix 25.11. Dauer jetzt 60 Minuten, nicht 5. Client 71139 zeigt noch alte 5 Minuten und unaufgelöste 0-Heilwerte. Zielbezogener Bonus für Holy Light, Flash of Light, Holy Shock, ein Eid pro Paladin. Keine Heilformel ableiten. Primär-/Sekundärhash: 2548e7d8af515abb253ec313cba63beb644f74aba2abd57f0d4b97dfef67a3f4 / b8e0215b3faaacd8aeba8872eef3395b50b92d09b755c899df307ac4c25a16a0.
- 105696 Siegel des Befehls: Client 71139 und unabhängige Darstellung bestätigen möglichen zusätzlichen Heiligschaden bei Waffenangriffen, keine garantierte Auslösung. Richturteil des Befehls seit 13.11. wieder Nahkampfangriff und On-hit-fähig, andere Richturteile Fernkampfangriffe. Exakte Richturteil-Schadensformel, Rundung und Serverproc bleiben offen; keine numerische Freigabe. Hashes 05834767ea7511f66806487fff882a57addde61228ad7e0f9ede3ce7d514be74 / 09ab6a4de517ec9a8fd0c85b289e759d0da4ea5c4b220f24aa2e649ebb0cb64a.
- 105702 Vindication: beide Quellen bestätigen mögliche gegnerische Angriffskraftminderung durch schädigende Nahkampfangriffe, nicht eigene zusätzliche Angriffskraft. Unterschiedliche Skalierung bzw. Vorzeichen-Darstellung, keine feste Höhe übernehmen. Hashes bf958f097809b3c42703fcdd369d9f33a790aee6000e222a563250de3255c97c / d097ee8c477ddba36677f8e8c953aca4e1d610c8f6f5fe494da35314a.
- 113631 Boundless Light: unabhängige Darstellung nennt Holy Shock als Voraussetzung, aber gespeicherte zusätzliche Rohdatenbedingung ist nicht vollständig geklärt. Keine Änderung an der Sperre.
- Offizielle weitere Abhängigkeiten: 11.11. generelle Richturteil-Klassifikation und Ausschluss von Windfury-Echos; 13.11. Command-Ausnahme; 25.11. Richturteil-Refresh bei Restdauer unter 20 Sekunden behoben, Exorzismus kann wieder kritisch treffen, Libram of Law betrifft Command. Keine garantierten Zusatztreffer. 

## Quellen (abgerufen 26.11.)
- https://news.blizzard.com/en-us/article/24315281/wow-forever-hotfixes-november-25-2026
- https://armorywowforever.com/talents/paladin — ausdrücklich Build 1.60.1.71139, Stand 25.11. 20:12 UTC.
- https://wow-forever.gg/talents/paladin/ — unabhängige Talentbeschreibung; bestätigt Rollen und Voraussetzungen, alte Eid-Dauer durch Hotfix überholt.
- https://forever-tavern.com/guides/paladin-leveling-guide/ — Leveln und Heilmeilensteine, nicht exakte eigene Chronologie.
- https://guildorder.com/de/games/wow_forever/guides/holy-paladin-field-guide — 25.11., direkter Heilkern.
- https://wowforever.gg/en/guides/paladin-holy/ — gruppenbezogene Lichtwacht und priorisiertes Eid-Ziel.
- https://games.cobaltgraphics.eu/wow-forever/paladin/holy/pvp/ — PvP-Unterstützung, Positionierung, Reinigung und Eid.
- https://mobalytics.gg/wow-forever/classes/protection-paladin-guide — 26.11., Tankrotation mit Holy Shield, Holy Strike und Seal of Fury.
- https://wowforever.gg/en/guides/paladin-protection/ — Schutzrollen, situative Unterstützung.
- https://mobalytics.gg/wow-forever/classes/dont-level-your-ret-paladin-wrong-in-wow-forever-whiter — 17.11., Kern bis Stufe 40 vor Nebenbäumen.
- https://wowforever.gg/en/guides/paladin-retribution/ — 25.11., Dungeon- und PvP-Prioritäten, Buße und Siegelwechsel.
- https://metammo.com/wow-forever/builds/paladin — Build 71139, Kerninteraktionen.
- https://games.cobaltgraphics.eu/wow-forever/paladin/retribution/pvp/ — abgestimmter Zweihanddruck, Unterstützung und defensive Fenster.

## Entscheidung
Fachliche Pfadlogik und Struktur erneut positiv bewertet. Qualitative Mechanik und offizieller Dauer-Hotfix sind belegt. Keine serverseitige Messung, keine numerische Formel oder universelle Leistungsrangliste freigegeben. Die sieben Pfade verbleiben bis zur expliziten, hashgebundenen Aufnahme der drei Effektausnahmen in den strikten Freigabekern und erfolgreicher CI in research_only. Die Negativtests für ungelöste Voraussetzungen, falsche Builds und unbekannte Legacy-Ränge dürfen nicht abgeschwächt werden. Keine Änderung der Produktionsversion.

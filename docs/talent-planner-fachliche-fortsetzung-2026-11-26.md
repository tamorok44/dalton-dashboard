# Fachliche Fortsetzungsprüfung – 26.11.2026, zweite Runde

Status: diagnostisch; keine neue Produktionsfreigabe. Grundlage: Build 1.60.1.71139, PR #110, vorhandener Zephras-Quellenvergleich und offizieller Hotfix vom 25.11.

## Druiden-Voraussetzung 104928

Im Primärbeleg setzt 104928 den vollständigen Rang 2 von 104927 voraus; Zephras exportiert diese zusätzliche Bedingung nicht. Das Fehlen eines Pfeils beweist nicht, dass die serverseitige Bedingung fehlt. Die strengere Variante bleibt maßgeblich, bis die tatsächliche Bedingung geklärt ist.

Alle 12 aktuellen Druiden-Pfade (je 51 Punkte) wurden auf die betroffene Reihenfolge geprüft. Fünf nutzen das Talent, jeweils nach beiden Voraussetzungspunkten:

| Pfad | Punktpositionen 104927 | Punktposition 104928 |
|---|---:|---:|
| druid-balance-dungeons | 24, 25 | 26 |
| druid-balance-leveling | 11, 12 | 13 |
| druid-balance-pvp | 11, 12 | 13 |
| druid-restoration-dungeons | 40, 41 | 42 |
| druid-restoration-leveling | 32, 33 | 34 |

Sieben weitere Pfade verwenden 104928 nicht. Keine Umsortierung allein wegen dieser Unsicherheit notwendig. Der erweiterte Test in scripts/talent-zephras-audit.mjs vergleicht beide Graphen für alle sechs Vermächtnisränge und beide Ausgabemodi. Die tatsächliche Serverbedingung ist damit ausdrücklich nicht verifiziert.

## Aktuelle externe Prüfung

- Blizzard: https://us.forums.blizzard.com/en/wow/t/wow-forever-hotfixes-november-25-2026/2403040 (Abschnitt 25.11., offizieller Beitrag). Bestätigt unter anderem die zwei Ränge von Improved Starfire, Dreamstate statt Moonfury, zusätzliche Wirkungen von Starlight Wrath, Moon and Stars, Eclipse und Moonkin Form sowie die Genesis-Fehlerkorrektur. Zusätzlich Änderungen an Jägerbegleitern/Falken, Paladin-Richturteilen/Exorzismus/Oath of Light, Schurken-Poised, Schamanen-Clearcasting, Hexenmeisterbegleitern, Krieger-Weaponmaster und The Quick and the Dead. Letztere sind bei der fachlichen Bewertung auch ohne Talentbaumänderung relevant.
- https://wowforevertalents.com/ nennt den exakten Build 1.60.1.71139 und den Hotfix-Cache vom 25.11.; die öffentlich sichtbare Hunter-Zahl (51) weicht jedoch vom vorhandenen Zephras-/Primärbeleg (50) ab. Quelle daher nur als ergänzende Recherche, nicht als vollständigen Strukturbeweis verwenden.
- https://wowforevertalents.com/hunter/ und https://wowforevertalents.com/paladin/ bestätigen die sichtbaren Talentwirkungen von Intimidation und Boundless Light; die sichtbaren Textabschnitte beweisen nicht alle Pfeilbedingungen.
- https://metammo.com/wow-forever/talents: Suchtreffer nennt 71139, direkt geöffneter Seiteninhalt dagegen 71091. Nicht als exakter aktueller Beleg verwenden.
- https://zephras.com/forever/enUS/talents/legacy/ bestätigt die frühere Punktevergabe durch Talented, aber kein Beweis für tatsächliche Freigabestufen auf dem Live-Server.

## Entscheidung

Keine Freigabe allein aus Strukturvalidität, Texttreffer, unveränderten Hashes oder der erfüllten Voraussetzung in den fünf Pfaden. Offene quantitative Werte, vollständige Hotfix-Abhängigkeitsprüfung je Pfad, reale Vermächtnis-Gates, fachliche Empfehlungen und Live-/Geräteprüfungen bleiben eigenständige Bedingungen. Keine Änderung an produktiven Regelpaketen. Automatischer Gesamtlauf für den neuen Commit wurde in diesem Durchgang nicht als erfolgreich bestätigt.

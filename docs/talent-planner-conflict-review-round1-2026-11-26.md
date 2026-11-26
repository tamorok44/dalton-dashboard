# Konfliktprüfung – Runde 1 (26.11.2026)

Basis: cacc2f41d6a287e1b4438011d702eba144ad3cc9, PR #110, Build 1.60.1.71139, Vermächtnisrang 0. Der Release-Katalog enthält 43 verifizierte Regelpakete; 41 Pfade sind laut letzter Freigabe offen. Diese Notiz ist Recherche, keine Freigabe und keine Änderung am Regelwerk.

## Erneute Quellenprüfung

- 105935 Piercing Howl: https://skill-capped-wow-articles.vercel.app/wowarticles/forever/guides/arms-warrior-pvp-guide/talents/ (Seitenkörper 19.11., Suchindex nennt 25.11.) und https://mobalytics.gg/wow-forever/classes/warrior-pvp-guide (07.11.) stützen den Einsatz einer Flächenverlangsamung außerhalb unmittelbarer Nahkampfdistanz. https://wowforevertalents.com/warrior/talents/piercing-howl/ nennt einen aus Spielaufnahmen abgeleiteten Tooltip. Keine exakte aktuelle Servermessung, keine Reichweitenkonstante übernehmen. Unser 31/20-Pfad priorisiert situationsabhängige Kontrolle; Skill Capped bevorzugt 32/19 für Schaden, also kein Nachweis der Überlegenheit der eigenen Folge. Einzelpfad redaktionell prüfen.
- 105762 Ice Barrier: https://wowforevertalents.com/mage/talents/ice-barrier/ weist ausdrücklich Build 71139 und Cache 25.11. aus und zeigt für den ersten Rang eine Skalierungsformel, Frostschadensboni und Cold Snap als Voraussetzung. https://talentsforever.com/mage/abilities/ice-barrier zeigt getrennte Zauberränge aus 70755, mit anderem Basiswert des ersten Ranges (447 statt 448), Hotfix-Abgleich 25.11. und Verweis auf Blizzard-Entwicklungsnotizen vom 02.11. Beide stützen Schutz und Frostschaden. Die Abweichung kann nicht als Rundungsregel entschieden werden; kein numerischer Absorb-Wert oder garantierter Schutz. Talent-Rang nicht mit trainierten Zauberrängen verwechseln. Drei Pfade nutzen die Barriere auf Stufe 40; zusätzlich die Cold-Snap-Voraussetzung und Frostbite/Fingers-of-Frost-Wechselwirkungen im exakten Prüfgraphen prüfen.
- 105909 Wrack: https://wowforevertalents.com/warlock/talents/wrack/ weist Build 71139/Cache 25.11. aus, nennt Siphon Life als Voraussetzung und bestätigt beschleunigte periodische Effekte. Eine einzelne Clientdarstellung reicht nicht für Server-Skalierung und Kanalverhalten. Zwei Pfade nutzen Wrack auf 40; PvP setzt ein geschütztes Kanalisierfenster voraus. Offiziellen Hotfix vom 10.11. und unabhängige redaktionelle Quellen weiterhin abgleichen.
- 104966 Summon Hawk: https://wowforevertalents.com/hunter/talents/summon-hawk/ weist Build 71139/Cache 25.11. aus, zeigt eine AP-abhängige Schadensformel, begrenzte gleichzeitige Falken und geteilte Abklingzeit mit Arcane Shot. Keine Übernahme der Formel ohne zweite geeignete Evidenz; Nov-25-Korrekturen am Falken/Pet-Verhalten und der separate Strukturkonflikt 104964 bleiben relevant. Vier betroffene Pfade.
- 105735 Riposte: https://wowforevertalents.com/rogue/talents/riposte/ nennt Build 71139, verweist für den unveränderten Effekt aber auf Spielaufnahmen. Parierauslöser, Entwaffnung und Deflection-Voraussetzung sind qualitative Zusatzbelege; aktuelle tatsächliche Dauer nicht isoliert gemessen.
- 105702 Vindication: https://wowforevertalents.com/paladin/talents/vindication/ nennt 71139, zeigt aber für alle drei Ränge denselben Stärke-/Beweglichkeits-Effekt statt der in der bisherigen Konfliktakte genannten Angriffskraftskalierung. Möglicherweise unvollständiges Mapping oder Tooltip; nicht als bestätigt übernehmen. Exakte Talent-/Rangzauber-ID und Effektfelder erneut zuordnen.
- 105840 Divine Aegis: https://wowforevertalents.com/priest/talents/divine-aegis/ nennt nur 70938. Schildobergrenze nicht als aktueller Wert freigeben.
- 105851 Prayer of Mending: https://wowforevertalents.com/priest/talents/prayer-of-mending/ nennt 71091; neueres Seitendatum ersetzt keinen aktuellen Buildbeleg. Keine Formel übernehmen.
- 105896 Demonic Brand: https://wowforevertalents.com/warlock/talents/demonic-brand/ nennt 71091; Pet-Schaden und Bedrohung nicht numerisch freigeben.

## Tatsächlich ausgeführte statische Stichprobe

Die zehn folgenden Dateien aus dem Entwicklungszweig wurden als JSON gelesen. Je Pfad wurden 51 Punkte, fortlaufende Rangzählung pro Talent-ID und exakte Übereinstimmung der expandierten Begründungsblöcke mit der Punktreihenfolge geprüft. Alle zehn bestanden diese drei engen Prüfungen. Keine Aussage über Baum-Gates, Maximalränge, vollständige Hotfixprüfung oder Servermechanik.

| Pfad | Konflikttalent auf Stufe (Rang 0) |
|---|---:|
| warrior-arms-pvp | 51 |
| mage-frost-leveling-mixed-balanced | 40 |
| mage-frost-dungeons | 40 |
| mage-frost-pvp | 40 |
| warlock-affliction-leveling | 40 |
| warlock-affliction-pvp | 40 |
| hunter-beast-mastery-dungeons | 28 |
| hunter-beast-mastery-leveling | 25 |
| hunter-beast-mastery-pvp | 30 |
| hunter-survival-dungeons | 50 |

510 Punktvergaben kontrolliert; keine der betroffenen Begründungen enthält die strittige numerische Konstante. Das ist kein Ersatz für die projektspezifische vollständige Validierung und keine automatische Freigabe. Die übrigen 31 Konfliktpfade sind in dieser Runde nicht individuell geprüft. Alle zehn behalten research_only. Nächste Priorität: isolierte qualitative Freigabe für Waffen-PvP und Frost, dann Wrack und Falken; vorher exakte Struktur-, Hotfix- und redaktionelle Nachweise und regulären Testlauf durchführen. Keine Änderung an main, Produktionsdeployment, Legacy-Regelpaketen oder Freigabestatus.

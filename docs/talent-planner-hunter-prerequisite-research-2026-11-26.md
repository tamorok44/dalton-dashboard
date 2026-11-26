# Tierherrschaft: erneute Recherche 26.11.2026

- https://wowfdb.com/talents/hunter/ — Intimidation 20 frühere Punkte + Bestial Swiftness 1/1; Bestial Wrath 30 frühere Punkte + Intimidation 1/1.
- https://talentsforever.com/hunter/talents/intimidation — gleiche Voraussetzung, explizite früheste Stufe 30; ältere Clientbasis mit November-Hotfixes.
- https://wowforever.tools/talent-changes — historische Voraussetzungskorrektur, Bestial Swiftness.
- https://armorywowforever.com/talents/hunter — gleiche Kante, veröffentlicht 24.11.
- https://www.wofwforever.com/en/guides/wow-forever-hunter-leveling-talents/ — Intimidation Punkt 21, Bestial Wrath Punkt 31.
- https://www.youtube.com/watch?v=HkeJ6VDtvAs — 12.11. Beschreibung nennt dieselben Meilensteine, nicht als beobachtete Lernprobe verifiziert.
- https://foreverdiff.com/talents/hunter/intimidation-1387/ — widersprüchliche zwei Voraussetzungen, kein Beleg eines UND-Operators.

Evidenzkonvergenz stark, aber aktueller Primärgraph hat weiterhin Rückkante. Keine beobachtete Vergabe im aktuellen Build 71139, keine ungeprüfte Änderung des Planer-Graphen. Nächster Schritt: exakt gebundene, unabhängig belegte strukturelle Korrektur mit Regressionstests bzw. beobachtete Vergabe auf Stufe 30; danach vollständige Dungeon- und PvP-Pfade mit Bestial Wrath, statt bisheriger 30-Punkte-Ersatzpfade. Kein Respec fremder Charaktere. Die drei Pfade bleiben gesperrt.

## Zweiter Recherchegang: offizielle Primärquelle gefunden

https://worldofwarcraft.blizzard.com/en-gb/news/24301515/world-of-warcraft-forever-class-deep-dives-hunter-and-druid — Blizzard benennt Bestial Swiftness ausdrücklich als neue Voraussetzung für Intimidation. Zusammen mit aktueller WoW-FDB, TalentsForever und dem exakt gespeicherten Zephras-Build genügt dies für eine konservative eigene Datenkorrektur: Swiftness bleibt zwingend, die falsche Rückkante wird ausschließlich für drei exakt gebundene Rang-0-Pfade entfernt. Kein allgemeiner ODER-Operator, keine Änderung der Rohquelle, keine eigene Live-Lernprobe. Bei neuem Build, Hotfix, Quellhash, Kantenform oder Allokationsdigest bleibt die Freigabe gesperrt.

153 Punktvergaben unabhängig gegen korrigierte, zyklusfreie Projektion geprüft. Alle drei Varianten: Falke 25, Einschüchterung 30, Zorn des Wildtiers 40. Dungeon/PvP wurden von Ersatzpfaden ohne Kernfähigkeit zu 31/20-Pfaden umgebaut. Kein höherer Vermächtnisrang, kein numerischer Falkenschaden.

[
  {
    "id": "hunter-beast-mastery-leveling",
    "points": 51,
    "trees": {
      "11371": 20,
      "11372": 31
    },
    "dependencies": 16,
    "allocationDigest": "ae45116e0a7b2ea4758a3753aef83b571a12151922fdc79fb513e63ca7febfc7"
  },
  {
    "id": "hunter-beast-mastery-dungeons",
    "points": 51,
    "trees": {
      "11371": 20,
      "11372": 31
    },
    "dependencies": 15,
    "allocationDigest": "6e72eb05897c7f0041068af436c9fb716bd8529652c88684431a6d733af469dc"
  },
  {
    "id": "hunter-beast-mastery-pvp",
    "points": 51,
    "trees": {
      "11370": 20,
      "11372": 31
    },
    "dependencies": 20,
    "allocationDigest": "d015b4a0f728ccdc9d5629c9b828af858e418efb8593e78abf0506e805bbe135"
  }
]

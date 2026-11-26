# Frost-Magier — fachliche Pfadfreigabe, 26.11.2026

Build 1.60.1.71139; Ausgangscommit ffc3662b29c135840dc7d8a882481e07240d9bc7; nur Vermächtnisrang 0. 53/53 Knoten im Strukturvergleich, keine abweichenden oder unbekannten Voraussetzungen. Unabhängiger Replay: 153 Vergaben, fortlaufende Ränge, Maximalrang, Stufen- und frühere-Reihen-Gates, Voraussetzungen und Verteilungen fehlerfrei. Eisbarriere jeweils 40 nach Kälteeinbruch.

- mage-frost-leveling-mixed-balanced: Frühe Frostbite-Kontrolle und Eislanze auf 20, später Eisige Finger ohne zusätzliche unabhängige Proc-Chance; Eisblock 29, Kälteeinbruch 32 und Eisbarriere 40. Arkaner Nebenbaum für Ressourcen in gemischten Solo- und Gruppeninhalten. Ein früheres Eisblock-Fenster oder Umskillung ist eine Alternative; bewusst keine Umskillung und kein behaupteter DPS-Vorteil.
- mage-frost-dungeons: Frühe Präzision, Blizzard-Verlangsamung und Frostkanalisierung; Eislanze 26, Kälteeinbruch 30, Eisbarriere 40. Kurze Gruppenpulls und Mana-/Bedrohungskontrolle priorisiert, nicht Solo-AoE-Farming. Keine Eisblock-Freischaltung in dieser Variante: bewusster Verzicht für Gruppenpunkte, kein Notfall-Eisblock versprochen. Winterkälte für längere Ziele ist eine legitime Alternative. Später Arkanregeneration; keine garantierten Procs.
- mage-frost-pvp: Kontrolle und Frostverteidigung zuerst: Eislanze 20, Eisblock 25, Kälteeinbruch 30, Eisbarriere 40. Frostbite/Eisige Finger ohne additive oder garantierte Doppelauslösung. Gegenzauber-Schweigen erst 56–57; gegenüber 17/0/34 bewusst drei weitere Arkanpunkte für Meditation statt zusätzlicher Frostpunkte. Keine allgemeine PvP-Überlegenheit oder Downrank-Proc-Garantie.

## Eisbarriere
Build 71139: Tooltip 448 + 10% Frostzaubermacht; RaidDex 431 + 10%; separate Levelbeschreibung 431 auf 40 bis 447 auf 46. Unterschiedliche Bezugsstufen sind plausibel, keine abschließend verifizierte Skalierungsformel. Übereinstimmend Schutz, Frostschadensbonus und weiterer Bonus/Zauberzeitverlustschutz bei bestehendem Schild; exakte Zahlen ausschließlich Referenztext, keine Servermessung. Ausschließlich dieser Effekt wird für genau diese drei Allokationsdigests qualitativ versöhnt. Keine generelle Ausnahme.

Quellen: https://wowforevertalents.com/mage/talents/ice-barrier/, https://raiddex.com/en/wow-forever/spells/ice-barrier-rank-1, https://talentsforever.com/mage/leveling/course/l/barrier/; Hotfixes https://news.blizzard.com/en-us/article/24315281/wow-forever-hotfixes-november-25-2026. Frostnova kann seit 13.11. durch Proc- und Blizzard-Schaden brechen. Frostbite und Fingers of Frost nicht addieren; Downranking, Immunitäten und Doppeltreffer nicht als garantierte Effekte behandeln. Dungeonpfad bewusst ohne Eisblock und ohne Winterkälte, PvP-Schweigen später als reiner PvP-Respec; Alternativen dokumentiert.

[
  {
    "id": "mage-frost-leveling-mixed-balanced",
    "points": 51,
    "trees": {
      "11582": 18,
      "11601": 33
    },
    "dependencies": 20,
    "allocationDigest": "5604839e7a3a29e9c9d405943c8ea11628b79efa33f639661a388b88f59e0dba"
  },
  {
    "id": "mage-frost-dungeons",
    "points": 51,
    "trees": {
      "11582": 18,
      "11601": 33
    },
    "dependencies": 19,
    "allocationDigest": "4d28aeb69a6612cd65e8f39220ed0b0381828d544c69be656784b4815d02e223"
  },
  {
    "id": "mage-frost-pvp",
    "points": 51,
    "trees": {
      "11582": 20,
      "11601": 31
    },
    "dependencies": 20,
    "allocationDigest": "c8c9a942a7eebd3f9b185b4b10285078209ab56a45e2c7c875d4c4c08f29788e"
  }
]

CI und Live-Freigabe bleiben getrennt. Keine Produktivbereitstellung, keine Freigabe für Vermächtnisränge 1–5.

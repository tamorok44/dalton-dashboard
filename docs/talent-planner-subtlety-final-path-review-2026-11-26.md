# Täuschung-Schurke — fachliche Pfadfreigabe, 26.11.2026

Build 1.60.1.71139; Ausgangscommit f3ebd496cc09ba979bc2b8a37f79895c13fa59ae; nur Vermächtnisrang 0. 54/54 Knoten im Strukturvergleich, keine abweichenden oder unbekannten Voraussetzungen. Unabhängiger Replay: 153 Vergaben, fortlaufende Ränge, Maximalrang, Stufen- und frühere-Reihen-Gates, Voraussetzungen und Verteilungen fehlerfrei.

- leveling: Fünf frühe Kampfpunkte für Energiekosten und Ausweiden; dafür Premeditation 25, Vorbereitung 35, Todesmal 45. Todesmal nur für hinreichend langlebige Ziele und zuverlässigen Folgekontakt, direktes Ausweiden bei kurzen Kämpfen. Shank erst nach Erlernen; keine Garantie zusätzlicher Combopunkte auf fremden Zielen. Riposte 55 als situative Option. Keine Behauptung schneller als Kampf oder Meucheln.
- dungeons: Premeditation 20, Vorbereitung 30, Todesmal 40. Coup de Grace 41–43 für beide Finisher; danach kritische Treffer und Ressourcen. Trefferchance bewusst spät als Nachteil, keine allgemeine Mehrziel- oder DPS-Überlegenheit. Todesmal auf langlebigen Einzelzielen, Ausweiden bei kurzlebigen Zielen; Blutungen nicht erzwingen. Keine behauptete feste Schadensobergrenze.
- pvp: Premeditation 20, Vorbereitung 30, Todesmal 40, Coup de Grace 43–45. Bewegung und Unterbrechung im Nebenbaum, Riposte erst 60. Todesmal ist ein entfernbarer Fluch; nur mit ausreichendem Zielkontakt, direktes Ausweiden oder Rückzug bei drohendem Kontaktverlust. Keine garantierte Kontrollzeit, Diminishing Returns oder Schadensobergrenze.

## Todesmal: Entscheidung und Belege
Grundfunktion aus dem gespeicherten aktuellen Vergleichspaar, separaten Zauberdetails https://wow-forever.gg/db/spells/1316709-death-mark/ und den bei https://forever-xp.com/changes/rogue/ wiedergegebenen Blizzard-Änderungen bestätigt: verzögerter eigener Schaden, doppelte Speicherung von Erdrosseln/Blutung, Obergrenze abhängig von Angriffskraft und kritischer Trefferchance; Coup de Grace verstärkt Schaden und Speicherrate, genaue Obergrenzeninteraktion nicht belegt. WoWhead zeigt eine Rang-1-Formel, weitere Datenbank enthält ältere Rangwerte, Zephras weiterhin Platzhalter. Keine numerische Freigabe und keine garantierte PvP-Wirkung. Todesmal ist ein Fluch und bei zu kurzer Ziellebensdauer keine sinnvolle Standardausgabe; Ausweiden ist Alternative. Die drei Pfade sind deshalb nur rollenspezifische, qualitative Optionen, keine Rangfolge gegenüber Kampf oder Meucheln. Riposte-Clientdauer nur für tatsächlich belegte Talentpfade wiederverwendet; keine Servermessung. Mutilate-Konflikt bleibt außerhalb der Pfade gesperrt.

Offizielle Hotfixes: https://worldofwarcraft.blizzard.com/en-us/news/24315281/wow-forever-hotfixes-november-10-2026. Shank-Fix 16.11., Klingenwirbel 20.11., Poised und vorübergehend gebundene Gifte/Blendpulver 25.11. Keine obsolete Proc- oder Energieannahme.

[
  {
    "id": "rogue-subtlety-leveling",
    "points": 51,
    "trees": {
      "11572": 31,
      "11573": 20
    },
    "dependencies": 23,
    "deathMarkLevel": 45,
    "riposte": true,
    "allocationDigest": "00b01a8ef6a7c04a68c05ce7e96bde08f032bc4861f52ed7ae0ac963c8a8316b"
  },
  {
    "id": "rogue-subtlety-dungeons",
    "points": 51,
    "trees": {
      "11572": 31,
      "11573": 8,
      "11580": 12
    },
    "dependencies": 21,
    "deathMarkLevel": 40,
    "riposte": false,
    "allocationDigest": "ecddafa93422fee74d7b9c9c9d603dd478381d7774092d1e15df45ae289c9b93"
  },
  {
    "id": "rogue-subtlety-pvp",
    "points": 51,
    "trees": {
      "11572": 31,
      "11573": 20
    },
    "dependencies": 23,
    "deathMarkLevel": 40,
    "riposte": true,
    "allocationDigest": "2d51f5c4a3fd6f74a8dab58318c42e3f0dfcbfad9b971cc6f1ec6c6d00d7aad9"
  }
]

CI und Live-Freigabe bleiben getrennt. Keine Produktivbereitstellung, keine Freigabe für Vermächtnisränge 1–5.

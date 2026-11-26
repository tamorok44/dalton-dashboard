# Hexenmeister — fünf Pfadfreigaben, 26.11.2026

Build 1.60.1.71139, Ausgang ce8f99ba2a2527677ff927ba11cbc0da79905261, Rang 0. Vollständiger Strukturvergleich 52/52, keine unbekannte/zyklische Voraussetzung, 255 Vergaben unabhängig replayed, alle Stufen-/Reihen-/Rang-/Voraussetzungs- und Verteilungsgates bestanden.

- affliction-leveling: Aktiver Dämon, DoT-Druck, Lebensentzug 30 und Zermürben 40. Blutsauger bei Heilbedarf, Zermürben bei genügend Ziellebensdauer. Kein Soul-Harvest-Fehler und keine garantierte Manaeffizienz.
- affliction-pvp: Aktiver Dämon, Verlangsamungsfluch 25, Lebensentzug 30, Zermürben 40. Nur geschützt kanalisieren, keine Unterbrechungsimmunität. 30/21 Seelenverbindung-Hybrid und Dämonopferung als Alternativen; keine pauschale Überlegenheit.
- demonology-leveling: Aktiver Dämon, Leerwandler früh, Brandmal 25, Seelenverbindung 30, Fel Domination 31, Pakt 40. Sofortige Verderbnis bewusst später. Opferungsbonus mit aktivem anderen Dämon erst ab Pakt; kein dauerhafter Gruppenbuff.
- demonology-dungeons: Feuerorientierte Gruppenvariante 2/31/18, Brandmal 26–28, Decimation 29/31, Seelenverbindung 30, Pakt 40. Wichtel je nach Situation; Brandmal nur bei genügend Zeit für Treffer, Schatten-Zusatzschaden erzeugt hohe Bedrohung. Tankkoordination statt garantierter Bedrohungsübernahme.
- demonology-pvp: Ausdauer und Seelenverbindung 30, Fel Domination 31, Pakt 40, Teufelsjäger-Option, Molten Skin und Schattenbrand später. 20/31/0 bzw. Soul Link/Siphon Life als Alternativen, kein garantiertes Kontrollfenster oder PvP-Ranking.

## Effektabgleich
Zermürben: offizieller 10.11.-Hotfix https://us.forums.blizzard.com/en/wow/t/wow-forever-hotfixes-november-25-2026/2403040: doppelte Tickfrequenz für die drei genannten eigenen DoTs, Dauer unverändert, Fortschritt bei Abbruch erhalten. Kein separater DoT-Schadensmultiplikator oder rekursiver Soul-Siphon-Bonus. Basiswert und Koeffizient nicht freigegeben. Brandmal: https://metammo.com/wow-forever/talents/warlock (71139) und https://www.wowhead.com/forever/spell=1293695/demonic-brand stimmen in Bedrohungsreduktion und begrenzten zusätzlichen Begleiterangriffen überein; nur Schattenschaden erzeugt hohe Bedrohung. Wowhead zeigt abweichenden Charge-Tooltip versus Trait-Tabelle; daher keine Zahl garantieren. https://zephras.com/data/forever/enUS/talents/1.60.1.71139.json als gespeicherte Vergleichspaarung. Pakt erhält Opferungsbonus nur mit anderem aktiven Dämon, kein Gruppenbuff. Offizielle Begleiter-Kritkorrekturen 25.11., Ägide-Exploit 20.11. und Intensity 23.11. berücksichtigt. Keine Servermessung, keine simulierte DPS-Rangfolge, keine generelle Ausnahme.

[
  {
    "id": "warlock-affliction-leveling",
    "points": 51,
    "trees": {
      "11629": 38,
      "11636": 13
    },
    "dependencies": 18,
    "conflict": 105909,
    "allocationDigest": "5d469d81856a1993e3059efdbc228e27f4c4055a663c3e30eb8e3d693016c6a7"
  },
  {
    "id": "warlock-affliction-pvp",
    "points": 51,
    "trees": {
      "11629": 35,
      "11636": 16
    },
    "dependencies": 19,
    "conflict": 105909,
    "allocationDigest": "1a8a759dafead83678a9e56e508c2d575a40dab943e5606cf73da00123be2cd1"
  },
  {
    "id": "warlock-demonology-leveling",
    "points": 51,
    "trees": {
      "11629": 20,
      "11636": 31
    },
    "dependencies": 19,
    "conflict": 105896,
    "allocationDigest": "cf2366e75d6d20aa2dd48033d2afc6b8433607752d8f4175cd1126915ef9eccb"
  },
  {
    "id": "warlock-demonology-dungeons",
    "points": 51,
    "trees": {
      "11629": 2,
      "11636": 31,
      "11637": 18
    },
    "dependencies": 17,
    "conflict": 105896,
    "allocationDigest": "c05739396f3ad899711e85a147302bd9621bdef89bcd9c2ac5601b3c98f04114"
  },
  {
    "id": "warlock-demonology-pvp",
    "points": 51,
    "trees": {
      "11629": 7,
      "11636": 33,
      "11637": 11
    },
    "dependencies": 18,
    "conflict": 105896,
    "allocationDigest": "70ec563fac00d491c1abc33fddf3ea47812a1f88fbfedb2e34cae074c518769f"
  }
]

Die vorherige Zweier-Spezialisierungsberatung ist wegen der hinzugekommenen dritten Option nicht mehr automatisch anwendbar; bewusst kein unbelegter Standard. Neuer vollständiger Vergleich gesondert erforderlich. CI/Live-Freigabe getrennt, keine Produktivbereitstellung, keine Freigabe für Vermächtnisränge 1–5.

# Druide: sechs Pfadfreigaben, 26.11.2026

Build 1.60.1.71139, Ausgang ee24435d39b1c487b24943a27e4a91f112b9e77f, Rang 0. 306 Punktvergaben unabhängig gegen den unveränderten Primärgraphen geprüft. Alle Ränge, Reihenpunkte, Mindestlevel, Voraussetzungen und Verteilungen fehlerfrei. Zwei veraltete Knoten (104933/104936) ausdrücklich ausgeschlossen. Nature's Splendor: strengere Voraussetzung 2/2 Nature's Majesty bleibt bestehen. Blizzard https://us.forums.blizzard.com/en/wow/t/balance-druid-adjustments-november-25/2429007, https://us.forums.blizzard.com/en/wow/t/wow-forever-hotfixes-november-25-2026/2403040, aktuelle unabhängige Talentliste https://playfulls.com/talent-calculator/druid/talents, Metabot https://metabot.gg/en/wow-forever/talents/druid-natures-splendor. Genesis durch offiziellen Hotfix bestätigt; keine allgemeine Freigabe fremder Pfade. Nur exakt gebundene sechs Allokationen. Anzeige nutzt bestehende fingerprint-gebundene Hotfix-Korrekturen auch im Talentplaner; unbestätigte persönliche Druidenzuordnung wird nicht als verifiziert angezeigt. Keine Annahme der Dreamstate-Rangzauber oder Profil-ID.

- balance-leveling: Zorn/Sternenfeuer früh, Insektenschwarm 25, Eclipse ab 30, Moonkin 40. Nature's Splendor erst nach zwei Rängen Nature's Majesty. Dreamstate ist situative Gruppenhilfe, nicht Teil dieses selbstständigen Levelpfads.
- balance-dungeons: Moonkin 40, Nature's Grace 30, Eclipse ab 31. Mana/Heilungs-Nebenbaum statt Dreamstate; bei häufigem Anregen auf andere Spieler ist Dreamstate eine sinnvolle Alternative. Kein gemessener DPS-Vorteil.
- balance-pvp: 30/21 Hybrid mit Insektenschwarm, Eclipse und Schnelligkeit der Natur 55. Keine Moonkingestalt und bewusst kein neuer 10%-Formbonus zugunsten der Notfallheilung. Kein garantierter PvP-Vorteil.
- restoration-leveling: Gemischtes heilpriorisiertes Leveln: 10 frühe Gleichgewichtspunkte, Rasche Heilung 35, Schnelligkeit der Natur 40, Wildwuchs 60. Reines Dungeonleveln nutzt früheren Wildwuchs; kein Solo-Tempo-Versprechen.
- restoration-dungeons: Rasche Heilung 25, Bloom 26, Schnelligkeit der Natur 30, Wildwuchs 40. Bloom ist verzögert, nicht als Notfallheilung einplanen; Wildwuchs hat Zauberzeit, wirkt auf Zielgruppe, nicht als raidweite Sofortheilung.
- restoration-pvp: Mobile Heilung mit HoTs, Rascher Heilung 25, Schnelligkeit der Natur 30, Wilder Attacke 41, Wildwuchs 52. Wildwuchs ist nicht im Laufen wirkbar; Bloom nur situativ, keine garantierte Kontrolle oder Unterbrechungsimmunität.

[
  {
    "id": "druid-balance-leveling",
    "points": 51,
    "trees": {
      "11328": 31,
      "11340": 20
    },
    "resolved": [
      104923,
      104924,
      104928,
      104931,
      104935,
      104937
    ],
    "excluded": [
      104933,
      104936
    ],
    "allocationDigest": "246f9ae21fba727e6f83d65cd29830de67000432699061e6887c227504b7ee47"
  },
  {
    "id": "druid-balance-dungeons",
    "points": 51,
    "trees": {
      "11328": 31,
      "11340": 20
    },
    "resolved": [
      104923,
      104924,
      104928,
      104931,
      104935,
      104937
    ],
    "excluded": [
      104933,
      104936
    ],
    "allocationDigest": "f68449149cc68284086bc41a19e6d51fc9d8107b4dc26f83343732408706f7ba"
  },
  {
    "id": "druid-balance-pvp",
    "points": 51,
    "trees": {
      "11328": 30,
      "11340": 21
    },
    "resolved": [
      104923,
      104924,
      104928,
      104931,
      104935
    ],
    "excluded": [
      104933,
      104936,
      104937
    ],
    "allocationDigest": "01ca69b0c0fa3626f4db9fe1024578473bbe0d099c5d2c5d9094950000ec3adc"
  },
  {
    "id": "druid-restoration-leveling",
    "points": 51,
    "trees": {
      "11328": 20,
      "11340": 31
    },
    "resolved": [
      104923,
      104928,
      104931
    ],
    "excluded": [
      104924,
      104933,
      104935,
      104936,
      104937
    ],
    "allocationDigest": "bfdf6e0a5321742c37e0c2fdaba14ec75b66814fea492cab3e325cb6428ca8c2"
  },
  {
    "id": "druid-restoration-dungeons",
    "points": 51,
    "trees": {
      "11328": 11,
      "11340": 40
    },
    "resolved": [
      104924,
      104928
    ],
    "excluded": [
      104923,
      104931,
      104933,
      104935,
      104936,
      104937
    ],
    "allocationDigest": "130396f1f1f5764cc106628282aa509b0bfa34de8f8740c177e31938498405c0"
  },
  {
    "id": "druid-restoration-pvp",
    "points": 51,
    "trees": {
      "11328": 8,
      "11340": 32,
      "11347": 11
    },
    "resolved": [
      104923,
      104924
    ],
    "excluded": [
      104928,
      104931,
      104933,
      104935,
      104936,
      104937
    ],
    "allocationDigest": "4d8355c76fa36432f719c5808d3c95c91da567af9fb4c2f124ee6400caa89720"
  }
]

Keine Produktivbereitstellung. CI und Live-Freigabe bleiben getrennt.

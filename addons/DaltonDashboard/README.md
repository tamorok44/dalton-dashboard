# Dalton Dashboard Spellbook Sync

Kleines WoW-Forever-Addon für den tatsächlichen persönlichen Klassen-Spellbook-Stand.

- Forever Interface: 16001
- Befehl im Spiel: `/dalton` oder `/daltonsync`
- Liest ausschließlich die Klassen-SkillLines über die aktuelle `C_SpellBook`-API.
- Berufsreiter und Pet-Spellbook werden nicht exportiert.
- Der öffentliche Repository-Stand enthält **keinen** privaten Sync-Schlüssel. Das persönliche Installationspaket erhält eine lokale `Config.lua`.

Der erzeugte Code wird im Dalton Dashboard unter **Klassenfähigkeiten** eingefügt. Erst dort wird der persönliche Lernstand persistent gespeichert.

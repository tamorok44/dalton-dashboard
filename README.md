# Die Daltons – WoW Forever Dashboard

Western-Dashboard für die vier Dalton-Charaktere. Statische Website und eine
Vercel-Serverfunktion, ohne Datenbank oder zusätzliche Client-Bibliotheken.

## Architektur und Aktualisierung

- `index.html` und `styles.css`: Western-Layout, Sheriffsterne und
  klassenbezogene Farben (Magier blau, Jäger grün, Druiden orange).
- `app.js`: Alle Charakterkarten und Gruppenkennzahlen werden aus dem aktuellen
  Datensatz erzeugt. Kein Level, Fertigkeitsstand, Talent oder Attribut ist als
  fester Wert im HTML hinterlegt.
- `data/characters.json`: letzter **dauerhaft gespeicherter** Stand. Er wird
  beim Öffnen der Seite angezeigt, bis manuell aktualisiert wird.
- `api/refresh.js`: ein Klick auf „Aktualisieren“ fragt alle vier Profile
  **parallel** über `scripts/armory-core.mjs` bei Blizzard ab.
- `scripts/armory-core.mjs`: validiert Blizzard-Daten, lokalisiert geänderte
  Ausrüstung, kennzeichnet nicht bestätigte Ersatzwerte und führt einen
  älteren Stand nur bei unvollständigen Quellen fort.
- `sw.js`: Offline-Fallback für die statischen Ressourcen. Blizzard-Daten
  und die Live-API werden nicht vom Service Worker gecacht.
- `.github/workflows/update-data.yml`: führt nur die Tests bei Codeänderungen
  aus. Es gibt **keinen** zeitgesteuerten Datenabruf und keine 30-Minuten-Deployments.

**Wichtig:** Der manuelle Live-Abruf aktualisiert den geöffneten Browser,
aber schreibt keine Daten zurück nach GitHub. Nach einem Neuladen gilt
deshalb wieder der gespeicherte Stand. Das ist absichtlich so vereinbart.

## Felder und Berechnungen

| Anzeige | Quelle / Berechnung |
| --- | --- |
| Charakter-Stufe | `character.level` aus Blizzard |
| Gruppenlevel | Minimum–Maximum aller vier angezeigten Stufen |
| Durchschnitt | arithmetischer Mittelwert der angezeigten Stufen |
| Abstand | Maximum minus Minimum |
| Berufe | Blizzard-Fertigkeit `skillPoints / maxSkillPoints`; 4 Segmente zu je 75 |
| Berufsrang | Maximum 75/150/225/300 → Lehrling/Geselle/Experte/Fachmann |
| Talente | Talentbäume und verteilte Punkte aus `specs` |
| Gesundheit, Mana, Rüstung usw. | `stats`; fehlende Werte markiert |
| Ausrüstung | `gear` mit Gegenstand, Qualität, Stufe und Slot |
| Charakterbild | Blizzard-Medien-URL; unveränderte Bilder behalten ihren Cache-Key |
| Datenstand | `generatedAt` des gespeicherten oder manuellen Abrufs |

Fehlschläge betreffen nur die jeweiligen Profile: Erreichbare Profile
werden weiterhin frisch dargestellt, für die anderen wird der letzte
bestätigte Stand **ausdrücklich** markiert.

## Qualität

```bash
npm test
```

Prüft Syntax und die fachliche Datenverarbeitung einschließlich simulierter
Änderungen an Stufe, Gruppenkennzahlen, Berufen, Talenten, Charakterwerten
und Ausrüstung. Zusätzlich testet die Suite den HTTP-Endpunkt mit parallelen
Blizzard-Profilen, Teilfehlern und vollständigen Ausfällen. Keine produktive Blizzard-Anfrage wird im Test ausgeführt.

## Betriebsgrenzen

Vercel Hobby begrenzt Deployments. Die manuelle Aktualisierung benötigt
**kein** neues Deployment. Die manuell abgerufenen Werte sind ohne
dauerhaften Speicher nicht über neue Browser-Sitzungen hinweg persistent.

Für dauerhafte Live-Werte wäre später eine kleine persistente Ablage
erforderlich; sie ist bewusst **nicht** Teil dieser Implementierung.

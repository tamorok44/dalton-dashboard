# Dalton Dashboard – verbindliche Architekturverträge

Diese Regeln gelten für jeden neuen Reiter, jede neue Datenquelle und jede neue sichtbare Funktion.

## 1. Externe APIs zuerst klären

Sobald eine externe API als ernsthafte Datenquelle in Betracht kommt, wird **vor UI- oder Fachimplementierung** geklärt:

1. Braucht der Zugang Registrierung, Freigabe oder Review?
2. Welche Keys/Scopes/Website-Bindungen gelten?
3. Welche Rate-Limits und Tageskontingente gelten?
4. Welche Attribution/Credits sind Pflicht?
5. Darf der Key nur serverseitig verwendet werden?
6. Welche Daten sind tatsächlich Forever-spezifisch und welche nur Classic-Fallback?

Wenn eine Freigabe nötig ist, wird der Antrag zuerst gestellt. Architektur und UI dürfen danach parallel geplant werden, aber nicht auf ein ungeprüftes API-Schema fest verdrahtet werden.

## 2. Sprache / WoW-Begriffe

- Sichtbare WoW-Bezeichnungen kommen aus verifizierten deutschen Client-/API-Daten.
- Keine manuell gepflegten Englisch→Deutsch-Übersetzungstabellen für Klassen, Berufe, Items, Rezepte, Kategorien, Fähigkeiten, Rufstufen usw.
- Technische IDs und Slugs dürfen intern verwendet werden, aber nicht als sichtbarer Ersatztext.
- Wenn eine deutsche Bezeichnung nicht verifiziert vorliegt, wird sie neutral weggelassen bzw. als nicht verfügbar behandelt.
- Eigene UI-Begriffe wie „Werkstatt“, „Menge“, „Bezugsquellen“ oder die funktionale Werkstatt-Taxonomie sind erlaubt, solange sie nicht als Übersetzung eines Quellbegriffs ausgegeben werden.

## 3. Medien / Bilder

- Jedes Spielmedium wird über die stabile Identität `entityType + entityId + role` geführt.
- Externe Bild-URLs sind nur Quellen, niemals dauerhafte Frontend-URLs.
- `scripts/media-resolver.mjs` ist die einzige Schnittstelle zum Medienregister.
- Der Resolver bevorzugt einen vorhandenen Master in Vercel Blob und archiviert neue Quellen bei Bedarf.
- User-facing APIs liefern nur gespeicherte Blob-URLs. Bei Archivierungsfehlern wird lieber kein Bild ausgeliefert als die externe Quelle direkt durchzureichen.
- Deduplizierung erfolgt über die stabile Entity-ID, nicht über die URL.

## 4. Dalton-CI

- Jeder Hauptreiter verwendet `.main-view` und die gemeinsame `roster-heading / roster-title / roster-kicker`-Struktur.
- Neue Reiter dürfen keine eigenen Rohfarben definieren. Farben kommen aus zentralen CSS-Variablen bzw. `color-mix()` auf diesen Tokens.
- Neue Reiter verwenden die semantischen Typografie-Tokens (`--type-*`, `--weight-*`, `--body`, `--display`).
- Horizontaler Seiten-Scroll ist verboten. Zusätzliche innere horizontale Scrollbereiche benötigen eine explizite Freigabe im Layout-Contract.

## 5. Merge-Gates

Jeder PR muss `npm test` bestehen. Dabei sind insbesondere verbindlich:

- `test-game-language.mjs`
- `test-layout-contract.mjs`
- `test-architecture-contract.mjs`

Ein Feature gilt erst dann als CI-/Architektur-konform, wenn diese Tests grün sind. „Funktioniert im Browser“ reicht nicht.

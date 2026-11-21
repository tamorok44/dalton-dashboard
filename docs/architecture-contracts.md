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

- Sichtbare WoW-Bezeichnungen kommen aus verifizierten deutschen Blizzard-/Forever-Quellen.
- Bei widersprüchlichen deutschen Quellen gilt für sichtbare Spielerbegriffe die Priorität: **offizielle deutsche Blizzard-Spieler-/UI-Terminologie → lokalisierte Blizzard-Game-Data-/Clientbezeichnung → keine selbst erfundene Übersetzung**.
- Quellenbelegte Terminologie-Master sind ausschließlich über stabile Spiel-IDs erlaubt. Jeder Eintrag benötigt offizielle Quelle, Locale und Verifizierungsdatum; freie Englisch→Deutsch-Übersetzungstabellen bleiben verboten.
- Der aktuelle Berufs-Master liegt in `scripts/player-terminology.mjs` und ist durch die offiziellen deutschen WoW-Forever-Berufsseiten belegt. Beispiel: Beruf-ID `171` wird sichtbar als **„Alchemie“** geführt, auch wenn technische Client-/Game-Data-Felder „Alchimie“ liefern.
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

## 5. Interaktionskontrollen

- Binäre Ansichts- und Filterzustände verwenden immer die gemeinsame Segment-Schalter-Komponente `segmentedControl()`.
- Checkboxen sind ausschließlich für echte Mehrfachauswahlen vorgesehen, bei denen mehrere Optionen gleichzeitig aktiv sein können.
- Neue Reiter dürfen für dieselbe Filterart kein eigenes Bedienmuster erfinden.
- Standardzustände müssen fachlich begründet und im Code explizit gesetzt sein. Für die Werkstatt gilt: Lupe = `Alle`, geführte Auswahl = `Herstellbar`.
- Schalterzustände verschiedener Werkstatt-Einstiege bleiben unabhängig voneinander.

## 6. Werkstatt-Masterkatalog

- ForeverDB-Rezepte aller 12 Berufe bilden einen charakterunabhängigen Masterkatalog.
- Charakterdaten bestimmen nur den Filter `Herstellbar` und die Crafter-Zuordnung; sie begrenzen niemals den Masterkatalog.
- Der Master wird persistent gespeichert. Bei Buildwechseln wird er rate-limit-sicher in Teilmengen erneuert; bis zum vollständigen neuen Stand bleibt der letzte vollständige Master aktiv.
- Die Lupe durchsucht standardmäßig alle Gegenstände. Die geführte Auswahl zeigt standardmäßig nur aktuell durch die Daltons herstellbare Gegenstände. Beide Ansichten können jeweils auf den anderen Modus umgeschaltet werden.

## 7. Datenfrische / Frontend-Synchronisierung

- Alle Ansichten verwenden denselben serverseitig gespeicherten Charakterstand als Quelle: Charaktere, Vergleich, Begleiter, Berufe, Ruf, Quests und Werkstatt-Crafter.
- Ein erfolgreicher manueller Refresh muss den neuen Stand sofort in derselben Browser-Sitzung anwenden.
- Ein serverseitiger Morgen-/Cron-Refresh muss auch in bereits geöffneten Tabs automatisch erkannt werden. Dafür wird nur eine leichte Datenversion periodisch geprüft; ein vollständiger Datensatz wird ausschließlich bei Versionsänderung nachgeladen.
- Beim Zurückkehren in einen Tab (`visibilitychange`, `focus`, `pageshow`, `online`) wird die Datenversion sofort geprüft.
- Datenabhängige abgeleitete Ansichten müssen bei geändertem Charakter-`generatedAt` invalidiert werden. Für die Werkstatt betrifft das Overview, Suchergebnisse und ausgewählte Herstellbarkeitsinformationen.
- Benutzerzustände wie ausgewählte Vergleichscharaktere, aktive Charakter-Reiter oder Filtereinstellungen bleiben bei Hintergrundaktualisierungen erhalten.
- Ein Update der Pet-Regeln muss die globale Datenversion ebenfalls ändern, auch wenn sich der Charakter-`generatedAt`-Wert nicht geändert hat.

## 8. Merge-Gates

Jeder PR muss `npm test` bestehen. Dabei sind insbesondere verbindlich:

- `test-game-language.mjs`
- `test-layout-contract.mjs`
- `test-architecture-contract.mjs`

Ein Feature gilt erst dann als CI-/Architektur-konform, wenn diese Tests grün sind. „Funktioniert im Browser“ reicht nicht.

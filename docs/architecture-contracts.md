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
- Dasselbe Prinzip gilt für technische Ortsbezeichnungen: Wo eine stabile Karten-ID (`uiMapId`) vorliegt und eine offizielle deutsche Blizzard-Bezeichnung verifiziert ist, wird diese ID-basierte Spielerterminologie verwendet. Beispiel: `1453` = **„Sturmwind“**, auch wenn eine Quelldatenbank „Stormwind“ liefert.
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
- Normale Rezepte werden nach passendem Beruf, bekanntem Rezeptstand und erforderlichem Berufsskill bewertet. Eine Charakterlevel-Anforderung darf nur berücksichtigt werden, wenn sie für das **konkrete Rezept selbst** ausdrücklich und belastbar belegt ist; weder das Level des hergestellten Gegenstands noch das Level des Herstellungs-Spells darf dafür verwendet werden.
- Charakterdaten bestimmen nur den Filter `Herstellbar` und die Crafter-Zuordnung; sie begrenzen niemals den Masterkatalog.
- Der Master wird persistent gespeichert. Bei Buildwechseln wird er rate-limit-sicher in Teilmengen erneuert; bis zum vollständigen neuen Stand bleibt der letzte vollständige Master aktiv.
- Die Lupe durchsucht standardmäßig alle Gegenstände. Die geführte Auswahl zeigt standardmäßig nur aktuell durch die Daltons herstellbare Gegenstände. Beide Ansichten können jeweils auf den anderen Modus umgeschaltet werden.
- Gegenstandsbezogene Eingaben gehören zur ausgewählten Item-ID. Beim Wechsel auf einen anderen Gegenstand wird die Menge auf `1` zurückgesetzt. Beim selben Gegenstand, bei Filterwechseln und beim automatischen Neuladen desselben Gegenstands nach einem Datenupdate bleibt die Menge erhalten.

## 7. Ortsplaner

- Der Ortsplaner ersetzt den bisherigen Berufsplaner. Er verwendet die aktuellen Blizzard-Charakterdaten und gemeinsame persistente ForeverDB-Master; er führt **keine eigene Kopie** von Rezepten, Fähigkeiten oder NPC-Stammdaten.
- Oben werden Charakter und Ort gewählt. Darunter stehen die echten Mehrfachfilter **Klassenfähigkeiten**, **Berufsrezepte**, **Berufsausbildung** und **Begleiterfähigkeiten** standardmäßig aktiviert zur Verfügung.
- Der Ortsplaner zeigt ausschließlich Erledigungen, die der gewählte Charakter **jetzt** am gewählten Ort durchführen kann. Zukünftige Level-, Skill- oder sonstige Fortschrittshinweise gehören nicht in diese Ansicht.
- Eine Rezept-Erledigung ist nur zulässig, wenn der Charakter den passenden Beruf besitzt, das Rezept nach dem verifizierten Charakterstand noch nicht kennt, der erforderliche Berufsskill erfüllt ist und eine konkrete Forever-bestätigte Bezugsquelle am Ort existiert. Eine zusätzliche Rezept-Charakterlevel-Anforderung wird nur berücksichtigt, wenn sie für genau dieses Rezept ausdrücklich belegt ist.
- Für NPC-Quellen werden nur `evidence = forever-confirmed`, ein bestätigter Ort und die passende Fraktion akzeptiert. Classic-unbestätigte oder unbekannte Quellen bleiben aus dem Ortsplaner heraus.
- Berufsausbildungen bzw. Berufsränge werden getrennt von normalen Rezepten behandelt. Hier werden Berufsskill, aktueller Skilldeckel, erforderliches Charakterlevel und die konkrete Bezugsquelle (Lehrer, Händlerbuch o. Ä.) geprüft. Fehlt der Mindestskill oder das Charakterlevel im Client/API-Rangdatensatz, dürfen ausschließlich **eng begrenzte, in den ForeverDB-Berufsführern ausdrücklich als Classic-Trainerdaten ausgewiesene Rangschwellen** verwendet werden. Für den Skill sind dies Geselle 50, Experte 125 und Fachmann 200 bzw. bei Kochkunst/Erste Hilfe/Angeln 225; Level-Fallbacks werden nur für die dort konkret dokumentierten Berufs-/Rangkombinationen hinterlegt. Fehlt auch dafür eine belastbare Angabe, bleibt die Ausbildung fail-closed unsichtbar. Eine Ausbildung erscheint nur, wenn alle belegten Voraussetzungen **jetzt** erfüllt sind. Ein allgemeiner Berufslehrer darf nicht ohne Rang-/Leistungsbezug als Beweis dienen.
- Klassen- und Begleiterfähigkeiten werden nur aufgenommen, wenn sowohl der persönliche Zustand „noch nicht gelernt“ als auch der konkrete Erwerbsweg am NPC zuverlässig belegt sind. Level allein darf niemals als Beweis dafür dienen, dass eine Fähigkeit noch fehlt.
- Ein Lernziel besitzt genau eine stabile Erledigungs-ID; mehrere Händler oder Lehrer am selben Ort sind **Angebote dieses einen Lernziels** und niemals zusätzliche Erledigungen. Der Ortsplaner führt dafür keine zweite Stammdatenkopie, sondern leitet alle Angebote ausschließlich aus den gemeinsamen ForeverDB-Mastern ab.
- Alle bestätigten lokalen Angebote eines Lernziels bleiben bei ihren jeweiligen NPCs sichtbar. Die automatische Mehrfachauswahl nimmt jedes Lernziel genau einmal und wählt den niedrigsten **bestätigten** Preis; bei Preisgleichstand darf die geringere Stationszahl als Tie-Breaker dienen. Angebote ohne bestätigten Preis werden niemals als `0` behandelt und schlagen kein bekannt bepreistes Angebot.
- Die manuelle Auswahl speichert höchstens eine NPC-Quelle je Lernziel. Wird dasselbe Lernziel bei einem anderen NPC angeklickt, bleibt die bisherige Auswahl bestehen, bis der Wechsel ausdrücklich bestätigt wird; ein stilles Opt-out ist verboten. Die Wechselabfrage muss direkt am neu angeklickten Angebot sichtbar sein, damit sie auch in langen NPC-Listen nicht ausserhalb des aktuellen Sichtbereichs verloren geht. Ein bestätigter Wechsel ersetzt Quelle und Preis atomar. Ist die manuell gewählte Quelle nach bestätigten Preisen teurer als eine andere Quelle am selben Ort, muss der günstigere NPC samt Preis und Ersparnis sichtbar genannt werden.
- Verschiedene Ränge oder sonstige tatsächlich getrennt zu erwerbende Lerninhalte behalten unterschiedliche Erledigungs-IDs und dürfen unabhängig ausgewählt werden. Kategorien und Lernziele bleiben echte Mehrfachauswahlen. Die Erledigungsliste gruppiert nach dem tatsächlich gewählten NPC und summiert ausschließlich die eindeutigen ausgewählten Lernziele; fehlende Preise werden ausdrücklich ausgewiesen und niemals als `0` in eine vollständige Gesamtsumme eingerechnet.
- NPC-Bilder verwenden ausschließlich die gemeinsame Medienlogik `entityType + entityId + role`. Ein Avatar wird nur bei einer stabil und zweifelsfrei dem NPC zugeordneten Forever-Renderquelle archiviert; andernfalls bleibt er weg.
- Sichtbare Spielbegriffe und Orte folgen Abschnitt 2. ForeverDB-Daten werden sichtbar als Quelle verlinkt.
- Ändert sich der Charakterdatenstand, wird der Ortsplaner invalidiert und neu berechnet; die bestehende Erledigungsauswahl wird verworfen, weil Lernstand, Skill, Level oder Begleiterstatus sich geändert haben können.

## 8. Datenfrische / Frontend-Synchronisierung

- Alle Ansichten verwenden denselben serverseitig gespeicherten Charakterstand als Quelle: Charaktere, Vergleich, Begleiter, Berufe, Ruf, Quests, Werkstatt-Crafter und Ortsplaner.
- Ein erfolgreicher manueller Refresh muss den neuen Stand sofort in derselben Browser-Sitzung anwenden.
- Ein serverseitiger Morgen-/Cron-Refresh muss auch in bereits geöffneten Tabs automatisch erkannt werden. Dafür wird nur eine leichte Datenversion periodisch geprüft; ein vollständiger Datensatz wird ausschließlich bei Versionsänderung nachgeladen.
- Beim Zurückkehren in einen Tab (`visibilitychange`, `focus`, `pageshow`, `online`) wird die Datenversion sofort geprüft.
- Datenabhängige abgeleitete Ansichten müssen bei geändertem Charakter-`generatedAt` invalidiert werden. Für die Werkstatt betrifft das Overview, Suchergebnisse und ausgewählte Herstellbarkeitsinformationen; für den Ortsplaner die Orts-/Erledigungsliste und die Erledigungsauswahl.
- Benutzerzustände wie ausgewählte Vergleichscharaktere, aktive Charakter-Reiter oder Filtereinstellungen bleiben bei Hintergrundaktualisierungen erhalten.
- Ein Update der Pet-Regeln muss die globale Datenversion ebenfalls ändern, auch wenn sich der Charakter-`generatedAt`-Wert nicht geändert hat.

## 9. Merge-Gates

Jeder PR muss `npm test` bestehen. Dabei sind insbesondere verbindlich:

- `test-game-language.mjs`
- `test-layout-contract.mjs`
- `test-architecture-contract.mjs`

Ein Feature gilt erst dann als CI-/Architektur-konform, wenn diese Tests grün sind. „Funktioniert im Browser“ reicht nicht.

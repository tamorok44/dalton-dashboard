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
- Berufsausbildungen bzw. Berufsränge werden getrennt von normalen Rezepten behandelt. Hier werden Berufsskill, aktueller Skilldeckel, erforderliches Charakterlevel und die konkrete Bezugsquelle (Lehrer, Händlerbuch o. Ä.) geprüft. Fehlt der Mindestskill, das Charakterlevel oder der Rangpreis im Client/API-Rangdatensatz, dürfen ausschließlich **eng begrenzte, in den ForeverDB-Berufsführern ausdrücklich als Classic-Trainerdaten ausgewiesene Rangwerte** verwendet werden. Für den Skill sind dies Geselle 50, Experte 125 und Fachmann 200 bzw. bei Kochkunst/Erste Hilfe/Angeln 225; Level-Fallbacks werden nur für die dort konkret dokumentierten Berufs-/Rangkombinationen hinterlegt. Für Alchemie sind die von ForeverDB ausdrücklich als Classic-Daten ausgewiesenen Rangkosten 4 S 50 K (Geselle), 50 S (Experte) und 4 G 50 S (Fachmann) zulässige Preis-Fallbacks und werden stets als `classic` gekennzeichnet. Fehlt auch dafür eine belastbare Angabe, bleibt der Preis unbekannt; die Ausbildung selbst bleibt nur dann sichtbar, wenn ihre Lernvoraussetzungen und konkrete Quelle belegt sind. Eine Ausbildung erscheint nur, wenn alle belegten Voraussetzungen **jetzt** erfüllt sind. Ein allgemeiner Berufslehrer darf nicht ohne Rang-/Leistungsbezug als Beweis dienen.
- Klassenfähigkeiten verwenden einen zentralen ForeverDB-Klassenmaster mit stabiler Spell-ID, Rang, Lernlevel und Erwerbsart. Talente, Questfähigkeiten und sonstige „anderswo gelernt“-Fähigkeiten sind **keine** Klassenausbildung beim Lehrer und bleiben aus dieser Kategorie heraus.
- Jäger-Begleitertraining ist ebenfalls **keine Klassenfähigkeit**. ForeverDB-Zeilen wie `Beast Training` werden zentral aus dem Klassenmaster ausgeschlossen und gehören ausschließlich in die bestehende Begleiterlogik.
- Sichtbare Klassenzauber und Ränge werden über stabile Spell-IDs aus einer **deutschen ForeverDB-/Blizzard-Quelle** lokalisiert und zentral gecacht. Englische Klassennamen aus der technischen Klassen-API dürfen nicht als sichtbarer Fallback ausgegeben werden; fehlt die deutsche Lokalisierung vorübergehend, ist nur eine neutrale deutsche ID-Bezeichnung zulässig.
- Der bestätigte Zephras-Klassenlehrer-Fallback verwendet als sichtbaren Ortsnamen ausschließlich **„Insel Zephras“**. Technische Varianten wie `Zephras Isle` dürfen keinen zweiten Ort erzeugen.
- Der persönliche Lernstand ist strikt vom Klassenmaster getrennt. **Level allein darf niemals als Beweis dafür dienen, dass ein Rang bereits gelernt oder noch nicht gelernt ist.** Liefert eine persönliche Profilquelle einen echten Spellbook-/Zauberstand, werden bekannte Spell-IDs gespeichert und bereits gelernte Ränge aus der offenen Ausbildung entfernt. Fällt diese Quelle später vorübergehend aus, darf der letzte bekannte Stand zur Dokumentation erhalten bleiben, gilt aber bis zur erneuten Bestätigung nicht als aktuell verifiziert.
- Ist kein persönlicher Spellbook-Stand verfügbar, dürfen am aktuellen Level grundsätzlich fällige, am bestätigten Klassenlehrer angebotene Ränge sichtbar bleiben, müssen aber ausdrücklich als **persönlicher Lernstand offen** gekennzeichnet sein. Solche Ränge werden von „Alle sichtbaren auswählen“ und von automatischen Summen ausgeschlossen, damit bereits gekaufte Ränge nicht versehentlich erneut eingeplant werden.
- Bereits gelernte Klassenränge werden bei verifiziertem persönlichem Spellbook-Stand im Ortsplaner sichtbar dokumentiert; der Lernstand darf nicht nur intern zum Filtern verwendet werden.
- Der persönliche Lernstand wird mit dem kleinen Forever-Addon **Dalton Dashboard Spellbook Sync** direkt aus dem Player-Spellbook erfasst. Verbindliche Quelle ist die Forever-API `C_SpellBook` im Spielclient; exportiert werden ausschließlich tatsächlich bekannte Player-Spells aus den Klassen-SkillLines, niemals FutureSpells, Berufsreiter oder das Pet-Spellbook. Ein höher bekannter Rang darf die darunterliegenden Ränge derselben Master-Fähigkeit als mitgelernt markieren.
- Der Ingame-Snapshot wird serverseitig persistent am Charakter gespeichert. Die Schreibschnittstelle akzeptiert ausschließlich Codes mit dem privaten `SPELLBOOK_SYNC_TOKEN`; der Token liegt nur als sensibles Vercel-Environment und lokal im persönlichen Addon-Paket, niemals im Repository oder Frontend. Charakter-Slug, Klasse, Level, Zeitstempel und Payload werden vor dem Speichern geprüft; der reguläre Profil-Refresh erhält den zuletzt synchronisierten Spellbook-Stand.
- WoW-Addons dürfen nicht als Webclient behandelt werden. Der Sync ist deshalb bewusst benutzerinitiiert: `/dalton` erzeugt einen kopierbaren Code, der im Dashboard-Reiter **Klassenfähigkeiten** übernommen wird. Ohne neuen Code wird kein späterer Kauf erfunden; der gespeicherte Zeitpunkt bleibt sichtbar.
- Klassenlehrer benötigen wie alle anderen NPC-Quellen einen bestätigten Ort und `evidence = forever-confirmed`. Die aktuelle ForeverDB-Klassenlehrerliste ist dafür eine zentrale Quelle: nur dort als in Forever gesehen markierte Lehrer werden als reguläre Ortsplaner-Quelle freigegeben; Classic-only Einträge bleiben ausgeschlossen. Die separat belegten Zephras-Lehrer bleiben als zusätzlicher bestätigter Forever-Fallback erhalten. Klassenrangpreise folgen derselben Provenienzregel wie andere Trainerpreise; Spell-`baseCost` bleibt ausdrücklich ungeeignet als Goldpreis.
- Ein Lernziel besitzt genau eine stabile Erledigungs-ID; mehrere Händler oder Lehrer am selben Ort sind **Angebote dieses einen Lernziels** und niemals zusätzliche Erledigungen. Der Ortsplaner führt dafür keine zweite Stammdatenkopie, sondern leitet alle Angebote ausschließlich aus den gemeinsamen ForeverDB-Mastern ab.
- Preise sind Teil des gemeinsamen ForeverDB-Masters und besitzen eine explizite Provenienz. Für Trainerkosten gilt: `forever-observed` bedeutet einen in Forever beobachteten/abgeleiteten Vollpreis, `classic` einen belastbaren Classic-Fallback und `unknown` eine numerische Angabe ohne ausreichend belegte Herkunft. Ein auf Rezept-, Rang-, Fraktions- oder Lehrergruppen-Ebene gelieferter `trainerCost` wird zentral an die zugehörigen konkreten Lehrerquellen vererbt; einzelne NPC-Preise dürfen diesen Gruppenpreis überschreiben. Features dürfen diese Vererbung nicht separat nachbauen.
- Spell-`baseCost` ist **kein** Ersatz für einen Trainer-Goldpreis. Trainerpreise dürfen nur aus echten Trainer-/Berufsdaten übernommen werden.
- Alle bestätigten lokalen Angebote eines Lernziels bleiben bei ihren jeweiligen NPCs sichtbar. Die automatische Mehrfachauswahl nimmt jedes Lernziel genau einmal. Ein `forever-observed` Preis hat stets Vorrang vor einem `classic`-Fallback, auch wenn der Classic-Wert numerisch niedriger ist. Innerhalb derselben Preisqualität wird der niedrigste Preis gewählt; bei Preisgleichstand darf die geringere Stationszahl als Tie-Breaker dienen. Gibt es keinen Forever-Preis, darf ein Classic-Preis zur Planung verwendet werden, muss aber sichtbar als **noch nicht in Forever bestätigt** gekennzeichnet sein.
- Gesamtsummen mit mindestens einem Classic-Preis heißen **Voraussichtliche Gesamtkosten** und weisen den Classic-Anteil aus. Wirklich unbekannte Preise werden niemals als `0` behandelt, nicht still in eine vollständige Gesamtsumme eingerechnet und bleiben als `Preis noch nicht bekannt` sichtbar.
- **Darstellungskonvention:** Bestätigte aktuelle Forever-Daten sind der Normalfall und erhalten **kein zusätzliches Bestätigungslabel**. Sichtbare Labels kennzeichnen Abweichungen vom Normalfall; bei Preisen betrifft das insbesondere `Classic-Preis · noch nicht in Forever bestätigt`. Ein Label wie `Forever-Preis` darf in der normalen Oberfläche nicht erscheinen.
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

## 9. Betrieb / Persistenz

- Redis ist die operative Wahrheit für Charakterstände, Kataloge und koordinierende Locks; Vercel Blob archiviert Voll-Snapshots und Medien. Diese Rollen dürfen nicht durch parallele Stammdatenkopien in einzelnen Features aufgeweicht werden.
- Stateful Infrastruktur und Functions werden gemeinsam in Frankfurt (`fra1`) betrieben. Ein Regionswechsel weg von Redis/Blob ist eine Architekturänderung und muss vorab mit Latenz- und Fehlerbudget begründet werden.
- Jeder verteilte Redis-Lock muss auf **jedem** Fehlerpfad freigegeben werden. Insbesondere dürfen vorgelagerte Regel-, Katalog- oder Validierungsfehler keinen Lock bis zum TTL-Ablauf liegen lassen.
- Ein täglicher Roh-Snapshot und der anschliessende Charakter-Refresh sind zwei getrennte Erfolgsschritte. Ein bereits gespeicherter Snapshot darf einen noch nicht persistierten Charakter-Refresh nicht als erledigt markieren. Der zweite Morgenlauf ist idempotent: vollständig abgeschlossene Tage werden nur gelesen und sofort beendet; unvollständige Tage wiederholen ausschließlich den fehlenden Schritt.
- Der produktive Dependency-Baum ist über `package-lock.json` reproduzierbar. CI muss deshalb mit `npm ci` installieren, bekannte High/Critical-Advisories prüfen und sowohl die unterstützte Mindestlaufzeit Node 22 als auch die aktuelle Produktionslaufzeit Node 26 testen.
- Die Änderungschronik speichert nur fachliche Änderungen; tägliche Voll-Snapshots liegen komprimiert in Blob. Append-only-Verläufe werden nicht still gelöscht oder umgeschrieben. Speicher- und Command-Quoten werden bei strukturellen Erweiterungen erneut bewertet.

## 10. Merge-Gates

Jeder PR muss den reproduzierbaren Dependency-Install, den Security-Audit und `npm test` unter Node 22 und Node 26 bestehen. Dabei sind insbesondere verbindlich:

- `test-game-language.mjs`
- `test-layout-contract.mjs`
- `test-architecture-contract.mjs`

Ein Feature gilt erst dann als CI-/Architektur-konform, wenn diese Tests grün sind. „Funktioniert im Browser“ reicht nicht.

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

### ForeverDB-Request-Budget

- Der Free-Tarif ist als harte Betriebsgrenze zu behandeln: **5.000 API-Key-Requests pro Tag und 30 pro Minute**. Die öffentliche `/data/*`-Buildauslieferung ist für statische Builddaten bewusst zu bevorzugen.
- ForeverDB-API-Antworten werden serverseitig zentral und buildbezogen in Redis gespeichert. Normale Seitenaufrufe dürfen denselben Spell, NPC, Gegenstand, Beruf oder Katalog nicht erneut beim API-Key-Endpunkt laden.
- Der ForeverDB-Build wird im Normalbetrieb höchstens alle **30 Minuten** über `/meta` geprüft. Ist `/meta` vorübergehend nicht erreichbar oder rate-limited, bleibt der letzte gespeicherte Build nutzbar.
- Ein Katalog-Neuaufbau ist über einen verteilten Redis-Lock geschützt. Parallele Vercel-Instanzen dürfen niemals denselben Master-Chunk gleichzeitig laden.
- Eine 12-fache berufsweise Rezeptsuche für einen einzelnen Gegenstand ist in normalen Nutzeraufrufen grundsätzlich verboten. Während eines Master-Neuaufbaus bleibt der letzte vollständige Katalog bzw. der Aktualisierungshinweis maßgeblich. Itemdetails besitzen einen eigenen buildbezogenen Cache; freie Suchbegriffe werden 24 Stunden gecacht und im Browser erst nach mindestens drei Zeichen/350 ms Ruhe ausgelöst.
- Deutsche Klassenzaubernamen, Ränge und Icon-IDs werden aus den öffentlichen ForeverDB-Builddateien geladen. Pro-Spell-API-Aufrufe für reine Darstellung/Lokalisierung sind verboten.
- NPC-Bilder dürfen keinen `/vendors/:id`- oder vergleichbaren ForeverDB-N+1-Abruf verursachen. Render-Metadaten aus dem Master haben Vorrang; für bekannte Classic-NPC-IDs ist die CMaNGOS-Display-ID ausschließlich als visueller Fallback zulässig.

## 2. Sprache / WoW-Begriffe

- Sichtbare WoW-Bezeichnungen kommen aus verifizierten deutschen Blizzard-/Forever-Quellen.
- Bei widersprüchlichen Quellen gilt für sichtbare WoW-Bezeichnungen die Priorität: **aktueller deutscher Forever-Spielclient (deDE) → aktuelle deutsche Forever-Clientextraktion bzw. lokalisierte Blizzard-Game-Data → offizielle deutsche Blizzard-Spieler-/UI-Terminologie für separat verifizierte Begriffe**. Deutsche UI bedeutet nicht, dass englische Eigennamen übersetzt werden. Ältere Classic-/Retail-Texte überschreiben keine aktuellen Ortsnamen.
- Quellenbelegte Terminologie-Master sind ausschließlich über stabile Spiel-IDs erlaubt. Jeder Eintrag benötigt offizielle Quelle, Locale und Verifizierungsdatum; freie Englisch→Deutsch-Übersetzungstabellen bleiben verboten.
- Der aktuelle Berufs-Master liegt in `scripts/player-terminology.mjs` und ist durch die offiziellen deutschen WoW-Forever-Berufsseiten belegt. Beispiel: Beruf-ID `171` wird sichtbar als **„Alchemie“** geführt, auch wenn technische Client-/Game-Data-Felder „Alchimie“ liefern.
- Ortsnamen werden ausschließlich nach aktueller Forever-Evidenz und stabiler Karten-ID vereinheitlicht: `1453` = **Stormwind**, `1455` = **Ironforge**, `1440` = **Ashenvale**; `2521` = **Die Insel Zephras** (deDE-Clientbeobachtung, Build 71037, 24.11.2026). Historische Namen und Artikelvarianten sind ausschließlich interne Aliasnamen, keine weiteren Orte. Bei einer neuen, nicht als historischer Alias bekannten Quellbezeichnung bleibt die Quellbezeichnung erhalten. Das gilt für Ortsplaner, Werkstatt, ältere Berufsplaner-Schnittstelle und Standortanzeige. Nicht verifizierte Namensänderungen sind unzulässig.
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
- Klassenfähigkeits-Icons und NPC-Porträts verwenden denselben Resolver. Zaubericons werden über stabile Spell-/Icon-IDs archiviert; NPC-Porträts über stabile NPC-/Display-IDs.
- Ist für einen Forever-bestätigten Classic-NPC keine Render-ID in der Forever-Quelle vorhanden, darf ausschließlich für die Darstellung eine belegte Classic-Display-ID verwendet werden. Neue Forever-NPCs werden niemals über Namensraten einem Classic-Modell zugeordnet; fehlt eine stabile Bildidentität, zeigt die UI den neutralen Dalton-NPC-Fallback.

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

- Die Ortsauswahl verwendet einen gemeinsamen, dauerhaften Ortskatalog für alle Daltons, unabhängig von Klasse, Beruf, Level und bestätigten aktuellen Erledigungen. Verifizierte Kartenbezeichnungen, sämtliche gemeinsamen Rezept-/Berufs-/Klassenquellen und bekannte AddOn-Orte bilden diesen Katalog. Bereits bekannte Orte bleiben bei temporären Quellausfällen oder auslaufender Standorthistorie auswählbar. Nur die Erledigungszahlen und Angebote sind charakterabhängig; die bloße Existenz eines Orts bestätigt kein NPC-Angebot. Insbesondere muss Die Insel Zephras bei jedem Dalton mit 0 oder mehr Erledigungen auswählbar sein.

- Der Ortsplaner ersetzt den bisherigen Berufsplaner. Er verwendet die aktuellen Blizzard-Charakterdaten und gemeinsame persistente ForeverDB-Master; er führt **keine eigene Kopie** von Rezepten, Fähigkeiten oder NPC-Stammdaten.
- Oben werden Charakter und Ort gewählt. Darunter stehen die echten Mehrfachfilter **Klassenfähigkeiten**, **Berufsrezepte**, **Berufsausbildung** und **Begleiterfähigkeiten** standardmäßig aktiviert zur Verfügung.
- Der Ortsplaner zeigt ausschließlich Erledigungen, die der gewählte Charakter **jetzt** am gewählten Ort durchführen kann. Zukünftige Level-, Skill- oder sonstige Fortschrittshinweise gehören nicht in diese Ansicht.
- Eine Rezept-Erledigung ist nur zulässig, wenn der Charakter den passenden Beruf besitzt, das Rezept nach dem verifizierten Charakterstand noch nicht kennt, der erforderliche Berufsskill erfüllt ist und eine konkrete Forever-bestätigte Bezugsquelle am Ort existiert. Eine zusätzliche Rezept-Charakterlevel-Anforderung wird nur berücksichtigt, wenn sie für genau dieses Rezept ausdrücklich belegt ist.
- Für NPC-Quellen werden nur bestätigte aktuelle Quellen, ein bestätigter Ort und die passende Fraktion akzeptiert. ForeverDB bleibt der externe Master; eine buildgleiche direkte Dalton-Addon-Beobachtung besitzt für das konkret beobachtete Händler-/Lehrerangebot höhere Evidenzpriorität als ein widersprechender externer Eintrag. Classic-unbestätigte oder unbekannte Quellen bleiben aus dem Ortsplaner heraus.
- Vollständige Händlerfenster werden buildgebunden als Dalton-Livewissen persistiert. Ist ein vom Master demselben Händler zugeschriebenes **unlimitiertes** Angebot im vollständigen Fenster nicht vorhanden, darf diese Händlerzuordnung für den Build blockiert werden. Unvollständige Fenster und bekannte limitierte Ware dürfen niemals negative Evidenz erzeugen.
- Live beobachtete Lerngegenstände, die im aktuellen Rezept-Master noch nicht eindeutig zugeordnet werden können, bleiben dauerhaft mit Item-ID, Clientname, Preis, NPC, Ort, Build und Beobachtungszeit erhalten. Sie werden im Ortsplaner separat als bestätigter Live-Neufund angezeigt, aber bis zur eindeutigen Klassifizierung weder als lernbare Erledigung noch in automatische Auswahl/Kostenrechnung aufgenommen.
- Berufsausbildungen bzw. Berufsränge werden getrennt von normalen Rezepten behandelt. Hier werden Berufsskill, aktueller Skilldeckel, erforderliches Charakterlevel und die konkrete Bezugsquelle (Lehrer, Händlerbuch o. Ä.) geprüft. Fehlt der Mindestskill, das Charakterlevel oder der Rangpreis im Client/API-Rangdatensatz, dürfen ausschließlich **eng begrenzte, in den ForeverDB-Berufsführern ausdrücklich als Classic-Trainerdaten ausgewiesene Rangwerte** verwendet werden. Für den Skill sind dies Geselle 50, Experte 125 und Fachmann 200 bzw. bei Kochkunst/Erste Hilfe/Angeln 225; Level-Fallbacks werden nur für die dort konkret dokumentierten Berufs-/Rangkombinationen hinterlegt. Für Alchemie sind die von ForeverDB ausdrücklich als Classic-Daten ausgewiesenen Rangkosten 4 S 50 K (Geselle), 50 S (Experte) und 4 G 50 S (Fachmann) zulässige Preis-Fallbacks und werden stets als `classic` gekennzeichnet. Fehlt auch dafür eine belastbare Angabe, bleibt der Preis unbekannt; die Ausbildung selbst bleibt nur dann sichtbar, wenn ihre Lernvoraussetzungen und konkrete Quelle belegt sind. Eine Ausbildung erscheint nur, wenn alle belegten Voraussetzungen **jetzt** erfüllt sind. Ein allgemeiner Berufslehrer darf nicht ohne Rang-/Leistungsbezug als Beweis dienen.
- Klassenfähigkeiten verwenden einen zentralen ForeverDB-Klassenmaster mit stabiler Spell-ID, Rang, Lernlevel und Erwerbsart. Talente, Questfähigkeiten und sonstige „anderswo gelernt“-Fähigkeiten sind **keine** Klassenausbildung beim Lehrer und bleiben aus dieser Kategorie heraus.
- Jäger-Begleitertraining ist ebenfalls **keine Klassenfähigkeit**. ForeverDB-Zeilen wie `Beast Training` werden zentral aus dem Klassenmaster ausgeschlossen und gehören ausschließlich in die bestehende Begleiterlogik.
- Sichtbare Klassenzauber und Ränge werden über stabile Spell-IDs aus einer **deutschen ForeverDB-/Blizzard-Quelle** lokalisiert und zentral gecacht. Englische Klassennamen aus der technischen Klassen-API dürfen nicht als sichtbarer Fallback ausgegeben werden; fehlt die deutsche Lokalisierung vorübergehend, ist nur eine neutrale deutsche ID-Bezeichnung zulässig.
- Klassenlehrer-Gebiete werden über die stabile `uiMapId` auf einen **source-backed deutschen ForeverDB-Kartennamen** abgebildet. Verbindlicher Snapshot sind die deutschen ForeverDB-Kartenseiten `/de/maps/{uiMapId}`; technische englische Namen aus `trainers.json` dürfen nicht sichtbar werden. Der bestätigte Zephras-Klassenlehrer-Fallback verwendet als sichtbaren Ortsnamen ausschließlich **„Insel Zephras“**. Technische Varianten wie `Zephras Isle` dürfen keinen zweiten Ort erzeugen.
- Der persönliche Lernstand ist strikt vom Klassenmaster getrennt. **Level allein darf niemals als Beweis dafür dienen, dass ein Rang bereits gelernt oder noch nicht gelernt ist.** Liefert eine persönliche Profilquelle einen echten Spellbook-/Zauberstand, werden bekannte Spell-IDs gespeichert und bereits gelernte Ränge aus der offenen Ausbildung entfernt. Fällt diese Quelle später vorübergehend aus, darf der letzte bekannte Stand zur Dokumentation erhalten bleiben, gilt aber bis zur erneuten Bestätigung nicht als aktuell verifiziert.
- Ist kein persönlicher Spellbook-Stand verfügbar, dürfen am aktuellen Level grundsätzlich fällige, am bestätigten Klassenlehrer angebotene Ränge sichtbar bleiben, müssen aber ausdrücklich als **persönlicher Lernstand offen** gekennzeichnet sein. Solche Ränge werden von „Alle sichtbaren auswählen“ und von automatischen Summen ausgeschlossen, damit bereits gekaufte Ränge nicht versehentlich erneut eingeplant werden.
- Bereits gelernte Klassenränge werden bei verifiziertem persönlichem Spellbook-Stand im Ortsplaner sichtbar dokumentiert; der Lernstand darf nicht nur intern zum Filtern verwendet werden.
- Der persönliche Lernstand wird mit dem Forever-Addon **Dalton Dashboard Sync** direkt aus dem Player-Spellbook erfasst. Verbindliche Quelle ist die Forever-API `C_SpellBook` im Spielclient. Der serverseitige Klassenmaster filtert den Ingame-Snapshot auf echte Klassenränge; FutureSpells, Berufsreiter und das Pet-Spellbook dürfen niemals als Klassenfähigkeit gespeichert werden. Ein höher bekannter Rang darf die darunterliegenden Ränge derselben Master-Fähigkeit als mitgelernt markieren.
- Das WoW-Addon selbst enthält **keinen Netzwerkclient und keinen privaten Schlüssel**. Es sammelt Daten ausschließlich ereignisgesteuert in SavedVariables. Ein separater lokaler Companion liest diese Datei erst nachdem WoW sie bei Logout oder `/reload` geschrieben hat und überträgt eine feste Privacy-Whitelist.
- Der Standard-Sync umfasst Charakteridentität, Spellbook, Standort und schlanke Standorthistorie, Lockouts, Hunter/Pet sowie vollständige Händler-/Lehrerbeobachtungen. **Gold, Taschen und Bank werden lokal erfasst, aber vom Standard-Sync ausdrücklich nicht übertragen.** Eine spätere Freigabe dieser Bereiche erfordert eine eigenständige Architektur- und Datenschutzentscheidung.
- Händler-/Lehrerbeobachtungen sind buildgebundene Live-Evidenz. Eine Momentaufnahme darf nur als vollständiger Angebotsbeleg verwendet werden, wenn alle Einträge des geöffneten Fensters lesbar waren; unvollständige Snapshots dürfen keine negative Evidenz erzeugen.
- Die private Schreibschnittstelle `/api/addon-sync` authentifiziert den lokalen Companion per Bearer-Token aus `DALTON_SYNC_TOKEN` bzw. während der Migration dem bestehenden serverseitigen `SPELLBOOK_SYNC_TOKEN`. Der Schlüssel liegt ausschließlich als sensibles Vercel-Environment und lokal ausserhalb des Addons; niemals im Repository, Frontend oder Addon-Paket.
- `/dalton scan` bleibt eine Diagnosefunktion. Der normale Addonbetrieb ist ereignisgesteuert; kein `OnUpdate`, kein permanentes Positions-Polling und kein wiederkehrender Komplettscan sind zulässig.
- Klassenlehrer benötigen wie alle anderen NPC-Quellen einen bestätigten Ort und `evidence = forever-confirmed`. Die aktuelle ForeverDB-Klassenlehrerliste ist dafür eine zentrale Quelle: nur dort als in Forever gesehen markierte Lehrer werden als reguläre Ortsplaner-Quelle freigegeben; Classic-only Einträge bleiben ausgeschlossen. Die separat belegten Zephras-Lehrer bleiben als zusätzlicher bestätigter Forever-Fallback erhalten. **Ein Rang darf jedoch nicht allein deshalb als kaufbare Klassenausbildung erscheinen, weil er in einer Klassenliste mit `Trainer` markiert ist.** Er benötigt zusätzlich Unterrichtsevidenz: einen Forever-Trainerpreis/eine konkrete Lehrerquelle oder einen Treffer in der zentralen CMaNGOS-Classic-Lehrertabelle. Diese Classic-Tabelle liefert ausschließlich Preis und Unterrichtsbeleg und wird stets als `classic` gekennzeichnet; Startzauber, interne Auren und Effekte ohne solchen Beleg bleiben fail-closed unsichtbar. Portal-Lehrer dürfen nur Portal-/Teleport-Fähigkeiten anbieten, Pet-Lehrer keine normalen Klassenränge. Klassenrangpreise folgen ansonsten derselben Provenienzregel wie andere Trainerpreise; Spell-`baseCost` bleibt ausdrücklich ungeeignet als Goldpreis.
- Ein Lernziel besitzt genau eine stabile Erledigungs-ID; mehrere Händler oder Lehrer am selben Ort sind **Angebote dieses einen Lernziels** und niemals zusätzliche Erledigungen. Der Ortsplaner führt dafür keine zweite Stammdatenkopie, sondern leitet alle Angebote ausschließlich aus den gemeinsamen ForeverDB-Mastern ab.
- Preise sind Teil des gemeinsamen ForeverDB-Masters und besitzen eine explizite Provenienz. Für Trainerkosten gilt: `forever-observed` bedeutet einen in Forever beobachteten/abgeleiteten Vollpreis, `classic` einen belastbaren Classic-Fallback und `unknown` eine numerische Angabe ohne ausreichend belegte Herkunft. Ein auf Rezept-, Rang-, Fraktions- oder Lehrergruppen-Ebene gelieferter `trainerCost` wird zentral an die zugehörigen konkreten Lehrerquellen vererbt; einzelne NPC-Preise dürfen diesen Gruppenpreis überschreiben. Features dürfen diese Vererbung nicht separat nachbauen.
- Spell-`baseCost` ist **kein** Ersatz für einen Trainer-Goldpreis. Trainerpreise dürfen nur aus echten Trainer-/Berufsdaten übernommen werden.
- Alle bestätigten lokalen Angebote eines Lernziels bleiben bei ihren jeweiligen NPCs sichtbar. Die automatische Mehrfachauswahl nimmt jedes Lernziel genau einmal. Ein `forever-observed` Preis hat stets Vorrang vor einem `classic`-Fallback, auch wenn der Classic-Wert numerisch niedriger ist. Innerhalb derselben Preisqualität wird der niedrigste Preis gewählt; bei Preisgleichstand darf die geringere Stationszahl als Tie-Breaker dienen. Gibt es keinen Forever-Preis, darf ein Classic-Preis zur Planung verwendet werden, muss aber sichtbar als **noch nicht in Forever bestätigt** gekennzeichnet sein.
- Gesamtsummen mit mindestens einem Classic-Preis heißen **Voraussichtliche Gesamtkosten** und weisen den Classic-Anteil aus. Wirklich unbekannte Preise werden niemals als `0` behandelt, nicht still in eine vollständige Gesamtsumme eingerechnet und bleiben als `Preis noch nicht bekannt` sichtbar.
- **Darstellungskonvention:** Bestätigte aktuelle Forever-Daten sind der Normalfall und erhalten **kein zusätzliches Bestätigungslabel**. Sichtbare Labels kennzeichnen Abweichungen vom Normalfall; bei Preisen betrifft das insbesondere `Classic-Preis · noch nicht in Forever bestätigt`. Ein Label wie `Forever-Preis` darf in der normalen Oberfläche nicht erscheinen.
- Die manuelle Auswahl speichert höchstens eine NPC-Quelle je Lernziel. Wird dasselbe Lernziel bei einem anderen NPC angeklickt, bleibt die bisherige Auswahl bestehen, bis der Wechsel ausdrücklich bestätigt wird; ein stilles Opt-out ist verboten. Die Wechselabfrage muss direkt am neu angeklickten Angebot sichtbar sein, damit sie auch in langen NPC-Listen nicht ausserhalb des aktuellen Sichtbereichs verloren geht. Ein bestätigter Wechsel ersetzt Quelle und Preis atomar. Ist die manuell gewählte Quelle nach bestätigten Preisen teurer als eine andere Quelle am selben Ort, muss der günstigere NPC samt Preis und Ersparnis sichtbar genannt werden.
- Verschiedene Ränge oder sonstige tatsächlich getrennt zu erwerbende Lerninhalte behalten unterschiedliche Erledigungs-IDs und dürfen unabhängig ausgewählt werden. Kategorien und Lernziele bleiben echte Mehrfachauswahlen. Die Erledigungsliste gruppiert nach dem tatsächlich gewählten NPC und summiert ausschließlich die eindeutigen ausgewählten Lernziele; fehlende Preise werden ausdrücklich ausgewiesen und niemals als `0` in eine vollständige Gesamtsumme eingerechnet.
- NPC-Bilder verwenden ausschließlich die gemeinsame Medienlogik `entityType + entityId + role`. Forever-native Renderdaten haben Vorrang. Für einen eindeutig über stabile NPC-ID identifizierten Classic-NPC darf die zentrale CMaNGOS-Display-ID als **visueller** Fallback dienen; neue Forever-NPCs werden niemals per Name oder Ähnlichkeit zugeordnet. Ist kein belastbares Bild verfügbar, bleibt der Avatarplatz sichtbar und verwendet den neutralen Dalton-Fallback.
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
- Eine fachliche Änderung des persistenten Dalton-Livewissens muss die globale Datenversion ebenfalls ändern, damit bereits geöffnete Werkstatt-/Ortsplaner-Ansichten neue Händler- oder Lehrerbeobachtungen erkennen.

## 9. Betrieb / Persistenz

- Redis ist die operative Wahrheit für Charakterstände, Kataloge, buildgebundenes Dalton-Livewissen und koordinierende Locks; Vercel Blob archiviert Voll-Snapshots und Medien. Diese Rollen dürfen nicht durch parallele Stammdatenkopien in einzelnen Features aufgeweicht werden.
- Dalton-Livewissen ist charakterunabhängig: pro Build + NPC + Interaktionstyp wird ein aktueller Wissensstand gespeichert. Identische Wiederholungen werden dedupliziert; nur echte Inhaltsänderungen (Angebot hinzugekommen/entfernt bzw. geänderter Stand) werden in einer begrenzten Änderungshistorie geführt. Positive erstmals beobachtete Angebote bleiben als `firstSeen/lastSeen`-Wissen erhalten, auch wenn sie im externen Master noch fehlen oder später aus der begrenzten lokalen Addon-Historie herausfallen.
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

## Live-Lernstand während Spielsitzungen (verbindliches Entwicklungsziel, 24.11.2026)

Der Ortsplaner und die Werkstatt müssen während längerer Spielsitzungen mit einem gemeinsamen, möglichst aktuellen bestätigten Lernstand arbeiten. Ein bloßes erneutes Laden der Webseite oder eine Blizzard-Profilabfrage ersetzt keinen aktuellen Client-Lernstand. Der bei Cole am 24.11.2026 bestätigte Fall (neu erlernte Berufsfähigkeit und zwei Rezepte wurden erst nach Logout in Blizzard-Daten sichtbar) ist ein verpflichtender Regressionstest.

- Erfassungsumfang: Spielerlevel, erlernte/verlernte Klassenfähigkeiten und Ränge, Talente und Resets, Berufswahl/Verlernen, Berufsfertigkeit und Ausbildungshöchstwert, erlernte/verlernte Berufsrezepte und Herstellungsfähigkeiten, Begleiterfähigkeiten und Ränge.
- Erfassung über unterstützte Client-Events und verzögerte, zusammengefasste Momentaufnahmen; keine OnUpdate-Schleifen, kein permanentes Durchsuchen von Spellbook/Berufslisten, keine erzwungenen UI-Reloads, keine automatischen Spielaktionen. Daten erst bei fachlicher Änderung senden. Unlesbare oder gefilterte Teilbestände sind niemals ein vollständiger Negativnachweis. Rezept-, Spell-, Item- und SkillLine-IDs bleiben getrennt; kein Gleichsetzen verschiedener ID-Typen und kein ungesicherter Name-Match.
- Gemeinsamer effektiver Charakterstand auf dem Server: neuere bestätigte Clientbeobachtungen haben Vorrang vor älteren Blizzard-Profilständen. Veraltete Profilantworten dürfen frisch synchronisierte Lernstände nicht rückgängig machen. Tatsächlich bestätigtes Verlernen oder ein Talentreset muss dagegen wirksam sein. Nur vollständige, vergleichbare Snapshots erlauben die Entfernung alter Einträge; Teilbeobachtungen ergänzen lediglich nachgewiesene Fakten. Quellen- und Erfassungszeitpunkte pro Domäne erhalten; eine neue Abrufzeit allein beweist keine Aktualität des Blizzard-Inhalts.
- Nach einer erfolgreichen Änderung muss die Datenversion angepasst werden, sodass Charakterübersicht, Vergleich, Ortsplaner und Werkstatt den gemeinsamen Lernstand automatisch neu auswerten. Derselbe erlernte Gegenstand bzw. dieselbe Lernfähigkeit darf an keinem alternativen Ort mehr als offen erscheinen. Mehrere Quellen für eine Fähigkeit erhöhen nicht die globale Zahl.
- Transportgrenze: Der bestehende SavedVariables-Companion und das Peer-Relay ermöglichen derzeit keine laufende Web-Synchronisierung ohne Speichervorgang des WoW-Clients. Ein Live-Transport ist separat nachzuweisen und vor Freigabe lokal auf Coles Rechner zu testen. Nur dokumentierte, zulässige Client-/Betriebssystem-Schnittstellen; kein Prozessspeicherzugriff, keine Eingriffe in den Client, keine Umgehung von Secret Values, keine Weiterleitung privater Chattexte.
- Kandidat für den optionalen Live-Transport: die reguläre WoW-Chatprotokollfunktion mit eigener eindeutig gekennzeichneter, minimaler fachlicher Nutzlast und lokaler Bridge. Aktivierung nur bewusst mit Datenschutzhinweis (die Spielprotokolldatei kann auch reguläre Chats und Whispers enthalten); keine Übertragung dieser Inhalte, nur validierte freigegebene Dalton-Daten, keine serverseitigen Schlüssel im AddOn. Eignung, tatsächliche Schreibverzögerung, Datenschutz, Blizzard-/CurseForge-Vorgaben und Leistung müssen vor Implementierungsfreigabe geprüft werden. Ein bestehendes Drittanbieter-AddOn allein ist kein Nachweis der Zulässigkeit.
- Abnahmekriterien: ohne Logout und ohne /reload im selben Spielabschnitt Rezept, Berufsausbildung, Klassenzauber und Fertigkeit lernen; Dashboard erhält die Änderungen zuverlässig und entfernt alle dazugehörigen offenen Ortsangebote; Werkstatt berücksichtigt den neuen Lernstand; alter Blizzard-Abruf setzt nichts zurück; doppelte, verspätete und unvollständige Datensätze sind unschädlich; Offline-/Verbindungsunterbrechung wird abgefangen; CPU-/Speicher-/Datenlast bleibt auch auf schwachen Rechnern praktisch unmerklich. CurseForge-Veröffentlichung erst nach erfolgreichem lokalem Ende-zu-Ende-Test.
- Ohne verifizierten Live-Transport bleibt der letzte erfolgreiche Sync klar als Datenstand kenntlich. Kein Versprechen einer Echtzeitaktualität und keine technische Codeanzeige im Dashboard.


### Redis-Bandbreite / P0 (25.11.2026)

Die Versionsprüfung lädt ausschließlich die atomar mit den Originaldaten gepflegte kompakte Versionsmetadaten-Hashmap und die Livewissen-Version. Legacy-Daten werden einmalig mit HSETNX migriert; auch fehlende AddOn-Syncs werden als null gespeichert, nicht bei jedem Poll erneut gesucht. Charakter-, Pet- und AddOn-Schreibvorgänge aktualisieren die Metadaten gemeinsam mit ihrem Originalpayload. `/api/characters`, `/api/refresh` und `/api/data-version` müssen dieselben Versionsbestandteile liefern (inkl. Livewissen und AddOn). Jede fachliche Versionsänderung invalidiert Werkstatt und Ortsplaner. Keine häufigen Vollabrufe zur bloßen Versionskontrolle.


### Redis-Bandbreite / P1

Große Rezept-Master, Rezept-Entwürfe und buildbezogene Klassenmaster werden verlustfrei gzip-komprimiert in versionierten Redis-Schlüsseln gespeichert. Bestehende unkomprimierte Schlüssel bleiben als Rollback-Bestand erhalten und werden im warmen Pfad nicht mehr gelesen. Keine zusätzlichen ForeverDB-Abfragen zur Migration. Die Ortsliste verwendet je Klasse eine kleine buildbezogene Ortsprojektion und lädt nur den vollständigen Master der tatsächlich ausgewählten Klasse. Es bleiben alle gemeinsamen Orte erhalten. Cache-Formate dürfen keine fachliche Evidenz, Namen oder IDs verändern.


### ForeverDB-Kontingent und variable Händlerbestände (25.11.2026)

Der zentrale API-Adapter reserviert jede echte, mit dem ForeverDB-Key autorisierte Anfrage vorab im verteilten UTC-Tagesbudget (4.000 interne Anfragen als Sicherheitsmarge gegenüber den in der Anbieter-E-Mail genannten 5.000 kostenlosen Anfragen). Auch parallele Funktionen desselben Schlüssels/Redis zählen gemeinsam. Keine automatischen Upgrades; die Anbieterstatistik bleibt maßgeblich, andere Anwendungen außerhalb dieses Zählers sind nicht erfasst. Bereits archivierte Daten und verifizierte Master bleiben bevorzugt. Livewissen liest nur den passenden Build in begrenzten MGET-Batches statt alter Datensätze einzeln.

Die vom Anbieter angekündigten Felder stockLists und notEveryoneSees erfordern eine getrennte, player-/kontextbezogene Evidenzlogik. Eine vollständige Händlerliste ist nur für den beobachteten Spieler/Kontext vollständig; variable Angebote dürfen nicht allein aufgrund eines anderen Spielers global ausgeschlossen oder als allgemein verfügbar bestätigt werden. Die Integration erfolgt erst nach Verifizierung eines echten API-Beispiels und seiner Semantik. Die bestehende Evidenz- und Quellenarchitektur wird erweitert, nicht ersetzt. Kein Vendor-N+1 und keine ungeprüfte Einführung eines Massenscans. Externe Contribution-Uploads sind standardmäßig aus; erst Freischaltung durch ForeverDB, konkretes Schema, freiwillige Einwilligung der beteiligten Spieler und minimale Datenfreigabe (Händler-/Lehrer-ID, Angebote, Preise, Spielbuild und tatsächlich benötigter Spielkontext) erlauben eine Implementierung. Keine Namen, persönlichen Daten, Chatprotokolle, Taschen, Bank, Gold, Geräte-/Sync-Tokens oder API-Secrets. Best-in-Slot und Endgame als optionale Module, Build-Differenzen zunächst als inkrementelle Prüfung; keine Vollimporte auf Verdacht.


### Händlerbeobachtungen pro Charakter

Persönliche Händlerbeobachtungen (positiv, negativ, Preis) gelten nur für den authentifizierten Dalton-Charakter und den beobachteten Build; ältere Beobachtungen ohne sichere Identität bleiben historische Evidenz und ändern keine persönlichen Angebote. Persistente Händlerdatensätze unterscheiden NPC, Build und beobachtenden Charakter; Trainer-Evidenz bleibt separat. Der gemeinsame Werkstatt-Master wird durch persönliche Negativbefunde nicht verändert. Explizit als spielerabhängig markierte Anbieterquellen zählen ohne persönliche Bestätigung nicht als sofort erledigbar. Keine Ableitung von globaler Verfügbarkeit aus einem einzelnen stockLists-Eintrag. Volle externe stockLists-Auswertung setzt ein verifiziertes API-Beispiel voraus.

# Dalton-Dashboard – unabhängiges Systemaudit

**Stichtag 26. November 2026, Europe/Berlin · main · `0608cf575f6e46e3bbdee800c790ce5ae7c13235`**

## 1. Management Summary und Urteil

**59,70 von 100 Punkten im gewichteten Audit.** Die veröffentlichte Oberfläche und die geprüften Standardabläufe sind funktionsfähig. Für einen verlässlich privaten Betrieb und den weiteren Ausbau fehlen belastbare Nachweise zur Zugriffstrennung und Wiederherstellung. Die fachlichen Datenrisiken sind kleiner als das Persistenzrisiko.

- **P0 Datenintegrität.** Zwei Add-on-Syncs für unterschiedliche Charaktere melden in der isolierten Prüfung beide Erfolg. Im gespeicherten Roster bleibt dennoch nur eine der beiden Änderungen. Der zweite Sync liest den alten Gesamtstand vor der Sperre und kann ihn nach der ersten Aktualisierung zurückschreiben.
- **P0 Vertraulichkeit.** Der Tageslauf übergibt vollständige Blizzard-Rohprofile an einen öffentlichen Blob-Pfad. In Produktion ist die statische Website einschließlich des GitHub-Charakter-Fallbacks ohne Anmeldung erreichbar. Welche Roharchive tatsächlich im Store liegen und welche Felder sie enthalten, konnte ich mit dem vorhandenen Lesezugriff nicht prüfen.
- **P1 fachliche Rückschritte.** Ein verspätetes Spellbook überschreibt einen neueren Lernstand. Die Werkstatt rechnet gemeinsame Zwischenprodukte mehrfach auf, und der Ortsplaner behandelt eine unbekannte Fraktion als zulässig für fraktionsgebundene Angebote. Ein vollständiger Ausfall der Profilendpunkte ergibt einen speicherbaren Diagnose-Snapshot.
- **Starke Prüfgrundlage.** Node 22, 24 und 26 bestanden je 159 von 159 Prüfungen. Sieben isolierte Talent-Browserfälle auf Chromium und Firefox bestanden einschließlich Browser-Offline-Test. Der frische öffentliche Talentquellenabgleich bestätigte Build `1.60.1.71139`, Hotfixstand und 467 normalisierte Talente. Produktionsdomain und Checkout haben identische HTML- und Service-Worker-Bytes.
- **Fachliche Freigabe bleibt evidenzabhängig.** `main` enthält inzwischen den veröffentlichten Talentplaner mit 84 redaktionell freigegebenen Pfaden. Die generierten Ränge 1–5 beruhen auf einer geltend gemachten Stufenverschiebung. Die Projektprüfung führt die effektiven serverseitigen Mindeststufen weiterhin als unverifiziert. Der Status ist von der erfolgreichen Offline-Simulation zu unterscheiden.

**Abnahmeentscheidung.** Erst F01 und F02 prüfen und beheben, danach Wiederherstellung, Versionskonsistenz und Rechtegrenzen verifizieren. Ein positives Teilurteil für Navigation, UI, Offline-Shell und getestete Regeln rechtfertigt keine allgemeine Abnahme. Der Audit-Checkout und die Produktionsumgebung erhielten keine Änderungen am Anwendungscode, an produktiven Daten, Berechtigungen, Tarif oder Deployment. Die Prüfdateien liegen außerhalb des Repositorys.

## 2. Geprüfter Stand, Verfahren und Grenzen

| Ebene | Verifizierter Stand |
| --- | --- |
| Repository | Separater Checkout des angeforderten Branches. Alle 315 versionierten Dateien mit Pfad, Größe, SHA-256 und Prüfart erfasst. Audit-Skripte liegen getrennt. |
| Produktion | Vercel meldet den Alias für denselben Main-Commit als READY, Ziel production. HTML und Service Worker stimmen bytegenau mit Git überein. `v98` ist die ausgelieferte Shell. |
| Produktionsstichprobe | Einmalige statische Abrufe und eine Header-Stichprobe. Keine Aufrufe an produktive Refresh-, Sync-, Cron- oder Katalogpfade mit Schreib-/Migrationsseiteneffekten. Die App verwendet beispielsweise `HSETNX` beim Versionsabruf und kann in anderen GET-Pfaden Caches oder Medien anlegen. |
| Datenzugriff | Upstash OAuth `Not logged in` trotz konfigurierter Read-only-Werkzeuge. Vercel-Abrechnung und Projekt-/Deployment-Metadaten lesbar. Objektlisten, Rohinhalte, echte Redis-Zähler und produktweite Restquoten offen. |
| Fachliche Quellen | Öffentliche Live-Probe der drei Regelquellen und zweier Klassenexports. Eigene Fixtures für Fehlerfälle. Die Rohdatenpfade zum tatsächlichen Blizzard-Konto, zu privaten Snapshots und zur Spielengine blieben ungetestet. |
| Prüfmethodik | Dateiinventar, Syntax- und Strukturprüfungen, API-/Datenflussanalyse, Quellcode-Schwerpunktprüfung der kritischen Übergänge, Regressionstests sowie isolierte Referenzfälle. Historische Guides, Screenshots, externe Nutzungsbedingungen und Binärassets wurden anhand dokumentierter Herkunft und Struktur stichprobenartig geprüft. Eine Datei im Inventar ist kein vollständiges manuelles Review jeder Zeile. |

Die Begriffe **bestätigt**, **bedingt** und **offen** stehen jeweils für direkten Beleg, nachgewiesene Codeeigenschaft mit ungeprüfter Betriebsvoraussetzung und fehlende Evidenz. Aussagen aus älteren Reviews dienen als Prüfhinweis. Die Ergebnisse für `main` stammen aus dem hier geprüften Stand. [GitHub-Commit](https://github.com/tamorok44/dalton-dashboard/commit/0608cf575f6e46e3bbdee800c790ce5ae7c13235) · [Produktionssite](https://dalton-dashboard-eight.vercel.app)

## 3. Systeminventar

315 Dateien, 4.784.486 Bytes ohne Git-Metadaten und installierte Pakete. Darunter 103 MJS, 19 JS, 11 Lua einschließlich Testfixture, 108 JSON, 37 Markdown-Dokumente, drei Workflows sowie Shell-, PowerShell- und CMD-Installer, TOC, Manifest, CSS und Bildassets. Alle 109 JSON-/Manifestdateien sind parsebar und enthalten in der strukturellen Prüfung keine doppelten Objektschlüssel. Der lokale Registry-Audit erfasste 31 installierte Pakete ohne gemeldete Advisories im Prüfzeitpunkt. Hauptabhängigkeit ist `@vercel/blob 2.9.0`, daneben existiert die separate Browser-Testinstallation Playwright 1.56.1.

| Bereich | Hauptdateien und Aufgabe |
| --- | --- |
| Shell und PWA | `index.html`, `styles.css`, `app.js`, Manifest und `sw.js`. Statisches HTML, native ES-Module, Renderfunktionen und Navigation per Hash. |
| Charaktere, Vergleich, Pet | `app.js`, `hunter-pets.js`, `reputation-data.js`. Karten, persönliche Profile, abgeleitete Darstellungen, Vergleichstabellen, Ruf und Begleiter. |
| Talentplanung | `talent-planner.js`, `talent-personal-state.js`, `talent-text-quality.js`, `scripts/talent-*.mjs`. Auswahl, Regel- und Planbindung, persönlicher Status, Quellen-/Hashprüfung, Index und Freigabe. |
| Serverseitige Eingänge | 12 Vercel-Dateien in `api/`: `characters` (inklusive Planer- und Talentbaumansicht), `data-version`, `workshop`, `location-planner`, `profession-planner`, `refresh`, `daily-snapshot`, `spellbook-sync`, `addon-sync`, `addon-sync-status`, `addon-device-enroll`, `addon-device-promote`. |
| Daten und Anreicherung | `character-store`, `refresh-service`, `armory-core`, `blizzard-api`, `forever-details`, `foreverdb-*`, `workshop-*`, `location-*`, `class-training-*`, `*-catalog-store`, `live-knowledge-store`, `knowledge-media`, `media-registry`. |
| Add-on und Bridge | `addons/DaltonDashboard/` mit zehn geladenen Lua-Dateien, TOC und Modulstruktur. `scripts/dalton-sync-client.mjs`, Parser, Installer und Enrollment-Helfer in `bridge/`. |
| Betrieb und Tests | `vercel.json`, drei Workflows in `.github/workflows/`, `scripts/run-test-suite.mjs`, 33 `test-*.mjs`, separate Browser-Suite, DB2-/Release-Prüfungen und Bridge-Dry-Run. |
| Historische Komponenten | `vorschau.html` und `vorschau-abzeichen.html` sind byteidentisch und beide öffentlich erreichbar. `scripts/scrape.mjs` und `official-scrape.mjs` sind alte manuelle Programme mit Schreibzugriff auf den Git-Fallback. Der alte Berufsplaner und der Copy/Paste-Spellbook-Weg bleiben APIs mit möglichem Legacy-Client-Bedarf. Echte Nichtnutzung braucht Zugriffszahlen oder die Bestätigung der Clientinventur. |

Dateiinventar, 402 aufgelöste statische Referenzen, 41 statische Redis-Schlüssel-/Präfixmuster sowie 113 Hostnamen aus Code, Daten und Dokumenten sind in den Anlagen erfasst. Aufrufkandidaten mit Query-String in Testimporten oder aus Textfixtures sind im Regex-Inventar markiert. Eine Referenzliste allein sagt nichts über den Aufruf im laufenden System aus.

## 4. Architektur und Datenflüsse

~~~mermaid
flowchart LR
  A["Blizzard API und Armory"] --> R["Refresh und typisierte Anreicherung"]
  F["ForeverDB und deutsche Clientdateien"] --> K["Klassen-, Rezept-, Quest- und Talentmaster"]
  B["Blizzard-Hotfixes, Clientbuild und DB2"] --> H["Regelwächter mit Versionsnachweis"]
  I["Add-on im WoW-Client"] --> Q["SavedVariables, Relay und optionale Bridge"]
  Q --> S["Geräte-/Sync-API und Whitelist"]
  S --> D[("Redis: Charaktere, Lernbelege und Versionen")]
  R --> D
  K --> D
  H --> D
  D --> P["Vercel Functions"]
  P --> U["Charaktere, Vergleich, Werkstatt, Orts- und Talentplaner"]
  R --> O[("Blob: Roharchive und Medien")]
  O --> U
~~~

~~~mermaid
flowchart LR
  M["Main-Commit mit freigegebenen Pfaden"] --> G["Build, Hotfix und exaktes Quellpaar"]
  C["Redis-Talentmaster mit Frischegrenze"] --> G
  R["Roster, Auswahl und bestätigter Rang"] --> G
  G -->|exakte Evidenz| V["Punktfolge, Ist-Abgleich und Browserbindung"]
  G -->|fehlend, abweichend oder abgelaufen| E["Sichtbare Sperre"]
~~~

Verwechslungen zwischen Spieldaten, Charakterzustand und abgeleiteten Empfehlungen sind im Talentmaster und in den Medienregistern technisch gut begrenzt. In der Gesamtarchitektur bleiben Profile jedoch vereinigte Vollobjekte. Das erhöht die Auswirkung konkurrierender Schreibvorgänge und erlaubt nur grobgranulare Lesezugriffe. Die Roster-Konfiguration ist im Frontend generischer als im Add-on, in der Bridge und in der Geräteverwaltung.

## 5. Datenbankinventar und Speicherprüfung

| Speicher | Modell, Versionierung und TTL laut Code | Evidenz und Bewertung |
| --- | --- | --- |
| Redis Charaktere und Locks | JSON-String `characters:v1`, gemeinsamer Lock 120 s, manueller Cooldown 60 s. Lock-Token und Metadaten beim Hauptschreiben atomar per Lua. | `scripts/character-store.mjs:7–53`. In Memory nachgestellt. Der Add-on-Lesepfad sitzt vor dem Lock (F02). Live-Speichergröße, Keyspace und tatsächliche Isolation offen. |
| Versionsmetadaten | `data-version:meta:v1` Hash mit Charakter-/Pet-Metadaten und je Scope/Charakter Add-on-Feldern. Livewissen-Version separat. Bootstrap per `HSETNX`. | `scripts/data-version.mjs:37–58` und `scripts/version-metadata.mjs:3–9`. Typisch zwei Redis-Lesevorgänge pro Poll; veraltete Felder im gemeinsamen Hash sind ohne Inventur nicht quantifizierbar. |
| Add-on und Geräte | Namespace `addon-sync:v1:<scope>:<slug>`, aktueller Sync-JSON plus Versionsfeld. Geräte- und Einladungsschlüssel mit gehashten Nachweisen, Einladungen 24 h, Gerätetokens ohne im Store spezifizierte TTL. Separate Livewissen-Hashes/Indizes mit Buildbezug. | `scripts/addon-sync-store.mjs:5–45`, `scripts/addon-device-auth.mjs:12–104`, `scripts/live-knowledge-store.mjs`. Replizierte Rohdatenmenge, Retention, Revocation und aktive Geräte nicht direkt geprüft. |
| Talent-, Klassen-, Rezeptmaster | Talentmaster als gzip+Base64 im All-Class-Schlüssel mit Produktions-/Preview-Ausprägung und 6 h Versuchsbremse. Klassen-/Rezeptmaster und Entwürfe getrennt nach Build/Version, komprimierte `:gz1` Schlüssel, Lazy-Migration von Legacy-Formaten. ForeverDB-Budget-Key auf API-Key-Fingerprint und UTC-Tag mit zweitägiger TTL. | `scripts/talent-tree-store.mjs`, `scripts/compact-master-cache.mjs:4–36`, `scripts/workshop-store.mjs`, `scripts/foreverdb-budget.mjs:5–21`. Sechs-Stunden-Gate ist kein physischer TTL des All-Class-Inhalts. Bestandsduplikate offen. Klassen-Buildbindung lückenhaft (F09). |
| Spielkatalog und Medien | Klassische Redis-Hashes für Katalogtypen und kanonisches Medienregister. Geeignete Bildobjekte in Blob unter typisierten stabilen IDs und Hash. Vorsichtsfall: Zip- und API-Daten sind unterschiedlich groß; historische Caches liegen neben aktuellen. | `scripts/game-catalog-store.mjs`, `scripts/media-registry.mjs`, `scripts/media-resolver.mjs`. Normalisierung ist je Objekt möglich; IDs und Typen aus unterschiedlichen Quellen nicht willkürlich zusammenführen. Bestandsverbrauch und Referenzintegrität offen. |
| Regelbeobachtungen | Pet-JSON mit begrenzter Verlaufshistorie und Versionsfeld; reguläre Wiederverwendung 20 h. Talentbeobachtung 26 h im Regel-Gate; je Scope Sonderpfad mit 6 h Budget bei fehlender/alter Tagesbeobachtung. | `scripts/pet-rule-store.mjs:6–107`, `scripts/talent-preview-observation.mjs:7–40`. Pet-Basisstatus ist im Code nicht vollständig umgebungsisoliert (F05). |
| Redis-Historie und Blob-Roharchive | Append-only Change-Liste, Daily-Index als Hash + separater letzter Zeiger, 15-Minuten-Snapshot-Lock. Tagesblob gzip mit SHA-256 in Redis-Metadaten, deterministischer öffentlicher Pfad und erlaubtes Überschreiben. | `scripts/history-store.mjs:154–185`, `scripts/daily-snapshot-store.mjs:8–30`. Tagesblob enthält Blizzard-Rohdaten, die vollständige Wiederherstellung von Geräte-, Add-on-, Historien- und Katalogdaten ist damit nicht belegt. Kein Recovery- oder Restore-Nachweis gefunden (F01/F06/F14). |
| Repository und Browser | Versionsgeführter Roster-Fallback und Evidenz-/Freigabedateien. LocalStorage für Talentbindung, Cache Storage für statische App-Shell; APIs und Live-Daten am Service Worker vorbei. | Assets in Produktion ausgeliefert. Browserfälle prüfen die isolierte App-Shell. Browserbindung ist pro Origin/Browser und gilt ohne geräteübergreifenden Wiederherstellungsweg. |
| Lokaler WoW-Client | SavedVariables pro Charakter und Account-Relay, klassische lokale Bridge- und Konfigurationsdateien. Privatsphärenrelevante lokale Diagnosebereiche werden aus dem Standardexport entfernt. | Lua-Syntax, TOC-Zuordnung, Bridge-Datei und Dry-Run geprüft. Echtes Event- und Transferverhalten im Spiel sowie Windows-Dateirechte des vorhandenen Installationsbestands offen. |

Modelle ohne SQL-Constraints benötigen explizite Regeln für stabile IDs, Image-/Katalogverweise, Roster-Löschung, widersprüchliche Zeitstempel und Aufbewahrung. Redis- und Blob-Listen wurden mangels freigegebenem Zugriff nicht ausgewertet. Es gibt deshalb keinen Befund zu vorhandenen verwaisten Datensätzen, tatsächlichen TTL-Werten, Backups oder Live-Tenant-Isolation. [Schlüsselinventar](Redis-Schlüssel.csv)

## 6. Datenquellen und fachliche Provenienz

| Quelle | Verwendung und geprüfte Kette | Grenze |
| --- | --- | --- |
| Blizzard OAuth/API | Profil und strukturierte Spezialdaten über die offizielle Forever-EU-Namespace. Datenschutzrisiko entsteht beim unveränderten Raw-Archiv. Fixture bestätigte die Behandlung von HTTP 503. | OAuth-Life-Scopes, produktiver Endpunktbestand, Anbieterbedingungen zur dauerhaften Veröffentlichung und Vollständigkeit im individuellen Konto offen. |
| Blizzard öffentliche Armory | HTML- und JSON-Daten, deutsche Begriffe, Stats, Ausrüstung, Stall. Alte Werte können als letzte Beobachtung erhalten bleiben. | HTML-Parser hängen von Struktur/Labels ab. Unterschiedliche Logouts, Ausfälle und Teilsnapshots erlauben keine pauschale Echtzeitaussage. |
| ForeverDB | Öffentliche Klassen-, Trainer-, Lokalisierungs- und Builddateien, daneben API mit Schlüssel für weitere Inhalte. 467 Talente aus fünf HTTP-200-Antworten im Regel- und Klassentest bestätigt. | Origin meldete in der Probe kein Age. Exakte Hashbindung belegt Dateikonsistenz zum geprüften Stand. Nicht jede lokale Übersetzung und Fremdlizenz wurde individuell bestätigt. |
| ForeverSpec und Community | Verweise, historische Scrape-Option und Vergleichsdaten. ForeverSpec gibt für Profile Blizzard als Ursprung an. Reviews unterscheiden Pfade, Armory-Profile und echte Parses. | Die Oberfläche einer zweiten Quelle bildet keine unabhängige Datenerhebung, wenn beide Blizzard-Profile nutzen. Keine pauschale Erlaubnis zur Übernahme von Rohdatensätzen abgeleitet. [ForeverSpec-Methodik](https://foreverspec.com/about/) |
| Zephras und Spielclient | Kuratierte Trainer-, Karten- und Talentkorrekturen, deutsche Extrakte, DB2-Quellen und lokale Feldbeobachtungen. Prüfskripte klassifizieren Widersprüche. | “Zephras” bezeichnet im Projekt sowohl einen Spielkontext als auch eine gesonderte Vergleichsaudit-Grundlage. Kein eigener Spielclient-Test. Ausgabewerte des Zephras-Audits bleiben Diagnose, keine abschließende Serverbestätigung. |
| Add-on, Relay und eigene Messungen | Ereignisgesteuerte Spellbook-, Ort-, NPC-, Instanz- und Pet-Belege. Bekannte IDs und Provenienz steuern Lernstand und Preiswahl. | Abrufzeit ist nicht gleich Aufnahmezeit. Verspätete Daten sind im aktuellen Pfad problematisch (F02/F03). Lua-Statik belegt keine native RAM-/CPU-Last im Spiel. |
| Historische Guides, aggregierte Logs | Quellenregister und Freigabedokumente stützen Empfehlungen. Metadaten, Hashes und Kontext sind im Repository sichtbar. | Keine breiten Live-Neuberechnungen über personenbezogene Rohlogs. Verwendete Bild-/Text- und Redistributionsrechte müssen pro tatsächlich ausgelieferter Assetgruppe dokumentiert werden. [Host- und Quelleninventar](Quelleninventar.csv) |

## 7. Bewertung der einzelnen Module

| Modul | Stärken und geprüfter Pfad | Befund |
| --- | --- | --- |
| Charakteransicht | Profil-Isolation bei Teilfehlern, Quell-/Sprachlabel, Quest- und Rufdaten, sichtbare Roster-Karten in Chromium. Bestehende Tests prüfen Ausrüstung, Stat-Enums, XP, Zustand und Tooltip-Layouts. | Ganzer Roster inklusive versteckter Detailpanels wird gerendert und als Vollobjekt behandelt. Öffentliche Fallbackdaten und mögliche private Felder müssen getrennt klassifiziert werden. F01–F05, F10/F11. |
| Vergleich | Dynamische Roster-Auswahl, neutrale Darstellung fehlender Zahlen, gruppierte und kollabierbare Merkmale, eigene interne horizontale Tabelle. Zwei Testcharaktere wurden ausgewählt. | Farbige “Bester Wert”-Kennzeichnung misst Zahlengröße, auch wenn unterschiedliche Klassen und Rollen einen fachlich fast wertlosen Vergleich erzeugen. Vollständige Klasseneignung und echte Markt-/Rollenvergleichbarkeit offen. F16. |
| Werkstatt | Mengen, bekannte Crafters, getrennter Rezeptmaster, kategoriale Navigation, geschützter lokaler Suchfeldzustand und Pfadzyklus-Erkennung im Baum. | Reproduzierbar doppelte Rohmaterialien bei gemeinsam benutzten Stapelrezepten. Ein zyklischer Baum zählt das blockierende Teil nicht als offenen Bedarf. Eine Suche kann vollständige Katalogabdeckung melden, obwohl bei leerer Remote-Antwort auf lokale Vorschläge gewechselt wurde. F07/F17. |
| Ortsplaner | Eine Lernziel-ID mit mehreren Quellen, frische und historische Händlerbeobachtungen, verifizierte Preisprovenienz, keine Gleichsetzung unbekannt/0. | Eine unbekannte Spielerfraktion reicht für fraktionsgebundene Angebote (F08). Kataloginitialisierung, Lernstände und NPC-Medien können Long Tail auslösen. Frühzeitige Charaktervalidierung fehlt am ausgewerteten Eintritt vor dem Katalogzugriff (F10). |
| Talentplaner | Neun Klassen, 27 Bäume und 467 Talente. Offline 84 Pfade, 504 Rang-/Profilfälle. Exakte Live-Hashes, bewusst gebundene Version, keine stille Spezialisierungswahl ohne Grundlage und klarer unbekannter Lernstand. | Frische- und Buildprobe unabhängig grün. Drei Tierherrschaftspfade benötigen eine eigene geprüfte Voraussetzungskorrektur. Die Serverannahme für effektive Rang-1–5-Grenzen und die restliche Frost-Proc-Semantik wurden offline nicht verifiziert. Der Zephras-Check meldet außerdem eine offene Druidenbedingung, die fünf Pfade berührt. F12. |
| Jägerbegleiter | Offizielle Werte und Referenzmodell getrennt. Krit-Quellwahl und fehlende Inputs werden kenntlich gemacht. DB2-Feldprüfung plus Hotfix-Wächter und alte Baselines. | Prozentuale Skalierung und Kampfausgaben sind kein eigener Ingame-Messnachweis. Die Ein-/Ausgabe bei fehlenden getrennten Krit-Enums ist geprüft; echter DPS-, Fokus- und Proc-Clientablauf offen. Im Shared-Redis-Fall kann Preview den Pet-Status beeinflussen. F05/F16. |
| Add-on | COalescing per Timer, Eventregistrierung mit Kompatibilitätsprotokoll, keine permanente OnUpdate-Schleife gefunden. Relay-Drosselung und Inhaltsfingerabdruck. Lua/TOC und Definitionsgrenzen geprüft. | Roster und Hub hart verdrahtet; keine neue Person ohne Änderung der aktuellen Konfiguration bzw. des Codes. Ältere Syncs werden nicht durchgehend monoton gesperrt. Reale Clientlast, Binärdateirechte, Partner- und Realmwechsel offen. F02/F03/F13. |
| Bridge und Zugriff | Dry-Run ohne Upload, ein Gerät pro Datensatz, Einladungsablauf, TLS, gehashte Device-Schlüssel und serverseitige Berechtigung. | Reine Syntax/Dry-Run belegen keine Installation auf fremder Hardware. Gerätepromotion über Preview und nicht atomare Einladungsannahme benötigen klareres Betriebsmodell (F04/F18). |
| Querschnitt, PWA und Deployment | Ausgelieferte fünf Hauptansichten sichtbar; Wiederkehr aus Refresh lokal geprüft. API-Antworten nicht im Worker-Cache. Zuordnung der Seite zum Main-Commit bestätigt. | Große nicht modulare View-Datei und eager DOM, Worker markiert jeden anderen Origin-Cache zur Löschung. Kein echter iOS-/Safari-Installations- und Update-Test. F11/F15/F19. |

## 8. Bestätigte und bedingte Befunde

### F01 · P0 · Öffentlich gespeicherte Rohprofile

**Bestätigtes Design, Live-Objekte offen.** Der Cron sammelt alle konfigurierten Blizzard-Profilendpunkte im Vollformat und übergibt die Antwort an einen `access:'public'` Blob, mit Datumsstruktur und ohne Zufallssuffix. Authentifizierung am Cron schützt den Start des Vorgangs. Sie ändert die Lesezugriffsart des erzeugten Objekts nicht. Die öffentliche Site dient nachweisbar auch den Git-Fallback aus. Ein tägliches Raw-Archiv kann Profilaktivität, Zeitpunkte und weitere Felder bündeln. Speicherinhalt, tatsächliche Dateiliste und Zugriff auf die produktive Rohdatei wurden nicht verifiziert. Anwendungsspezifischer Inhaltsfilter und ein geprüfter Aufbewahrungs-/Berechtigungsplan fehlen für das Roharchiv.

**Belege.** [Rohdatenerfassung](https://github.com/tamorok44/dalton-dashboard/blob/0608cf575f6e46e3bbdee800c790ce5ae7c13235/scripts/blizzard-api.mjs#L241) · [Cron](https://github.com/tamorok44/dalton-dashboard/blob/0608cf575f6e46e3bbdee800c790ce5ae7c13235/api/daily-snapshot.js#L73) · [Blob-Upload](https://github.com/tamorok44/dalton-dashboard/blob/0608cf575f6e46e3bbdee800c790ce5ae7c13235/scripts/daily-snapshot-store.mjs#L15) · [Vercel-Zugriffsmodell](https://vercel.com/docs/vercel-blob)

### F02 · P0 · Zwei erfolgreiche Syncs können eine Änderung verlieren

**Reproduziert.** Beide Requests haben den gleichen gültigen alten Roster gelesen. Request A speicherte seine Änderung und gab die Sperre frei. Request B erlangte danach die Sperre und speicherte den alten Roster mit seiner eigenen Änderung. HTTP 200 für beide, A fehlt im Endstand. Der Lock-Token schützt den Schreiber, garantiert aber keine aktuelle Lesebasis. Der Befund betrifft den geprüften Add-on-Pfad; der manuelle Live-Refresh lädt die Basis innerhalb der vorhandenen Refresh-Ausführung.

**Belege.** [Lesen im Add-on-Handler](https://github.com/tamorok44/dalton-dashboard/blob/0608cf575f6e46e3bbdee800c790ce5ae7c13235/api/addon-sync.js#L75) · [Sperre und Speicherung](https://github.com/tamorok44/dalton-dashboard/blob/0608cf575f6e46e3bbdee800c790ce5ae7c13235/api/addon-sync.js#L92) · [Isolierter Befund](Isolierte-Testergebnisse.json)

### F03 · P1 · Ältere Aufnahmen ersetzen neuere

**Reproduziert.** Ein neuerer Spellbook-Stand mit zwei Spells wurde durch einen zulässigen 15 Minuten älteren Stand mit einem Spell ersetzt. Die Prüfung beschränkt die absolute Zeitspanne, aber vergleicht Aufnahmen nicht monoton mit dem gespeicherten Zeitstempel. Der Dedup im Add-on stellt nur Identität zum unmittelbar gespeicherten Snapshot fest. Fehlende IDs können in Folge wieder als offen erscheinen. Auch Stand-/Verlaufsfelder des separaten Add-on-Snapshots brauchen feldweise Frischekontrolle. Hierfür wurde das Ersetzen durch den Spellbook-Kern belegt; der gesamte produktive Lebenszyklus bleibt offen.

**Belege.** [Spellbook-Kern](https://github.com/tamorok44/dalton-dashboard/blob/0608cf575f6e46e3bbdee800c790ce5ae7c13235/scripts/spellbook-sync.mjs#L89) · [Deduplizierung](https://github.com/tamorok44/dalton-dashboard/blob/0608cf575f6e46e3bbdee800c790ce5ae7c13235/api/addon-sync.js#L82) · [Isolierter Befund](Isolierte-Testergebnisse.json)

### F04–F10 · Sicherheit, Datenqualität und Kernlogik

| ID | Priorität und Status | Befund und Beleg |
| --- | --- | --- |
| F04 | P1 · bestätigt im Code, Betriebsvoraussetzung offen | Preview kann eine Geräteübernahme in den Produktions-Namespace veranlassen. Der Server akzeptiert die speziell identifizierte Preview-Hub-Rolle ohne getrennte Produktionsentscheidung. Gemeinsamer Redis oder übertragener Schlüssel würde die Isolation unterlaufen. Keine tatsächliche Übernahme getestet. `api/addon-device-promote.js:10–21`, `scripts/addon-device-auth.mjs:85–98`. |
| F05 | P1 · bestätigt im Code, Voraussetzung offen | Hauptroster, manueller Lock und Pet-Grundstatus sind nicht vollständig nach Umgebung getrennt. Der öffentliche manuelle Refresh per GET hat in der Anwendung keine Autorisierung und kann schreiben, begrenzt auf einen globalen Start je Minute. Im geteilten Redis liegen deshalb eine verlässliche Vorschauisolierung und die Missbrauchsgrenze nicht allein beim Anwendungscode. Dashboard-Pet-Werte hängen auch bei gleichzeitigem Zugriff von diesem Status ab. `api/refresh.js:22–49`, `scripts/character-store.mjs:7–9`, `scripts/pet-rule-store.mjs:40–91`. |
| F06 | P1 · isoliert reproduziert, Cron-Wirkung im Code belegt | 42 von 42 Profilantworten mit HTTP 503 erzeugen einen normalen Rückgabesnapshot. Der Tageslauf kann ihn ohne Mindestqualität speichern und einen vorhandenen Snapshot im zweiten Lauf bestehen lassen. Der separate Refresh kann erfolgreich sein. Das letzte Backup ist dann möglicherweise lediglich ein Fehlerprotokoll. `scripts/blizzard-api.mjs:241–273`, `api/daily-snapshot.js:76–95`. |
| F07 | P1 · isoliert reproduziert | Zwei Äste benötigen je ein Teil; ein Rezept stellt zwei Teile her. Der Plan fordert zwei Rohmaterialeinheiten, der gemeinsame Bedarf liegt bei einer. Die gemeinsame Summierung kommt nach dem Aufrunden je Ast. Im Zyklus-Fall zeigen Root und Bezugsliste trotz blockierendem Teil “craftable”/0 Rohmaterialien. `scripts/workshop-core.mjs:188–237`. |
| F08 | P1 · isoliert reproduziert | Gegenprobe für identischen ortsgebundenen Lehrer: bekannte gegnerische Fraktion → 0 Angebote, passende Fraktion → 1, unbekannte Fraktion → ebenfalls 1. Die Regel schließt nur bekannte Gegenfraktionen aus. `scripts/location-planner.mjs:68–83,345–355`. |
| F09 | P1 · bestätigt im Code | Ein veränderter ForeverDB-Klassenstand kann unter dem vom Aufrufer gewünschten Build abgelegt werden. Beim Lesen werden Slug und nichtleere Fähigkeiten geprüft; ein Abgleich von API-Build, Schlüssel und gespeicherter Metadaten fehlt. Das betrifft Klassenfähigkeiten und daraus abgeleitete Lehrer-/Lernstände. `scripts/class-training-store.mjs:379–388,440–454`. |
| F10 | P2 · bestätigt im Code, Auswirkung nicht gemessen | Unbekannter Ortsplaner-Charakter wird erst nach vorbereitenden Katalog-/Sync-Lesevorgängen validiert. Öffentliche Werkstatt-Suche hat eine UI-Mindestlänge, der Server akzeptiert auch kurze Queries. Für ForeverDB schützt ein Tagesbudget; ein gemeinsam konservativ durchgesetztes Minutenbudget fehlt im Adapter. Möglicher Aufwand, tatsächliche Nutzung unbekannt. `api/location-planner.js:126–174`, `api/workshop.js:161–192`, `scripts/foreverdb-budget.mjs:10–20`, `scripts/foreverdb-api.mjs:26–39`. |

### F11–F19 · Betrieb, Fachlichkeit, Altlasten und Tests

| ID | Priorität und Status | Befund und Beleg |
| --- | --- | --- |
| F11 | P2 · gemessen und statisch belegt | Ein sichtbarer Tab fordert ungefähr einmal je Minute zwei Redis-Lesevorgänge an (plus Rückkehr-/Fokusereignisse). 24 Stunden Sichtbarkeit entsprechen rechnerisch 2.880 Redis-Kommandos je Tag und Tab, sofern der Normalpfad greift. Vollständige Roh-Addon-JSONs werden für Zeilen der öffentlichen Übersicht nacheinander geladen. Eine auf viermal größeres Roster hochgerechnete DOM-Anzahl ist nahezu linear und betrifft auch versteckte Bereiche. `app.js:1040–1093,2101–2151`, `scripts/addon-sync-store.mjs:36–46`. |
| F12 | P1 · belegte Evidenzlücke, kein nachgewiesener falscher Spieleffekt | Der Produktionscode nimmt für freigabefähige Rang-0-Pfade eine reduzierte Mindeststufe `level - rank` für 1–5 an. Die Pflegeprüfungen dokumentieren offene effektive Servergates. Ein reproduzierbarer Servernachweis für jede Regelfamilie oder begründete Ausnahme fehlt. Hunter-Korrektur ist auf exakte Version/Pfade/Quellen begrenzt. Druidenbedingung und Frost-Procs bleiben fachlich getrennte Nachweisfragen. `scripts/talent-legacy-release.mjs:8–26`, `scripts/talent-planner-api.mjs:119–133`, `scripts/talent-hunter-prerequisite-correction.mjs:9–22`. |
| F13 | P2 · bestätigt | Geräte-, Relay- und Clientannahmen sind auf bekannte Namen ausgelegt und Realm/Region nicht überall im Identitätsschlüssel. Neue Rollen sind im Backend-/Addon-Verbund kein reiner Roster-Eintrag. `scripts/addon-device-auth.mjs:4–38`, `addons/DaltonDashboard/Modules/Relay.lua:14–36`, `scripts/spellbook-sync.mjs:75–87`. |
| F14 | P1 · bestätigt im Betriebskonzept, Wiederherstellung offen | Tägliches Roharchiv, operative Charakterwerte, Gerätezustand, Add-on-Lernwissen und Historie schreiben in unterschiedlichen Schritten. Szenarien für halbfertige Tagesarchive, Restore/Retention sowie Kopien vorhandener Keys sind nicht dokumentiert nachgewiesen. Täglicher Index/Last-Zeiger nicht atomar. `scripts/history-store.mjs:154–185`, `api/daily-snapshot.js:64–107`. |
| F15 | P2 · statische Grenze und Header-Nachweis | Kein CSP-Header in der Stichprobe. Der Worker löscht alle von seinem Cachenamen verschiedenen Caches auf demselben Origin. Netzwerk zuerst, 200er Shell und Offline-Fallback sind belegt; echte Zwei-Versionen-PWA-Aktualisierung und WebKit auf iOS fehlen. `vercel.json:4–14`, `sw.js:1–18`. |
| F16 | P2 · Verbesserung | Vergleich farbkodiert Zahlen kontextarm; Pet-Referenzwerte und nicht verifizierte Spielkoeffizienten brauchen weiterhin eindeutige Labels und Spielmessungen. Die aktuellen Tests prüfen die Ausgabegates sowie Roh-/Referenzausgaben, aber keine allgemeine Eignung jeder Bewertungsrichtung. `app.js:1151–1272,628–705`, `hunter-pets.js`, `docs/pet-crit-evidence-2026-11-26.md`. |
| F17 | P2 · bestätigt im Code | Eine leere ForeverDB-Antwort setzt zunächst den Modus `foreverdb`. Der anschließend verwendete lokale Suchfallback behält das Quellen-/Vollständigkeitsflag. Dazu sind zwei alte Designseiten öffentlich und byteidentisch. `api/workshop.js:165–191`, `vorschau*.html`. |
| F18 | P2 · bestätigt im Code, Testlücke | Enrollment verbraucht den Einmalcode vor separater Speicherung des Geräts. Ein Zwischenausfall kann den Benutzer zum neuen Enrollment zwingen. Revocation, erneute Autorisierung und Datenannahme bilden keine gemeinsame Transaktion. Die Betriebspfade benötigen Fehler-/Konkurrenztests mit autorisierten Fixtures. `scripts/addon-device-auth.mjs:51–73,100–104`. |
| F19 | P2 · Prüf- und Release-Lücke | Browser-CI ist breit aufgestellt, treibt primär den Talentplaner. App-Unit-Tests normalisieren Teile des alten Profildatensatzes im Test. Produktionsschreib-Gate, Storage-Restore, reale Add-on-Events und das Zusammenspiel bei Socket-/Redis-Fehlern fehlen als wiederholbare Release-Nachweise. `.github/workflows/browser-ci.yml`, `scripts/browser-talent-regression.mjs`, `scripts/test-ui.mjs`. |

Dabei gelten folgende Stärken auch für die Sicherheitsbewertung: Vercel liefert HSTS, `nosniff` und `X-Frame-Options: DENY`. Token werden serverseitig verglichen und Gerätebezüge gehasht; das Add-on selbst enthält keinen HTTP-Client. Die Whitelist verwirft Gold, Inventar und Bank. Dynamische Textausgaben sind weitgehend HTML-escaped. Der Scan ausgewählter verbreiteter Schlüssel- und PEM-Formate im geprüften Arbeitsbaum ergab keine Treffer. Vollständige Historie, Runtime-Umgebungswerte, WAF, Produktionsgrenzen, native Endgeräte sowie flächendeckende Kontextprüfung aller möglichen URL-Sinks blieben offen. Die statische Untersuchung enthält keine exploitierenden Produktionsanfragen.

## 9. Performance, Kosten und Betrieb

| Messung | Ergebnis | Einordnung |
| --- | --- | --- |
| Statische Production-Shell | Heimseite, Manifest, SW, Talentmodul sowie ausgewählte öffentliche Alt-/Datenpfade HTTP 200. HTML und SW SHA-256 identisch zu `main`. Einzelne Netzwerkzugriffe etwa 110–308 ms im Audit-Proxy. | Keine repräsentative Nutzer-Telemetrie. Kein SSO-/Runtime-Auth-Beweis für private Wege. |
| Browser, alle fünf Ansichten | 4/16 fiktive Profile, 320/390/520/740/1440 px, 4× CPU-Drossel, kein Seitenüberlauf und keine erfassten Browserfehler. 1.156/4.279 DOM-Knoten gesamt, davon 1.041/4.164 in den Karten. Isoliert ungefähr 1,49/1,61 MB JS-Heap nach GC. | Einzelmessungen eignen sich für Größenordnung und DOM-Skalierung. Kaltlaufzeiten von 0,97/0,75 s stammen aus getrennten Läufen und erlauben keine Vergleichsaussage zur Geschwindigkeit pro Rostergröße. |
| Talentplaner Chromium | 4 Viewports inklusive Pixel-Emulation, historischer Pfad, gebundene Profile, echte Resolverlogik mit repräsentativen Fixtures, Netzwerkabbruch und PWA-Fallback bestanden. 4× CPU, je Fall P95 133–272 ms bei den geprüften Interaktionen, 281 Knoten im Planer, rund 38 KB zusätzlicher JS-Heap nach der Interaktionsserie. | Kein Langzeitprofil, keine Aussage über native Geräte oder Leaks. Kompakter Touch-Talentbutton ca. 38 px; 44 px sind für ein komfortables Ziel empfehlenswert. |
| Talentplaner Firefox | Drei Viewports bestanden einschließlich PWA bei isoliertem Socket-Abbruch. P95 je Fall 19–48 ms bei ungedrosselter CPU. | Wegen unterschiedlich gedrosselter Browser keine direkte Geschwindigkeitsrangfolge. |
| Downloadgröße in Fixtures | App 151.858 B roh, 42.363 B gzip; CSS 107.212/21.995 B; Talentmodul 30.370/9.350 B. Profilberatung bis 13.117 B, Pfadantwort bis 32.214 B im Browserfixture. | Vergleichskompression lokal, keine Produktions-Transferstatistik. Mediaassets, Systemfont/Netzwerk und Redis-Transport sind separat. |
| Backends und Cron | Zwei Vercel-Aufrufe pro Tag um 04:07/04:37 UTC entsprechen je nach Jahreszeit 05:07/05:37 bzw. 06:07/06:37 Uhr in Berlin. Bei vollständig abgeschlossenem ersten Lauf endet der zweite früh. Vollsnapshot setzt theoretisch pro Charakter 21 Blizzard-Profilabrufe an, plus Aufrufe für Refresh, Lokalisierung, Medien und Regelquellen. | Scheduler-Aktivität für diesen Tag, Erfolgsquote, Tageslast, Function-CPU und Produktionslatenz nicht unabhängig gemessen. Vorschau-/Katalogcaches reduzieren Last und können Schreibpfade aus Leseansichten auslösen. |
| Vercel-Abrechnungsstichprobe | Im betrachteten Fenster war der abgerechnete Betrag vernachlässigbar. Build-CPU war der größte effektive Kostenposten. Die Stichprobe enthielt auch Functions-CPU, provisionierten Speicher und Blob-Positionen. | Kontoübergreifende Produktarten im Teamfenster, ohne belastbare Zuordnung zum Dashboard oder zu verbleibenden Kontingenten. Die vertraulichen Beträge und Abrechnungszeilen sind für diese Fassung entfernt. |
| Kontingent-Referenzen | Upstash Free kommuniziert 500.000 Befehle pro Monat, 10 GB Bandbreite und 250 MB Speicher auf der Tarifkarte. Vercel Hobby nennt 4 CPU-Stunden, 360 GB-Stunden und eine Million Function-Aufrufe. Blob-Hobby nennt 1 GB-Monat, 10.000 einfache, 2.000 erweiterte Operationen und 10 GB Transfer. | Anbieterreferenzen. Kontostatus, abgelaufene oder restliche Beträge und effektive Cap-Konfiguration blieben offen. Keine Tarif- oder Kapazitätsentscheidung aus der Referenztabelle ableiten. |

Zusätzlich sichtbar sind manuelle Frontend-Versionierung im Worker, öffentliche Archiv-/Medienformate und Git-basierte Deployments. Der kleine Runtime-Log-Ausschnitt lieferte keine verwertbaren Warn-/Fehlergruppen für das jüngste Deployment; daraus lässt sich weder ein fehlerfreier Cron noch ein vollständiges Monitoring ableiten. Ein pro Deployment nachgewiesenes Rollback einschließlich Datenkompatibilität und ein ausgespielter Restore fehlen als Abnahmekriterien.

[Browser-Gesamtmessung](Browser-Gesamtmessung.json) · [Chromium-Nachweis](Browser-Chromium.json) · [Firefox-Nachweis](Browser-Firefox.json) · [Upstash-Tarife](https://upstash.com/pricing/redis) · [Functions-Kontingente](https://vercel.com/docs/functions/usage-and-pricing) · [Blob-Kontingente](https://vercel.com/docs/vercel-blob/usage-and-pricing) · [Bereinigte Abrechnungsbeobachtung](Vercel-Abrechnung.json)

## 10. Unabhängige Tests und Qualität der Nachweise

1. **Drei Node-Laufzeiten.** Node v22.23.5, v24.22.3 und v26.13.1 liefen je 159 Prüfungen erfolgreich. Für die zusätzlich geladenen offiziellen Node-Versionen wurden SHA-256-Werte abgeglichen. Der Paketlock wurde reproduzierbar ohne Lifecycle-Skripte installiert. Lua-Dateien bestanden den Syntaxcheck mit TexLua, die Shell-Installer `bash -n` und die Bridge den Dry-Run.
2. **Mehr als reine Regression.** F02, F03, F06, F07a, F07b und F08 sind separate isolierte Befunde außerhalb des vorhandenen Testorakels. Die Werkstatt-Gegenrechnung benutzt eine manuelle Materialbilanz. Die Race-Prüfung zählt erfolgreiche unabhängige Änderungen und überprüft den tatsächlich simuliert gespeicherten Stand. Die Tests setzen einen synthetischen Redis-Transport ein und sperren externe Ziele.
3. **Freigabe- und Liveabweichungen.** 81 Pfade bestehen gegen die Rohstruktur, drei weitere mit expliziter Tierherrschaftskorrektur. 504 Rollen-/Pfad-/Rangfälle bestehen aktuell offline. Der Live-Quellen-Test um 20:47 Uhr MEZ meldete denselben Build und Hotfix sowie ein passendes Klassendateipaar. Das belegt den Quellenstand und die normalisierte Struktur, nicht den persönlichen Vercel-/Redis-Datenpfad oder das serverseitige Verhalten des Spiels.
4. **Browser und Offline.** System-Chromium und Playwright-Firefox bestanden lokal. Linux-WebKit ließ sich in dieser Umgebung wegen fehlender Systembibliotheken nicht starten. Die fünf Browser-CI-Jobs für genau diesen Commit bestanden, einschließlich Linux-WebKit, Windows-Chromium sowie macOS-WebKit mit iPhone-Emulation. Der Dashboard-Workflow bestand ebenfalls. Der pfadgefilterte Add-on-Workflow wurde für diesen Commit nicht ausgelöst. Die Browser-Engine- und Emulationsnachweise bleiben von Tests auf nativer Apple-, Windows- oder Android-Hardware getrennt. Gegen die eingesetzten Browser wurden die vorhandenen Prüfungen plus eine unabhängige Fünf-Ansichten-Matrix ausgeführt.
5. **Aussagekraft der Testverfahren.** Gute Mutations-/Negativfälle existieren für Punkte, Voraussetzungen, ungültige Versionen, Scope und Autorisierung. Ein Teil von UI-Verträgen prüft bestimmte Strings und Konstruktionen, nicht deren Semantik. Ein grüner Teststatus belegt daher weder korrekte Live-Rankgates noch Datenverlustfreiheit. Regressionswünsche für echte Redis-Konkurrenz, teilweise Archivierung, unterbrochenes Enrollment, Mehrfraktionen, alten Lernstand und modale Touch-/Tastaturbedienung sind den Maßnahmen zugeordnet.

[Quellenbeobachtung](Live-Quellenbeobachtung.json) · [Node 22](Tests-Node22.json) · [Node 24](Tests-Node24.json) · [Node 26](Tests-Node26.json) · [Isolierte Prüffälle](Isolierte-Prüfungen.mjs)

## 11. Gewichtung und Gesamtbewertung

Pro Prüfbereich stehen fünf Sollkriterien mit je 20 Punkten. 20 bedeutet durch passende Evidenz gut abgedeckt; 15 überwiegend erfüllt; 10 Teilerfüllung; 5 grundlegender Ansatz mit erheblicher Lücke; 0 keine positive Evidenz für das Kriterium. **N/E** bezeichnet ungeprüfte Teilfragen. Solche Teilfragen erhalten keine positiven Punkte aus Annahmen. Die Zahl bewertet den vorliegenden Nachweis, bildet keine Eintrittswahrscheinlichkeit oder Zertifizierung ab. Gewichte erhöhen den Einfluss möglicher Datenverluste und der Vertraulichkeit. Die Matrix weist die Grenzen je Test aus.

| Bereich | Teilkriterien mit Punkten | Ergebnis | Gewicht |
| --- | --- | ---: | ---: |
| Architektur | Zerlegung 20, gemeinsame Master 15, Versionierung 15, Grenzen/Isolation 10, Betriebsverträge 10 | 70 | 10 % |
| Programmcode | Syntax 20, Lesbarkeit/Wiederverwendung 15, Fehlerpfade 10, Konkurrenz/Monotonie 5, Eingabeverträge 10 | 60 | 8 % |
| Datenbanken | Modell 15, Transaktionen 10, Cache/Kompression 15, Live-/Restore-Beleg N/E 0, Aufbewahrung/Datenschutz 5 | 45 | 13 % |
| Quellen und Datenqualität | Zuordnung 20, Übersetzungs-/Buildbelege 15, Aktualität 15, Nutzungsrechte/Live-Rohprofile 5, Lückenführung 10 | 65 | 8 % |
| Fachmodule | Basisabläufe 20, Quellenkontrolle 15, Regelmodell 15, Grenzfälle 10, Spiel-/Personevidenz 10 | 70 | 14 % |
| Sicherheit und Datenschutz | Auth-Bausteine 15, tatsächliche Zugriffsgrenzen 5, Validierung/Secrets 10, Archiv-/Replaygrenzen 5, Scope/Rechte 5 | 40 | 16 % |
| Performance und Ressourcen | App-Warmtest 20, DOM-Effizienz 10, Cache/Budget 15, Nutzergeräte/Serverlast 10, Kostenbelege 10 | 65 | 8 % |
| UI und PWA | Struktur/Wiedererkennung 20, Barrierefreiheit 15, responsive Stichproben 20, Update/Offline-Breite 10, native Plattformabdeckung 10 | 75 | 8 % |
| Betrieb und Infrastruktur | Deployment-Identität 20, Cron-Stabilität 10, CI/Beobachtbarkeit 10, Wiederherstellungspraxis 5, reale Kontingente 5 | 50 | 7 % |
| Qualitätssicherung | Node-Matrix 20, Module/Negativfälle 20, Browsertests 15, unabhängige Referenztests 15, echte Storage-/Gameplay-Tests 10 | 80 | 5 % |
| Zukunftsfähigkeit | Spielklassen 20, versionsgebundene Regeln 15, Roster/Bridge 10, Code-/Datenwachstum 10, Übergabe 10 | 65 | 3 % |

Arithmetik: Summe aus Bereichswert × Gewicht. P0-Befunde sperren die Gesamtfreigabe unabhängig vom Zahlenwert.

## 12. Priorisierte Maßnahmen, Nutzen, Aufwand und Abhängigkeiten

Personentage sind Schätzungen für Analyse, Änderung und Regression. Die Umsetzung setzt eine gesonderte Freigabe voraus.

| Reihenfolge | Maßnahme | Nutzen und Abnahme | Aufwand und Abhängigkeit |
| --- | --- | --- | --- |
| 1 · P0 F01 | Roharchiv und öffentliche Profilfelder klassifizieren. Private Blob-Verwahrung bzw. minimaler erlaubter Archivvertrag, Aufbewahrung, Zugriff und Löschprozess mit Datenverantwortlichen abgleichen. | Sensible Daten standardmäßig geschützt. Rechtereignisse, lokale Ersatzfixtures und deklassifizierte UI-Felder überprüfbar. | 1–3 T, Bestandsinventur benötigt autorisierten Read-only-Zugriff. Eine Migration oder Löschung ist ein eigener freizugebender Vorgang. |
| 2 · P0 F02 | Vorbedingung und Lesebasis atomar schützen. Innerhalb Lock erneut laden und validieren oder Datendomänen mit CAS nur für den betroffenen Charakter zusammenführen. Spätere Writes der anderen Domäne auf Fehler prüfen. | Zwei getrennte 200er bleiben erhalten; veralteter Versuch liefert nachvollziehbaren Konflikt. Bestehende atomare Versionsaktualisierung nutzen. | 1–2 T. Fixture F02 wird Regression. Vor endgültiger Auswahl parallel mit F03 entwerfen. |
| 3 · P1 F03/F18 | Frischeordnung je Domäne, begrenzte erlaubte Uhrenabweichung und Idempotenz; Enrollment-Bindung und Token-Lebenszyklus transaktional oder wiederanlauffähig. | Späte Meldungen lösen keinen Rückschritt aus; Fehler nach Einmalcode-Verbrauch sind sicher wiederholbar. | 2–4 T. F02 zuerst, bestehende Zustände und alte Bridge-Versionen migrierbar halten. |
| 4 · P1 F04/F05 | Umgebungsgrenzen für Writes und Credentials schließen, Geräte-Promotion mit eigener Produktionsentscheidung, mutierenden Refresh mit autorisiertem Aufruf und bestehendem Limit absichern. | Preview bleibt isoliert, Berechtigungen kontrolliert, Crawler lösen keine Live-Aktualisierung aus. | 2–4 T. Read-only-Prüfung der realen Bindungen zuerst. Vorschau nicht durch eine zusätzliche Produktionsressource ohne Freigabe absichern. |
| 5 · P1 F06/F14 | Archivqualität explizit markieren, idempotente Stufen validieren, Fehlersnapshot separat halten und Restore aus repräsentativem privaten Export in isolierter Kopie durchspielen. | Keine Erfolgsmeldung für leere Backups, nachvollziehbare Wiederanlaufzeit und Referenzintegrität. | 3–5 T. Hängt von F01, Redis-/Blob-Lesezugang und Recovery-Ziel ab. |
| 6 · P1 F07/F08/F09 | Materialbedarf topologisch aggregieren, Zyklus/Mengenlimits klar sperren; bestätigte Fraktion verlangen; Builds auf Abruf und Cache read/write exakt prüfen. | Verlässliche Kosten/Materialien und keine erdachten Angebote oder Katalogversionen. | 3–5 T. Bestehende Fixtures erweitern, F02/F03 teilweise unabhängig. |
| 7 · P1 F12 | Gezielte Spielmessung je Gatterfamilie und dokumentierter Ausnahme mit festen Build-/Zeit-/Rangbelegen. Jäger, Druide und Frost gesondert verifizieren. Unbelegte Gatefälle enger behandeln. | Fachlich stärkere Freigabe und reproduzierbarer Unterschied zwischen Struktur und Serverzustand. | 2–5 T plus verfügbare Spielumgebung. Keine harte Aussage zu exakter Spieldauer oder Tarif nötig. |
| 8 · P2 F10/F11/F17 | Eingaben früh validieren, Minutenbudget neben Tagesbudget, kleine Summary-Leseprojektion, weniger Polling über Tabs und Lazy Rendering. Suchfallback korrekt kennzeichnen. | Weniger Abrufe, kleinere Payloads und günstigere Interaktion, besserer Roster-Wachstumspfad. | 3–5 T. Nach Messung mit realen Usage-Rechten quantifizieren. |
| 9 · P2 F13/F15/F16/F19 | Zentrale Roster-/Geräte-IDs, gemeinsame DOM-/Datenverträge, CSP zunächst als überprüfte Rollout-Option, Worker-Cacheumschaltung eigen begrenzen. Native PWA, Tastatur, Screenreader, Release- und Fehlerabläufe testen. | Weniger Altlasten und belastbare Plattform-/Sicherheitsnachweise. Historische Vorschauen und redundante Skripte bedarfsbezogen entkoppeln. | 4–7 T in mehreren kleinen Änderungen; Rechte- und Persistenzpfade aus F01–F05 voraussetzen. |
| 10 · P3 | Kurze Architekturentscheidungen und Eigentümer für Quellen, Rechte, Budgets, Parser und historische Übergaben im Repo pflegen. | Künftige Entwickler können Freigaben nachvollziehen. Doppelarbeit und frühere widersprüchliche Statusangaben sinken. | 1–2 T nach Stabilisierung. |

## 13. Nicht durchgeführte Prüfungen und verbleibende Risiken

- **Echte Redis-/Blob-Inhalte** einschließlich Schlüssel-/Objektzählung, Speicher, Nutzdaten, verwaiste Referenzen, TTL-Verteilung, Keys pro Umgebung, realer Quotenverbrauch, Wiederherstellung und App-übergreifendes Berechtigungsprofil. Upstash OAuth fehlte, Blob-Objektleserechte standen nicht zur Verfügung. Die öffentliche Archivkonfiguration aus dem Code ersetzt keinen Kontozugriff.
- **Produktive Datenflüsse mit Seiteneffekten** einschließlich Refresh, Cron, Medien-Autofill, öffentliche Versionsmigrationen, Add-on-Write und Geräteeinrichtung. Auswertung erfolgte statisch, mit Verbindungsmocks oder über rein lesende Provider-Metadaten. Die Auslieferung der Produktions-Shell ist gesichert, kein umfassender funktionaler End-to-End-Nachweis auf echtem Roster.
- **Native Geräte und Native WoW-Laufzeit.** macOS/iOS/iPadOS Safari, installierte PWA nach Update, echte Android-Hardware, Windows-Installer/Bridge, Screenreader und reale Add-on CPU-/RAM-/Netzfrequenz. Browser-Emulation und remote CI sind jeweils eigene Nachweisarten.
- **Vollständige Datenrechtsprüfung** für Blizzard-Profilarchiv, Drittlizenzen und fremde Clientauszüge. Anbieterbeschreibungen und Herkunft wurden erfasst. Projektinterne Freigaben, Zustimmungen, Langzeitaufbewahrung und Rechte an tatsächlichen produktiven Altbeständen sind offen.
- **Echte Gameplay-Berechtigung und Quellenunterbrechungen.** Serverannahme effektiver Talentgates, Kombinationen bei Frost, einige Talentkanten, getrennte Nah-/Fernkampf-Kritwerte, zusätzliche Klassen-/Rollen-Synergien und echte Trainingsdaten im WoW-Client. Die analytischen Freigaben dokumentieren ihre Annahmen.

## 14. Anhänge und Nachvollziehbarkeit

- [Prüfmatrix](Prüfmatrix.csv), [priorisierte Maßnahmenliste](Maßnahmenliste.csv), [Dateiinventar](Dateiinventar.csv), [statische Referenzen](Abhängigkeiten.csv), [Redis-Schlüssel](Redis-Schlüssel.csv), [Quellenhosts](Quelleninventar.csv), [Inventar-Kennzahlen](Inventar-Kennzahlen.json)
- [Isolierte Prüfungen](Isolierte-Prüfungen.mjs), [Befunde](Isolierte-Testergebnisse.json), [Node-Prüfungen 22](Tests-Node22.json), [24](Tests-Node24.json), [26](Tests-Node26.json), [npm-Advisory-Auszug](Abhängigkeiten-Advisories.json)
- [Browser über alle Ansichten](Browser-Gesamtmessung.json), [Chromium](Browser-Chromium.json), [Firefox](Browser-Firefox.json), [Netztest Talentquellen](Live-Quellenbeobachtung.json)
- [Dashboard-CI](https://github.com/tamorok44/dalton-dashboard/actions/runs/45884752698) · [Browser-CI](https://github.com/tamorok44/dalton-dashboard/actions/runs/45884752354)

Reproduzierbarkeit der neuen isolierten Funktionsprüfungen mit Node 22 oder neuer im Audit-Checkout.

~~~sh
node "docs/audits/2026-11-26/Isolierte-Prüfungen.mjs" .
~~~

Die zusätzliche Gesamtmessung kann mit dem in CI verwendeten Playwright 1.56.1, einem lokalen Chromium und dem Audit-Checkout erneut ausgeführt werden. DALTON_PLAYWRIGHT_MODULE verweist auf das installierte playwright/index.mjs. DALTON_AUDIT_CHROMIUM erlaubt die Angabe eines anderen lokalen Chromium-Binaries. Der Test bindet ausschließlich 127.0.0.1. [Browser-Prüfskript](Browser-Gesamtmessung.mjs)

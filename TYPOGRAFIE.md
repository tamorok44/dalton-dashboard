# Typografiesystem – Die Daltons

Stand: 20. November 2026 · Western-Dashboard auf WoW Forever

## Gestaltungsprinzip

Genau **zwei Schriftfamilien**. Der Unterschied zwischen *Steckbrief-Titel*
und *Informationstext* ist gewollt, nicht zufällig.

- **Western-/Titelschrift:** `"Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif`
  (CSS-Variable `--display`). Nur charaktervolle Hauptüberschriften,
  wichtige Zahlen und die Beinamen auf dem Porträtsiegel.
- **Informationsschrift:** `ui-sans-serif, -apple-system, BlinkMacSystemFont,
  "Segoe UI", sans-serif` (CSS-Variable `--body`). Für alle Fließtexte,
  Beschriftungen, Statusmeldungen, Tasten, Tabellen, Metadaten und
  Berufsnamen.

### Feste Größen für gewöhnliche Texte

| CSS-Token | Basis bei 16px Browser-Schriftgröße | Einsatz |
| --- | ---: | --- |
| `--type-caption` | 11px | Micro-Labels, Kategorie, Gruppen-Labels, Badge-Vorname, Berufsskala, Legende |
| `--type-small` | 12px | Status, Datenstand, Hinweis, Spieler, Berufsrang, Fußnoten |
| `--type-body` | 14px | Absätze, Beschreibungen, Tabellenzeilen, Berufe, Ausrüstung, Schaltflächen |
| `--type-lead` | 16px | Gut lesbarer Schlussspruch im Kopf |
| `--leading-copy` | 1,5 | Einheitlicher Durchschuss der Absätze |
| `--tracking-label` | 0,09em | Einheitliche leichte Sperrung von Kurzbeschriftungen |

**Schriftstärken:** 400 (Fließtext), 600 (dezente Hervorhebung),
700 (Beschriftung/Unterüberschrift), 800 (Western-Titel/Zahlen).
**Kursivschrift:** ausschließlich „Die“ im großen Dalton-Titel.
Andere Absätze, Beinamen und Fußnoten bleiben aufrecht.

## Konkret nach Seitenbereich

| Ort | Schrift | Größe bzw. mobile Variante | Stil |
| --- | --- | --- | --- |
| Obere Hero-Zeile („World of Warcraft“, „Allianz · EU-PvP“) | Body | 11px, mobil 10px, sehr schmal ca. 9,6px | 700, leicht gesperrt |
| „Die“ im Titel | Display | responsiv ca. 34–80px | 800, einziger kursiver Akzent |
| „DALTONS“ | Display | responsiv ca. 42–147px | 800, helle goldene Schrift |
| „WANTED · AZEROTH“ | Body | 12px, mobil 11px | 700 |
| Untertitel im Titelbild | Body | responsiv ca. 16–21px | 700 |
| „Noch keine Legenden, aber schon gesucht.“ | Body | 16px, mobil 15,2px | 700, kontrastreicher Schatten |
| Namenszeile im Hero | Body | 11px, mobil 10px | 700, mittig |
| „Die Bande im Überblick“ | Display | ca. 20–28px, mobil ca. 23px | 800 |
| Einleitungstext zum Hauptquartier | Body | 14px | 400, Zeilenhöhe 1,5 |
| „Aktualisieren“ | Body | 14px | 700 |
| Datenstand und Button-Hinweis | Body | 12px | 400–600 |
| Gruppenübersicht – Kategorien | Body | 11px | 700, einheitliche Sperrung |
| Gruppenübersicht – Zahlen | Display | ca. 24–33px, mobil ca. 25px | 800 |
| Abschnitt „Die vier Daltons“ | Display | ca. 30–54px, mobil ca. 30px | 800 |
| Beschreibung unter Abschnittstitel | Body | 14px | 400, Zeilenhöhe 1,5 |
| Charaktername auf Steckbrief | Display | ca. 29–39px, mobil 26–31px | 800 |
| Steckbriefnummer, Statistik- und Bereichslabels | Body | 11–12px | 700 |
| Siegel: Vorname / Beiname | Body / Display | 11px / 14,4px; mobil 10px / 13px | 700, nicht kursiv |
| Sheriffstern – Stufe / Zahl | Body / Display | 10px / 23px; mobil 9px / 17–19px | 700 / 800, beide 16° gedreht |
| Hauptwerte – Labels / Zahlen | Body / Display | 11px / 29px, mobil Zahlen ca. 24px | 700 / 800 |
| Weitere Attribute, Talente und Zeilen | Body | 14px | Standardtext 400, Werte 700 |
| Beruf, Ausbildungsrang | Body | 14px / 12px | 700 |
| Berufsfortschrittszahl | Display | ca. 15px | 800, tabellarische Zahlen |
| Berufsskala / Legende | Body | 11px | 700 / 400 |
| Ausrüstung und Ausrüstungshinweise | Body | 14px / 11–12px | 400 / 700 |
| Fußzeilentitel / Fußzeilentext | Display / Body | 19px / 12–14px | 800 / 400 |

Größen in px sind Näherungswerte bei 16px `rem`-Basis; Nutzereinstellungen
für größere Systemschriften sollen weiterhin berücksichtigt werden.

## Abstände und Layout

- Lauftext und Beschreibung nutzen eine gemeinsame Zeilenhöhe von 1,5.
- Zwei benachbarte Absätze mit derselben Funktion verwenden denselben
  Textstil – keine zufälligen Kursivschriften.
- Die Namenszeile steht mittig; der Serverhinweis wird **nur oben rechts**
  gezeigt, nicht doppelt am Bildrand.
- Die Fußzeile nutzt ausschließlich eine schmale echte Rahmenlinie
  (`border-top`), **keine Unicode-Balken und kein dekoratives Aufzählungssymbol**.
- Titel und Zahlen dürfen größer sein, weil sie in der Informationshierarchie
  andere Funktionen erfüllen als Fließtext. Auch auf kleinsten iPhones bleiben
  die gewöhnlichen Beschriftungen im Bereich von ungefähr 10–14px;
  nur die innere Stufenbeschriftung ist aus Platzgründen etwas kleiner.

## Wartungsregel

Neue Texte nach Möglichkeit nur diesen vier Textgrößen zuordnen.
Keine dritte Schriftfamilie, keine zusätzliche Kursivschriftebene
und keine neuen Zwischenstärken ohne begründeten visuellen Bedarf.

# UI-CI / Layout-Vertrag

Diese Datei definiert verbindliche Layoutregeln für das Dalton-Dashboard. Sie gelten für **jeden bestehenden und jeden neuen Hauptreiter bzw. jede neue Unterseite**.

## 1. Mobile Viewport ist unverhandelbar

Die gesamte Seite darf auf mobilen Geräten niemals breiter als der sichtbare Viewport werden.

Verbindlich:

- Jeder Hauptreiter, der über `data-view-link="<name>"` erreichbar ist, besitzt den Zielcontainer `#<name>View`.
- Jeder dieser Zielcontainer trägt die gemeinsame Klasse `main-view`.
- `.main-view` sowie seine direkten Inhaltsblöcke verwenden `min-width:0` und `max-width:100%`.
- Ein Hauptreiter selbst darf **niemals** `overflow-x:auto` oder `overflow-x:scroll` erhalten.
- Horizontales Verschieben der kompletten Seite ist ein Fehler.

## 2. Text und Flex-/Grid-Kinder müssen schrumpfen können

Typische Ursache für Mobile-Overflow sind intrinsische Mindestbreiten.

Darum gilt:

- Texttragende Flex- und Grid-Kinder erhalten bei Bedarf `min-width:0`.
- Lange Überschriften müssen umbrechen bzw. schrumpfen können.
- Überschriften dürfen nicht mit `flex:0 0 auto` gegen den Viewport gedrückt werden.
- `white-space:nowrap` ist nur für kleine Bedienelemente, Chips oder bewusst einzeilige Werte zulässig, nicht für seitenbreitenbestimmende Titel.
- `fieldset`, `legend`, Tabellenwrapper und dynamische Inhaltscontainer müssen auf `max-width:100%` begrenzt werden, wenn sie in einem Hauptreiter liegen.

## 3. Horizontaler Scroll ist nur als Innenkomponente erlaubt

Horizontaler Scroll ist nur zulässig, wenn der Inhalt fachlich tatsächlich breiter sein muss als der Bildschirm.

Aktuell freigegeben:

- `.character-tabs`: horizontale Reiterleiste innerhalb einer Charakterkarte.
- `.compare-scroll`: Vergleichstabelle mit mehreren Charakterspalten.

Ein neuer horizontaler Scroller muss:

1. ein eigener, klar abgegrenzter Innencontainer sein,
2. selbst `max-width:100%` und `min-width:0` einhalten,
3. `overscroll-behavior-inline:contain` verwenden,
4. bewusst in der CI-Allowlist ergänzt werden.

Die Hauptseite bzw. `body`, `main` oder `.main-view` werden niemals als horizontaler Scroller verwendet.

## 4. Gemeinsame Komponenten vor Sonderlösungen

Neue Reiter verwenden vorhandene Dashboard-Bausteine, bevor ein eigener Stil eingeführt wird:

- `.roster-heading` für Seiten-/Reiterüberschriften,
- `.stat-grid` / `.stat-tile` für Werte,
- `.details > summary` für einklappbare Detailbereiche,
- bestehende Karten-, Tabellen- und Navigationsmuster.

Wenn ein neuer Bereich ein abweichendes Layout benötigt, muss zuerst geprüft werden, ob eine bestehende Komponente erweitert werden kann.

## 5. Responsive Mindestprüfung

Jeder neue Hauptreiter wird mindestens für folgende Breiten geprüft:

- 390 px und kleiner,
- 520 px,
- 740 px,
- Desktop.

Auf Mobile müssen Titel, Auswahlfelder, Karten und leere Zustände vollständig innerhalb der Seitenbreite bleiben. Nur ausdrücklich freigegebene Innencontainer dürfen horizontal scrollen.

## Automatische Absicherung

`scripts/test-layout-contract.mjs` prüft bei jedem `npm test`:

- dass jeder Navigationsreiter einen `main-view`-Zielcontainer besitzt,
- dass der gemeinsame Viewport-Vertrag im CSS existiert,
- dass Hauptansichten nicht horizontal scrollen,
- dass keine neuen horizontalen Scroller ausserhalb der Allowlist eingeführt werden.

Damit ist diese Regel Bestandteil der CI und nicht nur eine Dokumentationskonvention.

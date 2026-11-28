# Bridge und Geräteberechtigungen

PR #116, Ausgangspunkt `9f091f45a992970421d1a544945e827436448dc1`. Der unabhängige P1 zeigte, dass eine Neukopplung den lokalen Zugang ersetzte, während der vorherige Zugang auch nach bestätigter Deinstallation weiter synchronisieren konnte. Die Ablösung betrifft genau die vorherige Kopplung derselben Installation. [Verbindlicher Sanierungsauftrag](https://github.com/tamorok44/dalton-dashboard/pull/116#issuecomment-7242091293)

## Zustände und Belege

| Zustand | Übergang und Bestätigung |
|---|---|
| Erst- oder Neukopplung begonnen | Das gespeicherte Ziel wird auf HTTPS, Origin und Datenumgebung geprüft. Vor der Einlösung hält die Bridge Einladung, Kandidat und bisherigen Zugang in einer privaten lokalen Wiederanlaufakte fest. Der Server verknüpft Einladung und Gerät atomar. Ein verlorener Erstbeleg kann mit denselben Daten gelesen werden, bei neuen Geräten auch nach Ablauf des Einladungsschlüssels. |
| Neuer Zugang bestätigt, bisherige Kopplung wird abgelöst | Vor dem ersten Widerruf speichert die Bridge den eindeutigen Gerätebeleg und die Absicht zur Ablösung. Der bisherige Zugang wird an seiner ursprünglichen Origin und in der bestätigten Umgebung widerrufen. Bei verlorener Antwort bleiben beide Zugangsdaten verfügbar. Der bisherige Zugang wird bei einem Retry erneut widerrufen. Ein bestätigter DEL-Nullwert steht für seine Abwesenheit in der gebundenen Umgebung. |
| Ablösung bestätigt | Die Bridge speichert den neuen aktiven Zugang atomar. Der Vorgang kann nach einem Dateifehler oder Prozessende wiederholt werden. Ein bereits bestätigtes Gerät wird dabei nur lesend bestätigt. Ein bereits erfolgreicher Vorgang kann mit demselben Code als Installer-Retry bestätigt werden. |
| Installation abgeschlossen | macOS und Windows halten die gemeinsame Sperre vom Einstieg bis nach Austausch und Einrichtung des Autostarts. Sie behalten die Wiederanlaufakte bis zum bestätigten Abschluss der lokalen Schritte. Ein leerer Code setzt eine offene Installation fort. |
| Abbruch der offenen Kopplung | Vor Beginn der Ablösung kann der neue Kandidat gezielt abgebrochen werden, während der bisherige Zugang erhalten bleibt. Nach Beginn der Ablösung wird entweder fortgesetzt oder vollständig widerrufen. Der Abbruch schreibt eine eigene Absicht und akzeptiert nur die bestätigte Gegenstelle. |
| Vollständiger Widerruf und Deinstallation | Die Installation hält die Absicht zum Widerruf bis zur bestätigten Auflösung ihrer offenen und aktiven Zugänge fest. Eine verspätete Einlösung wird über den atomaren Einladungszustand abgefangen. Anschließend werden lokale Geheimnisse, Bridge und Autostart entfernt. |
| Verwaiste Sperre | Die Prozesssperre wird nur unter eindeutigem Eigentum freigegeben. Nach SIGKILL erst die betreffenden Prozesse sicher beenden, dann die verwaiste Sperre nach dem [Abnahmeplan](Betriebsabnahme.md) freigeben. Die Wiederanlaufakte bleibt dabei erhalten. |

Die Bridge bindet den Kandidaten vor dem ersten schreibenden Aufruf an die erwartete Serverumgebung. Ein bekannter Zustand aus einer anderen Umgebung kann keine Abwesenheit bestätigen. Für Altdateien ohne Umgebung muss der Server die ursprüngliche Einladung oder den tatsächlich vorhandenen Zugang sehen. Fehlt dieser Beleg, bleiben die Daten für die kontrollierte Wiederherstellung lokal erhalten. Der aktive Gerätesatz speichert einen Einladungsabdruck und eine Geräte-ID. Änderungen am Gerätebestand bleiben auf die im Vorgang genannten Zugänge begrenzt.

Eine aktuelle Bridge setzt den aktualisierten Geräte-Endpunkt voraus. Altgeräte und Alt-Bridge können bestehende Berechtigungen mit den bisherigen API-Aktionen weiterverwenden. Bereits früher verwaiste Zugänge sind aus einer überschriebenen lokalen Datei nicht ableitbar. Sie müssen vor dem Rollout selektiv inventarisiert und bei belegter Zuordnung widerrufen werden. Ein Restore alter Provider-Snapshots erfordert den dokumentierten Abgleich mit jüngeren Widerrufen und verifizierten physischen Bindungen.

## Prüfmatrix

| Bereich | Gegenproben und erwarteter Zustand |
|---|---|
| Scope und Transport | HTTPS ohne Redirects. Fremde Origin und abweichender Scope werden zurückgewiesen. Alte und neue Berechtigung erreichen ausschließlich die jeweils gespeicherte Origin. Ein Scopewechsel am selben Host nach verlorener Erstbestätigung erhält den lokalen Kandidaten. |
| Erstkopplung und Belege | Verlorene Erstbestätigung nach tatsächlichem Commit, Invite-Ablauf, genauer Wiederanlauf mit gleichem Gerät, Retry des bereits gespeicherten Codes und lesender Identitätsabgleich. Malformed-Response-Fälle aus der bestehenden CLI-Suite bleiben aktiv. |
| Ablösung und Konkurrenz | Ersetzen desselben Charakters, Wechsel des Charakters und Wechsel zur anderen Umgebung. Fehlende DEL-Berechtigung und unterbrochene positive Antwort erhalten den bisherigen Zugang in der Akte. Ein zweiter Prozess darf unter gehaltener Sperre keinen parallelen Verwaltungsvorgang beginnen. |
| Dateien und Prozessende | Abgewiesenes Rename vor Aktivierung und echter SIGKILL nach Rename. Wiederaufnahme nach geprüfter Freigabe der verwaisten Sperre. Positiver Abschluss erst bei bestätigter Rückmeldung des verwalteten CLI. |
| Abbruch und Berechtigungen | Ausstehender Kandidat kann bei bestätigtem Scope abgebrochen werden. Fehlgeleitete Bestätigung und verlorene Abbruchantwort erhalten die Akte. Vollständiger Widerruf enthält alten und neuen Zugang. Die tatsächliche Sync-Route muss für beide entfernten Token HTTP 401, für ein separat gekoppeltes Gerät weiterhin HTTP 200 mit Persistenz liefern. |
| Native Wrapper | Sperrweitergabe, offene Installation bis zum Abschluss, Syntax der Windows-Skripte, Zsh-Abbruch vor Austausch, Deinstallation bei ungültigem Beleg und fehlendem Binary. Physische Wiederanlauf- und Autostartprüfung folgt auf Windows und macOS. |
| Oberfläche | Ungeöffnete Talentreiter bleiben auch nach dem Laden des Katalogs für einen anderen Reiter leer. Aktive Reiter behalten Tastaturzugriff und Darstellung. |
| Restore | Inkonsistenter Profilstand mit und ohne Legacy-Hinweis bleibt ein verpflichtender Sperrfall. Nach Abgleich müssen beide öffentlichen Routen dieselbe Generation ausweisen und ein kontrollierter Folgewriter muss sie fortschreiben. |

Die CLI-/API-Fälle laufen in `scripts/fixtures/bridge-device-lifecycle.mjs` über die Geräte-/ACL-Suite gegen isoliertes Redis 7 und 8. Die Browserprüfung enthält einen echten Katalogabruf. Kein neuer Abfragepfad läuft im Hintergrundbetrieb. [Allgemeine Prüfmatrix](Pruefmatrix.md) · [Isolierter Geräte-Workflow](../../../.github/workflows/device-enrollment-redis.yml)

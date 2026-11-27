# Geräteberechtigungen / F04 – erste Eindämmung

Basis: 0608cf5. Keine Abhängigkeit von PR #116 oder #117.

- Historische automatische Geräteübernahme in neue Deployment-Versionen geschlossen (HTTP 410 ohne Datenbankzugriff). Server-Helfer entfernt, neue Bridge verweigert Altkommando lokal. Autorisierung darf nur den aktuellen Scope lesen. Charakter-Allowlist prüft eigene Einträge.
- Bestehende gültige Produktionstoken und normale Kopplung bleiben erhalten, einschließlich legitim übernommener Geräte. Keine Rotation, keine Sperrung, kein Re-Enrollment im Zuge dieses PR.
- Kein vollständiger Nachweis der realen Umgebungsisolation: Alte Preview-Deployments mit alten Zugangsdaten können weiter auf dieselbe Datenbank zugreifen. Vor F04-Freigabe sind alte Schreibzugänge am Speicher zu entziehen und die bereits ausgestellten Berechtigungen zu inventarisieren. Token- bzw. Rechtewechsel getrennt abnehmen; kein automatischer Widerruf von aktiven Teamgeräten. Produktion nur nach Freigabe.
- F05 (gemeinsame Speicherbindung und öffentlicher Refresh) sowie F18 (Einladungs-/Widerrufsatomarität) separat. Keine neuen personenbezogenen Daten oder Schlüsselwerte in den Nachweisen.

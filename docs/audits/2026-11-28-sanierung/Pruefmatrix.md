# Prüfmatrix · Fehlerzustände und Wiederanlauf

Die reproduzierbaren Repository-Prüfungen verwenden synthetische Identitäten und Daten. Der lokale Redis wird per privatem Unix-Socket gestartet. Providerantworten laufen über Fixtures. Isolation einer Redis-Version beweist die Semantik von Redis-Kommandos unter dieser Version. Sie ersetzt keine Messung der realen Upstash-REST-Schicht.

| Bereich und frühere Befunde | Zustandsübergänge | Reproduzierbarer Nachweis |
|---|---|---|
| Kernprofil, Legacy, Add-on · F02/F03/S08/G01–G03 | Fehlender/fehlerhafter Redis-Umschlag, falscher Keytyp, Ausfall, Stale Replay, konkurrierende Originalbytes, folgender Writer, veraltetes v1/v2, UTC-Altformate, falsche Profil-ID, Kollision | `scripts/test-audit-p0.mjs`, `scripts/test-refresh-api.mjs`, `scripts/test-data-version.mjs`, `scripts/test-spellbook-sync.mjs` |
| Beobachtungen · F14 | Keine/unterbrochene Speicherung, leere und fehlende Originale, konkurrierender Belegwechsel, defekter Quarantänebeleg, Konflikt, verspäteter Commit, doppelte Zustellung und Replay | `scripts/test-audit-p0.mjs`, `scripts/test-live-knowledge.mjs`, historische Redis-Matrix |
| Redis-Fristen und Sperren · F02/F14/F18 | Antwortverlust, fremdes Token, Zeitabweichung, ausgebliebene Freigabe, echter Prozessabbruch, Expiry, nachträgliche Commits, beschränkte Rechte | Historische Fristmatrix mit 22/27/30 s, plus `scripts/test-audit-p0.mjs` |
| Enrollment/Bridge · F04/F18/A01/A04/A05/B04–B12 | Abgelehnte Ziele, widersprüchliche Flags, falsche Aussteller, Konkurrenz, MSET-/DEL-Verweigerung, verlorene Antwort, Wiederaufnahme mit/ohne Originaltoken, Abbruch vor/nach Commit, lokaler Besitzerwechsel | `scripts/test-device-enrollment-redis.mjs`, `scripts/test-addon-sync.mjs`, `zsh -n` der Wrapper, native Plattformabnahme separat |
| Archiv, Restore und Quarantäne · F01/F06/F14/A06/G02 | Keine gültige Quelle, abweichende Profil-ID, fehlende Form, unauthentifizierter Pfad, unveränderlicher Upload, Wiederaufnahme, Tageszeiger, SHA-Inventur und Altleser | `scripts/test-audit-p0.mjs` und historische Redis-Gruppen mit synthetischem Blob-SDK-Transport |
| Eingabe, Kosten und Fan-out · F10/A07/A08/A13/V01 | Größen-/Tiefenlimit, Unicode, Teilstream, frühe Abweisung, Abbruch, Weiterleitung, Teilmutation, Quotenwechsel, fehlerhafte ACL, Warmfall | `scripts/test-request-json.mjs`, `scripts/test-media-resolver.mjs`, `scripts/test-foreverdb-budget.mjs`, `scripts/test-audit-p0.mjs` |
| Öffentliche Statistik, Vergleich, Begleiter · A03/F16/S05–S10 | Konflikt, unbeschriftetes Enum, widersprüchliche Altlabels, defekter Teilbaum, vollständige/partielle Ausfälle, alter GET nach neuerem Refresh, Fallback | `scripts/test-public-character-profile.mjs`, `scripts/test-refresh-api.mjs`, `scripts/test-ui.mjs`, `scripts/browser-talent-regression.mjs` |
| Werkstatt, Orte, Berufe, Katalog · F07–F09/F17 | Mengen- und Rechenrandfälle, Zyklen, unbekannte Fraktion, fehlende Quellenbelege, alte Preise und Buildwechsel | `scripts/test-workshop.mjs`, `scripts/test-location-planner.mjs`, `scripts/test-profession-planner.mjs`, Klassenbuild- und Beobachtungstests aus dem Gesamtlauf |
| Talent- und Pet-Fachlogik · F12/F16 | Ränge 0–5, Klassen-/Rollenwechsel, Gatter, Katalogalter, belegte und ungeklärte Effekte, ungültige Revision | `npm run test:talents`, `npm run talent:release-gate`, Pet-Regeltests aus dem Gesamtlauf |
| Oberfläche, PWA und Release-Artefakte · F11/F15/F19/A09/A11/A15 | Inaktive Reiter, vergleichbare und veraltete Daten, Gerätebreiten, Offline-Shell und Cacheeigentum, CSP, entpackte Bridge-Artefakte | `scripts/browser-talent-regression.mjs`, `scripts/test-ui.mjs`, Browser-/Add-on-Workflows |

## Lokale Wiederholung

```bash
npm ci --ignore-scripts
DALTON_REQUIRE_LOCAL_REDIS=1 DALTON_TEST_REPORT=/tmp/dalton-suite.json npm test
npm audit --audit-level=high
npm run talent:release-gate
zsh -n bridge/Installieren.command
zsh -n bridge/Deinstallieren.command
```

Den Gesamtlauf einmal mit Redis 7 und Node 22 und einmal mit Redis 8 und Node 26 ausführen. Pro Lauf `redis-server --version` und `redis-cli --version` getrennt dokumentieren. Ein lokal übersprungener Redis-Schritt zählt nicht als Datenbanknachweis. Für die Gerätematrix den dedizierten leeren Redis-Service des Workflows `.github/workflows/device-enrollment-redis.yml` verwenden.

Die historischen Tests und das Stilllegungswerkzeug liegen im vorangegangenen [Audit-Zweig](https://github.com/tamorok44/dalton-dashboard/tree/audit/pr116-recheck-4e7c1f0-2026-11-27). Direkte Test-Writer benötigen heute den ursprünglichen Roster als `expectedRoster` und beim Add-on `expectedState`. Testwartung eines Rosters aktualisiert Roster und zugehörige kompakte Metadaten gemeinsam. Die Testregeln für Sperrverlust, ACL und unveränderte Originalbytes gelten weiterhin.

# Audit-Sanierung – P0 F01/F02

Referenz: Codex-Audit 9a406cd, geprüfter Main 0608cf5. Keine Änderung der historischen Audit-Dateien.

## F01 – Roharchive
Neue Vollarchive ausschließlich in einem separaten privaten Blob-Store mit `DALTON_PRIVATE_ARCHIVE_TOKEN` (nur Produktion, explizite Konfiguration). Öffentliches Medien-Blob bleibt unverändert. Ohne privaten Token wird der Rohabruf für das Archiv ausgelassen, Metadaten kennzeichnen `disabled`; operative Aktualisierung bleibt möglich. Fehlgeschlagene Archivierung wird als `failed` ausgewiesen, nicht als vorhandenes Backup; die nächste Cron-Gelegenheit kann erneut archivieren, ohne bereits erfolgreich persistierte Profile erneut abzurufen. Keine automatische Migration, Löschung, neue Storage-Ressource oder Kostenfreigabe. Alte öffentliche Objekte bleiben ungeprüft. Vor vollständiger F01-Abnahme: autorisierte Bestandsaufnahme, Datenklassifikation und Aufbewahrung, private Ablage provisionieren, repräsentativen authentifizierten Upload/Read und unautorisierten Read prüfen, Migration und Lösch-/Cachekonzept separat freigeben. Öffentliche UI-/Git-Fallback-Felder gesondert klassifizieren. Fehlersnapshot-Qualität und Restore bleiben F06/F14.

## F02 – Add-on-Konkurrenz
Produktiver Lock vor Roster- und Duplicate-Lesebasis. Alle frühen Rückgaben innerhalb try/finally. Der vorhandene Roster-Lua-Write bleibt tokengebunden; der abschließende Add-on-Status samt Versionsmetadaten ist ebenfalls am selben Token gefenced. Preview-Status bleibt separat. Keine neue Rostergrenze, kein zusätzlicher Polling-Aufruf. Bei belegtem Lockverlust kein 200. Separate Domänenwrites können bei Ausfällen teilweise persistiert sein; atomare Transaktions-/Recovery- und Monotonieprüfung folgt F03/F14/F18. Historische Verluste können nicht aus dem Code rekonstruiert werden.

Regression: scripts/test-audit-p0.mjs enthält isolierte, aus Codex F02 abgeleitete deterministische Interleavings, Konflikt, unbekannte Identität und Lockverlust sowie private Archivoptionen. Keine echten Providerzugriffe. Nach CI unabhängige Codex-Gegenprüfung vor regulärer Freigabe.

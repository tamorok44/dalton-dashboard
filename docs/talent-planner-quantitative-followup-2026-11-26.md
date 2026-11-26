# Fachliche Nachprüfung 26.11.2026 — Build 1.60.1.71139

Status: research, not blanket approval. Independent path replay: 84 paths, 4284 allocations, 1512 calendar scenarios; 83 paths valid on raw snapshot, 84 with diagnostic Hunter correction. 85 distinct detailed profiles. 33 paths use at least one of 12 outstanding quantitative talent values; 51 do not, 37 of those lack editorial approval. A structural pass is not an editorial or live-server pass.

## Quantitative follow-up

The following references were checked for the remaining 12 talent discrepancies. The observed values are leads only, not released server constants; older builds, tooltip rounding, different character scaling and unversioned videos cannot resolve them.

| Talent ID | Talent | Research disposition |
|---|---|---|
| 105935 | Piercing Howl | Range, slowdown, duration: tooltip and unversioned footage; current server value not confirmed. |
| 105702 | Vindication | Build-labelled talent references exist; exact attack-power scaling not established. |
| 105696 | Seal of Command | Tooltip damage range and weapon contribution found; server formula and rounding unresolved. |
| 104966 | Summon Hawk | Older client coefficient and shared cooldown information; Nov 25 hotfix affects targeting, dismissal and critical strikes; retest required. |
| 105735 | Riposte | Reported duration and older footage; exact current effect unresolved. |
| 105709 | Mutilate | Older build reports 39.6 per weapon; current rounding unresolved. |
| 110866 | Death Mark | Damage-storage and cap mechanics described; current coefficient unresolved. |
| 105840 | Divine Aegis | Older client cap and percentages; current cap/scaling unresolved. |
| 105851 | Prayer of Mending | Older client base heal and healing-power coefficient; current scaling unresolved. |
| 105762 | Ice Barrier | Older client base absorb/coefficient; current absorb and related interactions unresolved. |
| 105896 | Demonic Brand | Older formula and hit counts; current damage calculation unresolved. |
| 105909 | Wrack | Tooltip base damage and periodic effect acceleration; server scaling unresolved. |

Official hotfix: https://news.blizzard.com/en-us/article/24315281/wow-forever-hotfixes-november-25-2026
The qualitative plan reasons do not assert the disputed numeric constants. Do not convert these leads into production evidence without an exact-build source or a controlled client measurement.

## Specialization advice
Mixed PvP progression: Enhancement versus Elemental reviewed against Skill Capped (Nov 19) and WoW Forever DB (Nov 25, builds 71037–71139), with Enhancement a scoped progression default, not universal PvP superiority. Exact existing plan versions and editorial evidence are bound in the release catalog. Sources:
- https://www.skill-capped.com/wowarticles/forever/guides/enhancement-shaman-pvp-guide/
- https://wowfdb.com/classes/shaman/enhancement/pvp/

Dungeon comparison remains open: endgame builds or older coefficients cannot alone establish a progression preference.

## Remaining release conditions
Confirm effective talent level gates for Legacy ranks 1–5 on current client, resolve Hunter prerequisite conflict, confirm quantitative effects, review remaining paths individually, bind complete specialization comparisons to resolved current options, complete browser/device and live preview checks. Do not merge or deploy a full release on the basis of diagnostic fixture tests.

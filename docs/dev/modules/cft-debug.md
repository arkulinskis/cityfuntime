# cft-debug.js — the ?debug=1 play-test panel

| At a glance | |
|---|---|
| File | `theme/assets/cft-debug.js` (135 lines) |
| Global exported | `window.CFTDebug = { attach, enabled }` (line 134) |
| How created | `if (window.CFTDebug) G.debug = window.CFTDebug.attach(G)` in `cft-game.js` (~2275), after the other modules; `attach` returns `null` when debug is off. `G.debug.destroy()` on teardown (~2335) |
| Switch | URL `?debug=1` stores `localStorage['cityfuntime.debug'] = '1'` (remembered in this browser); `?debug=0` removes it |
| Who calls it | cft-game only. `G.debugGod` (set by the panel) is read in cft-fun `F.hurt` (~579: no damage) |
| Test flags | none; herotest.js (~245-258) sets the localStorage key and calls `CFTDebug.attach(G)` directly |
| Tests | `python -I tools/live/game_test.py --hero` ("the 🐞 play-test panel appears with ?debug=1") |
| Styles | app.css block `/* ===== the play-test panel (cft-debug.js, only with ?debug=1) =====` (~870-881): `.cft-dbg-btn` (z 6), `.cft-dbg` (z 30) |

## 1. Responsibilities

Does:
- Adds a 🐞 button to the game shell (`U.canvas.parentElement`) and a panel (toggle with the button or the backquote key) with one-click actions that jump to test situations.
- "📋 Copy note info": copies a text block describing where you are and what is happening, to paste next to a note in `PLAYTEST.md`.

Does NOT:
- Ship any behaviour for normal players (off unless the key is set).
- Protect the save: actions change it directly ("Changes your save" is printed in the panel).

## 2. Public API

| Name | Signature | What it does |
|---|---|---|
| `CFTDebug.enabled()` | `-> bool` | Reads/writes the `debug` query param into localStorage, returns whether debug is on |
| `CFTDebug.attach(G)` | `-> Dbg or null` | Builds the button + key handler |
| `Dbg.info()` | `-> string` | The note text |
| `Dbg.open()` / `Dbg.close()` | | Toggle / close the panel |
| `Dbg.destroy()` | | Removes the key listener, panel and button |

## 3. Internal structure

| Lines | Part |
|---|---|
| 10-19 | `KEY`, `enabled()` |
| 21-30 | `attach`: helpers `near`, `goTo` (teleport near a point via `W.nearestWalk`), `facing`, `dayKinds`, `spawnAhead`, `story()` (marks mission `c1-couch` done so story systems run) |
| 32-82 | `ACTIONS`: groups of `[label, fn]` |
| 84-100 | `info()` |
| 102-131 | Button, `open`/`close`, delegated click handler, backquote key |

`ACTIONS` groups: **Time** (8:00, 12:00, 19:00, 23:00), **You** (+$500, level up, full health + energy, god mode `G.debugGod`, skip the first mission), **Fights** (a figment, champion pack, one winding up, clear figments), **Hype** (fill swagger, compliment, fan, gift, cycle hype setting), **Chaos** (all ranged weapons into slot 5 + ammo, jetpack, glide-brella, shooter figments, brainrot, toys, chaos event), **Campaign** (skip the opening, MEGA, fire, storm, refill ammo/powers, mark next mission done, nearest secret), **Go to** (Tom Hearton's, grocery, metro, mission person, parked car, home).

`info()` lines: build version (from the `cft-game.js` asset meta `v=`), time; lat/lon + street + nearest place within 60 m; day/time, level, money, hp, energy; ride, quality, hype, swagger; active missions with step + tracked; figments within 40 m (`*` champ, `@outpost`, `@guard`), smash count, outposts freed; chaos state; screen size, touch, user agent.

## 4. Key state

`panel` (element or null), the button, `G.debugGod`, the localStorage key.

## 5. Flow

`attach` -> button appended -> click/backquote -> `open()` builds the panel from `ACTIONS` (`data-a="group:index"`) and fills the textarea with `info()`. A click runs the action inside `try/catch` (errors become a toast), then `G.dirty()` and refreshes the info. Panel `keydown` events are stopped so typing/keys there do not drive the game.

## 6. Tunables / data read

`D.MONSTERS` (`w`, `boss`, `night`), `D.ITEMS` (`weapon.ranged`), `D.CHAOS.BRAINROT`, `D.EVENTS` (`chaos`), `D.MISSIONS`, `D.CAST`. Calls into `G.fun`, `G.hero.test`, `G.chaos`, `G.camp` (+ `G.camp.test.startStorm`), `G.aim`, `W.places`, `W.borrowable`, `W.teleport`.

## 7. How to test

- Manual: `python -I tools/live/harness.py` -> http://localhost:8772/?debug=1 (or the live app URL + `?debug=1`). Press the backquote key or click 🐞.
- Automated: `python -I tools/live/game_test.py --hero`.

## 8. How to modify safely

**Add an action:** append `['🧪 Label', () => { story(); ... }]` to the right group in `ACTIONS` (or a new `[groupName, [...]]`). Guard optional modules (`if (!G.camp) return;`), use `U.toast('🐞 ...')` for feedback, call `story()` if the system only runs after the first mission. The panel calls `G.dirty()` for you.

**Add a line to the note info:** extend the array in `info()`; keep it one line per topic and robust to missing modules.

Pitfalls: keep everything behind `enabled()`; never reference debug state from game code except `G.debugGod`; remove any new listener in `destroy()`.

## 9. Review checklist for AI-made diffs

- [ ] Still returns `null` when debug is off; nothing new runs for normal players.
- [ ] Actions guard missing modules and do not throw on a fresh save.
- [ ] No secrets or personal data added to `info()` beyond what is listed.
- [ ] `--hero` passes.

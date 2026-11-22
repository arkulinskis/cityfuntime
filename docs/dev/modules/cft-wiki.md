# cft-wiki.js — Admin > Balance: the editable wiki of game numbers

| At a glance | |
|---|---|
| File | `theme/assets/cft-wiki.js` (338 lines) |
| Global exported | `window.CFTWiki = { mount }` (line 337) |
| How created | `CFTWiki.mount(root, {api})` -> `{destroy(), test}`. Mounted by `CFT.mountWiki(root)` in `theme/assets/cft-kit.js` (~85), which first loads `cft-content.js`, `cft-game.js`, `cft-wiki.js` (`CFT.wiki()`, ~83) and passes `api: CFT.api` |
| Who calls it | `client_code/cft.py` `mount_wiki(node)` (~69) <- `client_code/Pages/Admin/__init__.py` `_balance()` (~33) on the `#admin/balance` tab; `form_hide` destroys it. Local: `tools/live/harness.py` page with `?wiki=1` |
| Server side | `server_code/Balance.py`: `get_balance` (public), `admin_balance_get`, `admin_balance_save(values, note)`, `admin_balance_restore(index)` (admin only); app_settings keys `balance` and `balance_history` (12 kept) |
| Game side | `cft-game.js` ~112-127: `G.applyBalance()` applies published values + the localStorage draft; listens to the `storage` event |
| Data/formulas | `window.CFT_DATA` (`cft-content.js`): `D.calc` (~1957), `D.BAL_DEFAULTS`, `D.balancePath`, `D.balanceDefault`, `D.applyBalance` (~1984-2003) |
| Test flags | none in this file |
| Tests | `python -I tools/ui_test.py` (smoke.js ~95-100: tabs, figment table >= 15 rows, an edit shows "1 value changed"); `python -I tools/live/game_test.py --balance` (balancetest.js ~152-168: `applyBalance`, defaults, live draft via storage event) |

## 1. Responsibilities

Does:
- Shows the game's real numbers (from `CFT_DATA`) and derived tables computed with the game's own formulas (`D.calc.maxHp`, `dmgMul`, `scale`, `armorCut`, `xpAt`, `xpFor`), so it cannot drift from the game.
- Lets the admin edit any number path (`TUNE.combat.parry`, `MONSTERS.slime.hp`, `ITEMS.<id>.weapon.dmg`, ...) and recalculates instantly.
- Keeps edits in three places: the page's working copy (`edits`), a "Live test" draft in this browser's localStorage, and the published server copy.
- Publishes, reverts to published, resets to defaults, restores one of the last 12 published versions.

Does NOT:
- Change `cft-content.js`. Published overrides win over the file at game start; the file stays the default.
- Validate paths beyond what `D.balancePath` resolves; the server (`Balance.clean`) rejects bad paths/values (regex `^[A-Za-z_]\w*(\.\w+){1,5}$`, no `__`/`prototype`/`constructor`, finite, |v| <= 1e7, max 3000 values).
- Reach other players' open games live: the draft only reaches games in other tabs of the same browser.

## 2. Public API

| Name | Signature | What it does | Called by |
|---|---|---|---|
| `CFTWiki.mount(root, opts)` | `opts.api(name, args) -> Promise` | Renders the wiki into `root`, loads published values, returns a controller | `CFT.mountWiki` |
| `ctl.destroy()` | | Stops timers, empties `root` | `CFT.mountWiki` controller <- Admin `form_hide` |
| `ctl.test` | `{edits (getter), set(path, raw), draw(), ctx, VIEW, live (getter)}` | Hooks for tests | tests |

Server calls made: `admin_balance_get` (load), `admin_balance_save` (publish with a note from `window.prompt`), `admin_balance_restore` (history).

## 3. Internal structure

| Lines | Part |
|---|---|
| 1-15 | Header: purpose, the three storage places, sections |
| 18-25 | `KEY = 'cityfuntime.balance.draft'`, `esc`, rounding helpers `r0/r1/r2`, `LEVELS` (table rows), `SECTIONS` |
| 27-46 | `mount`: state (`sec`, `edits`, `published`, `info`, `live`, `saving`, `timer`, `ctx`), `def`, `cur`, `apply`, `readDraft`, `writeDraft`, `same`, root markup (`.wk`, `.wk-bar`, `.wk-nav`, `.wk-body`) |
| 48-60 | `drawBar`: status, "Live test in my game" checkbox, Open the game, Back to published, All defaults, Publish |
| 62-74 | Number boxes: `num(path, o)` (`<input data-path>`, changed = `.chg` + "was" + ↺ `data-reset`), `tip`, `h2`, `knobRow(path, label, note, unit)` |
| 76-99 | Helpers on game formulas: `meleeIds`, `shooterIds`, `weaponOf`, `weaponName`, `hitDmg`, `gearRatio`, `foe(kind, L, lvl, w)`, `ordinary`, `avgXp`, `missionXp`, `ctxBar` ("what if" inputs: level, fitness, armour, damage bonus %, weapon) |
| 101-259 | Sections (`VIEW.*`) |
| 261-264 | `historyHtml` (published versions, `data-restore`) |
| 266-316 | `draw(keepFocus)` (re-applies `edits`, re-renders, restores focus/caret), `changed`, `setValue`, `input`/`change`/`click` listeners |
| 317-330 | `load(quiet)` and the start-up IIFE (adopts an unpublished live draft if one exists) |

### Sections (`SECTIONS`, `VIEW.*`)

| id | Tab | Function (line) | Shows / edits |
|---|---|---|---|
| `how` | 📖 How it works | `VIEW.how` (103) | Explanation cards + `historyHtml()` |
| `you` | 🧑 You, level by level | `VIEW.you` (113) | Table per `LEVELS`: XP, HP, your hit, slime/brute hits, survive, figments/missions to level; knobs `TUNE.player.*`, `TUNE.monsters.*`, `SLAP.dmg` |
| `figments` | 👾 Figments | `VIEW.figments` (150) | Every `D.MONSTERS` kind: base `hp/atk/speed/xp/w` + weakness per `D.DMG_TYPES`, computed columns, notes; fighting knobs `TUNE.combat.*`, `TUNE.monsters.*`, `TUNE.chaos.enemyShots` |
| `bosses` | 👑 Bosses | `VIEW.bosses` (176) | Champions, metro guardians (`D.GUARDIANS`, `TUNE.bosses.guard*`), rares (`D.RPG.RARES`, `TUNE.bosses.rare*`), MEGA figments (`D.CAMPAIGN.MEGA`, `TUNE.camp.mega*`), outposts (`TUNE.outposts.*`, `OUTPOSTS.<k>.bonus/cap`) |
| `weapons` | 🏏 Weapons | `VIEW.weapons` (201) | Bonk weapons (`ITEMS.<id>.weapon.dmg/add/reach/arc/cd/hits/knock/stun/crit/def/block`, `SLAP.*`), shooters (`rate/ammo/pellets/splash/speed`), ammo knobs |
| `powers` | ⚡ Powers | `VIEW.powers` (227) | Water, lightning, fire/extinguisher, web, moving (`WALK.*`, `TUNE.wild.*`, `TUNE.hype.main*`) |
| `colour` | 🎨 Colour blocks | `VIEW.colour` (234) | `TUNE.color.*` |
| `knobs` | 🎛️ All knobs | `VIEW.knobs` (245) | Every number in `D.TUNE` (walks objects to depth 5, arrays by index), grouped in `<details>` |

(The header comment lists 7 sections; `colour` was added later.)

## 4. Key state

| State | Meaning |
|---|---|
| `edits` | `{path: number}` working copy; a value equal to the default is deleted |
| `published` | Last loaded server values |
| `info` | `admin_balance_get` result (`updated`, `by`, `note`, `history`) |
| `live` | Live-test checkbox; when on, `writeDraft` stores `{on: true, values: edits, t}` under `cityfuntime.balance.draft`, else removes the key |
| `ctx` | "What if" inputs `{L, fit, armor, weapon, gear}` (not saved) |
| `sec` | Current tab |
| `timer` | 350 ms debounce for redraw after typing |

## 5. Flows

**Start:** `load()` -> `published`. If a draft exists with `on` and differs from published, the wiki resumes it (`edits = draft`, `live = true`); else `edits = published`. `D.applyBalance({})` resets the page's data to defaults, then `draw()` applies `edits`.

**Edit:** `input` on `[data-path]` -> `setValue` (parses `,` as `.`; ignores non-finite) -> `changed()` (writes the draft if live, redraws after 350 ms keeping focus and caret). Every `draw()` calls `D.applyBalance(edits)`, which first restores previous overrides from `D.BAL_DEFAULTS`, so the derived tables always reflect exactly `edits`.

**Live test:** the wiki writes localStorage; a game in another tab of the same browser gets a `storage` event (`cft-game.js` `onBalance`) -> `G.applyBalance()` = `D.applyBalance({...published, ...draft})` and a toast "⚖️ Balance draft updated (n changed values)". New figments use the new numbers; some world settings need a reload.

**Publish:** `window.prompt` for a note -> `api('admin_balance_save', [edits, note])` -> server cleans values, pushes the old record into history (max 12), saves `{values, updated, by, note}` -> wiki reloads `info`. Every new game fetches `get_balance` through `CFT.balance()` (failures = defaults, never block the game).

**Restore:** `api('admin_balance_restore', [index])` republishes a history entry (with note "Restored the version from ...").

## 6. Tunables / data read from CFT_DATA

Everything: `D.TUNE.*`, `D.MONSTERS`, `D.ITEMS[*].weapon`, `D.SLAP`, `D.WALK`, `D.GUARDIANS`, `D.RPG.RARES`, `D.CAMPAIGN.MEGA`, `D.OUTPOSTS`, `D.DMG_TYPES`, `D.MISSIONS` (average mission XP), `D.calc.*`. Display scale: player health and hits taken are HUD numbers; your hits and figment health are pop-up numbers (stored value x 10); boxes always hold the stored value.

## 7. How to test

- `python -I tools/live/harness.py` then open http://localhost:8772/?wiki=1 (the page fakes the server: published values live in the page).
- `python -I tools/ui_test.py` (Docker; smoke.js checks `#admin/balance` as admin) and `--shots DIR` for desktop/phone pictures.
- `python -I tools/live/game_test.py --balance` for the game side (overrides + live draft).
- Server unit tests: `python tools/check.py` (runs tools/testing server tests).

## 8. How to modify safely

**Add a wiki view (tab)**
1. Add `['myid', '🧪', 'My tab']` to `SECTIONS` (line ~24).
2. Add `VIEW.myid = () => h2(...) + ...` built from `knobRow(path, label, note, unit)` and `num(path)`; compute derived columns with `D.calc` or the helpers (`foe`, `hitDmg`), never with copied formulas.
3. Style with existing `.wk-*` classes (app.css block "Admin > Balance", ~1544).
4. Extend smoke.js if the tab matters (`.wk-tab` count check is `>= 6`).

**Show a new game number:** first add it to `D.TUNE` (cft-content.js) and read it from there in the game; it then appears in "All knobs" automatically. Add a `knobRow` to a themed tab if it matters for balance. A new formula belongs in `D.calc` so both game and wiki use it.

Pitfalls:
- Paths must resolve with `D.balancePath` and pass the server regex (max 6 segments, word characters). Array items use the index (`TUNE.combat.wind.0`).
- `num()` shows `–` for non-numeric paths: a typo silently shows a dash.
- Escape labels and notes passed to `knobRow` if they contain content strings (labels are escaped; `note` is raw HTML by design: do not pass user text).
- The page's `D` is a separate copy from any running game; `draw()` mutates it via `applyBalance` (fine on the admin page, never mount the wiki inside a running game page).
- Inputs are compact on purpose: the CSS at ~1600 makes `.wk-num input` win over the app's 48 px form fields; keep touch targets reasonable on phones.
- `Publish` uses `window.prompt`/`confirm`/`alert` (native dialogs).

## 9. Review checklist for AI-made diffs

- [ ] New numbers live in `D.TUNE` / content tables, not hard-coded in the wiki or the game.
- [ ] Derived columns use `D.calc` (same formula as the game).
- [ ] Paths exist (open the tab: no `–` where a number is expected) and fit `Balance.PATH`.
- [ ] `edits` semantics kept: equal-to-default values removed; `applyBalance` called before rendering.
- [ ] Server functions keep `require_user=True` + `C.require_admin()`; `get_balance` stays numbers-only.
- [ ] smoke.js / balancetest.js still pass.

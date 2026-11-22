# Changing the code — workflow, and how to review AI-made changes

This page is for anyone (person or AI) changing City Fun Time, and for the person checking an AI's work. The goal is that a
change can be judged against written facts instead of trust.

## 1. The loop for any change

1. **Find the code without reading everything.**
   - `python -I tools/where.py <words>` → fix-index rows, definitions with exact line ranges, mentions.
   - `python -I tools/where.py --def <name>` / `--toc <file>` / `--tune <word>`.
   - Code graph (from the project root): `graphify query "<question>"`, `graphify explain "<name>"`,
     `graphify path "<A>" "<B>"`.
   - The module's page in [modules/](modules/) — sections "Public API", "Internal structure", "How to modify safely".
2. **Is it a number?** Most "too much / too often" notes are a `D.TUNE` knob → [balance.md](balance.md). Change the
   default in cft-content.js (or publish it from Admin > Balance) instead of writing code.
3. **Make the change** in the file the doc names. Follow the module's recipes and pitfalls.
4. **Run the narrowest test** for the area ([testing.md](testing.md) "Which test for which change"), then
   `python tools/check.py` (must end with `ALL CHECKS PASSED`). After editing `theme/assets/*`, run
   `python tools/assets.py` (check.py fails on stale hashes). After editing cft-content.js, also run
   `node tools/live/content_check.mjs` (not part of check.py).
5. **Update the docs in the same commit**: the module page(s) you touched, plus FIX_INDEX.md if a feature moved.
   `python -I tools/doc_check.py` must pass (check.py runs it).
6. **Ship** per [deploy.md](deploy.md); then refresh the code map and graph:
   `python -I C:/Users/arkvi/Documents/CLAUDE/APP_MAKER/standard/app_map.py cityfuntime` and
   `C:/Users/arkvi/AppData/Roaming/uv/tools/graphifyy/Scripts/python.exe C:/Users/arkvi/Documents/CLAUDE/APP_MAKER/tools/graphify_apps.py cityfuntime`.

## 2. Rules that keep the engine healthy

- **One file, one global, no build step.** New engine files must be registered in three places (cft-kit `ALL`,
  `ENGINE` in `tools/live/harness.py`, a `cft-asset` meta in `anvil.yaml`) — see [architecture.md](architecture.md).
- **Data in cft-content.js, behaviour in modules.** New numbers go in `D` (ideally `D.TUNE`) so Admin > Balance can
  change them. Overrides only reach values that already exist and are numbers.
- **Saves are forever.** New fields: default in `newSave`, tolerate missing in `migrate` or the module's `st()`. Never
  rename or repurpose an existing field. Keep the save under 400,000 characters.
- **World hooks have one slot.** If you set a `W.on*` hook another module already uses, wrap the old value.
- **Guard cross-module calls** (`G.rpg && G.rpg.bonus(...)`): modules can be missing (tests, `G.fun` failing).
- **Respect pause.** Ticks receive `paused`; do nothing that moves the game while an overlay is open (`U.isOpen()`).
  Note `rt.t` still advances while paused.
- **three.js r149 rules** (from [modules/cft-world.md](modules/cft-world.md)): new world materials must go through
  `greyify` (colour blocks); tinted and untinted InstancedMeshes need separate materials; dispose what you create except
  `SHARED` geometries; shader patches need a `customProgramCacheKey`.
- **HTML from data is escaped** with the module's `esc` helper.
- **Mission text changes silence the voice line** until `tools/voice_missions.py` is rerun and uploaded
  ([modules/cft-cine.md](modules/cft-cine.md)). Never hand-edit cft-vo.js.
- **Server duplicates:** business costs and apartment values also live in `server_code/Game.py` (`BIZ_COST`,
  `APT_VALUE`); level maths falls back to hard-coded 60 / 1.8 in both cft-game.js and `Game.level_of`.
- **Add a test flag, not a test-only branch.** Tests drive the game through `window.CFT_TEST` and `G.stepSim`.

## 3. Reviewing an AI-made change

Ask the AI for: the list of files changed, the tests it ran with their last output line, and which doc pages it updated.
Then check:

### A. Facts (automatic)
- [ ] `python tools/check.py` ends with `ALL CHECKS PASSED` (includes anvil validate, `node --check`, asset hashes,
      server tests, doc check).
- [ ] Content touched → `node tools/live/content_check.mjs` prints `CONTENT OK (<n> missions)`.
- [ ] The narrow live test for the area passes (`python -I tools/live/game_test.py --<flag>`), and screenshots look right.
- [ ] `python -I tools/doc_check.py --lines` passes; line-drift warnings are advisory (hints often point at a call
      site in another file), but a big drift on a function the change touched means the doc wasn't updated.

### B. Fit (read the diff against the docs)
- [ ] The change is in the module that owns the behaviour ("Responsibilities / does NOT do" on each module page).
- [ ] Every function, `D.*` table, `W.*` hook or `G.*` method it calls exists — `python -I tools/where.py --def <name>`.
      Invented APIs are the most common AI error.
- [ ] New numbers are in `D` / `D.TUNE`, not hard-coded.
- [ ] New save fields have defaults and survive an old save.
- [ ] New data entries match the schema in [modules/cft-content.md](modules/cft-content.md) (ids unique, references
      resolve, mission `ch` exists in `D.CHAPTERS`, `req` uses only keys `reqMet` reads: `m`, `lvl`, `partner`,
      `married`, `kids`, `stat`; new `count` keys are actually bumped in code).
- [ ] World hooks are wrapped, not overwritten; cross-module calls are guarded.
- [ ] Pause, low quality (`!W.renderer.shadowMap.enabled`) and touch/mobile are handled like neighbouring code.
- [ ] Nothing leaks per frame (no new geometry/material/DOM per tick, no listeners added without removal in `destroy`).
- [ ] The module page's "Review checklist" section is satisfied (each page has one).

### C. Truth
- [ ] The AI's summary matches the diff (no claimed test that wasn't run, no "fixed" without a test or screenshot).
- [ ] Docs were updated where behaviour changed, and say *what the code does*, not what was intended.

## 4. Known issues found while writing these docs (2026-11-22)

Real code/doc mismatches the doc writers found. None was fixed; each is recorded on its module page.

| Where | Issue |
|---|---|
| cft-fun.js `strike` + cft-color.js `checkDone` | both bump `save.counters.blocks`, so restoring a colour block advances the "Block 3 attacks" mission step |
| cft-game.js `addXp` | rested XP is spent by `'explore'` XP too; the cft-rpg.js header says only monster/pickup/job XP |
| cft-camp.js | `D.TUNE.camp.foamPick` is unused; the `[data-boss]` HUD bar is always hidden (MEGA info is on name plates) |
| cft-wild.js | `D.TUNE.wild.airAim` is unused (`airAimCost` is what's read) |
| cft-hero.js | header names `H.interaction`, which doesn't exist; swagger bar uses hard-coded `mainT / 25` instead of `TH.mainSecs` |
| cft-game.js | pickups without XP do `save.xp += 1` with no level-up check |
| cft-content.js | `D.PED_TIPS` is never read; the mission comment lists `req` keys (`apt`, `friends`, `turf`, `biz`, `own`) that `reqMet` ignores; content_check doesn't verify mission chapters or counters |
| cft-world.js | reads hooks no module sets (`W.onPlace`, `W.onHonk`, `W.onBirds`, `W.lifeMul`, `W.onJump2`, `W.wantLock`); cft-chaos reads `W.MAT_VC`, which isn't exported (it has a fallback) |
| server_code/Game.py | net worth uses hard-coded `BIZ_COST` / `APT_VALUE`, so balance overrides don't reach the leaderboard |
| SKILL.md | older numbers (night/day spawns, keys 1–4, the `ALL` list, `.cft-boss` bar) are out of date; these docs follow the code |
| FIX_INDEX.md | says the no-flag `game_test` run is 5 scripts; it is 14 |
| session_guard.py, build_icons.py docstrings | name files that don't exist (`tools/ui/session.js`, `lh-kit.js`) <!-- doc-check: skip --> |
| check.py | doesn't run `tools/testing/test_app_status.py` or `content_check.mjs` |

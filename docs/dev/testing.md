# Testing City Fun Time

Five layers, from cheapest to most expensive. Pick the narrowest one that covers your change (table in section 9), then
run `python tools/check.py` before every push. Related pages: [anvil-client.md](anvil-client.md), [server.md](server.md),
[deploy.md](deploy.md).

| Layer | Command | Needs | Time | Pass line |
|---|---|---|---|---|
| Content references | `node tools/live/content_check.mjs` | Node | ~1 s | `CONTENT OK (<n> missions)` |
| Static + server gate | `python tools/check.py` | Python + PyYAML, Node, Anvil CLI | ~1 min | `ALL CHECKS PASSED` |
| Real Anvil pages | `python -I tools/ui_test.py` | Docker Desktop, Chrome | ~5 min | `ALL UI TESTS PASSED` |
| Expired session | `python -I tools/session_test.py` | Docker Desktop, Chrome | ~3 min | `SESSION TEST PASSED` |
| The 3D game | `python -I tools/live/game_test.py [--flag] [OUTDIR]` | Chrome, internet (real map tiles) | 1-3 min per flag, much longer for the full run | `GAME TEST PASSED (<n> checks)` |

## 1. Prerequisites

- **Python 3.11+** (this PC: 3.11.9) with **PyYAML** for `tools/check.py`, `tools/assets.py` and the server tests. Run those
  **without `-I`** (they need user site-packages for PyYAML). Pillow for `tools/ground_textures.py`. Everything else runs
  with `python -I`.
- **Node.js 22+** (this PC: v22.14.0): `drive.mjs` / `gldrive.mjs` use the built-in `WebSocket` and `fetch`; `node --check`
  in check.py.
- **Anvil CLI** for `anvil validate`: found as `ANVIL_CLI`, `anvil` on PATH, or the vendored copy in
  C:/Users/arkvi/Documents/CLAUDE/APP_MAKER/vendor/anvil-cli; otherwise check.py falls back to `npx @anvil-works/anvil-cli@0.8.1`.
- **Google Chrome** at C:\Program Files\Google\Chrome\Application\chrome.exe (hard-coded in `tools/live/drive.mjs`,
  `tools/live/gldrive.mjs`, `tools/make_icons.py`).
- **Docker Desktop** running, for `tools/ui_test.py` and `tools/session_test.py` (image anvilworks/anvil-app-server 1.18.0).
- **axe-core** at `C:/Users/arkvi/Documents/CLAUDE/APP_MAKER/vendor/axe-core/axe.min.js` for the a11y run.
- **Internet** for `game_test.py` (OpenFreeMap + Mapterhorn tiles, Google Fonts).

## 2. `tools/check.py`: the gate before every push

`python tools/check.py` (add `--ui` to also run `tools/ui_test.py` at the end). Steps, in order:

1. **`anvil validate .`**: `anvil.yaml`, every form template and every client/server Python file, type-checked against
   Anvil's API stubs (timeout 900 s). Problems in the kit files `seo_routes.py` and `legal_server.py` (`KIT_FILES`) are
   printed as a note but don't fail.
2. **No template placeholders left**: none of the double-underscore placeholder words (PREPSTO_CODE, APP_NAME, APP_KEY, PACKAGE, REPO) from the app template remain in
   `anvil.yaml`, `client_code` or `server_code`. ("FILL IN" left in README/SKILL is only printed.)
3. **`node --check`** on every `theme/assets/*.js`.
4. **Asset hashes**: runs `tools/assets.py`. If it had to update `anvil.yaml` it still passes but prints
   "anvil.yaml was updated with new asset hashes: commit it". Commit that file.
5. **Server tests**: `tools/testing/test_server.py` must print `ALL OK`.
6. **Developer docs**: if `docs/dev` exists, `python -I tools/doc_check.py` must pass (every backticked name or path in
   `docs/dev/*.md` must exist in the code).
7. **Design check** (C:/Users/arkvi/Documents/CLAUDE/APP_MAKER/tools/design_check.py `--summary`): printed as a note, never fails.
8. With `--ui`: `tools/ui_test.py` (timeout 1800 s).

The last line is `ALL CHECKS PASSED` or `<n> PROBLEM(S): ...` (exit code 1). Only `ALL CHECKS PASSED` is a green light.

Not run by check.py: `tools/testing/test_app_status.py` (run it when AppStatus.py or AdminAccess.py change),
`tools/live/content_check.mjs`, `tools/ui_test.py` (unless `--ui`), `tools/session_test.py`, `tools/live/game_test.py`.

## 3. Server tests without Anvil (`tools/testing/`)

`python tools/testing/test_server.py` → `ALL OK (32 server functions)` or the first failing assertion.

How it works:
- Copies `server_code/` into a temp folder as package `app`, sets `ANVIL_APP_YAML` to the project's `anvil.yaml`, and puts
  `tools/testing/mock` first on `sys.path`, so `import anvil...` gets the **strict mock**:
  - `tools/testing/mock/anvil/server.py`: `@callable` registers into `CALLABLES` (name → (function, require_user)); `call(name, ...)`
    enforces `require_user`; `PermissionDenied`, `SessionExpiredError`, `http_endpoint` (`ENDPOINTS`), `route`, `session`
    per test user, `get_app_origin()` (default "https://app-test.anvil.app").
  - `tools/testing/mock/anvil/tables/`: in-memory Data Tables whose schema comes from `anvil.yaml` `db_schema`: unknown columns and wrong
    types fail like they would live. `add_row`, `search` (+ `q.*`, `order_by`), `get`, `get_by_id`, links, media.
  - `tools/testing/mock/anvil/users.py` (`CURRENT`, login/signup), `tools/testing/mock/anvil/secrets.py` (`SECRETS`; the test sets `admin_emails` to
    admin@example.com), `tools/testing/mock/anvil/http.py` (no network: `REPLIES` maps URL prefixes to values or functions; `CALLS`
    records requests), `tools/testing/mock/anvil/email.py` (`OUTBOX`), `tools/testing/mock/anvil/tz.py`.
- Helpers in the test: `call(name, *args)` (also asserts the reply is JSON-serialisable), `as_user(row)`, `denied(name, ...)`
  (expects `PermissionDenied`), `ok(r)`, `bad(r)` (`{"ok": False, "error": ...}`), `person(email, ...)`.
- Sections: accounts, feedback, admin, demo data + saves + leaderboard, balance, map tile backup (fake tile server
  `fake_tiles`), Privacy & Terms, and a final **permission sweep**: every callable not in `PUBLIC` must be registered with
  `require_user=True`. `PUBLIC` = `log_client_error`, `session_ping`, `get_me`, `submit_feedback`, `leaderboard`,
  `legal_state`, `legal_accept`, `tile_archive`, `tile_backup`, `get_balance`.
- The line "tile t/15/1/2: HTTP 503" in the output is expected (the test simulates a map service that is down).

`python tools/testing/test_app_status.py` → `ALL OK`: the shared admin status report and the `admin_emails` rules
(self-contained, only `users` + `error_log`).

**New server function:** add its happy path, bad input and a not-allowed caller to `test_server.py`. A new table or column
needs no mock change (the mock reads `anvil.yaml`).

## 4. Real Anvil pages: `tools/ui_test.py` + `tools/ui/*.js`

Runs this folder in the open-source **Anvil App Server** in Docker and drives it with headless Chrome via
`tools/live/drive.mjs`.

```
python -I tools/ui_test.py                 smoke.js at 1280x1000 and 390x844 (the default run)
python -I tools/ui_test.py --only a11y.js  axe-core WCAG 2.2 AA + keyboard/screen-reader checks (desktop only)
python -I tools/ui_test.py --only design.js  rendered design check, desktop + phone
python -I tools/ui_test.py --shots DIR     also full-page screenshots: landing, auth (guest) and life, quests, profile
                                           (member, via seed.js), desktop + phone, light + dark
python -I tools/ui_test.py --restart       recreate the container (needed after server_code edits)
python -I tools/ui_test.py --stop          stop the container (alone: only stop; with others: stop afterwards)
```

- Container `cityfuntime-dev` on **http://localhost:3501** (port = 3100 + sum of the key's character codes mod 800),
  started with `--auto-migrate` (schema changes apply locally) and `--secret admin_emails=admin@example.com`. On a local
  origin, `AdminAccess.verified` treats every account as proven, so signing up as admin@example.com gives an admin.
- App files are **copied** into the Docker volume `cityfuntime-app` on every run (`copy_app`, parts in `APP_PARTS`). Client
  and theme edits apply on the next run; server edits need `--restart`. Accounts persist in volume `cityfuntime-data`
  (`docker volume rm cityfuntime-data` for a clean database).
- Each script is evaluated in the page after `window.UI_READY === true` and resolves to `{ok, log}`; ui_test.py fails on
  `ok: false`, a missing result, or any `[EXCEPTION]`, "Python exception" or "Error report" line in the browser log.
- Output: a temp folder `cityfuntime-ui-*` with one sub-folder per run (`smoke`, `smoke-phone`, ...) holding
  `steps-*.json`, log.txt, screenshots and a Chrome profile. The console prints each script's log.

| Script | What it checks |
|---|---|
| `tools/ui/smoke.js` | Every page address signed out, then as a new member, then as the admin; fails on an empty page, sideways scrolling or a missing piece. `#play` only has to mount the engine with every file. |
| `tools/ui/a11y.js` | axe-core on `PUBLIC` and `MEMBER` pages, light + dark ("serious"/"critical" fail); keyboard and screen-reader checks on the sign-in page and the Privacy & Terms dialog. The axe source is injected at the `/*AXE*/` marker by ui_test.py. |
| `tools/ui/design.js` | Bans (eyebrow labels, gradient text), fails (invisible content, sideways scroll), warnings (tiny text, long lines, small touch targets, `transition: all`). Master copy lives in APP_MAKER/design. |
| `tools/ui/seed.js` | Not a test: signs up a fresh account for member screenshots; sets `window.SEED`. |

The local App Server has no map tiles unless the browser has internet; the smoke test only needs the engine to mount.

## 5. Expired session: `tools/session_test.py`

`python -I tools/session_test.py [--restart]` reuses `ui_test.start()` (same container), then fakes an expired session by
corrupting `window.anvilSessionToken` and closing `window.anvilWebsocket`. Steps: sign up (seed.js), type into `#profile`;
idle tab + visibility change → quiet reload with the text kept and still signed in; same with a click; an uncaught expiry
while opening a page → quiet reload; an immediate second expiry → Anvil's own "Session Expired" box (no loop). Uses
`window.__sg` from `client_code/session_guard.py`. Output: `SESSION TEST PASSED` / `SESSION TEST FAILED (log: <dir>)`.
Run it after any change to `session_guard.py`, `KeepAlive.py`, `startup.py` or `auth.py`.

## 6. The 3D game: `tools/live/`

### 6a. The pieces

- **`tools/live/harness.py`**: a tiny HTTP server (default port 8772 when run alone; `game_test.py` picks a free port) that
  serves `theme/assets` under the same _/theme/ paths as Anvil and one page that loads `app.css`, `ark-music.js` and
  `cft-kit.js`, writes one `cft-asset` meta per engine file (`ENGINE`, same order as `ALL` in `cft-kit.js`) and mounts the
  game with `CFT.mountGame`. **No Anvil**: `window.CFT_HOST` is a fake that answers `tile_archive`, `tile_backup`,
  `get_balance`, `admin_balance_get`, `admin_balance_save` and returns `{ok: true}` for anything else (so the player is
  always a guest; `get_save`/`put_save` are not exercised). `window.HARNESS` records `calls` and `archived` tiles.
  Query flags: `?fresh=1` (delete the guest save), `?music=0`, `?wiki=1` (mount Admin > Balance instead of the game),
  plus `?nointro=1` (cft-game.js then skips the campaign opening). Run it by hand: `python -I tools/live/harness.py` → http://localhost:8772/.
- **`tools/live/gldrive.mjs`**: Chrome headless with SwiftShader (software WebGL: `--use-angle=swiftshader
  --enable-unsafe-swiftshader`), so the 3D canvas really draws. Runs a steps file:
  `[{wait: ms} | {eval: "js"} | {shot: "name", full: true} | {waitFor: "js expr", timeout: ms}]`, prints `[eval] <JSON>`,
  `[waitFor] ... -> ok|TIMEOUT`, `[shot] name`, console lines and `[EXCEPTION]`s, and writes log.txt + `<name>.png` into the
  output folder. Env: `WINDOW="w,h"`, `SCALE=2` (full-page shots at 2x), `CDP_PORT` (attach to a Chrome you started).
- **`tools/live/drive.mjs`**: the same driver without software WebGL (`--disable-gpu`); used by ui_test.py and
  session_test.py. Both drivers replace `$TEST_PASSWORD` in a steps file with the contents of an optional
  .test-account-password.txt next to them.
- **`tools/live/game_test.py`**: starts the harness, opens
  `http://127.0.0.1:<port>/?fresh=1&music=0&nointro=1` (+ `CFT_QS` from the environment), fills the start form (name
  "Tester", the first place = Montréal's Plateau), waits for `window.__cft.state() === 'play'`, then runs the chosen
  scripts or scenes through `gldrive.mjs` (`WINDOW` default 1280,800; overall timeout 3000 s).
- **`window.__cft`** = the running game `G` (set by `CFTGame.mount` in `cft-game.js`); tests reach everything from it:
  `G.W` (world), `G.ui`, `G.save`, `G.D` (content), `G.fun`, `G.rpg`, `G.hero`, `G.chaos`, `G.camp`, `G.wild`, `G.aim`,
  `G.stunt`, `G.color`, `G.cine`. Software WebGL draws 0.5-1.5 s per frame, so tests set `window.CFT_TEST = {norender: true}`
  and advance time with `G.stepSim(n)`.

### 6b. Every `game_test.py` flag

Test flags run one script after the start screen and print its PASS/FAIL lines; the run ends with
`GAME TEST PASSED (<n> checks)` or `GAME TEST FAILED (<n>)` (any line not starting with PASS or INFO counts as a failure, as do
`EXCEPTION`, `console.error`, `TIMEOUT`, `EVAL ERROR`, `driver error` lines). Every test run also saves start.png and
after.png.

| Flag | Script (done flag / results) | Exercises |
|---|---|---|
| (none) | all 14, in this order: `gametest.js`, `funtest.js`, `rpgtest.js`, `combattest.js`, `herotest.js`, `borotest.js`, `chaostest.js`, `camptest.js`, `wildtest.js`, `aimtest.js`, `stunttest.js`, `cinetest.js`, `balancetest.js`, `colortest.js` | everything below (FIX_INDEX.md still describes the full run as five scripts; it is fourteen) |
| `--fun` | `funtest.js` (`__funDone` / `__funOut`) | made-up shops + signs, traffic lights, street furniture, crowds, speed + double jump, monsters + weapons, jokes, flirting, sweethearts, street folk + the crown, pranks + chases, rival shopkeepers, peels, trampolines, street events, new missions, phone app |
| `--combat` | `combattest.js` (`__cmbDone` / `__cmbOut`) | 15 monster types, levels, champions, health/armour, healing, foe bar, blacking out, metro guardians, loot gear on you |
| `--rpg` | `rpgtest.js` (`__rpgDone` / `__rpgOut`) | loot + rarity, charms, pity timer, talents, rested XP, discovery + chests, reputation, achievements + titles, rares, reward choices |
| `--hero` | `herotest.js` (`__heroDone` / `__heroOut`) | walking speed, wind-up/block/parry/dodge, smashing, borrowed cars, outposts, hype + swagger, mission blips, shields, mystery missions |
| `--boro` | `borotest.js` (`__boroDone` / `__boroOut`) | borough names from the zoom-11 tile, looks, HUD chip, banners, discovery |
| `--chaos` | `chaostest.js` (`__chaosDone` / `__chaosOut`) | decor, mayhem meter, ranged weapons + figments, jetpack/glide, fart button, the Dex, toys, chaos events, hit-stop, Chaos app |
| `--camp` | `camptest.js` (`__campDone` / `__campOut`) | HUD + map size, crazy list + mission cap, the immortal opening, ammo, powers, fire, storms, MEGA figments, secrets, bouncy world |
| `--wild` | `wildtest.js` (`__wildDone` / `__wildOut`) | four-corner HUD, pavement footing, climbing + stamina, umbrella + updrafts, perfect dodge + flurry, air slow-mo, chemistry, antennas |
| `--aim` | `aimtest.js` (`__aimDone` / `__aimOut`) | right-mouse sight, slots 1-4, the web, weapon reach + arcs, gabled roofs, scaling figments, no level cap, rainbow guides, Dex gallery |
| `--stunt` | `stunttest.js` (`__stuntDone` / `__stuntOut`) | courses popping up in a car, boost, ramps, ring of fire, flips, rolls, wipeout, hop, fire alley, Stunts app |
| `--cine` | `cinetest.js` (`__cineDone` / `__cineOut`) | every mission line voiced, intro as a scene, chapter + title cards, subtitles, skip, phone calls, MISSION COMPLETE, the setting |
| `--balance` | `balancetest.js` (`__balDone` / `__balOut`) | slot 5 shooter belt + wheel, shooters in town, bonk reach on the ground, weaknesses, balance overrides + live draft, feet on roads, daylight |
| `--color` | `colortest.js` (`__colDone` / `__colOut`) | 2 km colour blocks (rendered grey vs colour), three layers, BLOCK RESTORED, chip + phone app, name plates, looking up, weapon numbers, raised reach arc |

`gametest.js` (`__cftDone` / `__cftOut`) has no flag of its own; it runs only in the full run: missions by talking to
people, coins, a café, a delivery to a real house number, race, chase, escort, shopping, a business + rush hour, moving
house, a new day, a turf takeover, minigames, every phone app.

Screenshot flags (no checks; exit code 1 only if a step failed). Pictures land in OUTDIR as `<name>.png`:

| Flag | Pictures |
|---|---|
| `--shots` | `1-street`, `2-shop-sign`, `3-traffic-light`, `4-street-folk`, `5-phone`, `6-ufo`, `7-night-monsters`, `8-night-street`, `9-dusk-wide` |
| `--people` | `p1-you`, `p2-lineup`, `p3-walkers`, `p4-cast`, `p5-look-editor`, `p6-run` |
| `--models` | `m1-faces`, `m2-silly`, `m3-cars`, `m4-big-and-silly`, `m5-trees`, `m6-animals`, `m7-street` |
| `--long` | `l1-character`, `l2-talents`, `l3-reputation`, `l4-achievements`, `l5-legendary`, `l6-rare`, `l7-levelup` |
| `--monsters` | `c1-lineup`, `c2-guardian`, `c3-fight`, `c4-gear`, `c5-character` |
| `--heroshots` | `h1-street`, `h2-parry`, `h3-hype`, `h4-outpost`, `h5-wreck`, `h6-blips`, `h7-night`, `h8-phone` |
| `--ground` | `g1-pavement`, `g2-road-above`, `g3-lawn`, `g4-plaza`, `g5-wood-sand`, `g6-overview`, `g7-dusk`, `g8-street-name`, `g9-house-numbers` |
| `--gfx` | `g1-street`, `g2-facade`, `g3-facade-angle`, `g4-roofs`, `g5-cars`, `g6-you`, `g7-dusk`, `g8-night`, `g9-figments` (set `CFT_QS="&nopost=1"` to compare without post-processing) |
| `--chaosshots` | `c1-street` … `c9-night` (street, park, dex, toys, sky, jetpack, fight, phone, night) |
| `--campshots` | `k1-hud`, `k2-opening`, `k3-mega`, `k4-fire`, `k5-secret`, `k6-roof`, `k7-phone` |
| `--aimshots` | `a1-sight-web`, `a2-web-pull`, `a3-swing-360`, `a4-rainbow-guide`, `a5-dex` |
| `--stuntshots` | `s1-pop-up`, `s2-ring-of-fire`, `s3-backflip`, `s4-mega`, `s5-fire-alley`, `s6-phone` |
| `--cineshots` | `c0-setup`, `c1-chapter-card`, `c2-title-card`, `c3-close-up`, `c4-over-the-shoulder`, `c5-third-shot`, `c6-setup`, `c6-phone-call`, `c7-setup`, `c7-outro-line`, `c8-mission-complete` |
| `--boroshots` | `b1-home`, `b2-next`, `b3-next-above`, `b4-third`, `b5-map` |
| `--eval FILE.js` | runs your script after the start screen, prints what it returns, saves eval.png |

Only one mode runs per invocation; screenshot flags are checked before test flags (`--eval` first of all). OUTDIR defaults to
a new temp folder `cft-game-*`; it also gets steps.json, log.txt (the full browser log) and a Chrome `profile` folder.
The last printed line before the verdict is `screenshots: <OUTDIR>`. Read the PNGs to judge visual changes.

### 6c. `tools/live/content_check.mjs`

`node tools/live/content_check.mjs` loads `theme/assets/cft-content.js` in Node (`window.CFT_DATA`) and checks: unique mission
ids, every mission's requirements, givers, items, place kinds, pickups, rewards, quizzes, step types (`DOS`), counters
(`COUNTERS`), weapon meshes, ranged weapons/monsters (known projectile), Dex creatures, sticker sets of 6, and that every
mission can be unlocked (walks the requirement graph). Prints `CONTENT OK (184 missions)` today, or the problems and
`<n> PROBLEM(S)` with exit code 1. When you add a mesh, event, counter or step type, add its name to the matching list in
this file too.

### 6d. `?debug=1` (manual play-testing)

`theme/assets/cft-debug.js` (`CFTDebug.attach(G)`, attached as `G.debug`) is off for everyone unless the address has
`?debug=1` (remembered in localStorage `cityfuntime.debug`; `?debug=0` turns it off). Example:
https://city-fun-time.anvil.app/?debug=1#play. A bug button (or the backquote key) opens a panel: time of day, money, level,
god mode (`G.debugGod`), spawn figments, swagger, fans/gifts, jumps to outposts/metro/mission people/cars/home, and
"Copy note info" (`info()`) to paste into `PLAYTEST.md`. It also works in the harness.

## 7. Writing a new live test

Copy the pattern every `*test.js` uses (for example `tools/live/borotest.js`, the shortest):

```js
// What this covers (date), run inside the game page by tools/live/game_test.py (--mything, and last in the full run).
// Results in window.__myOut, done flag window.__myDone.
window.__myOut = []; window.__myDone = false;
(async () => {
  const out = window.__myOut, T0 = Date.now();
  const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m + '  [' + Math.round((Date.now() - T0) / 1000) + 's]');
  const info = m => out.push('INFO ' + m);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const G = window.__cft, W = G.W, U = G.ui, s = G.save, D = G.D;
  const sim = n => G.stepSim(n);
  window.CFT_TEST = Object.assign(window.CFT_TEST || {}, { norender: true, calm: true });  // step without drawing
  try {
    U.closeAll();
    // arrange: change the save / teleport (W.teleport) / spawn things
    sim(30);                                     // advance time
    ok(/* condition */ true, 'what should be true');
  } catch (e) { ok(false, 'exception: ' + (e && e.stack || e)); }
  window.__myDone = true;
})();
```

Then wire it into `tools/live/game_test.py`: add a branch next to the others,
`steps += script("mytest.js", "__myDone", "__myOut", 600000)` under a new `--mything` flag, append it to the full run list,
and add a line to the module docstring. Rules from the existing tests (see "Gotchas" in `.claude/skills/cityfuntime/SKILL.md`):
never `await` a game action that opens a dialog (start it, then drain); set `W.controls.enabled` yourself before pressing keys;
finished odd jobs are deleted from `save.m` (test `!s.m[id]`); keep results ASCII-friendly. For a one-off probe, write a
script that returns a value and run `python -I tools/live/game_test.py --eval probe.js OUTDIR`.

## 8. Asset and content tools

| Tool | Command | When |
|---|---|---|
| `tools/assets.py` | `python tools/assets.py` (no `-I`: PyYAML) | **After any edit in `theme/assets`.** Runs `tools/build_icons.py`, then rewrites every `_/theme/<file>?v=<hash>` in `anvil.yaml` → `native_deps.head_html` with the first 10 hex chars of the file's SHA-1 (this includes the `cft-asset` metas the engine loader reads). Fails if head_html names a file that doesn't exist. Prints "asset hashes updated" or "already current". Without it browsers keep the old cached file. |
| `tools/build_icons.py` | `python -I tools/build_icons.py` | Rebuilds `theme/assets/icons.css` from `UI.ICONS` in `theme/assets/app-kit.js` (its docstring says lh-kit.js; the code reads app-kit.js). Run by assets.py. |
| `tools/make_icons.py` | `python -I tools/make_icons.py [--bg "#ffffff"]` | After `theme/assets/icon.svg` changes: writes `icon-512.png` and `icon-180.png` with headless Chrome. |
| `tools/where.py` | `python -I tools/where.py <words>`, `--def <names>`, `--toc <file>`, `--tune <word>` | Find exact line ranges in the engine, client and server code and `FIX_INDEX.md` before reading. |
| `tools/voice_missions.py` | `python tools/voice_missions.py` (`--list`, `--only max,rosa`, `--force`) | After mission dialogue changes: renders new/changed lines with Kokoro on the local GPU (lines from `node tools/vo_lines.mjs`), writes `theme/assets/cft-vo.js` (never edit by hand) and MP3s into APP_MAKER/media/public/vo/cft. Then upload with `python -I C:/Users/arkvi/Documents/CLAUDE/APP_MAKER/media/r2_deploy.py`, run `python tools/assets.py`, commit, push. |
| `tools/vo_lines.mjs` | `node tools/vo_lines.mjs` | Prints every spoken line as JSON (`key`, `speaker`, `say`); used by voice_missions.py. |
| `tools/monster_models.py` | `python -I tools/monster_models.py <pack folder>` | Repacks the Quaternius figment models into `theme/assets/mon-*.glb`. Its docstring says assets.py is not needed afterwards (models are fetched by name). |
| `tools/ground_textures.py` | `python tools/ground_textures.py` (Pillow) | Old (2026-11-17): Poly Haven colour x AO photos into `theme/assets/ground-*.jpg`. Replaced by `ground_render.py`. |
| `tools/ground_render.py` | `blender -b -P tools/ground_render.py [-- name ...]` | Blender (2026-11-27): each Poly Haven set really displaced and lit by an even sky, rendered top-down into `ground-<name>.jpg` + normal map `ground-<name>-n.jpg`. `GROUND_OUT=dir` to try it elsewhere. |
| `tools/material_render.py` | `blender -b -P tools/material_render.py [-- name ...]` | Blender: the detail textures `mat-<name>.jpg` + `-h.jpg` (bark, leaves built from leaf cards, wood, grime, brushed metal) for cft-gfx `MAT_TEX`. |
| `tools/monster_render.py` | `blender -b -P tools/monster_render.py [-- name ...]` | Blender: re-textures `mon-*.glb` (new UVs, baked colour + AO + normal map, clips kept). `MON_OUT=dir` to try it elsewhere. |
| `tools/cast_models/build.py` | `python tools/cast_models/build.py [ids] [--from DIR]` | Cast models: Blender MPFB build (`tools/cast_models/mpfb/build_cast.py`) -> `fix_rest.mjs` -> `slim_glb.mjs` -> media/public/models/cft + manifest + `cast-faces.jpg`. `CFT_LOCAL_MODELS=<dir>` makes the test harness load cast models from disk instead of R2. |

Code graph (optional, 0 tokens to build): from the project root, `graphify query "<question>"`; the graph is in
`graphify-out/` (git-excluded). Refresh it after code changes (command in [deploy.md](deploy.md)).

## 9. Which test for which change

| You changed | Run |
|---|---|
| A number in `D.TUNE` / prices / text in `cft-content.js` | `node tools/live/content_check.mjs`, `python tools/assets.py`, `python tools/check.py` |
| Missions, items, monsters, events, stickers (content structure) | the above + `python -I tools/live/game_test.py --fun` (or the flag of the area) |
| Engine behaviour in `cft-game.js` / `cft-world.js` / `cft-ui.js` | `python tools/assets.py`, `python tools/check.py`, the matching `game_test.py` flag; the full run before a big release |
| One feature module (`cft-hero.js`, `cft-chaos.js`, `cft-camp.js`, `cft-wild.js`, `cft-aim.js`, `cft-stunt.js`, `cft-cine.js`, `cft-color.js`, `cft-rpg.js`, `cft-fun.js`) | its flag: `--hero`, `--chaos`, `--camp`, `--wild`, `--aim`, `--stunt`, `--cine`, `--color`, `--rpg`, `--fun`/`--combat` |
| Visuals (models, textures, lighting, HUD looks) | the matching screenshot flag (`--shots`, `--gfx`, `--models`, `--people`, `--ground`, ...) and look at the PNGs |
| Balance wiki (`cft-wiki.js`) or `Balance.py` | `--balance`, `python tools/check.py` (server tests cover `admin_balance_*`); manual check at `harness.py` `?wiki=1` |
| `cft-kit.js` (save sync, `VIEWS`) | `python tools/assets.py`, `python tools/check.py`, `python -I tools/ui_test.py` (Life/Quests/Album render), plus a game flag if `mountGame` changed |
| A Form, Item, Dialog, layout or `router.py` | `python tools/check.py`, `python -I tools/ui_test.py`; `--only a11y.js` for new controls; `--only design.js` for restyles |
| `app.css` | `python tools/assets.py`, `python -I tools/ui_test.py --only design.js`, screenshots with `--shots DIR` |
| A server function or `anvil.yaml` schema | a test in `tools/testing/test_server.py`, `python tools/check.py`, then `python -I tools/ui_test.py --restart` |
| `session_guard.py`, `KeepAlive.py`, `auth.py`, `startup.py` | `python tools/check.py`, `python -I tools/ui_test.py`, `python -I tools/session_test.py` |
| `AppStatus.py`, `AdminAccess.py` | `python tools/testing/test_app_status.py`, `python tools/check.py` |
| Map tiles (`cft-tiles.js`, `Tiles.py`) | `python tools/check.py` (Tiles tests), the full game run or `--boro` (zoom-11 tiles) |
| Docs in `docs/dev` | `python -I tools/doc_check.py` (also part of check.py) |

## 10. Review checklist for AI-made diffs (tests and tooling)

- [ ] `python tools/check.py` ends in `ALL CHECKS PASSED` on the final tree, and `anvil.yaml` hash changes from
      `tools/assets.py` are committed.
- [ ] Every new server function has tests in `test_server.py` (happy path, bad input, `denied(...)`); `PUBLIC` was not widened
      without a reason.
- [ ] A new game mechanic has PASS checks in the matching `*test.js` (or a new script wired into `game_test.py` with its own
      flag, the full-run list and the docstring).
- [ ] Tests assert behaviour, not just "no exception"; no test was weakened, skipped or deleted to get green.
- [ ] New content references (meshes, events, counters, step types) are added to the lists in `content_check.mjs`.
- [ ] `window.UI_READY`, `window.__cft`, `window.__sg`, `window.CFT_TEST.norender` and `G.stepSim` keep working (tests rely on them).
- [ ] Harness fakes in `tools/live/harness.py` stay in step with any server function the engine starts calling.
- [ ] Paths, flags and file names in this page still exist (`python -I tools/doc_check.py`).

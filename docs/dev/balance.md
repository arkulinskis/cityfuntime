# Balance — the knobs, the overrides and how a number reaches the game

## At a glance

| | |
|---|---|
| Where the numbers live | `theme/assets/cft-content.js`: `D.TUNE` (L1790-1916, 249 numbers in 14 groups) for engine knobs; per-entity numbers in `D.MONSTERS`, `D.ITEMS[*].weapon`, `D.WALK`, `D.VEHICLES`, `D.OUTPOSTS`, `D.SLAP`, `D.RPG`, `D.BUSINESSES`, mission rewards. Formulas: `D.calc`. Data dictionary: [modules/cft-content.md](modules/cft-content.md). |
| Two layers | **Defaults** = the file (needs a deploy). **Overrides** = a flat map `{path: number}` published from Admin > Balance (no deploy), stored by `server_code/Balance.py` in table `app_settings` (key `balance`). Overrides always win over the file. |
| Apply function | `D.applyBalance(map)` (cft-content.js L1995): puts back whatever the previous call changed, then writes the new numbers **in place** into D. |
| In the game | cft-kit `CFT.balance()` -> server `get_balance` -> `opts.balance`; cft-game `G.applyBalance()` merges it with this browser's live-test draft (`localStorage` key `cityfuntime.balance.draft`) before anything reads D, and re-applies on every `storage` event (`onBalance`). |
| Editor | Admin > Balance (`#admin/balance`, client_code/Pages/Admin `balance_part`) mounts `theme/assets/cft-wiki.js` (`CFTWiki.mount`) through client_code/cft.py `mount_wiki` -> cft-kit `CFT.mountWiki`. |
| Server use | `Balance.tune(path, default)` lets server code agree with the game: server_code/Game.py `level_of` reads `TUNE.player.xpBase` / `TUNE.player.xpExp`. |
| Find a knob | `python -I tools/where.py --tune <word>` (e.g. `--tune parry`); FIX_INDEX.md "Balance first: is it a number?". |
| Tests | `python -I tools/live/game_test.py --balance` (tools/live/balancetest.js), `python tools/testing/test_server.py` (Balance.py), `node tools/live/content_check.mjs` (data sanity). |

## End-to-end flow

```
cft-content.js (defaults)                 Admin > Balance (cft-wiki.js)
   D.TUNE, D.MONSTERS, ...                   edits = {path: number}  (working copy, applied to D on the admin page)
        |                                    |-- "Live test in my game" -> localStorage cityfuntime.balance.draft = {on, values, t}
        |                                    `-- "Publish for everyone"  -> admin_balance_save(values, note)
        |                                                                      |
        |                                       server_code/Balance.py  app_settings["balance"] = {values, updated, by, note}
        |                                                               app_settings["balance_history"] = last 12 published
        v                                                                      |
game start: cft-kit CFT.load() -> CFT.balance() (get_balance, public) ---------'   (no answer = {} = defaults; never blocks)
        -> CFTGame.mount(..., {balance}) -> G.applyBalance():
             D.applyBalance(Object.assign({}, opts.balance, balanceDraft()))   draft keys win over published keys
        -> storage event on cityfuntime.balance.draft (same browser, other tab) -> G.applyBalance() again + toast
server: Game.level_of(xp) uses Balance.tune("TUNE.player.xpBase", 60.0) / ("TUNE.player.xpExp", 1.8)
```

## Override paths (`D.balancePath`)

A path is a dotted walk from D: `TUNE.combat.parry`, `MONSTERS.slime.hp`, `MONSTERS.wisp.weak.water`, `ITEMS.w_pan.weapon.dmg`, `TUNE.combat.wind.0` (array index), `OUTPOSTS.hearton.cap`, `WALK.run`, `SLAP.dmg`.

Rules (client `D.balancePath`, L1987):
- matches `^[A-Za-z_][\w]*(\.[\w]+){1,5}$` (2 to 6 parts) and contains no `__proto__` / `prototype` / `constructor`;
- every part but the last must be an object; the **leaf must already be a number** (an array leaf: a numeric index whose value is a number). You cannot add keys, change strings or booleans, or set a missing optional field (that is why `D.WEAPON_DEFAULTS` writes every weapon number out explicitly, and why every monster gets a full `weak` map);
- anything else is skipped silently (`D.applyBalance` returns the count applied, also kept in `D.BAL_ON`).

Server rules (`clean` in Balance.py): the same regex, rejects any `__`, `prototype`, `constructor`; values must be finite numbers (not bool) with |v| ≤ 1e7, rounded to 6 decimals; at most `MAX_VALUES` = 3000 paths. A bad map fails the whole save (`C.fail`). The server does **not** know D, so a well-formed path that is not a game number is stored and then ignored by the game.

**Alias trap:** `D.COMBAT` is the same object as `D.TUNE.combat`. Never put both `COMBAT.x` and `TUNE.combat.x` in one map: `D.BAL_DEFAULTS` would record the first override as the "default" of the second, and resetting would leave a wrong value. Always use the `TUNE.combat.*` form (the wiki does).

## `D.applyBalance(map)` in detail (L1995)

1. For every path in `D.BAL_DEFAULTS` (what the previous call changed), write the remembered original back.
2. Clear `D.BAL_DEFAULTS`.
3. For every path in `map` with a finite numeric value and a valid `D.balancePath`: remember the current value in `D.BAL_DEFAULTS[path]`, write the new one.
4. `D.BAL_ON = n`; return n.

So the same call serves "publish", "try it" and "reset" (`D.applyBalance({})` = every default). `D.balanceDefault(path)` returns the original even while it is overridden (the wiki's "was" values). Objects are changed in place, so a module that cached `const CB = D.TUNE.combat` (cft-fun L35) sees new values at once.

**What follows a change live and what needs a reload:** values read on every use (combat timings, damage, spawn counts at the next spawn, XP curve, prices) follow at once. Values copied at spawn time (a figment already on the street keeps its scaled hp/atk; guardian and rare definitions are built with `Object.assign` when they spawn) change for the *next* spawn. Values read once at start (cft-world `TW` people/traffic counts from `D.TUNE.world`, graphics) need a page reload. `G.applyBalance` clamps your current health to the new max health.

## The server side (`server_code/Balance.py`)

| Function | Access | What it does |
|---|---|---|
| `published()` | server | the published `{path: number}` (empty = all defaults) |
| `tune(path, default)` | server | one published number as float, else `default`; used by `Game.level_of` |
| `clean(values)` | server | validates a map (rules above) |
| `get_balance()` | **public** (`@anvil.server.callable`, no login) | `{values, updated}`: every game, guests too, needs it before starting. Numbers only, no personal data. |
| `admin_balance_get()` | admin (`C.require_admin`) | values + `updated`, `by`, `note` + `history` summaries `[{i, updated, by, note, n}]` |
| `admin_balance_save(values, note)` | admin | `clean`, push the previous record into `balance_history` (keeps `MAX_HISTORY` = 12), store `{values, updated, by, note}` under `balance` |
| `admin_balance_restore(index)` | admin | re-publishes history entry `index` via `admin_balance_save` with a "Restored..." note |

Storage: table `app_settings` (anvil.yaml: columns `key` string, `value` simpleObject; `client: none`), rows `balance` and `balance_history`, read/written with `C.get_setting` / `C.set_setting` (server_code/common.py). No schema change was needed for balance.

**Level curve on the server:** `Game.level_of(xp)` (leaderboard/status) uses the published `TUNE.player.xpBase` / `xpExp`, falling back to **hard-coded 60.0 / 1.8**. If you change those defaults in cft-content.js, change the fallbacks in `level_of` too (and the `xpAt` fallback at cft-game.js L17), or the leaderboard levels drift from the game. A live-test draft never reaches the server.

## The wiki editor (cft-wiki.js, Admin > Balance)

- Built entirely from `window.CFT_DATA` and `D.calc`, so it can't drift from the game. Each white box (`num(path)`, `knobRow(path, label, hint, unit)`) is a real path; changed boxes show the old value and a reset.
- Sections (`SECTIONS` / `VIEW.*`): How it works · You, level by level (`LEVELS` table: XP, health, damage per level) · Figments (base stats, computed hp/hits/damage at a chosen level/fitness/armour/weapon `ctx`, weakness boxes `MONSTERS.<k>.weak.<type>`, fighting rules) · Bosses (champions, guardians, rares, MEGAs, outposts) · Weapons (`ITEMS.<id>.weapon.*`, `SLAP.*`: real reach, damage per second, per ammo) · Powers (water, lightning, fire, web, moving, ammo) · Colour blocks (`TUNE.color.*`) · All knobs (`VIEW.knobs`: walks every number in `D.TUNE`).
- Units as the game shows them: your health and hits on you raw; your hits and figment health ×10 (the pop-ups).
- Three places a change can live: (1) the page's working copy `edits` (applied to D on the admin page only); (2) **Live test in my game**: `edits` written to `localStorage` `cityfuntime.balance.draft` as `{on: true, values, t}` on every change — an open game tab in the same browser re-applies it; unticking removes the key; (3) **Publish for everyone**: `admin_balance_save(edits, note)`. Buttons: Open the game, Back to published, All defaults, Publish, and "Publish this one again" per history row.
- A new knob added to `D.TUNE` shows up in All knobs automatically; add a `knobRow` to a themed section in cft-wiki.js if it matters for balance. A new per-entity number shows up in the Figments/Weapons tables only if those views render it.

## `D.TUNE`: every knob group (defaults as in the file)

Each group is read by the module named; the line comment in cft-content.js is the authority. `python -I tools/where.py --tune <word>` jumps to a knob.

### `combat` (L1791) — cft-fun.js (also `D.COMBAT`, cft-hero.js)
| Knob | Default | Meaning |
|---|---|---|
| `wind` | [0.55, 1.05] | s a figment winds up before striking (random in range) |
| `reach` | 1.9 | m a strike reaches beyond the figment's body |
| `recover` | 0.75 | s after a strike when your hits are openings |
| `parry` | 0.3 | s before the strike in which starting a block = perfect parry (+ shield bonus) |
| `block` | 0.6 | share of damage a block stops (+ shield, max 0.92) |
| `counter` | 2.5 | damage × of the hit after a parry |
| `opening` | 1.35 | damage × during a figment's recovery |
| `comboT` | 1.25 | s between hits that keep a combo |
| `comboStep` | 0.06 | extra damage per combo hit (up to 10) |
| `guardBreak` | [0.22, 0.06] | chance a block is crushed: [champions/guards/bosses/rares, others] |
| `luckyDodge` | 0.05 | base chance to slip a hit (+ Fitness, fast shoes) |
| `runOver` | 7 | m/s a car needs to knock a figment flat |

### `monsters` (L1805) — cft-fun.js spawner (+ cft-chaos.js, `D.calc.scale`)
| Knob | Default | Meaning |
|---|---|---|
| `night` / `nightLow` | 6 / 4 | figments out at once at night (high / low graphics) |
| `day` / `dayLow` | 3 / 2 | by day (never near home) |
| `champChance` | 0.07 | chance a spawn is a champion pack of three |
| `aggro` | 17 | m at which a figment notices you |
| `hpPerLevel` / `atkPerLevel` | 0.18 / 0.1 | growth per monster level above (or below) yours |
| `gearShare` | 0.5 | how much of your weapon × damage bonus figment health follows (0-1) |
| `lifeShare` / `armorShare` | 0.85 / 0.6 | how much their hits follow your max health / armour |
| `challenge` / `challengeMax` | 0.03 / 0.3 | extra toughness per level of yours (from level 2), capped |
| `levelEvery` | 400 | m from home per extra monster level |
| `regenDelay` / `regen` | 5 / 0.025 | you heal `regen` × max health per s after `regenDelay` s out of a fight |
| `hpGrow` | 0.15 | figment health growth per level of yours (= `player.dmgPerLevel` keeps hits-to-win constant) |
| `champHp` / `champAtk` / `champXp` / `champSize` | 2.5 / 1.4 / 2.5 / 1.15 | champion multipliers |

### `player` (L1819) — cft-game.js, cft-fun.js via `D.calc`; server `Game.level_of`
| Knob | Default | Meaning |
|---|---|---|
| `xpBase` / `xpExp` | 60 / 1.8 | XP to reach level L = xpBase × (L − 1)^xpExp (`D.calc.xpAt`, `levelOf`; also on the server) |
| `hpBase` / `hpPerLevel` / `hpPerFit` | 60 / 8 / 3 | max health = hpBase + hpPerLevel × L + hpPerFit × Fitness (+ gear, outposts) (`D.calc.maxHp`) |
| `dmgPerLevel` | 0.15 | your hits grow by this share per level (`D.calc.dmgMul`) |
| `xpPerMonsterLevel` | 0.12 | figment XP growth per figment level (`D.calc.xpFor`) |

### `bosses` (L1825) — cft-fun.js (metro guardians), cft-rpg.js (rares)
`guardHp` 8, `guardHpAdd` 8 (health = base × guardHp + guardHpAdd, before scaling), `guardAtk` 1.3, `guardXp` 10, `guardSize` 2.4; `rareHp` 4, `rareHpAdd` 2, `rareXp` 6, `rareSize` 1.45.

### `hype` (L1829) — cft-hero.js (+ cft-chaos.js, cft-wild.js)
`compliment` [6, 11] / `complimentSome` [14, 24] (s between compliments, setting Max / Some), `fan` [80, 140] / `fanSome` [160, 260] (selfie fans), `gift` [170, 260] / `giftSome` [300, 420] (admirers with gifts), `flirtShare` 0.34 (share of compliments that are flirts; none when married), `swag` = swagger per event `{ kill: 5, bigKill: 14, parry: 12, dodge: 3, block: 2, combo: 2, smash: 1.5, wreck: 6, mission: 25, level: 15, compliment: 2, fan: 6, gift: 8, outpost: 40 }`, `mainSecs` 25 / `mainSpeed` 1.25 / `mainDmg` 1.5 (main character mode).

### `outposts` (L1837) — cft-hero.js (per-kind bonus/cap: `D.OUTPOSTS`)
`range` 62 (m at which a pack appears), `maxPacks` 2, `homeCalm` 90 (m: none this close to home), `packMin` 3 / `packMax` 6 (figments besides the captain, more with level), `captainHp` 7, `captainAtk` 1.5, `leash` 26.

### `smash` (L1844) — cft-world.js / cft-fun.js / cft-chaos.js
`hp` = hits (× weapon) to break `{ bin: 1, box: 1, hydrant: 2, bench: 2, lamp: 3, tree: 3, car: 4, van: 5 }`, `weaponMul` 2.2 (how hard a swing hits things).

### `chaos` (L1848) — cft-chaos.js
`comboT` 4.5 (s without chaos before the mayhem meter cashes in), `critters` 6 / `crittersLow` 3, `brainrot` [40, 75] (s between rare creatures), toys around you `pinatas` 4, `balls` 3, `manholes` 3, `cushions` 4, `tubes` 5, `chatter` [5, 9] (s between meme lines), jetpack `jetFuel` 7, `jetThrust` 40, `jetUp` 10, `jetRefill` 0.35, glide-brella `glideFall` 2.2, `glideSpeed` 1.25, `hitstop` `{ kill: 0.05, big: 0.12, parry: 0.1 }` (s freeze), `enemyShots` 1 (enemy projectile damage ×).

### `world` (L1859) — cft-world.js (read once at start)
`peds` 44 / `pedsLow` 22, `cars` 20 / `carsLow` 9.

### `wild` (L1860) — cft-wild.js
Stamina `stamMax` 100, `regen` 35, `regenDelay` 0.5; costs `climb` 9, `hang` 1.5, `climbJump` 12, `glide` 4; air aim `airAim` 25, `airAimCost` 10, `airAimHeight` 1.5, `airAimSecs` 0.9, `airK` 0.3; `tiredSpeed` 0.6, `tiredUntil` 0.3; umbrella `glideSink` 2.2, `draftUp` 10; perfect dodge `dodgeWindow` 0.38, `flurrySecs` 1.6, `flurryHits` 6, `slowK` 0.25; chemistry `arcRange` 4.5, `arcHit` 2.6, `steamR` 4.5, `steamBlind` 3; antennas `viewCell` 400, `viewMinH` 10, `giggleR` 10.

### `aim` (L1870) — cft-aim.js
`range` 70; web `webRange` 42, `webCd` 0.45, `webSpeed` 170, `webV0` 9, `webAcc` 70, `webMax` 30, `webLife` 3.2, `webStun` 2.2; rainbow guides `guideR` 48, `megaR` 260, `rotR` 110, `critterR` 26, `guideCd` 7, `guideMax` 80; shooters in town `gunDrops` 4, `gunDropMin` 60, `gunDropMax` 300, `gunAmmo` 8.

### `stunt` (L1880) — cft-stunt.js + car air in cft-world.js
`count` 7 / `countLow` 4, `minD` 45, `maxD` 260, `dropD` 420, `apart` 70, `airG` 0.6, `hop` 7.5, `flipRate` 8.4, `spinRate` 7.4, `rollRate` 10.5, `landTol` 0.75, `spinTol` 0.8, `assist` 2.2, `boostMul` 1.3, `boostSecs` 1.6, `pivot` 0.75, `minAir` 0.8, `ptsPerCoin` 30, `cashCap` 450, `ptsPerXp` 14, `streakT` 6.

### `color` (L1894) — cft-color.js (docs/colour-blocks.md)
`libTarget` 40, `wOutpost` 4, `wMetro` 4, `wShop` 1, `wMadeUp` 0.5, `secretTarget` 8, `killTarget` 25, `minSat` 0, `rewardCash` 300, `rewardXp` 400.

### `camp` (L1903) — cft-camp.js
Opening `introFoes` 14 / `introFoesLow` 8; ammo `ammoStart` 20, `ammoMax` 60, `ammoCrate` 12, `ammoCrates` 6, `crateMin` 70, `crateMax` 320; powers `waterMax` 30, `voltMax` 20, `foamMax` 100, `waterStart` 10, `voltStart` 4, `waterOrb` 6, `voltOrb` 4, `foamPick` 100, `hydrant` 10, `orbs` 5, `waterRange` 14, `waterKnock` 14, `voltRange` 24, `voltDmg` 3.2, `voltChain` 3, `wetMul` 2.5; fire `fireMax` 28 / `fireMaxLow` 14, `fireSpread` [2.5, 5], `fireHurt` 6, `fireEvery` [70, 140]; storms `stormEvery` [240, 420], `stormSecs` 45, `strikeEvery` [1.6, 3.2]; MEGA `megaEvery` [420, 720], `megaHits` 36, `megaWeak` 3, `megaArmor` 0.15, `megaAtk` 0.17, `megaSpeed` 3.4; secrets `secretsPerTile` 2, `secretSee` 38, `secretGap` [1.0, 4.2].

### Numbers outside `D.TUNE` (also overridable)
`D.WALK.walk/run`, `D.VEHICLES.<id>.*`, `D.MONSTERS.<k>.{hp, atk, speed, xp, w, ...}` and `.weak.<type>`, `D.ITEMS.<id>.{p, energy, heal, ...}` and `.weapon.*`, `D.SLAP.*`, `D.OUTPOSTS.<k>.{bonus, cap}`, `D.RPG.*` numbers (e.g. `RPG.QUALITY.3.w`), `D.BUSINESSES.<index>.income` (array index), `D.APARTMENTS.<index>.rent`, `D.CAMPAIGN.CAP.<i>`. Mission rewards are numbers too (`MISSIONS.<index>.reward.xp`) but indices shift when missions are added — prefer editing the file for those.

## Recipes

- **Tweak a number for everyone, no deploy:** Admin > Balance -> change the box -> tick Live test, play in another tab of the same browser -> Publish (with a note). Roll back from the history list.
- **Change a default in the file:** edit the value in cft-content.js (keep the comment accurate), `python tools/assets.py`, test. A published override for the same path still wins: check Admin > Balance shows "All defaults" or clear that path. For `xpBase`/`xpExp` also update `Game.level_of` fallbacks.
- **Add a knob:** put it in the right `D.TUNE` group with a comment (unit, meaning), read it in the module **at use time** through the group object (e.g. `CB.parry`, never copy the number into a module-level `const`), and it appears in the wiki's All knobs automatically. Add a `knobRow` in a themed section if it matters.
- **Add a formula:** put it in `D.calc` so the game and the wiki share it; if the server needs it, mirror it in Python with `Balance.tune` for each knob.

## How to test

```bash
python -I tools/where.py --tune <word>                 # find the knob
node tools/live/content_check.mjs                      # monster speeds < D.WALK.run, weapons have dmg/reach, etc.
python -I tools/live/game_test.py --balance            # balancetest.js: applyBalance on real numbers, bad paths skipped,
                                                       #   defaults remembered, xpBase moves levelOf, live draft via storage event (~2 min)
python tools/testing/test_server.py                    # Balance.py: public get, admin-only save/restore, path/number rules, history
python tools/check.py                                  # all of the above server tests + asset hashes + doc_check
python -I tools/live/game_test.py --combat             # after combat/monster knob changes (also --hero, --fun, --camp, --chaos, --stunt, --wild, --aim, --color by group)
```
In-page checks: `python -I tools/live/game_test.py --eval FILE.js` runs your own script against a live game (`window.__cft` = G; `G.D.applyBalance({...})` then read `G.D.calc.*`). The harness (tools/live/harness.py) fakes `get_balance` / `admin_balance_*` from `window.HARNESS.balance`, and `?wiki=1` shows the wiki instead of the game for screenshots.

## Review checklist for AI-made content/balance changes

- [ ] Every override path resolves with `D.balancePath` to an existing **number** (no new keys, no strings/booleans, 2-6 parts, array leaves by index); no `COMBAT.*` alongside `TUNE.combat.*`.
- [ ] New knobs live in `D.TUNE` with a unit/meaning comment and are read at use time through the group object; new formulas live in `D.calc`.
- [ ] Changed defaults keep invariants: monster `speed` < `D.WALK.run`, `combat.block` + shield ≤ 0.92 cap in mind, `wind[0]` ≤ `wind[1]` (and every `[min, max]` pair ordered), shares in 0..1, counts ≥ 0, `monsters.hpGrow` ≈ `player.dmgPerLevel` unless deliberately changed.
- [ ] `TUNE.player.xpBase` / `xpExp` default changes are mirrored in server_code/Game.py `level_of` fallbacks and the cft-game.js `xpAt` fallback.
- [ ] Server-side: nothing bypasses `clean`; `get_balance` stays numbers-only; admin functions keep `C.require_admin()`.
- [ ] Ids/references in any data touched still resolve, voice lines regenerated if mission text changed (see [modules/cft-content.md](modules/cft-content.md)).
- [ ] `node tools/live/content_check.mjs` passes, `python tools/assets.py` was run after editing cft-content.js, `python -I tools/live/game_test.py --balance` and `python tools/testing/test_server.py` pass, plus the flag for the group touched.

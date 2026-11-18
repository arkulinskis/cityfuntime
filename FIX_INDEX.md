# City Fun Time: fix index

**For small fixes (play-test notes), read this file instead of the guide, the code map and ANVIL_NOTES.** It says where
each thing lives. Then open only those lines:

```
python -I tools/where.py <words>          index rows + definitions with exact line ranges + mentions
python -I tools/where.py --def <name>     a function's start-end (Read with offset/limit = exactly that)
python -I tools/where.py --toc <file>     every section and function of one file, with ranges
python -I tools/where.py --tune <word>    the balance knobs (D.TUNE) matching a word
```

Names below are function names (they don't drift like line numbers). Engine = `theme/assets/cft-*.js` (plain JavaScript,
loaded by the Anvil page). After editing anything in `theme/assets`: `python tools/assets.py`. Notes come in through
`PLAYTEST.md`; the workflow is in the `/cft-fix` skill. Bigger changes (new systems, new pages): the full guide
`.claude/skills/cityfuntime/SKILL.md`.

## Balance first: is it a number?

"Too much / too little / too fast / too often" is usually a knob in **`D.TUNE`** (end of `cft-content.js`;
`where.py --tune <word>`): combat timing (wind-up, parry window, block, counter, combo), monster counts and growth,
hype and compliment frequency, swagger gains, main character mode, outposts (range, packs, captain), smash hits, people and
traffic counts. Other numbers: `D.WALK` / `D.VEHICLES` (speeds), `D.ITEMS` (prices, energy, healing), `D.MONSTERS` (each
figment: hp, atk, speed, coins), `D.OUTPOSTS` (+bonus and cap per kind), `D.RPG` (loot, talents, factions), `D.BUSINESSES`.

## Where things live

| Area | A note like... | Look at | Knob / data | Test |
|---|---|---|---|---|
| Walking, sprint, jump | "too slow", "jump feels floaty" | cft-world `updatePlayer` | `D.WALK`, `GRAV` | --hero |
| Camera | "camera too close / clips walls" | cft-world `updateCamera` | `cam` in create | --heroshots |
| Rides, driving | "car turns badly", "bike too fast" | cft-world `updatePlayer` (drive branch), cft-game `setRide` `G.toggleRide` | `D.VEHICLES` | --hero |
| Borrowed cars | "can't borrow", "park spot wrong" | cft-hero `H.borrow` `H.park`, cft-world `W.borrowable` `W.borrowCar` `W.parkCar`, cft-game `findInteraction` | | --hero |
| Smashing things | "lamp needs too many hits", "debris weird", "hydrant" | cft-world `W.hitProp` `debris` `updateSmash` `W.propNear`, cft-fun `smashProp` | `D.TUNE.smash` | --hero |
| Fighting: monster attacks | "can't see it coming", "hits too hard" | cft-fun `windUp` `teleTick` `strike` `touch` `updateMonsters` | `D.TUNE.combat`, `D.MONSTERS` | --combat --hero |
| Fighting: your hits | "aim jumps", "combo", "slap weak" | cft-fun `F.attack` `hitMonster` | `D.TUNE.combat`, weapons in `D.ITEMS` | --fun --hero |
| Blocking / parry | "parry too hard", "block button" | cft-fun `F.setBlock` `strike`, cft-ui keys (`onKey`, `[data-block]`), cft-world block pose in `updatePlayer` | `D.TUNE.combat.parry/block` | --hero |
| Monster spawning | "too many at night", "none by day" | cft-fun `updateMonsters` (top), `spawnMonster`, `monsterLevel` | `D.TUNE.monsters` | --combat |
| Monster looks | "the goose looks odd" | cft-world `W.monster` `W.animateMonster` | | --monsters |
| Health, healing, blackout | "regen too slow", "lost too much money" | cft-fun `F.hurt` `F.heal` `F.quaff` `die` `F.maxHp` | `D.TUNE.monsters.regen*` | --combat |
| Metro guardians | "guardian too strong" | cft-fun `guardTick` `spawnGuardian` `freeStation` | `D.GUARDIANS` | --combat |
| Outposts (Tom Hearton's, groceries) | "pack too big", "no free coffee", "sign wrong" | cft-hero `outpostTick` `spawnPack` `H.outpostKill` `liberate` `H.placeGate` `H.signInfo` `H.markers` | `D.TUNE.outposts`, `D.OUTPOSTS` | --hero |
| Tim Hortons name | "I saw Tim Hortons" | cft-game `startWorld` (`W.placeFix`), cft-content `D.HEARTON_RE` `D.shopName` | | --hero |
| Hype words, ticker | "words too big / cover the screen", "ticker overlaps" | cft-hero `H.word` `H.ticker`, CSS `.cft-hw` `.cft-tk` in app.css | | --heroshots |
| Compliments, flirts, fans, gifts | "too often", "line is weird" | cft-hero `compliment` `startFan` `updateFan` `giveGift` `H.tick` | `D.TUNE.hype`, lines in `D.HYPE` | --hero |
| Swagger, main character mode | "fills too fast", "mode too short" | cft-hero `swag` `mainMode` `H.event` | `D.TUNE.hype.swag`, `mainSecs` | --hero |
| Mission letters, pointers | "pointer covers HUD", "letter wrong" | cft-hero `updateBlips3D` `updatePointers` `letterOf`, CSS `.cft-blip` | | --heroshots |
| Minimap / big map | "markers clutter", "edge arrows" | cft-ui `minimapData`, cft-world `W.drawMinimap` `W.drawMap` | | --shots |
| Gold arrow, quest card | "arrow points wrong" | cft-game `currentGoal` `updateArrow` `stepGoal`, cft-ui `U.hud` (quest card) | | --hero |
| Missions: text, rewards, order | "typo", "reward too small", "unlocks too early" | cft-content `M(...)` / `S(...)` (search the id or title) | reward / req in the entry | content_check |
| Missions: step logic | "step doesn't complete" | cft-game `updateMissions` `triggerStep` `talkTo` `completeMission` `beginStep` | | gametest (full) |
| Quests page "???" | "shows too much / too little" | cft-kit `mystery` + `quests` view | | ui_test |
| Talking to people, dialog | "dialog stuck", "choices" | cft-ui `U.dialog` `U.choose`, cft-game `chatPed`, cft-fun `F.pedMenu` | | --fun |
| Sweethearts, flirting (E menu) | "flirt never works" | cft-fun `flirt` `updateSweet` `sweetMenu` | chance in `flirt` | --fun |
| Street folk, crown | | cft-fun `updateFolk` `folkMenu` `crown` | `D.STREETFOLK`, `D.CROWN_AT` | --fun |
| Pranks, chasers, rivals | | cft-fun `F.prank` `updateChasers` `updateRivals` | `D.PRANKS` | --fun |
| Street events | "UFO too rare" | cft-fun `startEvent` `updateEvent` (`eventT` in `F.tick`) | `D.EVENTS` | --fun |
| Loot, gear, shields | "drops too rare", "shield invisible" | cft-rpg `drop` `make` `makeGear` `add` `equip` `lookParts`, cft-world `W.shieldMesh` | `D.RPG` (QUALITY, SOURCES, GEAR) | --rpg --hero |
| Talents, reputation, achievements | | cft-rpg `learn` `repTick` `achTick` | `D.RPG.TALENTS/FACTIONS/ACH` | --rpg |
| Your character's look | "hair clips hat" | cft-world `W.person` `W.animate`, cft-game `playerLook`, cft-ui `U.lookEditor` | | --people |
| People and traffic | "streets empty", "cars stuck" | cft-world `updateLife` `spawnPed` `spawnCar` | `D.TUNE.world` | --shots |
| Shops, buying | "can't buy", "price" | cft-ui `U.shopPanel`, cft-game `G.buy` | `D.ITEMS`, `D.KINDS[kind].sells` | gametest |
| Businesses, turf, homes | | cft-game (`G.buyBiz`, turf: `updateTurf`, homes: `U.homePanel`) | `D.BUSINESSES`, `D.CREWS`, `D.APARTMENTS` | gametest |
| HUD chips, buttons | "button too small on phone" | cft-ui markup at the top of `create`, `U.hud.frame`; CSS `/* ===== play.html` block | | ui_test --shots |
| Phone apps | "Street life card wrong" | cft-ui `render` + `VIEWS.<app>` (e.g. `VIEWS.street`) | | --heroshots |
| Buildings, roads, pavements | "pavement over the road", "roof ledge odd" | cft-world `buildSub` `addWalls` `cornice` `gable` `roofClutter`; constants `KERB_Y` `paveCol` | | --heroshots |
| Ground textures (road, pavement, grass, plaza look) | "grass too yellow", "tiles too big", "cracks too strong" | cft-world `TEX` (m = size, k = detail, real = photo colour), `TL`, `groundify` (shader), `loadGround`; which surface gets which photo: `AREA[k][3]`, `ROAD_STYLE.*.l`, `TERRAIN_COL`; photos: `tools/ground_textures.py` | | --ground |
| Trees, lamps, halos, street furniture | | cft-world `TRUNK_G`/`CROWN_G` (top), `PROP`, `layProps`, halos in `W.setClock` | | --heroshots |
| Sky, day/night, lighting, shadows | "night too dark" | cft-world `W.setClock` (`SKY`, `SKY_TOP`), lights at the top of `create` | | --shots |
| Performance | "laggy" | cft-world `layProps` (density), `TRUNK_G` detail, `SHADOW`, `D.TUNE.world` | | real device |
| Music, sounds | | cft-game `music` / `MUSIC`, `G.sfx` | | |
| Saving | "progress lost" | cft-game `doSave`, cft-kit `persist` `loadSave`, server `server_code/Game.py` `put_save` | | ui_test |
| Pages outside the game (Life, Quests, Album, Ranks, Landing) | | `client_code/Pages/<Name>/` (template + Python), data from cft-kit `VIEWS` | | ui_test |
| Play-test panel | | cft-debug.js (`?debug=1`) | | |

## Tests (pick the narrowest)

| Command (in cityfuntime-forms) | Covers | Time |
|---|---|---|
| `node tools/live/content_check.mjs` | every mission, item, kind, counter reference in cft-content.js | 1 s |
| `python tools/check.py` | Anvil validate, JS syntax, asset hashes, server tests, design check | ~1 min |
| `python -I tools/live/game_test.py --hero` | speed, combat, smashing, cars, outposts, hype, blips, shields | ~2 min |
| `... --fun` / `--combat` / `--rpg` | street life / monsters, health, guardians / loot, talents | 2-3 min each |
| `... ` (no flag) | everything (gametest + fun + rpg + combat + hero) | 5-7 min |
| `... --heroshots DIR` / `--shots` / `--monsters` / `--people` | screenshots to look at (no checks) | 2-3 min |
| `python -I tools/ui_test.py` | the Anvil pages in Docker | ~5 min |

A tiny text or number change: content_check + check.py is enough; a behaviour change: the matching game_test flag.

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
| Look / exposure / bloom / AO | "too dark", "washed out", "too much glow" | cft-post.js `create` (params) | `W.post.params` | --gfx |
| Building facades, windows, shop windows | "windows look flat", "too many shops", "brick too strong" | cft-gfx.js `wallMaterial` (WALL_HEAD: `facade`, `room`, `wallH`), cft-world `facadeStyle` | `ENV_K`, shop share in buildSub `walls.wv` | --gfx |
| Balconies, outdoor stairs, AC units, chimneys | "stairs in the way", "too many balconies" | cft-world `facadeExtras` | r0 thresholds | --gfx |
| Figment models (animated monsters) | "ghost too big", "wrong monster for X" | cft-world `MON_MODELS`, `MON_H`, `monModel`, `W.animateMonster` | tools/monster_models.py | --gfx / --monsters |
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
| Sweethearts, flirting (E menu) | "flirt never works", "flirt shown for a kid" | cft-fun `flirt` `noFlirt` (kids: cft-world `W.isKid`, `KID_H`) `updateSweet` `sweetMenu` | chance in `flirt` | --fun |
| Street folk, crown | | cft-fun `updateFolk` `folkMenu` `crown` | `D.STREETFOLK`, `D.CROWN_AT` | --fun |
| Pranks, chasers, rivals | | cft-fun `F.prank` `updateChasers` `updateRivals` | `D.PRANKS` | --fun |
| Street events | "UFO too rare" | cft-fun `startEvent` `updateEvent` (`eventT` in `F.tick`) | `D.EVENTS` | --fun |
| Loot, gear, shields | "drops too rare", "shield invisible" | cft-rpg `drop` `make` `makeGear` `add` `equip` `lookParts`, cft-world `W.shieldMesh` | `D.RPG` (QUALITY, SOURCES, GEAR) | --rpg --hero |
| Talents, reputation, achievements | | cft-rpg `learn` `repTick` `achTick` | `D.RPG.TALENTS/FACTIONS/ACH` | --rpg |
| Wardrobe (slots, one thing each) | "slot list wrong", "can't swap", "badge" | cft-ui `U.wardrobe` `wardPick` `wardDraw` `onWardClick` `fxChips`, cft-game `wornIn` `wearShop` `takeOff` `slotOptions` `wearFx` `migrateWear`, cft-rpg `equip` `worn` `spare`; CSS `.cft-ward*` `.cft-wslot` | `D.WEAR_SLOTS`, gear `slot` in `D.ITEMS` | --hero |
| Your character's look | "hair clips hat" | cft-world `W.person` (`torsoGeo`, `LIMB`, hair in `hr`) `W.animate`, cft-game `playerLook`, cft-ui `U.lookEditor` | | --people --models |
| Faces, body shapes, silly extras on people | "eyes look sleepy", "too many silly hats" | cft-world `W.person` (face block, `ARM_Z`), `W.randomLook` (`silly` chance, `fig`), `W.SILLY` | | --models |
| Car shapes, silly roof loads | "wheels too small", "roof duck clips" | cft-world `CAR_SPEC` `carShape` `carLights` `W.vehicle`, `W.SILLY_CARS` (chance in `spawnCar`) | | --models |
| Animals | "dog looks odd" | cft-world `W.animal` | | --models |
| People and traffic | "streets empty", "cars stuck" | cft-world `updateLife` `spawnPed` `spawnCar` | `D.TUNE.world` | --shots |
| Shops, buying | "can't buy", "price" | cft-ui `U.shopPanel`, cft-game `G.buy` | `D.ITEMS`, `D.KINDS[kind].sells` | gametest |
| Businesses, turf, homes | | cft-game (`G.buyBiz`, turf: `updateTurf`, homes: `U.homePanel`) | `D.BUSINESSES`, `D.CREWS`, `D.APARTMENTS` | gametest |
| HUD chips, buttons | "button too small on phone" | cft-ui markup at the top of `create`, `U.hud.frame`; CSS `/* ===== the HUD redesign` block (end of app.css) | | --campshots, ui_test --shots |
| Phone apps | "Street life card wrong" | cft-ui `render` + `VIEWS.<app>` (e.g. `VIEWS.street`) | | --heroshots |
| Buildings, roads, pavements | "pavement over the road", "roof ledge odd" | cft-world `buildSub` `addWalls` `cornice` `gable` `roofClutter`; constants `KERB_Y` `paveCol` | | --heroshots |
| Ground textures (road, pavement, grass, plaza look) | "grass too yellow", "tiles too big", "cracks too strong" | cft-world `TEX` (m = size, k = detail, real = photo colour), `TL`, `groundify` (shader), `loadGround`; which surface gets which photo: `AREA[k][3]`, `ROAD_STYLE.*.l`, `TERRAIN_COL`; photos: `tools/ground_textures.py` | | --ground |
| Boroughs (names, colours, banners, HUD chip) | "wrong borough", "two boroughs look alike", "banner too small", "chip covers the clock" | cft-world `LOOKS` `districtAt` `assignLooks` `pumpBoroughs` `PROP.banner` `dashes` (`DASH`), cft-tiles `places`, cft-rpg `boroughTick`, cft-ui hud tick (`[data-boro]`), CSS `.cft-boro` `.cft-banner.boro` | `BORO_MIX`, `BORO_R`, `LOOK_GAP` | --boro --boroshots |
| Trees, bushes, lamps, halos, street furniture | "too many spruces", "bushes everywhere" | cft-world `TREE` / `TREE_LO` `treeKind` `leafShell`, `BUSH` (placed in `plantTrees`), tree colours in `buildSub`, `PROP`, `layProps`, halos in `W.setClock` | | --models --heroshots |
| Sky, day/night, lighting, shadows | "night too dark" | cft-world `W.setClock` (`SKY`, `SKY_TOP`), lights at the top of `create` | | --shots |
| Performance | "laggy" | cft-world `LOD_R` (full models only near you), `layProps` (density), bushes in `plantTrees`, `SHADOW`, `D.TUNE.world`; `W.renderInfo()` | | real device |
| Music, sounds | | cft-game `music` / `MUSIC`, `G.sfx` | | |
| Saving | "progress lost" | cft-game `doSave`, cft-kit `persist` `loadSave`, server `server_code/Game.py` `put_save` | | ui_test |
| Pages outside the game (Life, Quests, Album, Ranks, Landing) | | `client_code/Pages/<Name>/` (template + Python), data from cft-kit `VIEWS` | | ui_test |
| Decor (gnomes, planters, mushrooms, ducks, flags...) | "too many gnomes", "a couch on the road", "parks still empty" | cft-world `DECOR` (shapes) `layDecor` (`PAVE_MIX`, `AREA_DECOR`, the `d +=` step) `decorInst` | `DECOR_HP` (hits), `DECOR_TINTS`, `DECOR_HI` | --chaosshots |
| Mayhem meter, aura | "meter cashes in too fast", "aura spam" | cft-chaos `C.add` `rankUp` `bank` `drawMeter` `C.aura`, CSS `.cft-mayhem` | `D.TUNE.chaos.comboT`, `D.CHAOS.RANKS/POINTS/AURA` | --chaos |
| Ranged weapons (yours) | "balloon misses", "boomerang never comes back", "aim jumps" | cft-chaos `C.fire` `aimShot` `updateShots` `impact`, cft-fun `F.attack` (proj branch) | weapons in `D.ITEMS` (rate, speed, splash, pellets) | --chaos |
| Ranged / flying figments | "tomato guy too accurate", "gull too high", "can't parry shots" | cft-chaos `C.rangedAI` `enemyShot` `flyTick` `shotHitsPlayer`, cft-fun updateMonsters (rangedAI call) | `D.MONSTERS` spitter/tomato/gull/wifi (`ranged`, `fly`), `D.TUNE.chaos.enemyShots` | --chaos |
| Jetpack, glide-brella, hoops | "fuel runs out too fast", "glide too slow" | cft-chaos `W.flyHook` `flightTick` `hoopTick`, cft-world updatePlayer (gravity) | `D.TUNE.chaos.jet*`, `glide*` | --chaos |
| Toys (piñatas, balls, manholes, cushions, tube men) | "ball too bouncy", "manhole too strong" | cft-chaos `pinataHit` `ballTick` `holeTick` `cushionTick` `tubeTick` `toyTick` `C.meleeHit` | `D.TUNE.chaos` counts | --chaos |
| Critters, brainrot, the Dex | "snail too fast", "never see brainrot" | cft-chaos `critterModel` `critterTick` `snap` `C.interaction`, cft-ui `VIEWS.chaos` | `D.CHAOS.CRITTERS/BRAINROT`, `D.TUNE.chaos.brainrot` | --chaos |
| Fart, porta-potty, meme chatter | "fart too loud", "chatter too often" | cft-chaos `C.fart` `fartSound` `hide` `stinkBomb` `chatterTick` | `D.CHAOS.CHATTER/KIDS/FART`, `D.TUNE.chaos.chatter` | --chaos |
| Chaos street events (Ohio, glitch, cats & dogs, cheese, 6-7, balloons) | "glitch too long" | cft-chaos `C.startEvent` `C.updateEvent` `C.endEvent` (via cft-fun startEvent) | `D.EVENTS` (chaos: true) | --chaos |
| Sky (blimps, balloons, whale) | "blimp text" | cft-chaos `skyTick` `blimpModel` | `D.CHAOS.BLIMPS` | --chaosshots |
| Hit-stop | "game freezes on hits" | cft-game `frame` (`rt.hitstop`), cft-chaos `hitstop` | `D.TUNE.chaos.hitstop` | --chaos |
| The opening (5 immortal minutes) | "too long", "too few figments", "lands too far from home" | cft-camp `K.startIntro` `introTick` `endIntro` `wakeUp` (fever dream: what is reset, `DREAM_KEYS`) `K.shrug`, cft-game `startWorld` (introPending) | `D.CAMPAIGN.INTRO_SECS`, `D.TUNE.camp.introFoes` | --camp |
| Crazy list (one more per mission), mission cap | "storms too early", "show 4 missions" | cft-camp `K.allow` `tierTick` `K.capOpen`, cft-game `G.allow` `G.openMissions` | order of `D.CAMPAIGN.WILD`, `D.CAMPAIGN.CAP` | --camp |
| Ammo, crates | "runs out too fast", "crates too far" | cft-camp `K.useAmmo` `manageCrates` `K.collect`, cft-fun `F.attack` (useAmmo) | `D.TUNE.camp.ammo*`, `crate*`, weapon `ammo` in `D.ITEMS` | --camp |
| Water / lightning / extinguisher | "zap too weak", "water knocks too far" | cft-camp `K.power` `waterBlast` `zap` `bolt` `sprayTick` `aimDir`, cft-ui keys 1/2/3 + `[data-pw]` | `D.TUNE.camp.water*`, `volt*`, `wetMul`, `foamMax` | --camp |
| Fire | "spreads too fast", "hurts too much" | cft-camp `K.spawnFire` `fireTick` `douse`, cft-world `W.onWreckFire` (hitProp) | `D.TUNE.camp.fire*` | --camp |
| Lightning storms | "too many strikes" | cft-camp `startStorm` `stormTick`, CSS `.cft-stormfx` | `D.TUNE.camp.storm*`, `strikeEvery` | --camp |
| MEGA figments | "too tanky", "stomp unfair", "heart too high" | cft-camp `K.spawnMega` `megaTick` `startAttack` `dizzy` `hitMega` `killMega` `K.meleeHit` `K.shotHit` `megaSpawner`, CSS `.cft-boss` | `D.TUNE.camp.mega*`, `D.CAMPAIGN.MEGA` | --camp --campshots |
| Secrets in tight gaps | "secret in a wall", "can't reach it", "too few" | cft-camp `K.analyse` `reachable` `enclosure` `secretTick` `openSecret` `K.interaction` | `D.TUNE.camp.secret*`, `D.CAMPAIGN.SECRET_LOOT/NOTES` | --camp |
| Bouncy world, roofs, wall jumps | "bounce too high", "can't climb", "stuck on a roof" | cft-world `updatePlayer` (wall jump, mantle, prop bounce, roof landing), `collide` (footY), `W.roofAt`; cft-camp `W.stompHook` `W.onPropBounce` | numbers in updatePlayer (×1.55 wall jump, 11.5 bounce) | --camp |
| The HUD layout, map size | "chip covers the map", "hotbar too big on phone" | cft-ui markup at the top of `create`, `U.hud.frame` `missionList` `U.mapSize`; cft-camp `hud()` (hotbar counts, mission count, boss bar); CSS `/* ===== the HUD redesign` (end of app.css) | `--mm` sizes in the CSS | --camp --campshots |
| Climbing, stamina donut | "climbing too slow", "drains too fast", "sticks to walls" | cft-world `updatePlayer` (`player.climb`, grab/let go/climb-jump), cft-wild `W.stam` `staminaTick` `drawDonut`, CSS `.cft-donut` | `D.TUNE.wild.climb/hang/climbJump/regen/stamMax/tired*` | --wild |
| Umbrella glide, updrafts | "falls too fast", "no lift over fire" | cft-wild `W.flyHook` wrapper, `updraftAt` | `D.TUNE.wild.glide/glideSink/draftUp` | --wild |
| Perfect dodge, flurry, slow motion | "dodge window too tight", "slow-mo too long" | cft-wild `X.perfectDodge` `slowmo` `airAim`, cft-fun `strike` (top) + `F.attack` (flurry), cft-game `frame` (`rt.slowmo`) | `D.TUNE.wild.dodgeWindow/flurry*/slowK/airAim*` | --wild |
| Chemistry (metal arcs, steam, soaked) | "lightning arcs too far" | cft-wild `X.conduct` `X.steam` `X.soak`; calls in cft-camp `zap` `strikeGround` `waterBlast` `fireTick` `stormTick` | `D.TUNE.wild.arc*/steam*` | --wild |
| Rooftop antennas, giggles | "antenna floating", "too many antennas" | cft-wild `viewTick` `antenna` `tuneIn` `X.interaction` `X.markers` `giggleTick` | `D.TUNE.wild.viewCell/viewMinH/giggleR` | --wild |
| Legs in the ground (pavements) | "feet sink into the pavement" | cft-world `pchunks` (registerSub), `paveAt` `standAt` `surfaceAt` `segPoint` | `KERB_Y` | --wild |
| Four-corner HUD | "something in the middle of the screen" | cft-ui markup (`.cft-tl/.cft-tr/.cft-bl/.cft-br`), CSS "the four corners" block (end of app.css) | 40vw/40vh caps in the CSS | --wild (corner check) |
| Play-test panel | | cft-debug.js (`?debug=1`) | | |

## Tests (pick the narrowest)

| Command (in cityfuntime-forms) | Covers | Time |
|---|---|---|
| `node tools/live/content_check.mjs` | every mission, item, kind, counter reference in cft-content.js | 1 s |
| `python tools/check.py` | Anvil validate, JS syntax, asset hashes, server tests, design check | ~1 min |
| `python -I tools/live/game_test.py --hero` | speed, combat, smashing, cars, outposts, hype, blips, shields | ~2 min |
| `python -I tools/live/game_test.py --chaos` | decor, mayhem, ranged weapons + figments, flying, Dex, toys, chaos events | ~2 min |
| `python -I tools/live/game_test.py --wild` | four-corner HUD, pavements, climbing + stamina, glide + updrafts, perfect dodge, air slow-mo, chemistry, antennas | ~2 min |
| `python -I tools/live/game_test.py --camp` | HUD + map size, crazy list + mission cap, the opening, ammo, powers, fire, storms, MEGA figments, secrets, bouncy world | ~2 min |
| `python -I tools/live/game_test.py --boro` | borough names, looks, HUD chip, banners, discovery | ~1 min |
| `... --fun` / `--combat` / `--rpg` | street life / monsters, health, guardians / loot, talents | 2-3 min each |
| `... ` (no flag) | everything (gametest + fun + rpg + combat + hero) | 5-7 min |
| `... --heroshots DIR` / `--shots` / `--monsters` / `--people` / `--models` | screenshots to look at (no checks) | 2-3 min |
| `python -I tools/ui_test.py` | the Anvil pages in Docker | ~5 min |

A tiny text or number change: content_check + check.py is enough; a behaviour change: the matching game_test flag.

---
name: cityfuntime
description: Context, workflow and recipes for City Fun Time (folder cityfuntime-forms), the user's Anvil app built as native Anvil Forms around a JavaScript 3D engine. A wacky life-sim game played on the player's real neighbourhood (OpenStreetMap via OpenFreeMap vector tiles, real hills from Mapterhorn, a server backup of every tile played): 173 missions at real places, shops, rides, homes, businesses, turf, love and family, plus street life (monsters and silly weapons, traffic lights, shop signs, flirting and sweethearts, street folk and a cardboard crown, pranks, street events) and the main character update (blocks and parries, compliments and hype, Tom Hearton's and grocery outposts, smashing things, borrowed cars, GTA mission letters). Load this before any feature request, bug fix, restyle, content change or deploy for this app, so you can work without re-exploring the code.
---

# City Fun Time: working on the app

**What it is:** A life-simulation game on your real streets, grown from City Coin Run (`Documents/CLAUDE/citycoinrun`). The
player types an address; the streets around it stream in as 3D (buildings, roads, parks, water, house numbers, named shops
from the OpenMapTiles `poi` layer) on their real hills (Mapterhorn) and fill with pedestrians, traffic, pigeons and, at
night, cartoon monsters. A 10-chapter story (85 missions) + 80 side missions happen at real places near home; plus odd jobs,
rush hours, stats, pickups, shops, 7 rides, 7 homes, 15 businesses, 12 crews to win blocks from, 14 friends, a partner, kids,
pets, 84 stickers (14 sets) and **street life** (the "wacky update", 2026-11-11, below). Guests play with a browser save;
members also save to the server, get the Life page and the leaderboard. Pages: landing, play (the game), life, quests,
album, ranks, profile, auth, admin.

**Where it lives:**
- Folder `C:\Users\arkvi\Documents\CLAUDE\cityfuntime-forms\` = the git clone of **github.com/arkulinskis/cityfuntime**.
  "git" layout: the folder *is* the Anvil app; Anvil pulls `master`; pushing is the deploy. Live: **https://city-fun-time.anvil.app**.
- Converted to native Anvil Forms on 2026-11-08 (branch `forms`), merged to master by the user (found 2026-11-11). The old
  JavaScript-template folder `cityfuntime` is retired (its tools/deploy.py refuses to run). The game engine files were not
  rewritten by the conversion: they moved from `assets/` to `theme/assets/`.
- **README.md** lists every feature. **APP_MAP.md** is the code map (regenerate after every change). Keep both up to date.

**What the user wants:** "Use City Coin Run to create a long quest with lots of missions (at least 100)... Populate the
locations with life and NPCs; missions next to real buildings; no GPS path, just a general arrow. Eventually a scooter, a car,
a girlfriend, kids, friends, better and better apartments, service businesses and restaurants. Be creative, make it fun."
And on 2026-11-11: "Make the game more fun. More wacky. Better graphics, more stuff, traffic lights, monsters, weapons,
shenanigans. Businesses have a type and a sign on them, more people around, more cars. It feels a bit slow: make the person
feel alive in the city. Flirtation, avoiding homeless or helping them, maybe becoming the king of the homeless, a harem
around town, certain businesses angry at you and chasing you (but you are always faster)." The user does the detailed play
testing; Claude covers essential tests.
Design (chosen by Claude): **"Sticker City"**: paper #fff6e9, ink #1f1a3d, grape #6b4eff (brand), gold #ffc21f (accent), pink
#ff5c8a, mint #20c997; dark bg #16122e. Fredoka (headings) + Nunito (body). Chunky 2px ink outlines and hard offset shadows,
emoji everywhere (the design check's notes about those are deliberate). The game HUD is always light. Mobile-first: every
page must fit 390 px; the game has touch controls.
**Tone of the wacky parts (keep it):** cartoon, never cruel. Monsters are googly-eyed and pop into coins. Weapons are a
baguette, a rubber chicken, a pillow. Street folk are named neighbours with stories and dignity: the jokes are theirs, never
at their expense, and being rude to them costs you. Flirting is PG. Pranks and angry owners only ever involve **made-up**
shops (see Gotchas: real places).

## Small fixes (play-test notes): the lean path

Use the `/cft-fix` skill: `FIX_INDEX.md` (feature -> function -> knob -> test), `tools/where.py` (exact line ranges:
`--def`, `--toc`, `--tune`), `PLAYTEST.md` (the notes inbox with Open / Done). Balance numbers live in **`D.TUNE`** (end of
cft-content.js: combat, monsters, hype, outposts, smash, world; `D.COMBAT` is an alias of `D.TUNE.combat`; the world gets
`opts.tune`). When you hard-code a new balance number, put it in D.TUNE and the index instead. **Play-test panel**
`theme/assets/cft-debug.js`: only with `?debug=1` (localStorage `cityfuntime.debug`); time, money, level, god mode
(`G.debugGod`, checked in `F.hurt`), spawns, hype, jumps to places; "Copy note info" (`info()`).

## Workflow for any change

1. `git pull --ff-only` (Anvil commits "Edited ..." when the user changes something in the IDE; read those commits).
2. Edit: a page's template and Python side by side (`client_code/Pages/<Name>/`), or the engine in `theme/assets/cft-*.js`.
   After editing anything in `theme/assets`: `python tools/assets.py` (no `-I`: PyYAML) refreshes the `?v=` hashes in anvil.yaml.
3. `python tools/check.py` → **ALL CHECKS PASSED** (anvil validate, JS syntax, asset hashes, server tests, design check).
4. **Game changes:** `node tools/live/content_check.mjs` (every reference in the content) and
   `python -I tools/live/game_test.py [OUTDIR]` (needs internet, 3-5 minutes): serves the engine with `tools/live/harness.py`
   (a plain page, no Anvil), starts a fresh guest game in Montréal's Plateau in headless Chrome with software WebGL and runs
   `gametest.js` (Max, coins, café, bakery, delivery, race, chase, escort, business + rush, moving house, midnight, a turf
   takeover, minigames, every phone app, hills) then `funtest.js` (made-up shops, signs, lights, furniture, speed, monsters,
   weapons, jokes, flirting, a date, street folk, the crown, a prank + chase + ban, peels, trampolines, events, the new missions).
   `--fun` runs only funtest.js; `--shots DIR` stages nine scenes and saves pictures (Read them); `--people DIR` = close-ups of
   the characters (you from the front, a line-up of passers-by in poses, the look editor); `--eval FILE.js` runs your own
   script in the page. Add a check for any new mechanic.
5. **Pages:** `python -I tools/ui_test.py` (Docker Desktop running) → **ALL UI TESTS PASSED** (tools/ui/smoke.js at desktop and
   phone width; `--only a11y.js` / `--only design.js`; `--shots DIR`; server edits need `--restart`; `--stop` when done).
6. Commit only your files as arkulinskis with the Co-Authored-By line; `git push origin master`. New tables or columns: tell
   the user to accept Anvil's **Schema Mismatch** alert with "The schema of the source code is correct".
7. Docs: README, this guide, `python -I APP_MAKER/standard/app_map.py cityfuntime`, `python -I APP_MAKER/tools/libraries.py --app cityfuntime`.

## Architecture

```
anvil.yaml            startup module `startup`; db_schema; services; head_html (fonts, Prepsto, SEO, theme assets with ?v=, and one
                      <meta name="cft-asset"> per engine file: cft-kit.js reads them; tools/assets.py keeps the hashes current)
client_code/          startup.py, router.py (PAGES / NAV / _form), state.py, auth.py, legal.py,
  cft.py              the bridge to the engine: _host_call (CFT.api -> anvil.server.call, JSON text in/out), set_me, prepare, view, mount_game
  Layouts/Shell       header, footer (Submit feedback via Prepsto, Privacy & Terms, arkvital.com, addanapp.com), phone tab bar
  Pages/              Landing, Play (full screen, holds Components/Game), Life, Quests, Album, Ranks, Auth, Profile, Admin
  Items/ Dialogs/ Components/   RepeatingPanel rows, the Mission dialog, Game (mounts the engine) and Bar
theme/assets/
  cft-kit.js          window.CFT: loads the engine files on demand (ALL = three, content, tiles, world, ui, fun, game), the save in this
                      browser (localStorage cityfuntime.save.<user id|guest>) + the server (get_save / put_save), VIEWS = plain JSON for
                      the Life / Quests / Album pages, CFT.mountGame
  cft-tiles.js        TileMaker: MVT/protobuf decoder; process(buf, x, y) -> 4x4 sub-tiles {b buildings, r roads, a areas, wa water, nm, hn, po places}
  cft-world.js        CFTWorld.create({canvas, quality}) -> W: tile streaming, terrain, buildings, roads, trees, the sky, street furniture
                      and parked cars, traffic lights, shop signs, people / traffic / pigeons (W.life), builders (person, animal, vehicle,
                      monster, propMesh, label, emojiSprite), the player + rides + weapon in hand, followers, camera, day/night, effects
                      (W.burst, W.pop, W.shake), minimap + big map, snapshot
  cft-content.js      window.CFT_DATA: everything that is data (see Recipes). The last third is "the wacky update".
  cft-game.js         window.CFTGame: newSave / migrate / summary / missionBoard / reqMet + mount(root, opts) -> {G, destroy}; G = the rules
  cft-fun.js          window.CFTFun.attach(G, api) -> G.fun: street life + combat (see below)
  cft-rpg.js          window.CFTRpg.attach(G, api) -> G.rpg: the long game (loot, talents, reputation...)
  cft-hero.js         window.CFTHero.attach(G, api) -> G.hero: the main character update (hype, swagger, outposts, mission blips, borrowed cars)
  cft-debug.js        window.CFTDebug.attach(G) -> G.debug: the play-test panel (?debug=1 only)
  cft-ui.js           window.CFTUI.create(G, root) -> U: HUD, feed, banners, dialogue, U.choose, phone + 12 apps, panels, minigames, start screen
  app.css             all styles; the game's are the `/* ===== play.html =====` block (.cft-*)
server_code/          Game.py (get_save, put_save, reset_save, leaderboard, admin_players...), Tiles.py (map backup), DemoData.py,
                      Accounts, Admin, Feedback, common, legal_server, seo_routes (SEO kit), SchemaCheck
tools/                check.py, assets.py, ui_test.py + ui/, live/ (harness.py, game_test.py, gametest.js, funtest.js, content_check.mjs,
                      gldrive.mjs = Chrome with software WebGL), testing/test_server.py
```

**The save** (`newSave` in cft-game.js; JSON, ≤ 400k chars; the server stores it whole and validates little): name, look, pref,
home {lat, lon, label, short} (= world origin), apt, pos, money, savings, xp, energy, happy, stats {fit, charm, smarts, style,
cred}, day, clock, bag, owned, equip {head, face, body, back, feet, weapon, hand, wrist, pocket (shop gear by wardrobe slot, since 2026-11-17), ride, lastRide}, m {missionId: {s, st,
p, b, tg, items, deadline}}, track, spots, castAt, vplaces, jobs, dyn, stickers, turf, biz, rel, friends, partner, engaged,
married, kids, pets, counters, metro, log, settings, and **fun** {hearts, king ('King' | 'Queen' | 'Monarch' | null), folk
{id: {day, got, story, asked, total}}, folkAt {id: {lat, lon, yaw, day}}, crushes [{id, name, lat, lon, love, met, seen, talk,
look}], grudges {placeId: bannedUntilDay}, feats {stickerId: day}}. Every position is lat/lon; world x/z are metres from home
(x east, z south). New counters from street life: bonks, bonk_<kind>, boss, weapons (owned now), flirts, sweet (sweethearts
now), dates, dramas, jokes, pedbonks, alarms, helped, dodged, crowned, pranks, escapes, caught, slides, bounces, ufos, crates,
mobs, events.

**Time and money:** 1 real second = 1 game minute (a day = 24 min). Walking 8.4 m/s, sprint 15.5 (`D.WALK`, 2026-11-17), rides in
`D.VEHICLES`. Businesses earn `income × (1 + 0.6 × (lvl-1)) × incomeMul` per game hour. Level: `xpAt(l) = 60 × (l-1)^1.8`.

## The city (cft-world.js): what the wacky update added

- **Sky:** a gradient dome (shader; horizon = fog colour, `SKY_TOP` overhead), sun and moon sprites, stars, clouds that drift
  and wrap around the player. All set in `W.setClock`. At night a warm point light follows the player (`nightLight`).
- **Street furniture** (`layProps(s)` at register time, drawn in `buildSub`): lamps every 34 m (pole, bulb that warms up at
  night, an additive light pool), benches, hydrants, bins, mailboxes, **parked cars** on roads ≥ 9 m wide that aren't major
  (tinted per instance; solid via `carBuckets` / `W.carAt`; landing on a roof bounces: `W.onBounce`). One shared shape per
  kind (`PROP`), one InstancedMesh per kind per sub-tile.
- **Traffic lights:** `nodeAt` collects where driveable segments end; a node with ≥ 3 ends, two of them on a tertiary-or-bigger
  road (four ends, or a major road), not on a bridge and ≥ 75 m from the next light, gets `n.sig`. Ends are grouped by direction
  (`groupEnds`), `sigState(node, group)` = 0 red / 1 yellow / 2 green on an 18 s cycle; cars stop 6-16 m before the node.
  3D per node (`buildSignal`): poles, lamp spheres coloured per instance, zebra crossings. `W.signals()`, `W.signalState`.
- **Made-up shops:** `registerSub` asks `W.makeShop(seed)` (set by the game: kind by `D.SHOP_MIX`, name by `D.shopName`) for about
  24% of buildings (70-2600 m², not within 16 m of a real place, ≥ 26 m apart, at most 14 per sub-tile). They are ordinary
  entries of `W.places` with `made: true, virtual: true`, id `m:<tile>:<sub>:<building>`: the same building, the same shop.
- **Signs:** `updateSigns` builds a sign for every place within 170 m (4 per half second, at most 90; dropped beyond 230 m):
  `W.signList()` gives the places, `W.signInfo(place)` -> {e, name, col} or null (the game hides them where your own business
  sign hangs). `wallFor` picks the wall nearest the place's kerb pin; no wall = a sign on two posts.
- **Life:** up to 44 people (22 low quality) within 125 m and 20 vehicles (9) within 190 m; fewer late at night. Ped types walk,
  jog, kid, elder, skate, bike (`ped.fig` is the figure to animate; `ped.obj` may be a holder with wheels; `ped.ctl = true`
  hands a ped to the game). Traffic kinds: car, suv, sports, taxi, van, bus, truck (ice cream), police; headlights are unlit
  materials so they glow at night.
- **Player:** double jump (`player.jumps`), FOV widens with speed, `W.shake`, `W.setWeapon(mesh name)` + `W.swing()`, `look.crown`.
- **People (2026-11-11, second pass: "higher detail models"; rebuilt 2026-11-17, see The realism pass):** `W.person(look, npc)` builds a rounded figure from spheres,
  capsules and domes (`prims(...)`: `PRIM_HI` for you and the cast, `PRIM_MID` for passers-by, one step down each on low
  quality; about 6,500 / 2,500 triangles). Structure: `body` group → torso mesh, `head` group (turns, nods), four limb pivots
  (`legL/R`, `armL/R`) each holding a second pivot (`kneeL/R`, `elbowL/R`) and a tip (`handL/R`: weapons and the rolling pin
  attach to `handR`). All in `userData`. **Limbs hang down, so a positive `rotation.x` swings them forward; knees bend
  negative, elbows positive.** `W.animate(fig, speed, dt, pose)` resets every joint each call; poses: sit (bench / moped),
  ground (cross-legged on a blanket: street folk), ride, pedal, air, wave, dance; no pose = walk / run / idle (breathing, looking
  around). Look fields: skin, hair, shirt, pants, shoe, h, build, `style` 0-8 (`W.HAIR_STYLES`; without it `long` + `hs`
  pick one), sleeve short | long | none, shorts, dress, hat (a cap), beanie, crown, glasses, beard, bag (a backpack), apron,
  cape, coat, scarf, stripes, logo, phones, collar, tie, mood 'angry' (shopkeepers). Face details sit on the head's curve:
  if you resize the head, move the eyes, brows and mouth z with it. `h < 0.78` = a child (bigger head).
- **Your look:** `playerLook()` in cft-game.js = defaults (tee, jeans, backpack) + `save.look` {skin, hair, shirt, style, glasses,
  beard, pack} + what you wear (outfit colour and details, shoe colour, headphones, helmet, crown). `U.lookEditor()` (phone →
  Settings / Me) edits `save.look` live; `W.showOff = true` turns the avatar to the camera and brings the camera close.
- **Monsters and props:** `W.monster(kind)` + `W.animateMonster`; `W.propMesh(name)` (weapons, blanket, cart, peel, pad, ufo, crate...).

## Street life (cft-fun.js)

`G.fun = CFTFun.attach(G, api)` runs once the world has loaded (cft-game.js `startWorld`). The game calls into it at a few
marked places: `tick`, `interaction(p)` (street folk, sweethearts, a flash mob to join), `pedMenu(ped)` (E on a stranger),
`shopGate(place)` (a shop that banned you), `prank(place)` (the shop panel's button), `attack()` (F, the 🖐️ button, a click with
the mouse captured), `newDay(parts)`, `markers(list)` (minimap), `summary()` (the phone's Street life app), `speedMul()`,
`happyBonus()`, `fortune()`. Nothing starts before the first mission (`c1-couch`) is done.

- **Monsters:** `D.MONSTERS`; 5 out at once after 21:30 (3 on low quality), none within 30 m of home, gone at 5:00. They wander,
  chase within 17 m, `touch` = grab `steal` coins (carried, returned when bonked), back off, come again. King Blob spawns
  when "Long Wobble the King" is active (or rarely from level 6). `F.spawnMonster(kind, x, z, {event: seconds, aggro})`.
- **Weapons:** items with `weapon: {dmg, reach, knock, stun, mesh, word, puff, ranged: 'cone' | 'shot'}` for `equip.weapon`;
  `D.SLAP` for bare hands. `F.attack` hits monsters in an arc, stuns chasers, bonks a passer-by (a pillow starts a pillow
  fight) or sets off a parked car's alarm.
- **Strangers:** joke (charm-based), flirt (chance = 0.3 + charm × 3.5% + style × 1.5% + happiness; blocked when married; a
  partner walking with you sees it). Success = a crush in `save.fun.crushes`, drawn as an actor at their spot (`F.sweet`).
  Menu: sweet talk (once a day), gift, walk (150 s; reaching a café / restaurant / ice cream / park / cinema / lounge /
  bakery / museum = a date), break up. `newDay`: love −6 when not seen for more than a day, gone at 0; gifts at love ≥ 55.
- **Street folk:** `D.STREETFOLK` (10 personas); 3 sit on kerbs within ~200 m (`kerbSpot`), a spot per persona per day. Some
  walk over once a day (`a.up`); walking away counts as `dodged`, nothing else. Menu: $2 (+1 heart), $10 (+3), food (+2),
  listen (+1, once a day), not today, "Get a job!" (−3 hearts, −cred). At most 4 hearts per persona per day. `D.CROWN_AT`
  (40) hearts = `crown()`: title choice, `look.crown`, +2 cred, daily tribute, gems on the minimap, the royal guard.
- **Chasers:** `chase({...})` runs angry shopkeepers (and furious sweethearts) straight at the player at 86% of the player's
  *walking* speed, capped: **always slower** (the user's rule). `F.prank(place)`: only `place.virtual` shops; four pranks
  (`D.PRANKS`); escape (22 s or 60 m) = `escapes`, a 2-day ban in `grudges`; caught = a small fine, no ban. Banned shops chase
  again when you pass within 15 m, and so do made-up shops of the same trade as a business you own (`D.RIVALS`).
- **Props:** 6 banana peels (run over one at > 4.5 m/s: ×1.7 speed for 2.4 s) and 3 trampolines with air coins within ~200 m.
- **Events:** `D.EVENTS`, one every 55-100 s of play (`F.startEvent(id)`): moneyrain, flashmob, ufo, goose, slimes, crate,
  dogs, pigeonzilla. An active "Close Encounter" mission makes the next event a UFO.
- **Feats:** the `shenanigans` sticker set (`feat: true`: never in packs or swaps) is given by `feat(id)`.
- **Tests:** `window.CFT_TEST.calm = true` stops everything that starts by itself (night spawns, events, folk walking over,
  rival chases); gametest.js runs calm, funtest.js switches it off where it needs to.

## The long game (cft-rpg.js, 2026-11-11: "what made World of Warcraft addictive? apply it")

`G.rpg = CFTRpg.attach(G, {spawnPickup})` (after G.fun). Data `D.RPG` (end of cft-content.js); state `save.rpg` {rested, loot[],
eq {c1, c2, c3}, tal {}, rep {}, seen {}, ach {}, title, titles[], streets[], blocks[], pending[], pity, n, rares {}, grants {}}.
- **The principles applied** (and the ones left out on purpose): goals at every timescale (next pickup, step, level, tier,
  title); unpredictable rewards with a floor (rarity rolls + a pity timer); visible numbers going up (stats on charms, XP bar,
  rep bars); choice and identity (talents, titles, reward picks); discovery rewarded (streets, blocks, chests); rare surprises
  (named rares, events); being seen (titles, leaderboard); **rested XP as a reward for breaks**. Left out: anything that
  punishes absence (no streaks, no decaying rewards except sweethearts' slow fade), timed fear-of-missing-out, raids that need a
  schedule, pay-to-skip. Keep it that way.
- **One bonus aggregator:** `R.bonus(key)` = talents + equipped charms (`stat_<id>` and perks) + faction tier rewards, cached 2 s
  (`R.mark()` after changes). Keys: stat_fit/charm/smarts/style/cred, coin, discount, income, turf, xp, monsterXp, loot, interest,
  sell, rep, flirt, happy, fade, forgive, tips, dmg, crit, speed, steal, drain, rare. The game reads them at marked places
  (stat(), G.discount, G.incomeMul, G.turfIncome, speedMul, happyTarget, savings interest, energy drain, coin pickups) and
  street life reads dmg/crit (`R.modWeapon` in attack), steal, flirt, fade, forgive.
- **XP sources:** `addXp(n, src)`: 'quest' (mission rewards: never doubled by rest), 'monster', 'explore', or none.
- **Reputation reads counters**: `repTick` compares `save.counters` with `rep.seen` every second, so any new counter can feed a
  faction by adding it to that faction's `gain`. The first run counts earlier play quietly.
- **Achievements** are data: `{k, c}` = a counter or a special from `val(k)` reaches c. Titles come from achievements and Exalted.
- **Loot:** `R.drop(source)` (SOURCES: monster, pigeon, rare, boss, chest, crate, quest), `R.make(q, itemLevel, opts)`, `R.add`.
  Stat budget `(0.5 + il × 0.11) × quality multiplier`. Bag 30: full = the worst unworn item is sold.
- **Rares:** `R.spawnRare(entry)` through `G.fun.spawnMonster` with an overriding `def` (`def.rare`); `R.onKill(m)` from
  hitMonster. 5% chance every 15 s when none is out (doubled by Legend of the Night).
- Tests: `tools/live/rpgtest.js` (`game_test.py --rpg`; also runs last in the full test). Pictures: `--long DIR`.

## Combat (Diablo-style, 2026-11-11: "fight monsters native to the city... a health bar and a respawn... big monsters at every metro")

- **Framing (keep it):** an ordinary person in a new city; the city's noise sometimes takes shape as *figments* only they see
  ("the Static"). Kind and light, no clinical labels; passers-by are friendly about it (`D.STATIC_LINES`); a good mood means
  fewer figments; Max's side story `s-static` ends on friends, sleep and talking. Don't turn it into mockery of mental illness.
- **Monsters** (`D.MONSTERS`, 15 kinds, models in cft-world.js `W.monster`): `atk` = health lost per hit before armour,
  `steal` only for grabbers. Local names: `F.localName(kind)` = `D.CITY_MONSTERS[city][kind]` when home is inside a `D.CITIES`
  box, else a pick from `D.MONSTER_LOCAL[kind]` by home coordinates. `spawnMonster(kind, x, z, {def, lvl, champ, hp, atkMul,
  size, event, aggro, home, leash, guard, nightBorn})` scales hp by `1 + 0.18 × (level − 1)` and atk by `1 + 0.1 × (level − 1)`;
  level = `F.monsterLevel(x, z)` = your level − 1 + one per 400 m from home (max yours + 4). Player damage × `1 + 0.15 × (level − 1)`.
  Spawner: night 5 (low 3), day 2 (low 1, never within 90 m of home), × 0.6 when happy ≥ 75, × 1.4 under 30; 7% champion packs from
  level 2. Sunrise clears only `nightBorn` ones.
- **Health** (`save.fun.hp`): `F.maxHp()` = 60 + 8 × level + 3 × Fitness + loot `life`; `F.hurt(n)` applies armour
  (`n × 100 / (100 + armor)`); 2.5%/s back after 5 s untouched; `addEnergy` heals 0.7 × the energy (all food); sleep heals fully;
  `F.quaff()` (Q) picks the bag item closest to what's missing (`heal` items: tea, juice, smoothie, bandage). `die()`: 10% of
  pocket money into `save.fun.wallet` (a 👛 pickup where you fell), comes to via `G.travel` at the nearest freed station or home.
- **Guardians** (`D.GUARDIANS`): `guardTick` spawns one per station (entrances within 90 m share it) when you're within 70 m of
  an unfreed real metro entrance; size 2.4, hp `base × 8 + 8`, atk × 1.3, leash 30 m (walks home and heals beyond it), despawns
  beyond 140 m. Killed = `freeStation` → `save.fun.cleared`, `G.visitMetro` (the old "visit to unlock" now needs this), Epic+ loot.
  `F.metroOpen(place)` gates the stairs (cft-game.js findInteraction + visit steps); stations visited before this update stay open.
- **Gear** (cft-rpg.js `makeGear`, `D.RPG.GEAR` / `GEAR_AR` / `GEAR_COLS` / `PREFIX`): slots weapon, head, body, feet, hand (+ charms
  c1-c3); they share the wardrobe's one-per-slot rule with shop gear (see The wardrobe). Items carry `slot, base, col` and `ar` / `lf` / `sp` / `dmg`; `R.lookParts()` feeds `playerLook()` (a crown still wins
  over a hat); `R.weapon()` replaces the shop weapon in `F.weapon()` (one weapon at a time: buying or picking a shop weapon
  unequips the loot one, equipping loot clears `save.equip.weapon`).
- HUD: health chip (first), the foe bar `U.foe(info)`, red edge `U.hurt()`, the 🍵 button. Tests: `tools/live/combattest.js`
  (`game_test.py --combat`, last in the full run); pictures `--monsters DIR`.

## The main character update (cft-hero.js + combat in cft-fun.js + world in cft-world.js, 2026-11-17)

The user: "move faster by default; upgrade graphics, more polygons; fighting needs blocks and an ability to anticipate an
attack, so there is both chance and skill; the player needs to feel their ego massively boosted: other characters flirt and
give compliments, a lot of text across the screen for the dopamine hit (this is for people having a tough time after work);
missions on the map with an arrow and a big letter like GTA; wear gear, find it or receive it; Tim Hortons (named Tom
Hearton's) and grocery stores to take over for energy and health (Far Cry); destroy things, they stay destroyed for the session;
Diablo 2 monsters + gear, GTA missions slowly disclosed + cars destroying things, Far Cry outposts."
- **Tone (keep it):** relentlessly kind. Compliments and flirts are PG and never about bodies; people cheer, never mock.
  Settings → "Compliments and hype" Max (default) / Some / Off (`save.settings.hype`).
- **Combat** (cft-fun.js, data `D.COMBAT`): `windUp(m)` when a chaser is within `m.r + reach * 0.85` → `m.wind` (0.55-1.05 s,
  longer for big ones) with `m.tele` (❗ label) and `m.ring` (shrinks to the reach, gold in the parry window) → `strike(m)`:
  out of reach = dodge; `F.blocking` = block (`F.blockPower()`, 22% guard break for champions/guards/bosses/rares, 6% others);
  blocking started within `F.parryWindow()` before the strike = parry (stun 2.2 s, `F.counter` armed 3.5 s: next hit ×2.5);
  else a 5%+ lucky dodge, else `touch(m)` (the old hit + coin grab). `m.recover` after a strike: hits are OPENINGS (×1.35).
  Combos within `comboT`; aim assist + lunge in `F.attack`. Contact alone no longer hurts. `F.setBlock(on)` from cft-ui.js (G,
  right mouse, the 🛡️ button). `W.blocking` slows you to 45% and raises fists/shield (cft-world.js updatePlayer). Driving at
  > 7 m/s into a figment hits it (`runover`). Tests set `CFT_TEST.noLuck` to switch off the dice.
- **Smashing** (cft-world.js): every lamp, bench, bin, hydrant, mailbox, tree and parked car is in `propBuckets` (`indexProp`
  at register time; `s.inst[kind]` = its InstancedMeshes, instance i = item i). `W.propNear`, `W.hitProp(e, dmg, dir)` ->
  'hit' | 'smashed' | 'wreck' (`PROP_HP`), debris chunks, hydrant geysers, wreck fires, a falling tree. `smashed` (a Map in the
  world) = session only: a new visit builds a new world. Rebuilt sub-tiles re-apply it in `inst()`. cft-fun.js `smashProp`
  adds counters (`smash`, `carsmash`, `wrecks`), coins, words. `W.onDriveHit` (set by cft-game.js) smashes what you drive into.
- **Borrowed cars:** `W.borrowable(x, z, r)`, `W.borrowCar(pc)` hides the parked instance; `G.hero.borrow` sets a drive ride
  without touching `save.equip.ride` (nothing saved); V (`G.toggleRide`) → `G.hero.park()` → `W.parkCar` leaves a loose car
  (collidable, borrowable, smashable). `setRide` parks a borrowed car first.
- **Outposts** (`D.OUTPOSTS`): `W.placeFix` (cft-game.js startWorld) renames every Tim Hortons (`D.HEARTON_RE`) to "Tom Hearton's"
  and makes cafés/fast food among them kind `hearton`; made-up ones come from `D.SHOP_MIX` (`D.shopName('hearton')` is always
  the chain name). Every `hearton` and `grocery` place starts occupied: within 62 m `spawnPack` (3-6 + a captain, leash 26 m,
  `m.outpost` = place id); far away the pack despawns. Last one down → `liberate`: `save.hero.out[id]` (+ `outKind`),
  `H.energyBonus()` (read by `G.maxEnergy`) / `H.hpBonus()` (read by `F.maxHp`), capped by `D.OUTPOSTS[kind].cap` (100 / 150:
  a city has dozens of groceries), free item, a chest drop, a party. At most two packs at once (`packs.size`).
  `H.placeGate(pl)` = the E prompt (occupied / free treat once a day in `save.hero.free`). `H.signInfo` shows 😈 / ⭐ on signs.
- **The hype** (`D.HYPE`): `H.word(text, tone, sub, big)` (DOM `.cft-hw`, max 3), `H.ticker(text, who, emoji)` (`.cft-tk`, three
  lanes sliding across), `H.event(name, o)` from the game: kill (streaks), parry, dodge, block, combo, smash, mission, level.
  Ambient compliments every 6-11 s (Max), fans (`save.hero.fans`) every 80-140 s, admirers' gifts (gear incl. shields) every
  170-260 s, both by a passer-by who runs over (`ped.ctl`). Swagger `save.hero.swag` 0-100 → `mainMode()` 25 s:
  `H.speedMul()` 1.25 (in `speedMul`), `H.dmgMul()` 1.5 (in `F.attack`), a golden point light on the avatar.
- **Mission blips:** `H.letterOf(spot)` = the giver's initial (titles like Officer/Chef dropped). 3D: a beam + a big letter label
  per open spot within 1.1 km (`updateBlips3D`); DOM pointers (`.cft-blip`) for the tracked goal + the 4 nearest, clamped to the
  screen edge with an arrow (`W.project`). Minimap/big map: markers with `letter` (drawn by `W.drawMinimap` / `W.drawMap`; edge
  markers get an arrow). Quests page: `mystery()` in cft-kit.js shows "???" for locked missions whose requirements are not yet
  open or done.
- **Shields:** gear slot `hand` (`D.RPG.GEAR.hand`, `it.blk`, bonus key `block`), drawn by `W.shieldMesh` on the left forearm
  (`look.shield` from `R.lookParts`), raised by the block pose.
- **Graphics (high quality only; low keeps the old look):** 4096 shadow map where the GPU allows + a fill light; 512 px window
  texture; walls darken towards the ground (two bands in `addWalls`); `cornice()` ledges (roof line, above shopfronts) in the
  roofs geometry; pavements (`KERB_Y` 0.13 above the ground, skipped where another road crosses) and edge lines; trees,
  parked cars and traffic: see The realism pass;
  lamp halos (`MAT.halo`); CSS vignette + `saturate/contrast` on the canvas (not on touch devices).
- **Ground photo textures (2026-11-17, user: "better flooring terrain... sidewalks, roads, grass look more high detail"):**
  8 Poly Haven CC0 photos in `theme/assets/ground-*.jpg` (asphalt_02, concrete_pavement, leafy_grass, forest_leaves_02,
  pavement_03, sand_01, grass_path_3, concrete_floor_01; 1024 px, AO baked in, ~2.4 MB) made by `tools/ground_textures.py`.
  cft-world `TEX` / `TL` / `groundify` / `loadGround`: one `DataArrayTexture` (WebGL2 only; without it, or before the photos
  load, the ground stays plain colours), patched into `MAT.drape` + `MAT.terrain` with `onBeforeCompile`. Drape geometry is
  `new Geo(false, true)`: set `geo.layer = TL.x` before adding a surface (`AREA[k][3]`, `ROAD_STYLE.*.l`); `geo.fr` lays the
  photo along a street (pavement slabs start at the kerb and run on across segments), null = world x/z. The shader divides
  each photo by its average colour, so the vertex colours still decide the palette; `TEX[i].real` mixes in the photo's own
  hue, `k` = detail strength, `m` = metres per photo (their real size). A second, 14x larger sample breaks up the repeat.
  Every mesh drawn with MAT.drape/terrain must carry `glayer` + `guv`. Both quality levels get them (low = 512 px).
  Pictures: `game_test.py --ground DIR` (`W.findArea(kinds, minArea)` finds a park/plaza to stand in).
- **Outposts never spawn within 90 m of home** (home is calm). The older suites set `CFT_TEST.outposts = false` (with ~70
  groceries in reach, packs joined their night-monster checks and knocked the tester out); herotest.js turns them on.
- **A new mission's giver must already have met you** and should use that person's usual spot (`at`): a second spot key for
  the same person (e.g. `rosa@home` next to `rosa@bakery`) puts two copies of them in one place and E talks to the wrong one.
- **Tests:** `game_test.py --hero` (herotest.js, also last in the full run); pictures `--heroshots DIR`.

## The realism pass (2026-11-17: "change the 3d models to be more realistic, characters around the world, vegetation, cars.. make it more realistic. but keep the sillyness")

All in cft-world.js. Screenshots of every model up close: `game_test.py --models DIR` (faces, the silly extras, every
vehicle, silly roof loads, the four trees and the bushes, animals, a street). Frame cost: `W.renderInfo()` after
`W.render()` = {triangles, calls} of the last frame (shadow pass included).
- **People** (`W.person`): about six and a half heads tall (a little cartoon left in the head and the eyes). `torsoGeo(look)`
  turns the torso ring by ring (rows of [y, half width, half depth, z offset, trousers?]; `at(y)` gives the front / back
  surface, use it to place anything worn on the body); `look.fig` 0-1 (straight -> curvy) and `look.build` (a belly over 1.04)
  shape it. Limbs are lathes (`LIMB`: thigh, shin, upper, fore, and `sleeve` = a short sleeve or shorts leg over a limb).
  Pivots: hips (±0.092, 0.92), thigh 0.44, shin 0.41; shoulders (±(0.19 - 0.018 fig), 1.425), upper arm 0.29, forearm 0.26;
  `handL/handR` sit in the palm (0.075 below the wrist); arms rest at `ARM_Z` (0.11 rad) out. Head group at 1.535: skull, jaw,
  chin, ears, nose (bridge, tip, wings), eyes (white, iris = `look.eye` or `EYES`, pupil, glint, upper lid; angry = lower
  lids, slanted brows), lips. Hair, hats, the crown and headphones are still built round the old big head in a separate Merge
  (`hr`) and fitted onto the skull with `hm.addMerge(hr, 0, 0.0316, 0.005, 0.5, 0.5625, 0.566)`: add new hair styles in the
  old coordinates. Merge got `addRaw(geo)` (keeps a geometry's own vertex colours) and `addMerge(other, x, y, z, sx, sy, sz)`.
  Triangles: passer-by about 2,900-3,500 (funtest checks < 3,600), you about 8,300.
- **Silly extras (`look.silly`, `W.SILLY`):** propeller beanie (spins faster as they walk: `userData.prop`), party hat,
  traffic-cone hat, antlers, a giant moustache, nose-and-glasses, a flower behind the ear, a rubber-duck ring, a balloon
  (`userData.balloon`, in the left hand), a baguette under the arm. `W.randomLook` gives one to about one passer-by in eleven;
  never to you (`playerLook` sets `silly: null`). `look.tuck` = shirt tucked in with a belt, else an untucked hem.
- **Trees** (`TREE[k]` = {trunk, crown}, `treeKind(x, z, where)`): 0 broadleaf, 1 linden, 2 spruce, 3 birch; streets are mostly
  broadleaf + linden, woods mostly spruce, parks a mix; about 7% of broadleaf are a red maple. Crowns = `leafShell` clumps
  (normals out from the crown's centre, darker underneath). `s.treeK` = the kind per tree; each kind has its own InstancedMesh
  pair (`im.userData.sp` = kind) and the smash index's `e.i` is the index within that kind (`e.sp`). `W.treeMesh(k)`.
- **Bushes** (`BUSH`: 0 round, 1 flowering + `FLOWERS`, 2 a topiary duck in parks; `s.bushes` = x, z, kind, yaw): between street
  trees on residential streets, undergrowth in woods, parks. Not smashable, no collision. High quality only. `W.bushMesh(k)`.
- **Cars** (`CAR_SPEC`, `carShape(m, spec, paint, glass, fine)`): a side profile per body style (hatch, sedan, suv, sports,
  van with `panel` sides, bus) extruded with rounded edges (`extrudeSide`; shape x runs from the BACK so the nose ends at -z),
  narrowed towards the roof and rounded in plan (`carShapeX`), a glasshouse with pillars, wheel wells, tyres (`WHEEL`) with
  rims (`fine` = spokes + hubs: traffic only), plates, grille, mirrors, handles; `carLights` adds the lights (glowing on
  traffic). Kinds: car = hatch, taxi / police = sedan, truck = the ice cream van. Parked cars: three styles, `pc.sp` 0 hatch /
  1 sedan / 2 SUV, drawn from `P.car0..2` (`P.car` still lists them all for tests); `carAt` lengths follow the style.
- **Silly traffic (`W.SILLY_CARS`):** about one car in twelve has roof rails and a giant rubber duck, a mattress, a sofa, a
  Christmas tree, a canoe or a tower of suitcases (`W.vehicle(kind, colour, {silly})`).
- **Animals** (`W.animal`): rounded dogs (snout, floppy ears, tongue), cats (pointed ears, curled tail), pigeons and ducks
  (breast, wings, beak). Same userData as before.
- **Level of detail (high quality):** beyond `LOD_R` (140 m, 20 m hysteresis) a sub-tile shows `TREE_LO` and the box cars
  (`PROP.carLo` / `vanLo`) and hides bushes: every InstancedMesh with `userData.lod` 'hi' / 'lo', switched by `lodSub` /
  `updateLod` (every 0.4 s). Smashing updates both (setInstance). Measured in the Plateau: about 2.5M triangles a frame
  (the old models 1.9M), ~500 draw calls. If a real GPU stutters: lower `LOD_R`, or drop bushes on residential streets.

## The wardrobe (2026-11-17: "show the character with slots, so people have to make a choice between two types of items for the same slot")

- **Rule:** every slot in `D.WEAR_SLOTS` (head, face, body, back, feet | weapon, hand, wrist, pocket; `side` L/R = which column)
  holds ONE thing: a shop item in `save.equip[slot]` or a loot piece in `save.rpg.eq[slot]`, never both. Shop gear's `slot`
  is a wardrobe slot id (content_check insists, and that every slot has something that fits). `G.wearShop(id)` clears the loot
  piece (`R.unequip(slot)`), `R.equip(id)` clears the shop piece (`delete save.equip[slot]`), `G.takeOff(slot)` clears both.
  Loot drops auto-equip only into a slot with neither (`add` in cft-rpg.js); buying shop gear wears it straight away.
- **Reading:** `G.wornIn(slot)` -> {src 'shop'|'loot', id, it, n, e, q}; `G.slotOptions(slot)` = worn first, then owned shop
  gear, then spare loot (`R.spare(slot)`, best first; `R.spare('c1')` = charms); `G.wearFx(opt)` = comparable numbers (stats,
  armour, life, speed %, block %, bonk) for the green/red chips. Shop gear `speed` counts from any slot (shoes, fitness band).
- **Screen** (`U.wardrobe(slot)` in cft-ui.js, phone → Wardrobe, key I, Me app slot buttons, Bag/Character cards): an overlay
  (`.cft-wardwrap`, pointer-events only on its panels) over the live avatar with `W.showOff = true`; slot buttons (`slotBtn`:
  quality-coloured border for loot, grape for shop, pink count badge when more than one thing fits), charms row, a sheet
  (`wardPick`: options with Wear/Swap/Take off; `'spare'` = unworn loot with sell + sell junk). The old Character "What you
  wear"/"Bag" lists and the Bag app's Gear list were replaced by cards that open it.
- **Old saves:** `migrateWear` (in `migrate`) renames outfit/shoes/hat/acc/phone/bag to the new slots (acc splits by item:
  headphones/fake nose -> face, watch -> wrist, camera -> hand) and where loot and shop shared a slot, the loot stays on.
- **New wardrobe slot:** an entry in `D.WEAR_SLOTS` + `D.RPG.SLOT_NAMES`, at least one shop item (and a seller) or loot base,
  and its look in `playerLook()` if it shows. Tests: the wardrobe block in herotest.js (`game_test.py --hero`).

## Boroughs (2026-11-17: "all neighborhoods look the same... a filter on each distinct neighborhood... by borough... identify the borough on the hud")

- **Where the names come from:** the `place` layer of the zoom-11 OpenFreeMap tile (`TM.places` in cft-tiles.js; ~14 km
  across, one per area, cached in IndexedDB as `11/x/y`, never sent to the server backup). Class `suburb` = Montréal's 19
  boroughs, New York's five, Paris's arrondissements (plus some quartiers), and `town`/`village` points compete with them;
  `city` points are only the fallback beyond `BORO_R` (6 km). `pumpBoroughs` loads the tile under the player and the
  neighbour within 3 km of an edge (metro trips far away load theirs).
- **Which borough a spot is in:** the nearest point (a Voronoi guess; real borders aren't in the tiles). `W.districtAt(x, z)`
  -> `{ n, c, look }`; `W.districts()` lists them. Good enough for a HUD and colours; near a border it can be off by a block or two.
- **Looks** (`LOOKS` in cft-world.js, 12 of them, `W.LOOKS`): `a`/`b` banner + HUD colours (`ink` = readable text colour),
  `wall` (walls lerp toward it by `BORO_MIX` 0.5, ± jitter), `roof` (pitched roofs 60%, flat roofs 45%), pavements 35% toward
  the wall colour (`pc`), kerbs painted in `a` stripes every 2.5 m, centre lines in `line` colour + `dash` pattern
  (dash/long/dots/double; residential streets get them too inside a borough), tree crowns `tree` [h,s,l] on 7 in 10 trees,
  a banner on every lamp post (`PROP.banner`, instance i = lamp i so smashing hides it), building fill on the minimap/map,
  name pills on the big map. `assignLooks`: the name's hash picks a look unless a borough within 9 km has it, then the look
  whose nearest twin is furthest (ordered by name, so the same boroughs keep the same looks every visit).
- **Late names:** sub-tiles built before the names arrived (or whose borough changed) go into `boro.stale` (`s.looks` =
  signature of corners + centre) and are rebuilt in place in `pumpTiles`, inside the frame budget.
- **HUD + discovery:** chip `[data-boro]` under the clock (cft-ui hud tick, `--boro` / `--boro-ink`); `boroughTick` in
  cft-rpg.js (every second from `explore`): 3 s inside a new borough -> banner in its colour (`U.banner(..., 'boro', look)`),
  first visit ever = discovery XP (60 + 10/level) and `save.rpg.boros`; achievements `bo3` Borough Hopper, `bo8` Every Colour
  of the City (title "the Local Everywhere"). Home borough on day one counts quietly.
- **Tests:** `game_test.py --boro` (borotest.js, also last in the full run); pictures `--boroshots DIR`.

## Recipes

- **New page:** copy a similar `client_code/Pages/<Name>/`, register it in `client_code/router.py`; new field on Life / Quests /
  Album = add it to that function in cft-kit.js `VIEWS`, then show it in the Form.
- **New server function:** `@anvil.server.callable` in the matching module (+ `C.require_user()` / ownership), a test in
  tools/testing/test_server.py. **New table or column:** `db_schema` in anvil.yaml, the test mock, then the Schema Mismatch step.
- **New mission:** `M(id, chapter, title, giver, at, req, intro, steps, outro, reward)` in cft-content.js (chapter 10 = side
  stories via `S(...)`). Steps (`do`): go, talk, collect, deliver, buy, have, stat, level, own, pay, escort, chase, race, photo,
  visit, dance, quiz, sleep, walk, chat, tag, defend, rush, **count** (`key` = a counter, `n`, `abs: true` when the counter is
  a "right now" number such as `sweet`, `weapons`, `crowned`). Text tokens {name} {place} {n} {pt} {he} {him} {his} {kid} {biz}.
  Keep ids stable (saves hold them). Then `node tools/live/content_check.mjs` and the game test.
- **New step type:** beginStep, updateMissions, stepGoal, G.stepText, triggerStep, findInteraction in cft-game.js; stepLabel in cft-kit.js.
- **New shop item:** `D.ITEMS` + a `KINDS[...].sells` list (gear: `slot` = a `D.WEAR_SLOTS` id; it shows in that slot's list). **New weapon:** an item with `weapon: {...}`, a shape in `W.propMesh`,
  its name in content_check.mjs `MESHES`. **New monster:** `D.MONSTERS` + a branch in `W.monster` / `W.animateMonster`.
- **New place kind:** `D.KINDS` (+ `D.SIGN_COLS`, + the mapping in cft-tiles.js for real places, or `D.SHOP_MIX` + `NAME_B` for made-up ones).
- **New street event:** `D.EVENTS` + a branch in `startEvent` and `updateEvent` (+ its id in content_check.mjs).
- **New monster:** `D.MONSTERS` (+ `atk`, `steal`), a model branch in `W.monster` (+ `W.animateMonster`), names in
  `D.MONSTER_LOCAL` and every `D.CITY_MONSTERS` city (content_check.mjs insists). **New city's names:** a `D.CITIES` box +
  `D.CITY_MONSTERS[id]`. **New gear base:** `D.RPG.GEAR[slot]` (head/body need a `look`).
- **New achievement / faction / talent / rare:** an entry in `D.RPG.ACH` / `FACTIONS` / `TALENTS` / `RARES`; a new bonus key
  also needs reading where it applies. **New loot source:** `D.RPG.SOURCES` + a `G.rpg.drop('name')` call.
- **New hype line / word:** `D.HYPE` lists ({name} = the player's name). **New outpost kind:** `D.OUTPOSTS[kind]` (+ a captain
  name in `D.OUTPOST_CAPTAIN`; a bonus `what` other than energy/health needs reading in `H.energyBonus`/`H.hpBonus`).
  **New smashable kind:** a list in `layProps` via `put(kind, ...)`, `PROP_HP`, `DEBRIS_COL`, `SMASH_FX`, drawn by `inst(kind, ...)`.
  **New shield:** `D.RPG.GEAR.hand` + a case in `W.shieldMesh`.
- **New street person:** `D.STREETFOLK` ({id, n, e, hi, story[2], look}); props per persona in `spawnFolk`.
- **Balance:** prices in ITEMS, BUSINESSES income/cost, mission rewards, `D.MONSTERS` (speed below `D.WALK.run`: the content
  check insists), chaser speed in `updateChasers`, event pace `eventT`, spawn counts in cft-world.js `life`.

## Hills (Mapterhorn) and the map backup

- Terrain lives in cft-world.js ("terrain" section): Terrarium WebP tiles, zoom 15, world y = (elevation − elevation at home) × 1.5.
  `W.groundAt(x, z)` = the surface, `W.surfaceAt` = ground or a bridge deck, `W.elevAt` = real metres. **`W.heightAt` is the
  building height (0 = open ground), not the ground.** Anything placed in 3D uses `W.groundAt` / `surfaceAt` for y.
- Map backup: every tile a browser loads is sent to `tile_archive` in batches of 8 (`CFT.tiles`); when a service doesn't
  answer, the world asks `tile_backup` (server_code/Tiles.py; cap 3,000 MB; Admin > Map backup).

## Gotchas

- **Tim Hortons is always "Tom Hearton's"** (the user's rule, for legal reasons): never show the real name. Outposts are
  liberations (figments occupy the place; staff thank you), never mockery of the business.
- **Real places are real businesses.** Shops from the map carry real names: never write content that mocks one, and keep pranks,
  bans, angry owners and rivals on `place.virtual` (made-up) shops only. The Terms say the game puts fiction near real places.
- **three.js is r149.** It keeps one shader per material, so a material shared by InstancedMeshes with and without per-instance
  colours draws them all untinted: tinted instances have their own material (`MAT.tint`, `MAT.signal`, `MAT.crown`). It also
  never frustum-culls an InstancedMesh: per-sub-tile instances sit at the sub-tile centre on a `cullGeo` wrapper (a big shared
  bounding sphere). Shared geometries are in `SHARED` so dropping a sub-tile doesn't dispose them.
- **Software WebGL is slow** (0.5-1.5 s a frame): tests set `CFT_TEST.norender` and step with `G.stepSim(n)`. The page's own
  frame loop then lags, and `W.controls.enabled` can be stale (false from an overlay long closed): tests that press keys set it
  themselves (`hands()` in funtest.js). Never `await` a game action that opens a dialog in a test: start it, then `drain()`.
- Line endings are LF everywhere (the engine files came over with CRLF and were normalised on 2026-11-11).
- Never put `data-go` on a game button (the app shell treats it as page navigation). `U.ask` must resolve before closing its overlay.
- Phone overlays pause the game clock (`U.isOpen()`); `G.interact` does nothing while an overlay is open or `rt.busy`. Every
  menu in cft-fun.js wraps itself in `api.setBusy(true)` ... `finally { api.setBusy(false) }`.
- Finished odd jobs and rush orders are deleted from save.m / save.dyn: test them by `!s.m[id]`.
- Poster spots must be reachable (`spotReachable`); made-up shops count as used buildings for new homes and businesses.
- The local App Server (ui_test.py) has no map tiles unless the browser has internet; the smoke test only needs the engine to mount.
- Music: `MUSIC` + `music(dt)` in cft-game.js, player `window.ArkMusic` = `theme/assets/ark-music.js` (written by
  `APP_MAKER/tools/music_sync.py`; never edit the copy).

## Privacy & Terms (legal kit)

The documents come from `C:/Users/arkvi/Documents/CLAUDE/APP_MAKER/legal-kit` (`apps/cityfuntime.json`). Don't edit
`theme/assets/legal-kit.js`, `client_code/legal.py` or `server_code/legal_server.py` here: change the kit, then
`python -I build.py cityfuntime && python -I install.py cityfuntime` there, `python tools/assets.py` here, and deploy.
Providers: anvil, google_fonts, openfreemap, mapterhorn, nominatim, photon, youtube_play, arkvital_media. Guest mode on;
location permission optional ("Use where I am"). Street life added no personal data: sweethearts, street folk and shops are
made-up characters kept inside the save. Ages 16+ (kit default); flirting stays PG.

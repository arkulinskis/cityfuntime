---
name: cityfuntime
description: Context, workflow and recipes for City Fun Time (folder cityfuntime-forms), the user's Anvil app built as native Anvil Forms around a JavaScript 3D engine. A wacky life-sim game played on the player's real neighbourhood (OpenStreetMap via OpenFreeMap vector tiles, real hills from Mapterhorn, a server backup of every tile played): 178 missions at real places, shops, rides, homes, businesses, turf, love and family, plus street life (monsters and silly weapons, traffic lights, shop signs, flirting and sweethearts, street folk and a cardboard crown, pranks, street events) and the main character update (blocks and parries, compliments and hype, Tom Hearton's and grocery outposts, smashing things, borrowed cars, GTA mission letters) and the chaos update (decor everywhere, mayhem meter, ranged weapons and shooters, flying, the Dex, toys, meme humour) and the campaign update (a 3-minute immortal opening, a crazy list switched on mission by mission, at most 5 missions on the map, ammo, water/lightning/extinguisher powers, fire, storms, MEGA figments, secrets in tight gaps, a bouncy world, a redesigned HUD with map size) and the aim update (a right-mouse sight with slots 1-4, a web shooter that pulls you to walls, bonk weapons with visible reach, rainbow floor guides, the Dex gallery, figments that scale with you, no level cap) and the stunt update (ramps, MEGA ramps and rings of fire that pop up when you get in a car; car flips, spins, barrel rolls and wipeouts) and the voiced cinematic missions (every mission line spoken by its character with Kokoro voices served from Cloudflare R2, letterboxed camera scenes, title and chapter cards, phone calls, talking givers) and the shooter + balance update (slot 5 shooter belt with the scroll wheel, shooters lying around town, the bonk reach drawn on the ground, figment weaknesses, feet on the road surface, stronger light through the day, and Admin > Balance: a live-editable wiki of every character and number) and the colour blocks (2 km squares that start grey and get their buildings, streets and nature back as you free places, find secrets and bonk figments; name plates over figments; looking up at the sky; every weapon's numbers editable). Load this before any feature request, bug fix, restyle, content change or deploy for this app, so you can work without re-exploring the code.
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
  cft-chaos.js        window.CFTChaos.attach(G, api) -> G.chaos: the chaos update (decor toys, mayhem, ranged, flying, the Dex)
  cft-camp.js         window.CFTCamp.attach(G, api) -> G.camp: the campaign update (opening, crazy list, mission cap, ammo, powers, fire,
                      storms, MEGA figments, secrets, bouncy-world hooks, HUD counts)
  cft-stunt.js        window.CFTStunt.attach(G, api) -> G.stunt: the stunt update (courses that pop up in a car, rings of fire, scoring)
  cft-vo.js           window.CFT_VO: the voiced mission lines (generated by tools/voice_missions.py; never edit by hand)
  cft-cine.js         window.CFTCine.attach(G) -> G.cine: voiced cinematic mission scenes (camera shots, cards, subtitles, phone calls)
  cft-debug.js        window.CFTDebug.attach(G) -> G.debug: the play-test panel (?debug=1 only)
  cft-color.js        window.CFTColor.attach(G, api) -> G.color: colour blocks (2 km squares, grey until freed; docs/colour-blocks.md)
  cft-wiki.js         window.CFTWiki.mount(root, {api}): Admin > Balance, the wiki of characters and numbers (loaded on demand by
                      CFT.mountWiki, not in the game's ALL list)
  cft-ui.js           window.CFTUI.create(G, root) -> U: HUD, feed, banners, dialogue, U.choose, phone + 12 apps, panels, minigames, start screen
  app.css             all styles; the game's are the `/* ===== play.html =====` block (.cft-*)
server_code/          Game.py (get_save, put_save, reset_save, leaderboard, admin_players...), Balance.py (get_balance + admin_balance_*),
                      Tiles.py (map backup), DemoData.py,
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
`D.VEHICLES`. Businesses earn `income × (1 + 0.6 × (lvl-1)) × incomeMul` per game hour. Level: `xpAt(l) = xpBase × (l-1)^xpExp`
(`D.TUNE.player`, 60 and 1.8 by default: `D.calc.xpAt` / `levelOf`; the server's `level_of` reads the published values).

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
  **Drawn, not photos:** roads (`cartoonRoad`, 2026-11-20) and pavements (`cartoonPavement`, 2026-11-23, user: the
  sidewalk "looks uninviting, needs to be more friendly"): canvas tiles via `TEX[i].draw`. The pavement = 4 x 4 cream
  slabs of 1.5 m (m = 6) with bevels, joint grass + flowers and five chalk doodles; `real: 0.5` so the chalk colours
  show; warm `paveCol` 0xd8ccb6 / `kerbCol` 0xeee6d6, borough `L.pc` = that lerped 0.3 to the borough wall colour.
  ground-sidewalk.jpg is no longer loaded.
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

## The chaos update (cft-chaos.js + the decor layer in cft-world.js, 2026-11-18)

The user: "Make it more unhinged, more colours, creatures, objects everywhere. There are some empty spaces, fill them.
Understand what weird, unhinged, cool, surprising, dank, meme worthy is... 12 year old humour is on the table too. Ranged
weapons, ranged enemies, flying. Research what makes games fun and add that." What the research turned into (game feel:
Vlambeer's "Art of Screenshake", "Juice it or lose it", Dead Cells' hit-stop; toy-first chaos: Goat Simulator, Untitled
Goose Game; combo ranks: Tony Hawk, Devil May Cry): juice (hit-stop, shake, words, sounds), a mayhem combo meter with
letter ranks, toys before rules, a skill moment (parrying shots back), discovery + collection (the Dex), surprise (events,
the sky), and silly-but-kind humour.
- **Tone (keep it):** farts, gnomes, geese, seagulls and memes, never at anyone's expense. A seagull hit gets sympathy from
  passers-by ("That's good luck, actually!"). Meme words are the kids' own (6-7, aura, rizz, sigma, Ohio, no cap); no
  real-world characters or brands (the brainrot creatures are original; other people's meme characters stay out).
- **The decor layer (cft-world.js):** `DECOR[kind]` = {a tinted part (MAT.tint, `DECOR_TINTS`), b own colours (MAT.decor),
  glow unlit (MAT.dglow)}; `layDecor(s)` (from registerSub) fills `s.decor[kind]` = [x, z, yaw, tint, scale...]: pavements
  along residential/bigger streets (`PAVE_MIX`; checks buildings only: OSM sidewalks are footways, so the road grid covers
  pavements), parks/lawns/plazas/playgrounds/woods/sand (`AREA_DECOR`, groups: ring / gang / flock), floats on water, and
  bunting (`flag`, the 5th value = height) across residential streets. Drawn by `decorInst` in buildSub. `DECOR_HP` kinds are
  smashable (indexProp, `PROP_HP`, `DEBRIS_COL`, `SMASH_FX`, `SMASH_Y`); `DECOR_HI` kinds only show within LOD_R. A new kind:
  a `def(...)` in DECOR, an entry in a mix, optionally DECOR_HP/TINTS/HI + DEBRIS_COL/SMASH_FX. `W.decorStats()`,
  `W.decorCount()`, `W.decorMesh(kind)`; `W.propNear(x, z, r, { kind })` filters by kind (porta-potties).
- **cft-chaos.js** (`G.chaos`, attached after G.hero; api {bump, bumpTo, spawnPickup, setBusy}); data `D.CHAOS`, knobs
  `D.TUNE.chaos`; state `save.chaos` {aura, dex{id: n}, best, bestRank}.
  - **Mayhem:** `C.add(kind)` (points in `D.CHAOS.POINTS` x chain bonus) on every hype event (it wraps `G.hero.event`) and
    on its own toys; ranks `D.CHAOS.RANKS`; `comboT` s without chaos = `bank()` (coins, XP, aura). Counters rankA/rankS/rankSS/rankSSS.
  - **Aura:** `C.aura(n, quietly)` (`D.CHAOS.AURA`); positive aura also bumps counter `aura` (achievements).
  - **Hit-stop:** `G.rt.hitstop` seconds; cft-game.js `frame` slows dt to 6% while it lasts (stepSim ignores it).
  - **Projectiles:** `C.shots` [{kind, owner 'you'|'foe', obj, v, g, bounce, pierce, back, w | dmg, src}]. Yours: `C.fire(w)`
    from `F.attack` when `weapon.ranged === 'proj'` (aim: camera direction with the mouse captured, else facing; nudged onto
    the best target within ~37 degrees; lobbed shots solve the arc). They hit figments in 3D (flying ones too), piñatas, event
    balloons, balls, people (comic reactions, T-shirts make them happy), props (`F.smashProp`); lobbed shots only on the way
    down. `impact` = splash + effects per kind. **Weapon field `pellets`, never `n`** (n is the item's name in `weapon()`).
  - **Ranged / flying figments:** `def.ranged` {r, cd, proj, dmg, speed, lob, drop, slow}, `def.fly` metres. cft-fun.js
    updateMonsters calls `C.rangedAI(m, d, dt)` in the chase branch (keep distance, strafe, 🎯 aim tag, `enemyShot` leads you);
    false = the usual melee. Gulls swoop (`m.swoop`) for coins, then the melee rules apply. `flyTick` sets their height after
    cft-fun moved them. Melee can't reach anything > 2.6 m above you (`high(m)` in F.attack). A shot at you: `shotHitsPlayer`
    = parry window (`F.parryWindow() + 0.15`) -> reflected (counter `reflects`), block -> reduced, else hit + tomato/poop splat
    (DOM `.cft-splat`) or lag (`C.speedMul` 0.55 + "Buffering...").
  - **Flying:** `W.flyHook(dt, player, input, grav, ctl)` (cft-world.js updatePlayer asks it for gravity; `W.gravMul` too).
    `input.hold` = Space / the jump button held. Jet: thrust while fuel (`jetFuel` s, refills on the ground), fart puffs;
    glide: caps the fall, `glideSpeed` boost. Gear = back-slot items with `fly: 'jet'|'glide'`; meshes on `W.avatar`
    (jetMesh, brella). Hoops (`hoopTick`) only while you own flying gear. Counters `airtime` (seconds), `hoops`.
  - **Toys:** piñatas (`spawnPinata`, 3 hits, 12% mimic), beach balls (`spawnBall`, simple physics, kick = `C.meleeHit`),
    manholes (`spawnHole`, launch vy 25), whoopee cushions, tube men by made-up shops (`spawnTube`). `toyTick` keeps the counts
    (`D.TUNE.chaos`) within ~150 m. `C.meleeHit(p, f, w)` is called by F.attack when no figment was hit.
  - **Creatures:** `critterModel(id)` builds every critter and brainrot model; `critterTick` spawns critters (25-80 m) and a
    brainrot every `brainrot` s (rarity weights; `night` ones after 21:00); the snail follows you forever, ducks follow when
    close, the possum plays dead. `snap(c)` (E via `C.interaction`) fills `save.chaos.dex`, counter `dex` (absolute).
  - **Fart (B, the 💨 button):** `C.fart()`: synth (`fartSound`), peds react, figments within 3.5 m stunned, jet boost in the
    air. **Porta-potty:** `hide(e)` 4 s invisible (avatar scaled to 0.001), figments confused, then `stinkBomb`.
  - **Events:** D.EVENTS with `chaos: true` go through cft-fun.js `startEvent` -> `C.startEvent(id, ev)`, `updateEvent` ->
    `C.updateEvent(ev, dt)` (true = done), `endEvent` -> `C.endEvent(ev)` (restores gravity, peds, the glitch class).
  - **Sky:** `skyTick` keeps blimps (banner text `D.CHAOS.BLIMPS`), hot-air balloons and a rare whale 160-360 m out.
  - **Meme chatter:** `chatterTick` every `chatter` s: a passer-by within 20 m says a `D.CHAOS.CHATTER` line (kids: `KIDS`).
  - **HUD:** `.cft-mayhem` and `.cft-fuel` inside `.cft-tc`, the 💨 button in `.cft-btns`, `.cft-chaosfx` (splat, lag);
    phone app 🤪 Chaos (`VIEWS.chaos` in cft-ui.js, `C.summary()`); minimap `C.markers` (❓ brainrot, 🪅, hoops).
  - **Play-test panel:** a Chaos row (all ranged weapons, jetpack, glide-brella, shooters, a brainrot, toys, a chaos event).
- **Tests:** `game_test.py --chaos` (chaostest.js, 48 checks, also last in the full run); pictures `--chaosshots DIR`.
  Calm mode (`CFT_TEST.calm`) stops critters, brainrot, toys, the sky and chatter.
- **Not verified on a real GPU/phone:** frame rate with the decor layer (thousands of instanced pieces; small ones only
  within 140 m), the critters and the sky. If it stutters: raise the `d +=` step in layDecor (pavements), the `AREA_DECOR`
  rates, lower the `D.TUNE.chaos` counts, or drop bunting (`flag`).

## The campaign update (cft-camp.js + HUD redesign + bouncy world, 2026-11-18)

The user: "leave little secrets around town: analyse the map and find where there are tight locations between buildings, so
nosy people can get them. Redesign the HUD completely; add ability to change map size. Ranged attacks limited in quantity,
run around town to get more. Mega monsters bigger than buildings, hard to kill, weak spots temporarily exposed, scaled to
your level, gear helps. A campaign: first 3 minutes a countdown, immortal, every monster chases you, complete chaos; then
next to home, peaceful, 1 mission, then 3, never more than 5 on the map; the world starts calm and every mission adds a
crazy thing. Everything jumpable and bouncy. Fire and extinguishers. Water powers and lightning powers."
- **cft-camp.js** (`G.camp`, attached after G.chaos; api {bump, bumpTo, spawnPickup, setBusy, travel, setState}); data
  `D.CAMPAIGN` (INTRO_SECS, CAP, WILD = the crazy list, MEGA, SECRET_LOOT, NOTES, PANIC), knobs `D.TUNE.camp`, pickups
  `ammo` / `water` / `volt` / `foam` (`camp: true` -> `G.camp.collect`); state `save.camp` {intro 'todo'|'run'|'ending'|'done',
  left, ammo, water, volt, foam, secrets {id: day}, shown [], seen, megaT}. **Only new games get `camp.intro = 'todo'`**
  (U.onReady); `st()` creates a missing camp as `{intro: 'done', veteran: true}`: older saves never see the opening and keep the whole crazy world (`allow` is always true for them; the mission cap still applies).
- **The crazy list:** `G.allow(id)` (cft-game.js) = `G.camp.allow`: true in the opening, or when the WILD index < number of
  finished story/side missions (`tier`), or a mission counts it (`fires_out` -> fire, `megas` -> mega). Gates: cft-chaos
  critters/brainrot (`critterTick`), toys (`toyTick`), chatter, sky; cft-fun night/day spawns, shooters/flyers out of the pool,
  champions, events (`updateEvent`), chaos events (pool); cft-hero outposts; cft-rpg rares; camp fire/storms/mega. Guardians,
  King Blob, folk and rivals are not gated. `tierTick` banners each newly switched-on thing (old saves: quietly).
- **The mission cap:** `G.openMissions()` -> `G.camp.capOpen(all)`: story/side missions only, cap `D.CAMPAIGN.CAP[min(tier, 2)]`
  minus active ones; `save.camp.shown` keeps the chosen ones sticky; ordered by `D.MISSIONS`. Odd jobs pass through. The
  opening shows none.
- **`G.storyOn()`** replaces the "c1-couch done" check (`onStory`) in cft-fun / cft-chaos / cft-hero: also true in the opening.
- **The opening:** `startWorld` calls `G.camp.startIntro()` when `introPending()` (the harness URL `nointro=1` skips it):
  `G.travel(spot 220-360 m from home, message)`, clock 21.8, `cft-panic` class, the countdown `.cft-intro`, a storm for the
  whole opening. `introTick`: figments with `{aggro: 999, event, introFoe: true}` (14 / low 8), champion packs, King Blob, a
  MEGA at ~75 s (one third health, no rewards), an event every 22 s, fires, panic ticker lines. `F.hurt` returns 0 while
  `G.camp.immortal()` (`K.shrug` pops IMMORTAL!). Ammo and powers are free (∞). `endIntro`: clears everything, travels to `save.home`
  (the typed address, nearest pavement), clock 8, then **the fever dream** (user, 2026-11-18): `wakeUp` puts back
  `DREAM_KEYS` (bag, owned, equip, rpg, stickers, counters, hero, chaos, fun, m, track, jobs, dyn) from `save.camp.snap` (taken
  at the first `startIntro`), sets xp 0 (= level 1, the lowest), money/savings 0, rested 0, full energy/health, starting
  ammo/powers, refreshes look/weapon/ride, removes the dream's pickups; Max's dialog says it was a fever dream; banner;
  `U.help(true)`. A reload mid-opening resumes it (with the time left).
- **Ammo:** `F.attack` asks `G.camp.useAmmo(w)` for `ranged: 'proj' | 'shot'`; cost `weapon.ammo` (1 by default: heavy
  launchers 2-4); out = the weapon becomes a melee bonk. Crates: `manageCrates` keeps `ammoCrates` between `crateMin` and
  `crateMax`; orbs; extinguishers near fires. Kill drops via a `G.hero.event` wrapper. Older test suites shoot for free
  (`bypass()` = CFT_TEST without `campaign`; `CFT_TEST.ammo` turns ammo on).
- **Powers:** `G.camp.power(kind, down)`: keys 1 / 2 / 3 (held), hotbar `[data-pw]`. `aimDir` (camera when captured, else
  facing nudged to a target). Water `waterBlast` (cone: `m.wet`, knock, douse fires, peds react); lightning `zap` (sky bolt =
  additive box segments `bolt()`, chain `voltChain`, ×`wetMul` on wet, mega heart first, a wet mega short-circuits = dizzy,
  ground strike smashes and may start a fire); extinguisher `sprayTick` (foam per second). Lightning is free during storms.
- **Fire:** `K.spawnFire(x, z, size)` (merges within 1.8 m; cap `fireMax`), `fireTick` (grows, flickers, spreads when fire is
  on, burns props via `F.smashProp`, hits figments, hurts you every 0.5 s), `douse` (counter `fires_out`, XP). Random fires
  every `fireEvery` s; `W.onWreckFire` (cft-world hitProp) turns car wrecks into real fires.
- **Storms:** `startStorm(secs)` / `stormTick`: a yellow ring tightens for 1.1 s, then a bolt (`U.flash`); 22% aim where you
  are (keep moving). `.cft-stormfx` = CSS rain.
- **MEGA figments:** `K.spawnMega(x, z, def)`: `W.monster(kind)` at `def.size` (h = model h × size, 15-27 m), a heart group
  and two labels in the scene. **Health = `megaHits` × (slap 0.5 × 1.6 × your level growth) × `megaWeak`**: the same number of
  basic hits on the heart at any level; gear/talents/main character mode make it faster. Attack = `megaAtk` × base max
  health at your level. States: walk (flattens props under it with `W.hitProp(e, 99)`), stomp (red ring 9.5 m at your spot,
  1.4 s; in the air = JUMPED IT), throw (lobbed boulder + orange ring), breath (fire line for `breath: 'fire'`, else a
  shockwave ring to jump), dizzy (5.5 s: the heart sits between it and you at 1.5 m height). Hits: `K.meleeHit` (F.attack,
  melee only), `K.shotHit` (cft-chaos updateShots, before figments), powers. Off the heart = ×`megaArmor`. Kill: coins, 2
  boss drops, XP, money, counter `megas`, `G.hero.event('kill', {m: {def: {boss: true}}})`. One at a time, spawns 90-140 m
  away every `megaEvery` s (not within 150 m of home), leaves beyond 480 m. HUD `.cft-boss` (boss bar + hint).
- **Secrets:** `K.analyse(sub)` (one block per 0.3 s within 260 m, `analysed` WeakSet): every building pair within
  `secretGap[1]`, sampled every 1.5 m along the first one's walls; the other's nearest wall `secretGap` away and the middle
  open = a gap (`ux, uz` across it). `reachable` follows the gap along its length (30 m both ways) until it opens onto
  ground with nothing built 3 m either side (sealed slits / light wells are dropped). Score = tightness ×1.2 + walls (of 8 rays,
  10 m) ×0.6 + street distance ×0.12; keep enc ≥ 4, > 4 m from a street, best `secretsPerTile` 30 m apart. Id from lat/lon
  (`q<lat×20000>:<lon×20000>`). `secretTick` places crates (`stashMesh`, visible within `secretSee`) at the 14 nearest;
  E (`K.interaction`) = `openSecret` (loot table `SECRET_LOOT`, a note, counter `secrets`). Hydrants: E fills water (90 s
  per hydrant). Measured in the Plateau: 14-16 spots in the loaded blocks, gaps ~1.3 m, walls on ~7.8 of 8 sides, walk-in ~7.6 m.
- **Bouncy world (cft-world.js updatePlayer):** `collide(pos, R, footY)` skips buildings whose roof is below your feet;
  `W.roofAt(x, z)` = `b.base + b.h`; standing on roofs; wall jump (in the air, pushed by a wall, jump: vy ×1.55 + push away)
  and mantle (a roof edge < 1.7 m above, moving); falling onto props (not trees/lamps) bounces (×1.12 per bounce in a row,
  `player.chain`); hard roof landings bounce; `W.stompHook` (camp: figment heads = STOMP, a mega's head = dizzy). Hooks
  `W.onPropBounce`, `W.onWallJump`, `W.onMantle`. Counters bounces, bestchain, stomps, walljumps, mantles.
- **HUD (cft-ui.js markup + `/* ===== the HUD redesign` block at the end of app.css):** `.cft-tl` = `.cft-hcard.cft-me`
  (level button, name, money, XP) + `.cft-hcard.cft-vitals[data-meters]` (health, energy, mood; cft-hero appends swagger) +
  `.cft-missions` (`.cft-quest`, `[data-mlist]` from `missionList()`, `[data-mcount]` filled by camp `hud()`); `.cft-tc` (clock,
  borough, street, chaos's mayhem + fuel); `.cft-tr` minimap `[data-mmwrap][data-size=s|m|l]` with `[data-mmz]` zoom and
  `[data-mms]` size; `--mm` on `.cft-hud` (`:has`) drives the minimap size and the feed's top; `.cft-hotbar` (`[data-bonk]` +
  `[data-bonkicon]` + `[data-ammo]`, `[data-pw]` + `[data-pwn]`, `[data-quaff]`); `.cft-br` (E prompt, block, ride, fart,
  phone, jump). `U.mapSize(sz?)` cycles/sets and saves `settings.mapSize`; `U.applySettings()` at start. Phone portrait
  (≤ 720 px): two columns (you + missions left, map + clock right), hotbar above the buttons on the right, foe/boss bars low;
  landscape phones (height ≤ 500): no mission rows, hotbar bottom centre. Phone app 🌀 Campaign (`VIEWS.camp`).
- **Tests:** `game_test.py --camp` (camptest.js, 54 checks, also last in the full run); pictures `--campshots DIR`.
- **Not verified on a real device:** frame rate with many fires (each is 5 additive cones) and a MEGA (a 15-27 m model with
  shadows), touch feel of the hotbar, wall jumps on a phone. If fires stutter: lower `fireMax` / `fireMaxLow`.

## The open-air update (cft-wild.js + climbing in cft-world.js + four-corner HUD, 2026-11-18)

The user: "the HUD: map in the bottom left; nothing in the central columns: all info in the 4 corners, not the middle column
or the horizontal middle row; only temporary emotion text, and higher. Legs in the ground sometimes. Research Breath of the
Wild's controls and mechanics and make this game feel more like it, with the insanity and 12-year-old humour." Research +
plan: `docs/open-air-report.md` (mechanics only; no names/art; durability and collectible grinds left out on purpose).
- **Four corners (cft-ui markup + "the four corners" block in app.css):** `.cft-tl` you + missions; `.cft-tr` (top right):
  the opening's `.cft-intro` (camp inserts it first), `.cft-tc` (clock, borough, street, chaos's mayhem/fuel), `.cft-boss`,
  `.cft-foe`, `.cft-feed` (3 items); `.cft-bl` minimap + mission timer; `.cft-br` E prompt, `.cft-hotbar`, `.cft-btns`.
  Banners sit beside the minimap (one at a time, `--mm-out` on `.cft`), toasts above it, chaos's Buffering beside it.
  Corner columns are capped at 40vw / 40vh (tr overflow hidden; mission rows: 2, 1 below 900 px tall, none below 780 px).
  Phones: every column 40vw, the hotbar a 3+2 grid. Hype words top 9% (phones 33%), the ticker a band between the top
  corners (phones one lane at 29%). wildtest.js measures every HUD element against the middle column/row (40-60%).
- **Legs in the ground:** pavements are drawn `KERB_Y` (0.13 m) above the ground; `pchunks` (a grid like `rchunks`, filled in
  registerSub with the same bands buildSub draws: car roads except service/track, not bridges, high quality only) ->
  `W.paveAt`, `W.standAt(x, z)` = ground + 0.13 on a pavement; `surfaceAt` and `segPoint` (people, traffic) use it. Roads
  too since 2026-11-21 (The shooter + balance update: `lchunks`, `roadLift`).
- **Climbing (cft-world.js updatePlayer):** `player.climb` {nx, nz, t, lost}; grab = push into a wall (`into` > 0.55, forward)
  in the air, or for 0.22 s from the ground, and `W.stam.can('climb')`; while climbing: velocity pinned into the wall + sideways,
  vy toward 1.6 up / 2.4 down, no gravity, `stam.use('climb' | 'hang', dt)`; over the top when `roofAt` behind the wall is
  < 1.1 m above; Space = jump off the building (up + 8.5 m/s away, A/D steer, counts as a wall jump, `player.noGrab` 0.5 s so you don't
  stick straight back; 2026-11-19), Shift + Space = climb-jump (`stam.use('climbjump')`); lost contact
  > 0.25 s or no stamina = let go. Climb pose after `W.animate`. Dodge hop: jump while `W.blocking` and grounded.
- **cft-wild.js** (`G.wild`, after G.camp; knobs `D.TUNE.wild`; state `save.wild` {views, tips}): `W.stam` (the donut DOM
  `.cft-donut` near your head, `X.stam` / `X.tired`, regen after `regenDelay` on the ground; `X.speedMul` in cft-game
  speedMul; the last drop below 0.5 = tired); the umbrella = a wrapper round `W.flyHook` (gear flight wins; hold Space,
  falling, > 1.2 m up; `updraftAt`: fires `8 + 5 x size` m high, chaos manholes 15 m); perfect dodge `X.perfectDodge(m)` from
  cft-fun `strike` (dodge hop within `dodgeWindow`) -> `G.rt.slowmo` / `G.rt.slowK` (cft-game frame scales dt), `flurry` hits
  (F.attack: x1.6 dmg, +1.2 reach, cooldown x0.12); `airAim` wraps `G.chaos.fire` and `G.camp.power`; `X.conduct` (camp zap +
  strikeGround), `X.steam` (camp waterBlast), `X.soak` / `X.soaked` (hydrants, storms; camp fire skips damage, storm strikes
  x2); rooftop antennas (`viewTick`: tallest roof >= `viewMinH` per `viewCell` square within 560 m; `X.interaction` on that
  roof -> `tuneIn`; `X.markers` 📡 + ✨ of tuned squares); `giggleTick`. One-time tips in `save.wild.tips`.
- Also fixed: `G.camp.markers` was never drawn on the minimap (now in `minimapData`).
- **Tests:** `game_test.py --wild` (wildtest.js, 24 checks, last in the full run).
- **Not verified on a real device:** climbing/gliding feel with real mouse + touch, slow motion feel, the corner layout on
  every phone size (measured: 1264x705 desktop).

## The graphics overhaul (2026-11-19: "improve city fun time graphics by a large factor... enemies, the world, the characters, buildings.. all need more detail")

High quality only (low keeps the old Lambert look, except the figment models, which load on both). Three new engine files,
loaded before cft-world.js (cft-kit.js `ALL`, harness.py `ENGINE`, a `cft-asset` meta each in anvil.yaml):
- **cft-post.js** (`W.post`, null on low / WebGL1 / `?nopost=1`): the world renders into a half-float 4x MSAA target with a
  depth texture, then SAO-style ambient occlusion (half res + depth-aware blur), bloom (bright pass + 4-level chain), and one
  composite (AO, bloom, gamma -> linear, exposure, ACES curve, saturation, contrast, warmth, vignette, dither). Knobs:
  `W.post.params` {exposure, ao, aoR, bloom, thr, sat, con, warm, vig}. `P.adapt(dt)` (fed real frame times by `draw()`)
  drops `W.post.level` 2 -> 1 (no AO) -> 0 (straight to screen) after ~4 s of frames slower than 1/34 s; it never comes back
  that session. Every render goes through cft-world `draw()` (frame, W.render, W.snapshot). `W.renderInfo()` reads
  `POST.info` (the scene pass only). The CSS vignette/filter are off when post is on (`.cft-canvas.cft-post`, cft-hero).
- **cft-gfx.js** (`W.gfx`, null on low): procedural materials, no downloads.
  - `wallMaterial()` = MAT.walls. Vertex attribute `wa` = [style, seed, shop band] from `Geo.wv` (walls Geo only), set per
    building in buildSub: `facadeStyle(b, idx, colour)` picks 0 red brick, 1 buff brick, 2 stucco, 3 concrete panels, 4 lap
    siding, 5 greystone, 6 glass curtain wall (towers > 28 m: glass or concrete; houses with gables: siding or brick; else
    by colour). Windows are cut on the existing bay/floor grid (uv x 4; `CW` 3.6 / `FH` 3.3 in the shader): lintels + sills
    on brick/stone, frames, mullions, a 0.14 m recess with its reveal, blinds, doors, and **interior mapping** (`room()`):
    a fake room per window (back wall + furniture, side walls, floor, ceiling lamp) lit by day and, for ~42% of windows, at
    night (TVs flicker blue). Street floor = shop windows when `wa.z` is 1: buildings with a real or made-up shop (`b.shop`,
    set in registerSub) or ~1 in 4 others with a shop band; shop interiors are shelves, a cafe counter + menu board, or a
    boutique rail. Glass mixes the room with a Fresnel sky reflection (`uSkyTop/uSkyLow`, copied in setClock).
  - `roofMaterial()` = MAT.plain (roofs geometry): membrane + gravel + seams on flat roofs, shingle rows on pitched ones,
    weathered paint on vertical faces (cornices, huts, balconies).
  - `pbr(o)` = MAT.vc / prop / tint / decor / crown / slimeMat: MeshStandard + a per-vertex surface class `mk` from
    **Merge** (`m.as(k)`, `m.kOf = {hex: k}`, or the builder-wide `KOF` while `W.person` runs (`personKOF(look)`)):
    0 matte, 1 car paint (glossy, reflects the sky), 2 glass, 3 metal (rims), 4 skin (warm shadows), 5 eyes/wet, 6 cloth
    (weave), 7 hair (strands), 8 leaves, 9 plastic. carShape sets kOf for paint/glass/rims/trim.
  - `updateEnv()`: a little sky scene (gradient, horizon city band, sun) rendered to a PMREM map = `scene.environment`,
    redone in setClock when the clock moved ~15 game minutes. Every gfx material uses `envMapIntensity` `ENV_K` 0.5, and
    the hemisphere light is halved on high quality to make room for it.
  - Debug: `W.gfx.U.uDbg.value` = 1 view vector, 2 metres, 3 bay/floor cell, 4 detail fade (facade shader inputs).
- **three-gltf.js**: three r149's GLTFLoader + SkeletonUtils turned into a plain script (THREE.GLTFLoader, THREE.SkeletonUtils).
- **Figment models** (`mon-*.glb`, 3.3 MB, Quaternius "Ultimate Monsters", CC0, packed by `tools/monster_models.py <pack
  folder>`, which keeps only the clips we play): `MON_MODELS` maps kinds to models (slime: green/pink/spiky blob, blob:
  giant spiky blob, sock: ghost, wisp: ghost skull, pigeon: fat pigeon, gull: flying pigeon, raccoon: ninja, worm: fish,
  gargoyle: blue demon, brute: orc, spitter: alien); `MON_H` = heights. Loaded 1.2 s after the world starts
  (`loadMonsters`; `?nomodels=1` skips); until then, or for kinds not listed (bin, cone, cart, tomato, wifi, rat, spider,
  goose: jokes about real objects), `W.monster` builds the old model. A model figment has `userData.model` = {obj, mixer,
  acts, cur, h}; `W.animateMonster` plays idle / walk / run (by speed), the attack while `userData.act === 'wind'` (set by
  cft-fun before each animateMonster call) and the flinch while `hurt > 0`. Textures are switched to LinearEncoding (the
  game draws in display colours). MEGA figments use the same models at 15-27 m.
- **Facade extras** (`facadeExtras` in buildSub, roofs geometry): balconies with iron railings on ~42% of 2-7 floor brick /
  stucco / siding / stone buildings, on walls facing a street with no neighbour against them (`builtAt`); ~half of those
  also get a Montreal-style outdoor staircase from the first balcony down to the pavement (no collision: you walk through
  it); window AC units on others; chimneys on gabled roofs. `obox` = a box turned to a wall.
- **People:** `PRIM_HI` / `PRIM_MID` have more segments on high quality (passer-by ~5-6k triangles; funtest allows < 7,000).
- **Pictures:** `game_test.py --gfx DIR` (facades close and angled, roofs from above, cars, you, dusk, night, a figment line-up);
  `CFT_QS="&nopost=1"` (or `&nomodels=1`) in the environment compares without post / models.
- **Gotchas hit:** an interpolated varying (the building seed) wobbles in its last bits per pixel and the hashes turned that
  into TV static: seeds are whole numbers and rounded in the shader (`floor(vWA.y + 0.5)`); pick the room surface with
  ordered comparisons, never `t == tz`. Bloom threshold is HDR (only values above ~1 glow). The interior light levels are
  small numbers on purpose (they are emissive and go through exposure + bloom).
- **Not verified on a real GPU:** frame rate with MeshStandard everywhere + post + facade shader (software WebGL only). If a
  real machine stutters: the watchdog drops AO then post by itself; next steps are `W.post.params.ao = 0`, a lower
  `setPixelRatio` cap, or `ENV_K`. Phones (auto = low quality) only get the models.

## The aim update (cft-aim.js + aim camera / web tether / reach arcs / guides in cft-world.js, 2026-11-19)

The user: "remove block on the right mouse key; instead the right mouse key creates a sight; depending on what is in your
1 2 3 panel the left click does it (while holding the right button); releasing goes back to bonk. Different bonk weapons
with different ranges I can see. Light guides when something is announced: a wave of rainbow energy on the floor toward a
nearby monster (the head arrow is for missions). Fix angled roofs you can't walk on. Fix 'Cannot read properties of null
(reading appendChild)'. Remove the level cap and make city enemies scale with you. The photo things: is there a gallery? How
am I collecting? Spiderwebs: in the right-left click combo it shoots out and pulls you; it must attach to a wall."
- **cft-aim.js** (`G.aim`, attached after G.wild; api {bump}; knobs `D.TUNE.aim`; state `save.aim` {slot, tips}). A new engine
  file: listed in cft-kit.js `ALL`, harness.py `ENGINE` and a `cft-asset` meta in anvil.yaml (tools/assets.py keeps its hash).
  - **Input (cft-ui.js):** right mouse down on the canvas -> `G.aim.setAim(true)`, up (window) -> off + `fire(false)`; left
    mouse down: `G.aim.on()` ? `G.aim.fire(true)` : (pointer locked) `G.attack()`; keys 1-4 -> `G.aim.select(slot)` (`SLOT_KEYS`
    water / volt / foam / web); hotbar `[data-pw]` buttons: mouse = select, touch = `G.aim.tap(slot, down)` (select + use;
    foam held). G / 🛡️ still block. Blur / overlays / riding / blackout drop the sight.
  - **The sight:** `W.aiming` -> cft-world `updateCamera` blends `cam.aimK` (over the right shoulder 0.85 m, distance <= 3.6,
    fov 50) and stores `W.aimRay` (camera position + direction) every frame; updatePlayer turns you to `cam.yaw`, walks at 75%,
    no sprint, and raises the aim pose. `aimTick` = a figment (or MEGA) near the ray, else `W.rayCast` (0.5 m steps + 6
    halvings against `roofAt` walls and `surfaceAt` ground) -> `W.aimPoint` {x, y, z, kind 'foe'|'wall'|'ground'|'sky', m}.
    DOM `.cft-sight[data-sight]` (centre of the screen, only while aiming: the one thing allowed in the middle) red on a
    figment, green on a web-able wall, dashed grey "no wall"; label = slot + distance. cft-camp `aimDir` and cft-chaos
    `aimShot` use `W.aimPoint` first (exact, no nudge).
  - **Height without the sight (2026-11-23, user: shots "never go up"):** cft-world `W.aimEl()` = how far up the camera
    looks (+ `AIM_BIAS` 0.28, so the default chase view shoots level). Used by `aimShot` (no-target shots, up to 22 m
    high; looking up skips targets far below), `F.shoot` bubble shots (now 3D: y/vy, hit figments only at their height),
    cft-camp `aimDir().up` + `inJet` (water and foam spray tilt and only hit at the jet's height). Lightning with no
    target strikes the sight's point. Test: `game_test.py --eval tools/live/upaimtest.js`.
  - **The web:** `shootWeb` -> a strand (`strandGeo` box stretched from `handPos()`, flies at `webSpeed`) -> on a wall
    `W.tether = {x, y, z, v0, acc, max, life}`; cft-world updatePlayer (foot only) pulls toward it, no gravity, A/D steer,
    Space = let go (`W.onTetherEnd('jump')`); releasing the right button = `cutWeb()` (setAim(false): pull stops, speed kept, strand gone); arrival (within 1.6 m, or a wall hit within 5.5 m, or `life` s) = mantle onto the
    roof when it is < 2.4 m above ('roof'), else `player.climb` (cft-wild stamina) ('wall'), else a drop. Without the sight
    (touch) `wallAhead()` casts four rays up the facing direction. On a figment: `m.stun` + `m.webbed`. Counters webs, webpulls,
    webroofs, webbed.
  - **Rainbow guides:** `W.guide(x, z, {hue, max})` = up to 34 additive chevrons (`CHEV`) on the ground (0.32 m over
    `standAt`/`surfaceAt`: road drapes sit above the terrain), two waves at 34 m/s, removed when done (`updateArcs`).
    `scanTick` (every 0.4 s): MEGAs within `megaR` always; figments within `guideR` (special ones always, others when
    `guideCd` is over); weird creatures within `rotR`; animals missing from the Dex within `critterR`. Counter guides.
  - **Dex tags:** `W.label('📸 NEW')` on critters / creatures not in `save.chaos.dex` within 40 m (`c.newTag`).
- **Reach arcs (cft-world):** `W.swing(reach, arc)` draws a crescent (`arcGeo` RingGeometry, band 0.4 m or 30% of the reach)
  for 0.26 s; `W.showReach(reach)` a gold ring for 1.6 s (cft-fun `syncWeapon` when the weapon in hand changes, + a "REACH
  x m" pop). Weapon fields `arc` (degrees, default 160, cone 66, >= 300 = all round, no hit cap), `cd` (cooldown), `hits`.
  F.attack uses `cos(arc/2)` for figments and chasers. New items w_pan, w_selfie, w_rake, w_yoyo, w_tether (+ loot bases,
  shapes in `W.propMesh`, names in content_check `MESHES`).
- **Gabled roofs:** `gableRise(b, x, z)` / `roofTop(b, x, z)` (W.roofTop) mirror `gable()`'s ridge (the longer side pair);
  `roofAt` and `collide`'s footY skip use it, so the slope is walkable and the gable ends are solid below the slope.
- **Scaling:** `F.scaleFor(lvl)` in spawnMonster: hp x (1 + 0.15 (L-1)) x (weapon dmg x dmg bonus / slap)^`gearShare` x
  (1 + hpPerLevel x (lvl - L)) x (1 + min(challengeMax, challenge x (L-1))); atk x (maxHp / 71)^`lifeShare` x (1 + armour /
  100)^`armorShare` x (1 + atkPerLevel x (lvl - L)) x the same push. Level 1 with bare hands = exactly as before. `m.atkK`
  feeds cft-chaos enemy shots. MEGAs keep their own formula (cft-camp).
- **No level cap:** `levelOf` (cft-game.js) and `level_of` (server_code/Game.py) start from the closed form and settle on the
  exact step; identical below 99.
- **Dex photos:** cft-chaos `snap` turns the camera to the creature and calls `G.takePhoto` (now returns the URL) on a first
  snap -> the Album + `localStorage cityfuntime.dexpics.<user|guest>` (`C.dexPics()`); phone app 📸 Dex (`VIEWS.dex`).
- **The appendChild error:** `U.destroy` empties the root, and a queued banner (`nextBanner`) or a late dialog (`overlay`)
  then appended to null. Both (and toast/feed) now return quietly when the HUD is gone.
- **Ammo without a shooter** (user: "I pick up arrows but don't know how to shoot"): cft-camp `shooterHint()` after an ammo
  pickup: no shooter owned = a free `w_straw` (worn if bare-handed) + banner; owned but not worn = a toast (once a visit); in
  hand = how to aim (once). Buying a shooter says "F shoots; hold the right mouse button to aim".
- **Tests:** `game_test.py --aim` (aimtest.js, 50 checks, last in the full run); pictures `--aimshots DIR`.
- **Not verified on a real device:** web feel with a real mouse, the shoulder camera in tight streets, guides on hills.

## The stunt update (cft-stunt.js + car air in cft-world.js, 2026-11-19)

The user: "Add more things for doing car tricks. They appear as you get in the car. Get some air time, have some fun doing
flips and jumping through rings of fire."
- **Physics (cft-world.js, after updatePlayer):** the drive branch now has air. `W.ramps` (filled by cft-stunt) are wedges
  `{x, z, ux, uz, L, H, w, gS, gE, vy, ref, k}`; `rampAt(x, z, y)` gives the surface (only if you came on at the bottom:
  driving into a ramp from behind or the side passes through it, no invisible walls; `k < 0.999` = still popping in, ignored).
  `carVertical` follows the road / ramp / a roof you landed on; leaving a ramp's lip (`lastA > 0.7 L`, moving up it)
  = `carLaunch(vy × clamp(speed / ref, 0.4, 1.15), 'ramp')`; Space on the road = `'hop'`; driving off a roof = `'drop'`.
  `player.carAir {t, pitch, spin, roll, pv, sv, rv, rollTo, maxH, crash, bounces}`: `carAirTick` W/S = pitch rate (W = nose
  down = front flip, negative pitch), A/D = spin, Space queues a full roll; no key = the angle eases to the nearest upright
  (`assist`). Gravity in the air x `airG` (0.6: floaty). Landing: `wrapPi(pitch/roll)` and the spin left over after whole
  half-turns must be within `landTol` / `spinTol` = clean (`W.onCarLand(info)`; odd half-spins = fakie: heading + π and the
  speed goes negative), else a crash: bounces 3 times tumbling, then `W.onCarSettle` upright with speed 0. The car turns
  around its middle (`STUNT.pivot`, avatar position corrected at the end of updatePlayer; avatar rotation order is YXZ).
  `player.boostT > 0` = top speed x `boostMul` and the car drives itself forward. `collide` gets `footY` in a car now, so
  a car above a roof passes over the building. `W.setRide` / `W.teleport` clear `carAir`, `onRamp`, `boostT`.
- **Courses (cft-stunt.js):** entering drive mode (`W.ride().mode === 'drive'`: own car, moped, borrowed car) -> `fill(true)`
  pops up `D.TUNE.stunt.count` courses (staggered, ramps rise out of the road with an overshoot, rings and pads grow) on car
  streets (`W.randomWalkSpot`, segments ≥ 14 m, not bridges), facing away from you; the first is always a ring ramp, plus a
  rainbow guide to it. Every 1.5 s far ones (> dropD) shrink away and new ones fill in. Getting out = all shrink away.
  `plan(kind, x, z, ux, uz)` checks 30 m of run-up + the ramp for roofs, then FLIES the planned jump at
  `ref = ride.run × boostMul × 0.97` (what the boost arrows give you) to put rings at fractions of the apex time
  (`D.STUNT.KINDS[kind].rings`) and the bullseye where it lands; any roof in the way = no course there. A plan is per ride
  speed (a sports car gets longer jumps).
- **Touch checks (`touchTick`, each frame in a car):** boost pad rectangles; ring planes crossed between last frame and this
  one (car middle = pos.y + pivot): within R - 0.15 = through (`firerings`, fire trail, mayhem `firering`), within R + 1.3 =
  singed (smoke). Rings in the air add to the jump; fire-alley rings on the ground pay at once.
- **Scoring (`W.onCarLand`):** `D.STUNT.PTS` per second of air, flip, half-spin, roll, ring, bullseye, fakie, roof; x (1 +
  0.25 per extra kind of trick) x streak (1 + 0.25 per clean stunt launched within `streakT`, max x2). A plain hop under
  `minAir` scores nothing. `award` -> `G.addMoney` (pts / ptsPerCoin, capped, + level bonus), `G.addXp`, `G.chaos.add('stunt')`.
  Wipeouts: a joke from `D.STUNT.WIPEOUT`, streak reset, rings still pay. State `save.stunt {best {pts, name}, bestAir, tips}`.
  Counters: stunts, flips, spins (full 360s), rolls, firerings, megarings (all 3 rings of a MEGA in one jump), bullseyes,
  fakies, wipeouts, carhops. Missions s-stunts, s-mega (Kai); achievements cat 'Stunts'. Phone app `stunt` (VIEWS.stunt),
  minimap `St.markers`, keys line in the help card.
- **Tests:** `game_test.py --stunt` (stunttest.js, 26 checks, last in the full run); pictures `--stuntshots DIR` (pop-up,
  ring of fire, back flip, MEGA, fire alley, phone). Shots must set `W.controls.enabled = true` after `G.ui.closeAll()`:
  `G.stepSim` doesn't, and a dialog left open turns the controls off.
- **Not verified on a real device:** the feel of the flip/spin rates with a real keyboard, touch (the stick flips, ⤒ rolls),
  ramps on steep hills, frame rate with ~7 courses x ~13 flame sprites per ring.

## Voiced cinematic missions (cft-cine.js + cft-vo.js, 2026-11-20)

The user: "city-fun-time needs to have cinematic voiced over sections for the missions. That would give the missions more
gravitas. Using my local text to speech voice all missions. and put the sounds in cloudflare. animate the mission giving
too in a way you choose."
- **Voices (build time, this PC):** `node tools/vo_lines.mjs` lists every spoken line (intro, outro, step `say`) with its
  speaker and clip key, and what the voice should say (`voiceText`: capitals said as words unless they're in `ACR`, `22:00`
  -> "ten at night", `{name}` dropped, `{kid}` -> "our little one", `{place}` at the intro = the same "a café nearby" the
  game shows, `{pt}` lines and every Sam line recorded twice: `gf` / `bf`, Sam's `bf` take uses speaker `sam_b`, emoji,
  `*stage directions*` and "(or tap ...)" dropped). `python tools/voice_missions.py` renders new/changed lines with Kokoro
  (GPU, voice per speaker in `VOICES`: blends allowed, a pitch factor for the kid), levels them, writes MP3s (mono 24 kHz
  48 kbps) to `APP_MAKER/media/public/vo/cft/<md5>.mp3` (a new name whenever the text or voice changes: the Worker caches a
  year) and `theme/assets/cft-vo.js` (key -> [file, seconds, mouth envelope: one digit 0-9 per 1/20 s] or {gf, bf}).
  `--list` prints the lines, `--only max` re-renders a speaker. Upload: `python -I APP_MAKER/media/r2_deploy.py
  --only=vo/cft/` (the Worker in media/cloudflare serves `vo/<app>/<file>.mp3` since 2026-11-20). Then `python
  tools/assets.py`, commit, push. **After changing any mission text, re-run both or that line plays silently** (the scene
  still works, timed by text length).
- **Which clip:** `CFTCine.key(speaker, raw line, voice place)` = FNV-1a of `speaker|raw|place`; `CFTCine.speaker(raw, giver,
  D, kind)` mirrors cft-ui `speakerOf` ("Rosa: ..." = Rosa, "Sam (in a text): ..." = Sam, "{kid}: ..." = kid, a `say` line
  with no name = the narrator). The same functions run in vo_lines.mjs, so build and game always agree.
- **Scenes (`G.cine.play(o)`):** cft-game `sayLines(o)` routes story/side missions (`MISSION[id]`) to it: the intro in
  `talkTo` (with `actor: a.obj` and `chapter: G.cine.chapterFor(m)`, once per chapter, `save.cine.ch`), step `say` lines
  in `completeStep`, the outro in `completeMission`. Odd jobs and everything else keep `U.dialog`. The scene is a U overlay
  (`U.overlay`, class `cft-cine-wrap`: the game pauses like any dialog), `U.cineMode(true)` sets `data-cine` on `.cft` (CSS
  hides every HUD child but the canvas and the overlay layer), `ArkMusic.duck(0.32)`. A frame loop (rAF, plus a 50 ms
  watchdog timer when frames stall) sets `W.cine = {pos, look, fov, face, pose}`: cft-world `updateCamera` -> `cineCamera`
  (avatar always drawn, turned to `face`, posed). Shots from `makeShot(kind)`: two (establishing), close (speaker), ots
  (over your shoulder), low (hero angle), crane (chapter card), hero (you: phone calls); one side of the line per scene
  (`pickSide` tries both with `W.rayCast`), `fit` pulls the camera in front of walls. Actors in a scene get
  `userData.cine` (cft-game `updateActors` stops animating them and hides name tags, `!` marks, the goal beam, the head
  arrow and cft-hero's blips while `W.cine` is set); the speaker animates with pose `talk` (`u.talk` = the envelope) and
  `W.mouth(fig, k)` (a mouth mesh made on first use). A speaker not within 28 m = phone call (`.cft-cine-call`, pose
  `phone`). Narrator lines: no name, no call. Cards: chapter (narrator clip), title (intro, ~1.9 s), stamp (outro, ~1.7 s,
  giver cheers). Without a clip or with "Voiced missions" off, a line lasts `text.length × 58 ms` (min 2.2 s) with a fake
  mouth flap. `VoiceQueue` = one `Audio` at a time (no Web Audio, so no CORS needed; the Worker sends CORS anyway).
- **Controls:** click / tap / Space / Enter / E = next line (first click reveals the words when audio plays), Esc / Skip =
  end the scene (`Cn.skip()`); cft-ui `onKey` ignores Escape for `cft-cine-wrap` (the scene handles it).
- **Settings:** `settings.voice` ("Voiced missions"), `settings.cine` ("Cinematic mission scenes"; off = `U.dialog` with
  `onLine`/`onClose` playing the clips). Both default on (undefined).
- **Accepting:** the giver's `userData.cheerT = 1.3` -> pose `cheer` in `updateActors`.
- **Tests:** `game_test.py --cine` (cinetest.js, 37 checks, last in the full run): every line has a clip, Sam's two voices,
  speakers, the old box without `CFT_TEST.cine`, a full intro scene (HUD hidden, bars, chapter + title cards, camera,
  subtitles word by word, mouth, next, Esc), accept + cheer, outro stamp, phone call, narrator, settings. Other suites never
  set `CFT_TEST.cine`, so they get the old dialogue box (and voices are muted in tests unless `CFT_TEST.mute === false`).
  Pictures: `--cineshots DIR` (uses `CFT_TEST.cineHold`: nothing advances except clicks; software WebGL is too slow for the
  real timing). Phone layout: `WINDOW=390,844`.
- **Legal:** provider line `arkvital_media_voice` (legal-kit, City Fun Time only): Cloudflare delivers the voiced lines; only
  the IP address.
- **Not verified on a real device:** how the voices sound through speakers (checked by Whisper transcription only), the
  real-GPU frame rate during scenes, the mouth size up close at full quality, touch (tap = next, the Skip button).

## The shooter + balance update (2026-11-21)

The user: "add the distance shooter to the water / lightning / extinguisher / web slots, selectable like the short range weapon
slot; the scroll wheel changes that distance weapon; distance weapons varied in the world. A visual indication how far the melee
attack reaches (the end of the weapon isn't the real distance). Check why feet sometimes go through the ground. Change lighting
throughout the day, more apparent. Then a wiki page with characters, power levels, weaknesses, all their specs, and how the
character progresses by level, to adjust the math so the game is balanced and challenging; in the admin panel, values
adjustable there so I can live test."
- **Slot 5, the shooter belt (cft-aim.js):** `SLOTS` gained `gun`; the belt = every owned shop item whose weapon is `proj` /
  `shot` (`belt()`, cheapest first), `save.aim.gun` = the chosen one. `A.pickGun(id)`, `A.cycle(dir)`, `A.addGun(id, how)`,
  `A.gunWeapon()`; `use('gun')` -> `fireGun()` -> cft-fun **`F.shoot(w)`** (modWeapon, `D.calc.dmgMul`, main character
  mode, `G.camp.useAmmo`, then `G.chaos.fire` or the bubble path); holding the left button = `gunDown` auto-fire at the
  shooter's rate (`gunCd`). While aiming with slot 5, **`F.handOverride`** = the shooter's mesh (cft-fun `syncWeapon` shows
  it; no REACH pop). HUD button `[data-pw="gun"]` (`[data-gunicon]`, `[data-pwn="gun"]` = ammo, `.empty`), key 5 (cft-ui
  `SLOT_KEYS`). **Wheel:** cft-world's canvas wheel listener asks `W.onWheel(dy, e)` first; cft-aim takes it while aiming or
  with slot 5 chosen (not with Ctrl), 60 units per step, else the camera zooms. **Shops / wardrobe:** `G.buy` puts shooters on
  the belt (`G.aim.addGun`), `wearShop(shooter)` = `pickGun`, `slotOptions('weapon')` leaves shooters out, the Chaos app's
  chips pick the belt shooter. **Old saves:** `st()` runs once (`save.aim.belt`): a shooter in `equip.weapon` moves to the
  belt and the dearest owned bonk weapon goes back in hand. Legacy: a shooter still in the hand (tests' `equipW`) keeps
  working through `F.attack`. cft-camp `shooterHint` gives the straw to the belt; `K.addAmmo(n)`.
- **Shooters around town (cft-aim `cacheTick`):** `D.TUNE.aim.gunDrops` (4) kept `gunDropMin`-`gunDropMax` m away (70 m apart),
  a kind weighted toward ones you don't own and cheaper ones (`pickGunKind`, gated by `req.lvl` ≤ yours + 2); a group = the
  real model (`W.propMesh`) spinning on a gold ring + an orange beam + a name label; within 1.9 m = `takeCache`: new = `addGun`
  + banner + `gunAmmo` ammo, owned = ammo. Dropped beyond 650 m. Only after `G.storyOn()`; calm tests need `CFT_TEST.guns`.
  Minimap `A.markers`. Counter `gunfinds`.
- **Bonk reach on the ground:** F.attack hits when centre distance ≤ `reach + m.r`, so the line is drawn at `reach +
  F.REACH_BODY` (0.6 = an ordinary figment's radius; `F.trueReach(w)`). cft-fun `F.tick` feeds `W.reachMarker(F.reachInfo())`
  ({r, arc, hot, ranged}); cft-world `updateReach` (from updateArcs) draws a faint fan + an edge band (`reachGeo`, cached per
  radius/arc), gold, pink and pulsing when `hot` (a figment inside reach and arc, not flying); hidden on rides, while aiming,
  climbing, webbing, in cut-scenes, in the wardrobe, for proj/shot weapons in hand, or with `settings.reach === false`.
  `W.swing` crescents and `W.showReach` use the same radius now.
- **Weaknesses:** `D.MONSTERS[k].weak` = {bonk, shot, water, volt, fire, stomp} (filled to 1 for every kind at the end of
  cft-content.js; `D.DMG_TYPES`). cft-fun `hitMonster` multiplies by `F.weakMul(m, w.type || (proj/shot ? 'shot' : 'bonk'))`
  and pops WEAK! (≥ 1.2) / RESISTS (≤ 0.85). Every damage source carries `type`: camp water / zap / ground strike / fire /
  stomp / MEGA squash, chaos shots + splash + reflected shots (`shot`), ball kicks and run-overs (`bonk`), wild arcs (`volt`).
  A new damage source: give its hit object a `type`.
- **The formulas in one place:** `D.calc` (cft-content.js): `xpAt`, `levelOf`, `maxHp(L, fit, extra)`, `dmgMul(L)`,
  `scale(L, lvl, gear, maxHp, armor)` (figment hp/atk multipliers), `xpFor(def, lvl, champ)`, `armorCut`. The game calls them
  (cft-game xpAt/levelOf, cft-fun maxHp/attack/scaleFor/spawnMonster, cft-camp lvlMul + MEGA, cft-chaos) and so does the wiki.
  New knobs: `D.TUNE.player` (xpBase, xpExp, hpBase, hpPerLevel, hpPerFit, dmgPerLevel, xpPerMonsterLevel),
  `D.TUNE.monsters.hpGrow / champHp / champAtk / champXp / champSize`, `D.TUNE.bosses` (guardians, rares).
- **Balance overrides:** a flat map {path: number} into D (`"TUNE.combat.parry"`, `"MONSTERS.slime.weak.volt"`,
  `"ITEMS.w_pan.weapon.dmg"`). `D.applyBalance(map)` restores what the last call changed (`D.BAL_DEFAULTS`), then sets the new
  numbers in place (only existing numeric leaves; `D.balancePath` refuses anything else); `D.balanceDefault(path)`. The game:
  cft-kit `CFT.balance()` (server `get_balance`, public, numbers only) -> `opts.balance`; cft-game `mount` merges it with this
  browser's draft (`localStorage cityfuntime.balance.draft` = {on, values}) in `G.applyBalance()` before anything reads D, and
  a `storage` listener re-applies when the wiki writes the draft (live test, that browser only). Values read once at start
  (people/traffic counts, graphics) need a reload. Server: `server_code/Balance.py` (`app_settings` keys `balance` = {values,
  updated, by, note} and `balance_history` = the last 12), `admin_balance_get / save / restore` (admin only; `clean()` =
  dotted paths + finite numbers, ≤ 3000), `Balance.tune(path, default)` for server code (Game.level_of).
- **The wiki (cft-wiki.js, Admin > Balance `#admin/balance`):** Admin page tab `balance_part` with dom node `wiki_root`;
  `cft.mount_wiki(node)` -> `CFT.mountWiki` (loads content + game + wiki) -> `CFTWiki.mount(root, {api: CFT.api})`; the page's
  hide handler destroys it. Sections (`VIEW.*`): how, you (level table `LEVELS`, knobs on the right), figments (base boxes +
  computed columns at a chosen level / fitness / armour / damage bonus / weapon (`ctx`), weakness boxes, notes), bosses
  (champions, guardians, rares, MEGAs, outposts), weapons (bonk: real reach, hit, per second; shooters: per second, per
  ammo), powers, knobs (every number in D.TUNE). `num(path)` = an editable box (changed: grape + "was" + ↺). Units as the game
  shows them: your health and hits on you raw (health bar), your hits and figment health ×10 (pop-ups). Bar: Live test
  (writes the draft), Open the game, Back to published, All defaults, Publish for everyone (note prompt); history with
  "Publish this one again". Harness: `tools/live/harness.py` page `?wiki=1` mounts it with a fake server (pictures).
- **Feet on the road (cft-world):** roads are drawn `ROAD_STYLE.y + 0.03` over the terrain (car roads 11 cm) but people stood
  on the terrain: measured 42% of road steps sinking > 3 cm, worst 34 cm mid-road on wide streets (only shaped at their edges).
  Now `lchunks` (a 0.5 m grid, `LCELL`) holds each road's drawn lift in cm (the drawn width `rd.w / 2`, not the 0.4 m wider
  `hw` band, plus round joints at every vertex) and `standAt` = ground + `roadLift(x, z)` (else + 0.13 on a pavement:
  `pchunks` on the same fine grid); `surfaceAt` adds it on bridge decks; road quads wider than 0.6 GS are split every GS
  across (`dquad(..., maxE)`). After: 0.6% of road steps sink > 3 cm (worst ~7-10 cm, at road edges). `W.roadLift`.
- **Light through the day (cft-world `LIGHT`, `lightAt(h)`, `W.light`, `W.lightAt`):** key hours with sun colour / strength,
  sky + ground bounce colours / strength, exposure ×, warmth, saturation × (moonlight, blue hour, sunrise, golden morning,
  morning, noon, afternoon, golden hour, sunset, dusk, blue hour). `setClock` applies them; the sun goes as low as 0.16 (long
  shadows) by day, the moon stands high at night; `POST.params` exposure / sat (× the base) and warm follow the hour.
- **Tests:** `game_test.py --balance` (balancetest.js, 51 checks, last in the full run); Balance.py in
  tools/testing/test_server.py.
- **Not verified on a real device:** the wheel on real mice and trackpads (60-unit steps), the reach arc on steep hills (it is
  flat at your feet), the light table on a real GPU with post-processing, the Admin tab inside hosted Anvil.

## Colour blocks, name plates, looking up, weapon stats (2026-11-21, second round)

The user: "each enemy has their health bar and name above their head, not in the HUD. The attack ring is a setting I want to
control for each weapon: in the wiki and the admin control, the stats of all the weapons including their attack arch,
strength adder, defence and so on. The arch needs to be a bit higher off the ground (the road hides it). A progression: separate
any map into 2 x 2 km squares; inside each block everything starts grayscale; as you unlock grocery stores, metros and other shops
the world becomes colourful; all buildings liberated = full colour; all secret packages found = roads and trees get colour.
Brainstorm, write out how it works, implement. And I can't look high enough to kill flying enemies: I should be able to look
at the sky." The write-up: **`docs/colour-blocks.md`**.
- **Colour blocks (cft-color.js, G.color, attached after G.aim; knobs `D.TUNE.color`; state `save.color` {b: {key: {lib:
  {placeId: points}, kills, done, tot}}, visited: {placeId: day}, intro}):** blocks are 2 km squares, home in the middle of
  `0_0` (`W.blockOf(x, z)` -> {bx, bz, key}). Layers: 🏠 buildings = points of freed places (`worth`: outposts `wOutpost`,
  metro entrances `wMetro`, real shops `wShop`, made-up shops `wMadeUp`; `isFree`: `save.hero.out`, `F.metroOpen`,
  `save.color.visited`) / `min(libTarget, block total)`; 🛣️ streets = secrets found in the block (`save.camp.secrets`, block from
  the id's lat/lon: `secretBlock`) / `secretTarget`; 🌳 nature = figments bonked in the block (`b.kills`; champion 2, rare/boss
  3, guardian 5) / `killTarget`; sky = the average. `scan()` every 2.5 s records freed loaded places into the save and keeps
  the highest total per block seen. All three full = `checkDone`: BLOCK RESTORED (cash/XP from `rewardCash/Xp`, counter
  `blocks`, a 900 m colour wave). Hooks: cft-game shop interaction -> `C.visit(pl)`, cft-hero `liberate` -> `C.freed(pl,
  'outpost')`, cft-fun `freeStation` -> `C.freed(pl, 'metro')`, cft-fun `hitMonster` death -> `C.onKill(m)` (intro figments
  don't count), cft-camp `openSecret` -> `C.secret(sp)`. `layerNews` = feed lines per quarter, a banner + wave when a layer
  fills. HUD chip `[data-colour]` (in `.cft-tc`, three `[data-cbar]` bars; click = phone app), phone app 🎨 Colour
  (`VIEWS.colour`, `C.summary()`), setting `settings.colour` (false = `W.colorOff(true)`, progress still counts), a one-time
  banner explaining it (`save.color.intro`).
- **The shader (cft-world.js "colour blocks"):** `greyify(mat, layer)` chains onto a material's `onBeforeCompile` (keeping
  groundify / gfx patches) and its `customProgramCacheKey` (+ `|cftgrey:<layer>`, or three would share programs): the vertex
  shader passes `vCftW` (world x/z, instancing aware), the fragment shader (before `fog_fragment`) reads the block's texel
  from `cgTex` (48 x 48 RGBA, nearest; outside = grey) and mixes the colour with its own luminance by the layer's level, plus
  the colour wave ring (`cftWave`) and `cftOff`. Layers: walls/plain = r; prop/tint/wreck/decor/dglow = g; trunk/crown/the far
  ground plane = b; terrain/drape = 'ground' (per surface via groundify's `vGL`: asphalt, pavement, bricks, yards, paths =
  streets; grass, woods, sand, water = nature). Never greyed: MAT.vc (people, cars that drive, figments, weapons, animals),
  signs, names on the road, lights, GLB figments, pickups. `W.setBlockColor(bx, bz, [r, g, b, sky])`, `W.blockColor`,
  `W.colorWave(x, z, {max, life})` (the newest wave wins), `W.colorOff`, `W.skySat` (setClock greys the sky colours by it:
  `greyCol`). cft-color eases the shown levels (`ease`, ~1.6/s) and writes the texture only when they move.
- **Name plates (cft-world `W.foePlate({big})`, cft-fun `placePlate` / `plateTick` / `rankOf`):** every figment gets a sprite
  child at spawn (`m.plate`), a canvas with the name + level on a pill coloured by rank (champ blue, guard gold, rare silver,
  boss gold, captain red, mega dark red) and a health bar with a pale "just lost" part; redrawn only when the key changes;
  `foeTick` (every 0.12 s) shows plates within 55 m and re-places them when the size or model height changes. The HUD foe bar
  (`[data-foe]`) is hidden for good; the old W.label tags for champions, guardians, rares, captains and King Blob are gone
  (cft-hero sets `cap.captain`). MEGAs: `m.label` is a big plate (depthTest off) with the hint as a third line, updated in
  cft-camp `hud()`; `[data-boss]` stays hidden.
- **Looking up (cft-world `look`, `updateCamera`):** pitch goes to -1.25. Below -0.2 the camera stops sinking (positioned at
  -0.2) and `tilt` raises the view direction (`camera.lookAt` along the same heading, elevation + tilt × 1.15, max 1.45 rad),
  so `W.aimRay` (the sight, shots) points at the sky. Aim pose arms follow to -1.35.
- **Every weapon's numbers (cft-content `D.WEAPON_DEFAULTS`):** missing fields are written out at load (bonk: arc, cd, hits,
  knock, stun, add, crit, def, block; cone the same with arc 66; shot: rate, ammo, knock, stun, add, crit; proj: rate, ammo,
  pellets, splash, speed, knock, stun, add, crit; D.SLAP too), so every one is an editable wiki path. New effects: `add` = flat
  damage before level growth (cft-rpg `modWeapon`, cft-fun `scaleFor` gear ratio), `crit` = extra crit chance (modWeapon),
  `def` = armour while in hand on foot (`F.armor`), `block` = extra block share (`F.blockPower`, `F.parryWindow`). The wiki's
  Weapons tab shows every number of every weapon as a box (ring size = reach, ring width = arc), and a Colour blocks tab.
- **Reach arc height:** `updateReach` puts it 0.3 m above the highest of your feet, the ground halfway out and at the edge
  (`W.reachHeight()`).
- **Tests:** `game_test.py --color` (colortest.js, last in the full run; it renders frames to compare real pixel saturation
  in a grey block and a full one). combattest/camptest check plates instead of the HUD bars.
- **Not verified on a real device:** the grey look and the waves on a real GPU with post-processing, plate readability at
  distance, looking up with a real mouse and on touch.

## The announcer, the face pass and graffiti (2026-11-24)

The user: "every time you get an achievement, or do something, a voice should announce what you did and that you are
amazing... link it to the notifications system. More effort into the model design, more edges, better looking, most
importantly the face. Put graffiti on 10% of buildings."
- **Announcer (cft-cine.js, `C.SHOUT` + `Cn.shout`):** `C.attach` wraps `U.banner`; every banner goes through
  `C.SHOUT.match(title, kind, D)` -> an event (`C.SHOUT.ev[id] = [line, priority]`), an achievement by name
  (`achRaw`, kind `ach`) or a mission by title (`missionRaw`, title `🏆 <mission title>`), or null (kinds `fail`, `day`
  except "🗺️ Discovered", `boro` greetings, loot below Epic). Then a cheer from `C.SHOUT.praise`. Spoken by speaker
  `announcer` (`VOICES` in tools/voice_missions.py: af_bella, 1.08); tools/vo_lines.mjs adds `C.SHOUT.lines(D)`, so a
  new achievement, mission or banner line just needs `python tools/voice_missions.py` + `r2_deploy.py --only=vo/cft/`.
  Queue: one at a time, waits while `Cn.playing`, keeps the 2 most important, drops anything older than 12 s, ducks
  ArkMusic to 0.45. `Cn.shoutLog` = what it said (tests read it while voices are muted). `settings.announcer` false =
  silent. **A new good-news banner whose title the matcher doesn't know is announced as "Nice work!"** (kinds done,
  level, friend): give it its own `ev` line and regex if it deserves better.
- **Faces (cft-world.js, before `W.person`):** `HEAD_ROWS` + `headRow` + `headBump` + `headGeo(skin, f, segments)` (cached
  per skin / jaw / quality) build the skull-jaw-chin surface; `headZ(x, y, f)` (also `W.headZ`) is the front surface:
  **place every face part with `fz(x, y)` so it sits on the face** (eyes, brows, nose, lips, freckles, lines). `hi` (=
  not npc, not LOW) adds the finer parts: iris flecks, a second glint, ear lobes, fingers (`fore`), laces (`shin`),
  shirt buttons. Brows and lash lines are capsules (`P_CAP` turned on z by pi/2): scale x = thickness, y = half length.
  Hair is still fitted to the old big head (`hm.addMerge(hr, ...)`): the new skull keeps the old outer size on purpose.
  Pictures: `game_test.py --models DIR` -> `m1b-face-closeup.png` (portrait lens through `W.cine`) and
  `m1c-face-threequarter.png`.
- **Graffiti (cft-world.js, before `buildingBase`):** `graffitiAtlas()` paints 16 pieces once (canvas 2048 x 1024, 4 x 4
  cells of 512 x 256; words in `WORDS`, characters in `character`), `graffitiSpot(b)` picks about one building in ten
  (`GRAFFITI_SHARE`, hash of the building centre, so the same walls every visit; longest edge >= 4.5 m, height >= 3.2 m,
  2:1 piece up to 7.5 m wide, 0.3-1.5 m above the ground), `graffitiMesh(s)` merges a sub-tile's pieces into one mesh in
  `buildSub` (disposed with the sub-tile). Not greyified on purpose (colour in grey blocks). `b.graffiti` = the spot;
  `W.graffitiNear(x, z, r)`, `W.graffitiStats()`, `W.graffitiAtlas()` for tests. Picture: `--models` -> `m8-graffiti.png`.
- **Tests:** funtest (detail of you vs passers-by, the face surface, graffiti share 4-17%), cinetest (every announcer
  line has a clip, the matcher for achievements / missions / liberation / secrets / discoveries / levels, silence for bad
  news, a fresh cheer each time, the setting).

## Givers, kerbs, the opening (2026-11-24)

- **Mission givers stand at a fixed place:** `W.standSpot(x, z, slot)` (cft-world, after `nearestWalk`) puts them on the pavement of the
  nearest car street on the side of their spot, facing the street, `slot` (from the actor key's hash, -2..2) x 1.6 m along the kerb, never in a
  building (`clearAt` on the building grid). No street loaded yet: pushed out of walls, `fixed: false`, `updateActors` retries every second.
  Idle givers turn back to `userData.standYaw`. Turf bosses use it too. In a scene `W.stageBefore(fig, 1.6)` moves you (on foot) in front of
  them, or up to 1.4 rad to either side when a wall is there.
- **Raised pavement:** `KERB_Y` = 0.2 (one constant next to `standAt`). buildSub draws the brick top (`TL.sidewalk`, the drawn herringbone
  `cartoonPavement`, `real` 0.65), the kerb strip (`TL.path`, borough accent every 2.5 m) and two vertical stone faces (layer -1, `kerbSide`).
  Anything that stands must use `standAt`/`W.standAt` (or `surfaceAt`), never `groundAt`, or it sinks 20 cm into the pavement.
- **The opening is 3 minutes** (`D.CAMPAIGN.INTRO_SECS` 180); the first MEGA comes at `INTRO_SECS * 0.25`.

## Recipes

- **New page:** copy a similar `client_code/Pages/<Name>/`, register it in `client_code/router.py`; new field on Life / Quests /
  Album = add it to that function in cft-kit.js `VIEWS`, then show it in the Form.
- **New server function:** `@anvil.server.callable` in the matching module (+ `C.require_user()` / ownership), a test in
  tools/testing/test_server.py. **New table or column:** `db_schema` in anvil.yaml, the test mock, then the Schema Mismatch step.
- **New mission:** `M(id, chapter, title, giver, at, req, intro, steps, outro, reward)` in cft-content.js (chapter 10 = side
  stories via `S(...)`). Steps (`do`): go, talk, collect, deliver, buy, have, stat, level, own, pay, escort, chase, race, photo,
  visit, dance, quiz, sleep, walk, chat, tag, defend, rush, **count** (`key` = a counter, `n`, `abs: true` when the counter is
  a "right now" number such as `sweet`, `weapons`, `crowned`). Text tokens {name} {place} {n} {pt} {he} {him} {his} {kid} {biz}.
  Keep ids stable (saves hold them). Then `node tools/live/content_check.mjs` and the game test. **Voice it:**
  `python tools/voice_missions.py` + `python -I ../APP_MAKER/media/r2_deploy.py --only=vo/cft/` + `python tools/assets.py` (see Voiced cinematic missions).
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
  check insists), chaser speed in `updateChasers`, event pace `eventT`, spawn counts in cft-world.js `life`. The admin tunes
  live numbers in Admin > Balance (published overrides win over the file); a new formula belongs in `D.calc`, a new number in
  `D.TUNE` (it then shows in the wiki's All knobs tab; add it to a themed tab in cft-wiki.js if it matters for balance).
- **New shooter:** an item with `weapon: {ranged: 'proj', proj, rate, speed, ammo...}` (+ a shape in `W.propMesh`, its name in
  content_check `MESHES`, a projectile look in cft-chaos): it joins the belt, the shops, the town drops and the wiki by itself.

## Hills (Mapterhorn) and the map backup

- Terrain lives in cft-world.js ("terrain" section): Terrarium WebP tiles, zoom 15, world y = (elevation − elevation at home) × 1.5.
  `W.groundAt(x, z)` = the surface, `W.surfaceAt` = ground or a bridge deck, `W.elevAt` = real metres. **`W.heightAt` is the
  building height (0 = open ground), not the ground.** Anything placed in 3D uses `W.groundAt` / `surfaceAt` for y.
- Map backup: every tile a browser loads is sent to `tile_archive` in batches of 8 (`CFT.tiles`); when a service doesn't
  answer, the world asks `tile_backup` (server_code/Tiles.py; cap 3,000 MB; Admin > Map backup).

## Gotchas
- **"Start over" (Settings > reset)** goes through cft-kit.js `mountGame` onReset: it sets `CFT.wiping` (persist/push
  do nothing), destroys the game, then `CFT.reset()` (removes this user's save, the guest save, photos and dex pictures
  on this device + server `reset_save`), then reloads. Order matters: the game's destroy() makes a last "exit" save, which
  before 2026-11-23 wrote the old life straight back. Test: `node tools/testing/reset_test.js` (in check.py).

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

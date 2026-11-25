# cft-content.js — the data dictionary (every table in `window.CFT_DATA`)

## At a glance

| | |
|---|---|
| File | `theme/assets/cft-content.js` (2,009 lines, ~232 KB) |
| Global exported | `window.CFT_DATA = D` (L2008). Every module calls it `D` (`const D = G.D` in the engines, `const D = window.CFT_DATA` in cft-game.js / cft-wiki.js). |
| What it is | Pure data plus four helpers: `D.shopName` (made-up shop names), `D.calc` (the formulas), `D.balancePath` / `D.balanceDefault` / `D.applyBalance` (balance overrides). No DOM, no three.js, no `G`. It runs once at page load, before cft-game.js. |
| Loaded by | `theme/assets/cft-kit.js` (`CFT.load()` chain, and `CFT.wiki()` for Admin > Balance). Also loaded in Node by `tools/live/content_check.mjs` (with `globalThis.window = {}`) and by `tools/vo_lines.mjs` (in a `vm` context). Keep it loadable without a browser. |
| Shape | One IIFE. Base tables first (L9-L943), then "update" sections that **append** to them with `Object.assign(D.ITEMS, {...})`, `D.KINDS.x.sells.push(...)`, `D.RPG.ACH.push(...)` etc. The final value of a table is the base plus every later append, so always search the whole file for a table name. |
| Navigation | `python -I tools/where.py --toc cft-content.js` (section map), `python -I tools/where.py --tune <word>` (a knob in `D.TUNE`). |
| Validator | `node tools/live/content_check.mjs` -> `CONTENT OK (184 missions)` (exit 0) or one line per problem (exit 1). **Not** run by `tools/check.py`: run it yourself after every content change. |
| Balance | Any number reachable by a dotted path can be overridden live from Admin > Balance (see [../balance.md](../balance.md)). Editing the file changes the *default*; a published override still wins. |

Text tokens in any player-facing string (expanded by cft-game `G.text`): `{name}` player name, `{place}` the current step's target name, `{home}`, `{street}`, `{pt}` girlfriend/boyfriend, `{he}` `{He}` `{him}` `{his}` (Sam's pronouns, from `save.pref`), `{kid}` first child's name, `{biz}` first business, `{n}` "how many left" in step texts. An unknown `{token}` is left in the text as is.

## Section map (line ranges are approximate; re-run `--toc`)

| Lines | Section | Tables defined or extended |
|---|---|---|
| 9-327 | base world | `D.STATS`, `D.PICKUPS`, `D.KINDS`, `D.ITEMS`, `D.VEHICLES`, `D.WALK`, `D.APARTMENTS`, `D.BUSINESSES`, `D.CREWS`, `D.STICKER_SETS`, `D.CAST`, `D.FRIENDS`, `D.FRIEND_PERKS`, `D.KID_NAMES`, `D.CHAPTERS` |
| 328-943 | missions | `M()` / `S()` helpers, `QUIZ` (-> `D.QUIZ`), chapters 1-10, `D.JOBS`, `D.CHATTER`, `D.PED_TIPS`, `D.TIPS` |
| 944-1219 | the wacky update (cft-fun.js) | `D.KINDS.joke/fortune`, weapons in `D.ITEMS`, `D.SLAP`, `D.MONSTERS`, `D.CITIES`, `D.CITY_MONSTERS`, `D.MONSTER_LOCAL`, `D.GUARDIANS`, street-life lines, `D.STREETFOLK`, `D.PRANKS`, `D.RIVALS`, `D.FORTUNES`, `D.SHOP_MIX`, `D.shopName`, `D.SIGN_COLS`, `D.EVENTS`, sticker set `shenanigans`, side stories using `count` |
| 1220-1396 | the long game (cft-rpg.js) | `D.RPG` (quality, sources, talents, factions, rares, achievements, gear bases), `D.PICKUPS.chest/wallet`, healing items, mission `s-static` |
| 1397-1517 | the main character update (cft-hero.js) | `D.HEARTON_RE`, `D.KINDS.hearton`, `D.OUTPOSTS`, `D.OUTPOST_CAPTAIN`, `D.RPG.GEAR.hand`, `D.WEAR_SLOTS`, `D.HYPE`, missions |
| 1518-1660 | the chaos update (cft-chaos.js) | ranged weapons + flying gear in `D.ITEMS`, ranged/flying `D.MONSTERS`, chaos `D.EVENTS`, `D.CHAOS`, missions, achievements |
| 1661-1701 | the stunt update (cft-stunt.js) | `D.STUNT`, achievements, missions |
| 1702-1786 | the campaign update (cft-camp.js) | `D.CAMPAIGN`, `D.PICKUPS.ammo/water/volt/foam`, achievements, missions |
| 1787-1918 | knobs | `D.TUNE` (L1790), `D.COMBAT` alias (L1917) |
| 1919-1934 | weaknesses | `D.DMG_TYPES`, the `WEAK` table -> `D.MONSTERS[k].weak` |
| 1935-1955 | weapon numbers | `D.WEAPON_DEFAULTS`, fills every weapon (and `D.SLAP`) with explicit numbers |
| 1956-1981 | formulas | `D.calc` |
| 1982-2006 | balance overrides | `D.BAL_DEFAULTS`, `D.balancePath`, `D.balanceDefault`, `D.applyBalance`, `D.BAL_ON` |

## Which modules read which table

Found with `grep -l "D\.<NAME>\b" theme/assets/*.js` (cft-content.js itself excluded; content_check.mjs = the validator also checks it).

| Table | Read by |
|---|---|
| `D.STATS` | cft-game, cft-kit, cft-rpg, cft-ui, content_check |
| `D.PICKUPS` | cft-game, cft-ui, content_check |
| `D.KINDS` | cft-cine, cft-color, cft-fun, cft-game, cft-ui, content_check |
| `D.ITEMS` | cft-aim, cft-camp, cft-chaos, cft-debug, cft-fun, cft-game, cft-kit, cft-rpg, cft-ui, cft-wiki, content_check |
| `D.VEHICLES` | cft-game, cft-hero, cft-ui, content_check |
| `D.WALK` | cft-game, cft-hero, cft-wiki, content_check |
| `D.APARTMENTS` | cft-game, cft-kit, cft-ui |
| `D.BUSINESSES` | cft-game, cft-ui, content_check |
| `D.CREWS` | cft-game |
| `D.STICKER_SETS` | cft-game, cft-kit, cft-rpg, cft-ui, content_check |
| `D.CAST` | cft-cine, cft-debug, cft-fun, cft-game, cft-hero, cft-kit, cft-ui, content_check |
| `D.FRIENDS` / `D.FRIEND_PERKS` / `D.KID_NAMES` | cft-game (+ cft-kit, cft-ui for perks) |
| `D.CHAPTERS` | cft-cine, cft-game, cft-kit, tools/vo_lines.mjs |
| `D.MISSIONS` | cft-camp, cft-debug, cft-game, cft-kit, cft-ui, cft-wiki, content_check, tools/vo_lines.mjs |
| `D.QUIZ` / `D.JOBS` / `D.CHATTER` | cft-game |
| `D.TIPS` | cft-ui |
| `D.PED_TIPS` | nobody (dead data; safe to leave) |
| `D.SLAP` | cft-camp, cft-fun, cft-wiki |
| `D.MONSTERS` | cft-camp, cft-debug, cft-fun, cft-hero, cft-rpg, cft-wiki, content_check |
| `D.CITIES` / `D.CITY_MONSTERS` / `D.MONSTER_LOCAL` | cft-fun, content_check |
| `D.GUARDIANS` | cft-fun, cft-wiki, content_check |
| street-life lines (`D.STATIC_LINES`, `D.MONSTER_LINES`, `D.MONSTER_TITLES`, `D.FLIRT`, `D.CRUSH_TITLES`, `D.JOKES`, `D.JOKE_REPLIES`, `D.BONKED`, `D.PILLOW_FIGHT`, `D.FOLK_*`, `D.CROWN_AT`, `D.PRANKS`, `D.KEEPER_GIVEUP`, `D.RIVAL_LINES`) | cft-fun |
| `D.CRUSH_NAMES` | cft-fun, cft-hero |
| `D.STREETFOLK`, `D.KEEPER_LINES`, `D.RIVALS`, `D.FORTUNES` | cft-fun, content_check |
| `D.SHOP_MIX`, `D.shopName`, `D.SIGN_COLS` | cft-game, content_check |
| `D.EVENTS` | cft-camp, cft-chaos, cft-debug, cft-fun, content_check |
| `D.RPG` | cft-rpg, cft-ui, cft-wiki, content_check |
| `D.HEARTON_RE` | cft-game |
| `D.OUTPOSTS` | cft-hero, cft-wiki |
| `D.OUTPOST_CAPTAIN` | cft-hero |
| `D.WEAR_SLOTS` | cft-game, cft-ui, content_check |
| `D.HYPE` | cft-fun, cft-hero |
| `D.CHAOS` | cft-chaos, cft-debug, content_check |
| `D.STUNT` | cft-stunt |
| `D.CAMPAIGN` | cft-camp, cft-game, cft-wiki |
| `D.TUNE` | cft-aim, cft-camp, cft-chaos, cft-color, cft-fun, cft-game, cft-hero, cft-rpg, cft-stunt, cft-wiki, cft-wild, cft-world (group -> module map in [../balance.md](../balance.md)) |
| `D.COMBAT` | cft-fun, cft-hero (same object as `D.TUNE.combat`) |
| `D.DMG_TYPES` | cft-wiki (cft-fun reads the filled `weak` maps) |
| `D.WEAPON_DEFAULTS` | cft-rpg |
| `D.calc` | cft-camp, cft-chaos, cft-fun, cft-wiki (cft-game wraps `xpAt` / `levelOf`) |
| `D.applyBalance`, `D.balancePath`, `D.balanceDefault`, `D.BAL_DEFAULTS` | cft-game (`G.applyBalance`), cft-wiki |

---

## Base world tables

### `D.STATS` (L9) — the five stats
Array of `{ id, name, e, color, blurb }`. `id` is one of `fit`, `charm`, `smarts`, `style`, `cred`; these five ids are referenced everywhere (`stats: {...}` maps in items, rewards, `req.stat`, talents, `D.RPG.SUFFIX`). `happy` is *not* a stat here but is accepted wherever cft-game `stat()` is used (`do: 'stat', stat: 'happy'`).
```js
{ id: 'fit', name: 'Fitness', e: '💪', color: '#ff6b4a', blurb: 'Run faster and keep more energy.' },
```
Adding a stat is a code change (UI bars, `save.stats`, the RPG suffixes), not a data change.

### `D.PICKUPS` (L18, + `chest` L1353, `wallet` L1385, `ammo` `water` `volt` `foam` L1749-1752) — things lying in the street
Object `id -> { e, n, bg, w, ...effect }`.

| Field | Type | Meaning |
|---|---|---|
| `e`, `n`, `bg` | string | emoji, name, badge background colour |
| `w` | number | random spawn weight; `0` = never spawned at random (mission-only or spawned by code). cft-game builds `PICK_W` from every `w > 0`. |
| `money` | `[min, max]` | dollars |
| `energy` | number | energy points |
| `stat` | stat id | adds a quarter point of that stat |
| `item` | item id | also gives that item (`spray`) |
| `xp`, `happy` | number | |
| `sticker` | number | sticker packs |
| optional flags | bool | `loot` (opens cft-rpg loot), `beam` (light beam over it), `wallet` (your dropped wallet), `camp` (cft-camp pickups) |

```js
coin: { e: '🪙', n: 'Coin', bg: '#ffd54a', w: 46, money: [1, 4] },
herb: { e: '🌿', n: 'Fresh basil', bg: '#d6f5c8', w: 0 },   // mission-only: a collect step scatters these
```
A `collect` step with a `w: 0` pickup scatters `n` of them on walkable spots (cft-game `beginStep`); with a `w > 0` pickup it counts ordinary pickups picked up. **Add one:** an entry with `w: 0` for mission items; `content_check` then accepts it in `collect.what`.

### `D.KINDS` (L50, + `joke` `fortune` L949-950, `hearton` L1404; `sells` lists are appended to in L978-987, L1382-1384, L1541-1546) — kinds of place
Object `kind -> { e, n, fake: [names], sells: [item ids] }` (40 kinds). Real map places get a kind from cft-tiles.js; when an area lacks one, the game opens a made-up one in a real building named from `fake` / `D.shopName`. `sells` is the shop's stock in order.
```js
cafe: { e: '☕', n: 'Café', fake: ['Café Lune', 'The Daily Grind', 'Bean There', 'Brew Haven', 'Café Mistral', 'Perk Up'], sells: ['coffee', 'latte', 'croissant', 'muffin', 'cookie'] },
```
Mission targets (`at`, `to`, `of`, `kinds`) must be a kind id or one of the special targets in [Mission targets](#mission-targets). **Add one:** `D.KINDS` entry + `D.SIGN_COLS[kind]` (content_check insists) + either the tag mapping in cft-tiles.js (real places) or a `D.SHOP_MIX` weight + `NAME_B[kind]` (made-up shops).

### `D.ITEMS` (L92; appended at L957, L1376, L1408, L1443, L1526; `bandage.heal` set at L1381) — everything you can buy, carry, wear or receive
Object `id -> item` (146 items). Common fields: `n` name, `e` emoji, `p` price ($, `0` = free/quest), `type`.

| `type` | Meaning | Type-specific fields |
|---|---|---|
| `food` | eaten at once | `energy`, `happy`, `stats` (small fractions) |
| `snack` | goes in the bag, eat later | `energy`, `happy`, `heal` (health; the Q key eats the best one), `give` (gives another item id instead, e.g. `spraycan` -> `spray`) |
| `gift` | bag, give to a person | `rel` (relationship points) |
| `gear` | worn in a wardrobe slot | `slot` (a `D.WEAR_SLOTS` id), `stats`, `speed` (share, e.g. 0.06), `radar` (phone map range), `color` (body tint, read by cft-game L1356), `happy`, `weapon` (see below), `fly` (`'jet'` or `'glide'`) |
| `vehicle` | a ride | needs a `D.VEHICLES[id]` entry (content_check insists) |
| `furniture` | goes in your home | `apt` (minimum apartment tier), `happy`, `energy`, `stats` |
| `pet` | adopt | `pet` (`'dog'`/`'cat'`), `apt` |
| `service` | instant effect | `energy` (negative = costs energy), `happy`, `stats`, `hours` (game hours it takes), `once` (buy once), `maxEnergy`, `sticker`, `fortune` |
| `license` | unlocks vehicles | |
| `quest` | given and taken by missions | `p: 0`; `ring` is a quest item with a price |
| `tool` | `spray` (tagging) | |

Optional `req` on any item (cft-game ~L1303): `{ item: id }` must own it, `{ m: missionId }` mission done, `{ lvl: n }` level. cft-aim and cft-rpg also read `req.lvl`.
```js
sneakers2: { n: 'Runner pro shoes', e: '🥾', p: 220, type: 'gear', slot: 'feet', speed: 0.12, stats: { fit: 1 } },
license_moped: { n: 'Scooter licence', e: '🪪', p: 120, type: 'license', req: { m: 'c3-license' } },
bed: { n: 'King-size bed', e: '🛏️', p: 900, type: 'furniture', happy: 5, apt: 2, energy: 20 },
```

**Weapons** are `type: 'gear', slot: 'weapon'` with a `weapon` object (24 weapons). Melee fields: `dmg` (hit points per hit, shown ×10 in game), `reach` (m), `arc` (degrees, 360 = all round), `cd` (s between swings), `hits` (max figments per swing), `knock`, `stun` (s), `mesh` (3D shape name; must be in content_check `MESHES` and drawn by `W.propMesh`), `word` (pop-up text), `puff` (emoji particles), `ranged: 'cone'` (leaf blower). Ranged (`ranged: 'proj'`, the chaos update): `proj` (projectile look; must be in content_check `PROJ`), `rate` (s per shot), `speed` (m/s), `ammo` (per shot), `lob`, `splash` (m), `pellets` + `spread`, `bounce`, `pierce`, `back` (boomerang). `ranged: 'shot'` = the bubble blaster path. After L1948 every weapon (and `D.SLAP`) is filled from `D.WEAPON_DEFAULTS` so `arc cd hits knock stun add crit def block` (melee/cone) or `rate ammo pellets splash speed knock stun add crit` (proj/shot) are always explicit numbers — that makes each one a balance path like `ITEMS.w_pan.weapon.dmg`.
```js
w_pan: { n: 'Cast-iron frying pan', e: '🍳', p: 70, type: 'gear', slot: 'weapon', weapon: { dmg: 3, reach: 1.8, arc: 110, cd: 0.5, knock: 7, stun: 0.8, mesh: 'pan', word: 'BONNNG!' } },
w_straw: { n: 'Spitball straw', e: '🥤', p: 15, type: 'gear', slot: 'weapon', weapon: { dmg: 0.8, reach: 16, knock: 2, ranged: 'proj', proj: 'spit', rate: 0.32, speed: 24, mesh: 'straw', word: 'PTOO!', puff: '💦' } },
```
**Add an item:** entry in `D.ITEMS` + its id in at least one `D.KINDS[k].sells` (gear and weapons with no shop fail content_check). Gear `slot` must be a `D.WEAR_SLOTS` id. A weapon also needs a mesh in `W.propMesh` (cft-world.js) and its `mesh` added to `MESHES` in content_check.mjs; a shooter needs a projectile look in cft-chaos and `proj` in `PROJ`.

### `D.VEHICLES` (L205) and `D.WALK` (L214) — speeds
`D.VEHICLES[itemId] = { mode: 'ride'|'drive', walk, run (m/s cruise / with Shift), radius (m), color, jump? (m/s, ride only), kind? ('bike'), turn?, accel? (drive only) }`. `D.WALK = { walk: 8.4, run: 15.5 }` (m/s on foot). Every monster's `speed` must stay below `D.WALK.run` (content_check).
```js
car: { mode: 'drive', walk: 21, run: 30, radius: 1.0, turn: 2.0, accel: 11, color: 0xf2b134 },
```

### `D.APARTMENTS` (L216) — homes, by tier 0-6
`{ tier, n, e, cost, rent ($ per game day; 0 = bought), happy, kids (max kids), partner? (room for a partner), pick ('start' | 'house' | 'tallest' | { hMin, hMax, aMin? } building height/area filter), blurb }`. Items with `apt: n` need this tier.
```js
{ tier: 1, n: 'Basement studio', e: '🛏️', cost: 250, rent: 25, happy: 4, kids: 0, pick: { hMin: 5, hMax: 18 }, blurb: 'Small and a little damp, but all yours.' },
```

### `D.BUSINESSES` (L227) — businesses you can own
`{ id, n, e, cost, income ($ per game hour at level 1), up: [4 upgrade names], deliver (item id or 'lemonade'/'dog' used by rush deliveries) }`. The server keeps its own copy of costs for net worth (server_code/Game.py `BIZ_COST`, and `APT_VALUE` for bought homes): change both. `D.RIVALS` keys must be business ids.
```js
{ id: 'lemonade', n: 'Lemonade stand', e: '🍋', cost: 60, income: 6, up: ['Bigger pitcher', 'Pink lemonade', 'Umbrella & chairs', 'Lemon franchise'], deliver: 'lemonade' },
```

### `D.CREWS` (L246) — rival crews holding turf
`{ id, n, e, color, boss, ch (challenge: 'race' | 'dance' | 'quiz' | 'chase' | 'cred'), taunt, lose, look (person look, see `CFTWorld.person`) }`. Quiz crews pick a `D.QUIZ` set in cft-game (`latte` -> coffee, `oldmoney` -> posh, others -> trivia).

### `D.STICKER_SETS` (L262, + `shenanigans` L1178) — the album
`{ id, n, items: [[stickerId, emoji, name] x 6], bonus, bonusText, rare?, feat? }`. 14 sets. Each set must have exactly 6 stickers and sticker ids are unique across all sets (content_check). `bonus` keys read by cft-game `setBonus` / `stat`: `stats: {stat: n}`, `food`, `happy`, `speed`, `energy`, `xp`, `luck`, `income`. `feat: true` = earned only (never in packs). Mission `reward.sticker` must be one of these sticker ids.
```js
{ id: 'transit', n: 'Getting Around', bonus: { speed: 0.05 }, bonusText: 'Everything rides 5% faster', items: [['bus', '🚌', 'Bus'], ['metro', '🚇', 'Metro'], ['taxi', '🚕', 'Taxi'], ['bike', '🚲', 'Bike'], ['scooter', '🛴', 'Scooter'], ['tram', '🚋', 'Tram']] },
```

### `D.CAST` (L279) — named people and animals
`id -> { n, e, role, look, likes: [item ids], lookB?, animal?, color? }`. `look` = person look for `CFTWorld.person` (skin, hair, shirt, pants, flags like `beard`, `glasses`, `dress`, `apron`, `h` height); `lookB` = Sam's look when `save.pref === 'bf'`; `animal: 'cat'|'dog'` + `color` for animals (no `look`). `likes` = gifts they love. Mission `giver`, step `who`, `reward.rel` keys and `reward.partner` must be cast ids. A cast member who speaks voiced lines should also get a Kokoro voice in `VOICES` (tools/voice_missions.py; otherwise `DEFAULT` is used).
```js
okafor: { n: 'Professor Okafor', e: '👨‍🏫', role: 'Librarian, professor, walking encyclopedia', look: { skin: 0x6b4126, hair: 0x8a8a8a, shirt: 0x7b52c7, pants: 0x24324a, glasses: true, beard: true }, likes: ['novel', 'textbook', 'chocolates'] },
```

### `D.FRIENDS` (L307), `D.FRIEND_PERKS` (L308), `D.KID_NAMES` (L313)
`D.FRIENDS` = cast ids that can become friends; `D.FRIEND_PERKS[id]` = perk text (the effect is coded in cft-game, e.g. `isFriend('noor')` pays $25 per photo). `reward.friend` must be in `D.FRIENDS` (or `bouchard`). `D.KID_NAMES` = default baby names.

### `D.CHAPTERS` (L315) — story chapters
`{ id: 1..10, n, e, blurb }`. A mission's `ch` must be one of these ids: the Quests page (`missionBoard`) groups by chapter, so a mission with an unknown `ch` never shows there (content_check does **not** catch this). Chapter 10 = side stories (`S(...)`). cft-cine shows chapter cards.

---

## Missions: `D.MISSIONS` (L333; 184 missions from L348 to L1782)

### How a mission is written
```js
function M(id, ch, title, giver, at, req, intro, steps, outro, reward, extra) {
  D.MISSIONS.push(Object.assign({ id, ch, title, giver, at, req: req || {}, intro, steps, outro, reward }, extra || {}));
}
const S = (id, title, giver, at, req, intro, steps, outro, reward) => M(id, 10, title, giver, at, req, intro, steps, outro, reward);
```
Real example (chapter 1):
```js
M('c1-rosa', 1, 'The Nonna of the Block', 'max', 'home', { m: ['c1-coffee'] }, [
  'Nonna Rosa knows everybody, feeds everybody and judges everybody. If she likes you, this whole neighbourhood likes you.',
  "She's usually at {place}. Go say hi. Be polite. Eat whatever she gives you.",
], [{ do: 'talk', who: 'rosa', at: 'bakery', text: 'Find Nonna Rosa near {place}', say: [
  'Rosa: Eh! You must be Max\'s cousin. Same nose. Too skinny! Here, eat a cannoli.',
  'Rosa: You need anything in this neighbourhood, you come to me. And you help me sometimes, yes? That\'s how it works here.'] }],
['Rosa: Good. Now go, go, I have bread in the oven.'], { xp: 50, items: { cannoli: 1 }, rel: { rosa: 15 } });
```

| Field | Type | Rules |
|---|---|---|
| `id` | string | unique, stable forever (saves store progress by id in `save.m[id]`). Convention: `c<chapter>-<word>` for story, `s-<word>` for side stories. |
| `ch` | 1..10 | a `D.CHAPTERS` id (`S()` sets 10) |
| `title` | string | shown on the Quests page, banners, title card |
| `giver` | cast id | the person who offers it (content_check) |
| `at` | kind id or `home` | where the giver stands (cft-game `spotOf`: a place of that kind near the player, remembered per save in `save.spots`) |
| `req` | object | see [Requirements](#requirements) |
| `intro` | string[] | lines said when offered (must be non-empty: content_check); `{place}` here = "a <kind> nearby" |
| `steps` | object[] | done in order; see [Step types](#step-types-do) |
| `outro` | string[] | lines said on completion (may be empty) |
| `reward` | object | see [Rewards](#rewards) |
| `extra` | object (optional) | merged into the mission. Only `pref: true` exists today (`c5-meet`): before the intro, Rosa asks "a girlfriend or a boyfriend?" and stores `save.pref`. |

Dialogue convention: lines spoken by someone other than the giver start with `Name: ` (e.g. `'Rosa: ...'`); cft-cine (`CFTCine.speaker`) uses that prefix to pick the speaker and voice.

**File order matters.** cft-camp `K.capOpen` sorts open story missions by their index in `D.MISSIONS` (`MIDX`) and only shows 1, then 3, then at most 5 on the map (`D.CAMPAIGN.CAP`). Put a new early mission early in the file; a new late one at the end.

### Requirements
`req` is checked by cft-game `reqMet` (L85) to move a mission from locked to open (`refreshAvailability` after every completion and on load). All keys optional; `{}` = available from the start.

| Key | Type | Meaning | Used today |
|---|---|---|---|
| `m` | string[] | every listed mission done | 179 missions |
| `lvl` | number | player level ≥ (`levelOf(save.xp)`) | 10 |
| `partner` | true | dating someone | 1 |
| `married` | true | married | 0 (supported) |
| `kids` | number | at least this many kids | 0 (supported) |
| `stat` | `{stat: n}` | each stat ≥ n | 1 (`{ smarts: 8 }`) |

The comment above `M()` (L301) also lists `apt`, `friends`, `turf`, `biz`, `own`: **these are not read by `reqMet`** — do not use them as requirements; use an `own` step instead. cft-kit (L299-302) renders `m`, `lvl`, `partner`, `stat` on the Quests page.

### Step types (`do`)
Each step needs `do` (one of the 24 below; content_check `DOS`) and `text` (the objective line; `{place}` and `{n}` work). Optional on any step: `say` (string[] spoken when the step completes, or the dialogue of a `talk`), `when: [fromHour, toHour]` (only between those game hours; wraps past midnight, e.g. `[22, 2]`; honoured by `go`, `escort` and the interactive steps). Engine: cft-game `beginStep` (L557, set-up), `updateMissions` (L712, passive/arrival checks every 0.5 s), `triggerStep` (L666, E-key interactions), `completeStep`, `stepGoal` (arrow target), cft-kit `stepLabel` (Quests text).

| `do` | Fields (required **bold**, optional plain) | Completes when |
|---|---|---|
| `go` | **`to`** (target), `who` (with `to: 'who'`), `get: {energy, money}` (given on completion), `family` (partner/kids must be following), `when` | you are within 8 m of the target (×1.6 in a car) |
| `talk` | **`who`** (cast id), **`at`** (kind, `giver`, or `here` = right where you are), **`say`**, `ask` | dialogue ends; with `ask`, a "good" answer is picked (a wrong one costs −2 relationship) |
| `collect` | **`what`** (pickup id), **`n`**, `near: 'giver'` (scatter around the giver; any other value incl. `'here'` = around you), `far: true` (250-600 m instead of 45-280 m) | all `n` scattered pickups taken (`w: 0` pickups) or `n` taken |
| `deliver` | **`item`**, **`to`**, **`n`**, `time` (s) | `n` arrivals (a new target each time for `addr`); the item is given at start and removed after. Fails and restarts on timeout. |
| `buy` | **`item`** | you own/hold it or bought one since the step began (pets: own that pet) |
| `have` | **`money`** | cash ≥ money |
| `stat` | **`stat`** (stat id or `happy`), **`n`** | stat ≥ n |
| `level` | **`n`** | level ≥ n |
| `own` | **`what`** (`apt` `biz` `bizid` `turf` `friends` `kids` `managers` `upgrades` `stickers` `sets`), `n` (default 1), **`id`** with `bizid` (a business id) | cft-game `ownCount` ≥ n (`apt`: tier ≥ n) |
| `pay` | **`money`**, **`at`** | you confirm the payment there |
| `escort` | **`who`** (cast id or `kid`), **`to`**, `speed` (their top speed m/s; slow walkers 1.3-3), `when` | you and they are within 14 m / 10 m of the target (or you drive) |
| `chase` | **`who`**, **`at`** (or `here`), **`time`** (s, default 60), **`speed`** (m/s, default 6.5) | you catch them in time |
| `race` | **`n`** (checkpoints), **`time`** (s), `ride` (`'foot'` `'ride'` `'drive'` `'any'`), `hill: true` (each checkpoint higher) | every checkpoint in time |
| `photo` | **`of`** (target), `when` | you press E there |
| `visit` | **`kinds`** (kind ids), `time` (s) | you came within 10 m of a place of every kind |
| `dance` | **`at`**, **`n`** (moves), `speed` (multiplier) | ≥ 70 % score |
| `quiz` | **`at`**, **`qs`** (a `QUIZ` set), **`need`** (right answers; `qs.length` ≥ `need`) | enough right answers |
| `sleep` | — | you sleep at home |
| `walk` | **`m`** (metres on foot) | walked m metres since the step began |
| `chat` | **`n`** | n street chats since the step began (counter `chats`) |
| `tag` | **`n`** | n crew posters tagged (counter `tags`) |
| `defend` | — | one turf defence (counter `defends`) |
| `rush` | **`n`** | n business rush jobs (counter `rush`) |
| `count` | **`key`** (a counter), **`n`**, `abs: true` | counter rose by n since the step began; with `abs`, the counter's current value ≥ n (use for "right now" numbers: `weapons`, `sweet`, `crowned`, `dex`) |

`ask` (on `talk`): `{ q, opts: [[text, need, reply, good], ...] }` — exactly four items per option (content_check): `need` = `{stat: n}` or `null` (option locked below it), `good` = whether it passes the step.
```js
ask: { q: 'What do you say?', opts: [
  ['"I was looking for a flower... and then I saw you."', { charm: 2 }, 'Sam laughs. "Okay, that was cheesy. But it worked."', true],
  ['"Do you sell cactus?"', null, 'Sam squints. "...Yes?" It is a little awkward. Maybe try again.', false]] }
```
`count` keys accepted by content_check (`COUNTERS`): stunts firerings megarings flips rolls bullseyes views climbed glided perfectdodges arcs airshots flurryhits dodgehops secrets fires_out megas zaps walljumps bestchain stomps shots bonk_gull dex airtime hoops rankA rankS rankSS rankSSS farts pinatas launches reflects cushions aura bonks helped flirts escapes slides bounces ufos boss sweet crowned weapons pranks dates jokes blocks parries lib_hearton lib_grocery liberated smash borrowed carsmash maincharacter. A **new** counter needs code that bumps it (`G.bump('key')` / the `bump` api in a module) *and* the key added to `COUNTERS`.

### Mission targets
Values for `at`, `to`, `of` (resolved by cft-game `resolveTarget`, L451): any `D.KINDS` id (nearest/random place of that kind), plus content_check `TARGETS`: `giver` (where the giver stands), `who` (where `step.who` was last met; falls back to `giver`), `home`, `here` (your position), `addr` (a real house number 80-450 m away; deliveries), `tall` (tallest building), `water` (water or a park pond), `spot` (a random walk spot 150-350 m away), `hilltop` (the highest street around; falls back to `park`).

### Rewards
`reward` is applied by cft-game `applyReward` (L311) on completion; all keys optional.

| Key | Type | Effect |
|---|---|---|
| `money` | number | dollars |
| `xp` | number | XP (× XP multipliers); every mission has it |
| `stats` | `{stat: n}` | stat points (fractions OK) |
| `items` | `{itemId: n}` | give (negative = take away, e.g. `{ ring: -1 }` for a proposal) |
| `rel` | `{castId: n}` | relationship points |
| `happy`, `energy` | number | |
| `sticker` | sticker id | gives that sticker |
| `friend` | cast id in `D.FRIENDS` | becomes a friend (unlocks the perk) |
| `partner` | cast id | starts dating (rel ≥ 80) |
| `engaged`, `married`, `kid` | true | life events (`kid` asks for a name) |

cft-rpg `questDone` also offers a choice of three loot rewards for every story mission, and each finished mission switches on the next `D.CAMPAIGN.WILD` feature.

### Dynamic missions (not in `D.MISSIONS`)
`D.JOBS` templates (odd jobs) and business rush jobs are copied into `save.dyn[id]` with the same shape (`giver: 'priya'`, `at: 'home'`, `job: true` or `rush: <bizId>`), and `getM(id)` finds them there. They are not validated by content_check beyond what they share with the step rules, so keep their steps to `deliver` / `go` / `escort` / `collect` / `chat` / `photo` / `race`.

`D.JOBS` (L903): `{ t, e, steps, pay: [min, max] }` (pay × (1 + 0.15 × level)).

### `QUIZ` / `D.QUIZ` (L337, exported L900)
`QUIZ[set] = [[question, [answers...], rightIndex], ...]`. Sets: `road`, `trivia`, `smart`, `biz`, `coffee`, `posh`, `civic`. Missions use `qs: QUIZ.road`; crews use `D.QUIZ.*`.

### Voice lines
Every `intro` / `say` / `outro` line is voiced by Kokoro: tools/vo_lines.mjs extracts them, tools/voice_missions.py renders the clips into APP_MAKER/media/public/vo/cft and writes `theme/assets/cft-vo.js` (`window.CFT_VO`, "do not edit by hand"). The clip key is a hash of speaker + text, so **any edit to a line (or a new mission) has no voice until you re-render**; the game then shows subtitles only. Re-render: `python tools/voice_missions.py`, upload with `python -I ../APP_MAKER/media/r2_deploy.py --only=vo/cft/`, then `python tools/assets.py`.

### How missions are validated (`tools/live/content_check.mjs`)
Per mission: unique id; every `req.m` exists; `giver` in `D.CAST`; `at` is a kind or target; `intro` non-empty. Per step: `do` in `DOS`; `text` present; `item` in `D.ITEMS`; `who` in `D.CAST` (or `kid`); `collect.what` in `D.PICKUPS`; `own.what` in `OWN` and `bizid` -> a real business; `quiz` has ≥ `need` questions; `stat` is a stat or `happy`; `to: 'who'` has `who`; `count` has a known `key` and `n > 0`; `to`/`at`/`of`/`kinds` are kinds or targets; every `ask` option has 4 parts. Rewards: items, rel people, stats, sticker id, friend in `D.FRIENDS`. Then **reachability**: it walks the `req.m` graph and fails any mission that can never unlock (cycles, typos). It does *not* check `ch` against `D.CHAPTERS`, `req.lvl` / `req.stat` sanity, `{tokens}`, voice clips, the `when` format, or that a `count` key is actually bumped somewhere.

### Recipe: a new mission
1. Pick a giver who already knows the player (and has a voice in `VOICES`), and an `at` they use elsewhere.
2. Append with `M(...)` in its chapter block (or `S(...)` for a side story), in the order the player should meet it.
3. `req.m` = the mission(s) that must come first (at least one, unless it should be open from the start).
4. Steps from the table above; reuse existing items/pickups or add `quest` items (`p: 0`) / `w: 0` pickups first.
5. Reward in line with neighbours of the same chapter (chapter 1: ~30-80 XP, $10-25; late side stories: hundreds to thousands).
6. `node tools/live/content_check.mjs`, then render voices, `python tools/assets.py`, and a game test (below).
```js
S('s-example', 'Example Title', 'kai', 'park', { m: ['c3-kai'] }, ['Kai: One line of intro with {place}.'],
  [{ do: 'count', key: 'smash', n: 5, text: 'Smash 5 things 💥' }, { do: 'go', to: 'giver', text: 'Tell Kai' }],
  ['Kai: Outro line.'], { money: 80, xp: 250, rel: { kai: 8 } });
```

---

## The wacky update tables (cft-fun.js)

### `D.SLAP` (L988)
Bare-hand "weapon": `{ dmg: 0.5, reach: 2.1, knock: 2, mesh: null, word: 'SLAP!' }`, then filled with the melee defaults (L1954). Balance path `SLAP.dmg`.

### `D.MONSTERS` (L993, + ranged/flying L1550) — figments
`kind -> { n, e, hp, speed (m/s, < D.WALK.run), atk (health per hit before armour), steal: [min, max] coins grabbed ([0, 0] = hits only), coins: [min, max], xp, w (spawn weight; 0 = only by events/code), night?, size?, cash?, boss?, gem?, ranged?, fly?, weak }` (19 kinds). `ranged = { r (range m), cd: [min, max] s, proj (in `PROJ`), dmg, speed?, lob?, drop? (falls from above), slow? (s of lag) }`; `fly` = metres above the street. `weak` is added at L1932: `{bonk, shot, water, volt, fire, stomp}` multipliers, 1 = normal (from the `WEAK` table, or a `weak` you put on the entry yourself). Levels scale with yours via `D.calc.scale`.
```js
slime: { n: 'Sidewalk slime', e: '🟢', hp: 2, speed: 3.2, atk: 5, steal: [1, 4], coins: [3, 5], xp: 12, w: 10 },
gull: { n: 'Seagull sniper', e: '🕊️', hp: 2, speed: 6.2, atk: 4, steal: [1, 3], coins: [4, 7], xp: 22, w: 5, fly: 5.5, ranged: { r: 14, cd: [2.0, 3.0], proj: 'poop', dmg: 3, drop: true } },
```
**Add one:** entry + `D.MONSTER_LOCAL[kind]` (≥ 3 names) + a name in every `D.CITY_MONSTERS[city]` + a model branch in cft-world `W.monster` / `W.animateMonster` (+ `WEAK` row if it has weaknesses). content_check requires at least 15 kinds and checks hp/speed/coins/steal/atk/ranged.

### `D.CITIES` (L1011), `D.CITY_MONSTERS` (L1016, + L1556-1561), `D.MONSTER_LOCAL` (L1036, + L1562)
`D.CITIES = [{ id, n, lat: [min, max], lon: [min, max] }]` (map boxes: montreal, newyork, paris, london, riga, tokyo). `D.CITY_MONSTERS[cityId][kind]` = hand-written local name; outside the boxes a name is picked from `D.MONSTER_LOCAL[kind]` (string list).

### `D.GUARDIANS` (L1047)
`kind -> name` of metro-entrance guardians (each key must be a `D.MONSTERS` kind). Their numbers: `D.TUNE.bosses.guard*`.

### Street-life text lists (cft-fun.js)
| Table | Shape |
|---|---|
| `D.STATIC_LINES`, `D.MONSTER_LINES`, `D.BONKED`, `D.PILLOW_FIGHT`, `D.FOLK_THANKS`, `D.FOLK_SNUB`, `D.FOLK_RUDE`, `D.FOLK_KING`, `D.KEEPER_GIVEUP`, `D.RIVAL_LINES`, `D.CRUSH_NAMES` | string[] |
| `D.MONSTER_TITLES`, `D.CRUSH_TITLES`, `D.FOLK_TITLES` | `[[threshold, title], ...]` ascending |
| `D.CROWN_AT` | number (street hearts to be crowned; 40) |
| `D.FLIRT` | `{ lines, yes, no, taken, sweet, miss, date, drama: string[], gone: string }` (`{n}` = name, `{pt}`) |
| `D.JOKES` | `[[setup, punchline], ...]`; `D.JOKE_REPLIES = { good, bad }` |
| `D.KEEPER_LINES` | `kind -> string[]` plus `any` (keys must be kinds or `any`) |

### `D.STREETFOLK` (L1090)
`{ id (unique), n, e, hi, story: [≥ 2 strings], look }` (content_check). Tone rule from the file: never the butt of the joke.

### `D.PRANKS` (L1110), `D.RIVALS` (L1126), `D.FORTUNES` (L1130)
`D.PRANKS = [{ id, t, gain: {stat|energy|happy: n}, xp }]`. `D.RIVALS = { businessId: kindId }` (made-up shops of that kind chase you once you own the business). `D.FORTUNES = [{ t, do }]`, `do` one of `coins goose charm slimes sticker ufo speed peels` (coded in cft-fun; content_check).

### `D.SHOP_MIX` (L1138), `D.shopName` (L1151), `D.SIGN_COLS` (L1159)
`D.SHOP_MIX = [[kind, weight], ...]` for made-up shops (`grocery` weight lowered to 5 at L1407, `hearton` added). `D.shopName(kind, r)` (r in 0..1, stable per building) picks `fake[...]` one time in three, else `NAME_A` + `NAME_B[kind]`; `hearton` is always "Tom Hearton's". `D.SIGN_COLS[kind]` = CSS colour of the 3D sign; every kind needs one.

### `D.EVENTS` (L1166, + chaos L1568)
`{ id, n (banner), sub, w (weight), day?, lvl? (min level), chaos? }`. `id` must be coded in cft-fun `startEvent` / `updateEvent` (or cft-chaos for `chaos: true`); content_check lists the allowed ids.

---

## The long game: `D.RPG` (L1223, + L1358, L1431, achievements appended L1646, L1681, L1753, L1763)

| Key | Shape / meaning |
|---|---|
| `BAG`, `SLOTS`, `TIER_COST`, `PITY` | 30 bag slots; charm slots `['c1','c2','c3']`; talent points per tier; pity counter |
| `QUALITY` | `[{ n, c (colour), k (stat budget ×), w (drop weight) }]` Junk..Legendary (index = quality 0-5) |
| `SOURCES` | `name -> { chance, minQ }` (`monster`, `pigeon`, `rare`, `boss`, `chest`, `crate`, `quest`); a new source also needs a `G.rpg.drop('name')` call |
| `JUNK`, `CHARMS` | `[[emoji, name], ...]` |
| `SUFFIX`, `ADJ`, `LEGEND_ADJ`, `PREFIX` | name parts |
| `PERKS` | `[{ k, v, d, flat? }]` (one perk on Epic/Legendary) |
| `BRANCHES` | `[{ id, n, e, blurb }]` (`hustle`, `charm`, `brawl`) |
| `TALENTS` | `[{ id, b (branch), tier 1-5, max, e, n, d ({x} = per-point value), fx: { key: value } }]`; a new `fx` key needs code that reads it |
| `TIERS` | reputation `[[name, points], ...]` |
| `FACTIONS` | `[{ id, n, e, d, gain: { counter: points }, rewards: [null, {d, fx?, item?, title?} x 4] }]` |
| `RARES` | `[{ kind (monster kind), n }]` named rares (numbers: `D.TUNE.bosses.rare*`) |
| `ACH` | `[{ id, cat, e, n, d, k, c, pts, title? }]` (85). `k` = a counter or a special (level, streets, blocks, missions, worth, biz, turfs, married, kids, friends, sweet, sets, exalted, capstone, rarenames, ...); `c` = how many (the comment at L1296 says `n`, but the field is `c`). |
| `SLOT_NAMES` | slot id -> label (must cover every `D.WEAR_SLOTS` id: content_check) |
| `GEAR` | loot bases per slot: `weapon: [{ id (a weapon item id), n }]`, `head`/`body`: `[{ id, n, e, look }]`, `feet`/`hand`: `[{ id, n, e }]`. Every slot here must be a wardrobe slot. |
| `GEAR_AR`, `GEAR_COLS` | armour per slot; colours per quality |

Example talent and achievement:
```js
{ id: 'hands', b: 'brawl', tier: 1, max: 3, e: '🥊', n: 'Heavy Hands', d: 'Bonks hit {10}% harder', fx: { dmg: 0.1 } },
{ id: 'stunt1', cat: 'Stunts', e: '🏁', n: 'Hold My Juice Box', d: 'Land your first car stunt', k: 'stunts', c: 1, pts: 10 },
```

## The main character update (cft-hero.js)

- `D.HEARTON_RE` (L1403) — `/tim\s*horton/i`: real places matching it are shown as Tom Hearton's (`D.KINDS.hearton`).
- `D.OUTPOSTS` (L1413) — `kind -> { e, n, what ('energy'|'health'), bonus (per liberation), cap, free (text), freeItem (item id), thanks: string[] }`. A `what` other than energy/health needs code in cft-hero. Numbers `bonus`/`cap` are balance paths (`OUTPOSTS.hearton.bonus`).
- `D.OUTPOST_CAPTAIN` (L1419) — `kind -> captain name`.
- `D.WEAR_SLOTS` (L1432) — `[{ id, n, e, side ('L'|'R'), hint }]`: head, face, body, back, feet, weapon, hand, wrist, pocket. Every shop gear `slot` must be one of these, and every slot must have something that fits (content_check).
- `D.HYPE` (L1452) — line lists `compliments flirts hero cheers parry dodge smash mission level welcome gift selfie mainOn mainLines outpost borrow` (string[]; `{name}`, `{NAME}`) and threshold lists `kills combo smashStreak` (`[[n, word], ...]`).

## The chaos update: `D.CHAOS` (L1578)
`RANKS: [[points, letter, name]]` (mayhem meter), `POINTS` / `AURA` (`event -> points`), text lists (`CHATTER`, `KIDS`, `FART`, `FART_WORDS`, `BLIMPS`, `POTTY`), `BRAINROT: [{ id, n, e, rar ('common'|'rare'|'legendary'), line, say[], fly?, night? }]`, `CRITTERS: [{ id, n, e, speed, flee, say[], hop?, sideways?, follow?, dead? }]` (Dex ids unique across both lists; each needs `id n e say`), `TUBE_COLS`, `PINATA_COLS` (hex colours).

## The stunt update: `D.STUNT` (L1666)
`KINDS: { kicker|ramp|mega|alley: { n, e, L, H, w (m), vy (m/s), rings: [share of time to apex], R (ring radius), weight, alley?, gap? } }`, `PTS` (trick -> points), `WIPEOUT`, `AIR` (string[]). Course counts and physics: `D.TUNE.stunt`.

## The campaign update: `D.CAMPAIGN` (L1707)
`INTRO_SECS` (180), `CAP: [1, 3, 5]` (missions on the map after 0 / 1 / 2+ done), `WILD: [{ id, e, n, d }]` (the "crazy list": the n-th finished mission switches on `WILD[n]`; the `id` is what `G.allow(id)` checks in code — a new id needs a check in code), `MEGA: [{ id, kind (monster kind), size, n, e, breath ('honk'|'slime'|'fire'), line }]`, `SECRET_LOOT: [[kind, weight]]`, `NOTES`, `PANIC` (string[]).

## Knobs, weaknesses, weapon numbers, formulas
- `D.TUNE` (L1790-1916) — every balance knob, grouped by module; documented knob by knob in [../balance.md](../balance.md). `D.COMBAT = D.TUNE.combat` (same object).
- `D.DMG_TYPES` (L1923) — `[[type, emoji, label]]`: bonk, shot, water, volt, fire, stomp. The block at L1924-1933 fills `D.MONSTERS[k].weak[type]` for every kind (default 1).
- `D.WEAPON_DEFAULTS` (L1942) — `{ melee, cone, shot, proj }` default numbers written into every weapon at load (L1948-1954). Change a default here only if you mean every weapon without an explicit value.
- `D.calc` (L1957) — `xpAt(L)`, `levelOf(xp)`, `maxHp(L, fit, extra)`, `dmgMul(L)`, `scale(L, lvl, gear, maxHp, armor)` -> `{hp, atk}` multipliers, `xpFor(def, lvl, champ)`, `armorCut(n, armor)`. One copy shared by the game and the wiki; server `Game.level_of` mirrors `levelOf`.
- `D.balancePath`, `D.balanceDefault`, `D.applyBalance`, `D.BAL_DEFAULTS`, `D.BAL_ON` (L1986-2006) — see [../balance.md](../balance.md).

## How to test

```bash
node tools/live/content_check.mjs                     # every reference + reachability: "CONTENT OK (184 missions)"
python -I tools/where.py --toc cft-content.js         # section map after big edits
python tools/assets.py                                # new ?v= hash for cft-content.js (tools/check.py fails if stale)
python tools/check.py                                 # node --check, asset hashes, server tests, doc_check
python -I tools/live/game_test.py                     # full headless game run (gametest.js plays missions, shops, turf...)
python -I tools/live/game_test.py --cine              # every mission line voiced, scenes, cards (after voice changes)
python -I tools/live/game_test.py --balance           # weapon numbers, weaknesses, overrides (after number changes)
python tools/voice_missions.py --list                 # print every speaker/line without rendering
```
Area flags for content in update sections: `--fun` (weapons, monsters, street folk, events), `--combat`, `--hero` (outposts, hype), `--chaos`, `--camp`, `--stunt`, `--rpg`, `--color`.

## Review checklist for AI-made content changes

- [ ] **Schema:** every field used exists in the tables above for that table/step type; no invented keys (e.g. no `req.apt`, `req.own`, `req.turf` — `reqMet` ignores them). Numbers are numbers, ids are strings.
- [ ] **Ids unique and stable:** new mission / item / sticker / street-folk / Dex / achievement ids don't collide; existing ids are never renamed (saves reference them).
- [ ] **References resolve:** `giver`/`who`/`rel`/`partner` -> `D.CAST`; `item`/`items`/`sells`/`freeItem` -> `D.ITEMS`; `what` -> `D.PICKUPS` or `OWN`; `at`/`to`/`of`/`kinds` -> `D.KINDS` or a target; `req.m` -> existing mission earlier in the story; `sticker` -> a sticker id; `friend` -> `D.FRIENDS`; `ch` -> `D.CHAPTERS`; `count.key` -> `COUNTERS` *and* bumped in code.
- [ ] **Placement:** new missions sit in file order where the player meets them (`K.capOpen` order); new shop items appear in a `sells` list; new gear uses a `D.WEAR_SLOTS` slot.
- [ ] **Weapons / monsters / kinds:** mesh in `MESHES` + `W.propMesh`; `proj` in `PROJ`; monster has local names in every city and speed < `D.WALK.run`; kind has `D.SIGN_COLS`.
- [ ] **Text:** `{tokens}` are from the supported list; other speakers' lines start with `Name: `; tone rules (cartoon, never cruel, street folk never the joke).
- [ ] **Voice lines regenerated** for any added/changed `intro`/`say`/`outro` line (`python tools/voice_missions.py`, R2 upload, `python tools/assets.py`), and new speakers have a voice in `VOICES`.
- [ ] **Rewards and prices** are in line with neighbouring missions / items of the same tier (no 10× outliers); server copies (`BIZ_COST` / `APT_VALUE` in server_code/Game.py) updated if business costs or apartment values change.
- [ ] `node tools/live/content_check.mjs` prints `CONTENT OK`, `python tools/assets.py` was run, `python tools/check.py` passes, and the relevant `game_test.py` flag passes.

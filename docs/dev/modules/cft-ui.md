# cft-ui.js — everything on screen around the 3D city (HUD, dialogue, phone, panels, minigames)

| At a glance | |
|---|---|
| File | `theme/assets/cft-ui.js` (1,371 lines, plain ES2017 IIFE, `'use strict'`) |
| Global exported | `window.CFTUI = { create }` (line 1370) |
| How created | `const U = G.ui = window.CFTUI.create(G, root)` in `cft-game.js` (~line 128), right after the balance values are applied and before the world/modules attach |
| Who calls it | Every engine module through `G.ui` / `U` (cft-game, cft-fun, cft-rpg, cft-hero, cft-chaos, cft-camp, cft-aim, cft-color, cft-stunt, cft-cine, cft-debug). Most used: `U.toast` (~88 call sites), `U.feed` (~78), `U.banner` (~74), `U.confetti`, `U.hud`, `U.choose`, `U.dialog`. The phone (`U.phone`, `U.refreshPhone`) and the wardrobe are only opened from inside cft-ui itself (keys, HUD buttons, phone links) |
| Depends on | `G` (save, helpers), `G.D` (= `window.CFT_DATA`, cft-content.js), `G.W` (the world, cft-world.js), `G.sfx`, optional sub-systems `G.fun`, `G.rpg`, `G.hero`, `G.chaos`, `G.camp`, `G.aim`, `G.color`, `G.stunt`, `window.ArkMusic` |
| Styles | `theme/assets/app.css`, block `/* ===== play.html =====` (line ~528) and the later `.cft-*` blocks (see `docs/dev/styles.md`). The header comment still says "web/pages/play.html": that folder no longer exists; the styles only live in app.css |
| Test flags | `window.CFT_TEST.autoplay` (U.dance and U.quiz play themselves, lines ~405, ~444). No other flag is read in this file; suites set `CFT_TEST.norender/calm` for the game around it |
| Tests | `python -I tools/live/game_test.py` (gametest.js opens every phone app, line ~181; most suites use `U.phone(...)`); `--camp` / `--wild` (HUD, map size, four-corner layout); `--cine` (overlay + `cineMode`); `python -I tools/ui_test.py` (the game page mounts) |

## 1. Responsibilities

Does:
- Builds the whole game DOM once (`root.innerHTML` template, lines 26-98): canvas, HUD (four corners), sight, touch joystick, banners, toast, the overlay layer, loading screen, flash/hurt edges, confetti canvas.
- Owns the **overlay stack** (`overlay()`, `U.isOpen`, `U.closeAll`): every dialog, menu, panel and the phone. `U.isOpen()` is what pauses the game clock (`cft-game.js` ~2206 `const paused = U.isOpen()`) and blocks `G.interact` (~2078).
- Small notices: toast, feed, banners queue, E-prompt, timer, loading, hurt/flash, fade, countdown, progress bar, confetti.
- Dialogue (`U.dialog`), choices (`U.choose`, `U.confirm`), text input (`U.ask`).
- Minigames: dance-off (`U.dance`), quiz (`U.quiz`).
- Start screen (character + home address with OSM geocoding), help/controls card, look editor, wardrobe.
- HUD per-frame update (`U.hud.frame`), minimap data + drawing calls, mission list, map size.
- Keyboard / mouse / touch input routing to game actions (`onKey`, mouse and pointer handlers).
- The phone: home screen + 21 apps (`APPS`, `VIEWS.*`) and its click router `onPhoneClick`.
- Place panels: shop, owned business, home, bank, metro.

Does NOT:
- Run game logic or change balance numbers: it calls `G.*` (e.g. `G.buy`, `G.track`, `G.rpg.equip`, `G.fun.setBlock`). Exceptions where it writes the save directly: bank deposits (`U.bankPanel`), settings checkboxes, follow toggles, rename, look, sticker swap, relax/family time in `U.homePanel`.
- Draw the 3D world or the minimap pixels (`G.W.drawMinimap` / `G.W.drawMap` do; cft-ui only builds the marker list).
- Play cinematic scenes (cft-cine.js uses `U.overlay`, `U.isTop`, `U.cineMode`, and falls back to `U.dialog`).
- Fill some HUD parts: `[data-mcount]`, `[data-ammo]`, `[data-pwn=...]` counts and `[data-boss]` are written by `cft-camp.js` `hud()` (~lines 115-144); `[data-gunicon]` / `[data-pwn="gun"]` / `[data-pwn="web"]` by `cft-aim.js` (~206, ~442); `[data-sight]` by cft-aim (~76); `[data-colour]` chip by `cft-color.js` (~190); the mayhem meter is inserted into `.cft-tc` by cft-chaos (~106); cft-hero adds elements into `.cft-tl` (~65).

## 2. Public API

`U` is a plain object. "Called by" = files under `theme/assets/` (grep `U.<name>` / `G.ui.<name>`).

| Name | Signature | What it does | Called by |
|---|---|---|---|
| `U.canvas`, `U.joy`, `U.knob` | elements | The 3D canvas, touch joystick and knob. `U.canvas.parentElement` is the `.cft` shell other modules use | cft-game, cft-world input, cft-chaos/aim/debug (shell) |
| `U.isOpen()` | `-> bool` | Any overlay open (pauses the game) | cft-game, cft-fun, cft-hero, ... |
| `U.overlay(html, cls, o)` | `-> entry {el, close, onEsc}` | Public alias of the internal `overlay()`; `o.dismiss` (backdrop mousedown closes), `o.onclose` | cft-cine `buildOverlay` |
| `U.isTop(entry)` | `-> bool` | Is this overlay the top of the stack | cft-cine key handler |
| `U.cineMode(on)` | | Sets/removes `data-cine` on `.cft` (CSS fades the HUD out) | cft-cine |
| `U.closeAll()` | | Closes every overlay, top first | tests, `U.destroy` |
| `U.toast(text)` | | One line, 3 s, replaces the previous | everywhere |
| `U.feed(emoji, text)` | | Feed item in the top-right corner, max 5, fades after 2.6 s; both args escaped | everywhere |
| `U.banner(title, sub, kind, color)` | | Queued big banner; `kind` = CSS class (`done`, `fail`, `level`, `loot...`, `ach...` stay 3.6 s); `color` = `{css, ink}` borough colour or a CSS string | everywhere |
| `U.clearBanners()` | | Empties the queue (tests) | tests |
| `U.prompt(text)` | | Shows/hides the E action button `[data-act]` | cft-game |
| `U.timer(label, secs)` | `label == null` hides | Countdown in the bottom-left corner (red at <= 10 s) | cft-game (race ~950, chase ~996), cft-fun (angry owners ~1068) |
| `U.loading(text, error)` | `text == null` hides | Loading screen; hides the HUD while shown; `error` adds a "Try again" reload button; shows a `D.TIPS` tip | cft-game |
| `U.hurt()` / `U.flash()` | | Restart the red edge / white flash CSS animation | cft-fun, cft-camp |
| `U.foe(o)` | `o = {name, lvl, pct, rank}` or `null` | HUD foe bar. Since 2026-11-21 cft-fun hides it once (`F._foeHidden`, cft-fun ~697): enemies show name plates over their heads instead | cft-fun |
| `U.fade(fn, text)` | `async` | Full-screen fade overlay, runs `fn` in the middle (sleep, travel) | cft-game, cft-fun, home panel |
| `U.countdown(cb)` | | 3-2-1-GO, then `cb()` | cft-game races (~937) |
| `U.progress(text, secs)` | `-> Promise` | Overlay with a filling bar | cft-game tagging/scrubbing (~1824, ~1833) |
| `U.confetti()` | | 140 confetti pieces on `[data-confetti]` | many |
| `U.dialog(o)` | `-> Promise<bool>` | Typewriter dialogue box, optional question. See Flow | cft-game (`sayLines`, chat), cft-fun, cft-camp, cft-cine fallback |
| `U.choose(o)` | `o = {who?, title?, text, opts: [{t, v}]}` -> `Promise<v or null>` | Choice card; number keys 1-9; Esc/backdrop = `null` | cft-game `talkTo`, cft-fun menus, cft-rpg, ... |
| `U.confirm(text, ok)` | `-> Promise<bool>` | `U.choose` with "Are you sure?" | phone actions (drop, respec, reset), other modules |
| `U.ask(label, dflt)` | `-> Promise<string or null>` | Text input card (max 32 chars) | phone rename, cft-game (baby name ~334, business name ~1534) |
| `U.dance(n, speed)` | `-> Promise<score 0..1>` | Arrow-timing minigame; `>= 0.7` counts as a win at the callers | cft-game steps (~692), turf (~1852), cft-fun (~1345) |
| `U.quiz(qs, need, who)` | `qs = [[question, [answers], rightIndex]]` -> `Promise<bool>` | Shuffled quiz of `max(need+1, 3)` questions | cft-game steps (~695), turf (~1853) |
| `U.help(first)` | | Controls card (touch or keyboard list); `first` = welcome text | cft-game (~2296), cft-camp (~270), `H` key, phone |
| `U.startScreen(me)` | `-> Promise<{name, look, home}>` | New-game form: name, skin/hair/shirt/style, glasses/beard, address search, "Use where I am", 6 preset neighbourhoods (`PLACES`) | cft-game `U.onReady` (~2301) |
| `U.wardrobe(slot?)` | | Opens the wardrobe (or switches its slot sheet if open) | `I` key, phone (Wardrobe app, Me, Bag, Character) |
| `U.wardrobeOpen()` | `-> bool` | Is the wardrobe open | no caller found outside cft-ui (kept for tests / modules) |
| `U.lookEditor()` | | Live look editor (skin, hair, shirt, style, glasses, beard, backpack) | phone Me / Settings |
| `U.hud.frame(dt)` | | Per-frame HUD update (see Flow) | cft-game main loop (~2210) |
| `U.hud.bump(k)` | `k = 'money'` or anything else (level chip) | Pop animation on the money chip or level star | cft-game, cft-fun, cft-rpg, cft-debug |
| `U.mapSize(sz?)` | `sz = 's'/'m'/'l'` or none (cycle) -> new size | Saves `settings.mapSize`, resizes the minimap | `N` key, `[data-mms]`, Settings |
| `U.phone(app?)` | | Opens the phone (home or `app`), or switches app if open | `P`/`Tab`/`Esc` keys, HUD buttons (quest card, minimap, level star, mission count, colour chip), pointer-lock release, home panel; tests |
| `U.refreshPhone()` | | Re-renders the open app keeping scroll | `onPhoneClick` (inside cft-ui) |
| `U.shopPanel(pl)` / `U.bizPanel(id)` / `U.homePanel()` / `U.bankPanel(pl)` / `U.metroPanel(here)` | | Place panels | cft-game interactions |
| `U.init()` | | Sizes the minimap, then calls `U.onReady` on the next tick | cft-game |
| `U.onReady` | set by caller | Hook assigned in cft-game (~2301): shows the start screen or resumes | cft-game |
| `U.applySettings()` | | Applies `settings.mapSize` at start | cft-game |
| `U.wasLocked` | bool | Pointer-lock memory (unlock while playing opens the phone as a pause menu) | internal |
| `U.destroy()` | | Removes document/window listeners, closes overlays, empties `root` | cft-game teardown |

## 3. Internal structure (in file order)

Use `python -I tools/where.py --toc theme/assets/cft-ui.js` for exact current ranges.

| Lines | Section | Contents |
|---|---|---|
| 6 | `esc` | HTML escaper used for every interpolated string |
| 7-20 | constants | `PLACES` (6 preset neighbourhoods), `SKIN`, `HAIR`, `SHIRT` palettes, `STYLES` (9 hair styles), `hexN`, `toHex` |
| 22-103 | `create` + DOM template | The `.cft` shell: `.cft-hud` with `.cft-tl` (you card `.cft-me`, vitals `[data-meters]`, missions `.cft-missions`), `.cft-tr` (`.cft-tc` clock/borough/street/colour chip, `[data-boss]`, `[data-foe]`, `[data-feed]`), `.cft-bl` (`[data-timer]`, minimap `[data-mmwrap]`), `.cft-br` (`[data-act]`, `.cft-hotbar` slots `[data-bonk]` + `[data-pw=water/volt/foam/web/gun]` + `[data-quaff]`, `.cft-btns` block/ride/phone/jump). Then `[data-sight]`, `.cft-joy`, `[data-banners]`, `[data-toast]`, `[data-layer]`, `[data-loading]`, flash, hurt, confetti. Adds class `touch` on coarse pointers |
| 105-126 | overlays | `stack`, `overlay(html, cls, o)`, `U.isOpen`, `U.closeAll`, `U.overlay`, `U.isTop`, `U.cineMode`. Opening an overlay calls `G.W.unlock()` (releases pointer lock) |
| 128-239 | small notices | `U.toast`, `U.feed`, banner queue (`bannerQ`, `nextBanner`), `U.prompt`, `U.timer`, `U.loading`, `U.hurt`, `U.foe`, `U.flash`, `U.fade`, `U.countdown`, `U.progress`, `U.confetti` + `confStep` |
| 241-355 | dialogue | `speakerOf(line, who)`, `portrait(e)`, `U.dialog`, `U.choose`, `U.confirm`, `U.ask` |
| 357-447 | minigames | `U.dance` (`nextBeat`, `judge`, `loop`, `end`, `key`), `U.quiz` (`show`, `pickAns`, `end`, `key`) |
| 449-516 | help + start screen | `U.help`, `U.startScreen` |
| 517-661 | wardrobe | `FX_LABEL`, `fxChips`, `CHARMS`, `lootOpt`, `charmOpts`, `U.wardrobe`, `U.wardrobeOpen`, `slotBtn`, `wardDraw`, `wardPick`, `spareSheet`, `onWardClick`; `U.lookEditor`; `geocode(q)` (lat,lon text, then Nominatim, then Photon) |
| 663-787 | HUD | `last` cache + `setText`, `sizeMinimap`, `fmtClock`, `fmtDist`, `U.hud` (`bump`, `frame`), `minimapData`, `drawMinimap`, `toggleZoom` (150 -> 380 -> 70 m), `MAP_SIZES`, `U.mapSize`, `missionList` |
| 789-863 | input | `onKey` (keydown), `SLOT_KEYS`, `onKeyUp`, `unblock`, `unaim`, right-mouse aim, left-click fire/attack, block button pointer events, HUD button clicks, hotbar pointerdown, touch jump, `pointerlockchange` |
| 865-1264 | the phone | `APPS`, `U.phone`, `render`, `U.refreshPhone`, `homeScreen`, `bar`, `VIEWS.*`, `itemLine`, `drawBigMap`, `onPhoneClick`, `swapStickers` |
| 1266-1354 | places | `U.shopPanel`, `U.bizPanel`, `U.homePanel`, `U.bankPanel`, `U.metroPanel` |
| 1356-1368 | lifecycle | `U.init`, `U.applySettings`, `U.destroy` |

### Phone apps (`APPS`, line ~866) and their views

Order in `APPS` = order on the home screen. Each view returns an HTML string; clicks are handled in `onPhoneClick` by `data-act` / `data-app` / `data-set` / `data-follow`.

| id | Icon / title | Function (approx. line) | Data source |
|---|---|---|---|
| `quests` | 📜 Quests | `VIEWS.quests` (905) | `G.activeMissions`, `G.openMissions`, `G.jobs`, `G.getM`, `G.curStep`, `G.stepText` |
| `map` | 🗺️ Map | `VIEWS.map` (926) + `drawBigMap` (931) | `minimapData()` + turf rects, `G.W.drawMap`; zoom via `mapScale` (`zin`/`zout`) |
| `me` | 🧑 Me | `VIEWS.me` (942) | `window.CFTGame.summary(s)`, `D.STATS`, `D.WEAR_SLOTS`, `G.wornIn` |
| `wardrobe` | 👕 Wardrobe | no view: `onPhoneClick` closes the phone and calls `U.wardrobe()` | |
| `hero` | 🧙 Character | `VIEWS.hero` (1131) | `G.rpg.view()` (titles, pending rewards, gear, talents) |
| `rep` | 🤝 Reputation | `VIEWS.rep` (1153) | `G.rpg.view().factions` |
| `ach` | 🏆 Achievements | `VIEWS.ach` (1160) | `G.rpg.view().ach` |
| `bag` | 🎒 Bag | `VIEWS.bag` (952) | `s.bag`, `D.ITEMS`, `D.VEHICLES`, `G.owned` |
| `people` | 💞 People | `VIEWS.people` (984) | `s.partner/kids/pets/friends/rel`, `D.CAST`, `D.FRIEND_PERKS` |
| `homes` | 🏠 Homes | `VIEWS.homes` (1002) | `D.APARTMENTS`, `s.apt` |
| `business` | 💼 Business | `VIEWS.business` (1010) | `D.BUSINESSES`, `s.biz`, `G.bizIncome/bizCap/upgradeCost/managerCost` |
| `turf` | 🎨 Turf | `VIEWS.turf` (1025) | `s.turf`, `G.CREW`, `G.turfBounds/turfNeed/turfRing`; locked until mission `c6-luna` |
| `street` | 👑 Street life | `VIEWS.street` (1035) | `G.fun.summary()`, `G.hero.summary()` |
| `chaos` | 🤪 Chaos | `VIEWS.chaos` (1070) | `G.chaos.summary()` |
| `stunt` | 🏁 Stunts | `VIEWS.stunt` (1101) | `G.stunt.summary()` |
| `dex` | 📸 Dex | `VIEWS.dex` (1059) | `G.chaos.summary()`, `G.chaos.dexPics()` |
| `colour` | 🎨 Colour | `VIEWS.colour` (1084) | `G.color.summary()` |
| `camp` | 🌀 Campaign | `VIEWS.camp` (1111) | `G.camp.summary()` |
| `album` | 🎴 Album | `VIEWS.album` (1167) | `s.stickers`, `G.STICKERS`, `D.STICKER_SETS`, `G.setDone` |
| `diary` | 📔 Diary | `VIEWS.diary` (1175) | `s.log` |
| `settings` | ⚙️ Settings | `VIEWS.settings` (1179) | `s.settings`: `sound`, `music`, `voice`, `cine`, `reach`, `colour` (checkboxes `data-set`), `hype`, `quality`, `mapSize` (chips), rename, look, pref, reset |

Views for optional sub-systems (`street`, `dex`, `chaos`, `colour`, `stunt`, `camp`, `hero`) return a "still loading" `.cft-empty` card when their `G.*` module is missing.

Home screen badges (`homeScreen`, ~894): quests (active + open), people (friends), business (unmanaged tills > $5), street (crushes), hero (`G.rpg.badge()`).

`onPhoneClick` actions (`data-act`, ~1213): `track`, `mapsize`, `abandon`, `goto`, `job`, `zin`, `zout`, `eat`, `ride`, `wardrobe`, `gift`, `hang`, `move`, `buybiz`, `upgrade`, `mgr`, `findbiz`, `findcrush`, `talent`, `respec`, `equipc`, `unequipc`, `sellc`, `selljunk`, `title`, `claim`, `weapon`, `swap`, `rename`, `look`, `pref`, `quality`, `hype`, `reset`, `help`, `exit`. Settings checkboxes (`data-set`) write `save().settings[key]`; `music` also calls `ArkMusic.enabled`, `colour` calls `G.color.apply('snap')`.

### Overlays / panels (CSS class of the overlay root)

| Function | Overlay class | Inner class |
|---|---|---|
| `U.dialog` | `cft-dlg-wrap` | `.cft-dlg` |
| `U.choose`, `U.confirm` | `cft-center` | `.cft-card.cft-choose` |
| `U.ask` | `cft-center` | `form.cft-card.cft-askf` |
| `U.dance` / `U.quiz` | `cft-center` | `.cft-dance` / `.cft-quiz` |
| `U.help` | `cft-center` | `.cft-help` |
| `U.startScreen` | `cft-start-wrap` | `.cft-start` |
| `U.wardrobe` | `cft-wardwrap` | `.cft-ward` (`role="dialog"`) |
| `U.lookEditor` | `cft-lookwrap` | `.cft-look` |
| `U.phone` | `cft-phone-wrap` | `.cft-phone` |
| shop / biz / home / bank / metro | `cft-center` | `.cft-card.cft-shop` |
| `U.fade` | `cft-fade` | `.cft-fadetext` |
| `U.progress` | `cft-mini` | `.cft-prog` |
| cft-cine scene | `cft-cine-wrap` | `.cft-cine` |

## 4. Key state (closure variables inside `create`)

| Variable | Meaning |
|---|---|
| `stack` | Overlay entries, top = last. Drives `U.isOpen`, key routing, `U.isTop` |
| `bannerQ`, `bannerBusy` | Banner queue; a queue longer than 2 moves faster (1.7 s each) |
| `toastT` | Toast hide timer |
| `conf` | Confetti particles |
| `last` | `setText` cache (key -> last text) so the HUD only touches the DOM on change |
| `mmRadius`, `hudT`, `mmT` | Minimap radius (150/380/70 m), slow-HUD timer (0.3 s), minimap redraw timer (0.04 s desktop, 0.1 s touch) |
| `phoneOv`, `phoneApp`, `mapScale` | Open phone overlay, current app, big map zoom |
| `wardOv`, `wardSlot` | Open wardrobe overlay, selected slot (`null`, a `D.WEAR_SLOTS` id, `c1`-`c3`, or `spare`) |
| `U.wasLocked` | Pointer-lock state from the last `pointerlockchange` |

Save fields the UI reads/writes: `s.settings.*` (above), `s.settings.follow.*`, `s.look`, `s.name`, `s.pref`, `s.money`/`s.savings` (bank), `s.track`, `s.stickers`, `s.rpg.loot[].fresh` (cleared when the Character app or spare-loot sheet is drawn).

## 5. Flows

### Overlay + keyboard routing
1. `overlay(html, cls, o)` appends a `.cft-ov` div to `[data-layer]`, pushes an entry and releases pointer lock (`G.W.unlock()`).
2. Each modal adds its own `keydown` listener on `document` in **capture** phase and returns early unless `stack[stack.length-1]` is its own entry, so only the top overlay reacts.
3. The global `onKey` (bubble phase, ~790) ignores keys while the game state is not `'play'` or focus is in an input. With an overlay open it only handles `Escape` (closes the top overlay), `P`/`Tab` (closes the phone) and `I` (closes the wardrobe); it never closes `cft-dlg-wrap`, `cft-fade` or `cft-cine-wrap` (those handle their own keys). With no overlay: `E`/`Enter` interact, `P`/`Tab`/`Esc` phone, `V` ride, `F` attack, `G` block (keyup releases), `Q` quaff, `M` minimap zoom, `N` map size, `1`-`5` slot select (`G.aim.select`, or `G.camp.power` without cft-aim), `H` help, `I` wardrobe, `B` toot (`G.chaos.fart`).
4. Mouse: right button down on the canvas = `G.aim.setAim(true)`; left button = `G.aim.fire(true)` while the sight is up, else `G.attack()` when the pointer is locked. Releasing pointer lock while playing with no overlay opens the phone (pause menu).

### `U.dialog(o)` end to end
`o = {who, lines: [string], ask?: {q, opts: [{t, need?: {stat: n}, reply, good}]}, name?, e?, onLine?(i), onClose?()}`.
1. Builds the `.cft-dlg` overlay; each line goes through `speakerOf(line, o.who)`: a `"Name: text"` prefix that matches a `D.CAST` name (full, first or last name, or id) sets the portrait emoji and name; `Everyone` and the first kid's name are recognised; otherwise the speaker is `o.who`.
2. `show()` runs the text through `G.text()` (token replacement) and types it at 2 chars / 16 ms.
3. Click / Space / Enter / E: first finishes the typing, then `next()`. `onLine(i)` is called as each line starts (cft-cine uses it to play the voice clip when scenes are off).
4. After the last line, with `o.ask`: shows options (`ask()`); options whose `need` stats are not met get class `lock` and, if chosen, show an "(Needs X n, you have m)" line and re-ask (`o.askAgain`). A good choice sets `o.result = !!a.good` and shows `a.reply`.
5. `finish()` removes the key listener, calls `o.onClose`, closes the overlay and resolves `o.result` (when a question was answered) else `true`. `Escape` finishes early only when there is no pending question.

### `U.choose(o)`
Builds a card (with a cast portrait when `o.who` is a `D.CAST` id, else `o.title`), one `.cft-opt` button per option with a `<kbd>` number. Click or keys 1-9 resolve `opts[k].v`; Escape, a backdrop mousedown (`dismiss: true`) or any close resolves `null`. `o.text` is escaped, then `\n` becomes `<br>`.

### HUD frame (`U.hud.frame(dt)`, called every frame by cft-game)
- Every frame: money, name, level, XP bar, HP bar + text + low-health edge, rested-XP bar, energy, happiness bar + face emoji, clock (sky emoji + day + time), the quest arrow rotation towards `G.rt.goal` relative to the camera yaw.
- Every 0.3 s: street + turf name, borough chip (`W.districtAt`, sets `--boro` / `--boro-ink`, replays `cft-boro-new`), quest card (tracked mission > `G.rt.goal` > "Free roam"), distance, ride icon, talent badge, bonk icon (loot weapon > shop weapon > 🖐️), `missionList()` (up to 4 rows; rebuilt only when its key changes).
- Every 0.04 s (0.1 s on touch): `drawMinimap()` -> `minimapData()` collects markers from pickups, shops/metro/bank (only with phone2/phone3 radar), businesses, mission givers (`G.rt.spots`, letters from `G.hero.letterOf`), turf rects + poster spots, race checkpoints, home, the goal, and each module's `markers(list)` hook (`G.hero`, `G.fun`, `G.chaos`, `G.camp`, `G.wild`, `G.stunt`, `G.aim`), then `G.W.drawMinimap(mm, {radius, markers, rects})`.

Marker object shape: `{x, z, color, r, ring?, emoji?, letter?, edge?}` (`edge: true` = sticks to the minimap rim with an arrow).

### Wardrobe
`U.wardrobe(slot)` opens `.cft-ward`, sets `W.showOff = true` (the world shows your character), draws the slot buttons in two columns from `D.WEAR_SLOTS` (`side: 'L'|'R'`) and three charm slots. `wardPick(slot)` fills the sheet with options from `G.slotOptions(slot)` (shop items + loot) or `charmOpts(c)`; `fxChips` shows stat deltas against what is worn (`G.wearFx`). `onWardClick` routes `data-wact`: `shop` -> `G.wearShop`, `loot` -> `G.rpg.equip`, `off` -> `G.takeOff` / `G.rpg.unequip`, `sell`, `junk`. Closing resets `W.showOff` and calls `G.dirty()`.

### Start screen
`U.startScreen(me)` resolves `{name, look: {skin, hair, shirt, style, glasses, beard, long}, home: {lat, lon, label, short, check}}`. Address submit -> `addrLookup(q)` = `CFTAddr.lookup` (see [cft-addr](cft-addr.md)) with `addrOpts` (`fetchJson` with a 9 s time-out, `streetTile` = the OpenFreeMap zoom-14 tiles, `navigator.language`). "lat, lon" text moves in straight away; anything else opens the "Is this your place?" card in `[data-addr]` (`confirmAddress`, since 2026-11-27): a badge from `ADDR_BADGE` (exact / guess / street / place / gps / pinned), the address, a small `tile.openstreetmap.org` map with the pin (tap = move the pin, then `CFTAddr.reverse` names it after 700 ms; + / - zoom 12-19), other answers as chips, "Yes, move in here" (`done` with `check` = the status) and "Search again". "Use where I am" (`navigator.geolocation`) opens the same card with status `gps`. The game tests click `.cft-place[data-p="0"]` (Plateau Mont-Royal) or type `CFT_START` coordinates; `game_test.py --addr` drives the card. CSS: the "address check" block after `.cft-place` in app.css.

## 6. Tunables / data read from CFT_DATA

cft-ui reads no `D.TUNE` numbers. It reads content tables: `D.CAST` (names, emoji, roles, `animal`), `D.STATS`, `D.ITEMS` (+ `type`, `weapon`, `energy`, `happy`, `rel`, `stats`, `speed`, `radar`, `maxEnergy`, `apt`...), `D.KINDS` (`sells`, `e`, `n`), `D.WEAR_SLOTS` (`id`, `n`, `e`, `side`, `hint`), `D.APARTMENTS`, `D.BUSINESSES` (`up`, `cost`, `income`), `D.VEHICLES` (`run`), `D.PICKUPS` (`bg`), `D.FRIEND_PERKS`, `D.STICKER_SETS`, `D.RPG.QUALITY`, `D.MISSIONS` (count), `D.TIPS`. Hard-coded in the file: `PLACES`, palettes, `STYLES`, `FX_LABEL`, minimap radii (150/380/70), HUD timers (0.3 s, 0.04/0.1 s), toast 3 s, feed 5 items / 2.6 s, banner 3/3.6/1.7 s, dance window `1.25 / speed` s, quiz size.

## 7. How to test

- Whole game: `python -I tools/live/game_test.py [OUTDIR]` (3-5 min, needs internet; gametest.js opens 11 phone apps; other suites open the rest).
- HUD layout: `--camp` (HUD + map size), `--wild` (four-corner check: every HUD element measured against the middle 40-60% column/row), `--campshots DIR` / `--heroshots DIR` for pictures, `--boro` (borough chip).
- Dialogue under scenes-off: `--cine` (cinetest checks the old dialogue box without `CFT_TEST.cine`).
- Your own probe: `python -I tools/live/game_test.py --eval my.js OUTDIR` where `my.js` runs in the page (`window.__cft` = G, `G.ui` = U). Never `await` a call that opens a dialog in a test: start it, then click through (`drain()` pattern in cinetest.js/funtest.js). <!-- doc-check: skip -->
- Manual: `python -I tools/live/harness.py` -> http://localhost:8772/ ; add `?debug=1` for the play-test panel (see cft-debug.md). Phone width: resize to 390 px, or `WINDOW=390,844` for the screenshot runs.
- Pages + a11y: `python -I tools/ui_test.py`, `--only a11y.js`, `--only design.js`.
- Before pushing: `python tools/assets.py` (new `?v=` hashes), `python tools/check.py` (JS syntax, hashes, design check).

## 8. How to modify safely (recipes)

**Add a phone app**
1. Add `['myapp', '🧩', 'My app']` to `APPS` (~866). `render()` looks the title up in `APPS`: a view id missing from `APPS` throws.
2. Add `VIEWS.myapp = function () { ... return html; }` near the related views. Return a `.cft-empty` card if your `G.<module>` may be missing. Escape every player/content string with `esc()`.
3. Buttons: `data-act="myaction" data-id="..."` and a `case 'myaction':` in `onPhoneClick` (~1213); call `U.refreshPhone()` after changing state, `G.dirty()` after writing the save.
4. Optional badge: add to the `badge` object in `homeScreen`.
5. Add the id to a test (gametest.js line ~181 list or your feature's suite) and check the phone at 390 px.

**Add a HUD counter**
1. Add markup inside the right corner in the template (lines 26-98), with a `data-*` hook and a `title`/`aria-label`. Keep it in a corner: the four-corner rule (nothing in the middle 40-60% column or row) is enforced by `--wild`.
2. Update it in `U.hud.frame` with `setText(key, selector, value)` (cached) in the 0.3 s block unless it must move every frame. If a module owns the value, write it from that module's HUD tick instead (pattern: cft-camp `hud()` with its own `setT`).
3. Style it in the "HUD redesign" / "four corners" blocks of app.css; check the phone portrait (<= 720 px) and landscape (height <= 500) rules there.

**Add a dialogue choice / question**
Use `U.dialog({who, lines, ask: {q, opts: [{t, reply, good, need: {charm: 3}}]}})` and branch on the resolved boolean, or `U.choose({who, text, opts: [{t, v}]})` and branch on `v` (handle `null` = dismissed). Mission dialogue lines live in `cft-content.js` (`M(...)` intro/steps/outro); changing their text also requires re-voicing (see cft-cine.md).

**Add a place panel**
Copy `U.bankPanel`: an `overlay(..., 'cft-center', {dismiss: true})`, a `draw(ov)` that rebuilds `[data-body]`, one delegated click listener on `ov.el`, a `[data-x]` close button. Call it from the interaction in cft-game.

**Add a key binding**
Add a branch in `onKey` (no-overlay part) and, if held, a release in `onKeyUp` and on `window` `blur`. Add the key to both lists in `U.help` (keyboard and touch), and a touch button if it matters on phones. Remove any new document/window listener in `U.destroy`.

Pitfalls:
- **Escaping:** every interpolated string must go through `esc()` (names, content text, place names from OSM). Numbers from `G.fmt$` are safe. `U.feed` and `U.banner` escape for you; `innerHTML` you build does not.
- **Never use `data-go`** on a game button: the app shell treats it as page navigation (see the comment in `U.help`).
- **`data-act` is reused**: the HUD action button is `[data-act]` (attribute without value) while phone buttons use `data-act="..."`; phone clicks are scoped to `phoneOv.el`, so do not move phone markup outside it.
- **Inputs:** stop `keydown` propagation in text inputs (`U.ask`, start screen, phone) or game keys fire while typing.
- **Pause semantics:** any overlay pauses the game. A non-blocking notice must not use `overlay()`; use toast/feed/banner.
- **Touch:** coarse pointers get `.cft.touch`; buttons need `pointerdown` + `preventDefault` for instant response and release handlers on `pointerup`, `pointerleave`, `pointercancel` (see block and hotbar). `.cft-touch` elements only show on touch.
- **Z-index:** overlays live in `.cft-layer` (z 10); toast 6, banners 5, loading 20, confetti 25, flash 30, debug panel 30. A new layer must fit this ladder (styles.md).
- **Accessibility:** icon-only buttons need `aria-label`; overlays that act as dialogs should carry `role="dialog"` + `aria-label` (only the wardrobe does today); live regions use `aria-live="polite"`; keep `<kbd>` hints on options; respect `prefers-reduced-motion` in new CSS animations.
- **Listeners:** anything added to `document`/`window` must be removed in `U.destroy` (otherwise a second game mount doubles input).
- **Escape inside scenes:** keep the `cft-cine-wrap` exclusion in `onKey`, or Esc closes the scene overlay without cleaning up the camera.

## 9. Review checklist for AI-made diffs

- [ ] Every new `innerHTML` interpolation uses `esc()` (or is a number / trusted constant).
- [ ] New phone app: in `APPS` and `VIEWS`, handles a missing `G.<module>`, actions in `onPhoneClick`, `U.refreshPhone()` / `G.dirty()` after changes.
- [ ] New modal uses `overlay()`, a capture-phase key listener guarded by the top-of-stack check, removes the listener on finish, and resolves its promise exactly once on every path (button, Esc, backdrop).
- [ ] No HUD element in the middle column/row; phone layouts checked (`--wild`, screenshots at 390 px).
- [ ] `U.hud.frame` work is in the right cadence block and uses `setText` (no unconditional DOM writes per frame).
- [ ] Touch equivalents exist for new keyboard controls; `U.help` updated.
- [ ] New listeners are removed in `U.destroy`.
- [ ] No `data-go`; buttons have `type="button"`; icon buttons have `aria-label`.
- [ ] Names cited exist (`D.*` tables, `G.*` functions); no balance numbers hard-coded here (they belong in `D.TUNE`).
- [ ] `python tools/assets.py` run (hash change in anvil.yaml), `python tools/check.py` passes, the relevant `game_test.py` suite passes.

## 2026-11-27: banners in the fever dream
`U.banner` drops `DREAM_QUIET` kinds (ach, level, boro, done) and "Discovered" banners while `G.dreaming()`.

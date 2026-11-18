# City Fun Time

A life-simulation game on your real streets. Type your address and the neighbourhood around it is rebuilt in 3D from
OpenStreetMap, on its real hills: buildings, streets, parks, house numbers and shop names, filled with people walking dogs, traffic
(that stops at red lights), pigeons and, after dark, cartoon monsters you bonk with a baguette. You arrive with $20 and a backpack, crash on Cousin Max's couch, and work your way up: errands for Nonna Rosa,
odd jobs, a lemonade stand, a skateboard, friends, love, a wedding, kids, fifteen businesses, a penthouse, and every block
won back from the crews. 173 missions, played at real places near you. Built on [Anvil](https://anvil.works); grown out of
City Coin Run (`Documents/CLAUDE/citycoinrun`).

- **App repo:** github.com/arkulinskis/cityfuntime (branch `master`). Anvil pulls `master`.
- **Live:** https://city-fun-time.anvil.app

## What it does

**For everyone (no account needed):**
- **Landing page** (`#landing`): the promise, how it works, everything in the game, the cast, FAQ.
- **The game** (`#play`, full screen): a move-in screen (name, skin/hair/shirt, then an address search, "use where I am", or six
  featured neighbourhoods in Montréal and New York), then the 3D city. Guests save in the browser.
- **Quests** (`#quests`): all 178 missions by chapter with status, story, steps and rewards. **Album** (`#album`): 84 stickers in 14
  sets plus the photos from photo missions. **Leaderboard** (`#ranks`): net worth, level, blocks, missions.

**In the game:**
- **Missions:** 85 story missions in 9 chapters (New in Town, The Hustle, Wheels, The Crew, Love, Turf, Boss Mode, Family, The Big Leagues)
  + 80 side stories. People with a yellow **!** stand at real places (cafés, bakeries, banks, libraries, parks...). Step types: go,
  talk (with charm-checked choices), collect, deliver (to real house numbers, some timed), buy, have money, reach a stat or level,
  own (home, business, blocks, friends...), pay, escort (slow grandpas, dogs, your partner), chase, race (checkpoints), photo (some
  only at golden hour or night), visit several places, dance-off, quiz, sleep, walk a distance, chat with strangers, tag, defend, count (bonk monsters, help street folk, charm
  strangers, outrun shopkeepers, slide on banana peels...).
- **Repeatables:** 3 odd jobs a day (phone; one of them can be an uphill run), a rush hour per business per day (deliveries for tips), rival tags to clean.
- **Stats:** Fitness (speed, energy), Charm (dialogue choices, relationships), Smarts (business income, XP), Style (shop discounts),
  Street cred (crew bosses, turf income). Plus energy (sprinting drains it; food and sleep refill it), happiness (follows your
  home, furniture, family, friends and pets; multiplies income) and XP levels.
- **Pickups** on the streets: coins, cash, coffee, books, roses, dumbbells, shades, spray cans, stars, sticker packs, rare gems.
- **Shops** at real places (38 kinds, two of them only as made-up shops: joke shop, fortune teller): food, gifts, clothes and shoes (speed), phones (minimap radar), furniture, pets, classes, licences, vehicles.
- **Rides:** skateboard, kick scooter, bicycle, Vespa-style scooter, compact car, family SUV, sports car (V to hop on/off; cars steer with A/D).
- **Homes:** couch → basement studio → one-bedroom → two-bedroom → loft → townhouse → penthouse (the tallest real building nearby). Rent at midnight.
- **People:** 14 possible friends with perks, a partner (girlfriend or boyfriend, the player chooses), engagement, wedding, up to 3 kids,
  dogs and cats; partner, kids, pets and one friend can walk behind you.
- **Businesses:** 15, from lemonade stand to boutique hotel, opened in a free storefront near you with a sign on the wall. Till,
  upgrades, managers (offline earnings), rush hours.
- **Turf:** 300 m blocks around home, each run by one of 12 crews. Tag its 4 posters (spray cans), beat the boss (race, dance-off,
  quiz, chase or cred check). Owned blocks pay hourly; rivals sometimes tag them back.
- **Hills:** real elevation from Mapterhorn, drawn 1.5x taller. Streets, parks, buildings, people and cars follow the slope;
  bridges keep a level deck. Boards, scooters and bikes are much slower uphill and faster downhill (cars and walking a little).
  Side missions "Top of the Hill" (Noor: climb to the highest street within 900 m of home and photograph the view) and
  "King of the Hill" (Kai: uphill race on wheels); a 13th sticker set, **High Points**.
- **World:** day and night (24 minutes a day) under a gradient sky with sun, moon, stars and drifting clouds; lit windows; street
  lamps with pools of light; benches, hydrants, bins, mailboxes; parked cars (solid: walk around them, or land on the roof and
  bounce); **traffic lights** with zebra crossings at the bigger corners (cars stop on red); pavements full of strollers,
  joggers, kids, elders, skaters and cyclists; cars, taxis, vans, buses, police cars and an ice cream truck that stop and honk;
  pigeons; metro entrances as fast travel; a phone (P) with Quests, Map, Me, Wardrobe, Bag, People, Homes, Business, Turf, Street life,
  Album, Diary, Settings.
- **People:** you, the story's cast and everyone on the pavement are rounded cartoon figures with a face (eyes, brows, nose,
  mouth, ears), nine hair styles, caps, beanies, glasses, beards, headphones, backpacks, dresses, shorts, striped and logo
  shirts, and knees and elbows that bend when they walk, run, sit, pedal, wave and dance. Your character starts in a tee and
  jeans with the backpack you arrived with; outfits, shoes, headphones and the helmet from the shops show on you. Change skin,
  hair colour, hair style, glasses, beard and backpack any time: phone → Settings (or Me) → **Change your look**, with your
  character turning to face you.
- **Combat, Diablo-style** (2026-11-11): you're an ordinary person whose mind sometimes turns the city's noise into **figments**
  only you can see ("the Static"); you face them. **15 monster types** (slime, cone gremlin, trash goblin, lost-sock ghost,
  pigeonzilla, King Blob, goose, rat, raccoon, static wisp, cart golem, cable spider, subway worm, rooftop gargoyle, brick brute),
  each named for your city (Montréal's "Ruelle Rat" is Tokyo's "Alley Rat"; hand-written for Montréal, New York, Paris,
  London, Riga and Tokyo, picked from local variants elsewhere). More at night, a couple by day (never near home), fewer
  when you're happy. Monster **levels** rise with yours and with distance from home; **champion packs** (blue tags, 2.5x
  health); a **foe bar** with name and level; damage numbers. A red **health bar**, armour from loot, regeneration out of a
  fight, food and calm tea 🍵 heal (Q or the 🍵 button). At zero you **black out** and come to at the nearest metro station
  you've freed, or home; 10% of your pocket money stays in your dropped wallet 👛 where you fell, for you to pick up.
  **Every metro station has a guardian** (Turnstile Titan, Tunnel Wyrm, Platform Gargoyle, Rush-Hour Juggernaut, Escalator
  Weaver): big, levelled, it stays by its stairs. Beat it and the station joins your metro network (fast travel, a place to
  come to). Max's side story "The Static" (face three figments, a check-up, a night's sleep).
- **Gear you can see:** loot hats (cap, beanie, helmet, bucket hat, hard hat), jackets (hoodie, denim, leather, puffer, trench,
  track), shoes and weapons (loot versions of the shop weapons) in rarity colours, with armour, health, speed or damage and
  Diablo-style affixes ("Sturdy Puffer Coat of the Sprinter"). They show on your character, and shop clothes and loot share the wardrobe (below).
- **The long game** (after what kept people in World of Warcraft; the phone's Character, Reputation and Achievements apps):
  - **Loot in rarity colours:** charms in Junk grey, Common, Uncommon green, Rare blue, Epic purple and Legendary orange, with
    random stats (and a perk on Epic and Legendary), from monsters (about one in five), treasure chests, mystery crates and
    missions. Three charm slots, a 30-slot bag, "Sell junk", a green ▲ on anything better than what you wear, and a pity timer
    (a Rare at least every 25 drops). Rare+ drops get a coloured banner; Epic and Legendary a beam of light.
  - **Talents:** a point every level (tap the ⭐ level chip), three branches of eight (Hustler, Charmer, Brawler), tiers that
    open after three points, a big fifth-tier talent each; reset free once, then $10 × level.
  - **Reputation** with five neighbourhood factions (Shopkeepers' Guild, Night Watch, Street Folk, Hearts Club, Street Crews),
    earned from what you already do; Neutral → Friendly → Honored → Revered → Exalted, a reward at each tier, a title and a
    Legendary charm at Exalted. Pranks cost standing with the shopkeepers.
  - **50 achievements** with points, a golden banner, and **titles** to wear ("Robin, the Monster Hunter").
  - **Rested XP:** time away (4% of a level per hour, up to 1.5 levels) and sleeping at home double the XP from monsters,
    pickups and jobs (not missions); the blue part ahead of the XP bar.
  - **Discovery:** XP for every new street and block; each new block hides a treasure chest 🧰.
  - **Rare monsters:** eight named ones with silver name tags (Gutterbeard the Bin King, Countess Slimeula...), four times the
    hit points, guaranteed Rare loot. **Mission rewards:** chapter 2 onwards, choose one of three charms (✨ by your level).
    A golden beam and the list of what opened when you level up.
- **Made-up shops and signs:** besides the real places from the map, about one building in four along the streets holds a
  made-up shop (26 kinds, generated names, always the same shop in the same building). Every place, real or made-up, has a
  sign on its wall in its kind's colour, a striped awning and a round blade sign.
- **Boroughs look different** (2026-11-17): every borough (Montréal's boroughs, New York's five, Paris's arrondissements,
  any town) gets its own colours: tinted walls and roofs, pavements, painted kerb stripes, its own centre-line colour and
  pattern (dashes, long dashes, dots or double lines), tree colours (autumn orange, cherry blossom, golden...) and banners on
  every lamp post. The HUD shows the borough's name in its colour under the clock; walking into a new one shows a welcome
  banner and pays discovery XP (achievements for 3 and 8 boroughs); the minimap and map colour buildings by borough and
  the map names them. Names come from the same OpenStreetMap tiles (no new service).
- **Faster:** walking 8.4 m/s, sprinting 15.5 m/s (since 2026-11-17; was 6.2 / 12.5), every ride about 12% quicker, a double
  jump (Space twice), the view widens with speed.
- **Monsters and silly weapons:** after 21:30 sidewalk slimes, cone gremlins, trash goblins and lost-sock ghosts come out,
  chase you and grab a few coins; bonk them (F, the hand button, or a click) and they pop into coins and give yours back.
  Pigeonzilla and King Blob (a boss with his own mission) show up now and then. Nine weapons from the shops: stale baguette,
  rubber chicken, feather pillow, pool noodle, frozen fish, plunger of destiny, leaf blower (a blast), smashing guitar, bubble
  blaster (shoots). Bare hands slap.
- **Strangers:** E on a passer-by: say hi, tell a joke, or flirt. A pick-up line that lands makes them a **sweetheart** who
  waits on their street: sweet talk once a day, gifts, walks that end as dates at cafés, parks and cinemas. Up to 12; love
  fades if you stay away; two sweethearts in one place while you're on a date means drama (they chase you).
- **Street folk:** ten named neighbours without a roof (Marcel, Dolores and Chairman Meow, Captain Ray...) sit on corners. Some
  walk over to ask; walk away and they shrug. A coin, food from your bag or listening to their story earns **street hearts**;
  at 40 they crown you King, Queen or Monarch of the Streets: a cardboard crown, a daily tribute, gems on the map and a royal
  guard that trips up shopkeepers who chase you.
- **Pranks and angry shops:** any made-up shop can be pranked from its shop window (never the real places from the map). The
  owner bursts out and chases you, always a bit slower than your walking pace; get away and you're banned for two days (say
  sorry with a gift, or prank again). Once you own a business, made-up shops of the same trade chase you on sight.
- **Street events** every minute or so: a money truck spills coins, a flash mob you can join, a UFO whose beam leaves a gem, a
  furious goose, a slime alert, a parachuting mystery crate, a pack of friendly dogs, Pigeonzilla. Banana peels are speed
  boosts; trampolines throw you at coins in the air. A 14th sticker set, **Shenanigans**, is earned by feats only.

**The realism pass** (2026-11-17): realistic people (six and a half heads tall, shaped bodies, faces with irises, lids and lips,
proper hands and shoes), four kinds of tree (broadleaf, linden, spruce, birch, the odd red maple), bushes and a topiary duck,
real car shapes (hatchbacks, saloons, SUVs, vans, sports cars, buses, the ice cream van) and rounder dogs, cats, pigeons and
ducks. Still silly: about one passer-by in eleven wears a propeller beanie, a traffic cone, antlers, a rubber-duck ring or
carries a balloon or a baguette, and about one car in twelve has a giant rubber duck, a sofa or a canoe on its roof. Full
detail near you, lighter stand-ins further away.

**The main character update** (2026-11-17; for people unwinding after a tough day: everyone adores you):
- **Blocks and parries:** every figment winds up before it strikes (a red ❗ and a ring on the ground that shrinks to its
  reach and turns gold at the last moment). Hold **G**, the **right mouse button** or **🛡️** to block most of the damage
  (heavy hitters can still break through); block in that last moment for a **PERFECT PARRY**: no damage, the figment reels,
  your next hit is a **COUNTER** (×2.5). Step out of reach to dodge; hits while it recovers are **OPENINGS**; quick hits build
  combos; a little aim assist and lunge. Luck plays a part too (lucky dodges, guard breaks, crits). A bit more Diablo:
  more figments by day and night.
- **Everyone loves you:** passers-by compliment you and flirt (PG) out loud, by name; their lines also slide across the
  screen. Big hype words for streaks (DOUBLE BONK! → GODLIKE!), combos, parries, smashes, missions and level-ups; people
  cheer after fights; fans run over for selfies; admirers bring gifts (gear). Settings → Compliments and hype: Max / Some / Off.
- **✨ Swagger:** a meter that fills from all of that. Full = **MAIN CHARACTER MODE** for 25 s: faster, stronger, a golden
  glow, the whole street stares and cheers.
- **Tom Hearton's and groceries (Far Cry outposts):** every Tim Hortons on the map is shown as **Tom Hearton's** (and made-up
  ones open in real buildings, so every city has some); every grocery store too. Figments hold them (a pack with a captain;
  the sign shows 😈). Clear them out: Tom Hearton's gives **+5 max energy** for good and a free double-double every day; a
  grocery gives **+5 max health** for good and a free snack bag every day (in all up to +100 energy and +150 health; at most
  two outpost fights at a time). Plus gear and a party.
- **Smash things:** bonk or drive into lamps, benches, bins, hydrants (a fountain), mailboxes, trees and parked cars (they
  burn out into wrecks). Coins fall out. Smashed things stay smashed for the rest of the visit and are back next time.
- **Borrow any parked car:** E next to it ("keys are in it, superstar!"); V parks it at the kerb again. Drive into things to
  smash them, or into figments to knock them flat.
- **GTA mission letters:** everyone with a mission has a light pillar and a big letter (M for Max, B for Bouchard...) over
  them, on the minimap (stuck to the edge with an arrow when far) and as on-screen pointers with the distance. The Quests page
  only names missions that are one step away; the rest are "???" until you get there.
- **Shields:** a new off-hand gear slot (trash-can lid, pizza box, frying pan, umbrella, skateboard deck, cafeteria tray),
  worn on your arm and raised when you block: a stronger block and an easier parry.
- **High-end look:** pavements with kerbs, edge lines on big roads, cornices and shopfront ledges, walls that darken towards
  the street, crisper windows with plants and rails, leafy trees, detailed cars (bumpers, lights, mirrors, hubcaps), lamp
  halos at night, a fill light, sharper shadows, a soft vignette and colour grade (high graphics; low keeps the light version).
- **Seven new missions:** Hold the Line, Morning Rush, Aisle Hero, Wrecking Ball, Keys in the Ignition, Main Character
  Energy, The Liberator.

**The wardrobe (2026-11-17):** phone → 👕 Wardrobe, or I. Your character turns to face you with nine slots around them (head,
face & ears, body, back, feet on the left; main hand, free hand, wrist, pocket on the right) and three charms below. **Every slot
holds one thing**, from a shop or from loot, so you choose: snapback, bike helmet or a loot beanie; a shield (better blocks)
or a camera (smarter, cooler); sneakers for speed or loot boots for armour. Tap a slot to see everything that fits it, with
green/red numbers for what a swap changes; a pink number on a slot means a choice is waiting. Spare loot (wear, sell, sell
junk) is one tap away. New shop pieces: snapback cap and sunglasses (clothes shops), fitness band (tech shops). Old saves move
over by themselves; where a shop piece and a loot piece shared a slot, the loot stays on and the shop piece waits in the wardrobe.

**The chaos update (2026-11-18):** "more unhinged, more colours, creatures, objects everywhere, ranged weapons, ranged enemies,
flying". Built on game-feel research (screenshake + hit-stop "juice", toy-first sandboxes like Goat Simulator and Untitled
Goose Game, combo ranks like Tony Hawk and Devil May Cry):
- **Objects everywhere:** a decor layer on every street and park: flower planters, café tables with striped umbrellas, traffic
  cone piles, garden gnomes (and gnome gangs), pink lawn flamingos, glowing vending machines, balloon bunches, abandoned couches
  ("FREE"), porta-potties, shopping carts, fairy rings of giant googly-eyed mushrooms, giant rubber ducks, a pigeon monument,
  giant donut sculptures, glowing crystals, sunflowers, picnic blankets, chalk drawings (hopscotch, a smiley, "67"), rainbow
  bunting strung across side streets, rubber ducks and pool rings floating on the water. Most of it can be smashed (couches
  and vending machines drop coins, porta-potties... let out what was inside).
- **The sky:** blimps with silly banners ("TOUCH GRASS", "6 7", "THIS BLIMP HAS NO PURPOSE"), hot-air balloons, the odd sky whale.
- **Mayhem meter:** chain chaos (bonks, smashes, stunts, piñatas, launches, photos) without stopping and climb D → C → B → A →
  S (Sigma Mayhem) → SS (Certified Brainrot) → SSS (OHIO FINAL BOSS); stop and it cashes in for coins and XP. **Aura**: a meme
  number that goes up for cool things and down when a seagull gets you.
- **Ranged weapons** with real projectiles: spitball straw, water balloon launcher (splash), confetti cannon (spread), banana
  boomerang (comes back), whoopee grenades (stink cloud), T-shirt cannon (people love free merch), rubber chicken launcher
  (bounces), mustard sniper (pierces), potato cannon, gnome bazooka. Aim helps itself to the figment in front of you.
- **Ranged and flying figments:** the Spitball gremlin, the Tomato tosser (splat on your screen), the Seagull sniper (flies over
  you, drops "presents", swoops for your coins) and the Wi-Fi wraith (night; its lag spike makes you buffer). Their shots show a
  🎯 first; dodge, block, or block right as it lands to send it **back** at them (RETURN TO SENDER).
- **Flying:** the Bean jetpack (hardware stores; hold Space in the air, fart-powered, refills on the ground) or the Glide-brella
  (clothes shops), then golden sky hoops to fly through.
- **Toys:** piñatas (three whacks: candy, coins, sometimes a mimic), giant beach balls to kick and run into, sewer manholes that
  launch you sky-high, whoopee cushions on the pavement, wacky waving inflatable tube men outside the made-up shops.
- **Creatures and the Dex:** animal neighbours wander about (squirrels, frogs, an unbothered capybara with an orange on its
  head, crabs, a duck family that follows you, a cow, a possum that plays dead, and The Snail, who is always slowly coming for
  you), plus 12 rare "street brainrot" creatures: Sharkini Sneakerini, Bananito Copterino, Frigorifero Camelo, Toastito
  Flamingo, Croccodilo Croissanto, Gnomo Rocketto, Polpo Cappuccino, Toiletto Turbino, Pizzaro Pigeonelli, Lampo Mothini
  (night), Sushino Samurino and the legendary golden Capybara Supremo. Snap them with E (❓ on the minimap) to fill the Dex.
- **12-year-old humour:** B toots (people react, figments get stunned, 67 toots = SIX SEVEN), hide in a porta-potty (figments
  lose you; you come out with a STINK BOMB), passers-by drop meme lines ("No cap, this street is bussin", "It's giving main
  character"), kids yell SIX SEVEN.
- **Six new street events:** Only in Ohio (low gravity), the simulation lags (everyone T-poses), it rains cats and dogs, a
  cheese meteor shower, the SIX SEVEN crew (E to join), a balloon truck tips over.
- **Phone → 🤪 Chaos:** aura, best mayhem, the Dex, ranged weapons, flying. Five new missions (Pew Pew Diplomacy, Brainrot
  Researcher, The Brainrot Thesis, Beans of Glory, Absolutely Unhinged) and twelve achievements (titles: the Aura Farmer,
  the Unhinged, the Brainrot Professor, the Sixty-Seven).

**For members:** the same game saved to the server (and still in the browser), the **Life** page (`#life`, home after sign-in):
level, money, net worth, stats, home, love & family, friends, businesses, blocks, stickers, the current mission and the diary.
A game played as a guest is kept when you sign up.

**For admins** (`#admin`; your admin email (App Secret `admin_emails`) becomes an admin on first sign-in):
- **Players:** every save with progress; hide a player from the leaderboard or reset a game name.
- **Map backup:** how many map tiles the server keeps, a size limit, and a button that copies 20 starter cities in advance.
- **Feedback inbox**, **Users**, **Demo data** (six demo players for the leaderboard).

## Map data

| Source | Used for |
|---|---|
| [OpenFreeMap](https://openfreemap.org) | zoom-14 vector tiles (OpenMapTiles schema): buildings, roads, parks, water, house numbers, named places. Free, no key, CORS open |
| [Mapterhorn](https://mapterhorn.com) | elevation tiles (Terrarium WebP, 512 px, zoom 15 where a country has detailed data, else lower): the hills. Free, no key, CORS open |
| IndexedDB `cityfuntime` | tiles already explored (streets and hills) |
| The app's own table `tiles` | the server's backup copy of every tile players loaded (server_code/Tiles.py), used when a service doesn't answer |
| [Nominatim](https://nominatim.org), fallback [Photon](https://photon.komoot.io) | the address typed on the move-in screen |

Data © OpenStreetMap contributors (ODbL), © OpenMapTiles; hills © Mapterhorn (open data, sources at mapterhorn.com/attribution, all
allow commercial use with credit). The credit is in the footer, the game's settings and the legal kit.

**If a map service closes:** each browser keeps what it explored (IndexedDB), and the server keeps a copy of every tile any player
loaded (they're copied automatically in small batches; the server fetches them itself). The game asks the server when a service
doesn't answer, so every neighbourhood someone has played keeps working; places nobody played yet would load without that data
(no hills: the world stays flat; no streets: empty). Admin > Map backup copies 20 starter cities ahead of time. Size limit:
3,000 MB by default (Admin > Map backup).

## Setting it up in Anvil (once)

1. In the Anvil editor: **Create app → Clone from GitHub**, and paste `https://github.com/arkulinskis/cityfuntime`.
2. **Users** service: email + password and "Continue with Google", sign-up allowed (already set in `anvil.yaml`; check it).
3. Open the app in the editor. If it shows a **Schema Mismatch** alert, choose **"The schema of the source code is correct"** so Anvil creates the tables.
4. **Run** it and sign up with **your admin email** (App Secret `admin_emails`) straight away (that account becomes the admin).
5. **Publish** (Publish → public URL, or your own domain).

## Ground textures

The road, pavement, grass, woods, plaza, sand and path textures are photos from [Poly Haven](https://polyhaven.com) (CC0, free for any use): asphalt_02, concrete_pavement, leafy_grass, forest_leaves_02, pavement_03, sand_01, grass_path_3, concrete_floor_01. `tools/ground_textures.py` downloads and prepares them.

<!-- libraries:start -->
## Libraries and outside services

What this project uses besides its own code. Generated by `APP_MAKER/tools/libraries.py`; to change it, edit `APP_MAKER/libraries/catalog.py` and re-run the script.

| Name | How it gets in | Used here for |
|---|---|---|
| [three.js](https://threejs.org) r149 | Copied into the app | Draws 3D scenes in the browser: shapes, lights, cameras, textures and VR. |
| [Nominatim](https://nominatim.org) | Outside web service | OpenStreetMap's address search: turns an address into a map position, and back. |
| [OpenFreeMap](https://openfreemap.org) | Outside web service | Free vector map tiles: the shapes of streets, buildings, parks and water. |
| [Photon](https://photon.komoot.io) | Outside web service | A fast address search built on OpenStreetMap, good for "search as you type". |
| [Mapterhorn](https://mapterhorn.com) | Outside web service | Free elevation tiles for the whole world: how high the ground is, down to about 1 m detail in some countries. |
| [Arkvital music library (ArkMusic)](https://arkvital-media.addanapp.workers.dev) | Outside web service | Background music: the user's licensed Audiio tracks, streamed from our own Cloudflare R2 bucket by a small shared player. |
| [YouTube embeds](https://developers.google.com/youtube/player_parameters) | Outside web service | Plays a YouTube video inside the page (the privacy-friendlier youtube-nocookie address). |
| [Google Fonts](https://fonts.google.com) | Loaded from a CDN | Fredoka, Nunito |

**Built into the browser:** Canvas 2D, WebGL, Pointer Lock, Geolocation, Web Audio API, localStorage, Clipboard, File downloads (Blob), IndexedDB.

**Anvil platform:** Anvil, Anvil Data Tables, Anvil JS bridge (anvil.js), Anvil Secrets, Anvil Users, Anvil Google service, Anvil HTTP.

**Build and test tools (not shipped):** axe-core, Node.js, Headless Chrome (DevTools Protocol), PyYAML, Pillow.

<!-- libraries:end -->

## Working on it

See `.claude/skills/cityfuntime/SKILL.md`. The folder is the Anvil app (native Anvil Forms; the 3D game is JavaScript in
`theme/assets`). In short:

```
python tools/check.py                            # anvil validate, JS syntax, asset hashes, server tests, design check → ALL CHECKS PASSED
python tools/assets.py                           # after editing anything in theme/assets (cache-busting hashes in anvil.yaml)
python -I tools/ui_test.py                       # the app in the Anvil App Server (Docker) + headless Chrome → ALL UI TESTS PASSED
node tools/live/content_check.mjs                # missions, items, weapons, monsters, shops: every reference checks out
python -I tools/live/game_test.py                # plays the 3D game for real (needs internet): missions, then street life
python -I tools/live/game_test.py --shots DIR    # pictures of the city by day, at dusk and at night
python -I tools/live/game_test.py --people DIR   # close-ups of the characters: you, passers-by in poses, the look editor
python -I tools/live/game_test.py --models DIR   # the 3D models up close: faces, silly extras, vehicles, trees, bushes, animals
python -I tools/live/game_test.py --long DIR     # the Character / Reputation / Achievements apps, a Legendary drop, a rare monster
python -I tools/live/game_test.py --monsters DIR # the 15 monster types, a metro guardian, a fight, loot gear on you
git push origin master                           # the deploy: Anvil pulls master
```

## Project layout

```
theme/assets/cft-content.js   ALL the game content: stats, pickups, place kinds, items, weapons, rides, homes, businesses, crews, stickers,
                              cast, missions, monsters, street folk, flirting lines, pranks, street events, shop names and sign colours
theme/assets/cft-game.js      the rules: saves, missions engine, pickups, people, shops, homes, businesses, turf, time, interaction
theme/assets/cft-rpg.js       the long game: loot, talents, reputation, achievements, titles, rested XP, discovery, rare monsters
theme/assets/cft-fun.js       street life: monsters + weapons, strangers and sweethearts, street folk and the crown, pranks and chasers,
                              banana peels, trampolines, street events
theme/assets/cft-ui.js        HUD, dialogue, choices, phone apps, shop/business/home/bank/metro panels, dance-off, quiz, start screen
theme/assets/cft-world.js     the 3D city: tile streaming, buildings, roads, trees, sky, street furniture, parked cars, traffic lights,
                              shop signs, people, traffic, pigeons, monsters' and props' shapes, rides, day/night, minimap
theme/assets/cft-tiles.js     vector-tile decoder (protobuf/MVT) incl. named places (poi layer)
theme/assets/cft-kit.js       window.CFT: loads the engine on demand, save sync, plain JSON views for the Forms pages
theme/assets/three.min.js     three.js r149
client_code/    Layouts/Shell, Pages (Landing, Play, Life, Quests, Album, Ranks, Auth, Profile, Admin), Items, Dialogs, Components (Game, Bar),
                cft.py (the bridge to the engine), router.py, state.py, auth.py, legal.py
server_code/    Game.py (saves, leaderboard, admin players), Tiles.py (map backup), DemoData.py, Accounts, Feedback, Admin, common,
                legal_server, seo_routes, SchemaCheck
tools/          check.py, assets.py, ui_test.py + ui/ (smoke, a11y, design), live/ (harness.py, game_test.py, gametest.js, funtest.js,
                content_check.mjs), testing/ (server tests)
```

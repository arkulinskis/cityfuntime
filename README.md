# City Fun Time

A life-simulation game on your real streets. Type your address and the neighbourhood around it is rebuilt in 3D from
OpenStreetMap: real buildings, streets, parks, house numbers and shop names, filled with people walking dogs, traffic and
pigeons. You arrive with $20 and a backpack, crash on Cousin Max's couch, and work your way up: errands for Nonna Rosa,
odd jobs, a lemonade stand, a skateboard, friends, love, a wedding, kids, fifteen businesses, a penthouse, and every block
won back from the crews. 153 missions, played at real places near you. Built on [Anvil](https://anvil.works); grown out of
City Coin Run (`Documents/CLAUDE/citycoinrun`).

- **App repo:** github.com/arkulinskis/cityfuntime (branch `master`). Anvil pulls `master`.
- **Live:** https://city-fun-time.anvil.app

## What it does

**For everyone (no account needed):**
- **Landing page** (`#landing`): the promise, how it works, everything in the game, the cast, FAQ.
- **The game** (`#play`, full screen): a move-in screen (name, skin/hair/shirt, then an address search, "use where I am", or six
  featured neighbourhoods in Montréal and New York), then the 3D city. Guests save in the browser.
- **Quests** (`#quests`): all 153 missions by chapter with status, story, steps and rewards. **Album** (`#album`): 72 stickers in 12
  sets plus the photos from photo missions. **Leaderboard** (`#ranks`): net worth, level, blocks, missions.

**In the game:**
- **Missions:** 85 story missions in 9 chapters (New in Town, The Hustle, Wheels, The Crew, Love, Turf, Boss Mode, Family, The Big Leagues)
  + 68 side stories. People with a yellow **!** stand at real places (cafés, bakeries, banks, libraries, parks...). Step types: go,
  talk (with charm-checked choices), collect, deliver (to real house numbers, some timed), buy, have money, reach a stat or level,
  own (home, business, blocks, friends...), pay, escort (slow grandpas, dogs, your partner), chase, race (checkpoints), photo (some
  only at golden hour or night), visit several places, dance-off, quiz, sleep, walk a distance, chat with strangers, tag, defend.
- **Repeatables:** 3 odd jobs a day (phone), a rush hour per business per day (deliveries for tips), rival tags to clean.
- **Stats:** Fitness (speed, energy), Charm (dialogue choices, relationships), Smarts (business income, XP), Style (shop discounts),
  Street cred (crew bosses, turf income). Plus energy (sprinting drains it; food and sleep refill it), happiness (follows your
  home, furniture, family, friends and pets; multiplies income) and XP levels.
- **Pickups** on the streets: coins, cash, coffee, books, roses, dumbbells, shades, spray cans, stars, sticker packs, rare gems.
- **Shops** at real places (36 kinds): food, gifts, clothes and shoes (speed), phones (minimap radar), furniture, pets, classes, licences, vehicles.
- **Rides:** skateboard, kick scooter, bicycle, Vespa-style scooter, compact car, family SUV, sports car (V to hop on/off; cars steer with A/D).
- **Homes:** couch → basement studio → one-bedroom → two-bedroom → loft → townhouse → penthouse (the tallest real building nearby). Rent at midnight.
- **People:** 14 possible friends with perks, a partner (girlfriend or boyfriend, the player chooses), engagement, wedding, up to 3 kids,
  dogs and cats; partner, kids, pets and one friend can walk behind you.
- **Businesses:** 15, from lemonade stand to boutique hotel, opened in a free storefront near you with a sign on the wall. Till,
  upgrades, managers (offline earnings), rush hours.
- **Turf:** 300 m blocks around home, each run by one of 12 crews. Tag its 4 posters (spray cans), beat the boss (race, dance-off,
  quiz, chase or cred check). Owned blocks pay hourly; rivals sometimes tag them back.
- **World:** day and night (24 minutes a day), lit windows, pedestrians, cars that stop and honk, pigeons, metro entrances as fast
  travel, a phone (P) with Quests, Map, Me, Bag, People, Homes, Business, Turf, Album, Diary, Settings.

**For members:** the same game saved to the server (and still in the browser), the **Life** page (`#life`, home after sign-in):
level, money, net worth, stats, home, love & family, friends, businesses, blocks, stickers, the current mission and the diary.
A game played as a guest is kept when you sign up.

**For admins** (`#admin`; arkulinskis@gmail.com becomes an admin on first sign-in):
- **Players:** every save with progress; hide a player from the leaderboard or reset a game name.
- **Feedback inbox**, **Users**, **Demo data** (six demo players for the leaderboard).

## Map data

| Source | Used for |
|---|---|
| [OpenFreeMap](https://openfreemap.org) | zoom-14 vector tiles (OpenMapTiles schema): buildings, roads, parks, water, house numbers, named places. Free, no key, CORS open |
| IndexedDB `cityfuntime` | tiles already explored |
| [Nominatim](https://nominatim.org), fallback [Photon](https://photon.komoot.io) | the address typed on the move-in screen |

Data © OpenStreetMap contributors (ODbL), © OpenMapTiles. The credit is in the footer, the game's settings and the legal kit.

## Setting it up in Anvil (once)

1. In the Anvil editor: **Create app → Clone from GitHub**, and paste `https://github.com/arkulinskis/cityfuntime`.
2. **Users** service: email + password, sign-up allowed (already set in `anvil.yaml`; check it).
3. Open the app in the editor. If it shows a **Schema Mismatch** alert, choose **"The schema of the source code is correct"** so Anvil creates the tables.
4. **Run** it and sign up with **arkulinskis@gmail.com** straight away (that account becomes the admin).
5. **Publish** (Publish → public URL, or your own domain).

<!-- libraries:start -->
## Libraries and outside services

What this project uses besides its own code. Generated by `APP_MAKER/tools/libraries.py`; to change it, edit `APP_MAKER/libraries/catalog.py` and re-run the script.

| Name | How it gets in | Used here for |
|---|---|---|
| [three.js](https://threejs.org) r149 | Copied into the app | your real neighbourhood rebuilt in 3D |
| [Nominatim](https://nominatim.org) | Outside web service | OpenStreetMap's address search: turns an address into a map position, and back. |
| [OpenFreeMap](https://openfreemap.org) | Outside web service | street, building and park shapes for the 3D neighbourhood |
| [Photon](https://photon.komoot.io) | Outside web service | finds the address you type |
| [Google Fonts](https://fonts.google.com) | Loaded from a CDN | Fredoka, Nunito |

**Built into the browser:** Canvas 2D, WebGL, Pointer Lock, Geolocation, Web Audio API, localStorage, IndexedDB.

**Anvil platform:** Anvil, Anvil Data Tables, Anvil JS bridge (anvil.js), Anvil Users.

**Build and test tools (not shipped):** Node.js, Headless Chrome (DevTools Protocol), PyYAML.

<!-- libraries:end -->

## Working on it

See `.claude/skills/cityfuntime/SKILL.md`. In short:

```
python -I tools/check.py --ui                    # syntax, server tests, headless UI tests → ALL CHECKS PASSED
python -I tools/preview/devserver.py 8771        # the app on in-memory data: http://localhost:8771/  (?as=ana#life, ?as=admin#admin)
python -I tools/live/game_test.py                # plays the 3D game for real (needs internet + the dev server on 8771)
python tools/deploy.py                           # dry run (needs PyYAML, so no -I)
python tools/deploy.py --push "Message"          # deploy: commit + push to GitHub, Anvil pulls it
```

## Project layout

```
assets/cft-content.js   ALL the game content: stats, pickups, place kinds, items, rides, homes, businesses, crews, stickers, cast, missions
assets/cft-game.js      the rules: saves, missions engine, pickups, people, shops, homes, businesses, turf, time, interaction
assets/cft-ui.js        HUD, dialogue, choices, phone apps, shop/business/home/bank/metro panels, dance-off, quiz, start screen
assets/cft-world.js     the 3D city: tile streaming, buildings, roads, trees, people, cars, pigeons, rides, day/night, minimap
assets/cft-tiles.js     vector-tile decoder (protobuf/MVT) incl. named places (poi layer)
assets/three.min.js     three.js r149
web/            core.js/core.css (engine + sticker-book tokens), app.js, pages/*.html (_cft = loader + save sync; play, life, quests, album, ranks, landing...)
server_code/    Game.py (saves, leaderboard, admin players), DemoData.py (demo players), Accounts, Feedback, Admin, common, legal_server
tools/          sync_to_anvil.py (settings + schema; also writes window.CFT_ASSET_V), deploy.py, check.py, preview/, testing/, live/ (game_test)
```

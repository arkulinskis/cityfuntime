# cft-addr.js: finding the address on the start screen

Added 2026-11-27 (the user: "the game doesn't give the right address when you are starting a life... add a validation
that the address is found and make sure it is the right one").

## At a glance

| | |
|---|---|
| File | `theme/assets/cft-addr.js` (~300 lines, plain JavaScript, no DOM) |
| Global | `window.CFTAddr` in the browser, `module.exports` in Node |
| Loaded | after `cft-tiles.js`, before `cft-world.js` (`ALL` in `theme/assets/cft-kit.js`, `ENGINE` in `tools/live/harness.py`, a `cft-asset` meta tag in `anvil.yaml`) |
| Used by | cft-ui `U.startScreen` (submit and "Use where I am"), through `addrLookup` / `addrOpts` / `confirmAddress` |
| Network | Nominatim search + reverse, Photon, OpenFreeMap zoom-14 street tiles. All passed in as `opts.get(url)` and `opts.tile(x, y)` |
| Tests | `node tools/testing/addr_test.js` (offline, in check.py), `node tools/testing/addr_live.js` (real services), `game_test.py --addr` (the real start screen) |

## Responsibilities

- Read what was typed: coordinates, the house number (`parse`).
- Ask Nominatim and Photon together (10 answers each) and score every answer against the typed words (`score`, `rank`).
- Decide how sure the match is: `exact`, `guess`, `street`, `place`, `coords` or `none`.
- When the house number isn't in OpenStreetMap, place it between its neighbours on the same street, using the house
  numbers and street names in the game's own map tiles (`interpolate`).
- Name the spot after the player moves the pin (`reverse`).

It does not draw anything. The card with the map is cft-ui `confirmAddress`.

## Public API (`CFTAddr`)

| Name | What it does |
|---|---|
| `lookup(q, opts)` | -> `{ status, best, list, parsed, note }`. `best` = `{lat, lon, hn, road, city, short, label, ...}`; `list` = up to 4 other answers (150 m+ away, a different name, no second copy of the same street); `note` explains a guess ("between numbers 1232 and 1238") or a missing number |
| `reverse(lat, lon, opts)` | -> "1240 Rue Saint-Denis, Montréal" or null |
| `parse(q)` | -> `{ q, coords }` or `{ q, num, words }` |
| `score(c, P)`, `rank(list, P)` | the scoring (see below) and best-first order without near duplicates |
| `interpolate(num, road, seeds, opts)` | -> `{lat, lon, how: 'between' / 'beyond' / 'tiles'}` or null |
| `between(target, pts)`, `beyond(target, pts)` | the two placement rules, on `{n, t, lat, lon}` points |
| `norm`, `sig`, `metres`, `fromNominatim`, `fromPhoton` | helpers (normalised words, street words without "Rue"/"Street", distance, one answer shape) |

`opts`: `get(url)` -> JSON (throws when offline), `tile(x, y)` -> ArrayBuffer or null, `TM` (TileMaker, defaults to the
global), `lang` (Nominatim's accept-language).

## Internal structure

1. Words: `norm` (lower case, no accents), `SAINT` (St -> saint), `TYPE` (street-type and filler words), `sig`.
2. `parse`: the house number is the first number before the first comma, else the first number that isn't a 5-digit
   postcode at the end ("1234 Rue Saint-Denis", "Brīvības iela 12", not "10118" or "H2X 3K4").
3. `fromNominatim` / `fromPhoton`: one shape `{lat, lon, hn, road, name, city, place, label, imp, src, kind}`.
4. `score`: +50 same house number, -15 a different one; +30 x the share of the answer's street words that were typed;
   the other typed words (city, borough, postcode) +20 x the share found in the answer's place, -35 when under half
   are; +5 x importance. `exact` = same number, street words at least half typed, place agrees.
5. `streetNumbers` / `interpolate`: tiles around the street's stretches (seeds, up to 4), then the next tile toward the
   number (`beyond`) when everything found is on one side; at most `MAX_TILES` = 8. A number belongs to the street when
   the nearest named street within `NEAR_M` = 45 m is that street. `between`: same side (parity) first, neighbours at
   most 400 numbers and 1.5 km apart. `beyond`: carry on along the two nearest numbers, accepted when the number is at
   most 60 away and the spot at most 400 m on.
6. `lookup`: the order above, then the label (a guess shows only "street, town", not the borrowed stretch's full address).

## Key data structures

- Answer: `{lat, lon, hn, road, name, city, place, label, imp, src, kind, score, cov, hnSame, placeOk, exact, short}`.
- Street number point: `{n (integer part), t (as written), lat, lon}`.
- Result statuses and what the card says: `exact` "Found your address", `guess` "Best guess for your number",
  `street` "Found the street, not the number", `place` "Found this place", `gps` / `pinned` (set by the card).

## Lifecycle

Stateless. One `lookup` per "Move in" press; cft-ui ignores an answer that arrives after a newer press (`asking`).
Typed coordinates skip the card (the game tests rely on that through `CFT_START`). The start screen saves
`home.check` = the status the player accepted.

## Tunables

`NEAR_M`, `MAX_TILES`, the score weights in `score`, the limits in `between` / `beyond`, `TYPE` (add a country's street
words there when a city's addresses match badly).

## How to test

- `node tools/testing/addr_test.js`: offline fixtures copied from the real answers that went wrong (Laval, "155 k-12",
  a random stretch of Rue Saint-Denis), parsing, between/beyond. Runs in `python tools/check.py`.
- `node tools/testing/addr_live.js ["an address" ...]`: the real services (respects Nominatim's one request a second).
- `python -I tools/live/game_test.py --addr`: types an address on the real start screen, checks the card, taps the
  map, moves in and checks `save.home`.

## How to modify safely

- Keep the network injectable: no `fetch` inside this file, so the offline test keeps working.
- New status? Add its badge to `ADDR_BADGE` and its sentence to `explain` in cft-ui `confirmAddress`.
- Nominatim's usage policy: one request a second, no bulk lookups. The card's reverse lookup waits 700 ms after the
  last tap for that reason.
- The map in the card uses `tile.openstreetmap.org` images with the attribution line; keep the attribution.

## Review checklist for AI-made diffs

- [ ] `addr_test.js` still passes and covers any new rule.
- [ ] A typed house number never comes back `exact` unless the answer has that number.
- [ ] Words the player typed that aren't the street still penalise answers in another town.
- [ ] No new request per keystroke; one lookup per submit.
- [ ] `docs/dev/modules/cft-ui.md` (start screen) updated if the card changed.

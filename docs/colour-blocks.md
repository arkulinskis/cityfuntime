# Colour blocks: how progression works (2026-11-21)

The ask: "There needs to be a progression in the game. Separate any map into squares of 2 by 2 km. Inside each block everything
starts off grayscale. As you unlock grocery stores, metros, any other shops, the world becomes colourful. If all buildings are
liberated they are full of colour. If all secret packages are found, the road and trees get colour... something like that."

## Brainstorm (the options weighed)

- **One colour bar per block** (everything greys and colours together). Simple, but every action feels the same and you can't
  see *what* you achieved. Rejected.
- **Colour per building** (the shop you freed turns colour, its neighbours stay grey). Lovely, but it needs per-building data
  in the geometry and rebuilding tiles on every visit; with hundreds of made-up shops per block it is also a long grind before a
  street looks alive. Kept as a *moment* instead: a ring of colour runs out from every place you free.
- **Layers per block, each with its own job** (chosen). The city is split into what you see most: buildings, streets, nature,
  sky. Each layer listens to a different kind of play, so a block shows at a glance what you've done there and what is left:
  grey trees = go fight; grey roads = go snooping for secrets; grey facades = go free shops and outposts.
- **Targets instead of "all of them"**: a dense 2 km block can hold 70 groceries and hundreds of shops. "All" would be a chore,
  so each layer has a target (tunable in Admin > Balance); a block with fewer places than the target needs all of them, which
  is the user's "if all buildings are liberated they are full of colour".
- **Left out on purpose**: losing colour again (no decay: progress stays earned), colour gates that block missions, paying for
  colour. Moving people, figments, pickups, signs and lights always keep their colour: they are what you look for in a grey world.

## How it works

- **The grid**: 2 km squares; your home sits in the middle of block (0, 0). The grid is fixed per save (the world is built
  around your home), up to 48 km in every direction.
- **Three layers per block, plus the sky**

  | Layer | What turns colour | How you bring it back | Full at (default) |
  |---|---|---|---|
  | 🏠 Buildings | walls, windows, roofs, balconies | liberate an outpost (Tom Hearton's, grocery): 4 pts · free a metro station (beat its guardian): 4 pts per entrance · walk into a real shop (E): 1 pt · a made-up shop: 0.5 pt | 40 pts (or every place, if the block has fewer) |
  | 🛣️ Streets | roads, pavements, plazas, paths, street furniture, parked cars, decor | open secret stashes in the block's tight gaps between buildings | 8 stashes |
  | 🌳 Nature | trees, bushes, grass, woods, parks, water, sand | bonk figments inside the block (champions 2, rares and King Blob 3, metro guardians 5) | 25 figments |
  | ☁️ Sky | the sky dome, horizon and fog | the average of the three layers of the block you stand in | |

- **Block restored**: all three layers full = a rainbow wave over the whole block, a banner, cash (300, +15% per level) and XP
  (400, +10% per level), counter `blocks`.
- **Feedback**: a ring of full colour runs out from every freed place, opened stash and filled layer; a feed line at every
  quarter of a layer; a banner when a layer fills; the 🎨 chip (top right, under the street name) with three small bars; the
  phone app 🎨 Colour (this block's layers, what is left for each, every block you have been to).
- **Older saves**: everything starts grey too, but outposts, metro stations and secret stashes you already freed count as soon
  as their part of the map loads, so veterans start with colour where they played.
- **Settings**: "Colour comes back block by block" (on by default). Off = full colour everywhere (the progress still counts).

## Where it lives

- `theme/assets/cft-color.js` (G.color): progress, rewards, the HUD chip and the phone app's data. State `save.color`.
- `theme/assets/cft-world.js` "colour blocks": `greyify(material, layer)` adds a few shader lines to every world material (a
  48x48 texture, one texel per block, RGBA = buildings, streets, nature, sky); `W.setBlockColor`, `W.colorWave`, `W.colorOff`,
  `W.skySat`. Ground materials pick streets or nature per surface (road, pavement, plaza, path vs grass, woods, sand, water).
- Hooks: cft-hero `liberate`, cft-fun `freeStation` + `hitMonster`, cft-camp `openSecret`, cft-game shop interaction.
- Knobs: `D.TUNE.color` (Admin > Balance > Colour blocks). Tests: `tools/live/colortest.js` (`game_test.py --color`).

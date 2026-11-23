# City Fun Time: play-test notes

Write notes here (or just send them in the chat: Claude adds them here). One line each is plenty. Fixes are made in
batches with the `/cft-fix` skill, which reads only the code each note needs (FIX_INDEX.md + tools/where.py).

**Handy while testing:** open the game with `?debug=1` at the end of the address (for example
`https://city-fun-time.anvil.app/?debug=1#play`). A 🐞 button (or the ` key) opens the play-test panel: time of day,
money, level, god mode, spawn figments, fill swagger, a fan or a gift now, jump to a Tom Hearton's / grocery / metro /
mission person / parked car / home. **📋 Copy note info** copies where you are, the time, your level, the active missions
and what is around you: paste it under a note when the place or the moment matters. `?debug=0` turns the panel off.

**A good note** (all optional): the area (see the list), what happened, what you wanted instead. "Parry window feels too
short", "the pointer covers the money chip on my phone", "Rosa says the same line twice". Numbers are welcome ("half as
many compliments").

Areas: movement · camera · rides/cars · smashing · combat · blocking/parry · monsters · health · guardians · outposts ·
hype/compliments · swagger · mission letters/arrow · minimap · missions/story · dialog · sweethearts · street folk ·
pranks · events · loot/gear · talents/rep · your look · people/traffic · shops · business/turf/homes · HUD/buttons ·
phone · buildings/graphics · day/night · performance · sound · saving · pages (Life, Quests...) · decor · mayhem/aura ·
ranged weapons · shooters/flyers · jetpack/glide · toys · critters/Dex · fart/potty · chaos events · sky

## Open

<!-- new notes go here, numbered on: "- [ ] 12. (combat) ...", then a line "  info: ..." when you pasted note info -->

## Done

<!-- "- [x] 12. (combat) ... → what changed (commit abc1234)" -->
- [x] 5. (ranged weapons) "projectiles need to also respect the height of where the target is pointing... comes out straight or down, but never up. Check all distance weapons" → W.aimEl (camera look angle) drives every ranged weapon without the sight: thrown shooters, bubble shots (now fly in 3D), water + extinguisher spray (tilt + height check); lightning hits the sight point; auto-aim ignores low targets when you look up. Test tools/live/upaimtest.js.
- [x] 4. (buildings/graphics) "update the sidewalks. The texture looks uninviting. Needs to be more friendly" → drawn cartoonPavement tile (cream bevelled slabs, grass + flowers in the joints, chalk heart/star/smiley/sun/hopscotch), warmer pavement and kerb colours. Pictures: --ground.
- [x] 2. (buildings/graphics) "make the street floor more cartoonish, the current tile is too serious" → the road photo is replaced by a drawn cartoon tile (cartoonRoad in cft-world: flat slate, soft blotches, outlined pebbles, chunky cracks, tar patches), roads a touch bluer. (commit e6cffad)
- [x] 3. (buildings/graphics) "write the street name on the actual street... like a carpet... yellow with black outline... half the street width in its height... parallel with the street" → streetNames/nameMat in cft-world: each named car street gets its name lying on the road every ~160 m, capitals half the road wide, following gentle bends and hills, turned round on the GPU so it never reads upside down; unlit paint dimmed at night. Scene g8-street-name in --ground. (commit e6cffad)
- [x] 1. (sweethearts) "when the character is small it still says flirt in the options... if the character looks like a child, let's make sure there is no way to flirt" → kids (ped type 'kid' or height under 0.78, W.isKid) get a "🧒 A kid" menu with no Flirt; flirt() refuses them; passing compliments from them are never flirty; same if your own look is child-sized (F.noFlirt). Test in funtest.js. (commit 84487bb)

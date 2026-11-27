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
- [x] 16. (saving / start) "doesn't give the right address when you are starting a life: validate it is found and the right one" → new cft-addr.js: Nominatim + Photon answers scored on house number, street and town (no more Laval for a Montréal address, no "155 k-12" for number 12); a number missing from the map is placed between its neighbours from the game's tiles; the start screen shows an "Is this your place?" card with a map, tap to move the pin. Tests: addr_test.js (check.py), addr_live.js, --addr.
- [x] 15. (buildings/graphics) "some areas have huge holes, as if map topology data is bad: validate that too" → elevation pixels cleaned (noise, no-data), failed hills squares fall back to a coarser tile and stay level with their neighbours (were dropped to home height: ~1 km pits), river banks / trenches at real height (only broad hills exaggerated), broken or missing map squares get plain ground, faster building when you arrive somewhere. W.groundCheck + --holes (26 checks) + --aerial pictures.
- [x] 14. (people/traffic, your look) "some models are up to date, some are not" → your own look, story characters without an Actor Troop model, kids, sweethearts, street folk, shopkeepers, crew bosses and silly passers-by are realistic townspeople now (closest match by skin, hair, shirt, beard, glasses; the silly extra sits on the model's head). Pictures: --crowdshots c5, c6.
- [x] 13. (buildings/graphics) "the floor looks flat: 3D texture, small grass, small pebbles" → grass clumps that sway in the wind on lawns, parks, woods and yards, pebbles on yards, woods, sand and playgrounds, within 32 m of you (off on low quality). Pictures: --ground g3, g5.
- [x] 12. (your look) "make a selection of a main character to be one of the Actor Troop models, and the rest are predefined to mission givers" → "Who are you?" (move-in screen + Your look): 11 Actor Troop characters or your own look; each plays a giver (Grace=Rosa, Marcus=Max, Diego=Dmitri, Ava=Priya, Raj=Okafor, Kenji=Kai, Lena=Sam, Nora=Zoe, Zoe=Luna, Otis=Bouchard, Vitalijs=Jay). Shots: --castshots.
- [x] 11. (buildings/graphics) "add house numbers to the walls" → every OSM house number is a navy enamel plate (white border + digits, 0.3 m) on the wall facing the street, at door height (houseNumbers, one atlas + mesh per sub-tile). Picture: --ground g9-house-numbers.
- [x] 10. (graphics) "street name too big, half size, always the same direction so it doesn't flicker, continuous text: name, a word's length, name again" → letters half as tall, one reading direction per street (the camera-based flip is gone), the name repeats along the street with a word-sized gap, cut at sharp corners and crossings, whole names only.
- [x] 9. (missions/story) "people giving missions are inside the building and the main character weirdly placed. They need to have a specific place" → givers stand at a fixed spot on the pavement in front of their place, facing the street (W.standSpot; the old random ±2 m nudge is gone, people sharing a spot stand 1.6 m apart); turf bosses too. In a scene you step to 1.6 m in front of the giver (W.stageBefore). Tests in cinetest.js.
- [x] 8. (missions/story) "change the catch phrase from nobody dislikes you to something more positive" → the announcer's "Nobody does it like you!" (heard as "nobody dislikes you") is now "You make this city shine!" (re-voiced, R2).
- [x] 7. (buildings/graphics) "sidewalks a bit higher, beautiful brick texture or rock; feet touch the ground" → KERB_Y 0.13 → 0.2 m with a grey stone kerb face and back edge, herringbone terracotta brick paving (drawn, no download), stone kerb strip; people, figments, followers, dogs, props and decor stand with standAt so nothing sinks into the raised pavement. Picture: --ground g1c-kerb-low.
- [x] 6. (campaign) "first 5 minutes to first 3 minutes for the mayhem part" → D.CAMPAIGN.INTRO_SECS 300 → 180, banner + docs say three; first MEGA a quarter of the way in (45 s); saves mid-opening capped at 3:00.
- [x] 5. (ranged weapons) "projectiles need to also respect the height of where the target is pointing... comes out straight or down, but never up. Check all distance weapons" → W.aimEl (camera look angle) drives every ranged weapon without the sight: thrown shooters, bubble shots (now fly in 3D), water + extinguisher spray (tilt + height check); lightning hits the sight point; auto-aim ignores low targets when you look up. Test tools/live/upaimtest.js.
- [x] 4. (buildings/graphics) "update the sidewalks. The texture looks uninviting. Needs to be more friendly" → drawn cartoonPavement tile (cream bevelled slabs, grass + flowers in the joints, chalk heart/star/smiley/sun/hopscotch), warmer pavement and kerb colours. Pictures: --ground.
- [x] 2. (buildings/graphics) "make the street floor more cartoonish, the current tile is too serious" → the road photo is replaced by a drawn cartoon tile (cartoonRoad in cft-world: flat slate, soft blotches, outlined pebbles, chunky cracks, tar patches), roads a touch bluer. (commit e6cffad)
- [x] 3. (buildings/graphics) "write the street name on the actual street... like a carpet... yellow with black outline... half the street width in its height... parallel with the street" → streetNames/nameMat in cft-world: each named car street gets its name lying on the road every ~160 m, capitals half the road wide, following gentle bends and hills, turned round on the GPU so it never reads upside down; unlit paint dimmed at night. Scene g8-street-name in --ground. (commit e6cffad)
- [x] 1. (sweethearts) "when the character is small it still says flirt in the options... if the character looks like a child, let's make sure there is no way to flirt" → kids (ped type 'kid' or height under 0.78, W.isKid) get a "🧒 A kid" menu with no Flirt; flirt() refuses them; passing compliments from them are never flirty; same if your own look is child-sized (F.noFlirt). Test in funtest.js. (commit 84487bb)

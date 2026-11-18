# City Fun Time × Breath of the Wild: how to borrow the feel

*2026-11-18. Mechanics and game feel only: no Nintendo names, art, music or story.*

## What makes Breath of the Wild feel the way it does

| Mechanic | Why it feels good |
|---|---|
| **Climb anything, one stamina wheel** for climbing, sprinting and gliding | Every wall turns into a question: "can I make it?" The tension comes from the wheel. |
| **Glide off anything high** | Climbing up and gliding down is the core loop: height is the reward. |
| **"See it, go there"** (towers reveal the map; landmarks pull you in) | You set your own goals; nobody draws a route for you. |
| **Elemental chemistry** (fire makes updrafts, metal draws lightning, wet things conduct) | One problem, many solutions nobody scripted. |
| **Perfect dodge → slow motion + a flurry of free hits** | A small, readable skill check with a big payoff. |
| **Slow motion when you aim in mid-air** | A jump turns into a hero moment; moving and fighting become one thing. |
| **Tiny secrets everywhere, and the final reward is a joke** | Odd-looking spots always pay out. The silly tone fits a 12-year-old's humour. |
| **Minimal HUD, no tutorial wall** | You feel free, not guided. |

## What we built (the open-air update)

1. **Climb any building.** Walk into a wall to grab it and hold forward to go up. Space = jump up the wall, S + Space = flip off. A roof edge pulls you over the top.
2. **Stamina donut.** It floats beside you and only shows when it isn't full. Climbing, hanging on, gliding and air slow-motion use it. Run it empty and you let go and walk slowly until it's a third full again.
3. **Umbrella glide (by default).** Hold Space while falling. **Updrafts** rise from fires and sewer manholes.
4. **Perfect dodge.** Block and jump (a hop away) just before a hit lands: slow motion plus a **flurry** of free, faster, harder hits.
5. **Bullet time.** Shooting or using a power high in the air slows time for a moment, and costs stamina.
6. **Chemistry.**
   - **Metal:** lightning jumps through lamp posts, bins, mailboxes, hydrants and cars to the figments standing next to them.
   - **Steam:** water on fire makes steam that blinds figments.
   - **Soaked:** rain or a hydrant soaks you. Soaked means fireproof, but lightning hits twice as hard.
7. **Rooftop antennas.** The tallest roof in every 400 m square gets a silly 📡. Climb up and press E to "tune in", and the secrets around it show on your map.
8. **Giggles.** Within 10 m of a hidden stash, something giggles.

New achievements: Wall Crawler, Mary Poppins Who?, Too Slow (title "the Untouchable"), Five Bars ("the Wi-Fi Wizard"), Conductor. New mission: Signal Boost (Max).

## Ideas from the research, not built yet

- Sneaking (a crouch, a noise meter, sleeping figments, triple-damage sneak hits; rain and night make it easier).
- A magnet glove (throw metal street furniture) and a freeze power that stores up hits, then launches whatever is frozen.
- Bin-lid surfing down stairs and grassy banks.
- A "gnome nugget" collectible family with micro-puzzles (lift a bin, chase a goose, the odd pigeon out), and a golden-poop trophy as the final reward.
- HUD fading when nothing is happening. Skipped on purpose for now: you just chose a four-corner layout.

## Not copying

- **Breaking weapons:** the most criticised system. Limited ammo and loot rarity already do its job.
- **Slipping on wet walls in the rain.**
- **900 collectibles and long stamina grinds.**
- **Long puzzle rooms.**
- **Their look and names.**

## Sources

- GDC 2017 "Change and Constant": https://gdcvault.com/play/1024562/
- Engadget summary of the GDC talk: https://www.engadget.com/2017/03/12/breath-of-the-wild-gdc-talk/
- GamesBeat on chemistry vs physics: https://gamesbeat.com/the-legend-of-zelda-breath-of-the-wild-makes-chemistry-just-as-important-as-physics/
- CEDEC 2017, triangles and "gravity": https://kotaku.com/breath-of-the-wilds-biggest-design-secret-lots-of-tria-1819113140
- Stamina: https://zeldawiki.wiki/wiki/Stamina_Wheel
- Flurry Rush: https://zeldawiki.wiki/wiki/Flurry_Rush
- Updrafts: https://twinfinite.net/guides/zelda-breath-of-the-wild-updrafts-how-create/
- Korok seeds as a joke: https://www.gamesradar.com/zelda-breath-of-the-wild-has-a-ridiculous-amount-of-korok-seeds-because-you-were-never-meant-to-find-them-all
- Weapon durability criticism: https://gameinformer.com/b/features/archive/2017/05/16/opinion-why-breaking-weapons-are-ruining-my-zelda-experience

The numbers we use (stamina 100, climbing 9/s, glide 4/s, slow motion ×0.25 for 1.6 s, and so on) are starting values for play-testing. They are not measured from the original game. All of them are in `D.TUNE.wild`.

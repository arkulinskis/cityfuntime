# One fight, end to end (combat across cft-ui, cft-game, cft-fun, cft-rpg, cft-hero, cft-wild, cft-camp, cft-chaos, cft-aim)

This page follows a single melee fight against a figment from the key press to the loot, naming the exact function at
every step. Line numbers are approximate (`~L`); find the exact spot with `python -I tools/where.py --toc theme/assets/<file>.js`.
Module references: [cft-fun](modules/cft-fun.md), [cft-hero](modules/cft-hero.md), [cft-aim](modules/cft-aim.md),
[cft-stunt](modules/cft-stunt.md).

Shorthands: `G` = the game (cft-game.js), `W` = the world (cft-world.js), `U` = the UI (cft-ui.js), `F` = `G.fun`,
`R` = `G.rpg`, `H` = `G.hero`, `CB` = `D.TUNE.combat` (also exported as `D.COMBAT`), `TM` = `D.TUNE.monsters`,
`L` = your level (`G.level()`).

## 0. The cast and where each part lives

| Concern | Function(s) | File |
|---|---|---|
| Keys / mouse / buttons | `onKey` (F, G, Q, 1-5), canvas `mousedown`/`mouseup`, `[data-bonk]`, `[data-block]`, `[data-quaff]` | cft-ui.js ~L800-860 |
| Entry point | `G.attack = () => G.fun && state === 'play' ? G.fun.attack() : false` | cft-game.js ~L2076 |
| Your swing | `F.attack` (~L161), `weapon()` (~L104), `hitMonster` (~L356), `updateShots` (~L273) | cft-fun.js |
| Weapon bonuses, crits, loot | `modWeapon` (~L454), `bonus(key)`, `weapon()` (~L220), `onKill` (~L443), `drop` | cft-rpg.js |
| Figment spawn + scaling | `spawnMonster` (~L310), `monsterLevel` (~L299), `F.scaleFor` (~L305), `D.calc.scale` | cft-fun.js, cft-content.js ~L1957 |
| Figment AI + attack | `updateMonsters` (~L401), `windUp` (~L487), `teleTick` (~L497), `strike` (~L513), `touch` (~L559) | cft-fun.js |
| Block / parry | `F.setBlock` (~L117), `F.blockPower` (~L159), `F.parryWindow` (~L160) | cft-fun.js |
| Perfect dodge + flurry | `X.perfectDodge` (~L127), `X.flurryOn`, `X.flurryHit` | cft-wild.js |
| Your health | `F.maxHp` (~L574), `F.armor` (~L577), `F.hurt` (~L578), `F.heal`, `F.quaff`, `die` (~L606), regen in `F.tick` (~L1431) | cft-fun.js |
| Hype + swagger | `H.event` (~L128), `swag`, `mainMode`, `H.dmgMul` | cft-hero.js |
| XP | `addXp` (~L250) | cft-game.js |
| Ranged weapons, ranged figments | `C.fire` (~L276), `C.rangedAI` (~L451), `shotHitsPlayer` (~L335) | cft-chaos.js |
| Ammo, MEGA figments, campaign immortality | `K.useAmmo` (~L283), `K.meleeHit` (~L830), `K.immortal` (~L74), `K.shrug` (~L273) | cft-camp.js |
| Aiming + slot 5 shooters | `A.setAim`, `A.fire`, `fireGun` -> `F.shoot` | cft-aim.js / cft-fun.js ~L141 |
| Drawing | `W.monster`, `W.animateMonster`, `W.foePlate`, `W.swing`, `W.showReach`, `W.reachMarker`, `W.pop`, `W.burst`, `W.shake`, block pose (`W.blocking`) | cft-world.js |

```mermaid
sequenceDiagram
  participant UI as cft-ui
  participant G as cft-game
  participant F as cft-fun
  participant R as cft-rpg
  participant H as cft-hero
  participant M as figment m
  UI->>G: F key / click -> G.attack()
  G->>F: F.attack()
  F->>R: modWeapon(weapon())
  F->>F: aim assist, dmgMul(L), H.dmgMul, flurry
  F->>F: hitMonster(m, hw, f) for each target in reach + arc
  F->>M: hp -= dmg x weak, stun, knockback, plate
  alt hp <= 0
    F->>G: addXp(m.xpv, 'monster'), coins, counters
    F->>R: onKill(m) -> drop(...)
    F->>H: event('kill', {m}) -> words, swagger
  end
  M->>F: in reach -> windUp(m) (❗ + shrinking ring)
  F->>F: teleTick: ring gold when wind <= parryWindow()
  M->>F: wind <= 0 -> strike(m)
  alt out of reach / jumped
    F->>H: event('dodge')
  else blocking, started within parryWindow
    F->>H: event('parry'); F.counter armed 3.5 s
  else blocking
    F->>F: hurt(atk x (1 - blockPower)) (or guard break: atk x 0.7)
  else
    F->>F: lucky dodge roll, else touch(m): steal + hurt(atk)
  end
  F->>F: hurt -> hp 0 -> die(): wallet, travel to station/home
```

## 1. Before the fight: a figment appears

1. **Spawner** — `updateMonsters` (cft-fun ~L403-432) runs only when `onStory()` and not `calm()`. It counts "wild"
   figments (not event, boss or guardian) and wants `TM.night` (6; `nightLow` 4 on low graphics) at night (21:30-5:00,
   `isNight` ~L355) or `TM.day` (3; `dayLow` 2) by day, x0.6 when happy >= 75, x1.4 under 30. The campaign gates each kind
   of spawn with `G.allow('night' | 'day' | 'shooters')` (cft-camp). Spawn point: `W.randomWalkSpot` 30-85 m away, never
   within 30 m (night) / 90 m (day) of home. Kind: weighted by `D.MONSTERS[k].w`, `night: true` kinds only at night,
   `ranged`/`fly` kinds only when `G.allow('shooters')`. From level 2, `TM.champChance` (0.07) = a champion pack of three.
   Other spawners: King Blob (same function), metro guardians (`guardTick` ~L653), outpost packs (cft-hero `spawnPack`),
   rares (cft-rpg `spawnRare`), events (`startEvent`), MEGAs (cft-camp, separate list `G.camp.megas`).
2. **Level** — `monsterLevel(x, z)` = `max(1, min(L + 4, L - 1 + floor(distanceFromHome / TM.levelEvery)))`; champions +1,
   guardians and captains +1. (Near home a figment is one level below you, but never below 1.)
3. **Stats** — `spawnMonster` (~L310-333):
   - `sc = F.scaleFor(lvl)` = `D.calc.scale(L, lvl, gear, F.maxHp(), F.armor())`, where
     `gear = clamp((w.dmg + w.add) x (1 + R.bonus('dmg')) / (D.SLAP.dmg + D.SLAP.add), 1, 40)` for the weapon **in hand**.
   - `D.calc.scale` (cft-content ~L1966): with `rel = max(-1, lvl - L)`, `grow = 1 + TM.hpGrow x (L - 1)`,
     `push = 1 + min(TM.challengeMax, TM.challenge x (L - 1))`:
     - `hp mul = grow x gear^TM.gearShare x (1 + TM.hpPerLevel x rel) x push`
     - `atk mul = (maxHp / 71)^TM.lifeShare x (1 + armor / 100)^TM.armorShare x (1 + TM.atkPerLevel x rel) x push`
   - `m.hp = m.mhp = (o.hp || def.hp) x sc.hp x (champ ? TM.champHp : 1)`;
     `m.atk = (def.atk || 6) x sc.atk x (champ ? TM.champAtk : 1) x (o.atkMul || 1)`; `m.atkK = sc.atk` (cft-chaos enemy shots);
     `m.xpv = D.calc.xpFor(def, lvl, champ)` = `def.xp x (1 + D.TUNE.player.xpPerMonsterLevel x (lvl - 1)) x (champ ? TM.champXp : 1)`.
   - Size `(o.size || def.size || 1) x (champ ? TM.champSize : 1)`; body radius `m.r` = 1.6 (blob), 0.85 (brute, worm),
     else 0.6, times size. Guardians: `hp = base.hp x D.TUNE.bosses.guardHp + guardHpAdd`, `atkMul guardAtk`, size `guardSize`,
     xp x `guardXp`, `aggro 24`, `leash 30`.
   - A name plate (`W.foePlate`, `placePlate`, `plateTick`) is attached; `foeTick` (~L693) shows plates within 55 m.
4. **Guides** — cft-aim `scanTick` runs a rainbow guide toward it when it first comes within `D.TUNE.aim.guideR` (48 m);
   special figments (boss, champion, guardian, rare, outpost) always, ordinary ones when `guideCd` allows.

## 2. You swing: input to `F.attack`

- **Input** (cft-ui): F key (`onKey` ~L804, ignores key repeat) -> `G.attack()`; the 🖐️ `[data-bonk]` button; a left click
  on the canvas when the pointer is locked **and the sight is not up** (~L839-842). With the sight up (right mouse held),
  left click goes to `G.aim.fire(true)` instead (slot powers / web / slot-5 shooter, see cft-aim.md).
- **Entry** — `G.attack` (cft-game ~L2076) calls `F.attack()` only in state `'play'`.

`F.attack` (cft-fun ~L161-238), in order:

1. Refuse if `!alive`, `quiet()` (busy, overlay open, not playing), or `cool > 0` (the swing cooldown). Driving -> toast
   "Hop off your ride..." and `cool = 0.6`. Blocking -> no swing.
2. **Weapon** — `weapon()`: a worn loot weapon (`R.weapon()`, a fresh copy) beats the shop weapon `D.ITEMS[save.equip.weapon].weapon`,
   else bare hands `D.SLAP` (`dmg 0.5, reach 2.1`, plus `D.WEAPON_DEFAULTS.melee`). Then `R.modWeapon(w)`:
   `dmg = (dmg + add) x (1 + R.bonus('dmg'))`; crit chance `R.bonus('crit') + w.crit` -> `dmg x 2`, word "CRIT! ...".
3. **Aim assist** — if no figment is already "lined up" (within `reach + m.r`, in front by dot > 0.5, not flying > 2.6 m above
   you), turn to the nearest one within `reach + 2.6` and lunge up to 1.8 m toward it.
4. **Growth** — `dmg x D.calc.dmgMul(L)` (= `1 + D.TUNE.player.dmgPerLevel x (L - 1)`), `x H.dmgMul()` (1.5 in main
   character mode, `D.TUNE.hype.mainDmg`).
5. **Ranged branches** — `proj`/`shot` weapons in hand need ammo (`G.camp.useAmmo(w)`; out = `cool 0.45`, return). `proj` ->
   `G.chaos.fire(w)` (real projectiles; they later call `F.hitMonster` with `type: 'shot'`). A MEGA in reach -> `G.camp.meleeHit`.
6. **Flurry** — after a perfect dodge (`G.wild.flurryOn()`): `dmg x 1.6`, `reach + 1.2`, cooldown x 0.12, `G.wild.flurryHit()`.
7. **Cooldown** — `cool = w.cd` (0.42 default; 0.32 for `shot`). **Arc** — `w.arc` (160 default, cone 66; >= 300 = all
   round and no hit cap). `W.swing(reach + F.REACH_BODY, arc)` draws the crescent.
8. **Targets** — for each figment: skip if centre distance `> reach + m.r`, outside the arc (`dot < cos(arc/2)`, cone 0.55,
   always hit within 0.8 m), or flying (not for cones). Per target copy `hw`:
   - countered (`F.counter > G.rt.t`, i.e. within 3.5 s after a parry): `x CB.counter` (2.5), word COUNTER!, stun + 1;
   - else if the figment is recovering from its strike (`m.recover > 0`): `x CB.opening` (1.35), word OPENING!;
   - combo: `x (1 + CB.comboStep x min(10, F.combo))` (uses the combo count **before** this swing);
   - `hitMonster(m, hw, facing)`. Stop after `w.hits` (3) targets unless cone/spin.
9. **Combo bookkeeping** — if anything was hit: the counter is spent, `F.combo` = +1 if within `CB.comboT` (1.25 s) of the
   last hit else 1; `H.event('combo', {n})` from 3. Chasers in the arc are stunned. 20% chance a bystander says a
   `D.STATIC_LINES` line (they can't see figments).
10. **Nothing hit** — toys (`G.chaos.meleeHit`), a street prop (`smashProp`, `dmg x D.TUNE.smash.weaponMul`), a passer-by
    (`bonkPed`), or a parked car alarm.

**The reach you see** — `F.tick` feeds `W.reachMarker(F.reachInfo())` every frame: radius `reach + 0.6` (`F.REACH_BODY`
= an ordinary figment's radius), the weapon's arc, pink and pulsing (`hot`) when a figment is inside. Bigger figments can be
hit from further (their `m.r` is larger).

## 3. The hit lands: `hitMonster`

`hitMonster(m, w, f)` (cft-fun ~L356-400):

1. **Weakness** — `wk = F.weakMul(m, w.type || (proj/shot ? 'shot' : 'bonk'))` from `D.MONSTERS[kind].weak` (types in
   `D.DMG_TYPES`: bonk, shot, water, volt, fire, stomp; the `WEAK` table in cft-content ~L1926; missing = 1). `>= 1.2` pops
   WEAK!, `<= 0.85` pops RESISTS. `dmg x wk`.
2. `m.hp -= dmg`; `m.stun = max(m.stun, 0.5 + w.stun x (guardian ? 0.25 : 1))`; knockback `m.kx/kz = facing x knock x 2.2`;
   hurt flash; pops the word and the damage number **x10** (the game shows your hits and figment health x10; your own health
   and hits on you are raw).
3. **Death** (`hp <= 0`): `m.dead`; counters `bonks`, `bonk_<kind>` (+ `champions`, `boss`, via `freeStation` `guardians`);
   coins `round(rnd(def.coins) / 2 x (champ 1.6) x (guard 1.8))` as pickups (first one `cash` if `def.cash`); stolen money
   (`m.carry`) returned; **XP** `G.addXp(m.xpv, 'monster')` (cft-game `addXp` ~L250: `x G.xpMul() x R.xpMul('monster')` +
   rested XP; a level-up calls `R.onLevel`, `H.event('level')` and refills energy); cred +0.05 (0.5 boss/guardian); feed
   line; guardian -> `freeStation` (station joins your metro, `save.fun.cleared`, `G.visitMetro`, `R.drop('boss')`,
   `G.color.freed(pl, 'metro')`); King Blob gem + banner; 6% sticker otherwise; feats; monster titles;
   **loot** `R.onKill(m)` -> `drop('rare' | 'boss' | 'pigeon' | 'monster')`; colour blocks `G.color.onKill(m)`;
   **hype** `H.event('kill', {m})`; outposts `H.outpostKill(m)` if `m.outpost`; `removeMonster(m, true)`.

### Your damage in one line

```
hit on figment = (w.dmg + w.add) x (1 + R.bonus('dmg')) x (crit ? 2 : 1)
               x D.calc.dmgMul(L) x H.dmgMul() x (flurry ? 1.6 : 1)
               x (countered ? CB.counter : recovering ? CB.opening : 1)
               x (1 + CB.comboStep x min(10, combo))
               x weak[type]
```

Other sources: car runover `|speed| x 0.28 x dmgMul(L)` type bonk (`updateMonsters` ~L445, needs `> CB.runOver` m/s);
slot-5 shooters via `F.shoot` (modWeapon, dmgMul, `H.dmgMul`, ammo; no combo/counter/opening); cft-camp powers, cft-chaos
projectiles/splash/kicks, cft-wild arcs — all via `F.hitMonster` with their own `type`.

## 4. The figment fights back: wind-up, telegraph, strike

In `updateMonsters` (~L433-483), per figment each frame:

- Removed at sunrise if `nightBorn` (after 3 s), beyond 170 m, when an `event` lifetime ends, or a boss by day.
- Knockback slides it (`kx/kz` decay `exp(-6 dt)`).
- **Cancel** a wind-up (`m.wind = 0`, `removeTele`) when stunned, grabbing, you left `aggro + 3`, you are driving, or dying (~L452).
- Stunned -> spins; grabbing (`m.grab`, after a successful hit) -> backs off.
- Guardians/outposts beyond their `leash` walk home and heal 10%/s.
- **Chasing** when `d < (m.aggro || TM.aggro)` (17 m), you are not driving, not quiet, not dying, more than 14 m from home,
  and inside its leash: ranged kinds hand over to `G.chaos.rangedAI` (keep distance and shoot); otherwise
  - if `m.wind > 0` (winding up): stand, turn to you, `teleTick`, and at `wind <= 0` -> `strike(m)`;
  - else if `m.recover > 0` (after a strike): creep at 25% speed (**your hits are OPENINGS**, x1.35);
  - else walk to you while `d > m.r + CB.reach x 0.7`, and call `windUp(m)` once `d < m.r + CB.reach x 0.85` and the
    height difference is under 2.2 m.

`windUp(m)` (~L487): duration `rnd(CB.wind[0], CB.wind[1])` (0.55-1.05 s) `x 1.2` for bosses/guardians/rares `x 0.85`
for champions `x max(0.75, 1 - (m.lvl - L) x 0.04)` (higher-level figments wind up faster). Adds a red ❗ label (`m.tele`)
and a red ground ring (`m.ring`).

`teleTick(m)` (~L497): the ring shrinks from 2.1x to 1.0x of `m.r + CB.reach` and grows more opaque; it turns **gold** when
`m.wind <= F.parryWindow()` — the moment to press block for a parry. The ❗ pulses faster then; the figment swells slightly.
The world plays the model's attack animation (`m.obj.userData.act = 'wind'`).

`strike(m)` (~L513) returns `'none' | 'dodge' | 'parry' | 'break' | 'block' | 'lucky' | 'hit'`:

1. Remove the telegraph, `m.recover = CB.recover` (0.75 s), lunge.
2. You are dying / driving / in a menu -> `'none'`.
3. **Perfect dodge** (cft-wild): if you dodge-hopped within `D.TUNE.wild.dodgeWindow` before the strike and are within
   reach + 2.5 -> slow motion, figment stunned, a flurry of free hits (`G.wild.flurryOn`), swagger.
4. **Out of reach** (`d > m.r + CB.reach`) or more than 2.2 m above/below -> DODGED, counter `dodges`, `H.event('dodge')`.
5. **Blocking** (counter `blocks`):
   - **Perfect parry** when `G.rt.t - F.blockStart <= F.parryWindow()` (you *started* the block within the window before
     the strike; holding block from long before only blocks): no damage, `m.stun = 2.2`, recovery cancelled, big knockback,
     `F.counter = now + 3.5` (next hit x `CB.counter`), counter `parries`, `H.event('parry')`.
   - **Guard break**: chance `CB.guardBreak[0]` (0.22) for champions, guardians, bosses and rares, else `[1]` (0.06), skipped
     with `CFT_TEST.noLuck`: `F.hurt(atk x 0.7)` and `F.blockStart = now + 99` (no parry until you press block again).
   - **Block**: `F.hurt(atk x (1 - F.blockPower()))`, `H.event('block')`.
6. **Lucky dodge** chance `CB.luckyDodge + Fitness x 0.004 + R.bonus('speed') x 0.8` (skipped with `noLuck`) -> `'lucky'`.
7. **Hit** -> `touch(m)`: `m.grab` (1.6 s, guardians 1.1), grabbers steal `rnd(def.steal) x (1 - R.bonus('steal'))` coins
   into `m.carry` (returned when you pop it), `F.hurt(m.atk)`.

Block helpers: `F.blockPower() = clamp(CB.block + R.bonus('block') + weapon.block, 0.4, 0.92)`;
`F.parryWindow() = CB.parry + (R.bonus('block') + weapon.block) x 0.6` (shields add `block` through gear, cft-rpg).
Blocking (`F.setBlock`, G key or 🛡️; the right mouse aims since 2026-11-19) sets `W.blocking`: cft-world slows you to
45% and raises fists/shield. Ranged figment shots use the same block in cft-chaos `shotHitsPlayer` with a slightly wider
parry window (`F.parryWindow() + 0.15`); a parried shot flies back at the shooter.

## 5. You take damage, black out, come to

- `F.hurt(n, src)` (~L578): ignored when dying, after `destroy`, with `G.debugGod` (debug god mode), or during the campaign's
  immortal opening (`G.camp.immortal()` -> `G.camp.shrug(n)`). Else `dmg = max(1, n x 100 / (100 + F.armor()))`
  (same as `D.calc.armorCut`), `save.fun.hp` drops, red pop, `U.hurt()` red edge, shake, counter `hurt` (+dmg).
- `F.armor() = R.bonus('armor') + weapon.def` (the weapon's defence only on foot/ride).
- `F.maxHp() = D.calc.maxHp(L, Fitness, R.bonus('life') + H.hpBonus())` = `hpBase + L x hpPerLevel + Fitness x hpPerFit + extra`
  (`D.TUNE.player`: 60, 8, 3; liberated groceries add `D.OUTPOSTS.grocery.bonus` each, capped).
- **Regeneration** — `F.tick`: after `TM.regenDelay` (5 s) without damage, `heal(maxHp x TM.regen x dt)` (2.5%/s).
  Food heals 0.7 x its energy (cft-game `addEnergy`), sleep heals fully, Q / 🍵 = `F.quaff()`, liberated outposts heal fully.
- **Blacking out** — `die()` (~L606, async): `F.dying = true` (stops wind-ups, aiming, blocking, more damage); counter `deaths`;
  10% of pocket money goes into `save.fun.wallet` at the spot (amounts add up); figments within 120 m are removed, guardians
  reset to full HP at home; chasers end; `U.fade` then `G.travel` to the nearest station in `save.metro` or home; HP full;
  banner. `walletTick` puts a 👛 pickup there when you are within 350 m; picking it up calls `F.gotWallet()` (cft-game ~L1095).

## 6. Rewards and hype after the fight

- **XP and level**: see step 3; `D.TUNE.player.xpBase/xpExp` define levels (`D.calc.xpAt`, `levelOf`; no level cap).
- **Loot**: `R.onKill` -> `R.drop(source)` (cft-rpg; sources in `D.RPG.SOURCES`).
- **Hype** (`H.event`, cft-hero ~L128): `kill` = streak words (`D.HYPE.kills`, 4.5 s window), "HUGE!" for big ones, swagger
  `D.TUNE.hype.swag.kill` (5) or `bigKill` (14), cheering passers-by; `parry` +12, `dodge` +3, `block` +2, `combo` +2 with
  words at the counts in `D.HYPE.combo`. Swagger 100 -> **main character mode** for `mainSecs` (25 s): `H.dmgMul()` 1.5 (read
  in `F.attack` / `F.shoot`), `H.speedMul()` 1.25 (cft-game `speedMul`), golden light.
- **Colour blocks**: `G.color.onKill(m)` counts kills per 2 km block (nature layer).
- **Outposts**: the last pack member -> `liberate` (+5 max energy or health for good).

## 7. Worked example (default numbers, level 1, bare hands, Fitness 0, no gear)

- A sidewalk slime near home: level 1 (`max(1, 0)`), `gear = 1`, all scale multipliers 1 -> **hp 2** (shown as 20), **atk 5**.
- Your slap: `0.5 x dmgMul(1) = 0.5`, slime `weak.bonk = 0.8` -> 0.4 (shown "4", with RESISTS); combo adds 6% per chained
  hit -> about **5 slaps** at the 0.42 s cooldown.
- Your max HP: `60 + 8 = 68`; an unblocked hit takes 5, a block takes `5 x (1 - 0.6) = 2`, a parry 0 and the next slap
  hits x2.5.
- XP on the kill: `xpFor = 12` (x your XP multipliers); coins `rnd(3, 5) / 2` rounded.

## 8. Knobs (all editable live in Admin > Balance via `D.applyBalance`)

| Path | Default | Meaning |
|---|---|---|
| `TUNE.combat.wind` | [0.55, 1.05] | wind-up seconds |
| `TUNE.combat.reach` | 1.9 | strike reach beyond the figment's body |
| `TUNE.combat.recover` | 0.75 | opening window after a strike |
| `TUNE.combat.parry` | 0.3 | parry window (s) |
| `TUNE.combat.block` | 0.6 | share a block stops (clamped 0.4-0.92 with bonuses) |
| `TUNE.combat.counter` / `opening` | 2.5 / 1.35 | damage multipliers |
| `TUNE.combat.comboT` / `comboStep` | 1.25 / 0.06 | combo window, extra per hit (max 10) |
| `TUNE.combat.guardBreak` | [0.22, 0.06] | heavy / ordinary |
| `TUNE.combat.luckyDodge` | 0.05 | base slip chance |
| `TUNE.combat.runOver` | 7 | m/s to hit a figment with a car |
| `TUNE.monsters.*` | see cft-fun.md | spawn counts, aggro 17, levels every 400 m, scaling shares, regen, champion multipliers |
| `TUNE.player.hpBase/hpPerLevel/hpPerFit/dmgPerLevel/xpPerMonsterLevel/xpBase/xpExp` | 60/8/3/0.15/0.12/60/1.8 | your growth |
| `TUNE.bosses.guard*` / `rare*` | | guardian and rare figments |
| `TUNE.hype.swag.*`, `mainSecs/mainSpeed/mainDmg` | | swagger, main character mode |
| `MONSTERS.<kind>.hp/speed/atk/steal/coins/xp/w/size` | | per figment (15 base kinds ~L993 + spitter, tomato, gull, wifi ~L1550) |
| `MONSTERS.<kind>.weak.<type>` | 1 unless set | weaknesses |
| `ITEMS.<id>.weapon.dmg/reach/arc/cd/hits/knock/stun/add/crit/def/block` (+ `rate/ammo/pellets/splash/speed` for shooters) | `D.WEAPON_DEFAULTS` fills missing | every weapon |
| `SLAP.*` | dmg 0.5, reach 2.1 | bare hands |

## 9. Testing a combat change

| Change | Run |
|---|---|
| Numbers only (TUNE, MONSTERS, ITEMS) | `node tools/live/content_check.mjs`, `python tools/check.py`, then live-try in Admin > Balance (draft) |
| Wind-up / block / parry / dodge / smashing | `python -I tools/live/game_test.py --hero` |
| Spawning, health, death, guardians, gear | `python -I tools/live/game_test.py --combat` |
| Weapons, reach arc, weaknesses, slot 5 | `python -I tools/live/game_test.py --balance` (and `--aim`) |
| Ranged figments / your projectiles | `python -I tools/live/game_test.py --chaos` |
| Perfect dodge / flurry | `python -I tools/live/game_test.py --wild` |
| Name plates, weapon numbers | `python -I tools/live/game_test.py --color` |

Use `window.CFT_TEST = {norender: true, calm: true, noLuck: true, outposts: false}` in page scripts for deterministic
fights; `F.windUp(m)` then `F.strike(m)` (both exposed) test the defence branches directly. In the game, `?debug=1` ->
Fights -> "❗ One winding up" puts a winding-up figment 2.2 m in front of you; "🛡️ God mode" sets `G.debugGod`.

## 10. Invariants to keep when changing combat

- Every hit on a figment goes through `hitMonster` (directly or via `F.hitMonster`) and carries a `type`.
- Every hit on the player goes through `F.hurt` (armour, god mode, campaign immortality, black-out).
- Contact alone never hurts: damage only comes from `strike` (or ranged shots / camp hazards).
- The telegraph's gold moment and the parry check use the same `F.parryWindow()`.
- Chance-based outcomes respect `CFT_TEST.noLuck`; self-starting spawns respect `CFT_TEST.calm`.
- Optional modules (`G.rpg`, `G.hero`, `G.camp`, `G.chaos`, `G.wild`, `G.color`, `G.aim`) are always guarded.
- New formulas go into `D.calc`, new numbers into `D.TUNE` (they then appear in the Admin > Balance wiki).
- Framing stays kind: figments are "the Static", not a mockery of mental illness.

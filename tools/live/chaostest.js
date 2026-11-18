// The chaos update (2026-11-18), run inside the game page by tools/live/game_test.py (in the full run, or alone with
// --chaos): the decor layer, the mayhem meter + aura, ranged weapons (projectiles, splash, a boomerang), ranged and flying
// figments (their shots hurt, a block stops most, a perfect parry sends them back), the jetpack and the glide-brella,
// the fart button, the Dex (critters + brainrot), piñatas, beach balls, sewer launchers, whoopee cushions, a porta-potty,
// the six new street events, hit-stop and the Chaos phone app. Results in window.__chaosOut, done flag window.__chaosDone.
window.__chaosOut = []; window.__chaosDone = false;
(async () => {
  const out = window.__chaosOut, T0 = Date.now();
  const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m + '  [' + Math.round((Date.now() - T0) / 1000) + 's]');
  const info = m => out.push('INFO ' + m);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const G = window.__cft, W = G.W, U = G.ui, s = G.save, D = G.D, F = G.fun, C = G.chaos;
  const sim = n => G.stepSim(n);
  window.CFT_TEST = Object.assign(window.CFT_TEST || {}, { norender: true, calm: true, noLuck: true, outposts: false });
  async function drain() {
    for (let i = 0; i < 60; i++) {
      await sleep(70);
      const c = document.querySelector('.cft-choose'), d = document.querySelector('.cft-dlg');
      if (c) { c.querySelector('[data-k]').click(); continue; }
      if (d) { const o = d.querySelector('[data-k]:not(.lock)'); if (o) o.click(); else d.click(); continue; }
      if (!document.querySelector('.cft-ov')) { await sleep(120); if (!document.querySelector('.cft-ov')) return; }
    }
  }
  const pp = W.player.pos, c = k => s.counters[k] || 0;
  const fwd = () => ({ x: -Math.sin(W.player.face), z: -Math.cos(W.player.face) });
  const face = (x, z) => { W.player.face = W.player.heading = Math.atan2(-(x - pp.x), -(z - pp.z)); };
  const clear = () => { for (const m of F.monsters.slice()) F.removeMonster(m); for (const sh of C.shots.slice()) { W.scene.remove(sh.obj); } C.shots.length = 0; };
  const equipW = id => { s.owned[id] = true; s.equip.weapon = id; if (G.rpg) G.rpg.unequip('weapon'); };
  // close any popup (a level-up...) so F works, and face down an open street (no wall within 24 m)
  const ready = async () => { U.closeAll(); await drain(); G.rt.busy = false; W.controls.enabled = true; };
  const openDir = () => { let best = 0, bl = -1; for (let a = 0; a < 6.28; a += 0.2) { let L = 0; for (let d = 1; d < 26; d += 1) { if (W.heightAt(pp.x - Math.sin(a) * d, pp.z - Math.cos(a) * d)) break; L = d; } if (L > bl) { bl = L; best = a; } } W.player.face = W.player.heading = best; return bl; };
  const findNear = (fn, R0) => { for (let r = 2; r < (R0 || 160); r += 3) for (let a = 0; a < 6.28; a += 0.3) { const e = fn(pp.x + Math.cos(a) * r, pp.z + Math.sin(a) * r); if (e) return e; } return null; };
  try {
    ok(!!C, 'the chaos module is attached (G.chaos)');
    U.closeAll(); await drain(); G.rt.busy = false;
    for (const id of G.activeMissions()) G.abandon(id);
    if (!s.m['c1-couch'] || s.m['c1-couch'].s !== 'done') s.m['c1-couch'] = { s: 'done', done: 1 };
    s.clock = 12; s.happy = 60; W.controls.enabled = true; s.money = 5000;
    const home = G.homeSpot();
    const sp0 = W.randomWalkSpot(home.x, home.z, 150, 240) || { x: home.x + 180, z: home.z }; W.teleport(sp0.x, sp0.z); sim(40);
    G.setRide(null);

    // ---------- the decor layer: objects everywhere
    const nDecor = W.decorCount();
    ok(nDecor > 150, 'the decor layer filled the streets, parks and water: ' + nDecor + ' pieces in the loaded tiles');
    const gnome = findNear((x, z) => W.propNear(x, z, 3, { kind: 'gnome' })) || findNear((x, z) => { const e = W.propNear(x, z, 3); return e && ['planter', 'cones', 'flamingo', 'balloons', 'cart', 'sunflower', 'picnic', 'mushroom', 'cafe'].includes(e.k) ? e : null; });
    if (gnome) {
      const k0 = c('smash_' + gnome.k), r = F.smashProp(gnome, 99, { x: 1, z: 0 }, false);
      ok(r === 'smashed' && W.isSmashed(gnome.key) && c('smash_' + gnome.k) === k0 + 1, 'a decor ' + gnome.k + ' can be smashed (and is counted: smash_' + gnome.k + ')');
    } else info('no small decor piece found near the test spot');

    // ---------- the mayhem meter + aura
    C.bank(); const m0 = s.money, a0 = s.chaos.aura;
    for (let i = 0; i < 12; i++) C.add('smash');
    ok(C.mayhem().pts > 400 && 'BAS'.includes(C.mayhem().rank[0]), 'chained chaos climbs the mayhem ranks (' + C.mayhem().pts + ' pts, rank ' + C.mayhem().rank + ')');
    ok(!document.querySelector('.cft-mayhem').hidden, 'the mayhem meter shows on the HUD');
    C.bank();
    ok(s.money > m0 && C.mayhem().pts === 0, 'stopping cashes the meter in (+$' + (s.money - m0) + ')');
    C.aura(100); ok(s.chaos.aura === a0 + 100 + Math.round(0) || s.chaos.aura >= a0 + 100, 'aura goes up (' + s.chaos.aura + ')');

    // ---------- ranged weapons
    clear(); s.fun.hp = F.maxHp();
    equipW('w_balloon'); sim(20); await ready(); info('open street ahead: ' + openDir() + ' m');
    let f = fwd(), m = F.spawnMonster('brute', pp.x + f.x * 10, pp.z + f.z * 10, { event: 600, lvl: 1, aggro: 0.1 });
    m.stun = 30; let hp0 = m.hp, sh0 = c('shots');
    G.attack();
    ok(c('shots') === sh0 + 1 && C.shots.length >= 1 && C.shots[0].owner === 'you', 'F with a water balloon launcher fires a real projectile');
    for (let i = 0; i < 60 && m.hp === hp0 && F.monsters.includes(m); i++) sim(1);
    ok(m.hp < hp0, 'the water balloon arcs onto the figment 10 m away and splashes it (-' + Math.round((hp0 - m.hp) * 10) + ')');
    clear();
    equipW('w_confetti'); sim(15); await ready(); openDir();
    f = fwd(); m = F.spawnMonster('brute', pp.x + f.x * 7, pp.z + f.z * 7, { event: 600, lvl: 1, aggro: 0.1 }); m.stun = 30; hp0 = m.hp;
    G.attack(); const pellets = C.shots.length;
    for (let i = 0; i < 40 && C.shots.length; i++) sim(1);
    ok(pellets >= 5 && m.hp < hp0, 'the confetti cannon fires a spread of ' + pellets + ' pellets');
    clear();
    equipW('w_boomerang'); sim(30); await ready(); openDir();
    G.attack(); const boom = C.shots[0] || {};
    let turned = false; for (let i = 0; i < 150 && C.shots.includes(boom); i++) { sim(1); if (boom.turned) turned = true; }
    ok(turned && !C.shots.includes(boom), 'the banana boomerang flies out, turns and comes back');
    clear();
    equipW('w_mustard'); s.xp = Math.max(s.xp, 2000); sim(40); await ready(); openDir();
    f = fwd(); const m1 = F.spawnMonster('brute', pp.x + f.x * 12, pp.z + f.z * 12, { event: 600, lvl: 1, aggro: 0.1 }), m2 = F.spawnMonster('brute', pp.x + f.x * 16, pp.z + f.z * 16, { event: 600, lvl: 1, aggro: 0.1 });
    m1.stun = m2.stun = 30; const h1 = m1.hp, h2 = m2.hp; face(m1.x, m1.z);
    G.attack(); for (let i = 0; i < 30 && C.shots.length; i++) sim(1);
    ok(m1.hp < h1 && m2.hp < h2, 'the mustard sniper pierces through two figments in a line');
    clear();

    // ---------- ranged figments: their shots, a block, a perfect parry (RETURN TO SENDER)
    s.fun.hp = F.maxHp(); delete s.equip.weapon; await ready(); openDir();
    f = fwd(); m = F.spawnMonster('tomato', pp.x + f.x * 11, pp.z + f.z * 11, { event: 600, lvl: 1 });
    ok(m.aggro > 17, 'a shooter notices you from further away (' + m.aggro + ' m)');
    m.rcd = 0;
    let shot = null; for (let i = 0; i < 90 && !shot; i++) { sim(1); shot = C.shots.find(q => q.owner === 'foe'); }
    ok(!!shot, 'the Tomato tosser aims (🎯) and throws');
    hp0 = F.hp(); for (let i = 0; i < 90 && C.shots.includes(shot); i++) { W.player.vel.set(0, 0, 0); sim(1); }
    ok(F.hp() < hp0, 'standing still, the tomato hits you (-' + (hp0 - F.hp()).toFixed(1) + ' health)');
    F.removeMonster(m);
    const mkShot = (src, sp) => { const d = { x: pp.x - src.x, z: pp.z - src.z }, L = Math.hypot(d.x, d.z) || 1; return C.shots[C.shots.push(Object.assign({}, C.shots[0] || {})) - 1]; };
    m = F.spawnMonster('spitter', pp.x + f.x * 8, pp.z + f.z * 8, { event: 600, lvl: 1 }); m.stun = 30;
    // a spit ball flying straight at you; block right as it lands
    const fire = () => { m.rcd = 0; m.aim = 0; m.stun = 0; let q = null; for (let i = 0; i < 90 && !q; i++) { sim(1); q = C.shots.find(z => z.owner === 'foe'); } m.stun = 30; return q; };
    shot = fire();
    if (shot) {
      const rf0 = c('reflects'); hp0 = F.hp();
      for (let i = 0; i < 90 && C.shots.includes(shot) && shot.owner === 'foe'; i++) { const d = Math.hypot(shot.obj.position.x - pp.x, shot.obj.position.z - pp.z); if (d < 4 && !F.blocking) { F.setBlock(true); F.blockStart = G.rt.t; } W.player.vel.set(0, 0, 0); sim(1); }
      ok(c('reflects') === rf0 + 1 && shot.owner === 'you' && F.hp() === hp0, 'block right as a shot lands = PERFECT PARRY: it flies back at the spitter (no damage)');
      const mh = m.hp; for (let i = 0; i < 60 && C.shots.includes(shot); i++) sim(1);
      ok(m.hp < mh, '...and bonks the one who threw it');
      F.setBlock(false);
    } else ok(false, 'the spitter never fired');
    clear();

    // ---------- flying figments
    await ready(); openDir();
    f = fwd(); m = F.spawnMonster('gull', pp.x + f.x * 6, pp.z + f.z * 6, { event: 600, lvl: 1 });
    sim(30);
    const alt = m.obj.position.y - W.groundAt(m.x, m.z);
    ok(alt > 2.8, 'a Seagull sniper flies above the street (' + alt.toFixed(1) + ' m up)');
    m.swoop = 0; m.swoopCd = 99; m.alt = m.def.fly; m.obj.position.y = W.groundAt(m.x, m.z) + m.def.fly; m.x = pp.x + fwd().x * 1.5; m.z = pp.z + fwd().z * 1.5; m.stun = 5;
    hp0 = m.hp; G.attack();
    ok(m.hp === hp0, 'bare hands can\'t reach it up there');
    equipW('w_straw'); sim(15); await ready(); m.stun = 5; face(m.x, m.z); G.attack(); for (let i = 0; i < 40 && C.shots.length; i++) sim(1);
    ok(m.hp < hp0, 'a spitball straw can');
    clear();

    // ---------- flying: the Bean jetpack and the Glide-brella
    s.owned.jetpack = true; G.wearShop('jetpack'); sim(2);
    ok(s.equip.back === 'jetpack' && !document.querySelector('.cft-fuel').hidden, 'the Bean jetpack goes on your back (fuel gauge on the HUD)');
    const g0 = pp.y, air0 = c('airtime');
    W.input.jump = true; W.input.hold = true;
    for (let i = 0; i < 75; i++) sim(1);
    const up = pp.y - g0;
    ok(up > 6 && C.fuel() < 0.95, 'holding Space in the air: it flies (' + up.toFixed(1) + ' m up, fuel ' + Math.round(C.fuel() * 100) + '%)');
    ok(c('airtime') > air0, 'flying time counts (' + (c('airtime') - air0) + ' s)');
    W.input.hold = false; for (let i = 0; i < 150 && !W.player.grounded; i++) sim(1);
    s.owned.glidebrella = true; G.wearShop('glidebrella'); sim(2);
    pp.y += 30; W.player.grounded = false; W.player.vy = 0; W.input.hold = true;
    let maxFall = 0; for (let i = 0; i < 40; i++) { sim(1); maxFall = Math.max(maxFall, -W.player.vy); }
    ok(maxFall < 4 && C.flying() === 'glide', 'the glide-brella turns a fall into a float (' + maxFall.toFixed(1) + ' m/s down)');
    W.input.hold = false; for (let i = 0; i < 200 && !W.player.grounded; i++) sim(1);
    delete s.equip.back; sim(2);

    // ---------- the fart button
    const fa0 = c('farts'); C.fart();
    ok(c('farts') === fa0 + 1, 'B toots (and the street reacts)');

    // ---------- the Dex: critters and brainrot
    f = fwd();
    const rot = C.spawnRot('sharkini', pp.x + f.x * 5, pp.z + f.z * 5);
    sim(2);
    let it = C.interaction(pp);
    ok(!!it && /Snap/.test(it.t), 'a brainrot creature nearby: E offers a photo ("' + (it && it.t) + '")');
    const mon0 = s.money; if (it) it.fn(); await drain();
    ok(c('dex') >= 1 && s.chaos.dex.sharkini === 1 && s.money > mon0, 'snapping it fills the Dex (' + c('dex') + ') and pays');
    const crit = C.spawnCritter('capybara', pp.x + 2, pp.z); sim(2);
    it = C.interaction(pp);
    ok(!!it && /capybara/i.test(it.t), 'animal neighbours can be snapped too');
    if (it) { it.fn(); await drain(); }
    ok(c('dex') >= 2, 'the Dex counts different creatures (' + c('dex') + ' of ' + C.DEX.length + ')');

    // ---------- toys: a piñata, a beach ball, a sewer launcher, a whoopee cushion
    delete s.equip.weapon; clear(); sim(15);
    f = fwd();
    const pin = C.spawnPinata(pp.x + f.x * 3, pp.z + f.z * 3);
    W.teleport(pin.x - f.x * 1.5, pin.z - f.z * 1.5); face(pin.x, pin.z);
    const pn0 = c('pinatas');
    for (let i = 0; i < 4 && C.pinatas.includes(pin); i++) { G.attack(); sim(16); }
    ok(c('pinatas') === pn0 + 1 && !C.pinatas.includes(pin), 'three whacks pop a piñata (candy and coins fly)');
    f = fwd(); const ball = C.spawnBall(pp.x + f.x * 2.2, pp.z + f.z * 2.2); sim(5);
    G.attack(); sim(3);
    ok(Math.hypot(ball.vx, ball.vz) > 5, 'F kicks a giant beach ball (' + Math.hypot(ball.vx, ball.vz).toFixed(1) + ' m/s)');
    const hole = C.spawnHole(pp.x + 5, pp.z), la0 = c('launches'); sim(2);
    W.teleport(hole.x, hole.z); W.player.grounded = true; sim(3);
    ok(c('launches') === la0 + 1 && W.player.vy > 5, 'stepping on a manhole: THE SEWER BURPED (launched)');
    for (let i = 0; i < 200 && !W.player.grounded; i++) sim(1);
    const cu = C.spawnCushion(pp.x + 3, pp.z), cu0 = c('cushions'); W.teleport(cu.x, cu.z); W.player.grounded = true; sim(3);
    ok(c('cushions') === cu0 + 1, 'stepping on a whoopee cushion: BRAAAP');

    // ---------- a porta-potty
    const potty = findNear((x, z) => W.propNear(x, z, 3, { kind: 'potty' }), 260);
    if (potty) {
      W.teleport(potty.x + 1.2, potty.z); sim(2);
      it = C.interaction(pp);
      ok(!!it && /porta-potty/.test(it.t), 'next to a porta-potty, E offers to hide in it');
      const hd0 = c('hides'); if (it) it.fn(); for (let i = 0; i < 160; i++) sim(1);
      ok(c('hides') === hd0 + 1 && W.avatar.scale.x === 1, 'hiding ends in a stink bomb, you come back out');
    } else info('no porta-potty in reach of the test spot');

    // ---------- hit-stop on a kill
    clear(); G.rt.hitstop = 0; f = fwd();
    m = F.spawnMonster('slime', pp.x + f.x * 1.5, pp.z + f.z * 1.5, { event: 600, lvl: 1, hp: 0.1 }); face(m.x, m.z); G.attack();
    ok(G.rt.hitstop > 0, 'a kill freezes the action for a blink (hit-stop ' + G.rt.hitstop.toFixed(2) + ' s)');
    G.rt.hitstop = 0;

    // ---------- the six new street events
    window.CFT_TEST.calm = false;
    for (const id of ['ohio', 'glitch', 'catsdogs', 'cheese', 'sixseven', 'balloons']) {
      if (F.event) { F.event.t = 1e9; sim(2); }
      const started = F.startEvent(id);
      if (!started) { info(id + ': could not start here (needs people nearby)'); continue; }
      if (id === 'ohio') ok(W.gravMul < 0.5, 'Only in Ohio: gravity drops (' + W.gravMul + ')');
      sim(60);
      if (id === 'sixseven') { const j = C.interaction(pp); if (j && /six-seven/.test(j.t)) { const s67 = c('sixseven'); j.fn(); ok(c('sixseven') === s67 + 1, 'SIX SEVEN: E joins the crew'); } }
      if (id === 'balloons') { const b = C.ev && C.ev.balloons && C.ev.balloons.find(q => !q.dead); if (b) { W.teleport(b.x, b.z); b.y = W.groundAt(b.x, b.z) + 1.5; sim(1); const p0 = c('popped'); G.attack(); ok(c('popped') === p0 + 1, 'balloons can be popped for coins'); } }
      F.event.t = 1e9; sim(3);
      ok(!F.event && W.gravMul === 1 && !document.querySelector('.cft-glitch'), 'street event "' + id + '" runs and cleans up after itself');
    }
    window.CFT_TEST.calm = true;

    // ---------- the world keeps going: critters, brainrot, toys, the sky (with calm off for a moment)
    window.CFT_TEST.calm = false; for (let i = 0; i < 240; i++) sim(1); window.CFT_TEST.calm = true;
    ok(C.critters.length > 0 && C.sky.length > 0 && (C.balls.length + C.pinatas.length + C.holes.length + C.cushions.length + C.tubes.length) > 2, 'left alone, the city fills up: ' + C.critters.length + ' critters, ' + C.sky.length + ' things in the sky, ' + C.tubes.length + ' tube men, ' + C.pinatas.length + ' piñatas, ' + C.balls.length + ' balls');

    // ---------- the phone app and the missions
    U.phone('chaos'); await sleep(200);
    const body = document.querySelector('[data-pbody]');
    ok(!!body && /The Dex/.test(body.textContent) && /aura/.test(body.textContent), 'the phone has a Chaos app: aura, the Dex, ranged weapons, flying');
    U.closeAll(); await drain();
    ok(['s-pew', 's-brainrot', 's-brainrot2', 's-beans', 's-unhinged'].every(id => G.MISSION[id]), 'five new missions (Pew Pew Diplomacy, Brainrot Researcher, The Brainrot Thesis, Beans of Glory, Absolutely Unhinged)');
    info('decor pieces in loaded tiles: ' + W.decorCount());
  } catch (e) {
    out.push('FAIL exception: ' + (e && e.stack || e));
  }
  window.CFT_TEST.calm = true;
  window.__chaosDone = true;
})();

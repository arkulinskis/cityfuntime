// Combat (Diablo-style), run inside the game page by tools/live/game_test.py (last in the full run, or alone with --combat):
// 15 monster types with city names, monster levels, champions, health and armour, healing, the foe bar, blacking out and
// the dropped wallet, metro guardians and freeing a station, loot gear you can see on yourself, the Static mission.
// Results in window.__cmbOut, done flag window.__cmbDone.
window.__cmbOut = []; window.__cmbDone = false;
(async () => {
  const out = window.__cmbOut, T0 = Date.now();
  const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m + '  [' + Math.round((Date.now() - T0) / 1000) + 's]');
  const info = m => out.push('INFO ' + m);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const G = window.__cft, W = G.W, U = G.ui, s = G.save, D = G.D, F = G.fun, R = G.rpg;
  const sim = n => G.stepSim(n);
  const T = window.CFT_TEST = Object.assign(window.CFT_TEST || {}, { norender: true, calm: true });
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
  const face = (x, z) => { W.player.face = W.player.heading = Math.atan2(-(x - pp.x), -(z - pp.z)); };
  // what E would do at the stairs, with any mission character standing there set aside (people come first)
  const stairs = () => { const keep = new Map(G.rt.actors); G.rt.actors.clear(); G.rt.actorTimer = 99; const it = G.peek(); for (const [k, v] of keep) G.rt.actors.set(k, v); G.rt.actorTimer = 0; return it; };
  const clear = () => { for (const m of F.monsters.slice()) { m.t = 1e9; m.event = 1; } sim(3); };
  try {
    U.closeAll(); await drain(); G.rt.busy = false;
    for (const id of G.activeMissions()) G.abandon(id);
    if (!s.m['c1-couch'] || s.m['c1-couch'].s !== 'done') s.m['c1-couch'] = { s: 'done', done: 1 };
    s.clock = 12; s.happy = 60; W.controls.enabled = true;
    const home = G.homeSpot();
    const out1 = W.randomWalkSpot(home.x, home.z, 160, 260) || { x: home.x + 200, z: home.z }; W.teleport(out1.x, out1.z); sim(40);

    // ---------- 15 monster types, named after your city
    const kinds = Object.keys(D.MONSTERS);
    ok(kinds.length >= 15, kinds.length + ' monster types: ' + kinds.join(', '));
    let built = 0;
    for (const k of kinds) { const m = F.spawnMonster(k, pp.x + 6, pp.z + 6, { event: 5 }); let meshes = 0; m.obj.traverse(o => { if (o.isMesh) meshes++; }); if (meshes) built++; m.t = 99; }
    sim(3);
    ok(built === kinds.length, 'every type has its own 3D model');
    const mtl = { lat: 45.524, lon: -73.581 }, tok = { lat: 35.68, lon: 139.76 }, nowhere = { lat: 61.2, lon: 10.4 }, saved = Object.assign({}, s.home);
    Object.assign(s.home, mtl); const n1 = F.localName('rat'), c1 = F.cityName();
    Object.assign(s.home, tok); const n2 = F.localName('rat'), c2 = F.cityName();
    Object.assign(s.home, nowhere); const n3 = F.localName('rat');
    Object.assign(s.home, saved);
    ok(n1 !== n2 && D.MONSTER_LOCAL.rat.includes(n3), 'same rat, different names: ' + c1 + ' "' + n1 + '", ' + c2 + ' "' + n2 + '", elsewhere "' + n3 + '"');
    const sm = F.spawnMonster('slime', pp.x + 5, pp.z, { event: 30 });
    ok(sm.def.n === F.localName('slime'), 'spawned monsters carry the local name: ' + sm.def.n);
    sm.t = 99; sim(2);

    // ---------- levels and champions
    const near = F.monsterLevel(home.x + 5, home.z), far = F.monsterLevel(home.x + 2000, home.z);
    ok(far > near, 'monsters get tougher the further you roam: level ' + near + ' at home, ' + far + ' two km out (you are ' + G.level() + ')');
    const nm = F.spawnMonster('bin', pp.x + 6, pp.z, { event: 30, lvl: 5 }), ch = F.spawnMonster('bin', pp.x + 6, pp.z + 2, { event: 30, lvl: 5, champ: true });
    ok(Math.abs(ch.mhp - nm.mhp * 2.5) < 0.01 && ch.atk > nm.atk, 'a champion has 2.5x the health and hits harder');
    nm.t = ch.t = 99; sim(2);

    // ---------- health, armour, healing
    ok(!!document.querySelector('[data-hpbar]') && F.maxHp() > 60, 'a health bar: ' + Math.round(F.hp()) + ' / ' + F.maxHp());
    s.fun.hp = F.maxHp(); s.rpg.eq.body = null; s.rpg.eq.head = null; R.mark();
    const d0 = F.hurt(20);
    const armour = R.add(R.makeGear(4, 20, 'body', {}), 'test'); R.equip(armour.id); R.mark();
    const d1 = F.hurt(20);
    ok(F.armor() > 0 && d1 < d0, 'armour softens hits: ' + d0.toFixed(1) + ' without, ' + d1.toFixed(1) + ' with ' + F.armor() + ' armour');
    const h0 = F.hp(); sim(330);
    ok(F.hp() > h0, 'catching your breath: health comes back after a few seconds out of a fight (' + Math.round(h0) + ' -> ' + Math.round(F.hp()) + ')');
    s.fun.hp = 20; s.bag.tea = 1;
    const h1 = F.hp(); F.quaff();
    ok(F.hp() >= h1 + 39 && !s.bag.tea, 'Q drinks a calm tea: +' + Math.round(F.hp() - h1));
    s.fun.hp = F.maxHp();

    // ---------- monsters hit you; the foe bar
    T.calm = true;
    const br = F.spawnMonster('brute', pp.x + 2, pp.z, { event: 60, aggro: 30 });
    const hb = F.hp();
    for (let i = 0; i < 150 && F.hp() >= hb; i++) sim(2);
    ok(F.hp() < hb, 'a ' + br.def.n + ' walked up and hit you (' + Math.round(hb) + ' -> ' + Math.round(F.hp()) + ')');
    W.teleport(br.x + 1.5, br.z); face(br.x, br.z); G.attack(); sim(6);
    const foe = document.querySelector('[data-foe]');
    ok(foe && !foe.hidden && foe.textContent.includes(br.def.n), 'the foe bar shows what you are fighting: "' + (foe && foe.textContent) + '"');
    br.t = 1e9; br.event = 1; s.fun.hp = F.maxHp(); sim(10);

    // ---------- day monsters (not close to home)
    clear(); T.calm = false; s.clock = 13; s.happy = 50;
    const away = W.randomWalkSpot(home.x, home.z, 250, 450) || { x: home.x + 300, z: home.z }; W.teleport(away.x, away.z);
    for (let i = 0; i < 20 && !F.monsters.length; i++) sim(30);
    const dayK = F.monsters.map(m => m.kind);
    ok(F.monsters.length > 0 && !dayK.some(k => D.MONSTERS[k].night), 'figments by day too, away from home: ' + dayK.join(', '));
    T.calm = true; clear(); s.fun.hp = F.maxHp();

    // ---------- metro guardians
    const metro = W.places.filter(q => q.kind === 'metro' && !q.virtual && !F.metroOpen(q)).sort((a, b) => Math.hypot(a.pin.x - pp.x, a.pin.z - pp.z) - Math.hypot(b.pin.x - pp.x, b.pin.z - pp.z))[0];
    ok(!!metro, 'a metro entrance nearby: ' + (metro && metro.name));
    let station = null;
    if (metro) {
      W.teleport(metro.pin.x + 45, metro.pin.z); sim(10);
      const w = W.nearestWalk(metro.pin.x + 45, metro.pin.z, 40); if (w) W.teleport(w.x, w.z);
      const guardOf = () => [...F.guards.values()].find(q => Math.hypot(q.home.x - metro.pin.x, q.home.z - metro.pin.z) < 90);  // one per station, any entrance
      T.calm = false; for (let i = 0; i < 20 && !guardOf(); i++) sim(15); T.calm = true;
      const g = guardOf();
      ok(!!g && g.obj.userData.size >= 2.3 && g.mhp > D.MONSTERS[g.kind].hp * 8, 'a guardian stands at the station: ' + (g && g.def.n) + ' (level ' + (g && g.lvl) + ', ' + (g && Math.round(g.mhp * 10)) + ' health)');
      W.teleport(metro.pin.x + 0.5, metro.pin.z + 0.5); sim(2);
      const pk = stairs();
      ok(!!pk && /guardian/.test(pk.t), 'the stairs are blocked while it stands: "' + (pk && pk.t) + '"');
      if (g) {
        g.hp = 0.05; W.teleport(g.x + 2, g.z); face(g.x, g.z);
        for (let i = 0; i < 10 && !g.dead; i++) { W.teleport(g.x + 2, g.z); face(g.x, g.z); G.attack(); sim(14); }
        await sleep(100);
        ok(g.dead && F.metroOpen(metro) && s.metro.some(m => Math.hypot(G.xz(m).x - metro.pin.x, G.xz(m).z - metro.pin.z) < 90), 'beaten: the station (every entrance) is free and on your metro map');
        W.teleport(metro.pin.x, metro.pin.z); sim(3);
        const pk2 = stairs();
        ok(!!pk2 && /Ride the metro/.test(pk2.t), 'now the stairs say: "' + (pk2 && pk2.t) + '"');
        station = metro;
      }
    }

    // ---------- blacking out, coming to, the wallet
    clear();
    if (station) { const q = W.randomWalkSpot(station.pin.x, station.pin.z, 60, 120) || { x: station.pin.x + 80, z: station.pin.z }; W.teleport(q.x, q.z); sim(5); }
    s.money = 200; s.fun.wallet = null;
    const fell = { x: pp.x, z: pp.z }, deaths = c('deaths');
    s.fun.hp = 1; F.hurt(999);
    for (let i = 0; i < 300 && F.dying; i++) await sleep(100);
    await drain();
    const st = station ? G.xz(s.metro.find(m => Math.hypot(G.xz(m).x - station.pin.x, G.xz(m).z - station.pin.z) < 90)) : home;
    ok(c('deaths') === deaths + 1 && !F.dying && F.hp() === F.maxHp(), 'blacked out, came to with full health');
    ok(Math.hypot(pp.x - st.x, pp.z - st.z) < Math.hypot(pp.x - home.x, pp.z - home.z) + 1 && Math.hypot(pp.x - st.x, pp.z - st.z) < 60, 'came to at the nearest freed station (' + Math.round(Math.hypot(pp.x - st.x, pp.z - st.z)) + ' m away)');
    ok(s.fun.wallet && s.fun.wallet.amount === 20, 'the wallet (10% of $200: $20) stays where you fell');
    const m1 = s.money;
    const look0 = W.randomWalkSpot(fell.x, fell.z, 12, 30) || { x: fell.x + 15, z: fell.z }; W.teleport(look0.x, look0.z); sim(40);
    const wp = G.rt.pickups.find(k => k.type === 'wallet' && !k.dead);
    ok(!!wp, 'it shows up on the street when you come back (👛 on the map)');
    if (wp) { W.teleport(wp.x, wp.z); sim(4); ok(s.money >= m1 + 20 && !s.fun.wallet, 'picked it up: $20 back'); }

    // ---------- gear you can see
    s.rpg.eq.head = null; s.rpg.eq.feet = null; R.mark();
    const hat = R.add(R.makeGear(3, 12, 'head', { base: 'cap' }), 'test'); R.equip(hat.id);
    const shoes = R.add(R.makeGear(2, 12, 'feet', { base: 'boots' }), 'test'); R.equip(shoes.id);
    const look = G.playerLook();
    ok((look.hat === hat.col || look.crown) && look.shoe === shoes.col && look.shirt === armour.col, 'your loot shows on you: a ' + hat.n + ', a ' + armour.n + ', ' + shoes.n);
    ok(R.bonus('armor') >= hat.ar + shoes.ar + armour.ar - 0.01 && R.bonus('speed') > 0, 'gear adds armour (' + Math.round(R.bonus('armor')) + ') and speed');
    const wpn = R.add(R.makeGear(4, 12, 'weapon', { base: 'w_noodle' }), 'test'); R.equip(wpn.id); sim(35);
    ok(!s.equip.weapon && R.weapon() && R.weapon().mesh === 'noodle' && F.summary().weapon.n === wpn.n, 'a loot weapon in your hand: ' + wpn.n + ' (bonk ' + Math.round(wpn.dmg * 10) + ')');
    const shopW = ['w_baguette', 'w_chicken', 'w_pillow', 'w_noodle', 'w_fish', 'w_plunger'].find(k => !s.owned[k]);
    s.money += 200;
    if (shopW) G.buy(shopW); else { s.equip.weapon = 'w_baguette'; R.unequip('weapon'); }
    sim(35);
    ok(s.equip.weapon === (shopW || 'w_baguette') && !R.weapon(), 'picking a shop weapon swaps it in (one weapon at a time): ' + (shopW || 'w_baguette'));
    U.phone('hero'); await sleep(150);
    const body = document.querySelector('[data-pbody]');
    ok(body && /What you wear/.test(body.textContent) && /Head/.test(body.textContent) && /armour/.test(body.textContent), 'the Character app lists weapon, head, body, feet and charms with your health and armour');
    U.closeAll();

    // ---------- the Static
    sim(70);
    ok(!!D.MISSIONS.find(m => m.id === 's-static') && !!s.m['s-static'], 'Max\'s mission "The Static" is in the story');
  } catch (e) { out.push('EXCEPTION ' + (e && e.stack || e)); }
  window.CFT_TEST.norender = false; window.CFT_TEST.calm = false;
  window.__cmbDone = true;
})();
true

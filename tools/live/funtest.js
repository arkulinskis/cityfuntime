// Street-life test (the wacky update), run inside the game page by tools/live/game_test.py after gametest.js, or alone
// with --fun. Made-up shops and their signs, traffic lights, street furniture, more people and cars, speed and the
// double jump, monsters and weapons, jokes and flirting, sweethearts, street folk and the crown, pranks and the owner's
// chase, rival shopkeepers, banana peels and trampolines, street events, the new missions and the phone app.
// Results in window.__funOut, done flag window.__funDone.
window.__funOut = []; window.__funDone = false;
(async () => {
  const out = window.__funOut, T0 = Date.now();
  const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m + '  [' + Math.round((Date.now() - T0) / 1000) + 's]');
  const info = m => out.push('INFO ' + m);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const G = window.__cft, W = G.W, U = G.ui, s = G.save, D = G.D, F = G.fun;
  const sim = n => G.stepSim(n);
  const T = window.CFT_TEST = Object.assign(window.CFT_TEST || {}, { autoplay: true, norender: true, calm: true });
  async function drain(choose) {
    for (let i = 0; i < 60; i++) {
      await sleep(70);
      const a = document.querySelector('.cft-askf'), c = document.querySelector('.cft-choose'), d = document.querySelector('.cft-dlg');
      if (a) { a.querySelector('button[type=submit]').click(); continue; }
      if (c) { const opts = [...c.querySelectorAll('[data-k]')]; const pick = choose ? opts.find(o => choose.test(o.textContent)) : null; (pick || opts[0]).click(); continue; }
      if (d) { const o = d.querySelector('[data-k]:not(.lock)'); if (o) o.click(); else d.click(); continue; }
      if (!document.querySelector('.cft-ov')) { await sleep(120); if (!document.querySelector('.cft-ov')) return; }
    }
  }
  const go = (x, z) => { W.teleport(x, z); sim(3); };
  const pp = W.player.pos;
  const c = k => s.counters[k] || 0;
  const face = (x, z) => { W.player.face = W.player.heading = Math.atan2(-(x - pp.x), -(z - pp.z)); };
  const rand = Math.random;
  const hands = () => { W.controls.enabled = true; };  // the page's own frames can lag far behind in software rendering
  try {
    U.closeAll(); await sleep(100); hands();
    ok(!!F, 'street life is attached to the game (G.fun)');
    if (!s.m['c1-couch'] || s.m['c1-couch'].s !== 'done') s.m['c1-couch'] = { s: 'done', done: 1 };  // street life starts after the first mission
    for (const id of G.activeMissions()) G.abandon(id);   // after gametest.js: no mission dialogs popping up in the middle of this
    await drain(); G.rt.busy = false;
    s.clock = 10; s.money = Math.max(s.money, 500);
    W.teleport(0, 0); const h0 = W.nearestWalk(0, 0, 200); if (h0) go(h0.x, h0.z);
    sim(60);

    // ---------- the city: made-up shops, signs, lights, furniture, life
    const made = W.places.filter(p => p.made), real = W.places.filter(p => !p.made);
    ok(made.length >= 20, 'made-up shops fill the streets: ' + made.length + ' (next to ' + real.length + ' real places)');
    ok(made.every(p => D.KINDS[p.kind] && p.name && p.virtual), 'every made-up shop has a kind and a name, e.g. ' + made.slice(0, 4).map(p => D.KINDS[p.kind].e + ' ' + p.name).join(', '));
    ok(!made.some(p => real.some(r => Math.hypot(r.x - p.x, r.z - p.z) < 15)), 'no made-up shop sits on top of a real place');
    const kinds = new Set(made.map(p => p.kind));
    ok(kinds.size >= 10, 'they are of many kinds: ' + kinds.size);
    sim(300);
    ok(W.signs().size >= 5, 'places near you carry signs: ' + W.signs().size);
    const nearPl = G.allPlaces().filter(p => Math.hypot(p.pin.x - pp.x, p.pin.z - pp.z) < 120);
    ok(nearPl.filter(p => W.signs().has(p.id)).length >= Math.min(nearPl.length, 60) * 0.7, 'most places within 120 m have their sign up (' + nearPl.filter(p => W.signs().has(p.id)).length + ' of ' + nearPl.length + ')');
    const sig = W.signals();
    ok(sig.length > 0, 'traffic lights stand at the bigger corners: ' + sig.length);
    if (sig.length) {
      const n = sig.slice().sort((a, b) => Math.hypot(a.x - pp.x, a.z - pp.z) - Math.hypot(b.x - pp.x, b.z - pp.z))[0];
      const seen = new Set();
      for (let i = 0; i < 20; i++) { sim(30); seen.add(W.signalState(n, 0) + '' + W.signalState(n, 1)); }
      ok(seen.size >= 3 && ![...seen].some(k => k === '22'), 'a light cycles through its colours and never shows green both ways: ' + [...seen].join(' '));
      go(n.x + 6, n.z + 6); sim(40);
      ok(!!n.sig.obj, 'the nearest corner has its poles, lamps and zebra crossings in 3D (' + n.ends.length + ' roads meet)');
    }
    let lamps = 0, parked = 0, benches = 0, pc = null;
    for (const sub of W.subs()) if (sub.props) { lamps += sub.props.lamp.length / 3; benches += sub.props.bench.length / 3; parked += (sub.props.car.length + sub.props.van.length) / 4; if (!pc && sub.props.car.length) pc = { x: sub.props.car[0], z: sub.props.car[1] }; }
    ok(lamps > 30 && parked > 10 && benches > 3, 'street furniture: ' + lamps + ' lamps, ' + benches + ' benches, ' + parked + ' parked cars');
    ok(!!pc && !!W.carAt(pc.x, pc.z, 0), 'a parked car is solid where it stands');
    const hb = go; void hb;
    W.teleport(h0 ? h0.x : 0, h0 ? h0.z : 0); T.calm = true; sim(450);
    ok(W.life.peds.length >= 22 && W.life.cars.length >= 8, 'busier streets: ' + W.life.peds.length + ' people, ' + W.life.cars.length + ' vehicles (' + [...new Set(W.life.cars.map(q => q.kind))].join(', ') + ')');
    ok(new Set(W.life.peds.map(q => q.type)).size >= 3, 'people come in kinds: ' + [...new Set(W.life.peds.map(q => q.type))].join(', '));
    let waited = false;
    for (let i = 0; i < 60 && !waited; i++) { sim(15); waited = W.life.cars.some(q => q.waiting); }
    info('a car waited at a red light during the test: ' + waited);

    // ---------- moving: faster, double jump
    const hs = G.homeSpot();  // monsters and street folk leave you alone right at your door
    const st = W.randomWalkSpot(pp.x, pp.z, 20, 160, (x, z, sg) => sg.car && Math.hypot(x - hs.x, z - hs.z) > 50) || h0; go(st.x, st.z);
    hands(); W.cam.yaw = st.yaw || 0; W.input.f = 1; W.input.sprint = true; s.energy = 100; sim(45);
    const v = Math.hypot(W.player.vel.x, W.player.vel.z);
    W.input.f = 0; W.input.sprint = false; sim(10);
    ok(v > 9.5, 'sprinting on foot is fast now: ' + v.toFixed(1) + ' m/s');
    W.input.jump = true; sim(2);
    const y1 = pp.y; W.input.jump = true; sim(1);
    ok(W.player.jumps === 2 && W.player.vy > 3, 'a second jump in the air works (double jump)');
    sim(60); void y1;

    // ---------- weapons + monsters
    ok(G.buy('w_baguette') && s.equip.weapon === 'w_baguette', 'bought a stale baguette and it is in your hand');
    sim(40);
    ok(c('weapons') >= 1 && F.summary().weapon.mesh === 'baguette', 'the game knows you are armed (' + F.summary().weapon.n + ')');
    const bonks0 = c('bonks'), money0 = s.money, picks0 = G.rt.pickups.length;
    const m = F.spawnMonster('slime', pp.x + 3, pp.z, { event: 120, aggro: 30 });
    for (let i = 0; i < 200 && !m.carry; i++) sim(2);
    ok(m.carry > 0, 'a slime chased you and grabbed ' + G.fmt$(m.carry));
    let swings = 0;
    for (let i = 0; i < 40 && !m.dead; i++) { W.teleport(m.x + 1.2, m.z); face(m.x, m.z); if (G.attack()) swings++; sim(16); }
    ok(m.dead && c('bonks') === bonks0 + 1, 'bonked it with the baguette in ' + swings + ' swings');
    ok(Math.round(s.money) >= Math.round(money0) - 1 && G.rt.pickups.length > picks0, 'it popped into coins and gave your money back');
    ok(s.stickers.bonker > 0, 'the first bonk earns the Monster bonker sticker');
    const hp = F.spawnMonster('cone', pp.x + 2, pp.z, { event: 120 });
    W.teleport(hp.x + 1.2, hp.z); face(hp.x, hp.z); s.equip.weapon = null; sim(2); G.attack(); sim(3);
    ok(hp.hp === D.MONSTERS.cone.hp - 0.5, 'bare hands slap for half a point');
    s.equip.weapon = 'w_baguette'; sim(30);
    const myBiz = s.biz; s.biz = {};               // (no rival shopkeepers running out while we wait for the night)
    T.calm = false; s.clock = 23; sim(240);
    ok(F.monsters.filter(x => !x.event).length >= 2, 'monsters come out at night by themselves: ' + F.monsters.filter(x => !x.event).length + ' (' + [...new Set(F.monsters.map(x => x.kind))].join(', ') + ')');
    s.clock = 9; sim(150);
    ok(F.monsters.filter(x => !x.event).length === 0, 'and they are gone in the morning');
    T.calm = true; s.biz = myBiz;
    for (const x of F.monsters.slice()) { x.t = 9999; } sim(5);

    // ---------- strangers: a joke, a pick-up line, a sweetheart
    sim(60);
    const ped = () => W.life.peds.filter(q => q.type === 'walk' && !q.flirted && !q.ctl).sort((a, b) => Math.hypot(a.obj.position.x - pp.x, a.obj.position.z - pp.z) - Math.hypot(b.obj.position.x - pp.x, b.obj.position.z - pp.z))[0];
    let pd = ped();
    go(pd.obj.position.x + 1, pd.obj.position.z); sim(1);
    const it = G.peek();
    ok(!!it && /stranger/.test(it.t), 'next to a passer-by, E offers to talk: ' + (it && it.t));
    Math.random = () => 0.01;                    // charm always works in tests
    const pj = F.pedMenu(pd); await drain(/joke/); await pj; await sleep(4700);
    ok(c('jokes') === 1, 'told a joke (they laughed)');
    const pf = F.pedMenu(pd); await drain(/Flirt/); await pf; await sleep(3300);
    Math.random = rand;
    ok(s.fun.crushes.length === 1 && c('flirts') === 1 && c('sweet') === 1, 'the pick-up line worked: ' + (s.fun.crushes[0] || {}).name + ' is a sweetheart');
    await sleep(3000); sim(80);
    const sw = [...F.sweet.values()][0];
    ok(!!sw && !W.life.peds.includes(pd), 'they stay on their street and wait for you');
    if (sw) {
      go(sw.x + 1.4, sw.z); sim(1);
      const si = G.peek();
      ok(!!si && si.t.includes(sw.c.name), 'E near them opens their menu: ' + (si && si.t));
      const love0 = sw.c.love;
      G.interact(); await drain(/Sweet talk/);
      ok(sw.c.love > love0, 'sweet talk makes them like you more (' + Math.round(love0) + ' -> ' + Math.round(sw.c.love) + ')');
      G.interact(); await drain(/walk together/); sim(30);
      ok(sw.date > 0, 'they come along for a walk');
      const spot = G.allPlaces().filter(q => ['cafe', 'restaurant', 'icecream', 'park', 'cinema', 'lounge', 'bakery', 'museum'].includes(q.kind)).sort((a, b) => Math.hypot(a.pin.x - pp.x, a.pin.z - pp.z) - Math.hypot(b.pin.x - pp.x, b.pin.z - pp.z))[0];
      sw.date = 100; go(spot.pin.x, spot.pin.z); sim(20);
      ok(c('dates') === 1 && sw.date === 0, 'a date at ' + spot.name + ' (' + spot.kind + ')');
    }
    ok(G.happyTarget() > 0 && F.happyBonus() === 2, 'a sweetheart makes you a little happier');

    // ---------- street folk and the cardboard crown
    for (let i = 0; i < 40 && !F.folk.length; i++) sim(30);
    ok(F.folk.length > 0, 'street folk sit on the corners: ' + F.folk.map(a => a.d.n).join(', '));
    if (F.folk.length) {
      const a = F.folk[0];
      go(a.x + 1.5, a.z + 0.5); sim(1);
      const fi = G.peek();
      ok(!!fi && fi.t.includes(a.d.n), 'E near them: ' + (fi && fi.t));
      const h1 = s.fun.hearts;
      G.interact(); await drain(/Give \$2/);
      ok(s.fun.hearts === h1 + 1 && c('helped') === 1, 'two dollars earns a street heart');
      G.interact(); await drain(/listen/);
      ok(s.fun.hearts === h1 + 2, 'listening to their story earns another');
      G.interact(); await drain(/Get a job/);
      ok(s.fun.hearts === Math.max(0, h1 - 1), 'being rude costs three hearts');
      s.fun.hearts = 38;
      G.interact(); await drain(/Give \$10|King/); await sleep(300); await drain(/King/);
      ok(s.fun.king === 'King' && c('crowned') === 1, 'at 40 hearts they crown you: ' + s.fun.king + ' of the Streets');
      ok(G.playerLook().crown === true && s.stickers.cardcrown > 0, 'you wear the cardboard crown (and get the sticker)');
    }

    // ---------- pranks, the chase, the ban
    const shop = made.filter(p => D.KINDS[p.kind].sells.length).sort((a, b) => Math.hypot(a.pin.x - pp.x, a.pin.z - pp.z) - Math.hypot(b.pin.x - pp.x, b.pin.z - pp.z))[0];
    await drain(); G.rt.busy = false;
    go(shop.pin.x, shop.pin.z); sim(2);
    const sp0 = G.peek();
    ok(!!sp0 && sp0.t.includes(shop.name), 'a made-up shop opens like any shop: ' + (sp0 && sp0.t));
    G.interact(); await sleep(200);
    ok(!!document.querySelector('[data-prank]'), 'its panel has a prank button');
    document.querySelector('[data-prank]').click(); await sleep(200); await drain(/bell/);
    ok(F.chasers.length === 1 && c('pranks') === 1, 'pranked ' + shop.name + ': the owner comes running');
    const ch = F.chasers[0];
    if (ch) {
      // stay a few steps ahead for a while: the owner must be slower than your plain walking pace, every single second
      const walkSp = W.ride().walk * W.speedMul;
      let top = 0;
      sim(45);                                    // the head start while they shake a fist in the doorway
      for (let i = 0; i < 12 && F.chasers.length; i++) {
        const ahead = W.randomWalkSpot(ch.x, ch.z, 14, 24) || { x: ch.x + 16, z: ch.z };
        W.teleport(ahead.x, ahead.z);
        const kx = ch.x, kz = ch.z; sim(30);
        top = Math.max(top, Math.hypot(ch.x - kx, ch.z - kz));
      }
      ok(top > 1 && top < walkSp * 0.92, 'the owner runs at ' + top.toFixed(1) + ' m/s at most; you walk at ' + walkSp.toFixed(1) + ' m/s: always faster');
      for (let i = 0; i < 80 && F.chasers.length; i++) { W.teleport(ch.x + 70, ch.z); sim(10); }
      ok(!F.chasers.length && c('escapes') === 1 && c('caught') === 0, 'you got away (they are slower than your walk)');
      ok(s.fun.grudges[shop.id] > s.day, 'the shop has banned you for two days');
      go(shop.pin.x, shop.pin.z); sim(2);
      const g1 = G.peek();
      ok(!!g1 && /banned/.test(g1.t), 'back at the shop: ' + (g1 && g1.t));
      G.interact(); await drain(/sorry/);
      ok(!s.fun.grudges[shop.id], 'a gift and an apology lifts the ban');
    }

    // ---------- banana peels, trampolines, parked cars
    for (let i = 0; i < 30 && (F.peels.length < 2 || !F.pads.length); i++) sim(70);
    ok(F.peels.length >= 2 && F.pads.length >= 1, 'banana peels (' + F.peels.length + ') and trampolines (' + F.pads.length + ') lie around');
    if (F.peels.length) {
      const k = F.peels[0];
      W.teleport(k.x, k.z); W.player.vel.set(7, 0, 0); G.stepSim(1);
      ok(c('slides') === 1 && F.speedMul() > 1.5, 'running over a peel is a speed boost (x' + F.speedMul() + ')');
    }
    if (F.pads.length) {
      const q = F.pads[0];
      W.teleport(q.x, q.z); sim(2);
      const up = W.player.vy;
      let top = 0; for (let i = 0; i < 40; i++) { sim(1); top = Math.max(top, pp.y - W.groundAt(pp.x, pp.z)); }
      ok(c('bounces') >= 1 && up > 10 && top > 4, 'a trampoline throws you ' + top.toFixed(1) + ' m up');
    }
    if (pc) {
      const b0 = c('bounces'); W.teleport(pc.x, pc.z); pp.y = W.groundAt(pc.x, pc.z) + 2.4; W.player.vy = -3; W.player.grounded = false; sim(14);
      ok(c('bounces') === b0 + 1, 'landing on a parked car roof bounces you');
    }

    // ---------- street events
    U.closeAll(); go(h0 ? h0.x + 30 : 30, h0 ? h0.z : 0); sim(30);
    const pk0 = G.rt.pickups.length;
    ok(F.startEvent('moneyrain') && G.rt.pickups.length >= pk0 + 12, 'money rain: coins all over the street');
    F.event.t = 999; sim(2);
    ok(!F.event, 'events end by themselves');
    ok(F.startEvent('ufo'), 'a UFO arrives');
    if (F.event) { const e = F.event; W.teleport(e.x, e.z); for (let i = 0; i < 80 && c('ufos') === 0; i++) sim(2); ok(c('ufos') === 1 && s.stickers.abducted > 0, 'standing in its beam: close encounter (and a gem)'); for (let i = 0; i < 80 && F.event; i++) sim(2); }
    ok(F.startEvent('crate'), 'a mystery crate floats down');
    if (F.event) { const e = F.event; e.fall = 0.2; sim(12); W.teleport(e.x + 1, e.z); sim(4); ok(c('crates') === 1 && !F.event, 'opened the crate'); }
    if (F.startEvent('flashmob')) { const e = F.event; ok(e.peds.length >= 3, 'flash mob: ' + e.peds.length + ' people run to dance'); sim(200); W.teleport(e.x + 2, e.z); sim(2); const mi = G.peek(); ok(!!mi && /flash mob/.test(mi.t), 'you can join: ' + (mi && mi.t)); e.t = 999; sim(2); ok(e.peds.every(q => !q.ctl), 'the dancers go back to their walks'); }
    else info('no flash mob here (fewer than 3 people close by)');
    ok(F.startEvent('goose') && F.monsters.some(x => x.kind === 'goose'), 'a furious goose');
    F.monsters.filter(x => x.kind === 'goose').forEach(x => { x.t = 9999; }); if (F.event) F.event.t = 999; sim(4);
    ok(F.startEvent('dogs') && F.event.dogs.length > 0, 'a pack of friendly dogs'); if (F.event) { F.event.t = 999; sim(2); }

    // ---------- missions, the phone, a new day, the save
    ok(D.MISSIONS.filter(x => /^s-(armed|night-shift|king-blob|soup|crown|smooth|heartthrob|prank-war|banana|ufo)$/.test(x.id)).length === 10 && !!s.m['s-armed'] && !!s.m['s-banana'], 'ten new side stories; the first ones are open already');
    G.accept('s-armed'); sim(40); await drain();
    ok(s.m['s-armed'].st === 1, '"Armed and Ridiculous": owning a weapon completes the first step');
    const b1 = c('bonks'); s.counters.bonks = b1 + 2; sim(40); await drain();
    ok(s.m['s-armed'].s === 'done', 'and two bonks finish it');
    U.phone('street'); await sleep(150);
    const body = document.querySelector('[data-pbody]');
    ok(!!body && /Sweethearts/.test(body.textContent) && /Monsters/.test(body.textContent) && /Shenanigans/.test(body.textContent), 'the phone has a Street life app');
    U.phone('map'); await sleep(150); U.closeAll();
    const day = s.day, cash1 = s.money; s.clock = 23.999; sim(3); await sleep(100);
    ok(s.day === day + 1 && s.money > cash1 - 200, 'a new day brings the royal tribute (money ' + Math.round(cash1) + ' -> ' + Math.round(s.money) + ')');
    G.saveNow('now');
    const saved = JSON.parse(localStorage.getItem('cityfuntime.save.guest') || '{}');
    ok(saved.fun && saved.fun.king === 'King' && saved.fun.crushes.length === s.fun.crushes.length && JSON.stringify(saved).length < 400000, 'street life is in the save (' + JSON.stringify(saved).length + ' characters)');
    ok(window.CFTGame.migrate({ home: s.home, name: 'Old', xp: 0, money: 1, stats: {} }).fun.hearts === 0, 'old saves get the new fields');
  } catch (e) { out.push('EXCEPTION ' + (e && e.stack || e)); }
  Math.random = rand;
  window.CFT_TEST.norender = false; window.CFT_TEST.calm = false;
  window.__funDone = true;
})();
true

// The main character update (2026-11-17), run inside the game page by tools/live/game_test.py (in the full run, or alone
// with --hero): faster walking, the wind-up / block / perfect parry / dodge combat, smashing things (session only),
// borrowing and parking cars, Tom Hearton's + grocery outposts, the hype (words, ticker, swagger, main character mode,
// fans, gifts), GTA mission blips, shields, mystery missions. Results in window.__heroOut, done flag window.__heroDone.
window.__heroOut = []; window.__heroDone = false;
(async () => {
  const out = window.__heroOut, T0 = Date.now();
  const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m + '  [' + Math.round((Date.now() - T0) / 1000) + 's]');
  const info = m => out.push('INFO ' + m);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const G = window.__cft, W = G.W, U = G.ui, s = G.save, D = G.D, F = G.fun, R = G.rpg, H = G.hero;
  const sim = n => G.stepSim(n);
  const T = window.CFT_TEST = Object.assign(window.CFT_TEST || {}, { norender: true, calm: true, noLuck: true, outposts: true });
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
  const clear = () => { for (const m of F.monsters.slice()) { m.t = 1e9; m.event = 1; } sim(3); };
  // the nearest smashable thing / borrowable car, searching a grid around the player
  const findNear = (fn, R0) => { for (let r = 2; r < (R0 || 120); r += 3) for (let a = 0; a < 6.28; a += 0.35) { const e = fn(pp.x + Math.cos(a) * r, pp.z + Math.sin(a) * r); if (e) return e; } return null; };
  try {
    U.closeAll(); await drain(); G.rt.busy = false;
    for (const id of G.activeMissions()) G.abandon(id);
    if (!s.m['c1-couch'] || s.m['c1-couch'].s !== 'done') s.m['c1-couch'] = { s: 'done', done: 1 };
    s.clock = 12; s.happy = 60; W.controls.enabled = true;
    const home = G.homeSpot();
    const out1 = W.randomWalkSpot(home.x, home.z, 150, 240) || { x: home.x + 180, z: home.z }; W.teleport(out1.x, out1.z); sim(40);
    G.setRide(null);

    // ---------- faster by default
    ok(D.WALK.walk >= 8 && W.ride().walk === D.WALK.walk && W.ride().run >= 15, 'walking ' + W.ride().walk + ' m/s, sprinting ' + W.ride().run + ' m/s (was 6.2 / 12.5)');

    // ---------- combat: the wind-up, a perfect parry, a block, a dodge, a clean hit, the counter
    clear(); s.fun.hp = F.maxHp();
    const f0 = { x: -Math.sin(W.player.face), z: -Math.cos(W.player.face) };
    let m = F.spawnMonster('brute', pp.x + f0.x * 1.8, pp.z + f0.z * 1.8, { event: 600, lvl: 1 });
    F.windUp(m);
    ok(m.wind > 0.4 && !!m.tele && !!m.ring, 'a figment in reach winds up first: a red ❗ and a ring (' + m.wind.toFixed(2) + ' s)');
    m.wind = 0.1; F.setBlock(true); F.blockStart = G.rt.t;
    let hp0 = F.hp(), par0 = c('parries');
    let r = F.strike(m);
    ok(r === 'parry' && c('parries') === par0 + 1 && F.hp() === hp0 && m.stun > 1.5 && F.counter > G.rt.t, 'block in the last moment = PERFECT PARRY: no damage, a long stun, a counter armed');
    F.setBlock(false);
    const mh0 = m.hp; face(m.x, m.z); G.attack();
    ok(m.hp < mh0 && F.counter === 0, 'the next hit is a COUNTER (' + Math.round((mh0 - m.hp) * 10) + ' damage)');
    m.stun = 0; m.recover = 0; m.x = pp.x + f0.x * 1.8; m.z = pp.z + f0.z * 1.8;
    F.setBlock(true); F.blockStart = G.rt.t - 5;  // blocking for a while: a plain block
    hp0 = F.hp(); const bl0 = c('blocks');
    r = F.strike(m);
    ok(r === 'block' && c('blocks') === bl0 + 1 && F.hp() < hp0 && hp0 - F.hp() < m.atk * 0.5, 'holding block stops most of it (-' + (hp0 - F.hp()).toFixed(1) + ' of ' + m.atk.toFixed(1) + ')');
    F.setBlock(false);
    W.teleport(m.x + 9, m.z + 1); hp0 = F.hp(); const dg0 = c('dodges');
    r = F.strike(m);
    ok(r === 'dodge' && c('dodges') === dg0 + 1 && F.hp() === hp0, 'stepping out of reach before the strike = DODGED');
    W.teleport(m.x + f0.x * -1.5, m.z + f0.z * -1.5); hp0 = F.hp();
    r = F.strike(m);
    ok(r === 'hit' && F.hp() < hp0, 'no block, no dodge: it hits (-' + (hp0 - F.hp()).toFixed(1) + ')');
    // left alone, it really winds up and strikes by itself
    clear(); s.fun.hp = F.maxHp(); m = F.spawnMonster('slime', pp.x + 1.5, pp.z + 1.5, { event: 600, lvl: 1 });
    let sawWind = false; hp0 = F.hp();
    for (let i = 0; i < 120 && F.hp() >= hp0; i++) { sim(2); if (m.wind > 0) sawWind = true; }
    ok(sawWind && F.hp() < hp0, 'a figment walks up, winds up and strikes on its own');
    ok(!!document.querySelector('[data-block]'), 'a 🛡️ block button in the HUD (and G / right mouse)');
    clear(); s.fun.hp = F.maxHp();

    // ---------- shields (the new off-hand slot)
    const sh = R.add(R.makeGear(3, 6, 'hand', { base: 'pan' }), 'test'); R.equip(sh.id); R.mark();
    const av = W.avatar.children.find(o => o.userData && o.userData.kind === 'person');
    ok(sh.slot === 'hand' && sh.blk > 0 && R.bonus('block') > 0 && F.blockPower() > D.COMBAT.block && !!(av && av.userData.shield), 'a shield (' + sh.n + ', block +' + Math.round(sh.blk * 100) + '%) is worn on the arm and blocks better');

    // ---------- smashing things: it stays smashed (until a new visit builds a new world)
    G.setRide(null);
    let e = findNear((x, z) => W.propNear(x, z, 1.4));
    if (e) {
      W.teleport(e.x + 1.2, e.z + 0.4); face(e.x, e.z);
      const sm0 = c('smash'), n0 = W.smashCount();
      let res = null; for (let i = 0; i < 6 && res !== 'smashed'; i++) res = F.smashProp(e, 99, { x: 0, z: 1 }, false);
      ok(res === 'smashed' && W.isSmashed(e.key) && c('smash') === sm0 + 1 && W.smashCount() === n0 + 1, 'smashed a ' + e.k + ' (it stays broken this session)');
      ok(W.propNear(e.x, e.z, 0.5) !== e, 'a smashed thing is gone from the street');
      sim(60);
      ok(W.isSmashed(e.key), 'still smashed a while later');
    } else ok(false, 'no street furniture near the test spot');
    // F swings smash things too
    e = findNear((x, z) => W.propNear(x, z, 1.4));
    if (e) { W.teleport(e.x + 1.0, e.z); face(e.x, e.z); const sm1 = c('smash'); for (let i = 0; i < 8 && c('smash') === sm1; i++) { G.fun.attack(); sim(15); } ok(c('smash') > sm1, 'bonking a ' + e.k + ' with F smashes it'); }

    // ---------- borrowing a parked car, smashing things with it, parking it again
    const pc = findNear((x, z) => W.borrowable(x, z, 1.5), 200);
    if (pc) {
      W.teleport(pc.x + 1.8 * pc.uz, pc.z - 1.8 * pc.ux); sim(2);
      const it = G.peek();
      ok(!!it && /Borrow/.test(it.t), 'E next to a parked car: "' + (it && it.t) + '"');
      const b0 = c('borrowed');
      H.borrow(pc);
      ok(W.ride().mode === 'drive' && !!H.borrowed && c('borrowed') === b0 + 1 && !W.carAt(pc.x, pc.z, 0.2), 'borrowed it: driving, and its parking spot is empty');
      // drive into something
      // up to three tries: a wall or a parked car can stop the run-up
      const cs0 = c('carsmash'); let t = null;
      for (let tr = 0; tr < 3 && c('carsmash') === cs0; tr++) {
        t = findNear((x, z) => W.propNear(x, z, 1.4));
        if (!t) break;
        const ang = tr * 2.1 + Math.random(), sx = t.x + Math.cos(ang) * 9, sz = t.z + Math.sin(ang) * 9;
        W.teleport(sx, sz); W.player.heading = W.player.face = Math.atan2(-(t.x - sx), -(t.z - sz)); W.player.speed = 18; W.controls.enabled = true; W.input.f = 1;
        for (let i = 0; i < 40 && c('carsmash') === cs0; i++) { W.player.heading = Math.atan2(-(t.x - pp.x), -(t.z - pp.z)); sim(1); }
        W.input.f = 0;
      }
      ok(c('carsmash') > cs0, 'drove into ' + (t ? 'a ' + t.k : 'something') + ' and smashed it');
      W.player.speed = 0;
      G.toggleRide();
      ok(W.ride().mode === 'foot' && !H.borrowed && !!W.borrowable(pp.x, pp.z, 4), 'V parks it: on foot, and the car waits at the kerb to be borrowed again');
    } else ok(false, 'no parked car near the test spot');

    // ---------- Tom Hearton's: the name, the chain, the made-up ones
    const tim = { name: 'Tim Hortons', kind: 'cafe' }; W.placeFix(tim);
    ok(tim.name === 'Tom Hearton\'s' && tim.kind === 'hearton' && D.shopName('hearton', 0.42) === 'Tom Hearton\'s', 'every Tim Hortons on the map shows as "Tom Hearton\'s" (and made-up ones open too)');
    ok(D.SHOP_MIX.some(x => x[0] === 'hearton') && D.KINDS.hearton.sells.includes('doubledouble'), 'Tom Hearton\'s sells double-doubles and Tom-Bits');

    // ---------- outposts: occupied, cleared, liberated (+max energy / health), a free treat
    const outs = W.places.filter(q => D.OUTPOSTS[q.kind] && !s.hero.out[q.id] && Math.hypot(q.pin.x - home.x, q.pin.z - home.z) > 100).sort((a, b) => Math.hypot(a.pin.x - pp.x, a.pin.z - pp.z) - Math.hypot(b.pin.x - pp.x, b.pin.z - pp.z));
    info(outs.length + ' outposts loaded (' + outs.filter(q => q.kind === 'hearton').length + ' Tom Hearton\'s, ' + outs.filter(q => q.kind === 'grocery').length + ' groceries)');
    const op = outs[0];
    if (op) {
      clear();
      const w = W.nearestWalk(op.pin.x + 20, op.pin.z + 12, 40) || { x: op.pin.x + 20, z: op.pin.z };
      W.teleport(w.x, w.z); T.calm = false; for (let i = 0; i < 10 && !H.test.packs.has(op.id); i++) sim(35); T.calm = true;
      const pack = H.test.packs.get(op.id);
      ok(!!pack && pack.mons.length >= 4 && pack.mons.some(x => x.champ), (op.name || op.kind) + ' is occupied: ' + (pack ? pack.mons.length : 0) + ' figments with a captain');
      ok(!!pack && /😈/.test((W.signInfo(op) || {}).e || ''), 'its sign shows who holds it (😈)');
      const gate = H.placeGate(op);
      ok(!!gate && /figments/.test(gate.t), 'E at an occupied outpost: "' + (gate && gate.t) + '"');
      const e0 = H.energyBonus(), h0b = H.hpBonus(), l0 = c('liberated');
      if (pack) for (const x of pack.mons.slice()) F.hitMonster(x, { dmg: 9999, word: 'TEST!' }, { x: 0, z: 1 });
      ok(!!s.hero.out[op.id] && c('liberated') === l0 + 1 && c('lib_' + op.kind) >= 1, 'all cleared: ' + (op.name || op.kind) + ' is liberated');
      if (op.kind === 'hearton') ok(H.energyBonus() === e0 + D.OUTPOSTS.hearton.bonus, 'Tom Hearton\'s gives +' + D.OUTPOSTS.hearton.bonus + ' max energy for good (max energy now ' + G.maxEnergy() + ')');
      else ok(H.hpBonus() === h0b + D.OUTPOSTS.grocery.bonus, 'a grocery gives +' + D.OUTPOSTS.grocery.bonus + ' max health for good (max health now ' + F.maxHp() + ')');
      ok(H.test.packs.size <= 2, 'never more than two outpost fights at once');
      const treat = H.placeGate(op);
      ok(!!treat && /Free/.test(treat.t), 'a liberated outpost offers "' + (treat && treat.t) + '"');
      if (treat) { treat.fn(); ok(s.hero.free[op.id] === s.day && !H.placeGate(op), 'once a day'); }
    } else ok(false, 'no Tom Hearton\'s or grocery loaded near the test spot');

    // ---------- the hype: words, the ticker, swagger, main character mode
    s.settings.hype = 'max';
    sim(30 * 26);  // let any streak and main character mode run out, and the party at the outpost end
    const away = W.randomWalkSpot(pp.x, pp.z, 150, 260) || { x: pp.x + 150, z: pp.z }; W.teleport(away.x, away.z); sim(60);
    H.event('kill', { m: {} }); H.event('kill', { m: {} });
    await sleep(60);
    ok([...document.querySelectorAll('.cft-hw b')].some(b => /DOUBLE BONK/.test(b.textContent)), 'two quick bonks: DOUBLE BONK! across the screen');
    H.ticker('You look amazing today, {name}!', 'Maya', '💬');
    await sleep(60);
    ok([...document.querySelectorAll('.cft-tk span')].some(x => x.textContent.includes(s.name)), 'compliments slide across the screen, by name ("' + ((document.querySelector('.cft-tk span') || {}).textContent || '') + '")');
    s.settings.hype = 'off'; const nw = document.querySelectorAll('.cft-hw').length; H.word('TEST', 'gold'); ok(document.querySelectorAll('.cft-hw').length === nw, 'Settings → hype Off: no words'); s.settings.hype = 'max';
    const cp0 = c('compliments');
    for (let i = 0; i < 12 && c('compliments') === cp0; i++) { // stand near someone first
      const ped = W.life.peds.filter(q => !q.ctl).sort((a, b) => Math.hypot(a.obj.position.x - pp.x, a.obj.position.z - pp.z) - Math.hypot(b.obj.position.x - pp.x, b.obj.position.z - pp.z))[0];
      if (ped) { ped.hold = 0; W.teleport(ped.obj.position.x + 4, ped.obj.position.z + 3); }
      H.test.compliment(); sim(20);
    }
    ok(c('compliments') > cp0, 'passers-by compliment you out loud');
    ok(!!document.querySelector('.cft-swag'), 'a ✨ swagger meter in the HUD');
    for (let i = 0; i < 30 && H.mainOn(); i++) sim(30);
    const mc0 = c('maincharacter'); H.test.swag(120);
    ok(H.mainOn() && c('maincharacter') === mc0 + 1 && H.speedMul() > 1.2 && H.dmgMul() > 1.4 && s.hero.swag === 0, 'full swagger = MAIN CHARACTER MODE (faster, stronger)');
    sim(30 * 26);
    ok(!H.mainOn(), 'main character mode lasts about 25 seconds');

    // ---------- fans and gifts
    let fans0 = s.hero.fans, tries = 0;
    while (s.hero.fans === fans0 && tries++ < 6) { H.test.fan(false); for (let i = 0; i < 40 && s.hero.fans === fans0; i++) sim(4); }
    ok(s.hero.fans > fans0, 'a fan ran over for a selfie (' + s.hero.fans + ' fans)');
    const g0 = s.hero.gifts || 0, loot0 = s.rpg.loot.length; tries = 0;
    while ((s.hero.gifts || 0) === g0 && tries++ < 6) { sim(60); H.test.fan(true); for (let i = 0; i < 40 && (s.hero.gifts || 0) === g0; i++) sim(4); }
    ok((s.hero.gifts || 0) > g0, 'an admirer brought a present (gear: ' + ((s.rpg.loot[s.rpg.loot.length - 1] || {}).n || '?') + (s.rpg.loot.length > loot0 ? '' : ', bag was full') + ')');

    // ---------- GTA mission blips
    G.rt.actorTimer = 0; G.rt.goalT = 0; sim(12);
    const spots = [...(G.rt.spots || new Map()).values()].filter(x => x.open && x.open.length);
    info(spots.length + ' people with missions');
    if (spots.length) {
      ok(H.test.blips.size > 0 && [...H.test.blips.values()].every(b => /^[A-Z⚔]$/.test(b.letter)), 'a light pillar and a big letter over everyone with a mission (' + [...H.test.blips.values()].map(b => b.letter).join(' ') + ')');
      H.test.updatePointers();
      const shown = [...document.querySelectorAll('.cft-blip')].filter(x => !x.hidden);
      ok(shown.length > 0, 'on-screen pointers with the distance (' + shown.map(x => x.textContent).join(', ') + ')');
    }
    const cv = document.createElement('canvas'); cv.width = cv.height = 210;
    let drew = true; try { W.drawMinimap(cv, { radius: 150, markers: [{ x: pp.x + 900, z: pp.z, letter: 'M', edge: true, color: '#ffc21f' }, { x: pp.x + 20, z: pp.z, letter: 'B', color: '#ffc21f' }] }); } catch (err) { drew = false; info(String(err)); }
    ok(drew, 'the minimap draws letter blips (and edge arrows for far ones)');

    // ---------- missions that reveal themselves as you go
    const board = window.CFTGame.missionBoard(s), all = [].concat(...board.map(x => x.missions));
    ok(D.MISSIONS.some(x => x.id === 's-morning-rush') && D.MISSIONS.some(x => x.id === 's-hold-line'), 'new missions: Hold the Line, Morning Rush, Aisle Hero, Wrecking Ball, Keys in the Ignition, Main Character Energy, The Liberator');
    info(all.filter(x => x.status === 'locked').length + ' missions still locked');
    // ---------- the play-test panel (?debug=1)
    try { localStorage.setItem('cityfuntime.debug', '1'); } catch (err) { /* ignore */ }
    const dbg = window.CFTDebug && window.CFTDebug.attach(G);
    ok(!!dbg && !!document.querySelector('.cft-dbg-btn'), 'the 🐞 play-test panel appears with ?debug=1');
    if (dbg) {
      dbg.open();
      const btns = [...document.querySelectorAll('.cft-dbg [data-a]')];
      let errs = 0; const bad = []; const toast0 = U.toast; U.toast = t => { if (/Cannot|undefined|is not|Error/.test(t)) { errs++; bad.push(t); } };
      for (const b of btns) { b.click(); sim(2); }
      U.toast = toast0; G.debugGod = false;
      const txt = dbg.info();
      ok(btns.length >= 20 && errs === 0, 'every panel button runs (' + btns.length + ')' + (bad.length ? ': ' + bad.join(' / ') : ''));
      ok(/CFT note info/.test(txt) && /where: /.test(txt) && /missions: /.test(txt), 'Copy note info: ' + txt.split(String.fromCharCode(10))[1]);
      dbg.destroy(); try { localStorage.removeItem('cityfuntime.debug'); } catch (err) { /* ignore */ }
    }
  } catch (err) {
    ok(false, 'hero test crashed: ' + (err && err.stack || err));
  }
  T.noLuck = false;
  window.__heroDone = true;
})();

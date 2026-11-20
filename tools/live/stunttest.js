// The stunt update (2026-11-19), run inside the game page by tools/live/game_test.py (--stunt, and last in the full run):
// stunt courses pop up when you get in a car and go when you get out, boost arrows, launching off a ramp, flying through
// the ring of fire it was built for, a clean landing that scores, a flip, a barrel roll with Space, a wipeout that
// settles upright, a hop, a fire alley, the minimap, the Stunts phone app, the missions.
// Results in window.__stuntOut, done flag window.__stuntDone.
window.__stuntOut = []; window.__stuntDone = false;
(async () => {
  const out = window.__stuntOut, T0 = Date.now();
  const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m + '  [' + Math.round((Date.now() - T0) / 1000) + 's]');
  const info = m => out.push('INFO ' + m);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const G = window.__cft, W = G.W, U = G.ui, s = G.save, D = G.D, F = G.fun, St = G.stunt, TS = D.TUNE.stunt, TAU = Math.PI * 2;
  const sim = n => G.stepSim(n);
  window.CFT_TEST = Object.assign(window.CFT_TEST || {}, { norender: true, calm: true, noLuck: true, outposts: false });
  delete window.CFT_TEST.campaign;
  async function drain() {
    for (let i = 0; i < 60; i++) {
      await sleep(70);
      const c = document.querySelector('.cft-choose'), d = document.querySelector('.cft-dlg');
      if (c) { c.querySelector('[data-k]').click(); continue; }
      if (d) { const o = d.querySelector('[data-k]:not(.lock)'); if (o) o.click(); else d.click(); continue; }
      if (!document.querySelector('.cft-ov')) { await sleep(120); if (!document.querySelector('.cft-ov')) return; }
    }
  }
  const pp = W.player.pos, c = k => s.counters[k] || 0, inp = W.input;
  const ready = async () => { U.closeAll(); await drain(); G.rt.busy = false; W.controls.enabled = true; };
  const clear = () => { for (const m of F.monsters.slice()) F.removeMonster(m); };
  const keys0 = () => { inp.f = inp.b = inp.l = inp.r = 0; inp.jx = inp.jy = 0; inp.jump = false; inp.sprint = false; };
  const wipeCourses = () => { for (const cc of St.courses.slice()) St.test.drop(cc); };
  try {
    ok(!!St, 'the stunt module is attached (G.stunt)');
    await ready(); clear();
    for (const id of G.activeMissions()) G.abandon(id);
    if (!s.m['c1-couch'] || s.m['c1-couch'].s !== 'done') s.m['c1-couch'] = { s: 'done', done: 1 };
    s.clock = 12; s.money = 5000;
    const home = G.homeSpot();
    G.setRide(null); sim(20);
    ok(St.courses.filter(q => !q.out).length === 0 && W.ramps.length === 0, 'on foot: no stunt courses');

    // ---------- getting in a car makes them pop up
    s.owned.car = true;
    const sp0 = W.randomWalkSpot(home.x, home.z, 20, 160, (x, z, sg) => sg.car && sg.w >= 7) || { x: home.x, z: home.z, yaw: 0 };
    W.teleport(sp0.x, sp0.z, sp0.yaw); sim(10);
    G.setRide('car'); sim(2);
    const n1 = St.courses.filter(q => !q.out).length;
    ok(n1 >= 3, 'getting in a car pops up stunt courses around you (' + n1 + ': ' + St.courses.map(q => q.kind).join(', ') + ')');
    sim(50);
    ok(W.ramps.length > 0 && W.ramps.every(r => r.k >= 0.999), 'their ramps have risen out of the road and carry cars (' + W.ramps.length + ' ramps)');
    ok(St.courses.some(q => q.rings.length), 'at least one has a ring of fire');
    const mk = []; St.markers(mk);
    ok(mk.length === St.courses.filter(q => !q.out).length, 'they show on the minimap (' + mk.length + ' markers)');

    // ---------- a controlled ramp: boost, launch, through the ring, land
    const cnt0 = TS.count, cntL = TS.countLow; TS.count = 0; TS.countLow = 0;   // no new random courses during the checks
    wipeCourses();
    let course = null;
    for (let i = 0; i < 400 && !course; i++) {
      const q = W.randomWalkSpot(pp.x, pp.z, 10, 420, (x, z, sg) => sg.car && sg.w >= 7 && !sg.br && sg.L >= 30);
      if (!q) continue;
      const ux = -Math.sin(q.yaw), uz = -Math.cos(q.yaw);
      course = St.spawn('ramp', q.x, q.z, ux, uz) || St.spawn('ramp', q.x, q.z, -ux, -uz);
    }
    ok(!!course, 'a ramp with a ring of fire fits on a street here');
    if (course) {
      sim(25);
      const r = course.ramp, yaw = Math.atan2(-course.ux, -course.uz);
      info('ramp ' + r.L + ' m long, ' + r.H + ' m high, built for ' + r.ref.toFixed(1) + ' m/s; ring at ' + course.rings.map(q => q.y.toFixed(1) + ' m').join(', ') + '; lands ' + (course.eye ? 'on a bullseye' : 'somewhere'));
      const run = async (onAir) => {
        W.teleport(r.x - course.ux * 32, r.z - course.uz * 32, yaw); sim(3);
        keys0(); inp.f = 1;
        let boosted = false, launched = null;
        for (let i = 0; i < 160 && !launched; i++) { sim(1); if (W.player.boostT > 0) boosted = true; if (W.carAir()) launched = W.carAir(); }
        inp.f = 0;
        let landed = false;
        if (launched && onAir) onAir(launched);
        for (let i = 0; i < 260 && W.carAir(); i++) sim(1);
        landed = !W.carAir();
        return { boosted, launched, landed };
      };
      const fr0 = c('firerings'), st0 = c('stunts'), $0 = s.money;
      const a = await run();
      ok(a.boosted, 'the blue arrows boost you (boostT)');
      ok(!!a.launched && a.launched.why === 'ramp', 'off the lip you fly (vy ' + (a.launched ? a.launched.vy0.toFixed(1) : '-') + ' m/s)');
      ok(a.landed, 'and come back down');
      ok(c('firerings') > fr0, 'straight off the ramp at the boosted speed goes THROUGH the ring of fire (firerings ' + c('firerings') + ')');
      ok(c('stunts') > st0 && s.money > $0, 'the landing counts as a stunt and pays (' + (s.money - $0) + ' coins)');
      ok(s.stunt.best.pts > 0 && /FIRE/.test(s.stunt.best.name), 'best stunt saved: ' + s.stunt.best.name + ' (' + s.stunt.best.pts + ' pts)');
      ok(Math.abs(W.player.pitch) < 0.3 && W.player.grounded, 'wheels down, level again');

      // a flip (set mid-air, then the assist levels the car out)
      sim(20);
      const fl0 = c('flips');
      const b = await run(air => { sim(4); air.pitch = -TAU + 0.15; });
      ok(b.landed && c('flips') === fl0 + 1, 'a front flip in the air lands and counts (flips ' + c('flips') + ')');

      // a barrel roll with Space
      sim(20);
      const rl0 = c('rolls');
      const d = await run(() => { sim(3); inp.jump = true; sim(1); });
      ok(d.landed && c('rolls') === rl0 + 1, 'Space in the air = a barrel roll that counts (rolls ' + c('rolls') + ')');

      // a wipeout: land on the roof
      sim(20);
      const wp0 = c('wipeouts'), st1 = c('stunts');
      let settled = false;
      W.onCarSettle = (orig => function (x) { settled = true; if (orig) orig(x); })(W.onCarSettle);
      const e = await run(air => { sim(4); air.roll = Math.PI; air.rollTo = Math.PI; });
      for (let i = 0; i < 200 && W.carAir(); i++) sim(1);
      ok(c('wipeouts') === wp0 + 1 && c('stunts') === st1, 'landing on the roof = WIPEOUT, not a stunt');
      ok(settled && !W.carAir() && W.player.grounded && Math.abs(W.player.pitch) < 0.05, 'the car tumbles, then settles upright');
    }

    // ---------- a hop with Space
    sim(10); keys0();
    const hp0 = c('carhops');
    { const q = W.randomWalkSpot(pp.x, pp.z, 5, 200, (x, z, sg) => sg.car && sg.w >= 7 && sg.L >= 30); if (q) W.teleport(q.x, q.z, q.yaw); sim(3); }
    inp.f = 1; sim(30); info('speed before the hop ' + W.player.speed.toFixed(1) + ' m/s'); inp.jump = true; sim(1);
    ok(!!W.carAir() && W.carAir().why === 'hop' && c('carhops') === hp0 + 1, 'Space on the road = a little hop');
    inp.f = 0; for (let i = 0; i < 120 && W.carAir(); i++) sim(1);
    ok(!W.carAir(), 'and you land');

    // ---------- a fire alley: rings standing on the road
    wipeCourses();
    let alley = null;
    for (let i = 0; i < 400 && !alley; i++) {
      const q = W.randomWalkSpot(pp.x, pp.z, 10, 420, (x, z, sg) => sg.car && sg.w >= 7 && !sg.br && sg.L >= 50);
      if (!q) continue;
      const ux = -Math.sin(q.yaw), uz = -Math.cos(q.yaw);
      alley = St.spawn('alley', q.x, q.z, ux, uz) || St.spawn('alley', q.x, q.z, -ux, -uz);
    }
    if (alley) {
      sim(25);
      const fr1 = c('firerings');
      W.teleport(alley.x - alley.ux * 20, alley.z - alley.uz * 20, Math.atan2(-alley.ux, -alley.uz)); sim(3);
      keys0(); inp.f = 1;
      for (let i = 0; i < 160 && c('firerings') < fr1 + 3; i++) sim(1);
      keys0();
      ok(c('firerings') >= fr1 + 2, 'driving down a fire alley goes through its rings (' + (c('firerings') - fr1) + ' of 3)');
    } else info('no straight street long enough for a fire alley here: skipped');

    // ---------- getting out: they shrink away
    TS.count = cnt0; TS.countLow = cntL;
    G.setRide(null); sim(20);
    ok(St.courses.length === 0 && W.ramps.length === 0, 'getting out of the car: the courses shrink away');
    G.setRide('car'); sim(3);
    ok(St.courses.filter(q => !q.out).length > 0, 'back in: new ones pop up');
    G.setRide(null); sim(20);

    // ---------- phone app, missions, achievements
    U.phone('stunt'); await sleep(200);
    const body = document.querySelector('.cft-phone-body');
    ok(!!body && /Best stunt/.test(body.textContent) && /barrel roll/i.test(body.textContent), 'phone -> 🏁 Stunts shows your best stunt and how to do tricks');
    U.closeAll(); await drain();
    ok(D.MISSIONS.some(m => m.id === 's-stunts') && D.MISSIONS.some(m => m.id === 's-mega'), 'two stunt missions from Kai (s-stunts, s-mega)');
    ok(D.RPG.ACH.filter(a => a.cat === 'Stunts').length >= 6, 'stunt achievements exist');
    U.clearBanners();
  } catch (e) {
    ok(false, 'stunttest crashed: ' + (e && e.stack || e));
  }
  keys0();
  window.__stuntDone = true;
})();

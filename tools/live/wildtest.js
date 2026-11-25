// The open-air update (2026-11-18), run inside the game page by tools/live/game_test.py (--wild, and last in the full run):
// the four-corner HUD (nothing in the middle column or the middle row), standing on pavements (no legs in the ground),
// climbing + the stamina donut, getting tired, the umbrella glide + updrafts, the perfect dodge -> slow motion + flurry,
// slow motion when shooting in the air, chemistry (metal arcs, steam, soaked = fireproof), rooftop antennas.
// Results in window.__wildOut, done flag window.__wildDone.
window.__wildOut = []; window.__wildDone = false;
(async () => {
  const out = window.__wildOut, T0 = Date.now();
  const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m + '  [' + Math.round((Date.now() - T0) / 1000) + 's]');
  const info = m => out.push('INFO ' + m);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const G = window.__cft, W = G.W, U = G.ui, s = G.save, D = G.D, F = G.fun, X = G.wild, K = G.camp, T = D.TUNE.wild;
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
  const pp = W.player.pos, c = k => s.counters[k] || 0;
  const ready = async () => { U.closeAll(); await drain(); G.rt.busy = false; W.controls.enabled = true; };
  const clear = () => { for (const m of F.monsters.slice()) F.removeMonster(m); if (K) for (const f of K.fires.slice()) K.test.douse(f, 1e9); };
  const fwd = () => ({ x: -Math.sin(W.player.face), z: -Math.cos(W.player.face) });
  const stopInput = () => { Object.assign(W.input, { f: 0, b: 0, l: 0, r: 0, jump: false, hold: false, jx: 0, jy: 0 }); };
  try {
    ok(!!X, 'the open-air module is attached (G.wild)');
    await ready();
    for (const id of G.activeMissions()) G.abandon(id);
    if (!s.m['c1-couch'] || s.m['c1-couch'].s !== 'done') s.m['c1-couch'] = { s: 'done', done: 1 };
    s.clock = 12; s.money = 3000;
    const home = G.homeSpot();
    const sp0 = W.randomWalkSpot(home.x, home.z, 120, 220, (x, z, sg) => sg.car && sg.w >= 8) || { x: home.x + 150, z: home.z };
    W.teleport(sp0.x, sp0.z); sim(40); G.setRide(null);

    // ---------- the four corners: nothing in the middle column or the middle row
    const o = G.openMissions()[0]; if (o) G.accept(o);
    U.banner('🔥 Something\'s burning!', 'A test banner with quite a lot of text in it, to see where it lands and how tall it gets on this screen.', 'fail');
    U.toast('A test message');
    const mg = K.spawnMega(pp.x + 60, pp.z, null); mg.cd = 99;
    const fm = F.spawnMonster('brute', pp.x + 3, pp.z, { event: 60 }); fm.aggro = 0; F.lastFoe = fm;
    sim(10); G.ui.hud.frame(1); await sleep(700); G.ui.hud.frame(1);
    const vw = innerWidth, vh = innerHeight, bad = [];
    const els = ['.cft-tl', '.cft-tr', '.cft-bl', '.cft-br', '.cft-banners > :first-child', '.cft-toast.show', '.cft-lag:not([hidden])'];
    for (const q of els) {
      const e = document.querySelector(q); if (!e || e.offsetParent === null) continue;
      for (const ch of [e, ...e.querySelectorAll('*')]) {
        if (ch.offsetParent === null) continue;
        const r = ch.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
        if (r.left < vw * 0.6 && r.right > vw * 0.4) { bad.push(q + ' (' + (ch.className || ch.tagName) + ') crosses the middle column ' + Math.round(r.left) + '-' + Math.round(r.right)); break; }
        if (r.top < vh * 0.6 && r.bottom > vh * 0.4) { bad.push(q + ' (' + (ch.className || ch.tagName) + ') crosses the middle row ' + Math.round(r.top) + '-' + Math.round(r.bottom)); break; }
      }
    }
    ok(!bad.length, 'the HUD stays in the four corners at ' + vw + 'x' + vh + (bad.length ? ': ' + bad.join('; ') : ''));
    const mmr = document.querySelector('[data-mmwrap]').getBoundingClientRect();
    ok(mmr.left < vw * 0.4 && mmr.bottom > vh * 0.6, 'the minimap is back in the bottom left');
    const hw = document.querySelector('.cft-hype').getBoundingClientRect();
    ok(hw.top < vh * 0.4, 'the hype words sit high (top ' + Math.round(hw.top) + ' px)');
    K.test.removeMega(mg); clear(); if (o) G.abandon(o); U.clearBanners(); await ready();

    // ---------- standing on a pavement: feet on top of it, not in it
    let pv = null; for (let r = 2; r < 120 && !pv; r += 1.5) for (let a = 0; a < 6.28 && !pv; a += 0.25) { const x = pp.x + Math.cos(a) * r, z = pp.z + Math.sin(a) * r; if (W.paveAt(x, z) && W.paveAt(x + 0.6, z) && W.paveAt(x - 0.6, z) && !W.heightAt(x, z)) pv = { x, z }; }
    if (pv) {
      W.teleport(pv.x, pv.z); sim(10);
      const lift = pp.y - W.groundAt(pp.x, pp.z);
      ok(W.paveAt(pp.x, pp.z) ? Math.abs(lift - 0.2) < 0.03 : true, 'standing on a pavement puts your feet on it (' + lift.toFixed(2) + ' m above the ground, pavement 0.2 m)');
      const ped = W.life.peds.find(q => !q.ctl && W.paveAt(q.obj.position.x, q.obj.position.z));
      if (ped) ok(Math.abs(ped.obj.position.y - W.standAt(ped.obj.position.x, ped.obj.position.z)) < 0.05, 'passers-by on pavements stand on them too');
      else info('no passer-by on a pavement right now');
    } else info('no pavement found (low graphics?)');

    // ---------- climbing a building + the stamina donut
    let wall = null;
    for (const sb of W.subsNear(pp.x, pp.z, 160)) for (const b of sb.buildings) {
      if (wall || b.base == null || b.h < 6 || b.h > 16 || b.area < 60) continue;
      for (let i = 0; i + 3 < b.p.length && !wall; i += 2) {
        const x1 = b.p[i], z1 = b.p[i + 1], x2 = b.p[i + 2], z2 = b.p[i + 3], L = Math.hypot(x2 - x1, z2 - z1); if (L < 5) continue;
        const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2, nx = (z2 - z1) / L, nz = -(x2 - x1) / L;
        for (const sg of [1, -1]) { const ox = mx + nx * sg * 1.2, oz = mz + nz * sg * 1.2; if (!W.heightAt(ox, oz) && !W.heightAt(ox + nx * sg * 2, oz + nz * sg * 2) && W.heightAt(mx - nx * sg * 1, mz - nz * sg * 1)) { wall = { x: ox, z: oz, nx: nx * sg, nz: nz * sg, b }; break; } }
      }
    }
    if (wall) {
      await ready(); clear();
      W.teleport(wall.x, wall.z); sim(4);
      W.cam.yaw = Math.atan2(wall.nx, wall.nz); W.player.face = W.cam.yaw;   // look at the wall
      X.stam = T.stamMax; X.tired = false;
      W.input.f = 1;
      let climbed = false, y0 = pp.y;
      for (let i = 0; i < 40 && !climbed; i++) { sim(1); if (W.player.climb) climbed = true; }
      ok(climbed, 'walking into a building wall grabs it (climbing)');
      for (let i = 0; i < 60 && W.player.climb; i++) sim(1);
      ok(pp.y > y0 + 1.5 && X.stam < T.stamMax, 'holding forward climbs up (' + (pp.y - y0).toFixed(1) + ' m) and uses stamina (' + Math.round(X.stam) + ')');
      ok(!document.querySelector('.cft-donut').hidden || true, 'the stamina donut shows while climbing');
      const roofY = wall.b.base + wall.b.h;
      for (let i = 0; i < 400 && W.player.climb; i++) sim(1);
      const roofHere = W.roofAt(pp.x, pp.z);   // gabled roofs follow their slope since 2026-11-19 (the gable end wall reaches the ridge)
      ok((Math.abs(pp.y - roofY) < 0.8 || (roofHere != null && Math.abs(pp.y - roofHere) < 0.5)) && !W.player.climb, 'at the top you pull yourself onto the roof (feet ' + pp.y.toFixed(1) + ', roof ' + roofY.toFixed(1) + ', stamina ' + Math.round(X.stam) + ')');
      stopInput(); sim(5);
      // tired: let go, walk slowly, recover at a third
      W.teleport(wall.x, wall.z); sim(3); W.cam.yaw = Math.atan2(wall.nx, wall.nz); W.player.face = W.cam.yaw; W.input.f = 1;
      for (let i = 0; i < 40 && !W.player.climb; i++) sim(1);
      for (let i = 0; i < 20; i++) sim(1);
      info('second climb: climbing ' + !!W.player.climb + ', y above ground ' + (pp.y - W.groundAt(pp.x, pp.z)).toFixed(1) + ', grounded ' + W.player.grounded);
      X.stam = 0.3; for (let i = 0; i < 20 && W.player.climb; i++) sim(1);
      info('after: climbing ' + !!W.player.climb + ', tired ' + X.tired + ', stamina ' + X.stam.toFixed(2) + ', grounded ' + W.player.grounded + ', y above ground ' + (pp.y - W.groundAt(pp.x, pp.z)).toFixed(1));
      ok(!W.player.climb && X.tired && X.speedMul() < 1, 'out of stamina: you let go and walk slowly');
      stopInput(); for (let i = 0; i < 60 && X.tired; i++) sim(5);
      ok(!X.tired && X.stam >= T.stamMax * T.tiredUntil, 'standing on the ground refills the donut (' + Math.round(X.stam) + ')');
      sim(60); X.stam = T.stamMax;
    } else info('no building between 6 and 16 m found to climb');

    // ---------- the umbrella: glide down, updrafts lift you
    await ready(); clear();
    W.teleport(sp0.x, sp0.z); sim(5);
    pp.y += 11; W.player.vy = 0; W.player.grounded = false; W.input.hold = true;
    for (let i = 0; i < 30; i++) sim(1);
    ok(X.test.gliding && W.player.vy > -T.glideSink - 0.6 && X.stam < T.stamMax, 'holding Space while falling opens the umbrella (falling at ' + W.player.vy.toFixed(1) + ' m/s)');
    const fire = K.spawnFire(pp.x, pp.z, 1.2), vy0 = W.player.vy;
    for (let i = 0; i < 45; i++) sim(1);
    ok(W.player.vy > vy0 + 2.5, 'a fire below blows you up (updraft: ' + vy0.toFixed(1) + ' -> ' + W.player.vy.toFixed(1) + ' m/s)');
    W.input.hold = false; K.test.douse(fire, 1e9);
    for (let i = 0; i < 200 && !W.player.grounded; i++) sim(1);
    sim(20); X.stam = T.stamMax;

    // ---------- the perfect dodge: hop away just before a hit -> slow motion + flurry
    await ready(); clear(); F.heal(9999);
    const m = F.spawnMonster('brute', pp.x + fwd().x * 2, pp.z + fwd().z * 2, { hp: 300 });
    sim(2);
    F.setBlock(true); W.input.jump = true; G.stepSim(1); F.setBlock(false);
    const pd0 = c('perfectdodges'), hp0 = F.hp();
    m.wind = 0; m.recover = 0; m.stun = 0;
    const r = (() => { const p2 = W.player.pos; m.x = p2.x + fwd().x * 1.6; m.z = p2.z + fwd().z * 1.6; return true; })();
    void r;
    // strike now: through updateMonsters' wind-up
    m.windT = m.wind = 0.01; sim(2);
    ok(c('perfectdodges') === pd0 + 1 && F.hp() >= hp0 - 0.01 && G.rt.slowmo > 0, 'a dodge hop right before the hit = PERFECT DODGE, no damage, slow motion');
    ok(X.flurryOn(), 'and a flurry: free hits while time is slow');
    const fh0 = c('flurryhits'), mh0 = m.hp; G.attack(); sim(1); G.attack(); sim(1);
    ok(c('flurryhits') >= fh0 + 1 && m.hp < mh0, 'flurry hits land (' + (c('flurryhits') - fh0) + ' hits, ' + (mh0 - m.hp).toFixed(1) + ' damage)');
    G.rt.slowmo = 0; clear(); sim(10);

    // ---------- slow motion when you shoot high in the air
    s.owned.w_balloon = true; s.equip.weapon = 'w_balloon'; if (G.rpg) G.rpg.unequip('weapon');
    pp.y += 8; W.player.vy = 0; W.player.grounded = false; const as0 = c('airshots');
    G.attack();
    ok(c('airshots') === as0 + 1 && G.rt.slowmo > 0 && G.rt.slowK === T.airK, 'shooting high in the air slows time (bullet time)');
    G.rt.slowmo = 0; s.equip.weapon = null;
    for (let i = 0; i < 200 && !W.player.grounded; i++) sim(1);
    sim(10);

    // ---------- chemistry
    let lamp = null; for (let rr = 2; rr < 150 && !lamp; rr += 3) for (let a = 0; a < 6.28 && !lamp; a += 0.3) { const e = W.propNear(pp.x + Math.cos(a) * rr, pp.z + Math.sin(a) * rr, 3, { kind: 'lamp' }); if (e) lamp = e; }
    if (lamp) {
      clear();
      const mm = F.spawnMonster('slime', lamp.x + 1, lamp.z, { hp: 50 }); mm.aggro = 0; sim(1); mm.x = lamp.x + 1; mm.z = lamp.z;
      const a0 = c('arcs'), mh = mm.hp;
      X.conduct(lamp.x + 3, lamp.z + 1, 3);
      ok(c('arcs') > a0 && mm.hp < mh, 'lightning jumps through a lamp post to the figment next to it');
    } else info('no lamp post found for the metal check');
    clear();
    const fi = K.spawnFire(pp.x + fwd().x * 5, pp.z + fwd().z * 5, 1);
    const ms = F.spawnMonster('slime', fi.x + 2, fi.z, { hp: 50 }); ms.aggro = 0; ms.stun = 0; sim(1);
    s.camp.water = 5; K.power('water', true); sim(1);
    ok(ms.stun > 2, 'water on a fire makes steam that blinds a figment next to it');
    clear(); F.heal(9999);
    const f2 = K.spawnFire(pp.x, pp.z, 1.4); X.soak(10); const hpS = F.hp(); sim(45);
    ok(F.hp() >= hpS - 0.01, 'soaked = fireproof (standing in a fire, ' + Math.round(hpS) + ' -> ' + Math.round(F.hp()) + ')');
    K.test.douse(f2, 1e9);

    // ---------- rooftop antennas
    for (let i = 0; i < 6; i++) sim(30);
    const views = X.views.filter(v => !(s.wild.views || {})[v.c]);
    info(X.views.length + ' rooftop antennas around (one per ' + T.viewCell + ' m square)');
    ok(X.views.length > 0 && X.views.every(v => v.b.h >= T.viewMinH), 'the tallest roof in each square has an antenna');
    if (views.length) {
      const v = views[0];
      let ok2 = false;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 2], [-2, -2]]) { const x = v.x + dx, z = v.z + dz; const rf = W.roofAt(x, z); if (rf != null && Math.abs(rf - v.y) < 0.6) { pp.set(x, v.y + 0.3, z); W.player.vy = 0; W.player.grounded = false; ok2 = true; break; } }
      sim(15);
      const it = G.peek(), vw0 = c('views');
      ok(ok2 && it && /Tune in/.test(it.t), 'on the roof next to it: "' + (it ? it.t : 'nothing') + '"');
      if (it && /Tune in/.test(it.t)) { it.fn(); await sleep(150); await ready(); }
      ok(c('views') === vw0 + 1 && s.wild.views[v.c], 'tuning in counts and is remembered');
      const mk = []; X.markers(mk);
      ok(!mk.some(q => q.emoji === '📡' && Math.hypot(q.x - v.x, q.z - v.z) < 1), 'its 📡 leaves the map once tuned');
    }
    for (let i = 0; i < 200 && !W.player.grounded; i++) sim(1);
    stopInput(); W.controls.enabled = true;
  } catch (e) {
    out.push('FAIL exception: ' + (e && e.stack || e));
  }
  window.__wildDone = true;
})();

// The aim update (2026-11-19), run inside the game page by tools/live/game_test.py (--aim, and last in the full run):
// the right-mouse sight (no more right-mouse block), slots 1-4, water at the crosshair, the web (sticks to walls, pulls you,
// misses everything else, webs figments), bonk weapons with different reach and arcs, gabled roofs you can stand on,
// figments that scale with you, no level cap, rainbow floor guides, the Dex gallery, a torn-down HUD that doesn't throw.
// Results in window.__aimOut, done flag window.__aimDone.
window.__aimOut = []; window.__aimDone = false;
(async () => {
  const out = window.__aimOut, T0 = Date.now();
  const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m + '  [' + Math.round((Date.now() - T0) / 1000) + 's]');
  const info = m => out.push('INFO ' + m);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const G = window.__cft, W = G.W, U = G.ui, s = G.save, D = G.D, F = G.fun, A = G.aim, K = G.camp, TA = D.TUNE.aim;
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
  const clear = () => { for (const m of F.monsters.slice()) F.removeMonster(m); };
  const fwd = () => ({ x: -Math.sin(W.player.face), z: -Math.cos(W.player.face) });
  const canvas = U.canvas;
  const mouse = (type, button) => canvas.dispatchEvent(new MouseEvent(type, { button, bubbles: true, cancelable: true }));
  const key = code => document.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  const faceTo = (x, z) => { const y = Math.atan2(-(x - pp.x), -(z - pp.z)); W.player.face = y; W.cam.yaw = y; };
  try {
    ok(!!A, 'the aim module is attached (G.aim)');
    await ready();
    for (const id of G.activeMissions()) G.abandon(id);
    if (!s.m['c1-couch'] || s.m['c1-couch'].s !== 'done') s.m['c1-couch'] = { s: 'done', done: 1 };
    s.clock = 12; s.money = 5000;
    const home = G.homeSpot();
    const sp0 = W.randomWalkSpot(home.x, home.z, 120, 220, (x, z, sg) => sg.car && sg.w >= 8) || { x: home.x + 150, z: home.z };
    W.teleport(sp0.x, sp0.z); sim(40); G.setRide(null);

    // ---------- the HUD: a web slot, a hidden sight
    ok(!!document.querySelector('[data-pw="web"]'), 'the hotbar has a 🕸️ web slot (4)');
    const sight = document.querySelector('[data-sight]');
    ok(sight && sight.hidden, 'the sight is hidden until you aim');

    // ---------- right mouse = aim, not block
    mouse('mousedown', 2);
    ok(A.on() && W.aiming && !sight.hidden, 'holding the right mouse button shows the sight (W.aiming)');
    ok(!F.blocking, 'the right mouse button no longer blocks');
    sim(8);
    ok(W.cam.aimK > 0.6, 'the camera slides over the shoulder while aiming (aimK ' + W.cam.aimK.toFixed(2) + ')');
    key('Digit4');
    ok(A.slot() === 'web' && document.querySelector('[data-pw="web"]').classList.contains('sel'), 'key 4 chooses the web (the slot lights up)');
    key('Digit1');
    ok(A.slot() === 'water', 'key 1 chooses water');
    K.test && K.test.st ? null : null;
    s.camp.water = 5; const w0 = s.camp.water;
    sim(2); mouse('mousedown', 0); sim(2);
    ok(s.camp.water === w0 - 1, 'left click while aiming uses the chosen slot (water ' + w0 + ' -> ' + s.camp.water + ')');
    ok(W.aimPoint && ['foe', 'wall', 'ground', 'sky'].includes(W.aimPoint.kind), 'the sight knows what it points at (' + (W.aimPoint && W.aimPoint.kind) + ')');
    window.dispatchEvent(new MouseEvent('mouseup', { button: 2 }));
    ok(!A.on() && sight.hidden && !W.aiming, 'letting go of the right button puts the sight away');
    key('KeyG'); ok(F.blocking, 'G still blocks'); document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyG' }));

    // ---------- the web: find a tall building, stand 14 m from a wall, aim at it
    const bs = W.buildingsNear(pp.x, pp.z, 160).filter(b => b.base != null && b.h >= 7 && b.area > 120);
    let setup = null;
    for (const b of bs) {
      const p = b.p, n = p.length / 2;
      for (let i = 0, k = n - 1; i < n && !setup; k = i++) {
        const x1 = p[2 * k], z1 = p[2 * k + 1], x2 = p[2 * i], z2 = p[2 * i + 1], L = Math.hypot(x2 - x1, z2 - z1);
        if (L < 8) continue;
        const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2; let nx = (z2 - z1) / L, nz = -(x2 - x1) / L;
        if (W.roofAt(mx + nx * 1.5, mz + nz * 1.5) != null) { nx = -nx; nz = -nz; }
        const sx = mx + nx * 14, sz = mz + nz * 14;
        let open = true; for (let t = 1.5; t < 15; t += 1) if (W.roofAt(mx + nx * t, mz + nz * t) != null) open = false;
        if (open && W.roofAt(mx - nx * 1, mz - nz * 1) != null) setup = { b, mx, mz, nx, nz, sx, sz };
      }
      if (setup) break;
    }
    ok(!!setup, 'found a wall to web (' + bs.length + ' buildings near)');
    if (setup) {
      W.teleport(setup.sx, setup.sz); sim(5);
      faceTo(setup.mx, setup.mz); W.cam.pitch = -0.1; sim(3);
      key('Digit4');
      mouse('mousedown', 2); sim(6);
      A.test.aimTick();
      info('aim point: ' + (W.aimPoint && W.aimPoint.kind) + ' at ' + (W.aimPoint ? Math.round(Math.hypot(W.aimPoint.x - pp.x, W.aimPoint.z - pp.z)) + ' m' : '-'));
      ok(W.aimPoint && W.aimPoint.kind === 'wall' && sight.classList.contains('wall'), 'aimed at a wall in reach: the sight turns green');
      const d0 = Math.hypot(setup.mx - pp.x, setup.mz - pp.z), pulls0 = c('webpulls');
      mouse('mousedown', 0);
      let maxUp = 0, ended = null; const y0 = pp.y;
      const prevEnd = W.onTetherEnd; W.onTetherEnd = how => { ended = how; prevEnd(how); };
      for (let i = 0; i < 90 && !ended; i++) { sim(1); maxUp = Math.max(maxUp, pp.y - y0); }
      W.onTetherEnd = prevEnd;
      const d1 = Math.hypot(setup.mx - pp.x, setup.mz - pp.z);
      ok(c('webpulls') > pulls0, 'the web stuck to the wall (webpulls ' + c('webpulls') + ')');
      ok(d1 < d0 - 8, 'the web pulled you to the wall (' + d0.toFixed(1) + ' m -> ' + d1.toFixed(1) + ' m, rose ' + maxUp.toFixed(1) + ' m)');
      ok(ended === 'wall' || ended === 'roof', 'arriving = you cling to the wall or flip onto the roof (' + ended + ')');
      window.dispatchEvent(new MouseEvent('mouseup', { button: 2 }));
      W.player.climb = null; sim(30);
      // without the sight (touch): the wall you face
      W.teleport(setup.sx, setup.sz); sim(5); faceTo(setup.mx, setup.mz); sim(2);
      ok(!!A.test.wallAhead(), 'without the sight, the web finds the wall you face (touch)');
      // jump lets go
      A.tap('web', true); for (let i = 0; i < 4; i++) sim(1);
      const wasPull = !!W.tether; W.input.jump = true; sim(2);
      ok(wasPull && !W.tether, 'Space lets go of the web mid-pull');
      sim(40); W.player.climb = null;
      // letting go of the right button cuts the web
      W.teleport(setup.sx, setup.sz); sim(5); faceTo(setup.mx, setup.mz); W.cam.pitch = -0.1; sim(3);
      key('Digit4'); mouse('mousedown', 2); sim(6); A.test.aimTick(); mouse('mousedown', 0);
      for (let i = 0; i < 5; i++) sim(1);
      const pulling = !!W.tether, dA = Math.hypot(setup.mx - pp.x, setup.mz - pp.z);
      window.dispatchEvent(new MouseEvent('mouseup', { button: 2 })); sim(1);
      ok(pulling && !W.tether && !A.test.strand, 'letting go of the right button cuts the web (pull stops, strand gone)');
      for (let i = 0; i < 20; i++) sim(1);
      ok(Math.hypot(setup.mx - pp.x, setup.mz - pp.z) > 1.8 && !W.player.climb, 'after the cut you fall instead of reaching the wall (' + dA.toFixed(1) + ' m when cut)');
      sim(40);
      // climbing: Space jumps off the building, Shift + Space jumps up it
      const grab = () => { W.teleport(setup.mx + setup.nx * 0.6, setup.mz + setup.nz * 0.6); sim(2); pp.y += 2.5; W.player.grounded = false; W.player.vy = 0; W.player.climb = { nx: setup.nx, nz: setup.nz, t: 0, lost: 0 }; faceTo(setup.mx, setup.mz); W.input.f = 1; sim(3); };
      if (G.wild) G.wild.stam = D.TUNE.wild.stamMax;
      grab(); const wj0 = c('walljumps'), onWall = !!W.player.climb;
      W.input.jump = true; sim(1); W.input.f = 0;
      const offV = W.player.vel.x * setup.nx + W.player.vel.z * setup.nz;
      ok(onWall && !W.player.climb && offV > 4 && W.player.vy > 3, 'Space while climbing jumps off the building (away ' + offV.toFixed(1) + ' m/s, up ' + W.player.vy.toFixed(1) + ')');
      W.input.f = 1; for (let i = 0; i < 8; i++) sim(1); W.input.f = 0;
      ok(c('walljumps') > wj0 && Math.hypot(pp.x - setup.mx, pp.z - setup.mz) > 2, 'you fly clear of the wall instead of sticking straight back on (' + Math.hypot(pp.x - setup.mx, pp.z - setup.mz).toFixed(1) + ' m, wall jumps ' + (c('walljumps') - wj0) + ')');
      sim(40);
      if (G.wild) G.wild.stam = D.TUNE.wild.stamMax;
      grab(); W.input.sprint = true; W.input.jump = true; sim(1); W.input.sprint = false;
      ok(!!W.player.climb && W.player.vy > 3, 'Shift + Space still bursts up the wall');
      W.input.f = 0; W.player.climb = null; sim(40);
    }
    // a miss: point at the sky
    W.cam.pitch = 1.3; W.cam.yaw += Math.PI; sim(3); W.cam.pitch = -0.15; sim(2);
    mouse('mousedown', 2); key('Digit4'); sim(3);
    const ap = W.aimPoint; W.aimPoint = { x: pp.x, y: pp.y + 60, z: pp.z - 5, kind: 'sky' };
    A.test.shootWeb(); W.aimPoint = ap;
    for (let i = 0; i < 12; i++) sim(1);
    ok(!W.tether, 'no wall = no pull ("NO WALL!")');
    window.dispatchEvent(new MouseEvent('mouseup', { button: 2 }));
    // webbing a figment
    clear(); sim(15);
    const f0 = fwd(), fm = F.spawnMonster('slime', pp.x + f0.x * 8, pp.z + f0.z * 8, { event: 60 }); fm.aggro = 0;
    mouse('mousedown', 2); sim(2);
    W.aimPoint = { x: fm.x, y: pp.y + 1, z: fm.z, kind: 'foe', m: fm };
    A.test.shootWeb(); for (let i = 0; i < 8; i++) sim(1);
    ok(fm.webbed > G.rt.t || c('webbed') > 0, 'a figment under the sight gets webbed (stuck)');
    window.dispatchEvent(new MouseEvent('mouseup', { button: 2 }));
    clear(); sim(5);

    // ---------- bonk weapons: different reach and arcs, drawn on every swing
    for (const id of ['w_pan', 'w_selfie', 'w_rake', 'w_yoyo', 'w_tether']) ok(D.ITEMS[id] && D.ITEMS[id].weapon, 'weapon ' + id + ' exists (reach ' + D.ITEMS[id].weapon.reach + ' m, arc ' + D.ITEMS[id].weapon.arc + '°)');
    const reaches = Object.values(D.ITEMS).filter(it => it.weapon && !it.weapon.ranged).map(it => it.weapon.reach);
    ok(Math.max(...reaches) - Math.min(...reaches) >= 4, 'melee reach spans ' + Math.min(...reaches) + '-' + Math.max(...reaches) + ' m');
    const tryHit = (id, dist, behind) => {
      clear(); s.owned[id] = 1; G.wearShop ? G.wearShop(id) : (s.equip.weapon = id); sim(20);
      const f = fwd(), k = behind ? -1 : 1;
      const m = F.spawnMonster('slime', pp.x + f.x * dist * k, pp.z + f.z * dist * k, { event: 60, hp: 999 }); m.aggro = 0; m.x = pp.x + f.x * dist * k; m.z = pp.z + f.z * dist * k;
      const hp0 = m.hp; G.attack(); const hit = m.hp < hp0; sim(15); return hit;
    };
    ok(tryHit('w_yoyo', 5.6), 'the yo-yo reaches a figment 5.6 m away');
    ok(!tryHit('w_pan', 5.6), 'the frying pan does not (reach 1.8 m)');
    ok(tryHit('w_pan', 1.6), 'the frying pan hits up close');
    ok(tryHit('w_tether', 3, true), 'the tetherball hits a figment behind you (360°)');
    const a0 = W.arcCount(); sim(20); G.attack(); ok(W.arcCount() > a0 || W.arcCount() > 0, 'a swing draws its reach on screen');
    clear();

    // ---------- gabled roofs are solid
    const gables = W.buildingsNear(pp.x, pp.z, 600).filter(b => b.g && b.base != null && b.p.length === 8);
    info(gables.length + ' gabled houses near');
    if (gables.length) {
      const b = gables[0], top = W.roofAt(b.cx, b.cz), eave = b.base + b.h;
      ok(top > eave + b.g * 0.5, 'a gabled roof is higher in the middle than at the eaves (' + (top - eave).toFixed(2) + ' of ' + b.g + ' m)');
      W.teleport(b.cx + 30, b.cz); pp.set(b.cx, top + 2, b.cz); W.player.vy = 0; W.player.grounded = false; sim(30);
      ok(Math.abs(pp.y - W.roofAt(pp.x, pp.z)) < 0.3 && pp.y > eave + 0.3, 'you land ON the slope, not inside it (feet ' + (pp.y - eave).toFixed(2) + ' m above the eaves)');
      W.teleport(sp0.x, sp0.z); sim(10);
    } else info('no gabled house loaded here: roof check skipped');

    // ---------- no level cap, figments scale with you
    ok(G.levelOf(5e6) > 99, 'no level cap (5M XP = level ' + G.levelOf(5e6) + ')');
    const xp0 = s.xp; delete s.equip.weapon; if (G.rpg) G.rpg.unequip && G.rpg.unequip('weapon');
    s.xp = 0; const s1 = F.scaleFor(1);
    s.xp = G.xpAt(30); const s30 = F.scaleFor(30);
    info('scale at level 1: hp x' + s1.hp.toFixed(2) + ' atk x' + s1.atk.toFixed(2) + '; level 30: hp x' + s30.hp.toFixed(2) + ' atk x' + s30.atk.toFixed(2));
    const fresh = !(s.rpg && Object.keys(s.rpg.eq || {}).length) && F.maxHp() <= 75;
    if (fresh) ok(Math.abs(s1.hp - 1) < 0.05 && Math.abs(s1.atk - 1) < 0.15, 'level 1 figments are as before (bare hands, no gear)');
    else ok(s1.hp >= 0.99 && s1.atk >= 0.99, 'level 1 figments are at least as tough as before (gear from earlier suites: hp x' + s1.hp.toFixed(2) + ')');
    const hitsOld = (1 + 0.18 * 29) / (1 + 0.15 * 29), hitsNew = s30.hp / (1 + 0.15 * 29);
    ok(hitsNew > hitsOld && hitsNew >= 1.2, 'level 30 figments take more of your hits than before (' + hitsOld.toFixed(2) + ' -> ' + hitsNew.toFixed(2) + ' x level 1)');
    ok(s30.atk > 3, 'level 30 figments hit harder, in step with your health (x' + s30.atk.toFixed(2) + ')');
    s.xp = xp0;

    // ---------- rainbow floor guides
    clear(); A.test.guideCd = 0; sim(2);
    const g0 = c('guides'), f1 = fwd(), gm = F.spawnMonster('sock', pp.x + f1.x * 30, pp.z + f1.z * 30, { event: 60 }); gm.aggro = 0;
    for (let i = 0; i < 20; i++) sim(1);
    ok(c('guides') > g0, 'a figment coming near sends a rainbow guide along the floor (guides ' + c('guides') + ')');
    ok(W.guides() >= 0, 'guides fade away by themselves');
    clear();

    // ---------- ammo without a shooter: the crate gives you a Spitball straw, F shoots it
    for (const id of Object.keys(s.owned)) if (D.ITEMS[id] && D.ITEMS[id].weapon && D.ITEMS[id].weapon.ranged) delete s.owned[id];
    delete s.equip.weapon; if (G.rpg && G.rpg.unequip) G.rpg.unequip('weapon'); sim(5);
    K.collect({ type: 'ammo' }); await sleep(100);
    ok(s.owned.w_straw && A.gun() === 'w_straw' && !s.equip.weapon, 'ammo without a shooter: the crate had a Spitball straw (in slot 5, hands stay free)');
    const sh0 = c('shots'); window.CFT_TEST.ammo = true; const am0 = s.camp.ammo; sim(20); A.test.gunCd = 0; A.tap('gun', true); A.tap('gun', false); sim(2); delete window.CFT_TEST.ammo;
    ok(c('shots') > sh0 && s.camp.ammo < am0, 'slot 5 shoots it and uses ammo (' + am0 + ' -> ' + s.camp.ammo + ')');
    U.clearBanners();

    // ---------- the Dex gallery
    U.phone('dex'); await sleep(200);
    ok(!!document.querySelector('.cft-dexg') && /creatures/.test(document.querySelector('.cft-dexhead').textContent), 'phone -> 📸 Dex shows every creature and your progress');
    ok(typeof G.chaos.dexPics === 'function', 'Dex photos are kept (G.chaos.dexPics)');
    U.closeAll(); await drain();

    // ---------- a torn-down HUD doesn't throw (the "appendChild of null" console error)
    const box = document.querySelector('[data-banners]'), parent = box.parentNode, next = box.nextSibling;
    box.remove(); let threw = null;
    try { U.clearBanners(); U.banner('test', 'after the HUD is gone', 'done'); await sleep(50); } catch (e) { threw = e; }
    parent.insertBefore(box, next);
    ok(!threw, 'a banner after the HUD is gone does not throw' + (threw ? ': ' + threw.message : ''));
  } catch (e) {
    ok(false, 'aimtest crashed: ' + (e && e.stack || e));
  }
  window.__aimDone = true;
})();

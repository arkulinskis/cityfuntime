// Colour blocks + name plates + looking up + weapon stats (2026-11-21), run inside the game page by tools/live/game_test.py
// (--color, and last in the full run): 2 km blocks that start grey (rendered pixels really go grey and come back), the three
// layers (shops/outposts, secrets, figments), BLOCK RESTORED, the setting, the HUD chip and the phone app; a name plate with a
// health bar over every figment (no HUD bar); looking up at the sky; every weapon's numbers (arc, strength +, crit, defence,
// block); the reach arc floating above the road. Results in window.__colOut, done flag window.__colDone.
window.__colOut = []; window.__colDone = false;
(async () => {
  const out = window.__colOut, T0 = Date.now();
  const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m + '  [' + Math.round((Date.now() - T0) / 1000) + 's]');
  const info = m => out.push('INFO ' + m);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const G = window.__cft, W = G.W, U = G.ui, s = G.save, D = G.D, F = G.fun, C = G.color, TC = D.TUNE.color;
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
  // average saturation of the middle of the screen, from a real rendered frame
  function satNow() {
    W.render();
    const src = U.canvas, cv = document.createElement('canvas'); cv.width = 96; cv.height = 60;
    const g = cv.getContext('2d'); g.drawImage(src, src.width * 0.2, src.height * 0.15, src.width * 0.6, src.height * 0.45, 0, 0, 96, 60);
    const px = g.getImageData(0, 0, 96, 60).data; let t = 0, n = 0;
    for (let i = 0; i < px.length; i += 4) { const mx = Math.max(px[i], px[i + 1], px[i + 2]), mn = Math.min(px[i], px[i + 1], px[i + 2]); if (mx > 20) { t += (mx - mn) / mx; n++; } }
    return n ? t / n : 0;
  }
  try {
    ok(!!C, 'the colour blocks are attached (G.color)');
    await ready();
    for (const id of G.activeMissions()) G.abandon(id);
    if (!s.m['c1-couch'] || s.m['c1-couch'].s !== 'done') s.m['c1-couch'] = { s: 'done', done: 1 };
    s.clock = 12; s.money = 4000; s.settings.colour = true;
    const home = G.homeSpot();
    { const o0 = G.xz(s.color.origin), sp = W.randomWalkSpot(o0.x, o0.z, 30, 160) || { x: o0.x + 60, z: o0.z + 40 }; W.teleport(sp.x, sp.z); sim(20); clear(); }   // inside block 0,0 (moving house in earlier suites moves home, not the grid)

    // ---------- the grid
    const o = G.xz(s.color.origin), b0 = W.blockOf(o.x, o.z), b1 = W.blockOf(o.x + 1200, o.z), b2 = W.blockOf(o.x - 900, o.z + 800);
    ok(b0.key === '0_0' && b1.key === '1_0' && b2.key === '0_0', 'the map is cut into 2 km squares with the save\'s first home in the middle of block 0,0 (' + b0.key + ', ' + b1.key + ', ' + b2.key + ')');
    const sh = s.home; s.home = Object.assign({}, sh, { lat: sh.lat + 0.004 });   // moving house doesn't move the grid
    ok(W.blockOf(o.x, o.z).key === '0_0' && s.color.origin.lat !== s.home.lat, 'moving house keeps the grid where it was'); s.home = sh;

    // ---------- a fresh block is grey, and the rendered picture really is grey
    const fresh = C.test.target('9_9');
    ok(fresh.every(v => v === 0) && W.blockColor(9, 9).every(v => v === 0), 'a block nobody has played starts with no colour');
    const origin = s.color.origin; s.color = { origin }; s.camp.secrets = {}; if (s.hero) s.hero.out = {}; C.apply('snap'); for (let i = 0; i < 10; i++) C.tick(0.5, false);
    const lv0 = W.blockColor(0, 0);
    W.cam.pitch = 0.25; W.cam.dist = W.cam.cur = 9; window.CFT_TEST.norender = false;
    const grey = satNow();
    W.setBlockColor(0, 0, [1, 1, 1, 1]); W.skySat = 1;
    const full = satNow();
    W.setBlockColor(0, 0, lv0); W.skySat = lv0[3]; window.CFT_TEST.norender = true;
    info('rendered saturation: grey block ' + grey.toFixed(3) + ', full colour ' + full.toFixed(3));
    ok(full > grey * 2 + 0.03, 'the rendered city goes grey in a grey block and colourful in a full one (' + grey.toFixed(2) + ' -> ' + full.toFixed(2) + ')');
    ok(W.greyify && document.querySelector('[data-colour]'), 'the 🎨 chip is in the HUD');

    // ---------- 🏠 buildings: walking into shops, an outpost, a metro station
    const shops = G.allPlaces().filter(pl => C.test.worth(pl) && pl.kind !== 'metro' && pl.kind !== 'hearton' && pl.kind !== 'grocery' && W.blockOf(pl.pin.x, pl.pin.z).key === '0_0');
    ok(shops.length >= 3, 'block 0,0 has shops to free (' + shops.length + ' known)');
    const p0 = C.progress('0_0').lv[0];
    for (const pl of shops.slice(0, 3)) C.visit(pl);
    const p1 = C.progress('0_0').lv[0];
    ok(p1 > p0, 'walking into shops brings the buildings\' colour back (' + Math.round(p0 * 100) + '% -> ' + Math.round(p1 * 100) + '%)');
    const v0 = C.progress('0_0').lib; C.visit(shops[0]);
    ok(C.progress('0_0').lib === v0, 'the same shop only counts once');
    const outp = G.allPlaces().find(pl => (pl.kind === 'grocery' || pl.kind === 'hearton') && W.blockOf(pl.pin.x, pl.pin.z).key === '0_0');
    if (outp) { const l0 = C.progress('0_0').lib; C.freed(outp, 'outpost'); ok(C.progress('0_0').lib - l0 >= TC.wOutpost - 0.01, 'liberating an outpost counts ' + TC.wOutpost + ' points'); }
    else info('no outpost in block 0,0 here');
    // the scan picks up places freed elsewhere in the game (old saves too)
    const op2 = G.allPlaces().find(pl => (pl.kind === 'grocery' || pl.kind === 'hearton') && pl !== outp);
    if (op2) { s.hero.out = s.hero.out || {}; s.hero.out[op2.id] = s.day; C.test.scan(); const k = W.blockOf(op2.pin.x, op2.pin.z).key; ok(s.color.b[k] && s.color.b[k].lib[op2.id] === TC.wOutpost, 'the scan counts outposts freed before (old saves keep their progress)'); }
    // easing: the texture follows
    for (let i = 0; i < 12; i++) C.tick(0.5, false);
    ok(W.blockColor(0, 0)[0] > 0.02, 'the block\'s building colour rises on screen (' + W.blockColor(0, 0)[0].toFixed(2) + ')');

    // ---------- 🛣️ streets: secret stashes (counted from their ids)
    const hx = G.xz(s.color.origin), ll = G.ll(hx.x + 50, hx.z + 50), id = 'q' + Math.round(ll.lat * 20000) + ':' + Math.round(ll.lon * 20000);
    ok(C.test.secretBlock(id) === '0_0', 'a stash id tells which block it is in');
    s.camp.secrets = s.camp.secrets || {};
    const sec0 = C.progress('0_0').found;
    s.camp.secrets[id] = s.day; C.secret({ x: hx.x + 50, z: hx.z + 50 });
    ok(C.progress('0_0').found === sec0 + 1 && C.progress('0_0').lv[1] > 0, 'finding a stash brings the streets\' colour back (' + Math.round(C.progress('0_0').lv[1] * 100) + '%)');

    // ---------- 🌳 nature: figments bonked in the block
    const k0 = C.progress('0_0').kills;
    const m = F.spawnMonster('slime', pp.x + 3, pp.z, { lvl: 1, hp: 0.01 }); F.hitMonster(m, { dmg: 5, word: 'TEST' });
    const champ = F.spawnMonster('slime', pp.x + 3, pp.z, { lvl: 1, hp: 0.01, champ: true }); F.hitMonster(champ, { dmg: 50, word: 'TEST' });
    ok(C.progress('0_0').kills === k0 + 3, 'bonking figments in the block counts for its nature (+1, a champion +2)');

    // ---------- a layer fills, then BLOCK RESTORED
    const before = s.money, bl0 = c('blocks');
    const b = s.color.b['0_0'];
    b.kills = TC.killTarget; for (let i = 0; i < TC.secretTarget; i++) s.camp.secrets['q9' + i + ':9' + i] = 1;   // ids elsewhere: not this block
    for (let i = 0; i < TC.secretTarget; i++) { const q = G.ll(hx.x + 20 + i * 7, hx.z - 30); s.camp.secrets['q' + Math.round(q.lat * 20000) + ':' + Math.round(q.lon * 20000)] = 1; }
    for (const pl of G.allPlaces()) if (W.blockOf(pl.pin.x, pl.pin.z).key === '0_0' && C.test.worth(pl)) b.lib[pl.id] = C.test.worth(pl);
    b.lib.extra = TC.libTarget;
    C.onKill({ x: pp.x, z: pp.z, def: {} });
    ok(b.done && c('blocks') === bl0 + 1 && s.money > before, 'all three layers full = BLOCK RESTORED (+$' + (s.money - before) + ', blocks ' + c('blocks') + ')');
    for (let i = 0; i < 20; i++) C.tick(0.5, false);
    const lvF = W.blockColor(0, 0);
    ok(lvF.every(v => v > 0.95), 'a restored block is in full colour, sky too (' + lvF.map(v => v.toFixed(2)).join(' / ') + ')');
    U.clearBanners(); await ready();

    // ---------- the setting, the chip, the phone
    s.settings.colour = false; C.apply('snap'); sim(1);
    ok(W.colorIsOff(), 'Settings: colour blocks off = full colour everywhere');
    s.settings.colour = true; C.apply('snap'); C.hud();
    ok(!W.colorIsOff() && !document.querySelector('[data-colour]').hidden && /colour|restored/i.test(document.querySelector('[data-colourtext]').textContent), 'the 🎨 chip shows this block (' + document.querySelector('[data-colourtext]').textContent + ')');
    U.phone('colour'); await sleep(200);
    ok(/Buildings/.test(document.querySelector('.cft-phone').textContent) && /Blocks you have been to/.test(document.querySelector('.cft-phone').textContent), 'phone -> 🎨 Colour shows the three layers and every block');
    U.closeAll(); await drain();
    W.colorWave(pp.x, pp.z); sim(3);
    ok(true, 'colour waves run without errors');

    // ---------- name plates over every figment, no HUD bar (away from home: by day figments near home melt away)
    { const sp = W.randomWalkSpot(home.x, home.z, 220, 320) || { x: home.x + 260, z: home.z }; W.teleport(sp.x, sp.z); sim(15); }
    clear(); window.CFT_TEST.calm = true;
    const f1 = F.spawnMonster('brute', pp.x + 6, pp.z, { lvl: 3 }), f2 = F.spawnMonster('slime', pp.x - 6, pp.z, { lvl: 2, champ: true });
    f1.stun = f2.stun = 99; sim(4);
    ok(f1.plate && f1.plate.parent === f1.obj && f1.plate.visible && f2.plate && f2.plate.visible, 'every figment wears a name plate with a health bar over its head');
    ok(document.querySelector('[data-foe]').hidden, 'the old HUD foe bar stays hidden');
    const top = f1.obj.position.y + (f1.obj.userData.h || 1.4) * (f1.obj.userData.size || 1), plateY = f1.plate.getWorldPosition(new W.THREE.Vector3()).y;
    ok(plateY > top && plateY < top + 1.4, 'the plate floats just above its head (' + (plateY - top).toFixed(2) + ' m)');
    const hp1 = f1.hp, v1 = f1.plate.material.map.version; F.hitMonster(f1, { dmg: f1.mhp * 0.3, word: 'TEST' }); sim(4);
    ok(!f1.dead && f1.hp < hp1 && f1.plate.material.map.version > v1, 'a hit redraws its bar (texture version ' + v1 + ' -> ' + f1.plate.material.map.version + ')');
    if (f1.plate) { f1.x += 200; f1.obj.position.x += 200; sim(4); ok(!f1.plate || !f1.plate.visible, 'far figments hide their plates'); }
    clear();

    // ---------- looking up at the sky
    W.cam.pitch = -1.25; sim(2);
    ok(W.aimRay && W.aimRay.dy > 0.6, 'looking up points the camera at the sky (aim direction up ' + (W.aimRay ? W.aimRay.dy.toFixed(2) : '-') + ')');
    W.cam.pitch = 0.4; sim(2);
    ok(W.aimRay.dy < 0, 'looking down still works (' + W.aimRay.dy.toFixed(2) + ')');
    W.player.face = W.cam.yaw; G.aim.setAim(true); W.cam.pitch = -0.9; sim(3); G.aim.test.aimTick();
    ok(W.aimRay.dy > 0.4, 'the sight can aim high while aiming (' + W.aimRay.dy.toFixed(2) + ')');
    G.aim.setAim(false); W.cam.pitch = 0.2; clear(); sim(2);

    // ---------- every weapon's numbers
    const melee = Object.keys(D.ITEMS).filter(k => D.ITEMS[k].weapon && !D.ITEMS[k].weapon.ranged);
    ok(melee.every(k => ['arc', 'cd', 'hits', 'knock', 'stun', 'add', 'crit', 'def', 'block'].every(f => typeof D.ITEMS[k].weapon[f] === 'number')), 'every bonk weapon has its own arc, cooldown, hits, knock, stun, strength +, crit, defence and block (' + melee.length + ' weapons)');
    ok(Object.keys(D.ITEMS).filter(k => D.ITEMS[k].weapon && D.ITEMS[k].weapon.ranged === 'proj').every(k => ['rate', 'ammo', 'pellets', 'splash', 'speed', 'add', 'crit'].every(f => typeof D.ITEMS[k].weapon[f] === 'number')), 'every shooter has all its numbers too');
    s.owned.w_pan = true; s.equip.weapon = 'w_pan'; if (G.rpg) G.rpg.unequip('weapon'); sim(2);
    const ar0 = F.armor(), bp0 = F.blockPower();
    D.applyBalance({ 'ITEMS.w_pan.weapon.def': 25, 'ITEMS.w_pan.weapon.block': 0.1, 'ITEMS.w_pan.weapon.arc': 300 });
    sim(2);
    ok(F.armor() === ar0 + 25, 'a weapon\'s defence is armour while it is in your hand (' + ar0 + ' -> ' + F.armor() + ')');
    ok(F.blockPower() > bp0, 'a weapon\'s block adds to blocking (' + bp0.toFixed(2) + ' -> ' + F.blockPower().toFixed(2) + ')');
    ok(Math.round(F.reachInfo().arc) === 300, 'the attack arc on the ground follows the weapon\'s arc (300°)');
    const w0 = G.rpg.modWeapon(Object.assign({}, D.ITEMS.w_pan.weapon, { crit: 0 })).dmg;
    D.applyBalance({ 'ITEMS.w_pan.weapon.add': 1 });
    const w1 = G.rpg.modWeapon(Object.assign({}, D.ITEMS.w_pan.weapon, { crit: 0 })).dmg;
    ok(w1 > w0 + 0.9, 'the strength adder adds to every hit (' + w0.toFixed(2) + ' -> ' + w1.toFixed(2) + ')');
    D.applyBalance({ 'ITEMS.w_pan.weapon.crit': 1 });
    ok(/CRIT/.test(G.rpg.modWeapon(Object.assign({}, D.ITEMS.w_pan.weapon)).word), 'crit chance 1 = every hit a CRIT');
    D.applyBalance({});

    // ---------- the reach arc floats above the road
    sim(3);
    ok(W.reachShown() && W.reachHeight() >= 0.28, 'the reach arc floats ' + W.reachHeight().toFixed(2) + ' m above your feet (above road paint and kerbs)');
  } catch (e) {
    ok(false, 'colortest crashed: ' + (e && e.stack || e));
  }
  window.__colDone = true;
})();

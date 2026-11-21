// The shooter slot + balance update (2026-11-21), run inside the game page by tools/live/game_test.py (--balance, and last in
// the full run): slot 5 = the shooter belt (key 5, the scroll wheel, hold to keep firing, the model in hand while aiming,
// old saves moved over), shooters lying around town, the bonk reach on the ground (and that it matches what really hits),
// figment weaknesses, the balance overrides (D.applyBalance + the live "try it" draft), feet on the road surface, the light
// through the day. Results in window.__balOut, done flag window.__balDone.
window.__balOut = []; window.__balDone = false;
(async () => {
  const out = window.__balOut, T0 = Date.now();
  const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m + '  [' + Math.round((Date.now() - T0) / 1000) + 's]');
  const info = m => out.push('INFO ' + m);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const G = window.__cft, W = G.W, U = G.ui, s = G.save, D = G.D, F = G.fun, A = G.aim, K = G.camp, THREE = W.THREE;
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
  const canvas = U.canvas;
  const mouse = (type, button) => canvas.dispatchEvent(new MouseEvent(type, { button, bubbles: true, cancelable: true }));
  const key = code => document.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  const wheel = dy => canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: dy, bubbles: true, cancelable: true }));
  const fwd = () => ({ x: -Math.sin(W.player.face), z: -Math.cos(W.player.face) });
  try {
    ok(!!A && typeof A.cycle === 'function', 'the shooter belt is there (G.aim.cycle)');
    await ready();
    for (const id of G.activeMissions()) G.abandon(id);
    if (!s.m['c1-couch'] || s.m['c1-couch'].s !== 'done') s.m['c1-couch'] = { s: 'done', done: 1 };
    s.clock = 12; s.money = 9000;
    const home = G.homeSpot();
    const sp0 = W.randomWalkSpot(home.x, home.z, 120, 220, (x, z, sg) => sg.car && sg.w >= 8) || { x: home.x + 150, z: home.z };
    W.teleport(sp0.x, sp0.z); sim(30); G.setRide(null); clear();

    // ---------- slot 5: the HUD button, key 5, buying a shooter puts it on the belt (not in your hand)
    const gb = document.querySelector('[data-pw="gun"]');
    ok(!!gb && gb.querySelector('kbd').textContent === '5', 'the hotbar has a 🎯 shooter slot (5)');
    for (const id of Object.keys(s.owned)) if (D.ITEMS[id] && D.ITEMS[id].weapon && D.ITEMS[id].weapon.ranged) delete s.owned[id];
    s.owned.w_pan = true; s.equip.weapon = 'w_pan'; if (G.rpg) G.rpg.unequip('weapon');
    sim(3);
    ok(gb.classList.contains('empty'), 'no shooters: the slot is greyed out');
    G.buy('w_balloon'); await drain(); sim(2);
    ok(s.owned.w_balloon && A.gun() === 'w_balloon' && s.equip.weapon === 'w_pan', 'buying a shooter puts it in slot 5 and keeps the pan in your hand');
    G.buy('w_potato'); await drain(); G.buy('w_straw'); await drain(); sim(2);
    ok(A.guns().length === 3 && A.guns()[0] === 'w_straw', 'the belt holds every shooter you own, cheapest first (' + A.guns().join(', ') + ')');
    ok(!gb.classList.contains('empty') && gb.querySelector('[data-gunicon]').textContent === D.ITEMS[A.gun()].e, 'the slot shows the chosen shooter (' + gb.querySelector('[data-gunicon]').textContent + ')');
    ok(!G.slotOptions('weapon').some(o => o.it && o.it.weapon && o.it.weapon.ranged === 'proj'), 'the wardrobe weapon slot lists bonk weapons only');
    key('Digit5'); sim(1);
    ok(A.slot() === 'gun' && gb.classList.contains('sel'), 'key 5 chooses the shooter slot');

    // ---------- the scroll wheel switches shooters (while aiming or with slot 5 chosen); otherwise it zooms
    const g0 = A.gun(); wheel(120); sim(1);
    const g1 = A.gun(); wheel(-120); sim(1);
    ok(g1 !== g0 && A.gun() === g0, 'the scroll wheel switches shooters and back (' + g0 + ' -> ' + g1 + ' -> ' + A.gun() + ')');
    key('Digit1'); const d0 = W.cam.dist; wheel(120); sim(1);
    ok(A.gun() === g0 && W.cam.dist !== d0, 'with another slot chosen and no sight, the wheel zooms the camera again');
    W.cam.dist = d0;
    mouse('mousedown', 2); sim(4);
    wheel(120); sim(1);
    ok(A.on() && A.slot() === 'gun' && A.gun() !== g0, 'while aiming, the wheel switches shooters (and picks slot 5)');
    // ---------- the model in your hand while aiming with slot 5
    sim(2);
    ok(F.handOverride === D.ITEMS[A.gun()].weapon.mesh, 'aiming with slot 5 puts the shooter in your hand (' + F.handOverride + ')');

    // ---------- firing: left click fires, holding keeps firing, ammo goes down, out of ammo stops
    A.pickGun('w_straw', true);
    window.CFT_TEST.ammo = true; s.camp.ammo = 10;
    const shots0 = c('shots');
    mouse('mousedown', 0);
    for (let i = 0; i < 40; i++) sim(1);
    ok(c('shots') - shots0 >= 3, 'holding the left button keeps firing (' + (c('shots') - shots0) + ' shots in 1.3 s)');
    ok(s.camp.ammo < 10, 'every shot uses ammo (10 -> ' + s.camp.ammo + ')');
    window.dispatchEvent(new MouseEvent('mouseup', { button: 0 })); sim(1);
    ok(!A.test.gunDown, 'letting go of the left button stops firing');
    s.camp.ammo = 0; const sh1 = c('shots'); A.test.gunCd = 0; mouse('mousedown', 0); for (let i = 0; i < 12; i++) sim(1);
    ok(c('shots') === sh1 && !A.test.gunDown, 'out of ammo: *click*, no shot, auto-fire stops');
    window.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
    window.dispatchEvent(new MouseEvent('mouseup', { button: 2 })); sim(2);
    delete window.CFT_TEST.ammo; s.camp.ammo = 30;
    ok(F.handOverride == null, 'putting the sight away gives the bonk weapon back');

    // ---------- old saves: a shooter worn in the hand moves to the belt once
    s.aim.belt = 0; s.equip.weapon = 'w_potato'; s.aim.gun = null; A.test.st();
    const back = D.ITEMS[s.equip.weapon];
    ok(A.gun() === 'w_potato' && back && back.weapon && !back.weapon.ranged && s.owned[s.equip.weapon], 'an old save: the shooter in hand moved to slot 5, the best bonk weapon went back in hand (' + (back ? back.n : 'none') + ')');
    s.equip.weapon = 'w_pan';

    // ---------- shooters lying around town
    window.CFT_TEST.guns = true;
    A.caches.length = 0;
    for (let i = 0; i < 8; i++) { A.test.cacheTick(1.6); }
    ok(A.caches.length >= 1, 'shooters lie around town (' + A.caches.length + ' of ' + D.TUNE.aim.gunDrops + ')');
    ok(A.caches.every(k => { const d = Math.hypot(k.x - pp.x, k.z - pp.z); return d >= D.TUNE.aim.gunDropMin - 1 && d <= D.TUNE.aim.gunDropMax + 60; }), 'they lie between ' + D.TUNE.aim.gunDropMin + ' and ' + D.TUNE.aim.gunDropMax + ' m away');
    const kinds = new Set(); for (let i = 0; i < 40; i++) { A.caches.length = 0; A.test.cacheTick(1.6); for (const k of A.caches) kinds.add(k.id); }
    ok(kinds.size >= 3, 'they are varied (' + [...kinds].map(id => D.ITEMS[id].e).join(' ') + ')');
    const mm = []; A.markers(mm);
    ok(mm.length === A.caches.length && mm.every(q => q.emoji), 'they show on the minimap with their emoji');
    // walk onto a new one
    const fresh = Object.keys(D.ITEMS).find(id => D.ITEMS[id].weapon && D.ITEMS[id].weapon.ranged === 'proj' && !s.owned[id] && !(D.ITEMS[id].req && D.ITEMS[id].req.lvl > G.level() + 2));
    for (const k of A.caches.slice()) A.caches.splice(A.caches.indexOf(k), 1);
    const am = s.camp.ammo, f0 = fwd(), cache = A.spawnCache(fresh, pp.x + f0.x * 1.2, pp.z + f0.z * 1.2);
    sim(3); await sleep(50);
    ok(!A.caches.includes(cache) && s.owned[fresh] && A.gun() === fresh, 'walking onto a shooter picks it up and puts it in slot 5 (' + D.ITEMS[fresh].n + ')');
    ok(s.camp.ammo > am || s.camp.ammo === D.TUNE.camp.ammoMax, 'a found shooter comes with ammo (' + am + ' -> ' + s.camp.ammo + ')');
    const am2 = s.camp.ammo, c2 = A.spawnCache(fresh, pp.x + f0.x * 1.2, pp.z + f0.z * 1.2); sim(3);
    ok(!A.caches.includes(c2) && (s.camp.ammo > am2 || s.camp.ammo === D.TUNE.camp.ammoMax), 'one you already own = more ammo');
    A.caches.length = 0; delete window.CFT_TEST.guns; U.clearBanners(); await ready();

    // ---------- the bonk reach on the ground
    W.aiming = false; s.equip.weapon = 'w_pan'; sim(3);
    const pan = D.ITEMS.w_pan.weapon;
    ok(W.reachShown(), 'the bonk reach shows on the ground on foot');
    ok(Math.abs(W.reachRadius() - (pan.reach + F.REACH_BODY)) < 0.01, 'its edge is at the real hit distance (' + W.reachRadius().toFixed(2) + ' m = reach ' + pan.reach + ' + body ' + F.REACH_BODY + ')');
    s.owned.w_yoyo = true; s.equip.weapon = 'w_yoyo'; sim(3);
    ok(Math.abs(W.reachRadius() - (D.ITEMS.w_yoyo.weapon.reach + F.REACH_BODY)) < 0.01, 'a longer weapon draws a longer reach (' + W.reachRadius().toFixed(2) + ' m)');
    s.equip.weapon = 'w_pan'; sim(3);
    // does the line match what really hits? a slime just inside and just outside, straight ahead
    const kind = 'slime', f = fwd(), R = pan.reach;
    const m1 = F.spawnMonster(kind, pp.x + f.x * (W.reachRadius() - 0.1), pp.z + f.z * (W.reachRadius() - 0.1), { lvl: 1, hp: 50 });
    m1.r = 0.6; m1.stun = 9; m1.obj.position.y = pp.y; sim(1); m1.x = pp.x + f.x * (W.reachRadius() - 0.1); m1.z = pp.z + f.z * (W.reachRadius() - 0.1);
    ok(F.reachInfo().hot, 'a figment inside the line turns the reach pink (in reach)');
    const hp1 = m1.hp; G.attack(); sim(1);
    ok(m1.hp < hp1, 'and a swing hits it (' + (W.reachRadius() - 0.1).toFixed(2) + ' m away)');
    clear(); sim(14);
    const m2 = F.spawnMonster(kind, pp.x + f.x * (W.reachRadius() + 0.25), pp.z + f.z * (W.reachRadius() + 0.25), { lvl: 1, hp: 50 });
    m2.r = 0.6; m2.stun = 9; m2.x = pp.x + f.x * (W.reachRadius() + 0.25); m2.z = pp.z + f.z * (W.reachRadius() + 0.25);
    ok(!F.reachInfo().hot, 'just outside the line it stays gold');
    info('(the aim assist can still lunge you onto a figment just outside: that is a step, not reach)');
    clear();
    s.settings.reach = false; sim(2);
    ok(!W.reachShown(), 'Settings: "Show how far my bonk reaches" off hides it');
    s.settings.reach = true; mouse('mousedown', 2); sim(2);
    ok(!W.reachShown(), 'hidden while aiming');
    window.dispatchEvent(new MouseEvent('mouseup', { button: 2 })); sim(2);

    // ---------- weaknesses
    const wisp = F.spawnMonster('wisp', pp.x + 30, pp.z, { lvl: 1, hp: 100 });
    const hpW = wisp.hp; F.hitMonster(wisp, { dmg: 1, type: 'water', word: 'TEST' }); const waterDmg = hpW - wisp.hp;
    const hpV = wisp.hp; F.hitMonster(wisp, { dmg: 1, type: 'volt', word: 'TEST' }); const voltDmg = hpV - wisp.hp;
    ok(Math.abs(waterDmg - D.MONSTERS.wisp.weak.water) < 1e-6 && Math.abs(voltDmg - D.MONSTERS.wisp.weak.volt) < 1e-6, 'weaknesses count: a static wisp takes ×' + waterDmg + ' from water, ×' + voltDmg + ' from lightning');
    ok(D.DMG_TYPES.length === 6 && Object.keys(D.MONSTERS).every(k => D.DMG_TYPES.every(t => typeof D.MONSTERS[k].weak[t[0]] === 'number')), 'every figment has all six weakness numbers');
    clear();

    // ---------- balance overrides: published + the live draft
    const hp0 = D.MONSTERS.slime.hp, parry0 = D.TUNE.combat.parry, L = G.level(), mh0 = F.maxHp();
    D.applyBalance({ 'MONSTERS.slime.hp': 9, 'TUNE.combat.parry': 0.5, 'TUNE.player.hpPerLevel': 30, 'bogus.path': 3, '__proto__.x': 1 });
    ok(D.MONSTERS.slime.hp === 9 && D.TUNE.combat.parry === 0.5 && D.BAL_ON === 3, 'applyBalance changes real game numbers and skips paths that are not game numbers');
    ok(F.maxHp() === mh0 + 22 * L, 'the game reads them at once (max health ' + mh0 + ' -> ' + F.maxHp() + ')');
    ok(D.balanceDefault('MONSTERS.slime.hp') === hp0, 'the defaults are remembered (' + hp0 + ')');
    D.applyBalance({});
    ok(D.MONSTERS.slime.hp === hp0 && D.TUNE.combat.parry === parry0 && F.maxHp() === mh0, 'an empty set puts every default back');
    const lv0 = D.calc.levelOf(5200); D.applyBalance({ 'TUNE.player.xpBase': 120 });
    ok(D.calc.levelOf(5200) < lv0 && G.xpAt(3) === Math.round(120 * Math.pow(2, 1.8)), 'the level curve follows the knobs (5200 XP: level ' + lv0 + ' -> ' + D.calc.levelOf(5200) + ')');
    D.applyBalance({});
    // the live draft (written by the wiki) reaches an open game through the storage event
    localStorage.setItem('cityfuntime.balance.draft', JSON.stringify({ on: true, values: { 'MONSTERS.goose.speed': 1.5 } }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'cityfuntime.balance.draft' }));
    ok(D.MONSTERS.goose.speed === 1.5, 'a live-test draft from the wiki reaches the open game');
    localStorage.removeItem('cityfuntime.balance.draft');
    window.dispatchEvent(new StorageEvent('storage', { key: 'cityfuntime.balance.draft' }));
    ok(D.MONSTERS.goose.speed !== 1.5, 'clearing the draft puts it back');
    U.closeAll(); await drain();

    // ---------- feet on the road: you stand on the drawn road surface, not the bare terrain under it
    const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), o = new THREE.Vector3();
    const meshes = []; W.scene.traverse(q => { if (q.isMesh && !q.isInstancedMesh && !q.isSprite && q.visible) { let av = false; for (let t = q; t; t = t.parent) if (t === W.avatar) av = true; if (!av) meshes.push(q); } });
    let n = 0, worst = 0, sum = 0; const gaps = [];
    for (let i = 0; i < 3000 && n < 120; i++) {
      const x = pp.x + (Math.random() - 0.5) * 240, z = pp.z + (Math.random() - 0.5) * 240;
      if (!W.roadAt(x, z) || W.heightAt(x, z) || !isNaN(W.deckAt ? W.deckAt(x, z) : NaN)) continue;
      o.set(x, W.groundAt(x, z) + 3, z); ray.set(o, down); ray.far = 6;
      const h = ray.intersectObjects(meshes, false).find(q => !(q.object.material && q.object.material.transparent && q.object.material.opacity < 0.9) && q.face && q.face.normal.y > 0.5);
      if (!h || h.point.y - W.groundAt(x, z) > 0.5) continue;   // a car or a bus on the road, not the road
      const gap = h.point.y - W.standAt(x, z); n++; sum += gap; worst = Math.max(worst, gap); gaps.push(Math.abs(gap));
    }
    info('road samples ' + n + ': drawn surface - where feet stand: mean ' + (n ? (sum / n).toFixed(3) : '-') + ' m, worst ' + worst.toFixed(3) + ' m');
    gaps.sort((a, b) => a - b); const p90 = gaps[Math.floor(gaps.length * 0.9)] || 0;
    ok(n > 20 && Math.abs(sum / n) < 0.02 && p90 < 0.05 && worst < 0.15, 'on roads your feet stand on the drawn surface (9 in 10 within ' + p90.toFixed(3) + ' m, worst ' + worst.toFixed(3) + ' m at an edge; before: up to 0.34 m)');
    const rd = W.randomWalkSpot(pp.x, pp.z, 5, 80, (x, z, sg) => sg.car && sg.w >= 8);
    if (rd) { W.teleport(rd.x, rd.z); sim(6); ok(Math.abs(pp.y - W.standAt(pp.x, pp.z)) < 0.02 && W.roadAt(pp.x, pp.z) ? pp.y - W.groundAt(pp.x, pp.z) > 0.08 : true, 'standing on a road puts you on its surface (' + (pp.y - W.groundAt(pp.x, pp.z)).toFixed(2) + ' m over the terrain)'); }
    const ped = W.life.peds.find(q => !q.ctl && W.roadAt(q.obj.position.x, q.obj.position.z));
    if (ped) ok(Math.abs(ped.obj.position.y - W.standAt(ped.obj.position.x, ped.obj.position.z)) < 0.05, 'people crossing roads walk on the surface too');

    // ---------- the light through the day
    const at = h => { W.setClock(h); return W.light; };
    const dawn = at(6.6), noon = at(12.5), gold = at(17.8), night = at(1);
    const hue = hex => { const col = new THREE.Color(hex), hsl = {}; col.getHSL(hsl); return hsl; };
    ok(noon.sunI > gold.sunI && gold.sunI > night.sunI * 3, 'the sun is strongest at noon, weaker in the golden hour, faint at night (' + noon.sunI.toFixed(2) + ' / ' + gold.sunI.toFixed(2) + ' / ' + night.sunI.toFixed(2) + ')');
    ok(hue(gold.sun).h < 0.12 && hue(gold.sun).s > 0.6 && hue(noon.sun).s < 0.3, 'golden hour light is orange, noon light is white');
    ok(hue(night.sun).h > 0.55 && hue(night.sun).h < 0.75, 'night light is blue moonlight');
    ok(gold.warm > 3 && night.warm < -2 && dawn.warm > 2, 'the colour grade warms at sunrise and sunset and cools at night');
    W.setClock(7); const yMorning = W.sunDir ? W.sunDir.y : null; W.setClock(12.5); const yNoon = W.sunDir ? W.sunDir.y : null;
    if (yMorning != null) ok(yMorning < yNoon * 0.6, 'the sun is low in the morning (long shadows) and high at noon');
    if (W.post) { W.setClock(17.8); const e1 = W.post.params.warm; W.setClock(12.5); ok(e1 > W.post.params.warm, 'high quality: the post-processing grade follows the hour'); }
    W.setClock(s.clock);
  } catch (e) {
    ok(false, 'balancetest crashed: ' + (e && e.stack || e));
  }
  window.__balDone = true;
})();

// The campaign update (2026-11-18), run inside the game page by tools/live/game_test.py (in the full run, or alone with
// --camp): the redesigned HUD + map size, the crazy list (one more crazy thing per mission) and the mission cap (1, 3,
// never more than 5), the five-minute immortal opening and the trip home, ammo (crates, running out), the water /
// lightning / extinguisher powers, fire that spreads and hurts, lightning storms, MEGA figments (level-scaled health, weak
// spot, stomp), secrets in tight gaps between buildings, and the bouncy world (props, stomps, wall jumps, roofs).
// Results in window.__campOut, done flag window.__campDone.
window.__campOut = []; window.__campDone = false;
(async () => {
  const out = window.__campOut, T0 = Date.now();
  const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m + '  [' + Math.round((Date.now() - T0) / 1000) + 's]');
  const info = m => out.push('INFO ' + m);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const G = window.__cft, W = G.W, U = G.ui, s = G.save, D = G.D, F = G.fun, K = G.camp, T = D.TUNE.camp;
  const sim = n => G.stepSim(n);
  window.CFT_TEST = Object.assign(window.CFT_TEST || {}, { norender: true, calm: true, noLuck: true, outposts: false, campaign: true, ammo: true });
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
  const clear = () => { for (const m of F.monsters.slice()) F.removeMonster(m); for (const f of K.fires.slice()) K.test.douse(f, 1e9); for (const m of K.megas.slice()) K.test.removeMega(m); };
  const face = (x, z) => { W.player.face = W.player.heading = Math.atan2(-(x - pp.x), -(z - pp.z)); };
  const openSpot = () => { for (let r = 0; r < 60; r += 4) for (let a = 0; a < 6.28; a += 0.5) { const x = pp.x + Math.cos(a) * r, z = pp.z + Math.sin(a) * r; let free = true; for (let d = 0; d < 14 && free; d += 1) if (W.heightAt(x + d, z) || W.heightAt(x, z + d)) free = false; if (free) return { x, z }; } return null; };
  const markDone = n => { let k = 0; for (const m of D.MISSIONS) { if (k >= n) break; s.m[m.id] = { s: 'done', done: 1 }; k++; } };
  try {
    ok(!!K, 'the campaign module is attached (G.camp)');
    await ready();
    for (const id of G.activeMissions()) G.abandon(id);

    // ---------- the HUD redesign + map size
    const need = ['.cft-me', '.cft-vitals', '[data-hpbar]', '[data-restbar]', '.cft-missions', '[data-mcount]', '.cft-hotbar', '[data-pw="water"]', '[data-pw="volt"]', '[data-pw="foam"]', '[data-bonk]', '[data-mms]', '[data-boro]', '[data-foe]', '[data-boss]', '.cft-swag'];
    const missing = need.filter(q => !document.querySelector(q));
    ok(!missing.length, 'the redesigned HUD has every piece (you, vitals, missions, hotbar, powers, map buttons, boss bar)' + (missing.length ? ': missing ' + missing.join(' ') : ''));
    ok(!!document.querySelector('.cft-vitals .cft-swag'), 'the swagger meter sits in the vitals card');
    const mm = document.querySelector('[data-mmwrap]'), w0 = mm.getBoundingClientRect().width;
    const sz1 = U.mapSize('l'); await sleep(80); const w1 = mm.getBoundingClientRect().width;
    const sz2 = U.mapSize('s'); await sleep(80); const w2 = mm.getBoundingClientRect().width;
    ok(sz1 === 'l' && sz2 === 's' && w1 > w0 && w2 < w0 && s.settings.mapSize === 's', 'map size: small / medium / large changes the minimap (' + Math.round(w2) + ' < ' + Math.round(w0) + ' < ' + Math.round(w1) + ' px) and is saved');
    U.mapSize('m');
    ok(U.mapSize() === 'l' && U.mapSize() === 's' && U.mapSize() === 'm', 'N / the ⤢ button cycles the map size');
    const hb = document.querySelector('.cft-hotbar').getBoundingClientRect(), br = document.querySelector('.cft-btns').getBoundingClientRect();
    ok(hb.right <= br.left + 2 || hb.bottom <= br.top + 2, 'the hotbar does not overlap the action buttons');

    // ---------- the crazy list + the mission cap
    for (const m of D.MISSIONS) delete s.m[m.id];
    s.camp.seen = 0; G.stepSim(20);
    ok(!G.allow('critters') && !G.allow('night') && !G.allow('mega'), 'a calm world: nothing from the crazy list before the first mission');
    G.stepSim(70);   // refreshAvailability opens what's available
    const open0 = G.openMissions().length;
    ok(open0 === 1, 'only one mission on the map at the start (' + open0 + ')');
    U.clearBanners(); s.m['c1-couch'] = { s: 'done', done: 1 }; G.stepSim(70);
    ok(G.allow('critters') && !G.allow('toys'), 'the first mission switches on the first crazy thing (animal neighbours), not the second');
    const open1 = G.openMissions().filter(id => G.MISSION[id]).length;
    ok(open1 === 3, 'after the first mission, 3 missions on the map (' + open1 + ')');
    let saw = false; for (let i = 0; i < 40 && !saw; i++) { await sleep(200); saw = /weirder/.test(document.querySelector('[data-banners]').textContent); }
    ok(saw, 'a banner announces the new crazy thing');
    markDone(16); G.stepSim(70);
    const shown = G.openMissions().filter(id => G.MISSION[id]).length + G.activeMissions().filter(id => G.MISSION[id]).length;
    ok(shown <= 5 && shown >= 1, 'never more than 5 missions on the map (' + shown + ' with 16 done)');
    const first = G.openMissions().find(id => G.MISSION[id]);
    if (first) { G.accept(first); G.stepSim(5); const tot = G.openMissions().filter(id => G.MISSION[id]).length + G.activeMissions().filter(id => G.MISSION[id]).length; ok(tot <= 5, 'taking a mission keeps the total at 5 or less (' + tot + ')'); G.abandon(first); }
    ok(G.allow('mega') && G.allow('storms') && G.allow('fire'), 'enough missions switch everything on (fires, storms, MEGA figments)');
    const mc = document.querySelector('[data-mcount]').textContent;
    ok(/on the map/.test(mc) && /weird/.test(mc), 'the HUD shows missions on the map and how weird the city is: "' + mc + '"');
    U.phone('camp'); await sleep(150);
    ok(/crazy list/i.test(document.querySelector('[data-pbody]').textContent), 'the Campaign phone app lists the crazy list');
    await ready();

    // ---------- the opening: immortal, everything chases, then home
    const home = G.homeSpot();
    s.camp.intro = 'todo'; s.camp.left = 300;
    const p0 = K.startIntro();
    for (let i = 0; i < 400 && s.camp.intro !== 'run'; i++) await sleep(150);
    for (let i = 0; i < 400 && G.state() !== 'play'; i++) await sleep(150);
    await p0;
    ok(s.camp.intro === 'run' && Math.hypot(pp.x - home.x, pp.z - home.z) > 150, 'the opening starts away from home (' + Math.round(Math.hypot(pp.x - home.x, pp.z - home.z)) + ' m)');
    ok(G.openMissions().length === 0, 'no missions on the map during the opening');
    ok(!document.querySelector('.cft-intro').hidden && /\d:\d\d/.test(document.querySelector('.cft-intro b').textContent), 'a big countdown shows (' + document.querySelector('.cft-intro b').textContent + ')');
    await ready();
    window.CFT_TEST.calm = false;
    sim(150);
    const foes = F.monsters.filter(m => m.introFoe);
    ok(foes.length >= 5 && foes.every(m => m.aggro >= 999), 'everything chases you: ' + foes.length + ' figments, aggro everywhere');
    ok(K.fires.length > 0 && !!K.storm, 'fires and a lightning storm during the opening (' + K.fires.length + ' fires)');
    const hp0 = F.hp(); F.hurt(999); ok(F.hp() === hp0 && !F.dying, 'you can\'t die during the opening');
    ok(K.useAmmo({ ammo: 3 }) && /∞/.test(document.querySelector('[data-pwn="water"]').textContent), 'infinite ammo and powers during the opening');
    // things you 'get' in the dream: money, XP (levels), a weapon, loot, a sticker, a counter
    if (s.rpg && s.rpg.loot && s.rpg.loot.length > 10) { const keep = new Set(Object.values(s.rpg.eq || {})); s.rpg.loot = s.rpg.loot.filter((x, i) => keep.has(x.id) || i < 10); }   // room in the bag (the full run fills it)
    const before = { loot: (s.rpg && s.rpg.loot || []).length, tshirt: !!s.owned.w_tshirt, stickers: JSON.stringify(s.stickers), bonks: c('bonks') };
    s.money += 777; s.xp = G.xpAt(6); s.owned.w_tshirt = true; s.equip.weapon = 'w_tshirt'; if (G.rpg) { G.rpg.drop('boss'); G.rpg.drop('chest'); } G.addSticker(); s.counters.bonks = (s.counters.bonks || 0) + 50;
    ok(G.level() >= 6 && (s.rpg.loot || []).length > before.loot, 'in the dream you level up and find things (level ' + G.level() + ', ' + (s.rpg.loot || []).length + ' loot)');
    s.camp.left = 0.5; sim(10);
    for (let i = 0; i < 400 && s.camp.intro !== 'done'; i++) await sleep(150);
    window.CFT_TEST.calm = true;
    const typed = G.xz(s.home), dHome = Math.hypot(pp.x - typed.x, pp.z - typed.z);
    ok(s.camp.intro === 'done' && dHome < 45, 'when the clock runs out you wake up at the address you typed (' + Math.round(dHome) + ' m from ' + (s.home.short || s.home.label) + ')');
    let dream = false; for (let i = 0; i < 40 && !dream; i++) { await sleep(120); const d = document.querySelector('.cft-dlg'); if (d && /fever dream/i.test(d.textContent)) dream = true; else if (d) d.click(); }
    ok(dream, 'Max explains it was all a fever dream');
    ok(s.xp === 0 && G.level() === 1 && s.money === 0, 'back to level 1 (no XP) with $0 (level ' + G.level() + ', $' + s.money + ')');
    ok(!!s.owned.w_tshirt === before.tshirt && s.equip.weapon !== 'w_tshirt' && (s.rpg.loot || []).length === before.loot && JSON.stringify(s.stickers) === before.stickers && c('bonks') === before.bonks,
      'nothing from the dream is kept: weapon, loot, stickers and counters are back to what they were');
    ok(!F.monsters.some(m => m.introFoe) && !K.storm && document.querySelector('.cft-intro').hidden && Math.abs(s.clock - 8) < 0.5, 'and the world is peaceful: no figments, no storm, a calm morning');
    for (let i = 0; i < 80 && !document.querySelector('.cft-help'); i++) { await sleep(120); const d = document.querySelector('.cft-dlg'); if (d) { const o = d.querySelector('[data-k]:not(.lock)'); if (o) o.click(); else d.click(); } }
    ok(!!document.querySelector('.cft-help'), 'then the controls card welcomes you home');
    await ready();
    clear();
    const sp0 = W.randomWalkSpot(home.x, home.z, 160, 240) || { x: home.x + 180, z: home.z }; W.teleport(sp0.x, sp0.z); sim(40);

    // ---------- ammo
    s.owned.w_balloon = true; s.equip.weapon = 'w_balloon'; if (G.rpg) G.rpg.unequip('weapon');
    const open = openSpot(); if (open) { W.teleport(open.x, open.z); sim(5); }
    s.camp.ammo = 2; await ready(); G.attack(); sim(20);
    ok(s.camp.ammo === 1, 'a ranged shot uses ammo (2 -> ' + s.camp.ammo + ')');
    s.camp.ammo = 0; const shots0 = c('shots'); sim(20); G.attack(); sim(5);
    ok(s.camp.ammo === 0 && c('shots') === shots0, 'out of ammo: no shot (you bonk with it instead)');
    K.collect({ type: 'ammo' });
    ok(s.camp.ammo >= T.ammoCrate, 'an ammo crate refills (' + s.camp.ammo + ')');
    sim(120);
    const cr = K.test.crates.filter(k => !k.dead);
    ok(cr.length > 0 && cr.every(k => Math.hypot(k.x - pp.x, k.z - pp.z) > T.crateMin * 0.7), 'ammo crates wait around town, away from you (' + cr.length + ', nearest ' + Math.round(Math.min(...cr.map(k => Math.hypot(k.x - pp.x, k.z - pp.z)))) + ' m)');
    s.equip.weapon = null;

    // ---------- powers
    clear(); await ready();
    const fx = -Math.sin(W.player.face), fz = -Math.cos(W.player.face);
    info('before powers: state ' + G.state() + ', overlays ' + [...document.querySelectorAll('.cft-ov')].map(o => o.className).join('/') + ', busy ' + G.rt.busy + ', dying ' + !!F.dying + ', ride ' + W.ride().mode + ', cd ' + (K.test.pwCd ? K.test.pwCd() : '?'));
    let m = F.spawnMonster('brute', pp.x + fx * 5, pp.z + fz * 5, { hp: 400 });
    s.camp.water = 3; const hpA = m.hp; K.power('water', true); sim(2);
    ok(m.wet > G.rt.t && m.hp < hpA && s.camp.water === 2, 'water power soaks and knocks back a figment (and uses a charge)');
    sim(20);
    const m2 = F.spawnMonster('brute', m.x + 2, m.z + 1, { hp: 400 }), hpB = m.hp, hpC = m2.hp, z0 = c('zaps');
    s.camp.volt = 2; K.power('volt', true); sim(2);
    ok(c('zaps') >= 2 && m.hp < hpB && m2.hp < hpC, 'lightning chains between figments (' + (c('zaps') - z0) + ' zapped)');
    const wetHit = hpB - m.hp;
    m.wet = 0; sim(20); const hpD = m.hp; s.camp.volt = 2; K.power('volt', true); sim(2);
    ok(wetHit > (hpD - m.hp) * 1.5, 'wet figments take more from lightning (' + wetHit.toFixed(1) + ' vs ' + (hpD - m.hp).toFixed(1) + ')');
    clear();
    const fi = K.spawnFire(pp.x + fx * 3, pp.z + fz * 3, 1);
    s.camp.foam = 100; const out0 = c('fires_out');
    ok(!!fi && K.power('foam', true), 'the extinguisher sprays while held');
    sim(60); K.power('foam', false);
    ok(!K.fires.includes(fi) && c('fires_out') === out0 + 1 && s.camp.foam < 100, 'it puts the fire out (fires_out ' + c('fires_out') + ', foam ' + Math.round(s.camp.foam) + '%)');

    // ---------- fire spreads and hurts
    window.CFT_TEST.calm = false;
    const f2 = K.spawnFire(pp.x + 6, pp.z + 6, 1.4); const n0 = K.fires.length;
    sim(400);
    ok(K.fires.length > n0, 'fire spreads (' + n0 + ' -> ' + K.fires.length + ')');
    window.CFT_TEST.calm = true;
    const f3 = K.fires[0]; F.heal(9999); const hpE = F.hp(); W.teleport(f3.x, f3.z); sim(30);
    ok(F.hp() < hpE, 'standing in a fire hurts (' + Math.round(hpE) + ' -> ' + Math.round(F.hp()) + ')');
    clear(); void f2; F.heal(9999);

    // ---------- lightning storm
    if (open) W.teleport(open.x + 30, open.z); sim(5);
    K.test.startStorm(8, true); window.CFT_TEST.calm = false;
    const sm0 = W.smashCount(); sim(260);
    ok(!K.storm, 'a storm comes and goes');
    info('the storm smashed ' + (W.smashCount() - sm0) + ' things');
    window.CFT_TEST.calm = true; F.heal(9999);

    // ---------- MEGA figments
    clear(); await ready();
    const L0 = G.level(), xp0 = s.xp;
    const mg = K.spawnMega(pp.x + 30, pp.z, null);
    const hpLow = mg.mhp;
    ok(mg.h > 12 && mg.obj.scale.x >= 9, 'a MEGA figment is bigger than a building (' + Math.round(mg.h) + ' m tall)');
    K.test.removeMega(mg);
    s.xp = G.xpAt(10); const mgHi = K.spawnMega(pp.x + 30, pp.z, null), ratio = mgHi.mhp / hpLow, want = (1 + 0.15 * 9) / (1 + 0.15 * (L0 - 1));
    ok(Math.abs(ratio - want) < 0.05, 'its health scales with your level like your damage does (x' + ratio.toFixed(2) + ', your damage x' + want.toFixed(2) + ')');
    K.test.removeMega(mgHi); s.xp = xp0;
    const mega = K.spawnMega(pp.x + 6, pp.z, null);
    mega.cd = 99;
    const w = Object.assign({}, D.SLAP, { dmg: 1 }), h0 = mega.hp;
    K.meleeHit(pp, { x: 1, z: 0 }, w, false); const bodyHit = h0 - mega.hp;
    mega.state = 'dizzy'; mega.expose = 5; sim(2);
    ok(mega.heart.visible && Math.abs(mega.hy - (W.groundAt(mega.hx, mega.hz) + 1.5)) < 0.1, 'when it\'s dizzy its glowing heart pops out at arm\'s height');
    const h1 = mega.hp; K.meleeHit(pp, { x: 1, z: 0 }, w, false); const heartHit = h1 - mega.hp;
    ok(heartHit > bodyHit * 10, 'the weak spot takes far more than its body (' + heartHit.toFixed(2) + ' vs ' + bodyHit.toFixed(2) + ')');
    ok(!document.querySelector('[data-boss]').hidden || (sim(6), !document.querySelector('[data-boss]').hidden), 'the boss bar shows its health');
    // a stomp: on the ground = hurt, in the air = JUMPED IT
    mega.expose = 0; mega.state = 'walk'; sim(2);
    F.heal(9999); let hpS = F.hp();
    mega.state = 'stomp'; mega.at = 0.05; mega.tx = pp.x; mega.tz = pp.z; mega.rings = []; W.player.grounded = true; sim(3);
    ok(F.hp() < hpS && mega.state === 'dizzy', 'its stomp hurts when you stand in the ring, then it gets dizzy');
    mega.state = 'walk'; mega.expose = 0; F.heal(9999); hpS = F.hp();
    mega.state = 'stomp'; mega.at = 0.02; mega.tx = pp.x; mega.tz = pp.z; W.player.pos.y += 2; W.player.vy = 6; W.player.grounded = false;
    G.stepSim(1);
    ok(F.hp() >= hpS - 0.01, 'jumping over the stomp avoids it');
    sim(30);
    const meg0 = c('megas'); mega.state = 'dizzy'; mega.expose = 5; sim(1); mega.hp = 0.01; K.meleeHit(pp, { x: 1, z: 0 }, w, false);
    ok(c('megas') === meg0 + 1, 'beating it counts (megas ' + c('megas') + ')');
    sim(120); clear(); F.heal(9999);

    // ---------- secrets in the tight gaps between buildings
    for (let i = 0; i < 40; i++) sim(10);
    let spots = K.spots.slice();
    if (!spots.length) { for (const sb of W.subsNear(pp.x, pp.z, 260)) K.analyse(sb); spots = K.spots.slice(); }
    info(spots.length + ' secret spots found in the loaded blocks');
    const okSpots = spots.filter(q => !W.heightAt(q.x, q.z) && q.gap >= T.secretGap[0] && q.gap <= T.secretGap[1] && q.enc >= 4 && q.out > 0);
    ok(spots.length > 0 && okSpots.length === spots.length, 'secrets sit in tight gaps you can walk into: open ground, ' + T.secretGap[0] + '-' + T.secretGap[1] + ' m between two buildings, walls on most sides, leading out to open ground (' + okSpots.length + '/' + spots.length + ')');
    if (spots.length) {
      const avgGap = spots.reduce((a, q) => a + q.gap, 0) / spots.length, avgEnc = spots.reduce((a, q) => a + q.enc, 0) / spots.length;
      info('average gap ' + avgGap.toFixed(1) + ' m, walls on ' + avgEnc.toFixed(1) + ' of 8 sides, ' + spots.filter(q => q.road > 8).length + ' more than 8 m from a street, walk-in ' + (spots.reduce((a, q) => a + q.out, 0) / spots.length).toFixed(1) + ' m on average');
      const q = spots.sort((a, b) => Math.hypot(a.x - pp.x, a.z - pp.z) - Math.hypot(b.x - pp.x, b.z - pp.z))[0];
      W.teleport(q.x, q.z); for (let i = 0; i < 4; i++) sim(8);
      await ready(); sim(12);
      let near = 1e9; for (const o of K.stash.values()) near = Math.min(near, Math.hypot(o.sp.x - pp.x, o.sp.z - pp.z));
      info('in the gap: ' + K.stash.size + ' stashes near, nearest ' + near.toFixed(1) + ' m; spot ' + q.x.toFixed(1) + ',' + q.z.toFixed(1) + ' you ' + pp.x.toFixed(1) + ',' + pp.z.toFixed(1) + '; walk-in ' + (q.out || 0).toFixed(1) + ' m; overlay ' + U.isOpen() + ' busy ' + G.rt.busy);
      const it = K.interaction(pp), sec0 = c('secrets');
      ok(!!it && /Peek/.test(it.t), 'standing in the gap: "' + (it ? it.t : 'nothing') + '"');
      if (it) { it.fn(); await sleep(200); await ready(); }
      ok(c('secrets') === sec0 + 1 && s.camp.secrets[q.id], 'opening it counts the secret and remembers it (never twice)');
      sim(12);
      ok(!K.interaction(pp) || !/Peek/.test(K.interaction(pp).t), 'a found secret does not come back');
    }

    // ---------- the bouncy world
    clear(); W.teleport(sp0.x, sp0.z); sim(20); await ready();
    let prop = null; for (let r = 2; r < 120 && !prop; r += 3) for (let a = 0; a < 6.28 && !prop; a += 0.3) { const e = W.propNear(pp.x + Math.cos(a) * r, pp.z + Math.sin(a) * r, 3); if (e && ['bench', 'bin', 'hydrant', 'box', 'planter', 'cones', 'gnome', 'flamingo', 'couch', 'cart', 'mushroom', 'picnic', 'cafe', 'vend', 'potty'].includes(e.k)) prop = e; }
    if (prop) {
      W.teleport(prop.x, prop.z); const g = W.groundAt(prop.x, prop.z); pp.set(prop.x, g + 1.0, prop.z); W.player.vy = -6; W.player.grounded = false;
      const b0 = c('bounces'); G.stepSim(1);
      ok(W.player.vy > 8 && c('bounces') === b0 + 1, 'falling onto a ' + prop.k + ' bounces you back up (vy ' + W.player.vy.toFixed(1) + ')');
      sim(60);
    } else info('no bench / bin / hydrant found to bounce on');
    const mo = F.spawnMonster('slime', pp.x + 3, pp.z, { hp: 50 }); mo.aggro = 0; sim(1);
    const top = mo.obj.position.y + mo.obj.userData.h * (mo.obj.userData.size || 1);
    pp.set(mo.x, top + 0.3, mo.z); W.player.vy = -5; W.player.grounded = false; const st0 = c('stomps'), mh = mo.hp; G.stepSim(1);
    ok(c('stomps') === st0 + 1 && mo.hp < mh && W.player.vy > 8, 'landing on a figment\'s head stomps it and bounces you');
    clear(); sim(30);
    // roofs: walkable from above
    let roof = null; for (let r = 4; r < 120 && !roof; r += 3) for (let a = 0; a < 6.28 && !roof; a += 0.4) { const x = pp.x + Math.cos(a) * r, z = pp.z + Math.sin(a) * r, y = W.roofAt(x, z); if (y != null) roof = { x, z, y }; }
    if (roof) {
      pp.set(roof.x, roof.y + 1.5, roof.z); W.player.vy = 0; W.player.grounded = false; sim(20);
      ok(Math.abs(pp.y - roof.y) < 0.6 && W.player.grounded, 'you can stand on a roof (feet at ' + pp.y.toFixed(1) + ', roof ' + roof.y.toFixed(1) + ')');
      // wall jump: off the roof, back against the wall, jump
      const g = W.groundAt(roof.x, roof.z);
      let wall = null; for (let d = 1; d < 40 && !wall; d += 0.5) for (const [ux, uz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = roof.x + ux * d, z = roof.z + uz * d; if (!W.heightAt(x, z) && !W.heightAt(x + ux, z + uz)) { wall = { x: x + ux * 0.6, z: z + uz * 0.6, ux, uz }; break; } }
      if (wall) {
        pp.set(wall.x, W.groundAt(wall.x, wall.z) + 1, wall.z); W.player.vy = 2; W.player.grounded = false;
        W.cam.yaw = Math.atan2(wall.ux, wall.uz);   // walk back towards the building
        W.input.f = 1; const wj0 = c('walljumps'), mt0 = c('mantles');
        let grabbed = false;
        for (let i = 0; i < 40 && c('walljumps') === wj0 && c('mantles') === mt0 && !grabbed; i++) { W.input.jump = true; if (W.player.climb) grabbed = true; if (W.player.grounded || W.player.vy < 0) { W.player.vy = 2; W.player.grounded = false; } G.stepSim(1); }
        W.input.f = 0; W.player.climb = null;
        ok(c('walljumps') > wj0 || c('mantles') > mt0 || grabbed, 'meeting a wall in the air: ' + (grabbed ? 'you grab it and climb' : c('mantles') > mt0 ? 'a mantle onto a low roof' : 'a wall jump'));
      } else info('no wall found next to the roof for the wall-jump check');
      void g;
    } else info('no building found for the roof check');
    sim(60);

    // ---------- the old world still works for older saves: no opening, everything already earned stays on
    const old = JSON.parse(JSON.stringify(s)); delete old.camp;
    const mig = window.CFTGame.migrate(old);
    ok(!mig.camp, 'an older save gets no opening (camp state is created as done when the game reads it)');
    const keep = s.camp; delete s.camp; for (const m of D.MISSIONS) delete s.m[m.id]; s.m['c1-couch'] = { s: 'done', done: 1 }; sim(20);
    ok(s.camp && s.camp.intro === 'done' && s.camp.veteran && G.allow('mega') && G.allow('outposts'), 'an older save keeps the whole crazy world it already had (veteran), even with one mission done');
    s.camp = keep; sim(5);
    W.controls.enabled = true;
  } catch (e) {
    out.push('FAIL exception: ' + (e && e.stack || e));
  }
  window.__campDone = true;
})();

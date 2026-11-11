// The long game (cft-rpg.js), run inside the game page by tools/live/game_test.py after funtest.js, or alone with --rpg.
// Loot and rarity, charms and their stats, the pity timer, talents and their effects, rested XP, discovery XP and treasure
// chests, reputation from what you do, achievements and titles, rare monsters, mission reward choices, the phone apps, the save.
// Results in window.__rpgOut, done flag window.__rpgDone.
window.__rpgOut = []; window.__rpgDone = false;
(async () => {
  const out = window.__rpgOut, T0 = Date.now();
  const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m + '  [' + Math.round((Date.now() - T0) / 1000) + 's]');
  const info = m => out.push('INFO ' + m);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const G = window.__cft, W = G.W, U = G.ui, s = G.save, D = G.D, R = G.rpg, X = D.RPG;
  const sim = n => G.stepSim(n);
  window.CFT_TEST = Object.assign(window.CFT_TEST || {}, { norender: true, calm: true });
  async function drain(choose) {
    for (let i = 0; i < 60; i++) {
      await sleep(70);
      const a = document.querySelector('.cft-askf'), c = document.querySelector('.cft-choose'), d = document.querySelector('.cft-dlg');
      if (a) { a.querySelector('button[type=submit]').click(); continue; }
      if (c) { const opts = [...c.querySelectorAll('[data-k]')]; const pk = choose ? opts.find(o => choose.test(o.textContent)) : null; (pk || opts[0]).click(); continue; }
      if (d) { const o = d.querySelector('[data-k]:not(.lock)'); if (o) o.click(); else d.click(); continue; }
      if (!document.querySelector('.cft-ov')) { await sleep(120); if (!document.querySelector('.cft-ov')) return; }
    }
  }
  const c = k => s.counters[k] || 0;
  const rand = Math.random;
  try {
    U.closeAll(); await drain(); G.rt.busy = false;
    for (const id of G.activeMissions()) G.abandon(id);
    ok(!!R && !!s.rpg, 'the long game is attached (G.rpg, save.rpg)');
    if (!s.m['c1-couch'] || s.m['c1-couch'].s !== 'done') s.m['c1-couch'] = { s: 'done', done: 1 };

    // ---------- loot
    const before = s.rpg.loot.length;
    const made = []; for (let q = 0; q <= 5; q++) made.push(R.make(q, 10));
    ok(made.every((it, q) => it.q === q && it.n && it.e), 'items in six qualities: ' + made.map(it => X.QUALITY[it.q].n + ' "' + it.n + '"').join(', '));
    ok(Object.keys(made[0].st).length === 0 && made[0].v > 0, 'junk has no stats but sells');
    const sum = it => Object.values(it.st).reduce((a, b) => a + b, 0);
    ok(sum(made[2]) < sum(made[3]) && sum(made[3]) < sum(made[4]) && sum(made[4]) < sum(made[5]), 'better quality, bigger stats: ' + made.slice(1).map(sum).map(v => v.toFixed(1)).join(' < '));
    ok(!!made[4].px && !!made[5].px && !made[3].px, 'Epic and Legendary items carry a perk (' + R.perkText(made[5]) + ')');
    const hi = R.make(3, 30), lo = R.make(3, 2);
    ok(sum(hi) > sum(lo) * 2, 'item level scales the stats (level 2: ' + sum(lo).toFixed(1) + ', level 30: ' + sum(hi).toFixed(1) + ')');
    s.rpg.eq = {}; R.mark();
    const charm0 = G.stat('charm');
    const it = R.add(R.make(2, 10, { focus: 'charm' }), 'test'); R.mark();
    ok(s.rpg.eq.c1 === it.id, 'a charm goes straight into an empty slot');
    ok(Math.abs(G.stat('charm') - charm0 - it.st.charm) < 0.01, 'wearing it adds its stat (Charm ' + charm0.toFixed(1) + ' -> ' + G.stat('charm').toFixed(1) + ')');
    let qs = [0, 0, 0, 0, 0, 0], drops = 0;
    s.rpg.pity = 0;
    for (let i = 0; i < 400; i++) { const d = R.drop('monster'); if (d) { drops++; qs[d.q]++; } if (s.rpg.loot.length > 25) R.sellJunk(); while (s.rpg.loot.length > 25) R.sell(s.rpg.loot.find(x => !Object.values(s.rpg.eq).includes(x.id)).id, true); }
    ok(drops > 50 && drops < 160, 'monsters drop loot about one time in five: ' + drops + ' of 400');
    ok(qs[0] > 0 && qs[2] > 0 && qs[3] > 0, 'qualities from monsters: ' + qs.map((n, q) => X.QUALITY[q].n + ' ' + n).join(', '));
    s.rpg.pity = X.PITY; Math.random = () => 0.999;  // the unluckiest rolls possible
    const pity = R.drop('chest'); Math.random = rand;
    ok(pity && pity.q >= 3, 'the pity timer: after ' + X.PITY + ' drops without one, the next is Rare or better');
    const r3 = R.drop('rare'), b4 = R.drop('boss');
    ok(r3.q >= 3 && b4.q >= 4, 'rare monsters drop Rare+, King Blob Epic+');
    const cash0 = s.money; R.add(R.make(0, 5), 'test'); R.add(R.make(0, 5), 'test');
    const sold = R.sellJunk();
    ok(sold > 0 && s.money === cash0 + sold && !s.rpg.loot.some(x => x.q === 0), 'sell junk: +' + G.fmt$(sold));
    while (s.rpg.loot.length < X.BAG) R.add(R.make(1, 3), 'test');
    const n0 = s.rpg.loot.length; R.add(R.make(4, 10), 'test');
    ok(s.rpg.loot.length === n0 && s.rpg.loot.some(x => x.q === 4), 'a full bag sells the worst item to make room for a better one');
    s.rpg.loot = s.rpg.loot.filter(x => x.q >= 3 || Object.values(s.rpg.eq).includes(x.id)); R.mark();

    // ---------- talents
    s.xp = Math.max(s.xp, G.xpAt(12)); s.rpg.tal = {}; R.mark();
    const pts = R.points();
    ok(pts === G.level() - 1, 'a talent point per level: ' + pts + ' at level ' + G.level());
    ok(!R.learn('mogul'), 'a fifth-tier talent is locked until the branch has 12 points');
    sim(3); const sp0 = W.speedMul;
    R.learn('feet'); R.learn('feet'); R.learn('feet'); sim(3);
    ok(s.rpg.tal.feet === 3 && W.speedMul > sp0 * 1.04, 'Fleet Feet 3/3: speed x' + (W.speedMul / sp0).toFixed(3));
    R.learn('hands'); R.learn('hands'); R.learn('hands');
    ok(R.learn('wallet'), 'three points in a branch open its second tier');
    const w = R.modWeapon({ dmg: 1, word: 'BONK!' });
    ok(w.dmg >= 1.3, 'Heavy Hands: bonks hit ' + Math.round(w.dmg * 100) + '%');
    ok(R.points() === pts - 7, 'points spent: ' + (pts - R.points()));
    s.money += 1000; R.respec();
    ok(R.points() === pts && !s.rpg.tal.feet, 'reset talents gives every point back (free the first time)');
    for (let i = 0; i < 9; i++) ['hands', 'feet', 'wallet', 'scav', 'wind', 'bounty', 'crit'].some(id => R.learn(id));
    info('brawler build: ' + Object.keys(s.rpg.tal).map(k => k + ' ' + s.rpg.tal[k]).join(', ') + ' · crit ' + R.bonus('crit') + ' · loot +' + R.bonus('loot'));

    // ---------- rested XP
    s.rpg.rested = 0;
    R.offline(10 * 60);
    const pool = s.rpg.rested;
    ok(pool > 0, 'ten hours away: rested for ' + Math.round(pool) + ' XP');
    const xp0 = s.xp; G.addXp(20); const got = s.xp - xp0;
    G.addXp(20, 'quest'); const quest = s.xp - xp0 - got;
    ok(got >= quest * 1.9 && s.rpg.rested < pool, 'rested doubles monster / pickup XP (' + got + ') but not mission rewards (' + quest + ')');
    R.offline(24 * 60 * 30);
    ok(s.rpg.rested <= (G.xpAt(G.level() + 1) - G.xpAt(G.level())) * 1.5 + 1, 'rest tops out at one and a half levels');

    // ---------- discovery
    const st0 = s.rpg.streets.length, bl0 = s.rpg.blocks.length, xpd = s.xp;
    let far = null;  // a block nobody has walked yet
    for (let i = 0; i < 60 && !far; i++) { const q = W.randomWalkSpot(W.player.pos.x, W.player.pos.z, 300, 800); if (q && !s.rpg.blocks.includes(G.turfIdOf(q.x, q.z))) far = q; }
    far = far || { x: W.player.pos.x + 900, z: W.player.pos.z };
    W.teleport(far.x, far.z); sim(70);
    ok(s.rpg.blocks.length > bl0 && s.xp > xpd, 'a new block: discovery XP (' + (s.xp - xpd) + ')');
    info('streets discovered: ' + s.rpg.streets.length + ' (was ' + st0 + ')');
    const chest = G.rt.pickups.find(k => k.type === 'chest' && !k.dead);
    ok(!!chest, 'a treasure chest appears on the new block');
    if (chest) { const l0 = c('loot'); W.teleport(chest.x, chest.z); sim(4); ok(c('chests') >= 1 && c('loot') > l0, 'opening it gives loot'); }

    // ---------- reputation
    const r0 = s.rpg.rep.watch || 0;
    s.counters.bonks = c('bonks') + 60; sim(40);
    ok(s.rpg.rep.watch >= r0 + 700 * 0.99, 'bonking 60 monsters: +' + Math.round(s.rpg.rep.watch - r0) + ' with the Night Watch');
    ok(R.tier(X.FACTIONS[1]) >= 1 && R.bonus('dmg') > 0, 'Friendly with the Night Watch: bonks hit harder');
    s.rpg.rep.shops = 500; const s0 = 500; s.counters.pranks = c('pranks') + 1; sim(40);
    ok((s.rpg.rep.shops || 0) < s0, 'a prank costs standing with the Shopkeepers\' Guild (' + Math.round(s0) + ' -> ' + Math.round(s.rpg.rep.shops || 0) + ')');
    const nl = s.rpg.loot.length;
    s.counters.helped = c('helped') + 60; sim(40);
    ok(R.tier(X.FACTIONS[2]) >= 2 && s.rpg.loot.length > nl && s.rpg.loot.some(x => x.n === 'Mags\' Knitted Scarf'), 'Honored with the Street Folk: an Epic charm, Mags\' Knitted Scarf');
    s.counters.flirts = c('flirts') + 200; sim(40);
    ok(R.tier(X.FACTIONS[3]) === 4 && s.rpg.titles.includes('the Heartthrob'), 'Exalted with the Hearts Club: title "the Heartthrob" and a Legendary charm');

    // ---------- achievements and titles
    sim(80);
    ok(s.rpg.ach.m25 && s.rpg.ach.ex1 && R.achPoints() > 0, 'achievements land on their own: ' + Object.keys(s.rpg.ach).length + ' earned, ' + R.achPoints() + ' points');
    R.setTitle('the Heartthrob');
    ok(s.rpg.title === 'the Heartthrob', 'wearing a title');
    R.setTitle('the Emperor of Mars');
    ok(s.rpg.title === null, 'titles you have not earned cannot be worn');
    R.setTitle('the Heartthrob');

    // ---------- rare monsters
    const T = window.CFT_TEST; T.calm = false; s.clock = 13;
    const m = R.spawnRare(X.RARES[0]);
    ok(!!m && m.def.rare && m.def.n === X.RARES[0].n && m.hp > D.MONSTERS[m.kind].hp * 3, 'a rare monster: ' + (m && m.def.n) + ' (' + (m && m.hp) + ' hit points)');
    if (m) {
      const rr0 = c('rares'), l0 = s.rpg.loot.length;
      for (let i = 0; i < 80 && !m.dead; i++) { W.teleport(m.x + 1.2, m.z); W.player.face = W.player.heading = Math.atan2(-(m.x - W.player.pos.x), -(m.z - W.player.pos.z)); G.attack(); sim(14); }
      ok(m.dead && c('rares') === rr0 + 1 && s.rpg.rares[X.RARES[0].n], 'bonked the rare');
      ok(s.rpg.loot.length > l0 && s.rpg.loot[s.rpg.loot.length - 1].q >= 3, 'it dropped ' + (s.rpg.loot[s.rpg.loot.length - 1] || {}).n + ' (' + X.QUALITY[(s.rpg.loot[s.rpg.loot.length - 1] || { q: 0 }).q].n + ')');
    }
    T.calm = true;

    // ---------- level up, mission reward choice
    const lv = G.level();
    G.addXp(G.xpAt(lv + 1) - s.xp + 5, 'quest'); await sleep(100);
    ok(G.level() === lv + 1 && R.points() >= 1, 'level ' + (lv + 1) + ': a new talent point');
    const mis = D.MISSIONS.find(x => x.ch === 3);
    s.rpg.pending = [];
    R.questDone(mis);
    ok(s.rpg.pending.length === 1 && s.rpg.pending[0].items.length === 3 && s.rpg.pending[0].items.every(x => x.q >= 2), 'finishing "' + mis.title + '" offers three charms to choose from');
    R.questDone(D.MISSIONS.find(x => x.ch === 1));
    ok(s.rpg.pending.length === 1, 'chapter 1 missions (the tutorial) do not');
    const lb = s.rpg.loot.length;
    const pc = R.claim(); await drain(/Rare|Uncommon/); await pc;
    ok(s.rpg.pending.length === 0 && s.rpg.loot.length === lb + 1, 'picked a reward: it is in your bag');

    // ---------- phone apps and HUD
    for (const app of ['hero', 'rep', 'ach']) { U.phone(app); await sleep(150); const b = document.querySelector('[data-pbody]'); ok(b && b.textContent.length > 200, 'the ' + app + ' app opens (' + b.textContent.length + ' characters)'); }
    U.phone('hero'); await sleep(100);
    const tb = document.querySelector('.cft-tal.can');
    if (tb) { const p0 = R.points(); tb.click(); await sleep(120); ok(R.points() === p0 - 1, 'tapping a talent learns it'); }
    const eb = document.querySelector('[data-act="equipc"]');
    if (eb) { const id = eb.dataset.id; eb.click(); await sleep(120); ok(Object.values(s.rpg.eq).includes(id), 'tapping Wear equips a charm from the bag'); }
    U.closeAll(); sim(10);
    ok(!!document.querySelector('[data-restbar]'), 'the XP bar shows rested XP ahead of it');

    // ---------- the save
    G.saveNow('now');
    const saved = JSON.parse(localStorage.getItem('cityfuntime.save.guest') || '{}');
    ok(saved.rpg && saved.rpg.loot.length === s.rpg.loot.length && saved.rpg.title === 'the Heartthrob' && !saved.rpg.streetSet, 'the long game is in the save (' + JSON.stringify(saved.rpg).length + ' characters)');
    ok(JSON.stringify(saved).length < 400000, 'the whole save stays small: ' + JSON.stringify(saved).length + ' characters');
  } catch (e) { out.push('EXCEPTION ' + (e && e.stack || e)); }
  Math.random = rand;
  window.CFT_TEST.norender = false; window.CFT_TEST.calm = false;
  window.__rpgDone = true;
})();
true

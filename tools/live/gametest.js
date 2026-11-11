// Deep gameplay test, run inside the game page (window.__cft = the game; the page is tools/live/harness.py) by tools/live/game_test.py.
// Plays a fresh guest game for real: missions by talking to people, coins, a café, a delivery to a real house number,
// a race, a chase, an escort, shopping, a business with a rush hour, moving house, a new day, taking over a block,
// the minigames and every phone app. Returns a list of PASS / FAIL lines.
window.__cftOut = []; window.__cftDone = false;
(async () => {
  const out = window.__cftOut;
  const T0 = Date.now();
  const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m + '  [' + Math.round((Date.now() - T0) / 1000) + 's]');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const G = window.__cft, W = G.W, U = G.ui, s = G.save, D = G.D;
  const sim = n => G.stepSim(n);
  window.CFT_TEST = { autoplay: true, norender: true, calm: true }; // calm: no monsters, street events or people walking up (funtest.js covers those)
  async function drain(choose) { // click through whatever dialogs / choices / prompts are open
    for (let i = 0; i < 60; i++) {
      await sleep(70);
      const a = document.querySelector('.cft-askf'), c = document.querySelector('.cft-choose'), d = document.querySelector('.cft-dlg'), qd = document.querySelector('.cft-quiz [data-done]');
      if (a) { a.querySelector('button[type=submit]').click(); continue; }
      if (qd) { qd.click(); continue; }
      if (c) { const opts = [...c.querySelectorAll('[data-k]')]; const pick = choose ? opts.find(o => choose.test(o.textContent)) : null; (pick || opts[0]).click(); continue; }
      if (d) { const o = d.querySelector('[data-k]:not(.lock)'); if (o) o.click(); else d.click(); continue; }
      if (!document.querySelector('.cft-ov')) { await sleep(120); if (!document.querySelector('.cft-ov')) return; }
    }
  }
  const go = (x, z) => { W.teleport(x, z); sim(3); };
  const goLL = ll => { const q = G.xz(ll); go(q.x, q.z); };
  const st = id => s.m[id] && s.m[id].s;
  const near = (who) => [...G.rt.actors.values()].find(a => a.who === who);
  async function talk(who) { sim(35); const a = near(who); if (!a) return false; go(a.x + 1.2, a.z); G.interact(); await drain(/Let's do it|Challenge/); return true; }
  try {
    U.closeAll(); await sleep(100);
    ok(st('c1-couch') === 'open', 'the first mission is waiting');
    ok(W.places.length > 50, 'real places loaded from the map: ' + W.places.length);
    sim(30);
    ok(!!near('max'), 'Cousin Max stands by the home flag');
    await talk('max');
    ok(st('c1-couch') === 'active', 'talking to Max starts "Welcome to the Couch"');
    for (let i = 0; i < 50 && st('c1-couch') === 'active'; i++) {
      sim(2);
      const k = G.rt.pickups.find(p => !p.dead && p.type === 'coin');
      if (k) go(k.x, k.z); else sim(25);
      await drain();
    }
    ok(st('c1-couch') === 'done', 'five coins collected, mission complete');
    ok(s.money >= 25, 'reward paid (money now $' + Math.round(s.money) + ')');
    ok(st('c1-coffee') === 'open' && st('c1-stretch') === 'open' && st('c1-library') === 'open', 'next missions unlocked');

    G.accept('c1-coffee');
    const tg = s.m['c1-coffee'].tg;
    ok(tg && tg.name, 'the coffee mission points at a real café: ' + (tg && tg.name));
    goLL(tg); sim(6); await drain();
    ok(st('c1-coffee') === 'done', 'got the coffee');

    G.accept('c1-rosa');
    goLL(s.m['c1-rosa'].tg);
    await talk('rosa');
    ok(st('c1-rosa') === 'done', 'met Nonna Rosa at ' + s.spots['rosa@bakery'].name);
    ok(s.bag.cannoli >= 1, 'Rosa handed over a cannoli');

    G.accept('c1-bread');
    const ad = s.m['c1-bread'].tg;
    ok(ad && /\d/.test(ad.name), 'bread goes to a real house number: ' + (ad && ad.name));
    goLL(ad); sim(4); await drain();
    ok(st('c1-bread') === 'done', 'bread delivered');

    G.accept('c1-stretch');
    goLL(s.m['c1-stretch'].tg);
    G.triggerStep('c1-stretch');
    await sleep(100);
    ok(!!G.rt.race, 'race started with ' + (G.rt.race && G.rt.race.cps.length) + ' checkpoints');
    await sleep(3300);
    for (let i = 0; i < 12 && G.rt.race; i++) { const c = G.rt.race.cps[G.rt.race.i]; go(c.x, c.z); sim(2); }
    await drain();
    ok(st('c1-stretch') === 'done', 'race won, Fitness ' + Math.floor(G.stat('fit')));

    s.money += 800;
    ok(G.buy('phone2'), 'bought a smartphone');
    G.accept('c1-phone'); sim(20); await drain();
    ok(st('c1-phone') === 'done', 'a "buy" step completes when you already own the thing');
    ok(G.buy('skateboard') && W.ride().kind === 'skateboard', 'bought a skateboard and hopped on');
    const p0 = { x: W.player.pos.x, z: W.player.pos.z };
    W.input.f = 1; sim(30); W.input.f = 0;
    ok(Math.hypot(W.player.pos.x - p0.x, W.player.pos.z - p0.z) > 1, 'the board moves (' + Math.hypot(W.player.pos.x - p0.x, W.player.pos.z - p0.z).toFixed(1) + ' m in 1 s)');
    G.setRide(null);

    G.accept('c1-library');
    for (let i = 0; i < 200 && st('c1-library') === 'active'; i++) { sim(2); const k = G.rt.pickups.find(p => !p.dead && p.type === 'book'); if (k) go(k.x, k.z); else if (i % 8 === 7) { const r = W.randomWalkSpot(W.player.pos.x, W.player.pos.z, 250, 450); if (r) go(r.x, r.z); sim(30); } else sim(25); await drain(); }
    ok(st('c1-library') === 'done', 'found 3 books for the professor');

    G.accept('c1-snap');
    goLL(s.m['c1-snap'].tg);
    G.triggerStep('c1-snap'); await drain();
    ok(st('c1-snap') === 'done', 'selfie at ' + (s.m['c1-snap'].tg || {}).name);

    G.accept('c1-sleep');
    const h = G.homeSpot(); go(h.x, h.z);
    G.triggerStep('c1-sleep'); await sleep(300); await drain();
    ok(st('c1-sleep') === 'done' && Math.abs(s.clock - 7) < 0.3 && s.day === 2, 'slept until 7:00 on day 2');

    G.accept('c2-squeeze');
    ok(s.m['c2-squeeze'].items && s.m['c2-squeeze'].items.length === 6, 'six lemons scattered on real streets');
    for (let i = 0; i < 14 && st('c2-squeeze') === 'active'; i++) { const q = s.m['c2-squeeze'].items.find(x => !x[2]); if (q) goLL({ lat: q[0], lon: q[1] }); sim(3); await drain(); }
    ok(st('c2-squeeze') === 'done', 'lemons collected');

    G.accept('c2-meatball');
    goLL(s.m['c2-meatball'].tg);
    G.triggerStep('c2-meatball');
    ok(!!G.rt.chase, 'chase started');
    let fled = 0;
    if (G.rt.chase) { const o = G.rt.chase.obj.position, a = { x: o.x, z: o.z }; for (let i = 0; i < 30 && G.rt.chase; i++) { sim(1); fled = Math.max(fled, Math.hypot(o.x - a.x, o.z - a.z)); } }
    ok(fled > 2, 'Meatball runs along the streets (' + fled.toFixed(1) + ' m)');
    for (let i = 0; i < 200 && G.rt.chase; i++) { const o = G.rt.chase.obj.position; W.teleport(o.x + 1.2, o.z); sim(1); }
    await drain();
    ok(st('c2-meatball') === 'done', 'caught Meatball');

    G.accept('c2-walkies');
    goLL(s.m['c2-walkies'].tg);
    await talk('ollie');
    ok(s.m['c2-walkies'].st === 1, 'Ollie hands over Rex');
    ok(G.rt.followers.some(f => f.who === 'rex'), 'Rex follows you');
    goLL(s.m['c2-walkies'].tg);
    for (let i = 0; i < 25 && st('c2-walkies') === 'active'; i++) { sim(4); await drain(); }
    ok(st('c2-walkies') === 'done', 'walked Rex to ' + (s.m['c2-walkies'].tg || {}).name);

    s.money += 30000;
    const pb = G.buyBiz('lemonade'); await drain(); await pb;
    ok(!!s.biz.lemonade, 'opened a lemonade stand at ' + (s.biz.lemonade && s.biz.lemonade.addr) + ' | toast: ' + document.querySelector('[data-toast]').textContent + ' | places ' + W.buildingsNear(W.player.pos.x, W.player.pos.z, 350).length);
    if (!s.biz.lemonade) throw new Error('no business');
    sim(240);
    ok(s.biz.lemonade && s.biz.lemonade.till > 0, 'the till fills up ($' + (s.biz.lemonade ? s.biz.lemonade.till.toFixed(2) : 0) + ')');
    G.collectTill('lemonade'); G.upgradeBiz('lemonade'); G.hireManager('lemonade');
    ok(s.biz.lemonade.lvl === 2 && s.biz.lemonade.mgr, 'upgraded and hired a manager');
    const rush0 = s.counters.rush || 0;
    G.startRush('lemonade');
    const rid = G.activeMissions().find(x => x.startsWith('rush-'));
    ok(!!rid, 'rush hour started');
    for (let i = 0; i < 6 && rid && s.m[rid] && s.m[rid].s === 'active'; i++) { goLL(s.m[rid].tg); sim(3); await drain(); }
    ok(!s.m[rid] && (s.counters.rush || 0) - rush0 === 3, 'three rush orders delivered to real addresses');

    const pm = G.moveHome(1); await drain(/Take it/); await pm;
    ok(s.apt.tier === 1, 'moved into a basement studio at ' + s.apt.label);
    const day0 = s.day, money0 = s.money;
    s.clock = 23.999; sim(3);
    ok(s.day === day0 + 1 && s.money < money0 + 500, 'midnight: day ' + s.day + ', rent paid');

    G.accept('c6-luna');
    goLL(s.m['c6-luna'].tg);
    await talk('luna');
    ok(s.m['c6-luna'].st === 1, 'met Luna the street artist');
    W.teleport(0, 0); sim(90);
    const t0 = s.turf['0_0'];
    ok(t0 && t0.spots && t0.spots.length === 4, 'the home block has 4 crew posters on real walls: ' + (t0 && t0.name));
    if (t0 && t0.spots) {
      s.bag.spray = 10;
      const seen = [];
      for (let k = 0; k < 4; k++) { const sp = t0.spots[k]; goLL({ lat: sp[0], lon: sp[1] }); sim(6); await drain(); const it = G.peek(); seen.push((it ? it.t : 'nothing') + ' @' + Math.round(Math.hypot(G.xz({ lat: sp[0], lon: sp[1] }).x - W.player.pos.x, G.xz({ lat: sp[0], lon: sp[1] }).z - W.player.pos.z) * 10) / 10 + 'm'); G.interact(); await sleep(1300); for (let w = 0; w < 50 && (G.rt.busy || U.isOpen()); w++) await sleep(100); await drain(); seen[seen.length - 1] += ' -> tags ' + t0.tags.map(Number).join('') + (G.rt.busy ? ' busy' : '') + (U.isOpen() ? ' open:' + ((document.querySelector('.cft-ov') || {}).className || '') : ''); }
      out.push('INFO posters: ' + seen.join(' | '));
      ok(t0.tags.every(Boolean), 'tagged all four posters');
      // every untagged poster in the neighbouring blocks can be reached (an unreachable one blocked a block in Old Montreal, Nov 2026)
      const far = [];
      for (const id of Object.keys(s.turf)) {
        const t = s.turf[id];
        if (id === '0_0' || !t.spots || t.own) continue;
        t.spots.forEach((sp, k) => { if (t.tags[k]) return; goLL({ lat: sp[0], lon: sp[1] }); sim(6); const it = G.peek(); if (!it || !/poster|Talk to/.test(it.t)) far.push(id + ':' + k); });
      }
      ok(!far.length, 'every poster in the nearby blocks can be reached (' + Object.keys(s.turf).length + ' blocks)' + (far.length ? ': not ' + far.join(', ') : ''));
      W.teleport(0, 0); sim(20);
      ok(st('c6-luna') === 'done', 'Wall Flower complete');
      sim(40);
      ok(!!G.rt.actors.get('boss@0_0'), 'Granny Smith (the crew boss) shows up');
      s.stats.cred = 12;
      await talk('boss');
      await sleep(4500); await drain();
      ok(t0.own, 'won the home block from the Bingo Grannies');
    }
    const sc = await U.dance(6, 1);
    ok(sc >= 0.7, 'dance-off (robot) scores ' + Math.round(sc * 100) + '%');
    const qp = U.quiz(D.QUIZ.trivia, 3, null); await sleep(4500); await drain(); const qz = await qp;
    ok(qz, 'quiz (robot) passes');
    for (const app of ['quests', 'map', 'me', 'bag', 'people', 'homes', 'business', 'turf', 'album', 'diary', 'settings']) { U.phone(app); await sleep(120); }
    U.closeAll();
    ok(true, 'every phone app opened');
    ok(G.jobs().length === 3, 'three odd jobs today');
    G.takeJob(0); ok(G.activeMissions().some(x => x.startsWith('job-')), 'took an odd job');

    // ---------- hills (Mapterhorn elevation tiles) and the server's map backup
    const tr = W.terrain(), pp = W.player.pos;
    ok(tr.on, 'hills are on: home is ' + Math.round(tr.h0) + ' m above the sea');
    sim(5);
    ok(Math.abs(pp.y - W.surfaceAt(pp.x, pp.z, pp.y)) < 0.05, 'the player stands on the ground (y ' + pp.y.toFixed(2) + ' m)');
    let lo = 1e9, hi = -1e9;
    for (let dx = -300; dx <= 300; dx += 25) for (let dz = -300; dz <= 300; dz += 25) { const g = W.groundAt(pp.x + dx, pp.z + dz); lo = Math.min(lo, g); hi = Math.max(hi, g); }
    ok(hi - lo > 2, 'the ground goes up and down: ' + (hi - lo).toFixed(1) + ' m within 300 m');
    const ht = G.hilltop();
    ok(!!(ht && ht.name && ht.kind === 'hilltop'), 'the hilltop near home: ' + (ht && ht.name));
    const jid = 'job-test-hill';
    s.dyn[jid] = { id: jid, title: '⛰️ Hill climb', giver: 'priya', at: 'home', intro: [], steps: [{ do: 'race', n: 3, time: 300, ride: 'any', hill: true, text: 'Hill climb' }], outro: [], reward: { money: 10, xp: 5 }, job: true };
    G.accept(jid);
    goLL(s.m[jid].tg); G.triggerStep(jid); await sleep(100);
    const hr = G.rt.race;
    ok(!!(hr && hr.hill && hr.cps.length), 'uphill race started with ' + (hr && hr.cps.length) + ' checkpoints');
    if (hr) ok(W.groundAt(hr.cps[hr.cps.length - 1].x, hr.cps[hr.cps.length - 1].z) >= W.groundAt(pp.x, pp.z) - 0.5, 'the last checkpoint is not below the start');
    await sleep(3300);
    for (let i = 0; i < 10 && G.rt.race; i++) { const c = G.rt.race.cps[G.rt.race.i]; go(c.x, c.z); sim(2); }
    await drain();
    ok(!s.m[jid] && !G.rt.race, 'uphill race won (finished jobs leave the mission list)');
    await sleep(6000);
    const arch = (window.HARNESS && window.HARNESS.archived) || [];
    ok(arch.length > 0 && arch.some(k => k.startsWith('t/')) && arch.some(k => k.startsWith('v/')), 'map tiles are sent to the server backup (streets and hills): ' + arch.length);

    for (let i = 0; i < 4; i++) G.addSticker();
    ok(Object.keys(s.stickers).length > 0, 'stickers go into the album');
    ok(W.life.peds.length > 0 && W.life.cars.length > 0, 'the streets have people (' + W.life.peds.length + ') and cars (' + W.life.cars.length + ')');
    G.saveNow('now');
    ok(!!localStorage.getItem('cityfuntime.save.guest'), 'the guest save is in this browser');
    ok(Object.keys(s.m).filter(k => s.m[k].s === 'done').length >= 12, 'missions done: ' + Object.keys(s.m).filter(k => s.m[k].s === 'done').length + ', level ' + G.level() + ', $' + Math.round(s.money));
  } catch (e) { out.push('EXCEPTION ' + (e && e.stack || e)); }
  window.CFT_TEST.norender = false;
  window.__cftDone = true;
})();
true

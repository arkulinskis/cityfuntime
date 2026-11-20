/* City Fun Time: the main character update (2026-11-17). The user: "the player needs to feel their ego massively boosted
   while playing... have other characters flirt with them and give compliments... a lot of text across the screen to give
   back that dopamine hit. Missions on the map with an arrow and a big letter like in GTA. Tim Hortons (Tom Hearton's) and
   grocery stores to take over for energy and health, like Far Cry. Destroy things (they stay destroyed for the session).
   Drive cars destroying things." This file is the glue for all of it:

   - The hype: big words across the screen (H.word), compliments and flirts that slide across it (H.ticker), passers-by who
     compliment you out loud, cheer after fights, ask for selfies (fans) and bring you gifts (gear). Setting: save.settings.hype
     'max' (default) | 'some' | 'off'.
   - Swagger: a meter that fills from fights, parries, smashes, missions and being adored. Full = MAIN CHARACTER MODE for 25 s
     (faster, stronger, a golden glow, the whole street stares).
   - Outposts (Far Cry): every Tom Hearton's (Tim Hortons on the map, plus made-up ones) and every grocery store starts
     occupied by figments. Clear the pack (a captain + 3-6 more) = liberated for good: +5 max energy (Tom Hearton's) or
     +5 max health (grocery), a free double-double / snack bag once a day, gear, a party.
   - Mission blips (GTA): a light pillar and a big letter over everyone with a mission, and on-screen pointers with the
     distance that stick to the screen edge when the target is off-screen. (The minimap letters are in cft-ui.js.)
   - Borrowed cars: E next to a parked car; V parks it again (cft-game.js calls H.borrow / H.park).

   const H = CFTHero.attach(G, api)   (cft-game.js, after G.rpg; G.hero = H)
   H.tick(dt, paused) · H.event(name, o) · H.word(text, tone, sub) · H.ticker(text, who) · H.speedMul() · H.dmgMul()
   H.energyBonus() · H.hpBonus() · H.interaction(p) · H.placeGate(place) · H.markers(list) · H.signInfo(place, info)
   H.outpostKill(monster) · H.borrow(car) · H.park() · H.summary() · H.destroy()
   State: save.hero {swag, fans, out {placeId: day liberated}, free {placeId: day used}, gifts, mains}. */
(function () {
'use strict';

function attach(G, api) {
  const D = G.D, W = G.W, U = G.ui, THREE = W.THREE, HY = D.HYPE, TH = D.TUNE.hype, TO = D.TUNE.outposts, SW = D.TUNE.hype.swag;  // knobs: D.TUNE
  const save = () => G.save;
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const P = () => W.player.pos;
  const LOW = !W.renderer.shadowMap.enabled;
  const calm = () => !!(window.CFT_TEST && window.CFT_TEST.calm);
  const quiet = () => G.rt.busy || U.isOpen() || G.state() !== 'play';
  const onStory = () => G.storyOn ? G.storyOn() : !!(save().m['c1-couch'] && save().m['c1-couch'].s === 'done');  // also true in the campaign's opening chaos
  const H = {};
  let alive = true, compT = 9, fanT = 70 + Math.random() * 60, giftT = 150 + Math.random() * 90, slowT = 0, outT = 0, blipT = 0, mainT = 0, mainFx = 0, swagUi = 0;
  let killStreak = 0, killT = -99, smashStreak = 0, smashT = -99, mainLight = null, fan = null;
  const packs = new Map();  // placeId -> {pl, mons: [], started}

  function st() {
    const s = save();
    if (!s.hero || typeof s.hero !== 'object') s.hero = {};
    const h = s.hero;
    if (typeof h.swag !== 'number') h.swag = 0;
    if (typeof h.fans !== 'number') h.fans = 0;
    for (const k of ['out', 'free']) if (!h[k] || typeof h[k] !== 'object') h[k] = {};
    return h;
  }
  const level = () => { const v = save().settings.hype; return v === 'off' ? 0 : v === 'some' ? 1 : 2; };
  const name = () => save().name || 'friend';
  const fill = t => String(t).replace(/\{name\}/g, name()).replace(/\{NAME\}/g, name().toUpperCase());
  const bump = (k, n) => api.bump(k, n);

  // ------------------------------------------------------------------ the overlay: big words, the compliment ticker, swagger, pointers
  const shell = U.canvas.parentElement;
  const layer = document.createElement('div');
  layer.className = 'cft-hero';
  layer.innerHTML = '<div class="cft-blips" data-blips></div><div class="cft-ticker" data-ticker></div><div class="cft-hype" data-hype></div>';
  shell.insertBefore(layer, U.canvas.nextSibling);
  if (!LOW && !W.post) { const v = document.createElement('div'); v.className = 'cft-vignette'; shell.insertBefore(v, layer); }  // a soft vignette: the "graded" look
  const hypeBox = layer.querySelector('[data-hype]'), tickBox = layer.querySelector('[data-ticker]'), blipBox = layer.querySelector('[data-blips]');
  const tl = shell.querySelector('.cft-tl');
  const swagEl = document.createElement('button');
  swagEl.type = 'button'; swagEl.className = 'cft-meter cft-swag'; swagEl.title = 'Swagger: fill it up for MAIN CHARACTER MODE';
  swagEl.innerHTML = '<span>✨</span><div class="cft-bar sw"><i data-swbar></i></div><b data-swtext></b>';
  { const mt = shell.querySelector('[data-meters]'); if (mt) mt.appendChild(swagEl); else if (tl) tl.insertBefore(swagEl, tl.children[1] || null); }  // the HUD's vitals card (2026-11-18)
  swagEl.addEventListener('click', () => U.toast(H.mainOn() ? '✨ MAIN CHARACTER MODE! Everyone is watching.' : '✨ Swagger ' + Math.round(st().swag) + '/100. Fight, parry, smash and get adored. Full = MAIN CHARACTER MODE.'));

  // H.word('UNSTOPPABLE!', 'gold' | 'pink' | 'mint' | 'red' | 'violet', 'a smaller line')
  let wordN = 0;
  H.word = function (text, tone, sub, big) {
    if (!level() || !alive) return;
    if (hypeBox.children.length >= 3) hypeBox.firstChild.remove();
    const el = document.createElement('div');
    el.className = 'cft-hw ' + (tone || 'gold') + (big ? ' big' : '');
    el.style.setProperty('--tilt', ((wordN++ % 2 ? 1 : -1) * (2 + Math.random() * 3)).toFixed(1) + 'deg');
    el.innerHTML = '<b></b>' + (sub ? '<span></span>' : '');
    el.querySelector('b').textContent = text;
    if (sub) el.querySelector('span').textContent = sub;
    hypeBox.appendChild(el);
    setTimeout(() => el.remove(), big ? 2300 : 1700);
  };
  // H.ticker('You look amazing!', 'Maya'): a compliment slides across the screen
  let lane = 0;
  H.ticker = function (text, who, e) {
    if (!level() || !alive) return;
    if (tickBox.children.length >= 4) tickBox.firstChild.remove();
    const el = document.createElement('div');
    el.className = 'cft-tk l' + (lane++ % 3);
    el.innerHTML = '<i></i><b></b><span></span>';
    el.querySelector('i').textContent = e || '💬';
    el.querySelector('b').textContent = who ? who + ':' : '';
    el.querySelector('span').textContent = fill(text);
    tickBox.appendChild(el);
    setTimeout(() => el.remove(), 7600);
  };
  const someone = () => pick(D.CRUSH_NAMES || ['Someone']);

  // ------------------------------------------------------------------ swagger and main character mode
  H.mainOn = () => mainT > 0;
  H.speedMul = () => (mainT > 0 ? TH.mainSpeed : 1);
  H.dmgMul = () => (mainT > 0 ? TH.mainDmg : 1);
  function swag(n) {
    const h = st();
    if (mainT > 0 || !onStory()) return;
    h.swag = clamp(h.swag + n * (level() === 0 ? 0.6 : 1), 0, 100);
    if (h.swag >= 100) mainMode();
  }
  H.swag = swag;
  function mainMode() {
    const h = st();
    h.swag = 0; h.mains = (h.mains || 0) + 1;
    mainT = TH.mainSecs;
    bump('maincharacter');
    H.word(pick(HY.mainOn), 'violet', '25 seconds: faster, stronger, adored', true);
    U.confetti(); G.sfx.level();
    if (!mainLight) { mainLight = new THREE.PointLight(0xffd36b, 0, 14, 1.6); mainLight.position.set(0, 2.2, 0); W.avatar.add(mainLight); }
    const p = P();
    W.burst(p.x, p.y + 1, p.z, '✨', 16, { spread: 4, up: 6 });
    for (const ped of W.life.peds) { const o = ped.obj.position; if (Math.hypot(o.x - p.x, o.z - p.z) < 30 && !ped.ctl) { W.holdPed(ped, 3, Math.random() < 0.5 ? 'dance' : 'wave'); if (Math.random() < 0.4) W.say(ped.obj, fill(pick(HY.mainLines)), 2.6); } }
    G.log('Went full main character', '✨');
  }

  // ------------------------------------------------------------------ events from the rest of the game
  H.event = function (ev, o) {
    if (!alive) return;
    o = o || {};
    const p = P();
    switch (ev) {
      case 'kill': {
        const m = o.m || {}, big = m.champ || m.guard || (m.def && (m.def.boss || m.def.rare)) || m.outpost;
        killStreak = G.rt.t - killT < 4.5 ? killStreak + 1 : 1; killT = G.rt.t;
        const w = HY.kills.filter(k => k[0] === killStreak).pop();
        if (w) H.word(w[1], killStreak >= 5 ? 'violet' : 'gold', killStreak + ' in a row');
        else if (big) H.word(pick(['HUGE!', 'BOSS MOVE!', 'INCREDIBLE!', 'WHAT A HIT!']), 'gold');
        swag(big ? SW.bigKill : SW.kill);
        cheer(p, big ? 0.9 : 0.35);
        break;
      }
      case 'parry': H.word(pick(HY.parry), 'gold', 'next hit counters ×' + D.COMBAT.counter); swag(SW.parry); cheer(p, 0.6); break;
      case 'dodge': if (Math.random() < 0.5) H.word(pick(HY.dodge), 'mint'); swag(SW.dodge); break;
      case 'block': swag(SW.block); break;
      case 'combo': { const w = HY.combo.filter(k => k[0] === o.n).pop(); if (w) H.word(w[1], o.n >= 8 ? 'violet' : 'pink'); swag(SW.combo); break; }
      case 'smash': {
        smashStreak = G.rt.t - smashT < 6 ? smashStreak + 1 : 1; smashT = G.rt.t;
        const w = HY.smashStreak.filter(k => k[0] === smashStreak).pop();
        if (w) H.word(w[1], 'pink', smashStreak + ' smashed');
        else if (o.wreck) H.word('KABOOM!', 'red');
        swag(o.wreck ? SW.wreck : SW.smash);
        break;
      }
      case 'mission': H.word(pick(HY.mission), 'gold', (o.m && o.m.title) || '', true); swag(SW.mission); later(1200, () => H.ticker(pick(HY.hero), someone(), '🌟')); cheer(p, 1); break;
      case 'level': H.word(pick(HY.level), 'violet', 'Level ' + o.lv, true); swag(SW.level); later(900, () => H.ticker('Level ' + o.lv + '?! You keep getting better, {name}!', someone(), '⭐')); break;
      default: break;
    }
  };
  function cheer(p, chance) {
    if (!level() || Math.random() > chance) return;
    let n = 0;
    for (const ped of W.life.peds) {
      if (n >= 2 || ped.ctl) break;
      const o = ped.obj.position;
      if (Math.hypot(o.x - p.x, o.z - p.z) > 22) continue;
      W.holdPed(ped, 2, Math.random() < 0.5 ? 'wave' : 'dance');
      W.say(ped.obj, fill(pick(HY.cheers)), 1.8);
      W.burst(o.x, o.y + 2.2, o.z, '👏', 3, { spread: 1.2, up: 2.5, size: 0.45 });
      n++;
    }
    if (n && Math.random() < 0.5) later(500, () => H.ticker(pick(HY.hero), someone(), '👏'));
  }
  const later = (ms, fn) => setTimeout(() => { if (alive) fn(); }, ms);

  // ------------------------------------------------------------------ people adore you: compliments, flirts, fans, gifts
  function nearPed(r, notCtl) {
    const p = P(), list = W.life.peds.filter(ped => !ped.ctl && !(ped.hold > 0) && ped.obj.parent && Math.hypot(ped.obj.position.x - p.x, ped.obj.position.z - p.z) < r);
    return list.length ? pick(list) : null;
  }
  function compliment() {
    const ped = nearPed(17);
    if (!ped) return;
    const s = save(), flirty = !s.married && !(G.fun && G.fun.noFlirt(ped)) && Math.random() < TH.flirtShare, heroic = G.rt.t - killT < 20 && Math.random() < 0.5;
    const line = fill(pick(heroic ? HY.hero : flirty ? HY.flirts : HY.compliments));
    W.holdPed(ped, 2.6, Math.random() < 0.6 ? 'wave' : null);
    W.say(ped.obj, line, 3.2);
    if (flirty) { const o = ped.obj.position; W.burst(o.x, o.y + 2.2, o.z, '💕', 3, { spread: 1, up: 2, size: 0.45 }); }
    H.ticker(line, someone(), flirty ? '😘' : heroic ? '🌟' : '💬');
    bump('compliments');
    swag(SW.compliment);
    if (Math.random() < 0.3) G.addHappy(1);
  }
  // a fan comes running for a selfie, or an admirer brings you a present (gear)
  function startFan(gift) {
    const ped = nearPed(34);
    if (!ped) return false;
    ped.ctl = true;
    fan = { ped, t: 0, gift, phase: 'run' };
    return true;
  }
  function updateFan(dt) {
    if (!fan) return;
    const f = fan, ped = f.ped, o = ped.obj.position, p = P();
    f.t += dt;
    if (!ped.obj.parent || f.t > 14) { endFan(); return; }
    if (f.phase === 'run') {
      const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz);
      if (d > 2.1) {
        const sp = Math.min(d, 7 * dt);
        o.x += dx / d * sp; o.z += dz / d * sp; o.y = W.groundAt(o.x, o.z);
        ped.obj.rotation.y = Math.atan2(-dx, -dz);
        W.animate(ped.fig, 7, dt);
        if (f.t > 0.4 && !f.called) { f.called = true; W.say(ped.obj, f.gift ? 'Wait! I have something for you!' : fill(pick(HY.selfie)), 2.4); }
        return;
      }
      f.phase = 'meet'; f.t2 = 0;
      ped.obj.rotation.y = Math.atan2(-(p.x - o.x), -(p.z - o.z));
      if (f.gift) giveGift(ped);
      else {
        const h = st(); h.fans++;
        bump('fans');
        U.flash(); G.sfx.pick && G.sfx.pick();
        W.burst(o.x, o.y + 2, o.z, '📸', 4, { spread: 1.5, up: 2.5 });
        W.say(ped.obj, pick(['EEEE! Thank you!!', 'Posting this RIGHT now!', 'Best day ever!', 'You\'re so nice in real life!']), 2.6);
        H.word('+1 FAN', 'pink', h.fans + ' fan' + (h.fans === 1 ? '' : 's') + ' and counting');
        swag(SW.fan); G.addHappy(2);
      }
    }
    if (f.phase === 'meet') {
      f.t2 += dt;
      W.animate(ped.fig, 0, dt, f.t2 < 2.5 ? 'wave' : null);
      if (f.t2 > 3) endFan();
    }
  }
  function endFan() {
    if (!fan) return;
    const ped = fan.ped;
    if (ped.obj.parent) { const ag = W.agentOn(ped.obj.position.x, ped.obj.position.z, false); if (ag) ped.a = ag; ped.hold = 0.5; }
    ped.ctl = false;
    fan = null;
  }
  function giveGift(ped) {
    const R = G.rpg;
    W.say(ped.obj, fill(pick(HY.gift)), 3);
    const h = st(); h.gifts = (h.gifts || 0) + 1;
    bump('gifts');
    if (!R) { G.addMoney(Math.round(rnd(8, 20)), 'a gift'); return; }
    const x = Math.random(), q = x < 0.04 ? 4 : x < 0.22 ? 3 : x < 0.6 ? 2 : 1;
    const slot = pick(['hand', 'hand', 'head', 'body', 'feet', 'weapon']);
    const it = R.add(R.make(q, Math.max(1, G.level() + (q >= 3 ? 1 : 0)), { slot }), 'gift');
    if (it) { H.word('🎁 A GIFT FOR YOU', 'pink', it.n); U.banner('🎁 ' + it.n, 'A present from an admirer. Phone → Character to wear it.', 'loot q' + Math.max(1, it.q)); }
    swag(SW.gift); G.addHappy(3);
  }

  // ------------------------------------------------------------------ outposts: Tom Hearton's and grocery stores
  const OUT = D.OUTPOSTS;
  const isOutpost = pl => !!pl && !!OUT[pl.kind] && !!pl.pin;
  H.isOutpost = isOutpost;
  H.liberated = pl => !!st().out[pl.id];
  // +5 per liberated place, capped (there are dozens of groceries in a city): D.OUTPOSTS[kind].cap
  const freed = kind => { let n = 0; const h = st(), ok = h.outKind || {}; for (const id of Object.keys(h.out)) if (h.out[id] && ok[id] === kind) n++; return n; };
  H.energyBonus = () => Math.min(OUT.hearton.cap || 1e9, freed('hearton') * OUT.hearton.bonus);
  H.hpBonus = () => Math.min(OUT.grocery.cap || 1e9, freed('grocery') * OUT.grocery.bonus);
  function outpostTick() {
    if (!onStory() || calm() || !G.allow('outposts') || (window.CFT_TEST && window.CFT_TEST.outposts === false)) return;  // older test suites switch them off; the campaign switches them on
    const p = P(), home = G.homeSpot();
    for (const pl of W.places) {
      if (!isOutpost(pl) || st().out[pl.id] || packs.has(pl.id)) continue;
      if (Math.hypot(pl.pin.x - home.x, pl.pin.z - home.z) < TO.homeCalm) continue;  // home is always calm
      const d = Math.hypot(pl.pin.x - p.x, pl.pin.z - p.z);
      if (d > TO.range) continue;
      if (packs.size >= TO.maxPacks || [...packs.values()].some(k => Math.hypot(k.pl.pin.x - pl.pin.x, k.pl.pin.z - pl.pin.z) < 50)) continue;  // two fights at most, one per corner
      spawnPack(pl);
    }
    for (const [id, k] of packs) {
      k.mons = k.mons.filter(m => G.fun.monsters.includes(m) && !m.dead);
      if (Math.hypot(k.pl.pin.x - p.x, k.pl.pin.z - p.z) > 150) { for (const m of k.mons) G.fun.removeMonster(m, false); packs.delete(id); W.refreshSign(id); }
    }
  }
  function spawnPack(pl) {
    const F = G.fun, o = OUT[pl.kind];
    if (!F) return;
    const h = save().clock, night = h >= 21.5 || h < 5;
    const kinds = Object.keys(D.MONSTERS).filter(k => D.MONSTERS[k].w > 0 && !D.MONSTERS[k].boss && (night || !D.MONSTERS[k].night));
    const n = TO.packMin + Math.min(TO.packMax - TO.packMin, Math.floor(G.level() / 3)), mons = [];
    const home = { x: pl.pin.x, z: pl.pin.z };
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, r = 3 + Math.random() * 4;
      let x = home.x + Math.cos(a) * r, z = home.z + Math.sin(a) * r;
      if (W.heightAt(x, z)) { x = home.x; z = home.z; }
      const m = F.spawnMonster(pick(kinds), x, z, { outpost: pl.id, home, leash: TO.leash, aggro: 19, event: 1e9 });
      if (m) mons.push(m);
    }
    const ck = pick(kinds), base = D.MONSTERS[ck];
    const def = Object.assign({}, base, { n: (D.OUTPOST_CAPTAIN[pl.kind] || 'Captain') + ' (' + F.localName(ck) + ')', night: false, steal: [0, 0], xp: base.xp * 4 });
    const cap = F.spawnMonster(ck, home.x, home.z, { def, hp: base.hp * TO.captainHp, size: 1.6, atkMul: TO.captainAtk, outpost: pl.id, home, leash: TO.leash, aggro: 21, event: 1e9, lvl: F.monsterLevel(home.x, home.z) + 1 });
    if (cap) { cap.champ = true; cap.xpv *= 2; mons.push(cap); const tag = W.label('😈 ' + def.n, { size: 32, height: 0.46, bg: 'rgba(200,16,46,.94)', fg: '#ffffff', border: '#5a0714' }); tag.position.y = 2.5; cap.obj.add(tag); }
    packs.set(pl.id, { pl, mons, started: G.rt.t });
    W.refreshSign(pl.id);
    U.banner(o.e + ' Figments hold ' + (pl.name || o.n) + '!', 'Clear them all out: +' + o.bonus + ' max ' + o.what + ' for good, and ' + o.free.replace(/^\S+\s/, '').replace(/\s*\(.*\)/, '') + ' every day.', 'fail');
    G.sfx.fail();
  }
  H.outpostKill = function (m) {
    const k = packs.get(m.outpost);
    if (!k) return;
    k.mons = k.mons.filter(x => x !== m && G.fun.monsters.includes(x) && !x.dead);
    if (k.mons.length) { if (k.mons.length <= 2) H.word(k.mons.length + ' LEFT!', 'mint'); return; }
    liberate(k.pl);
  };
  function liberate(pl) {
    const h = st(), o = OUT[pl.kind], s = save();
    packs.delete(pl.id);
    h.out[pl.id] = s.day;
    if (!h.outKind) h.outKind = {};
    h.outKind[pl.id] = pl.kind;
    bump('liberated'); bump('lib_' + pl.kind);
    W.refreshSign(pl.id);
    const capped = (o.what === 'energy' ? H.energyBonus() : H.hpBonus()) >= (o.cap || 1e9) && freed(pl.kind) * o.bonus > o.cap;
    H.word(pick(HY.outpost), 'gold', (pl.name || o.n) + (capped ? ' · the free treat is yours' : ' · +' + o.bonus + ' max ' + o.what), true);
    U.confetti(); G.sfx.level();
    if (o.what === 'energy') s.energy = G.maxEnergy(); else if (G.fun) G.fun.heal(9999);
    U.banner(o.e + ' ' + (pl.name || o.n) + ' is free!', pick(o.thanks) + ' (+' + o.bonus + ' max ' + o.what + ', for good)', 'done');
    G.log('Liberated ' + (pl.name || o.n), o.e);
    G.giveItem(o.freeItem, 2);
    if (G.rpg) G.rpg.drop('chest', { minQ: 2 });
    G.addXp(60 + G.level() * 10, 'quest');
    swag(SW.outpost);
    for (const ped of W.life.peds) { const q = ped.obj.position; if (Math.hypot(q.x - pl.pin.x, q.z - pl.pin.z) < 35 && !ped.ctl) { W.holdPed(ped, 4, 'dance'); if (Math.random() < 0.4) W.say(ped.obj, fill(pick(HY.cheers)), 2.4); } }
    W.burst(pl.pin.x, W.groundAt(pl.pin.x, pl.pin.z) + 2, pl.pin.z, '🎉', 14, { spread: 5, up: 7 });
    later(1600, () => H.ticker('You freed ' + (pl.name || o.n) + '! You\'re amazing, {name}!', someone(), o.e));
    G.dirty(true);
  }
  // E at a liberated outpost: the free daily treat; at an occupied one: a nudge
  H.placeGate = function (pl) {
    if (!isOutpost(pl)) return null;
    const h = st(), o = OUT[pl.kind], s = save();
    if (packs.has(pl.id) && !h.out[pl.id]) return { t: '😈 ' + (pl.name || o.n) + ': figments inside!', fn: () => U.toast('Clear out the figments first (F to bonk, hold G to block). The minimap shows them.') };
    if (h.out[pl.id] && h.free[pl.id] !== s.day) return { t: o.free, fn: () => {
      h.free[pl.id] = s.day;
      if (o.what === 'energy') { s.energy = G.maxEnergy(); G.giveItem(o.freeItem, 1); } else { if (G.fun) G.fun.heal(9999); G.giveItem(o.freeItem, 2); }
      U.feed(o.e, (o.what === 'energy' ? 'Free double-double: energy full' : 'Free snack bag: health full') + ' · "' + pick(['Anything for our hero!', 'On the house, always!', 'You\'re the best!', 'For you? Free forever.']) + '"');
      H.ticker(pick(['Our hero is back!!', 'Everyone, it\'s {name}!', 'The usual, superstar?']), 'Staff', o.e);
      swag(4); G.sfx.cash(); G.dirty();
    } };
    return null;
  };
  // the shop sign shows who holds the place
  H.signInfo = function (pl, info) {
    if (!isOutpost(pl) || !info) return info;
    if (st().out[pl.id]) return Object.assign({}, info, { name: '⭐ ' + info.name });
    if (packs.has(pl.id)) return Object.assign({}, info, { e: '😈', col: '#2b2a2e' });
    return info;
  };
  H.markers = function (out) {
    const p = P(), h = st();
    for (const pl of W.places) {
      if (!isOutpost(pl)) continue;
      const d = Math.hypot(pl.pin.x - p.x, pl.pin.z - p.z);
      if (d > 700) continue;
      const free = !!h.out[pl.id];
      out.push({ x: pl.pin.x, z: pl.pin.z, color: free ? '#20c997' : '#ff3b30', r: free ? 5 : 6.5, emoji: OUT[pl.kind].e, ring: free ? '#fff' : '#1f1a3d', edge: !free && d < 450 });
    }
  };

  // ------------------------------------------------------------------ borrowed cars (GTA)
  H.borrowed = null;
  H.borrow = function (pc) {
    const tint = W.borrowCar(pc);
    if (tint == null) return false;
    H.borrowed = { tint };
    const v = D.VEHICLES.car;
    W.setRide(Object.assign({}, v, { kind: 'car', color: tint }));
    if (G.fun) G.fun.rideChanged();
    bump('borrowed');
    const by = nearPed(25);
    const line = fill(pick(HY.borrow));
    if (by) { W.holdPed(by, 2.5, 'wave'); W.say(by.obj, line, 3); }
    H.ticker(line, 'The owner', '🔑');
    H.word('🚗 NICE RIDE!', 'mint', 'Drive into things to smash them · V to park');
    G.sfx.pick && G.sfx.pick();
    return true;
  };
  H.park = function () {
    if (!H.borrowed) return false;
    const p = P();
    W.parkCar(p.x, p.z, W.player.face, H.borrowed.tint);
    H.borrowed = null;
    W.setRide({ mode: 'foot', walk: D.WALK.walk, run: D.WALK.run, jump: 8.5, radius: 0.4 });
    const side = { x: -Math.cos(W.player.face), z: Math.sin(W.player.face) };
    W.teleport(p.x + side.x * 2.2, p.z + side.z * 2.2, W.player.face);
    if (G.fun) G.fun.rideChanged();
    return true;
  };

  // ------------------------------------------------------------------ mission blips: light pillars, big letters, on-screen pointers
  const blips = new Map();  // spot key -> {beam, label, letter}
  const BEAM_G = new THREE.CylinderGeometry(0.55, 0.9, 70, 12, 1, true).translate(0, 35, 0);
  const BEAM_M = new THREE.MeshBasicMaterial({ color: 0xffc21f, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const letterOf = sp => sp.who === 'boss' ? '⚔' : ((D.CAST[sp.who] || {}).n || '?').replace(/^(Officer|Chef|Dr\.?|Grandpa|Mayor)\s+/, '').charAt(0).toUpperCase();
  H.letterOf = letterOf;
  function missionSpots() {
    const out = [];
    if (!G.rt.spots) return out;
    for (const sp of G.rt.spots.values()) if (sp.open && sp.open.length) out.push(sp);
    return out;
  }
  function updateBlips3D() {
    const p = P(), want = new Set();
    for (const sp of missionSpots()) {
      const d = Math.hypot(sp.x - p.x, sp.z - p.z);
      if (d > 1100) continue;
      want.add(sp.key);
      let b = blips.get(sp.key);
      if (!b) {
        const letter = letterOf(sp);
        const beam = new THREE.Mesh(BEAM_G, BEAM_M); beam.renderOrder = 5;
        const label = W.label(letter, { bg: '#ffc21f', fg: '#1f1a3d', size: 90, height: 1.6, border: '#1f1a3d', depthTest: false });
        W.scene.add(beam, label);
        b = { beam, label, letter };
        blips.set(sp.key, b);
      }
      const gy = W.groundAt(sp.x, sp.z), sc = clamp(d / 22, 1, 9);
      b.beam.position.set(sp.x, gy, sp.z); b.beam.visible = d > 14;
      const bw = clamp(d / 90, 0.25, 2.4); b.beam.scale.set(bw, 1, bw);  // a thin thread up close, a fat pillar far away
      b.label.position.set(sp.x, gy + 5 + sc * 0.9 + Math.sin(G.rt.t * 2 + sp.x) * 0.2, sp.z);
      b.label.scale.set(1.6 * sc * b.label.material.map.userData.aspect, 1.6 * sc, 1);
      b.label.visible = d > 14;
    }
    for (const [k, b] of blips) if (!want.has(k)) { W.scene.remove(b.beam, b.label); b.label.material.dispose(); blips.delete(k); }
  }
  // DOM pointers: the tracked goal + the nearest mission letters; off-screen ones hug the edge with an arrow
  const ptrs = [];
  function ptr(i) {
    if (!ptrs[i]) { const el = document.createElement('div'); el.className = 'cft-blip'; el.innerHTML = '<i class="cft-blip-arrow"></i><b></b><small></small>'; blipBox.appendChild(el); ptrs[i] = el; }
    return ptrs[i];
  }
  // the HUD's boxes (cards, minimap, hotbar, buttons), refreshed twice a second; a pointer inside one slides out to its nearest side
  let hudRects = [], hudRectT = 0;
  function avoidHud(x, y, w, h) {
    const now = performance.now();
    if (now - hudRectT > 500) {
      hudRectT = now;
      const sr = shell.getBoundingClientRect();
      hudRects = ['.cft-tl', '.cft-tr', '.cft-bl', '.cft-br'].map(q => shell.querySelector(q)).filter(e => e && e.offsetParent !== null)
        .map(e => { const r = e.getBoundingClientRect(); return { l: r.left - sr.left - 24, t: r.top - sr.top - 24, r: r.right - sr.left + 24, b: r.bottom - sr.top + 30 }; }).filter(r => r.r > r.l && r.b > r.t);
    }
    for (let k = 0; k < 2; k++) for (const r of hudRects) {
      if (x < r.l || x > r.r || y < r.t || y > r.b) continue;
      const opts = [[r.r, y, r.r - x], [r.l, y, x - r.l], [x, r.b, r.b - y], [x, r.t, y - r.t]].filter(o => o[0] > 20 && o[0] < w - 20 && o[1] > 20 && o[1] < h - 20).sort((a, b) => a[2] - b[2]);
      if (opts.length) { x = opts[0][0]; y = opts[0][1]; }
    }
    return { x, y };
  }
  function updatePointers() {
    const p = P(), list = [];
    const goal = G.rt.goal;
    if (goal) list.push({ x: goal.x, z: goal.z, t: goal.e && goal.e !== '!' ? goal.e : '★', goal: true });
    const spots = missionSpots().map(sp => ({ sp, d: Math.hypot(sp.x - p.x, sp.z - p.z) })).filter(o => o.d < 1200 && o.d > 6).sort((a, b) => a.d - b.d).slice(0, 4);
    for (const o of spots) if (!goal || Math.hypot(o.sp.x - goal.x, o.sp.z - goal.z) > 8) list.push({ x: o.sp.x, z: o.sp.z, t: letterOf(o.sp) });
    const hide = quiet();
    let i = 0;
    for (const o of list) {
      const el = ptr(i++), d = Math.hypot(o.x - p.x, o.z - p.z);
      if (hide || d < 6) { el.hidden = true; continue; }
      const q = W.project(o.x, W.groundAt(o.x, o.z) + 3.2, o.z), m = 34, top = 96, bot = 150;
      let x = q.x, y = q.y, off = q.behind || x < m || x > q.w - m || y < top || y > q.h - bot;
      if (q.behind) { x = q.w - x; y = q.h - y; }
      const cx = q.w / 2, cy = q.h / 2;
      if (off) { // push to the screen edge along the line from the centre
        const dx = x - cx, dy = y - cy, sx = (q.w / 2 - m) / Math.max(1e-3, Math.abs(dx)), sy = ((dy < 0 ? cy - top : q.h - bot - cy)) / Math.max(1e-3, Math.abs(dy)), k = Math.min(sx, sy);
        x = cx + dx * k; y = cy + dy * k;
        el.style.setProperty('--a', Math.atan2(dy, dx) + 'rad');
      }
      ({ x, y } = avoidHud(x, y, q.w, q.h));   // never on top of the HUD's cards, map or hotbar (2026-11-18)
      el.hidden = false;
      el.className = 'cft-blip' + (o.goal ? ' goal' : '') + (off ? ' off' : '');
      el.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
      const b = el.querySelector('b'), sm = el.querySelector('small');
      if (b.textContent !== o.t) b.textContent = o.t;
      const dt = d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1) + ' km';
      if (sm.textContent !== dt) sm.textContent = dt;
    }
    for (; i < ptrs.length; i++) ptrs[i].hidden = true;
  }

  // ------------------------------------------------------------------ main loop
  H.tick = function (dt, paused) {
    if (!alive) return;
    updatePointers();
    if (W.cine) for (const b of blips.values()) { b.beam.visible = false; b.label.visible = false; }   // a mission cut-scene: no beams in the shot
    if (paused) return;
    updateFan(dt);
    if (mainT > 0) {
      mainT -= dt; mainFx -= dt;
      if (mainLight) mainLight.intensity = 1.6 + Math.sin(G.rt.t * 6) * 0.3;
      if (mainFx <= 0) {
        mainFx = 0.35; const p = P();
        W.burst(p.x, p.y + 1.2, p.z, Math.random() < 0.5 ? '✨' : '⭐', 1, { spread: 1.6, up: 2.5, size: 0.45, life: 0.8 });
        if (Math.random() < 0.18) { const ped = nearPed(22); if (ped) { W.holdPed(ped, 2, 'wave'); W.say(ped.obj, fill(pick(HY.mainLines)), 2.2); } }
      }
      if (mainT <= 0 && mainLight) { mainLight.intensity = 0; H.word('Still iconic.', 'mint', 'Fill your swagger again'); }
    }
    slowT -= dt; outT -= dt; blipT -= dt; swagUi -= dt;
    if (outT <= 0) { outT = 1; outpostTick(); }
    if (blipT <= 0) { blipT = 0.25; updateBlips3D(); }
    if (swagUi <= 0) {
      swagUi = 0.15;
      const h = st(), on = mainT > 0;
      swagEl.classList.toggle('on', on);
      swagEl.querySelector('[data-swbar]').style.width = (on ? Math.round(mainT / 25 * 100) : Math.round(h.swag)) + '%';
      const tx = on ? Math.ceil(mainT) + 's' : '';
      const b = swagEl.querySelector('[data-swtext]'); if (b.textContent !== tx) b.textContent = tx;
    }
    if (!onStory() || calm() || quiet()) return;
    const lv = level();
    if (lv) {
      compT -= dt;
      const R2 = a => rnd(a[0], a[1]);
      if (compT <= 0) { compT = R2(lv === 2 ? TH.compliment : TH.complimentSome); compliment(); }
      fanT -= dt; giftT -= dt;
      if (fanT <= 0 && !fan) { fanT = R2(lv === 2 ? TH.fan : TH.fanSome); startFan(false); }
      if (giftT <= 0 && !fan) { giftT = R2(lv === 2 ? TH.gift : TH.giftSome); if (!startFan(true)) giftT = 20; }
    }
  };
  H.summary = function () {
    const h = st(), c = save().counters;
    let he = 0, gr = 0;
    for (const id of Object.keys(h.out)) { const k = (h.outKind || {})[id]; if (k === 'hearton') he++; else if (k === 'grocery') gr++; }
    return { swag: Math.round(h.swag), main: mainT > 0, fans: h.fans, gifts: h.gifts || 0, hearton: he, grocery: gr, energy: H.energyBonus(), hp: H.hpBonus(),
      smash: c.smash || 0, wrecks: c.wrecks || 0, parries: c.parries || 0, blocks: c.blocks || 0, dodges: c.dodges || 0, compliments: c.compliments || 0, borrowed: c.borrowed || 0 };
  };
  // tests: start a fan or a gift now, fill the swagger, liberate the nearest outpost pack
  H.test = { fan: g => startFan(!!g), swag, compliment, packs, spawnPack, liberate, updatePointers, blips };
  H.destroy = function () {
    alive = false;
    layer.remove(); swagEl.remove();
    const v = shell.querySelector('.cft-vignette'); if (v) v.remove();
    for (const b of blips.values()) W.scene.remove(b.beam, b.label);
  };
  st();
  // a warm welcome
  later(2600, () => { if (onStory() && level()) H.ticker(pick(HY.welcome), 'The city', '🏙️'); });
  return H;
}

window.CFTHero = { attach };
})();

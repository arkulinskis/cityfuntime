/* City Fun Time: the campaign update (2026-11-18). The user: "leave little secrets around town: analyse the map and find
   where there are tight locations between buildings, so nosy people can get them. Redesign the HUD; add map size. Ranged
   attacks limited in quantity, run around town to get more. Mega monsters bigger than buildings, hard to kill, weak spots
   temporarily exposed, scaled to your level (gear helps). A campaign: the first 3 minutes a countdown, immortal, every
   monster chases you, complete chaos, then you're next to your home and the world is peaceful. 1 mission, then 3 more,
   never more than 5 on the map. The world starts calm and every mission adds a crazy thing. Everything jumpable and
   bouncy. Fire and extinguishers. Water powers and lightning powers."

   const K = CFTCamp.attach(G, api)   by cft-game.js after G.chaos (G.camp = K). api: {bump, bumpTo, spawnPickup, setBusy, travel, setState}
   The campaign:  K.introPending() / K.startIntro() (cft-game.js startWorld) · K.inIntro() · K.immortal() + K.shrug(n) (cft-fun.js F.hurt)
                  K.allow(id) (= G.allow: the crazy list D.CAMPAIGN.WILD, one more per finished mission) · K.capOpen(ids) (G.openMissions)
   Ammo:          K.useAmmo(w) (cft-fun.js F.attack, ranged weapons; out of ammo = you bonk with the launcher) · K.collect(pickup)
   Powers:        K.power('water' | 'volt' | 'foam', down) (keys 1 / 2 / hold 3, the hotbar) · K.charges()
   Mega figments: K.meleeHit(p, f, w, lined) (F.attack) · K.shotHit(shot, pos) (cft-chaos.js updateShots) · K.spawnMega(x, z, def)
   Fire:          K.spawnFire(x, z, size) · W.onWreckFire · K.fires
   Secrets:       found by reading every block's building footprints for tight gaps (analyseSub) · K.interaction(p) (E)
   Bouncy world:  W.stompHook / W.onPropBounce / W.onWallJump / W.onMantle (cft-world.js updatePlayer)
   K.tick(dt, paused) · K.markers(list) · K.summary() (phone app Campaign) · K.destroy()
   Data: D.CAMPAIGN, D.TUNE.camp, pickups ammo / water / volt / foam (cft-content.js). State: save.camp {intro 'todo' | 'run' |
   'done', left, ammo, water, volt, foam, secrets {id: day}, shown [], seen, megaT}. Counters: secrets, fires_out, megas, zaps,
   walljumps, bounces, bestchain, stomps. Tests: tools/live/camptest.js (game_test.py --camp); pictures --campshots. */
(function () {
'use strict';

function attach(G, api) {
  const D = G.D, W = G.W, U = G.ui, THREE = W.THREE, CP = D.CAMPAIGN, T = D.TUNE.camp, F = G.fun;
  const LOW = !W.renderer.shadowMap.enabled;
  const save = () => G.save;
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const P = () => W.player.pos;
  const gy = (x, z) => W.standAt(x, z);
  const K = { megas: [], fires: [], spots: [], stash: new Map(), storm: null };
  const WILD_IDX = {}; CP.WILD.forEach((w, i) => { WILD_IDX[w.id] = i; });
  let alive = true, tier = 0, tierT = 0, hudT = 0, cratesT = 0, fireT = rnd(T.fireEvery[0], T.fireEvery[1]), stormT = rnd(T.stormEvery[0], T.stormEvery[1]);
  let shrugT = 0, pwCd = 0, spraying = false, sprayFx = 0, introEv = 0, introFire = 0, introPanic = 0, introMega = 75, introChamp = 40, analyseT = 0, secretT = 0, hintSaid = false;
  const crates = [], orbs = [], foams = [];
  const analysed = new WeakSet();
  const calm = () => !!(window.CFT_TEST && window.CFT_TEST.calm);
  // older test suites (and screenshots) run with the whole world switched on and no mission cap
  const bypass = () => !!(window.CFT_TEST && !window.CFT_TEST.campaign);
  const quiet = () => G.rt.busy || U.isOpen() || G.state() !== 'play';
  const onFoot = () => W.ride().mode !== 'drive';
  const lvl = () => G.level();
  const lvlMul = () => D.calc.dmgMul(lvl());   // your damage grows like this (cft-fun.js F.attack)
  const word = (t, tone, sub, big) => { if (G.hero) G.hero.word(t, tone, sub, big); };
  const mayhem = k => { if (G.chaos) G.chaos.add(k); };
  const sfx = k => { if (G.chaos && G.chaos.sfx && G.chaos.sfx[k]) G.chaos.sfx[k](); };
  const later = (ms, fn) => setTimeout(() => { if (alive) fn(); }, ms);
  function st() {
    const s = save();
    if (!s.camp || typeof s.camp !== 'object') s.camp = { intro: 'done', veteran: true };   // a save from before the campaign: keeps the whole crazy world it had
    const c = s.camp;
    if (!c.intro) c.intro = 'done';
    if (typeof c.left !== 'number' || c.left > CP.INTRO_SECS) c.left = CP.INTRO_SECS;   // saves from the 5-minute days
    if (typeof c.ammo !== 'number') c.ammo = T.ammoStart;
    if (typeof c.water !== 'number') c.water = T.waterStart;
    if (typeof c.volt !== 'number') c.volt = T.voltStart;
    if (typeof c.foam !== 'number') c.foam = 0;
    if (!c.secrets || typeof c.secrets !== 'object') c.secrets = {};
    if (!Array.isArray(c.shown)) c.shown = [];
    return c;
  }
  st();
  const storyDone = () => { const s = save(); let n = 0; for (const id in s.m) if (G.MISSION[id] && s.m[id].s === 'done') n++; return n; };
  tier = storyDone();
  // an active mission counts this counter: the world makes sure there is something to count (fires, megas)
  const wants = key => G.activeMissions().some(id => { const st0 = G.curStep(id); return st0 && st0.do === 'count' && st0.key === key; });

  // ------------------------------------------------------------------ the campaign: the crazy list and the mission cap
  K.inIntro = () => st().intro === 'run' || st().intro === 'ending';
  K.introPending = () => st().intro !== 'done';
  K.immortal = () => st().intro === 'run' || st().intro === 'ending';
  K.allow = function (id) {
    if (bypass() || K.inIntro() || st().veteran) return true;
    const i = WILD_IDX[id];
    if (i == null) return true;
    if (i < tier) return true;
    return (id === 'fire' && wants('fires_out')) || (id === 'mega' && wants('megas'));
  };
  K.tier = () => tier;
  const MIDX = {}; D.MISSIONS.forEach((m, i) => { MIDX[m.id] = i; });
  K.capOpen = function (all) {
    if (bypass()) return all;
    if (K.inIntro()) return [];
    const s = save(), c = st(), story = all.filter(id => G.MISSION[id]), other = all.filter(id => !G.MISSION[id]);
    const done = tier, cap = CP.CAP[Math.min(done, CP.CAP.length - 1)];
    const active = G.activeMissions().filter(id => G.MISSION[id]).length, room = Math.max(0, cap - active);
    const set = new Set(story);
    c.shown = c.shown.filter(id => set.has(id));   // sticky: what's on the map stays on the map until it's taken
    story.sort((a, b) => MIDX[a] - MIDX[b]);
    for (const id of story) { if (c.shown.length >= room) break; if (!c.shown.includes(id)) c.shown.push(id); }
    void s;
    return c.shown.slice(0, room).concat(other);
  };
  function tierTick() {
    const n = storyDone(), c = st();
    tier = n;
    if (c.seen == null) { c.seen = n; return; }   // an older save: everything it already earned comes on quietly
    if (n > c.seen && !K.inIntro()) {
      for (let i = c.seen; i < Math.min(n, CP.WILD.length); i++) {
        const w = CP.WILD[i];
        later(1800 + (i - c.seen) * 2600, () => { U.banner(w.e + ' The city got weirder: ' + w.n, w.d, 'level'); if (G.hero) G.hero.ticker('The city just got weirder: ' + w.n, 'The city', w.e); });
      }
      c.seen = n; G.dirty();
    }
  }

  // ------------------------------------------------------------------ the HUD bits: the opening countdown, the boss bar, the hotbar
  const shell = U.canvas.parentElement;
  const introEl = document.createElement('div');
  introEl.className = 'cft-intro'; introEl.hidden = true;
  introEl.innerHTML = '<b data-ileft>5:00</b><span>You can\'t die. Everything is chasing you. Survive the chaos!</span>';
  { const tr = shell.querySelector('.cft-tr'); if (tr) tr.insertBefore(introEl, tr.firstChild); else shell.appendChild(introEl); }  // heads the top-right corner
  const $ = sel => shell.querySelector(sel);
  const last = {};
  const setT = (sel, v) => { const el = $(sel); if (el && last[sel] !== v) { last[sel] = v; el.textContent = v; } };
  function hud() {
    const c = st(), inf = K.inIntro();
    const w = (G.rpg && G.rpg.weapon()) || (D.ITEMS[save().equip.weapon] || {}).weapon, ranged = !!w && (w.ranged === 'proj' || w.ranged === 'shot');
    setT('[data-ammo]', ranged ? (inf ? '∞' : String(c.ammo)) : '');
    const am = $('[data-ammo]'); if (am) am.classList.toggle('low', ranged && !inf && c.ammo <= 5);
    setT('[data-pwn="water"]', inf ? '∞' : String(c.water));
    setT('[data-pwn="volt"]', inf || K.storm ? '∞' : String(c.volt));
    setT('[data-pwn="foam"]', inf ? '∞' : Math.round(c.foam) + '%');
    for (const k of ['water', 'volt', 'foam']) { const b = $('[data-pw="' + k + '"]'); if (b) b.classList.toggle('empty', !inf && !(k === 'volt' && K.storm) && !(c[k] > 0)); }
    // missions on the map and the crazy list
    const shown = G.openMissions().filter(id => G.MISSION[id]).length + G.activeMissions().filter(id => G.MISSION[id]).length;
    const cap = CP.CAP[Math.min(tier, CP.CAP.length - 1)];
    setT('[data-mcount]', inf ? '🌀 The opening: survive' : '📍 ' + Math.min(shown, cap) + '/' + cap + ' on the map  ·  🌀 ' + Math.min(tier, CP.WILD.length) + '/' + CP.WILD.length + ' weird');
    // the boss bar: the nearest MEGA figment
    // MEGA plates over their heads (the old HUD boss bar stays hidden since 2026-11-21)
    for (const q of K.megas) if (!q.dead && q.label.userData.plate) q.label.userData.plate.set({ name: q.def.e + ' ' + q.def.n + ' · MEGA', lvl: q.lvl, pct: Math.max(0, q.hp / q.mhp), rank: 'mega',
      sub: q.expose > 0 ? '💥 WEAK SPOT OPEN! Hit the glowing heart!' : q.state === 'stomp' ? '⚠️ STOMP INCOMING: JUMP!' : q.wave ? '⚠️ Shockwave: jump when it reaches you' : 'Jump its stomp, then hit the glowing heart' }, 0.25);
    const bb = $('[data-boss]');
    if (bb) {
      const m = null;
      bb.hidden = true;
      if (m) {
        setT('[data-bossname]', m.def.e + ' ' + m.def.n + ' · MEGA · level ' + m.lvl);
        $('[data-bossbar]').style.width = Math.max(0, Math.round(m.hp / m.mhp * 100)) + '%';
        bb.classList.toggle('open', m.expose > 0);
        setT('[data-bosshint]', m.expose > 0 ? '💥 WEAK SPOT OPEN! Hit the glowing heart!' : m.state === 'stomp' ? '⚠️ STOMP INCOMING: JUMP!' : m.wave ? '⚠️ Shockwave: jump when it reaches you' : 'Jump its stomp, then hit the glowing heart. Water + lightning stuns it.');
      }
    }
  }

  // ------------------------------------------------------------------ the opening: three immortal minutes of everything chasing you
  K.startIntro = async function () {
    const c = st();
    if (c.intro === 'done') return;
    if (c.intro === 'ending' || (c.intro === 'run' && !(c.left > 1))) { // closed the game right as it ended: it's over
      c.intro = 'done'; c.left = 0; wakeUp(c); c.seen = storyDone(); G.dirty(); U.help(true); return;
    }
    if (!c.snap) c.snap = dreamSnap();   // what the save looked like before the dream (put back when you wake up)
    c.intro = 'run';
    if (!(c.left > 0)) c.left = CP.INTRO_SECS;
    const home = G.homeSpot();
    const far = (x, z) => Math.hypot(x - home.x, z - home.z) > 200;
    const sp = W.randomWalkSpot(home.x, home.z, 220, 360, far) || W.randomWalkSpot(home.x, home.z, 120, 400) || { x: home.x + 240, z: home.z };
    save().clock = 21.8;   // dusk turning to night: the figments love it
    await api.travel(sp, '🌀 Something is wrong with the city...');
    if (!alive) return;
    shell.classList.add('cft-panic');
    introEl.hidden = false;
    U.banner('🌀 WHAT IS HAPPENING', 'Everything is chasing you. Good news: you can\'t die. Survive three minutes of total chaos!', 'fail');
    word('YOU CAN\'T DIE!', 'red', 'Fight (F), splash (1), zap (2), jump on everything', true);
    G.sfx.fail();
    introEv = 6; introFire = 2; introPanic = 3; introMega = Math.min(introMega, Math.max(10, c.left - CP.INTRO_SECS * 0.75));   // the first MEGA a quarter of the way in introChamp = 30;
    startStorm(c.left + 5, true);
    G.dirty();
  };
  const FOES = () => Object.keys(D.MONSTERS).filter(k => !D.MONSTERS[k].boss);
  function introTick(dt) {
    const c = st();
    if (c.intro !== 'run') return;
    c.left -= dt;
    const s = Math.max(0, Math.ceil(c.left));
    setT('[data-ileft]', '⏳ ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'));
    introEl.classList.toggle('low', s <= 30);
    const p = P(), el = CP.INTRO_SECS - c.left;
    // keep the pack around you: everything chases (aggro everywhere), and they all leave when the clock runs out
    const mine = F.monsters.filter(m => m.introFoe && !m.dead).length, want = LOW ? T.introFoesLow : T.introFoes;
    if (mine < want && Math.random() < dt * 6) {
      const a = Math.random() * 6.283, r = rnd(16, 38), q = W.nearestWalk(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, 25) || { x: p.x + Math.cos(a) * r, z: p.z + Math.sin(a) * r };
      const kind = pick(FOES());
      F.spawnMonster(kind, q.x, q.z, { aggro: 999, event: c.left + 8, introFoe: true });
    }
    introChamp -= dt;
    if (introChamp <= 0) {
      introChamp = 45;
      const a = Math.random() * 6.283, q = W.nearestWalk(p.x + Math.cos(a) * 30, p.z + Math.sin(a) * 30, 25);
      if (q) { const kind = pick(['bin', 'raccoon', 'cart', 'gargoyle', 'brute']); for (let i = 0; i < 3; i++) F.spawnMonster(kind, q.x + rnd(-2, 2), q.z + rnd(-2, 2), { champ: true, aggro: 999, event: c.left + 8, introFoe: true }); }
      if (el > 50 && !F.monsters.some(m => m.def.boss)) { const q2 = W.nearestWalk(p.x - Math.cos(a) * 34, p.z - Math.sin(a) * 34, 25); if (q2) F.spawnMonster('blob', q2.x, q2.z, { aggro: 999, event: c.left + 8, introFoe: true }); }
    }
    introMega -= dt;
    if (introMega <= 0 && !K.megas.some(m => !m.dead)) {
      introMega = 40;
      const a = Math.random() * 6.283, q = W.nearestWalk(p.x + Math.cos(a) * 70, p.z + Math.sin(a) * 70, 40);
      if (q) K.spawnMega(q.x, q.z, null, true);
    }
    introEv -= dt;
    if (introEv <= 0) { introEv = 22; if (F.event) F.endEvent(); const ev = pick(D.EVENTS.filter(e => e.id !== 'ufo' || Math.random() < 0.5)); F.startEvent(ev.id); }
    introFire -= dt;
    if (introFire <= 0) { introFire = rnd(2.5, 4.5); const a = Math.random() * 6.283, r = rnd(8, 40); K.spawnFire(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, rnd(0.6, 1.4)); }
    introPanic -= dt;
    if (introPanic <= 0 && G.hero) { introPanic = rnd(5, 8); G.hero.ticker(pick(CP.PANIC), pick(['You', 'A passer-by', 'Your brain', 'The city', 'A pigeon']), pick(['😱', '🫨', '😵‍💫', '🙃'])); }
    if (Math.abs(c.left - 60) < dt * 1.01) word('ONE MINUTE LEFT!', 'gold', 'Make it count', true);
    if (Math.abs(c.left - 10) < dt * 1.01) word('10!', 'red', 'almost...', true);
    if (c.left <= 0) endIntro();
  }
  // The opening was a fever dream (the user, 2026-11-18): you wake at the address you typed, level 1 with $0, and nothing
  // from those three minutes is kept: no gear, loot, stickers, achievements, counters, aura or Dex entries. DREAM_KEYS are the
  // parts of the save that are put back exactly as they were before it started (save.camp.snap, taken in startIntro).
  const DREAM_KEYS = ['bag', 'owned', 'equip', 'rpg', 'stickers', 'counters', 'hero', 'chaos', 'fun', 'm', 'track', 'jobs', 'dyn'];
  function dreamSnap() { const s = save(), o = {}; for (const k of DREAM_KEYS) o[k] = s[k] === undefined ? null : JSON.parse(JSON.stringify(s[k])); return o; }
  function wakeUp(c) {
    const s = save();
    if (c.snap) for (const k of DREAM_KEYS) { if (c.snap[k] === null) delete s[k]; else s[k] = c.snap[k]; }
    delete c.snap;
    s.xp = 0; s.money = 0; s.savings = 0;
    if (s.rpg) s.rpg.rested = 0;
    s.energy = G.maxEnergy();
    if (s.fun) s.fun.hp = F.maxHp();
    c.ammo = T.ammoStart; c.water = T.waterStart; c.volt = T.voltStart; c.foam = 0;
    if (G.rpg && G.rpg.mark) G.rpg.mark();
    if (F.rideChanged) F.rideChanged();   // the weapon in your hand goes back to what you really own
    W.setLook(G.playerLook());
    G.setRide(s.equip.ride || null);
    for (const k of G.rt.pickups.slice()) if (!k.mission && !k.dead) k.dead = 0.0001;   // the dream's coins vanish too
  }
  async function endIntro() {
    const c = st();
    if (c.intro !== 'run') return;
    c.intro = 'ending';
    word('TIME!', 'gold', 'You survived the chaos', true);
    G.sfx.done(); U.confetti();
    await new Promise(r => setTimeout(r, 1600));
    if (!alive) return;
    for (const m of F.monsters.slice()) F.removeMonster(m, true);
    for (const m of K.megas.slice()) removeMega(m);
    for (const f of K.fires.slice()) removeFire(f, false);
    stopStorm();
    if (F.event) F.endEvent();
    // wake up at the address you typed on the start screen (save.home, the world's origin), on the nearest pavement
    const s = save(), hq = G.xz(s.home), hw = W.nearestWalk(hq.x, hq.z, 40) || hq;
    s.clock = 8;
    await api.travel({ x: hw.x, z: hw.z }, '🤒 ...you wake up, drenched in sweat.');
    if (!alive) return;
    c.intro = 'done'; c.left = 0;
    wakeUp(c);
    c.seen = storyDone();
    shell.classList.remove('cft-panic'); introEl.hidden = true;
    api.bump('intro');
    G.log('Woke up from a very strange fever dream', '🤒');
    G.dirty(true);
    api.setBusy(true);
    try {
      await U.dialog({ who: 'max', lines: [
        'Whoa, whoa, easy! You\'re awake. You were thrashing around on my couch like you were fighting a goose.',
        'You came down with a fever the second you got here. You\'ve been out for hours, yelling "I CAN\'T DIE!" and "WHY IS THE BUILDING WALKING?!"',
        'None of it was real. No monsters, no fires, no giant goose. It was all a fever dream. You\'re at ' + (s.home.short || s.home.label) + ', safe.',
        'Bad news, though: anything you "found" in there stayed in there. And moving here ate every last dollar. Your wallet is empty.',
        'So: level one, zero dollars, a brand new city. Honestly? Best way to start. Come talk to me when you\'re ready.',
      ] });
    } finally { api.setBusy(false); }
    U.banner('🤒 It was all a fever dream', 'Level 1, $0, nothing in your pockets. The city is calm. Max has your first mission.', 'day');
    if (G.hero) G.hero.ticker('It was all a dream. (Was it?)', 'Your brain', '🤒');
    later(1800, () => { if (G.state() === 'play') U.help(true); });
  }
  K.skipIntro = () => { const c = st(); if (c.intro === 'run') { c.left = 0.01; } else if (c.intro === 'todo') { c.intro = 'done'; c.seen = storyDone(); } };
  K.shrug = function (n) {
    if (shrugT > 0) return;
    shrugT = 0.7;
    const p = P();
    W.pop(p.x + rnd(-0.5, 0.5), p.y + 2.4, p.z, pick(['IMMORTAL!', 'TICKLES!', 'NOPE!', 'CAN\'T TOUCH THIS', 'NICE TRY!', 'UNKILLABLE!']), '#ffd23f', 0.9);
    W.shake(Math.min(0.25, n * 0.02));
    if (U.hurt) U.hurt();
  };

  // ------------------------------------------------------------------ ammo: crates around town (so you run for them), drops, secrets
  K.useAmmo = function (w) {
    if (K.inIntro() || (bypass() && !window.CFT_TEST.ammo)) return true;   // older test suites shoot for free
    const c = st(), cost = w.ammo || 1;
    if (c.ammo >= cost) {
      c.ammo -= cost;
      if (c.ammo <= 5 && c.ammo + cost > 5) U.toast('🎯 Ammo low (' + c.ammo + '). Ammo crates are scattered around town: follow the orange beams.');
      return true;
    }
    // out: you bonk with the launcher instead
    const p = P();
    W.pop(p.x, p.y + 2.3, p.z, '*click*', '#cccccc', 0.7);
    if (!K._outNote || G.rt.t - K._outNote > 8) { K._outNote = G.rt.t; U.toast('🎯 Out of ammo! Find ammo crates around town (orange beams). Figments drop some too. Until then: bonk with it.'); }
    w.ranged = null; w.reach = 2.2; w.dmg *= 0.6; w.word = 'BONK!'; w.puff = null;
    return false;
  };
  function manageCrates(dt) {
    cratesT -= dt;
    if (cratesT > 0) return;
    cratesT = 1.2;
    const p = P(), live = k => !k.dead && G.rt.pickups.includes(k);
    for (const list of [crates, orbs, foams]) for (let i = list.length - 1; i >= 0; i--) if (!live(list[i])) list.splice(i, 1);
    const far = (list, x, z, d) => list.every(k => Math.hypot(k.x - x, k.z - z) > d);
    if (crates.length < T.ammoCrates) {
      const sp = W.randomWalkSpot(p.x, p.z, T.crateMin, T.crateMax, (x, z) => far(crates, x, z, 60));
      if (sp) crates.push(api.spawnPickup('ammo', sp.x, sp.z));
    }
    if (orbs.length < T.orbs) {
      const sp = W.randomWalkSpot(p.x, p.z, 40, 260, (x, z) => far(orbs, x, z, 45));
      if (sp) orbs.push(api.spawnPickup(Math.random() < 0.55 ? 'water' : 'volt', sp.x, sp.z));
    }
    // extinguishers turn up near fires (and one somewhere around)
    const near = K.fires.find(f => Math.hypot(f.x - p.x, f.z - p.z) < 90 && far(foams, f.x, f.z, 30));
    if (near && foams.length < 4) { const sp = W.randomWalkSpot(near.x, near.z, 6, 16); if (sp) foams.push(api.spawnPickup('foam', sp.x, sp.z)); }
    else if (!foams.length && K.allow('fire')) { const sp = W.randomWalkSpot(p.x, p.z, 60, 220); if (sp) foams.push(api.spawnPickup('foam', sp.x, sp.z)); }
  }
  K.collect = function (k) {
    const c = st(), p = P();
    if (k.type === 'ammo') { const n = T.ammoCrate + Math.floor(lvl() / 2); c.ammo = Math.min(T.ammoMax, c.ammo + n); U.feed('🎯', '+' + n + ' ammo (' + c.ammo + ')'); W.pop(p.x, p.y + 2.4, p.z, 'RELOADED!', '#ffb26b', 0.9); shooterHint(); }
    else if (k.type === 'water') { c.water = Math.min(T.waterMax, c.water + T.waterOrb); U.feed('💧', 'Water power +' + T.waterOrb + ' (' + c.water + ')'); }
    else if (k.type === 'volt') { c.volt = Math.min(T.voltMax, c.volt + T.voltOrb); U.feed('🌩️', 'Lightning power +' + T.voltOrb + ' (' + c.volt + ')'); }
    else if (k.type === 'foam') { c.foam = T.foamMax; U.feed('🧯', 'Fire extinguisher: full (hold 3 to spray)'); if (!K._foamTip) { K._foamTip = 1; U.toast('🧯 Got an extinguisher! Hold 3 (or the 🧯 button) to spray foam on fires.'); } }
    G.dirty();
  };
  // Ammo is only for things that shoot (2026-11-19, the user: "I pick up arrows around town but I don't know how to shoot").
  // No shooter yet: the first crate has a Spitball straw in it (worn straight away if your hands are empty). A shooter in
  // the wardrobe but not in hand: say so (once a visit).
  const isShooter = w => !!(w && (w.ranged === 'proj' || w.ranged === 'shot'));
  function shooterHint() {
    const s = save(), worn = G.rpg && G.rpg.weapon(), inHand = worn || (D.ITEMS[s.equip.weapon] && D.ITEMS[s.equip.weapon].weapon);
    if (isShooter(inHand)) { if (!K._shootTip) { K._shootTip = 1; U.toast('🎯 F shoots your ' + (worn ? worn.n : D.ITEMS[s.equip.weapon].n) + '. Hold the right mouse button first to aim it at the crosshair.'); } return; }
    const owned = Object.keys(s.owned).filter(id => s.owned[id] && D.ITEMS[id] && isShooter(D.ITEMS[id].weapon));
    if (!owned.length) {
      // since 2026-11-21 shooters sit in slot 5 (cft-aim), so the straw goes there instead of your hand
      if (G.aim) G.aim.addGun('w_straw', 'found'); else { s.owned.w_straw = true; if (!worn && !s.equip.weapon && G.wearShop) G.wearShop('w_straw'); }
      U.banner('🥤 A Spitball straw was in the crate!', 'Ammo is for things that shoot. Press 5 for the shooter slot, hold the right mouse button to aim, left click to fire.', 'done');
      U.feed('🥤', 'More shooters lie around town (🎯 on the map) · shops: fast food 🥤🌭, toys 🎈🐔, gifts 🎉💨, groceries 🍌, clothes 👕, hardware 🥔🍄');
      G.dirty();
    } else if (!K._wearTip) { K._wearTip = 1; U.toast('🎯 Ammo is for your shooters: press 5, hold the right mouse button to aim, left click to fire. The scroll wheel switches shooters.'); }
  }
  K.addAmmo = function (n) { const c = st(); c.ammo = Math.min(T.ammoMax, c.ammo + Math.max(0, n | 0)); G.dirty(); return c.ammo; };   // shooters found around town (cft-aim)
  K.charges = () => { const c = st(); return { ammo: c.ammo, water: c.water, volt: c.volt, foam: c.foam }; };

  // ------------------------------------------------------------------ powers: water (1), lightning (2), the extinguisher (hold 3)
  // {x, z} flat direction + up (rise per metre, 2026-11-23): the sight's point, else how far up you look (W.aimEl)
  function aimDir() {
    const f = aimFlat(), p = P();
    if (f.up == null) f.up = Math.tan(W.aimEl ? W.aimEl() : 0);
    if (W.aiming && W.aimPoint) { const ap = W.aimPoint, d = Math.hypot(ap.x - p.x, ap.z - p.z); if (d > 0.5) f.up = (ap.y - p.y - 1.35) / d; }
    f.up = Math.max(-1.2, Math.min(4, f.up));
    return f;
  }
  // is a thing at height y, d metres away, inside the jet (aimed f.up from shoulder height)?
  const inJet = (p, f, d, y, slack) => Math.abs(y - (p.y + 1.35 + f.up * d)) < slack + d * 0.12;
  function aimFlat() {
    const p = P();
    if (W.aiming && W.aimPoint) { const dx = W.aimPoint.x - p.x, dz = W.aimPoint.z - p.z, d = Math.hypot(dx, dz); if (d > 0.5) return { x: dx / d, z: dz / d }; }  // the right-mouse sight (cft-aim.js)
    if (W.isLocked && W.isLocked()) return { x: -Math.sin(W.cam.yaw), z: -Math.cos(W.cam.yaw) };
    // nudge onto the best target in front: a mega's open weak spot, a figment, a fire
    const fx = -Math.sin(W.player.face), fz = -Math.cos(W.player.face);
    let best = null, bs = -9;
    const el = W.aimEl ? W.aimEl() : 0;
    const consider = (x, z, range, bonus, y) => { const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz); if (d < 0.5 || d > range) return; const cs = (dx * fx + dz * fz) / d; if (cs < 0.55) return; if (el > 0.2 && Math.atan2(y - p.y - 1.35, d) < el - 0.5) return; const sc = cs * 2 - d / range + (bonus || 0); if (sc > bs) { bs = sc; best = { x: dx / d, z: dz / d, up: (y - p.y - 1.35) / d }; } };
    for (const m of F.monsters) if (!m.dead) consider(m.x, m.z, T.voltRange, 0.2, m.obj.position.y + (m.obj.userData.h || 1.4) * (m.obj.userData.size || 1) * 0.55);
    for (const m of K.megas) if (!m.dead && m.expose > 0) consider(m.hx, m.hz, T.voltRange + 6, 0.6, m.hy);
    for (const f of K.fires) consider(f.x, f.z, T.waterRange, 0.1, gy(f.x, f.z) + 0.6);
    if (best) { W.player.face = Math.atan2(-best.x, -best.z); return { x: best.x, z: best.z, up: best.up }; }
    return { x: fx, z: fz };
  }
  const inCone = (p, f, x, z, range, dot) => { const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz); return d < range && (d < 1 || (dx * f.x + dz * f.z) / d > dot) ? d : -1; };
  K.power = function (kind, down) {
    if (kind === 'foam') { spraying = !!down && st().foam > 0 || (!!down && K.inIntro()); if (down && !spraying) U.toast('🧯 No extinguisher. They turn up near fires (red beams).'); return spraying; }
    if (!down || pwCd > 0 || quiet() || F.dying) return false;
    if (!onFoot()) { U.toast('Hop off your ride first (V).'); return false; }
    const c = st(), free = K.inIntro() || (kind === 'volt' && K.storm);
    if (!free && !(c[kind] > 0)) { U.toast(kind === 'water' ? '💧 No water power left. Water orbs float around town; a hydrant fills you up (E).' : '🌩️ No lightning left. Lightning orbs float around town, and storms drop them.'); pwCd = 0.4; return false; }
    if (!free) c[kind]--;
    if (kind === 'water') { waterBlast(); pwCd = 0.35; }
    else { zap(); pwCd = 0.55; }
    W.swing();
    G.dirty();
    return true;
  };
  function waterBlast() {
    const p = P(), f = aimDir(), y = p.y + 1.35;
    for (let d = 1.2; d < T.waterRange; d += 1.3) W.burst(p.x + f.x * d, y + f.up * d - d * 0.04, p.z + f.z * d, Math.random() < 0.6 ? '💧' : '💦', 1, { spread: 0.6 + d * 0.06, up: 1.2, size: 0.55, life: 0.45, grav: 6 });
    sfx('splash');
    let hits = 0;
    for (const m of F.monsters.slice()) {
      if (m.dead) continue;
      const d = inCone(p, f, m.x, m.z, T.waterRange + m.r, 0.72);
      if (d < 0) continue;
      const mh = (m.obj.userData.h || 1.4) * (m.obj.userData.size || 1);
      if (!inJet(p, f, d, m.obj.position.y + mh * 0.5, mh * 0.6 + 1)) continue;   // the jet went over or under it
      m.wet = G.rt.t + 8;
      F.hitMonster(m, { dmg: 0.5 * lvlMul(), type: 'water', knock: T.waterKnock, stun: 1.1, word: pick(['SPLASH!', 'SPLOOSH!', 'SOAKED!']), puff: '💦' }, f);
      hits++;
    }
    for (const m of K.megas) { if (m.dead) continue; if (inCone(p, f, m.x, m.z, T.waterRange + m.r, 0.5) >= 0) { m.wet = G.rt.t + 10; W.pop(m.x, gy(m.x, m.z) + m.h * 0.5, m.z, 'SOAKED!', '#9fdcff', 2); hits++; } }
    for (const fi of K.fires.slice()) if (inCone(p, f, fi.x, fi.z, T.waterRange + 1, 0.6) >= 0) { if (G.wild) G.wild.steam(fi.x, fi.z); douse(fi, 70); }   // steam blinds figments
    for (const ped of W.life.peds) { const o = ped.obj.position; if (!ped.ctl && inCone(p, f, o.x, o.z, 9, 0.7) >= 0) { W.holdPed(ped, 1.4, 'air'); W.say(ped.obj, pick(['Refreshing!', 'MY HAIR!', 'Is it raining?', 'Thanks, it\'s hot out!']), 1.8); } }
    if (hits) mayhem('hit');
    api.bump('splashes');
  }
  // a lightning bolt from the sky (jagged segments, gone in a blink)
  const BOLT_MAT = new THREE.MeshBasicMaterial({ color: 0xfff6a8, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
  const BOLT_GEO = new THREE.BoxGeometry(1, 1, 1);
  const bolts = [];
  function bolt(x0, y0, z0, x1, y1, z1, thick) {
    const g = new THREE.Group(), n = 7;
    let px = x0, py = y0, pz = z0;
    for (let i = 1; i <= n; i++) {
      const t = i / n, j = i === n ? 0 : 1.6;
      const nx = x0 + (x1 - x0) * t + rnd(-j, j), ny = y0 + (y1 - y0) * t, nz = z0 + (z1 - z0) * t + rnd(-j, j);
      const L = Math.hypot(nx - px, ny - py, nz - pz), seg = new THREE.Mesh(BOLT_GEO, BOLT_MAT);
      seg.scale.set(thick || 0.22, thick || 0.22, L);
      seg.position.set((px + nx) / 2, (py + ny) / 2, (pz + nz) / 2);
      seg.lookAt(nx, ny, nz);
      g.add(seg);
      px = nx; py = ny; pz = nz;
    }
    W.scene.add(g);
    bolts.push({ g, t: 0 });
    W.burst(x1, y1 + 0.3, z1, '⚡', 6, { spread: 3, up: 4, size: 0.6, life: 0.6 });
  }
  function zap() {
    const p = P(), f = aimDir();
    sfx('boom');
    let dmg = T.voltDmg * lvlMul();
    // 1. a mega's open weak spot or its body, 2. the best figment in front, 3. the ground ahead
    for (const m of K.megas) {
      if (m.dead) continue;
      if (m.expose > 0 && Math.hypot(m.hx - p.x, m.hz - p.z) < T.voltRange + 6) { bolt(m.hx, m.hy + 26, m.hz, m.hx, m.hy, m.hz, 0.4); hitMega(m, dmg, 'heart', f, 'ZAP!'); api.bump('zaps'); return; }
      if (inCone(p, f, m.x, m.z, T.voltRange + m.r, 0.5) >= 0) {
        const top = gy(m.x, m.z) + m.h * 0.7; bolt(m.x, top + 24, m.z, m.x, top, m.z, 0.5);
        if (m.wet > G.rt.t && !(m.shortT > G.rt.t)) { m.shortT = G.rt.t + 12; dizzy(m, 'SHORT CIRCUIT!'); }
        hitMega(m, dmg * (m.wet > G.rt.t ? T.wetMul : 1), 'body', f, 'ZAP!'); api.bump('zaps'); return;
      }
    }
    let target = null, bs = -9;
    for (const m of F.monsters) { if (m.dead) continue; const d = inCone(p, f, m.x, m.z, T.voltRange + m.r, 0.5); if (d < 0) continue; const sc = -d + (m.wet > G.rt.t ? 6 : 0); if (sc > bs) { bs = sc; target = m; } }
    if (!target) {   // nothing to hit: the sight's point (a roof, a wall) when aiming, else the ground ahead
      const ap = W.aiming && W.aimPoint && W.aimPoint.kind !== 'sky' && Math.hypot(W.aimPoint.x - p.x, W.aimPoint.z - p.z) < T.voltRange + 6 ? W.aimPoint : null;
      const tx = ap ? ap.x : p.x + f.x * 11, tz = ap ? ap.z : p.z + f.z * 11, ty = ap ? ap.y : gy(tx, tz);
      bolt(tx, ty + 26, tz, tx, ty, tz, 0.35);
      strikeGround(tx, tz, 0.6);
      return;
    }
    const hit = new Set();
    let cur = target, from = null, n = 0;
    while (cur && n <= T.voltChain) {
      hit.add(cur);
      const top = cur.obj.position.y + (cur.obj.userData.h || 1.4) * (cur.obj.userData.size || 1);
      if (!from) bolt(cur.x, top + 24, cur.z, cur.x, top, cur.z, 0.3);
      else bolt(from.x, from.obj.position.y + 1, from.z, cur.x, top - 0.4, cur.z, 0.16);
      const wet = cur.wet > G.rt.t;
      F.hitMonster(cur, { dmg: dmg * (wet ? T.wetMul : 1), type: 'volt', knock: 4, stun: 1.6, word: wet ? 'SUPERCHARGED!' : pick(['ZAP!', 'KZZZT!', 'BZZT!']), puff: '⚡' }, f);
      api.bump('zaps');
      from = cur; n++; dmg *= 0.7;
      let next = null, nd = 1e9;
      for (const m of F.monsters) { if (m.dead || hit.has(m)) continue; const d = Math.hypot(m.x - from.x, m.z - from.z); if (d < (m.wet > G.rt.t || wet ? 9 : 6) && d < nd) { nd = d; next = m; } }
      cur = next;
    }
    if (G.wild) G.wild.conduct(target.x, target.z, T.voltDmg * lvlMul());
    mayhem('hit'); W.shake(0.2);
    if (Math.random() < 0.2) K.spawnFire(target.x + rnd(-1, 1), target.z + rnd(-1, 1), 0.5);
  }
  function strikeGround(x, z, fireChance) {
    if (G.wild) G.wild.conduct(x, z, T.voltDmg * lvlMul());   // lightning jumps through metal nearby
    const e = W.propNear(x, z, 2.6);
    if (e) { F.smashProp(e, 3, null, false); if (Math.random() < fireChance && ['tree', 'bench', 'bin', 'couch', 'cart', 'picnic', 'cafe'].includes(e.k)) K.spawnFire(e.x, e.z, 0.9); }
    else if (Math.random() < fireChance * 0.4) K.spawnFire(x, z, 0.5);
    for (const m of F.monsters.slice()) if (!m.dead && Math.hypot(m.x - x, m.z - z) < 3.5) F.hitMonster(m, { dmg: T.voltDmg * lvlMul() * 0.8, type: 'volt', knock: 6, stun: 1.4, word: 'ZAP!', puff: '⚡' }, { x: (m.x - x) || 0.1, z: (m.z - z) || 0.1 });
  }
  function inFoam(p, f, m) { const d = inCone(p, f, m.x, m.z, 5.5 + m.r, 0.6), mh = (m.obj.userData.h || 1.4) * (m.obj.userData.size || 1); return d >= 0 && inJet(p, f, d, m.obj.position.y + mh * 0.5, mh * 0.6 + 1); }
  function sprayTick(dt) {
    const c = st(), inf = K.inIntro();
    if (!spraying) return;
    if ((!inf && c.foam <= 0) || !onFoot() || quiet() || F.dying) { spraying = false; if (c.foam <= 0 && !inf) U.toast('🧯 The extinguisher is empty.'); return; }
    if (!inf) c.foam = Math.max(0, c.foam - 12 * dt);
    const p = P(), f = aimDir(), y = p.y + 1.1;
    sprayFx -= dt;
    if (sprayFx <= 0) { sprayFx = 0.07; for (let d = 1; d < 7; d += 1.4) W.burst(p.x + f.x * d, y + f.up * d, p.z + f.z * d, Math.random() < 0.5 ? '☁️' : '⚪', 1, { spread: 0.5 + d * 0.15, up: 0.8, size: 0.6, life: 0.5, grav: 1 }); }
    for (const fi of K.fires.slice()) if (inCone(p, f, fi.x, fi.z, 8, 0.55) >= 0) douse(fi, 160 * dt);
    for (const m of F.monsters) if (!m.dead && inFoam(p, f, m)) { m.stun = Math.max(m.stun, 0.35); if (!(m.foamT > G.rt.t)) { m.foamT = G.rt.t + 1.5; W.pop(m.x, m.obj.position.y + 2, m.z, 'FOAMED!', '#ffffff', 0.7); } }
  }

  // ------------------------------------------------------------------ fire: it spreads, it hurts, it burns things down. Put it out.
  const FLAME_GEO = new THREE.ConeGeometry(0.5, 1.5, 8, 1, true).translate(0, 0.75, 0);
  const FLAME_MATS = [0xff4a1a, 0xff8f1a, 0xffd23f].map((c, i) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: [0.92, 0.9, 0.95][i], depthWrite: false, side: THREE.DoubleSide }));   // normal blending: orange flames by day too
  const SCORCH = new THREE.MeshBasicMaterial({ color: 0x1a1210, transparent: true, opacity: 0.45, depthWrite: false });
  const SCORCH_GEO = new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2);
  function fireMesh() {
    const g = new THREE.Group();
    const parts = [[0, 0, 0, 1.0, 0], [0.32, 0, 0.15, 0.7, 1], [-0.28, 0, -0.2, 0.75, 1], [0.05, 0, -0.05, 0.55, 2], [-0.1, 0, 0.25, 0.5, 2]];
    for (const [x, y, z, s, mi] of parts) { const m = new THREE.Mesh(FLAME_GEO, FLAME_MATS[mi]); m.position.set(x, y, z); m.scale.set(s, s * 1.3, s); m.userData.s = s; g.add(m); }
    const sc = new THREE.Mesh(SCORCH_GEO, SCORCH); sc.position.y = 0.04; sc.scale.setScalar(1.1); g.add(sc);
    return g;
  }
  K.spawnFire = function (x, z, size) {
    size = size || 1;
    if (W.heightAt(x, z)) { const q = W.nearestWalk(x, z, 12); if (!q) return null; x = q.x; z = q.z; }
    for (const f of K.fires) if (Math.hypot(f.x - x, f.z - z) < 1.8) { f.size = Math.min(1.9, f.size + size * 0.4); f.hp = Math.max(f.hp, fireHp(f.size)); return f; }
    if (K.fires.length >= (LOW ? T.fireMaxLow : T.fireMax)) return null;
    const obj = fireMesh();
    obj.position.set(x, gy(x, z), z);
    W.scene.add(obj);
    const f = { x, z, obj, size, hp: fireHp(size), t: 0, spread: rnd(T.fireSpread[0], T.fireSpread[1]) + 2, life: rnd(50, 85), burn: rnd(1, 3), ph: Math.random() * 6 };
    K.fires.push(f);
    return f;
  };
  const fireHp = s => 50 + 70 * s;
  function removeFire(f, steam) {
    const i = K.fires.indexOf(f); if (i >= 0) K.fires.splice(i, 1);
    W.scene.remove(f.obj);
    if (steam) W.burst(f.x, gy(f.x, f.z) + 0.8, f.z, '💨', 6, { spread: 1.5, up: 3, size: 0.8, life: 1.2, grav: -1 });
  }
  function douse(f, n) {
    f.hp -= n;
    f.size = Math.max(0.2, f.size - n / 260);
    if (f.hp > 0) return;
    removeFire(f, true);
    api.bump('fires_out');
    G.addXp(8, 'explore');
    mayhem('smash');
    if (G.hero) G.hero.swag(3);
    W.pop(f.x, gy(f.x, f.z) + 2, f.z, pick(['EXTINGUISHED!', 'PSSSHHH!', 'FIRE OUT!', 'HERO!']), '#9fdcff', 1);
    const by = W.nearestPed(f.x, f.z, 18); if (by && Math.random() < 0.5) W.say(by.obj, pick(['My hero!', 'Thank you!!', 'Someone call... oh, you did it!', 'Legend!']), 2);
  }
  let burnAcc = 0;
  function fireTick(dt) {
    const p = P(), spreadOn = K.inIntro() || K.allow('fire');
    for (let i = K.fires.length - 1; i >= 0; i--) {
      const f = K.fires[i];
      f.t += dt;
      if (f.t > f.life || Math.hypot(f.x - p.x, f.z - p.z) > 320) { removeFire(f, f.t > f.life); continue; }
      f.size = Math.min(1.9, f.size + dt * 0.02);
      const k = f.size * (f.t < 0.5 ? f.t * 2 : 1) * (f.t > f.life - 4 ? (f.life - f.t) / 4 : 1);
      f.obj.scale.setScalar(Math.max(0.05, k));
      f.obj.children.forEach((m, j) => { if (m.userData.s) { const q = 1 + Math.sin(G.rt.t * (9 + j * 3) + f.ph + j) * 0.18; m.scale.set(m.userData.s * (2 - q) * 0.9, m.userData.s * 1.3 * q, m.userData.s * (2 - q) * 0.9); m.rotation.y += dt * (1 + j); } });
      if (Math.random() < dt * 1.6 * f.size) W.burst(f.x + rnd(-0.4, 0.4), gy(f.x, f.z) + 1.8 * f.size, f.z + rnd(-0.4, 0.4), Math.random() < 0.3 ? '🔥' : '💨', 1, { spread: 0.4, up: 2.4, size: 0.7 * f.size, life: 1.5, grav: -0.6 });
      // it spreads (when fires are on), burns what it stands on, and hurts figments in it
      f.spread -= dt;
      if (f.spread <= 0) {
        f.spread = rnd(T.fireSpread[0], T.fireSpread[1]);
        if (spreadOn && f.size > 0.7 && !calm()) { const a = Math.random() * 6.283, r = rnd(2.5, 4.8); K.spawnFire(f.x + Math.cos(a) * r, f.z + Math.sin(a) * r, 0.45); }
      }
      f.burn -= dt;
      if (f.burn <= 0) {
        f.burn = 2.5;
        const e = W.propNear(f.x, f.z, 1.4 + f.size * 0.4);
        if (e) F.smashProp(e, 1, null, false);
        for (const m of F.monsters.slice()) if (!m.dead && Math.hypot(m.x - f.x, m.z - f.z) < 1.2 + f.size * 0.6) F.hitMonster(m, { dmg: 0.4 * lvlMul(), type: 'fire', knock: 1.5, stun: 0.3, word: pick(['TOASTY!', 'HOT HOT HOT!', 'OUCH!']), puff: '🔥' }, { x: (m.x - f.x) || 0.1, z: (m.z - f.z) || 0.1 });
        const ped = W.nearestPed(f.x, f.z, 9); if (ped && !ped.ctl && Math.random() < 0.3) W.say(ped.obj, pick(['FIRE!!', 'Is that... fire?', 'Somebody do something!', 'Hot hot hot!']), 1.8);
      }
    }
    // standing in a fire hurts (less than you'd think: it's a cartoon)
    burnAcc += dt;
    if (burnAcc >= 0.5) {
      burnAcc = 0;
      for (const f of K.fires) if (Math.hypot(f.x - p.x, f.z - p.z) < 0.8 + f.size * 0.55 && p.y - gy(f.x, f.z) < 1.4) {
        if (G.wild && G.wild.soaked()) { if (!K._fireproof || G.rt.t - K._fireproof > 4) { K._fireproof = G.rt.t; W.pop(p.x, p.y + 2.6, p.z, 'SOAKED = FIREPROOF!', '#9fdcff', 0.8); } break; } F.hurt(T.fireHurt * 0.5 * f.size * (1 + 0.1 * (lvl() - 1)), null); W.pop(p.x, p.y + 2.6, p.z, pick(['HOT!', 'OUCH!', 'TOASTY!']), '#ff8a3d', 0.8); break; }
    }
    // random fires around town once fires are on (or a mission needs some)
    if (!K.inIntro() && !calm() && !quiet() && G.storyOn() && (K.allow('fire') || wants('fires_out'))) {
      fireT -= dt * (wants('fires_out') && !K.fires.length ? 4 : 1);
      if (fireT <= 0) {
        fireT = rnd(T.fireEvery[0], T.fireEvery[1]);
        const home = G.homeSpot(), sp = W.randomWalkSpot(p.x, p.z, 30, 90, (x, z) => Math.hypot(x - home.x, z - home.z) > 40);
        if (sp) {
          const e = W.propNear(sp.x, sp.z, 12);
          const x = e ? e.x : sp.x, z = e ? e.z : sp.z;
          K.spawnFire(x, z, 1.1); K.spawnFire(x + 1.5, z + 0.8, 0.6);
          const street = W.streetAt(x, z);
          U.banner('🔥 Something\'s burning!', (pick(['A barbecue got out of hand', 'A bin caught fire', 'Someone microwaved a fork', 'A very spicy hot sauce incident']) + (street ? ' on ' + street : ' nearby') + '. It spreads! Water power (1), an extinguisher (hold 3) or a hydrant.'), 'fail');
        }
      }
    }
  }
  W.onWreckFire = (x, z) => { if (K.inIntro() || K.allow('fire')) K.spawnFire(x, z, 1.0); };

  // ------------------------------------------------------------------ lightning storms
  const stormEl = document.createElement('div');
  stormEl.className = 'cft-stormfx'; stormEl.hidden = true;
  shell.insertBefore(stormEl, U.canvas.nextSibling);
  function startStorm(secs, quietly) {
    K.storm = { t: 0, secs, next: 1.5, warn: null };
    stormEl.hidden = false; shell.classList.add('cft-storming');
    if (!quietly) { U.banner('⛈️ Lightning storm!', 'Lightning hits whatever stands still: keep moving! Your lightning power is free until it passes.', 'fail'); if (G.hero) G.hero.ticker('Is that thunder?!', 'A passer-by', '⛈️'); }
  }
  function stopStorm() {
    if (!K.storm) return;
    if (K.storm.warn) W.scene.remove(K.storm.warn.ring);
    K.storm = null; stormEl.hidden = true; shell.classList.remove('cft-storming');
  }
  const RING_GEO = new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2);
  const ringMesh = col => { const r = new THREE.Mesh(RING_GEO, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, depthWrite: false })); r.renderOrder = 4; W.scene.add(r); return r; };
  function stormTick(dt) {
    const S = K.storm, p = P();
    if (!S) {
      if (!K.inIntro() && !calm() && !quiet() && G.storyOn() && K.allow('storms')) { stormT -= dt; if (stormT <= 0) { stormT = rnd(T.stormEvery[0], T.stormEvery[1]); startStorm(T.stormSecs); } }
      return;
    }
    S.t += dt;
    if (S.t > S.secs) { stopStorm(); if (!K.inIntro()) U.toast('⛈️ The storm passed.'); return; }
    if (S.warn) { // a strike is coming down here: the ring tightens, then BOOM
      const w = S.warn; w.t += dt;
      w.ring.scale.setScalar(2.4 - w.t * 1.2); w.ring.material.opacity = 0.4 + 0.5 * Math.abs(Math.sin(w.t * 18));
      if (w.t >= 1.1) {
        W.scene.remove(w.ring); w.ring.material.dispose(); S.warn = null;
        const y = gy(w.x, w.z);
        bolt(w.x, y + 34, w.z, w.x, y, w.z, 0.55);
        if (U.flash) U.flash();
        sfx('boom'); W.shake(clamp(0.9 - Math.hypot(w.x - p.x, w.z - p.z) / 60, 0.05, 0.9));
        if (Math.hypot(w.x - p.x, w.z - p.z) < 2.3 && p.y - y < 2) { F.hurt(F.maxHp() * 0.12 * (G.wild && G.wild.soaked() ? 2 : 1), null); W.pop(p.x, p.y + 2.6, p.z, 'ZAPPED!', '#fff07a', 1.2); }
        else if (Math.hypot(w.x - p.x, w.z - p.z) < 5) word('DODGED LIGHTNING!', 'violet');
        strikeGround(w.x, w.z, 0.35);
        if (Math.random() < 0.3) api.spawnPickup('volt', w.x + rnd(-2, 2), w.z + rnd(-2, 2));
      }
    }
    S.next -= dt;
    if (S.next <= 0 && !S.warn) {
      S.next = rnd(T.strikeEvery[0], T.strikeEvery[1]) * (K.inIntro() ? 0.6 : 1);
      const home = G.homeSpot(), r = Math.random();
      let x, z;
      const foe = F.monsters.filter(m => !m.dead && Math.hypot(m.x - p.x, m.z - p.z) < 50);
      if (r < 0.4 && foe.length) { const m = pick(foe); x = m.x; z = m.z; }
      else if (r < 0.62 && Math.hypot(p.x - home.x, p.z - home.z) > 30) { x = p.x + W.player.vel.x * 0.6; z = p.z + W.player.vel.z * 0.6; }   // at you: keep moving
      else { const a = Math.random() * 6.283, d = rnd(12, 60); x = p.x + Math.cos(a) * d; z = p.z + Math.sin(a) * d; }
      if (W.heightAt(x, z)) { const q = W.nearestWalk(x, z, 20); if (q) { x = q.x; z = q.z; } }
      const ring = ringMesh(0xfff07a);
      ring.position.set(x, gy(x, z) + 0.15, z);
      S.warn = { x, z, t: 0, ring };
    }
  }

  // ------------------------------------------------------------------ MEGA figments: bigger than buildings, a weak spot that pops out
  const HEART_GEO = new THREE.SphereGeometry(1, 18, 14);
  function baseHp(L) { return 60 + 8 * L + 3; }
  K.spawnMega = function (x, z, def, intro) {
    def = def || pick(CP.MEGA);
    const L = lvl(), obj = W.monster(def.kind), size = def.size;
    obj.userData.size = size; obj.scale.setScalar(size);
    obj.traverse(c => { if (c.isMesh) c.castShadow = !LOW; });
    obj.position.set(x, gy(x, z), z);
    W.scene.add(obj);
    const heart = new THREE.Group();
    heart.add(new THREE.Mesh(HEART_GEO, new THREE.MeshBasicMaterial({ color: 0xff2d6b })));
    const glow = new THREE.Mesh(HEART_GEO, new THREE.MeshBasicMaterial({ color: 0xff8fb8, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.setScalar(1.6); heart.add(glow);
    heart.visible = false;
    W.scene.add(heart);
    const label = W.foePlate({ big: true });   // name, level, health and what to do, over its head (2026-11-21: no HUD bar)
    W.scene.add(label);
    const tag = W.label('💥 WEAK SPOT!', { bg: '#ffc21f', fg: '#1f1a3d', size: 44, height: 0.9, border: '#1f1a3d', depthTest: false });
    tag.visible = false; W.scene.add(tag);
    // always equally hard for your level: its health is a fixed number of a basic weapon's hits on the weak spot
    const ref = D.SLAP.dmg * 1.6 * D.calc.dmgMul(L);
    const mhp = T.megaHits * ref * T.megaWeak * (intro ? 0.35 : 1);
    const m = { def, obj, heart, label, tag, x, z, hp: mhp, mhp, atk: T.megaAtk * baseHp(L), lvl: L + 3, size, h: (obj.userData.h || 1.6) * size, r: size * 0.55,
      state: 'walk', t: 0, cd: 4, expose: 0, wet: 0, stepT: 0, n: 0, intro: !!intro, hx: x, hy: 0, hz: z, rings: [] };
    K.megas.push(m);
    U.banner(def.e + ' MEGA FIGMENT: ' + def.n, def.line + ' Jump its stomp, then hit the glowing heart while it\'s dizzy.', 'fail');
    word('MEGA FIGMENT!', 'red', def.n, true);
    sfx('boom'); W.shake(0.5);
    return m;
  };
  function removeMega(m) {
    m.dead = true;
    const i = K.megas.indexOf(m); if (i >= 0) K.megas.splice(i, 1);
    W.removeObj(m.obj); W.scene.remove(m.heart); W.scene.remove(m.label); W.scene.remove(m.tag); if (m.label.userData.plate) m.label.userData.plate.dispose();
    for (const r of m.rings) W.scene.remove(r.mesh);
    if (m.rock) W.scene.remove(m.rock.obj);
  }
  function dizzy(m, why) {
    m.state = 'dizzy'; m.expose = 5.5; m.wave = null;
    for (const r of m.rings) W.scene.remove(r.mesh); m.rings = [];
    W.pop(m.x, gy(m.x, m.z) + m.h + 2, m.z, why || 'DIZZY!', '#ffc21f', 2.5);
    W.burst(m.x, gy(m.x, m.z) + m.h, m.z, '💫', 10, { spread: m.r, up: 3, size: 1.6, life: 1.6 });
    if (!K._weakTip) { K._weakTip = 1; U.toast('💥 Its glowing heart popped out! Hit it NOW: F, lightning (2) or any shot.'); }
  }
  function hitMega(m, dmg, part, dir, wd) {
    if (m.dead) return;
    const weak = part === 'heart' && m.expose > 0;
    const d = dmg * (weak ? T.megaWeak : T.megaArmor);
    m.hp -= d;
    m.obj.userData.hurt = 0.25;
    const y = weak ? m.hy + 1.5 : gy(m.x, m.z) + m.h * 0.5;
    const px = weak ? m.hx : m.x, pz = weak ? m.hz : m.z;
    W.pop(px, y + 0.8, pz, weak ? pick(['WEAK SPOT!', 'CRITICAL!', 'RIGHT IN THE HEART!', 'BULLSEYE!']) : (Math.random() < 0.3 ? 'TOO TOUGH!' : wd || 'TONK!'), weak ? '#ff5c8a' : '#cccccc', weak ? 1.4 : 0.9);
    W.pop(px + 0.8, y + 1.8, pz, String(Math.max(1, Math.round(d * 10))), weak ? '#ffc21f' : '#ffffff', weak ? 1 : 0.6);
    if (weak) { W.burst(m.hx, m.hy, m.hz, '💥', 6, { spread: 2, up: 3 }); W.shake(0.18); mayhem('hit'); if (G.hero) G.hero.swag(1.5); }
    if (m.hp <= 0) killMega(m);
  }
  function killMega(m) {
    m.dead = true; m.state = 'dying'; m.t = 0;
    const x = m.x, z = m.z, y = gy(x, z), L = lvl();
    m.heart.visible = false; m.tag.visible = false; m.label.visible = false;
    for (const r of m.rings) W.scene.remove(r.mesh); m.rings = [];
    W.burst(x, y + m.h * 0.6, z, '⭐', 24, { spread: m.r * 1.5, up: 9 });
    W.burst(x, y + m.h * 0.4, z, '🪙', 18, { spread: m.r, up: 10, size: 0.8 });
    W.burst(x, y + m.h * 0.5, z, '💥', 12, { spread: m.r, up: 6, size: 1.6 });
    W.shake(1); if (U.flash) U.flash(); sfx('boom');
    G.rt.hitstop = Math.max(G.rt.hitstop || 0, 0.2);
    for (let i = 0; i < 14; i++) { const a = i / 14 * 6.283, r = 3 + Math.random() * 6; let cx = x + Math.cos(a) * r, cz = z + Math.sin(a) * r; if (W.heightAt(cx, cz)) { const q = W.nearestWalk(cx, cz, 15); if (q) { cx = q.x; cz = q.z; } } api.spawnPickup(i % 5 === 0 ? 'cash' : 'coin', cx, cz); }
    if (!m.intro) {
      api.bump('megas');
      G.addXp(300 + 45 * L, 'monster');
      G.addMoney(150 + 30 * L, 'for the MEGA figment');
      if (G.rpg) { G.rpg.drop('boss'); G.rpg.drop('boss'); }
      G.log('Beat a MEGA figment: ' + m.def.n, '🦖');
    }
    if (G.hero) G.hero.event('kill', { m: { def: { boss: true }, champ: true, kind: 'mega' } });
    U.banner('🦖 MEGA DOWN!', m.def.n + ' wobbles, sways... and pops into a shower of coins.' + (m.intro ? '' : ' Epic loot dropped.'), 'done');
    word('MEGA DOWN!', 'gold', m.def.n, true);
    U.confetti();
    G.dirty();
  }
  // its attacks: a stomp (red ring: jump or get out), a throw (a lobbed boulder), a breath (a line of fire, or a shockwave ring)
  function megaTick(m, dt) {
    const p = P(), d = Math.hypot(m.x - p.x, m.z - p.z), g0 = gy(m.x, m.z);
    m.t += dt;
    if (m.state === 'dying') {
      m.obj.rotation.z = Math.min(1.4, m.t * m.t * 0.9); m.obj.position.y = g0 - Math.max(0, m.t - 1) * m.h * 0.4;
      if (m.t > 3.2) removeMega(m);
      return;
    }
    if (d > 480 || (m.t > 420 && d > 150)) { removeMega(m); return; }
    const want = Math.atan2(-(p.x - m.x), -(p.z - m.z));
    let sp = 0;
    m.obj.rotation.x += ((m.state === 'dizzy' ? 0.35 : 0) - m.obj.rotation.x) * Math.min(1, dt * 4);
    if (m.state === 'walk') {
      m.obj.rotation.y += Math.atan2(Math.sin(want - m.obj.rotation.y), Math.cos(want - m.obj.rotation.y)) * Math.min(1, dt * 1.5);
      if (d > 16) { sp = T.megaSpeed * (m.intro ? 1.25 : 1); m.x += -Math.sin(m.obj.rotation.y) * sp * dt; m.z += -Math.cos(m.obj.rotation.y) * sp * dt; }
      m.stepT -= dt;
      if (m.stepT <= 0 && sp > 0) { // every step flattens what's under its feet
        m.stepT = 0.85;
        W.shake(clamp(0.5 - d / 140, 0, 0.5));
        for (let i = 0; i < 2; i++) { const a = Math.random() * 6.283, r = Math.random() * m.r * 0.7, e = W.propNear(m.x + Math.cos(a) * r, m.z + Math.sin(a) * r, 3, { cars: true }); if (e) W.hitProp(e, 99, { x: Math.cos(a), z: Math.sin(a) }); }
        if (d < 60) sfx('thump');
      }
      m.cd -= dt;
      if (m.cd <= 0 && d < 42 && !quiet() && !F.dying) {
        m.n++;
        const kind = m.n % 3 === 0 || d < 20 ? 'stomp' : pick(['stomp', 'throw', 'breath']);
        startAttack(m, kind);
      }
    } else if (m.state === 'stomp') {
      m.at -= dt;
      m.obj.position.y = g0 + Math.sin(Math.min(1, 1 - m.at / 1.4) * Math.PI * 0.5) * m.h * 0.12;
      const r = m.rings[0]; if (r) r.mesh.material.opacity = 0.35 + 0.5 * Math.abs(Math.sin(m.at * 12));
      if (m.at <= 0) {
        m.obj.position.y = g0;
        const R = 9.5, tx = m.tx, tz = m.tz, dp = Math.hypot(p.x - tx, p.z - tz);
        W.shake(clamp(1 - d / 90, 0.15, 1)); sfx('boom');
        W.burst(tx, gy(tx, tz) + 0.5, tz, '💨', 16, { spread: R, up: 3, size: 1.2, life: 1 });
        W.burst(tx, gy(tx, tz) + 0.5, tz, '💥', 6, { spread: R * 0.6, up: 5, size: 1.2 });
        if (dp < R + 0.8) {
          if (p.y - gy(p.x, p.z) > 0.7) { word('JUMPED IT!', 'mint'); mayhem('dodge'); if (G.hero) G.hero.swag(4); }
          else { F.hurt(m.atk, null); W.player.vy = 9; W.player.grounded = false; const k = 10 / Math.max(1, dp); W.player.vel.x += (p.x - tx) * k; W.player.vel.z += (p.z - tz) * k; }
        }
        for (const q of F.monsters.slice()) if (!q.dead && Math.hypot(q.x - tx, q.z - tz) < R) F.hitMonster(q, { dmg: 1.5 * lvlMul(), type: 'stomp', knock: 8, stun: 1, word: 'SQUASH!', puff: '💨' }, { x: (q.x - tx) || 0.1, z: (q.z - tz) || 0.1 });
        for (let i = 0; i < 4; i++) { const a = Math.random() * 6.283, e = W.propNear(tx + Math.cos(a) * R * 0.6, tz + Math.sin(a) * R * 0.6, 4, { cars: true }); if (e) W.hitProp(e, 99, { x: Math.cos(a), z: Math.sin(a) }); }
        for (const r2 of m.rings) W.scene.remove(r2.mesh); m.rings = [];
        dizzy(m);   // after a stomp it's stuck and dizzy: the weak spot pops out
      }
    } else if (m.state === 'throw') {
      const rk = m.rock;
      rk.t += dt;
      const k = Math.min(1, rk.t / rk.T);
      rk.obj.position.set(rk.x0 + (rk.x1 - rk.x0) * k, rk.y0 + (rk.y1 - rk.y0) * k + Math.sin(k * Math.PI) * rk.arc, rk.z0 + (rk.z1 - rk.z0) * k);
      rk.obj.rotation.x += dt * 4; rk.obj.rotation.z += dt * 3;
      const r = m.rings[0]; if (r) r.mesh.material.opacity = 0.4 + 0.5 * Math.abs(Math.sin(rk.t * 14));
      if (k >= 1) {
        W.scene.remove(rk.obj); m.rock = null;
        for (const r2 of m.rings) W.scene.remove(r2.mesh); m.rings = [];
        W.burst(rk.x1, rk.y1 + 0.5, rk.z1, '💥', 10, { spread: 4, up: 6, size: 1 }); W.shake(clamp(0.8 - Math.hypot(rk.x1 - p.x, rk.z1 - p.z) / 40, 0.1, 0.8)); sfx('boom');
        if (Math.hypot(p.x - rk.x1, p.z - rk.z1) < 4.6 && p.y - gy(p.x, p.z) < 2.2) F.hurt(m.atk * 0.65, null); else if (Math.hypot(p.x - rk.x1, p.z - rk.z1) < 8) word('MISSED ME!', 'mint');
        const e = W.propNear(rk.x1, rk.z1, 4, { cars: true }); if (e) W.hitProp(e, 99, null);
        if (m.def.breath === 'fire' || Math.random() < 0.25) K.spawnFire(rk.x1, rk.z1, 0.8);
        m.state = 'walk'; m.cd = rnd(2.5, 4);
      }
    } else if (m.state === 'breath') {
      m.at -= dt;
      m.obj.rotation.y += Math.atan2(Math.sin(want - m.obj.rotation.y), Math.cos(want - m.obj.rotation.y)) * Math.min(1, dt * 3);
      if (m.at <= 0) {
        if (m.def.breath === 'fire') { // a line of fire towards you
          const fx = -Math.sin(m.obj.rotation.y), fz = -Math.cos(m.obj.rotation.y);
          for (let i = 0; i < 7; i++) { const dd = m.r * 0.6 + i * 3.2; later(i * 110, () => K.spawnFire(m.x + fx * dd + rnd(-1, 1), m.z + fz * dd + rnd(-1, 1), 0.9)); }
          W.pop(m.x, g0 + m.h, m.z, 'RAAAWR!', '#ff6a3d', 3); sfx('whoosh');
        } else { // a shockwave ring rolls out: jump as it reaches you
          m.wave = { r: m.r * 0.6, hit: false, mesh: ringMesh(m.def.breath === 'slime' ? 0x35e06a : 0x9fd0ff) };
          m.rings.push({ mesh: m.wave.mesh });
          W.pop(m.x, g0 + m.h, m.z, m.def.breath === 'slime' ? 'BLOOOOP!' : 'HOOOONK!', '#ffffff', 3); sfx('honk');
        }
        m.state = 'walk'; m.cd = rnd(3, 5);
      }
    } else if (m.state === 'dizzy') {
      m.expose -= dt;
      const dx = p.x - m.x, dz = p.z - m.z, L = Math.hypot(dx, dz) || 1, off = Math.min(Math.max(0, d - 2.5), m.r * 0.85);
      m.hx = m.x + dx / L * off; m.hz = m.z + dz / L * off; m.hy = gy(m.hx, m.hz) + 1.5;
      m.heart.visible = true; m.tag.visible = true;
      const pulse = 1 + Math.sin(G.rt.t * 10) * 0.15;
      m.heart.position.set(m.hx, m.hy, m.hz); m.heart.scale.setScalar(0.9 * pulse);
      m.tag.position.set(m.hx, m.hy + 2.2, m.hz);
      if (m.expose <= 0) { m.heart.visible = false; m.tag.visible = false; m.state = 'walk'; m.cd = rnd(3, 5); }
    }
    if (m.wave) { // the shockwave rolling out
      const w = m.wave; w.r += dt * 16;
      w.mesh.position.set(m.x, g0 + 0.2, m.z); w.mesh.scale.setScalar(w.r); w.mesh.material.opacity = Math.max(0, 0.9 - w.r / 45);
      if (!w.hit && Math.abs(w.r - d) < 1.4) { w.hit = true; if (p.y - gy(p.x, p.z) > 0.6) { word('JUMPED IT!', 'mint'); mayhem('dodge'); } else F.hurt(m.atk * 0.5, null); }
      if (w.r > 45) { W.scene.remove(w.mesh); m.rings = m.rings.filter(r => r.mesh !== w.mesh); m.wave = null; }
    }
    m.obj.position.x = m.x; m.obj.position.z = m.z;
    if (m.state !== 'stomp') m.obj.position.y = g0;
    W.animateMonster(m.obj, dt, sp * 0.4);
    m.label.position.set(m.x, g0 + m.h + 3.5, m.z);
    m.label.visible = d < 260;
  }
  function startAttack(m, kind) {
    const p = P();
    if (kind === 'stomp') {
      m.state = 'stomp'; m.at = 1.4;
      m.tx = p.x + W.player.vel.x * 0.4; m.tz = p.z + W.player.vel.z * 0.4;
      const r = ringMesh(0xff3b30); r.scale.setScalar(9.5); r.position.set(m.tx, gy(m.tx, m.tz) + 0.18, m.tz);
      m.rings.push({ mesh: r });
      W.pop(m.x, gy(m.x, m.z) + m.h + 1, m.z, '⚠️ STOMP!', '#ff3b30', 2.4);
      if (!K._stompTip) { K._stompTip = 1; U.toast('⚠️ STOMP! Jump (Space) or get out of the red ring.'); }
    } else if (kind === 'throw') {
      const tx = p.x + W.player.vel.x * 0.8, tz = p.z + W.player.vel.z * 0.8;
      const obj = new THREE.Mesh(HEART_GEO, new THREE.MeshLambertMaterial({ color: m.def.breath === 'fire' ? 0x8a6a5a : 0x9aa3ad }));
      obj.scale.set(1.6, 1.3, 1.5); W.scene.add(obj);
      const g0 = gy(m.x, m.z);
      m.rock = { obj, t: 0, T: 1.7, x0: m.x, y0: g0 + m.h * 0.8, z0: m.z, x1: tx, y1: gy(tx, tz), z1: tz, arc: 10 };
      const r = ringMesh(0xff8a3d); r.scale.setScalar(4.6); r.position.set(tx, gy(tx, tz) + 0.18, tz);
      m.rings.push({ mesh: r });
      m.state = 'throw';
      W.pop(m.x, g0 + m.h + 1, m.z, pick(['CATCH!', 'YOINK!', 'HEADS UP!']), '#ff8a3d', 2.4);
    } else {
      m.state = 'breath'; m.at = 1.0;
      W.pop(m.x, gy(m.x, m.z) + m.h + 1, m.z, m.def.breath === 'fire' ? '🔥🔥🔥' : '😤', '#ffffff', 2.4);
    }
  }
  K.meleeHit = function (p, f, w, lined) {
    for (const m of K.megas) {
      if (m.dead) continue;
      if (m.expose > 0 && Math.hypot(m.hx - p.x, m.hz - p.z) < w.reach + 1.5) { W.player.face = Math.atan2(-(m.hx - p.x), -(m.hz - p.z)); hitMega(m, w.dmg, 'heart', f, w.word); return true; }
      if (!lined && Math.hypot(m.x - p.x, m.z - p.z) < m.r + w.reach + 0.8) { hitMega(m, w.dmg, 'body', f, w.word); return true; }
    }
    return false;
  };
  K.shotHit = function (s, o) {
    for (const m of K.megas) {
      if (m.dead) continue;
      if (m.expose > 0 && Math.hypot(m.hx - o.x, m.hz - o.z) < 1.8 && Math.abs(m.hy - o.y) < 2) { hitMega(m, s.w.dmg || 1, 'heart', null, s.w.word); return true; }
      if (Math.hypot(m.x - o.x, m.z - o.z) < m.r * 0.85 && o.y < gy(m.x, m.z) + m.h) { hitMega(m, s.w.dmg || 1, 'body', null, s.w.word); return true; }
    }
    return false;
  };
  function megaSpawner(dt) {
    if (K.inIntro() || calm() || quiet() || !G.storyOn() || K.megas.some(m => !m.dead)) return;
    const c = st(), need = wants('megas');
    if (!K.allow('mega') && !need) return;
    if (typeof c.megaT !== 'number') c.megaT = rnd(T.megaEvery[0], T.megaEvery[1]) * 0.5;
    c.megaT -= dt * (need ? 5 : 1);
    if (c.megaT > 0) return;
    const p = P(), home = G.homeSpot();
    if (Math.hypot(p.x - home.x, p.z - home.z) < 150) { c.megaT = 20; return; }   // home stays calm
    const sp = W.randomWalkSpot(p.x, p.z, 90, 140);
    if (!sp) { c.megaT = 15; return; }
    c.megaT = rnd(T.megaEvery[0], T.megaEvery[1]);
    K.spawnMega(sp.x, sp.z);
  }

  // ------------------------------------------------------------------ the bouncy world: stomp figments, bounce off things, parkour
  W.stompHook = function (x, y, z) {
    for (const m of F.monsters) {
      if (m.dead || m.def.fly) continue;
      const top = m.obj.position.y + (m.obj.userData.h || 1.4) * (m.obj.userData.size || 1);
      if (Math.hypot(m.x - x, m.z - z) < m.r + 0.35 && y < top + 0.7 && y > top - 0.9) {
        F.hitMonster(m, { dmg: 1.4 * lvlMul(), type: 'stomp', knock: 2, stun: 1.8, word: pick(['STOMP!', 'BOING!', 'HEADBONK!']), puff: '⭐' }, { x: 0, z: 1 });
        api.bump('stomps'); mayhem('bounce');
        return 13;
      }
    }
    for (const m of K.megas) { // landing on a mega's head (from a roof?): it's dizzy
      if (m.dead || m.state === 'dizzy') continue;
      const top = gy(m.x, m.z) + m.h;
      if (Math.hypot(m.x - x, m.z - z) < m.r * 0.7 && y < top + 1 && y > top - 3) { dizzy(m, 'BONK ON THE HEAD!'); word('HEADSHOT!', 'gold', 'it\'s dizzy: get its heart!', true); return 16; }
    }
    return 0;
  };
  W.onPropBounce = function (e, chain) {
    api.bump('bounces');
    const c = save().counters;
    if (chain > (c.bestchain || 0)) api.bumpTo('bestchain', chain);
    const p = P();
    W.pop(p.x, p.y + 2.4, p.z, chain > 1 ? 'BOING x' + chain + '!' : 'BOING!', chain > 3 ? '#ffc21f' : '#ff5c8a', Math.min(1.4, 0.8 + chain * 0.1));
    G.sfx.boing(); mayhem('bounce');
  };
  W.onWallJump = function () {
    api.bump('walljumps'); mayhem('air');
    const n = save().counters.walljumps || 0;
    if (n === 1) U.toast('🧗 Wall jump! Jump again every time you hit a wall in the air. Grab a roof edge to climb up.');
    if (Math.random() < 0.25) { const p = P(); W.pop(p.x, p.y + 2.3, p.z, pick(['PARKOUR!', 'WALL KICK!', 'NINJA!']), '#b79cff', 0.8); }
  };
  W.onMantle = function () { const p = P(); W.pop(p.x, p.y + 2.2, p.z, pick(['UP WE GO!', 'ROOFTOP!', 'CLIMB!']), '#b79cff', 0.8); api.bump('mantles'); };

  // ------------------------------------------------------------------ secrets in the tight gaps between buildings
  // How the map is read: for every block (sub-tile), every pair of buildings whose outlines come within gap.max of each other
  // is sampled along the first one's walls; where the second one's wall is gap.min..gap.max metres away and the middle is open
  // ground (no building, not a street), that's a gap. Each gap is scored: tighter is better, more walls around it (8 rays,
  // 10 m) is better, further from a street is better. The best one or two per block (at least 30 m apart) get a stash.
  function nearestOnRing(p, x, z) {
    let best = Infinity, bx = 0, bz = 0;
    const n = p.length / 2;
    for (let i = 0, k = n - 1; i < n; k = i++) {
      const x1 = p[2 * k], z1 = p[2 * k + 1], x2 = p[2 * i], z2 = p[2 * i + 1], dx = x2 - x1, dz = z2 - z1, L = dx * dx + dz * dz;
      let t = L > 0 ? ((x - x1) * dx + (z - z1) * dz) / L : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const cx = x1 + t * dx, cz = z1 + t * dz, d = (x - cx) ** 2 + (z - cz) ** 2;
      if (d < best) { best = d; bx = cx; bz = cz; }
    }
    return { d: Math.sqrt(best), x: bx, z: bz };
  }
  function enclosure(x, z) {
    let n = 0;
    for (let a = 0; a < 8; a++) { const ux = Math.cos(a * Math.PI / 4), uz = Math.sin(a * Math.PI / 4); for (let d = 0.8; d <= 10; d += 0.9) if (W.heightAt(x + ux * d, z + uz * d)) { n++; break; } }
    return n;
  }
  // a nosy person must be able to walk in: follow the gap along its length (both ways, up to 30 m) until it opens onto
  // open ground (nothing built 3 m to either side). Returns the metres walked, or 0 for a sealed slit / light well.
  function reachable(c) {
    const ax = -c.uz, az = c.ux;
    for (const sg of [1, -1]) {
      for (let d = 0.7; d <= 30; d += 0.7) {
        const x = c.x + ax * sg * d, z = c.z + az * sg * d;
        if (W.heightAt(x, z)) break;
        if (!W.heightAt(x + c.ux * 3, z + c.uz * 3) && !W.heightAt(x - c.ux * 3, z - c.uz * 3) && !W.heightAt(x + ax * sg * 2, z + az * sg * 2)) return d;
      }
    }
    return 0;
  }
  K.analyse = function (s) {
    const B = s.buildings.filter(b => b.m < 2.5 && b.area > 12), gmin = T.secretGap[0], gmax = T.secretGap[1], cands = [];
    for (let i = 0; i < B.length; i++) {
      const a = B[i];
      for (let j = i + 1; j < B.length; j++) {
        const b = B[j];
        if (b.x0 > a.x1 + gmax || b.x1 < a.x0 - gmax || b.z0 > a.z1 + gmax || b.z1 < a.z0 - gmax) continue;
        let best = null;
        const p = a.p, n = p.length / 2;
        for (let e = 0; e < n; e++) {
          const x1 = p[2 * e], z1 = p[2 * e + 1], x2 = p[2 * ((e + 1) % n)], z2 = p[2 * ((e + 1) % n) + 1], L = Math.hypot(x2 - x1, z2 - z1);
          for (let t = 0.75; t < L; t += 1.5) {
            const x = x1 + (x2 - x1) * t / L, z = z1 + (z2 - z1) * t / L, q = nearestOnRing(b.p, x, z);
            if (q.d < gmin || q.d > gmax || (best && q.d >= best.gap)) continue;
            const mx = (x + q.x) / 2, mz = (z + q.z) / 2, ux = (q.x - x) / q.d, uz = (q.z - z) / q.d;
            if (W.heightAt(mx, mz) || W.heightAt(mx - ux * q.d * 0.25, mz - uz * q.d * 0.25) || W.heightAt(mx + ux * q.d * 0.25, mz + uz * q.d * 0.25)) continue;
            best = { x: mx, z: mz, gap: q.d, ux, uz };
          }
        }
        if (best) cands.push(best);
      }
    }
    for (const c of cands) {
      c.out = reachable(c);
      if (!c.out) { c.enc = 0; continue; }
      c.enc = enclosure(c.x, c.z);
      const w = W.nearestWalk(c.x, c.z, 30, true);
      c.road = w ? Math.hypot(w.x - c.x, w.z - c.z) : 30;
      c.score = (gmax - c.gap) * 1.2 + c.enc * 0.6 + Math.min(c.road, 25) * 0.12;
    }
    const good = cands.filter(c => c.out && c.enc >= 4 && c.road > 4).sort((a, b) => b.score - a.score), out = [];
    for (const c of good) { if (out.length >= T.secretsPerTile) break; if (out.every(o => Math.hypot(o.x - c.x, o.z - c.z) > 30) && K.spots.every(o => Math.hypot(o.x - c.x, o.z - c.z) > 30)) out.push(c); }
    for (const c of out) { const ll = G.ll(c.x, c.z); c.id = 'q' + Math.round(ll.lat * 20000) + ':' + Math.round(ll.lon * 20000); K.spots.push(c); }
    return { cands: cands.length, spots: out };
  };
  function analyseTick(dt) {
    analyseT -= dt;
    if (analyseT > 0) return;
    analyseT = 0.3;
    const p = P();
    const subs = W.subsNear(p.x, p.z, 260).filter(s => !analysed.has(s));
    if (!subs.length) return;
    subs.sort((a, b) => Math.hypot((a.x0 + a.x1) / 2 - p.x, (a.z0 + a.z1) / 2 - p.z) - Math.hypot((b.x0 + b.x1) / 2 - p.x, (b.z0 + b.z1) / 2 - p.z));
    analysed.add(subs[0]);
    K.analyse(subs[0]);
  }
  const STASH_BOX = new THREE.BoxGeometry(0.62, 0.42, 0.46);
  const STASH_MAT = new THREE.MeshLambertMaterial({ color: 0x9a6a3c });
  const STASH_LID = new THREE.MeshLambertMaterial({ color: 0xc9a26a });
  function stashMesh() {
    const g = new THREE.Group(), b = new THREE.Mesh(STASH_BOX, STASH_MAT); b.position.y = 0.21; b.castShadow = !LOW; g.add(b);
    const lid = new THREE.Mesh(STASH_BOX, STASH_LID); lid.scale.set(1.04, 0.2, 1.04); lid.position.y = 0.46; g.add(lid);
    const spark = W.emojiSprite('✨', 0.7); spark.position.y = 1.0; g.add(spark); g.userData.spark = spark;
    return g;
  }
  function secretTick(dt) {
    secretT -= dt;
    if (secretT > 0) return;
    secretT = 0.4;
    const p = P(), c = st();
    // the nearest unfound spots get a stash; far ones lose it
    for (const [id, o] of K.stash) { if (c.secrets[id] || Math.hypot(o.sp.x - p.x, o.sp.z - p.z) > 230) { W.scene.remove(o.obj); K.stash.delete(id); } }
    const near = K.spots.filter(s => !c.secrets[s.id] && Math.hypot(s.x - p.x, s.z - p.z) < 200).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z)).slice(0, 14);
    for (const sp of near) if (!K.stash.has(sp.id)) { const obj = stashMesh(); obj.position.set(sp.x, gy(sp.x, sp.z), sp.z); obj.rotation.y = Math.random() * 6.28; W.scene.add(obj); K.stash.set(sp.id, { sp, obj }); }
    for (const o of K.stash.values()) {
      const d = Math.hypot(o.sp.x - p.x, o.sp.z - p.z);
      o.obj.visible = d < T.secretSee;
      if (d < 18 && Math.random() < 0.3) W.burst(o.sp.x, gy(o.sp.x, o.sp.z) + 0.9, o.sp.z, '✨', 2, { spread: 0.8, up: 1.4, size: 0.35, life: 0.8, grav: 1 });
      if (d < 22 && !hintSaid && G.storyOn() && G.hero) { hintSaid = true; G.hero.ticker('Psst... something glints in that gap between the buildings.', 'Your nosy side', '🔍'); }
    }
  }
  function openSecret(o) {
    const c = st(), s = save(), p = P(), L = lvl();
    c.secrets[o.sp.id] = s.day;
    if (G.color) G.color.secret(o.sp);   // colour blocks: stashes bring the streets back
    W.scene.remove(o.obj); K.stash.delete(o.sp.id);
    api.bump('secrets');
    let tot = 0; for (const r of CP.SECRET_LOOT) tot += r[1];
    let r = Math.random() * tot, kind = 'money';
    for (const q of CP.SECRET_LOOT) { if (r < q[1]) { kind = q[0]; break; } r -= q[1]; }
    let what = '';
    if (kind === 'money') { const n = Math.round(rnd(25, 60) * (1 + L * 0.15)); G.addMoney(n); what = '+' + G.fmt$(n); }
    else if (kind === 'chest') { if (G.rpg) G.rpg.drop('chest'); api.bump('chests'); what = 'a piece of gear'; }
    else if (kind === 'ammo') { c.ammo = Math.min(T.ammoMax, c.ammo + 20); what = '+20 ammo 🎯'; }
    else if (kind === 'powers') { c.water = Math.min(T.waterMax, c.water + T.waterOrb); c.volt = Math.min(T.voltMax, c.volt + T.voltOrb); what = '+' + T.waterOrb + ' 💧 and +' + T.voltOrb + ' 🌩️'; }
    else if (kind === 'sticker') { G.addSticker(); what = 'a sticker'; }
    else { const n = 40 + 10 * L; G.addXp(n, 'explore'); what = '+' + n + ' XP'; }
    const found = Object.keys(c.secrets).length;
    U.banner('🔍 Secret #' + found + ' found!', pick(CP.NOTES) + '  ·  Inside: ' + what, 'done');
    word(pick(['NOSY!', 'SNOOPING PAYS!', 'FOUND IT!', 'SECRET!']), 'violet', what);
    W.burst(o.sp.x, gy(o.sp.x, o.sp.z) + 0.8, o.sp.z, '✨', 10, { spread: 2, up: 3 });
    G.sfx.done(); mayhem('photo');
    if (G.hero) G.hero.swag(6);
    G.dirty();
  }
  K.interaction = function (p) {
    if (quiet()) return null;
    for (const o of K.stash.values()) if (Math.hypot(o.sp.x - p.x, o.sp.z - p.z) < 2.1 && Math.abs(p.y - gy(o.sp.x, o.sp.z)) < 2) return { t: '✨ Peek into the gap', fn: () => openSecret(o) };
    const c = st();
    if (c.water < T.waterMax && onFoot()) {
      const h = W.propNear(p.x, p.z, 2.2, { kind: 'hydrant' });
      if (h && !(K._hyd && K._hyd[h.key] > G.rt.t)) return { t: '💧 Fill up your water power at the hydrant', fn: () => { (K._hyd = K._hyd || {})[h.key] = G.rt.t + 90; c.water = Math.min(T.waterMax, c.water + T.hydrant); if (G.wild) G.wild.soak(10); U.feed('💧', 'Water power ' + c.water + '/' + T.waterMax); W.burst(h.x, gy(h.x, h.z) + 1, h.z, '💧', 8, { spread: 1, up: 4 }); sfx('splash'); G.dirty(); } };
    }
    return null;
  };

  // ------------------------------------------------------------------ hooks for the game
  if (G.hero) { // figments sometimes drop ammo or a power orb
    const orig = G.hero.event;
    G.hero.event = function (ev, o) {
      orig(ev, o);
      if (ev !== 'kill' || !alive || !o || !o.m || o.m.kind === 'mega' || o.m.introFoe) return;
      const m = o.m, r = Math.random();
      if (r < 0.16) api.spawnPickup('ammo', m.x, m.z); else if (r < 0.24) api.spawnPickup(Math.random() < 0.5 ? 'water' : 'volt', m.x, m.z);
    };
  }
  K.markers = function (list) {
    const p = P();
    for (const f of K.fires) if (Math.abs(f.x - p.x) < 260 && Math.abs(f.z - p.z) < 260) list.push({ x: f.x, z: f.z, color: '#ff6a1a', r: 4, emoji: '🔥', ring: '#1f1a3d' });
    for (const m of K.megas) if (!m.dead) list.push({ x: m.x, z: m.z, color: '#ff2d6b', r: 10, emoji: m.def.e, ring: '#ffffff', edge: true });
    for (const o of K.stash.values()) if (Math.hypot(o.sp.x - p.x, o.sp.z - p.z) < 30) list.push({ x: o.sp.x, z: o.sp.z, color: '#b79cff', r: 3.5, emoji: '✨', ring: '#1f1a3d' });
  };
  K.summary = function () {
    const c = st();
    return { intro: c.intro, left: Math.max(0, Math.round(c.left)), tier, wild: CP.WILD.map((w, i) => Object.assign({ on: i < tier, next: i === tier }, w)),
      cap: CP.CAP[Math.min(tier, CP.CAP.length - 1)], secrets: Object.keys(c.secrets).length, nearSecrets: K.stash.size, megas: save().counters.megas || 0,
      fires: save().counters.fires_out || 0, ammo: c.ammo, water: c.water, volt: c.volt, foam: Math.round(c.foam), max: { ammo: T.ammoMax, water: T.waterMax, volt: T.voltMax } };
  };
  K.tick = function (dt, paused) {
    if (!alive) return;
    for (let i = bolts.length - 1; i >= 0; i--) { const b = bolts[i]; b.t += dt; if (b.t > 0.22) { W.scene.remove(b.g); bolts.splice(i, 1); } }
    hudT -= dt;
    if (hudT <= 0) { hudT = 0.15; hud(); }
    if (paused) return;
    shrugT -= dt; pwCd -= dt;
    tierT -= dt;
    if (tierT <= 0) { tierT = 0.5; tierTick(); }
    introTick(dt);
    manageCrates(dt);
    sprayTick(dt);
    fireTick(dt);
    stormTick(dt);
    for (const m of K.megas.slice()) megaTick(m, dt);
    megaSpawner(dt);
    analyseTick(dt);
    secretTick(dt);
  };
  K.bolt = bolt;   // lightning bolts for cft-wild.js (metal arcs)
  K.test = { pwCd: () => pwCd, spraying: () => spraying, st, endIntro, introTick, startStorm, stopStorm, crates, orbs, foams, analysed, removeMega, douse };
  K.destroy = function () {
    alive = false;
    for (const m of K.megas.slice()) removeMega(m);
    for (const f of K.fires.slice()) removeFire(f, false);
    for (const o of K.stash.values()) W.scene.remove(o.obj);
    introEl.remove(); stormEl.remove();
    shell.classList.remove('cft-panic', 'cft-storming');
    W.stompHook = null; W.onPropBounce = null; W.onWallJump = null; W.onMantle = null; W.onWreckFire = null;
  };
  return K;
}

window.CFTCamp = { attach };
})();

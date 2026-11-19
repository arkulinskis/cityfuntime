/* City Fun Time: the open-air update (2026-11-18). The user: "research the controls and game mechanics of Breath of the Wild;
   I want this game to feel more like that, but with the insanity and 12-year-old humour." A research agent's report
   (mechanics and feel only: no names, art or story) became, in this order:
   - climb any building (hold forward against a wall; cft-world.js updatePlayer) with a STAMINA DONUT next to you that only
     shows when it isn't full; jump off (Space), a burst up the wall (Shift + Space); empty = you let go and walk slowly for a bit
   - an umbrella by default: hold Space while falling to glide (gear jetpacks / glide-brellas still win); UPDRAFTS rise
     from fires and sewer manholes
   - a perfect dodge: jump while blocking (a hop away) just before a hit lands -> slow motion + a FLURRY of free hits
   - slow motion when you shoot or use a power high in the air (costs stamina)
   - chemistry: lightning jumps through metal (lamps, bins, mailboxes, hydrants, cars) to figments next to them; water on
     fire makes steam that blinds figments; being soaked (rain, a hydrant) makes you fireproof but lightning hits twice as hard
   - rooftop viewpoints: the tallest building in every 400 m square grows a silly antenna; climb up, E to tune in, and the
     secrets around it show on your map ("see it, go there")
   - tiny-secret hints: a giggle when you're within 10 m of a hidden stash
   Left out on purpose: breaking weapons, long puzzle rooms, hundreds of collectibles.

   const X = CFTWild.attach(G, api)   by cft-game.js after G.camp (G.wild = X). api: {bump, bumpTo, spawnPickup, setBusy}
   X.tick(dt, paused) · X.speedMul() (tired) · X.perfectDodge(m) (cft-fun.js strike) · X.flurryOn() / X.flurryHit() (F.attack)
   X.conduct(x, z, dmg) / X.steam(x, z) (cft-camp.js) · X.soaked() / X.soak(s) · X.interaction(p) · X.markers(list) · X.destroy()
   World hooks: W.stam {can(kind), use(kind, dt)} · W.onClimb / onClimbJump / onDodge / onTired · W.flyHook (wrapped: the umbrella)
   Data: D.TUNE.wild (cft-content.js). State: save.wild {views {cell: day}}. Counters: climbed, glided, perfectdodges, airshots,
   arcs, views. Tests: tools/live/wildtest.js (game_test.py --wild). */
(function () {
'use strict';

function attach(G, api) {
  const D = G.D, W = G.W, U = G.ui, THREE = W.THREE, T = D.TUNE.wild, F = G.fun;
  const LOW = !W.renderer.shadowMap.enabled;
  const save = () => G.save;
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const P = () => W.player.pos;
  const gy = (x, z) => W.groundAt(x, z);
  const X = { stam: T.stamMax, tired: false, views: [] };
  let alive = true, regenWait = 0, shownT = 0, dodgeT = -9, flurry = 0, gliding = false, soakT = 0, viewT = 0, giggled = new Set(), climbAcc = 0, glideAcc = 0, lastFall = 0, steamT = 0;
  const word = (t, tone, sub, big) => { if (G.hero) G.hero.word(t, tone, sub, big); };
  const mayhem = k => { if (G.chaos) G.chaos.add(k); };
  const quiet = () => G.rt.busy || U.isOpen() || G.state() !== 'play';
  const free = () => !!(G.camp && G.camp.inIntro());   // the opening: stamina is free
  const tip = (k, text) => { const s = st(); if (s.tips[k]) return; s.tips[k] = 1; U.toast(text); G.dirty(); };
  function st() {
    const s = save();
    if (!s.wild || typeof s.wild !== 'object') s.wild = {};
    const w = s.wild;
    if (!w.views || typeof w.views !== 'object') w.views = {};
    if (!w.tips || typeof w.tips !== 'object') w.tips = {};
    return w;
  }
  st();

  // ------------------------------------------------------------------ stamina: one donut for climbing, gliding, slow motion
  const COST = { climb: T.climb, hang: T.hang, glide: T.glide, airaim: T.airAim };
  W.stam = {
    can(kind) {
      if (free()) return true;
      if (X.tired) return false;
      if (kind !== 'climbjump' && X.stam <= 0.5) { W.stam.use(kind, 1e3); return false; }   // the last drop: exhausted
      return X.stam > (kind === 'climbjump' ? T.climbJump : 0.5);
    },
    use(kind, dt) {
      if (free()) return true;
      if (kind === 'climbjump') { if (X.tired || X.stam < T.climbJump) return false; X.stam -= T.climbJump; regenWait = T.regenDelay; return true; }
      X.stam = Math.max(0, X.stam - (COST[kind] || 0) * (dt || 0));
      regenWait = T.regenDelay;
      if (X.stam <= 0 && !X.tired) { X.tired = true; tip('tired', '🥵 Out of stamina! You let go and walk slowly until the donut is a third full again.'); W.pop(P().x, P().y + 2.4, P().z, pick(['WHEEZE...', 'NOODLE ARMS!', 'SO TIRED']), '#b0a9c8', 0.9); }
      return X.stam > 0;
    },
  };
  X.speedMul = () => (X.tired && !save().equip.ride ? T.tiredSpeed : 1);
  function staminaTick(dt) {
    const pl = W.player, busy = pl.climb || gliding;
    if (!busy && pl.grounded) {
      regenWait -= dt;
      if (regenWait <= 0) X.stam = Math.min(T.stamMax, X.stam + T.regen * dt);
    }
    if (X.tired && X.stam >= T.stamMax * T.tiredUntil) X.tired = false;
  }
  // the donut: an SVG ring beside you, only while it isn't full (and a moment after)
  const shell = U.canvas.parentElement;
  const donut = document.createElement('div');
  donut.className = 'cft-donut'; donut.hidden = true;
  donut.innerHTML = '<svg viewBox="0 0 40 40"><circle class="bg" cx="20" cy="20" r="15"/><circle class="fg" cx="20" cy="20" r="15" data-dfg/></svg><b>💪</b>';
  shell.appendChild(donut);
  const dfg = donut.querySelector('[data-dfg]'), CIRC = 2 * Math.PI * 15;
  dfg.style.strokeDasharray = CIRC;
  function drawDonut(dt) {
    const k = X.stam / T.stamMax, pl = W.player;
    if (k < 0.999 || pl.climb || gliding) shownT = 0.8; else shownT -= dt;
    const show = shownT > 0 && G.state() === 'play' && !U.isOpen();
    if (donut.hidden === show) donut.hidden = !show;
    if (!show) return;
    dfg.style.strokeDashoffset = String(CIRC * (1 - (free() ? 1 : k)));
    donut.classList.toggle('low', k < 0.25 && !X.tired);
    donut.classList.toggle('tired', X.tired);
    const q = W.project(pl.pos.x, pl.pos.y + 1.6, pl.pos.z);
    if (q.behind) { donut.hidden = true; return; }
    donut.style.transform = 'translate(' + Math.round(q.x + 46) + 'px,' + Math.round(q.y) + 'px)';
  }

  // ------------------------------------------------------------------ the umbrella: glide by default, ride updrafts
  const brella = W.emojiSprite('☂️', 1.7);
  brella.position.set(0, 2.75, 0); brella.visible = false;
  W.avatar.add(brella);
  function updraftAt(x, z, y) {
    for (const f of (G.camp && G.camp.fires) || []) { if (Math.hypot(f.x - x, f.z - z) < 1.6 + f.size * 0.5 && y < gy(f.x, f.z) + 8 + f.size * 5) return 'fire'; }
    for (const h of (G.chaos && G.chaos.holes) || []) { if (Math.hypot(h.x - x, h.z - z) < 1.8 && y < gy(h.x, h.z) + 15) return 'vent'; }
    return null;
  }
  const prevFly = W.flyHook;
  W.flyHook = function (dt, pl, inp, grav, ctl) {
    const g = prevFly ? prevFly(dt, pl, inp, grav, ctl) : grav;
    gliding = false;
    if ((G.chaos && G.chaos.flying()) || !ctl || pl.grounded || W.ride().mode !== 'foot') return g;
    const high = pl.pos.y - gy(pl.pos.x, pl.pos.z);
    if (high > 4 && pl.vy < -6 && !st().tips.glide) tip('glide', '☂️ Hold Space while falling to open your umbrella and glide. Fires and manholes blow you upwards.');
    if (!inp.hold || pl.vy > 0.5 || high < 1.2 || !W.stam.can('glide')) return g;
    gliding = true;
    W.stam.use('glide', dt);
    const draft = updraftAt(pl.pos.x, pl.pos.z, pl.pos.y);
    if (draft) { pl.vy += (T.draftUp - pl.vy) * Math.min(1, dt * 3); if (Math.random() < dt * 8) W.burst(pl.pos.x, pl.pos.y - 1, pl.pos.z, draft === 'fire' ? '🔥' : '💨', 1, { spread: 1, up: 6, size: 0.5, life: 0.6, grav: -2 }); return 0; }
    if (pl.vy < -T.glideSink) pl.vy += (-T.glideSink - pl.vy) * Math.min(1, dt * 8);
    return grav * 0.15;
  };

  // ------------------------------------------------------------------ perfect dodge -> slow motion + a flurry of free hits
  W.onDodge = function () { dodgeT = G.rt.t; api.bump('dodgehops'); tip('dodge', '💨 Dodge hop! Do it right before a hit lands (when the ❗ ring turns gold) for a PERFECT DODGE and a flurry of free hits.'); };
  function slowmo(secs, k) { G.rt.slowmo = Math.max(G.rt.slowmo || 0, secs); G.rt.slowK = k; }
  X.perfectDodge = function (m) {
    if (G.rt.t - dodgeT > T.dodgeWindow) return false;
    dodgeT = -9;
    m.stun = Math.max(m.stun, T.flurrySecs * 1.4); m.recover = 0;
    flurry = T.flurryHits;
    slowmo(T.flurrySecs, T.slowK);
    api.bump('perfectdodges'); mayhem('parry');
    if (G.hero) G.hero.swag(D.TUNE.hype.swag.parry);
    word(pick(['PERFECT DODGE!', 'TOO SLOW!', 'MATRIX MODE!', 'NOT EVEN CLOSE!']), 'violet', 'FLURRY: hit F as fast as you can!', true);
    W.burst(P().x, P().y + 1.2, P().z, '✨', 10, { spread: 3, up: 2 });
    return true;
  };
  X.flurryOn = () => flurry > 0 && (G.rt.slowmo || 0) > 0 && G.rt.slowK === T.slowK;
  X.flurryHit = () => { if (flurry > 0) { flurry--; api.bump('flurryhits'); } };

  // ------------------------------------------------------------------ slow motion when you shoot (or use a power) high in the air
  function airAim() {
    const pl = W.player;
    if (pl.grounded || pl.climb || pl.pos.y - gy(pl.pos.x, pl.pos.z) < T.airAimHeight) return;
    if (!free() && (X.tired || X.stam < T.airAimCost)) return;
    if (!free()) { X.stam -= T.airAimCost; regenWait = T.regenDelay; }
    slowmo(T.airAimSecs, T.airK);
    pl.vy = Math.max(pl.vy, -1);   // hang in the air for the shot
    api.bump('airshots');
    if (!X._airWord || G.rt.t - X._airWord > 6) { X._airWord = G.rt.t; word(pick(['AIR TIME!', 'BULLET TIME!', 'SLOW-MO YEET!']), 'violet'); }
  }
  if (G.chaos) { const f0 = G.chaos.fire; G.chaos.fire = function (w) { const r = f0(w); if (r) airAim(); return r; }; }
  if (G.camp) { const p0 = G.camp.power; G.camp.power = function (k, down) { const r = p0(k, down); if (r && down && k !== 'foam') airAim(); return r; }; }

  // ------------------------------------------------------------------ chemistry: metal conducts, steam blinds, soaked = fireproof
  const METAL = ['lamp', 'bin', 'box', 'hydrant', 'vend', 'cart', 'car'];
  X.conduct = function (x, z, dmg) {
    const y0 = gy(x, z) + 1;
    let n = 0;
    for (const k of METAL) {
      const e = W.propNear(x, z, T.arcRange, { kind: k, cars: k === 'car' });
      if (!e) continue;
      n++;
      const ey = gy(e.x, e.z) + (k === 'lamp' ? 3 : 1.1);
      if (G.camp && G.camp.bolt) G.camp.bolt(x, y0, z, e.x, ey, e.z, 0.12);
      W.burst(e.x, ey, e.z, '⚡', 3, { spread: 1.5, up: 2, size: 0.45 });
      for (const m of F.monsters.slice()) if (!m.dead && Math.hypot(m.x - e.x, m.z - e.z) < T.arcHit) { F.hitMonster(m, { dmg: dmg * 0.6, knock: 3, stun: 1.2, word: pick(['ARC!', 'BZZZT!', 'SHOCKING!']), puff: '⚡' }, { x: (m.x - e.x) || 0.1, z: (m.z - e.z) || 0.1 }); api.bump('arcs'); }
      if (k === 'lamp' && Math.random() < 0.3) W.pop(e.x, ey + 1, e.z, 'FLICKER!', '#fff07a', 0.7);
    }
    if (n && !st().tips.arc) tip('arc', '⚡ Lightning jumps through metal: lamps, bins, mailboxes, hydrants and cars zap figments standing next to them.');
    return n;
  };
  X.steam = function (x, z) {
    if (G.rt.t - steamT < 0.25) return;
    steamT = G.rt.t;
    W.burst(x, gy(x, z) + 1, z, '☁️', 6, { spread: 3, up: 2.5, size: 1.1, life: 1.6, grav: -1 });
    for (const m of F.monsters) if (!m.dead && Math.hypot(m.x - x, m.z - z) < T.steamR) { m.stun = Math.max(m.stun, T.steamBlind); if (!(m.steamT > G.rt.t)) { m.steamT = G.rt.t + 2; W.pop(m.x, m.obj.position.y + 2.2, m.z, pick(['CAN\'T SEE!', 'MY GLASSES!', 'FOGGY!']), '#ffffff', 0.8); } }
  };
  X.soak = s => { soakT = Math.max(soakT, s); };
  X.soaked = () => soakT > 0 || !!(G.camp && G.camp.storm);

  // ------------------------------------------------------------------ rooftop viewpoints: an antenna on the tallest roof in every 400 m square
  const CELL = T.viewCell;
  const cellOf = (x, z) => Math.floor(x / CELL) + ':' + Math.floor(z / CELL);
  const views = new Map();   // cell -> {b, x, z, y, obj}
  function antenna() {
    const g = new THREE.Group(), m = new W.Merge(), GEO = W.GEO;
    m.add(GEO.CYL, 0x8a8f99, 0, 2.6, 0, 0, 0, 0, 0.09, 5.2, 0.09);
    m.add(GEO.CYL, 0x8a8f99, 0, 0.15, 0, 0, 0, 0, 1.2, 0.3, 1.2);
    m.add(GEO.SPHERE, 0xf4f1ea, 0.55, 4.0, 0, 0, 0, 0.6, 0.9, 0.9, 0.25);
    m.add(GEO.CYL, 0xff5c8a, 0, 4.8, 0, 0, 0, 1.57, 0.05, 1.6, 0.05);
    m.add(GEO.SPHERE, 0xffc21f, 0, 5.4, 0, 0, 0, 0, 0.22, 0.22, 0.22);
    const mesh = m.mesh(); mesh.castShadow = !LOW; g.add(mesh);
    const tag = W.label('📡', { bg: 'rgba(255,194,31,.95)', fg: '#1f1a3d', size: 54, height: 1.6, border: '#1f1a3d' });
    tag.position.y = 6.8; g.add(tag); g.userData.tag = tag;
    return g;
  }
  function viewTick(dt) {
    viewT -= dt;
    if (viewT > 0) return;
    viewT = 2;
    const p = P(), best = new Map();
    for (const s of W.subsNear(p.x, p.z, 560)) for (const b of s.buildings) {
      if (b.base == null || b.m >= 2.5 || b.h < T.viewMinH || b.area < 60) continue;
      const c = cellOf(b.cx, b.cz), o = best.get(c);
      if (!o || b.h > o.h) best.set(c, b);
    }
    for (const [c, v] of views) if (!best.has(c) && Math.hypot(v.x - p.x, v.z - p.z) > 650) { W.scene.remove(v.obj); views.delete(c); }
    for (const [c, b] of best) {
      const v = views.get(c);
      if (v && v.b === b) continue;
      if (v) W.scene.remove(v.obj);
      const obj = antenna(), y = b.base + b.h;
      obj.position.set(b.cx, y, b.cz);
      if (W.roofAt(b.cx, b.cz) == null) { const q = { x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 }; obj.position.x = q.x; obj.position.z = q.z; }
      W.scene.add(obj);
      views.set(c, { c, b, x: obj.position.x, z: obj.position.z, y, obj });
    }
    const w = st();
    for (const v of views.values()) { v.obj.userData.tag.visible = !w.views[v.c]; }
    X.views = [...views.values()];
  }
  function tuneIn(v) {
    const w = st(), L = G.level();
    w.views[v.c] = save().day;
    api.bump('views');
    const secrets = ((G.camp && G.camp.spots) || []).filter(q => cellOf(q.x, q.z) === v.c && !(save().camp.secrets || {})[q.id]).length;
    G.addXp(60 + 10 * L, 'explore');
    U.banner('📡 Tuned in!', 'The whole neighbourhood is on your map now: ' + (secrets ? secrets + ' secret' + (secrets > 1 ? 's' : '') + ' (✨) and every antenna nearby.' : 'no secrets left around here, but every antenna nearby.') + ' Static says hi.', 'done');
    word(pick(['SIGNAL BOOSTED!', 'FIVE BARS!', 'WI-FI WIZARD!']), 'mint', 'secrets around here show on your map');
    W.burst(v.x, v.y + 5.4, v.z, '📶', 10, { spread: 4, up: 3 });
    G.sfx.done(); mayhem('photo');
    G.dirty();
  }
  X.interaction = function (p) {
    for (const v of views.values()) {
      if (st().views[v.c]) continue;
      const rf = W.roofAt(p.x, p.z);
      if (rf != null && Math.abs(rf - v.y) < 0.6 && Math.abs(p.y - v.y) < 1.2 && Math.hypot(v.x - p.x, v.z - p.z) < 14) return { t: '📡 Tune in to the neighbourhood', fn: () => tuneIn(v) };
    }
    return null;
  };
  X.markers = function (list) {
    const p = P(), w = st(), sec = (save().camp && save().camp.secrets) || {};
    for (const v of views.values()) if (!w.views[v.c] && Math.hypot(v.x - p.x, v.z - p.z) < 600) list.push({ x: v.x, z: v.z, color: '#ffc21f', r: 6, emoji: '📡', ring: '#1f1a3d', edge: Math.hypot(v.x - p.x, v.z - p.z) < 350 });
    for (const q of (G.camp && G.camp.spots) || []) if (w.views[cellOf(q.x, q.z)] && !sec[q.id]) list.push({ x: q.x, z: q.z, color: '#b79cff', r: 4, emoji: '✨', ring: '#1f1a3d' });
  };

  // ------------------------------------------------------------------ the rest of the hooks
  W.onClimb = function () { tip('climb', '🧗 Climbing! Keep pushing forward to go up (it costs stamina: the donut). Space = jump off the wall, Shift + Space = jump up it.'); };
  W.onClimbJump = function () { const p = P(); W.burst(p.x, p.y + 0.5, p.z, '💨', 3, { spread: 1, up: 1, size: 0.45, life: 0.4 }); };
  W.onTired = function () { const p = P(); W.pop(p.x, p.y + 2.4, p.z, pick(['AAAAH!', 'GRIP FAILED', 'NOODLE ARMS!']), '#b0a9c8', 0.9); };
  function giggleTick() {
    if (!G.camp || !G.camp.stash) return;
    const p = P();
    for (const [id, o] of G.camp.stash) {
      if (giggled.has(id) || Math.hypot(o.sp.x - p.x, o.sp.z - p.z) > T.giggleR) continue;
      giggled.add(id);
      W.pop(o.sp.x, gy(o.sp.x, o.sp.z) + 1.4, o.sp.z, pick(['*giggle*', 'hehehe', 'psst!', '*snort*']), '#b79cff', 0.8);
      if (G.chaos && G.chaos.sfx) G.chaos.sfx.squeak();
    }
  }
  X.tick = function (dt, paused) {
    if (!alive) return;
    const pl = W.player;
    brella.visible = gliding;
    shell.classList.toggle('cft-slowmo', (G.rt.slowmo || 0) > 0);
    drawDonut(dt);
    if (paused) return;
    staminaTick(dt);
    if (soakT > 0) soakT -= dt;
    if (pl.climb) { climbAcc += Math.max(0, pl.vy) * dt; if (climbAcc >= 1) { api.bump('climbed', Math.floor(climbAcc)); climbAcc -= Math.floor(climbAcc); } }
    if (gliding) { glideAcc += dt; if (glideAcc >= 1) { api.bump('glided'); glideAcc -= 1; } }
    if (flurry > 0 && !((G.rt.slowmo || 0) > 0)) flurry = 0;
    viewTick(dt);
    giggleTick();
    void lastFall;
  };
  X.test = { st, views, cellOf, tuneIn, airAim, get gliding() { return gliding; } };
  X.destroy = function () {
    alive = false;
    for (const v of views.values()) W.scene.remove(v.obj);
    W.avatar.remove(brella); donut.remove();
    shell.classList.remove('cft-slowmo');
    W.stam = null; W.onClimb = null; W.onClimbJump = null; W.onDodge = null; W.onTired = null; W.flyHook = prevFly;
  };
  return X;
}

window.CFTWild = { attach };
})();

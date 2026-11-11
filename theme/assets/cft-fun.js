/* City Fun Time: street life, the wacky half of the game. Monsters and silly weapons, talking to strangers (jokes,
   flirting, sweethearts around town), street folk (help them, be crowned), pranks on made-up shops and the owners who
   chase you, rival shopkeepers, banana peels, trampolines and random street events (money rain, flash mobs, a UFO,
   a furious goose, mystery crates). Data: cft-content.js ("the wacky update"). 3D helpers: cft-world.js.

   const F = CFTFun.attach(G, api)     called by cft-game.js once the world is loaded (G.fun = F)
   F.tick(dt, paused) · F.interaction(p) -> {t, fn} | null · F.pedMenu(ped) · F.attack() · F.newDay(parts)
   F.shopGate(place) -> {t, fn} | null (a shop that banned you) · F.prank(place) · F.markers(list) · F.summary()
   F.speedMul() · F.happyBonus() · F.fortune() · F.destroy()
   Combat (2026-11-11, Diablo-style): health, armour (G.rpg), monster levels by distance from home, champion packs, a foe bar,
   damage numbers, blacking out and coming to at home or the nearest freed metro station (your wallet stays where you fell),
   15 monster types named after your city, and a guardian at every metro entrance: beat it and the station opens.
   F.maxHp() · F.hurt(n) · F.heal(n) · F.quaff() · F.metroOpen(place) · F.localName(kind) · F.cityName()
   Everything it keeps is in save.fun: {hearts, king, folk{}, folkAt{}, crushes[], grudges{}, feats{}, hp, cleared{}, wallet}. */
(function () {
'use strict';

function attach(G, api) {
  const D = G.D, W = G.W, U = G.ui, THREE = W.THREE;
  const save = () => G.save;
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const P = () => W.player.pos;
  const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const fmt$ = G.fmt$;
  const LOW = !W.renderer.shadowMap.enabled;
  const F = { monsters: [], folk: [], sweet: new Map(), chasers: [], peels: [], pads: [], shots: [], event: null, boost: 0, boostMul: 1 };
  let alive = true, cool = 0, slow = 0, propT = 0, eventT = 45 + Math.random() * 25, shopT = 0, rivalCool = 0, weaponOn, lastHurt = -99, foeT = 0, guardT = 0;
  F.guards = new Map();

  function fun() {
    const s = save();
    if (!s.fun || typeof s.fun !== 'object') s.fun = {};
    const f = s.fun;
    if (typeof f.hearts !== 'number') f.hearts = 0;
    for (const k of ['folk', 'folkAt', 'grudges', 'feats', 'cleared']) if (!f[k] || typeof f[k] !== 'object') f[k] = {};
    if (!Array.isArray(f.crushes)) f.crushes = [];
    return f;
  }
  const later = (ms, fn) => setTimeout(() => { if (alive) fn(); }, ms);
  const sayAt = (obj, text, secs) => { if (obj) W.say(obj, text, secs || 2.6); };
  const feat = id => { const f = fun(); if (f.feats[id]) return; f.feats[id] = save().day; const st = G.giveSticker(id); if (st) U.banner(st.e + ' Feat: ' + st.n, 'A new sticker for the Shenanigans page of your album.', 'level'); };
  const titleOf = (list, n) => { let t = ''; for (const [at, name] of list) if (n >= at) t = name; return t; };
  const quiet = () => G.rt.busy || U.isOpen() || G.state() !== 'play';
  const onFoot = () => W.ride().mode !== 'drive';
  const calm = () => !!(window.CFT_TEST && window.CFT_TEST.calm); // tests: nothing starts by itself
  const facing = () => ({ x: -Math.sin(W.player.face), z: -Math.cos(W.player.face) });
  function place(obj, x, z, yaw) { obj.position.set(x, W.surfaceAt(x, z), z); if (yaw != null) obj.rotation.y = yaw; }
  // Walks e ({x, z, obj}) towards a point, sliding along walls. Returns the distance left.
  function walk(e, tx, tz, sp, dt, R) {
    const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz);
    if (d > 0.05) {
      const m = Math.min(d, sp * dt);
      e.x += dx / d * m; e.z += dz / d * m;
      W.collide(e, R || 0.4);
      e.obj.position.set(e.x, W.groundAt(e.x, e.z), e.z);
      const want = Math.atan2(-dx, -dz), da = Math.atan2(Math.sin(want - e.obj.rotation.y), Math.cos(want - e.obj.rotation.y));
      e.obj.rotation.y += da * Math.min(1, dt * 9);
    }
    return d;
  }
  const nameTag = (text, y) => { const l = W.label(text, { size: 34, height: 0.5, bg: 'rgba(255,255,255,.92)', fg: '#1f1a3d', border: '#1f1a3d' }); l.position.y = y || 2.35; return l; };
  // A spot on a street about a..b metres from (x, z), found by walking the street graph from there (a random pick
  // over the whole loaded map almost never lands in a small ring close to you).
  function streetSpot(x, z, a, b) {
    for (let t = 0; t < 6; t++) {
      const ag = W.agentOn(x, z, false);
      if (!ag) break;
      if (Math.random() < 0.5) { ag.dir = -1; ag.t = ag.sg.L - ag.t; }
      let left = a + Math.random() * (b - a);
      while (left > 0) { W.agentAdvance(ag, Math.min(12, left), false); left -= 12; }
      const q = W.agentPoint(ag), d = Math.hypot(q.x - x, q.z - z);
      if (d >= a * 0.6 && d <= b * 1.2 && !W.heightAt(q.x, q.z)) return { x: q.x, z: q.z, yaw: Math.atan2(-q.ux, -q.uz) };
    }
    return W.randomWalkSpot(x, z, a * 0.6, b * 1.2);
  }
  // A spot on the pavement beside a street near (x, z): {x, z, yaw} facing the road, or null
  function kerbSpot(x, z, minD, maxD) {
    for (let t = 0; t < 12; t++) {
      const s = W.randomWalkSpot(x, z, minD, maxD);
      if (!s) return null;
      const w = W.nearestWalk(s.x, s.z, 12);
      if (!w || !w.car) continue;
      const dx = -Math.sin(w.yaw), dz = -Math.cos(w.yaw), side = Math.random() < 0.5 ? 1 : -1, off = w.w / 2 + 1.5;
      const kx = w.x - dz * off * side, kz = w.z + dx * off * side;
      if (W.heightAt(kx, kz) || W.roadAt(kx, kz) || W.heightAt(kx + 0.7, kz) || W.heightAt(kx - 0.7, kz) || W.heightAt(kx, kz + 0.7) || W.heightAt(kx, kz - 0.7)) continue;
      return { x: kx, z: kz, yaw: Math.atan2(-(w.x - kx), -(w.z - kz)) };
    }
    return null;
  }

  // ------------------------------------------------------------------ weapons
  function weapon() { const lw = G.rpg && G.rpg.weapon(); if (lw) return lw; const it = D.ITEMS[save().equip.weapon]; return it && it.weapon ? Object.assign({ e: it.e, n: it.n }, it.weapon) : Object.assign({ e: '🖐️', n: 'Bare hands' }, D.SLAP); }
  function syncWeapon() {
    const lw = G.rpg && G.rpg.weapon(), id = (lw ? 'loot:' + G.rpg.weaponId() : save().equip.weapon || null) + (onFoot() ? '' : ':ride');
    if (id === weaponOn) return;
    weaponOn = id;
    const it = D.ITEMS[save().equip.weapon];
    W.setWeapon(!onFoot() ? null : lw ? lw.mesh : it && it.weapon ? it.weapon.mesh : null);
  }
  F.attack = function () {
    if (!alive || quiet() || cool > 0) return false;
    if (!onFoot()) { U.toast('Hop off your ride to bonk things (V).'); cool = 0.6; return false; }
    const w = G.rpg ? G.rpg.modWeapon(weapon()) : weapon(), p = P(), f = facing();
    w.dmg *= 1 + 0.15 * (G.level() - 1);  // you grow stronger with every level (monsters do too)
    cool = w.ranged === 'shot' ? 0.32 : 0.42;
    W.swing();
    G.sfx.swing();
    let hits = 0;
    if (w.ranged === 'shot') {
      const sp = W.emojiSprite(w.puff || '🫧', 0.7);
      sp.position.set(p.x + f.x * 0.8, p.y + 1.3, p.z + f.z * 0.8);
      W.scene.add(sp);
      F.shots.push({ sp, x: sp.position.x, z: sp.position.z, vx: f.x * 26, vz: f.z * 26, left: w.reach, w });
      return true;
    }
    const cone = w.ranged === 'cone';
    for (const m of F.monsters) {
      const dx = m.x - p.x, dz = m.z - p.z, d = Math.hypot(dx, dz);
      if (d > w.reach + m.r || (d > 0.8 && (dx * f.x + dz * f.z) / d < (cone ? 0.55 : 0.15))) continue;
      hitMonster(m, w, f); hits++;
      if (!cone && hits >= 3) break;
    }
    for (const c of F.chasers) {
      const dx = c.x - p.x, dz = c.z - p.z, d = Math.hypot(dx, dz);
      if (d > w.reach + 0.4 || (d > 0.8 && (dx * f.x + dz * f.z) / d < 0.15)) continue;
      c.stun = 1.6 + (w.stun || 0) * 0.4; hits++;
      W.pop(c.x, c.obj.position.y + 2.5, c.z, w.word, '#ffc21f');
      sayAt(c.obj, pick(['Oof!', 'My dignity!', 'Hey!!', 'Not the apron!']), 1.6);
      G.sfx.bonk();
    }
    if (cone) { W.burst(p.x + f.x * 2, p.y + 1.2, p.z + f.z * 2, w.puff || '💨', 7, { spread: 5, up: 1.5, size: 0.5, life: 0.7 }); for (const k of F.peels) if (dist2(k, p) < 7) { k.x += f.x * 5; k.z += f.z * 5; place(k.obj, k.x, k.z); } }
    if (hits) {
      W.shake(0.22);
      if (Math.random() < 0.2) { const by = W.nearestPed(p.x, p.z, 10); if (by) { W.holdPed(by, 2, null); sayAt(by.obj, pick(D.STATIC_LINES), 2.2); } }  // they can't see what you're fighting
      return true;
    }
    // nothing monstrous in reach: a passer-by, a sweetheart, or a parked car's alarm
    const ped = W.nearestPed(p.x + f.x * 1.2, p.z + f.z * 1.2, 1.9);
    if (ped && !cone) { bonkPed(ped, w); return true; }
    const car = W.carAt(p.x + f.x * 1.4, p.z + f.z * 1.4, 0.3);
    if (car) { W.pop(car.x, W.groundAt(car.x, car.z) + 2.6, car.z, 'WEE-OO! WEE-OO!', '#ff5c8a'); G.sfx.alarm(); api.bump('alarms'); W.shake(0.1); }
    return true;
  };
  function bonkPed(ped, w) {
    if (ped.bonked && G.rt.t - ped.bonked < 4) return;
    ped.bonked = G.rt.t;
    api.bump('pedbonks');
    const o = ped.obj.position;
    W.pop(o.x, o.y + 2.6, o.z, w.word, '#ffc21f');
    G.sfx.bonk();
    if (w.mesh === 'pillow') { W.burst(o.x, o.y + 1.5, o.z, '🪶', 8, { spread: 3, up: 3 }); W.holdPed(ped, 1.8, 'dance'); sayAt(ped.obj, pick(D.PILLOW_FIGHT), 2); G.addHappy(1); return; }
    W.holdPed(ped, 1.4, 'air');
    sayAt(ped.obj, pick(D.BONKED), 2.2);
    G.addHappy(-1);
  }
  function updateShots(dt) {
    for (let i = F.shots.length - 1; i >= 0; i--) {
      const s = F.shots[i], stepLen = Math.hypot(s.vx, s.vz) * dt;
      s.x += s.vx * dt; s.z += s.vz * dt; s.left -= stepLen;
      s.sp.position.x = s.x; s.sp.position.z = s.z; s.sp.position.y += Math.sin(G.rt.t * 20) * 0.01;
      let hit = W.heightAt(s.x, s.z) > 2;
      for (const m of F.monsters) if (!hit && Math.hypot(m.x - s.x, m.z - s.z) < m.r + 0.7) { hitMonster(m, s.w, { x: s.vx / 26, z: s.vz / 26 }); hit = true; }
      if (hit || s.left <= 0) { W.burst(s.x, s.sp.position.y, s.z, s.w.puff || '🫧', 4, { spread: 1.5, up: 1, size: 0.4, life: 0.5 }); W.scene.remove(s.sp); s.sp.material.dispose(); F.shots.splice(i, 1); }
    }
  }

  // ------------------------------------------------------------------ monsters
  // Local names: the same monster is called something else in every city.
  function cityOf() {
    const h = save().home || {};
    return D.CITIES.find(c => h.lat >= c.lat[0] && h.lat <= c.lat[1] && h.lon >= c.lon[0] && h.lon <= c.lon[1]) || null;
  }
  F.localName = function (kind) {
    const c = cityOf(), h = save().home || {};
    if (c && D.CITY_MONSTERS[c.id] && D.CITY_MONSTERS[c.id][kind]) return D.CITY_MONSTERS[c.id][kind];
    const list = D.MONSTER_LOCAL[kind] || [(D.MONSTERS[kind] || {}).n || kind];
    const key = Math.round((h.lat || 0) * 2) * 1000 + Math.round((h.lon || 0) * 2) + kind.length * 7 + kind.charCodeAt(0);
    return list[Math.abs(key) % list.length];
  };
  F.cityName = () => { const c = cityOf(), h = save().home || {}; return c ? c.n : (h.short || h.label || 'the city').split(',').pop().trim(); };
  // A monster's level: yours near home, higher the further you roam (up to yours + 4). Diablo's areas, on your real streets.
  function monsterLevel(x, z) { const home = G.homeSpot(), L = G.level(); return Math.max(1, Math.min(L + 4, L - 1 + Math.floor(Math.hypot(x - home.x, z - home.z) / 400))); }
  F.monsterLevel = monsterLevel;
  function spawnMonster(kind, x, z, o) {
    const base = D.MONSTERS[kind];
    if (!base) return null;
    o = o || {};
    const def = o.def || Object.assign({}, base, { n: F.localName(kind) });
    const lvl = o.lvl || monsterLevel(x, z) + (o.champ ? 1 : 0);
    const size = (o.size || def.size || 1) * (o.champ ? 1.15 : 1);
    const obj = W.monster(kind);
    obj.userData.size = size; obj.scale.setScalar(size);
    const hp = (o.hp || def.hp) * (1 + 0.18 * (lvl - 1)) * (o.champ ? 2.5 : 1);
    const atk = (def.atk || 6) * (1 + 0.1 * (lvl - 1)) * (o.champ ? 1.4 : 1) * (o.atkMul || 1);
    const m = Object.assign({ kind, obj, x, z, carry: 0, state: 'idle', t: 0, stun: 0, kx: 0, kz: 0, grab: 0, wanderA: Math.random() * 6.28,
      r: (kind === 'blob' ? 1.6 : kind === 'brute' || kind === 'worm' ? 0.85 : 0.6) * size, born: G.rt.t, say: 2 + Math.random() * 6 }, o,
      { def, hp, mhp: hp, atk, lvl, xpv: def.xp * (1 + 0.12 * (lvl - 1)) * (o.champ ? 2.5 : 1) });
    place(obj, x, z, Math.random() * 6.28);
    W.scene.add(obj);
    if (def.boss) { const tag = nameTag(def.e + ' ' + def.n, 3.7); obj.add(tag); }
    if (o.champ) { const tag = W.label('🔵 ' + def.n, { size: 32, height: 0.46, bg: 'rgba(28,80,190,.92)', fg: '#ffffff', border: '#0c2a6b' }); tag.position.y = (def.size ? 2.2 : 2.0) / size + 0.4; obj.add(tag); }
    F.monsters.push(m);
    W.burst(x, obj.position.y + 0.8, z, '💨', 4, { spread: 1.5, up: 1.5, size: 0.5, life: 0.5 });
    return m;
  }
  F.spawnMonster = spawnMonster;
  F.streetSpot = (x, z, a, b) => streetSpot(x, z, a, b);
  function removeMonster(m, poof) {
    const i = F.monsters.indexOf(m);
    if (i >= 0) F.monsters.splice(i, 1);
    if (poof) W.burst(m.x, m.obj.position.y + 0.8, m.z, '💨', 5, { spread: 2, up: 2, size: 0.6 });
    W.removeObj(m.obj);
  }
  const isNight = () => { const h = save().clock; return h >= 21.5 || h < 5; };
  function hitMonster(m, w, f) {
    if (m.dead) return;
    m.hp -= w.dmg; m.stun = Math.max(m.stun, 0.5 + (w.stun || 0) * (m.guard ? 0.25 : 1));
    F.lastFoe = m; foeT = 0;
    m.kx = f.x * (w.knock || 3) * 2.2; m.kz = f.z * (w.knock || 3) * 2.2;
    m.obj.userData.hurt = 0.3;
    const y = m.obj.position.y + m.obj.userData.h * (m.obj.userData.size || 1);
    W.pop(m.x, y + 0.6, m.z, w.word, m.hp <= 0 ? '#ff5c8a' : '#ffc21f');
    W.pop(m.x + 0.7, y + 1.35, m.z, String(Math.max(1, Math.round(w.dmg * 10))), /CRIT/.test(w.word) ? '#ffc21f' : '#ffffff', 0.7);  // damage numbers (x10)
    if (w.puff) W.burst(m.x, y, m.z, w.puff, 5, { spread: 2.5, up: 2.5, size: 0.4 });
    G.sfx.bonk();
    if (m.hp > 0) return;
    // popped: coins fly out (plus whatever it stole from you)
    m.dead = true;
    const def = m.def;
    api.bump('bonks'); api.bump('bonk_' + m.kind);
    const n = Math.round(rnd(def.coins[0], def.coins[1]) / 2 * (m.champ ? 1.6 : 1) * (m.guard ? 1.8 : 1));
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, r = 1.2 + Math.random() * 2.4; let cx = m.x + Math.cos(a) * r, cz = m.z + Math.sin(a) * r; if (W.heightAt(cx, cz)) { cx = m.x; cz = m.z; } api.spawnPickup(def.cash && i === 0 ? 'cash' : 'coin', cx, cz); }
    if (m.carry > 0) { save().money += m.carry; U.feed('💰', 'Got your ' + fmt$(m.carry) + ' back'); U.hud.bump('money'); }
    G.addXp(m.xpv || def.xp, 'monster');
    G.addStat('cred', def.boss || m.guard ? 0.5 : 0.05, true);
    U.feed(def.e, 'Bonked: ' + def.n + ' (level ' + (m.lvl || 1) + ') · +' + Math.round((m.xpv || def.xp) * G.xpMul()) + ' XP');
    if (m.champ) api.bump('champions');
    if (m.guard) freeStation(m);
    if (F.lastFoe === m) F.lastFoe = null;
    W.burst(m.x, y, m.z, '⭐', def.boss ? 16 : 7, { spread: 4, up: 5 });
    W.burst(m.x, y, m.z, '🪙', def.boss ? 12 : 4, { spread: 3, up: 6, size: 0.45 });
    W.shake(def.boss ? 0.6 : 0.3);
    if (def.gem) api.spawnPickup('gem', m.x, m.z);
    if (def.boss) { api.bump('boss'); G.sfx.done(); U.banner('👑 King Blob is no more!', 'The night belongs to you. He left a gem behind.', 'done'); G.log('Dethroned King Blob', '👑'); U.confetti(); }
    else if (Math.random() < 0.06) G.addSticker();
    feat('bonker');
    if (m.kind === 'goose') feat('goosed');
    const total = save().counters.bonks || 0, title = D.MONSTER_TITLES.find(t => t[0] === total);
    if (title && total > 1) U.banner('👾 ' + title[1], total + ' monsters bonked.', 'level');
    if (G.rpg) G.rpg.onKill(m);  // loot
    removeMonster(m, true);
    G.dirty();
  }
  function updateMonsters(dt) {
    const p = P(), s = save(), night = isNight(), home = G.homeSpot();
    if (slow <= 0 && onStory() && !calm()) {
      // who is out: more at night, a couple by day (never close to home), fewer when you're happy, more when you're not
      const wild = F.monsters.filter(m => !m.event && !m.def.boss && !m.guard).length, mood = s.happy >= 75 ? 0.6 : s.happy < 30 ? 1.4 : 1;
      const want = Math.round((night ? (LOW ? 3 : 5) : (LOW ? 1 : 2)) * mood);
      if (wild < want && !quiet()) {
        const sp = W.randomWalkSpot(p.x, p.z, 30, 85, (x, z) => Math.hypot(x - home.x, z - home.z) > (night ? 30 : 90));
        if (sp) {
          const pool = Object.keys(D.MONSTERS).filter(k => D.MONSTERS[k].w > 0 && (night || !D.MONSTERS[k].night));
          let tot = 0; for (const k of pool) tot += D.MONSTERS[k].w;
          let r = Math.random() * tot, kind = pool[0];
          for (const k of pool) { if (r < D.MONSTERS[k].w) { kind = k; break; } r -= D.MONSTERS[k].w; }
          if (G.level() >= 2 && Math.random() < 0.07) { // a champion pack: three, tougher, blue name tags, better pay
            for (let i = 0; i < 3; i++) spawnMonster(kind, sp.x + rnd(-2, 2), sp.z + rnd(-2, 2), { champ: true, nightBorn: night });
            U.banner('🔵 Champions nearby', 'Three ' + F.localName(kind) + 's, tougher than usual. Worth it.', 'fail');
          } else spawnMonster(kind, sp.x, sp.z, { nightBorn: night });
          if (F.nightNote !== s.day && s.clock >= 21) { // once a night: what is going on, and what to do about it
            F.nightNote = s.day;
            U.banner('🌙 The Static is loud tonight', 'Since you moved here, the city\'s noise sometimes takes shape: figments only you can see. Face them (F) and they fade. Sleep, friends and a good mood keep them quiet.', 'day');
          }
        }
      }
      // the boss: when Bouchard asked for him, or now and then for seasoned players
      const h = s.clock, deep = h >= 22 || h < 5, bossOut = F.monsters.some(m => m.def.boss);
      const asked = s.m['s-king-blob'] && s.m['s-king-blob'].s === 'active';
      if (deep && !bossOut && (asked ? G.rt.t - (F.bossT || -999) > 40 : (G.level() >= 6 && Math.random() < 0.004))) {
        const sp = W.randomWalkSpot(p.x, p.z, 45, 90, (x, z) => Math.hypot(x - home.x, z - home.z) > 40);
        if (sp) { F.bossT = G.rt.t; spawnMonster('blob', sp.x, sp.z); U.banner('👑 King Blob is out!', 'Something big and purple is wobbling nearby. The minimap knows where.', 'fail'); G.sfx.fail(); }
      }
    }
    for (let i = F.monsters.length - 1; i >= 0; i--) {
      const m = F.monsters[i], def = m.def, d = Math.hypot(m.x - p.x, m.z - p.z);
      m.t += dt;
      // sunrise, or left far behind
      if ((!night && m.nightBorn && !m.event && !def.boss && m.t > 3) || d > 170 || (m.event && m.t > m.event) || (def.boss && !night && m.t > 20)) { removeMonster(m, d < 80); continue; }
      let sp = 0;
      if (Math.abs(m.kx) + Math.abs(m.kz) > 0.2) { // flying back from a bonk
        const e = { x: m.x, z: m.z }; e.x += m.kx * dt; e.z += m.kz * dt; W.collide(e, m.r); m.x = e.x; m.z = e.z;
        m.kx *= Math.exp(-6 * dt); m.kz *= Math.exp(-6 * dt);
        m.obj.position.set(m.x, W.groundAt(m.x, m.z), m.z);
      }
      if (m.stun > 0) { m.stun -= dt; m.obj.rotation.y += dt * 9; }
      else if (m.grab > 0) { // it got what it wanted: backs off for a moment
        m.grab -= dt; sp = def.speed * 0.8;
        walk(m, m.x + (m.x - p.x), m.z + (m.z - p.z), sp, dt, m.r);
      } else if (m.home && Math.hypot(m.x - m.home.x, m.z - m.home.z) > (m.leash || 30)) { // a guardian never strays far from its station
        sp = def.speed; walk(m, m.home.x, m.home.z, sp, dt, m.r); m.hp = Math.min(m.mhp, m.hp + m.mhp * 0.1 * dt);
      } else if (d < (m.aggro || 17) && onFoot() && !quiet() && !F.dying && Math.hypot(p.x - home.x, p.z - home.z) > 14 && (!m.home || Math.hypot(p.x - m.home.x, p.z - m.home.z) < (m.leash || 30) + 4)) {
        sp = def.speed;
        walk(m, p.x, p.z, sp, dt, m.r);
        if (d < m.r + 0.75 && Math.abs(p.y - m.obj.position.y) < 2.2) touch(m);
      } else { // wandering
        sp = def.speed * 0.3;
        if (Math.random() < dt * 0.5) m.wanderA += rnd(-1.5, 1.5);
        if (m.home && Math.hypot(m.x - m.home.x, m.z - m.home.z) > 6) walk(m, m.home.x, m.home.z, sp, dt, m.r);
        else walk(m, m.x + Math.cos(m.wanderA) * 4, m.z + Math.sin(m.wanderA) * 4, sp, dt, m.r);
      }
      W.animateMonster(m.obj, dt, sp);
      m.say -= dt;
      if (m.say <= 0 && d < 25) { m.say = 5 + Math.random() * 7; sayAt(m.obj, m.kind === 'goose' ? 'HONK!' : pick(D.MONSTER_LINES), 1.8); }
    }
  }
  function touch(m) {
    const s = save(), p = P();
    m.grab = m.guard ? 1.1 : 1.6;
    const st = m.def.steal || [0, 0];
    let amt = 0;
    if (st[1] > 0) {
      amt = Math.min(Math.floor(s.money), Math.round(rnd(st[0], st[1]) * Math.max(0, 1 - (G.rpg ? G.rpg.bonus('steal') : 0))));
      if (amt > 0) { s.money -= amt; m.carry += amt; U.feed(m.def.e, m.def.n + ' grabbed ' + fmt$(amt) + '! Bonk it to get it back (F)'); U.hud.bump('money'); }
    }
    W.pop(p.x, p.y + 2.4, p.z, m.kind === 'goose' ? 'HONK!' : amt ? 'YOINK!' : pick(['BAM!', 'OOF!', 'WHAM!', 'THUD!']), '#ff5c8a');
    if (m.kind === 'goose') m.touched = true;
    F.hurt(m.atk || 5, m);
    G.dirty();
  }
  // ------------------------------------------------------------------ health: armour, regeneration, healing, blacking out
  F.maxHp = () => Math.round(60 + G.level() * 8 + G.stat('fit') * 3 + (G.rpg ? G.rpg.bonus('life') : 0));
  function hp() { const f = fun(); if (typeof f.hp !== 'number' || f.hp !== f.hp) f.hp = F.maxHp(); return f.hp; }
  F.hp = hp;
  F.armor = () => Math.round(G.rpg ? G.rpg.bonus('armor') : 0);
  F.hurt = function (n, src) {
    if (F.dying || !alive) return 0;
    const f = fun(), dmg = Math.max(1, n * 100 / (100 + F.armor()));
    f.hp = Math.max(0, hp() - dmg); lastHurt = G.rt.t;
    const p = P();
    W.pop(p.x - 0.6, p.y + 2.0, p.z, '-' + Math.round(dmg), '#ff3b30', 0.7);
    if (U.hurt) U.hurt(); W.shake(0.35); G.sfx.bonk();
    api.bump('hurt', Math.round(dmg));
    if (f.hp <= 0) die(src);
    return dmg;
  };
  F.heal = function (n) { if (!(n > 0)) return; const f = fun(); f.hp = Math.min(F.maxHp(), hp() + n); };
  // Q / the 🍵 button: the best healing thing in your bag
  F.quaff = function () {
    const s = save();
    if (hp() >= F.maxHp() - 0.5) { U.toast('You feel fine already.'); return false; }
    const opts = Object.keys(s.bag).filter(k => s.bag[k] > 0 && D.ITEMS[k] && (D.ITEMS[k].heal || (D.ITEMS[k].type === 'snack' && D.ITEMS[k].energy > 0)));
    if (!opts.length) { U.toast('Nothing to eat or drink. Cafés sell calm tea 🍵 and smoothies 🫐; groceries sell juice boxes 🧃.'); return false; }
    const need = F.maxHp() - hp(), val = k => (D.ITEMS[k].heal || 0) + (D.ITEMS[k].energy || 0) * 0.7;
    const k = opts.sort((a, b) => Math.abs(val(a) - need) - Math.abs(val(b) - need))[0], it = D.ITEMS[k];
    G.giveItem(k, -1);
    if (it.energy) G.addEnergy(it.energy);
    F.heal(it.heal || 0);
    U.feed(it.e, it.n + ' · ❤️ ' + Math.round(hp()) + '/' + F.maxHp());
    G.sfx.pick(); G.dirty();
    return true;
  };
  async function die() {
    if (F.dying) return;
    F.dying = true;
    const s = save(), f = fun(), p = P();
    api.bump('deaths');
    const lost = Math.floor(s.money * 0.1);
    if (lost > 0) { s.money -= lost; const a = G.ll(p.x, p.z); f.wallet = { lat: Math.round(a.lat * 1e6) / 1e6, lon: Math.round(a.lon * 1e6) / 1e6, amount: (f.wallet ? f.wallet.amount : 0) + lost }; }
    W.burst(p.x, p.y + 1, p.z, '💫', 10, { spread: 2, up: 3 });
    for (const m of F.monsters.slice()) { if (m.guard) { m.hp = m.mhp; m.x = m.home.x; m.z = m.home.z; } else if (Math.hypot(m.x - p.x, m.z - p.z) < 120) removeMonster(m, true); }
    for (const c of F.chasers.slice()) endChase(c, false);
    // where you come to: the nearest metro station you freed, or home
    const home = G.homeSpot();
    let to = { x: home.x, z: home.z }, where = 'home';
    for (const st of s.metro || []) { const q = G.xz(st); if (Math.hypot(q.x - p.x, q.z - p.z) < Math.hypot(to.x - p.x, to.z - p.z)) { to = q; where = st.name + ' station'; } }
    api.setBusy(true);
    try { await U.fade(() => {}, '💫 ...everything goes quiet'); await G.travel(to); }
    finally { api.setBusy(false); }
    f.hp = F.maxHp(); F.dying = false; F.lastFoe = null;
    U.banner('💫 You blacked out', 'You come to at ' + where + '. ' + (lost ? 'Your wallet fell out where you went down: ' + fmt$(f.wallet.amount) + ' (👛 on the map).' : 'Take it easy for a bit.'), 'fail');
    G.log('Blacked out and came to at ' + where, '💫');
    G.dirty(true);
  }
  // your dropped wallet waits where you fell
  function walletTick() {
    const f = fun();
    if (!f.wallet || G.rt.pickups.some(k => k.type === 'wallet' && !k.dead)) return;
    const q = G.xz(f.wallet), p = P();
    if (Math.hypot(q.x - p.x, q.z - p.z) < 350) api.spawnPickup('wallet', q.x, q.z);
  }
  F.gotWallet = function () {
    const f = fun();
    if (!f.wallet) return;
    save().money += f.wallet.amount;
    U.feed('👛', 'Got your wallet back: ' + fmt$(f.wallet.amount)); U.hud.bump('money'); G.sfx.cash();
    f.wallet = null; G.dirty();
  };

  // ------------------------------------------------------------------ metro guardians: a big one at every station; beat it, ride from there
  // one station, several entrances: freeing one frees every entrance within 90 m; unnamed entrances take the station's name
  F.metroOpen = pl => !!pl && (pl.virtual || !!fun().cleared[pl.id] || (save().metro || []).some(m => m.id === pl.id || (() => { const q = G.xz(m); return Math.hypot(q.x - pl.pin.x, q.z - pl.pin.z) < 90; })()));
  F.stationName = function (pl) {
    if (pl.name) return pl.name;
    let best = null, bd = 160;
    for (const q of W.places) if (q.kind === 'metro' && q.name) { const d = Math.hypot(q.pin.x - pl.pin.x, q.pin.z - pl.pin.z); if (d < bd) { bd = d; best = q.name; } }
    const st = W.streetAt(pl.pin.x, pl.pin.z);
    return best || (st ? st + ' station' : 'the Station');
  };
  function guardTick() {
    if (!onStory() || calm()) return;
    const p = P();
    for (const pl of W.places) {
      if (pl.kind !== 'metro' || pl.virtual || F.guards.has(pl.id) || F.metroOpen(pl)) continue;
      if (Math.hypot(pl.pin.x - p.x, pl.pin.z - p.z) > 70) continue;
      if ([...F.guards.values()].some(g => Math.hypot(g.home.x - pl.pin.x, g.home.z - pl.pin.z) < 90)) continue;  // this station already has its guardian
      spawnGuardian(pl);
    }
    for (const [id, g] of F.guards) {
      if (!F.monsters.includes(g)) { F.guards.delete(id); continue; }
      if (Math.hypot(g.home.x - p.x, g.home.z - p.z) > 140) { removeMonster(g, false); F.guards.delete(id); }
    }
  }
  function spawnGuardian(pl) {
    const kinds = Object.keys(D.GUARDIANS), seed = (pl.id || '').split('').reduce((a, ch) => a * 31 + ch.charCodeAt(0) | 0, 7);
    const kind = kinds[Math.abs(seed) % kinds.length], base = D.MONSTERS[kind];
    const where = F.stationName(pl);
    const name = D.GUARDIANS[kind] + ' of ' + where;
    const def = Object.assign({}, base, { n: name, e: '🚇', guard: true, night: false, xp: base.xp * 10, steal: [0, 0], coins: base.coins });
    const g = spawnMonster(kind, pl.pin.x, pl.pin.z, { def, hp: base.hp * 8 + 8, atkMul: 1.3, size: 2.4, event: 1e9, aggro: 24, leash: 30, home: { x: pl.pin.x, z: pl.pin.z }, guard: pl.id, station: pl, lvl: monsterLevel(pl.pin.x, pl.pin.z) + 1 });
    if (!g) return;
    const tag = W.label('🚇 ' + name, { size: 34, height: 0.55, bg: 'rgba(255,194,31,.95)', fg: '#1f1a3d', border: '#1f1a3d' });
    tag.position.y = 2.6; g.obj.add(tag);
    F.guards.set(pl.id, g);
    U.banner('🚇 A guardian blocks ' + where, 'Beat the ' + D.GUARDIANS[kind] + ' and this station joins your metro network.', 'fail');
    G.sfx.fail();
  }
  function freeStation(m) {
    const f = fun(), pl = m.station;
    f.cleared[m.guard] = save().day;
    F.guards.delete(m.guard);
    api.bump('guardians');
    if (pl && G.visitMetro) G.visitMetro(pl);
    const st = pl ? F.stationName(pl) : 'The station';
    U.banner('🚇 ' + st + ' is free!', 'The metro is open here: ride between every station you\'ve freed. You also come to here if you black out nearby.', 'done');
    U.confetti(); G.sfx.done();
    G.log('Freed ' + st + ' metro station', '🚇');
    if (G.rpg) G.rpg.drop('boss');
  }
  // the bar at the top of the screen: what you're fighting
  function foeTick(dt) {
    foeT -= dt;
    if (foeT > 0 || !U.foe) return;
    foeT = 0.12;
    const p = P();
    let m = F.lastFoe && F.monsters.includes(F.lastFoe) && !F.lastFoe.dead && Math.hypot(F.lastFoe.x - p.x, F.lastFoe.z - p.z) < 30 ? F.lastFoe : null;
    if (!m) { let bd = 14; for (const q of F.monsters) { const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < bd && !q.dead) { bd = d; m = q; } } }
    U.foe(m ? { name: m.def.n, lvl: m.lvl || 1, pct: Math.max(0, m.hp / (m.mhp || m.hp || 1)), rank: m.guard ? 'guard' : m.def.boss ? 'boss' : m.def.rare ? 'rare' : m.champ ? 'champ' : '' } : null);
  }
  const onStory = () => { const m = save().m['c1-couch']; return !!(m && m.s === 'done'); };

  // ------------------------------------------------------------------ strangers: hi, jokes, flirting
  F.pedMenu = async function (ped) {
    if (quiet()) return;
    api.setBusy(true);
    try {
      const v = await U.choose({ title: '🧍 A stranger', text: 'They slow down and look at you. What now?', opts: [
        { t: '👋 Say hi', v: 'hi' }, { t: '😘 Flirt', v: 'flirt' }, { t: '🤡 Tell a joke', v: 'joke' }, { t: 'Never mind', v: '' }] });
      if (v === 'hi') api.chatPed(ped);
      else if (v === 'flirt') flirt(ped);
      else if (v === 'joke') joke(ped);
    } finally { api.setBusy(false); }
  };
  function joke(ped) {
    if (ped.joked) { sayAt(ped.obj, 'You told me that one already.', 2); return; }
    ped.joked = true;
    const j = pick(D.JOKES), good = Math.random() < clamp(0.45 + G.stat('charm') * 0.02, 0, 0.9);
    api.bump('jokes');
    W.holdPed(ped, 6, null);
    sayAt(W.avatar, j[0], 2.4);
    later(2200, () => sayAt(W.avatar, j[1], 2.2));
    later(4300, () => {
      if (!ped.obj.parent) return;
      sayAt(ped.obj, pick(good ? D.JOKE_REPLIES.good : D.JOKE_REPLIES.bad), 2.4);
      if (good) { W.holdPed(ped, 1.8, 'dance'); G.addStat('charm', 0.08, true); G.addHappy(1); W.burst(ped.obj.position.x, ped.obj.position.y + 2, ped.obj.position.z, '😂', 4, { spread: 1.5, up: 2.5 }); if (Math.random() < 0.25) G.addMoney(Math.ceil(rnd(1, 4)), 'for the laugh'); }
      G.dirty();
    });
  }
  function flirt(ped) {
    const s = save(), f = fun();
    if (ped.flirted) { sayAt(ped.obj, 'One line per person, hotshot.', 2.2); return; }
    if (s.married) { U.toast('💍 Your ring finger tingles. Maybe just say hi.'); return; }
    ped.flirted = true;
    W.holdPed(ped, 6, null);
    sayAt(W.avatar, pick(D.FLIRT.lines), 3);
    const withPartner = s.partner && G.rt.followers.some(x => x.who === s.partner);
    const chance = clamp(0.3 + G.stat('charm') * 0.035 + G.stat('style') * 0.015 + (s.happy - 50) / 400 + (G.rpg ? G.rpg.bonus('flirt') : 0), 0.15, 0.95);
    const yes = !withPartner && f.crushes.length < 12 && Math.random() < chance;
    later(2800, () => {
      if (!ped.obj.parent) return;
      const o = ped.obj.position;
      if (withPartner) { sayAt(ped.obj, G.text(pick(D.FLIRT.taken)), 2.6); G.addRel(s.partner, -6); U.feed('😬', D.CAST[s.partner].n + ' saw that.'); G.sfx.fail(); return; }
      if (!yes) { sayAt(ped.obj, pick(D.FLIRT.no), 2.6); G.addStat('charm', 0.03, true); G.addHappy(-1); G.sfx.fail(); G.dirty(); return; }
      sayAt(ped.obj, pick(D.FLIRT.yes), 2.8);
      W.burst(o.x, o.y + 2, o.z, '💕', 8, { spread: 1.6, up: 3, grav: 2, life: 1.3 });
      api.bump('flirts'); G.addStat('charm', 0.15, true); G.addHappy(3); G.sfx.pick();
      if (s.partner && Math.random() < 0.25) { G.addRel(s.partner, -5); U.feed('🫢', D.CAST[s.partner].n + ' heard about your flirting.'); }
      // they become a sweetheart who waits for you right here
      const used = new Set(f.crushes.map(c => c.name));
      const name = D.CRUSH_NAMES.filter(n => !used.has(n))[Math.floor(Math.random() * (D.CRUSH_NAMES.length - used.size))] || 'Sweetie';
      const spot = W.nearestWalk(o.x, o.z, 30) || { x: o.x, z: o.z }, a = G.ll(o.x + (o.x - spot.x) * 0.2, o.z + (o.z - spot.z) * 0.2);
      const lk = ped.look, c = { id: 'c' + Date.now().toString(36), name, lat: Math.round(a.lat * 1e6) / 1e6, lon: Math.round(a.lon * 1e6) / 1e6, love: 40, met: s.day, seen: s.day, talk: 0,
        look: { skin: lk.skin, hair: lk.hair, shirt: lk.shirt, pants: lk.pants, shoe: lk.shoe, long: !!lk.long, dress: !!lk.dress, hat: lk.hat || null, glasses: !!lk.glasses, h: Math.max(0.9, lk.h || 1) } };
      f.crushes.push(c);
      countSweet();
      later(2600, () => { const i = W.life.peds.indexOf(ped); if (i >= 0) { W.life.peds.splice(i, 1); W.removeObj(ped.obj); if (ped.dog) W.removeObj(ped.dog); } });
      U.banner('💘 ' + name + ' likes you!', 'A new sweetheart. They hang out on ' + (W.streetAt(o.x, o.z) || 'this street') + '. Visit, chat, bring gifts.', 'friend');
      G.log(name + ' became a sweetheart', '💘');
      const t = D.CRUSH_TITLES.find(x => x[0] === f.crushes.length);
      if (t) later(3800, () => U.banner('💞 ' + t[1], f.crushes.length + ' sweetheart' + (f.crushes.length > 1 ? 's' : '') + ' around town.', 'level'));
      if (f.crushes.length >= 3) feat('heartthrob');
      G.dirty(true);
    });
  }
  function countSweet() { api.bumpTo('sweet', fun().crushes.length); }

  // ------------------------------------------------------------------ sweethearts around town
  function updateSweet(dt) {
    const f = fun(), p = P();
    if (slow <= 0) {
      for (const c of f.crushes) {
        const q = G.xz(c), d = Math.hypot(q.x - p.x, q.z - p.z), a = F.sweet.get(c.id);
        if (!a && d < 170) {
          const obj = W.person(Object.assign(W.randomLook(c.id.length * 77 + c.name.charCodeAt(0)), c.look));
          const tag = nameTag('💕 ' + c.name, 2.4 / (obj.scale.y || 1)); obj.add(tag);
          place(obj, q.x, q.z, Math.random() * 6.28);
          W.scene.add(obj);
          F.sweet.set(c.id, { c, obj, x: q.x, z: q.z, hx: q.x, hz: q.z, tag, date: 0, wave: 0 });
        } else if (a && d > 230 && !a.date) { W.removeObj(a.obj); F.sweet.delete(c.id); }
      }
      for (const [id, a] of F.sweet) if (!f.crushes.includes(a.c)) { W.removeObj(a.obj); F.sweet.delete(id); }
    }
    let near = 0, dating = null;
    for (const a of F.sweet.values()) {
      const d = Math.hypot(a.x - p.x, a.z - p.z);
      if (d < 16) near++;
      if (a.date > 0) dating = a;
      a.tag.visible = d < 45;
      if (a.mad > 0) continue; // being handled as a chaser
      if (a.date > 0) { // out for a walk with you
        a.date -= dt;
        const f2 = facing(), sp = d > 2.4 ? Math.min(12, d * 2.5) : 0;
        if (sp) walk(a, p.x - f2.x * 1.6 + f2.z * 1.1, p.z - f2.z * 1.6 - f2.x * 1.1, sp, dt);
        W.animate(a.obj, sp, dt);
        const spot = dateSpot(p);
        if (spot && a.date < 140 && !quiet()) finishDate(a, spot);
        else if (a.date <= 0) { sayAt(a.obj, 'I should head back. Next time, somewhere nice?', 2.6); }
        continue;
      }
      if (Math.hypot(a.x - a.hx, a.z - a.hz) > 1.5) { const sp = 3.2; walk(a, a.hx, a.hz, sp, dt); W.animate(a.obj, sp, dt); continue; }
      if (d < 12) a.obj.rotation.y = Math.atan2(p.x - a.x, p.z - a.z) + Math.PI;
      W.animate(a.obj, 0, dt, d < 9 ? 'wave' : null);
      if (d < 9 && G.rt.t - a.wave > 25) { a.wave = G.rt.t; sayAt(a.obj, pick(save().day - a.c.seen > 2 ? D.FLIRT.miss : D.FLIRT.sweet), 2.6); W.burst(a.x, a.obj.position.y + 2.2, a.z, '💕', 3, { spread: 1, up: 2, grav: 1.5, life: 1.2 }); }
    }
    // two sweethearts in one place while you're on a date: drama
    if (dating && near >= 2 && !F.chasers.length && !quiet() && G.rt.t - (F.dramaT || -99) > 60) drama(dating);
  }
  const DATE_KINDS = ['cafe', 'restaurant', 'icecream', 'park', 'cinema', 'lounge', 'bakery', 'museum'];
  function dateSpot(p) { for (const q of G.allPlaces()) if (DATE_KINDS.includes(q.kind) && Math.hypot(q.pin.x - p.x, q.pin.z - p.z) < 9) return q; return null; }
  function finishDate(a, spot) {
    const s = save(), c = a.c, cost = spot.kind === 'park' ? 0 : Math.min(Math.floor(s.money), 8 + G.level() * 2);
    a.date = 0;
    if (cost) { s.money -= cost; U.hud.bump('money'); }
    c.love = clamp(c.love + 18, 0, 100); c.seen = s.day;
    G.addHappy(6); G.addStat('charm', 0.2, true); api.bump('dates'); G.addXp(30);
    sayAt(a.obj, pick(D.FLIRT.date), 3);
    W.burst(a.x, a.obj.position.y + 2.2, a.z, '💕', 10, { spread: 2, up: 3, grav: 1.5, life: 1.4 });
    U.banner('💕 A lovely date with ' + c.name, (D.KINDS[spot.kind].e + ' ' + spot.name) + (cost ? ' · ' + fmt$(-cost) : ' · free'), 'friend');
    G.sfx.done(); G.dirty();
  }
  function drama(dating) {
    F.dramaT = G.rt.t;
    const p = P(), others = [...F.sweet.values()].filter(a => a !== dating && Math.hypot(a.x - p.x, a.z - p.z) < 16).slice(0, 2);
    U.banner('💥 DRAMA!', 'Two sweethearts, one sidewalk. Run. They are slower than you. Mostly.', 'fail');
    G.sfx.fail();
    dating.date = 0;
    for (const a of [dating].concat(others)) {
      a.c.love = clamp(a.c.love - 25, 0, 100);
      a.mad = 1;
      chase({ kind: 'sweet', a, obj: a.obj, x: a.x, z: a.z, name: a.c.name, lines: D.FLIRT.drama, secs: 18, catchCost: 0, keepObj: true,
        onEnd: (won) => { a.mad = 0; a.x = a.obj.position.x; a.z = a.obj.position.z; if (!won) { G.addHappy(-4); W.pop(P().x, P().y + 2.4, P().z, 'WHAP!', '#ff5c8a'); } } });
    }
    api.bump('dramas');
  }
  async function sweetMenu(a) {
    if (quiet()) return;
    const s = save(), c = a.c, f = fun();
    api.setBusy(true);
    try {
      const gifts = Object.keys(s.bag).filter(k => D.ITEMS[k] && D.ITEMS[k].type === 'gift');
      const opts = [{ t: '💬 Sweet talk', v: 'talk' }];
      if (gifts.length) opts.push({ t: '🎁 Give a gift', v: 'gift' });
      opts.push({ t: '🚶 Go for a walk together', v: 'date' }, { t: '💔 It\'s not you, it\'s me', v: 'bye' }, { t: 'See you around', v: '' });
      const v = await U.choose({ title: '💕 ' + c.name + '  ·  ' + '❤️'.repeat(Math.max(1, Math.round(c.love / 20))), text: c.name + ': ' + pick(s.day - c.seen > 2 ? D.FLIRT.miss : D.FLIRT.sweet), opts });
      if (v === 'talk') {
        if (c.talk === s.day) U.toast(c.name + ' giggles. (Sweet talk works once a day.)');
        else { c.talk = s.day; c.seen = s.day; c.love = clamp(c.love + 8 + G.stat('charm') * 0.3, 0, 100); G.addHappy(2); W.burst(a.x, a.obj.position.y + 2.2, a.z, '💕', 5, { spread: 1.2, up: 2.5, grav: 1.5, life: 1.2 }); U.feed('💕', c.name + ' is smitten'); }
      } else if (v === 'gift') {
        const g = await U.choose({ title: '🎁 A gift for ' + c.name, text: 'What do you give?', opts: gifts.map(k => ({ t: D.ITEMS[k].e + ' ' + D.ITEMS[k].n + ' ×' + s.bag[k], v: k })).concat([{ t: 'Never mind', v: '' }]) });
        if (g) { G.giveItem(g, -1); c.love = clamp(c.love + D.ITEMS[g].rel * 1.5, 0, 100); c.seen = s.day; G.addHappy(2); sayAt(a.obj, 'For me?! You remembered!', 2.6); W.burst(a.x, a.obj.position.y + 2.2, a.z, '💕', 7, { spread: 1.5, up: 3, grav: 1.5, life: 1.3 }); }
      } else if (v === 'date') {
        if ([...F.sweet.values()].some(x => x.date > 0)) U.toast('One date at a time! You are not THAT smooth.');
        else { a.date = 150; c.seen = s.day; U.banner('🚶 A walk with ' + c.name, 'Take them to a café, a park, ice cream, the cinema... and avoid your other sweethearts.', 'friend'); }
      } else if (v === 'bye') {
        f.crushes.splice(f.crushes.indexOf(c), 1); countSweet();
        sayAt(a.obj, 'Fine. I\'m keeping the hoodie.', 2.8);
        later(2500, () => { if (F.sweet.get(c.id) === a) { W.burst(a.x, a.obj.position.y + 1.5, a.z, '💔', 4, { spread: 1, up: 2 }); W.removeObj(a.obj); F.sweet.delete(c.id); } });
        G.log('Broke up with ' + c.name, '💔');
      }
      G.dirty();
    } finally { api.setBusy(false); }
  }

  // ------------------------------------------------------------------ street folk
  function folkLook(d) { return Object.assign(W.randomLook(d.id.length * 913 + d.id.charCodeAt(0) * 7), { hat: null, bag: null, dress: false, shorts: false, glasses: false, beard: false, stripes: null, logo: null, phones: null, scarf: null, sleeve: 'long', shirt: 0x6b7280, pants: 0x3a3f4a }, d.look); }
  function spawnFolk(d) {
    const f = fun(), s = save(), p = P();
    let at = f.folkAt[d.id], q = at && at.day === s.day ? G.xz(at) : null, yaw = at ? at.yaw : 0;
    if (!q || Math.hypot(q.x - p.x, q.z - p.z) > 260 || W.heightAt(q.x, q.z)) {
      const home = G.homeSpot(), k = kerbSpot(p.x, p.z, 45, 190);
      if (!k || Math.hypot(k.x - home.x, k.z - home.z) < 20 || F.folk.some(o => Math.hypot(o.x - k.x, o.z - k.z) < 60)) return;
      q = k; yaw = k.yaw;
      const a = G.ll(k.x, k.z);
      f.folkAt[d.id] = { lat: Math.round(a.lat * 1e6) / 1e6, lon: Math.round(a.lon * 1e6) / 1e6, yaw: Math.round(yaw * 100) / 100, day: s.day };
    }
    const obj = new THREE.Group(), fig = W.person(folkLook(d));
    obj.add(fig);
    const mat = W.propMesh('blanket'); mat.position.set(0, 0.02, 0.1); obj.add(mat);
    const cup = W.propMesh('cup'); cup.position.set(0.55, 0.05, -0.6); obj.add(cup);
    const sign = W.propMesh('sign'); sign.position.set(-0.7, 0, -0.2); sign.rotation.y = 0.3; obj.add(sign);
    if (d.id === 'duchess') { const cart = W.propMesh('cart'); cart.position.set(1.3, 0, 0.2); cart.rotation.y = 0.5; obj.add(cart); }
    if (d.id === 'dolores') { const cat = W.animal('cat', 0x2b2b2b); cat.position.set(0.6, 0.06, 0.3); cat.rotation.y = 2; obj.add(cat); }
    if (d.id === 'gus') for (let i = 0; i < 3; i++) { const b = W.animal('pigeon'); b.position.set(-0.8 + i * 0.5, 0.06, -0.9 - (i % 2) * 0.3); b.rotation.y = i * 2; obj.add(b); }
    const tag = nameTag(d.e + ' ' + d.n, 1.95); obj.add(tag);
    const mark = W.emojiSprite('🧡', 0.7); mark.position.y = 2.55; obj.add(mark);
    place(obj, q.x, q.z, yaw);
    W.scene.add(obj);
    F.folk.push({ d, obj, fig, x: q.x, z: q.z, hx: q.x, hz: q.z, yaw, tag, mark, up: 0, asked: -999, bow: 0 });
  }
  function folkRec(id) { const f = fun(), s = save(); let r = f.folk[id]; if (!r || r.day !== s.day) r = f.folk[id] = { day: s.day, got: 0, story: 0, asked: 0, total: (r && r.total) || 0 }; return r; }
  function updateFolk(dt) {
    const p = P(), f = fun(), king = !!f.king;
    if (slow <= 0 && onStory()) {
      for (let i = F.folk.length - 1; i >= 0; i--) { const a = F.folk[i]; if (Math.hypot(a.x - p.x, a.z - p.z) > 300 && !a.up) { W.removeObj(a.obj); F.folk.splice(i, 1); } }
      if (F.folk.length < (LOW ? 2 : 3)) {
        const out = new Set(F.folk.map(a => a.d.id)), pool = D.STREETFOLK.filter(d => !out.has(d.id));
        if (pool.length) spawnFolk(pick(pool));
      }
    }
    for (const a of F.folk) {
      const d = Math.hypot(a.x - p.x, a.z - p.z), rec = folkRec(a.d.id);
      const sitting = !a.up && !(a.bow > 0);
      a.tag.visible = d < 40; a.tag.position.y = sitting ? 1.5 : 2.3;
      a.mark.visible = rec.got < 4 && d < 60;
      a.mark.position.y = (sitting ? 2.0 : 2.85) + Math.sin(G.rt.t * 3 + a.x) * 0.08;
      if (a.up === 1) { // walking over to ask
        const left = walk(a, p.x, p.z, 2.6, dt);
        W.animate(a.fig, 2.6, dt);
        if (left < 2.3 && !quiet()) { a.up = 2; folkMenu(a, true); }
        else if (left > 24 || G.rt.t - a.asked > 9) { a.up = 2; api.bump('dodged'); sayAt(a.obj, pick(D.FOLK_SNUB), 2); }
        continue;
      }
      if (a.up === 2) { // heading back to the blanket
        const left = walk(a, a.hx, a.hz, 2.6, dt);
        W.animate(a.fig, 2.6, dt);
        if (left < 0.3) { a.up = 0; a.x = a.hx; a.z = a.hz; a.obj.rotation.y = a.yaw; a.fig.userData.body.position.y = 0; }
        continue;
      }
      if (a.bow > 0) { a.bow -= dt; W.animate(a.fig, 0, dt, 'wave'); continue; }
      W.animate(a.fig, 0, dt, 'ground');
      if (quiet() || !onFoot()) continue;
      if (king && d < 9 && G.rt.t - a.asked > 40) { a.asked = G.rt.t; a.bow = 2.2; a.fig.userData.body.position.y = 0; a.fig.userData.legL.rotation.x = a.fig.userData.legR.rotation.x = 0; sayAt(a.obj, pick(D.FOLK_KING), 2.4); }
      // some get up and come over to ask (walk away and they shrug it off)
      else if (!king && !calm() && d < 13 && d > 4 && rec.asked < 1 && rec.got === 0 && G.rt.t - a.asked > 30 && !F.chasers.length && Math.random() < dt * 0.5) {
        rec.asked = 1; a.asked = G.rt.t; a.up = 1;
        a.fig.userData.body.position.y = 0; a.fig.userData.legL.rotation.x = a.fig.userData.legR.rotation.x = 0;
        sayAt(a.obj, 'Hey, friend! Got a second?', 2.4);
      }
    }
  }
  async function folkMenu(a, came) {
    if (quiet()) return;
    const s = save(), d = a.d, f = fun(), rec = folkRec(d.id);
    api.setBusy(true);
    try {
      const snack = Object.keys(s.bag).find(k => D.ITEMS[k] && D.ITEMS[k].type === 'snack' && D.ITEMS[k].energy);
      const opts = [];
      if (s.money >= 2) opts.push({ t: '🪙 Give $2', v: 'c2' });
      if (s.money >= 10) opts.push({ t: '💵 Give $10', v: 'c10' });
      if (snack) opts.push({ t: '🥪 Share your ' + D.ITEMS[snack].n.toLowerCase(), v: 'food' });
      opts.push({ t: '👂 Sit down and listen', v: 'story' });
      if (f.king) opts.push({ t: '👑 Hold court', v: 'court' });
      opts.push({ t: '🙈 Sorry, not today', v: 'no' }, { t: '😤 "Get a job!"', v: 'rude' });
      const hi = f.king ? pick(D.FOLK_KING) : rec.got > 0 ? pick(D.FOLK_THANKS) : d.hi;
      const v = await U.choose({ title: d.e + ' ' + d.n + '  ·  🧡 ' + f.hearts, text: d.n + ': ' + hi, opts });
      const give = (hearts, line) => {
        const room = Math.max(0, 4 - rec.got), add = Math.min(room, hearts);
        rec.got += add; rec.total += add; f.hearts += add;
        api.bump('helped');
        sayAt(a.obj, line || pick(D.FOLK_THANKS), 2.8);
        W.burst(a.x, a.obj.position.y + 1.8, a.z, '🧡', 3 + add * 2, { spread: 1.4, up: 2.6, grav: 1.5, life: 1.3 });
        G.sfx.pick(); G.addHappy(1 + add);
        if (add) U.feed('🧡', '+' + add + ' street heart' + (add > 1 ? 's' : '') + ' (' + f.hearts + ')');
        else U.feed('🧡', d.n + ' is set for today. Other corners need you too.');
        // kindness comes around
        const r = Math.random();
        if (add && r < 0.12) { const sp = W.randomWalkSpot(a.x, a.z, 20, 70); if (sp) { api.spawnPickup('gem', sp.x, sp.z); later(900, () => sayAt(a.obj, 'Psst. Something shiny, just over there.', 3)); } }
        else if (add && r < 0.2) later(900, () => { sayAt(a.obj, 'Here. Found this. It\'s yours.', 2.6); G.addSticker(); });
        const t = D.FOLK_TITLES.find(x => x[0] > f.hearts - add && x[0] <= f.hearts && x[0] > 0 && x[0] < D.CROWN_AT);
        if (t) U.banner('🧡 ' + t[1], f.hearts + ' street hearts. The corners are talking about you.', 'level');
      };
      if (v === 'c2') { s.money -= 2; U.hud.bump('money'); give(1); }
      else if (v === 'c10') { s.money -= 10; U.hud.bump('money'); give(3, 'TEN?! You\'re a saint. A SAINT!'); }
      else if (v === 'food') { G.giveItem(snack, -1); give(2, 'Is that a ' + D.ITEMS[snack].n.toLowerCase() + '? My favourite!'); }
      else if (v === 'story') {
        await U.dialog({ name: d.n, e: d.e, lines: [d.story[rec.total % d.story.length], d.story[(rec.total + 1) % d.story.length]] });
        if (!rec.story) { rec.story = 1; G.addStat('charm', 0.1, true); give(1, 'Thanks for listening. Most people don\'t.'); } else sayAt(a.obj, 'You\'re good company.', 2.4);
      } else if (v === 'court') {
        if (rec.court) U.toast('Court is adjourned until tomorrow.');
        else { rec.court = 1; G.addHappy(6); G.addStat('cred', 0.1, true); await U.dialog({ name: d.n, e: d.e, lines: ['The news from this corner, Your Majesty: the pigeons are organised, the slimes are restless, and somebody is leaving banana peels everywhere.'] }); }
      } else if (v === 'no') { sayAt(a.obj, pick(D.FOLK_SNUB), 2.4); }
      else if (v === 'rude') { f.hearts = Math.max(0, f.hearts - 3); G.addStat('cred', -0.1, true); G.addHappy(-2); sayAt(a.obj, pick(D.FOLK_RUDE), 2.8); U.feed('💔', '-3 street hearts. That was unkind.'); G.sfx.fail(); }
      if (came && v == null) sayAt(a.obj, pick(D.FOLK_SNUB), 2.2);
      G.dirty();
    } finally { api.setBusy(false); }
    if (!f.king && f.hearts >= D.CROWN_AT) crown(a);
  }
  async function crown(a) {
    const f = fun();
    if (f.king || quiet()) return;
    api.setBusy(true);
    try {
      await U.dialog({ name: a.d.n, e: a.d.e, lines: ['Hold on. HOLD ON. Everybody, come here! It\'s them!',
        'We took a vote. All the corners. It was unanimous, except for Kevin, who is a pigeon.',
        'By the power vested in this pizza box... we crown you. The street is yours. Look after it.'] });
      const v = await U.choose({ title: '👑 You are being crowned', text: 'What shall the street folk call you?', opts: [{ t: '👑 King of the Streets', v: 'King' }, { t: '👑 Queen of the Streets', v: 'Queen' }, { t: '👑 Monarch of the Streets', v: 'Monarch' }] });
      f.king = v || 'Monarch';
      api.bumpTo('crowned', 1);
      G.addStat('cred', 2, true); G.addHappy(15);
      W.setLook(G.playerLook());
      U.confetti(); G.sfx.level();
      U.banner('👑 ' + f.king + ' of the Streets!', 'A cardboard crown, a daily tribute, and a royal guard against angry shopkeepers.', 'level');
      G.log('Crowned ' + f.king + ' of the Streets', '👑');
      feat('cardcrown');
      for (const o of F.folk) { o.bow = 4; o.fig.userData.body.position.y = 0; sayAt(o.obj, pick(D.FOLK_KING), 3.5); }
      G.dirty(true);
    } finally { api.setBusy(false); }
  }

  // ------------------------------------------------------------------ angry shopkeepers (and furious sweethearts): chasers
  // They run straight at you, a little slower than your walking pace, shout, and give up. You are always faster.
  function chase(o) {
    const c = Object.assign({ t: 0, stun: 0, wait: 0, shout: 0.4, secs: 22, x: 0, z: 0 }, o);
    place(c.obj, c.x, c.z);
    if (!c.obj.parent) W.scene.add(c.obj);
    F.chasers.push(c);
    return c;
  }
  function keeperObj(pl) {
    const seed = (pl.name || 'x').length * 131 + (pl.name || 'x').charCodeAt(0) * 7;
    const g = W.person(Object.assign(W.randomLook(seed), { apron: 0xf4f1ea, hat: pl.kind === 'bakery' || pl.kind === 'restaurant' ? 0xffffff : null, bag: null, dress: false, shorts: false, mood: 'angry', sleeve: 'short' }));
    const pin = W.propMesh('pin'); pin.position.set(0, -0.03, 0); pin.rotation.x = 0.4; g.userData.handR.add(pin);
    const tag = W.label('💢', { bg: '#ff5c8a', fg: '#fff', size: 56, height: 0.8, border: '#1f1a3d', depthTest: false }); tag.position.y = 2.9; g.add(tag);
    return g;
  }
  function endChase(c, won) {
    const i = F.chasers.indexOf(c);
    if (i >= 0) F.chasers.splice(i, 1);
    if (c.onEnd) c.onEnd(won);
    if (!c.keepObj) { const obj = c.obj; sayAt(obj, pick(D.KEEPER_GIVEUP), 2.2); c.fade = 1; later(2300, () => W.removeObj(obj)); }
    if (!F.chasers.length && !G.rt.race && !G.rt.chase) U.timer(null);
  }
  function updateChasers(dt) {
    if (!F.chasers.length) return;
    const p = P(), s = save();
    const top = W.ride().walk * (W.speedMul || 1);
    let worst = 0, name = '';
    for (let i = F.chasers.length - 1; i >= 0; i--) {
      const c = F.chasers[i];
      c.t += dt;
      const d = Math.hypot(c.x - p.x, c.z - p.z), left = c.secs - c.t;
      if (left > worst) { worst = left; name = c.name; }
      if (c.stun > 0) { c.stun -= dt; c.obj.rotation.y += dt * 10; W.animate(c.obj, 0, dt, 'air'); continue; }
      if (c.wait > 0) { // bursting out of the door, shaking a fist: your head start
        c.wait -= dt; c.obj.rotation.y = Math.atan2(p.x - c.x, p.z - c.z) + Math.PI; W.animate(c.obj, 0, dt, 'wave');
        if (c.shout > 0.2) { c.shout = 0; sayAt(c.obj, G.text(pick(c.lines)), 2); c.shout = 2.4; }
        continue;
      }
      const sp = Math.max(3.2, Math.min(onFoot() ? top * 0.86 : 9, 11.5));
      walk(c, p.x, p.z, sp, dt);
      W.animate(c.obj, sp, dt);
      if (c.kind !== 'sweet') { c.obj.userData.armR.rotation.x = 2.7 + Math.sin(c.t * 9) * 0.35; c.obj.userData.elbowR.rotation.x = 0.5; }  // the rolling pin, held high
      c.shout -= dt;
      if (c.shout <= 0) { c.shout = 2.6 + Math.random() * 1.6; sayAt(c.obj, G.text(pick(c.lines)), 2); }
      // the royal guard: street folk trip up anyone chasing their monarch
      if (fun().king && c.kind !== 'sweet') { const g = F.folk.find(a => Math.hypot(a.x - c.x, a.z - c.z) < 7); if (g) { sayAt(g.obj, 'Not on my corner, pal!', 2.4); W.pop(c.x, c.obj.position.y + 2.6, c.z, 'TRIP!', '#ffc21f'); c.won = true; endChase(c, true); continue; } }
      if (d < 1.25 && Math.abs(p.y - c.obj.position.y) < 2) { // caught (you were standing still, weren't you)
        const cost = c.catchCost ? Math.min(Math.floor(s.money), c.catchCost) : 0;
        if (cost) { s.money -= cost; U.hud.bump('money'); }
        W.pop(p.x, p.y + 2.5, p.z, 'BONK!', '#ff5c8a'); W.shake(0.5); G.sfx.fail();
        if (c.kind !== 'sweet') { U.banner('💢 Caught by ' + c.name + '!', cost ? 'You paid ' + fmt$(cost) + ' for the damages. You\'re even.' : 'A firm bonk on the head. You\'re even.', 'fail'); api.bump('caught'); }
        endChase(c, false); continue;
      }
      if (left <= 0 || d > 60) { endChase(c, true); continue; }
    }
    if (F.chasers.length && !G.rt.race && !G.rt.chase) U.timer('💢 ' + name, Math.max(0, worst));
  }
  const grudgeOn = pl => { const g = fun().grudges[pl.id]; return !!g && g > save().day; };
  // A shop that banned you: E offers to make peace (or to make it worse)
  F.shopGate = function (pl) {
    if (!pl.virtual || !grudgeOn(pl)) return null;
    return { t: '💢 ' + pl.name + ' (you\'re banned)', fn: () => banned(pl) };
  };
  async function banned(pl) {
    if (quiet()) return;
    const s = save(), cost = 10 + G.level() * 5;
    api.setBusy(true);
    try {
      const v = await U.choose({ title: '💢 ' + pl.name, text: 'A hand-drawn picture of you is taped to the door. It is not flattering. "DO NOT SERVE."', opts: [
        { t: '🙏 Say sorry with a gift (' + fmt$(cost) + ')', v: 'sorry' }, { t: '🤡 Prank them again', v: 'prank' }, { t: 'Walk away', v: '' }] });
      if (v === 'sorry') {
        if (s.money < cost) U.toast('You need ' + fmt$(cost) + ' for a decent apology.');
        else { s.money -= cost; U.hud.bump('money'); delete fun().grudges[pl.id]; G.sfx.cash(); U.banner('🤝 All is forgiven', pl.name + ' takes your picture off the door. Mostly.', 'done'); G.addHappy(2); G.dirty(); }
      } else if (v === 'prank') { api.setBusy(false); return F.prank(pl); }
    } finally { api.setBusy(false); }
  }
  F.canPrank = pl => !!pl && !!pl.virtual && !!D.KINDS[pl.kind] && pl.kind !== 'metro' && pl.kind !== 'park';
  F.prank = async function (pl) {
    if (quiet() || !F.canPrank(pl)) return;
    if (F.chasers.length || G.rt.race || G.rt.chase) { U.toast('One chase at a time!'); return; }
    if (!onFoot()) { U.toast('Pranks are done on foot. Tradition.'); return; }
    api.setBusy(true);
    let v = null;
    try { v = await U.choose({ title: '🤡 Prank ' + pl.name, text: 'A made-up shop, a real bad idea. The owner WILL come after you. Pick your mischief:', opts: D.PRANKS.map(x => ({ t: x.t, v: x.id })).concat([{ t: 'On second thought...', v: '' }]) }); }
    finally { api.setBusy(false); }
    const pr = D.PRANKS.find(x => x.id === v);
    if (!pr) return;
    api.bump('pranks');
    for (const k of Object.keys(pr.gain)) { if (k === 'energy') G.addEnergy(pr.gain[k]); else if (k === 'happy') G.addHappy(pr.gain[k]); else G.addStat(k, pr.gain[k], true); }
    U.banner('🤡 ' + pr.t.replace(/^\S+\s/, ''), 'RUN! ' + pl.name + ' is not amused.', 'fail');
    G.sfx.alarm();
    // the owner bursts out of the door: a few steps towards the building from where you stand, never right on top of you
    const p = P();
    let dx = pl.x - p.x, dz = pl.z - p.z;
    const dd = Math.hypot(dx, dz) || 1;
    dx /= dd; dz /= dd;
    let kx = pl.pin.x + (pl.x - pl.pin.x) * 0.3, kz = pl.pin.z + (pl.z - pl.pin.z) * 0.3;
    if (Math.hypot(kx - p.x, kz - p.z) < 8) { const q = streetSpot(p.x, p.z, 9, 13); if (q && Math.hypot(q.x - p.x, q.z - p.z) >= 7) { kx = q.x; kz = q.z; } else { kx = p.x + dx * 9; kz = p.z + dz * 9; } }  // never right on top of you
    startKeeper(pl, { x: kx, z: kz, secs: 22, xp: pr.xp, ban: true, wait: 2 });
    feat('prankster');
  };
  function startKeeper(pl, o) {
    const lines = (D.KEEPER_LINES[pl.kind] || []).concat(D.KEEPER_LINES.any);
    chase({ kind: 'keeper', obj: keeperObj(pl), x: o.x, z: o.z, name: pl.name, lines: o.lines || lines, secs: o.secs, wait: o.wait || 0.8, catchCost: 5 + G.level() * 2,
      onEnd: won => {
        const f = fun();
        if (won) {
          api.bump('escapes'); G.addXp(o.xp || 15); G.addStat('cred', 0.1, true); G.sfx.done();
          U.feed('🏃', 'Lost them! ' + (o.ban ? pl.name + ' has banned you for 2 days.' : 'Too slow, shopkeeper.'));
          if (o.ban) f.grudges[pl.id] = save().day + (G.rpg && G.rpg.bonus('forgive') >= 1 ? 1 : 2);
        } else delete f.grudges[pl.id];
        G.dirty();
      } });
  }
  // Made-up shops of the same trade as a business you own: their owners run out at you when you walk past.
  function updateRivals(dt) {
    rivalCool -= dt; shopT -= dt;
    if (shopT > 0 || rivalCool > 0 || calm() || F.chasers.length || quiet() || !onFoot() || G.rt.race || G.rt.chase || F.event) return;
    shopT = 1.2;
    const s = save(), kinds = new Set(Object.keys(s.biz).map(id => D.RIVALS[id]).filter(Boolean)), f = fun(), p = P();
    const angry = Object.keys(f.grudges).length;
    if (!kinds.size && !angry) return;
    for (const pl of W.places) {
      if (!pl.made) continue;
      const d = Math.hypot(pl.pin.x - p.x, pl.pin.z - p.z);
      if (d > 15 || d < 4) continue;
      const rival = kinds.has(pl.kind), grudge = grudgeOn(pl);
      if (!rival && !grudge) continue;
      if (pl.rivalT && G.rt.t - pl.rivalT < 160) continue;
      pl.rivalT = G.rt.t; rivalCool = 50;
      const biz = Object.keys(s.biz).find(id => D.RIVALS[id] === pl.kind);
      const line = grudge ? 'YOU AGAIN!' : pick(D.RIVAL_LINES).replace('{biz}', biz ? G.BIZ[biz].n.toLowerCase() : 'shop');
      U.banner('💢 ' + pl.name + ' spotted you!', grudge ? 'They remember the prank. Leg it!' : 'You\'re the competition. Leg it!', 'fail');
      startKeeper(pl, { x: pl.pin.x, z: pl.pin.z, secs: 14, xp: 10, lines: [line].concat(D.KEEPER_LINES.any) });
      return;
    }
  }

  // ------------------------------------------------------------------ banana peels, trampolines, air coins
  function updateProps(dt) {
    const p = P();
    propT -= dt;
    if (propT <= 0 && onStory()) {
      propT = 2;
      for (const list of [F.peels, F.pads]) for (let i = list.length - 1; i >= 0; i--) if (dist2(list[i], p) > 320) { removeProp(list[i]); list.splice(i, 1); }
      if (F.peels.length < 6) { const sp = W.randomWalkSpot(p.x, p.z, 25, 190, (x, z) => F.peels.every(k => Math.hypot(k.x - x, k.z - z) > 40)); if (sp) { const obj = W.propMesh('peel'); obj.scale.setScalar(1.5); place(obj, sp.x, sp.z, Math.random() * 6); W.scene.add(obj); F.peels.push({ x: sp.x, z: sp.z, obj }); } }
      if (F.pads.length < 3) {
        const k = kerbSpot(p.x, p.z, 40, 200);
        if (k && F.pads.every(q => Math.hypot(q.x - k.x, q.z - k.z) > 70)) {
          const obj = W.propMesh('pad'); place(obj, k.x, k.z, 0); W.scene.add(obj);
          const pad = { x: k.x, z: k.z, obj, coins: [], rest: 0 };
          airCoins(pad);
          F.pads.push(pad);
        }
      }
    }
    if (!onFoot()) return;
    const pl = W.player, sp = Math.hypot(pl.vel.x, pl.vel.z);
    for (let i = F.peels.length - 1; i >= 0; i--) {
      const k = F.peels[i];
      if (Math.hypot(k.x - p.x, k.z - p.z) < 1.0 && pl.grounded && sp > 4.5) {
        F.boost = 2.4; F.boostMul = 1.7;
        api.bump('slides');
        W.pop(p.x, p.y + 2.5, p.z, 'WHEEE!', '#ffc21f'); W.burst(p.x, p.y + 0.3, p.z, '🍌', 5, { spread: 3, up: 3 });
        G.sfx.slide(); G.addHappy(1);
        removeProp(k); F.peels.splice(i, 1);
      }
    }
    for (const q of F.pads) {
      q.rest -= dt;
      q.obj.scale.y = 1 + Math.max(0, q.rest - 19.4) * 1.2;
      if (q.rest <= 0 && !q.coins.length) airCoins(q);
      if (Math.hypot(q.x - p.x, q.z - p.z) < 1.5 && pl.grounded && q.rest < 19.2) {
        pl.vy = 17.5; pl.grounded = false; pl.jumps = 1; q.rest = 20;
        api.bump('bounces');
        W.pop(p.x, p.y + 2.5, p.z, 'BOING!', '#ff5c8a'); G.sfx.boing();
      }
      for (let i = q.coins.length - 1; i >= 0; i--) {
        const c = q.coins[i];
        c.rotation.y = 0; c.material.rotation = Math.sin(G.rt.t * 3 + i) * 0.3;
        if (Math.hypot(c.position.x - p.x, c.position.z - p.z) < 1.5 && Math.abs(c.position.y - (p.y + 1)) < 1.6) {
          const amt = Math.round(4 * (1 + G.level() * 0.08));
          save().money += amt; U.feed('🪙', '+' + fmt$(amt) + ' (air coin)'); U.hud.bump('money'); G.sfx.coin();
          W.burst(c.position.x, c.position.y, c.position.z, '✨', 4, { spread: 1.5, up: 1, size: 0.4, life: 0.5 });
          W.scene.remove(c); c.material.dispose(); q.coins.splice(i, 1);
        }
      }
    }
  }
  function airCoins(pad) { const gy = W.groundAt(pad.x, pad.z); for (const h of [3.2, 4.8, 6.2]) { const c = W.emojiSprite('🪙', 1.0); c.position.set(pad.x, gy + h, pad.z); W.scene.add(c); pad.coins.push(c); } }
  function removeProp(k) { W.removeObj(k.obj); for (const c of k.coins || []) { W.scene.remove(c); c.material.dispose(); } }
  W.onBounce = () => { api.bump('bounces'); const p = P(); W.pop(p.x, p.y + 2.5, p.z, 'BOING!', '#ff5c8a'); G.sfx.boing(); };

  // ------------------------------------------------------------------ random street events
  function startEvent(id) {
    const def = D.EVENTS.find(e => e.id === id), p = P(), home = G.homeSpot();
    if (!def || F.event) return false;
    const spot = (a, b) => { for (let i = 0; i < 4; i++) { const q = streetSpot(p.x, p.z, a, b); if (q && Math.hypot(q.x - home.x, q.z - home.z) > 15) return q; } return null; };
    const ev = { id, def, t: 0, secs: 30, objs: [] };
    if (id === 'moneyrain') {
      const c = spot(25, 60); if (!c) return false;
      ev.x = c.x; ev.z = c.z; ev.e = '💸'; ev.secs = 40;
      for (let i = 0; i < 16; i++) { const s = W.randomWalkSpot(c.x, c.z, 0, 20) || c; api.spawnPickup(i % 6 === 5 ? 'cash' : 'coin', s.x + rnd(-1, 1), s.z + rnd(-1, 1)); }
      W.burst(c.x, W.groundAt(c.x, c.z) + 3, c.z, '💵', 12, { spread: 6, up: 7, grav: 5, life: 1.6 });
    } else if (id === 'flashmob') {
      const c = spot(14, 30), peds = W.life.peds.filter(q => !q.ctl && q.type !== 'bike' && Math.hypot(q.obj.position.x - p.x, q.obj.position.z - p.z) < 60).slice(0, 8);
      if (!c || peds.length < 3) return false;
      ev.x = c.x; ev.z = c.z; ev.e = '🕺'; ev.secs = 32; ev.peds = peds;
      peds.forEach((q, i) => { q.ctl = true; q.keep = true; const a = i / peds.length * 6.283; q.mx = c.x + Math.cos(a) * 3.2; q.mz = c.z + Math.sin(a) * 3.2; q.e = { x: q.obj.position.x, z: q.obj.position.z, obj: q.obj }; });
    } else if (id === 'ufo') {
      const c = spot(45, 85); if (!c) return false;
      ev.x = c.x; ev.z = c.z; ev.e = '🛸'; ev.secs = 55; ev.under = 0;
      const g = new THREE.Group(), saucer = W.propMesh('ufo'); saucer.castShadow = false;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 4.2, 15, 20, 1, true).translate(0, -7.5, 0), new THREE.MeshBasicMaterial({ color: 0x9fffe0, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      g.add(saucer, beam); g.position.set(c.x, W.groundAt(c.x, c.z) + 15.5, c.z);
      W.scene.add(g); ev.ufo = g; ev.objs.push(g);
    } else if (id === 'goose') {
      const c = spot(16, 28); if (!c) return false;
      ev.m = spawnMonster('goose', c.x, c.z, { event: 34, aggro: 60 }); ev.secs = 34; ev.e = '🪿';
    } else if (id === 'slimes') {
      const c = spot(20, 38); if (!c) return false;
      ev.x = c.x; ev.z = c.z; ev.e = '🟢'; ev.secs = 60;
      for (let i = 0; i < 4; i++) spawnMonster('slime', c.x + rnd(-4, 4), c.z + rnd(-4, 4), { event: 60, aggro: 26 });
    } else if (id === 'pigeonzilla') {
      const c = spot(35, 60); if (!c) return false;
      ev.m = spawnMonster('pigeon', c.x, c.z, { event: 90, aggro: 45 }); ev.secs = 90; ev.e = '🐦';
    } else if (id === 'crate') {
      const c = spot(30, 65); if (!c) return false;
      ev.x = c.x; ev.z = c.z; ev.e = '🪂'; ev.secs = 60; ev.fall = 14;
      const g = new THREE.Group(), crate = W.propMesh('crate'), chute = W.propMesh('chute');
      g.add(crate, chute); ev.chute = chute;
      g.position.set(c.x, W.groundAt(c.x, c.z) + 42, c.z);
      W.scene.add(g); ev.crate = g; ev.objs.push(g);
    } else if (id === 'dogs') {
      ev.e = '🐕'; ev.secs = 40; ev.dogs = [];
      for (let i = 0; i < 5; i++) { const c = spot(14, 30); if (!c) continue; const obj = W.animal('dog', [0xc8894a, 0x2b2b2b, 0xf0e6d6, 0x8a5a2b, 0xd9b38c][i]); place(obj, c.x, c.z); W.scene.add(obj); ev.objs.push(obj); ev.dogs.push({ obj, x: c.x, z: c.z, woof: 1 + i }); }
      if (!ev.dogs.length) return false;
    } else return false;
    F.event = ev;
    api.bump('events');
    U.banner(def.n, def.sub, 'day');
    G.sfx.tick();
    return true;
  }
  F.startEvent = startEvent;
  function endEvent() {
    const ev = F.event; if (!ev) return;
    for (const o of ev.objs) W.removeObj(o);
    if (ev.peds) for (const q of ev.peds) { q.ctl = false; q.keep = false; const a = W.agentOn(q.obj.position.x, q.obj.position.z, false); if (a) { a.off = q.a.off; q.a = a; } }
    F.event = null;
    eventT = 55 + Math.random() * 45;
  }
  function updateEvent(dt) {
    const s = save(), p = P();
    if (!F.event) {
      if (quiet() || calm() || !onStory() || G.rt.race || G.rt.chase || F.chasers.length) return;
      eventT -= dt;
      if (eventT > 0) return;
      eventT = 12; // try again soon if nothing could start here
      const night = isNight(), lv = G.level();
      const wantUfo = s.m['s-ufo'] && s.m['s-ufo'].s === 'active' && !(s.counters.ufos > (s.m['s-ufo'].b || 0));
      if (wantUfo && startEvent('ufo')) return;
      const pool = D.EVENTS.filter(e => (!e.day || !night) && (!e.lvl || lv >= e.lvl));
      let tot = 0; for (const e of pool) tot += e.w;
      let r = Math.random() * tot;
      for (const e of pool) { if (r < e.w) { startEvent(e.id); return; } r -= e.w; }
      return;
    }
    const ev = F.event;
    ev.t += dt;
    if (ev.id === 'flashmob') {
      for (const q of ev.peds) {
        if (!q.obj.parent) continue;
        const left = walk(q.e, q.mx, q.mz, 3.4, dt);
        if (left > 0.4) W.animate(q.fig, 3.4, dt); else { q.obj.rotation.y = Math.atan2(q.e.x - ev.x, q.e.z - ev.z); W.animate(q.fig, 0, dt, 'dance'); }
      }
      if (Math.random() < dt * 1.5) W.burst(ev.x + rnd(-3, 3), W.groundAt(ev.x, ev.z) + 2.5, ev.z + rnd(-3, 3), pick(['🎵', '🎶', '✨']), 1, { spread: 0.5, up: 2, grav: 1, life: 1.2 });
    } else if (ev.id === 'ufo') {
      const g = ev.ufo, d = Math.hypot(ev.x - p.x, ev.z - p.z);
      g.rotation.y += dt * 1.5;
      g.position.y = W.groundAt(ev.x, ev.z) + 15.5 + Math.sin(ev.t * 1.3) * 0.6 + (ev.leave ? ev.leave * ev.leave * 60 : 0);
      if (ev.leave != null) { ev.leave += dt; if (ev.leave > 1.6) endEvent(); return; }
      if (d < 4) {
        ev.under += dt;
        if (Math.random() < dt * 8) W.burst(p.x, p.y + 0.5, p.z, '✨', 1, { spread: 1.5, up: 5, grav: -3, life: 1 });
        if (ev.under > 1.6) {
          W.player.vy = 13; W.player.grounded = false; W.player.jumps = 2;
          api.bump('ufos'); G.addXp(60); G.addStat('smarts', 0.25, true);
          api.spawnPickup('gem', ev.x + 2, ev.z);
          U.banner('👽 Close encounter!', 'They beamed you up a bit, took a selfie and left a gem. Polite, really.', 'done');
          G.sfx.level(); G.log('Met the visitors', '🛸'); feat('abducted');
          ev.leave = 0; G.dirty();
        }
      } else ev.under = 0;
    } else if (ev.id === 'crate') {
      const gy = W.groundAt(ev.x, ev.z);
      if (ev.fall > 0) { ev.fall -= dt; ev.crate.position.y = gy + Math.max(0, ev.fall) * 3; ev.crate.rotation.y = Math.sin(ev.t * 1.5) * 0.3; if (ev.fall <= 0) { ev.chute.visible = false; W.burst(ev.x, gy + 0.3, ev.z, '💨', 5, { spread: 2.5, up: 1 }); G.sfx.tick(); } }
      else if (Math.hypot(ev.x - p.x, ev.z - p.z) < 2.4) {
        const lv = G.level(), r = Math.random();
        const cash = Math.round(rnd(25, 60) * (1 + lv * 0.12));
        G.addMoney(cash, 'from the mystery crate');
        if (G.rpg) G.rpg.drop('crate');
        if (r < 0.35 && !save().owned.w_chicken) { save().owned.w_chicken = true; save().equip.weapon = save().equip.weapon || 'w_chicken'; U.banner('🐔 A rubber chicken!', 'It was in the crate. It squeaks. Press F to bonk with it.', 'done'); }
        else if (r < 0.7) G.addSticker();
        else { G.giveItem('energybar', 2); U.feed('🍫', '2 energy bars'); }
        W.burst(ev.x, gy + 1, ev.z, '🎉', 10, { spread: 4, up: 5 }); G.sfx.done(); api.bump('crates');
        endEvent(); G.dirty(); return;
      }
    } else if (ev.id === 'dogs') {
      ev.dogs.forEach((dg, i) => {
        const a = i / ev.dogs.length * 6.283 + ev.t * 0.4, tx = p.x + Math.cos(a) * 2.2, tz = p.z + Math.sin(a) * 2.2;
        const e = { x: dg.x, z: dg.z, obj: dg.obj }, left = walk(e, tx, tz, 13, dt, 0.3); dg.x = e.x; dg.z = e.z;
        W.animate(dg.obj, left > 0.5 ? 6 : 0, dt);
        dg.woof -= dt; if (dg.woof <= 0) { dg.woof = 4 + Math.random() * 5; sayAt(dg.obj, pick(['Woof!', 'Arf!', 'Bork!', '*sniff sniff*', 'WOOF']), 1.4); }
      });
      if (ev.t > ev.secs - 0.1) { G.addHappy(6); G.addStat('charm', 0.2, true); U.feed('🐕', 'The dogs loved you. +6 😊'); }
    } else if ((ev.id === 'goose' || ev.id === 'pigeonzilla') && ev.m) {
      if (!F.monsters.includes(ev.m)) { if (ev.id === 'goose' && !ev.m.dead && !ev.m.touched) { feat('goosed'); U.feed('🪿', 'You outran the goose. Legend.'); } endEvent(); return; }
    }
    if (ev.t >= ev.secs) {
      if (ev.id === 'goose' && ev.m && !ev.m.touched && !ev.m.dead) { feat('goosed'); U.feed('🪿', 'The goose lost interest. You live to honk another day.'); }
      endEvent();
    }
  }
  async function joinMob() {
    const ev = F.event;
    if (!ev || ev.joined || quiet()) return;
    ev.joined = true; ev.secs += 25;
    const sc = await U.dance(5, 0.9);
    api.bump('mobs');
    if (sc >= 0.6) { G.addHappy(8); G.addStat('charm', 0.3, true); G.addMoney(Math.round(rnd(8, 20) * (1 + G.level() * 0.1)), 'in the hat'); U.banner('🕺 You were the star!', 'The whole street clapped. ' + Math.round(sc * 100) + '% on beat.', 'done'); U.confetti(); }
    else { G.addHappy(3); U.feed('🕺', 'Two left feet, but everyone cheered anyway. +3 😊'); }
    if (F.event === ev) ev.secs = ev.t + 4;
  }
  F.fortune = function () {
    const f = pick(D.FORTUNES), p = P();
    U.banner('🔮 ' + f.t, 'So says the fortune teller.', 'day');
    if (f.do === 'coins') for (let i = 0; i < 6; i++) { const s = W.randomWalkSpot(p.x, p.z, 6, 30); if (s) api.spawnPickup('coin', s.x, s.z); }
    else if (f.do === 'goose') later(4000, () => startEvent('goose'));
    else if (f.do === 'charm') G.addStat('charm', 0.5);
    else if (f.do === 'slimes') later(4000, () => startEvent('slimes'));
    else if (f.do === 'sticker') G.addSticker();
    else if (f.do === 'ufo') later(4000, () => startEvent('ufo'));
    else if (f.do === 'speed') { F.boost = 45; F.boostMul = 1.3; }
    else if (f.do === 'peels') for (let i = 0; i < 5; i++) { const s = W.randomWalkSpot(p.x, p.z, 8, 45); if (s) { const obj = W.propMesh('peel'); obj.scale.setScalar(1.5); place(obj, s.x, s.z, Math.random() * 6); W.scene.add(obj); F.peels.push({ x: s.x, z: s.z, obj }); } }
  };

  // ------------------------------------------------------------------ hooks for the game
  F.speedMul = () => (F.boost > 0 ? F.boostMul : 1);
  F.happyBonus = () => Math.min(8, fun().crushes.length * 2) + (fun().king ? 4 : 0);
  F.interaction = function (p) {
    if (F.event && F.event.id === 'flashmob' && !F.event.joined && Math.hypot(F.event.x - p.x, F.event.z - p.z) < 7) return { t: '🕺 Join the flash mob', fn: joinMob };
    for (const a of F.folk) if (!a.up && Math.hypot(a.x - p.x, a.z - p.z) < 3.2) return { t: '🧡 ' + a.d.n, fn: () => folkMenu(a) };
    for (const a of F.sweet.values()) if (!a.mad && Math.hypot(a.x - p.x, a.z - p.z) < 3) return { t: '💕 ' + a.c.name, fn: () => sweetMenu(a) };
    return null;
  };
  const gplace = {};
  F.markers = function (out) {
    const f = fun(), p = P();
    for (const a of F.folk) out.push({ x: a.x, z: a.z, color: '#ff8a3d', r: 5, emoji: '🧡', ring: '#fff' });
    for (const c of f.crushes) { const q = G.xz(c); out.push({ x: q.x, z: q.z, color: '#ff5c8a', r: 5.5, emoji: '💕', ring: '#fff' }); }
    for (const m of F.monsters) { if (m.guard) continue; out.push({ x: m.x, z: m.z, color: m.def.boss ? '#9b5cf6' : m.def.rare ? '#d6dbe3' : m.champ ? '#3b82f6' : '#35e06a', r: m.def.boss || m.def.rare ? 8 : 4, emoji: m.def.boss ? '👑' : m.def.rare ? '💀' : '', ring: '#1f1a3d', edge: !!(m.def.boss || m.def.rare) }); }
    for (const pl of W.places) if (pl.kind === 'metro' && !pl.virtual && Math.hypot(pl.pin.x - p.x, pl.pin.z - p.z) < 700) { const open = F.metroOpen(pl); out.push({ x: pl.pin.x, z: pl.pin.z, color: open ? '#1971c2' : '#ff3b30', r: 6.5, emoji: open ? '🚇' : '💀', ring: '#fff', edge: !open }); }
    if (f.wallet) { const q = G.xz(f.wallet); out.push({ x: q.x, z: q.z, color: '#ffd54a', r: 7, emoji: '👛', ring: '#1f1a3d', edge: true }); }
    for (const c of F.chasers) out.push({ x: c.x, z: c.z, color: '#ff3b30', r: 6, emoji: '💢', ring: '#fff', edge: true });
    for (const q of F.pads) out.push({ x: q.x, z: q.z, color: '#ff5c8a', r: 3.5, ring: '#1f1a3d' });
    for (const id of Object.keys(f.grudges)) { const pl = gplace[id] || (gplace[id] = W.places.find(x => x.id === id)); if (pl && f.grudges[id] > save().day && Math.hypot(pl.pin.x - p.x, pl.pin.z - p.z) < 500) out.push({ x: pl.pin.x, z: pl.pin.z, color: '#ffffff', r: 5.5, emoji: '💢', ring: '#ff3b30' }); }
    const ev = F.event;
    if (ev && ev.x != null) out.push({ x: ev.x, z: ev.z, color: '#ffc21f', r: 8, emoji: ev.e, ring: '#1f1a3d', edge: true });
    if (f.king) for (const k of G.rt.pickups) if (!k.dead && k.type === 'gem') out.push({ x: k.x, z: k.z, color: '#c9f1ff', r: 6, emoji: '💎', ring: '#1f1a3d', edge: true });
  };
  F.newDay = function (parts) {
    const s = save(), f = fun(), lv = G.level();
    for (const id of Object.keys(f.grudges)) if (f.grudges[id] <= s.day) delete f.grudges[id];
    let gifts = 0;
    for (let i = f.crushes.length - 1; i >= 0; i--) {
      const c = f.crushes[i];
      if (s.day - c.seen > 1) c.love -= G.rpg && G.rpg.bonus('fade') >= 1 ? 3 : 6;
      if (c.love <= 0) { f.crushes.splice(i, 1); G.log(D.FLIRT.gone.replace('{n}', c.name), '💔'); parts.push('💔 ' + c.name + ' moved on'); continue; }
      if (c.love >= 55 && Math.random() < 0.4) gifts += Math.round(rnd(5, 14) * (1 + lv * 0.1));
    }
    countSweet();
    if (gifts) { s.money += gifts; parts.push('💕 gifts ' + fmt$(gifts)); }
    if (f.king) { const t = Math.round((20 + Math.min(100, f.hearts) * 0.6) * (1 + lv * 0.1)); s.money += t; parts.push('👑 tribute ' + fmt$(t)); }
  };
  F.summary = function () {
    const s = save(), f = fun(), p = P(), c = s.counters;
    const next = D.FOLK_TITLES.find(t => t[0] > f.hearts);
    return {
      hearts: f.hearts, king: f.king || '', folkTitle: f.king ? f.king + ' of the Streets' : titleOf(D.FOLK_TITLES, f.hearts), nextAt: next ? next[0] : 0, nextTitle: next ? next[1] : '', crownAt: D.CROWN_AT,
      crushes: f.crushes.map(x => { const q = G.xz(x); return { id: x.id, name: x.name, love: Math.round(x.love), dist: Math.round(Math.hypot(q.x - p.x, q.z - p.z)), seen: s.day - x.seen, lat: x.lat, lon: x.lon }; }),
      crushTitle: titleOf(D.CRUSH_TITLES, f.crushes.length),
      grudges: Object.keys(f.grudges).filter(id => f.grudges[id] > s.day).map(id => { const pl = W.places.find(x => x.id === id); return { name: pl ? pl.name : 'A shop somewhere', days: f.grudges[id] - s.day }; }),
      bonks: c.bonks || 0, monsterTitle: titleOf(D.MONSTER_TITLES, c.bonks || 0), weapon: weapon(), pranks: c.pranks || 0, escapes: c.escapes || 0, caught: c.caught || 0,
      flirts: c.flirts || 0, dates: c.dates || 0, helped: c.helped || 0, slides: c.slides || 0, bounces: c.bounces || 0, ufos: c.ufos || 0, jokes: c.jokes || 0, events: c.events || 0,
      night: isNight(), monstersOut: F.monsters.length,
    };
  };
  F.tick = function (dt, paused) {
    if (!alive || paused) return;
    cool -= dt; slow -= dt;
    if (F.boost > 0) { F.boost -= dt; if (Math.random() < dt * 14) W.burst(P().x, P().y + 0.2, P().z, '💨', 1, { spread: 0.6, up: 0.6, size: 0.4, life: 0.4 }); }
    syncWeapon();
    updateMonsters(dt);
    updateShots(dt);
    updateSweet(dt);
    updateFolk(dt);
    updateChasers(dt);
    updateRivals(dt);
    updateProps(dt);
    updateEvent(dt);
    foeTick(dt);
    if (!F.dying && G.rt.t - lastHurt > 5) F.heal(F.maxHp() * 0.025 * dt);  // catching your breath
    if (hp() > F.maxHp()) fun().hp = F.maxHp();
    guardT -= dt;
    if (guardT <= 0) { guardT = 1; guardTick(); walletTick(); }
    if (slow <= 0) { slow = 1; api.bumpTo('weapons', Object.keys(save().owned).filter(k => D.ITEMS[k] && D.ITEMS[k].weapon).length); }
  };
  F.rideChanged = function () { weaponOn = undefined; };
  F.destroy = function () { alive = false; };
  fun(); countSweet();
  return F;
}

window.CFTFun = { attach };
})();

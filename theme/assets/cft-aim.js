/* City Fun Time: the aim update (2026-11-19). The user: "remove block on the right mouse key. Instead the right mouse key
   creates a way to target something, like a sight. Then depending on what is in your 1 2 3 panel that is activated, the left
   click will do it (as you are holding the right button). Releasing the right button goes back to bonk... There need to be
   light guides when something is being announced: when a monster is nearby a little wave of rainbow energy emanates towards
   it on the floor (the arrow on the head is for missions)... Another weapon: spiderwebs. Loaded into the right-left click
   combo it shoots out and then pulls you in its direction. It needs to attach to a wall to work."
   - THE SIGHT: hold the right mouse button = the camera slides over your shoulder (cft-world updateCamera, W.aiming), a
     crosshair sits in the middle of the screen and you face where it points. Left click uses the chosen slot; let go of the
     right button = left click bonks again. Blocking moved to G / the 🛡️ button only.
   - THE SLOTS: 1 water, 2 lightning, 3 extinguisher (hold the left button), 4 web. Number keys (and a mouse click on the
     hotbar) only CHOOSE; a finger on a hotbar button chooses and uses it (touch has no sight: it aims where you face).
     Water and lightning aim at the exact crosshair point (cft-camp aimDir reads W.aimPoint), and so do ranged weapons (F).
   - THE WEB: a strand flies to the crosshair (or, without the sight, to the wall you face); on a building it sticks and
     reels you in (W.tether in cft-world updatePlayer); arriving = you cling to the wall (climb) or, near the top, flip up
     onto the roof; Space lets go with a hop. Anything but a wall = "NO WALL!" (the user's rule). A figment under the
     crosshair gets webbed instead (stuck for a moment). Free, short cooldown.
   - RAINBOW GUIDES: the first time a figment, a MEGA, a weird creature or an animal missing from your Dex comes near, a
     wave of rainbow chevrons runs along the ground from you to it (W.guide). Missions keep the gold arrow.
   - DEX HINTS: animals and creatures missing from your Dex wear a "📸 NEW" tag.
   - SLOT 5, THE SHOOTER (2026-11-21): the shooters you own sit on a belt (save.aim.gun = the chosen one); key 5 chooses the
     slot, the scroll wheel switches shooters while aiming (or while slot 5 is chosen), left click fires, holding keeps firing.
     The hand keeps its bonk weapon. Shooters also lie around town (D.TUNE.aim.gunDrops), spinning on an orange beam.

   const A = CFTAim.attach(G, api)   by cft-game.js after G.wild (G.aim = A). api: {bump}
   A.on() · A.setAim(on) · A.select(slot) · A.fire(down) · A.tap(slot, down) (touch) · A.slot() · A.tick(dt, paused) · A.destroy()
   World: W.aiming, W.aimPoint {x, y, z, kind: 'foe' | 'wall' | 'ground' | 'sky'}, W.aimRay, W.rayCast, W.tether, W.onTetherEnd,
   W.guide, W.swing(reach, arc), W.showReach. Data: D.TUNE.aim. State: save.aim {slot, tips}. Counters: webs, webpulls,
   webroofs, webbed, guides. Tests: tools/live/aimtest.js (game_test.py --aim). */
(function () {
'use strict';

function attach(G, api) {
  const D = G.D, W = G.W, U = G.ui, THREE = W.THREE, F = G.fun, T = D.TUNE.aim;
  const save = () => G.save;
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const P = () => W.player.pos;
  const SLOTS = ['water', 'volt', 'foam', 'web', 'gun'];
  const NAMES = { water: '💧 Water', volt: '🌩️ Lightning', foam: '🧯 Extinguisher', web: '🕸️ Web', gun: '🎯 Shooter' };
  const A = {};
  let alive = true, aiming = false, foamDown = false, webCd = 0, strand = null, scanT = 0, guideCd = 0, aimHit = null;
  let gunDown = false, gunCd = 0, wheelAcc = 0, wheelT = 0, cacheT = 0;
  const caches = [];
  const isShooter = w => !!(w && (w.ranged === 'proj' || w.ranged === 'shot'));
  const announced = new WeakSet(), tagged = new Set();
  const quiet = () => G.rt.busy || U.isOpen() || G.state() !== 'play';
  const onFoot = () => W.ride().mode === 'foot';
  const word = (t, tone, sub) => { if (G.hero) G.hero.word(t, tone, sub); };
  function st() {
    const s = save();
    if (!s.aim || typeof s.aim !== 'object') s.aim = {};
    if (!SLOTS.includes(s.aim.slot)) s.aim.slot = 'water';
    if (!s.aim.tips || typeof s.aim.tips !== 'object') s.aim.tips = {};
    // the shooter belt (2026-11-21): shooters live in slot 5, the hand keeps the bonk weapon. Old saves: a shooter worn in
    // the weapon slot moves to the belt once, and the best bonk weapon you own goes back in your hand.
    if (!s.aim.belt) {
      s.aim.belt = 1;
      const held = D.ITEMS[s.equip && s.equip.weapon];
      if (held && isShooter(held.weapon)) {
        s.aim.gun = s.equip.weapon; delete s.equip.weapon;
        const melee = Object.keys(s.owned || {}).filter(id => s.owned[id] && D.ITEMS[id] && D.ITEMS[id].weapon && !isShooter(D.ITEMS[id].weapon) && D.ITEMS[id].weapon.ranged !== 'cone').sort((a, b) => D.ITEMS[b].p - D.ITEMS[a].p)[0];
        if (melee && !(G.rpg && G.rpg.weapon())) s.equip.weapon = melee;
      }
    }
    if (s.aim.gun && !(s.owned && s.owned[s.aim.gun] && D.ITEMS[s.aim.gun] && isShooter(D.ITEMS[s.aim.gun].weapon))) s.aim.gun = null;
    if (!s.aim.gun) { const b = belt(); s.aim.gun = b.length ? b[b.length - 1] : null; }
    return s.aim;
  }
  // every shooter you own, cheapest first (the order the scroll wheel walks)
  function belt() {
    const s = save();
    return Object.keys(s.owned || {}).filter(id => s.owned[id] && D.ITEMS[id] && D.ITEMS[id].type === 'gear' && isShooter(D.ITEMS[id].weapon)).sort((a, b) => D.ITEMS[a].p - D.ITEMS[b].p);
  }
  st();
  const tip = (k, text) => { const a = st(); if (a.tips[k]) return; a.tips[k] = 1; U.toast(text); G.dirty(); };
  const shell = U.canvas.parentElement;
  const sight = shell.querySelector('[data-sight]'), sightLbl = shell.querySelector('[data-sightlbl]');

  // ------------------------------------------------------------------ slots + the sight
  A.on = () => aiming;
  A.slot = () => st().slot;
  A.isShooter = isShooter;
  A.guns = () => belt();
  A.gun = () => st().gun;
  function gunWeapon() { const id = st().gun, it = D.ITEMS[id]; return it && isShooter(it.weapon) ? Object.assign({ e: it.e, n: it.n, id }, it.weapon) : null; }
  A.gunWeapon = gunWeapon;
  // choose a shooter for slot 5 (the wardrobe, the Chaos app, the wheel, a pickup)
  A.pickGun = function (id, quiet) {
    if (!D.ITEMS[id] || !isShooter(D.ITEMS[id].weapon) || !save().owned[id]) return false;
    const a = st(); a.gun = id; G.dirty(); syncGun();
    if (!quiet) { const it = D.ITEMS[id], w = it.weapon; U.feed(it.e, it.n + ' in slot 5 · ' + w.reach + ' m · ' + (w.ammo || 1) + ' ammo a shot'); const p = P(); W.pop(p.x, p.y + 2.3, p.z, it.e + ' ' + it.n.toUpperCase(), '#ffb26b', 0.7); }
    return true;
  };
  A.cycle = function (dir) {
    const b = belt();
    if (!b.length) { U.toast('🎯 No shooters yet: they lie around town (🎯 on the map) and toy, gift and hardware shops sell them.'); return false; }
    const i = b.indexOf(st().gun), j = ((i < 0 ? 0 : i + (dir > 0 ? 1 : -1)) % b.length + b.length) % b.length;
    if (st().slot !== 'gun') { st().slot = 'gun'; markSlot(); }
    A.pickGun(b[j]);
    if (G.sfx && G.sfx.swing) G.sfx.swing();
    return true;
  };
  // a new shooter (bought or found): onto the belt, chosen, with a tip the first time
  A.addGun = function (id, how) {
    const s = save(), it = D.ITEMS[id];
    if (!it || !isShooter(it.weapon)) return false;
    s.owned[id] = true;
    A.pickGun(id, true);
    tip('belt', '🎯 Shooters go in slot 5 (key 5). Hold the RIGHT mouse button to aim, LEFT click to fire (hold it to keep firing). Scroll the mouse wheel while aiming to switch shooters.');
    const n = belt().length;
    U.feed(it.e, (how === 'found' ? 'Found: ' : 'Got: ') + it.n + ' (slot 5 · ' + n + ' shooter' + (n === 1 ? '' : 's') + ')');
    G.dirty();
    return true;
  };
  function markSlot() { const k = st().slot; for (const b of shell.querySelectorAll('[data-pw]')) b.classList.toggle('sel', b.dataset.pw === k); }
  A.select = function (k) {
    if (!SLOTS.includes(k)) return;
    const a = st();
    if (a.slot !== k && foamDown) A.fire(false);
    a.slot = k; markSlot(); G.dirty();
    if (k === 'gun') { const gw = gunWeapon(); U.feed(gw ? gw.e : '🎯', gw ? gw.n + ' ready: hold the right mouse button to aim, left click fires (scroll to switch)' : 'No shooter yet: find one around town (🎯 on the map)'); }
    else U.feed(NAMES[k].split(' ')[0], NAMES[k].slice(NAMES[k].indexOf(' ') + 1) + ' ready: hold the right mouse button to aim, left click to use it');
    syncGun();
    tip('slots', '🎯 ' + NAMES[k] + ' chosen. Hold the RIGHT mouse button to aim, then LEFT click to use it. Let go of the right button to bonk again.');
  };
  A.setAim = function (on) {
    on = !!on && alive && !quiet() && onFoot() && !F.dying;
    if (on === aiming) return;
    aiming = on; W.aiming = on;
    if (!on) { if (foamDown || gunDown) A.fire(false); W.aimPoint = null; aimHit = null; cutWeb(); }   // letting go of the right button cuts the web (2026-11-19)
    sight.hidden = !on; shell.classList.toggle('cft-aiming', on);
    syncGun();
    if (on) { aimTick(); tip('aim', '🎯 Aiming! Left click = ' + NAMES[st().slot] + ' (choose with 1-5: water, lightning, extinguisher, web, shooter; the scroll wheel switches shooters). Let go of the right button to bonk again.'); }
  };
  A.fire = function (down) {
    if (!down) { gunDown = false; if (foamDown) { foamDown = false; if (G.camp) G.camp.power('foam', false); } return false; }
    if (!aiming) return false;
    aimTick();
    return use(st().slot);
  };
  A.tap = function (k, down) {   // touch: the hotbar button chooses AND uses it
    if (!down) { if (k === 'foam' || k === 'gun') A.fire(false); return false; }
    if (st().slot !== k) { st().slot = k; markSlot(); G.dirty(); }
    return use(k);
  };
  function use(k) {
    if (k === 'web') return shootWeb();
    if (k === 'gun') { gunDown = true; return fireGun(); }
    if (!G.camp) return false;
    if (k === 'foam') { foamDown = !!G.camp.power('foam', true); return foamDown; }
    return G.camp.power(k, true);
  }
  // Where the crosshair points: a figment under it (within reach of the ray), else the first wall or ground, else the sky
  function aimTick() {
    const r = W.aimRay;
    if (!r) return;
    const from = Math.max(0.5, r.from + 0.4), maxD = T.range + from;
    let foe = null, ft = Infinity;
    const scan = (list, yOf, rad) => {
      for (const m of list) {
        if (m.dead) continue;
        const y = yOf(m), dx = m.x - r.ox, dy = y - r.oy, dz = m.z - r.oz, t = dx * r.dx + dy * r.dy + dz * r.dz;
        if (t < from || t > maxD || t > ft) continue;
        const ex = dx - r.dx * t, ey = dy - r.dy * t, ez = dz - r.dz * t;
        if (Math.hypot(ex, ey, ez) < rad(m)) { ft = t; foe = { x: m.x, y, z: m.z, m }; }
      }
    };
    scan(F.monsters, m => m.obj.position.y + (m.obj.userData.h || 1.4) * (m.obj.userData.size || 1) * 0.55, m => m.r + 0.5);
    if (G.camp) scan(G.camp.megas || [], m => W.groundAt(m.x, m.z) + m.h * 0.5, m => m.r + 1.5);
    const h = W.rayCast(r.ox, r.oy, r.oz, r.dx, r.dy, r.dz, Math.min(maxD, ft), from);
    aimHit = h;
    if (foe) W.aimPoint = { x: foe.x, y: foe.y, z: foe.z, kind: 'foe', m: foe.m };
    else if (h) W.aimPoint = { x: h.x, y: h.y, z: h.z, kind: h.kind };
    else { const t = Math.min(maxD, 45); W.aimPoint = { x: r.ox + r.dx * t, y: r.oy + r.dy * t, z: r.oz + r.dz * t, kind: 'sky' }; }
    // the crosshair: red on a figment, green on a wall the web can reach, grey otherwise
    const k = st().slot, ap = W.aimPoint, p = P(), d = Math.hypot(ap.x - p.x, ap.y - p.y - 1.4, ap.z - p.z);
    const webOk = k === 'web' && ap.kind === 'wall' && d <= T.webRange;
    const cls = 'cft-sight ' + (ap.kind === 'foe' ? 'foe' : webOk ? 'wall' : k === 'web' ? 'miss' : '') + ' s-' + k;
    if (sight.className !== cls) sight.className = cls;
    const lbl = NAMES[k].split(' ')[0] + ' ' + (k === 'web' ? (ap.kind === 'foe' && d <= T.webRange ? 'web it!' : webOk ? Math.round(d) + ' m' : ap.kind === 'wall' ? 'too far' : 'no wall') : ap.kind === 'foe' ? Math.round(d) + ' m' : '');
    if (sightLbl.textContent !== lbl) sightLbl.textContent = lbl;
  }

  // ------------------------------------------------------------------ slot 5: the shooter (2026-11-21, the user: "add the distance
  // shooter there, selectable like the short range weapon slot; the scroll wheel changes that distance weapon; distance weapons
  // varied in the world"). Fires the chosen shooter from your belt (cft-fun F.shoot: ammo, damage growth, real projectiles);
  // holding the left button keeps firing at the shooter's own rate. The model shows in your hand while you aim with it.
  function fireGun() {
    if (gunCd > 0 || F.dying || quiet()) return false;
    if (!onFoot()) { U.toast('🎯 Hop off your ride first (V).'); gunCd = 0.5; return false; }
    const w = gunWeapon();
    if (!w) { U.toast('🎯 No shooter yet. Shooters lie around town (🎯 on the map), and toy, gift and hardware shops sell them.'); gunCd = 0.8; gunDown = false; return false; }
    gunCd = w.ranged === 'shot' ? 0.32 : (w.rate || 0.5);
    const ok = F.shoot(w);
    if (!ok) gunDown = false;   // out of ammo: stop the auto-fire (the *click* already showed)
    return ok;
  }
  A.fireGun = fireGun;
  let handOn = null;
  function syncGun() {
    const want = aiming && st().slot === 'gun' ? (gunWeapon() || {}).mesh || null : null;
    if (want !== handOn) { handOn = want; F.handOverride = want; }
  }
  function gunHud() {
    const b = shell.querySelector('[data-pw="gun"]');
    if (!b) return;
    const w = gunWeapon(), ic = b.querySelector('[data-gunicon]'), n = b.querySelector('[data-pwn="gun"]');
    const icon = w ? w.e : '🎯';
    if (ic && ic.textContent !== icon) ic.textContent = icon;
    const c = G.camp && G.camp.charges ? G.camp.charges() : null, inf = !!(G.camp && G.camp.inIntro && G.camp.inIntro());
    const t = !w ? '' : inf ? '∞' : c ? String(c.ammo) : '';
    if (n && n.textContent !== t) n.textContent = t;
    if (n) n.classList.toggle('low', !!(w && c && !inf && c.ammo <= 5));
    b.classList.toggle('empty', !w);
    const ttl = w ? 'Shooter (5): ' + w.n + ' · scroll the wheel while aiming to switch (' + belt().length + ' owned)' : 'Shooter (5): none yet. Find one around town (🎯 on the map)';
    if (b.title !== ttl) b.title = ttl;
  }
  // the scroll wheel switches shooters while you aim (or while slot 5 is chosen); otherwise it zooms the camera (Ctrl + wheel always zooms)
  W.onWheel = function (dy, e) {
    if (!alive || (e && e.ctrlKey) || quiet() || !onFoot()) return false;
    if (!(aiming || st().slot === 'gun')) return false;
    if (!belt().length) return false;
    const now = performance.now();
    if (now - wheelT > 250) wheelAcc = 0;
    wheelT = now; wheelAcc += dy;
    if (Math.abs(wheelAcc) >= 60) { A.cycle(wheelAcc > 0 ? 1 : -1); wheelAcc = 0; }
    return true;
  };

  // shooters lying around town: a floating model of the real thing on a glowing ring, a beam you can see from afar
  function pickGunKind() {
    const L = G.level(), s = save(), list = Object.keys(D.ITEMS).filter(id => { const it = D.ITEMS[id]; return it.type === 'gear' && isShooter(it.weapon) && !(it.req && it.req.lvl > L + 2); });
    if (!list.length) return null;
    let tot = 0; const w = list.map(id => { const v = (s.owned[id] ? 1 : 3) / Math.sqrt(Math.max(10, D.ITEMS[id].p)); tot += v; return v; });
    let r = Math.random() * tot;
    for (let i = 0; i < list.length; i++) { if (r < w[i]) return list[i]; r -= w[i]; }
    return list[0];
  }
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending });
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffc21f, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const beamGeo = new THREE.CylinderGeometry(0.18, 0.18, 26, 8, 1, true).translate(0, 13, 0), ringGeo = new THREE.RingGeometry(0.75, 0.95, 28).rotateX(-Math.PI / 2);
  function spawnCache(id, x, z) {
    const it = D.ITEMS[id], g = new THREE.Group(), y = W.standAt(x, z);
    const model = W.propMesh(it.weapon.mesh); model.scale.setScalar(1.7); model.rotation.z = 0.5;
    const spin = new THREE.Group(); spin.add(model); spin.position.y = 1.1; g.add(spin);
    const ring = new THREE.Mesh(ringGeo, ringMat); ring.position.y = 0.08; g.add(ring);
    const beam = new THREE.Mesh(beamGeo, beamMat); g.add(beam);
    const tag = W.label(it.e + ' ' + it.n, { size: 28, height: 0.4, bg: 'rgba(255,138,61,.95)', fg: '#ffffff', border: '#1f1a3d' }); tag.position.y = 2.25; g.add(tag);
    g.position.set(x, y, z); W.scene.add(g);
    const c = { id, x, z, y, g, spin, t: Math.random() * 6 };
    caches.push(c);
    return c;
  }
  function dropCache(c) { const i = caches.indexOf(c); if (i >= 0) caches.splice(i, 1); W.scene.remove(c.g); }
  function takeCache(c) {
    const s = save(), it = D.ITEMS[c.id], p = P();
    dropCache(c);
    W.burst(c.x, c.y + 1.2, c.z, it.e, 6, { spread: 2, up: 3, size: 0.5 });
    if (G.sfx && G.sfx.pick) G.sfx.pick();
    api.bump('gunfinds');
    if (G.camp && G.camp.addAmmo) G.camp.addAmmo(T.gunAmmo);
    if (!s.owned[c.id]) {
      A.addGun(c.id, 'found');
      U.banner(it.e + ' New shooter: ' + it.n + '!', 'It went in slot 5. Hold the right mouse button to aim, left click to fire. The scroll wheel switches shooters.', 'done');
      W.pop(p.x, p.y + 2.5, p.z, 'NEW SHOOTER!', '#ff8a3d', 1.1);
    } else {
      U.feed(it.e, 'Another ' + it.n + ': +' + T.gunAmmo + ' ammo');
      W.pop(p.x, p.y + 2.4, p.z, '+' + T.gunAmmo + ' AMMO', '#ffb26b', 0.8);
    }
    G.dirty();
  }
  function cacheTick(dt) {
    const p = P(), tt = G.rt.t;
    for (const c of caches.slice()) {
      c.spin.rotation.y = tt * 1.8 + c.t; c.spin.position.y = 1.1 + Math.sin(tt * 2.4 + c.t) * 0.15;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d > 650) { dropCache(c); continue; }
      if (d < 1.9 && p.y - c.y < 2.6 && p.y - c.y > -1.5 && !F.dying) takeCache(c);
    }
    cacheT -= dt;
    if (cacheT > 0) return;
    cacheT = 1.5;
    if (!G.storyOn || !G.storyOn() || (window.CFT_TEST && window.CFT_TEST.calm && !window.CFT_TEST.guns)) return;
    if (caches.length < T.gunDrops) {
      const id = pickGunKind();
      const sp = id && W.randomWalkSpot(p.x, p.z, T.gunDropMin, T.gunDropMax, (x, z) => caches.every(c => Math.hypot(c.x - x, c.z - z) > 70));
      if (sp) spawnCache(id, sp.x, sp.z);
    }
  }
  A.caches = caches;
  A.spawnCache = (id, x, z) => spawnCache(id, x, z);
  A.markers = function (out) { for (const c of caches) out.push({ x: c.x, z: c.z, color: '#ff8a3d', r: 4, emoji: D.ITEMS[c.id].e, ring: '#1f1a3d' }); };

  // ------------------------------------------------------------------ the web
  const strandMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false });
  const strandGeo = new THREE.BoxGeometry(1, 1, 1);
  function handPos() {
    const p = P(), f = W.player.face, rx = Math.cos(f), rz = -Math.sin(f), fx = -Math.sin(f), fz = -Math.cos(f);
    return { x: p.x + rx * 0.32 + fx * 0.35, y: p.y + (W.tether ? 2.0 : 1.45), z: p.z + rz * 0.32 + fz * 0.35 };
  }
  // Cut: the strand vanishes and the pull stops; you keep your speed and fall (or keep clinging if you already arrived)
  function cutWeb() {
    if (!strand) return;
    const pulling = strand.tether && W.tether === strand.tether;
    if (pulling || !strand.stuck) { if (pulling) W.tether = null; const p = P(); W.pop(p.x, p.y + 2.2, p.z, 'SNIP!', '#ffffff', 0.7); }
    dropStrand();
  }
  A.cutWeb = cutWeb;
  function dropStrand() {
    if (!strand) return;
    W.scene.remove(strand.line); W.scene.remove(strand.end); if (strand.end.material) strand.end.material.dispose();
    strand = null;
  }
  // Without the sight (touch, or F-less tests): the wall you face, a few angles up
  function wallAhead() {
    const p = P(), f = W.player.face, fx = -Math.sin(f), fz = -Math.cos(f);
    for (const up of [0.35, 0.65, 0.15, 0.95]) {
      const c = Math.cos(up), dy = Math.sin(up);
      const h = W.rayCast(p.x, p.y + 1.5, p.z, fx * c, dy, fz * c, T.webRange, 0.3);
      if (h && h.kind === 'wall') return h;
    }
    return null;
  }
  function shootWeb() {
    if (webCd > 0 || F.dying || quiet()) return false;
    if (!onFoot()) { U.toast('🕸️ Hop off your ride first (V).'); webCd = 0.5; return false; }
    const p = P(), hp = handPos();
    let target = null, kind = 'miss';
    if (aiming && W.aimPoint) {
      const ap = W.aimPoint, d = Math.hypot(ap.x - hp.x, ap.y - hp.y, ap.z - hp.z);
      if (ap.kind === 'foe' && d <= T.webRange) { target = ap; kind = 'foe'; }
      else if (ap.kind === 'wall' && d <= T.webRange) { target = ap; kind = 'wall'; }
      else { const k = Math.min(1, T.webRange / Math.max(1, d)); target = { x: hp.x + (ap.x - hp.x) * k, y: hp.y + (ap.y - hp.y) * k, z: hp.z + (ap.z - hp.z) * k }; }
    } else {
      const h = wallAhead();
      if (h) { target = h; kind = 'wall'; }
      else { const f = W.player.face; target = { x: p.x - Math.sin(f) * T.webRange * 0.6, y: p.y + 6, z: p.z - Math.cos(f) * T.webRange * 0.6 }; }
    }
    dropStrand();
    if (W.tether) { W.tether = null; }
    const line = new THREE.Mesh(strandGeo, strandMat), end = W.emojiSprite('🕸️', kind === 'wall' ? 1.1 : 0.7);
    line.renderOrder = 4; end.visible = false;
    W.scene.add(line); W.scene.add(end);
    strand = { line, end, x: target.x, y: target.y, z: target.z, kind, m: target.m || null, len: 0, t: 0, stuck: false, fade: 0 };
    webCd = T.webCd;
    W.swing();
    if (G.sfx) G.sfx.swing();
    W.pop(hp.x, hp.y + 0.6, hp.z, pick(['THWIP!', 'THWIP!', 'FWSSH!', 'PEW-WEB!']), '#ffffff', 0.6);
    api.bump('webs');
    return true;
  }
  function strandTick(dt) {
    if (!strand) return;
    const s = strand, hp = handPos();
    if (s.m && !s.m.dead) { s.x = s.m.x; s.z = s.m.z; }
    const dx = s.x - hp.x, dy = s.y - hp.y, dz = s.z - hp.z, d = Math.hypot(dx, dy, dz) || 1e-6;
    s.t += dt;
    if (!s.stuck) {
      s.len = Math.min(d, s.len + T.webSpeed * dt);
      if (s.len >= d - 0.01) { // it got there
        s.stuck = true; s.end.visible = true; s.end.position.set(s.x, s.y, s.z);
        if (s.kind === 'wall') {
          W.tether = { x: s.x, y: s.y, z: s.z, v0: T.webV0, acc: T.webAcc, max: T.webMax, life: T.webLife, t: 0 };
          s.tether = W.tether;
          api.bump('webpulls');
          tip('web', '🕸️ Stuck! The web pulls you to the wall: you cling on (push forward to climb, Space jumps off), or flip onto the roof if it caught near the top. Let go of the right button (or press Space) to cut it.');
        } else if (s.kind === 'foe' && s.m && !s.m.dead) {
          s.m.stun = Math.max(s.m.stun || 0, T.webStun); s.m.webbed = G.rt.t + T.webStun;
          W.pop(s.m.x, s.y + 1.2, s.m.z, 'WEBBED!', '#ffffff', 1);
          W.burst(s.m.x, s.y, s.m.z, '🕸️', 4, { spread: 1.5, up: 1, size: 0.5, life: 0.6 });
          api.bump('webbed');
          s.fade = 0.35;
        } else {
          W.pop(s.x, s.y + 0.4, s.z, 'NO WALL!', '#b0a9c8', 0.8);
          tip('nowall', '🕸️ The web only sticks to walls: aim at a building (the sight turns green).');
          s.fade = 0.3;
        }
      }
    } else if (s.tether && W.tether !== s.tether && !s.fade) s.fade = 0.25;   // the pull ended (arrived, let go, timed out)
    if (s.fade) { s.fade -= dt; s.line.material = strandMat; if (s.fade <= 0) { dropStrand(); return; } }
    const L = s.stuck ? d : s.len, ux = dx / d, uy = dy / d, uz = dz / d;
    s.line.scale.set(0.045, 0.045, Math.max(0.05, L));
    s.line.position.set(hp.x + ux * L / 2, hp.y + uy * L / 2, hp.z + uz * L / 2);
    s.line.lookAt(hp.x + ux * L, hp.y + uy * L, hp.z + uz * L);
  }
  W.onTetherEnd = function (how) {
    const p = P();
    if (how === 'roof') { W.pop(p.x, p.y + 2.4, p.z, pick(['UP AND OVER!', 'ROOFTOP!', 'PARKOUR!!']), '#9fe3d0', 1); api.bump('webroofs'); if (G.chaos) G.chaos.add('bounce'); }
    else if (how === 'wall') { W.pop(p.x, p.y + 2.4, p.z, pick(['CLING!', 'STICKY!', 'SPIDER MODE']), '#ffffff', 0.8); if (G.chaos) G.chaos.add('bounce'); }
    else if (how === 'jump') { W.pop(p.x, p.y + 2.2, p.z, pick(['YEET!', 'WHEEE!', 'SWING!']), '#ffc21f', 0.8); if (G.chaos) G.chaos.add('bounce'); }
  };

  // ------------------------------------------------------------------ rainbow guides + Dex tags
  function guideTo(x, z, hue, why) {
    if (!W.guide(x, z, { hue, max: T.guideMax })) return false;
    guideCd = T.guideCd; api.bump('guides');
    if (why) U.feed('🌈', why);
    return true;
  }
  function scanTick() {
    const p = P(), near = (o, r) => Math.hypot(o.x - p.x, o.z - p.z) < r;
    // MEGA figments: always
    if (G.camp) for (const m of G.camp.megas || []) if (!m.dead && !announced.has(m) && near(m, T.megaR)) { announced.add(m); guideTo(m.x, m.z, 0, null); }   // (the campaign already announces MEGAs)
    // figments: special ones always, others when the guides aren't busy
    for (const m of F.monsters) {
      if (m.dead || announced.has(m) || !near(m, T.guideR)) continue;
      announced.add(m);
      const special = m.def.boss || m.champ || m.guard || m.def.rare || m.outpost;
      if (special || guideCd <= 0) guideTo(m.x, m.z, special ? 0.8 : 0.55, special ? (m.def.e || '👾') + ' ' + m.def.n + ' nearby (level ' + (m.lvl || 1) + ')' : null);   // ordinary figments: the rainbow alone (the feed stays short)
    }
    // weird creatures, and animals not in your Dex yet
    if (G.chaos) {
      const dex = (save().chaos && save().chaos.dex) || {};
      for (const c of (G.chaos.rot || [])) if (!c.snapped && !announced.has(c) && near(c, T.rotR)) { announced.add(c); guideTo(c.x, c.z, 0.3, dex[c.d.id] ? null : 'Something weird is that way: snap it for the Dex'); }
      for (const c of (G.chaos.critters || [])) {
        const isNew = !dex[c.d.id];
        if (isNew && !announced.has(c) && near(c, T.critterR) && guideCd <= 0) { announced.add(c); guideTo(c.x, c.z, 0.15, c.d.e + ' ' + c.d.n + ': not in your Dex yet (E to snap)'); }
      }
      // "📸 NEW" tags over anything you could add to the Dex
      for (const c of (G.chaos.critters || []).concat(G.chaos.rot || [])) {
        const want = !dex[c.d.id] && near(c, 40);
        if (want && !c.newTag) {
          const tag = W.label('📸 NEW', { size: 30, height: 0.36, bg: 'rgba(255,92,138,.95)', fg: '#ffffff', border: '#1f1a3d' });
          const bb = new THREE.Box3().setFromObject(c.obj);
          tag.position.y = Math.max(0.8, (bb.max.y - c.obj.position.y) / (c.obj.scale.y || 1)) + 0.45;
          c.obj.add(tag); c.newTag = tag; tagged.add(c);
        } else if (!want && c.newTag) { c.obj.remove(c.newTag); c.newTag = null; tagged.delete(c); }
      }
      for (const c of tagged) if (!c.obj.parent) tagged.delete(c);
    }
  }

  // ------------------------------------------------------------------ the tick
  A.tick = function (dt, paused) {
    if (!alive) return;
    if (aiming && (quiet() || !onFoot() || F.dying)) A.setAim(false);
    if (aiming) aimTick();
    if (webCd > 0) webCd -= dt;
    if (gunCd > 0) gunCd -= dt;
    if (gunDown && aiming && st().slot === 'gun' && gunCd <= 0) fireGun();   // hold the left button: keep firing
    strandTick(dt);
    syncGun(); gunHud();
    const wn = shell.querySelector('[data-pwn="web"]'); if (wn && wn.textContent !== '∞') wn.textContent = '∞';
    if (!shell.querySelector('[data-pw].sel')) markSlot();
    if (paused) return;
    cacheTick(dt);
    if (guideCd > 0) guideCd -= dt;
    scanT -= dt;
    if (scanT <= 0) { scanT = 0.4; scanTick(); }
  };
  A.test = { st, aimTick, shootWeb, wallAhead, guideTo, belt, fireGun, cacheTick, takeCache, get strand() { return strand; }, get guideCd() { return guideCd; }, set guideCd(v) { guideCd = v; }, get gunCd() { return gunCd; }, set gunCd(v) { gunCd = v; }, get gunDown() { return gunDown; }, announced };
  A.destroy = function () {
    alive = false;
    dropStrand();
    for (const c of caches.slice()) dropCache(c);
    F.handOverride = null; W.onWheel = null;
    for (const c of tagged) if (c.newTag) { c.obj.remove(c.newTag); c.newTag = null; }
    W.aiming = false; W.aimPoint = null; W.tether = null; W.onTetherEnd = null;
    shell.classList.remove('cft-aiming'); sight.hidden = true;
  };
  markSlot();
  return A;
}

window.CFTAim = { attach };
})();

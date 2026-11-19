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
  const SLOTS = ['water', 'volt', 'foam', 'web'];
  const NAMES = { water: '💧 Water', volt: '🌩️ Lightning', foam: '🧯 Extinguisher', web: '🕸️ Web' };
  const A = {};
  let alive = true, aiming = false, foamDown = false, webCd = 0, strand = null, scanT = 0, guideCd = 0, aimHit = null;
  const announced = new WeakSet(), tagged = new Set();
  const quiet = () => G.rt.busy || U.isOpen() || G.state() !== 'play';
  const onFoot = () => W.ride().mode === 'foot';
  const word = (t, tone, sub) => { if (G.hero) G.hero.word(t, tone, sub); };
  function st() {
    const s = save();
    if (!s.aim || typeof s.aim !== 'object') s.aim = {};
    if (!SLOTS.includes(s.aim.slot)) s.aim.slot = 'water';
    if (!s.aim.tips || typeof s.aim.tips !== 'object') s.aim.tips = {};
    return s.aim;
  }
  st();
  const tip = (k, text) => { const a = st(); if (a.tips[k]) return; a.tips[k] = 1; U.toast(text); G.dirty(); };
  const shell = U.canvas.parentElement;
  const sight = shell.querySelector('[data-sight]'), sightLbl = shell.querySelector('[data-sightlbl]');

  // ------------------------------------------------------------------ slots + the sight
  A.on = () => aiming;
  A.slot = () => st().slot;
  function markSlot() { const k = st().slot; for (const b of shell.querySelectorAll('[data-pw]')) b.classList.toggle('sel', b.dataset.pw === k); }
  A.select = function (k) {
    if (!SLOTS.includes(k)) return;
    const a = st();
    if (a.slot !== k && foamDown) A.fire(false);
    a.slot = k; markSlot(); G.dirty();
    U.feed(NAMES[k].split(' ')[0], NAMES[k].slice(NAMES[k].indexOf(' ') + 1) + ' ready: hold the right mouse button to aim, left click to use it');
    tip('slots', '🎯 ' + NAMES[k] + ' chosen. Hold the RIGHT mouse button to aim, then LEFT click to use it. Let go of the right button to bonk again.');
  };
  A.setAim = function (on) {
    on = !!on && alive && !quiet() && onFoot() && !F.dying;
    if (on === aiming) return;
    aiming = on; W.aiming = on;
    if (!on) { if (foamDown) A.fire(false); W.aimPoint = null; aimHit = null; }
    sight.hidden = !on; shell.classList.toggle('cft-aiming', on);
    if (on) { aimTick(); tip('aim', '🎯 Aiming! Left click = ' + NAMES[st().slot] + ' (choose with 1-4: water, lightning, extinguisher, web). Let go of the right button to bonk again.'); }
  };
  A.fire = function (down) {
    if (!down) { if (foamDown) { foamDown = false; if (G.camp) G.camp.power('foam', false); } return false; }
    if (!aiming) return false;
    aimTick();
    return use(st().slot);
  };
  A.tap = function (k, down) {   // touch: the hotbar button chooses AND uses it
    if (!down) { if (k === 'foam') A.fire(false); return false; }
    if (st().slot !== k) { st().slot = k; markSlot(); G.dirty(); }
    return use(k);
  };
  function use(k) {
    if (k === 'web') return shootWeb();
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

  // ------------------------------------------------------------------ the web
  const strandMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false });
  const strandGeo = new THREE.BoxGeometry(1, 1, 1);
  function handPos() {
    const p = P(), f = W.player.face, rx = Math.cos(f), rz = -Math.sin(f), fx = -Math.sin(f), fz = -Math.cos(f);
    return { x: p.x + rx * 0.32 + fx * 0.35, y: p.y + (W.tether ? 2.0 : 1.45), z: p.z + rz * 0.32 + fz * 0.35 };
  }
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
          tip('web', '🕸️ Stuck! The web pulls you to the wall: you cling on (push forward to climb), or flip onto the roof if it caught near the top. Space lets go.');
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
    strandTick(dt);
    const wn = shell.querySelector('[data-pwn="web"]'); if (wn && wn.textContent !== '∞') wn.textContent = '∞';
    if (!shell.querySelector('[data-pw].sel')) markSlot();
    if (paused) return;
    if (guideCd > 0) guideCd -= dt;
    scanT -= dt;
    if (scanT <= 0) { scanT = 0.4; scanTick(); }
  };
  A.test = { st, aimTick, shootWeb, wallAhead, guideTo, get strand() { return strand; }, get guideCd() { return guideCd; }, set guideCd(v) { guideCd = v; }, announced };
  A.destroy = function () {
    alive = false;
    dropStrand();
    for (const c of tagged) if (c.newTag) { c.obj.remove(c.newTag); c.newTag = null; }
    W.aiming = false; W.aimPoint = null; W.tether = null; W.onTetherEnd = null;
    shell.classList.remove('cft-aiming'); sight.hidden = true;
  };
  markSlot();
  return A;
}

window.CFTAim = { attach };
})();

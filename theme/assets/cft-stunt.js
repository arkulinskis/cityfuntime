/* City Fun Time: the stunt update (2026-11-19). The user: "Add more things for doing car tricks. They appear as you get in
   the car. Get some air time, have some fun doing flips and jumping through rings of fire."
   - STUNT COURSES pop up out of the road the moment you get in any car (your own, a moped, or a borrowed one) and shrink
     away when you get out. About 7 at a time between 45 and 260 m, refreshed as you drive. Kinds (D.STUNT.KINDS):
     kicker (small ramp), ramp (+ a ring of fire at the top of the jump), MEGA ramp (three rings along the arc) and fire
     alley (three rings of fire standing on the road). Each ramp has blue boost arrows before it (so you arrive at the
     speed it was built for: the rings hang where that speed takes you) and a bullseye pad where you should land.
   - IN THE AIR (physics in cft-world.js carVertical / carAirTick, W.ramps): W / S flip, A / D spin, Space barrel-rolls;
     Space on the ground hops. Let go and the car levels itself. Land on four wheels = the stunt counts; land on the
     roof = WIPEOUT (cartoon tumble, no damage). Landing after an odd half-spin = FAKIE (you roll on backwards).
   - SCORING: air time, flips, 180s, rolls, rings, bullseye, fakie, rooftop landings; more kinds of trick in one jump =
     a bigger multiplier, and launching again within D.TUNE.stunt.streakT seconds keeps a streak (x1.25 ... x2). Points ->
     coins + XP + mayhem (cft-chaos C.add). Every trick is shouted the moment it completes (W.onCarTrick).

   const St = CFTStunt.attach(G, api)   by cft-game.js after G.aim (G.stunt = St). api: {bump, bumpTo}
   St.tick(dt, paused) · St.markers(out) (minimap) · St.summary() (phone app Stunts) · St.spawn(kind, x, z, ux, uz) (tests)
   St.courses · St.destroy()
   World: W.ramps, W.rampAt, W.carLaunch, W.carAir(), W.onCarAir / W.onCarTrick / W.onCarLand / W.onCarSettle, player.boostT.
   Data: D.STUNT + knobs D.TUNE.stunt. State: save.stunt {best: {pts, name}, bestAir, tips}. Counters: stunts, flips, spins,
   rolls, firerings, megarings, bullseyes, fakies, wipeouts, carhops. Tests: tools/live/stunttest.js (game_test.py --stunt). */
(function () {
'use strict';

function attach(G, api) {
  const D = G.D, W = G.W, U = G.ui, THREE = W.THREE, T = D.TUNE.stunt, S = D.STUNT;
  const LOW = !W.renderer.shadowMap.enabled;
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const P = () => W.player.pos;
  const St = { courses: [] };
  let alive = true, inCar = false, refreshT = 0, t = 0, streak = 0, streakT = 0, jump = null, fireT = 0, smokeT = 0, fxT = 0;
  const prev = { x: 0, y: 0, z: 0, ok: false };
  const quiet = () => G.rt.busy || U.isOpen() || G.state() !== 'play';
  const word = (txt, tone, sub, big) => { if (G.hero) G.hero.word(txt, tone, sub, big); };
  function st() {
    const s = G.save;
    if (!s.stunt || typeof s.stunt !== 'object') s.stunt = {};
    if (!s.stunt.best || typeof s.stunt.best !== 'object') s.stunt.best = { pts: 0, name: '' };
    if (!s.stunt.tips || typeof s.stunt.tips !== 'object') s.stunt.tips = {};
    if (typeof s.stunt.bestAir !== 'number') s.stunt.bestAir = 0;
    return s.stunt;
  }
  st();
  const tip = (k, text) => { const a = st(); if (a.tips[k]) return; a.tips[k] = 1; U.toast(text); G.dirty(); };
  const counter = k => G.save.counters[k] || 0;

  // ------------------------------------------------------------------ looks (shared textures and materials)
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const tx = new THREE.CanvasTexture(c);
    tx.anisotropy = 4;
    return tx;
  }
  const INK = '#1f1a3d', GOLD = '#ffc21f', PINK = '#ff5c8a';
  const deckTex = canvasTex(128, 256, (g, w, h) => { // up the ramp: gold with ink chevrons and pink edges
    g.fillStyle = GOLD; g.fillRect(0, 0, w, h);
    g.fillStyle = INK;
    for (let y = 18; y < h; y += 64) { g.beginPath(); g.moveTo(16, y + 34); g.lineTo(w / 2, y); g.lineTo(w - 16, y + 34); g.lineTo(w - 16, y + 50); g.lineTo(w / 2, y + 16); g.lineTo(16, y + 50); g.closePath(); g.fill(); }
    g.fillStyle = PINK; g.fillRect(0, 0, 10, h); g.fillRect(w - 10, 0, 10, h);
  });
  const sideTex = canvasTex(128, 64, (g, w, h) => { // hazard stripes
    g.fillStyle = GOLD; g.fillRect(0, 0, w, h);
    g.fillStyle = INK;
    for (let x = -h; x < w + h; x += 32) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 16, h); g.lineTo(x + 16 + h, 0); g.lineTo(x + h, 0); g.closePath(); g.fill(); }
  });
  sideTex.wrapS = sideTex.wrapT = THREE.RepeatWrapping;
  const boostTex = canvasTex(128, 256, (g, w, h) => { // glowing blue arrows
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(20,40,90,.55)'; g.fillRect(6, 0, w - 12, h);
    g.fillStyle = '#5fe3ff';
    for (let y = 22; y < h; y += 78) { g.beginPath(); g.moveTo(14, y + 46); g.lineTo(w / 2, y); g.lineTo(w - 14, y + 46); g.lineTo(w - 14, y + 64); g.lineTo(w / 2, y + 20); g.lineTo(14, y + 64); g.closePath(); g.fill(); }
  });
  const eyeTex = canvasTex(256, 256, (g, w) => { // the bullseye
    const cx = w / 2;
    ['#e8453c', '#ffffff', '#e8453c', '#ffffff', '#e8453c'].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(cx, cx, cx - 4 - i * 24, 0, Math.PI * 2); g.fill(); });
    g.lineWidth = 6; g.strokeStyle = INK; g.beginPath(); g.arc(cx, cx, cx - 5, 0, Math.PI * 2); g.stroke();
  });
  const MAT = {
    deck: new THREE.MeshStandardMaterial({ map: deckTex, roughness: 0.6 }),
    side: new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.7 }),
    boost: new THREE.MeshBasicMaterial({ map: boostTex, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    eye: new THREE.MeshBasicMaterial({ map: eyeTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    fire: new THREE.MeshBasicMaterial({ color: 0xff6a00, toneMapped: false }),
    core: new THREE.MeshBasicMaterial({ color: 0xffd23f, toneMapped: false }),
    glow: new THREE.MeshBasicMaterial({ color: 0xff9a1f, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    post: new THREE.MeshStandardMaterial({ color: 0x3a3358, roughness: 0.5, metalness: 0.4 }),
  };
  const GEO = { pad: new THREE.PlaneGeometry(1, 1), eye: new THREE.CircleGeometry(1, 40), post: new THREE.CylinderGeometry(0.12, 0.14, 1, 8) };
  const ringGeos = new Map();
  function ringGeo(R) {
    const k = R.toFixed(2);
    if (!ringGeos.has(k)) ringGeos.set(k, { fire: new THREE.TorusGeometry(R, 0.3, 10, 40), core: new THREE.TorusGeometry(R, 0.14, 8, 40), glow: new THREE.TorusGeometry(R, 0.75, 8, 32) });
    return ringGeos.get(k);
  }

  // A wedge in world directions: starts at (x, z) on the ground, rises along (ux, uz) over L to H at the lip.
  function rampGeo(r) {
    const nx = -r.uz, nz = r.ux, hw = r.w / 2, dg = r.gE - r.gS;
    const P3 = (a, c, top) => [r.ux * a + nx * c, dg * a / r.L + (top ? r.H * a / r.L : 0) + 0.03, r.uz * a + nz * c];
    const A0 = P3(0, -hw, 1), A1 = P3(0, hw, 1), B0 = P3(r.L, -hw, 1), B1 = P3(r.L, hw, 1), b0 = P3(r.L, -hw, 0), b1 = P3(r.L, hw, 0);
    const deck = new THREE.BufferGeometry(), side = new THREE.BufferGeometry();
    deck.setAttribute('position', new THREE.Float32BufferAttribute([].concat(A0, B1, B0, A0, A1, B1), 3));
    deck.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1], 2));
    const lipU = r.w / 2.5, sl = r.L / 2.5;
    side.setAttribute('position', new THREE.Float32BufferAttribute([].concat(A0, B0, b0, A1, b1, B1, b0, B0, B1, b0, B1, b1), 3));
    side.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, sl, r.H / 2.5, sl, 0, 0, 0, sl, 0, sl, r.H / 2.5, 0, 0, 0, r.H / 2.5, lipU, r.H / 2.5, 0, 0, lipU, r.H / 2.5, lipU, 0], 2));
    for (const g of [deck, side]) g.computeVertexNormals();
    return { deck, side };
  }
  // fix the winding so both faces point outwards whatever the direction (double-sided is simpler and cheap here)
  MAT.deck.side = THREE.DoubleSide; MAT.side.side = THREE.DoubleSide;

  function fireRing(R) {
    const g = new THREE.Group(), spin = new THREE.Group(), geo = ringGeo(R);
    g.add(new THREE.Mesh(geo.glow, MAT.glow));
    spin.add(new THREE.Mesh(geo.fire, MAT.fire)); spin.add(new THREE.Mesh(geo.core, MAT.core));
    const n = LOW ? 8 : 13, flames = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, f = W.emojiSprite('🔥', 1.25);
      f.position.set(Math.cos(a) * (R + 0.15), Math.sin(a) * (R + 0.15), 0);
      f.userData.ph = Math.random() * 6.28; f.userData.s = 1.05 + Math.random() * 0.4;
      spin.add(f); flames.push(f);
    }
    g.add(spin);
    g.userData.spin = spin; g.userData.flames = flames;
    return g;
  }
  function flatPiece(mat, sx, sz, x, z, ux, uz, lift) {
    const holder = new THREE.Group(), m = new THREE.Mesh(GEO[mat === MAT.boost ? 'pad' : 'eye'], mat);
    m.rotation.x = -Math.PI / 2; m.scale.set(sx, sz, 1); m.renderOrder = 2;
    holder.add(m);
    holder.position.set(x, W.standAt(x, z) + (lift || 0.06), z);
    holder.rotation.y = Math.atan2(-ux, -uz);
    return holder;
  }

  // ------------------------------------------------------------------ placing a course
  const runSpeed = () => { const r = W.ride(); return (r.run || 25) * (W.speedMul || 1); };
  const gAir = () => W.GRAV * (W.gravMul || 1) * T.airG;
  const pickKind = () => { const ks = Object.keys(S.KINDS); let r = Math.random() * ks.reduce((a, k) => a + S.KINDS[k].weight, 0); for (const k of ks) { r -= S.KINDS[k].weight; if (r <= 0) return k; } return 'ramp'; };
  const clearAt = (x, z, w) => W.roofAt(x, z) == null && (!w || (W.roofAt(x - w, z) == null && W.roofAt(x + w, z) == null && W.roofAt(x, z - w) == null && W.roofAt(x, z + w) == null));
  // Plan a course at (x, z) facing (ux, uz): null if a building is in the way of the run-up, the jump or a ring.
  function plan(kind, x, z, ux, uz) {
    const K = S.KINDS[kind], nx = -uz, nz = ux;
    for (let a = -30; a <= (K.alley ? K.alley * K.gap + 6 : K.L); a += 3) if (!clearAt(x + ux * a, z + uz * a) || !clearAt(x + ux * a + nx * 2.4, z + uz * a + nz * 2.4) || !clearAt(x + ux * a - nx * 2.4, z + uz * a - nz * 2.4)) return null;
    const c = { kind, K, x, z, ux, uz, rings: [], objs: [], k: 0, born: t, out: false };
    c.pad = { x: x - ux * 15, z: z - uz * 15, L: 7, w: 4.6 };
    if (K.alley) {
      c.pad = { x: x - ux * 12, z: z - uz * 12, L: 7, w: 4.6 };
      for (let i = 0; i < K.alley; i++) { const rx = x + ux * (6 + i * K.gap), rz = z + uz * (6 + i * K.gap); c.rings.push({ x: rx, y: W.standAt(rx, rz) + K.R + 0.25, z: rz, R: K.R, stand: true }); }
      return c;
    }
    const gS = W.standAt(x, z), lx = x + ux * K.L, lz = z + uz * K.L, gE = W.standAt(lx, lz);
    if (Math.abs(gE - gS) > K.L * 0.25) return null;   // too steep a street
    const ref = runSpeed() * T.boostMul * 0.97, g = gAir(), tA = K.vy / g, lipY = gE + K.H;
    c.ramp = { x, z, ux, uz, L: K.L, H: K.H, w: K.w, gS, gE, vy: K.vy, ref, k: 0 };
    // fly the planned jump: no roof may sit in the way, and find where it lands
    let land = null;
    for (let tt = 0.05; tt < 8; tt += 0.05) {
      const d = ref * tt, px = lx + ux * d, pz = lz + uz * d, py = lipY + K.vy * tt - g * tt * tt / 2;
      const rf = W.roofAt(px, pz);
      if (rf != null && rf > py - 1.2) { if (py - rf > -1.2 && tt > tA) { land = { x: px, z: pz, roof: true }; break; } return null; }
      if (tt > tA && py <= W.standAt(px, pz)) { land = { x: px, z: pz }; break; }
    }
    if (!land) return null;
    for (const f of K.rings) {
      const tt = tA * f, d = ref * tt, rx = lx + ux * d, rz = lz + uz * d, ry = lipY + K.vy * tt - g * tt * tt / 2 + T.pivot;
      for (const s of [-1, 1]) { const rf = W.roofAt(rx + nx * K.R * s, rz + nz * K.R * s); if (rf != null && rf > ry - K.R) return null; }
      c.rings.push({ x: rx, y: ry, z: rz, R: K.R });
    }
    if (!land.roof) c.eye = { x: land.x, z: land.z, R: kind === 'mega' ? 4.5 : 3.6 };
    c.land = land;
    return c;
  }
  function build(c) {
    const add = (o, kind) => { o.userData.pop = kind; o.userData.base = o.scale.clone(); W.scene.add(o); c.objs.push(o); return o; };
    if (c.pad) c.pad.obj = add(flatPiece(MAT.boost, c.pad.w, c.pad.L, c.pad.x, c.pad.z, c.ux, c.uz), 'flat');
    if (c.ramp) {
      const geo = rampGeo(c.ramp), g = new THREE.Group();
      g.add(new THREE.Mesh(geo.deck, MAT.deck)); g.add(new THREE.Mesh(geo.side, MAT.side));
      g.children.forEach(m => { m.castShadow = !LOW; m.receiveShadow = !LOW; });
      g.position.set(c.ramp.x, c.ramp.gS, c.ramp.z);
      g.userData.geos = [geo.deck, geo.side];
      add(g, 'rise');
      if (c.kind === 'mega') { const lb = W.label('🌋 MEGA RAMP', { size: 34, height: 0.7, bg: 'rgba(232,69,60,.95)', fg: '#ffffff', border: INK }); lb.position.set(c.ramp.x + c.ux * c.ramp.L, c.ramp.gE + c.ramp.H + 2.2, c.ramp.z + c.uz * c.ramp.L); add(lb, 'grow'); }
      W.ramps.push(c.ramp);
    }
    for (const r of c.rings) {
      const o = fireRing(r.R);
      o.position.set(r.x, r.y, r.z); o.rotation.y = Math.atan2(c.ux, c.uz);
      if (r.stand) for (const s of [-1, 1]) { const p = new THREE.Mesh(GEO.post, MAT.post), h = r.R * 0.21 + 0.32; p.scale.y = h; p.position.set(s * r.R * 0.62, -r.R * 0.79 - h / 2 + 0.05, 0); o.add(p); }
      r.obj = add(o, 'grow');
    }
    if (c.eye) c.eye.obj = add(flatPiece(MAT.eye, c.eye.R * 2, c.eye.R * 2, c.eye.x, c.eye.z, c.ux, c.uz, 0.07), 'flat');
    St.courses.push(c);
    return c;
  }
  // Tests: put a course right here.
  St.spawn = function (kind, x, z, ux, uz) {
    const c = plan(kind, x, z, ux, uz);
    return c ? build(c) : null;
  };
  function findSpot(px, pz) {
    for (let tries = 0; tries < 14; tries++) {
      const sp = W.randomWalkSpot(px, pz, T.minD, T.maxD, (x, z, sg) => sg.car && sg.w >= 6 && !sg.br && sg.L >= 14);
      if (!sp) return null;
      let ux = -Math.sin(sp.yaw), uz = -Math.cos(sp.yaw);
      if ((sp.x - px) * ux + (sp.z - pz) * uz < 0) { ux = -ux; uz = -uz; }   // facing away from you: drive straight into it
      if (St.courses.some(c => !c.out && Math.hypot(c.x - sp.x, c.z - sp.z) < T.apart)) continue;
      const kind = !St.courses.some(c => !c.out) ? 'ramp' : pickKind();   // the first one always has a ring of fire
      const c = plan(kind, sp.x, sp.z, ux, uz) || (kind !== 'kicker' ? plan('kicker', sp.x, sp.z, ux, uz) : null);
      if (c) return c;
    }
    return null;
  }
  function fill(first) {
    const p = P(), want = LOW ? T.countLow : T.count;
    let added = 0;
    while (St.courses.filter(c => !c.out).length < want && added < (first ? want : 2)) {
      const c = findSpot(p.x, p.z);
      if (!c) break;
      build(c); c.born = t + (first ? added * 0.12 : 0); added++;
    }
    return added;
  }
  function retire(c) {
    if (c.out) return;
    c.out = true; c.k = Math.min(c.k, 1);
    if (c.ramp) { const i = W.ramps.indexOf(c.ramp); if (i >= 0) W.ramps.splice(i, 1); }
  }
  function drop(c) {
    for (const o of c.objs) {
      W.scene.remove(o);
      if (o.userData.geos) for (const g of o.userData.geos) g.dispose();
      o.traverse(m => { if (m.isSprite && m.material) m.material.dispose(); });
    }
    if (c.ramp) { const i = W.ramps.indexOf(c.ramp); if (i >= 0) W.ramps.splice(i, 1); }
    const i = St.courses.indexOf(c); if (i >= 0) St.courses.splice(i, 1);
  }
  const backOut = k => { const s = 1.70158; k -= 1; return k * k * ((s + 1) * k + s) + 1; };
  function animate(dt) {
    const p = P();
    for (const c of St.courses.slice()) {
      if (c.out) c.k -= dt / 0.35; else if (t >= c.born) c.k = Math.min(1, c.k + dt / 0.55);
      if (c.out && c.k <= 0) { drop(c); continue; }
      const k = c.out ? Math.max(0, c.k) : backOut(clamp(c.k, 0, 1)), vis = k > 0.001;
      if (c.ramp) c.ramp.k = c.out ? 0.5 : c.k;   // rampAt ignores a ramp that is still popping in or out
      for (const o of c.objs) {
        o.visible = vis;
        const b = o.userData.base, kk = Math.max(0.001, k);
        if (o.userData.pop === 'rise') o.scale.set(b.x, b.y * kk, b.z);
        else o.scale.set(b.x * kk, b.y * kk, b.z * kk);
      }
      if (!vis || Math.hypot(c.x - p.x, c.z - p.z) > 170) continue;
      for (const r of c.rings) { // the fire licks and turns
        const sp = r.obj.userData.spin; sp.rotation.z += dt * (r.hit ? 2.4 : 0.7);
        for (const f of r.obj.userData.flames) { const s = f.userData.s * (1 + 0.22 * Math.sin(t * 11 + f.userData.ph)); f.scale.set(s, s * 1.15, 1); }
      }
    }
  }

  // ------------------------------------------------------------------ getting in and out of a car
  function enter() {
    inCar = true; streak = 0; jump = null;
    if (quiet()) return;
    const n = fill(true);
    if (!n) return;
    word('STUNT MODE!', 'pink', n + ' stunt spots just popped up');
    let best = null, bd = Infinity; const p = P();
    for (const c of St.courses) { const d = Math.hypot(c.x - p.x, c.z - p.z); if (!c.out && d < bd) { bd = d; best = c; } }
    if (best && W.guide) W.guide(best.pad ? best.pad.x : best.x, best.pad ? best.pad.z : best.z, { hue: 0.08, max: 90 });
    tip('intro', '🏁 STUNT MODE! Ramps and rings of fire 🔥 pop up while you drive. Hit the blue arrows, launch, then in the air: W/S flip, A/D spin, Space barrel roll. Land on four wheels! (Space on the road = a hop.)');
  }
  function leave() {
    inCar = false; jump = null; streak = 0;
    for (const c of St.courses) retire(c);
  }

  // ------------------------------------------------------------------ the world tells us about the air
  W.onCarAir = function (a) {
    jump = { rings: 0, mega: 0, singed: 0, c: a.ramp ? St.courses.find(c => c.ramp === a.ramp) || null : null };
    if (a.why === 'hop') api.bump('carhops');
    if (a.why === 'ramp') {
      const p = P();
      W.pop(p.x, p.y + 3, p.z, pick(S.AIR), '#5fe3ff', 0.9);
      tip('air', '✈️ In the air! W / S = flip, A / D = spin, Space = barrel roll. Let go to level out, and land wheels down.');
    }
  };
  const TRICK = { front: 'FRONTFLIP', back: 'BACKFLIP', roll: 'BARREL ROLL' };
  W.onCarTrick = function (kind, n) {
    const p = P();
    const txt = kind === 'spin' ? n * 180 + '°!' : (n > 1 ? n + 'x ' : '') + TRICK[kind] + '!';
    W.pop(p.x, p.y + 3.2, p.z, txt, kind === 'spin' ? '#c9a7ff' : kind === 'roll' ? '#9fe3d0' : '#ffc21f', 0.9);
    if (G.sfx) G.sfx.tick();
  };
  W.onCarSettle = function () { const p = P(); W.pop(p.x, p.y + 2.4, p.z, 'beep boop. upright again', '#ffffff', 0.6); };
  const NUM = ['', '', 'DOUBLE ', 'TRIPLE ', 'QUAD '], mult = n => n > 1 ? NUM[n] || n + 'x ' : '';
  W.onCarLand = function (info) {
    const j = jump || { rings: 0, mega: 0, singed: 0, c: null };
    jump = null;
    const p = P();
    if (!info.clean) {
      api.bump('wipeouts'); streak = 0; streakT = 0;
      word('WIPEOUT!', 'red', pick(S.WIPEOUT));
      if (G.chaos) G.chaos.add('bounce');
      if (G.sfx) G.sfx.fail();
      tip('wipe', '💥 Land with the wheels down: let go of the keys before you hit the ground and the car levels itself.');
      if (j.rings) award(j.rings * S.PTS.ring, null, null, true);   // the rings still count
      return;
    }
    const names = [], kinds = new Set();
    let pts = Math.round(info.t * S.PTS.air);
    const fl = Math.abs(info.flips);
    if (fl) { names.push(mult(fl) + (info.flips < 0 ? 'FRONTFLIP' : 'BACKFLIP')); pts += fl * S.PTS.flip; kinds.add('flip'); api.bump('flips', fl); }
    if (info.halfSpins) { names.push(info.halfSpins * 180 + (info.fakie ? ' FAKIE' : '')); pts += info.halfSpins * S.PTS.half + (info.fakie ? S.PTS.fakie : 0); kinds.add('spin'); if (info.halfSpins >= 2) api.bump('spins', Math.floor(info.halfSpins / 2)); if (info.fakie) api.bump('fakies'); }
    if (info.rolls) { names.push(mult(info.rolls) + 'BARREL ROLL'); pts += info.rolls * S.PTS.roll; kinds.add('roll'); api.bump('rolls', info.rolls); }
    if (j.rings) { names.push(j.rings > 1 ? j.rings + ' RINGS OF FIRE' : 'THROUGH THE FIRE'); pts += j.rings * S.PTS.ring; kinds.add('fire'); }
    if (j.singed) pts += j.singed * S.PTS.singe;
    const eye = St.courses.find(c => c.eye && !c.out && Math.hypot(c.eye.x - info.x, c.eye.z - info.z) < c.eye.R);
    if (eye && info.t > 0.6) { names.push('BULLSEYE'); pts += S.PTS.eye; kinds.add('eye'); api.bump('bullseyes'); W.burst(eye.eye.x, W.standAt(eye.eye.x, eye.eye.z) + 0.3, eye.eye.z, '🎯', 6, { spread: 3, up: 1.2, size: 0.6 }); }
    if (info.onRoof) { names.push('ROOFTOP LANDING'); pts += S.PTS.roof; kinds.add('roof'); }
    if (!names.length) {
      if (info.t < T.minAir) return;   // a little hop: nothing to shout about
      names.push(info.h > 10 ? 'SKY HIGH' : 'BIG AIR'); pts += S.PTS.big;
    }
    if (j.c && j.c.kind === 'mega' && j.mega >= 3) api.bump('megarings');
    const kindMul = 1 + 0.25 * Math.max(0, kinds.size - 1);
    const strMul = 1 + 0.25 * Math.min(4, streak);
    pts = Math.round(pts * kindMul * strMul);
    streak++; streakT = T.streakT;
    api.bump('stunts');
    const s = st(), name = names.slice(0, 2).join(' + ') + (names.length > 2 ? ' + ' + (names.length - 2) + ' more' : '');
    if (pts > s.best.pts) s.best = { pts, name };
    if (info.t > s.bestAir) s.bestAir = Math.round(info.t * 10) / 10;
    const sub = info.t.toFixed(1) + ' s air · ' + Math.round(info.h) + ' m high · ' + pts.toLocaleString() + ' pts' + (strMul > 1 ? ' · streak x' + strMul : '');
    award(pts, name + '!', sub);
    if (pts >= 2500) { U.confetti(); if (G.sfx) G.sfx.level(); }
    else if (G.sfx) G.sfx.coin();
    W.pop(p.x, p.y + 3.6, p.z, names[0] + '!', '#ffc21f', pts >= 1500 ? 1.3 : 1);
  };
  function award(pts, title, sub, quietly) {
    const cash = Math.round(Math.min(T.cashCap, pts / T.ptsPerCoin) * (1 + G.level() * 0.05));
    if (cash > 0) G.addMoney(cash, 'car stunt');
    G.addXp(Math.round(pts / T.ptsPerXp), 'explore');
    if (G.chaos) G.chaos.add('stunt', Math.max(0.5, pts / 800));
    if (!quietly && title) word(title, pts >= 2500 ? 'violet' : pts >= 1000 ? 'pink' : 'gold', sub, pts >= 1500);
    G.dirty();
  }

  // ------------------------------------------------------------------ boost pads, rings of fire, the fire trail
  function touchTick(dt) {
    const pl = W.player, p = pl.pos, cy = p.y + T.pivot, air = W.carAir();
    for (const c of St.courses) {
      if (c.out || c.k < 0.9) continue;
      if (c.pad && !air) { // the blue arrows: a burst of speed
        const dx = p.x - c.pad.x, dz = p.z - c.pad.z, a = dx * c.ux + dz * c.uz, cc = -dx * c.uz + dz * c.ux;
        if (Math.abs(a) < c.pad.L / 2 && Math.abs(cc) < c.pad.w / 2 + 0.4) {
          if (!(pl.boostT > 0.2)) { W.pop(p.x, p.y + 2.6, p.z, 'BOOST!', '#5fe3ff', 0.8); if (G.sfx) G.sfx.slide(); W.burst(p.x, p.y + 0.4, p.z, '💨', 4, { spread: 2, up: 0.3, size: 0.6, life: 0.4 }); }
          pl.boostT = T.boostSecs;
          const r = W.ride(), want = (r.run || 25) * T.boostMul * (W.speedMul || 1) * 0.97;
          if (pl.speed >= 0 && pl.speed < want) pl.speed = want;
        }
      }
      if (!prev.ok) continue;
      for (const r of c.rings) { // crossing the ring's plane: through the middle, or singed on the edge
        const s0 = (prev.x - r.x) * c.ux + (prev.z - r.z) * c.uz, s1 = (p.x - r.x) * c.ux + (p.z - r.z) * c.uz;
        if ((s0 < 0) === (s1 < 0) || r.hitAt > t - 0.5) continue;
        const f = s0 / (s0 - s1), ix = prev.x + (p.x - prev.x) * f, iy = prev.y + (cy - prev.y) * f, iz = prev.z + (p.z - prev.z) * f;
        const rad = Math.hypot(ix - r.x, iy - r.y, iz - r.z);
        if (rad < r.R - 0.15) throughRing(c, r);
        else if (rad < r.R + 1.3) singe(r);
      }
    }
  }
  function throughRing(c, r) {
    r.hitAt = t; r.hit = true;
    api.bump('firerings'); fireT = 1.6;
    const p = P();
    W.burst(r.x, r.y, r.z, '🔥', 10, { spread: r.R * 1.2, up: 1.5, size: 0.9, life: 0.7 });
    W.pop(p.x, p.y + 3, p.z, pick(['THROUGH THE FIRE!', 'TOASTY!', 'ON FIRE!', 'HOT HOT HOT!']), '#ff7a1a', 1);
    if (W.shake) W.shake(0.25);
    if (G.chaos) G.chaos.add('firering');
    if (G.sfx) G.sfx.boing();
    if (jump) { jump.rings++; if (jump.c === c) jump.mega++; }
    else award(S.PTS.ringGround * (1 + 0.25 * Math.min(4, streak)), 'THROUGH THE FIRE!', 'Fire alley · ' + S.PTS.ringGround + ' pts');
    tip('ring', '🔥 Through the fire! Rings over the ramps hang where the boost arrows carry you: hit the arrows and don\'t steer off the ramp.');
  }
  function singe(r) {
    r.hitAt = t; smokeT = 1.4;
    const p = P();
    W.pop(p.x, p.y + 2.8, p.z, pick(['SINGED!', 'CRISPY!', 'smells like toast']), '#b0a9c8', 0.8);
    if (jump) jump.singed++;
  }
  function trailTick(dt) {
    fxT -= dt;
    if (fxT > 0) return;
    fxT = 0.07;
    const p = P();
    if (fireT > 0) W.burst(p.x, p.y + 0.9, p.z, Math.random() < 0.7 ? '🔥' : '✨', 1, { spread: 0.8, up: 0.6, size: 0.7, life: 0.45, grav: -1 });
    else if (smokeT > 0) W.burst(p.x, p.y + 0.9, p.z, '💨', 1, { spread: 0.6, up: 0.8, size: 0.6, life: 0.6, grav: -1 });
  }

  // ------------------------------------------------------------------ minimap + phone
  St.markers = function (out) {
    for (const c of St.courses) if (!c.out) out.push({ x: c.x, z: c.z, color: c.kind === 'mega' ? '#e8453c' : '#ff7a1a', r: c.kind === 'mega' ? 5.5 : 4.5, emoji: c.K.e, ring: '#1f1a3d' });
  };
  St.summary = function () {
    const s = st(), k = G.save.counters;
    return { best: s.best, bestAir: s.bestAir, inCar, near: St.courses.filter(c => !c.out).length,
      stats: [['🏁 Stunts landed', k.stunts || 0], ['🔥 Rings of fire', k.firerings || 0], ['🔄 Flips', k.flips || 0], ['💫 360s', k.spins || 0],
        ['🌀 Barrel rolls', k.rolls || 0], ['🎯 Bullseyes', k.bullseyes || 0], ['🙃 Fakies', k.fakies || 0], ['💥 Wipeouts', k.wipeouts || 0]] };
  };

  // ------------------------------------------------------------------ the tick
  St.tick = function (dt, paused) {
    if (!alive) return;
    t += dt;
    const now = W.ride().mode === 'drive';
    if (now && !inCar) enter();
    else if (!now && inCar) leave();
    animate(dt);
    if (paused) { prev.ok = false; return; }
    if (streakT > 0) { streakT -= dt; if (streakT <= 0 && !W.carAir()) streak = 0; }
    if (fireT > 0) fireT -= dt;
    if (smokeT > 0) smokeT -= dt;
    if (inCar) {
      touchTick(dt);
      trailTick(dt);
      refreshT -= dt;
      if (refreshT <= 0) {
        refreshT = 1.5;
        const p = P();
        for (const c of St.courses) if (!c.out && Math.hypot(c.x - p.x, c.z - p.z) > T.dropD) retire(c);
        if (!quiet()) { const had = St.courses.some(c => !c.out); fill(!had); }
      }
    }
    const p = P(); prev.x = p.x; prev.y = p.y + T.pivot; prev.z = p.z; prev.ok = inCar;
  };
  St.test = { plan, st, drop, get streak() { return streak; }, get jump() { return jump; }, enter, leave, touchTick };
  St.destroy = function () {
    alive = false;
    for (const c of St.courses.slice()) drop(c);
    W.ramps.length = 0;
    W.onCarAir = W.onCarTrick = W.onCarLand = W.onCarSettle = null;
    for (const m of Object.values(MAT)) { if (m.map) m.map.dispose(); m.dispose(); }
    for (const g of Object.values(GEO)) g.dispose();
    for (const r of ringGeos.values()) for (const g of Object.values(r)) g.dispose();
  };
  return St;
}

window.CFTStunt = { attach };
})();

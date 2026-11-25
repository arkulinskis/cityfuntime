/* City Fun Time: the chaos update (2026-11-18). The user: "Make it more unhinged, more colours, creatures, objects
   everywhere... weird, unhinged, cool, surprising, dank, meme worthy... 12 year old humour is on the table. Ranged weapons,
   ranged enemies, flying. Research what makes games fun and add that."

   What "fun" turned into here (game-feel research: Vlambeer's "Art of Screenshake", "Juice it or lose it", Dead Cells'
   hit-stop, Goat Simulator / Untitled Goose Game's toy-first chaos, Tony Hawk / Devil May Cry style combo ranks):
   - juice: hit-stop on kills and parries (G.rt.hitstop, read by cft-game.js frame), shake, bursts, big words, sounds
   - a MAYHEM meter: chain any chaos (bonks, smashes, stunts, pops, launches, photos) and climb D -> SSS; it cashes in when
     you stop (coins, XP, aura). Short-term goals every few seconds, the "one more" feeling.
   - AURA: a silly meme number. Up for cool things, down for getting pooped on by a seagull.
   - toys before rules: piñatas, giant beach balls, sewer launch manholes, whoopee cushions, wacky waving tube men
   - ranged weapons with real projectiles (arcs, splashes, bounces, a boomerang), and ranged / flying figments whose shots
     you can dodge, block, or PARRY straight back at them (skill + chance, like the melee wind-up)
   - flying: the Bean jetpack (hold Space in the air) and the Glide-brella, golden sky hoops to fly through
   - discovery + collection: animal neighbours and 12 "street brainrot" creatures to photograph for the Dex (E)
   - surprise: six new street events (low gravity, the T-pose glitch, cats and dogs, cheese meteors, SIX SEVEN, balloons),
     blimps with silly banners, hot-air balloons, a sky whale, meme chatter from passers-by, a fart button (B)

   const C = CFTChaos.attach(G, api)    by cft-game.js after G.hero (G.chaos = C). api: {bump, bumpTo, spawnPickup, setBusy}
   C.tick(dt, paused) · C.fire(weapon) (cft-fun.js F.attack, weapon.ranged === 'proj') · C.meleeHit(p, f, w) · C.rangedAI(m, d, dt)
   C.interaction(p) · C.markers(list) · C.speedMul() · C.fart() · C.startEvent(id, ev) / C.updateEvent(ev, dt) / C.endEvent(ev)
   C.summary() (phone app Chaos) · C.add(kind) (mayhem) · C.aura(n) · C.destroy()
   Data: D.CHAOS + knobs D.TUNE.chaos (cft-content.js). State: save.chaos {aura, dex{id: n}, best, bestRank}; counters (shots,
   farts, airtime, hoops, pinatas, launches, reflects, cushions, aura, dex, rankA, rankS, rankSS, rankSSS, smash_<decor kind>).
   Tests: tools/live/chaostest.js (game_test.py --chaos); pictures --chaosshots. */
(function () {
'use strict';

function attach(G, api) {
  const D = G.D, W = G.W, U = G.ui, THREE = W.THREE, CH = D.CHAOS, T = D.TUNE.chaos, F = G.fun;
  const LOW = !W.renderer.shadowMap.enabled;
  const save = () => G.save;
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const P = () => W.player.pos;
  const fmt$ = G.fmt$;
  const GEO = W.GEO, SPH = GEO.SPHERE, CYL = GEO.CYL, CONE = GEO.CONE, TOR = GEO.TORUS;
  const C = { shots: [], critters: [], rot: [], pinatas: [], balls: [], holes: [], cushions: [], tubes: [], sky: [], hoops: [] };
  let alive = true, fartCd = 0, chatT = 6, rotT = 20, toyT = 0, skyT = 0, critT = 0, airAcc = 0, fuel = 1, flying = null, hideT = 0, hideAt = null, lagT = 0, wasDying = false, swoopT = 0;
  const calm = () => !!(window.CFT_TEST && window.CFT_TEST.calm);
  const quiet = () => G.rt.busy || U.isOpen() || G.state() !== 'play';
  const onStory = () => G.storyOn ? G.storyOn() : !!(save().m['c1-couch'] && save().m['c1-couch'].s === 'done');  // also true in the campaign's opening chaos
  const onFoot = () => W.ride().mode !== 'drive';
  const later = (ms, fn) => setTimeout(() => { if (alive) fn(); }, ms);
  const hype = () => G.hero;
  const word = (t, tone, sub, big) => { if (G.hero) G.hero.word(t, tone, sub, big); };
  function st() {
    const s = save();
    if (!s.chaos || typeof s.chaos !== 'object') s.chaos = {};
    const c = s.chaos;
    if (typeof c.aura !== 'number') c.aura = 0;
    if (!c.dex || typeof c.dex !== 'object') c.dex = {};
    if (typeof c.best !== 'number') c.best = 0;
    return c;
  }
  const build = fn => { const m = new W.Merge(); fn(m); return m.mesh(); };
  const eye = (m, x, y, z, r) => { m.add(SPH, 0xffffff, x, y, z, 0, 0, 0, r, r, r); m.add(SPH, 0x111111, x, y, z - r * 0.36, 0, 0, 0, r * 0.5, r * 0.5, r * 0.4); };
  const gy = (x, z) => W.standAt(x, z);
  const free = (x, z) => !W.heightAt(x, z) && !W.heightAt(x + 1, z) && !W.heightAt(x - 1, z) && !W.heightAt(x, z + 1) && !W.heightAt(x, z - 1);
  function drop(o) { if (!o) return; if (o.isSprite) { W.scene.remove(o); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } } else W.removeObj(o); }
  const monY = m => m.obj.position.y + (m.obj.userData.h || 1) * (m.obj.userData.size || 1) * 0.55;

  // ------------------------------------------------------------------ sounds (own little synth: farts, pews, splashes)
  let actx = null;
  function ctx() { if (!save().settings.sound) return null; try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); return actx; } catch (e) { return null; } }
  function noise(len, vol, freq, q) {
    const a = ctx(); if (!a) return;
    try {
      const n = Math.floor(a.sampleRate * len), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
      src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq || 1200; f.Q.value = q || 0.8; g.gain.value = vol || 0.12;
      src.connect(f); f.connect(g); g.connect(a.destination); src.start();
    } catch (e) { /* no audio */ }
  }
  function chirp(f0, f1, len, type, vol) {
    const a = ctx(); if (!a) return;
    try {
      const t = a.currentTime, o = a.createOscillator(), g = a.createGain();
      o.type = type || 'square'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + len);
      g.gain.setValueAtTime(vol || 0.06, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + len + 0.02);
    } catch (e) { /* no audio */ }
  }
  // a fart: a low buzzing sawtooth, wobbled by a fast LFO, through a low-pass filter. Science.
  function fartSound(len, vol) {
    const a = ctx(); if (!a) return;
    try {
      len = len || rnd(0.3, 0.7);
      const t = a.currentTime, o = a.createOscillator(), lfo = a.createOscillator(), lg = a.createGain(), f = a.createBiquadFilter(), g = a.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(rnd(85, 120), t); o.frequency.linearRampToValueAtTime(rnd(55, 75), t + len);
      lfo.frequency.value = rnd(18, 32); lg.gain.value = rnd(18, 30); lfo.connect(lg); lg.connect(o.frequency);
      f.type = 'lowpass'; f.frequency.value = 420; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.22, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(f); f.connect(g); g.connect(a.destination); o.start(t); lfo.start(t); o.stop(t + len + 0.05); lfo.stop(t + len + 0.05);
    } catch (e) { /* no audio */ }
  }
  const SFX = {
    pew: () => chirp(900, 300, 0.12, 'square', 0.05), thump: () => chirp(180, 60, 0.18, 'sine', 0.14), splash: () => noise(0.35, 0.16, 900, 0.6),
    pop: () => noise(0.08, 0.2, 2400, 1.5), squeak: () => chirp(1400, 2200, 0.12, 'square', 0.05), boom: () => { noise(0.6, 0.25, 220, 0.5); chirp(120, 40, 0.5, 'sine', 0.2); },
    whoosh: () => noise(0.4, 0.08, 600, 0.4), honk: () => chirp(420, 380, 0.25, 'sawtooth', 0.06),
  };
  C.sfx = SFX;

  // ------------------------------------------------------------------ the HUD: mayhem meter, jet fuel, a fart button, splats
  const shell = U.canvas.parentElement, tc = shell.querySelector('.cft-tc');
  const meter = document.createElement('div');
  meter.className = 'cft-mayhem'; meter.hidden = true;
  meter.innerHTML = '<b data-mrank>D</b><div><span data-mname>Dull</span><div class="cft-bar mh"><i data-mbar></i></div></div><em data-mpts>0</em>';
  if (tc) tc.appendChild(meter);
  const fuelEl = document.createElement('div');
  fuelEl.className = 'cft-fuel'; fuelEl.hidden = true; fuelEl.title = 'Jetpack fuel: hold Space in the air';
  fuelEl.innerHTML = '<span>🫘</span><div class="cft-bar fu"><i data-fbar></i></div>';
  if (tc) tc.appendChild(fuelEl);
  const btns = shell.querySelector('.cft-btns');
  const fartBtn = document.createElement('button');
  fartBtn.type = 'button'; fartBtn.dataset.fart = ''; fartBtn.title = 'Toot (B)'; fartBtn.setAttribute('aria-label', 'Toot'); fartBtn.textContent = '💨';
  if (btns) btns.insertBefore(fartBtn, btns.querySelector('[data-ride]'));
  fartBtn.addEventListener('click', () => C.fart());
  const fxEl = document.createElement('div');
  fxEl.className = 'cft-chaosfx'; fxEl.innerHTML = '<div class="cft-splat" data-splat></div><div class="cft-lag" data-lag hidden><i></i><b>Buffering...</b></div>';
  shell.appendChild(fxEl);
  const splatEl = fxEl.querySelector('[data-splat]'), lagEl = fxEl.querySelector('[data-lag]');
  function splat(kind) { splatEl.className = 'cft-splat ' + kind; void splatEl.offsetWidth; splatEl.classList.add('go'); }

  // ------------------------------------------------------------------ aura (the meme number)
  C.aura = function (n, quietly) {
    const c = st(); n = Math.round(n);
    c.aura += n;
    if (n > 0) api.bump('aura', n);
    if (quietly || !n) return;
    const p = P(), txt = (n > 0 ? '+' : '−') + Math.abs(n) + ' AURA' + (n < 0 ? ' 💀' : '');
    W.pop(p.x + rnd(-0.6, 0.6), p.y + 3.1, p.z, txt, n > 0 ? '#c9a7ff' : '#ff5c5c', Math.abs(n) >= 500 ? 1.2 : 0.8);
    if (Math.abs(n) >= 500) word(txt, n > 0 ? 'violet' : 'red');
  };

  // ------------------------------------------------------------------ the mayhem meter
  const mh = { pts: 0, chain: 0, t: 0, rank: 0 };
  C.add = function (kind, mult) {
    if (!onStory() || G.state() !== 'play') return;
    const base = (CH.POINTS[kind] || 10) * (mult || 1);
    mh.chain++; mh.t = T.comboT;
    mh.pts += Math.round(base * (1 + Math.min(4, mh.chain * 0.1)));
    let r = 0;
    for (let i = 0; i < CH.RANKS.length; i++) if (mh.pts >= CH.RANKS[i][0]) r = i;
    if (r > mh.rank) { mh.rank = r; rankUp(r); }
    drawMeter(true);
  };
  function rankUp(r) {
    const R = CH.RANKS[r], L = R[1];
    word(L + '!', r >= 5 ? 'violet' : r >= 4 ? 'pink' : 'gold', R[2], r >= 4);
    if (L === 'A') api.bump('rankA');
    if (L === 'S') { api.bump('rankS'); C.aura(CH.AURA.rankS); U.confetti(); }
    if (L === 'SS') { api.bump('rankSS'); U.confetti(); }
    if (L === 'SSS') { api.bump('rankSSS'); C.aura(CH.AURA.rankSSS); U.confetti(); G.log('Hit mayhem rank SSS', '🤯'); }
    if (r >= 4) G.sfx.level(); else G.sfx.tick();
    meter.classList.remove('up'); void meter.offsetWidth; meter.classList.add('up');
  }
  function bank() {
    const pts = mh.pts, R = CH.RANKS[mh.rank];
    mh.pts = 0; mh.chain = 0; mh.rank = 0; mh.t = 0;
    drawMeter(false);
    if (pts < 60) return;
    const c = st();
    if (pts > c.best) { c.best = pts; c.bestRank = R[1]; }
    const cash = Math.round(Math.min(500, pts / 25) * (1 + G.level() * 0.05));
    G.addMoney(cash, 'mayhem ' + R[1] + ' (' + pts.toLocaleString() + ' pts)');
    G.addXp(Math.round(pts / 14), 'explore');
    C.aura(Math.round(pts / 25), pts < 900);
    G.dirty();
  }
  C.bank = bank;
  C.mayhem = () => ({ pts: mh.pts, rank: CH.RANKS[mh.rank][1], chain: mh.chain, t: mh.t });
  function drawMeter(show) {
    if (!mh.pts) { meter.hidden = true; return; }
    meter.hidden = false;
    const R = CH.RANKS[mh.rank], next = CH.RANKS[mh.rank + 1];
    meter.querySelector('[data-mrank]').textContent = R[1];
    meter.querySelector('[data-mname]').textContent = R[2];
    meter.querySelector('[data-mpts]').textContent = mh.pts.toLocaleString() + (mh.chain > 1 ? ' ×' + mh.chain : '');
    meter.querySelector('[data-mbar]').style.width = Math.round(Math.max(0, mh.t / T.comboT) * 100) + '%';
    meter.dataset.r = mh.rank;
    if (show && next) meter.title = (next[0] - mh.pts) + ' more for ' + next[1];
  }

  // ------------------------------------------------------------------ hearing about the rest of the game (hype events)
  if (G.hero) {
    const orig = G.hero.event;
    G.hero.event = function (ev, o) {
      orig(ev, o);
      o = o || {};
      if (!alive) return;
      switch (ev) {
        case 'kill': { const m = o.m || {}, big = m.champ || m.guard || (m.def && (m.def.boss || m.def.rare)) || m.outpost; C.add(big ? 'bigKill' : 'kill'); C.aura(big ? CH.AURA.bigKill : CH.AURA.kill, !big); hitstop(big ? T.hitstop.big : T.hitstop.kill); break; }
        case 'parry': C.add('parry'); C.aura(CH.AURA.parry); hitstop(T.hitstop.parry); break;
        case 'dodge': C.add('dodge'); break;
        case 'block': C.add('block'); break;
        case 'combo': C.add('combo'); break;
        case 'smash': C.add(o.wreck ? 'wreck' : 'smash'); break;
        case 'mission': C.aura(CH.AURA.mission); break;
        case 'level': C.aura(CH.AURA.level); break;
        default: break;
      }
    };
  }
  function hitstop(s) { if (s > 0) G.rt.hitstop = Math.max(G.rt.hitstop || 0, s); }
  { // smashing a decor piece: its own counter (smash_gnome...), and a porta-potty lets out what was inside
    const prev = W.onSmash;
    W.onSmash = function (e) {
      if (prev) prev(e);
      if (!e || !e.k) return;
      if (CH_DECOR.has(e.k)) api.bump('smash_' + e.k);
      if (e.k === 'potty') stinkBomb(e.x, e.z, false);
      if (e.k === 'balloons') { SFX.pop(); for (let i = 0; i < 2; i++) api.spawnPickup('coin', e.x + rnd(-1.5, 1.5), e.z + rnd(-1.5, 1.5)); }
      if (e.k === 'gnome' && Math.random() < 0.2) later(400, () => { const p = P(); W.pop(e.x, gy(e.x, e.z) + 2, e.z, pick(['The gnomes will remember this.', 'A gnome has fallen.', 'Gnome-icide!']), '#ff8fb8', 0.7); if (Math.hypot(e.x - p.x, e.z - p.z) < 30) C.aura(-5); });
    };
  }
  const CH_DECOR = new Set(['planter', 'cafe', 'cones', 'gnome', 'flamingo', 'vend', 'balloons', 'couch', 'potty', 'cart', 'mushroom', 'duckbig', 'statue', 'donut', 'crystal', 'sunflower', 'picnic']);

  // ------------------------------------------------------------------ projectiles (yours and theirs)
  const SHIRT = [0xe8453c, 0x2b6cb0, 0x35e06a, 0xffc21f, 0x9b5cf6, 0xff5c8a];
  function projMesh(kind) {
    switch (kind) {
      case 'spit': return build(m => { m.add(SPH, 0x7dff8a, 0, 0, 0, 0, 0, 0, 0.32, 0.32, 0.32); m.add(SPH, 0xc8ffd0, 0.05, 0.06, -0.05, 0, 0, 0, 0.12, 0.12, 0.12); });
      case 'balloon': return build(m => { m.add(SPH, 0x38bdf8, 0, 0, 0, 0, 0, 0, 0.55, 0.62, 0.55); m.add(SPH, 0xbfe8ff, 0.1, 0.12, -0.1, 0, 0, 0, 0.16, 0.16, 0.16); m.add(CONE, 0x38bdf8, 0, -0.33, 0, Math.PI, 0, 0, 0.12, 0.1, 0.12); });
      case 'confetti': { const c = pick(SHIRT); return build(m => { m.box(0.22, 0.04, 0.16, c); m.box(0.16, 0.04, 0.22, pick(SHIRT), 0, 0.03, 0, 0, 0.8); }); }
      case 'boomerang': { const o = W.propMesh('boomer'); o.scale.setScalar(1.8); const g = new THREE.Group(); o.position.set(-0.2, 0, 0.9); g.add(o); return g; }
      case 'whoopee': return build(m => { m.add(SPH, 0xff8fb8, 0, 0, 0, 0, 0, 0, 0.6, 0.22, 0.6); m.add(CYL, 0xe8453c, 0, 0, -0.34, Math.PI / 2, 0, 0, 0.1, 0.16, 0.1); });
      case 'tshirt': { const c = pick(SHIRT); return build(m => { m.box(0.6, 0.06, 0.55, c); m.box(0.24, 0.061, 0.2, c, -0.36, 0, -0.16); m.box(0.24, 0.061, 0.2, c, 0.36, 0, -0.16); m.box(0.2, 0.065, 0.08, 0xffffff, 0, 0, -0.26); }); }
      case 'chicken': { const o = W.propMesh('chicken'); o.scale.setScalar(1.6); return o; }
      case 'mustard': return build(m => { m.add(SPH, 0xffc21f, 0, 0, 0, 0, 0, 0, 0.22, 0.22, 0.7); m.add(SPH, 0xffe066, 0, 0.04, -0.15, 0, 0, 0, 0.12, 0.12, 0.3); });
      case 'potato': return build(m => { m.add(SPH, 0xc8a165, 0, 0, 0, 0, 0, 0, 0.5, 0.42, 0.62); m.add(SPH, 0x8a6a3c, 0.15, 0.1, -0.2, 0, 0, 0, 0.08, 0.08, 0.08); m.add(SPH, 0x8a6a3c, -0.12, -0.05, 0.15, 0, 0, 0, 0.07, 0.07, 0.07); });
      case 'gnome': { const o = W.decorMesh('gnome', pick([0xe8453c, 0x2b6cb0, 0x9b5cf6])); o.scale.setScalar(0.75); const g = new THREE.Group(); o.position.y = -0.5; g.add(o); return g; }
      case 'tomato': return build(m => { m.add(SPH, 0xe8453c, 0, 0, 0, 0, 0, 0, 0.5, 0.46, 0.5); m.add(CONE, 0x35a05a, 0, 0.24, 0, 0, 0, 0, 0.24, 0.12, 0.24); });
      case 'poop': { const s = W.emojiSprite('💩', 0.75); return s; }
      case 'lag': return build(m => { m.add(TOR, 0xb48cff, 0, 0, 0, Math.PI / 2, 0, 0, 0.32, 0.32, 0.18); m.add(SPH, 0xffffff, 0, 0, 0, 0, 0, 0, 0.22, 0.22, 0.22); });
      default: return W.emojiSprite('⚪', 0.5);
    }
  }
  function spawnShot(o) {
    const obj = projMesh(o.kind);
    obj.position.set(o.x, o.y, o.z);
    if (obj.isMesh || obj.isGroup) obj.traverse(c => { if (c.isMesh) c.castShadow = false; });
    W.scene.add(obj);
    const s = Object.assign({ obj, t: 0, life: 6, g: 6, bounce: 0, pierce: 0, hit: new Set(), spin: 0 }, o);
    C.shots.push(s);
    return s;
  }
  // Where a shot goes: the camera's direction with the mouse captured, else where you face; then nudged onto the best
  // target within ~37° and range (figments, piñatas, balloons). Lobbed shots get the arc that lands on the target.
  // Height (2026-11-23): the sight's point, else how far up you look (W.aimEl); looking up skips targets far below.
  function aimShot(w, speed, lob, g) {
    const p = P(), from = { x: p.x, y: p.y + 1.45, z: p.z }, el = W.aimEl ? W.aimEl() : 0;
    let fx, fz;
    if (W.isLocked && W.isLocked()) { fx = -Math.sin(W.cam.yaw); fz = -Math.cos(W.cam.yaw); } else { fx = -Math.sin(W.player.face); fz = -Math.cos(W.player.face); }
    let best = null, bs = -9;
    const consider = (x, y, z, bonus) => { const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz); if (d < 0.6 || d > w.reach + 3) return; const c = (dx * fx + dz * fz) / d; if (c < 0.8) return; if (el > 0.2 && Math.atan2(y - from.y, d) < el - 0.5) return; const sc = c * 2 - d / (w.reach + 3) + (bonus || 0); if (sc > bs) { bs = sc; best = { x, y, z, d }; } };
    for (const m of F.monsters) if (!m.dead) consider(m.x, monY(m), m.z, m.def.fly ? 0.1 : 0.2);
    for (const q of C.pinatas) consider(q.x, q.y, q.z, 0);
    if (C.ev && C.ev.balloons) for (const b of C.ev.balloons) if (!b.dead) consider(b.x, b.y, b.z, -0.1);
    let tx, ty, tz, d;
    if (W.aiming && W.aimPoint) { // the right-mouse sight (cft-aim.js): exactly where the crosshair is
      const ap = W.aimPoint, dd = Math.hypot(ap.x - p.x, ap.z - p.z);
      if (dd > 0.6) { best = null; tx = ap.x; ty = ap.y; tz = ap.z; d = Math.min(dd, w.reach * 1.3); fx = (tx - p.x) / dd; fz = (tz - p.z) / dd; if (dd > d) { tx = p.x + fx * d; tz = p.z + fz * d; ty = from.y + (ap.y - from.y) * d / dd; } }
    }
    if (tx != null) { /* aimed */ }
    else if (best) { tx = best.x; ty = best.y; tz = best.z; d = best.d; fx = (tx - p.x) / d; fz = (tz - p.z) / d; W.player.face = Math.atan2(-fx, -fz); }
    else { d = Math.min(w.reach * 0.75, 18); tx = p.x + fx * d; tz = p.z + fz * d; ty = Math.max(gy(tx, tz) + 0.4, from.y + Math.min(22, Math.tan(el) * d)); }   // at most 22 m up: lobs stay on screen
    if (lob) {
      const vh = speed * 0.82, t = Math.max(0.25, d / vh), vy = ((ty - from.y) + 0.5 * g * t * t) / t;
      return { from, vx: fx * vh, vy, vz: fz * vh };
    }
    const dy = (ty - from.y) / Math.max(1, d);
    const L = Math.hypot(1, dy);
    return { from, vx: fx * speed / L, vy: dy * speed / L + g * d / speed * 0.5, vz: fz * speed / L };
  }
  C.fire = function (w) {
    if (!onFoot()) return false;
    const n = w.pellets || 1, g = w.lob ? 22 : w.proj === 'mustard' ? 0 : 5;
    const a = aimShot(w, w.speed || 22, !!w.lob, g);
    for (let i = 0; i < n; i++) {
      let vx = a.vx, vz = a.vz, vy = a.vy;
      if (n > 1) { const ang = (i / (n - 1) - 0.5) * (w.spread || 0.3) * 2, c = Math.cos(ang), s = Math.sin(ang); vx = a.vx * c - a.vz * s; vz = a.vx * s + a.vz * c; vy += rnd(-0.8, 1.2); }
      const len = Math.hypot(vx, vz) || 1;
      spawnShot({ kind: w.proj, owner: 'you', w: Object.assign({}, w), x: a.from.x + vx / len * 0.8, y: a.from.y, z: a.from.z + vz / len * 0.8, vx, vy, vz, g, bounce: w.bounce || 0, pierce: w.pierce || 0,
        back: !!w.back, range: w.reach, life: w.back ? 5 : 4, spin: w.proj === 'boomerang' ? 18 : w.proj === 'whoopee' || w.proj === 'potato' || w.proj === 'gnome' || w.proj === 'chicken' || w.proj === 'tshirt' ? 6 : 0 });
    }
    W.swing();
    const p = P(), fx = -Math.sin(W.player.face), fz = -Math.cos(W.player.face);
    W.burst(p.x + fx * 1.1, p.y + 1.45, p.z + fz * 1.1, w.puff || '💨', 3, { spread: 1, up: 1, size: 0.4, life: 0.4 });
    W.shake(clamp(w.dmg * 0.04, 0.03, 0.25));
    if (w.proj === 'gnome' || w.proj === 'potato' || w.proj === 'tshirt') SFX.thump(); else if (w.proj === 'whoopee') fartSound(0.25, 0.12); else SFX.pew();
    api.bump('shots');
    return true;
  };
  function hitProps(x, z, y, dmg, dir) { // a shot that lands on a smashable thing
    if (!W.propNear || y - gy(x, z) > 3.2) return false;
    const e = W.propNear(x, z, 1.0);
    if (!e) return false;
    F.smashProp(e, dmg * D.TUNE.smash.weaponMul, dir, false);
    return true;
  }
  function pedHit(s, ped) {
    if (ped.chaosHit && G.rt.t - ped.chaosHit < 3) return;
    ped.chaosHit = G.rt.t;
    const o = ped.obj.position;
    if (s.kind === 'tshirt') { W.holdPed(ped, 2, 'dance'); W.say(ped.obj, pick(['FREE SHIRT!', 'Is this my size?!', 'MERCH!!', 'Best day ever!']), 2.2); G.addHappy(1); return; }
    if (s.kind === 'confetti') { W.holdPed(ped, 1.6, 'dance'); W.say(ped.obj, pick(['Is it my birthday?', 'Party!', 'Yay?']), 1.8); return; }
    W.holdPed(ped, 1.4, 'air');
    W.say(ped.obj, pick(s.owner === 'foe' ? ['Hey! Watch it!', 'Not me, the goblin!'] : ['HEY!', 'Rude!', 'Bro?!', 'My fit!', 'Was that a potato?!', 'I\'m telling my mom.']), 2);
    W.burst(o.x, o.y + 1.6, o.z, s.w && s.w.puff || '💦', 3, { spread: 1, up: 2, size: 0.4 });
    api.bump('pedbonks');
  }
  function impact(s) {
    const x = s.obj.position.x, y = s.obj.position.y, z = s.obj.position.z, w = s.w || {};
    if (s.owner === 'you') {
      if (w.splash) {
        for (const m of F.monsters.slice()) { if (m.dead) continue; const d = Math.hypot(m.x - x, m.z - z); if (d > w.splash + m.r || Math.abs(monY(m) - y) > w.splash + 1) continue; const k = 1 - d / (w.splash + m.r) * 0.5, dir = { x: (m.x - x) / (d || 1), z: (m.z - z) / (d || 1) }; F.hitMonster(m, Object.assign({}, w, { dmg: w.dmg * k, type: 'shot' }), dir); C.add('hit'); }
        for (const ped of W.life.peds) { const o = ped.obj.position; if (Math.hypot(o.x - x, o.z - z) < w.splash * 0.8) pedHit(s, ped); }
        for (const q of C.pinatas.slice()) if (Math.hypot(q.x - x, q.z - z) < w.splash) pinataHit(q, 1);
        for (const b of C.balls) { const d = Math.hypot(b.x - x, b.z - z); if (d < w.splash + 1) { b.vx += (b.x - x) / (d || 1) * 10; b.vz += (b.z - z) / (d || 1) * 10; b.vy += 8; } }
        hitProps(x, z, y, w.dmg, { x: s.vx / 20, z: s.vz / 20 });
      }
      const fxs = { balloon: ['💦', 8, 'SPLOOSH!'], whoopee: ['💨', 12, 'BRAAAP!'], potato: ['💥', 8, 'KA-SPUD!'], gnome: ['🍄', 14, 'GNOMED!'] }[s.kind];
      if (fxs) { W.burst(x, y + 0.3, z, fxs[0], fxs[1], { spread: (w.splash || 2) * 1.2, up: 3, size: 0.6 }); W.pop(x, y + 1.5, z, fxs[2], '#ffc21f', 1); }
      if (s.kind === 'balloon') SFX.splash();
      if (s.kind === 'whoopee') { fartSound(0.8, 0.2); W.burst(x, y + 0.5, z, '🟢', 6, { spread: 4, up: 1.5, size: 0.9, life: 1.6, grav: -0.5 }); for (const m of F.monsters) if (Math.hypot(m.x - x, m.z - z) < (w.splash || 4)) m.stun = Math.max(m.stun, w.stun || 2.5); }
      if (s.kind === 'potato' || s.kind === 'gnome') { SFX.boom(); W.shake(s.kind === 'gnome' ? 0.6 : 0.35); if (s.kind === 'gnome') { W.burst(x, y + 0.5, z, '🎊', 12, { spread: 5, up: 6 }); hitstop(0.08); } }
      if (s.kind === 'spit' || s.kind === 'confetti' || s.kind === 'mustard' || s.kind === 'tshirt') W.burst(x, y, z, w.puff || '💦', 3, { spread: 1.2, up: 1.2, size: 0.4, life: 0.5 });
    } else {
      W.burst(x, y + 0.2, z, s.kind === 'tomato' ? '🍅' : s.kind === 'poop' ? '💩' : s.kind === 'lag' ? '📶' : '🟢', 4, { spread: 1.6, up: 1.5, size: 0.45, life: 0.6 });
      if (s.kind === 'tomato') SFX.splash();
    }
    removeShot(s);
  }
  function removeShot(s) { const i = C.shots.indexOf(s); if (i >= 0) C.shots.splice(i, 1); drop(s.obj); }
  function shotHitsPlayer(s) {
    const p = P(), m = s.src, kind = s.kind;
    if (F.dying || hideT > 0) { removeShot(s); return; }
    if (F.blocking) {
      if (G.rt.t - F.blockStart <= F.parryWindow() + 0.15) { // PERFECT PARRY: right back where it came from
        s.owner = 'you'; s.t = 0; s.life = 3; s.hit = new Set(); s.g = 2;
        const tx = m && F.monsters.includes(m) ? m.x : p.x - s.vx, ty = m && F.monsters.includes(m) ? monY(m) : p.y + 1, tz = m && F.monsters.includes(m) ? m.z : p.z - s.vz;
        const dx = tx - s.obj.position.x, dy = ty - s.obj.position.y, dz = tz - s.obj.position.z, L = Math.hypot(dx, dy, dz) || 1, sp = 30;
        s.vx = dx / L * sp; s.vy = dy / L * sp + 1; s.vz = dz / L * sp;
        s.w = { dmg: Math.max(2, s.dmg / 2.2) * D.calc.dmgMul(G.level()), type: 'shot', knock: 9, stun: 2.2, word: 'RETURN TO SENDER!', puff: '✨' };
        api.bump('reflects'); api.bump('parries');
        W.pop(p.x, p.y + 2.7, p.z, pick(['RETURN TO SENDER!', 'NO U!', 'REFLECTED!', 'DENIED!', 'UNO REVERSE!']), '#ffd23f', 1.2);
        W.burst(p.x, p.y + 1.4, p.z, '✨', 10, { spread: 3, up: 3 });
        G.sfx.done(); W.shake(0.25); hitstop(T.hitstop.parry);
        C.add('reflect'); C.aura(CH.AURA.reflect);
        if (G.hero) G.hero.swag(D.TUNE.hype.swag.parry);
        return;
      }
      F.hurt(s.dmg * (1 - F.blockPower()), m);
      W.pop(p.x, p.y + 2.4, p.z, pick(['BLOCKED!', 'NOPE!', 'NOT TODAY!']), '#9fd0ff', 0.85);
      C.add('block');
      removeShot(s);
      return;
    }
    F.hurt(s.dmg, m);
    if (kind === 'tomato') { splat('tomato'); W.pop(p.x, p.y + 2.5, p.z, 'SPLAT!', '#e8453c', 1); C.aura(CH.AURA.tomato); SFX.splash(); }
    else if (kind === 'poop') {
      splat('poop'); W.pop(p.x, p.y + 2.5, p.z, 'DIRECT HIT 💩', '#8a5a2b', 1); C.aura(CH.AURA.poop);
      const by = W.nearestPed(p.x, p.z, 14); if (by) W.say(by.obj, pick(['That\'s good luck, actually!', 'Oof. Sorry, friend.', 'Happens to the best of us!', 'Lucky you! (Really!)']), 2.4);
    } else if (kind === 'lag') { lagT = Math.max(lagT, (m && m.def.ranged.slow) || 2.5); lagEl.hidden = false; W.pop(p.x, p.y + 2.5, p.z, 'LAG SPIKE!', '#b48cff', 1); C.aura(CH.AURA.lag); }
    else W.pop(p.x, p.y + 2.5, p.z, pick(['EWWW!', 'GROSS!', 'SPLAT!']), '#7dff8a', 0.9);
    removeShot(s);
  }
  function updateShots(dt) {
    const p = P();
    for (let i = C.shots.length - 1; i >= 0; i--) {
      const s = C.shots[i];
      if (!C.shots.includes(s)) continue;
      s.t += dt;
      if (s.back && s.owner === 'you' && s.t > (s.range || 18) / (s.w.speed || 20)) { // the boomerang turns for home
        const dx = p.x - s.obj.position.x, dy = p.y + 1.3 - s.obj.position.y, dz = p.z - s.obj.position.z, L = Math.hypot(dx, dy, dz) || 1, sp = (s.w.speed || 20) * 1.1;
        s.vx += (dx / L * sp - s.vx) * Math.min(1, dt * 4); s.vy += (dy / L * sp - s.vy) * Math.min(1, dt * 4); s.vz += (dz / L * sp - s.vz) * Math.min(1, dt * 4);
        if (!s.turned) { s.turned = true; s.hit = new Set(); }
        if (L < 1.4) { W.pop(p.x, p.y + 2.3, p.z, 'CATCH!', '#ffc21f', 0.7); removeShot(s); continue; }
      } else s.vy -= s.g * dt;
      const o = s.obj.position;
      o.x += s.vx * dt; o.y += s.vy * dt; o.z += s.vz * dt;
      if (s.spin) { s.obj.rotation.y += s.spin * dt; if (s.kind !== 'boomerang') s.obj.rotation.x += s.spin * 0.6 * dt; }
      else if (s.obj.isMesh || s.obj.isGroup) s.obj.rotation.y = Math.atan2(-s.vx, -s.vz);
      if (s.t > s.life) { impact(s); continue; }
      const g = gy(o.x, o.z), hb = W.heightAt(o.x, o.z);
      if (hb && o.y < g + hb) { // a wall
        if (s.bounce > 0) { s.bounce--; s.vx = -s.vx * 0.7; s.vz = -s.vz * 0.7; o.x += s.vx * dt * 2; o.z += s.vz * dt * 2; SFX.squeak(); }
        else { impact(s); continue; }
      }
      if (o.y <= g + 0.15) {
        if (s.bounce > 0) { s.bounce--; o.y = g + 0.16; s.vy = Math.abs(s.vy) * 0.62; s.vx *= 0.8; s.vz *= 0.8; SFX.squeak(); if (s.kind === 'chicken') W.pop(o.x, o.y + 1, o.z, 'BAWK!', '#ffc21f', 0.6); }
        else if (s.back && !s.turned) { s.vy = Math.abs(s.vy) * 0.3; o.y = g + 0.16; }
        else { impact(s); continue; }
      }
      if (s.owner === 'foe') {
        if (Math.hypot(o.x - p.x, o.z - p.z) < 0.85 && o.y > p.y - 0.2 && o.y < p.y + 2.1) shotHitsPlayer(s);
        continue;
      }
      // yours: a MEGA figment (cft-camp.js), figments (also in the air), piñatas, balloons, balls, people, street furniture
      let done = false;
      if (G.camp && !s.hit.has('mega') && G.camp.shotHit(s, o)) { s.hit.add('mega'); if (s.w.splash || !(s.pierce > 0)) { impact(s); continue; } }
      for (const m of F.monsters) {
        if (m.dead || s.hit.has(m)) continue;
        const r = m.r + 0.55, my = monY(m), hh = (m.obj.userData.h || 1) * (m.obj.userData.size || 1) * 0.6 + 0.5;
        if (Math.hypot(m.x - o.x, m.z - o.z) > r || Math.abs(my - o.y) > hh) continue;
        if (s.w.splash) { impact(s); done = true; break; }
        const sp = Math.hypot(s.vx, s.vz) || 1;
        F.hitMonster(m, Object.assign({}, s.w, { type: 'shot' }), { x: s.vx / sp, z: s.vz / sp });
        C.add('hit');
        s.hit.add(m);
        if (s.pierce > 0) { s.pierce--; continue; }
        if (s.back) continue;   // a boomerang flies on through
        if (s.bounce > 0) { s.bounce--; s.vx = -s.vx * 0.6; s.vz = -s.vz * 0.6; s.vy = 6; continue; }
        impact(s); done = true; break;
      }
      if (done) continue;
      for (const q of C.pinatas) if (!s.hit.has(q) && Math.hypot(q.x - o.x, q.z - o.z) < 1.2 && Math.abs(q.y - o.y) < 1.4) { s.hit.add(q); pinataHit(q, s.w.splash ? 2 : 1); if (!s.back && !s.pierce) { impact(s); done = true; } break; }
      if (done) continue;
      if (C.ev && C.ev.balloons) for (const b of C.ev.balloons) if (!b.dead && Math.hypot(b.x - o.x, b.z - o.z) < 1 && Math.abs(b.y - o.y) < 1.2) { popBalloon(b); if (!s.back && !s.pierce) { impact(s); done = true; } break; }
      if (done) continue;
      for (const b of C.balls) if (Math.hypot(b.x - o.x, b.z - o.z) < b.r + 0.3 && Math.abs(b.y - o.y) < b.r + 0.3) { b.vx += s.vx * 0.5; b.vz += s.vz * 0.5; b.vy += 6; C.add('ball'); if (!s.back) { impact(s); done = true; } break; }
      if (done) continue;
      if (o.y - g < 2.4 && (!s.w.lob || s.vy < 0)) {   // lobbed shots only land on people and things on the way down
        for (const ped of W.life.peds) { const q = ped.obj.position; if (!ped.ctl && Math.hypot(q.x - o.x, q.z - o.z) < 0.7) { pedHit(s, ped); if (!s.back && !s.pierce) { impact(s); done = true; } break; } }
        if (done) continue;
        if (s.t > 0.08 && hitProps(o.x, o.z, o.y, s.w.dmg, { x: s.vx / 20, z: s.vz / 20 }) && !s.back && !s.pierce) { impact(s); continue; }
      }
    }
  }

  // ------------------------------------------------------------------ ranged and flying figments (called by cft-fun.js updateMonsters)
  // Returns a walking speed when it handled the figment this frame, false to let the usual melee chase run.
  function los(m) { // a building between it and you?
    const p = P(), my = monY(m);
    for (let i = 1; i < 6; i++) { const t = i / 6, x = m.x + (p.x - m.x) * t, z = m.z + (p.z - m.z) * t, hb = W.heightAt(x, z); if (hb && gy(x, z) + hb > my + (p.y + 1.4 - my) * t) return false; }
    return true;
  }
  function walkTo(m, tx, tz, sp, dt) {
    const dx = tx - m.x, dz = tz - m.z, d = Math.hypot(dx, dz);
    if (d < 0.05) return;
    const k = Math.min(d, sp * dt), e = { x: m.x + dx / d * k, z: m.z + dz / d * k };
    if (!m.def.fly) W.collide(e, m.r);
    m.x = e.x; m.z = e.z;
    const want = Math.atan2(-dx, -dz); m.obj.rotation.y += Math.atan2(Math.sin(want - m.obj.rotation.y), Math.cos(want - m.obj.rotation.y)) * Math.min(1, dt * 8);
  }
  function aimTele(m, on) {
    if (on && !m.aimTag) { m.aimTag = W.label('🎯', { bg: '#ffc21f', fg: '#1f1a3d', size: 54, height: 0.7, border: '#1f1a3d', depthTest: false }); m.aimTag.position.y = ((m.obj.userData.h || 1.4) + 0.9) / (m.obj.userData.size || 1); m.obj.add(m.aimTag); }
    if (!on && m.aimTag) { m.obj.remove(m.aimTag); if (m.aimTag.material.map) m.aimTag.material.map.dispose(); m.aimTag.material.dispose(); m.aimTag = null; }
  }
  C.rangedAI = function (m, d, dt) {
    const R = m.def.ranged, p = P();
    if (!R) return false;
    if (m.swoop > 0) { m.swoop -= dt; aimTele(m, false); m.aim = 0; return false; }   // a gull diving at you: the melee rules apply
    if (d < 3 && !m.def.fly) { aimTele(m, false); m.aim = 0; return false; }
    if (m.rcd == null) m.rcd = rnd(0.6, R.cd[1]);
    m.rcd -= dt;
    m.swoopCd = (m.swoopCd == null ? rnd(3, 6) : m.swoopCd) - dt;
    if (m.def.fly && m.def.steal && m.def.steal[1] > 0 && d < 7 && m.swoopCd <= 0 && !(m.aim > 0)) { m.swoop = 2.4; m.swoopCd = rnd(6, 10); W.pop(m.x, monY(m) + 1, m.z, 'SKRAAA!', '#ffffff', 0.7); return false; }
    if (m.aim > 0) {
      m.aim -= dt;
      const want = Math.atan2(-(p.x - m.x), -(p.z - m.z)); m.obj.rotation.y += Math.atan2(Math.sin(want - m.obj.rotation.y), Math.cos(want - m.obj.rotation.y)) * Math.min(1, dt * 10);
      if (m.aimTag) { const k = 0.7 * (1 + 0.3 * Math.abs(Math.sin(G.rt.t * 22))); m.aimTag.scale.set(k * m.aimTag.material.map.userData.aspect, k, 1); }
      if (m.aim <= 0) { aimTele(m, false); enemyShot(m); m.rcd = rnd(R.cd[0], R.cd[1]); }
      return 0;
    }
    let sp = m.def.speed;
    if (m.def.fly) { // circle over you, a little behind
      const a = G.rt.t * 0.6 + (m.born || 0), tx = p.x + Math.cos(a) * 4.5, tz = p.z + Math.sin(a) * 4.5;
      walkTo(m, tx, tz, sp, dt);
    } else if (d > R.r * 0.8) walkTo(m, p.x, p.z, sp, dt);
    else if (d < R.r * 0.4) { sp *= 0.8; walkTo(m, m.x + (m.x - p.x), m.z + (m.z - p.z), sp, dt); }   // keep their distance
    else { sp *= 0.5; const sx = -(p.z - m.z) / d, sz = (p.x - m.x) / d, side = (m.born || 0) % 2 ? 1 : -1; walkTo(m, m.x + sx * side * 3, m.z + sz * side * 3, sp, dt); }   // strafe
    if (m.rcd <= 0 && d < R.r && los(m) && !quiet()) { m.aim = m.def.fly ? 0.5 : 0.65; aimTele(m, true); }
    return sp;
  };
  function enemyShot(m) {
    const R = m.def.ranged, p = P(), y0 = monY(m), pv = W.player.vel;
    const dmg = R.dmg * (m.atkK || (1 + D.TUNE.monsters.atkPerLevel * ((m.lvl || 1) - 1))) * (m.champ ? 1.4 : 1) * (T.enemyShots || 1);   // atkK: scaled to you (cft-fun F.scaleFor)
    const d0 = Math.hypot(p.x - m.x, p.z - m.z), speed = R.speed || 15, tF = d0 / speed * (R.lob ? 1.2 : 1);
    const tx = p.x + pv.x * tF * 0.6, tz = p.z + pv.z * tF * 0.6, ty = p.y + 1.0;   // leads you a little: keep moving
    let vx, vy, vz, g;
    if (R.drop) { g = 18; const t = Math.sqrt(Math.max(0.2, 2 * (y0 - ty) / g)); vx = (tx - m.x) / t; vz = (tz - m.z) / t; vy = 0; }
    else if (R.lob) { g = 20; const vh = speed * 0.8, d = Math.hypot(tx - m.x, tz - m.z), t = Math.max(0.3, d / vh); vx = (tx - m.x) / d * vh; vz = (tz - m.z) / d * vh; vy = ((ty - y0) + 0.5 * g * t * t) / t; }
    else { g = 3; const dx = tx - m.x, dy = ty - y0, dz = tz - m.z, L = Math.hypot(dx, dy, dz) || 1; vx = dx / L * speed; vy = dy / L * speed + g * L / speed * 0.5; vz = dz / L * speed; }
    spawnShot({ kind: R.proj, owner: 'foe', src: m, dmg, x: m.x, y: y0, z: m.z, vx, vy, vz, g, life: 4 });
    if (R.proj === 'spit') chirp(300, 120, 0.15, 'sawtooth', 0.04); else if (R.proj === 'lag') chirp(1200, 2400, 0.2, 'square', 0.03); else if (R.proj === 'poop') chirp(700, 300, 0.2, 'sine', 0.05);
    if (Math.random() < 0.3) W.say(m.obj, pick({ spit: ['Ptoo!', 'Hork!', 'Incoming goo!'], tomato: ['Catch!', 'Fresh from the market!', 'Splat time!'], poop: ['SKRAAA!', 'Bombs away!'], lag: ['One bar...', 'Buffering YOU!', '404!'] }[R.proj] || ['!']), 1.4);
  }
  function flyTick(dt) { // flying figments hover (their x/z come from cft-fun.js or rangedAI; height is ours)
    for (const m of F.monsters) {
      if (!m.def.fly) continue;
      m.alt = m.alt == null ? m.def.fly : m.alt;
      const want = m.swoop > 0 ? 0.6 : m.stun > 0 ? Math.max(0.6, m.def.fly * 0.4) : m.def.fly;
      m.alt += (want - m.alt) * Math.min(1, dt * (m.swoop > 0 ? 3 : 1.5));
      m.obj.position.y = gy(m.x, m.z) + m.alt + Math.sin(G.rt.t * 2 + (m.born || 0)) * 0.3;
    }
  }

  // ------------------------------------------------------------------ flying (you): the Bean jetpack and the Glide-brella
  const flyGear = () => { const b = save().equip.back, it = b && D.ITEMS[b]; return it && it.fly || null; };
  const jetMesh = build(m => {
    for (const sx of [-1, 1]) { m.add(CYL, 0xd2691e, sx * 0.14, 0, 0, 0, 0, 0, 0.24, 0.5, 0.24); m.add(CYL, 0xffc21f, sx * 0.14, 0.02, 0, 0, 0, 0, 0.25, 0.16, 0.25); m.add(CYL, 0x8a5a2b, sx * 0.14, 0.02, -0.122, Math.PI / 2, 0, 0, 0.1, 0.01, 0.1); m.add(CONE, 0x5b5f66, sx * 0.14, -0.33, 0, Math.PI, 0, 0, 0.18, 0.16, 0.18); }
    m.box(0.5, 0.08, 0.06, 0x33373f, 0, 0.12, -0.13);
  });
  jetMesh.position.set(0, 1.12, 0.26); jetMesh.visible = false; W.avatar.add(jetMesh);
  const brella = new THREE.Group();
  { const cols = [0xff5c8a, 0xffc21f, 0x38bdf8, 0x35e06a]; const m = new W.Merge(); m.add(CYL, 0x33373f, 0, -0.55, 0, 0, 0, 0, 0.04, 1.1, 0.04); for (let k = 0; k < 8; k++) m.add(CONE, cols[k % 4], Math.cos(k * 0.785) * 0.3, 0.15, Math.sin(k * 0.785) * 0.3, 0, -k * 0.785, 0, 0.9, 0.5, 0.9); brella.add(m.mesh()); }
  brella.position.set(0.25, 2.55, 0); brella.visible = false; W.avatar.add(brella);
  let jetFx = 0, jetToot = 0;
  W.flyHook = function (dt, pl, inp, grav, ctl) {
    const g = flyGear();
    flying = null;
    if (!g || !ctl || pl.grounded || !onFoot() || hideT > 0) return grav;
    if (!inp.hold) return grav;
    if (g === 'jet') {
      if (fuel <= 0 || pl.vy > 7) return grav;
      fuel = Math.max(0, fuel - dt / T.jetFuel);
      flying = 'jet';
      pl.vy = Math.min(T.jetUp, pl.vy + (T.jetThrust - grav) * dt);
      if (pl.vy < -4) pl.vy += 30 * dt;
      return 0;
    }
    if (g === 'glide' && pl.vy < 0) { flying = 'glide'; if (pl.vy < -T.glideFall) pl.vy += (-T.glideFall - pl.vy) * Math.min(1, dt * 8); return grav * 0.2; }
    return grav;
  };
  function flightTick(dt) {
    const g = flyGear(), p = P();
    jetMesh.visible = g === 'jet' && onFoot();
    brella.visible = flying === 'glide';
    fuelEl.hidden = g !== 'jet';
    if (W.player.grounded) fuel = Math.min(1, fuel + dt * T.jetRefill);
    if (g === 'jet') fuelEl.querySelector('[data-fbar]').style.width = Math.round(fuel * 100) + '%';
    fuelEl.classList.toggle('low', fuel < 0.2);
    if (flying) {
      airAcc += dt;
      if (airAcc >= 1) { airAcc -= 1; api.bump('airtime'); C.add('air'); }
      if (flying === 'jet') {
        jetFx -= dt; jetToot -= dt;
        if (jetFx <= 0) { jetFx = 0.05; const bx = -Math.sin(W.player.face) * -0.35, bz = -Math.cos(W.player.face) * -0.35; W.burst(p.x + bx, p.y + 0.6, p.z + bz, Math.random() < 0.25 ? '🔥' : '💨', 1, { spread: 0.4, up: -2.5, size: 0.5, life: 0.5, grav: 3 }); }
        if (jetToot <= 0) { jetToot = rnd(0.35, 0.6); fartSound(rnd(0.15, 0.3), 0.07); }
      }
    }
    if (g && !calm()) hoopTick(dt);
    else if (C.hoops.length) { for (const h of C.hoops) drop(h.obj); C.hoops.length = 0; }
  }
  // golden hoops in the sky: fly through them
  const hoopGeo = new THREE.TorusGeometry(2.4, 0.22, 8, 28), hoopMat = new THREE.MeshBasicMaterial({ color: 0xffd23f });
  function hoopTick(dt) {
    const p = P();
    for (let i = C.hoops.length - 1; i >= 0; i--) {
      const h = C.hoops[i];
      h.obj.rotation.y += dt * 0.6;
      const d = Math.hypot(h.x - p.x, h.z - p.z);
      if (d > 260) { drop(h.obj); C.hoops.splice(i, 1); continue; }
      if (d < 2.3 && Math.abs(h.y - (p.y + 1)) < 2.3) {
        api.bump('hoops'); C.add('hoop'); C.aura(CH.AURA.hoop, true);
        G.addMoney(Math.round(6 * (1 + G.level() * 0.08)), 'sky hoop');
        W.burst(h.x, h.y, h.z, '⭐', 10, { spread: 3, up: 2 }); W.pop(h.x, h.y + 2.5, h.z, pick(['THREADED IT!', 'SKY HOOP!', 'NICE LINE!', 'ZOOM!']), '#ffd23f', 1);
        G.sfx.coin(); drop(h.obj); C.hoops.splice(i, 1);
      }
    }
    if (C.hoops.length < 5) {
      const last = C.hoops[C.hoops.length - 1], base = last || { x: p.x, z: p.z }, a = rnd(0, 6.283), r = last ? rnd(25, 45) : rnd(30, 60);
      const x = base.x + Math.cos(a) * r, z = base.z + Math.sin(a) * r, y = gy(x, z) + rnd(9, 24);
      const mesh = new THREE.Mesh(hoopGeo, hoopMat); mesh.position.set(x, y, z); mesh.rotation.y = a;
      W.scene.add(mesh);
      C.hoops.push({ x, y, z, obj: mesh });
    }
  }

  // ------------------------------------------------------------------ the fart button (B). Yes.
  C.fart = function () {
    if (!alive || fartCd > 0 || quiet() || !onStory()) return false;
    fartCd = 2.2;
    const p = P(), bx = Math.sin(W.player.face) * 0.5, bz = Math.cos(W.player.face) * 0.5;
    fartSound();
    W.burst(p.x + bx, p.y + 0.8, p.z + bz, '💨', 6, { spread: 1.5, up: 0.6, size: 0.7, life: 1.2, grav: -0.4 });
    W.pop(p.x, p.y + 2.6, p.z, pick(CH.FART_WORDS), '#9be27a', 0.9);
    api.bump('farts');
    C.add('fart');
    let n = 0;
    for (const ped of W.life.peds) {
      const o = ped.obj.position;
      if (ped.ctl || Math.hypot(o.x - p.x, o.z - p.z) > 12) continue;
      W.holdPed(ped, 1.8, Math.random() < 0.5 ? 'air' : null);
      if (n++ < 3) W.say(ped.obj, pick(CH.FART), 2);
    }
    for (const m of F.monsters) if (Math.hypot(m.x - p.x, m.z - p.z) < 3.5) { m.stun = Math.max(m.stun, 1.4); W.pop(m.x, monY(m) + 1, m.z, 'THE SMELL!', '#9be27a', 0.7); }
    if (flyGear() === 'jet' && !W.player.grounded) { W.player.vy += 6; W.pop(p.x, p.y + 1.6, p.z, 'FART BOOST!', '#ffc21f', 0.8); }
    const total = save().counters.farts || 0;
    if (total % 67 === 0) { word('SIX SEVEN!', 'violet', total + ' toots and counting', true); C.aura(67); }
    return true;
  };
  function stinkBomb(x, z, you) {
    const y = gy(x, z);
    fartSound(1.0, 0.25);
    W.burst(x, y + 1.2, z, '💩', 6, { spread: 4, up: 4 }); W.burst(x, y + 1, z, '🧻', 5, { spread: 3, up: 5, size: 0.5 }); W.burst(x, y + 0.8, z, '🟢', 8, { spread: 5, up: 1.2, size: 1, life: 1.8, grav: -0.4 });
    W.pop(x, y + 3, z, 'STINK BOMB!', '#9be27a', 1.3);
    for (const m of F.monsters.slice()) { const d = Math.hypot(m.x - x, m.z - z); if (d < 7) F.hitMonster(m, { dmg: 2 * D.calc.dmgMul(G.level()), knock: 6, stun: 2.5, word: 'STINKY!', puff: '💨' }, { x: (m.x - x) / (d || 1), z: (m.z - z) / (d || 1) }); }
    for (const ped of W.life.peds) { const o = ped.obj.position; if (Math.hypot(o.x - x, o.z - z) < 12 && !ped.ctl) { W.holdPed(ped, 2, 'air'); if (Math.random() < 0.4) W.say(ped.obj, pick(CH.FART), 2); } }
    C.add('stink'); if (you) C.aura(CH.AURA.stink);
  }
  // hiding in a porta-potty: figments lose you; you come out with a stink bomb
  function hide(e) {
    if (hideT > 0 || quiet()) return;
    hideT = 4; hideAt = { x: e.x, z: e.z };
    W.teleport(e.x, e.z);
    W.avatar.scale.setScalar(0.001);
    W.pop(e.x, gy(e.x, e.z) + 3, e.z, pick(CH.POTTY), '#ffffff', 0.9);
    U.feed('🚽', 'You hid in a porta-potty. The figments are very confused.');
    later(1600, () => { if (hideT > 0 && hideAt) W.pop(hideAt.x, gy(hideAt.x, hideAt.z) + 3, hideAt.z, pick(CH.POTTY), '#ffffff', 0.8); });
  }
  function hideTick(dt) {
    if (hideT <= 0) return;
    hideT -= dt;
    W.player.pos.x = hideAt.x; W.player.pos.z = hideAt.z; W.player.vel.set(0, 0, 0);
    for (const m of F.monsters) if (Math.hypot(m.x - hideAt.x, m.z - hideAt.z) < 30) { m.stun = Math.max(m.stun, 0.25); if (m.wind > 0) m.wind = 0; }
    if (hideT <= 0) {
      W.avatar.scale.setScalar(1);
      stinkBomb(hideAt.x, hideAt.z, true);
      api.bump('hides');
      hideAt = null;
    }
  }

  // ------------------------------------------------------------------ meme chatter from passers-by
  function chatterTick(dt) {
    chatT -= dt;
    if (chatT > 0) return;
    chatT = rnd(T.chatter[0], T.chatter[1]);
    if (calm() || quiet() || !onStory() || !G.allow('chatter')) return;
    const p = P(), list = W.life.peds.filter(q => !q.ctl && !(q.hold > 0) && q.obj.parent && Math.hypot(q.obj.position.x - p.x, q.obj.position.z - p.z) < 20);
    if (!list.length) return;
    const ped = pick(list), kid = W.isKid && W.isKid(ped.look, ped.type);
    if (kid && Math.random() < 0.6) { W.holdPed(ped, 2, 'wave'); W.say(ped.obj, pick(CH.KIDS), 2.4); }
    else W.say(ped.obj, pick(CH.CHATTER), 3);
  }

  // ------------------------------------------------------------------ animal neighbours and street brainrot (the Dex)
  const ALL_DEX = CH.BRAINROT.map(b => Object.assign({ kind: 'rot' }, b)).concat(CH.CRITTERS.map(c => Object.assign({ kind: 'critter' }, c)));
  C.DEX = ALL_DEX;
  function critterModel(id) {
    const g = new THREE.Group(), u = { flap: null, spin: null };
    let m = new W.Merge(), sc = 1;
    switch (id) {
      case 'squirrel': { const c = 0xc8742e; m.add(SPH, c, 0, 0.22, 0, 0, 0, 0, 0.3, 0.32, 0.42); m.add(SPH, c, 0, 0.4, -0.18, 0, 0, 0, 0.24, 0.24, 0.24); m.add(SPH, 0xf2d0a4, 0, 0.36, -0.28, 0, 0, 0, 0.1, 0.08, 0.06); m.add(SPH, c, 0, 0.5, 0.28, 0.6, 0, 0, 0.26, 0.5, 0.26); m.add(CONE, c, -0.07, 0.53, -0.18, 0, 0, 0.3, 0.06, 0.1, 0.04); m.add(CONE, c, 0.07, 0.53, -0.18, 0, 0, -0.3, 0.06, 0.1, 0.04); eye(m, -0.06, 0.43, -0.29, 0.035); eye(m, 0.06, 0.43, -0.29, 0.035); sc = 1.5; break; }
      case 'frog': { const c = 0x4fbf4a; m.add(SPH, c, 0, 0.14, 0, 0, 0, 0, 0.5, 0.26, 0.44); m.add(SPH, c, -0.12, 0.26, -0.1, 0, 0, 0, 0.16, 0.14, 0.16); m.add(SPH, c, 0.12, 0.26, -0.1, 0, 0, 0, 0.16, 0.14, 0.16); eye(m, -0.12, 0.29, -0.15, 0.06); eye(m, 0.12, 0.29, -0.15, 0.06); m.box(0.24, 0.015, 0.02, 0x1f5f1a, 0, 0.14, -0.22); m.add(SPH, 0x3a9a36, -0.22, 0.06, 0.1, 0, 0, 0, 0.18, 0.1, 0.28); m.add(SPH, 0x3a9a36, 0.22, 0.06, 0.1, 0, 0, 0, 0.18, 0.1, 0.28); sc = 1.6; break; }
      case 'capybara': case 'capy': { const gold = id === 'capy', c = gold ? 0xffc21f : 0x9a6a3c, d = gold ? 0xe8a317 : 0x7a5230; m.add(SPH, c, 0, 0.55, 0.1, 0, 0, 0, 0.9, 0.72, 1.3); m.add(SPH, c, 0, 0.72, -0.55, 0, 0, 0, 0.55, 0.52, 0.66); m.box(0.4, 0.3, 0.2, d, 0, 0.66, -0.82); eye(m, -0.17, 0.85, -0.72, 0.05); eye(m, 0.17, 0.85, -0.72, 0.05); m.add(SPH, d, -0.2, 1.0, -0.5, 0, 0, 0, 0.12, 0.1, 0.08); m.add(SPH, d, 0.2, 1.0, -0.5, 0, 0, 0, 0.12, 0.1, 0.08);
        for (const [x, z] of [[-0.25, -0.3], [0.25, -0.3], [-0.25, 0.5], [0.25, 0.5]]) m.box(0.16, 0.3, 0.16, d, x, 0.15, z);
        if (gold) { m.box(0.42, 0.12, 0.42, 0xffe066, 0, 1.06, -0.55); for (const x of [-0.15, 0, 0.15]) m.add(CONE, 0xffe066, x, 1.2, -0.55, 0, 0, 0, 0.1, 0.2, 0.1); } else m.add(SPH, 0xff8a1a, 0, 1.08, -0.55, 0, 0, 0, 0.24, 0.22, 0.24);   // the orange on its head
        break; }
      case 'crab': { const c = 0xe8453c; m.add(SPH, c, 0, 0.2, 0, 0, 0, 0, 0.6, 0.24, 0.42); for (const sx of [-1, 1]) { m.add(SPH, c, sx * 0.42, 0.26, -0.18, 0, 0, 0, 0.2, 0.16, 0.16); m.box(0.03, 0.14, 0.03, c, sx * 0.08, 0.36, -0.12); eye(m, sx * 0.08, 0.44, -0.12, 0.04); for (let k = 0; k < 3; k++) m.box(0.22, 0.03, 0.03, 0xc0352c, sx * 0.34, 0.1, -0.05 + k * 0.1, 0, 0, sx * -0.5); } sc = 1.7; break; }
      case 'snail': { m.add(SPH, 0x9fae7a, 0, 0.1, 0, 0, 0, 0, 0.28, 0.18, 0.7); m.add(TOR, 0xd98fb0, 0, 0.32, 0.1, 0, Math.PI / 2, 0, 0.2, 0.2, 0.22); m.add(SPH, 0xc06a90, 0, 0.32, 0.1, 0, 0, 0, 0.22, 0.4, 0.4); m.box(0.02, 0.18, 0.02, 0x9fae7a, -0.05, 0.25, -0.3); m.box(0.02, 0.18, 0.02, 0x9fae7a, 0.05, 0.25, -0.3); eye(m, -0.05, 0.35, -0.3, 0.035); eye(m, 0.05, 0.35, -0.3, 0.035); sc = 1.6; break; }
      case 'duck': { const mk = (s, head) => { m.add(SPH, head ? 0x8a6a4a : 0xffd23f, 0, 0.18 * s, 0, 0, 0, 0, 0.36 * s, 0.3 * s, 0.5 * s); m.add(SPH, head ? 0x2f8f5b : 0xffd23f, 0, 0.36 * s, -0.18 * s, 0, 0, 0, 0.22 * s, 0.22 * s, 0.22 * s); m.box(0.08 * s, 0.04 * s, 0.12 * s, 0xff8a1a, 0, 0.34 * s, -0.32 * s); }; mk(1.4, true); sc = 1; break; }
      case 'cow': { const w = 0xf4f1ea, b = 0x222222; m.box(0.7, 0.6, 1.3, w, 0, 0.95, 0); m.box(0.3, 0.3, 0.4, b, 0.2, 1.05, 0.2); m.box(0.25, 0.25, 0.3, b, -0.22, 0.9, -0.3); m.box(0.42, 0.42, 0.45, w, 0, 1.15, -0.8); m.box(0.36, 0.2, 0.12, 0xf2a7b8, 0, 1.02, -1.05); eye(m, -0.12, 1.25, -1.03, 0.05); eye(m, 0.12, 1.25, -1.03, 0.05); m.add(CONE, 0xe9dfc6, -0.18, 1.42, -0.8, 0, 0, 0.6, 0.06, 0.16, 0.06); m.add(CONE, 0xe9dfc6, 0.18, 1.42, -0.8, 0, 0, -0.6, 0.06, 0.16, 0.06); for (const [x, z] of [[-0.25, -0.5], [0.25, -0.5], [-0.25, 0.5], [0.25, 0.5]]) m.box(0.14, 0.65, 0.14, w, x, 0.33, z); m.add(SPH, 0xf2a7b8, 0, 0.6, 0.35, 0, 0, 0, 0.24, 0.12, 0.24); break; }
      case 'possum': { const c = 0x9a9aa2; m.add(SPH, c, 0, 0.22, 0.05, 0, 0, 0, 0.36, 0.32, 0.62); m.add(SPH, 0xf4f1ea, 0, 0.3, -0.3, 0, 0, 0, 0.24, 0.22, 0.3); m.add(SPH, 0xf2a7b8, 0, 0.28, -0.46, 0, 0, 0, 0.06, 0.06, 0.06); eye(m, -0.06, 0.34, -0.4, 0.035); eye(m, 0.06, 0.34, -0.4, 0.035); m.box(0.04, 0.04, 0.5, 0xf2a7b8, 0, 0.18, 0.55); m.add(SPH, 0x333333, -0.1, 0.42, -0.26, 0, 0, 0, 0.1, 0.1, 0.05); m.add(SPH, 0x333333, 0.1, 0.42, -0.26, 0, 0, 0, 0.1, 0.1, 0.05); sc = 1.4; break; }
      // ---- the brainrot
      case 'sharkini': { const c = 0x7f8fa6; m.add(SPH, c, 0, 1.45, 0, 0, 0, 0, 0.9, 1.9, 0.85); m.add(SPH, 0xf4f1ea, 0, 1.35, -0.18, 0, 0, 0, 0.6, 1.4, 0.5); m.add(CONE, c, 0, 1.6, 0.42, -0.5, 0, 0, 0.12, 0.6, 0.4); m.box(0.5, 0.06, 0.06, 0x1f1a3d, 0, 1.75, -0.42); for (let k = 0; k < 5; k++) m.add(CONE, 0xffffff, -0.2 + k * 0.1, 1.68, -0.42, Math.PI, 0, 0, 0.05, 0.08, 0.04); eye(m, -0.2, 2.0, -0.32, 0.08); eye(m, 0.2, 2.0, -0.32, 0.08); m.add(CONE, c, -0.48, 1.3, 0, 0, 0, 1.2, 0.1, 0.5, 0.3); m.add(CONE, c, 0.48, 1.3, 0, 0, 0, -1.2, 0.1, 0.5, 0.3);
        for (const sx of [-1, 1]) { m.box(0.18, 0.6, 0.18, 0x2b6cb0, sx * 0.2, 0.42, 0); m.box(0.3, 0.2, 0.5, 0xffffff, sx * 0.2, 0.1, -0.08); m.box(0.31, 0.06, 0.3, 0xe8453c, sx * 0.2, 0.12, -0.05); } break; }
      case 'bananito': { const Y = 0xffd23f; for (let k = 0; k < 6; k++) { const a = -0.9 + k * 0.36; m.add(SPH, Y, Math.sin(a) * 0.7, 1.0 + (1 - Math.cos(a)) * 0.6, 0, 0, 0, a, 0.5, 0.55, 0.5); } m.add(CYL, 0x6b4f37, -0.55, 1.5, 0, 0, 0, 0.8, 0.08, 0.2, 0.08); eye(m, -0.1, 1.15, -0.22, 0.09); eye(m, 0.12, 1.15, -0.22, 0.09); m.box(0.18, 0.03, 0.03, 0x1f1a3d, 0, 0.98, -0.25); m.box(0.04, 0.4, 0.04, 0x33373f, 0.05, 1.55, 0);
        const r = new W.Merge(); r.box(1.6, 0.03, 0.1, 0x33373f); r.box(0.1, 0.03, 1.6, 0x33373f); const rot = r.mesh(); rot.position.set(0.05, 1.76, 0); g.add(rot); u.spin = rot; break; }
      case 'frigo': { m.box(0.9, 1.4, 0.7, 0xf4f1ea, 0, 1.55, 0); m.box(0.92, 0.04, 0.72, 0xc0c4ca, 0, 1.75, 0); m.box(0.05, 0.4, 0.06, 0xc0c4ca, 0.35, 1.95, -0.37); m.box(0.05, 0.3, 0.06, 0xc0c4ca, 0.35, 1.4, -0.37); m.add(SPH, 0xc9a26a, 0, 2.3, 0.1, 0, 0, 0, 0.6, 0.45, 0.6);
        m.box(0.18, 0.7, 0.18, 0xc9a26a, 0, 2.3, -0.45, 0.5); m.box(0.3, 0.28, 0.45, 0xc9a26a, 0, 2.65, -0.75); eye(m, -0.1, 2.72, -0.95, 0.05); eye(m, 0.1, 2.72, -0.95, 0.05); for (const [x, z] of [[-0.3, -0.25], [0.3, -0.25], [-0.3, 0.25], [0.3, 0.25]]) m.box(0.12, 0.85, 0.12, 0xc9a26a, x, 0.42, z); for (let k = 0; k < 3; k++) m.box(0.16, 0.12, 0.02, [0xe8453c, 0x35e06a, 0x38bdf8][k], -0.25 + k * 0.22, 1.2 + k * 0.15, -0.36); break; }
      case 'toastito': { const P = 0xff7ab8; m.box(0.8, 0.55, 0.5, 0xc0c4ca, 0, 1.15, 0); m.box(0.12, 0.06, 0.4, 0x33373f, -0.15, 1.43, 0); m.box(0.12, 0.06, 0.4, 0x33373f, 0.15, 1.43, 0); m.box(0.1, 0.32, 0.36, 0xd9a05b, -0.15, 1.55, 0); m.box(0.1, 0.32, 0.36, 0xd9a05b, 0.15, 1.6, 0); m.box(0.08, 0.06, 0.06, 0x33373f, 0.42, 1.05, 0);
        m.box(0.05, 0.9, 0.05, P, -0.1, 0.45, 0); m.box(0.05, 0.6, 0.05, P, 0.12, 0.3, 0.05); m.box(0.08, 0.7, 0.08, P, 0, 1.6, -0.3, -0.3); m.add(SPH, P, 0, 2.0, -0.42, 0, 0, 0, 0.26, 0.24, 0.28); m.box(0.08, 0.08, 0.2, 0x222222, 0, 1.95, -0.6, 0.5); eye(m, -0.08, 2.06, -0.52, 0.05); eye(m, 0.08, 2.06, -0.52, 0.05); break; }
      case 'croissanto': { const c = 0xd9a05b, d = 0xb97a3a; for (let k = 0; k < 6; k++) { const a = k * 0.45 - 1.1, s = 0.75 - Math.abs(k - 2.5) * 0.12; m.add(SPH, k % 2 ? d : c, Math.sin(a) * 1.0, 0.45, Math.cos(a) * 0.4, 0, a, 0, s, s * 0.8, s * 0.9); }
        m.box(0.4, 0.22, 0.6, c, 0, 0.45, -0.7); m.box(0.38, 0.1, 0.55, d, 0, 0.32, -0.72); for (let k = 0; k < 4; k++) m.add(CONE, 0xffffff, -0.12 + k * 0.08, 0.36, -0.98, Math.PI, 0, 0, 0.04, 0.07, 0.04); eye(m, -0.12, 0.62, -0.6, 0.07); eye(m, 0.12, 0.62, -0.6, 0.07); for (const [x, z] of [[-0.4, -0.3], [0.4, -0.3], [-0.4, 0.3], [0.4, 0.3]]) m.box(0.12, 0.25, 0.12, d, x, 0.12, z); break; }
      case 'gnomo': { const gn = W.decorMesh('gnome', 0xe8453c); gn.scale.setScalar(0.8); gn.position.set(0, 1.25, 0.1); g.add(gn);
        m.add(CYL, 0xf4f1ea, 0, 1.1, 0, Math.PI / 2, 0, 0, 0.42, 1.6, 0.42); m.add(CONE, 0xe8453c, 0, 1.1, -1.05, -Math.PI / 2, 0, 0, 0.42, 0.5, 0.42); for (const a of [0, 2.09, 4.19]) m.box(0.04, 0.4, 0.3, 0xe8453c, Math.cos(a) * 0.28, 1.1 + Math.sin(a) * 0.28, 0.75, 0, 0, a); m.add(CONE, 0xff8a1a, 0, 1.1, 1.05, Math.PI / 2, 0, 0, 0.32, 0.5, 0.32); break; }
      case 'polpo': { m.add(CYL, 0xf4f1ea, 0, 0.55, 0, 0, 0, 0, 1.2, 1.1, 1.2); m.add(CYL, 0x6b3e22, 0, 1.08, 0, 0, 0, 0, 1.1, 0.04, 1.1); m.add(TOR, 0xf4f1ea, 0.62, 0.6, 0, 0, 0, 0, 0.26, 0.3, 0.1); m.add(SPH, 0x9b5cf6, 0, 1.45, 0, 0, 0, 0, 0.9, 0.85, 0.9);
        eye(m, -0.18, 1.5, -0.38, 0.12); eye(m, 0.18, 1.5, -0.38, 0.12); for (let k = 0; k < 6; k++) { const a = k * 1.05; for (let j = 0; j < 3; j++) m.add(SPH, 0x8a4ae6, Math.cos(a) * (0.62 + j * 0.06), 1.1 - j * 0.22, Math.sin(a) * (0.62 + j * 0.06), 0, 0, 0, 0.18 - j * 0.03, 0.2, 0.18 - j * 0.03); } break; }
      case 'toiletto': { m.add(CYL, 0xf4f1ea, 0, 0.9, 0, 0, 0, 0, 0.8, 0.6, 0.9); m.add(TOR, 0xffffff, 0, 1.22, 0, Math.PI / 2, 0, 0, 0.4, 0.45, 0.4); m.box(0.8, 0.7, 0.3, 0xf4f1ea, 0, 1.5, 0.42); m.box(0.12, 0.05, 0.08, 0xc0c4ca, 0.3, 1.8, 0.3); m.add(CYL, 0x38bdf8, 0, 1.2, 0, 0, 0, 0, 0.56, 0.04, 0.6);
        for (const sx of [-1, 1]) { m.add(CYL, 0xc0c4ca, sx * 0.6, 1.0, 0.1, 0, 0, 0, 0.26, 0.9, 0.26); m.add(CONE, 0xe8453c, sx * 0.6, 1.55, 0.1, 0, 0, 0, 0.26, 0.24, 0.26); m.add(CONE, 0xff8a1a, sx * 0.6, 0.4, 0.1, Math.PI, 0, 0, 0.2, 0.4, 0.2); } eye(m, -0.15, 1.6, 0.26, 0.08); eye(m, 0.15, 1.6, 0.26, 0.08); break; }
      case 'pizzaro': { const c = 0x8b8f9c; m.add(SPH, c, 0, 0.75, 0.05, 0, 0, 0, 0.8, 0.7, 1.1); m.add(SPH, 0x5c6f8a, 0, 1.2, -0.45, 0, 0, 0, 0.5, 0.5, 0.5); m.box(0.12, 0.08, 0.22, 0xe0a030, 0, 1.15, -0.75); eye(m, -0.16, 1.3, -0.62, 0.08); eye(m, 0.16, 1.3, -0.62, 0.08); m.box(0.06, 0.32, 0.06, 0xe0a030, -0.15, 0.2, 0); m.box(0.06, 0.32, 0.06, 0xe0a030, 0.15, 0.2, 0);
        u.flap = []; for (const sx of [-1, 1]) { const w = new W.Merge(); w.add(GEO.CONE, 0xffc21f, sx * 0.55, 0, 0, 0, 0, sx * Math.PI / 2, 0.55, 1.1, 0.08); w.box(0.18, 0.12, 0.7, 0xd9a05b, sx * 0.08, 0, 0); for (const [px, pz] of [[0.4, -0.1], [0.65, 0.15], [0.85, -0.05]]) w.add(GEO.CYL8, 0xe8453c, sx * px, 0.03, pz, 0, 0, 0, 0.14, 0.02, 0.14); const wm = w.mesh(); const wg = new THREE.Group(); wg.position.set(sx * 0.3, 0.9, 0); wg.add(wm); g.add(wg); u.flap.push([wg, sx]); } break; }
      case 'lampo': { m.add(SPH, 0xfff3a0, 0, 1.1, 0, 0, 0, 0, 0.7, 0.8, 0.7); m.add(CYL, 0x5b5f66, 0, 1.6, 0, 0, 0, 0, 0.4, 0.2, 0.4); m.add(SPH, 0x8a7a6a, 0, 1.15, 0.38, 0, 0, 0, 0.3, 0.5, 0.3); m.add(SPH, 0xb9a88f, 0, 1.55, 0.36, 0, 0, 0, 0.26, 0.24, 0.24); eye(m, -0.08, 1.6, 0.18, 0.07); eye(m, 0.08, 1.6, 0.18, 0.07);
        u.flap = []; for (const sx of [-1, 1]) { const w = new W.Merge(); w.add(SPH, 0xb9a88f, sx * 0.45, 0, 0, 0, 0, 0, 0.9, 0.06, 0.7); w.add(SPH, 0x6b5a4a, sx * 0.5, 0.01, 0, 0, 0, 0, 0.25, 0.07, 0.25); const wg = new THREE.Group(); wg.position.set(sx * 0.2, 1.25, 0.4); wg.add(w.mesh()); g.add(wg); u.flap.push([wg, sx]); } break; }
      case 'sushi': { m.add(CYL, 0x1f2a24, 0, 0.55, 0, 0, 0, 0, 0.9, 0.8, 0.9); m.add(CYL, 0xffffff, 0, 0.96, 0, 0, 0, 0, 0.8, 0.04, 0.8); m.add(CYL, 0xff8a5c, 0, 0.98, 0, 0, 0, 0, 0.36, 0.05, 0.36); m.add(CYL, 0xe8453c, 0, 0.82, 0, 0, 0, 0, 0.92, 0.1, 0.92); m.box(0.05, 0.3, 0.05, 0xe8453c, 0.2, 0.85, 0.46, 0.4);
        eye(m, -0.15, 0.6, -0.42, 0.08); eye(m, 0.15, 0.6, -0.42, 0.08); m.box(0.16, 0.03, 0.02, 0xffffff, 0, 0.45, -0.45); m.box(0.08, 0.18, 0.08, 0x1f2a24, -0.18, 0.08, 0); m.box(0.08, 0.18, 0.08, 0x1f2a24, 0.18, 0.08, 0); break; }
      default: m.add(SPH, 0xff5c8a, 0, 0.5, 0, 0, 0, 0, 1, 1, 1);
    }
    const mesh = m.mesh(); mesh.scale.setScalar(sc); g.add(mesh);
    g.userData = Object.assign(u, { mesh, phase: Math.random() * 6 });
    return g;
  }
  C.model = critterModel;  // screenshots
  function rotSpot(minD, maxD) { const p = P(); const s = F.streetSpot ? F.streetSpot(p.x, p.z, minD, maxD) : W.randomWalkSpot(p.x, p.z, minD, maxD); return s && free(s.x, s.z) ? s : null; }
  function spawnCritter(id, x, z) {
    const d = CH.CRITTERS.find(c => c.id === id); if (!d) return null;
    const obj = critterModel(id); obj.position.set(x, gy(x, z), z); W.scene.add(obj);
    const c = { d, id, kind: 'critter', obj, x, z, tx: x, tz: z, t: 0, wait: rnd(0, 3), dead: 0, kids: [] };
    if (id === 'duck') for (let k = 0; k < 3; k++) { const b = new THREE.Group(), mm = new W.Merge(); mm.add(SPH, 0xffe066, 0, 0.14, 0, 0, 0, 0, 0.26, 0.24, 0.34); mm.add(SPH, 0xffe066, 0, 0.3, -0.12, 0, 0, 0, 0.18, 0.18, 0.18); mm.box(0.06, 0.03, 0.08, 0xff8a1a, 0, 0.28, -0.22); b.add(mm.mesh()); b.position.set(x, gy(x, z), z + k); W.scene.add(b); c.kids.push({ obj: b, x, z: z + k + 1 }); }
    C.critters.push(c);
    return c;
  }
  C.spawnCritter = spawnCritter;
  function spawnRot(id, x, z) {
    const d = CH.BRAINROT.find(b => b.id === id); if (!d) return null;
    const obj = critterModel(id); obj.position.set(x, gy(x, z), z); W.scene.add(obj);
    const r = { d, id, kind: 'rot', obj, x, z, tx: x, tz: z, t: 0, alt: d.fly ? rnd(3, 5) : 0, say: rnd(2, 5), life: 95 };
    C.rot.push(r);
    return r;
  }
  C.spawnRot = spawnRot;
  function removeCritter(c) { const l = c.kind === 'rot' ? C.rot : C.critters, i = l.indexOf(c); if (i >= 0) l.splice(i, 1); drop(c.obj); for (const k of c.kids || []) drop(k.obj); }
  function critterTick(dt) {
    const p = P(), night = save().clock >= 21 || save().clock < 5.5;
    critT -= dt;
    if (critT <= 0 && !calm() && onStory() && G.allow('critters')) {
      critT = 2.5;
      for (const c of C.critters.slice()) if (Math.hypot(c.x - p.x, c.z - p.z) > 150) removeCritter(c);
      if (C.critters.length < (LOW ? T.crittersLow : T.critters)) {
        const s = rotSpot(25, 80);
        if (s) { const pool = CH.CRITTERS.filter(c => !(c.id === 'cow' && Math.random() < 0.6)); spawnCritter(pick(pool).id, s.x, s.z); }
      }
    }
    rotT -= dt;
    if (rotT <= 0 && !calm() && onStory() && !quiet() && G.allow('brainrot')) {
      rotT = rnd(T.brainrot[0], T.brainrot[1]);
      if (C.rot.length < 2) {
        const pool = CH.BRAINROT.filter(b => (!b.night || night)), w = b => b.rar === 'legendary' ? 0.06 : b.rar === 'rare' ? 0.35 : 1;
        let tot = 0; for (const b of pool) tot += w(b);
        let r = Math.random() * tot, d = pool[0];
        for (const b of pool) { if (r < w(b)) { d = b; break; } r -= w(b); }
        const s = rotSpot(30, 80);
        if (s) {
          spawnRot(d.id, s.x, s.z);
          const known = st().dex[d.id];
          if (!known) { word('SOMETHING WEIRD NEARBY', 'pink', 'find the ❓ on the minimap · snap it with E'); U.feed('❓', 'A creature nobody can explain is nearby. Snap it for the Dex (E).'); }
          else U.feed(d.e, d.n + ' is around again');
        }
      }
    }
    for (const list of [C.critters, C.rot]) for (let i = list.length - 1; i >= 0; i--) {
      const c = list[i], d = c.d, u = c.obj.userData, dp = Math.hypot(c.x - p.x, c.z - p.z);
      c.t += dt; u.phase += dt * 4;
      if (c.kind === 'rot' && (c.t > c.life || dp > 200 || (c.snapped && c.t > c.snapped))) { if (dp < 80) W.burst(c.x, c.obj.position.y + 1, c.z, '✨', 8, { spread: 2, up: 3 }); removeCritter(c); continue; }
      let sp = 0;
      if (d.id === 'possum' && c.dead > 0) { c.dead -= dt; c.obj.rotation.z = Math.PI / 2; continue; }
      c.obj.rotation.z = 0;
      if (d.id === 'possum' && dp < 3 && !c.dead) { c.dead = 4; W.say(c.obj, '*plays dead*', 2.5); continue; }
      if (d.follow && (d.id === 'snail' || dp < 9)) { // the snail always comes for you; ducklings follow you once you're close
        c.tx = p.x; c.tz = p.z; sp = d.speed * (d.id === 'duck' ? 1.6 : 1);
        if (d.id === 'snail' && dp < 0.9 && !(c.got > G.rt.t)) { c.got = G.rt.t + 20; W.say(c.obj, 'Got you.', 2.5); W.pop(p.x, p.y + 2.6, p.z, 'THE SNAIL GOT YOU', '#c06a90', 0.9); C.aura(-1); }
      } else if (d.flee && dp < d.flee) { c.tx = c.x + (c.x - p.x) * 2; c.tz = c.z + (c.z - p.z) * 2; sp = d.speed * 2; }
      else if (c.kind === 'rot' && dp < 5) { c.tx = c.x + (c.x - p.x); c.tz = c.z + (c.z - p.z); sp = 2.2; }   // shy
      else { c.wait -= dt; if (c.wait <= 0) { c.wait = rnd(2, 6); const a = rnd(0, 6.283), r = rnd(2, 8); c.tx = c.x + Math.cos(a) * r; c.tz = c.z + Math.sin(a) * r; } sp = (d.speed || 2) * (c.kind === 'rot' ? 1.4 : 0.7); }
      const dx = c.tx - c.x, dz = c.tz - c.z, dd = Math.hypot(dx, dz);
      if (dd > 0.3 && sp > 0) {
        const k = Math.min(dd, sp * dt), e = { x: c.x + dx / dd * k, z: c.z + dz / dd * k };
        if (!(c.alt > 0)) W.collide(e, 0.4);
        c.x = e.x; c.z = e.z;
        const want = Math.atan2(-dx, -dz) + (d.sideways ? Math.PI / 2 : 0);
        c.obj.rotation.y += Math.atan2(Math.sin(want - c.obj.rotation.y), Math.cos(want - c.obj.rotation.y)) * Math.min(1, dt * 6);
      }
      const ground = gy(c.x, c.z);
      let y = ground;
      if (c.alt > 0) y += c.alt + Math.sin(u.phase * 0.5) * 0.5;
      else if (d.hop) y += Math.abs(Math.sin(u.phase * 1.2)) * 0.5;
      else if (sp > 0.3 && dd > 0.3) y += Math.abs(Math.sin(u.phase * 2)) * 0.08;
      c.obj.position.set(c.x, y, c.z);
      if (u.spin) u.spin.rotation.y += dt * 25;
      if (u.flap) for (const [wg, sx] of u.flap) wg.rotation.z = sx * Math.sin(u.phase * 3) * 0.6;
      if (c.kids) { let lx = c.x, lz = c.z; for (const k of c.kids) { const kx = k.x - lx, kz = k.z - lz, kd = Math.hypot(kx, kz); if (kd > 0.9) { k.x = lx + kx / kd * 0.9; k.z = lz + kz / kd * 0.9; } k.obj.position.set(k.x, gy(k.x, k.z) + Math.abs(Math.sin(u.phase * 3 + k.x)) * 0.05, k.z); k.obj.rotation.y = Math.atan2(-(lx - k.x), -(lz - k.z)); lx = k.x; lz = k.z; } }
      c.say = (c.say == null ? rnd(3, 8) : c.say) - dt;
      if (c.say <= 0 && dp < 18) { c.say = rnd(6, 12); W.say(c.obj, pick(d.say), 2.2); }
    }
  }
  function snap(c) {
    if (!c || c.snapped) return;
    const d = c.d, dex = st().dex, first = !dex[d.id];
    dex[d.id] = (dex[d.id] || 0) + 1;
    U.flash(); G.sfx.snap();
    api.bumpTo('dex', Object.keys(dex).length);
    const rar = d.rar || 'critter';
    if (first) {
      const pay = { critter: 10, common: 25, rare: 80, legendary: 400 }[rar] * (1 + G.level() * 0.06);
      G.addMoney(Math.round(pay), 'for the photo');
      G.addXp(rar === 'legendary' ? 400 : rar === 'rare' ? 120 : 40, 'explore');
      U.banner('📸 New in the Dex: ' + d.e + ' ' + d.n, d.line || pick(d.say), rar === 'legendary' ? 'level' : 'done');
      C.aura(rar === 'legendary' ? CH.AURA.legendary : CH.AURA.photo);
      if (rar === 'legendary') { U.confetti(); G.log('Photographed the ' + d.n, '👑'); }
    } else { G.addMoney(3, 'for another photo of ' + d.n); }
    C.add('photo');
    W.burst(c.x, c.obj.position.y + 1.2, c.z, '📸', 3, { spread: 1, up: 2, size: 0.6 });
    // a real photo (2026-11-19, the user: "is there a gallery? how am I collecting something?"): the first snap of each
    // creature is kept for the Dex app and goes into your Album; the feed says how many are left
    if (first) {
      U.feed('📸', 'Dex ' + Object.keys(dex).length + ' / ' + ALL_DEX.length + ': ' + d.n + ' (phone → 📸 Dex)');
      if (G.takePhoto) { const p = P(); W.cam.yaw = Math.atan2(-(c.x - p.x), -(c.z - p.z)); G.takePhoto('📸 Dex: ' + d.e + ' ' + d.n).then(url => { if (url) savePic(d.id, url); }).catch(() => {}); }
    }
    if (c.kind === 'rot') { c.snapped = c.t + 2.5; W.say(c.obj, pick(d.say), 2); }
    G.dirty();
  }
  C.snap = snap;
  // the Dex photos live in this browser (not in the save: pictures are big). Key per player, like the Album.
  const picKey = () => 'cityfuntime.dexpics.' + ((G.opts && G.opts.me && G.opts.me.id) || 'guest');
  let pics = null;
  C.dexPics = function () { if (!pics) { try { pics = JSON.parse(localStorage.getItem(picKey()) || '{}') || {}; } catch (e) { pics = {}; } } return pics; };
  function savePic(id, url) { const p = C.dexPics(); p[id] = url; try { localStorage.setItem(picKey(), JSON.stringify(p)); } catch (e) { /* storage full or blocked: the photo stays for this visit */ } }

  // ------------------------------------------------------------------ toys: piñatas, beach balls, sewer launchers, whoopee cushions, tube men
  function pinataModel(col) {
    const g = new THREE.Group(), post = new W.Merge();
    post.add(CYL, 0x8a5a2b, 0, 2.0, 0, 0, 0, 0, 0.14, 4.0, 0.14); post.box(1.6, 0.12, 0.12, 0x8a5a2b, 0.7, 3.95, 0); post.box(0.02, 0.9, 0.02, 0xf4f1ea, 1.4, 3.5, 0);
    g.add(post.mesh());
    const hang = new THREE.Group(), m = new W.Merge(), cols = CH.PINATA_COLS;
    m.box(1.0, 0.5, 0.5, col, 0, 0, 0); for (let k = 0; k < 5; k++) m.box(0.08, 0.52, 0.52, cols[(k + 1) % cols.length], -0.4 + k * 0.2, 0, 0);
    m.box(0.3, 0.55, 0.3, col, -0.55, 0.3, 0); m.box(0.4, 0.3, 0.3, col, -0.78, 0.55, 0); eye(m, -0.95, 0.62, -0.1, 0.05); eye(m, -0.95, 0.62, 0.1, 0.05);
    m.add(CONE, col, -0.65, 0.85, -0.08, 0, 0, 0.3, 0.08, 0.25, 0.08); m.add(CONE, col, -0.65, 0.85, 0.08, 0, 0, 0.3, 0.08, 0.25, 0.08);
    for (const [x, z] of [[-0.35, -0.15], [-0.35, 0.15], [0.35, -0.15], [0.35, 0.15]]) m.box(0.12, 0.35, 0.12, col, x, -0.38, z); m.box(0.3, 0.1, 0.1, cols[2], 0.55, 0.1, 0, 0, 0, -0.5);
    const mesh = m.mesh(); mesh.position.y = -0.6; hang.add(mesh); hang.position.set(1.4, 3.05, 0);
    g.add(hang); g.userData.hang = hang;
    return g;
  }
  function pinataHit(q, n) {
    q.hp -= n || 1; q.swing = 1.5;
    W.pop(q.x, q.y + 1, q.z, pick(['WHACK!', 'THWACK!', 'BONK!', 'CANDY?!']), '#ffc21f', 0.8);
    W.burst(q.x, q.y, q.z, '🎊', 3, { spread: 1.5, up: 2, size: 0.4 }); G.sfx.bonk();
    if (q.hp > 0) return;
    const i = C.pinatas.indexOf(q); if (i >= 0) C.pinatas.splice(i, 1);
    W.burst(q.x, q.y, q.z, '🍬', 10, { spread: 4, up: 6 }); W.burst(q.x, q.y, q.z, '🍭', 6, { spread: 3, up: 5, size: 0.5 }); W.burst(q.x, q.y, q.z, '🎉', 6, { spread: 3, up: 4 });
    W.pop(q.x, q.y + 1.6, q.z, 'PIÑATA!', '#ff5c8a', 1.3); SFX.pop(); W.shake(0.2);
    for (let k = 0; k < 5; k++) { const a = Math.random() * 6.28, r = 1 + Math.random() * 2.5; api.spawnPickup(k === 0 && Math.random() < 0.3 ? 'cash' : 'coin', q.bx + Math.cos(a) * r, q.bz + Math.sin(a) * r); }
    api.bump('pinatas'); C.add('pinata');
    if (G.rpg && Math.random() < 0.15) G.rpg.drop('crate');
    if (Math.random() < 0.12 && F.spawnMonster && !(window.CFT_TEST && window.CFT_TEST.noLuck)) { const mm = F.spawnMonster(pick(['slime', 'cone', 'bin']), q.bx, q.bz, { champ: true }); if (mm) W.pop(q.bx, q.y + 2.5, q.bz, 'IT WAS A MIMIC!', '#ff3b30', 1.2); }
    drop(q.obj);
    G.dirty();
  }
  C.pinataHit = pinataHit;
  function spawnPinata(x, z, yaw) {
    const obj = pinataModel(pick(CH.PINATA_COLS));
    yaw = yaw == null ? Math.random() * 6.28 : yaw;
    obj.position.set(x, gy(x, z), z); obj.rotation.y = yaw; W.scene.add(obj);
    const q = { obj, bx: x, bz: z, x: x + Math.cos(-yaw) * 1.4, z: z + Math.sin(-yaw) * 1.4, y: gy(x, z) + 2.45, hp: 3, swing: 0 };   // x, z = where it hangs (the arm's end)
    C.pinatas.push(q);
    return q;
  }
  C.spawnPinata = spawnPinata;
  const ballGeo = (() => { const geo = new THREE.IcosahedronGeometry(1, 2).toNonIndexed(), P2 = geo.attributes.position, cols = [0xff5c8a, 0xffffff, 0x38bdf8, 0xffffff, 0xffc21f, 0xffffff], c = new THREE.Color(), arr = [];
    for (let i = 0; i < P2.count; i += 3) { const x = (P2.getX(i) + P2.getX(i + 1) + P2.getX(i + 2)) / 3, y = (P2.getY(i) + P2.getY(i + 1) + P2.getY(i + 2)) / 3, z = (P2.getZ(i) + P2.getZ(i + 1) + P2.getZ(i + 2)) / 3;
      const sec = Math.abs(y) > 0.9 ? 1 : Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * 6) % 6; c.setHex(Math.abs(y) > 0.9 ? 0xffffff : cols[sec]); for (let k = 0; k < 3; k++) arr.push(c.r, c.g, c.b); }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3)); geo.computeVertexNormals(); return geo; })();
  const ballMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  function spawnBall(x, z) { const r = 0.9, mesh = new THREE.Mesh(ballGeo, ballMat); mesh.scale.setScalar(r); mesh.castShadow = !LOW; mesh.position.set(x, gy(x, z) + r, z); W.scene.add(mesh); const b = { obj: mesh, x, z, y: gy(x, z) + r, vx: 0, vy: 0, vz: 0, r }; C.balls.push(b); return b; }
  C.spawnBall = spawnBall;
  function ballTick(dt) {
    const p = P(), pv = W.player.vel;
    for (const b of C.balls) {
      const d = Math.hypot(b.x - p.x, b.z - p.z);
      if (d < b.r + 0.45 && Math.abs(b.y - (p.y + 0.9)) < b.r + 0.9 && onFoot()) { // running into it pushes it
        const sp = Math.hypot(pv.x, pv.z), nx = (b.x - p.x) / (d || 1), nz = (b.z - p.z) / (d || 1);
        b.vx = nx * Math.max(4, sp * 1.3); b.vz = nz * Math.max(4, sp * 1.3); b.vy = Math.max(b.vy, 2 + sp * 0.25);
        b.x = p.x + nx * (b.r + 0.46); b.z = p.z + nz * (b.r + 0.46);
        if (sp > 6 && !(b.cool > G.rt.t)) { b.cool = G.rt.t + 0.8; C.add('ball'); SFX.thump(); }
      }
      if (!onFoot() && d < b.r + 1.4) { const nx = (b.x - p.x) / (d || 1), nz = (b.z - p.z) / (d || 1), sp = Math.abs(W.player.speed); b.vx = nx * (sp + 6); b.vz = nz * (sp + 6); b.vy = 6 + sp * 0.3; if (!(b.cool > G.rt.t)) { b.cool = G.rt.t + 0.8; C.add('ball'); W.pop(b.x, b.y + 1.5, b.z, 'BOING!', '#38bdf8', 0.8); } }
      b.vy -= 22 * dt;
      const nx = b.x + b.vx * dt, nz = b.z + b.vz * dt;
      if (W.heightAt(nx, b.z)) b.vx = -b.vx * 0.7; else b.x = nx;
      if (W.heightAt(b.x, nz)) b.vz = -b.vz * 0.7; else b.z = nz;
      b.y += b.vy * dt;
      const g = gy(b.x, b.z) + b.r;
      if (b.y < g) { b.y = g; if (Math.abs(b.vy) > 1.5) { b.vy = Math.abs(b.vy) * 0.62; } else b.vy = 0; b.vx *= Math.exp(-1.6 * dt); b.vz *= Math.exp(-1.6 * dt); }
      const sp = Math.hypot(b.vx, b.vz);
      if (sp > 6) { // a fast ball bonks what it hits
        for (const m of F.monsters) if (!m.dead && Math.hypot(m.x - b.x, m.z - b.z) < m.r + b.r && !(m.ballT > G.rt.t)) { m.ballT = G.rt.t + 0.6; F.hitMonster(m, { dmg: 1.5 * D.calc.dmgMul(G.level()), type: 'bonk', knock: 8, stun: 1.5, word: 'BALL!', puff: '⭐' }, { x: b.vx / sp, z: b.vz / sp }); C.add('ball'); b.vx *= -0.5; b.vz *= -0.5; b.vy = 7; }
        for (const ped of W.life.peds) { const o = ped.obj.position; if (!ped.ctl && Math.hypot(o.x - b.x, o.z - b.z) < b.r + 0.4 && !(ped.chaosHit > G.rt.t - 2)) { ped.chaosHit = G.rt.t; W.holdPed(ped, 1.4, 'air'); W.say(ped.obj, pick(['BONK!', 'Nice shot!', 'My head!', 'GOOOAL?']), 1.8); } }
      }
      b.obj.position.set(b.x, b.y, b.z);
      if (sp > 0.05) { const ax = new THREE.Vector3(b.vz, 0, -b.vx).normalize(); b.obj.rotateOnWorldAxis(ax, -sp * dt / b.r); }
    }
  }
  function kickBall(b, f, w) { b.vx = f.x * 18; b.vz = f.z * 18; b.vy = 9; SFX.thump(); W.pop(b.x, b.y + 1.4, b.z, pick(['KICK!', 'YEET!', 'GOOOAL!', 'SENT IT!']), '#38bdf8', 0.9); C.add('ball'); api.bump('kicks'); }
  const holeGeo = new W.Merge(); holeGeo.add(CYL, 0x3a3d44, 0, 0, 0, 0, 0, 0, 1.4, 0.07, 1.4); holeGeo.add(CYL, 0x55585f, 0, 0.01, 0, 0, 0, 0, 1.2, 0.075, 1.2); for (let k = -2; k <= 2; k++) holeGeo.box(0.9, 0.08, 0.06, 0x2a2d33, 0, 0.012, k * 0.2);
  const holeMeshGeo = holeGeo.build();
  function spawnHole(x, z) { const mesh = new THREE.Mesh(holeMeshGeo, W.MAT_VC || new THREE.MeshLambertMaterial({ vertexColors: true })); mesh.position.set(x, gy(x, z) + 0.06, z); W.scene.add(mesh); const h = { obj: mesh, x, z, cool: 0, lid: 0 }; C.holes.push(h); return h; }
  C.spawnHole = spawnHole;
  function holeTick(dt) {
    const p = P(), pl = W.player;
    for (const h of C.holes) {
      h.cool -= dt;
      if (h.lid > 0) { h.lid -= dt; h.obj.position.y = gy(h.x, h.z) + 0.06 + Math.max(0, Math.sin((1 - h.lid) * Math.PI)) * 3; h.obj.rotation.x += dt * 12; } else { h.obj.position.y = gy(h.x, h.z) + 0.06; h.obj.rotation.x = 0; }
      if (Math.random() < dt * 0.5) W.burst(h.x, gy(h.x, h.z) + 0.3, h.z, '💨', 1, { spread: 0.3, up: 1.5, size: 0.6, life: 1.2, grav: -1 });
      if (h.cool <= 0 && onFoot() && pl.grounded && Math.hypot(h.x - p.x, h.z - p.z) < 1.1) {
        h.cool = 4; h.lid = 1;
        pl.vy = 25; pl.grounded = false; pl.jumps = 1;
        W.burst(h.x, gy(h.x, h.z) + 0.5, h.z, '💨', 10, { spread: 2, up: 9, size: 0.8 }); W.burst(h.x, gy(h.x, h.z) + 0.5, h.z, '💩', 2, { spread: 1.5, up: 8, size: 0.5 });
        W.pop(p.x, p.y + 3, p.z, pick(['THE SEWER BURPED!', 'YEEEET!', 'TO THE MOON!', 'MANHOLE LAUNCH!']), '#ffc21f', 1.1);
        SFX.boom(); W.shake(0.3); api.bump('launches'); C.add('launch');
      }
    }
  }
  function spawnCushion(x, z) { const mesh = build(m => { m.add(SPH, 0xff8fb8, 0, 0.1, 0, 0, 0, 0, 1.0, 0.2, 1.0); m.add(SPH, 0xffb3cf, -0.15, 0.17, -0.1, 0, 0, 0, 0.3, 0.05, 0.3); m.add(CYL, 0xff5c8a, 0, 0.1, -0.55, Math.PI / 2, 0, 0, 0.18, 0.2, 0.18); }); mesh.position.set(x, gy(x, z), z); mesh.rotation.y = Math.random() * 6.28; W.scene.add(mesh); const c = { obj: mesh, x, z }; C.cushions.push(c); return c; }
  C.spawnCushion = spawnCushion;
  function cushionTick() {
    const p = P();
    for (let i = C.cushions.length - 1; i >= 0; i--) {
      const c = C.cushions[i];
      if (onFoot() && W.player.grounded && Math.hypot(c.x - p.x, c.z - p.z) < 0.9) {
        fartSound(0.9, 0.25);
        W.pop(p.x, p.y + 2.6, p.z, 'BRAAAAAP!', '#ff8fb8', 1.1); W.burst(c.x, gy(c.x, c.z) + 0.3, c.z, '💨', 8, { spread: 2, up: 1, size: 0.7, life: 1.2 });
        for (const ped of W.life.peds) { const o = ped.obj.position; if (!ped.ctl && Math.hypot(o.x - p.x, o.z - p.z) < 14) { W.holdPed(ped, 1.6, Math.random() < 0.5 ? 'dance' : 'air'); if (Math.random() < 0.5) W.say(ped.obj, pick(['HAHAHA', 'Classic.', 'The oldest trick!', 'LMAO', 'Who left that there?!']), 1.8); } }
        api.bump('cushions'); C.add('cushion');
        drop(c.obj); C.cushions.splice(i, 1);
      }
    }
  }
  function tubeModel(col) {
    const g = new THREE.Group(), base = new W.Merge(); base.box(0.7, 0.45, 0.7, 0x33373f, 0, 0.22, 0); base.add(CYL, 0x5b5f66, 0, 0.47, 0, 0, 0, 0, 0.5, 0.06, 0.5); g.add(base.mesh());
    let parent = g, segs = [];
    for (let k = 0; k < 4; k++) {
      const sg = new THREE.Group(), m = new W.Merge();
      m.add(CYL, col, 0, 0.45, 0, 0, 0, 0, 0.42 - k * 0.03, 0.9, 0.42 - k * 0.03);
      if (k === 1) for (const sx of [-1, 1]) m.add(CYL, col, sx * 0.45, 0.6, 0, 0, 0, sx * 1.2, 0.16, 0.8, 0.16);
      if (k === 3) { eye(m, -0.09, 0.65, -0.17, 0.08); eye(m, 0.09, 0.65, -0.17, 0.08); m.box(0.2, 0.04, 0.03, 0x1f1a3d, 0, 0.45, -0.2); for (let h = 0; h < 4; h++) m.add(CONE, 0x1f1a3d, -0.12 + h * 0.08, 0.98, 0, 0, 0, (h - 1.5) * 0.4, 0.06, 0.2, 0.06); }
      sg.add(m.mesh()); sg.position.y = k === 0 ? 0.5 : 0.9; parent.add(sg); segs.push(sg); parent = sg;
    }
    g.userData.segs = segs; g.userData.phase = Math.random() * 6;
    return g;
  }
  function tubeTick(dt) {
    for (const t of C.tubes) {
      const u = t.obj.userData; u.phase += dt * (t.wild > 0 ? 9 : 5);
      if (t.wild > 0) t.wild -= dt;
      u.segs.forEach((sg, k) => { const a = (0.25 + k * 0.12) * (t.wild > 0 ? 1.8 : 1); sg.rotation.z = Math.sin(u.phase + k * 0.9) * a; sg.rotation.x = Math.cos(u.phase * 0.8 + k * 1.3) * a * 0.6; });
    }
  }
  function toyTick(dt) {
    toyT -= dt;
    if (toyT > 0) return;
    toyT = 2;
    const p = P(), far = (o, r) => Math.hypot(o.x - p.x, o.z - p.z) > r;
    for (const [list, r] of [[C.pinatas, 220], [C.balls, 200], [C.holes, 200], [C.cushions, 200], [C.tubes, 170]]) for (let i = list.length - 1; i >= 0; i--) if (far(list[i], r)) { drop(list[i].obj); list.splice(i, 1); }
    if (calm() || !onStory() || !G.allow('toys')) return;
    if (C.pinatas.length < T.pinatas) {
      const a = W.findArea && Math.random() < 0.5 ? W.findArea(['park', 'plaza', 'playground', 'grass'], 300) : null;
      let s = a && Math.hypot(a.x - p.x, a.z - p.z) < 170 && Math.hypot(a.x - p.x, a.z - p.z) > 20 ? { x: a.x + rnd(-6, 6), z: a.z + rnd(-6, 6) } : rotSpot(30, 150);
      if (s && free(s.x, s.z) && !W.roadAt(s.x, s.z) && C.pinatas.every(q => Math.hypot(q.bx - s.x, q.bz - s.z) > 30)) spawnPinata(s.x, s.z);
    }
    if (C.balls.length < T.balls) { const s = rotSpot(20, 140); if (s && free(s.x, s.z)) spawnBall(s.x + rnd(-2, 2), s.z + rnd(-2, 2)); }
    if (C.holes.length < T.manholes) { const ag = W.agentOn(p.x, p.z, true); if (ag) { let left = rnd(30, 140); while (left > 0) { W.agentAdvance(ag, Math.min(12, left), true); left -= 12; } const q = W.agentPoint(ag); if (q && C.holes.every(h => Math.hypot(h.x - q.x, h.z - q.z) > 40) && Math.hypot(q.x - p.x, q.z - p.z) > 15) spawnHole(q.x, q.z); } }
    if (C.cushions.length < T.cushions) { const s = W.randomWalkSpot(p.x, p.z, 20, 140); if (s && C.cushions.every(c => Math.hypot(c.x - s.x, c.z - s.z) > 30)) spawnCushion(s.x, s.z); }
    if (C.tubes.length < T.tubes) {
      const shops = W.places.filter(pl => pl.made && pl.pin && Math.hypot(pl.pin.x - p.x, pl.pin.z - p.z) < 130 && Math.hypot(pl.pin.x - p.x, pl.pin.z - p.z) > 15 && !C.tubes.some(t => t.id === pl.id));
      if (shops.length) {
        const pl = pick(shops), dx = pl.pin.x - pl.x, dz = pl.pin.z - pl.z, d = Math.hypot(dx, dz) || 1, sd = Math.random() < 0.5 ? 1 : -1;
        const x = pl.pin.x - dz / d * 2.5 * sd, z = pl.pin.z + dx / d * 2.5 * sd;
        if (!W.heightAt(x, z) && !W.roadAt(x, z)) { const obj = tubeModel(pick(CH.TUBE_COLS)); obj.position.set(x, gy(x, z), z); obj.rotation.y = Math.atan2(dx, dz); W.scene.add(obj); C.tubes.push({ obj, x, z, id: pl.id, wild: 0 }); }
      }
    }
  }
  // F swings that didn't hit a figment: piñatas, beach balls, tube men, event balloons
  C.meleeHit = function (p, f, w) {
    const reach = (w.reach || 2.2) + 0.8;
    for (const q of C.pinatas) { const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz); if (d < reach + 0.6 && (dx * f.x + dz * f.z) / (d || 1) > 0 && Math.abs(q.y - (p.y + 1.6)) < 1.8) { pinataHit(q, 1); return true; } }
    for (const b of C.balls) { const dx = b.x - p.x, dz = b.z - p.z, d = Math.hypot(dx, dz); if (d < reach + b.r && (dx * f.x + dz * f.z) / (d || 1) > 0) { kickBall(b, f, w); return true; } }
    if (C.ev && C.ev.balloons) for (const b of C.ev.balloons) { const d = Math.hypot(b.x - p.x, b.z - p.z); if (!b.dead && d < reach + 0.5 && Math.abs(b.y - (p.y + 1.5)) < 2.2) { popBalloon(b); return true; } }
    for (const t of C.tubes) { const d = Math.hypot(t.x - p.x, t.z - p.z); if (d < reach + 0.5) { t.wild = 3; W.pop(t.x, gy(t.x, t.z) + 4, t.z, pick(['WACKY!', 'FLAIL!', 'WOOOO!', '*inflatable noises*']), '#ff5c8a', 0.9); G.sfx.boing(); C.add('hit'); return true; } }
    return false;
  };

  // ------------------------------------------------------------------ the sky: blimps with banners, hot-air balloons, a sky whale
  function blimpModel(text) {
    const g = new THREE.Group(), m = new W.Merge();
    m.add(SPH, 0xd6dbe3, 0, 0, 0, 0, 0, 0, 7, 5, 18); m.add(SPH, 0xff5c8a, 0, 0, 0, 0, 0, 0, 7.1, 1.2, 18.1); m.box(2, 1.2, 4, 0x33373f, 0, -2.9, -1);
    for (const [rx, rz] of [[0, 0], [0, Math.PI / 2], [0, Math.PI], [0, -Math.PI / 2]]) m.add(CONE, 0xff5c8a, Math.sin(rz) * 2.2, Math.cos(rz) * 2.2, 8, Math.PI / 2, 0, rz, 0.4, 3.4, 2.4);
    g.add(m.mesh());
    for (const sx of [-1, 1]) { const l = W.label(text, { size: 60, height: 2.6, bg: 'rgba(255,194,31,.96)', fg: '#1f1a3d', border: '#1f1a3d' }); l.position.set(sx * 4, 0, 0); g.add(l); }
    return g;
  }
  function balloonModel() {
    const g = new THREE.Group(), cols = [0xff5c8a, 0xffc21f, 0x38bdf8, 0x35e06a, 0x9b5cf6, 0xff8a3d], a = pick(cols), b = pick(cols);
    const geo = new THREE.SphereGeometry(5, 16, 12).toNonIndexed(), P2 = geo.attributes.position, c1 = new THREE.Color(a), c2 = new THREE.Color(b), arr = [];
    for (let i = 0; i < P2.count; i += 3) { const x = P2.getX(i) + P2.getX(i + 1) + P2.getX(i + 2), z = P2.getZ(i) + P2.getZ(i + 1) + P2.getZ(i + 2), c = Math.floor((Math.atan2(z, x) + Math.PI) / (Math.PI / 4)) % 2 ? c1 : c2; for (let k = 0; k < 3; k++) arr.push(c.r, c.g, c.b); }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3)); geo.computeVertexNormals();
    const env = new THREE.Mesh(geo, ballMat); env.scale.set(1, 1.2, 1); g.add(env);
    const m = new W.Merge(); m.box(1.6, 1.2, 1.6, 0x9a6a3c, 0, -8, 0); for (const [x, z] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) m.box(0.05, 3.2, 0.05, 0x5b4636, x, -6, z); m.add(CONE, 0xff8a1a, 0, -5.7, 0, 0, 0, 0, 0.5, 0.8, 0.5); g.add(m.mesh());
    return g;
  }
  function whaleModel() {
    const g = new THREE.Group(), m = new W.Merge(), c = 0x4f7fd9, w = 0xe9f1ff;
    m.add(SPH, c, 0, 0, 0, 0, 0, 0, 8, 6, 20); m.add(SPH, w, 0, -1.6, -1, 0, 0, 0, 6.5, 3.2, 16); m.add(CONE, c, 0, 0.6, 11, Math.PI / 2, 0, 0, 2.2, 5, 1.2);
    m.box(9, 0.6, 3, c, 0, 0.8, 13.5); m.add(CONE, c, -4, -1.5, -2, 0, 0, 1.2, 1.2, 4, 0.5); m.add(CONE, c, 4, -1.5, -2, 0, 0, -1.2, 1.2, 4, 0.5);
    eye(m, -3.3, 0.5, -7.5, 0.7); eye(m, 3.3, 0.5, -7.5, 0.7); m.box(4, 0.2, 0.2, 0x1f2a4a, 0, -1.2, -9.6);
    g.add(m.mesh());
    return g;
  }
  function skyTick(dt) {
    skyT -= dt;
    const p = P();
    for (let i = C.sky.length - 1; i >= 0; i--) {
      const s = C.sky[i];
      s.x += s.vx * dt; s.z += s.vz * dt; s.t += dt;
      s.obj.position.set(s.x, s.y + Math.sin(s.t * 0.4) * (s.kind === 'whale' ? 2 : 0.8), s.z);
      if (s.kind === 'whale') { s.obj.rotation.z = Math.sin(s.t * 0.5) * 0.08; if (Math.random() < dt * 0.15) W.burst(s.x, s.y + 6, s.z, '💦', 8, { spread: 2, up: 9, size: 1.4, life: 2, grav: 6 }); }
      if (Math.hypot(s.x - p.x, s.z - p.z) > 520) { drop(s.obj); C.sky.splice(i, 1); }
    }
    if (skyT > 0 || calm() || !G.allow('sky')) return;
    skyT = 3;
    const count = k => C.sky.filter(s => s.kind === k).length;
    const add = (kind, obj, y, speed) => {
      const a = rnd(0, 6.283), r = rnd(160, 360), x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r, h = rnd(0, 6.283);
      obj.position.set(x, gy(p.x, p.z) + y, z); obj.rotation.y = Math.atan2(-Math.cos(h), -Math.sin(h)) + Math.PI;
      obj.traverse(c => { if (c.isMesh) c.castShadow = false; });
      W.scene.add(obj);
      C.sky.push({ kind, obj, x, z, y: gy(p.x, p.z) + y, vx: Math.cos(h) * speed, vz: Math.sin(h) * speed, t: 0 });
      obj.rotation.y = Math.atan2(-Math.cos(h), -Math.sin(h));
    };
    if (count('blimp') < (LOW ? 1 : 2)) add('blimp', blimpModel(pick(CH.BLIMPS)), rnd(55, 75), rnd(3, 5));
    if (count('balloon') < (LOW ? 1 : 3)) add('balloon', balloonModel(), rnd(35, 80), rnd(1, 2.5));
    if (!count('whale') && Math.random() < 0.04) { add('whale', whaleModel(), rnd(70, 90), 2.5); U.feed('🐋', 'Is that... a whale? In the sky? Sure. Why not.'); }
  }

  // screenshots and the play-test panel: put one of each where you want it
  C.spawnSky = function (kind, x, y, z) { const obj = kind === 'blimp' ? blimpModel(pick(CH.BLIMPS)) : kind === 'whale' ? whaleModel() : balloonModel(); obj.position.set(x, y, z); W.scene.add(obj); C.sky.push({ kind, obj, x, z, y, vx: 0, vz: 0, t: 0 }); return obj; };
  C.spawnTube = function (x, z) { const obj = tubeModel(pick(CH.TUBE_COLS)); obj.position.set(x, gy(x, z), z); W.scene.add(obj); const t = { obj, x, z, id: 'test:' + C.tubes.length, wild: 0 }; C.tubes.push(t); return t; };
  // ------------------------------------------------------------------ street events (cft-fun.js runs the timer; D.EVENTS with chaos: true)
  C.ev = null;
  function balloonMesh(col) { return build(m => { m.add(SPH, col, 0, 0, 0, 0, 0, 0, 0.9, 1.05, 0.9); m.add(SPH, 0xffffff, 0.15, 0.2, -0.15, 0, 0, 0, 0.2, 0.25, 0.2); m.add(CONE, col, 0, -0.55, 0, Math.PI, 0, 0, 0.14, 0.12, 0.14); m.box(0.02, 1.2, 0.02, 0xf4f1ea, 0, -1.2, 0); }); }
  function popBalloon(b) {
    if (b.dead) return;
    b.dead = true; SFX.pop();
    W.burst(b.x, b.y, b.z, '🎉', 4, { spread: 1.5, up: 2, size: 0.45 }); W.pop(b.x, b.y + 0.8, b.z, 'POP!', '#ff5c8a', 0.8);
    api.spawnPickup('coin', b.x, b.z); C.add('hit'); api.bump('popped');
    drop(b.obj);
  }
  C.startEvent = function (id, ev) {
    const p = P(), spot = (a, b) => (F.streetSpot ? F.streetSpot(p.x, p.z, a, b) : W.randomWalkSpot(p.x, p.z, a, b));
    ev.objs = ev.objs || [];
    if (id === 'ohio') { ev.secs = 25; ev.e = '🌀'; W.gravMul = 0.28; }
    else if (id === 'glitch') {
      const peds = W.life.peds.filter(q => !q.ctl && Math.hypot(q.obj.position.x - p.x, q.obj.position.z - p.z) < 45).slice(0, 14);
      if (peds.length < 2) return false;
      ev.secs = 16; ev.e = '🖥️'; ev.peds = peds;
      for (const q of peds) { q.ctl = true; q.keep = true; }
      shell.classList.add('cft-glitch');
    } else if (id === 'catsdogs') {
      ev.secs = 35; ev.e = '🐈'; ev.pets = []; ev.drop = 0;
    } else if (id === 'cheese') {
      ev.secs = 28; ev.e = '🧀'; ev.wedges = []; ev.drop = 0;
    } else if (id === 'sixseven') {
      const peds = W.life.peds.filter(q => !q.ctl && q.type !== 'bike' && Math.hypot(q.obj.position.x - p.x, q.obj.position.z - p.z) < 60).sort((a, b) => (W.isKid(b.look, b.type) ? 1 : 0) - (W.isKid(a.look, a.type) ? 1 : 0)).slice(0, 7);
      if (peds.length < 3) return false;
      ev.secs = 30; ev.e = '🖐️'; ev.peds = peds; ev.x = p.x; ev.z = p.z;
      peds.forEach((q, i) => { q.ctl = true; q.keep = true; q.e67 = { x: q.obj.position.x, z: q.obj.position.z, obj: q.obj }; q.a67 = i / peds.length * 6.283; });
    } else if (id === 'balloons') {
      const c = spot(18, 40); if (!c) return false;
      ev.secs = 40; ev.e = '🎈'; ev.x = c.x; ev.z = c.z; ev.balloons = [];
      for (let i = 0; i < 24; i++) { const col = pick(CH.TUBE_COLS), obj = balloonMesh(col), x = c.x + rnd(-6, 6), z = c.z + rnd(-6, 6), y = gy(x, z) + rnd(0.5, 4); obj.position.set(x, y, z); W.scene.add(obj); ev.balloons.push({ obj, x, y, z, vy: rnd(0.4, 1.1), ph: Math.random() * 6 }); }
    } else return false;
    C.ev = ev;
    return true;
  };
  C.updateEvent = function (ev, dt) {
    const p = P();
    if (ev.id === 'ohio') { if (Math.random() < dt * 3) W.burst(p.x + rnd(-8, 8), p.y + rnd(0, 4), p.z + rnd(-8, 8), pick(['🌀', '✨', '🪐']), 1, { spread: 0.5, up: 1, grav: -1, life: 1.5 }); if (!W.player.grounded && W.player.vy > 5 && !ev.air) { ev.air = true; C.add('bounce'); } if (W.player.grounded) ev.air = false; }
    else if (ev.id === 'glitch') {
      for (const q of ev.peds) { const u = q.fig && q.fig.userData; if (u && u.armL) { u.armL.rotation.set(0, 0, 1.45); u.armR.rotation.set(0, 0, -1.45); if (u.elbowL) { u.elbowL.rotation.set(0, 0, 0); u.elbowR.rotation.set(0, 0, 0); } if (u.legL) { u.legL.rotation.set(0, 0, 0); u.legR.rotation.set(0, 0, 0); } } q.obj.rotation.y += Math.sin(ev.t * 7 + q.obj.position.x) * dt * 0.5; }
      if (Math.random() < dt * 1.2) { const q = pick(ev.peds); W.say(q.obj, pick(['NPC.exe has stopped responding', 'Loading dialogue...', '404: personality not found', 'T-POSE TO ASSERT DOMINANCE', '[placeholder text]', 'Error: too much aura nearby']), 2.2); }
    } else if (ev.id === 'catsdogs') {
      ev.drop -= dt;
      if (ev.drop <= 0 && ev.t < ev.secs - 8 && ev.pets.length < 14) {
        ev.drop = 1.2; const a = rnd(0, 6.283), r = rnd(5, 22), x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
        if (!W.heightAt(x, z)) { const cat = Math.random() < 0.5, obj = W.animal(cat ? 'cat' : 'dog', pick(cat ? [0xff9f43, 0x2b2b2b, 0xf4f1ea, 0x9a9aa2] : [0xc8894a, 0x2b2b2b, 0xf0e6d6, 0x8a5a2b])); obj.position.set(x, gy(x, z) + 22, z); W.scene.add(obj); ev.objs.push(obj); ev.pets.push({ obj, x, z, y: gy(x, z) + 22, vy: 0, cat, landed: false }); }
      }
      for (const a of ev.pets) {
        if (!a.landed) { a.vy -= 12 * dt; a.y += a.vy * dt; a.obj.rotation.z += dt * 6; if (a.y <= gy(a.x, a.z)) { a.landed = true; a.y = gy(a.x, a.z); a.obj.rotation.z = 0; W.burst(a.x, a.y + 0.3, a.z, '💨', 3, { spread: 1, up: 1 }); W.say(a.obj, a.cat ? pick(['MEOW?!', 'I landed on my feet. Obviously.', 'Mrrp.']) : pick(['WOOF!', 'Again! AGAIN!', 'Arf!']), 1.8); } a.obj.position.set(a.x, a.y, a.z); continue; }
        const d = Math.hypot(a.x - p.x, a.z - p.z);
        if (!a.petted && d < 1.4) { a.petted = true; G.addHappy(1); W.burst(a.x, a.y + 1, a.z, '💕', 3, { spread: 1, up: 2, size: 0.5 }); W.say(a.obj, a.cat ? '*purrrr*' : '*happy wiggle*', 1.6); api.bump('pets'); C.add('hit'); }
        const e = { x: a.x, z: a.z, obj: a.obj }, tx = a.petted ? a.x + (a.x - p.x) : p.x + Math.cos(ev.t + a.x) * 2.5, tz = a.petted ? a.z + (a.z - p.z) : p.z + Math.sin(ev.t + a.z) * 2.5;
        const dx = tx - a.x, dz = tz - a.z, dd = Math.hypot(dx, dz); if (dd > 0.5) { const k = Math.min(dd, (a.cat ? 5 : 7) * dt); e.x += dx / dd * k; e.z += dz / dd * k; W.collide(e, 0.3); a.x = e.x; a.z = e.z; a.obj.rotation.y = Math.atan2(-dx, -dz); }
        a.y = gy(a.x, a.z); a.obj.position.set(a.x, a.y, a.z); W.animate(a.obj, dd > 0.5 ? 5 : 0, dt);
      }
    } else if (ev.id === 'cheese') {
      ev.drop -= dt;
      if (ev.drop <= 0 && ev.t < ev.secs - 4) {
        ev.drop = 0.7; const a = rnd(0, 6.283), r = rnd(3, 26), x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
        if (!W.heightAt(x, z)) {
          const obj = build(m => { m.add(GEO.CYL, 0xffd23f, 0, 0, 0, 0, 0, Math.PI / 2, 1.1, 0.8, 1.1); for (const [hx, hy, hz] of [[0.2, 0.1, -0.4], [-0.1, -0.15, -0.42], [0.35, -0.2, 0.3], [-0.3, 0.2, 0.35]]) m.add(SPH, 0xe0a800, hx, hy, hz, 0, 0, 0, 0.18, 0.18, 0.1); });
          const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.2, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.7, depthWrite: false }));
          ring.position.set(x, gy(x, z) + 0.12, z); W.scene.add(ring); obj.position.set(x, gy(x, z) + 40, z); W.scene.add(obj);
          ev.wedges.push({ obj, ring, x, z, y: gy(x, z) + 40, vy: -18, landed: false }); ev.objs.push(obj, ring);
        }
      }
      for (const wd of ev.wedges) {
        if (wd.got) continue;
        if (!wd.landed) {
          wd.y += wd.vy * dt; wd.obj.rotation.x += dt * 4; wd.obj.position.y = wd.y;
          if (wd.y <= gy(wd.x, wd.z) + 0.5) { wd.landed = true; wd.y = gy(wd.x, wd.z) + 0.5; wd.obj.position.y = wd.y; wd.obj.rotation.x = 0; wd.ring.visible = false; W.burst(wd.x, wd.y, wd.z, '🧀', 5, { spread: 2, up: 3, size: 0.5 }); SFX.thump();
            if (Math.hypot(wd.x - p.x, wd.z - p.z) < 1.6) { F.hurt(3); W.pop(p.x, p.y + 2.6, p.z, 'CHEESED!', '#ffd23f', 1.1); } else if (Math.hypot(wd.x - p.x, wd.z - p.z) < 12) W.shake(0.12); }
        } else if (Math.hypot(wd.x - p.x, wd.z - p.z) < 1.4) { wd.got = true; drop(wd.obj); G.addMoney(Math.round(3 * (1 + G.level() * 0.08)), '🧀 cheese'); G.sfx.coin(); C.add('hit'); }
      }
    } else if (ev.id === 'sixseven') {
      ev.x += (p.x - ev.x) * Math.min(1, dt * 0.8); ev.z += (p.z - ev.z) * Math.min(1, dt * 0.8);
      for (const q of ev.peds) {
        if (!q.obj.parent) continue;
        const a = q.a67 + ev.t * 0.3, tx = ev.x + Math.cos(a) * 3.4, tz = ev.z + Math.sin(a) * 3.4, e = q.e67;
        const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz);
        if (d > 0.4) { const k = Math.min(d, 4 * dt); e.x += dx / d * k; e.z += dz / d * k; W.collide(e, 0.4); q.obj.position.set(e.x, gy(e.x, e.z), e.z); q.obj.rotation.y = Math.atan2(-dx, -dz); W.animate(q.fig, 4, dt); }
        else { q.obj.rotation.y = Math.atan2(e.x - p.x, e.z - p.z); W.animate(q.fig, 0, dt, Math.floor(ev.t * 2 + q.a67) % 2 ? 'wave' : 'dance'); }
      }
      if (Math.random() < dt * 1.6) { const q = pick(ev.peds); W.say(q.obj, pick(CH.KIDS), 1.6); }
      if (Math.random() < dt * 2) W.burst(ev.x + rnd(-3, 3), gy(ev.x, ev.z) + 2.5, ev.z + rnd(-3, 3), pick(['6️⃣', '7️⃣', '🖐️']), 1, { spread: 0.5, up: 2, grav: 1, life: 1.2 });
    } else if (ev.id === 'balloons') {
      for (const b of ev.balloons) { if (b.dead) continue; b.y += b.vy * dt; b.x += Math.sin(ev.t * 0.7 + b.ph) * dt * 0.6; b.obj.position.set(b.x, b.y, b.z); b.obj.rotation.z = Math.sin(ev.t * 1.4 + b.ph) * 0.15; if (b.y > gy(b.x, b.z) + 32) { b.dead = true; drop(b.obj); } }
      if (ev.balloons.every(b => b.dead)) return true;
    }
    return false;
  };
  C.endEvent = function (ev) {
    if (ev.id === 'ohio') W.gravMul = 1;
    if (ev.id === 'glitch') shell.classList.remove('cft-glitch');
    if (ev.peds) for (const q of ev.peds) { q.ctl = false; q.keep = false; const a = W.agentOn(q.obj.position.x, q.obj.position.z, false); if (a && q.a) { a.off = q.a.off; q.a = a; } }
    if (ev.balloons) for (const b of ev.balloons) if (!b.dead) { b.dead = true; drop(b.obj); }
    if (ev.wedges) for (const w of ev.wedges) { drop(w.obj); drop(w.ring); }
    if (ev.id === 'catsdogs') { const n = ev.pets.filter(a => a.petted).length; if (n) U.feed('🐾', 'You petted ' + n + ' falling animal' + (n === 1 ? '' : 's') + '. The best kind of weather.'); }
    if (C.ev === ev) C.ev = null;
  };
  async function join67() {
    const ev = C.ev;
    if (!ev || ev.id !== 'sixseven' || ev.joined || quiet()) return;
    ev.joined = true;
    W.pose = 'wave';
    later(2200, () => { W.pose = null; });
    const p = P();
    W.pop(p.x, p.y + 3, p.z, 'SIX SEVEN!!', '#ffc21f', 1.5);
    word('SIX SEVEN!', 'violet', 'the block went wild', true);
    for (const q of ev.peds) W.say(q.obj, pick(['SIX SEVEN!!', 'LEGEND!', 'Aura +67!', 'THEY KNOW!!']), 2);
    G.addMoney(67, 'from the six-seven crew'); C.aura(67); C.add('combo', 3); api.bump('sixseven'); U.confetti();
    if (F.event && F.event.chaos === true && F.event.id === 'sixseven') F.event.secs = Math.min(F.event.secs, F.event.t + 5);
  }

  // ------------------------------------------------------------------ hooks for the game
  C.interaction = function (p) {
    if (C.ev && C.ev.id === 'sixseven' && !C.ev.joined) return { t: '🖐️ Do the six-seven', fn: join67 };
    let best = null, bd = 99;
    for (const c of C.rot) { if (c.snapped) continue; const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < 11 && d < bd) { bd = d; best = c; } }
    if (best) return { t: '📸 Snap the ' + (st().dex[best.d.id] ? best.d.n : '??? (new for your Dex!)'), fn: () => snap(best) };
    for (const c of C.critters) { const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < 4.5 && d < bd) { bd = d; best = c; } }
    if (best) return { t: '📸 Snap the ' + best.d.n.toLowerCase().replace(/^a cow\? here\?$/, 'cow (?)') + (st().dex[best.d.id] ? '' : ' (new for your Dex!)'), fn: () => snap(best) };
    const potty = W.propNear && W.propNear(p.x, p.z, 2.2, { kind: 'potty' });
    if (potty && onFoot() && hideT <= 0) return { t: '🚽 Hide in the porta-potty', fn: () => hide(potty) };
    return null;
  };
  C.markers = function (out) {
    for (const c of C.rot) out.push({ x: c.x, z: c.z, color: c.d.rar === 'legendary' ? '#ffd23f' : '#ff5c8a', r: 6.5, emoji: st().dex[c.d.id] ? c.d.e : '❓', ring: '#1f1a3d', edge: true });
    for (const q of C.pinatas) out.push({ x: q.bx, z: q.bz, color: '#ffc21f', r: 4, emoji: '🪅', ring: '#1f1a3d' });
    for (const h of C.hoops) out.push({ x: h.x, z: h.z, color: '#ffd23f', r: 4, ring: '#1f1a3d' });
  };
  C.speedMul = () => (lagT > 0 ? 0.55 : 1) * (flying === 'glide' ? T.glideSpeed : 1);
  C.flying = () => flying;
  C.fuel = () => fuel;
  C.hiding = () => hideT > 0;
  C.summary = function () {
    const c = st(), s = save(), k = s.counters;
    const dex = ALL_DEX.map(d => ({ id: d.id, n: d.n, e: d.e, rar: d.rar || 'neighbour', kind: d.kind, got: c.dex[d.id] || 0, line: d.line || '', night: !!d.night, fly: !!d.fly }));
    const ranged = Object.keys(s.owned).filter(id => s.owned[id] && D.ITEMS[id] && D.ITEMS[id].weapon && (D.ITEMS[id].weapon.ranged === 'proj' || D.ITEMS[id].weapon.ranged === 'shot')).sort((a, b) => D.ITEMS[a].p - D.ITEMS[b].p);
    return { aura: c.aura, best: c.best, bestRank: c.bestRank || '', dex, dexGot: Object.keys(c.dex).length, dexAll: ALL_DEX.length, ranged, fly: flyGear(), weapon: s.equip.weapon || '',
      stats: [['🎯 Shots fired', k.shots || 0], ['💨 Toots', k.farts || 0], ['🪅 Piñatas popped', k.pinatas || 0], ['🕳️ Manhole launches', k.launches || 0], ['🛩️ Seconds flying', k.airtime || 0], ['⭕ Sky hoops', k.hoops || 0],
        ['🔁 Shots sent back', k.reflects || 0], ['🎈 Whoopee cushions', k.cushions || 0], ['🍄 Gnomes smashed', k.smash_gnome || 0], ['⚽ Balls kicked', k.kicks || 0], ['🚽 Porta-potty hides', k.hides || 0], ['🐾 Falling pets petted', k.pets || 0]] };
  };
  C.tick = function (dt, paused) {
    if (!alive) return;
    drawMeter(false);
    if (paused) return;
    fartCd -= dt;
    if (lagT > 0) { lagT -= dt; if (lagT <= 0) lagEl.hidden = true; }
    if (F.dying && !wasDying) { C.aura(CH.AURA.blackout); mh.pts = 0; mh.chain = 0; mh.rank = 0; mh.t = 0; }
    wasDying = !!F.dying;
    if (mh.t > 0) { mh.t -= dt; if (mh.t <= 0) bank(); }
    updateShots(dt);
    flyTick(dt);
    flightTick(dt);
    hideTick(dt);
    chatterTick(dt);
    critterTick(dt);
    toyTick(dt);
    ballTick(dt);
    holeTick(dt);
    cushionTick();
    tubeTick(dt);
    skyTick(dt);
    for (const q of C.pinatas) { const h = q.obj.userData.hang; q.swing = Math.max(0, (q.swing || 0) - dt * 0.6); h.rotation.x = Math.sin(G.rt.t * 2.2 + q.bx) * (0.06 + q.swing * 0.35); h.rotation.z = Math.cos(G.rt.t * 1.7 + q.bz) * (0.04 + q.swing * 0.2); }
  };
  C.destroy = function () {
    alive = false;
    W.flyHook = null; W.gravMul = 1;
    for (const l of [C.shots, C.critters, C.rot, C.pinatas, C.balls, C.holes, C.cushions, C.tubes, C.sky, C.hoops]) for (const o of l) { drop(o.obj); for (const k of o.kids || []) drop(k.obj); }
    meter.remove(); fuelEl.remove(); fartBtn.remove(); fxEl.remove();
    shell.classList.remove('cft-glitch');
  };
  st();
  return C;
}

window.CFTChaos = { attach };
})();

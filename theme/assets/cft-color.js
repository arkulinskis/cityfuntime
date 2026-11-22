/* City Fun Time: colour blocks (2026-11-21). The user: "There needs to be a progression in the game. Separate any map into squares
   of 2 by 2 km. Inside each block everything starts off as grayscale. As you unlock grocery stores, metros, any other shops,
   the world becomes colourful. If all buildings are liberated they are full of colour. If all secret packages are found, the
   road and trees get colour... brainstorm, write out how it should work, implement it." The plan: docs/colour-blocks.md.

   The story: the Static drained the colour out of the city. Every 2 km block (your home in the middle of the first one) has
   three layers that come back separately, each with its own job:
     🏠 Buildings (walls, roofs)      free places: outposts (Tom Hearton's, groceries) and metro stations count most, then every
                                      shop you walk into (E). Points / D.TUNE.color.libTarget.
     🛣️ Streets (roads, pavements,    find the secret stashes in the block's tight gaps. Found / secretTarget.
        plazas, furniture, decor)
     🌳 Nature (trees, bushes, grass,  bonk figments inside the block (the Static thins out). Bonked / killTarget.
        parks, water, sand)
   The sky is the average of the three in the block you stand in. All three full = BLOCK RESTORED (cash, XP, a banner).
   People, figments, you, moving cars, signs, pickups and lights always keep their colour. Every freed place, found stash and
   filled layer sends a ring of colour running out over the city (W.colorWave).

   const C = CFTColor.attach(G, api)   by cft-game.js after G.aim (G.color = C). api: {bump}
   C.tick(dt, paused) · C.visit(place) · C.onKill(m) · C.freed(place, how) · C.secret(spot) · C.block(x, z) -> progress ·
   C.summary() (the phone app) · C.hud() · C.apply() · C.destroy()
   World: W.setBlockColor, W.blockOf, W.colorWave, W.colorOff, W.skySat (cft-world.js "colour blocks").
   State: save.color {origin: {lat, lon} (the grid's centre), b: {key: {lib: {placeId: weight}, kills, done, tot}}, visited: {placeId: day}, intro}. Setting
   save.settings.colour === false = full colour everywhere. Knobs: D.TUNE.color. Counters: blocks, colourwaves.
   Tests: tools/live/colortest.js (game_test.py --color). */
(function () {
'use strict';

function attach(G, api) {
  const D = G.D, W = G.W, U = G.ui, T = D.TUNE.color;
  const save = () => G.save;
  const P = () => W.player.pos;
  const C = {};
  let alive = true, scanT = 0, hudT = 0, cur = null;
  const shown = new Map();   // key -> [r, g, b, sky] currently on screen (eases toward the target)
  const LAYERS = [['lib', '🏠', 'Buildings'], ['sec', '🛣️', 'Streets'], ['kill', '🌳', 'Nature']];
  function st() {
    const s = save();
    if (!s.color || typeof s.color !== 'object') s.color = {};
    const c = s.color;
    if (!c.b || typeof c.b !== 'object') c.b = {};
    if (!c.visited || typeof c.visited !== 'object') c.visited = {};
    return c;
  }
  const keyOf = (x, z) => W.blockOf(x, z).key;
  const parse = k => { const a = k.split('_'); return [+a[0], +a[1]]; };
  function blk(key) { const c = st(); return c.b[key] || (c.b[key] = { lib: {}, kills: 0, done: 0, tot: 0 }); }
  const on = () => save().settings.colour !== false;

  // ------------------------------------------------------------------ what a place is worth, and whether it is free
  const OUTPOST = k => k === 'hearton' || k === 'grocery';
  function worth(pl) {
    if (!pl || !pl.kind || !pl.pin) return 0;
    if (OUTPOST(pl.kind)) return T.wOutpost;
    if (pl.kind === 'metro') return pl.virtual ? 0 : T.wMetro;
    const k = D.KINDS[pl.kind];
    if (!k || !k.sells || !k.sells.length) return 0;
    return pl.virtual || pl.made ? T.wMadeUp : T.wShop;
  }
  function isFree(pl) {
    const s = save();
    if (OUTPOST(pl.kind)) return !!(s.hero && s.hero.out && s.hero.out[pl.id]);
    if (pl.kind === 'metro') return !!(G.fun && G.fun.metroOpen && G.fun.metroOpen(pl));
    return !!st().visited[pl.id];
  }
  // secrets found in a block: from their ids (lat/lon in the id, so stashes found on other visits count too)
  function secretBlock(id) {
    const m = /^q(-?\d+):(-?\d+)$/.exec(id || '');
    if (!m) return null;
    const a = G.xz({ lat: +m[1] / 20000, lon: +m[2] / 20000 });
    return keyOf(a.x, a.z);
  }
  function secretsFound() {
    const out = {}, sc = (save().camp && save().camp.secrets) || {};
    for (const id in sc) { const k = secretBlock(id); if (k) out[k] = (out[k] || 0) + 1; }
    return out;
  }

  // ------------------------------------------------------------------ progress
  // levels 0..1 per layer for one block; `need` = what is left, for the HUD and the phone
  function progress(key) {
    const b = blk(key), found = secretsFound()[key] || 0;
    const lib = Object.values(b.lib).reduce((a, v) => a + v, 0);
    const libT = Math.max(1, Math.min(T.libTarget, b.tot || T.libTarget));   // a block with fewer places than the target fills sooner
    const lv = [Math.min(1, lib / libT), Math.min(1, found / Math.max(1, T.secretTarget)), Math.min(1, (b.kills || 0) / Math.max(1, T.killTarget))];
    const avg = (lv[0] + lv[1] + lv[2]) / 3;
    return { key, lv, avg, lib, libT, found, kills: b.kills || 0, done: !!b.done,
      need: [Math.max(0, Math.ceil(libT - lib)), Math.max(0, T.secretTarget - found), Math.max(0, T.killTarget - (b.kills || 0))] };
  }
  C.block = (x, z) => progress(keyOf(x == null ? P().x : x, z == null ? P().z : z));
  C.progress = progress;
  const floorSat = v => T.minSat + (1 - T.minSat) * v;
  function target(key) { const p = progress(key); return [floorSat(p.lv[0]), floorSat(p.lv[1]), floorSat(p.lv[2]), floorSat(p.avg)]; }

  // scan the places that are loaded: totals per block, freed ones into the save (so they count after they unload too)
  function scan() {
    const c = st(), tot = {};
    for (const pl of G.allPlaces()) {
      const w = worth(pl);
      if (!w) continue;
      const k = keyOf(pl.pin.x, pl.pin.z);
      tot[k] = (tot[k] || 0) + w;
      if (isFree(pl)) { const b = blk(k); if (b.lib[pl.id] == null) { b.lib[pl.id] = w; G.dirty(); } }
    }
    for (const k in tot) { const b = blk(k); if (tot[k] > (b.tot || 0)) b.tot = Math.round(tot[k] * 10) / 10; }
    for (const k in c.b) checkDone(k);
  }
  function checkDone(key) {
    const b = blk(key), p = progress(key);
    if (b.done || p.lv.some(v => v < 1)) return;
    b.done = save().day;
    api.bump('blocks');
    const L = G.level(), cash = Math.round(T.rewardCash * (1 + 0.15 * (L - 1))), xp = Math.round(T.rewardXp * (1 + 0.1 * (L - 1)));
    G.addMoney(cash); G.addXp(xp, 'explore');
    const [bx, bz] = parse(key), cc = W.blockCentre(bx, bz), cx = cc.x, cz = cc.z;
    W.colorWave(P().x, P().z, { max: 900, life: 4.5 });
    U.banner('🌈 BLOCK RESTORED!', 'Every colour is back in this 2 km block. +$' + cash.toLocaleString() + ' · +' + xp + ' XP', 'done');
    if (U.confetti) U.confetti();
    if (G.hero) G.hero.word('BLOCK RESTORED!', 'gold', 'The colour is back', true);
    G.log('Restored a block of the city', '🌈');
    G.dirty();
    return { cx, cz };
  }
  // tell the player when a layer fills (once per layer per block)
  function layerNews(key, before, after) {
    for (let i = 0; i < 3; i++) {
      if (before[i] < 1 && after[i] >= 1) {
        const L = LAYERS[i];
        U.banner(L[1] + ' ' + L[2] + ' in full colour!', i === 0 ? 'Every place in this block is free.' : i === 1 ? 'You found the stashes: the streets are back.' : 'The Static thinned out: the trees and parks are back.', 'done');
        W.colorWave(P().x, P().z, { max: 420, life: 3.4 });
        api.bump('colourwaves');
      } else if (Math.floor(before[i] * 4) < Math.floor(after[i] * 4) && after[i] < 1) {
        U.feed(LAYERS[i][1], LAYERS[i][2] + ': ' + Math.round(after[i] * 100) + '% colour in this block');
      }
    }
  }
  function withNews(key, fn) { const a = progress(key).lv; fn(); const b = progress(key).lv; layerNews(key, a, b); checkDone(key); C.apply(true); }

  // ------------------------------------------------------------------ events from the rest of the game
  C.visit = function (pl) {   // E on a shop (cft-game findInteraction)
    if (!alive || !pl || !worth(pl) || OUTPOST(pl.kind) || pl.kind === 'metro') return;
    const c = st();
    if (c.visited[pl.id]) return;
    const k = keyOf(pl.pin.x, pl.pin.z);
    withNews(k, () => { c.visited[pl.id] = save().day; blk(k).lib[pl.id] = worth(pl); });
    if (on()) { W.colorWave(pl.pin.x, pl.pin.z, { max: 60, life: 1.8 }); W.pop(pl.pin.x, W.groundAt(pl.pin.x, pl.pin.z) + 3, pl.pin.z, '🎨 +colour', '#ff5c8a', 0.7); }
    G.dirty();
  };
  C.freed = function (pl, how) {   // an outpost liberated (cft-hero), a metro station freed (cft-fun)
    if (!alive || !pl || !pl.pin) return;
    const k = keyOf(pl.pin.x, pl.pin.z);
    withNews(k, () => { const w = worth(pl) || (how === 'metro' ? T.wMetro : T.wOutpost); blk(k).lib[pl.id] = w; });
    if (on()) { W.colorWave(pl.pin.x, pl.pin.z, { max: 220, life: 3 }); api.bump('colourwaves'); }
    U.feed('🎨', 'Colour is coming back to the buildings here');
  };
  C.secret = function (sp) {   // a stash opened (cft-camp)
    if (!alive || !sp) return;
    const k = keyOf(sp.x, sp.z);
    withNews(k, () => {});
    if (on()) { W.colorWave(sp.x, sp.z, { max: 120, life: 2.4 }); api.bump('colourwaves'); }
  };
  C.onKill = function (m) {   // a figment popped (cft-fun hitMonster)
    if (!alive || !m || m.introFoe) return;
    const k = keyOf(m.x, m.z);
    withNews(k, () => { const b = blk(k); b.kills = (b.kills || 0) + (m.def && (m.def.boss || m.def.rare) ? 3 : m.guard ? 5 : m.champ ? 2 : 1); });
  };

  // ------------------------------------------------------------------ the world: levels into the texture, the sky
  C.apply = function (now) {   // now = jump straight to the levels (no easing), e.g. after the setting changed
    W.colorOff(!on());
    const p = P(), here = keyOf(p.x, p.z);
    if (!shown.has(here)) shown.set(here, target(here));
    if (now === 'snap') for (const [key, s] of shown) { const t = target(key); for (let i = 0; i < 4; i++) s[i] = t[i]; s.sent = 0; }
    cur = here;
  };
  function ease(dt) {
    const k = Math.min(1, dt * 1.6);
    for (const [key, s] of shown) {
      const t = target(key);
      let moved = false;
      for (let i = 0; i < 4; i++) { const d = t[i] - s[i]; if (Math.abs(d) > 0.002) { s[i] += d * k; moved = true; } else s[i] = t[i]; }
      if (moved || !s.sent) { const [bx, bz] = parse(key); W.setBlockColor(bx, bz, s); s.sent = 1; }
    }
    const here = shown.get(cur);
    const sky = here ? here[3] : 0;
    W.skySat += (sky - W.skySat) * Math.min(1, dt * 1.2);
  }

  // ------------------------------------------------------------------ the HUD chip + the phone app
  C.hud = function () {
    const el = U.canvas.parentElement.querySelector('[data-colour]');
    if (!el) return;
    el.hidden = !on() || !(G.storyOn && G.storyOn());
    if (el.hidden) return;
    const p = progress(cur || keyOf(P().x, P().z));
    const txt = p.done ? '🌈 Block restored' : '🎨 ' + Math.round(p.avg * 100) + '% colour';
    const t = el.querySelector('[data-colourtext]'); if (t && t.textContent !== txt) t.textContent = txt;
    const bars = el.querySelectorAll('[data-cbar]');
    bars.forEach((b, i) => { const w = Math.round(p.lv[i] * 100) + '%'; if (b.style.width !== w) b.style.width = w; });
    const tip = '2 km block: 🏠 buildings ' + Math.round(p.lv[0] * 100) + '% (free ' + p.need[0] + ' more points of places) · 🛣️ streets ' + Math.round(p.lv[1] * 100) + '% (' + p.need[1] + ' more secrets) · 🌳 nature ' + Math.round(p.lv[2] * 100) + '% (' + p.need[2] + ' more figments)';
    if (el.title !== tip) el.title = tip;
  };
  C.summary = function () {
    const c = st(), p = P(), here = keyOf(p.x, p.z), list = [];
    for (const k in c.b) { const q = progress(k), [bx, bz] = parse(k), cc = W.blockCentre(bx, bz); list.push(Object.assign(q, { here: k === here, bx, bz, dist: Math.round(Math.hypot(cc.x - p.x, cc.z - p.z) / 100) / 10 })); }
    if (!c.b[here]) { const q = progress(here), [bx, bz] = parse(here); list.push(Object.assign(q, { here: true, bx, bz, dist: 0 })); }
    list.sort((a, b) => (b.here - a.here) || (b.avg - a.avg));
    return { on: on(), here: progress(here), list, restored: list.filter(q => q.done).length, T, LAYERS };
  };
  C.markers = function () {};

  // ------------------------------------------------------------------ the tick
  C.tick = function (dt, paused) {
    if (!alive) return;
    hudT -= dt;
    if (hudT <= 0) { hudT = 0.5; C.hud(); }
    const p = P(), here = keyOf(p.x, p.z);
    if (here !== cur) { if (!shown.has(here)) shown.set(here, target(here)); cur = here; }
    ease(dt);
    if (paused) return;
    scanT -= dt;
    if (scanT <= 0) { scanT = 2.5; scan(); }
    // the first time the story is on: say what happened to the colour
    const c = st();
    if (!c.intro && on() && G.storyOn && G.storyOn() && !(G.camp && G.camp.inIntro && G.camp.inIntro())) {
      c.intro = save().day; G.dirty();
      U.banner('🎨 The Static drained the colour', 'Every 2 km block comes back on its own: free places for the buildings, find secret stashes for the streets, bonk figments for the trees. The 🎨 chip shows how far you are.', 'boro');
    }
  };
  C.test = { scan, progress, target, worth, isFree, secretBlock, shown, checkDone };
  C.destroy = function () { alive = false; W.colorOff(false); };
  // start: every block we know about, straight to its level (no fade-in on load)
  st();
  { // the grid is pinned to where this save first started (the world is rebuilt around the current home, which can move)
    const c = st(), h = save().home || {};
    if (!c.origin || typeof c.origin.lat !== 'number') c.origin = { lat: h.lat || 0, lon: h.lon || 0 };
    const o = G.xz(c.origin); W.setBlockOrigin(o.x, o.z);
  }
  for (const k of Object.keys(st().b)) { const t = target(k); shown.set(k, t); const [bx, bz] = parse(k); W.setBlockColor(bx, bz, t); t.sent = 1; }
  cur = keyOf(P().x, P().z);
  if (!shown.has(cur)) { const t = target(cur); shown.set(cur, t); const [bx, bz] = parse(cur); W.setBlockColor(bx, bz, t); t.sent = 1; }
  W.skySat = (shown.get(cur) || [0, 0, 0, 0])[3];
  W.colorOff(!on());
  return C;
}

window.CFTColor = { attach };
})();

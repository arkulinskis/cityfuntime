/* City Fun Time: the long game, built on what made World of Warcraft hard to put down, minus the parts that punish you for
   leaving. Data: D.RPG in cft-content.js. State: save.rpg.

   - Loot in rarity colours (Junk grey -> Legendary orange): charms with random stats from monsters, chests, crates and missions,
     three charm slots, a 30-slot bag, a pity timer (a Rare at least every 25 drops), compare against what you wear.
   - Talents: a point every level, three branches (Hustler, Charmer, Brawler), tiers that open as you invest, a capstone each.
   - Reputation: five neighbourhood factions earned from what you already do (counters), Neutral -> Exalted, rewards at each tier.
   - Achievements with points, titles to wear, a golden toast when one lands.
   - Rested XP: time away (and sleeping at home) doubles monster, pickup and job XP for a while. A reward for taking breaks.
   - Discovery: every new street and block you reach gives XP; a new block hides a treasure chest.
   - Rare monsters with silver name tags and guaranteed Rare loot; a golden beam when you level up.

   const R = CFTRpg.attach(G, api)   (cft-game.js, once the world is loaded; G.rpg = R)
   R.tick(dt, paused) · R.bonus(key) · R.xpMul(src) · R.rested(gain) · R.onLevel(level) · R.levelText(level) · R.onKill(monster)
   R.drop(source) · R.questDone(mission) · R.offline(minutes) · R.onSleep() · R.view() (the phone apps) · R.badge()
   R.equip(id, slot) · R.unequip(slot) · R.sell(id) · R.sellJunk() · R.learn(id) · R.respec() · R.setTitle(t) · R.claim() · R.modWeapon(w) */
(function () {
'use strict';
const STATS = ['fit', 'charm', 'smarts', 'style', 'cred'];

function attach(G, api) {
  const D = G.D, W = G.W, U = G.ui, X = D.RPG, THREE = W.THREE;
  const save = () => G.save;
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const rnd = (a, b) => a + Math.random() * (b - a);
  const r1 = v => Math.max(0.1, Math.round(v * 10) / 10);
  const fmt$ = G.fmt$;
  const calm = () => !!(window.CFT_TEST && window.CFT_TEST.calm);
  let streetSet = null;
  let alive = true, secT = 0, slowT = 0, rareT = 20, tipT = 25, cache = null, cacheT = 0, quiet = false, beam = null;

  function st() {
    const s = save();
    if (!s.rpg || typeof s.rpg !== 'object') s.rpg = {};
    const r = s.rpg;
    const dflt = { rested: 0, loot: [], eq: {}, tal: {}, rep: {}, ach: {}, title: null, titles: [], streets: [], blocks: [], pending: [], pity: 0, n: 1, rares: {}, grants: {} };
    for (const k of Object.keys(dflt)) if (r[k] === undefined || r[k] === null && k !== 'title') r[k] = dflt[k];
    return r;
  }
  const C = k => save().counters[k] || 0;
  const bump = (k, n) => { save().counters[k] = C(k) + (n || 1); };
  const mark = () => { cache = null; };

  // ------------------------------------------------------------------ bonuses: talents + charms + faction rewards, cached
  function compute() {
    const r = st(), acc = {};
    const add = (k, v) => { acc[k] = (acc[k] || 0) + v; };
    for (const t of X.TALENTS) { const n = r.tal[t.id] || 0; if (n) for (const k of Object.keys(t.fx)) add(k, t.fx[k] * (k === 'cap' ? 1 : n)); }
    for (const slot of X.SLOTS) { const it = item(r.eq[slot]); if (!it) continue; for (const k of Object.keys(it.st || {})) add('stat_' + k, it.st[k]); for (const k of Object.keys(it.px || {})) add(k, it.px[k]); }
    for (const f of X.FACTIONS) { const t = tier(f); for (let i = 1; i <= t; i++) { const rw = f.rewards[i]; if (rw && rw.fx) for (const k of Object.keys(rw.fx)) add(k, rw.fx[k]); } }
    return acc;
  }
  function bonus(k) { if (!cache || G.rt.t - cacheT > 2) { cache = compute(); cacheT = G.rt.t; } return cache[k] || 0; }

  // ------------------------------------------------------------------ loot
  const item = id => id ? st().loot.find(x => x.id === id) || null : null;
  const equipped = id => X.SLOTS.some(s => st().eq[s] === id);
  function score(it) { if (!it) return -1; let v = 0; for (const k of Object.keys(it.st || {})) v += it.st[k]; if (it.px) v += 1.5 * (it.q >= 5 ? 1.6 : 1); return v; }
  function perkText(it) {
    if (!it.px) return '';
    const k = Object.keys(it.px)[0], p = X.PERKS.find(x => x.k === k), v = it.px[k];
    return p ? p.d.replace('{p}', Math.round(v * 100)).replace('{n}', Math.round(v)) : '';
  }
  function statLine(it) {
    const parts = Object.keys(it.st || {}).map(k => '+' + it.st[k] + ' ' + (D.STATS.find(x => x.id === k) || { name: k }).name);
    const pk = perkText(it); if (pk) parts.push(pk);
    return parts.join(' · ') || 'Sells for ' + fmt$(sellPrice(it));
  }
  const sellPrice = it => Math.round(it.v * (1 + bonus('sell')));
  function rollQ(minQ, src) {
    const r = st();
    if (r.pity >= X.PITY && minQ < 3 && src !== 'quest') minQ = 3;
    const luck = 1 + bonus('loot');
    let tot = 0;
    const w = X.QUALITY.map((q, i) => { if (i < minQ) return 0; const v = q.w * (i >= 3 ? luck : 1); tot += v; return v; });
    let x = Math.random() * tot;
    for (let i = 0; i < w.length; i++) { if (x < w[i]) return i; x -= w[i]; }
    return minQ;
  }
  function make(q, il, o) {
    o = o || {};
    const r = st(), id = 'L' + (r.n++);
    if (q === 0) { const j = pick(X.JUNK); return { id, n: j[1], e: j[0], q: 0, il, st: {}, v: 2 + il }; }
    const base = o.e ? [o.e, o.n] : pick(X.CHARMS), focus = o.focus || pick(STATS);
    const budget = (0.5 + il * 0.11) * X.QUALITY[q].k, s = {};
    if (q <= 2) s[focus] = r1(budget);
    else {
      const second = o.second || pick(STATS.filter(x => x !== focus));
      s[focus] = r1(budget * 0.62); s[second] = r1(budget * 0.4);
      if (q >= 5) s[pick(STATS.filter(x => !s[x]))] = r1(budget * 0.25);
    }
    let px = null;
    if (q >= 4) { const p = X.PERKS.find(x => x.k === o.perk) || pick(X.PERKS); px = {}; px[p.k] = +(p.v * (q >= 5 ? 1.6 : 1)).toFixed(3); }
    const n = o.n ? o.n : q >= 5 ? 'The ' + pick(X.LEGEND_ADJ) + ' ' + base[1] + ' ' + X.SUFFIX[focus] : (q >= 3 ? pick(X.ADJ) + ' ' : '') + base[1] + ' ' + X.SUFFIX[focus];
    return { id, n, e: base[0], q, il, st: s, px, v: Math.round((q + 1) * (q + 1) * (2 + il)) };
  }
  function ilvl(q) { return Math.max(1, G.level() + (q >= 4 ? 2 : 0) + Math.floor(rnd(-1, 2))); }
  // A drop from a source (D.RPG.SOURCES). Returns the item, or null when nothing dropped.
  function drop(src, o) {
    const sc = X.SOURCES[src] || X.SOURCES.monster;
    if (sc.chance < 1 && Math.random() > sc.chance * (1 + bonus('loot'))) return null;
    let minQ = (o && o.minQ) != null ? o.minQ : sc.minQ;
    if (src === 'rare' && bonus('rare') >= 1) minQ = 4;
    const q = rollQ(minQ, src);
    return add(make(q, ilvl(q)), src);
  }
  function add(it, src) {
    const r = st();
    if (r.loot.length >= X.BAG) { // bag full: the worst thing you aren't wearing is sold
      const spare = r.loot.filter(x => !equipped(x.id)).sort((a, b) => a.q - b.q || score(a) - score(b))[0];
      if (spare && (spare.q < it.q || (spare.q === it.q && score(spare) <= score(it)))) { sell(spare.id, true); U.feed('🎒', 'Bag full: sold ' + spare.n + ' for ' + fmt$(sellPrice(spare))); }
      else { save().money += sellPrice(it); U.feed('🎒', 'Bag full: sold ' + it.n + ' for ' + fmt$(sellPrice(it))); return it; }
    }
    it.fresh = 1;
    r.loot.push(it);
    bump('loot'); bump('loot_' + it.q);
    if (it.q >= 3) r.pity = 0; else r.pity++;
    // an empty slot takes it straight away
    const empty = X.SLOTS.find(s => !item(r.eq[s]));
    if (it.q >= 1 && empty) { r.eq[empty] = it.id; mark(); }
    if (quiet) return it;
    const Q = X.QUALITY[it.q];
    if (it.q >= 3) {
      U.banner(it.e + ' ' + it.n, Q.n + ' · ' + statLine(it) + (empty && it.q >= 1 ? ' · equipped' : ' · in your bag (phone → Character)'), 'loot q' + it.q);
      const p = W.player.pos;
      W.burst(p.x, p.y + 1.8, p.z, it.q >= 5 ? '🌟' : it.q >= 4 ? '💜' : '💎', it.q >= 5 ? 14 : 8, { spread: 3, up: 5 });
      if (it.q >= 4) { lightBeam(it.q >= 5 ? 0xff9a1f : 0xb05cff); G.sfx.level(); } else G.sfx.done();
    } else U.feed(it.e, (it.q === 0 ? 'Junk: ' : Q.n + ': ') + it.n + (it.q && empty ? ' (equipped)' : ''));
    G.dirty();
    return it;
  }
  function equip(id, slot) {
    const r = st(), it = item(id);
    if (!it || it.q === 0) return false;
    for (const s of X.SLOTS) if (r.eq[s] === id) r.eq[s] = null;
    slot = slot || X.SLOTS.find(s => !item(r.eq[s])) || X.SLOTS.slice().sort((a, b) => score(item(r.eq[a])) - score(item(r.eq[b])))[0];
    r.eq[slot] = id; it.fresh = 0;
    mark(); G.dirty(); return true;
  }
  function unequip(slot) { st().eq[slot] = null; mark(); G.dirty(); }
  function sell(id, silent) {
    const r = st(), i = r.loot.findIndex(x => x.id === id);
    if (i < 0) return 0;
    const it = r.loot[i], v = sellPrice(it);
    for (const s of X.SLOTS) if (r.eq[s] === id) r.eq[s] = null;
    r.loot.splice(i, 1);
    save().money += v;
    if (it.q === 0) bump('junksold');
    if (!silent) { G.sfx.cash(); U.hud.bump('money'); }
    mark(); G.dirty();
    return v;
  }
  function sellJunk() {
    const junk = st().loot.filter(x => x.q === 0);
    let tot = 0;
    for (const it of junk) tot += sell(it.id, true);
    if (junk.length) { G.sfx.cash(); U.hud.bump('money'); U.feed('🧾', 'Sold ' + junk.length + ' junk for ' + fmt$(tot)); }
    return tot;
  }
  // Better than the worst thing you wear? (the green arrow)
  function upgrade(it) { if (!it || it.q === 0) return false; const r = st(); const worn = X.SLOTS.map(s => item(r.eq[s])); if (worn.some(x => !x)) return true; return score(it) > Math.min(...worn.map(score)); }

  // ------------------------------------------------------------------ talents
  const spentIn = b => X.TALENTS.filter(t => t.b === b).reduce((a, t) => a + (st().tal[t.id] || 0), 0);
  const spent = () => X.TALENTS.reduce((a, t) => a + (st().tal[t.id] || 0), 0);
  const points = () => Math.max(0, G.level() - 1 - spent());
  function canLearn(t) { const r = st(); return points() > 0 && (r.tal[t.id] || 0) < t.max && spentIn(t.b) >= (t.tier - 1) * X.TIER_COST; }
  function learn(id) {
    const t = X.TALENTS.find(x => x.id === id);
    if (!t || !canLearn(t)) return false;
    const r = st();
    r.tal[id] = (r.tal[id] || 0) + 1;
    mark();
    if (t.tier === 5) bump('capstone');
    U.feed(t.e, t.n + ' ' + r.tal[id] + '/' + t.max);
    G.sfx.pick();
    if (t.fx.stat_charm || t.fx.stat_style) W.setLook(G.playerLook());
    G.dirty();
    return true;
  }
  const respecCost = () => (st().grants.respec ? G.level() * 10 : 0);
  function respec() {
    const cost = respecCost();
    if (save().money < cost) { U.toast('Resetting talents costs ' + fmt$(cost) + '.'); return false; }
    save().money -= cost; st().tal = {}; st().grants.respec = 1; mark(); G.dirty();
    U.toast('🌳 Talents reset. ' + points() + ' points to spend.');
    return true;
  }
  function talentText(t, rank) { return t.d.replace(/\{([\d.]+)\}/g, (m, v) => String(+(parseFloat(v) * Math.max(1, rank)).toFixed(2))); }

  // ------------------------------------------------------------------ reputation (from counters)
  function tier(f) { const v = st().rep[f.id] || 0; let t = 0; X.TIERS.forEach((x, i) => { if (v >= x[1]) t = i; }); return t; }
  function repTick() {
    const r = st(), s = save();
    if (!r.seen) { r.seen = {}; quiet = true; } // first run: earlier play counts, quietly
    for (const f of X.FACTIONS) {
      const before = tier(f);
      for (const k of Object.keys(f.gain)) {
        const now = s.counters[k] || 0, was = r.seen[k] == null ? 0 : r.seen[k], d = now - was;
        if (!d) continue;
        let g = d * f.gain[k];
        if (g > 0) g *= 1 + bonus('rep');
        else if (bonus('forgive') >= 1) g = 0;
        r.rep[f.id] = Math.max(0, (r.rep[f.id] || 0) + g);
      }
      const after = tier(f);
      if (after > before) for (let t = before + 1; t <= after; t++) tierUp(f, t);
      if (after !== before) mark();
    }
    for (const f of X.FACTIONS) for (const k of Object.keys(f.gain)) r.seen[k] = s.counters[k] || 0;
    if (quiet) { quiet = false; }
  }
  function tierUp(f, t) {
    const r = st(), rw = f.rewards[t], key = f.id + t;
    if (rw && !r.grants[key]) {
      r.grants[key] = 1;
      if (rw.item) { const it = make(rw.item.q, Math.max(5, G.level()), rw.item); add(it, 'faction'); }
      if (rw.title && !r.titles.includes(rw.title)) r.titles.push(rw.title);
    }
    if (quiet) return;
    U.banner(f.e + ' ' + f.n + ': ' + X.TIERS[t][0] + '!', rw ? rw.d : 'Your standing grows.', 'friend');
    G.sfx.done();
    G.log(X.TIERS[t][0] + ' with ' + f.n, f.e);
  }

  // ------------------------------------------------------------------ achievements + titles
  function val(k) {
    const s = save(), r = st();
    switch (k) {
      case 'level': return G.level();
      case 'streets': return r.streets.length;
      case 'blocks': return r.blocks.length;
      case 'missions': return Object.keys(s.m).filter(id => G.MISSION[id] && s.m[id].s === 'done').length;
      case 'worth': return (window.CFTGame.summary(s) || {}).worth || 0;
      case 'biz': return Object.keys(s.biz).length;
      case 'turfs': return Object.values(s.turf).filter(t => t.own).length;
      case 'married': return s.married ? 1 : 0;
      case 'friends': return Object.keys(s.friends).length;
      case 'sweet': return s.fun && s.fun.crushes ? s.fun.crushes.length : 0;
      case 'sets': return D.STICKER_SETS.filter(x => G.setDone(x.id)).length;
      case 'honored': return X.FACTIONS.filter(f => tier(f) >= 2).length;
      case 'exalted': return X.FACTIONS.filter(f => tier(f) >= 4).length;
      case 'rarenames': return Object.keys(r.rares).length;
      default: return s.counters[k] || 0;
    }
  }
  function achTick() {
    const r = st();
    let silent = 0;
    for (const a of X.ACH) {
      if (r.ach[a.id] || val(a.k) < a.c) continue;
      r.ach[a.id] = save().day;
      if (a.title && !r.titles.includes(a.title)) r.titles.push(a.title);
      if (quiet || r.firstAch !== 1) { silent++; continue; }
      U.banner('🏆 ' + a.n, a.d + ' · ' + a.pts + ' points' + (a.title ? ' · new title: ' + a.title : ''), 'ach');
      G.sfx.level();
      G.log('Achievement: ' + a.n, '🏆');
    }
    if (r.firstAch !== 1) { r.firstAch = 1; if (silent) U.feed('🏆', silent + ' achievement' + (silent > 1 ? 's' : '') + ' from your adventures so far (phone → Achievements)'); }
  }
  const achPoints = () => X.ACH.reduce((a, x) => a + (st().ach[x.id] ? x.pts : 0), 0);
  function setTitle(t) { const r = st(); r.title = t && r.titles.includes(t) ? t : null; G.dirty(); }

  // ------------------------------------------------------------------ rested XP
  const span = () => Math.max(60, G.xpAt(G.level() + 1) - G.xpAt(G.level()));
  function addRest(frac) { const r = st(); r.rested = Math.min(span() * 1.5, (r.rested || 0) + span() * frac); }
  function offline(min) {
    if (!(min > 20)) return;
    const before = st().rested || 0;
    addRest(Math.min(7 * 24 * 60, min) / 60 * 0.04); // 4% of a level per hour away, up to one and a half levels
    const got = Math.round((st().rested || 0) - before);
    if (got > 0) U.feed('💤', 'You feel rested: double XP from monsters, pickups and jobs for the next ' + Math.round(st().rested) + ' XP');
  }
  function onSleep() { const was = st().rested || 0; addRest(0.3); if (st().rested > was + 1) U.feed('💤', 'Rested: double XP for the next ' + Math.round(st().rested) + ' XP'); }
  // called by addXp with the XP about to be gained (not from mission rewards): returns the extra from rest
  function rested(gain) {
    const r = st();
    if (!(r.rested > 0) || gain <= 0) return 0;
    const extra = Math.min(r.rested, gain);
    r.rested -= extra; bump('restedxp', extra);
    if (r.rested < 1) { r.rested = 0; U.feed('💤', 'You are no longer rested.'); }
    return Math.round(extra);
  }
  const xpMul = src => 1 + bonus('xp') + (src === 'monster' ? bonus('monsterXp') : 0);

  // ------------------------------------------------------------------ levelling: a golden beam and what you just unlocked
  function lightBeam(col) {
    if (beam) { W.scene.remove(beam.m); beam.m.geometry.dispose(); beam.m.material.dispose(); }
    const p = W.player.pos;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.6, 40, 16, 1, true).translate(0, 20, 0),
      new THREE.MeshBasicMaterial({ color: col || 0xffd54a, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.position.set(p.x, p.y, p.z);
    W.scene.add(m);
    beam = { m, t: 0 };
  }
  function levelText(lv) {
    const unlocks = ['+1 talent point'];
    const opened = X.BRANCHES.filter(b => { const s = spentIn(b.id); return X.TALENTS.some(t => t.b === b.id && t.tier > 1 && s >= (t.tier - 1) * X.TIER_COST && s - 1 < (t.tier - 1) * X.TIER_COST); });
    if (lv === 2) unlocks.push('talents open: phone → Character');
    if (opened.length) unlocks.push('new talent tier');
    const items = Object.keys(D.ITEMS).filter(k => D.ITEMS[k].req && D.ITEMS[k].req.lvl === lv).map(k => D.ITEMS[k].e + ' ' + D.ITEMS[k].n);
    if (items.length) unlocks.push('now for sale: ' + items.join(', '));
    return unlocks.join(' · ');
  }
  function onLevel() {
    const p = W.player.pos;
    lightBeam(0xffd54a);
    W.burst(p.x, p.y + 1, p.z, '✨', 14, { spread: 2.5, up: 7, grav: 2, life: 1.4 });
    W.shake(0.25);
    mark();
  }

  // ------------------------------------------------------------------ discovery: new streets and blocks
  function explore() {
    const r = st(), s = save(), p = W.player.pos;
    if (!streetSet) streetSet = new Set(r.streets);
    const name = W.streetAt(p.x, p.z);
    if (name && !streetSet.has(name)) {
      streetSet.add(name);
      if (r.streets.length < 2000) r.streets.push(name);
      const xp = 6 + G.level() * 2;
      if (r.streets.length > 1) { G.addXp(xp, 'explore'); U.feed('🧭', 'Discovered ' + name + ' · +' + Math.round(xp * G.xpMul() * xpMul('explore')) + ' XP'); }
    }
    const b = G.turfIdOf(p.x, p.z);
    if (!r.blocks.includes(b)) {
      r.blocks.push(b);
      if (r.blocks.length > 1) {
        const t = s.turf[b], label = (t && t.name) || name || 'a new block', xp = 25 + G.level() * 5;
        G.addXp(xp, 'explore');
        U.banner('🗺️ Discovered: ' + label, '+' + Math.round(xp * G.xpMul()) + ' XP · there is a treasure chest 🧰 somewhere on this block', 'day');
        const c = (G.fun && G.fun.streetSpot) ? G.fun.streetSpot(p.x, p.z, 25, 70) : W.randomWalkSpot(p.x, p.z, 25, 70);
        if (c) api.spawnPickup('chest', c.x, c.z);
      }
    }
  }

  // ------------------------------------------------------------------ rare monsters
  function rareTick() {
    if (!G.fun || calm()) return;
    const s = save(), m0 = s.m['c1-couch'];
    if (!m0 || m0.s !== 'done' || W.ride().mode === 'drive') return;
    if (G.fun.monsters.some(m => m.def.rare)) return;
    if (Math.random() > 0.05 * (bonus('rare') >= 1 ? 2 : 1)) return;
    spawnRare();
  }
  function spawnRare(which) {
    const p = W.player.pos, home = G.homeSpot();
    const c = (G.fun.streetSpot ? G.fun.streetSpot(p.x, p.z, 30, 70) : null) || W.randomWalkSpot(p.x, p.z, 30, 90);
    if (!c || Math.hypot(c.x - home.x, c.z - home.z) < 30) return null;
    const rr = which || pick(X.RARES), base = D.MONSTERS[rr.kind];
    const def = Object.assign({}, base, { n: rr.n, hp: base.hp * 4 + 2, xp: base.xp * 6, coins: [base.coins[0] * 2, base.coins[1] * 2], rare: true, night: false });
    const m = G.fun.spawnMonster(rr.kind, c.x, c.z, { def, hp: def.hp, event: 240, aggro: 22 });
    if (!m) return null;
    m.obj.userData.size = (base.size || 1) * 1.45; m.r *= 1.45;
    const tag = W.label('💀 ' + rr.n, { size: 34, height: 0.52, bg: 'rgba(214,219,227,.95)', fg: '#1f1a3d', border: '#5b6270' });
    tag.position.y = 2.6; m.obj.add(tag);
    U.banner('💀 A rare monster: ' + rr.n, 'Silver name tag, deep pockets. It always drops something Rare or better.', 'fail');
    G.sfx.fail();
    return m;
  }
  function onKill(m) {
    const def = m.def;
    if (def.rare) {
      bump('rares'); st().rares[def.n] = save().day;
      U.banner('💀 ' + def.n + ' is down!', 'A rare kill. Check what it dropped.', 'done');
      drop('rare');
    } else if (def.boss) drop('boss');
    else if (m.kind === 'pigeon') drop('pigeon');
    else drop('monster');
  }
  // weapons: talents, charms and the Night Watch make bonks hit harder; critical bonks
  function modWeapon(w) {
    w.dmg = w.dmg * (1 + bonus('dmg'));
    if (Math.random() < bonus('crit')) { w.dmg *= 2; w.word = 'CRIT! ' + w.word; }
    return w;
  }

  // ------------------------------------------------------------------ mission rewards: choose one of three (WoW's quest reward pick)
  function questDone(m) {
    if (!m || m.ch === 1) return;
    const r = st();
    if (r.pending.length >= 5) return;
    const lv = G.level(), focuses = STATS.slice().sort(() => Math.random() - 0.5).slice(0, 3);
    const items = focuses.map(f => { const q = Math.random() < 0.15 ? 3 : 2; return make(q, Math.max(1, lv), { focus: f }); });
    r.pending.push({ t: m.title, items });
    U.feed('🎁', 'Reward to choose for "' + m.title + '" (tap the ✨ by your level)');
    G.dirty();
  }
  async function claim() {
    const r = st(), p = r.pending[0];
    if (!p) return;
    const v = await U.choose({ title: '🎁 ' + p.t, text: 'Choose your reward:', opts: p.items.map((it, i) => ({ t: it.e + ' ' + it.n + ' (' + X.QUALITY[it.q].n + ') · ' + statLine(it), v: 'i' + i })).concat([{ t: 'Decide later', v: '' }]) });
    if (!v) return;
    const it = p.items[+v.slice(1)];
    r.pending.shift();
    add(it, 'quest');
    G.dirty();
  }

  // ------------------------------------------------------------------ for the phone apps
  function view() {
    const r = st(), s = save();
    const worn = X.SLOTS.map(sl => ({ slot: sl, it: item(r.eq[sl]) }));
    return {
      level: G.level(), points: points(), spent: spent(), respecCost: respecCost(), title: r.title, titles: r.titles.slice(), achPoints: achPoints(),
      rested: Math.round(r.rested || 0), pending: r.pending.length, worn, bag: r.loot.filter(x => !equipped(x.id)).sort((a, b) => b.q - a.q || score(b) - score(a)),
      quality: X.QUALITY, statLine, sellPrice, upgrade,
      branches: X.BRANCHES.map(b => ({ b, spent: spentIn(b.id), talents: X.TALENTS.filter(t => t.b === b.id).map(t => ({ t, rank: r.tal[t.id] || 0, can: canLearn(t), open: spentIn(b.id) >= (t.tier - 1) * X.TIER_COST, text: talentText(t, r.tal[t.id] || 1) })) })),
      factions: X.FACTIONS.map(f => { const v = Math.round(r.rep[f.id] || 0), t = tier(f), next = X.TIERS[t + 1]; return { f, v, t, tier: X.TIERS[t][0], next: next ? next[0] : null, from: X.TIERS[t][1], to: next ? next[1] : X.TIERS[t][1], reward: f.rewards[Math.min(4, t + 1)] }; }),
      ach: X.ACH.map(a => ({ a, done: r.ach[a.id], v: Math.min(a.c, val(a.k)) })),
      streets: r.streets.length, blocks: r.blocks.length, money: s.money,
    };
  }
  const badge = () => points() + st().pending.length;

  // ------------------------------------------------------------------ main loop
  function tick(dt, paused) {
    if (!alive) return;
    if (beam) { beam.t += dt; beam.m.material.opacity = 0.55 * Math.max(0, 1 - beam.t / 2.2); beam.m.position.copy(W.player.pos); if (beam.t > 2.2) { W.scene.remove(beam.m); beam.m.geometry.dispose(); beam.m.material.dispose(); beam = null; } }
    if (paused) return;
    secT -= dt; slowT -= dt; rareT -= dt; tipT -= dt;
    if (secT <= 0) { secT = 1; explore(); repTick(); }
    if (slowT <= 0) { slowT = 2; achTick(); }
    if (rareT <= 0) { rareT = 15; rareTick(); }
    if (tipT <= 0) {
      tipT = 25;
      if (bonus('tips') >= 1) { const p = W.player.pos, ped = W.nearestPed(p.x, p.z, 7); if (ped) { const amt = Math.round(rnd(5, 15) * (1 + G.level() * 0.05)); W.say(ped.obj, pick(['Big fan! Here!', 'Oh my gosh, it\'s YOU!', 'Can I get a selfie? Keep the change!']), 2.4); G.addMoney(amt, 'from a fan'); } }
    }
  }
  st();
  quiet = true; repTick(); quiet = false;
  return {
    tick, bonus, xpMul, rested, onLevel, levelText, onKill, drop, add, make, questDone, claim, offline, onSleep, view, badge, equip, unequip, sell, sellJunk,
    learn, respec, setTitle, modWeapon, spawnRare, points, achPoints, tier, val, statLine, perkText, upgrade, score, mark,
    destroy() { alive = false; if (beam) W.scene.remove(beam.m); },
  };
}

window.CFTRpg = { attach };
})();

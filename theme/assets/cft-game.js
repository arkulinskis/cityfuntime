/* City Fun Time: the game. Rules, saves, missions, pickups, people, homes, businesses, turf, time.
   Uses CFT_DATA (cft-content.js), CFTWorld (cft-world.js, the 3D city), CFTUI (cft-ui.js, HUD + menus) and CFTFun
   (cft-fun.js: monsters, weapons, strangers, street folk, pranks, street events; G.fun once the world is loaded).

   CFTGame.mount(root, {save, me, onSave(save), onPhoto(url, meta), onExit(), quality}) -> {destroy, G}
   CFTGame.summary(save) / missionBoard(save) / newSave / levelOf / xpAt: also used by the pages (no three.js needed). */
(function () {
'use strict';
const D = window.CFT_DATA;
const TURF = 300;
function hash(n) { n = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b); n ^= n >>> 13; n = Math.imul(n, 0xc2b2ae35); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt$ = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
function xpAt(l) { return Math.round(60 * Math.pow(Math.max(0, l - 1), 1.8)); }
function levelOf(xp) { let l = 1; while (l < 99 && xpAt(l + 1) <= xp) l++; return l; }
const MISSION = {}; D.MISSIONS.forEach(m => { MISSION[m.id] = m; });
const BIZ = {}; D.BUSINESSES.forEach(b => { BIZ[b.id] = b; });
const CREW = {}; D.CREWS.forEach(c => { CREW[c.id] = c; });
const STICKERS = []; D.STICKER_SETS.forEach(s => s.items.forEach(([id, e, n]) => STICKERS.push({ id, e, n, set: s.id, rare: !!s.rare, feat: !!s.feat })));
const RIDE_KIND = { skateboard: 'skateboard', kickscooter: 'kickscooter', bicycle: 'bike', moped: 'moped', car: 'car', suv: 'suv', sports: 'sports' };
const FOOD_BIZ = new Set(['coffee', 'foodtruck', 'pizzeria', 'sushi', 'bistro', 'lemonade']);

// ------------------------------------------------------------------------------------------- saves
function newSave(o) {
  o = o || {};
  const home = o.home || { lat: 45.524, lon: -73.581, label: 'Plateau Mont-Royal, Montréal', short: 'Plateau Mont-Royal' };
  return {
    v: 1, created: Date.now(), updated: Date.now(), playMs: 0, name: o.name || 'You', look: o.look || null, pref: null,
    home, apt: { tier: 0, lat: home.lat, lon: home.lon, label: home.short || home.label },
    pos: null, money: 20, savings: 0, xp: 0, energy: 100, happy: 55, maxE: 0,
    stats: { fit: 1, charm: 1, smarts: 1, style: 1, cred: 1 },
    day: 1, clock: 8, gameMin: 0, bag: {}, owned: {}, equip: {}, m: {}, track: null, spots: {}, castAt: {}, vplaces: [],
    jobs: { day: 0, list: [] }, dyn: {}, stickers: {}, turf: {}, biz: {}, rel: {}, friends: {}, partner: null, engaged: false, married: false,
    kids: [], pets: [], counters: {}, metro: [], log: [], hourPaid: 0,
    fun: { hearts: 0, king: null, folk: {}, folkAt: {}, crushes: [], grudges: {}, feats: {} },  // street life (cft-fun.js)
    settings: { follow: { partner: true, kids: true, pets: true, friend: null }, quality: 'auto', sound: true },
  };
}
function migrate(s) {
  const base = newSave({ home: s.home, name: s.name, look: s.look });
  for (const k of Object.keys(base)) if (s[k] === undefined) s[k] = base[k];
  for (const k of Object.keys(base.stats)) if (typeof s.stats[k] !== 'number') s.stats[k] = 1;
  s.settings = Object.assign(base.settings, s.settings || {});
  s.settings.follow = Object.assign({ partner: true, kids: true, pets: true, friend: null }, s.settings.follow || {});
  return s;
}
function bizValue(id, b) { const d = BIZ[id]; if (!d) return 0; let v = d.cost; for (let l = 1; l < (b.lvl || 1); l++) v += d.cost * [0.5, 1, 2, 4][l - 1]; return v; }
function summary(s) {
  if (!s) return null;
  const done = Object.values(s.m || {}).filter(x => x.s === 'done').length;
  const storyDone = Object.keys(s.m || {}).filter(id => MISSION[id] && s.m[id].s === 'done').length;
  const turfs = Object.values(s.turf || {}).filter(t => t.own).length;
  const biz = Object.keys(s.biz || {});
  let worth = (s.money || 0) + (s.savings || 0);
  biz.forEach(id => { worth += bizValue(id, s.biz[id]); });
  const apt = D.APARTMENTS[(s.apt && s.apt.tier) || 0];
  if (apt && !apt.rent) worth += apt.cost;
  for (const id of Object.keys(s.owned || {})) { const it = D.ITEMS[id]; if (it && (it.type === 'vehicle' || it.type === 'furniture')) worth += it.p * 0.6; }
  const stickers = Object.keys(s.stickers || {}).filter(k => s.stickers[k] > 0).length;
  return { name: s.name, level: levelOf(s.xp || 0), xp: s.xp || 0, money: Math.round(s.money || 0), worth: Math.round(worth), missions: storyDone, missionsTotal: D.MISSIONS.length,
    jobs: done - storyDone, turfs, biz: biz.length, friends: Object.keys(s.friends || {}).length, kids: (s.kids || []).length, partner: !!s.partner,
    married: !!s.married, apt: apt ? apt.n : '', aptTier: (s.apt && s.apt.tier) || 0, aptE: apt ? apt.e : '', day: s.day || 1, stickers, stickersTotal: STICKERS.length,
    happy: Math.round(s.happy || 0), stats: s.stats, pets: (s.pets || []).length, home: s.home ? (s.home.short || s.home.label) : '' };
}
function reqMet(s, m) {
  const r = m.req || {};
  for (const id of r.m || []) if (!s.m[id] || s.m[id].s !== 'done') return false;
  if (r.lvl && levelOf(s.xp) < r.lvl) return false;
  if (r.partner && !s.partner) return false;
  if (r.married && !s.married) return false;
  if (r.kids && s.kids.length < r.kids) return false;
  if (r.stat) for (const k of Object.keys(r.stat)) if ((s.stats[k] || 0) < r.stat[k]) return false;
  return true;
}
// For the Quests page: every mission with its status.
function missionBoard(s) {
  return D.CHAPTERS.map(ch => ({
    ch, missions: D.MISSIONS.filter(m => m.ch === ch.id).map(m => {
      const st = s && s.m[m.id];
      const status = st ? (st.s === 'done' ? 'done' : st.s === 'active' ? 'active' : 'open') : (s && reqMet(s, m) ? 'open' : 'locked');
      return { id: m.id, title: m.title, giver: D.CAST[m.giver], at: m.at, status, step: st && st.s === 'active' ? m.steps[st.st] : null, steps: m.steps.length,
        stepIdx: st ? st.st || 0 : 0, reward: m.reward, req: m.req, tracked: s && s.track === m.id };
    }),
  }));
}

// ------------------------------------------------------------------------------------------- the game
function mount(root, opts) {
  opts = opts || {};
  const G = { D, opts, MISSION, BIZ, CREW, STICKERS, fmt$, levelOf, xpAt, hash, TURF };
  const rt = G.rt = { pickups: [], actors: new Map(), followers: [], escorts: {}, race: null, chase: null, signs: new Map(), posters: new Map(),
    labels: [], timers: {}, t: 0, busy: false, last: performance.now(), placeTimer: 0, actorTimer: 0, missionTimer: 0, promptTimer: 0, saveTimer: 0,
    dirtyT: 0, interact: null, vpins: new Map(), visitedNear: new Set(), chatCooldown: 0, beam: null };
  const U = G.ui = window.CFTUI.create(G, root);
  let W = null, raf = 0, alive = true, state = 'start', save = null;
  G.state = () => state;

  // ------------------------------------------------------------------ music
  // Real tracks streamed by ArkMusic (web/pages/_arkmusic.html): a playlist picked from the game clock and
  // whether you're driving, checked every few seconds. Settings > Music turns it off (save.settings.music).
  const MUSIC = {
    day: ['dont-stress-out', 'cosmic', 'my-love-for-you', 'bright-road'],
    night: ['high-notes', 'never-morning', 'cosmic'],
    drive: ['midwest-western', 'how-do-you-love'],
  };
  let musicT = 0, musicMood = '';
  function music(dt) {
    const M = window.ArkMusic;
    if (!M || !save) return;
    musicT -= dt;
    if (musicT > 0) return;
    musicT = 3;
    M.enabled(save.settings.music !== false);
    const drive = !!(save.equip.ride && W && W.ride().mode === 'drive');
    const h = save.clock;
    musicMood = drive ? 'drive' : (h >= 20 || h < 6) ? 'night' : 'day';
    M.play(MUSIC[musicMood], { volume: 0.4, shuffle: true, fade: 2.5 });
  }
  G.musicMood = () => musicMood;

  // ------------------------------------------------------------------ sound
  let actx = null;
  function tone(notes, type, vol) {
    if (!save || !save.settings.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const t = actx.currentTime;
      notes.forEach(([f, dl, len]) => {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = type || 'triangle'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + dl); g.gain.exponentialRampToValueAtTime(vol || 0.16, t + dl + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dl + (len || 0.3));
        o.connect(g); g.connect(actx.destination); o.start(t + dl); o.stop(t + dl + (len || 0.3) + 0.05);
      });
    } catch (e) { /* no audio */ }
  }
  G.sfx = {
    coin: () => tone([[1046.5, 0], [1568, 0.07]]),
    pick: () => tone([[784, 0], [1175, 0.06]], 'sine'),
    cash: () => tone([[1318, 0, 0.15], [1760, 0.08, 0.3]], 'square', 0.06),
    done: () => tone([[523, 0], [659, 0.1], [784, 0.2], [1046, 0.3, 0.6]], 'triangle', 0.18),
    fail: () => tone([[330, 0, 0.25], [247, 0.18, 0.4]], 'sawtooth', 0.06),
    tick: () => tone([[880, 0, 0.08]], 'square', 0.05),
    snap: () => tone([[2000, 0, 0.05], [1200, 0.04, 0.08]], 'square', 0.05),
    level: () => tone([[523, 0], [784, 0.12], [1046, 0.24], [1318, 0.36, 0.7]], 'triangle', 0.2),
    swing: () => tone([[520, 0, 0.07], [300, 0.04, 0.09]], 'sine', 0.05),
    bonk: () => tone([[196, 0, 0.12], [131, 0.05, 0.2]], 'square', 0.09),
    boing: () => tone([[262, 0, 0.1], [392, 0.07, 0.1], [587, 0.14, 0.25]], 'sine', 0.14),
    slide: () => tone([[880, 0, 0.12], [660, 0.08, 0.12], [440, 0.16, 0.25]], 'sine', 0.1),
    alarm: () => tone([[880, 0, 0.14], [660, 0.16, 0.14], [880, 0.32, 0.14], [660, 0.48, 0.14]], 'square', 0.05),
  };

  // ------------------------------------------------------------------ derived stats
  const owned = id => !!save.owned[id];
  const has = (id, n) => (save.bag[id] || 0) >= (n || 1);
  const isFriend = id => !!save.friends[id];
  const setDone = id => { const s = D.STICKER_SETS.find(x => x.id === id); return s && s.items.every(([k]) => save.stickers[k] > 0); };
  function setBonus(key) { let v = 0; for (const s of D.STICKER_SETS) if (s.bonus[key] && setDone(s.id)) v += s.bonus[key]; return v; }
  function stat(id) {
    if (id === 'happy') return save.happy;
    let v = save.stats[id] || 0;
    for (const slot of Object.keys(save.equip)) { const it = D.ITEMS[save.equip[slot]]; if (it && it.stats && it.stats[id] && slot !== 'ride') v += it.stats[id]; }
    for (const s of D.STICKER_SETS) if (s.bonus.stats && s.bonus.stats[id] && setDone(s.id)) v += s.bonus.stats[id];
    for (const id2 of Object.keys(save.owned)) { const it = D.ITEMS[id2]; if (it && it.type === 'furniture' && it.stats && it.stats[id]) v += it.stats[id]; }
    return v;
  }
  G.stat = stat;
  G.level = () => levelOf(save.xp);
  G.maxEnergy = () => 100 + Math.floor(stat('fit')) * 2 + (save.maxE || 0) + setBonus('energy') + (isFriend('kim') ? 10 : 0);
  G.discount = () => Math.min(0.25, stat('style') * 0.006);
  G.relMul = () => 1 + stat('charm') * 0.03;
  G.happyMul = () => 0.8 + save.happy / 250;
  G.incomeMul = id => (1 + stat('smarts') * 0.02) * G.happyMul() * (1 + setBonus('income') + (isFriend('priya') ? 0.1 : 0) + (isFriend('tomas') && FOOD_BIZ.has(id) ? 0.15 : 0));
  G.xpMul = () => 1 + stat('smarts') * 0.01 + setBonus('xp') + (isFriend('okafor') ? 0.1 : 0);
  G.foodMul = () => 1 + setBonus('food') + (isFriend('benny') ? 0.2 : 0);
  G.priceOf = id => {
    const it = D.ITEMS[id];
    let p = it.p * (1 - G.discount());
    if (it.type === 'vehicle' && isFriend('dmitri')) p *= 0.9;
    return Math.round(p);
  };
  function speedMul() {
    let m = 1 + Math.min(0.4, stat('fit') * 0.01) + setBonus('speed');
    const ride = save.equip.ride;
    if (!ride) { const sh = D.ITEMS[save.equip.shoes]; if (sh && sh.speed) m += sh.speed; }
    else if (isFriend('kai')) m += 0.05;
    if (save.energy <= 0 && !ride) m *= 0.8;
    if (G.fun) m *= G.fun.speedMul();
    return m;
  }
  G.happyTarget = function () {
    const apt = D.APARTMENTS[save.apt.tier] || D.APARTMENTS[0];
    let furn = 0;
    for (const id of Object.keys(save.owned)) { const it = D.ITEMS[id]; if (it && (it.type === 'furniture') && it.happy) furn += it.happy; }
    const t = 35 + apt.happy + Math.min(25, furn) + (save.partner ? 8 : 0) + (save.married ? 6 : 0) + save.kids.length * 6 +
      Math.min(10, Object.keys(save.friends).length * 2) + save.pets.length * (isFriend('ollie') ? 6 : 4) + setBonus('happy') + (G.fun ? G.fun.happyBonus() : 0);
    return clamp(t, 0, 100);
  };

  // ------------------------------------------------------------------ economy + progress
  function log(text, e) { save.log.unshift({ d: save.day, h: Math.floor(save.clock), t: text, e: e || '•' }); if (save.log.length > 40) save.log.length = 40; }
  G.log = log;
  function addMoney(n, why) {
    save.money = Math.max(0, save.money + n);
    if (n > 0) save.counters.earned = (save.counters.earned || 0) + n;
    if (why) U.feed(n >= 0 ? '💵' : '💸', (n >= 0 ? '+' : '') + fmt$(n) + ' ' + why);
    U.hud.bump('money');
    dirty();
  }
  function addXp(n) {
    const before = levelOf(save.xp);
    save.xp += Math.round(n * G.xpMul());
    const after = levelOf(save.xp);
    if (after > before) {
      G.sfx.level();
      U.banner('Level ' + after + '!', 'You\'re getting better at city life.', 'level');
      log('Reached level ' + after, '⭐');
      save.energy = G.maxEnergy();
    }
    U.hud.bump('xp');
  }
  function addStat(id, n, quiet) {
    const before = Math.floor(save.stats[id]);
    save.stats[id] = Math.round((save.stats[id] + n) * 100) / 100;
    const st = D.STATS.find(s => s.id === id);
    if (Math.floor(save.stats[id]) > before && st) { U.feed(st.e, st.name + ' ' + Math.floor(stat(id)) + '!'); G.sfx.pick(); }
    else if (!quiet && st) U.feed(st.e, '+' + n + ' ' + st.name);
  }
  function addHappy(n) { save.happy = clamp(save.happy + n, 0, 100); }
  function addEnergy(n) { save.energy = clamp(save.energy + n, 0, G.maxEnergy()); }
  function addRel(id, n) {
    if (!D.CAST[id]) return;
    const before = save.rel[id] || 0;
    save.rel[id] = clamp(before + n * (n > 0 ? G.relMul() : 1), 0, 100);
    if (D.FRIENDS.includes(id) && before < 60 && save.rel[id] >= 60 && !save.friends[id]) makeFriend(id);
  }
  function makeFriend(id) {
    if (save.friends[id]) return;
    save.friends[id] = true;
    save.rel[id] = Math.max(save.rel[id] || 0, 60);
    const c = D.CAST[id];
    U.banner(c.e + ' New friend!', c.n + ' · ' + (D.FRIEND_PERKS[id] || ''), 'friend');
    log('Became friends with ' + c.n, '🤝');
  }
  function giveItem(id, n) { save.bag[id] = (save.bag[id] || 0) + n; if (save.bag[id] <= 0) delete save.bag[id]; }
  function addSticker(rare) {
    const pool = STICKERS.filter(s => !s.feat && (rare ? true : (!s.rare || Math.random() < 0.15 + setBonus('luck'))));
    const s = pick(pool);
    const isNew = !(save.stickers[s.id] > 0);
    save.stickers[s.id] = (save.stickers[s.id] || 0) + 1;
    U.feed(s.e, (isNew ? 'New sticker: ' : 'Sticker: ') + s.n);
    const set = D.STICKER_SETS.find(x => x.id === s.set);
    if (isNew && setDone(set.id)) { U.banner('🎴 Set complete!', set.n + ' · ' + set.bonusText, 'level'); log('Completed sticker set ' + set.n, '🎴'); G.sfx.done(); }
    return s;
  }
  function giveSticker(id) { // a specific sticker (mission rewards)
    const s = STICKERS.find(x => x.id === id);
    if (!s) return null;
    const isNew = !(save.stickers[s.id] > 0);
    save.stickers[s.id] = (save.stickers[s.id] || 0) + 1;
    const set = D.STICKER_SETS.find(x => x.id === s.set);
    if (isNew && setDone(set.id)) { U.banner('🎴 Set complete!', set.n + ' · ' + set.bonusText, 'level'); log('Completed sticker set ' + set.n, '🎴'); G.sfx.done(); }
    return s;
  }
  G.addSticker = addSticker; G.giveSticker = giveSticker; G.addMoney = addMoney; G.addXp = addXp; G.addStat = addStat; G.addHappy = addHappy; G.addEnergy = addEnergy;
  G.addRel = addRel; G.giveItem = giveItem; G.makeFriend = makeFriend; G.has = has; G.owned = owned; G.isFriend = isFriend; G.setDone = setDone;
  function applyReward(r, title) {
    const parts = [];
    if (r.money) { addMoney(r.money); parts.push('💵 ' + fmt$(r.money)); }
    if (r.xp) { addXp(r.xp); parts.push('⭐ ' + Math.round(r.xp * G.xpMul()) + ' XP'); }
    for (const k of Object.keys(r.stats || {})) { addStat(k, r.stats[k], true); const st = D.STATS.find(s => s.id === k); parts.push(st.e + ' +' + r.stats[k] + ' ' + st.name); }
    for (const k of Object.keys(r.items || {})) { giveItem(k, r.items[k]); if (r.items[k] > 0) parts.push(D.ITEMS[k].e + ' ' + D.ITEMS[k].n); }
    for (const k of Object.keys(r.rel || {})) { addRel(k, r.rel[k]); parts.push('❤️ ' + D.CAST[k].n); }
    if (r.happy) { addHappy(r.happy); parts.push('😊 +' + r.happy); }
    if (r.sticker) { const s = giveSticker(r.sticker); if (s) parts.push(s.e + ' ' + s.n + ' sticker'); }
    if (r.energy) addEnergy(r.energy);
    if (r.friend) makeFriend(r.friend);
    if (r.partner) { save.partner = r.partner; save.rel[r.partner] = Math.max(save.rel[r.partner] || 0, 80); log('Started dating ' + D.CAST[r.partner].n, '💘'); refreshFollowers(); }
    if (r.engaged) { save.engaged = true; log('Got engaged!', '💍'); }
    if (r.married) { save.married = true; log('Got married!', '💒'); }
    if (r.kid) bornKid();
    return parts;
  }
  function bornKid() {
    const used = save.kids.map(k => k.name);
    const dflt = D.KID_NAMES.find(n => !used.includes(n)) || 'Kiddo';
    const kid = { name: dflt, born: save.day, seed: Math.random() * 1e6 | 0 };
    save.kids.push(kid);
    log('Welcome, baby ' + kid.name + '!', '👶');
    U.ask('Name your baby', dflt).then(n => { if (n && n.trim()) { kid.name = n.trim().slice(0, 20); log('The baby is named ' + kid.name, '👶'); } refreshFollowers(); dirty(); });
  }

  // ------------------------------------------------------------------ text tokens
  G.text = function (s, ctx) {
    if (!s) return '';
    const bf = save.pref === 'bf';
    const kid = save.kids[0] ? save.kids[0].name : 'the kid';
    const biz = Object.keys(save.biz)[0];
    return String(s).replace(/\{(\w+)\}/g, (m, k) => {
      switch (k) {
        case 'name': return save.name;
        case 'place': return (ctx && ctx.place) || 'the spot';
        case 'home': return save.apt.label || 'home';
        case 'street': return (W && W.streetAt(W.player.pos.x, W.player.pos.z)) || 'this street';
        case 'pt': return bf ? 'boyfriend' : 'girlfriend';
        case 'he': return bf ? 'he' : 'she';
        case 'He': return bf ? 'He' : 'She';
        case 'him': return bf ? 'him' : 'her';
        case 'his': return bf ? 'his' : 'her';
        case 'kid': return kid;
        case 'biz': return biz ? (save.biz[biz].name || BIZ[biz].n) : 'your business';
        case 'n': return ctx && ctx.n != null ? ctx.n : '';
        default: return m;
      }
    });
  };

  // ------------------------------------------------------------------ positions + places
  const xz = ll => W.toXZ(ll.lat, ll.lon);
  const ll = (x, z) => W.toLL(x, z);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const P = () => W.player.pos;
  G.xz = xz; G.ll = ll;
  function vplacePins() {
    return save.vplaces.map(v => { let p = rt.vpins.get(v.id); if (!p) { const q = xz(v); p = { id: v.id, kind: v.kind, name: v.name, x: q.x, z: q.z, pin: { x: q.x, z: q.z, yaw: 0 }, virtual: true }; rt.vpins.set(v.id, p); } return p; });
  }
  G.allPlaces = () => W.places.concat(vplacePins());
  function placesOf(kind) { return G.allPlaces().filter(p => p.kind === kind); }
  G.placesOf = placesOf;
  function usedBuildings() {
    const out = [];
    for (const id of Object.keys(save.biz)) out.push(xz(save.biz[id]));
    if (save.apt.tier > 0) out.push(xz(save.apt));
    for (const v of save.vplaces) out.push(xz(v));
    for (const q of W.places) if (q.made) out.push(q);
    return out;
  }
  // A building near (x, z) facing a street, not used by anything else: {b, wall, street}
  function freeBuilding(x, z, rmin, rmax, filter) {
    const used = usedBuildings();
    const list = W.buildingsNear(x, z, rmax).filter(b => {
      const d = Math.hypot(b.cx - x, b.cz - z);
      return d >= rmin && b.area > 60 && (!filter || filter(b)) && !used.some(u => Math.hypot(u.x - b.cx, u.z - b.cz) < 25);
    }).sort((a, b) => Math.hypot(a.cx - x, a.cz - z) - Math.hypot(b.cx - x, b.cz - z));
    for (const b of list.slice(0, 30)) { const w = W.wallSpot(b); if (w) return { b, wall: w, street: w.street }; }
    return null;
  }
  function createVirtual(kind, x, z) {
    const fb = freeBuilding(x, z, 60, 450) || freeBuilding(x, z, 10, 900);
    let pin = fb ? fb.street : W.randomWalkSpot(x, z, 60, 400);
    if (!pin) pin = { x: x + 30, z };
    const k = D.KINDS[kind] || { fake: ['The ' + kind] };
    const used = new Set(save.vplaces.map(v => v.name));
    let name = k.fake.find(n => !used.has(n)) || (k.fake[0] + ' ' + (save.vplaces.length + 1));
    const p = ll(pin.x, pin.z);
    const v = { id: 'v' + (save.vplaces.length + 1) + '-' + kind, kind, name, lat: p.lat, lon: p.lon };
    save.vplaces.push(v);
    dirty();
    return vplacePins().find(q => q.id === v.id);
  }
  // Finds a place of a kind near (x, z). opts.min/max distances, opts.random among the nearest few.
  function findPlace(kind, x, z, o) {
    o = o || {};
    const min = o.min == null ? 30 : o.min, max = o.max || 1000;
    const c = placesOf(kind).map(p => [Math.hypot(p.pin.x - x, p.pin.z - z), p]).sort((a, b) => a[0] - b[0]);
    let good = c.filter(e => e[0] >= min && e[0] <= max);
    if (!good.length) good = c.filter(e => e[0] <= 1800);
    const real = good.filter(e => !e[1].made);  // missions go to real places from the map whenever there is one; made-up shops fill the gaps
    if (real.length) good = real;
    if (good.length) return (o.random ? good[Math.floor(Math.random() * Math.min(4, good.length))] : good[0])[1];
    return createVirtual(kind, x, z);
  }
  G.findPlace = findPlace;
  function tallest(x, z, r) {
    const bs = W.buildingsNear(x, z, r).sort((a, b) => b.h - a.h);
    for (const b of bs.slice(0, 8)) { const w = W.wallSpot(b); if (w) return { x: w.street.x, z: w.street.z, b, h: b.h }; }
    return null;
  }
  // The highest street within 900 m of home (real heights from the hills map). Kept in the save, per home.
  function hilltop() {
    const key = 'hill@' + save.apt.lat.toFixed(4) + ',' + save.apt.lon.toFixed(4);
    if (save.spots[key]) return save.spots[key];
    const h = homeSpot();
    W.registerAround(h.x, h.z, 900);
    let best = null, seen = 0, known = 0;
    for (const s of W.subs()) {
      if (!s.reg) continue;
      for (const sg of s.walk) {
        const x = (sg.x1 + sg.x2) / 2, z = (sg.z1 + sg.z2) / 2;
        if (Math.hypot(x - h.x, z - h.z) > 900 || W.heightAt(x, z)) continue;
        const e = W.elevAt(x, z);
        seen++;
        if (e === e) { known++; if (!best || e > best.e) best = { x, z, e }; }
      }
    }
    if (!best) return null;
    const sure = known >= seen * 0.8; // hills not loaded everywhere yet (you're far from home): don't remember this one
    const home = W.elevAt(h.x, h.z), up = home === home ? Math.round(best.e - home) : null;
    const st = W.streetAt(best.x, best.z), near = st ? null : W.nearestWalk(best.x, best.z, 250, true), nst = near && W.streetAt(near.x, near.z);
    const name = (st ? 'the top of ' + st : nst ? 'the hilltop above ' + nst : 'the highest spot around') + ' (' + Math.round(best.e) + ' m above the sea' + (up > 0 ? ', ' + up + ' m above home' : '') + ')';
    const spot = Object.assign(ll(best.x, best.z), { name, kind: 'hilltop' });
    if (sure) { save.spots[key] = spot; dirty(); }
    return spot;
  }
  G.hilltop = hilltop;
  // Target spec -> {lat, lon, name, kind}
  function resolveTarget(spec, m, step) {
    const p = P();
    const mk = (x, z, name, kind) => Object.assign(ll(x, z), { name, kind });
    if (spec === 'hilltop') { const t = hilltop(); if (t) return Object.assign({}, t); spec = 'park'; }
    if (spec === 'giver') { const s = spotOf(m.giver, m.at); return s ? Object.assign({}, s) : mk(p.x, p.z, 'here', 'here'); }
    if (spec === 'who') { const key = save.castAt[step.who]; const s = key && save.spots[key]; return s ? Object.assign({}, s) : resolveTarget('giver', m, step); }
    if (spec === 'home') { const a = homeSpot(); return mk(a.x, a.z, save.apt.label || 'home', 'home'); }
    if (spec === 'here') return mk(p.x, p.z, W.streetAt(p.x, p.z) || 'here', 'here');
    if (spec === 'addr') {
      const hns = W.housenumbersNear(p.x, p.z, 450).filter(h => Math.hypot(h.x - p.x, h.z - p.z) > 80);
      if (hns.length) {
        const h = pick(hns), w = W.nearestWalk(h.x, h.z, 40) || h;
        const st = W.streetAt(h.x, h.z) || W.streetAt(w.x, w.z);
        return mk(w.x, w.z, h.t + (st ? ' ' + st : ''), 'addr');
      }
      const r = W.randomWalkSpot(p.x, p.z, 100, 400) || { x: p.x + 120, z: p.z };
      return mk(r.x, r.z, 'the blue door on ' + (W.streetAt(r.x, r.z) || 'the next street'), 'addr');
    }
    if (spec === 'tall') { const t = tallest(p.x, p.z, 700) || tallest(p.x, p.z, 1500); if (t) return mk(t.x, t.z, 'the tallest building around (' + Math.round(t.h) + ' m)', 'tall'); }
    if (spec === 'water') {
      const w = W.waterNear(p.x, p.z, 1500);
      if (w) return mk(w.x, w.z, 'the water by ' + (W.streetAt(w.x, w.z) || 'the shore'), 'water');
      const a = W.areaNear(p.x, p.z, 900, ['park', 'wood', 'grass']);
      if (a) return mk(a.x, a.z, 'the pond in the park', 'water');
      spec = 'park';
    }
    if (spec === 'spot') { const r = W.randomWalkSpot(p.x, p.z, 150, 350) || { x: p.x + 150, z: p.z }; return mk(r.x, r.z, W.streetAt(r.x, r.z) || 'the alley', 'spot'); }
    if (spec === 'park' && !placesOf('park').some(q => dist(q.pin, p) < 1200)) {
      const a = W.areaNear(p.x, p.z, 1200, ['park', 'wood', 'grass', 'playground']);
      if (a) return mk(a.x, a.z, 'the park near ' + (W.streetAt(a.x, a.z) || 'here'), 'park');
    }
    if (spec === 'landmark' && !placesOf('landmark').some(q => dist(q.pin, p) < 1500)) {
      const mu = placesOf('museum').find(q => dist(q.pin, p) < 1500);
      if (mu) return mk(mu.pin.x, mu.pin.z, mu.name, 'museum');
      const t = tallest(p.x, p.z, 900);
      if (t) return mk(t.x, t.z, 'the tallest tower around', 'tall');
    }
    if (D.KINDS[spec]) { const pl = findPlace(spec, p.x, p.z, { min: 40, random: step && step.do === 'deliver' }); return mk(pl.pin.x, pl.pin.z, pl.name, spec); }
    return mk(p.x + 50, p.z, 'somewhere', 'spot');
  }
  G.resolveTarget = resolveTarget;
  // Where a cast member stands for missions given at a kind of place (stable per save)
  function spotOf(who, at) {
    if (at === 'home') { const h = homeSpot(); const off = (hash(who.length * 7 + who.charCodeAt(0)) - 0.5) * 6; return Object.assign(ll(h.x + off, h.z + 2.5), { name: save.apt.label, kind: 'home', home: true }); }
    const key = who + '@' + at;
    if (!save.spots[key]) {
      if (!W) return null;
      const p = P();
      const pl = findPlace(at, p.x, p.z, { min: 20, max: 900 });
      const a = ll(pl.pin.x, pl.pin.z);
      save.spots[key] = { lat: a.lat, lon: a.lon, name: pl.name, kind: at };
      dirty();
    }
    return save.spots[key];
  }
  G.spotOf = spotOf;
  function homeSpot() {
    if (!rt.homeXZ || rt.homeKey !== save.apt.lat + ',' + save.apt.lon) {
      const a = xz(save.apt);
      const w = W.nearestWalk(a.x, a.z, 80) || a;
      rt.homeXZ = { x: w.x, z: w.z, bx: a.x, bz: a.z }; rt.homeKey = save.apt.lat + ',' + save.apt.lon;
    }
    return rt.homeXZ;
  }
  G.homeSpot = homeSpot;

  // ------------------------------------------------------------------ missions
  function getM(id) { return MISSION[id] || save.dyn[id]; }
  G.getM = getM;
  G.activeMissions = () => Object.keys(save.m).filter(id => save.m[id].s === 'active' && getM(id));
  G.openMissions = () => Object.keys(save.m).filter(id => save.m[id].s === 'open' && getM(id));
  function refreshAvailability() {
    let added = 0;
    for (const m of D.MISSIONS) if (!save.m[m.id] && reqMet(save, m)) { save.m[m.id] = { s: 'open' }; added++; }
    if (added) { dirty(); rt.actorTimer = 0; }
    return added;
  }
  function accept(id) {
    const m = getM(id);
    save.m[id] = { s: 'active', st: 0, d: save.day };
    if (!save.track || !save.m[save.track] || save.m[save.track].s !== 'active') save.track = id;
    log('Started: ' + m.title, '📜');
    beginStep(id);
    dirty();
  }
  G.accept = accept;
  G.track = id => { save.track = id; rt.pinGoal = null; dirty(); updateBeam(); };
  G.abandon = id => {
    const m = getM(id);
    endStepRuntime(id);
    if (save.dyn[id]) { delete save.dyn[id]; delete save.m[id]; } else save.m[id] = { s: 'open' };
    if (save.track === id) save.track = G.activeMissions()[0] || null;
    // take back quest items
    for (const st of m.steps) if (st.item && D.ITEMS[st.item].type === 'quest') delete save.bag[st.item];
    refreshFollowers(); clearMissionPickups(id); dirty();
  };
  function curStep(id) { const ms = save.m[id], m = getM(id); return ms && m && ms.s === 'active' ? m.steps[ms.st] : null; }
  G.curStep = curStep;
  const counter = k => save.counters[k] || 0;
  function bump(k, n) { save.counters[k] = counter(k) + (n || 1); }
  G.bump = bump;
  function beginStep(id) {
    const ms = save.m[id], m = getM(id), step = m.steps[ms.st];
    if (!step) return completeMission(id);
    ms.p = 0; ms.tg = null; ms.items = null; ms.armed = false; ms.b = 0; ms.t0 = rt.t;
    const p = P();
    switch (step.do) {
      case 'collect': {
        const pk = D.PICKUPS[step.what];
        if (pk && !pk.w) { // mission-only things scattered around
          let c = p;
          if (step.near === 'giver') { const s = spotOf(m.giver, m.at); if (s) c = xz(s); }
          const items = [];
          for (let i = 0; i < step.n; i++) {
            const s = W.randomWalkSpot(c.x, c.z, step.far ? 250 : 45, step.far ? 600 : 280, (x, z) => items.every(q => Math.hypot(q.x - x, q.z - z) > 35)) ||
              W.randomWalkSpot(c.x, c.z, 20, 500) || { x: c.x + rnd(-80, 80), z: c.z + rnd(-80, 80) };
            items.push(s);
          }
          ms.items = items.map(q => { const a = ll(q.x, q.z); return [Math.round(a.lat * 1e6) / 1e6, Math.round(a.lon * 1e6) / 1e6, 0]; });
          spawnMissionPickups(id);
        }
        break;
      }
      case 'deliver': giveItem(step.item, step.n || 1); ms.tg = resolveTarget(step.to, m, step); if (step.time) ms.deadline = rt.t + step.time; break;
      case 'visit': ms.p = []; if (step.time) ms.deadline = rt.t + step.time; break;
      case 'walk': ms.b = W.player.footMoved; break;
      case 'chat': ms.b = counter('chats'); break;
      case 'rush': ms.b = counter('rush'); break;
      case 'tag': ms.b = counter('tags'); break;
      case 'defend': ms.b = counter('defends'); ensureRival(); break;
      case 'count': ms.b = step.abs ? 0 : counter(step.key); break;
      case 'race': { const a = ll(p.x, p.z); ms.tg = Object.assign(a, { name: 'the start line', kind: 'race' }); break; }
      case 'chase': ms.tg = resolveTarget(step.at === 'here' ? 'here' : step.at, m, step); break;
      case 'escort': ms.tg = resolveTarget(step.to, m, step); startEscort(id, step); break;
      case 'talk':
        if (step.at === 'here') ms.tg = resolveTarget('here', m, step);
        else {
          const key = step.who + '@' + step.at;
          if (!save.spots[key]) { const t = resolveTarget(step.at, m, step); save.spots[key] = { lat: t.lat, lon: t.lon, name: t.name, kind: step.at }; }
          ms.tg = Object.assign({}, save.spots[key]);
          save.castAt[step.who] = key;
        }
        break;
      case 'buy': ms.b = counter('buy_' + step.item); break;
      case 'go': case 'photo': case 'pay': case 'dance': case 'quiz': case 'sleep': {
        const spec = step.do === 'sleep' ? 'home' : (step.to || step.at || step.of || 'giver');
        ms.tg = resolveTarget(spec, m, step);
        break;
      }
      default: break;
    }
    if (ms.tg && step.do !== 'escort') ms.tg.r = step.do === 'go' || step.do === 'deliver' ? 8 : 10;
    dirty();
    updateBeam();
    // steps that happen right where you are
    if ((step.at === 'here' && ['talk', 'pay', 'dance', 'quiz'].includes(step.do))) setTimeout(() => { if (alive && save.m[id] && save.m[id].st === ms.st) triggerStep(id); }, 600);
  }
  function endStepRuntime(id) {
    if (rt.escorts[id]) { delete rt.escorts[id]; refreshFollowers(); }
    if (rt.race && rt.race.mission === id) stopRace();
    if (rt.chase && rt.chase.mission === id) stopChase();
  }
  async function completeStep(id, quiet) {
    const ms = save.m[id], m = getM(id), step = m.steps[ms.st];
    endStepRuntime(id);
    clearMissionPickups(id);
    if (step.item && step.do === 'deliver') delete save.bag[step.item];
    ms.st++;
    ms.deadline = null;
    G.sfx.pick();
    if (step.get) { if (step.get.energy) addEnergy(step.get.energy); if (step.get.money) addMoney(step.get.money); }
    if (step.say && !quiet) await U.dialog({ who: m.giver, lines: step.say.map(l => G.text(l, { place: ms.tg && ms.tg.name })) });
    if (ms.st >= m.steps.length) return completeMission(id);
    U.feed('✅', G.text(step.text || 'Step done', { place: ms.tg && ms.tg.name, n: '' }));
    beginStep(id);
  }
  G.completeStep = completeStep;
  async function completeMission(id) {
    const m = getM(id), ms = save.m[id];
    ms.s = 'done'; ms.done = save.day;
    G.sfx.done();
    const parts = applyReward(m.reward || {}, m.title);
    if (MISSION[id]) bump('missions'); else bump('jobs');
    if (m.rush && !m.steps.some(x => x.do === 'deliver')) bump('rush');
    log('Completed: ' + m.title, '🏆');
    if (save.track === id) save.track = G.activeMissions()[0] || null;
    updateBeam();
    U.confetti();
    if (m.outro && m.outro.length) await U.dialog({ who: m.giver, lines: m.outro.map(l => G.text(l)) });
    U.banner('🏆 ' + m.title, parts.join(' · ') || 'Mission complete!', 'done');
    if (save.dyn[id]) { delete save.dyn[id]; delete save.m[id]; }
    refreshAvailability();
    dirty(true);
  }
  function failStep(id, why) {
    const ms = save.m[id];
    if (!ms) return;
    G.sfx.fail();
    endStepRuntime(id);
    const step = curStep(id);
    U.banner('⏱️ ' + (why || 'Out of time!'), step && (step.do === 'race' || step.do === 'chase') ? 'Go back to the marker and press E to try again.' : 'Try again!', 'fail');
    if (step && step.do === 'deliver') { delete save.bag[step.item]; beginStep(id); }
    else if (step && step.do === 'visit') beginStep(id);
    else ms.armed = false;
    dirty();
  }
  G.failStep = failStep;
  // Runs the interactive part of a step (dialog, quiz, dance, payment, photo...). Returns when done.
  async function triggerStep(id) {
    const ms = save.m[id], m = getM(id), step = curStep(id);
    if (!step || rt.busy) return;
    const place = ms.tg && ms.tg.name;
    if (step.when && !inWindow(step.when)) { U.toast(G.text('Come back between ' + fmtH(step.when[0]) + ' and ' + fmtH(step.when[1]) + '.')); return; }
    rt.busy = true;
    try {
      if (step.do === 'talk') {
        const ok = await U.dialog({ who: step.who, lines: (step.say || []).map(l => G.text(l, { place })), ask: step.ask ? {
          q: G.text(step.ask.q), opts: step.ask.opts.map(o => ({ t: G.text(o[0]), need: o[1], reply: G.text(o[2], { place }), good: o[3] })) } : null });
        if (step.ask && !ok) { addRel(step.who, -2); return; }
        if (step.who && D.CAST[step.who]) addRel(step.who, 3);
        await completeStep(id, true);
      } else if (step.do === 'photo') {
        await takePhoto(G.text(m.title) + ' · ' + (place || ''));
        bump('photos');
        if (isFriend('noor')) addMoney(25, 'from Noor');
        await completeStep(id);
      } else if (step.do === 'pay') {
        const amt = step.money;
        if (save.money < amt) { U.toast('You need ' + fmt$(amt) + '. You have ' + fmt$(save.money) + '.'); return; }
        const yes = await U.confirm(G.text(step.text, { place }), 'Pay ' + fmt$(amt));
        if (!yes) return;
        addMoney(-amt, ''); G.sfx.cash();
        await completeStep(id);
      } else if (step.do === 'dance') {
        const sc = await U.dance(step.n || 8, (step.speed || 1) * (isFriend('zoe') ? 0.85 : 1));
        if (sc >= 0.7) { addStat('charm', 0.25, true); await completeStep(id); } else { U.banner('So close!', 'You hit ' + Math.round(sc * 100) + '%. You need 70%. Try again!', 'fail'); }
      } else if (step.do === 'quiz') {
        const ok = await U.quiz(step.qs, step.need || Math.ceil(step.qs.length * 0.7), D.CAST[m.giver]);
        if (ok) { addStat('smarts', 0.5, true); await completeStep(id); }
      } else if (step.do === 'sleep') {
        await sleep();
      } else if (step.do === 'race') {
        if (!rt.race) startRace({ mission: id, n: step.n, time: step.time, ride: step.ride, hill: step.hill, x: P().x, z: P().z });
      } else if (step.do === 'chase') {
        if (!rt.chase) startChase({ mission: id, who: step.who, time: step.time, speed: step.speed });
      }
    } finally { rt.busy = false; }
  }
  G.triggerStep = triggerStep;
  const fmtH = h => String(Math.floor(h) % 24).padStart(2, '0') + ':00';
  function inWindow(w) { const h = save.clock; return w[0] <= w[1] ? h >= w[0] && h < w[1] : h >= w[0] || h < w[1]; }
  G.inWindow = inWindow;

  // Passive progress checks + arrival checks for every active mission
  function updateMissions(dt) {
    rt.missionTimer -= dt;
    const slow = rt.missionTimer <= 0;
    if (slow) rt.missionTimer = 0.5;
    const p = P();
    for (const id of G.activeMissions()) {
      const ms = save.m[id], step = curStep(id), m = getM(id);
      if (!step) continue;
      if (ms.deadline && rt.t > ms.deadline) { failStep(id, 'Out of time!'); continue; }
      const tg = ms.tg && xz(ms.tg);
      const near = r => tg && dist(tg, p) < (r || ms.tg.r || 8) * (save.equip.ride && W.ride().mode === 'drive' ? 1.6 : 1);
      switch (step.do) {
        case 'go':
          if (near()) {
            if (step.when && !inWindow(step.when)) { if (!ms.whenNote) { ms.whenNote = 1; U.toast('Come back between ' + fmtH(step.when[0]) + ' and ' + fmtH(step.when[1]) + '.'); } break; }
            if (step.family && !followersOk()) { if (!ms.famNote) { ms.famNote = 1; U.toast('Bring the family! Phone → People → bring them along.'); } break; }
            completeStep(id);
          } else ms.whenNote = ms.famNote = 0;
          break;
        case 'deliver':
          if (near()) {
            ms.p++; giveItem(step.item, -1); G.sfx.coin(); U.feed(D.ITEMS[step.item].e, 'Delivered! (' + ms.p + '/' + (step.n || 1) + ')');
            if (m.rush) bump('rush');
            if (ms.p >= (step.n || 1)) completeStep(id); else { ms.tg = resolveTarget(step.to, m, step); ms.tg.r = 8; updateBeam(); dirty(); }
          }
          break;
        case 'visit':
          if (slow) for (const k of step.kinds) {
            if (ms.p.includes(k)) continue;
            const pl = placesOf(k).find(q => dist(q.pin, p) < 10);
            if (pl) { ms.p.push(k); U.feed(D.KINDS[k].e, 'Visited ' + pl.name + ' (' + ms.p.length + '/' + step.kinds.length + ')'); G.sfx.pick(); if (k === 'metro') visitMetro(pl); updateBeam(); dirty(); }
          }
          if (ms.p.length >= step.kinds.length) completeStep(id);
          break;
        case 'collect':
          if (ms.items) { if (ms.items.every(q => q[2])) completeStep(id); }
          else if (ms.p >= step.n) completeStep(id);
          break;
        case 'buy': if (slow && (owned(step.item) || has(step.item) || counter('buy_' + step.item) > ms.b || (D.ITEMS[step.item].pet && save.pets.some(q => q.kind === D.ITEMS[step.item].pet)))) completeStep(id); break;
        case 'have': if (slow && save.money >= step.money) completeStep(id); break;
        case 'stat': if (slow && stat(step.stat) >= step.n) completeStep(id); break;
        case 'level': if (slow && G.level() >= step.n) completeStep(id); break;
        case 'own': if (slow && ownCount(step) >= (step.n || 1)) completeStep(id); break;
        case 'walk': if (slow && W.player.footMoved - ms.b >= step.m) completeStep(id); break;
        case 'chat': if (slow && counter('chats') - ms.b >= step.n) completeStep(id); break;
        case 'rush': if (slow && counter('rush') - ms.b >= step.n) completeStep(id); break;
        case 'tag': if (slow && counter('tags') - ms.b >= step.n) completeStep(id); break;
        case 'defend': if (slow && counter('defends') - ms.b >= 1) completeStep(id); break;
        case 'count': if (slow && counter(step.key) - (ms.b || 0) >= step.n) completeStep(id); break;
        case 'escort': {
          const e = rt.escorts[id];
          if (!e) { if (slow) startEscort(id, step); break; }
          const ed = Math.hypot(e.obj.position.x - p.x, e.obj.position.z - p.z);
          const inCar = save.equip.ride && W.ride().mode === 'drive';
          if (near(14)) {
            if (step.when && !inWindow(step.when)) { if (!ms.whenNote) { ms.whenNote = 1; U.toast('Wait here until ' + fmtH(step.when[0]) + '... or come back later.'); } break; }
            if (ed < 10 || inCar) completeStep(id);
            else if (slow) U.prompt('Wait for ' + e.name + '!');
          } else if (ed > 22 && slow && !inCar) { if (!ms.waitNote || rt.t - ms.waitNote > 8) { ms.waitNote = rt.t; U.toast('Slow down, ' + e.name + ' can\'t keep up!'); } }
          break;
        }
        default: break;
      }
    }
  }
  function followersOk() { return (!save.partner || save.settings.follow.partner) && (!save.kids.length || save.settings.follow.kids); }
  function ownCount(step) {
    switch (step.what) {
      case 'apt': return save.apt.tier >= step.n ? step.n : 0;
      case 'biz': return Object.keys(save.biz).length;
      case 'bizid': return save.biz[step.id] ? 1 : 0;
      case 'turf': return Object.values(save.turf).filter(t => t.own).length;
      case 'friends': return Object.keys(save.friends).length;
      case 'kids': return save.kids.length;
      case 'managers': return Object.values(save.biz).filter(b => b.mgr).length;
      case 'upgrades': return Object.values(save.biz).reduce((a, b) => a + (b.lvl || 1) - 1, 0);
      case 'stickers': return Object.keys(save.stickers).filter(k => save.stickers[k] > 0).length;
      case 'sets': return D.STICKER_SETS.filter(s => setDone(s.id)).length;
      default: return 0;
    }
  }
  G.ownCount = ownCount;
  // The arrow's goal: {x, z, label, e}
  function stepGoal(id) {
    const ms = save.m[id], step = curStep(id), m = getM(id);
    if (!step) return null;
    const p = P();
    const at = (q, label, e) => q ? Object.assign({ label, e }, q.x != null ? q : xz(q)) : null;
    const nearestPick = type => { let b = null, bd = 1e9; for (const k of rt.pickups) { if (k.dead || k.type !== type || (k.mission && k.mission !== id)) continue; const d = dist(k, p); if (d < bd) { bd = d; b = k; } } return b; };
    switch (step.do) {
      case 'collect': {
        if (ms.items) { let b = null, bd = 1e9; for (const q of ms.items) { if (q[2]) continue; const a = xz({ lat: q[0], lon: q[1] }); const d = dist(a, p); if (d < bd) { bd = d; b = a; } } return at(b, D.PICKUPS[step.what].n, D.PICKUPS[step.what].e); }
        const k = nearestPick(step.what); return k ? at({ x: k.x, z: k.z }, D.PICKUPS[step.what].n, D.PICKUPS[step.what].e) : null;
      }
      case 'visit': {
        let best = null, bd = 1e9;
        for (const k of step.kinds) { if (ms.p.includes(k)) continue; const pl = findPlace(k, p.x, p.z, { min: 0, max: 1200 }); const d = dist(pl.pin, p); if (d < bd) { bd = d; best = { x: pl.pin.x, z: pl.pin.z, label: pl.name, e: D.KINDS[k].e }; } }
        return best;
      }
      case 'buy': {
        if (owned(step.item) || has(step.item)) return null;
        const kind = Object.keys(D.KINDS).find(k => D.KINDS[k].sells.includes(step.item));
        if (!kind) return null;
        const pl = findPlace(kind, p.x, p.z, { min: 0, max: 1500 });
        return { x: pl.pin.x, z: pl.pin.z, label: pl.name, e: D.ITEMS[step.item].e };
      }
      case 'tag': case 'own': {
        if (step.do === 'tag' || step.what === 'turf') { const t = nearestTagTarget(); if (t) return t; }
        if (step.what === 'apt' || step.what === 'bizid' || step.what === 'biz' || step.what === 'managers' || step.what === 'upgrades') return null;
        return null;
      }
      case 'defend': { const r = rivalTarget(); return r; }
      case 'rush': { const b = nearestBiz(); return b ? { x: b.x, z: b.z, label: b.name, e: BIZ[b.id].e } : null; }
      case 'sleep': { const h = homeSpot(); return { x: h.x, z: h.z, label: 'home', e: '🏠' }; }
      case 'race': if (rt.race && rt.race.mission === id) { const c = rt.race.cps[rt.race.i]; return c ? { x: c.x, z: c.z, label: 'Checkpoint ' + (rt.race.i + 1) + '/' + rt.race.cps.length, e: '🏁' } : null; } return at(ms.tg, 'Start line', '🏁');
      case 'chase': if (rt.chase && rt.chase.mission === id) return { x: rt.chase.obj.position.x, z: rt.chase.obj.position.z, label: rt.chase.name, e: '🏃' }; return at(ms.tg, ms.tg && ms.tg.name, '❗');
      default: return ms.tg ? at(ms.tg, ms.tg.name, stepIcon(step)) : null;
    }
  }
  G.stepGoal = stepGoal;
  function stepIcon(step) {
    return { go: '📍', deliver: D.ITEMS[step.item] ? D.ITEMS[step.item].e : '📦', talk: '💬', photo: '📸', pay: '💳', dance: '💃', quiz: '❓', escort: '🚶', sleep: '😴' }[step.do] || '⭐';
  }
  G.stepIcon = stepIcon;
  // A nice description of a step for the HUD
  G.stepText = function (id) {
    const ms = save.m[id], step = curStep(id);
    if (!step) return '';
    let n = '';
    if (step.do === 'deliver') n = (step.n || 1) - ms.p;
    let t = G.text(step.text || step.do, { place: ms.tg && ms.tg.name, n });
    if (step.do === 'collect') t += ms.items ? ' · ' + ms.items.filter(q => q[2]).length + '/' + step.n : ' · ' + Math.min(ms.p, step.n) + '/' + step.n;
    if (step.do === 'visit') t += ' · ' + ms.p.length + '/' + step.kinds.length;
    if (step.do === 'walk') t += ' · ' + Math.min(step.m, Math.round(W.player.footMoved - ms.b)) + '/' + step.m + ' m';
    if (step.do === 'chat') t += ' · ' + Math.min(step.n, counter('chats') - ms.b) + '/' + step.n;
    if (step.do === 'rush') t += ' · ' + Math.min(step.n, counter('rush') - ms.b) + '/' + step.n;
    if (step.do === 'count' && step.n > 1) t += ' · ' + Math.max(0, Math.min(step.n, counter(step.key) - (ms.b || 0))) + '/' + step.n;
    if (step.do === 'have') t += ' · ' + fmt$(Math.min(save.money, step.money)) + '/' + fmt$(step.money);
    if (step.do === 'stat') t += ' · ' + Math.floor(stat(step.stat)) + '/' + step.n;
    if (step.do === 'level') t += ' · ' + G.level() + '/' + step.n;
    if (step.do === 'own' && step.n > 1) t += ' · ' + Math.min(ownCount(step), step.n) + '/' + step.n;
    if (step.when) t += ' · ' + fmtH(step.when[0]) + '–' + fmtH(step.when[1]);
    return t;
  };

  // ------------------------------------------------------------------ escorts + followers
  function castLook(id) {
    const c = D.CAST[id];
    if (!c) return W.randomLook(id.length * 977);
    if (id === 'sam' && save.pref === 'bf' && c.lookB) return Object.assign(W.randomLook(5), c.lookB);
    return Object.assign(W.randomLook(id.length * 131 + id.charCodeAt(0)), c.look || {});
  }
  G.castLook = castLook;
  function makeCastObj(id) {
    const c = D.CAST[id];
    if (c && c.animal) return W.animal(c.animal, c.color);
    if (id === 'kid' || (id && id.startsWith('kid:'))) {
      const k = save.kids[id === 'kid' ? 0 : +id.split(':')[1]] || { seed: 1, name: 'Kid' };
      return W.person(Object.assign(W.randomLook(k.seed), { h: save.day - k.born > 12 ? 0.68 : 0.5, hat: null, bag: null }));
    }
    return W.person(castLook(id));
  }
  function startEscort(id, step) {
    const who = step.who === 'kid' ? 'kid' : step.who;
    const existing = rt.followers.find(f => f.who === who);
    const obj = existing ? existing.obj : makeCastObj(who);
    obj.userData.maxSpeed = step.speed || null;
    const name = who === 'kid' ? (save.kids[0] ? save.kids[0].name : 'the kid') : D.CAST[who].n;
    rt.escorts[id] = { who, obj, name };
    refreshFollowers();
  }
  // Rebuilds who walks behind you: escorts first, then partner, kids, pets, one friend.
  function refreshFollowers() {
    if (!W) return;
    const list = [], seen = new Set();
    const keep = new Map(rt.followers.map(f => [f.who, f.obj]));
    const add = (who, mk) => { if (seen.has(who) || list.length >= 6) return; seen.add(who); list.push({ who, obj: keep.get(who) || mk() }); };
    for (const id of Object.keys(rt.escorts)) { const e = rt.escorts[id]; add(e.who, () => e.obj); }
    const f = save.settings.follow;
    if (save.partner && f.partner) add(save.partner, () => makeCastObj(save.partner));
    if (f.kids) save.kids.forEach((k, i) => add(i === 0 ? 'kid' : 'kid:' + i, () => makeCastObj(i === 0 ? 'kid' : 'kid:' + i)));
    if (f.pets) save.pets.forEach((p, i) => add('pet:' + i, () => W.animal(p.kind, p.kind === 'dog' ? 0xf0e6d6 : 0xff9a3d)));
    if (f.friend && save.friends[f.friend]) add(f.friend, () => makeCastObj(f.friend));
    for (const e of list) if (!Object.values(rt.escorts).some(x => x.who === e.who)) e.obj.userData.maxSpeed = null;
    rt.followers = list;
    W.setFollowers(list.map(e => e.obj));
    rt.actorTimer = 0;
  }
  G.refreshFollowers = refreshFollowers;

  // ------------------------------------------------------------------ race + chase
  function startRace(o) {
    stopRace();
    const ride = save.equip.ride, mode = ride ? W.ride().mode : 'foot';
    if (o.ride === 'foot' && ride) { U.toast('This race is on foot. Press V to get off.'); return; }
    if (o.ride === 'drive' && mode !== 'drive') { U.toast('You need a scooter or a car for this race. Press V to ride.'); return; }
    if (o.ride === 'ride' && mode !== 'ride') { U.toast('Boards, kick scooters and bikes only! Press V to change ride.'); return; }
    const cps = [];
    let px = o.x, pz = o.z;
    const step = o.ride === 'drive' ? [90, 170] : [50, 110];
    for (let i = 0; i < o.n; i++) {
      const ok = (x, z, sg) => (o.ride !== 'drive' || sg.car) && cps.every(c => Math.hypot(c.x - x, c.z - z) > 45) && Math.hypot(o.x - x, o.z - z) > 30 * Math.min(i, 2);
      let s = null;
      if (o.hill) { // uphill race: of a dozen candidates, the highest one
        for (let k = 0; k < 12; k++) { const c = W.randomWalkSpot(px, pz, step[0], step[1], ok); if (c && (!s || W.groundAt(c.x, c.z) > W.groundAt(s.x, s.z))) s = c; }
      } else s = W.randomWalkSpot(px, pz, step[0], step[1], ok);
      if (!s) break;
      cps.push({ x: s.x, z: s.z });
      px = s.x; pz = s.z;
    }
    if (!cps.length) { U.toast('No room for a race here. Try a different spot.'); return; }
    const THREE = W.THREE;
    const meshes = cps.map((c, i) => {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.22, 8, 28), new THREE.MeshBasicMaterial({ color: i === 0 ? 0xffc21f : 0x6b4eff, transparent: true, opacity: 0.9 }));
      ring.position.y = 2.8; g.add(ring);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 60, 8, 1, true).translate(0, 30, 0), new THREE.MeshBasicMaterial({ color: 0x6b4eff, transparent: true, opacity: 0.25, depthWrite: false }));
      g.add(beam);
      const num = W.label(String(i + 1), { bg: '#6b4eff', size: 48, height: 1.1 }); num.position.y = 5.8; g.add(num);
      g.position.set(c.x, W.groundAt(c.x, c.z), c.z);
      W.scene.add(g);
      return g;
    });
    rt.race = { mission: o.mission, cps, meshes, i: 0, time: o.time, t0: rt.t + 3, onWin: o.onWin, onFail: o.onFail, ride: o.ride, count: 3,
      hill: !!o.hill, e0: W.elevAt(o.x, o.z) };
    U.countdown(() => { if (rt.race) rt.race.t0 = rt.t; });
    updateBeam();
  }
  function stopRace() {
    if (!rt.race) return;
    for (const m of rt.race.meshes) W.scene.remove(m);
    rt.race = null; U.timer(null); updateBeam();
  }
  function updateRace() {
    const r = rt.race; if (!r) return;
    const p = P();
    r.meshes.forEach((m, i) => { m.visible = i >= r.i; m.children[0].material.color.setHex(i === r.i ? 0xffc21f : 0x6b4eff); m.children[0].rotation.y = rt.t * 1.5; });
    const left = r.time - (rt.t - r.t0);
    U.timer('🏁 ' + (r.i) + '/' + r.cps.length, Math.max(0, left));
    if (rt.t < r.t0) return;
    const c = r.cps[r.i];
    if (c && Math.hypot(c.x - p.x, c.z - p.z) < (W.ride().mode === 'drive' ? 7 : 5)) {
      r.i++; G.sfx.tick();
      const up = r.hill ? W.elevAt(c.x, c.z) - r.e0 : NaN;
      U.feed('🏁', 'Checkpoint ' + r.i + '/' + r.cps.length + (up === up ? ' · ⛰️ ' + (up >= 0 ? '+' : '') + Math.round(up) + ' m' : ''));
      updateBeam();
      if (r.i >= r.cps.length) { const cb = r.onWin, id = r.mission; stopRace(); bump('races'); if (cb) cb(); else if (id) completeStep(id); return; }
    }
    if (left <= 0) { const cb = r.onFail, id = r.mission; stopRace(); if (cb) cb(); else if (id) failStep(id, 'Too slow!'); }
  }
  function startChase(o) {
    stopChase();
    const p = P();
    const s = W.randomWalkSpot(p.x, p.z, 18, 35) || { x: p.x + 20, z: p.z };
    const a = W.agentOn(s.x, s.z, false);
    if (!a) { U.toast('Nowhere to run here!'); return; }
    const obj = o.obj || makeCastObj(o.who);
    obj.position.set(s.x, W.groundAt(s.x, s.z), s.z);
    W.scene.add(obj);
    const name = o.name || (D.CAST[o.who] ? D.CAST[o.who].n : 'them');
    W.say(obj, o.taunt || 'Catch me if you can!', 2.5);
    rt.chase = { mission: o.mission, obj, a, speed: o.speed || 6.5, time: o.time || 60, t0: rt.t, name, onWin: o.onWin, onFail: o.onFail };
    updateBeam();
  }
  function stopChase() { if (!rt.chase) return; W.scene.remove(rt.chase.obj); rt.chase = null; U.timer(null); updateBeam(); }
  function updateChase(dt) {
    const c = rt.chase; if (!c) return;
    const p = P(), o = c.obj.position;
    const d = Math.hypot(o.x - p.x, o.z - p.z);
    const sp = c.speed * (d < 8 ? 1.15 : d > 45 ? 0.55 : 1);
    W.agentAdvance(c.a, sp * dt, false, (opts, ex, ez) => {
      let best = opts[0], bd = -1;
      for (const op of opts) {
        const sg = op[0], fx = op[1] > 0 ? sg.x2 : sg.x1, fz = op[1] > 0 ? sg.z2 : sg.z1;
        const sc = Math.hypot(fx - p.x, fz - p.z) + Math.random() * 25;
        if (sc > bd) { bd = sc; best = op; }
      }
      return best;
    });
    const q = W.agentPoint(c.a);
    o.set(q.x, q.y, q.z);
    c.obj.rotation.y = Math.atan2(-q.ux, -q.uz);
    W.animate(c.obj, sp, dt);
    const left = c.time - (rt.t - c.t0);
    U.timer('🏃 ' + Math.round(d) + ' m', Math.max(0, left));
    if (d < 2.4 + (save.equip.ride ? 1 : 0)) { const cb = c.onWin, id = c.mission; G.sfx.done(); U.feed('🙌', 'Caught ' + c.name + '!'); stopChase(); if (cb) cb(); else if (id) completeStep(id); return; }
    if (left <= 0) { const cb = c.onFail, id = c.mission; stopChase(); if (cb) cb(); else if (id) failStep(id, c.name + ' got away!'); }
  }

  // ------------------------------------------------------------------ pickups
  const TOKEN_GEO_KEY = 'tokenGeo';
  const matCache = new Map();
  function tokenMats(type) {
    if (matCache.has(type)) return matCache.get(type);
    const THREE = W.THREE, pk = D.PICKUPS[type];
    const face = new THREE.MeshBasicMaterial({ map: W.emojiTex(pk.e, pk.bg, '#ffffff') });
    const rim = new THREE.MeshLambertMaterial({ color: new THREE.Color(pk.bg).multiplyScalar(0.8) });
    const m = [rim, face, face];
    matCache.set(type, m);
    return m;
  }
  function tokenGeo() {
    if (!rt[TOKEN_GEO_KEY]) rt[TOKEN_GEO_KEY] = new W.THREE.CylinderGeometry(0.62, 0.62, 0.12, 28).rotateX(Math.PI / 2);
    return rt[TOKEN_GEO_KEY];
  }
  function spawnPickup(type, x, z, mission, idx) {
    const THREE = W.THREE;
    const mesh = new THREE.Mesh(tokenGeo(), tokenMats(type)), gy = W.surfaceAt(x, z);
    mesh.position.set(x, gy + 1.15, z);
    W.scene.add(mesh);
    let beam = null;
    if (mission || type === 'gem' || type === 'pack' || type === 'cash') {
      beam = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, mission ? 70 : 30, 8, 1, true).translate(0, mission ? 35 : 15, 0),
        new THREE.MeshBasicMaterial({ color: mission ? 0xff5c8a : 0xffd84a, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending }));
      beam.position.set(x, gy, z);
      W.scene.add(beam);
    }
    const k = { type, x, z, gy, mesh, beam, mission, idx, phase: Math.random() * 6.28, dead: 0 };
    rt.pickups.push(k);
    return k;
  }
  function removePickup(k) { W.scene.remove(k.mesh); if (k.beam) W.scene.remove(k.beam); }
  function spawnMissionPickups(id) {
    const ms = save.m[id], step = curStep(id);
    if (!ms || !ms.items || !step) return;
    clearMissionPickups(id);
    ms.items.forEach((q, i) => { if (!q[2]) { const a = xz({ lat: q[0], lon: q[1] }); spawnPickup(step.what, a.x, a.z, id, i); } });
  }
  function clearMissionPickups(id) {
    for (let i = rt.pickups.length - 1; i >= 0; i--) { const k = rt.pickups[i]; if (k.mission === id) { removePickup(k); rt.pickups.splice(i, 1); } }
  }
  const PICK_W = Object.keys(D.PICKUPS).filter(k => D.PICKUPS[k].w > 0);
  function randomType() {
    const luck = setBonus('luck');
    const want = new Set();
    for (const id of G.activeMissions()) { const s = curStep(id); if (s && s.do === 'collect' && D.PICKUPS[s.what].w > 0) want.add(s.what); }
    let tot = 0;
    const w = PICK_W.map(k => { let v = D.PICKUPS[k].w; if (want.has(k)) v *= 4; if (luck && (k === 'gem' || k === 'pack' || k === 'cash')) v *= 1 + luck * 4; if (k === 'spray' && Object.keys(save.turf).length) v *= 1.5; tot += v; return v; });
    let r = Math.random() * tot;
    for (let i = 0; i < PICK_W.length; i++) { if (r < w[i]) return PICK_W[i]; r -= w[i]; }
    return 'coin';
  }
  let pickTimer = 0;
  function managePickups(dt) {
    const p = P();
    pickTimer -= dt;
    if (pickTimer <= 0) {
      pickTimer = 0.8;
      for (let i = rt.pickups.length - 1; i >= 0; i--) { const k = rt.pickups[i]; if (!k.mission && !k.dead && dist(k, p) > 600) { removePickup(k); rt.pickups.splice(i, 1); } }
      const live = rt.pickups.filter(k => !k.mission && !k.dead).length;
      const want = W.TOUCH ? 22 : 26;
      for (let t = 0; t < (live < 8 ? 6 : 2) && live + t < want; t++) {
        const s = W.randomWalkSpot(p.x, p.z, live < 6 ? 15 : 60, 360, (x, z) => rt.pickups.every(k => k.dead || Math.hypot(k.x - x, k.z - z) > 30));
        if (s) spawnPickup(randomType(), s.x, s.z);
      }
    }
    const reach = save.equip.ride ? (W.ride().mode === 'drive' ? 3.2 : 2.2) : 1.6;
    const tt = rt.t;
    for (let i = rt.pickups.length - 1; i >= 0; i--) {
      const k = rt.pickups[i];
      if (k.dead) {
        k.dead += dt; const t = k.dead / 0.35;
        k.mesh.position.y = k.gy + 1.15 + t * 2.2; k.mesh.scale.setScalar(Math.max(0.01, 1 - t)); k.mesh.rotation.y += dt * 30;
        if (t >= 1) { removePickup(k); rt.pickups.splice(i, 1); }
        continue;
      }
      k.mesh.rotation.y = tt * 2.6 + k.phase;
      k.mesh.position.y = k.gy + 1.15 + Math.sin(tt * 3 + k.phase) * 0.14;
      if (Math.hypot(k.x - p.x, k.z - p.z) < reach && p.y - k.gy < 2.6 && p.y - k.gy > -1.5) collect(k);
    }
  }
  function collect(k) {
    k.dead = 0.0001;
    if (k.beam) { W.scene.remove(k.beam); k.beam = null; }
    const pk = D.PICKUPS[k.type];
    bump('pickups'); bump('pk_' + k.type);
    if (k.mission) {
      const ms = save.m[k.mission];
      if (ms && ms.items && ms.items[k.idx]) { ms.items[k.idx][2] = 1; U.feed(pk.e, pk.n + ' (' + ms.items.filter(q => q[2]).length + '/' + ms.items.length + ')'); G.sfx.pick(); dirty(); }
      return;
    }
    for (const id of G.activeMissions()) { const s = curStep(id); if (s && s.do === 'collect' && s.what === k.type && !save.m[id].items) save.m[id].p++; }
    if (pk.money) { const amt = Math.round(rnd(pk.money[0], pk.money[1]) * (1 + G.level() * 0.06)); save.money += amt; bump('coins', k.type === 'coin' ? 1 : 0); U.feed(pk.e, '+' + fmt$(amt)); U.hud.bump('money'); G.sfx.coin(); }
    if (pk.energy) { addEnergy(pk.energy * G.foodMul()); U.feed(pk.e, '+' + Math.round(pk.energy * G.foodMul()) + ' ⚡'); G.sfx.pick(); }
    if (pk.stat) { addStat(pk.stat, 0.25); G.sfx.pick(); }
    if (pk.item) giveItem(pk.item, 1);
    if (pk.xp) { addXp(pk.xp); U.feed(pk.e, '+' + pk.xp + ' XP'); G.sfx.pick(); }
    if (pk.sticker) { addSticker(); G.sfx.pick(); }
    if (pk.happy) addHappy(pk.happy);
    if (!pk.xp) save.xp += 1;
    dirty();
  }

  // ------------------------------------------------------------------ cast actors in the world (mission givers)
  function actorSpots() {
    // key -> {who, x, z, open: [ids], active: [ids]}
    const out = new Map();
    const add = (who, at, id, kind) => {
      if (rt.followers.some(f => f.who === who)) return;  // walking with you
      const s = spotOf(who, at);
      if (!s) return;
      const key = who + '@' + (at === 'home' ? 'home' : at);
      let e = out.get(key);
      if (!e) { const q = xz(s); e = { key, who, x: q.x, z: q.z, open: [], active: [], place: s.name }; out.set(key, e); }
      e[kind].push(id);
    };
    for (const id of G.openMissions()) { const m = getM(id); add(m.giver, m.at, id, 'open'); }
    for (const id of G.activeMissions()) {
      const step = curStep(id), m = getM(id), ms = save.m[id];
      if (!step) continue;
      if (step.do === 'talk' && step.at !== 'here' && ms.tg) {
        if (rt.followers.some(f => f.who === step.who)) continue;
        const key = step.who + '@' + step.at, q = xz(ms.tg);
        let e = out.get(key);
        if (!e) { e = { key, who: step.who, x: q.x, z: q.z, open: [], active: [], place: ms.tg.name }; out.set(key, e); }
        e.active.push(id);
      }
      if (['quiz', 'dance', 'pay'].includes(step.do) && step.at === 'giver') add(m.giver, m.at, id, 'active');
      if (step.do === 'go' && (step.to === 'giver' || step.to === 'who')) add(step.to === 'who' ? step.who : m.giver, step.to === 'who' ? (save.castAt[step.who] || '').split('@')[1] || m.at : m.at, id, 'active');
    }
    // turf bosses
    for (const tid of Object.keys(save.turf)) {
      const t = save.turf[tid];
      if (t.own || !t.spots || !t.tags || t.tags.some(x => !x)) continue;
      const c = turfCenter(tid);
      const w = W.nearestWalk(c.x, c.z, 200);
      if (!w) continue;
      out.set('boss@' + tid, { key: 'boss@' + tid, who: 'boss', turf: tid, x: w.x, z: w.z, open: [], active: [], place: t.name });
    }
    return out;
  }
  function updateActors(dt) {
    rt.actorTimer -= dt;
    const p = P();
    if (rt.actorTimer <= 0) {
      rt.actorTimer = 1;
      const spots = actorSpots();
      rt.spots = spots;
      for (const [key, a] of rt.actors) {
        const s = spots.get(key);
        if (!s || Math.hypot(a.x - p.x, a.z - p.z) > 300) { W.scene.remove(a.obj); rt.actors.delete(key); }
      }
      for (const [key, s] of spots) {
        if (rt.actors.has(key) || Math.hypot(s.x - p.x, s.z - p.z) > 240) continue;
        let obj, name, e;
        if (s.who === 'boss') { const crew = CREW[turfCrew(s.turf)]; obj = W.person(Object.assign(W.randomLook(crew.id.length * 99), crew.look)); name = crew.boss; e = crew.e; }
        else { obj = makeCastObj(s.who); name = D.CAST[s.who].n; e = D.CAST[s.who].e; }
        const off = (hash(s.key.length * 31 + s.key.charCodeAt(0) * 7 + (s.key.charCodeAt(2) || 0)) - 0.5) * 4;
        s.x += off; s.z += off * 0.3;
        obj.position.set(s.x, W.surfaceAt(s.x, s.z), s.z);
        const nm = W.label(e + ' ' + name, { size: 34, height: 0.5, bg: 'rgba(255,255,255,.92)', fg: '#1f1a3d', border: '#1f1a3d' });
        nm.position.y = 2.35 / (obj.scale.y || 1); obj.add(nm);
        const mark = W.label('!', { bg: '#ffc21f', fg: '#1f1a3d', size: 60, height: 0.9, border: '#1f1a3d', depthTest: false });
        mark.position.y = 3.2 / (obj.scale.y || 1); obj.add(mark);
        W.scene.add(obj);
        rt.actors.set(key, { key, obj, x: s.x, z: s.z, who: s.who, turf: s.turf, nm, mark, phase: Math.random() * 6 });
      }
      for (const [key, a] of rt.actors) {
        const s = spots.get(key);
        a.open = s.open; a.active = s.active; a.place = s.place;
        const show = s.open.length || s.active.length || s.who === 'boss';
        a.mark.visible = !!show;
        if (show) {
          const txt = s.who === 'boss' ? '⚔️' : s.active.length ? '💬' : '!';
          if (a.markTxt !== txt) {
            a.obj.remove(a.mark);
            a.mark = W.label(txt, { bg: txt === '!' ? '#ffc21f' : '#ffffff', fg: '#1f1a3d', size: 60, height: 0.9, border: '#1f1a3d', depthTest: false });
            a.mark.position.y = 3.2 / (a.obj.scale.y || 1); a.obj.add(a.mark); a.markTxt = txt;
          }
        }
      }
    }
    for (const a of rt.actors.values()) {
      const d = Math.hypot(a.x - p.x, a.z - p.z);
      a.obj.rotation.y = d < 12 ? Math.atan2(p.x - a.x, p.z - a.z) + Math.PI : a.obj.rotation.y;
      W.animate(a.obj, 0, dt, d < 6 && (a.open && a.open.length) ? 'wave' : null);
      a.nm.visible = d < 45;
      if (a.mark) { a.mark.position.y = 3.2 / (a.obj.scale.y || 1) + Math.sin(rt.t * 3 + a.phase) * 0.12; const s = Math.max(0.9, d / 30); a.mark.scale.set(0.9 * s * a.mark.material.map.userData.aspect, 0.9 * s, 1); }
    }
  }

  // ------------------------------------------------------------------ talking to people
  async function talkTo(a) {
    if (rt.busy) return;
    if (a.who === 'boss') return challengeBoss(a.turf);
    const who = a.who, c = D.CAST[who];
    for (const id of (a.active || [])) {  // steps waiting for this person
      const step = curStep(id);
      if (step && ['talk', 'quiz', 'dance', 'pay'].includes(step.do)) return triggerStep(id);
    }
    rt.busy = true;
    try {
      const opts = [];
      for (const id of (a.open || [])) opts.push({ t: '📜 ' + getM(id).title, v: 'm:' + id });
      opts.push({ t: '💬 Chat', v: 'chat' });
      if (Object.keys(save.bag).some(k => D.ITEMS[k] && D.ITEMS[k].type === 'gift')) opts.push({ t: '🎁 Give a gift', v: 'gift' });
      if (save.friends[who] && who !== save.partner) opts.push({ t: save.settings.follow.friend === who ? '👋 Stop hanging out' : '🤝 Hang out (follow me)', v: 'hang' });
      opts.push({ t: 'Bye', v: 'bye' });
      const v = await U.choose({ who, text: greet(who), opts });
      if (v && v.startsWith('m:')) {
        const id = v.slice(2), m = getM(id);
        if (m.pref && !save.pref) {
          const pv = await U.choose({ who, text: G.text('Rosa: Before I play matchmaker... who catches your eye, {name}?'), opts: [{ t: '💗 A girlfriend', v: 'gf' }, { t: '💙 A boyfriend', v: 'bf' }] });
          save.pref = pv === 'bf' ? 'bf' : 'gf';
        }
        const place = m.steps[0] && (m.steps[0].at || m.steps[0].to);
        const placeName = place && D.KINDS[place] ? 'a ' + D.KINDS[place].n.toLowerCase() + ' nearby' : 'a spot nearby';
        await U.dialog({ who, lines: m.intro.map(l => G.text(l, { place: placeName })) });
        const ok = await U.choose({ who, text: '📜 ' + m.title + rewardLine(m.reward), opts: [{ t: '✅ Let\'s do it', v: 'y' }, { t: 'Maybe later', v: 'n' }] });
        if (ok === 'y') { accept(id); U.toast('📜 New mission: ' + m.title); }
      } else if (v === 'chat') {
        const last = save.counters['chat_' + who] || -999;
        if (save.gameMin - last > 60) { addRel(who, 2); save.counters['chat_' + who] = save.gameMin; }
        await U.dialog({ who, lines: [chatLine(who)] });
      } else if (v === 'gift') { await giveGift(who); }
      else if (v === 'hang') { save.settings.follow.friend = save.settings.follow.friend === who ? null : who; refreshFollowers(); U.toast(save.settings.follow.friend ? c.n + ' is hanging out with you.' : c.n + ' heads off.'); }
    } finally { rt.busy = false; }
    dirty();
  }
  G.talkTo = talkTo;
  function rewardLine(r) {
    const parts = [];
    if (r.money) parts.push(fmt$(r.money));
    if (r.xp) parts.push(r.xp + ' XP');
    for (const k of Object.keys(r.stats || {})) parts.push(D.STATS.find(s => s.id === k).e);
    if (r.friend) parts.push('🤝');
    if (r.partner) parts.push('💘');
    if (r.kid) parts.push('👶');
    return parts.length ? '\nReward: ' + parts.join(' · ') : '';
  }
  function greet(who) {
    const r = save.rel[who] || 0, c = D.CAST[who];
    if (who === save.partner) return c.e + ' ' + c.n + ': ' + pick(['Hey you! 💕', 'There you are!', 'Missed you today.', 'What are we doing tonight?']);
    if (save.friends[who]) return c.e + ' ' + c.n + ': ' + pick(['Hey, friend!', 'Good to see you!', 'What\'s up?']);
    if (r > 30) return c.e + ' ' + c.n + ': ' + pick(['Oh hi!', 'Hello again!', 'Nice to see you.']);
    return c.e + ' ' + c.n + ' · ' + c.role;
  }
  function chatLine(who) {
    const lines = {
      max: ['I wrote a song about pigeons. It\'s mostly cooing.', 'You can crash on the couch any time, you know.', 'Have you eaten? Rosa will ask. Have an answer ready.'],
      rosa: ['Eat something. You look thin.', 'In my day, this whole street was bakeries.', 'Meatball says hi. He doesn\'t, he\'s a cat. But he thinks it.'],
      kim: ['Drop and give me twenty! Kidding. Unless...', 'Hydrate!', 'Your form is improving, penguin.'],
      okafor: ['Did you know the first public library opened in 1833?', 'Reading is a superpower.', 'Curiosity never retires.'],
      priya: ['Spend less than you earn. That\'s the whole secret.', 'Compound interest is magic.', 'Never invest in anything you can\'t explain to Rosa.'],
      sam: ['I saved you a tulip.', 'You make the boring parts of the day fun.', 'Want to get dinner later?'],
    };
    return (D.CAST[who] ? D.CAST[who].n + ': ' : '') + pick(lines[who] || ['Beautiful day in the neighbourhood!', 'Thanks for everything, really.', 'See you around!']);
  }
  async function giveGift(who) {
    const gifts = Object.keys(save.bag).filter(k => D.ITEMS[k] && D.ITEMS[k].type === 'gift');
    const v = await U.choose({ who, text: 'Which gift?', opts: gifts.map(k => ({ t: D.ITEMS[k].e + ' ' + D.ITEMS[k].n + ' ×' + save.bag[k], v: k })).concat([{ t: 'Never mind', v: '' }]) });
    if (!v) return;
    const it = D.ITEMS[v], liked = (D.CAST[who].likes || []).includes(v);
    giveItem(v, -1);
    addRel(who, it.rel * (liked ? 2 : 1));
    addHappy(1);
    await U.dialog({ who, lines: [D.CAST[who].n + ': ' + (liked ? 'Oh! I LOVE ' + it.n.toLowerCase() + '! How did you know?' : 'For me? Thank you, that\'s sweet.')] });
  }
  G.giveGift = giveGift;

  // ------------------------------------------------------------------ shops + services
  G.canBuy = function (id) {
    const it = D.ITEMS[id];
    if (!it) return 'Unknown item';
    if ((it.type === 'vehicle' || it.type === 'license' || it.type === 'furniture' || it.type === 'gear' || it.once) && owned(id)) return 'Owned';
    if (it.type === 'pet' && save.pets.some(p => p.kind === it.pet)) return 'Adopted';
    if (it.req && it.req.item && !owned(it.req.item)) return 'Needs ' + D.ITEMS[it.req.item].n;
    if (it.req && it.req.m && !(save.m[it.req.m] && save.m[it.req.m].s === 'done')) return 'Needs the "' + MISSION[it.req.m].title + '" mission';
    if (it.req && it.req.lvl && G.level() < it.req.lvl) return 'Needs level ' + it.req.lvl;
    if (it.apt && save.apt.tier < it.apt) return 'Needs a ' + D.APARTMENTS[it.apt].n.toLowerCase();
    if (save.money < G.priceOf(id)) return 'Not enough money';
    return null;
  };
  G.buy = function (id, place) {
    const why = G.canBuy(id);
    if (why) { U.toast(why); return false; }
    const it = D.ITEMS[id];
    let price = G.priceOf(id);
    if (isFriend('rosa') && place && (place.kind === 'bakery' || place.kind === 'cafe') && (it.type === 'food' || it.type === 'snack')) price = 0;
    save.money -= price;
    U.hud.bump('money');
    G.sfx.cash();
    bump('spent', price);
    bump('buy_' + id);
    switch (it.type) {
      case 'food': addEnergy((it.energy || 0) * G.foodMul()); if (it.happy) addHappy(it.happy); if (it.stats) for (const k in it.stats) addStat(k, it.stats[k], true); U.feed(it.e, 'Yum! +' + Math.round((it.energy || 0) * G.foodMul()) + ' ⚡'); break;
      case 'snack': case 'gift': case 'quest': giveItem(it.give || id, 1); U.feed(it.e, it.n + ' added to your bag'); break;
      case 'gear': save.owned[id] = true; save.equip[it.slot] = id; if (it.slot !== 'weapon') W.setLook(playerLook()); U.feed(it.e, (it.weapon ? 'Armed with: ' : 'Wearing ') + it.n + (it.weapon ? ' (F to bonk)' : '')); if (it.happy) addHappy(it.happy); break;
      case 'vehicle': save.owned[id] = true; setRide(id); U.banner(it.e + ' ' + it.n + '!', 'Press V (or the ride button) to hop on and off.', 'done'); log('Bought a ' + it.n, it.e); break;
      case 'furniture': save.owned[id] = true; if (it.energy) save.maxE = (save.maxE || 0) + it.energy; U.feed(it.e, it.n + ' delivered home. +' + it.happy + ' 😊 every day'); log('Bought ' + it.n, it.e); break;
      case 'pet': save.pets.push({ kind: it.pet, name: it.pet === 'dog' ? 'Biscuit' : 'Mochi', since: save.day }); addHappy(10); refreshFollowers(); U.banner(it.e + ' New best friend!', 'Your ' + it.pet + ' follows you everywhere.', 'friend'); log('Adopted a ' + it.pet, it.e); break;
      case 'license': save.owned[id] = true; U.banner('🪪 ' + it.n, 'You\'re licensed to ride!', 'done'); log('Got a ' + it.n, '🪪'); break;
      case 'service':
        if (it.stats) for (const k in it.stats) addStat(k, it.stats[k]);
        if (it.happy) addHappy(it.happy);
        if (it.energy) addEnergy(it.energy);
        if (it.maxEnergy) { save.maxE = (save.maxE || 0) + it.maxEnergy; U.feed(it.e, '+' + it.maxEnergy + ' max energy'); }
        if (it.sticker) addSticker();
        if (it.hours) advanceClock(it.hours);
        if (it.once) save.owned[id] = true;
        if (it.fortune && G.fun) G.fun.fortune();
        else if (!it.stats && !it.sticker) U.feed(it.e, it.n + '!');
        break;
      default: break;
    }
    dirty();
    return true;
  };
  function advanceClock(h) { save.clock += h; save.gameMin += h * 60; accrue(h * 60); if (save.clock >= 24) newDay(); }

  // ------------------------------------------------------------------ rides + look
  function playerLook() {
    // you: a plain tee, jeans and the backpack you arrived with; shops change it (outfits, shoes, headphones...)
    const base = Object.assign(W.randomLook(77), { dress: false, hat: null, glasses: false, beard: false, shorts: false, stripes: null, logo: null, phones: null,
      scarf: null, collar: false, build: 1, h: 1, sleeve: 'short', bag: 0x6b4eff, shoe: 0xf2f2f2 }, save.look || {});
    if (base.style == null) base.style = base.long ? 1 : 0;
    if (base.pack === false) base.bag = null;
    const eq = save.equip, o = D.ITEMS[eq.outfit];
    if (o && o.color) base.shirt = o.color;
    if (eq.outfit === 'tee') base.logo = 0xffc21f;
    if (eq.outfit === 'jacket') { base.sleeve = 'long'; base.collar = true; }
    if (eq.outfit === 'outfit_date') { base.sleeve = 'long'; base.collar = true; base.scarf = 0xf4f1ea; }
    if (eq.outfit === 'suit') { base.sleeve = 'long'; base.tie = 0xe8453c; base.pants = 0x1f2937; base.shoe = 0x222222; }
    if (eq.outfit === 'designer') { base.sleeve = 'long'; base.stripes = 0xffc21f; base.pants = 0xf4f1ea; }
    const SHOE_COL = { sneakers1: 0x3aa6b9, sneakers2: 0xff8a3d, sneakers3: 0xe8453c };
    if (SHOE_COL[eq.shoes]) base.shoe = SHOE_COL[eq.shoes];
    if (eq.acc === 'headphones') base.phones = 0xff5c8a;
    if (eq.acc === 'fakenose') base.glasses = true;
    if (eq.hat === 'helmet') base.hat = 0xf2b134;
    if (save.fun && save.fun.king) { base.crown = true; base.hat = null; }
    return base;
  }
  G.playerLook = playerLook;
  function setRide(id) {
    if (id && !owned(id)) return;
    save.equip.ride = id || null;
    if (id) save.equip.lastRide = id;
    const v = id ? D.VEHICLES[id] : null;
    W.setRide(v ? Object.assign({}, v, { kind: RIDE_KIND[id] }) : { mode: 'foot', walk: D.WALK.walk, run: D.WALK.run, jump: 8.5, radius: 0.4 });
    refreshFollowers();
    if (G.fun) G.fun.rideChanged();
    dirty();
  }
  G.setRide = setRide;
  G.toggleRide = function () {
    if (save.equip.ride) { setRide(null); U.toast('On foot'); return; }
    const best = save.equip.lastRide && owned(save.equip.lastRide) ? save.equip.lastRide : Object.keys(D.VEHICLES).filter(owned).pop();
    if (!best) { U.toast('No ride yet. Bike & board shops sell skateboards.'); return; }
    setRide(best); U.toast(D.ITEMS[best].e + ' ' + D.ITEMS[best].n);
  };

  // ------------------------------------------------------------------ homes
  function aptCandidates(tier) {
    const a = D.APARTMENTS[tier], p = P();
    let filter;
    if (a.pick === 'house') filter = b => (b.g || (b.area < 220 && b.h < 12)) && b.area > 50;
    else if (a.pick === 'tallest') filter = null;
    else filter = b => b.h >= (a.pick.hMin || 0) && b.h <= (a.pick.hMax || 999) && b.area >= (a.pick.aMin || 60);
    if (a.pick === 'tallest') {
      W.registerAround(p.x, p.z, 1500);
      const bs = W.buildingsNear(p.x, p.z, 1500).sort((x, y) => y.h - x.h).slice(0, 6);
      return bs.map(b => ({ b, wall: W.wallSpot(b) })).filter(e => e.wall);
    }
    const used = usedBuildings();
    const list = W.buildingsNear(p.x, p.z, 900).filter(b => filter(b) && !used.some(u => Math.hypot(u.x - b.cx, u.z - b.cz) < 25))
      .sort((x, y) => Math.hypot(x.cx - p.x, x.cz - p.z) - Math.hypot(y.cx - p.x, y.cz - p.z));
    const out = [];
    for (const b of list) { if (out.length >= 6) break; const w = W.wallSpot(b); if (w) out.push({ b, wall: w }); }
    return out;
  }
  function addressOf(x, z) {
    const hn = W.housenumbersNear(x, z, 40).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0];
    const st = W.streetAt(x, z) || (hn ? W.streetAt(hn.x, hn.z) : '') || nearbyStreetName(x, z);
    if (st) return (hn ? hn.t + ' ' : '') + st;
    return hn ? 'number ' + hn.t + ' on a quiet street' : 'a quiet street';
  }
  // The closest named street within ~80 m (streetAt only looks 14 m around a point).
  function nearbyStreetName(x, z) {
    for (const r of [20, 40, 60, 80]) {
      for (let a = 0; a < 12; a++) {
        const n = W.streetAt(x + Math.cos(a * Math.PI / 6) * r, z + Math.sin(a * Math.PI / 6) * r);
        if (n) return n;
      }
    }
    return '';
  }
  G.addressOf = addressOf;
  G.moveHome = async function (tier) {
    const a = D.APARTMENTS[tier];
    if (save.money < a.cost) { U.toast('You need ' + fmt$(a.cost) + '.'); return; }
    const cands = aptCandidates(tier);
    if (!cands.length) { U.toast('The movers couldn\'t find a building like that nearby. Try another neighbourhood street.'); return; }
    let i = 0;
    for (;;) {
      const c = cands[i % cands.length];
      const addr = addressOf(c.wall.street.x, c.wall.street.z);
      const floor = c.b.h > 12 ? ', floor ' + Math.max(2, Math.floor(c.b.h / 3.3)) : '';
      const v = await U.choose({ who: null, title: a.e + ' ' + a.n, text: 'The movers found a place at ' + addr + floor + ' (' + Math.round(Math.hypot(c.b.cx - P().x, c.b.cz - P().z)) + ' m away, ' + Math.round(c.b.h) + ' m tall).\n' + (a.rent ? fmt$(a.cost) + ' to move in, ' + fmt$(a.rent) + ' rent per day.' : 'Buy it for ' + fmt$(a.cost) + '. No rent!'),
        opts: [{ t: '🔑 Take it', v: 'y' }].concat(cands.length > 1 ? [{ t: '🔄 Show another', v: 'next' }] : []).concat([{ t: 'Cancel', v: 'n' }]) });
      if (v === 'next') { i++; continue; }
      if (v !== 'y') return;
      save.money -= a.cost;
      const q = ll(c.wall.street.x, c.wall.street.z);
      save.apt = { tier, lat: q.lat, lon: q.lon, label: addr, bh: Math.round(c.b.h) };
      rt.homeXZ = null;
      placeHomeFlag();
      addHappy(a.happy);
      G.sfx.done(); U.confetti();
      U.banner(a.e + ' Home sweet home!', a.n + ' at ' + addr, 'done');
      log('Moved to a ' + a.n + ' at ' + addr, a.e);
      dirty(true);
      return;
    }
  };
  function placeHomeFlag() {
    const THREE = W.THREE;
    if (!rt.flag) {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 7, 8).translate(0, 3.5, 0), new THREE.MeshLambertMaterial({ color: 0xeeeeee }));
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.3).translate(1, 0, 0), new THREE.MeshBasicMaterial({ map: W.emojiTex('🏠', '#ff5c8a'), side: THREE.DoubleSide, transparent: true }));
      cloth.position.y = 6.3;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 90, 10, 1, true).translate(0, 45, 0), new THREE.MeshBasicMaterial({ color: 0xff5c8a, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
      g.add(pole, cloth, beam); g.userData.cloth = cloth;
      W.scene.add(g); rt.flag = g;
    }
    const h = homeSpot(), dx = h.bx - h.x, dz = h.bz - h.z, d = Math.hypot(dx, dz);
    let fx = h.x + (d > 0.5 ? dx / d * Math.min(2.5, d) : 2.5), fz = h.z + (d > 0.5 ? dz / d * Math.min(2.5, d) : 0);
    if (W.heightAt(fx, fz)) { fx = h.x + (fx - h.x) * 0.4; fz = h.z + (fz - h.z) * 0.4; }
    rt.flag.position.set(fx, W.groundAt(fx, fz), fz);
  }

  // ------------------------------------------------------------------ businesses
  G.bizIncome = id => { const b = save.biz[id], d = BIZ[id]; return b ? d.income * (1 + 0.6 * ((b.lvl || 1) - 1)) * G.incomeMul(id) : 0; };
  G.bizCap = id => G.bizIncome(id) * 4;
  G.upgradeCost = id => { const b = save.biz[id], d = BIZ[id]; return Math.round(d.cost * [0.5, 1, 2, 4][(b.lvl || 1) - 1]); };
  G.managerCost = id => Math.round(BIZ[id].cost * 0.8 + 100);
  G.buyBiz = async function (id) {
    const d = BIZ[id];
    if (save.biz[id]) return;
    if (save.money < d.cost) { U.toast('You need ' + fmt$(d.cost) + '.'); return; }
    const p = P();
    const fb = freeBuilding(p.x, p.z, 15, 350) || freeBuilding(p.x, p.z, 0, 800);
    if (!fb) { U.toast('No free storefront nearby. Walk to a busier street and try again.'); return; }
    const addr = addressOf(fb.street.x, fb.street.z);
    const name = await U.ask('Name your ' + d.n.toLowerCase() + ' (opening at ' + addr + ')', save.name + '\'s ' + d.n);
    if (name == null) return;
    save.money -= d.cost;
    const q = ll(fb.street.x, fb.street.z), w = ll(fb.wall.x, fb.wall.z);
    save.biz[id] = { lvl: 1, mgr: false, name: (name || d.n).slice(0, 32), lat: q.lat, lon: q.lon, wlat: w.lat, wlon: w.lon, nx: fb.wall.nx, nz: fb.wall.nz, till: 0, earned: 0, since: save.day, addr };
    G.sfx.done(); U.confetti();
    U.banner(d.e + ' Grand opening!', save.biz[id].name + ' at ' + addr, 'done');
    log('Opened ' + save.biz[id].name, d.e);
    addXp(Math.min(2000, 30 + d.cost / 50));
    buildBizSign(id);
    dirty(true);
  };
  G.upgradeBiz = function (id) {
    const b = save.biz[id];
    if (!b || b.lvl >= 5) return;
    const c = G.upgradeCost(id);
    if (save.money < c) { U.toast('You need ' + fmt$(c) + '.'); return; }
    save.money -= c; b.lvl++;
    G.sfx.cash(); U.feed(BIZ[id].e, BIZ[id].up[b.lvl - 2] + '! Level ' + b.lvl);
    log(b.name + ': ' + BIZ[id].up[b.lvl - 2], '⬆️');
    buildBizSign(id); dirty(true);
  };
  G.hireManager = function (id) {
    const b = save.biz[id], c = G.managerCost(id);
    if (!b || b.mgr) return;
    if (save.money < c) { U.toast('You need ' + fmt$(c) + '.'); return; }
    save.money -= c; b.mgr = true;
    if (b.till) { addMoney(b.till, 'from the till'); b.till = 0; }
    U.feed('🧑‍💼', 'Manager hired at ' + b.name); log('Hired a manager at ' + b.name, '🧑‍💼'); dirty(true);
  };
  G.collectTill = function (id) {
    const b = save.biz[id];
    if (!b || b.till < 1) return;
    const amt = Math.floor(b.till);
    b.till -= amt; b.earned += amt;
    addMoney(amt, 'from ' + b.name); G.sfx.cash();
  };
  function accrue(min) { // business + turf income for `min` game minutes
    for (const id of Object.keys(save.biz)) {
      const b = save.biz[id], inc = G.bizIncome(id) * min / 60;
      if (b.mgr) { save.money += inc; b.earned += inc; bump('earned', inc); }
      else b.till = Math.min(G.bizCap(id), (b.till || 0) + inc);
    }
    const turfInc = G.turfIncome() * min / 60;
    if (turfInc) { save.money += turfInc; bump('earned', turfInc); }
  }
  G.startRush = function (id) {
    const b = save.biz[id], d = BIZ[id];
    if (!b) return;
    if (b.rushDay === save.day) { U.toast('One rush hour per day per business. Come back tomorrow!'); return; }
    if (G.activeMissions().some(x => x.startsWith('rush-'))) { U.toast('Finish your current rush first!'); return; }
    b.rushDay = save.day;
    const item = d.deliver === 'lemonade' || d.deliver === 'coffee' ? 'package' : d.deliver === 'dog' ? null : d.deliver;
    const mid = 'rush-' + id + '-' + save.day;
    const tip = Math.round(G.bizIncome(id) * 0.6 + 15);
    const steps = item ? [{ do: 'deliver', item, to: 'addr', n: 3, time: 200, text: 'Rush hour! Deliver 3 orders ({n} left)' }]
      : [{ do: 'escort', who: 'rex', to: 'park', text: 'Walk a customer\'s dog to {place}' }];
    save.dyn[mid] = { id: mid, title: d.e + ' Rush hour at ' + b.name, giver: 'priya', at: 'home', intro: [], steps, outro: [], reward: { money: tip * 3, xp: 40 + Math.round(tip / 4) }, rush: id };
    save.track = mid;
    accept(mid);
    U.banner(d.e + ' Rush hour!', 'Orders are flying in. Follow the arrow!', 'level');
  };
  function nearestBiz() {
    const p = P(); let best = null, bd = 1e9;
    for (const id of Object.keys(save.biz)) { const q = xz(save.biz[id]); const d = dist(q, p); if (d < bd) { bd = d; best = { id, x: q.x, z: q.z, name: save.biz[id].name }; } }
    return best;
  }
  function buildBizSign(id) {
    const b = save.biz[id], d = BIZ[id], THREE = W.THREE;
    const old = rt.signs.get(id);
    if (old) W.scene.remove(old);
    const c = document.createElement('canvas'); c.width = 512; c.height = 160;
    const g = c.getContext('2d');
    g.fillStyle = '#6b4eff'; g.fillRect(0, 0, 512, 160);
    g.fillStyle = '#ffc21f'; g.fillRect(0, 140, 512, 20);
    g.font = '84px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; g.textBaseline = 'middle'; g.fillText(d.e, 18, 76);
    g.fillStyle = '#fff'; g.font = '800 44px Fredoka, Nunito, system-ui'; g.fillText(b.name.slice(0, 18), 122, 60, 375);
    g.font = '700 26px Nunito, system-ui'; g.fillStyle = '#ffe9a8'; g.fillText('★'.repeat(b.lvl) + '  open', 124, 112);
    const tex = new THREE.CanvasTexture(c);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.06, 0.12), [new THREE.MeshLambertMaterial({ color: 0x3d2a9e }), new THREE.MeshLambertMaterial({ color: 0x3d2a9e }),
      new THREE.MeshLambertMaterial({ color: 0x3d2a9e }), new THREE.MeshLambertMaterial({ color: 0x3d2a9e }), new THREE.MeshBasicMaterial({ map: tex }), new THREE.MeshBasicMaterial({ map: tex })]);
    const grp = new THREE.Group();
    sign.position.y = 3.3; grp.add(sign);
    const coin = W.emojiSprite('💰', 1.1); coin.position.y = 4.6; grp.add(coin); grp.userData.coin = coin;
    const w = xz({ lat: b.wlat, lon: b.wlon });
    grp.position.set(w.x + b.nx * 0.25, W.groundAt(w.x + b.nx * 1.5, w.z + b.nz * 1.5), w.z + b.nz * 0.25);
    grp.rotation.y = Math.atan2(b.nx, b.nz);
    W.scene.add(grp);
    rt.signs.set(id, grp);
  }
  function updateSigns() {
    for (const [id, g] of rt.signs) {
      const b = save.biz[id]; if (!b) continue;
      g.userData.coin.visible = !b.mgr && b.till > G.bizCap(id) * 0.15;
      g.userData.coin.position.y = 4.6 + Math.sin(rt.t * 3) * 0.15;
    }
  }

  // ------------------------------------------------------------------ turf
  const turfIdOf = (x, z) => Math.floor((x + TURF / 2) / TURF) + '_' + Math.floor((z + TURF / 2) / TURF);
  G.turfIdOf = turfIdOf;
  function turfIJ(id) { const [i, j] = id.split('_').map(Number); return { i, j }; }
  function turfBounds(id) { const { i, j } = turfIJ(id); return { x0: i * TURF - TURF / 2, z0: j * TURF - TURF / 2, x1: i * TURF + TURF / 2, z1: j * TURF + TURF / 2 }; }
  G.turfBounds = turfBounds;
  function turfCenter(id) { const { i, j } = turfIJ(id); return { x: i * TURF, z: j * TURF }; }
  const turfRing = id => { const { i, j } = turfIJ(id); return Math.max(Math.abs(i), Math.abs(j)); };
  G.turfRing = turfRing;
  function turfCrew(id) { if (id === '0_0') return 'grannies'; const { i, j } = turfIJ(id); return D.CREWS[Math.floor(hash(i * 7349 + j * 9157 + 11) * D.CREWS.length)].id; }
  G.turfCrew = turfCrew;
  G.turfIncome = () => Object.keys(save.turf).filter(t => save.turf[t].own).reduce((a, t) => a + (15 + 10 * turfRing(t)) * (1 + stat('cred') * 0.02), 0);
  G.turfNeed = id => 1 + turfRing(id) * 3;
  // A poster can be tagged only if the player can stand within reach (3.5 m) of it: free ground just outside the wall,
  // a clear straight walk from the street, and still close enough after the walls push the player out.
  // (A spot on Notre-Dame Ouest in Old Montreal sat where an attached building covered the ground, Nov 2026.)
  function spotReachable(w) {
    for (const out of [1.2, 2]) {
      const ox = w.x + w.nx * out, oz = w.z + w.nz * out;
      if (W.heightAt(ox, oz)) continue;
      const sx = w.street.x, sz = w.street.z, n = Math.max(2, Math.ceil(Math.hypot(sx - ox, sz - oz) / 1.5));
      let clear = true;
      for (let i = 1; i < n && clear; i++) if (W.heightAt(ox + (sx - ox) * i / n, oz + (sz - oz) * i / n)) clear = false;
      if (!clear) continue;
      const pos = { x: ox, z: oz };
      W.collide(pos);
      if (Math.hypot(pos.x - w.x, pos.z - w.z) < 3) return true;
    }
    return false;
  }
  G.spotReachable = spotReachable;
  // Wall spots in a turf that can hold a poster, in a fixed order for that turf.
  function turfWalls(id) {
    const bnd = turfBounds(id), c = turfCenter(id);
    const bs = W.buildingsNear(c.x, c.z, TURF * 0.75).filter(b => b.cx > bnd.x0 + 10 && b.cx < bnd.x1 - 10 && b.cz > bnd.z0 + 10 && b.cz < bnd.z1 - 10 && b.area > 80)
      .sort((a, b) => hash(Math.round(a.cx * 3 + a.cz * 7)) - hash(Math.round(b.cx * 3 + b.cz * 7)));
    const out = [];
    for (const b of bs) {
      const w = W.wallSpot(b);
      if (!w || Math.hypot(w.street.x - w.x, w.street.z - w.z) > 25 || !spotReachable(w)) continue;
      out.push(w);
    }
    return out;
  }
  const spotRow = s => { const a = ll(s.x, s.z); return [Math.round(a.lat * 1e6) / 1e6, Math.round(a.lon * 1e6) / 1e6, Math.round(s.nx * 100) / 100, Math.round(s.nz * 100) / 100]; };
  // Saves made before the reach check can hold a spot nobody can get to: once the area is loaded, move those posters.
  function fixTurfSpots(id, t) {
    rt.spotsOk = rt.spotsOk || {};
    if (rt.spotsOk[id]) return;
    const bad = [];
    let looked = 0;
    t.spots.forEach((s, k) => {
      if (t.tags[k]) return;
      const q = xz({ lat: s[0], lon: s[1] }), st = W.nearestWalk(q.x, q.z, 40);
      if (!st || !W.buildingsNear(q.x, q.z, 30).length) return;  // not loaded yet: look again later
      looked++;
      if (!spotReachable({ x: q.x, z: q.z, nx: s[2], nz: s[3], street: st })) bad.push(k);
    });
    if (!looked) return;
    rt.spotsOk[id] = true;
    if (!bad.length) return;
    const taken = t.spots.filter((s, k) => bad.indexOf(k) < 0).map(s => xz({ lat: s[0], lon: s[1] }));
    for (const w of turfWalls(id)) {
      if (!bad.length) break;
      if (taken.some(s => Math.hypot(s.x - w.x, s.z - w.z) < 55)) continue;
      t.spots[bad.shift()] = spotRow(w);
      taken.push(w);
    }
    for (const [k, m] of rt.posters) if (k.indexOf(id + ':') === 0) { W.scene.remove(m); rt.posters.delete(k); }
    dirty();
  }
  // Makes sure a turf has its 4 crew posters (on real walls) once the area is loaded.
  function ensureTurf(id) {
    let t = save.turf[id];
    if (t && t.spots) { fixTurfSpots(id, t); return t; }
    rt.turfFail = rt.turfFail || {};
    if (rt.turfFail[id] && rt.t - rt.turfFail[id] < 20) return null;
    rt.turfFail[id] = rt.t;
    const spots = [];
    for (const w of turfWalls(id)) {
      if (spots.length >= 4) break;
      if (spots.some(s => Math.hypot(s.x - w.x, s.z - w.z) < 55)) continue;
      spots.push(w);
    }
    if (spots.length < 4) return null;
    const names = {};
    for (const s of spots) { const n = W.streetAt(s.street.x, s.street.z); if (n) names[n] = (names[n] || 0) + 1; }
    const top = Object.keys(names).sort((a, b) => names[b] - names[a])[0];
    t = save.turf[id] = Object.assign(save.turf[id] || {}, {
      name: (top ? top.replace(/^(Rue|Avenue|Boulevard|Street|St\.?|Avenue de la|Rue de la|Rue du|Rue des)\s+/i, '') : 'Block ' + id) + ' block',
      crew: (t && t.crew) || turfCrew(id), own: !!(t && t.own), tags: (t && t.tags) || (t && t.own ? [1, 1, 1, 1] : [0, 0, 0, 0]),
      spots: spots.map(spotRow),
    });
    dirty();
    return t;
  }
  let turfTimer = 0;
  function updateTurf(dt) {
    turfTimer -= dt;
    if (turfTimer > 0) return;
    turfTimer = 1.2;
    if (!(save.m['c6-luna'] && save.m['c6-luna'].s !== 'open')) { for (const [k, m] of rt.posters) { W.scene.remove(m); rt.posters.delete(k); } return; }
    const p = P(), here = turfIdOf(p.x, p.z);
    const { i, j } = turfIJ(here);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const id = (i + a) + '_' + (j + b), c = turfCenter(id);
      if (Math.hypot(c.x - p.x, c.z - p.z) < 420) ensureTurf(id);
    }
    // posters within 260 m
    const want = new Set();
    for (const id of Object.keys(save.turf)) {
      const t = save.turf[id];
      if (!t.spots) continue;
      t.spots.forEach((s, k) => {
        const q = xz({ lat: s[0], lon: s[1] });
        if (Math.hypot(q.x - p.x, q.z - p.z) > 260) return;
        const key = id + ':' + k + ':' + (t.tags[k] ? 1 : 0) + (t.rival === k ? 'r' : '');
        want.add(key);
        if (!rt.posters.has(key)) rt.posters.set(key, makePoster(t, k, q, s[2], s[3]));
      });
    }
    for (const [k, m] of rt.posters) if (!want.has(k)) { W.scene.remove(m); rt.posters.delete(k); }
  }
  const posterTex = new Map();
  function posterTexture(kind) {
    if (posterTex.has(kind)) return posterTex.get(kind);
    const c = document.createElement('canvas'); c.width = 256; c.height = 340;
    const g = c.getContext('2d');
    if (kind === 'mine') {
      const grd = g.createLinearGradient(0, 0, 256, 340);
      ['#ff5c8a', '#ffc21f', '#20c997', '#3b82f6', '#6b4eff'].forEach((col, i) => grd.addColorStop(i / 4, col));
      g.fillStyle = grd; g.fillRect(0, 0, 256, 340);
      g.font = '150px "Segoe UI Emoji","Apple Color Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🌈', 128, 140);
      g.fillStyle = '#fff'; g.font = '800 40px Fredoka, Nunito, sans-serif'; g.fillText((save.name || 'You').slice(0, 10), 128, 270);
      g.font = '700 26px Nunito, sans-serif'; g.fillText('was here ★', 128, 310);
    } else {
      const crew = CREW[kind];
      g.fillStyle = crew.color; g.fillRect(0, 0, 256, 340);
      g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(12, 12, 232, 316);
      g.font = '140px "Segoe UI Emoji","Apple Color Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(crew.e, 128, 130);
      g.fillStyle = '#fff'; g.font = '800 30px Fredoka, Nunito, sans-serif';
      const words = crew.n.replace('The ', '').split(' ');
      g.fillText(words.slice(0, 2).join(' '), 128, 255); if (words.length > 2) g.fillText(words.slice(2).join(' '), 128, 292);
    }
    const t = new W.THREE.CanvasTexture(c);
    posterTex.set(kind, t);
    return t;
  }
  function makePoster(t, k, q, nx, nz) {
    const THREE = W.THREE;
    const rival = t.rival === k;
    const tagged = t.tags[k] && !rival;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 2.25), new THREE.MeshBasicMaterial({ map: posterTexture(tagged ? 'mine' : rival ? t.rivalCrew || t.crew : t.crew), side: THREE.DoubleSide }));
    m.position.set(q.x + nx * 0.06, W.groundAt(q.x + nx, q.z + nz) + 1.9, q.z + nz * 0.06);
    m.rotation.y = Math.atan2(nx, nz);
    W.scene.add(m);
    return m;
  }
  function nearestTagTarget() {
    const p = P(); let best = null, bd = 1e9;
    for (const id of Object.keys(save.turf)) {
      const t = save.turf[id];
      if (!t.spots || t.own) continue;
      t.spots.forEach((s, k) => { if (t.tags[k]) return; const q = xz({ lat: s[0], lon: s[1] }); const d = dist(q, p); if (d < bd) { bd = d; best = { x: q.x, z: q.z, label: 'Tag the ' + CREW[t.crew].n + ' poster', e: '🎨' }; } });
    }
    if (!best) for (const id of Object.keys(save.turf)) { const t = save.turf[id]; if (!t.own && t.tags && t.tags.every(Boolean)) { const c = turfCenter(id); return { x: c.x, z: c.z, label: 'Challenge ' + CREW[t.crew].boss, e: '⚔️' }; } }
    return best;
  }
  function rivalTarget() {
    for (const id of Object.keys(save.turf)) { const t = save.turf[id]; if (t.own && t.rival != null) { const s = t.spots[t.rival]; const q = xz({ lat: s[0], lon: s[1] }); return { x: q.x, z: q.z, label: 'Clean the rival tag', e: '🧽' }; } }
    return null;
  }
  G.rivalTarget = rivalTarget;
  function ensureRival() {
    if (rivalTarget()) return;
    const owned = Object.keys(save.turf).filter(id => save.turf[id].own);
    if (!owned.length) return;
    const p = P();
    owned.sort((a, b) => dist(turfCenter(a), p) - dist(turfCenter(b), p));
    const id = owned.find(x => x !== '0_0') || owned[0];
    const t = save.turf[id];
    t.rival = Math.floor(Math.random() * 4); t.rivalDay = save.day;
    t.rivalCrew = D.CREWS[Math.floor(Math.random() * D.CREWS.length)].id;
    U.banner('🚨 ' + CREW[t.rivalCrew].n + ' tagged ' + t.name + '!', 'Clean it before midnight tomorrow or lose the block.', 'fail');
    log(CREW[t.rivalCrew].n + ' tagged ' + t.name, '🚨');
    turfTimer = 0;
  }
  async function tagSpot(id, k) {
    const t = save.turf[id];
    if (t.own) {
      if (t.rival === k) {
        rt.busy = true;
        try { await U.progress('🧽 Scrubbing...', 1.4); } finally { rt.busy = false; }
        t.rival = null; delete t.rivalCrew; bump('defends'); addStat('cred', 0.5); G.sfx.done(); U.feed('🧽', 'Clean! ' + t.name + ' is safe.'); turfTimer = 0; dirty();
      }
      return;
    }
    if (t.tags[k]) return;
    const free = isFriend('luna') && Math.random() < 0.34;
    if (!free && !has('spray')) { U.toast('You need a spray can 🎨. Find them on the street or buy them at hardware and gift shops.'); return; }
    rt.busy = true;
    try { await U.progress('🎨 Tagging...', 1.2); } finally { rt.busy = false; }
    if (!free) giveItem('spray', -1);
    t.tags[k] = 1; bump('tags'); addStat('cred', 0.25, true); G.sfx.pick();
    const n = t.tags.filter(Boolean).length;
    U.feed('🎨', 'Tagged! ' + n + '/4 in ' + t.name);
    if (n === 4) U.banner('⚔️ ' + CREW[t.crew].boss + ' wants a word', 'All four posters are yours. Find the boss in ' + t.name + '.', 'level');
    turfTimer = 0; rt.actorTimer = 0;
    dirty();
  }
  async function challengeBoss(id) {
    const t = save.turf[id], crew = CREW[t.crew], ring = turfRing(id);
    rt.busy = true;
    let res = null;
    try {
      const need = G.turfNeed(id);
      const v = await U.choose({ who: null, title: crew.e + ' ' + crew.boss, text: crew.boss + ': ' + crew.taunt + '\n\nThis block needs Street cred ' + need + '. You have ' + Math.floor(stat('cred')) + '.',
        opts: [{ t: '⚔️ Challenge (' + { race: 'race', dance: 'dance-off', quiz: 'quiz', chase: 'chase', cred: 'cred check' }[crew.ch] + ')', v: 'go' }, { t: 'Not yet', v: 'n' }] });
      if (v !== 'go') return;
      if (stat('cred') < need) { await U.dialog({ who: null, name: crew.boss, e: crew.e, lines: [crew.boss + ': Come back when the street knows your name. (Street cred ' + need + ')'] }); return; }
      if (crew.ch === 'dance') res = (await U.dance(10 + ring * 2, 1 + ring * 0.08 * (isFriend('zoe') ? 0.85 : 1))) >= 0.7;
      else if (crew.ch === 'quiz') res = await U.quiz(crew.id === 'latte' ? D.QUIZ.coffee : crew.id === 'oldmoney' ? D.QUIZ.posh : D.QUIZ.trivia, 3, { n: crew.boss, e: crew.e });
      else if (crew.ch === 'cred') res = true;
      else if (crew.ch === 'race') { const a = rt.actors.get('boss@' + id); startRace({ n: 4 + ring, time: 60 + ring * 12, x: a ? a.x : P().x, z: a ? a.z : P().z, onWin: () => winTurf(id), onFail: () => U.banner(crew.boss + ' wins this time', 'Talk to them to try again.', 'fail') }); return; }
      else if (crew.ch === 'chase') { startChase({ obj: W.person(Object.assign(W.randomLook(9), crew.look)), name: crew.boss, taunt: crew.taunt.split('!')[0] + '!', speed: 6 + ring * 0.6, time: 60, onWin: () => winTurf(id), onFail: () => U.banner(crew.boss + ' got away', 'Talk to them to try again.', 'fail') }); return; }
    } finally { rt.busy = false; }
    if (res) winTurf(id); else if (res === false) U.banner(crew.boss + ' wins this round', 'Try again when you\'re ready.', 'fail');
  }
  function winTurf(id) {
    const t = save.turf[id], crew = CREW[t.crew];
    t.own = true; t.since = save.day; t.rival = null;
    bump('turfs');
    addStat('cred', 2, true); addXp(150 + turfRing(id) * 80); addHappy(3);
    G.sfx.done(); U.confetti();
    U.banner('🏳️‍🌈 ' + t.name + ' is yours!', crew.boss + ': ' + crew.lose + ' · +' + fmt$(15 + 10 * turfRing(id)) + '/hour', 'done');
    log('Took over ' + t.name + ' from ' + crew.n, '🏳️');
    turfTimer = 0; rt.actorTimer = 0;
    dirty(true);
  }

  // ------------------------------------------------------------------ metro
  function visitMetro(pl) {
    if (save.metro.some(m => m.id === pl.id)) return;
    const a = ll(pl.pin.x, pl.pin.z);
    save.metro.push({ id: pl.id, name: pl.name || W.streetAt(pl.pin.x, pl.pin.z) || 'Station', lat: a.lat, lon: a.lon });
    if (save.metro.length > 40) save.metro.shift();
    U.feed('🚇', 'Station unlocked: ' + (pl.name || 'Metro'));
    dirty();
  }
  G.metroTo = async function (st) {
    const fare = isFriend('bouchard') ? 0 : 3;
    if (save.money < fare) { U.toast('A ride costs $3.'); return; }
    save.money -= fare;
    await travel(xz(st));
  };
  async function travel(q) {
    state = 'loading';
    U.loading('🚇 Riding the metro...');
    W.teleport(q.x, q.z);
    const t0 = performance.now();
    while (alive) {
      W.pumpAt(q.x, q.z, 40);
      const st = W.loadStatus(q.x, q.z, 200);
      if ((st.total && st.built === st.total && !st.pending) || performance.now() - t0 > 30000) break;
      await new Promise(r => requestAnimationFrame(r));
    }
    const w = W.nearestWalk(q.x, q.z, 80);
    if (w) W.teleport(w.x, w.z);
    advanceClock(0.25);
    U.loading(null);
    state = 'play';
    rt.actorTimer = 0;
  }
  G.travel = travel;

  // ------------------------------------------------------------------ time
  function newDay() {
    while (save.clock >= 24) {
      save.clock -= 24; save.day++;
      const apt = D.APARTMENTS[save.apt.tier];
      const rent = Math.round(apt.rent * (isFriend('max') ? 0.8 : 1));
      const parts = [];
      if (rent) {
        if (save.money >= rent) { save.money -= rent; parts.push('rent ' + fmt$(-rent)); }
        else { save.money = 0; addHappy(-10); parts.push('rent was late 😟'); log('Couldn\'t pay the rent', '😟'); }
      }
      if (save.savings > 0) { const i = Math.round(save.savings * 0.01); save.savings += i; parts.push('interest +' + fmt$(i)); }
      // rival tags expire into lost blocks
      for (const id of Object.keys(save.turf)) {
        const t = save.turf[id];
        if (t.own && t.rival != null && save.day - t.rivalDay >= 2) { t.own = false; t.tags = [1, 1, 1, 1]; t.tags[t.rival] = 0; t.crew = t.rivalCrew || t.crew; t.rival = null; log('Lost ' + t.name + ' to ' + CREW[t.crew].n, '💔'); parts.push('lost ' + t.name + '!'); }
      }
      const owned = Object.keys(save.turf).filter(id => save.turf[id].own && id !== '0_0');
      if (owned.length && Math.random() < 0.25 && !rivalTarget()) {
        const id = pick(owned), t = save.turf[id];
        t.rival = Math.floor(Math.random() * 4); t.rivalDay = save.day; t.rivalCrew = D.CREWS[Math.floor(Math.random() * D.CREWS.length)].id;
        parts.push('🚨 rivals tagged ' + t.name);
        log(CREW[t.rivalCrew].n + ' tagged ' + t.name, '🚨');
      }
      const earned = Math.round((save.counters.earned || 0) - (save.counters.earnedAtDay || 0));
      save.counters.earnedAtDay = save.counters.earned || 0;
      if (G.fun) G.fun.newDay(parts);
      if (earned > 0) parts.unshift('earned ' + fmt$(earned));
      U.banner('☀️ Day ' + save.day, parts.join(' · ') || 'A brand new day in the neighbourhood.', 'day');
      save.jobs = { day: 0, list: [] };
    }
    dirty(true);
  }
  async function sleep() {
    const h = save.clock;
    const until = 7, add = h < until ? until - h : 24 - h + until;
    await U.fade(() => { advanceClock(add); save.energy = G.maxEnergy(); addHappy(2); }, '😴 Zzz...');
    for (const id of G.activeMissions()) { const s = curStep(id); if (s && s.do === 'sleep') await completeStep(id); }
  }
  G.sleep = sleep;

  // ------------------------------------------------------------------ odd jobs
  G.jobs = function () {
    if (save.jobs.day !== save.day) {
      save.jobs = { day: save.day, list: [] };
      const lv = G.level();
      const pool = D.JOBS.slice().sort(() => Math.random() - 0.5).slice(0, 3);
      save.jobs.list = pool.map((j, i) => ({ i, t: j.t, e: j.e, steps: j.steps, pay: Math.round(rnd(j.pay[0], j.pay[1]) * (1 + lv * 0.15)), taken: false }));
    }
    return save.jobs.list;
  };
  G.takeJob = function (i) {
    const j = G.jobs()[i];
    if (!j || j.taken) return;
    if (G.activeMissions().filter(x => x.startsWith('job-')).length >= 2) { U.toast('Two jobs at a time, max!'); return; }
    j.taken = true;
    const id = 'job-' + save.day + '-' + i;
    save.dyn[id] = { id, title: j.e + ' ' + j.t, giver: 'priya', at: 'home', intro: [], steps: JSON.parse(JSON.stringify(j.steps)), outro: [], reward: { money: j.pay, xp: 25 + Math.round(j.pay / 3) }, job: true };
    save.track = id;
    accept(id);
  };

  // ------------------------------------------------------------------ photos
  async function takePhoto(caption) {
    G.sfx.snap();
    U.flash();
    W.pose = 'wave';
    const url = await W.snapshot(320, 200);
    setTimeout(() => { W.pose = null; }, 900);
    if (url && opts.onPhoto) opts.onPhoto(url, { caption, day: save.day, street: W.streetAt(P().x, P().z) });
  }
  G.takePhoto = takePhoto;

  // ------------------------------------------------------------------ interaction (E)
  function findInteraction() {
    const p = P();
    // mission steps with a target here
    for (const id of G.activeMissions()) {
      const step = curStep(id), ms = save.m[id];
      if (!step) continue;
      if ((step.do === 'race' || step.do === 'chase') && !(rt.race && rt.race.mission === id) && !(rt.chase && rt.chase.mission === id) && ms.tg && dist(xz(ms.tg), p) < 12)
        return { t: step.do === 'race' ? '🏁 Start the race' : '❗ Start the chase', fn: () => triggerStep(id) };
      if (['photo', 'pay', 'dance', 'quiz'].includes(step.do) && step.at !== 'giver' && ms.tg && dist(xz(ms.tg), p) < (step.do === 'photo' ? 16 : 10))
        return { t: { photo: '📸 Take a photo', pay: '💳 ' + G.text(step.text, { place: ms.tg.name }), dance: '💃 Dance!', quiz: '❓ Start' }[step.do], fn: () => triggerStep(id) };
      if (step.do === 'sleep' && dist(homeSpot(), p) < 10) return { t: '😴 Sleep', fn: () => triggerStep(id) };
    }
    // people with missions
    let best = null, bd = 3.6;
    for (const a of rt.actors.values()) { const d = Math.hypot(a.x - p.x, a.z - p.z); if (d < bd) { bd = d; best = a; } }
    if (best) return { t: '💬 Talk to ' + (best.who === 'boss' ? CREW[turfCrew(best.turf)].boss : D.CAST[best.who].n), fn: () => talkTo(best) };
    // street folk, sweethearts, a flash mob (cft-fun.js)
    const fi = G.fun && G.fun.interaction(p);
    if (fi) return fi;
    // posters
    for (const id of Object.keys(save.turf)) {
      const t = save.turf[id];
      if (!t.spots) continue;
      for (let k = 0; k < 4; k++) {
        const s = t.spots[k], q = xz({ lat: s[0], lon: s[1] });
        if (Math.hypot(q.x - p.x, q.z - p.z) > 3.5) continue;
        if (t.own && t.rival === k) return { t: '🧽 Clean the rival tag', fn: () => tagSpot(id, k) };
        if (!t.own && !t.tags[k]) return { t: '🎨 Tag the poster (' + (save.bag.spray || 0) + ' 🎨)', fn: () => tagSpot(id, k) };
      }
    }
    // your businesses
    for (const bid of Object.keys(save.biz)) { const q = xz(save.biz[bid]); if (Math.hypot(q.x - p.x, q.z - p.z) < 8) return { t: BIZ[bid].e + ' ' + save.biz[bid].name + (save.biz[bid].till >= 1 ? ' · ' + fmt$(save.biz[bid].till) : ''), fn: () => U.bizPanel(bid) }; }
    // home
    const h = homeSpot();
    if (Math.hypot(h.x - p.x, h.z - p.z) < 8) return { t: '🏠 Home', fn: () => U.homePanel() };
    // shops
    let pl = null, pd = 9;
    for (const q of G.allPlaces()) { const d = Math.hypot(q.pin.x - p.x, q.pin.z - p.z); if (d < pd) { pd = d; pl = q; } }
    if (pl) {
      if (pl.kind === 'metro') visitMetro(pl);
      const gate = G.fun && G.fun.shopGate(pl); // a made-up shop that banned you after a prank
      if (gate) return gate;
      const k = D.KINDS[pl.kind];
      if (pl.kind === 'metro') return { t: '🚇 Ride the metro', fn: () => U.metroPanel(pl) };
      if (pl.kind === 'bank') return { t: '🏦 ' + (pl.name || 'Bank'), fn: () => U.bankPanel(pl) };
      if (k && k.sells.length) return { t: k.e + ' ' + (pl.name || k.n), fn: () => U.shopPanel(pl) };
    }
    // followers you can talk to
    for (const f of rt.followers) { if (D.CAST[f.who] && !D.CAST[f.who].animal && Math.hypot(f.obj.position.x - p.x, f.obj.position.z - p.z) < 2.6) { const fw = f.who; return { t: '💬 Talk to ' + D.CAST[fw].n, fn: () => talkTo({ who: fw, open: G.openMissions().filter(id => getM(id).giver === fw), active: G.activeMissions().filter(id => { const s = curStep(id); return s && s.who === fw && s.do === 'talk'; }) }) }; } }
    // people on the street
    const ped = W.nearestPed(p.x, p.z, 2.6);
    if (ped && rt.chatCooldown <= 0) {
      const survey = G.activeMissions().some(id => { const s = curStep(id); return s && s.do === 'chat'; });
      if (!G.fun || survey) return { t: '💬 Say hi', fn: () => chatPed(ped) };
      return { t: '💬 Talk to a stranger', fn: () => G.fun.pedMenu(ped) };
    }
    return null;
  }
  function chatPed(ped) {
    if (ped.chatted && rt.t - ped.chatted < 60) { W.say(ped.obj, pick(['We already talked!', 'Hi again!', ':)']), 2); return; }
    ped.chatted = rt.t; rt.chatCooldown = 1;
    bump('chats');
    const near = G.allPlaces().filter(q => q.name && !q.virtual).sort((a, b) => dist(a.pin, P()) - dist(b.pin, P()))[Math.floor(Math.random() * 5)];
    let line = pick(D.CHATTER).replace('{place}', near ? near.name : 'the café on the corner');
    for (const id of G.activeMissions()) { const s = curStep(id); if (s && s.do === 'chat') { line = pick(['Save the park? Of course I\'ll sign!', 'Sure, happy to help!', 'Here you go! ✍️', 'Count me in!', 'Absolutely!']); break; } }
    W.holdPed(ped, 3, Math.random() < 0.5 ? 'wave' : null);
    W.say(ped.obj, line, 3.2);
    addStat('charm', 0.05, true);
    const r = Math.random();
    if (r < 0.2) addMoney(Math.ceil(rnd(1, 3)), 'tip');
    else if (r < 0.23) addSticker();
    dirty();
  }
  G.peek = () => findInteraction();
  G.attack = () => (G.fun && state === 'play' ? G.fun.attack() : false);
  G.chatPed = chatPed;
  G.interact = function () { if (rt.busy || U.isOpen() || state !== 'play') return; const it = findInteraction(); rt.interact = it; if (it) it.fn(); };

  // ------------------------------------------------------------------ the beam over the tracked goal
  function updateBeam() {
    if (!W) return;
    const THREE = W.THREE;
    if (!rt.beam) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 120, 12, 1, true).translate(0, 60, 0), new THREE.MeshBasicMaterial({ color: 0x6b4eff, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending })));
      const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.8, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x6b4eff, transparent: true, opacity: 0.65, depthWrite: false }));
      ring.position.y = 0.3; g.add(ring);
      W.scene.add(g); rt.beam = g;
    }
    rt.goalDirty = true;
  }
  function makeArrow() {
    const THREE = W.THREE, g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xffc21f, depthTest: false, transparent: true, opacity: 0.95 });
    const edge = new THREE.MeshBasicMaterial({ color: 0x3d2a9e, depthTest: false, transparent: true, opacity: 0.95 });
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.7), mat); shaft.position.z = 0.15;
    const headG = new THREE.ConeGeometry(0.32, 0.55, 4).rotateX(-Math.PI / 2).rotateZ(Math.PI / 4);
    const head = new THREE.Mesh(headG, mat); head.position.z = -0.45; head.scale.y = 0.35;
    const outline = new THREE.Mesh(headG, edge); outline.position.z = -0.45; outline.scale.set(1.15, 0.3, 1.1);
    g.add(outline, shaft, head);
    g.traverse(o => { o.renderOrder = 10; });
    g.scale.setScalar(1.4);
    W.scene.add(g);
    rt.arrow = g;
  }
  function updateArrow() {
    if (!rt.arrow) makeArrow();
    const p = P(), g = rt.goal;
    rt.arrow.visible = !!g;
    if (!g) return;
    rt.arrow.position.set(p.x, p.y + (W.ride().mode === 'drive' ? 3.3 : 2.6) + Math.sin(rt.t * 4) * 0.06, p.z);
    rt.arrow.rotation.y = Math.atan2(-(g.x - p.x), -(g.z - p.z));
    g.d = Math.hypot(g.x - p.x, g.z - p.z);
  }
  function currentGoal() {
    if (rt.race) { const c = rt.race.cps[rt.race.i]; return c ? { x: c.x, z: c.z, label: 'Checkpoint ' + (rt.race.i + 1), e: '🏁' } : null; }
    if (rt.chase) return { x: rt.chase.obj.position.x, z: rt.chase.obj.position.z, label: rt.chase.name, e: '🏃' };
    const id = save.track;
    if (id && save.m[id] && save.m[id].s === 'active') return stepGoal(id);
    if (rt.pinGoal) {
      const q = xz(rt.pinGoal);
      if (dist(q, P()) < 10) rt.pinGoal = null;
      else return { x: q.x, z: q.z, label: rt.pinGoal.name || 'Your pin', e: '📍' };
    }
    // nothing tracked: point at the nearest person with a mission
    let best = null, bd = 1e9;
    const p = P();
    if (rt.spots) for (const s of rt.spots.values()) { if (!s.open.length) continue; const d = Math.hypot(s.x - p.x, s.z - p.z); if (d < bd) { bd = d; best = { x: s.x, z: s.z, label: (s.who === 'boss' ? 'Boss' : D.CAST[s.who].n) + ' has a mission', e: '!' }; } }
    return best;
  }
  G.currentGoal = currentGoal;

  // ------------------------------------------------------------------ saving
  function dirty(now) { rt.dirtyT = now ? 0.1 : Math.max(rt.dirtyT, 0) || 4; if (now) rt.dirtyT = 0.1; }
  G.dirty = dirty;
  function doSave(reason) {
    if (!save || !W || state === 'start') return;
    const p = P(), a = ll(p.x, p.z);
    save.pos = { lat: Math.round(a.lat * 1e6) / 1e6, lon: Math.round(a.lon * 1e6) / 1e6, yaw: Math.round(W.player.face * 100) / 100 };
    save.updated = Date.now();
    save.walked = Math.round(W.player.footMoved);
    if (opts.onSave) { try { opts.onSave(save, reason); } catch (e) { console.warn(e); } }
  }
  G.saveNow = doSave;

  // ------------------------------------------------------------------ main loop
  function tick(dt, paused) {
    rt.t += dt;
    if (!paused) {
      save.clock += dt / 60; save.gameMin += dt;
      save.playMs += dt * 1000;
      accrue(dt);
      if (save.clock >= 24) newDay();
      const running = W.player.running && !save.equip.ride;
      save.energy = clamp(save.energy - (running ? 0.85 : 0.035) * dt, 0, G.maxEnergy());
      W.noRun = save.energy <= 0 && !save.equip.ride;
      if (save.energy <= 0 && !rt.tiredNote) { rt.tiredNote = 1; U.toast('😮‍💨 Out of energy! Grab a coffee ☕ or something to eat.'); }
      if (save.energy > 10) rt.tiredNote = 0;
      const target = G.happyTarget();
      save.happy += clamp(target - save.happy, -1, 1) * dt / 40;
      W.speedMul = speedMul();
      rt.chatCooldown -= dt;
    }
    W.setClock(save.clock);
    music(dt);
    managePickups(dt);
    updateActors(dt);
    updateMissions(dt);
    updateRace();
    updateChase(dt);
    updateTurf(dt);
    updateSigns();
    if (G.fun) G.fun.tick(dt, paused || rt.busy);
    rt.promptTimer -= dt;
    if (rt.promptTimer <= 0) { rt.promptTimer = 0.15; rt.interact = (paused || rt.busy) ? null : findInteraction(); U.prompt(rt.interact ? rt.interact.t : null); }
    // goal beam + arrow
    rt.goalT = (rt.goalT || 0) - dt;
    if (rt.goalT <= 0 || rt.goalDirty) { rt.goalT = 0.25; rt.goalDirty = false; rt.goal = currentGoal(); }
    if (rt.beam) { rt.beam.visible = !!rt.goal && !rt.race; if (rt.goal) rt.beam.position.set(rt.goal.x, W.groundAt(rt.goal.x, rt.goal.z), rt.goal.z); }
    updateArrow();
    if (rt.flag) rt.flag.userData.cloth.rotation.y = Math.sin(rt.t * 2) * 0.25;
    if (rt.dirtyT > 0) { rt.dirtyT -= dt; if (rt.dirtyT <= 0) doSave('auto'); }
    rt.saveTimer += dt;
    if (rt.saveTimer > 25) { rt.saveTimer = 0; doSave('timer'); }
    if (Math.floor(rt.t) % 2 === 0 && refreshAvailability.t !== Math.floor(rt.t)) { refreshAvailability.t = Math.floor(rt.t); refreshAvailability(); }
  }
  function frame(now) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - rt.last) / 1000);
    rt.last = now;
    if (!W || state === 'start') return;
    if (state === 'loading') { W.render(); return; }
    const paused = U.isOpen();
    W.controls.enabled = !paused && !rt.busy;
    tick(dt, paused);
    W.frame(dt, { simulate: !paused && !rt.busy, render: !(window.CFT_TEST && window.CFT_TEST.norender) });
    U.hud.frame(dt);
  }
  G.stepSim = function (n, render) { for (let i = 0; i < n; i++) { tick(1 / 30, false); W.frame(1 / 30, { budget: 1e9, render: !!render }); } };

  // ------------------------------------------------------------------ start
  async function startWorld() {
    const q = save.settings.quality === 'auto' ? (opts.quality || (matchMedia('(pointer: coarse)').matches ? 'low' : 'high')) : save.settings.quality;
    W = G.W = window.CFTWorld.create({ canvas: U.canvas, quality: q });
    W.touchUI.joy = U.joy; W.touchUI.knob = U.knob;
    // made-up shops in real buildings (the same building always gets the same shop) and the signs on every place
    const mixTotal = D.SHOP_MIX.reduce((a, m) => a + m[1], 0);
    W.makeShop = seed => {
      let r = hash(seed + 11) * mixTotal, kind = D.SHOP_MIX[0][0];
      for (const m of D.SHOP_MIX) { if (r < m[1]) { kind = m[0]; break; } r -= m[1]; }
      return { kind, name: D.shopName(kind, hash(seed + 23)) };
    };
    W.signList = () => G.allPlaces();
    W.signInfo = pl => {
      const k = D.KINDS[pl.kind];
      if (!k) return null;
      for (const id of Object.keys(save.biz)) if (dist(xz(save.biz[id]), pl.pin) < 16) return null; // your own sign hangs there
      return { e: k.e, name: pl.name || k.n, col: D.SIGN_COLS[pl.kind] || '#6b4eff' };
    };
    W.setOrigin(save.home.lat, save.home.lon);
    W.setLook(playerLook());
    setRide(save.equip.ride || null);
    W.setClock(save.clock);
    state = 'loading';
    const start = save.pos ? xz(save.pos) : xz(save.apt);
    W.teleport(start.x, start.z, save.pos ? save.pos.yaw : 0);
    U.loading('Loading your neighbourhood...');
    const t0 = performance.now();
    let ok = false;
    while (alive) {
      W.pumpAt(start.x, start.z, 50);
      const st = W.loadStatus(start.x, start.z, 260);
      if (st.total && st.built === st.total && !st.pending) { ok = true; break; }
      U.loading(st.errors && !st.total ? 'The map server isn\'t answering. Retrying...' : 'Loading your neighbourhood... ' + st.built + ' / ' + Math.max(st.total, 1) + ' blocks');
      if (performance.now() - t0 > 50000) break;
      await new Promise(r => requestAnimationFrame(r));
    }
    if (!alive) return;
    if (!ok) { U.loading('Sorry, the map couldn\'t load. Check your internet connection and try again.', true); return; }
    const w = W.nearestWalk(start.x, start.z, 300);
    if (w) W.teleport(w.x, w.z, save.pos ? save.pos.yaw : w.yaw);
    W.player.footMoved = save.walked || 0;
    placeHomeFlag();
    for (const id of Object.keys(save.biz)) buildBizSign(id);
    if (window.CFTFun) G.fun = window.CFTFun.attach(G, { bump, bumpTo: (k, n) => { save.counters[k] = n; }, spawnPickup, chatPed, setBusy: v => { rt.busy = !!v; } });
    W.setLook(playerLook());
    refreshAvailability();
    refreshFollowers();
    for (const id of G.activeMissions()) if (save.m[id].p === undefined) beginStep(id);
    for (const id of G.activeMissions()) { const s = curStep(id); if (s && s.do === 'collect' && save.m[id].items) spawnMissionPickups(id); if (s && s.deadline) save.m[id].deadline = null; if (s && s.do === 'deliver' && s.time) save.m[id].deadline = rt.t + s.time; }
    updateBeam();
    // offline earnings from managed businesses
    const away = Math.min(480, (Date.now() - (save.updated || Date.now())) / 60000);
    let off = 0;
    if (away > 2) for (const id of Object.keys(save.biz)) if (save.biz[id].mgr) off += G.bizIncome(id) * away / 60;
    U.loading(null);
    state = 'play';
    W.resize();
    if (off > 1) { save.money += off; U.banner('🧑‍💼 Welcome back!', 'Your managers earned ' + fmt$(off) + ' while you were away.', 'done'); }
    if (!save.m['c1-couch'] || save.m['c1-couch'].s === 'open') U.help(true);
    else U.banner('☀️ Day ' + save.day, 'Welcome back, ' + save.name + '!', 'day');
    dirty();
  }

  U.onReady = async function () {
    if (opts.save) { save = G.save = migrate(opts.save); }
    else {
      const r = await U.startScreen(opts.me);
      if (!r || !alive) return;
      save = G.save = newSave(r);
      log('Arrived in the city with $20 and a backpack', '🧳');
    }
    startWorld();
  };
  G.reset = function () { if (opts.onReset) opts.onReset(); };
  G.exit = function () { doSave('exit'); if (opts.onExit) opts.onExit(); };
  raf = requestAnimationFrame(frame);
  U.init();

  window.__cft = G;
  return {
    G,
    destroy() {
      if (save && state === 'play') doSave('exit');
      alive = false;
      if (window.ArkMusic) window.ArkMusic.stop();
      if (G.fun) G.fun.destroy();
      cancelAnimationFrame(raf);
      if (W) W.destroy();
      U.destroy();
      if (window.__cft === G) delete window.__cft;
    },
  };
}

window.CFTGame = { mount, newSave, migrate, summary, missionBoard, levelOf, xpAt, reqMet, STICKERS, MISSION, BIZ, CREW, fmt$ };
})();

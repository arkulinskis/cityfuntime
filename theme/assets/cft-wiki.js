/* City Fun Time: the balance wiki (Admin > Balance, 2026-11-21). The user: "create a wiki style page with characters, their
   power levels, weaknesses and so on, all their specs. I will then start adjusting those. I also want to understand how the
   character progresses by level. The goal is to adjust the math to make the game balanced and challenging. Add this wiki to
   the admin panel and allow me to adjust values from there, so I can live test what numbers make the most sense."

   - Everything shown comes from the game's own data (window.CFT_DATA = cft-content.js) and its own formulas (D.calc), so the
     wiki can't drift from the game. Every white box is a real game number: change it and the tables recalculate at once.
   - Changes are a flat map {path: number} (D.applyBalance). Three places they can live:
       1. the working copy on this page;
       2. "Live test": the same map in this browser's localStorage (cityfuntime.balance.draft). A game open in another tab of
          this browser re-applies it within a moment (cft-game.js listens), so you can tweak here and play there. Only you;
       3. "Publish": the server (server_code/Balance.py, admin only). Every new game everywhere starts with it.
   - Sections: How it works · You (level by level) · Figments · Bosses · Weapons · Powers · All knobs.

   const w = CFTWiki.mount(root, {api})   api = CFT.api (server calls through client_code/cft.py)   w.destroy() */
(function () {
'use strict';
const KEY = 'cityfuntime.balance.draft';
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r1 = v => (Math.round(v * 10) / 10).toLocaleString('en-US');
const r0 = v => Math.round(v).toLocaleString('en-US');
const r2 = v => (Math.round(v * 100) / 100).toString();
const LEVELS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 75, 100];
const SECTIONS = [['how', '📖', 'How it works'], ['you', '🧑', 'You, level by level'], ['figments', '👾', 'Figments'], ['bosses', '👑', 'Bosses'],
  ['weapons', '🏏', 'Weapons'], ['powers', '⚡', 'Powers'], ['colour', '🎨', 'Colour blocks'], ['knobs', '🎛️', 'All knobs']];

function mount(root, opts) {
  const D = window.CFT_DATA, C = D.calc, api = opts.api;
  let alive = true, sec = 'how', edits = {}, published = {}, info = null, live = false, saving = false, timer = 0;
  const ctx = { L: 5, fit: 3, armor: 0, weapon: '', gear: 0 };   // "what if" inputs for the tables
  // Read the defaults before anything is applied: D.BAL_DEFAULTS holds the originals of whatever is overridden right now
  const def = path => D.balanceDefault(path);
  const cur = path => { const r = D.balancePath(path); return r ? r.o[r.k] : undefined; };
  function apply() { D.applyBalance(edits); }
  function readDraft() { try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); return d && typeof d === 'object' ? d : null; } catch (e) { return null; } }
  function writeDraft() {
    try {
      if (live) localStorage.setItem(KEY, JSON.stringify({ on: true, values: edits, t: Date.now() }));
      else localStorage.removeItem(KEY);
    } catch (e) { /* storage blocked */ }
  }
  const same = (a, b) => { const ka = Object.keys(a), kb = Object.keys(b); return ka.length === kb.length && ka.every(k => b[k] === a[k]); };

  root.innerHTML = '<div class="wk"><div class="wk-bar" data-bar></div><nav class="wk-nav" data-nav></nav><div class="wk-body" data-body><p class="muted">Loading the numbers…</p></div></div>';
  const bar = root.querySelector('[data-bar]'), nav = root.querySelector('[data-nav]'), body = root.querySelector('[data-body]');
  nav.innerHTML = SECTIONS.map(s => '<button type="button" class="wk-tab" data-sec="' + s[0] + '">' + s[1] + ' ' + s[2] + '</button>').join('');

  // ------------------------------------------------------------------ the bar: status, live test, publish
  function drawBar() {
    const n = Object.keys(edits).length, unpub = !same(edits, published);
    bar.innerHTML =
      '<div class="wk-status"><b>' + (n ? n + ' value' + (n === 1 ? '' : 's') + ' changed from the defaults' : 'All defaults') + '</b>' +
      '<span class="' + (unpub ? 'wk-warn' : 'muted') + '">' + (unpub ? 'Not published yet: only this page' + (live ? ' and your live test' : '') + ' uses them.' : info && info.updated ? 'Published ' + esc(String(info.updated).slice(0, 16).replace('T', ' ')) + (info.by ? ' by ' + esc(info.by) : '') : 'Everyone plays with these.') + '</span></div>' +
      '<label class="wk-live"><input type="checkbox" data-live ' + (live ? 'checked' : '') + '> <span><b>Live test in my game</b><small>A game open in another tab of this browser follows every change. Only you.</small></span></label>' +
      '<div class="wk-acts">' +
      '<a class="ui-btn wk-b" href="#play" target="_blank" rel="noopener">🎮 Open the game</a>' +
      '<button type="button" class="ui-btn wk-b" data-undo ' + (unpub ? '' : 'disabled') + '>Back to published</button>' +
      '<button type="button" class="ui-btn wk-b" data-defaults ' + (n ? '' : 'disabled') + '>All defaults</button>' +
      '<button type="button" class="ui-btn primary wk-b" data-publish ' + (unpub && !saving ? '' : 'disabled') + '>' + (saving ? 'Publishing…' : 'Publish for everyone') + '</button></div>';
  }

  // ------------------------------------------------------------------ number boxes
  // A white box = a real game number. Changed = grape border + the default underneath + ↺ to put it back.
  function num(path, o) {
    o = o || {};
    const v = cur(path), d = def(path);
    if (typeof v !== 'number') return '<span class="muted">–</span>';
    const chg = path in edits;
    return '<span class="wk-num' + (chg ? ' chg' : '') + '"><input type="text" inputmode="decimal" data-path="' + esc(path) + '" value="' + esc(r2(v)) + '" aria-label="' + esc(o.label || path) + '" title="' + esc(path + ' · default ' + r2(d)) + '">' +
      (chg ? '<button type="button" class="wk-reset" data-reset="' + esc(path) + '" title="Back to ' + esc(r2(d)) + '" aria-label="Back to the default">↺</button><small>was ' + esc(r2(d)) + '</small>' : '') + (o.unit ? '<i>' + esc(o.unit) + '</i>' : '') + '</span>';
  }
  const tip = t => '<p class="wk-tip">' + t + '</p>';
  const h2 = (e, t, sub) => '<h2 class="wk-h">' + e + ' ' + esc(t) + '</h2>' + (sub ? '<p class="muted wk-sub">' + sub + '</p>' : '');
  const knobRow = (path, label, note, unit) => '<div class="wk-knob"><div><b>' + esc(label) + '</b>' + (note ? '<small>' + note + '</small>' : '') + '</div>' + num(path, { label, unit }) + '</div>';

  // ------------------------------------------------------------------ helpers built on the game's formulas
  const meleeIds = () => Object.keys(D.ITEMS).filter(id => D.ITEMS[id].weapon && (!D.ITEMS[id].weapon.ranged || D.ITEMS[id].weapon.ranged === 'cone')).sort((a, b) => D.ITEMS[a].p - D.ITEMS[b].p);
  const shooterIds = () => Object.keys(D.ITEMS).filter(id => { const w = D.ITEMS[id].weapon; return w && (w.ranged === 'proj' || w.ranged === 'shot'); }).sort((a, b) => D.ITEMS[a].p - D.ITEMS[b].p);
  const weaponOf = id => (id && D.ITEMS[id] && D.ITEMS[id].weapon) || D.SLAP;
  const weaponName = id => id && D.ITEMS[id] ? D.ITEMS[id].e + ' ' + D.ITEMS[id].n : '👊 Fists';
  function hitDmg(L, w) { return (w.dmg + (w.add || 0)) * C.dmgMul(L) * (1 + ctx.gear / 100); }   // + the weapon's strength adder   // one ordinary hit of yours (before combos, counters, crits)
  function gearRatio(w) { return Math.max(1, Math.min(40, (w.dmg + (w.add || 0)) * (1 + ctx.gear / 100) / (D.SLAP.dmg + (D.SLAP.add || 0)))); }
  function foe(kind, L, lvl, w) { // a figment of `kind` at level lvl when you are level L holding w
    const m = D.MONSTERS[kind], ar = ctx.armor + (w.def || 0), hp = C.maxHp(L, ctx.fit), sc = C.scale(L, lvl, gearRatio(w), hp, ar);   // the weapon's defence counts as armour
    const mhp = m.hp * sc.hp, atk = (m.atk || 6) * sc.atk, cut = C.armorCut(atk, ar);
    const hits = Math.ceil(mhp / Math.max(1e-6, hitDmg(L, w) * (m.weak && m.weak.bonk || 1)));
    return { m, mhp, atk: cut, hits, survive: Math.ceil(hp / Math.max(1e-6, cut)), secs: hits * (w.cd || 0.42), xp: C.xpFor(m, lvl) };
  }
  const ordinary = () => Object.keys(D.MONSTERS).filter(k => D.MONSTERS[k].w > 0 && !D.MONSTERS[k].boss);
  function avgXp(L) { let t = 0, n = 0; for (const k of ordinary()) { const m = D.MONSTERS[k]; t += C.xpFor(m, L) * m.w; n += m.w; } return n ? t / n : 0; }
  const missionXp = (() => { const xs = D.MISSIONS.map(m => m.reward && m.reward.xp).filter(v => v > 0); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; })();
  function ctxBar(withLevel) {
    return '<div class="wk-ctx">' +
      (withLevel ? '<label>Your level <input type="text" inputmode="numeric" data-ctx="L" value="' + ctx.L + '"></label>' : '') +
      '<label>Fitness <input type="text" inputmode="numeric" data-ctx="fit" value="' + ctx.fit + '"></label>' +
      '<label>Armour <input type="text" inputmode="numeric" data-ctx="armor" value="' + ctx.armor + '"></label>' +
      '<label>Damage bonus % <input type="text" inputmode="numeric" data-ctx="gear" value="' + ctx.gear + '"></label>' +
      '<label>Weapon <select data-ctx="weapon"><option value="">👊 Fists</option>' + meleeIds().map(id => '<option value="' + id + '"' + (ctx.weapon === id ? ' selected' : '') + '>' + esc(D.ITEMS[id].e + ' ' + D.ITEMS[id].n) + '</option>').join('') + '</select></label></div>';
  }

  // ------------------------------------------------------------------ the sections
  const VIEW = {};
  VIEW.how = () => h2('📖', 'How the numbers work', 'Read this once; every other tab is a table you can change.') +
    '<div class="wk-cards">' +
    '<div class="wk-card"><h3>Changing a number</h3><p>Every white box is a real game number. Type a new value and the tables around it recalculate straight away. A changed box gets a grape border, shows the default underneath and has ↺ to put it back.</p></div>' +
    '<div class="wk-card"><h3>Live testing</h3><p>Tick <b>Live test in my game</b>, then <b>Open the game</b> (a new tab in this browser). Every change you make here reaches that game within a moment, for you only. New figments use the new numbers; a few world settings (people, traffic, graphics) need the game reloaded.</p></div>' +
    '<div class="wk-card"><h3>Publishing</h3><p><b>Publish for everyone</b> sends the changed numbers to the server: every game that starts after that uses them (the leaderboard levels too). The last 12 versions are kept below, so you can always go back.</p></div>' +
    '<div class="wk-card"><h3>Health and damage</h3><p>Two scales, exactly as the game shows them: <b>your health</b> and the <b>hits you take</b> are the numbers on your health bar (about 70 at level 1); <b>your hits</b> and <b>figment health</b> are the pop-up numbers, ×10 the stored value (a 0.5 slap pops up as "5"). White boxes always hold the stored value.</p></div>' +
    '<div class="wk-card"><h3>Scaling (why figments keep up)</h3><p>A figment\'s health grows with your level (<i>figment health growth</i>) at the same rate as your hits grow (<i>your damage per level</i>), so the number of hits to win stays about the same. Gear helps through <i>gear share</i>, being further from home adds levels, and <i>challenge</i> adds a little extra toughness every level. Their hits follow your max health and armour the same way.</p></div>' +
    '<div class="wk-card"><h3>Weaknesses</h3><p>Each figment takes ×damage from six kinds of attack: 🏏 bonk, 🎯 shots, 💧 water, 🌩️ lightning, 🔥 fire, 🦶 stomp. Above 1 = <b>WEAK!</b> pops up, below 1 = <b>RESISTS</b>. On top of that a wet figment takes ×' + r1(D.TUNE.camp.wetMul) + ' from lightning, flying ones can\'t be bonked from the ground, and every thrown shot can be parried back.</p></div>' +
    '</div>' + historyHtml();

  VIEW.you = function () {
    const w = weaponOf(ctx.weapon), rows = LEVELS.map(L => {
      const s = foe('slime', L, L, w), b = foe('brute', L, L, w), need = C.xpAt(L + 1) - C.xpAt(L), ax = avgXp(L);
      return '<tr><td><b>' + L + '</b></td><td>' + r0(C.xpAt(L)) + '</td><td>' + r0(need) + '</td><td>' + r0(C.maxHp(L, ctx.fit)) + '</td><td>' + r1(hitDmg(L, w) * 10) + '</td>' +
        '<td>' + r0(s.mhp * 10) + ' · <b>' + s.hits + '</b></td><td>' + r0(b.mhp * 10) + ' · <b>' + b.hits + '</b></td><td>' + r1(b.atk) + ' · <b>' + b.survive + '</b></td>' +
        '<td>' + r0(ax) + '</td><td>' + r0(need / Math.max(1, ax)) + '</td><td>' + (missionXp ? r1(need / missionXp) : '–') + '</td></tr>';
    }).join('');
    return h2('🧑', 'You, level by level', 'How you grow, and how a same-level figment keeps up. Change the boxes on the right, or the "what if" inputs above the table.') +
      '<div class="wk-split"><div>' + ctxBar(false) +
      '<div class="wk-scroll"><table class="wk-table"><thead><tr><th>Level</th><th>XP total</th><th>XP to next</th><th>Max health (HUD)</th><th>Your hit (pop-up)</th><th>🟢 Slime: health · hits to pop</th><th>🧱 Brute: health · hits</th><th>🧱 Its hit on you · hits you survive</th><th>XP a figment</th><th>Figments to level up</th><th>…or missions</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      tip('Your hit and figment health are the pop-up numbers (×10); your health and their hits on you are what your health bar shows. "Figments to level up" averages ordinary figments by how often they spawn; missions give ' + r0(missionXp) + ' XP on average. Talents, charms, combos, counters and openings come on top.') + '</div>' +
      '<div class="wk-side"><h3>Levels</h3>' +
      knobRow('TUNE.player.xpBase', 'XP curve: base', 'XP to reach level L = base × (L − 1) ^ power') +
      knobRow('TUNE.player.xpExp', 'XP curve: power', 'Higher = later levels take much longer') +
      '<h3>Health</h3>' + knobRow('TUNE.player.hpBase', 'Health at the start') + knobRow('TUNE.player.hpPerLevel', 'Health per level') + knobRow('TUNE.player.hpPerFit', 'Health per Fitness point') +
      knobRow('TUNE.monsters.regen', 'Healing per second', 'share of max health, after a few calm seconds') + knobRow('TUNE.monsters.regenDelay', 'Calm seconds before healing', '', 's') +
      '<h3>Damage</h3>' + knobRow('TUNE.player.dmgPerLevel', 'Your damage per level', 'share added per level') + knobRow('SLAP.dmg', 'Bare-hand slap', '×10 in the game') +
      '<h3>Figments keep up</h3>' + knobRow('TUNE.monsters.hpGrow', 'Figment health growth', 'per level of yours (same as your damage = same hits)') +
      knobRow('TUNE.monsters.gearShare', 'Gear share', '0 = gear makes fights easy, 1 = figments match your gear') + knobRow('TUNE.monsters.lifeShare', 'Their hits follow your health') +
      knobRow('TUNE.monsters.armorShare', 'Their hits follow your armour') + knobRow('TUNE.monsters.challenge', 'Challenge per level', 'extra toughness from level 2') + knobRow('TUNE.monsters.challengeMax', 'Challenge cap') +
      knobRow('TUNE.monsters.hpPerLevel', 'Health per level above you', 'figments further from home') + knobRow('TUNE.monsters.atkPerLevel', 'Hit per level above you') +
      knobRow('TUNE.monsters.levelEvery', 'Metres per extra figment level', 'distance from home', 'm') + knobRow('TUNE.player.xpPerMonsterLevel', 'XP per figment level') + '</div></div>';
  };

  function weakCells(k) { return D.DMG_TYPES.map(t => '<td class="wk-weak">' + num('MONSTERS.' + k + '.weak.' + t[0], { label: k + ' ' + t[2] }) + '</td>').join(''); }
  function notes(k) {
    const m = D.MONSTERS[k], out = [];
    if (m.boss) out.push('👑 boss (rare spawn, or the King Blob mission)');
    if (m.night) out.push('🌙 night only');
    if (m.fly) out.push('🕊️ flies ' + m.fly + ' m up: shoot it, web it or jump');
    if (m.ranged) out.push('🎯 shoots from ' + m.ranged.r + ' m (' + m.ranged.dmg + ' dmg, every ' + m.ranged.cd.join('–') + ' s): parry to send it back');
    if (m.steal && m.steal[1]) out.push('👛 grabs $' + m.steal[0] + '–' + m.steal[1] + ' (back when popped)');
    if (m.cash) out.push('💵 drops cash');
    if (m.gem) out.push('💎 drops a gem');
    if (D.GUARDIANS[k]) out.push('🚇 can guard a metro: ' + D.GUARDIANS[k]);
    return out.join(' · ');
  }
  VIEW.figments = function () {
    const w = weaponOf(ctx.weapon), L = ctx.L;
    const kinds = Object.keys(D.MONSTERS).sort((a, b) => D.MONSTERS[a].hp - D.MONSTERS[b].hp);
    const tw = kinds.reduce((t, k) => t + (D.MONSTERS[k].w || 0), 0);
    const rows = kinds.map(k => {
      const m = D.MONSTERS[k], f = foe(k, L, L, w), share = tw && m.w ? Math.round(m.w / tw * 100) + '%' : '–';
      const danger = f.atk / Math.max(1e-6, C.maxHp(L, ctx.fit));
      return '<tr><td class="wk-who"><span class="wk-e">' + m.e + '</span><b>' + esc(m.n) + '</b><small>' + esc(k) + '</small></td>' +
        '<td>' + num('MONSTERS.' + k + '.hp') + '</td><td>' + num('MONSTERS.' + k + '.atk') + '</td><td>' + num('MONSTERS.' + k + '.speed', { unit: 'm/s' }) + '</td><td>' + num('MONSTERS.' + k + '.xp') + '</td><td>' + num('MONSTERS.' + k + '.w') + '<small class="wk-share">' + share + '</small></td>' +
        '<td class="wk-calc">' + r0(f.mhp * 10) + '</td><td class="wk-calc"><b>' + f.hits + '</b> <small>' + r1(f.secs) + ' s</small></td><td class="wk-calc">' + r1(f.atk) + '</td><td class="wk-calc"><b>' + f.survive + '</b></td>' +
        '<td class="wk-calc"><span class="wk-meter" style="--k:' + Math.min(1, danger * 4).toFixed(2) + '"></span></td>' + weakCells(k) + '<td class="wk-notes">' + notes(k) + '</td></tr>';
    }).join('');
    return h2('👾', 'Figments', 'Every kind of monster. White boxes are their base numbers (before scaling); grey columns are what you meet at the level and gear above, computed by the game\'s own formula.') +
      ctxBar(true) +
      '<div class="wk-scroll"><table class="wk-table wk-fig"><thead><tr><th>Figment</th><th>Health</th><th>Hit</th><th>Speed</th><th>XP</th><th>Spawn weight</th><th class="wk-calc">Health at your level</th><th class="wk-calc">Hits to pop · time</th><th class="wk-calc">Its hit on you</th><th class="wk-calc">Hits you survive</th><th class="wk-calc">Danger</th>' +
      D.DMG_TYPES.map(t => '<th class="wk-weak" title="' + t[2] + '">' + t[1] + '</th>').join('') + '<th>Notes</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      tip('Weakness columns: ' + D.DMG_TYPES.map(t => t[1] + ' ' + t[2]).join(' · ') + '. "Hits to pop" uses the bonk column. Walking speed is ' + D.WALK.walk + ' m/s and sprinting ' + D.WALK.run + ' m/s: keep figments slower than that. Spawn weight = how often one turns up (share of all spawns).') +
      '<h3 class="wk-h3">Fighting rules</h3><div class="wk-knobs">' +
      knobRow('TUNE.combat.parry', 'Perfect parry window', 'seconds before a strike', 's') + knobRow('TUNE.combat.block', 'Block stops', 'share of the damage') + knobRow('TUNE.combat.counter', 'Counter after a parry', '× damage') +
      knobRow('TUNE.combat.opening', 'Opening after their strike', '× damage') + knobRow('TUNE.combat.recover', 'Opening lasts', '', 's') + knobRow('TUNE.combat.comboStep', 'Combo bonus per hit') + knobRow('TUNE.combat.comboT', 'Combo keeps going for', '', 's') +
      knobRow('TUNE.combat.reach', 'Their strike reach', 'beyond their body', 'm') + knobRow('TUNE.combat.wind.0', 'Wind-up: shortest', '', 's') + knobRow('TUNE.combat.wind.1', 'Wind-up: longest', '', 's') +
      knobRow('TUNE.combat.luckyDodge', 'Lucky dodge chance') + knobRow('TUNE.combat.guardBreak.0', 'Guard break: big ones') + knobRow('TUNE.combat.guardBreak.1', 'Guard break: others') +
      knobRow('TUNE.monsters.aggro', 'They notice you at', '', 'm') + knobRow('TUNE.monsters.night', 'Out at night (high graphics)') + knobRow('TUNE.monsters.nightLow', 'Out at night (low graphics)') +
      knobRow('TUNE.monsters.day', 'Out by day (high)') + knobRow('TUNE.monsters.dayLow', 'Out by day (low)') + knobRow('TUNE.chaos.enemyShots', 'Thrown shot damage', '× (spitters, tomatoes, gulls, wraiths)') + '</div>';
  };

  VIEW.bosses = function () {
    const w = weaponOf(ctx.weapon), L = ctx.L, TB = D.TUNE.bosses, TM = D.TUNE.monsters, T = D.TUNE.camp;
    const guardRows = Object.keys(D.GUARDIANS).map(k => {
      const m = D.MONSTERS[k], hp = C.maxHp(L, ctx.fit), sc = C.scale(L, L + 1, gearRatio(w), hp, ctx.armor);
      const mhp = (m.hp * TB.guardHp + TB.guardHpAdd) * sc.hp, atk = C.armorCut(m.atk * sc.atk * TB.guardAtk, ctx.armor);
      return '<tr><td class="wk-who"><span class="wk-e">' + m.e + '</span><b>' + esc(D.GUARDIANS[k]) + '</b><small>a ' + esc(m.n) + ' × ' + r1(TB.guardSize) + ' size</small></td><td>' + r0(mhp * 10) + '</td><td><b>' + Math.ceil(mhp / Math.max(1e-6, hitDmg(L, w) * (m.weak.bonk || 1))) + '</b></td><td>' + r1(atk) + '</td><td><b>' + Math.ceil(hp / Math.max(1e-6, atk)) + '</b></td><td>' + r0(C.xpFor(m, L + 1) * TB.guardXp) + '</td></tr>';
    }).join('');
    const rareRows = (D.RPG.RARES || []).map(rr => {
      const m = D.MONSTERS[rr.kind], hp = C.maxHp(L, ctx.fit), sc = C.scale(L, L, gearRatio(w), hp, ctx.armor), mhp = (m.hp * TB.rareHp + TB.rareHpAdd) * sc.hp;
      return '<tr><td class="wk-who"><span class="wk-e">💀</span><b>' + esc(rr.n) + '</b><small>a ' + esc(m.n) + '</small></td><td>' + r0(mhp * 10) + '</td><td><b>' + Math.ceil(mhp / Math.max(1e-6, hitDmg(L, w) * (m.weak.bonk || 1))) + '</b></td><td>' + r1(C.armorCut(m.atk * sc.atk, ctx.armor)) + '</td><td>' + r0(m.xp * TB.rareXp) + '</td></tr>';
    }).join('');
    const ref = D.SLAP.dmg * 1.6 * C.dmgMul(L), mhp = T.megaHits * ref * T.megaWeak, onHeart = hitDmg(L, w) * T.megaWeak;
    const megaRows = (D.CAMPAIGN.MEGA || []).map(m => '<tr><td class="wk-who"><span class="wk-e">' + m.e + '</span><b>' + esc(m.n) + '</b><small>a ' + esc((D.MONSTERS[m.kind] || {}).n || m.kind) + ', ' + m.size + '× size · breath: ' + esc(m.breath) + '</small></td><td>' + r0(mhp * 10) + '</td><td><b>' + Math.ceil(mhp / Math.max(1e-6, onHeart)) + '</b> on the heart · ' + Math.ceil(mhp / Math.max(1e-6, hitDmg(L, w) * T.megaArmor)) + ' off it</td><td>' + r1(T.megaAtk * C.maxHp(L, 0)) + '</td></tr>').join('');
    return h2('👑', 'Bosses and specials', 'Champions, metro guardians, rare monsters, outposts and the MEGA figments: built from an ordinary figment with these multipliers.') + ctxBar(true) +
      '<h3 class="wk-h3">🔵 Champions (packs of three, from level 2)</h3><div class="wk-knobs">' + knobRow('TUNE.monsters.champChance', 'Chance a spawn is a champion pack') + knobRow('TUNE.monsters.champHp', 'Health ×') + knobRow('TUNE.monsters.champAtk', 'Hit ×') + knobRow('TUNE.monsters.champXp', 'XP ×') + knobRow('TUNE.monsters.champSize', 'Size ×') + '</div>' +
      '<h3 class="wk-h3">🚇 Metro guardians (one per station; beat it to open the station)</h3><div class="wk-knobs">' + knobRow('TUNE.bosses.guardHp', 'Health ×') + knobRow('TUNE.bosses.guardHpAdd', 'Health +') + knobRow('TUNE.bosses.guardAtk', 'Hit ×') + knobRow('TUNE.bosses.guardXp', 'XP ×') + knobRow('TUNE.bosses.guardSize', 'Size ×') + '</div>' +
      '<div class="wk-scroll"><table class="wk-table"><thead><tr><th>Guardian</th><th>Health</th><th>Hits to win</th><th>Its hit</th><th>Hits you survive</th><th>XP</th></tr></thead><tbody>' + guardRows + '</tbody></table></div>' +
      '<h3 class="wk-h3">💀 Rare monsters (silver tag, always drop Rare or better)</h3><div class="wk-knobs">' + knobRow('TUNE.bosses.rareHp', 'Health ×') + knobRow('TUNE.bosses.rareHpAdd', 'Health +') + knobRow('TUNE.bosses.rareXp', 'XP ×') + knobRow('TUNE.bosses.rareSize', 'Size ×') + '</div>' +
      '<div class="wk-scroll"><table class="wk-table"><thead><tr><th>Rare</th><th>Health</th><th>Hits to win</th><th>Its hit</th><th>XP</th></tr></thead><tbody>' + rareRows + '</tbody></table></div>' +
      '<h3 class="wk-h3">🦖 MEGA figments (taller than buildings: hit the heart while it\'s dizzy)</h3><div class="wk-knobs">' + knobRow('TUNE.camp.megaHits', 'Basic hits on the heart to win') + knobRow('TUNE.camp.megaWeak', 'Damage × on the heart') + knobRow('TUNE.camp.megaArmor', 'Damage × off the heart') + knobRow('TUNE.camp.megaAtk', 'Its hit', 'share of your base health') + knobRow('TUNE.camp.megaSpeed', 'Walking speed', '', 'm/s') + knobRow('TUNE.camp.megaEvery.0', 'Seconds between MEGAs: least', '', 's') + knobRow('TUNE.camp.megaEvery.1', 'Seconds between MEGAs: most', '', 's') + '</div>' +
      '<div class="wk-scroll"><table class="wk-table"><thead><tr><th>MEGA</th><th>Health</th><th>Hits with your weapon</th><th>Its hit</th></tr></thead><tbody>' + megaRows + '</tbody></table></div>' +
      '<h3 class="wk-h3">😈 Outposts (Tom Hearton\'s and groceries taken over by figments)</h3><div class="wk-knobs">' + knobRow('TUNE.outposts.packMin', 'Figments in a pack: fewest') + knobRow('TUNE.outposts.packMax', 'Figments in a pack: most') + knobRow('TUNE.outposts.captainHp', 'Captain health ×') + knobRow('TUNE.outposts.captainAtk', 'Captain hit ×') + knobRow('TUNE.outposts.range', 'A pack appears at', '', 'm') + knobRow('TUNE.outposts.maxPacks', 'Fights at once') +
      Object.keys(D.OUTPOSTS).map(k => knobRow('OUTPOSTS.' + k + '.bonus', D.OUTPOSTS[k].e + ' ' + D.OUTPOSTS[k].n + ': +' + D.OUTPOSTS[k].what + ' each') + knobRow('OUTPOSTS.' + k + '.cap', D.OUTPOSTS[k].e + ' ' + D.OUTPOSTS[k].n + ': most ' + D.OUTPOSTS[k].what)).join('') + '</div>';
  };

  VIEW.weapons = function () {
    const L = ctx.L;
    const B = id => id ? 'ITEMS.' + id + '.weapon.' : 'SLAP.';
    const who = (id, it) => '<td class="wk-who"><span class="wk-e">' + (it ? it.e : '👊') + '</span><b>' + esc(it ? it.n : 'Fists') + '</b><small>' + (it ? '$' + it.p + (it.req && it.req.lvl ? ' · level ' + it.req.lvl : '') : 'always') + '</small></td>';
    const mrow = id => {
      const it = id ? D.ITEMS[id] : null, w = weaponOf(id), b = B(id), cd = w.cd || 0.42, hit = hitDmg(L, w) * 10, crit = 1 + (w.crit || 0);
      return '<tr>' + who(id, it) + ['dmg', 'add', 'reach', 'arc', 'cd', 'hits', 'knock', 'stun', 'crit', 'def', 'block'].map(k => '<td>' + num(b + k, { unit: k === 'reach' ? 'm' : k === 'arc' ? '°' : k === 'cd' || k === 'stun' ? 's' : '' }) + '</td>').join('') +
        '<td class="wk-calc">' + r1(w.reach + 0.6) + ' m</td><td class="wk-calc"><b>' + r1(hit) + '</b></td><td class="wk-calc">' + r1(hit * crit / cd) + '/s</td></tr>';
    };
    const srow = id => {
      const it = D.ITEMS[id], w = it.weapon, b = B(id), rate = w.rate || 0.5, per = hitDmg(L, w) * 10 * (w.pellets || 1), crit = 1 + (w.crit || 0);
      const keys = w.ranged === 'shot' ? ['dmg', 'add', 'reach', 'rate', 'ammo', 'knock', 'stun', 'crit'] : ['dmg', 'add', 'reach', 'rate', 'ammo', 'pellets', 'splash', 'speed', 'knock', 'stun', 'crit'];
      return '<tr>' + who(id, it) + ['dmg', 'add', 'reach', 'rate', 'ammo', 'pellets', 'splash', 'speed', 'knock', 'stun', 'crit'].map(k => '<td>' + (keys.includes(k) ? num(b + k, { unit: k === 'reach' || k === 'splash' ? 'm' : k === 'rate' || k === 'stun' ? 's' : k === 'speed' ? 'm/s' : '' }) : '<span class="muted">–</span>') + '</td>').join('') +
        '<td class="wk-calc"><b>' + r1(per) + '</b></td><td class="wk-calc">' + r1(per * crit / rate) + '/s</td><td class="wk-calc">' + r1(per / (w.ammo || 1)) + '</td></tr>';
    };
    return h2('🏏', 'Weapons', 'Bonk weapons (in your hand) and shooters (slot 5). "Real reach" is where the gold arc on the ground sits: an ordinary figment whose body touches it gets hit.') +
      '<div class="wk-ctx"><label>Your level <input type="text" inputmode="numeric" data-ctx="L" value="' + ctx.L + '"></label><label>Damage bonus % <input type="text" inputmode="numeric" data-ctx="gear" value="' + ctx.gear + '"></label></div>' +
      '<h3 class="wk-h3">Bonk weapons</h3><div class="wk-scroll"><table class="wk-table"><thead><tr><th>Weapon</th><th>Damage</th><th>Strength +</th><th>Reach (ring size)</th><th>Arc (ring width)</th><th>Cooldown</th><th>Hits at once</th><th>Knock</th><th>Stun</th><th>Crit chance</th><th>Defence (armour)</th><th>Block +</th><th class="wk-calc">Real reach</th><th class="wk-calc">Hit at your level</th><th class="wk-calc">Per second</th></tr></thead><tbody>' +
      mrow('') + meleeIds().map(mrow).join('') + '</tbody></table></div>' +
      '<h3 class="wk-h3">Shooters (slot 5)</h3><div class="wk-scroll"><table class="wk-table"><thead><tr><th>Shooter</th><th>Damage</th><th>Strength +</th><th>Range</th><th>Seconds a shot</th><th>Ammo a shot</th><th>Pellets</th><th>Splash</th><th>Speed</th><th>Knock</th><th>Stun</th><th>Crit chance</th><th class="wk-calc">Shot at your level</th><th class="wk-calc">Per second</th><th class="wk-calc">Per ammo</th></tr></thead><tbody>' +
      shooterIds().map(srow).join('') + '</tbody></table></div>' +
      '<div class="wk-knobs">' + knobRow('TUNE.camp.ammoStart', 'Ammo at the start') + knobRow('TUNE.camp.ammoMax', 'Most ammo you can carry') + knobRow('TUNE.camp.ammoCrate', 'Ammo in a crate', '+ half your level') + knobRow('TUNE.camp.ammoCrates', 'Ammo crates around you') +
      knobRow('TUNE.aim.gunDrops', 'Shooters lying around town') + knobRow('TUNE.aim.gunAmmo', 'Ammo in a found shooter') + knobRow('TUNE.smash.weaponMul', 'Smashing things', '× weapon damage') + '</div>' +
      tip('Every white box is that weapon\'s own number. Reach is how far the gold ring on the ground reaches (plus a figment\'s body, 0.6 m) and Arc is how wide it is; Strength + is added to every hit before level growth; Crit chance doubles a hit; Defence is armour while it is in your hand; Block + is extra share a block stops while it is in your hand. Per second counts crits on average (not combos or counters). Shooters: per ammo = how much damage one ammo buys.');
  };

  VIEW.powers = () => h2('⚡', 'Powers', 'Slots 1-4: water, lightning, the extinguisher and the web. Damage grows with your level like your hits.') +
    '<h3 class="wk-h3">💧 Water (1)</h3><div class="wk-knobs">' + knobRow('TUNE.camp.waterRange', 'Range', '', 'm') + knobRow('TUNE.camp.waterKnock', 'Knock-back') + knobRow('TUNE.camp.waterStart', 'Charges at the start') + knobRow('TUNE.camp.waterMax', 'Most charges') + knobRow('TUNE.camp.waterOrb', 'Charges in an orb') + knobRow('TUNE.camp.hydrant', 'Charges from a hydrant') + '</div>' +
    '<h3 class="wk-h3">🌩️ Lightning (2)</h3><div class="wk-knobs">' + knobRow('TUNE.camp.voltDmg', 'Damage', '×10 in the game, × your level growth') + knobRow('TUNE.camp.voltRange', 'Range', '', 'm') + knobRow('TUNE.camp.voltChain', 'Jumps to more figments') + knobRow('TUNE.camp.wetMul', 'On a wet figment', '× damage') + knobRow('TUNE.camp.voltStart', 'Charges at the start') + knobRow('TUNE.camp.voltMax', 'Most charges') + knobRow('TUNE.camp.voltOrb', 'Charges in an orb') + '</div>' +
    '<h3 class="wk-h3">🧯 Fire and the extinguisher (3)</h3><div class="wk-knobs">' + knobRow('TUNE.camp.foamMax', 'Extinguisher (seconds × 10)') + knobRow('TUNE.camp.fireHurt', 'Fire damage to you a second') + knobRow('TUNE.camp.fireMax', 'Fires at once') + knobRow('TUNE.camp.fireSpread.0', 'Seconds between spreads: least', '', 's') + knobRow('TUNE.camp.fireSpread.1', 'Seconds between spreads: most', '', 's') + '</div>' +
    '<h3 class="wk-h3">🕸️ The web (4)</h3><div class="wk-knobs">' + knobRow('TUNE.aim.webRange', 'Sticks up to', '', 'm') + knobRow('TUNE.aim.webCd', 'Seconds between webs', '', 's') + knobRow('TUNE.aim.webMax', 'Top pull speed', '', 'm/s') + knobRow('TUNE.aim.webAcc', 'Pull acceleration') + knobRow('TUNE.aim.webStun', 'A webbed figment is stuck for', '', 's') + '</div>' +
    '<h3 class="wk-h3">🏃 Moving</h3><div class="wk-knobs">' + knobRow('WALK.walk', 'Walking speed', '', 'm/s') + knobRow('WALK.run', 'Sprinting speed', '', 'm/s') + knobRow('TUNE.wild.stamMax', 'Stamina') + knobRow('TUNE.wild.climb', 'Stamina a second climbing') + knobRow('TUNE.wild.dodgeWindow', 'Perfect dodge window', '', 's') + knobRow('TUNE.wild.flurryHits', 'Free hits after a perfect dodge') + knobRow('TUNE.hype.mainDmg', 'Main character mode: damage ×') + knobRow('TUNE.hype.mainSecs', 'Main character mode lasts', '', 's') + '</div>';

  VIEW.colour = () => h2('🎨', 'Colour blocks', 'The map is cut into 2 km squares that start grey. Each square has three layers that come back on their own; all three full = BLOCK RESTORED.') +
    '<div class="wk-cards"><div class="wk-card"><h3>🏠 Buildings</h3><p>Free places: liberate outposts (Tom Hearton\'s, groceries), beat metro guardians, walk into shops (E). Each counts points; full colour at the target (a block with fewer places needs all of them).</p></div>' +
    '<div class="wk-card"><h3>🛣️ Streets</h3><p>Roads, pavements, plazas, street furniture, parked cars and decor come back as you find the secret stashes in the block\'s tight gaps.</p></div>' +
    '<div class="wk-card"><h3>🌳 Nature</h3><p>Trees, bushes, grass, parks, water and sand come back as you bonk figments inside the block (champions count 2, rares and King Blob 3, guardians 5).</p></div>' +
    '<div class="wk-card"><h3>Always in colour</h3><p>You, people, figments, moving cars, shop signs, pickups and lights. The sky follows the block you stand in (the average of the three layers).</p></div></div>' +
    '<div class="wk-knobs">' + knobRow('TUNE.color.libTarget', '🏠 Points for full building colour') + knobRow('TUNE.color.wOutpost', 'Points: an outpost') + knobRow('TUNE.color.wMetro', 'Points: a metro entrance') +
    knobRow('TUNE.color.wShop', 'Points: a real shop walked into') + knobRow('TUNE.color.wMadeUp', 'Points: a made-up shop') + knobRow('TUNE.color.secretTarget', '🛣️ Secrets for full street colour') +
    knobRow('TUNE.color.killTarget', '🌳 Figments for full nature colour') + knobRow('TUNE.color.minSat', 'Colour at the very start', '0 = pure grey, 1 = full colour') +
    knobRow('TUNE.color.rewardCash', 'BLOCK RESTORED: cash', '+15% per level') + knobRow('TUNE.color.rewardXp', 'BLOCK RESTORED: XP', '+10% per level') + '</div>';

  // every number in D.TUNE, grouped: the escape hatch for anything the other tabs don't show
  VIEW.knobs = function () {
    const groups = [];
    const walk = (o, path, out) => {
      for (const k of Object.keys(o)) {
        const v = o[k], p = path + '.' + k;
        if (typeof v === 'number') out.push(p);
        else if (Array.isArray(v)) v.forEach((x, i) => { if (typeof x === 'number') out.push(p + '.' + i); });
        else if (v && typeof v === 'object' && p.split('.').length < 5) walk(v, p, out);
      }
    };
    for (const g of Object.keys(D.TUNE)) { const out = []; walk(D.TUNE[g], 'TUNE.' + g, out); if (out.length) groups.push([g, out]); }
    return h2('🎛️', 'All knobs', 'Every balance number in the game (D.TUNE in cft-content.js), by the part of the game that reads it. The comments next to each one in cft-content.js explain them in full.') +
      groups.map(([g, list]) => '<details class="wk-group"' + (list.some(p => p in edits) ? ' open' : '') + '><summary><b>' + esc(g) + '</b> <small>' + list.length + ' numbers' + (list.filter(p => p in edits).length ? ' · ' + list.filter(p => p in edits).length + ' changed' : '') + '</small></summary><div class="wk-knobs">' +
        list.map(p => knobRow(p, p.split('.').slice(2).join(' · '), '')).join('') + '</div></details>').join('');
  };

  function historyHtml() {
    if (!info || !info.history || !info.history.length) return '';
    return '<h3 class="wk-h3">Earlier published versions</h3><ul class="wk-hist">' + info.history.map(h => '<li><span><b>' + esc(String(h.updated || '').slice(0, 16).replace('T', ' ')) + '</b> · ' + esc(h.by || '') + ' · ' + h.n + ' changed values' + (h.note ? ' · ' + esc(h.note) : '') + '</span><button type="button" class="ui-btn wk-b" data-restore="' + h.i + '">Publish this one again</button></li>').join('') + '</ul>';
  }

  // ------------------------------------------------------------------ drawing + events
  function draw(keepFocus) {
    if (!alive) return;
    apply();
    const f = keepFocus && document.activeElement && root.contains(document.activeElement) ? document.activeElement : null;
    const fp = f && (f.dataset.path || f.dataset.ctx), fs = f && f.selectionStart != null ? f.selectionStart : null;
    for (const b of nav.querySelectorAll('[data-sec]')) b.classList.toggle('on', b.dataset.sec === sec);
    body.innerHTML = VIEW[sec]();
    drawBar();
    if (fp) { const el = body.querySelector('[data-path="' + fp + '"]') || body.querySelector('[data-ctx="' + fp + '"]'); if (el) { el.focus(); try { if (fs != null && el.setSelectionRange) el.setSelectionRange(fs, fs); } catch (e) { /* select */ } } }
  }
  function changed() { writeDraft(); clearTimeout(timer); timer = setTimeout(() => draw(true), 350); drawBar(); }
  function setValue(path, raw) {
    const v = parseFloat(String(raw).replace(',', '.'));
    if (!isFinite(v)) return;
    const d = def(path);
    if (Math.abs(v - d) < 1e-9) delete edits[path]; else edits[path] = v;
    changed();
  }
  root.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.path) setValue(t.dataset.path, t.value);
    else if (t.dataset.ctx && t.tagName !== 'SELECT') { const v = parseFloat(t.value); if (isFinite(v)) { ctx[t.dataset.ctx] = t.dataset.ctx === 'L' ? Math.max(1, Math.min(200, Math.round(v))) : Math.max(0, v); clearTimeout(timer); timer = setTimeout(() => draw(true), 350); } }
  });
  root.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.ctx === 'weapon') { ctx.weapon = t.value; draw(); }
    else if (t.dataset.live != null) { live = t.checked; writeDraft(); drawBar(); if (live && window.CFT && window.CFT.toast) window.CFT.toast('Live test on'); }
  });
  root.addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.sec) { sec = b.dataset.sec; draw(); body.scrollIntoView({ block: 'nearest' }); return; }
    if (b.dataset.reset) { delete edits[b.dataset.reset]; changed(); draw(); return; }
    if (b.hasAttribute('data-undo')) { edits = Object.assign({}, published); changed(); draw(); return; }
    if (b.hasAttribute('data-defaults')) { if (window.confirm('Put every number back to the game\'s defaults? (Nothing is published until you press Publish.)')) { edits = {}; changed(); draw(); } return; }
    if (b.hasAttribute('data-publish')) {
      const note = window.prompt('Publish these numbers for every player? A short note for the history (optional):', '');
      if (note === null) return;
      saving = true; drawBar();
      try { const r = await api('admin_balance_save', [edits, note]); published = Object.assign({}, r.values || edits); edits = Object.assign({}, published); await load(true); }
      catch (err) { window.alert(err.message || 'Could not publish. Try again.'); }
      saving = false; draw();
      return;
    }
    if (b.dataset.restore != null) {
      if (!window.confirm('Publish this older version for every player again?')) return;
      try { await api('admin_balance_restore', [+b.dataset.restore]); await load(true); edits = Object.assign({}, published); writeDraft(); draw(); }
      catch (err) { window.alert(err.message || 'Could not restore it.'); }
    }
  });
  async function load(quiet) {
    try {
      info = await api('admin_balance_get', []);
      published = Object.assign({}, info.values || {});
    } catch (err) { if (!quiet) body.innerHTML = '<p class="wk-warn">' + esc(err.message || 'Could not load the balance values.') + '</p>'; throw err; }
  }
  (async () => {
    try { await load(); } catch (e) { return; }
    const dr = readDraft();
    if (dr && dr.on && dr.values && !same(dr.values, published)) { edits = Object.assign({}, dr.values); live = true; }   // carry on with an unpublished live test
    else { edits = Object.assign({}, published); live = !!(dr && dr.on); }
    D.applyBalance({});   // the page's own copy of the data starts from the defaults
    draw();
  })();
  return {
    destroy() { alive = false; clearTimeout(timer); root.innerHTML = ''; },
    test: { get edits() { return edits; }, set: setValue, draw, ctx, VIEW, get live() { return live; } },
  };
}

window.CFTWiki = { mount };
})();

/* City Fun Time: the play-test panel (2026-11-17). Off for everyone unless the address has ?debug=1 (remembered in this
   browser; ?debug=0 turns it off again). A 🐞 button opens a panel to jump straight to what you want to test (time of day,
   figments, swagger, outposts, cars, money, levels) and a "Copy note info" button that copies where you are and what is
   going on, to paste next to a play-test note (PLAYTEST.md) so the fix can go straight to the right code.

   const Dbg = CFTDebug.attach(G)   (cft-game.js, after G.hero; returns null when debug is off)
   Dbg.info() -> the note text. G.debugGod = true: no damage. */
(function () {
'use strict';
const KEY = 'cityfuntime.debug';

function enabled() {
  try {
    const q = new URLSearchParams(location.search).get('debug');
    if (q === '1') localStorage.setItem(KEY, '1');
    if (q === '0') localStorage.removeItem(KEY);
    return localStorage.getItem(KEY) === '1';
  } catch (e) { return false; }
}

function attach(G) {
  if (!enabled()) return null;
  const D = G.D, W = G.W, U = G.ui, s = () => G.save, P = () => W.player.pos;
  const shell = U.canvas.parentElement;
  const near = (list, f) => list.slice().sort((a, b) => Math.hypot(f(a).x - P().x, f(a).z - P().z) - Math.hypot(f(b).x - P().x, f(b).z - P().z))[0];
  const goTo = (x, z, label) => { const w = W.nearestWalk(x + 6, z + 4, 40) || { x: x + 6, z: z + 4 }; W.teleport(w.x, w.z); U.toast('🐞 ' + (label || 'Moved')); };
  const facing = () => ({ x: -Math.sin(W.player.face), z: -Math.cos(W.player.face) });
  const dayKinds = () => Object.keys(D.MONSTERS).filter(k => D.MONSTERS[k].w > 0 && !D.MONSTERS[k].boss && (s().clock >= 21.5 || s().clock < 5 || !D.MONSTERS[k].night));
  const spawnAhead = (o, n) => { const p = P(), f = facing(); let m = null; for (let i = 0; i < (n || 1); i++) m = G.fun.spawnMonster(dayKinds()[Math.floor(Math.random() * dayKinds().length)], p.x + f.x * (7 + i) + f.z * (i - 1) * 2, p.z + f.z * (7 + i) - f.x * (i - 1) * 2, Object.assign({ event: 600 }, o || {})); return m; };
  const story = () => { if (!s().m['c1-couch'] || s().m['c1-couch'].s !== 'done') s().m['c1-couch'] = { s: 'done', done: s().day }; };

  const ACTIONS = [
    ['Time', [
      ['🌅 8:00', () => { s().clock = 8; }], ['☀️ 12:00', () => { s().clock = 12; }], ['🌇 19:00', () => { s().clock = 19; }], ['🌙 23:00', () => { s().clock = 23; }],
    ]],
    ['You', [
      ['💵 +$500', () => { s().money += 500; U.hud.bump('money'); }],
      ['⭐ Level up', () => { G.addXp(Math.max(1, G.xpAt(G.level() + 1) - s().xp + 1), 'quest'); }],
      ['❤️ Full health + energy', () => { G.fun.heal(99999); s().energy = G.maxEnergy(); }],
      ['🛡️ God mode', () => { G.debugGod = !G.debugGod; U.toast('🐞 God mode ' + (G.debugGod ? 'on' : 'off')); }],
      ['📖 Skip the first mission', () => { story(); G.dirty(true); }],
    ]],
    ['Fights', [
      ['👾 A figment', () => { story(); spawnAhead(); }],
      ['🔵 Champion pack', () => { story(); spawnAhead({ champ: true }, 3); }],
      ['❗ One winding up', () => { story(); const m = spawnAhead(); const p = P(), f = facing(); m.x = p.x + f.x * 2.2; m.z = p.z + f.z * 2.2; G.fun.windUp(m); }],
      ['🧹 Clear figments', () => { for (const m of G.fun.monsters.slice()) G.fun.removeMonster(m, true); }],
    ]],
    ['Hype', [
      ['✨ Fill swagger', () => { story(); G.hero.swag(200); }],
      ['💬 Compliment', () => { story(); G.hero.test.compliment(); }],
      ['📸 Fan', () => { story(); G.hero.test.fan(false); }],
      ['🎁 Gift', () => { story(); G.hero.test.fan(true); }],
      ['🔊 Hype Max/Some/Off', () => { const v = s().settings.hype || 'max'; s().settings.hype = v === 'max' ? 'some' : v === 'some' ? 'off' : 'max'; U.toast('🐞 Hype: ' + s().settings.hype); }],
    ]],
    ['Go to', [
      ['🍩 Tom Hearton\'s', () => { const pl = near(W.places.filter(q => q.kind === 'hearton'), q => q.pin); if (pl) goTo(pl.pin.x, pl.pin.z, pl.name); else U.toast('🐞 None loaded here'); }],
      ['🛒 Grocery', () => { const pl = near(W.places.filter(q => q.kind === 'grocery' && !(s().hero.out || {})[q.id]), q => q.pin); if (pl) goTo(pl.pin.x, pl.pin.z, pl.name); }],
      ['🚇 Metro', () => { const pl = near(W.places.filter(q => q.kind === 'metro' && !q.virtual), q => q.pin); if (pl) goTo(pl.pin.x, pl.pin.z, pl.name || 'Metro'); }],
      ['❗ Mission person', () => { const sp = near([...(G.rt.spots || new Map()).values()].filter(x => x.open && x.open.length), q => q); if (sp) goTo(sp.x, sp.z, (D.CAST[sp.who] || {}).n); }],
      ['🚗 Parked car', () => { let pc = null; const p = P(); for (let r = 2; r < 200 && !pc; r += 3) for (let a = 0; a < 6.28 && !pc; a += 0.4) pc = W.borrowable(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, 1.5); if (pc) { W.teleport(pc.x + 2 * pc.uz, pc.z - 2 * pc.ux); U.toast('🐞 Press E to borrow it'); } }],
      ['🏠 Home', () => { const h = G.homeSpot(); goTo(h.x, h.z, 'Home'); }],
    ]],
  ];

  // ------------------------------------------------------------------ the note info
  function info() {
    const sv = s(), p = P(), ll = G.ll(p.x, p.z), h = sv.clock;
    let pl = null, pd = 60; for (const q of G.allPlaces()) { const d = Math.hypot(q.pin.x - p.x, q.pin.z - p.z); if (d < pd) { pd = d; pl = q; } }
    const act = G.activeMissions().map(id => { const ms = sv.m[id]; return id + ' (step ' + ((ms && ms.st) || 0) + ')'; });
    const mons = G.fun ? G.fun.monsters.filter(m => Math.hypot(m.x - p.x, m.z - p.z) < 40).map(m => m.kind + (m.champ ? '*' : '') + (m.outpost ? '@outpost' : '') + (m.guard ? '@guard' : '')) : [];
    const hv = G.hero ? G.hero.summary() : {};
    const ver = ((document.querySelector('meta[name="cft-asset"][content*="cft-game.js"]') || {}).content || '').split('v=')[1] || '?';
    return ['CFT note info · build ' + ver + ' · ' + new Date().toISOString().slice(0, 16).replace('T', ' '),
      'where: ' + ll.lat.toFixed(5) + ',' + ll.lon.toFixed(5) + ' · ' + (W.streetAt(p.x, p.z) || '?') + (pl ? ' · near ' + (pl.name || pl.kind) + ' (' + pl.kind + (pl.virtual ? ', made-up' : '') + ', ' + Math.round(pd) + ' m)' : ''),
      'time: day ' + sv.day + ' ' + String(Math.floor(h)).padStart(2, '0') + ':' + String(Math.floor(h % 1 * 60)).padStart(2, '0') + ' · level ' + G.level() + ' · $' + Math.round(sv.money) + ' · hp ' + (G.fun ? Math.round(G.fun.hp()) + '/' + G.fun.maxHp() : '?') + ' · energy ' + Math.round(sv.energy) + '/' + G.maxEnergy(),
      'ride: ' + (W.ride().kind || 'on foot') + (G.hero && G.hero.borrowed ? ' (borrowed)' : '') + ' · quality ' + (W.renderer.shadowMap.enabled ? 'high' : 'low') + ' · hype ' + (sv.settings.hype || 'max') + ' · swagger ' + hv.swag + (hv.main ? ' (MAIN)' : ''),
      'missions: ' + (act.join(', ') || 'none active') + (sv.track ? ' · tracking ' + sv.track : ''),
      'figments near: ' + (mons.join(', ') || 'none') + ' · smashed this visit: ' + W.smashCount() + ' · outposts freed: ' + Object.keys((sv.hero || {}).out || {}).length,
      'screen: ' + innerWidth + 'x' + innerHeight + (matchMedia('(pointer: coarse)').matches ? ' touch' : '') + ' · ' + navigator.userAgent.replace(/^.*?\) /, '').slice(0, 60)].join('\n');
  }

  // ------------------------------------------------------------------ the panel
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'cft-dbg-btn'; btn.title = 'Play-test panel (`)'; btn.textContent = '🐞';
  shell.appendChild(btn);
  let panel = null;
  function close() { if (panel) { panel.remove(); panel = null; } }
  function open() {
    if (panel) { close(); return; }
    panel = document.createElement('div');
    panel.className = 'cft-dbg';
    panel.innerHTML = '<div class="cft-dbg-h"><b>🐞 Play-test panel</b><button type="button" data-x aria-label="Close">✕</button></div>' +
      ACTIONS.map((g, gi) => '<div class="cft-dbg-g"><span>' + g[0] + '</span>' + g[1].map((a, ai) => '<button type="button" data-a="' + gi + ':' + ai + '">' + a[0] + '</button>').join('') + '</div>').join('') +
      '<div class="cft-dbg-g"><button type="button" class="wide" data-copy>📋 Copy note info</button></div><textarea readonly rows="7" data-info></textarea>' +
      '<p>Changes your save. Turn off with ?debug=0.</p>';
    shell.appendChild(panel);
    panel.querySelector('[data-info]').value = info();
    panel.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-x')) { close(); return; }
      if (b.hasAttribute('data-copy')) { const t = info(); panel.querySelector('[data-info]').value = t; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => U.toast('📋 Copied: paste it with your note'), () => { const ta = panel.querySelector('[data-info]'); ta.select(); U.toast('Select-all is ready: Ctrl+C'); }); return; }
      const [gi, ai] = (b.dataset.a || '').split(':').map(Number);
      const a = ACTIONS[gi] && ACTIONS[gi][1][ai];
      if (a) { try { a[1](); } catch (err) { U.toast('🐞 ' + err.message); } G.dirty(); panel.querySelector('[data-info]').value = info(); }
    });
    panel.addEventListener('keydown', e => e.stopPropagation());
  }
  btn.addEventListener('click', open);
  const onKey = e => { if (e.code === 'Backquote' && !(e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) { e.preventDefault(); open(); } };
  document.addEventListener('keydown', onKey);
  return { info, open, close, destroy() { document.removeEventListener('keydown', onKey); close(); btn.remove(); } };
}

window.CFTDebug = { attach, enabled };
})();

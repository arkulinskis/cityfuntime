// Shooting up (2026-11-23, the user: "projectiles need to respect the height of where the target is pointing... never up").
// Every ranged weapon follows how far up you look (W.aimEl) or the sight's point: thrown shooters (cft-chaos aimShot),
// bubble shots (cft-fun F.shoot), water + the extinguisher (cft-camp aimDir/inJet). Run with:
//   python -I tools/live/game_test.py --eval tools/live/upaimtest.js
(async () => {
  const out = [], ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m);
  const G = window.__cft, W = G.W, D = G.D, F = G.fun, C = G.chaos;
  window.CFT_TEST = Object.assign(window.CFT_TEST || {}, { norender: true, calm: true, noLuck: true });
  const look = pitch => { W.aiming = false; W.aimPoint = null; W.cam.pitch = pitch; for (let i = 0; i < 12; i++) W.frame(1 / 30, { budget: 1e9, render: false }); W.render(); };
  try {
    G.ui.closeAll(); G.rt.busy = false;
    for (const m of F.monsters.slice()) F.removeMonster(m);
    if (G.camp) G.camp.addAmmo(99);
    const items = Object.values(D.ITEMS).filter(it => it.weapon && it.weapon.ranged === 'proj');
    const flat = items.find(it => !it.weapon.lob) || items[0];
    const lob = items.find(it => it.weapon.lob);
    ok(!!flat, 'found a thrown shooter: ' + (flat && flat.n));
    look(0.32);
    const elDef = W.aimEl();
    look(-0.9);
    const elUp = W.aimEl();
    ok(Math.abs(elDef) < 0.15, 'the default camera aims about level (' + elDef.toFixed(2) + ' rad)');
    ok(elUp > 0.5, 'tilting the camera to the sky aims up (' + elUp.toFixed(2) + ' rad)');
    const fire = (w, pitch) => { look(pitch); C.shots.length = 0; const n0 = C.shots.length; C.fire(Object.assign({ dmg: 1, reach: 20, speed: 22 }, w)); const s = C.shots[C.shots.length - 1]; return C.shots.length > n0 ? s : null; };
    let s = fire(flat.weapon, 0.32), v0 = s && s.vy;
    s = fire(flat.weapon, -0.9); const v1 = s && s.vy;
    ok(v1 > 6 && v1 > v0 + 4, flat.n + ' flies up when you look up (vy ' + (v0 || 0).toFixed(1) + ' -> ' + (v1 || 0).toFixed(1) + ')');
    s = fire(flat.weapon, 1.1); const v2 = s && s.vy;
    ok(v2 < v0, '... and lower when you look down (vy ' + (v2 || 0).toFixed(1) + ')');
    if (lob) { const a = fire(lob.weapon, 0.32).vy, b = fire(lob.weapon, -0.9).vy; ok(b > a, lob.n + ' (lobbed) arcs higher when you look up (' + a.toFixed(1) + ' -> ' + b.toFixed(1) + ')'); }
    // the sight: a point high on a wall
    look(0.32);
    const p = W.player.pos, fx = -Math.sin(W.player.face), fz = -Math.cos(W.player.face);
    W.aiming = true; W.aimPoint = { x: p.x + fx * 12, y: p.y + 10, z: p.z + fz * 12, kind: 'wall' };
    C.shots.length = 0; C.fire(Object.assign({ dmg: 1, reach: 20, speed: 22 }, flat.weapon)); s = C.shots[0];
    ok(s && s.vy > 8, 'with the sight on a point 10 m up, the shot climbs (vy ' + (s ? s.vy.toFixed(1) : '-') + ')');
    // bubbles
    const bub = Object.values(D.ITEMS).find(it => it.weapon && it.weapon.ranged === 'shot');
    if (bub) {
      F.shots.length = 0; F.shoot(bub.weapon); const b = F.shots[F.shots.length - 1];
      ok(b && b.vy > 5, bub.n + ' (bubble shot) climbs to the sight point (vy ' + (b ? b.vy.toFixed(1) : '-') + ')');
      for (let i = 0; i < 10; i++) G.stepSim(1);
      ok(!b || !F.shots.includes(b) || b.y > p.y + 2, '... and really rises in flight');
    } else out.push('INFO no bubble-shot weapon in D.ITEMS');
    W.aiming = false; W.aimPoint = null;
    out.push(C.shots.length + ' shots left in flight');
  } catch (e) { out.push('FAIL threw: ' + (e && e.stack || e)); }
  W.aiming = false; W.aimPoint = null;
  return out.join('\n');
})()

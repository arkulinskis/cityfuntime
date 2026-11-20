"""Plays the 3D game in headless Chrome (software WebGL) and prints PASS/FAIL lines. Needs internet (real map tiles).

    python -I tools/live/game_test.py [OUTDIR]            the whole game: gametest.js (missions, shops, turf...), funtest.js, rpgtest.js
    python -I tools/live/game_test.py --fun [OUTDIR]      only funtest.js (monsters, weapons, strangers, street folk, pranks, events)
    python -I tools/live/game_test.py --combat [OUTDIR]   only combattest.js (monsters, health, guardians, gear you wear)
    python -I tools/live/game_test.py --hero [OUTDIR]     only herotest.js (speed, block/parry, smashing, borrowed cars, outposts, hype, blips)
    python -I tools/live/game_test.py --heroshots [OUTDIR] no tests: the main character update (graphics, a parry, the hype, an outpost, a wreck, blips, night)
    python -I tools/live/game_test.py --chaos [OUTDIR]    only chaostest.js (decor, mayhem, ranged weapons + figments, flying, the Dex, toys, events)
    python -I tools/live/game_test.py --camp [OUTDIR]     only camptest.js (HUD + map size, crazy list + mission cap, the opening, ammo, powers, fire, storms, MEGA figments, secrets, bouncy world)
    python -I tools/live/game_test.py --wild [OUTDIR]     only wildtest.js (four-corner HUD, pavement footing, climbing + stamina, umbrella + updrafts, perfect dodge + flurry, air slow-mo, chemistry, rooftop antennas)
    python -I tools/live/game_test.py --aim [OUTDIR]      only aimtest.js (right-mouse sight, slots 1-4, the web, weapon reach + arcs, gabled roofs, scaling figments, no level cap, rainbow guides, the Dex gallery)
    python -I tools/live/game_test.py --aimshots [OUTDIR] no tests: the sight on a wall, the web pulling, a 360° swing, a rainbow guide, the Dex gallery
    python -I tools/live/game_test.py --stunt [OUTDIR]    only stunttest.js (courses pop up in a car, boost, ramp launch, ring of fire, flips, rolls, wipeout, hop, fire alley, phone app)
    python -I tools/live/game_test.py --stuntshots [OUTDIR] no tests: a stunt course popping up, the car through a ring of fire, a flip, a MEGA ramp, a fire alley, the phone app
    python -I tools/live/game_test.py --cine [OUTDIR]     only cinetest.js (every mission line voiced, a mission intro as a scene, title + chapter cards, subtitles, skip, phone calls, MISSION COMPLETE, settings)
    python -I tools/live/game_test.py --cineshots [OUTDIR] no tests: the voiced mission scenes (chapter card, title card, a close-up with subtitles, over the shoulder, a phone call, MISSION COMPLETE)
    python -I tools/live/game_test.py --campshots [OUTDIR] no tests: pictures of the campaign update (HUD desktop + phone, the opening, a MEGA figment, fire, a storm, a secret)
    python -I tools/live/game_test.py --chaosshots [OUTDIR] no tests: the chaos update (decor, critters, brainrot, toys, the sky, a jetpack, ranged fights)
    python -I tools/live/game_test.py --boro [OUTDIR]     only borotest.js (borough names, looks, HUD chip, banners, discovery)
    python -I tools/live/game_test.py --boroshots [OUTDIR] no tests: two boroughs side by side, the chip + banner, the big map with names
    python -I tools/live/game_test.py --rpg [OUTDIR]      only rpgtest.js (loot, talents, rested XP, discovery, reputation, achievements, rares)
    python -I tools/live/game_test.py --shots [OUTDIR]    no tests: screenshots of the city by day, at dusk and at night
    python -I tools/live/game_test.py --ground [OUTDIR]   no tests: the ground photo textures (pavement, road, lawn, plaza, woods/sand, overview, dusk)
    python -I tools/live/game_test.py --monsters [OUTDIR] no tests: the 15 monster types, a metro guardian, a fight, loot gear on you
    python -I tools/live/game_test.py --long [OUTDIR]     no tests: the Character / Reputation / Achievements apps, a Legendary drop, a rare monster, a level-up
    python -I tools/live/game_test.py --people [OUTDIR]   no tests: close-ups of the characters (you, passers-by in poses, the look editor)
    python -I tools/live/game_test.py --models [OUTDIR]   no tests: the 3D models up close (faces, silly extras, every vehicle, trees, bushes, animals)
    python -I tools/live/game_test.py --gfx [OUTDIR]      no tests: the graphics overhaul (facades up close, a street, roofs from above, cars, you, dusk, night)
                                                          CFT_QS="&nopost=1" in the environment = the same without post-processing
    python -I tools/live/game_test.py --eval FILE.js [OUTDIR]   start a game, run FILE.js in the page, print what it returns

It serves the game from theme/assets with tools/live/harness.py (a plain page, no Anvil), starts a fresh guest game in
Montreal's Plateau and runs the scripts inside the page. A few minutes: software rendering is slow, so the tests step the
simulation without drawing (window.CFT_TEST.norender). Not part of check.py. Screenshots land in OUTDIR.
"""
import json
import pathlib
import subprocess
import sys
import tempfile
import threading

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import harness  # noqa: E402

argv = sys.argv[1:]
evalfile = None
if "--eval" in argv:
    evalfile = pathlib.Path(argv[argv.index("--eval") + 1]).read_text(encoding="utf-8")
    del argv[argv.index("--eval"):argv.index("--eval") + 2]
args = [a for a in argv if not a.startswith("--")]
flags = {a for a in argv if a.startswith("--")}
out = pathlib.Path(args[0] if args else tempfile.mkdtemp(prefix="cft-game-")).resolve()
out.mkdir(parents=True, exist_ok=True)

server = harness.serve(0)  # any free port
port = server.server_address[1]
threading.Thread(target=server.serve_forever, daemon=True).start()

START = [
    {"waitFor": "document.querySelector('.cft-start-form')", "timeout": 60000},
    {"eval": "(() => { const f = document.querySelector('.cft-start-form'); f.elements.name.value = 'Tester'; f.querySelector('.cft-place[data-p=\"0\"]').click(); return true; })()"},
    {"waitFor": "window.__cft && window.__cft.state() === 'play'", "timeout": 180000},
    {"wait": 2500},
]


def script(name, done, result, wait):
    return [{"eval": (HERE / name).read_text(encoding="utf-8")}, {"waitFor": "window.%s === true" % done, "timeout": wait}, {"eval": "window." + result}]


# For the screenshots: skip ahead (first mission done, armed, crowned), then stage one scene per picture.
PRE = "const G = window.__cft, W = G.W, s = G.save, F = G.fun, p = W.player.pos; G.ui.closeAll(); window.CFT_TEST = { norender: true, calm: true };" \
      "const look = (x, z, back, pitch) => { const d = Math.hypot(x - p.x, z - p.z) || 1, ux = (x - p.x) / d, uz = (z - p.z) / d; W.cam.yaw = Math.atan2(-ux, -uz); W.cam.pitch = pitch == null ? 0.16 : pitch; W.cam.dist = W.cam.cur = back || 7.5; W.player.face = Math.atan2(-ux, -uz); };" \
      "const near = (list, f) => list.slice().sort((a, b) => Math.hypot(f(a).x - p.x, f(a).z - p.z) - Math.hypot(f(b).x - p.x, f(b).z - p.z))[0];"
POST = " G.stepSim(%d); window.CFT_TEST.norender = false; return 'ok'; })()"


def scene(name, js, steps=40, wait=3000):
    return [{"eval": "(() => { " + PRE + js + POST % steps}, {"wait": wait}, {"shot": name}]


SCENES = (
    scene("1-street", "s.m['c1-couch'] = { s: 'done', done: 1 }; s.money = 400; s.clock = 10.5; s.owned.w_chicken = true; s.equip.weapon = 'w_chicken';"
          "const q = W.randomWalkSpot(0, 0, 30, 200, (x, z, sg) => sg.car && sg.w >= 11) || W.nearestWalk(0, 0, 200); W.teleport(q.x, q.z, q.yaw); W.cam.pitch = 0.2;", 500)
    + scene("2-shop-sign", "const pl = near(W.places.filter(q => q.made && W.signs().has(q.id)), q => q.pin); const dx = pl.pin.x - pl.x, dz = pl.pin.z - pl.z, d = Math.hypot(dx, dz) || 1;"
            "W.teleport(pl.pin.x + dx / d * 5, pl.pin.z + dz / d * 5); look(pl.x, pl.z, 9, 0.12);")
    + scene("3-traffic-light", "const n = near(W.signals(), q => q), e = n.ends.slice().sort((a, b) => b.sg.w - a.sg.w)[0], sg = e.sg, k = e.end === 1 ? 1 : -1;"
            "const ux = (sg.x2 - sg.x1) / sg.L * k, uz = (sg.z2 - sg.z1) / sg.L * k, b = Math.min(20, sg.L * 0.9); W.teleport(n.x + ux * b + uz * 2, n.z + uz * b - ux * 2); look(n.x, n.z, 10, 0.2);", 120)
    + scene("4-street-folk", "for (let i = 0; i < 30 && !F.folk.length; i++) G.stepSim(30); const a = F.folk[0]; const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);"
            "W.teleport(a.x + fx * 3.5, a.z + fz * 3.5); look(a.x, a.z, 6, 0.2); s.fun.king = 'King'; W.setLook(G.playerLook());")
    + scene("5-phone", "G.ui.phone('street');", 5, 1500)
    + scene("6-ufo", "s.clock = 18.9; F.startEvent('ufo'); const e = F.event; W.teleport(e.x + 9, e.z + 5); look(e.x, e.z, 13, -0.05);", 30)
    + scene("7-night-monsters", "if (F.event) { F.event.t = 999; } s.clock = 23; const f = { x: -Math.sin(W.player.face), z: -Math.cos(W.player.face) };"
            "['slime', 'bin', 'cone', 'sock', 'slime'].forEach((k, i) => F.spawnMonster(k, p.x + f.x * (5 + i * 1.6) + f.z * (i - 2) * 2, p.z + f.z * (5 + i * 1.6) - f.x * (i - 2) * 2, { event: 300 }));"
            "look(p.x + f.x * 6, p.z + f.z * 6, 8, 0.24);", 12)
    + scene("8-night-street", "for (const m of F.monsters) m.t = 9999; s.clock = 22.2; const q = W.randomWalkSpot(p.x, p.z, 40, 200, (x, z, sg) => sg.car && sg.w >= 9) || p; W.teleport(q.x, q.z, q.yaw); W.cam.pitch = 0.2; W.cam.dist = W.cam.cur = 9;", 200)
    + scene("9-dusk-wide", "s.clock = 19.1; W.cam.pitch = 0.5; W.cam.dist = W.cam.cur = 18;", 30)
)

# Close-ups of the people: you from the front, a line-up of passers-by in different poses, the look editor.
PEOPLE = (
    scene("p1-you", "s.m['c1-couch'] = { s: 'done', done: 1 }; s.clock = 11; s.money = 400; s.owned.w_baguette = true; s.equip.weapon = 'w_baguette';"
          "const q = W.randomWalkSpot(0, 0, 30, 200, (x, z, sg) => sg.car && sg.w >= 11) || W.nearestWalk(0, 0, 200); W.teleport(q.x, q.z, q.yaw); W.cam.pitch = 0.12; W.showOff = true;", 300)
    + scene("p2-lineup", "W.showOff = false; W.cam.pitch = 0.1; W.cam.dist = W.cam.cur = 2.2; const f = { x: -Math.sin(W.cam.yaw), z: -Math.cos(W.cam.yaw) };"
            "const peds = W.life.peds.filter(q => q.type !== 'bike' && q.type !== 'skate').slice(0, 7), poses = [null, 'wave', null, 'dance', null, 'air', null];"
            "peds.forEach((q, i) => { q.ctl = true; q.keep = true; const o = (i - 3) * 1.15, x = p.x + f.x * 5.2 + f.z * o, z = p.z + f.z * 5.2 - f.x * o;"
            "q.obj.position.set(x, W.groundAt(x, z), z); q.obj.rotation.y = W.cam.yaw + Math.PI; W.animate(q.fig, 0, 0.4 + i * 0.3, poses[i]); });"
            "W.avatar.visible = false; window.__lineup = peds;", 3)
    + scene("p3-walkers", "(window.__lineup || []).forEach(q => { q.ctl = false; q.keep = false; }); W.cam.dist = W.cam.cur = 6; W.cam.pitch = 0.16;"
            "const t = near(W.life.peds.filter(q => !q.ctl && q.type === 'walk'), q => q.obj.position); if (t) { const o = t.obj.position; W.teleport(o.x + 3, o.z + 2); look(o.x, o.z, 5, 0.14); }", 25)
    + scene("p4-cast", "const a = [...G.rt.actors.values()][0]; if (a) { W.teleport(a.x + 2.2, a.z + 1.5); look(a.x, a.z, 4.5, 0.12); }", 40)
    + scene("p5-look-editor", "G.ui.lookEditor();", 5, 2500)
    + scene("p6-run", "G.ui.closeAll(); W.showOff = false; W.controls.enabled = true; W.cam.dist = W.cam.cur = 5; W.cam.pitch = 0.18; W.cam.yaw += 2.4; W.input.f = 1; W.input.sprint = true; s.energy = 100;", 40)
)

# The 3D models up close (realism pass 2026-11-17): faces, the silly extras, every vehicle, silly roof loads, the four tree
# kinds and the bushes, animals, and a street. Objects are put in front of the camera (window.__mo) and cleared each scene.
MO = ("(window.__mo || []).forEach(o => W.scene.remove(o)); window.__mo = []; W.avatar.visible = false; W.showOff = false;"
      "const f = { x: -Math.sin(W.cam.yaw), z: -Math.cos(W.cam.yaw) };"
      "const put = (o, ahead, side, turn) => { const x = p.x + f.x * ahead + f.z * side, z = p.z + f.z * ahead - f.x * side; o.position.set(x, W.groundAt(x, z), z); o.rotation.y = W.cam.yaw + Math.PI + (turn || 0); W.scene.add(o); window.__mo.push(o); return o; };"
      "const person = (look, ahead, side, pose, turn) => { const g = W.person(Object.assign(W.randomLook(look.seed || 1), look)); W.animate(g, 0, 0.5, pose); return put(g, ahead, side, turn); };")
MODELS = (
    scene("m1-faces", "s.m['c1-couch'] = { s: 'done', done: 1 }; s.clock = 11;"
          "const q = W.randomWalkSpot(0, 0, 30, 200, (x, z, sg) => sg.car && sg.w >= 11) || W.nearestWalk(0, 0, 200); W.teleport(q.x, q.z, q.yaw); W.cam.pitch = 0.02; W.cam.dist = W.cam.cur = 1.0;" + MO +
          "[{ seed: 3, fig: 0.1, beard: true, silly: null }, { seed: 8, fig: 0.9, long: true, style: 1, silly: null, glasses: false }, { seed: 12, fig: 0.4, glasses: true, silly: null, skin: 0x6b4126 }, { seed: 21, fig: 0.8, style: 4, silly: null, skin: 0xd39d6c }]"
          ".forEach((l, i) => person(l, 1.9, (i - 1.5) * 0.62, null));", 20)
    + scene("m2-silly", "W.cam.dist = W.cam.cur = 4.2; W.cam.pitch = 0.06;" + MO +
            "W.SILLY.forEach((k, i) => person({ seed: 40 + i, silly: k, h: 1, dress: false }, 4.2, (i - 4.5) * 0.85, i % 3 === 1 ? 'wave' : null));", 20)
    + scene("m3-cars", "W.cam.dist = W.cam.cur = 7; W.cam.pitch = 0.2;" + MO +
            "['car', 'suv', 'sports', 'taxi', 'police', 'van'].forEach((k, i) => put(W.vehicle(k, [0xe8453c, 0x2b6cb0, 0xf2b134, 0, 0, 0xf4f1ea][i]), 9 + (i % 2) * 6, (Math.floor(i / 2) - 1) * 3.4 + (i % 2) * 1.6, 0.9));", 20)
    + scene("m4-big-and-silly", "W.cam.dist = W.cam.cur = 8; W.cam.pitch = 0.22;" + MO +
            "put(W.vehicle('bus'), 14, -5, 0.8); put(W.vehicle('truck'), 9, 1.5, 0.8); W.SILLY_CARS.forEach((k, i) => put(W.vehicle(i % 2 ? 'suv' : 'car', [0x2f9e6e, 0x7b52c7, 0x3aa6b9, 0xb9c0c8, 0xe8453c, 0xff8a3d][i], { silly: k }), 18 + (i % 3) * 5, (Math.floor(i / 3) * 2 - 1) * 4 + 6, 0.8));", 20)
    + scene("m5-trees", "W.cam.dist = W.cam.cur = 9; W.cam.pitch = 0.08;" + MO +
            "[0, 1, 2, 3].forEach(k => put(W.treeMesh(k), 14, (k - 1.5) * 5)); [0, 1, 2].forEach(k => put(W.bushMesh(k), 9, (k - 1) * 2.4));", 20)
    + scene("m6-animals", "W.cam.dist = W.cam.cur = 1.6; W.cam.pitch = 0.3;" + MO +
            "[['dog'], ['cat'], ['pigeon'], ['duck'], ['dog', 0x2b2b2b]].forEach((a, i) => { const g = W.animal(a[0], a[1]); W.animate(g, 0, 0.3); put(g, 2.2, (i - 2) * 0.6, 0.5); });", 20)
    + scene("m7-street", "(window.__mo || []).forEach(o => W.scene.remove(o)); window.__mo = []; W.avatar.visible = true; W.cam.dist = W.cam.cur = 14; W.cam.pitch = 0.32; W.cam.yaw += 0.6;", 40)
)

# The long game: the Character, Reputation and Achievements apps, a Legendary drop with its beam, a rare monster.
LONG_SETUP = ("s.m['c1-couch'] = { s: 'done', done: 1 }; s.clock = 11; s.money = 900; s.xp = G.xpAt(14) + 40; const R = G.rpg;"
              "['pinch', 'pinch', 'haggle', 'side', 'side', 'side', 'study', 'feet', 'feet', 'hands', 'smooth', 'smooth', 'dress'].forEach(id => R.learn(id));"
              "for (let q of [3, 2, 4, 0, 1, 2, 0, 3]) R.add(R.make(q, 14), 'test'); s.counters.bonks = 140; s.counters.helped = 30; s.counters.flirts = 20; s.counters.spent = 1500;"
              "s.rpg.rested = 260; R.questDone(G.D.MISSIONS.find(x => x.ch === 4)); G.stepSim(130);"
              "const q = W.randomWalkSpot(0, 0, 30, 200, (x, z, sg) => sg.car && sg.w >= 11) || W.nearestWalk(0, 0, 200); W.teleport(q.x, q.z, q.yaw); W.cam.pitch = 0.2;")
LONG = (
    scene("l1-character", LONG_SETUP + " G.ui.phone('hero');", 40, 2500)
    + scene("l2-talents", "G.ui.phone('hero'); const b = document.querySelector('[data-pbody]'); const t = b.querySelector('.cft-branch'); if (t) b.scrollTop = t.offsetTop - 20;", 3, 1500)
    + scene("l3-reputation", "G.ui.phone('rep');", 3, 1500)
    + scene("l4-achievements", "G.ui.phone('ach');", 3, 1500)
    + scene("l5-legendary", "G.ui.closeAll(); W.cam.dist = W.cam.cur = 7; G.rpg.add(G.rpg.make(5, 15), 'test');", 8, 700)
    + scene("l6-rare", "G.ui.closeAll(); window.CFT_TEST.calm = false; const m = G.rpg.spawnRare(G.D.RPG.RARES[1]); window.CFT_TEST.calm = true; if (m) look(m.x, m.z, 6, 0.15);", 6, 900)
    + scene("l7-levelup", "G.ui.closeAll(); for (const m of G.fun.monsters) m.t = 9999; G.addXp(G.xpAt(G.level() + 1) - s.xp + 5, 'quest'); W.cam.dist = W.cam.cur = 8; W.cam.pitch = 0.25;", 6, 600)
)

# Combat: the 15 monster types in a row, a metro guardian, a fight with the health and foe bars, loot gear on you.
MONSTERS = (
    scene("c1-lineup", "s.m['c1-couch'] = { s: 'done', done: 1 }; s.clock = 11; const home = G.homeSpot(); const q = W.randomWalkSpot(home.x, home.z, 150, 260, (x, z, sg) => sg.car && sg.w >= 11) || W.nearestWalk(home.x, home.z, 200); W.teleport(q.x, q.z, q.yaw);"
          "G.stepSim(200); W.cam.pitch = 0.12; W.cam.dist = W.cam.cur = 3; const f = { x: -Math.sin(W.cam.yaw), z: -Math.cos(W.cam.yaw) };"
          "Object.keys(G.D.MONSTERS).forEach((k, i) => { const row = i < 8 ? 0 : 1, col = (i < 8 ? i - 3.5 : i - 11) * 2.1, dd = 9 + row * 4.5; const m = G.fun.spawnMonster(k, p.x + f.x * dd + f.z * col, p.z + f.z * dd - f.x * col, { event: 600, aggro: 0, lvl: 1 }); m.obj.rotation.y = W.cam.yaw; m.wanderA = 0; });"
          "W.avatar.visible = false;", 2, 1500)
    + scene("c2-guardian", "for (const m of G.fun.monsters.slice()) { m.t = 1e9; m.event = 1; } G.stepSim(3); const mt = W.places.filter(x => x.kind === 'metro' && !x.virtual && !G.fun.metroOpen(x)).sort((a, b) => Math.hypot(a.pin.x - p.x, a.pin.z - p.z) - Math.hypot(b.pin.x - p.x, b.pin.z - p.z))[0];"
            "if (mt) { const w = W.nearestWalk(mt.pin.x + 14, mt.pin.z + 6, 30) || { x: mt.pin.x + 14, z: mt.pin.z }; W.teleport(w.x, w.z); window.CFT_TEST.calm = false; for (let i = 0; i < 20 && !G.fun.guards.has(mt.id); i++) G.stepSim(15); window.CFT_TEST.calm = true; const g = G.fun.guards.get(mt.id); if (g) { g.aggro = 0; look(g.x, g.z, 9, 0.18); } }", 3, 1500)
    + scene("c3-fight", "for (const m of G.fun.monsters.slice()) { m.t = 1e9; m.event = 1; } G.stepSim(3); W.avatar.visible = true; const f = { x: -Math.sin(W.player.face), z: -Math.cos(W.player.face) };"
            "for (let i = 0; i < 3; i++) G.fun.spawnMonster('gargoyle', p.x + f.x * (3 + i) + f.z * (i - 1) * 1.5, p.z + f.z * (3 + i) - f.x * (i - 1) * 1.5, { event: 300, champ: true }); G.fun.hurt(45);"
            "const m0 = G.fun.monsters[G.fun.monsters.length - 1]; W.player.face = W.player.heading = Math.atan2(-(m0.x - p.x), -(m0.z - p.z)); W.controls.enabled = true; G.attack(); look(m0.x, m0.z, 6, 0.25);", 4, 900)
    + scene("c4-gear", "for (const m of G.fun.monsters.slice()) { m.t = 1e9; m.event = 1; } G.stepSim(3); const R = G.rpg; for (const [sl, b] of [['head', 'beanie'], ['body', 'puffer'], ['feet', 'boots'], ['weapon', 'w_guitar']]) { const it = R.add(R.makeGear(4, 12, sl, { base: b }), 'test'); R.equip(it.id); }"
            "W.showOff = true; W.cam.pitch = 0.1;", 40, 2000)
    + scene("c5-character", "W.showOff = false; G.ui.phone('hero');", 3, 1500)
)

# The main character update (2026-11-17): the new graphics, a wind-up + parry, the hype on screen, an outpost, a wreck,
# mission letters, the night with lamp halos.
HERO = (
    scene("h1-street", "s.m['c1-couch'] = { s: 'done', done: 1 }; s.money = 400; s.clock = 10.2;"
          "const q = W.randomWalkSpot(0, 0, 40, 220, (x, z, sg) => sg.car && sg.w >= 10) || W.nearestWalk(0, 0, 200); W.teleport(q.x, q.z, q.yaw); W.cam.pitch = 0.3; W.cam.dist = W.cam.cur = 13;", 400)
    + scene("h2-parry", "const R = G.rpg, it = R.add(R.makeGear(4, 8, 'hand', { base: 'lid' }), 'test'); R.equip(it.id); const f = { x: -Math.sin(W.player.face), z: -Math.cos(W.player.face) };"
            "const m = F.spawnMonster('brute', p.x + f.x * 2.6, p.z + f.z * 2.6, { event: 300, lvl: 1 }); F.windUp(m); m.wind = 0.2; m.windT = 0.9; F.setBlock(true); window.__m = m;"
            "W.cam.yaw = W.player.face + 1.9; W.cam.pitch = 0.22; W.cam.dist = W.cam.cur = 6;", 4, 600)
    + scene("h3-hype", "F.setBlock(false); for (const m of F.monsters.slice()) { m.t = 1e9; m.event = 1; } G.stepSim(3); s.settings.hype = 'max'; G.hero.test.swag(120);"
            "G.hero.word('UNSTOPPABLE!', 'violet', '5 in a row'); G.hero.ticker('You look like a movie star today, {name}!', 'Maya', '😘'); G.hero.ticker('Hero of the neighbourhood, right there!', 'Omar', '🌟');"
            "W.cam.pitch = 0.18; W.cam.dist = W.cam.cur = 7;", 3, 900)
    + scene("h4-outpost", "const op = near(W.places.filter(q => G.D.OUTPOSTS[q.kind]), q => q.pin); if (op) { const w = W.nearestWalk(op.pin.x + 16, op.pin.z + 10, 40) || op.pin; W.teleport(w.x, w.z);"
            "window.CFT_TEST.calm = false; for (let i = 0; i < 6 && !G.hero.test.packs.has(op.id); i++) G.stepSim(35); window.CFT_TEST.calm = true; for (const m of F.monsters) m.aggro = 0; look(op.pin.x, op.pin.z, 10, 0.2); }", 30)
    + scene("h5-wreck", "for (const m of F.monsters.slice()) { m.t = 1e9; m.event = 1; } G.stepSim(3); let pc = null; for (let r = 2; r < 160 && !pc; r += 3) for (let a = 0; a < 6.28 && !pc; a += 0.4) pc = W.borrowable(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, 1.5);"
            "if (pc) { W.teleport(pc.x + 6 * pc.uz + 3 * pc.ux, pc.z - 6 * pc.ux + 3 * pc.uz); for (let i = 0; i < 6; i++) F.smashProp(pc.prop, 99, { x: 0, z: 1 }, false); look(pc.x, pc.z, 7, 0.2); }", 12, 500)
    + scene("h6-blips", "G.rt.actorTimer = 0; G.stepSim(10); const sp = near([...(G.rt.spots || new Map()).values()].filter(x => x.open && x.open.length), q => q); if (sp) { look(sp.x, sp.z, 9, 0.12); W.cam.yaw += 0.25; }", 20)
    + scene("h7-night", "s.clock = 22.4; const q = W.randomWalkSpot(p.x, p.z, 30, 200, (x, z, sg) => sg.car && sg.w >= 9) || p; W.teleport(q.x, q.z, q.yaw); W.cam.pitch = 0.22; W.cam.dist = W.cam.cur = 11;", 200)
    + scene("h8-phone", "G.ui.phone('street');", 5, 1500)
)

# Ground photo textures (2026-11-17): waits for the texture array, then roads/pavements, a lawn, a plaza, woods/sand, overview, dusk.
AREA_SHOT = "const a = W.findArea(%s, %d); if (a) { W.teleport(a.x, a.z); } W.cam.pitch = %s; W.cam.dist = W.cam.cur = %d;"
GROUND = (
    [{"waitFor": "window.__cft.W.groundTextures === true", "timeout": 60000}]
    + scene("g1-pavement", "s.m['c1-couch'] = { s: 'done', done: 1 }; s.clock = 11;"
            "const q = W.randomWalkSpot(0, 0, 30, 200, (x, z, sg) => sg.car && sg.w >= 10) || W.nearestWalk(0, 0, 200); W.teleport(q.x, q.z, q.yaw + 0.9); W.cam.pitch = 0.42; W.cam.dist = W.cam.cur = 6;", 200)
    + scene("g2-road-above", "W.cam.pitch = 1.05; W.cam.dist = W.cam.cur = 16;", 20)
    + scene("g3-lawn", AREA_SHOT % ("['park', 'grass', 'pitch', 'cemetery']", 1500, "0.34", 8), 60)
    + scene("g4-plaza", AREA_SHOT % ("['plaza']", 150, "0.4", 8), 60)
    + scene("g5-wood-sand", AREA_SHOT % ("['wood', 'sand', 'playground']", 100, "0.4", 8), 60)
    + scene("g6-overview", "const q = W.nearestWalk(0, 0, 200); W.teleport(q.x, q.z, q.yaw); W.cam.pitch = 0.75; W.cam.dist = W.cam.cur = 38;", 60)
    + scene("g7-dusk", "s.clock = 19.2; W.cam.pitch = 0.3; W.cam.dist = W.cam.cur = 9;", 60)
    + scene("g8-street-name", "s.clock = 12; const pp = W.player.pos, q = W.nameSpots.slice().sort((a, b) => Math.hypot(a.x - pp.x, a.z - pp.z) - Math.hypot(b.x - pp.x, b.z - pp.z))[0];"
            " if (q) W.teleport(q.x + q.uz * 4, q.z - q.ux * 4, Math.atan2(-q.uz, q.ux)); W.cam.pitch = 0.95; W.cam.dist = W.cam.cur = 18; console.log('[label] ' + (q ? q.n : 'none') + ' of ' + W.nameSpots.length);", 80)
)

# Boroughs (2026-11-17): a street in the home borough, a street in the next one (its banner showing), from above, the map.
BORO_WAIT = [{"waitFor": "window.__cft.W.districts().length > 0", "timeout": 60000}, {"wait": 1500}]
BORO_O = "const ds = W.districts(), home = W.districtAt(0, 0), o = ds.filter(d => d.c !== 'city' && d.n !== home.n).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[%d];"
# first a jump to the borough's centre (its streets load while the scene waits), then onto a street there
BORO_GO = ("const ds = W.districts(), home = W.districtAt(0, 0), o = ds.filter(d => d.c !== 'city' && d.n !== home.n).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[%d];"
           "const q = W.randomWalkSpot(o.x, o.z, 0, 300, (x, z, sg) => sg.car && sg.w >= 9) || W.nearestWalk(o.x, o.z, 400) || o; W.teleport(q.x, q.z, q.yaw);")
def boro_jump(i):
    return [{"eval": "(() => { const G = window.__cft, W = G.W; " + BORO_O % i + " W.teleport(o.x, o.z); return o.n; })()"}, {"wait": 9000}]
BOROSHOTS = BORO_WAIT + (
    scene("b1-home", "s.m['c1-couch'] = { s: 'done', done: 1 }; s.clock = 11; const q = W.randomWalkSpot(0, 0, 30, 200, (x, z, sg) => sg.car && sg.w >= 9) || W.nearestWalk(0, 0, 200); W.teleport(q.x, q.z, q.yaw); W.cam.pitch = 0.22; W.cam.dist = W.cam.cur = 10;", 400)
    + boro_jump(0) + scene("b2-next", BORO_GO % 0 + " W.cam.pitch = 0.22; W.cam.dist = W.cam.cur = 10;", 500, 3500)
    + scene("b3-next-above", "W.cam.pitch = 0.75; W.cam.dist = W.cam.cur = 45;", 30)
    + boro_jump(1) + scene("b4-third", BORO_GO % 1 + " W.cam.pitch = 0.22; W.cam.dist = W.cam.cur = 10;", 500, 3500)
    + scene("b5-map", "G.ui.phone('map');", 5, 2000)
)

# The chaos update (2026-11-18): decor, the Dex line-up, toys, the sky, a jetpack, a ranged fight, the HUD, the phone, night
CHAOS_PRE = "const C = G.chaos; s.m['c1-couch'] = { s: 'done', done: 1 }; s.money = 5000; s.clock = 11.5; window.CFT_TEST.calm = true;"
CHAOS = (
    scene("c1-street", CHAOS_PRE + "const q = W.randomWalkSpot(0, 0, 40, 260, (x, z, sg) => sg.t === 'residential' && sg.w >= 7) || W.nearestWalk(0, 0, 200); W.teleport(q.x, q.z, q.yaw); W.cam.pitch = 0.3; W.cam.dist = W.cam.cur = 13;", 300)
    + scene("c2-park", CHAOS_PRE + "const a = W.findArea(['park', 'grass', 'playground', 'plaza'], 1500) || { x: 0, z: 0 }; W.teleport(a.x, a.z); W.cam.pitch = 0.5; W.cam.dist = W.cam.cur = 24;", 300)
    + scene("c3-dex", CHAOS_PRE + "const q = W.randomWalkSpot(0, 0, 40, 260, (x, z, sg) => sg.car && sg.w >= 10) || W.nearestWalk(0, 0, 200); W.teleport(q.x, q.z, q.yaw); const fx = -Math.sin(q.yaw), fz = -Math.cos(q.yaw), sx = -fz, sz = fx;"
          "CFT_DATA.CHAOS.BRAINROT.forEach((b, i) => { const r = C.spawnRot(b.id, p.x + fx * 9 + sx * (i - 5.5) * 2.4, p.z + fz * 9 + sz * (i - 5.5) * 2.4); r.wait = 99; r.life = 999; r.tx = r.x; r.tz = r.z; r.obj.rotation.y = q.yaw + Math.PI; });"
          "CFT_DATA.CHAOS.CRITTERS.forEach((b, i) => { const c = C.spawnCritter(b.id, p.x + fx * 5 + sx * (i - 3.5) * 1.8, p.z + fz * 5 + sz * (i - 3.5) * 1.8); c.d = Object.assign({}, c.d, { speed: 0, flee: 0, follow: false }); c.obj.rotation.y = q.yaw + Math.PI; });"
          "W.cam.pitch = 0.18; W.cam.dist = W.cam.cur = 6;", 20)
    + scene("c4-toys", CHAOS_PRE + "for (const r of C.rot.slice()) { r.life = 0; } for (const c of C.critters.slice()) c.x += 500; const q = W.randomWalkSpot(0, 0, 60, 300, (x, z, sg) => sg.car && sg.w >= 10) || W.nearestWalk(0, 0, 200); W.teleport(q.x, q.z, q.yaw); const fx = -Math.sin(q.yaw), fz = -Math.cos(q.yaw), sx = -fz, sz = fx;"
          "C.spawnPinata(p.x + fx * 8 - sx * 4, p.z + fz * 8 - sz * 4, q.yaw + 1.2); C.spawnBall(p.x + fx * 5 + sx * 2, p.z + fz * 5 + sz * 2); C.spawnHole(p.x + fx * 6, p.z + fz * 6); C.spawnCushion(p.x + fx * 3 - sx * 1.5, p.z + fz * 3 - sz * 1.5); C.spawnTube(p.x + fx * 9 + sx * 5, p.z + fz * 9 + sz * 5); C.spawnTube(p.x + fx * 12 - sx * 6, p.z + fz * 12 - sz * 6);"
          "W.cam.pitch = 0.2; W.cam.dist = W.cam.cur = 7;", 30)
    + scene("c5-sky", CHAOS_PRE + "const fx = -Math.sin(W.player.face), fz = -Math.cos(W.player.face), sx = -fz, sz = fx, g = W.groundAt(p.x, p.z); C.spawnSky('blimp', p.x + fx * 70 - sx * 25, g + 34, p.z + fz * 70 - sz * 25); C.spawnSky('balloon', p.x + fx * 45 + sx * 22, g + 26, p.z + fz * 45 + sz * 22); C.spawnSky('whale', p.x + fx * 110 + sx * 10, g + 48, p.z + fz * 110 + sz * 10); C.spawnSky('balloon', p.x + fx * 60 + sx * 45, g + 38, p.z + fz * 60 + sz * 45);"
          "W.cam.pitch = -0.12; W.cam.dist = W.cam.cur = 6;", 10)
    + scene("c6-jetpack", CHAOS_PRE + "s.owned.jetpack = true; G.wearShop('jetpack'); W.input.jump = true; W.input.hold = true; G.stepSim(40); W.input.hold = false; W.cam.pitch = 0.1; W.cam.dist = W.cam.cur = 7;", 4)
    + scene("c7-fight", CHAOS_PRE + "W.input.hold = false; for (let i = 0; i < 120 && !W.player.grounded; i++) G.stepSim(1); s.owned.w_tshirt = true; s.equip.weapon = 'w_tshirt'; G.rpg.unequip('weapon'); const fx = -Math.sin(W.player.face), fz = -Math.cos(W.player.face), sx = -fz, sz = fx;"
          "const a = G.fun.spawnMonster('tomato', p.x + fx * 9 - sx * 3, p.z + fz * 9 - sz * 3, { event: 300 }), b = G.fun.spawnMonster('gull', p.x + fx * 6 + sx * 3, p.z + fz * 6 + sz * 3, { event: 300 }), c = G.fun.spawnMonster('spitter', p.x + fx * 12 + sx * 1, p.z + fz * 12 + sz * 1, { event: 300 }), d = G.fun.spawnMonster('wifi', p.x + fx * 10 + sx * 6, p.z + fz * 10 + sz * 6, { event: 300 });"
          "for (const m of [a, b, c, d]) m.stun = 2; G.stepSim(12); for (let i = 0; i < 9; i++) C.add('smash'); G.attack(); G.stepSim(4); c.rcd = 0; W.cam.pitch = 0.22; W.cam.dist = W.cam.cur = 9;", 8)
    + scene("c8-phone", CHAOS_PRE + "s.chaos.dex.sharkini = 1; s.chaos.dex.capy = 1; s.chaos.dex.frog = 2; s.chaos.dex.toiletto = 1; G.ui.phone('chaos');", 3, 2000)
    + scene("c9-night", CHAOS_PRE + "G.ui.closeAll(); s.clock = 23; const a = W.findArea(['park', 'grass', 'plaza'], 800) || { x: 0, z: 0 }; W.teleport(a.x, a.z); G.fun.spawnMonster('wifi', a.x + 5, a.z - 6, { event: 300 }); C.spawnRot('lampo', a.x - 3, a.z - 7); W.cam.pitch = 0.3; W.cam.dist = W.cam.cur = 14;", 60)
)

# The campaign update (2026-11-18): the new HUD, the opening, a MEGA figment, fire, a secret in a gap, a roof, the phone app
CAMP_PRE = "const K = G.camp; s.m['c1-couch'] = { s: 'done', done: 1 }; s.money = 1234; s.clock = 11.5; window.CFT_TEST.calm = true; window.CFT_TEST.campaign = true; "            "const fx = -Math.sin(W.player.face), fz = -Math.cos(W.player.face), sx = -fz, sz = fx;"
CAMPSHOTS = (
    scene("k1-hud", CAMP_PRE + "for (const m of CFT_DATA.MISSIONS.slice(0, 3)) s.m[m.id] = { s: 'done', done: 1 }; G.stepSim(70); const o = G.openMissions()[0]; if (o) G.accept(o); s.owned.w_balloon = true; s.equip.weapon = 'w_balloon'; G.rpg.unequip('weapon'); s.camp.ammo = 14; s.camp.water = 7; s.camp.volt = 3; s.camp.foam = 40;"
          "const q = W.randomWalkSpot(0, 0, 60, 220, (x, z, sg) => sg.car && sg.w >= 9) || W.nearestWalk(0, 0, 200); W.teleport(q.x, q.z, q.yaw); W.cam.pitch = 0.22; G.stepSim(200); G.ui.hud.frame(1);", 2)
    + scene("k2-opening", CAMP_PRE + "window.CFT_TEST.calm = false; s.camp.intro = 'run'; s.camp.left = 247; s.clock = 21.8; document.querySelector('.cft').classList.add('cft-panic'); document.querySelector('.cft-intro').hidden = false; K.test.startStorm(60, true);"
          "for (let i = 0; i < 6; i++) K.spawnFire(p.x + fx * (6 + i * 2) + sx * (i % 2 ? 4 : -4), p.z + fz * (6 + i * 2) + sz * (i % 2 ? 4 : -4), 1.2); W.cam.pitch = 0.3; W.cam.dist = W.cam.cur = 12; G.stepSim(150); G.ui.hud.frame(1);", 2)
    + scene("k3-mega", CAMP_PRE + "window.CFT_TEST.calm = true; s.camp.intro = 'done'; K.test.stopStorm(); for (const m of G.fun.monsters.slice()) G.fun.removeMonster(m); for (const f of K.fires.slice()) K.test.douse(f, 1e9); document.querySelector('.cft').classList.remove('cft-panic'); document.querySelector('.cft-intro').hidden = true; s.clock = 15;"
          "const q = W.randomWalkSpot(0, 0, 80, 260, (x, z, sg) => sg.car && sg.w >= 10) || W.nearestWalk(0, 0, 200); W.teleport(q.x, q.z, q.yaw); const ax = -Math.sin(q.yaw), az = -Math.cos(q.yaw); const m = K.spawnMega(p.x + ax * 30, p.z + az * 30, CFT_DATA.CAMPAIGN.MEGA[0]); m.cd = 99; G.stepSim(3); m.state = 'dizzy'; m.expose = 30; p.set(m.x - ax * 42, p.y, m.z - az * 42); look(m.x, m.z, 6, -0.38); G.ui.hud.frame(1);", 6)
    + scene("k4-fire", CAMP_PRE + "for (const m of K.megas.slice()) K.test.removeMega(m); const q = W.randomWalkSpot(0, 0, 40, 200, (x, z, sg) => sg.car && sg.w >= 8) || W.nearestWalk(0, 0, 200); W.teleport(q.x, q.z, q.yaw); const ax = -Math.sin(q.yaw), az = -Math.cos(q.yaw);"
          "for (let i = 0; i < 7; i++) K.spawnFire(p.x + ax * (4 + i * 1.6) + az * (i % 3 - 1) * 1.5, p.z + az * (4 + i * 1.6) - ax * (i % 3 - 1) * 1.5, 1.3); G.stepSim(20); s.camp.foam = 100; K.power('foam', true); W.cam.pitch = 0.25; W.cam.dist = W.cam.cur = 8;", 12)
    + scene("k5-secret", CAMP_PRE + "K.power('foam', false); for (const f of K.fires.slice()) K.test.douse(f, 1e9); for (const sb of W.subsNear(p.x, p.z, 260)) if (!K.test.analysed.has(sb)) { K.test.analysed.add(sb); K.analyse(sb); }"
          "const sp = K.spots.slice().sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0]; if (sp) { const ax = -sp.uz, az = sp.ux; const d = Math.min(6, (sp.out || 4) * 0.8); W.teleport(sp.x + ax * d, sp.z + az * d); G.stepSim(20); look(sp.x, sp.z, 5, 0.25); }", 20)
    + scene("k6-roof", CAMP_PRE + "let r = null; for (let d = 6; d < 120 && !r; d += 4) for (let a = 0; a < 6.28 && !r; a += 0.5) { const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d, y = W.roofAt(x, z); if (y != null && y > 8) r = { x, z, y }; } if (r) { p.set(r.x, r.y + 0.5, r.z); W.player.vy = 0; } W.cam.pitch = 0.35; W.cam.dist = W.cam.cur = 10;", 30)
    + scene("k7-phone", CAMP_PRE + "G.ui.phone('camp');", 3, 2000)
)
# The graphics overhaul (2026-11-19): the same spots every run (the street nearest home), close and far, day and night.
GFX = (
    scene("g1-street", "s.m['c1-couch'] = { s: 'done', done: 1 }; s.money = 400; s.clock = 10.5;"
          "const q = W.randomWalkSpot(0, 0, 30, 200, (x, z, sg) => sg.car && sg.w >= 11) || W.nearestWalk(0, 0, 200); W.teleport(q.x, q.z, q.yaw); W.cam.pitch = 0.14; W.cam.dist = W.cam.cur = 8; window.__g1 = q;", 400)
    + scene("g2-facade", "s.clock = 15; const pl = near(W.places.filter(q => q.made && W.signs().has(q.id)), q => q.pin); const dx = pl.pin.x - pl.x, dz = pl.pin.z - pl.z, d = Math.hypot(dx, dz) || 1;"
            "W.teleport(pl.pin.x + dx / d * 3, pl.pin.z + dz / d * 3); look(pl.x, pl.z, 6, -0.12); W.avatar.visible = false;", 120)
    + scene("g3-facade-angle", "W.cam.yaw += 0.75; W.cam.pitch = -0.2; W.cam.dist = W.cam.cur = 4;", 20)
    + scene("g4-roofs", "W.avatar.visible = true; s.clock = 11; const q = window.__g1; W.teleport(q.x, q.z, q.yaw); W.cam.pitch = 0.75; W.cam.dist = W.cam.cur = 34;", 60)
    + scene("g5-cars", "s.clock = 13; const n = near(W.signals(), q => q), e = n.ends.slice().sort((a, b) => b.sg.w - a.sg.w)[0], sg = e.sg, k = e.end === 1 ? 1 : -1;"
            "const ux = (sg.x2 - sg.x1) / sg.L * k, uz = (sg.z2 - sg.z1) / sg.L * k, b = Math.min(14, sg.L * 0.9); W.teleport(n.x + ux * b + uz * 3, n.z + uz * b - ux * 3); look(n.x, n.z, 6, 0.1);", 160)
    + scene("g6-you", "s.clock = 11; const q = window.__g1; W.teleport(q.x, q.z, q.yaw); W.cam.pitch = 0.1; W.showOff = true;", 200)
    + scene("g7-dusk", "W.showOff = false; s.clock = 19.2; W.cam.pitch = 0.3; W.cam.dist = W.cam.cur = 14;", 40)
    + scene("g8-night", "s.clock = 22.5; W.cam.pitch = 0.12; W.cam.dist = W.cam.cur = 8; W.cam.yaw += 1.2;", 60)
    + scene("g9-figments", "s.clock = 12; const f = { x: -Math.sin(W.player.face), z: -Math.cos(W.player.face) };"
            "['slime', 'raccoon', 'brute', 'gargoyle', 'sock', 'spitter', 'worm', 'pigeon', 'wisp'].forEach((k, i) => F.spawnMonster(k, p.x + f.x * (7 + (i % 3) * 2.5) + f.z * (i - 4) * 1.9, p.z + f.z * (7 + (i % 3) * 2.5) - f.x * (i - 4) * 1.9, { event: 300 }));"
            "look(p.x + f.x * 8, p.z + f.z * 8, 9, 0.12); window.__models = Object.keys(W.monModels || {}).length; console.log('models loaded', window.__models);", 10)
)


# The aim update (2026-11-19): the sight on a wall, the web pulling, a 360° swing, a rainbow guide, the Dex gallery
AIM_PRE = "const A = G.aim, K = G.camp; s.m['c1-couch'] = { s: 'done', done: 1 }; s.clock = 11.5; window.CFT_TEST.calm = true;"           "const wallSetup = () => { for (const b of W.buildingsNear(p.x, p.z, 200).filter(b => b.base != null && b.h >= 8 && b.area > 150)) { const q = b.p, n = q.length / 2; for (let i = 0, k = n - 1; i < n; k = i++) { const x1 = q[2 * k], z1 = q[2 * k + 1], x2 = q[2 * i], z2 = q[2 * i + 1], L = Math.hypot(x2 - x1, z2 - z1); if (L < 10) continue; const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2; let nx = (z2 - z1) / L, nz = -(x2 - x1) / L; if (W.roofAt(mx + nx * 1.5, mz + nz * 1.5) != null) { nx = -nx; nz = -nz; } let open = true; for (let t = 1.5; t < 17; t += 1) if (W.roofAt(mx + nx * t, mz + nz * t) != null) open = false; if (open) return { mx, mz, nx, nz }; } } return null; };"
AIMSHOTS = (
    scene("a1-sight-web", AIM_PRE + "const w = wallSetup(); window.__w = w; W.teleport(w.mx + w.nx * 16, w.mz + w.nz * 16); G.stepSim(10); look(w.mx, w.mz, 7.5, -0.05); A.select('web'); A.setAim(true); G.stepSim(12); A.test.aimTick(); G.ui.hud.frame(1);", 2)
    + scene("a2-web-pull", AIM_PRE + "A.test.aimTick(); A.fire(true); G.stepSim(9); A.setAim(false); G.rt.slowmo = 30; G.rt.slowK = 0.02;", 0)
    + scene("a3-swing-360", AIM_PRE + "G.rt.slowmo = 0; W.tether = null; W.player.climb = null; const q = W.randomWalkSpot(0, 0, 40, 200, (x, z, sg) => sg.car && sg.w >= 9) || W.nearestWalk(0, 0, 200); W.teleport(q.x, q.z, q.yaw); G.stepSim(30); s.owned.w_tether = 1; G.wearShop('w_tether'); G.stepSim(60); W.cam.pitch = 0.6; W.cam.dist = W.cam.cur = 9; G.stepSim(3); G.attack(); G.rt.slowmo = 30; G.rt.slowK = 0.01;", 0)
    + scene("a4-rainbow-guide", AIM_PRE + "G.rt.slowmo = 0; G.stepSim(30); const fx = -Math.sin(W.player.face), fz = -Math.cos(W.player.face); const m = F.spawnMonster('brute', p.x + fx * 34, p.z + fz * 34, { event: 300 }); m.aggro = 0; A.test.guideCd = 0; W.cam.pitch = 0.55; W.cam.dist = W.cam.cur = 11; G.stepSim(26); G.rt.slowmo = 30; G.rt.slowK = 0.03;", 0)
    + scene("a5-dex", AIM_PRE + "G.rt.slowmo = 0; const ids = CFT_DATA.CHAOS.CRITTERS.slice(0, 5).map(c => c.id).concat([CFT_DATA.CHAOS.BRAINROT[0].id]); s.chaos.dex = {}; ids.forEach((id, i) => s.chaos.dex[id] = i + 1); G.ui.phone('dex');", 2)
)

# The stunt update (2026-11-19): ramps and rings of fire that pop up when you get in a car
STUNT_PRE = "G.rt.slowmo = 0; const St = G.stunt, TS = CFT_DATA.TUNE.stunt; s.m['c1-couch'] = { s: 'done', done: 1 }; s.clock = 11.5; window.CFT_TEST.calm = true; s.owned.car = true;"             "const findC = (kind) => { for (let i = 0; i < 400; i++) { const q = W.randomWalkSpot(p.x, p.z, 10, 420, (x, z, sg) => sg.car && sg.w >= 7 && !sg.br && sg.L >= 30); if (!q) continue; const ux = -Math.sin(q.yaw), uz = -Math.cos(q.yaw); const c = St.spawn(kind, q.x, q.z, ux, uz) || St.spawn(kind, q.x, q.z, -ux, -uz); if (c) return c; } return null; };"             "const fly = (c, frac, fn) => { G.ui.closeAll(); G.rt.busy = false; W.controls.enabled = true; const r = c.ramp; W.teleport(r.x - c.ux * 32, r.z - c.uz * 32, Math.atan2(-c.ux, -c.uz)); G.stepSim(3); W.input.f = 1; for (let i = 0; i < 160 && !W.carAir(); i++) G.stepSim(1); W.input.f = 0; const a = W.carAir(); if (a && fn) fn(a); const tA = r.vy / (W.GRAV * TS.airG); G.stepSim(Math.max(1, Math.round(tA * frac * 30))); };"             "const side = (c, back, up, off) => { const nx = -c.uz, nz = c.ux; W.cam.yaw = Math.atan2(nx * (off || 1), nz * (off || 1)) + (back || 0); W.cam.pitch = up == null ? 0.12 : up; W.cam.dist = W.cam.cur = 16; W.cam.lookT = performance.now() + 1e6; };"
STUNTSHOTS = (
    scene("s1-pop-up", STUNT_PRE + "G.setRide(null); G.stepSim(10); const q = W.randomWalkSpot(0, 0, 20, 160, (x, z, sg) => sg.car && sg.w >= 9) || W.nearestWalk(0, 0, 200); W.teleport(q.x, q.z, q.yaw); G.setRide('car'); G.stepSim(9); W.cam.pitch = 0.5; W.cam.dist = W.cam.cur = 30;", 0)
    + scene("s2-ring-of-fire", STUNT_PRE + "TS.count = 0; G.stepSim(25); for (const c of St.courses.slice()) St.test.drop(c); const c = findC('ramp'); window.__sc = c; G.stepSim(25); fly(c, 1.0); side(c, 0.35, 0.05); G.rt.slowmo = 30; G.rt.slowK = 0.004;", 0)
    + scene("s3-backflip", STUNT_PRE + "const c = window.__sc; G.stepSim(30); fly(c, 0.9, a => { G.stepSim(3); a.pitch = 2.2; a.pv = 0; }); W.player.carAir && (W.player.carAir.pv = 0); side(c, -0.2, 0.1); G.rt.slowmo = 30; G.rt.slowK = 0.004;", 0)
    + scene("s4-mega", STUNT_PRE + "for (const c of St.courses.slice()) St.test.drop(c); G.stepSim(5); const c = findC('mega') || findC('ramp'); window.__sc = c; G.stepSim(25); fly(c, 1.45, a => { a.rollTo = 6.28; }); side(c, 0.5, 0.15); G.rt.slowmo = 30; G.rt.slowK = 0.004;", 0)
    + scene("s5-fire-alley", STUNT_PRE + "for (const c of St.courses.slice()) St.test.drop(c); G.stepSim(5); let c = null; for (let i = 0; i < 400 && !c; i++) { const q = W.randomWalkSpot(p.x, p.z, 10, 420, (x, z, sg) => sg.car && sg.w >= 7 && sg.L >= 50); if (q) c = St.spawn('alley', q.x, q.z, -Math.sin(q.yaw), -Math.cos(q.yaw)); } G.stepSim(25); W.teleport(c.x - c.ux * 14, c.z - c.uz * 14, Math.atan2(-c.ux, -c.uz)); G.ui.closeAll(); W.controls.enabled = true; W.input.f = 1; G.stepSim(18); W.input.f = 0; W.cam.pitch = 0.18; W.cam.dist = W.cam.cur = 11; G.rt.slowmo = 30; G.rt.slowK = 0.004;", 0)
    + scene("s6-phone", STUNT_PRE + "TS.count = 7; G.ui.phone('stunt');", 3, 2000)
)

# Voiced cinematic missions (2026-11-20): a scene is started without waiting for it and held (CFT_TEST.cineHold: only
# clicks move it on, software rendering is far too slow for its timing), then photographed at each moment
CINE_PRE = "if (G.cine) G.cine.skip(); window.CFT_TEST.cine = true; window.CFT_TEST.cineHold = true; s.clock = 17.2; for (const id of G.activeMissions()) G.abandon(id); const home = G.homeSpot(); W.teleport(home.x + 3, home.z + 2); G.stepSim(40);" \
           "const mx = [...G.rt.actors.values()].find(a => a.who === 'max'); if (mx) W.teleport(mx.obj.position.x + 1.5, mx.obj.position.z + 0.4); G.stepSim(3); const M = CFT_DATA.MISSIONS[0];"
CINE_PLAY = "G.cine.play({ who: 'max', raw: M.intro, kind: 'intro', m: M, actor: mx && mx.obj, vplace: CFTCine.introPlace(M, CFT_DATA), ctx: { place: CFTCine.introPlace(M, CFT_DATA) }%s });"
NEXT = {"eval": "(() => { const w = document.querySelector('.cft-cine-wrap'); if (w) w.click(); return 'next'; })()"}


def cine_at(name, cond, settle=2500):
    return [{"waitFor": cond, "timeout": 30000}, {"wait": settle}, {"shot": name}]


SUB_ON = "(() => { const s = document.querySelector('[data-csub]'); return s && !s.hidden; })()"
CINESHOTS = (
    scene("c0-setup", CINE_PRE + CINE_PLAY % ", chapter: CFT_DATA.CHAPTERS[0]", 2, 200)[:-1]
    + cine_at("c1-chapter-card", "document.querySelector('.cft-cine-card.chapter.in')")
    + [NEXT] + cine_at("c2-title-card", "document.querySelector('.cft-cine-card.title.in')")
    + [NEXT] + cine_at("c3-close-up", SUB_ON, 3500)
    + [{"eval": "(() => { window.__t = document.querySelector('[data-ctext]').textContent; return 'mark'; })()"}, NEXT]
    + cine_at("c4-over-the-shoulder", "document.querySelector('[data-ctext]') && document.querySelector('[data-ctext]').textContent !== window.__t", 3500)
    + [{"eval": "(() => { window.__t = document.querySelector('[data-ctext]').textContent; return 'mark'; })()"}, NEXT]
    + cine_at("c5-third-shot", "document.querySelector('[data-ctext]') && document.querySelector('[data-ctext]').textContent !== window.__t", 3500)
    + scene("c6-setup", CINE_PRE + "W.teleport(home.x + 70, home.z + 60); G.stepSim(5); G.cine.play({ who: 'sam', raw: ['Sam (in a text): Happy anniversary!! Don\\'t you dare forget.'], kind: 'say', m: CFT_DATA.MISSIONS.find(x => x.giver === 'sam') });", 2, 200)[:-1]
    + cine_at("c6-phone-call", "document.querySelector('.cft-cine-call.in')", 3500)
    + scene("c7-setup", CINE_PRE + "G.cine.play({ who: 'max', raw: [M.outro[0]], kind: 'outro', m: M, actor: mx && mx.obj });", 2, 200)[:-1]
    + cine_at("c7-outro-line", SUB_ON, 3000)
    + [NEXT] + cine_at("c8-mission-complete", "document.querySelector('.cft-cine-card.stamp.in')", 2000)
)
if evalfile:
    steps = START + [{"eval": evalfile}, {"wait": 1500}, {"shot": "eval"}]
elif "--campshots" in flags:
    steps = START + CAMPSHOTS
elif "--aimshots" in flags:
    steps = START + AIMSHOTS
elif "--stuntshots" in flags:
    steps = START + STUNTSHOTS
elif "--cineshots" in flags:
    steps = START + CINESHOTS
elif "--chaosshots" in flags:
    steps = START + CHAOS
elif "--boroshots" in flags:
    steps = START + BOROSHOTS
elif "--shots" in flags:
    steps = START + SCENES
elif "--ground" in flags:
    steps = START + GROUND
elif "--people" in flags:
    steps = START + PEOPLE
elif "--models" in flags:
    steps = START + MODELS
elif "--gfx" in flags:
    steps = START + GFX
elif "--long" in flags:
    steps = START + LONG
elif "--monsters" in flags:
    steps = START + MONSTERS
elif "--heroshots" in flags:
    steps = START + HERO
else:
    steps = START + [{"shot": "start"}]
    if "--combat" in flags:
        steps += script("combattest.js", "__cmbDone", "__cmbOut", 500000)
    elif "--hero" in flags:
        steps += script("herotest.js", "__heroDone", "__heroOut", 600000)
    elif "--rpg" in flags:
        steps += script("rpgtest.js", "__rpgDone", "__rpgOut", 500000)
    elif "--boro" in flags:
        steps += script("borotest.js", "__boroDone", "__boroOut", 300000)
    elif "--chaos" in flags:
        steps += script("chaostest.js", "__chaosDone", "__chaosOut", 600000)
    elif "--camp" in flags:
        steps += script("camptest.js", "__campDone", "__campOut", 900000)
    elif "--wild" in flags:
        steps += script("wildtest.js", "__wildDone", "__wildOut", 900000)
    elif "--aim" in flags:
        steps += script("aimtest.js", "__aimDone", "__aimOut", 600000)
    elif "--stunt" in flags:
        steps += script("stunttest.js", "__stuntDone", "__stuntOut", 600000)
    elif "--cine" in flags:
        steps += script("cinetest.js", "__cineDone", "__cineOut", 300000)
    else:
        if "--fun" not in flags:
            steps += script("gametest.js", "__cftDone", "__cftOut", 500000)
        steps += script("funtest.js", "__funDone", "__funOut", 500000)
        if "--fun" not in flags:
            steps += script("rpgtest.js", "__rpgDone", "__rpgOut", 500000)
            steps += script("combattest.js", "__cmbDone", "__cmbOut", 500000)
            steps += script("herotest.js", "__heroDone", "__heroOut", 600000)
            steps += script("borotest.js", "__boroDone", "__boroOut", 300000)
            steps += script("chaostest.js", "__chaosDone", "__chaosOut", 600000)
            steps += script("camptest.js", "__campDone", "__campOut", 900000)
            steps += script("wildtest.js", "__wildDone", "__wildOut", 900000)
            steps += script("aimtest.js", "__aimDone", "__aimOut", 600000)
            steps += script("stunttest.js", "__stuntDone", "__stuntOut", 600000)
            steps += script("cinetest.js", "__cineDone", "__cineOut", 300000)
    steps += [{"wait": 1500}, {"shot": "after"}]

sf = out / "steps.json"
sf.write_text(json.dumps(steps), encoding="utf-8")
env = dict(__import__("os").environ, WINDOW=__import__("os").environ.get("WINDOW", "1280,800"))
r = subprocess.run(["node", str(HERE / "gldrive.mjs"), "http://127.0.0.1:%d/?fresh=1&music=0&nointro=1" % port + __import__("os").environ.get("CFT_QS", ""), str(sf), str(out)],
                   capture_output=True, text=True, env=env, encoding="utf-8", errors="replace", timeout=3000)
fails = passes = 0
for line in r.stdout.splitlines():
    if line.startswith("[eval] ["):
        for item in json.loads(line[len("[eval] "):]):
            print(item)
            if item.startswith("PASS"):
                passes += 1
            elif not item.startswith("INFO"):
                fails += 1
    elif line.startswith("[eval] ") and ("--shots" in flags or "--ground" in flags or "--people" in flags or "--models" in flags or "--gfx" in flags or "--long" in flags or "--monsters" in flags or "--heroshots" in flags or "--boroshots" in flags or "--chaosshots" in flags or "--campshots" in flags or "--aimshots" in flags or "--stuntshots" in flags or "--cineshots" in flags or evalfile):
        print(line)
    elif any(k in line for k in ("EXCEPTION", "console.error", "TIMEOUT", "EVAL ERROR", "driver error")):
        print(line)
        fails += 1
print("screenshots:", out)
if "--shots" in flags or "--ground" in flags or "--people" in flags or "--models" in flags or "--gfx" in flags or "--long" in flags or "--monsters" in flags or "--heroshots" in flags or "--boroshots" in flags or "--chaosshots" in flags or "--campshots" in flags or "--aimshots" in flags or "--stuntshots" in flags or "--cineshots" in flags or evalfile:
    sys.exit(1 if fails else 0)
print("GAME TEST " + ("PASSED (%d checks)" % passes if not fails and passes else "FAILED (%d)" % fails))
sys.exit(1 if fails or not passes else 0)

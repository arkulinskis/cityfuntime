"""Plays the 3D game in headless Chrome (software WebGL) and prints PASS/FAIL lines. Needs internet (real map tiles).

    python -I tools/live/game_test.py [OUTDIR]            the whole game: gametest.js (missions, shops, turf...) then funtest.js
    python -I tools/live/game_test.py --fun [OUTDIR]      only funtest.js (monsters, weapons, strangers, street folk, pranks, events)
    python -I tools/live/game_test.py --shots [OUTDIR]    no tests: screenshots of the city by day, at dusk and at night
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

if evalfile:
    steps = START + [{"eval": evalfile}, {"wait": 1500}, {"shot": "eval"}]
elif "--shots" in flags:
    steps = START + SCENES
else:
    steps = START + [{"shot": "start"}]
    if "--fun" not in flags:
        steps += script("gametest.js", "__cftDone", "__cftOut", 500000)
    steps += script("funtest.js", "__funDone", "__funOut", 500000)
    steps += [{"wait": 1500}, {"shot": "after"}]

sf = out / "steps.json"
sf.write_text(json.dumps(steps), encoding="utf-8")
env = dict(__import__("os").environ, WINDOW=__import__("os").environ.get("WINDOW", "1280,800"))
r = subprocess.run(["node", str(HERE / "gldrive.mjs"), "http://127.0.0.1:%d/?fresh=1&music=0" % port, str(sf), str(out)],
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
    elif line.startswith("[eval] ") and ("--shots" in flags or evalfile):
        print(line)
    elif any(k in line for k in ("EXCEPTION", "console.error", "TIMEOUT", "EVAL ERROR", "driver error")):
        print(line)
        fails += 1
print("screenshots:", out)
if "--shots" in flags or evalfile:
    sys.exit(1 if fails else 0)
print("GAME TEST " + ("PASSED (%d checks)" % passes if not fails and passes else "FAILED (%d)" % fails))
sys.exit(1 if fails or not passes else 0)

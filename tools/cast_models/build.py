"""City Fun Time's cast models: Actor Troop's characters as real 3D people in the game (2026-11-24).

    python tools/cast_models/build.py            export + slim + portraits + manifest (all characters)
    python tools/cast_models/build.py ava zoe    only these (the manifest keeps the others)
    python tools/cast_models/build.py --manifest rewrite the manifest from what's already in media/public/models/cft

Steps: Godot exports each Actor Troop character (../actor-troop/tools/export_cft.sh: CC0 MakeHuman body + its
procedural clothes and hair, one skinned mesh on the Rig skeleton, rest pose, no animations) -> slim_glb.mjs
(tangents and normal maps off, simplified, quantized: 3-5 MB -> 0.7-1.9 MB) -> APP_MAKER/media/public/models/cft/
<id>-<md5 8>.glb (a changed model gets a new name, so the year-long cache never serves an old one) -> portraits.html
renders a head-and-shoulders portrait of every model (headless Chrome via tools/live/drive.mjs) -> theme/assets/cast-faces.jpg (one strip,
CAST_FACE px per face, in manifest order) -> the `cast-models` block in theme/assets/cft-content.js (D.CAST_MODELS).

Then upload and publish: python -I ../APP_MAKER/media/r2_deploy.py --only=models/cft/ ; python tools/assets.py ; commit.
First time: `npm install` in tools/cast_models (glTF-Transform + meshoptimizer; node_modules is git-ignored).
"""
import hashlib
import http.server
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

HERE = Path(__file__).resolve().parent
APP = HERE.parent.parent
AT = APP.parent / "actor-troop"
MEDIA = APP.parent / "APP_MAKER" / "media" / "public" / "models" / "cft"
CONTENT = APP / "theme" / "assets" / "cft-content.js"
FACES = APP / "theme" / "assets" / "cast-faces.jpg"
CAST_FACE = 160
# which mission giver each Actor Troop character plays (look, gender and voice match the giver's voiced lines)
GIVER = {"grace": "rosa", "marcus": "max", "diego": "dmitri", "ava": "priya", "raj": "okafor", "kenji": "kai",
         "lena": "sam", "nora": "zoe", "zoe": "luna", "otis": "bouchard", "vitalijs": "jay"}
ORDER = ["ava", "diego", "grace", "kenji", "lena", "marcus", "nora", "otis", "raj", "zoe", "vitalijs"]


def bash():
    for p in [r"C:\Program Files\Git\bin\bash.exe", r"C:\Program Files\Git\usr\bin\bash.exe"]:
        if Path(p).exists():
            return p
    return shutil.which("bash") or "bash"


def run(cmd, **kw):
    print("$", " ".join(str(c) for c in cmd))
    r = subprocess.run(cmd, **kw)
    if r.returncode:
        sys.exit("failed: %s" % cmd[0])


def _unused_chrome():
    for p in [r"C:\Program Files\Google\Chrome\Application\chrome.exe", r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
              os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe")]:
        if Path(p).exists():
            return p
    sys.exit("Chrome not found")


def portraits(files, tmp):
    """files: [(id, path)] -> theme/assets/cast-faces.jpg (headless Chrome renders portraits.html)."""
    from PIL import Image
    web = tmp / "web"
    web.mkdir(exist_ok=True)
    for f in ["three.min.js", "three-gltf.js"]:
        shutil.copy(APP / "theme" / "assets" / f, web / f)
    shutil.copy(HERE / "portraits.html", web / "index.html")
    for i, (cid, p) in enumerate(files):
        shutil.copy(p, web / ("m%d.glb" % i))
    (web / "list.json").write_text(json.dumps([cid for cid, _ in files]), encoding="utf-8")
    handler = lambda *a, **k: http.server.SimpleHTTPRequestHandler(*a, directory=str(web), **k)
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    shot = tmp / "shots" / "faces.png"
    n = len(files)
    steps = tmp / "steps.json"
    steps.write_text(json.dumps([{"waitFor": "document.title === 'done'", "timeout": 120000}, {"wait": 300}, {"shot": "faces"}]), encoding="utf-8")
    run(["node", str(APP / "tools" / "live" / "drive.mjs"), "http://127.0.0.1:%d/index.html" % srv.server_address[1], str(steps), str(tmp / "shots")],
        env=dict(os.environ, WINDOW="%d,%d" % (CAST_FACE * n + 40, CAST_FACE + 300)), capture_output=True)
    srv.shutdown()
    im = Image.open(shot).convert("RGB").crop((0, 0, CAST_FACE * n, CAST_FACE))
    im.save(FACES, quality=86, optimize=True)
    print("portraits ->", FACES.relative_to(APP), "(%d faces, %d KB)" % (n, FACES.stat().st_size // 1024))


def manifest():
    cat = json.loads((AT / "catalog.json").read_text(encoding="utf-8"))["characters"]
    have = {p.name.rsplit("-", 1)[0]: p for p in MEDIA.glob("*.glb")}
    rows = []
    for cid in [c for c in ORDER if c in have]:
        c = cat.get(cid, {})
        rows.append("  %s: { n: %s, d: %s, file: %s, h: %s, giver: %s }," % (
            cid, json.dumps(c.get("name", cid.title())), json.dumps(c.get("desc", "")), json.dumps(have[cid].name),
            c.get("height", 1.75), json.dumps(GIVER.get(cid))))
    block = ("// cast-models:start (generated by tools/cast_models/build.py: do not edit by hand)\n"
             "// Actor Troop's characters as real 3D people (2026-11-24): the player can be one of them (Your look); each\n"
             "// plays a mission giver (giver) unless you are that character. Files: <media base>models/cft/<file>.\n"
             "// Faces: cast-faces.jpg, one 160 px portrait per entry in this order.\n"
             "D.CAST_MODELS = {\n" + "\n".join(rows) + "\n};\n// cast-models:end")
    s = CONTENT.read_bytes().decode("utf-8")
    if "// cast-models:start" in s:
        s = re.sub(r"// cast-models:start.*?// cast-models:end", lambda m: block, s, flags=re.S)
    else:
        s = s.replace("D.FRIENDS = [", block + "\nD.FRIENDS = [", 1)
    CONTENT.write_bytes(s.encode("utf-8"))
    print("manifest -> cft-content.js (%d models)" % len(rows))
    return [(cid, have[cid]) for cid in [c for c in ORDER if c in have]]


def main():
    args = sys.argv[1:]
    if args == ["--manifest"]:
        manifest()
        return
    ids = args or ORDER
    MEDIA.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix="cft-cast-"))
    raw, slim = tmp / "raw", tmp / "slim"
    run([bash(), str(AT / "tools" / "export_cft.sh"), raw.as_posix(), *ids])
    env = dict(os.environ, NODE_PATH=str(HERE / "node_modules"))
    run(["node", str(HERE / "slim_glb.mjs"), str(raw), str(slim)], env=env, cwd=str(HERE))
    for cid in ids:
        src = slim / (cid + ".glb")
        if not src.exists():
            print("missing", cid)
            continue
        h = hashlib.md5(src.read_bytes()).hexdigest()[:8]
        for old in MEDIA.glob(cid + "-*.glb"):
            old.unlink()
        shutil.copy(src, MEDIA / ("%s-%s.glb" % (cid, h)))
    files = manifest()
    portraits(files, tmp)
    shutil.rmtree(tmp, ignore_errors=True)
    print("next: python -I ../APP_MAKER/media/r2_deploy.py --only=models/cft/ ; python tools/assets.py")


if __name__ == "__main__":
    main()

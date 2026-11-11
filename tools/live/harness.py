"""A tiny local page that runs the 3D game straight from theme/assets, without Anvil: for the game tests and screenshots.

    python -I tools/live/harness.py [PORT]        (default 8772; Ctrl+C to stop)   ->  http://localhost:8772/

The page loads app.css, ark-music.js and cft-kit.js like the real app, lists the engine files as <meta name="cft-asset">
tags and mounts the game full screen (CFT.mountGame). The server side is faked in the page: a guest (no account), a
map-backup stub that remembers which tiles it was asked to keep. Map tiles come from the real services, so it needs
internet. tools/live/game_test.py starts this by itself.
"""
import http.server
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
ASSETS = ROOT / "theme" / "assets"
ENGINE = ["three.min.js", "cft-content.js", "cft-tiles.js", "cft-world.js", "cft-ui.js", "cft-fun.js", "cft-game.js"]
TYPES = {".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg"}

PAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>City Fun Time: game harness</title>
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="_/theme/app.css?v=%(v)s">
%(metas)s
<style>html, body { margin: 0; height: 100%%; }</style>
</head><body class="ui">
<div class="cft-host"><div class="cft-root" id="root"><div class="cft-loading"><div class="cft-spin">🏙️</div><p>Getting the city ready...</p></div></div></div>
<script src="_/theme/ark-music.js?v=%(v)s"></script>
<script src="_/theme/cft-kit.js?v=%(v)s"></script>
<script>
  // the pretend server: what client_code/cft.py + server_code would answer
  window.HARNESS = { archived: [], calls: [] };
  window.CFT_HOST = { call: function (fn, argsJson) {
    var args = JSON.parse(argsJson || '[]'); window.HARNESS.calls.push(fn);
    if (fn === 'tile_archive') { window.HARNESS.archived = window.HARNESS.archived.concat(args[0]); return JSON.stringify({ result: { have: args[0], full: false } }); }
    if (fn === 'tile_backup') return JSON.stringify({ result: { found: false } });
    return JSON.stringify({ result: { ok: true } });
  } };
  if (/[?&]music=0/.test(location.search) && window.ArkMusic) window.ArkMusic.enabled(false);
  if (/[?&]fresh=1/.test(location.search)) localStorage.removeItem('cityfuntime.save.guest');
  window.CFT_GAME_CTL = CFT.mountGame(document.getElementById('root'), { exit: function () { document.title = 'exited'; }, reload: function () { location.reload(); } });
</script>
</body></html>
"""


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        path = self.path.split("?")[0]
        if path in ("/", "/index.html"):
            v = str(int(max(f.stat().st_mtime for f in ASSETS.glob("*.js"))))
            metas = "\n".join('<meta name="cft-asset" content="_/theme/%s?v=%s">' % (n, v) for n in ENGINE)
            return self.send(200, "text/html; charset=utf-8", (PAGE % {"v": v, "metas": metas}).encode("utf-8"))
        if path.startswith("/_/theme/"):
            f = (ASSETS / path[len("/_/theme/"):]).resolve()
            if ASSETS in f.parents and f.is_file():
                return self.send(200, TYPES.get(f.suffix, "application/octet-stream"), f.read_bytes())
        self.send(404, "text/plain", b"not found")

    def send(self, code, ctype, body):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


def serve(port):
    return http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8772
    print("City Fun Time game harness: http://localhost:%d/  (Ctrl+C to stop)" % port)
    serve(port).serve_forever()

"""Server tests against the strict mock of Anvil (tools/testing/mock).

    python tools/testing/test_server.py          -> prints ALL OK, or the first failure

call(name, ...) runs a server function the way the browser does: by name, with require_user enforced,
and the reply must be JSON (a datetime or a row in a reply fails here, like it would break the page).
Add tests for every new server function: the happy path, bad input, and someone who isn't allowed.
"""
import datetime as dt
import importlib
import json
import os
import pathlib
import shutil
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
PROJECT = HERE.parents[1]
_tmp = pathlib.Path(tempfile.mkdtemp())
shutil.copytree(PROJECT / "server_code", _tmp / "app")
(_tmp / "app" / "__init__.py").write_text("")
os.environ["ANVIL_APP_YAML"] = str(PROJECT / "anvil.yaml")  # the mock's tables follow the app's own schema
sys.path[:0] = [str(HERE / "mock"), str(_tmp)]
import anvil.server  # noqa: E402
import anvil.users  # noqa: E402
from anvil.tables import app_tables as T  # noqa: E402

M = {p.stem: importlib.import_module("app." + p.stem) for p in sorted((PROJECT / "server_code").glob("*.py"))}
now = dt.datetime.now(dt.timezone.utc)


def call(name, *args):
    r = anvil.server.call(name, *args)
    json.dumps(r)  # strict: must be JSON-able
    return r


def as_user(row):
    anvil.users.CURRENT[0] = row
    anvil.server.session.use(row.get_id() if row is not None else None)


def denied(name, *args):
    try:
        call(name, *args)
    except anvil.server.PermissionDenied:
        return True
    return False


def ok(r, msg=""):
    assert isinstance(r, dict) and r.get("ok"), (msg, r)
    return r


def bad(r, msg=""):
    assert isinstance(r, dict) and r.get("ok") is False and r.get("error"), (msg, r)
    return r


def person(email, name=None, **kw):
    return T.users.add_row(email=email, enabled=True, signed_up=now, display_name=name, **kw)


# ---------------------------------------------------------------------------------- accounts
admin = person("arkulinskis@gmail.com", "The Admin")
ana = person("ana@example.com", "Ana")
bob = person("bob@example.com")

as_user(None)
assert call("get_me") is None
assert denied("update_profile", "X")
as_user(admin)
assert call("get_me")["is_admin"] is True, "ADMIN_EMAILS become admins on first sign-in"
as_user(ana)
me = call("get_me")
assert me["name"] == "Ana" and me["is_admin"] is False
assert ana["last_seen"] is not None
as_user(bob)
assert call("get_me")["name"] == "Bob", "a name comes from the email when none is set"
bad(call("update_profile", " x "))
assert ok(call("update_profile", "  Bob   Stone "))["me"]["name"] == "Bob Stone"

# ---------------------------------------------------------------------------------- feedback
as_user(None)
bad(call("submit_feedback", "bug", "hi"))
ok(call("submit_feedback", "bug", "The button is broken", "guest@example.com", {"page": "#home", "evil": "x" * 9999}))
fb = T.feedback.search()[0]
assert fb["name"] == "Guest" and fb["email"] == "guest@example.com" and "evil" not in fb["context"] and fb["status"] == "new"
for i in range(4):
    ok(call("submit_feedback", "idea", "Idea number %d" % i))
bad(call("submit_feedback", "idea", "One too many this hour"), "rate limit")
as_user(ana)
ok(call("submit_feedback", "nonsense-kind", "Signed-in feedback"))
assert T.feedback.get(message="Signed-in feedback")["kind"] == "other"
assert denied("list_feedback")
as_user(admin)
lst = call("list_feedback")
assert lst["counts"]["new"] == 6 and len(lst["items"]) == 6
fid = lst["items"][0]["id"]
ok(call("set_feedback_status", fid, "done", "Fixed it"))
assert call("list_feedback", "done")["items"][0]["note"] == "Fixed it"
bad(call("set_feedback_status", fid, "weird"))
bad(call("set_feedback_status", "nope", "done"))
ok(call("delete_feedback", fid))
assert len(call("list_feedback")["items"]) == 5

# ---------------------------------------------------------------------------------- admin
as_user(ana)
for fn, args in [("admin_overview", ()), ("list_users", ()), ("set_admin", (bob.get_id(), True)), ("demo_load", ()), ("demo_remove", ())]:
    assert denied(fn, *args), fn
as_user(admin)
ov = call("admin_overview")
assert ov["users"] == 3 and ov["admins"] == 1 and ov["feedback_new"] == 5
assert len(call("list_users")["users"]) == 3 and len(call("list_users", "bob")["users"]) == 1
ok(call("set_admin", bob.get_id(), True))
assert bob["is_admin"] is True
bad(call("set_admin", admin.get_id(), False), "can't remove your own admin")
ok(call("set_enabled", bob.get_id(), False))
assert bob["enabled"] is False
bad(call("set_enabled", admin.get_id(), False))
ok(call("set_enabled", bob.get_id(), True))
ok(call("set_admin", bob.get_id(), False))
assert bob["is_admin"] is False

# ---------------------------------------------------------------------------------- demo data, saves, leaderboard
as_user(None)
lb = call("leaderboard")
assert M["DemoData"].state() == "loaded" and lb["players"] == len(M["DemoData"].DEMO_PLAYERS), "demo loads on first visit"
assert lb["worth"][0]["name"] == "Kofi" and lb["level"][0]["name"] == "Kofi" and not any(e["me"] for e in lb["worth"])
assert "@" not in json.dumps(lb), "the leaderboard never shows emails"
assert denied("get_save") and denied("put_save", {}) and denied("reset_save")
as_user(ana)
assert call("get_save")["save"] is None
bad(call("put_save", "nope"))
bad(call("put_save", {"name": "x"}), "missing pieces")
bad(call("put_save", {"home": {}, "xp": 1, "money": 1, "junk": "x" * 500000}), "too big")
sv = M["DemoData"].demo_save("Ana the Magnificent Explorer", 5200, 2840, 44, 1, 2, 0, True, 18, active="c6-luna")
r = ok(call("put_save", sv))
assert r["level"] == M["Game"].level_of(5200) == 12, r
got = call("get_save")["save"]
assert len(got["name"]) <= 20 and got["m"]["c6-luna"]["s"] == "active" and got["biz"]["lemonade"]["lvl"] == 1
mine = [e for e in call("leaderboard")["worth"] if e["me"]]
assert mine and mine[0]["name"].startswith("Ana"), "you see yourself on the board"
sv["money"] = 999999
ok(call("put_save", sv))
assert len(T.saves.search(user=ana)) == 1 and T.saves.get(user=ana)["worth"] >= 999999, "saving again updates, never duplicates"
s2 = M["Game"].summarize({"m": {"c1-couch": {"s": "done"}, "job-3-1": {"s": "done"}}, "turf": {"0_0": {"own": True}, "1_0": {"own": False}},
                          "biz": {"lemonade": {"lvl": 3}}, "money": 10, "apt": {"tier": 4}, "xp": "bad"})
assert s2["missions"] == 1 and s2["turfs"] == 1 and s2["worth"] == 10 + 60 + 30 + 60 + 60000 and s2["level"] == 1, s2
assert denied("admin_players") and denied("admin_set_player", "x", True)
as_user(admin)
ps = call("admin_players")
assert ps["total"] == 7 and len(call("admin_players", "ana")["players"]) == 1
pid = [x for x in ps["players"] if x["email"] == "ana@example.com"][0]["id"]
ok(call("admin_set_player", pid, True, None))
as_user(None)
assert call("leaderboard")["players"] == 6, "hidden players leave the board"
as_user(admin)
ok(call("admin_set_player", pid, False, True))
assert T.saves.get(user=ana)["name"] == "Player" and T.saves.get(user=ana)["data"]["name"] == "Player"
bad(call("admin_set_player", "nope", True))
ok(call("demo_remove"))
assert M["DemoData"].state() == "removed" and call("leaderboard")["players"] == 1, "removing demo data keeps real saves"
assert not T.users.search(is_demo=True)
as_user(None)
call("leaderboard")
assert M["DemoData"].state() == "removed", "removed demo data doesn't come back by itself"
as_user(admin)
ok(call("demo_load"))
ok(call("demo_load"))
assert call("leaderboard")["players"] == 7, "reloading replaces the demo instead of doubling it"
as_user(ana)
ok(call("reset_save"))
assert call("get_save")["save"] is None

# ---------------------------------------------------------------------------------- map tile backup (Tiles.py)
import base64  # noqa: E402
import gzip  # noqa: E402
import anvil  # noqa: E402
import anvil.http  # noqa: E402


def fake_tiles(url, method, data):
    if url.endswith("/15/9685/11723.webp") or url.endswith("/15/9686/11719.webp"):
        return anvil.http.HttpError(404)  # no hills tile at zoom 15 here
    if url.endswith("/15/9685/11722.webp"):
        return anvil.BlobMedia("image/webp", b"WEBP1")
    if url.endswith("/14/4842/5861.pbf"):
        return anvil.BlobMedia("application/x-protobuf", gzip.compress(b"PBF"))  # gzip is unpacked
    return anvil.BlobMedia("application/octet-stream", b"T")


anvil.http.REPLIES["https://tiles.openfreemap.org/planet"] = {"tiles": ["https://tiles.example/planet/1/{z}/{x}/{y}.pbf"]}
anvil.http.REPLIES["https://tiles.example/"] = fake_tiles
anvil.http.REPLIES["https://tiles.mapterhorn.com/"] = fake_tiles
as_user(None)  # guests play too
r = ok(call("tile_archive", ["v/14/4842/5861", "t/15/9685/11722", "t/15/9685/11723", "bogus", "v/13/1/1", "t/15/99999/1"]))
assert set(r["have"]) == {"v/14/4842/5861", "t/15/9685/11722", "t/15/9685/11723"} and not r["full"], r
assert T.tiles.get(key="v/14/4842/5861")["data"].get_bytes() == b"PBF"
assert T.tiles.get(key="t/15/9685/11723")["missing"] and T.tiles.get(key="t/15/9685/11723")["data"] is None
n_calls = len(anvil.http.CALLS)
ok(call("tile_archive", ["t/15/9685/11722", "v/14/4842/5861"]))
assert len(anvil.http.CALLS) == n_calls, "tiles already kept are not fetched again"
assert len(T.tiles.search(key="t/15/9685/11722")) == 1
assert base64.b64decode(ok(call("tile_backup", "t/15/9685/11722"))["data"]) == b"WEBP1"
assert ok(call("tile_backup", "t/15/9685/11723"))["missing"]
assert ok(call("tile_backup", "t/15/1/1"))["found"] is False
bad(call("tile_backup", "../../etc/passwd"))
bad(call("tile_archive", "not a list"))
anvil.http.REPLIES["https://tiles.mapterhorn.com/"] = lambda u, m, d: anvil.http.HttpError(503)
assert ok(call("tile_archive", ["t/15/1/2"]))["have"] == [], "a service that's down: nothing kept"
assert not T.tiles.search(key="t/15/1/2")
anvil.http.REPLIES["https://tiles.mapterhorn.com/"] = fake_tiles
M["common"].set_setting("tiles_bytes", 10 ** 13)
assert ok(call("tile_archive", ["t/15/1/3"]))["full"] and not T.tiles.search(key="t/15/1/3"), "stops at the size cap"
M["common"].set_setting("tiles_bytes", 8)
as_user(ana)
assert denied("admin_tiles_status") and denied("admin_tiles_seed", 0, 0) and denied("admin_tiles_cap", 500)
as_user(admin)
st = ok(call("admin_tiles_status"))
assert st["tiles"] == 3 and len(st["cities"]) == len(M["Tiles"].STARTER)
nxt, rounds = 0, 0
while True:
    sd = ok(call("admin_tiles_seed", 0, nxt))
    nxt, rounds = sd["next"], rounds + 1
    if sd["done"] or rounds > 20:
        break
assert sd["done"] and sd["total"] >= 8, sd
assert T.tiles.get(key="t/15/9686/11719")["missing"] and T.tiles.get(key="t/14/4843/5859") is not None, "no zoom-15 hills tile -> the zoom-14 one is kept too"
bad(call("admin_tiles_seed", 999, 0))
assert ok(call("admin_tiles_cap", 500))["cap_mb"] == 500
bad(call("admin_tiles_cap", 5))

# ---------------------------------------------------------------------------------- Privacy & Terms
if "legal_server" in M:
    as_user(ana)
    st = call("legal_state")
    assert st["signedIn"] and st["accepted_version"] is None
    ok(call("legal_accept", st["version"], "signup"))
    assert ana["legal_source"] == "signup" and call("legal_state")["accepted_version"] == st["version"]

# ---------------------------------------------------------------------------------- every callable is covered by a permission check
# A callable that changes data without require_user / a C.require_* check is a security hole. List the public ones here.
PUBLIC = {"get_me", "submit_feedback", "leaderboard", "legal_state", "legal_accept", "tile_archive", "tile_backup"}
for name, (f, need) in sorted(anvil.server.CALLABLES.items()):
    if name in PUBLIC:
        continue
    assert need, "%s is callable by anyone: add require_user=True (or list it in PUBLIC in test_server.py)" % name

print("ALL OK (%d server functions)" % len(anvil.server.CALLABLES))

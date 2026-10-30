"""City Fun Time saves and the leaderboard.

The game runs in the browser (assets/cft-game.js). Its whole state is one JSON document per player, saved here
(table `saves`), plus a few summary columns for the public leaderboard. Guests keep their save in the browser only.
"""
import json

import anvil.server
from anvil.tables import app_tables
import anvil.tables as tables

from . import common as C
from . import DemoData

MAX_SAVE = 400000  # characters of JSON
# Prices from assets/cft-content.js, for net worth (keep in step when prices change).
BIZ_COST = {"lemonade": 60, "dogwalk": 300, "bikeshop": 1500, "laundromat": 4000, "coffee": 8000, "foodtruck": 15000,
            "cleaning": 25000, "pizzeria": 45000, "salon": 60000, "phonefix": 80000, "sushi": 120000, "gym": 200000,
            "karaoke": 320000, "bistro": 650000, "hotel": 1500000}
APT_VALUE = [0, 0, 0, 0, 60000, 160000, 550000]
UPGRADE = [0.5, 1, 2, 4]


def level_of(xp):
    lvl = 1
    while lvl < 99 and round(60 * lvl ** 1.8) <= xp:
        lvl += 1
    return lvl


def _num(v, lo=0, hi=1e12):
    try:
        v = float(v)
    except (TypeError, ValueError):
        return lo
    if v != v:  # NaN
        return lo
    return max(lo, min(hi, v))


def summarize(d):
    """The leaderboard columns, computed from a save."""
    m = d.get("m") or {}
    missions = sum(1 for k, v in m.items() if isinstance(v, dict) and v.get("s") == "done" and not k.startswith(("job-", "rush-")))
    turf = d.get("turf") or {}
    turfs = sum(1 for t in turf.values() if isinstance(t, dict) and t.get("own"))
    biz = d.get("biz") or {}
    worth = _num(d.get("money")) + _num(d.get("savings"))
    for bid, b in biz.items():
        cost = BIZ_COST.get(bid, 0)
        lvl = int(_num((b or {}).get("lvl", 1), 1, 5))
        worth += cost + sum(cost * UPGRADE[i] for i in range(lvl - 1))
    apt = d.get("apt") or {}
    tier = int(_num(apt.get("tier", 0), 0, 6))
    worth += APT_VALUE[tier]
    xp = _num(d.get("xp"))
    return {"xp": xp, "level": level_of(xp), "worth": round(worth), "missions": missions, "turfs": turfs, "biz": len(biz),
            "kids": len(d.get("kids") or []), "partner": bool(d.get("partner")), "day": int(_num(d.get("day", 1), 1, 1e7))}


def _clean(data):
    if not isinstance(data, dict):
        return None, "That save doesn't look right."
    try:
        size = len(json.dumps(data))
    except (TypeError, ValueError):
        return None, "That save doesn't look right."
    if size > MAX_SAVE:
        return None, "Your save is too big to store. Please send feedback so we can look at it."
    if not isinstance(data.get("home"), dict) or "xp" not in data or "money" not in data:
        return None, "That save is missing pieces."
    data["name"] = C.text(data.get("name"), 20) or "Player"
    return data, None


def store(user, data, is_demo=False):
    """Write a (clean) save for a user and refresh the summary columns."""
    s = summarize(data)
    row = app_tables.saves.get(user=user)
    vals = dict(data=data, name=data.get("name") or "Player", updated=C.now(), level=s["level"], xp=s["xp"], worth=s["worth"],
                missions=s["missions"], turfs=s["turfs"], biz=s["biz"], kids=s["kids"], partner=s["partner"], day=s["day"])
    if row is None:
        row = app_tables.saves.add_row(user=user, created=C.now(), hidden=False, is_demo=is_demo, **vals)
    else:
        row.update(**vals)
    return row


@anvil.server.callable(require_user=True)
def get_save():
    me = C.require_user()
    row = app_tables.saves.get(user=me)
    if row is None:
        return {"save": None}
    return {"save": row["data"], "updated": C.iso(row["updated"])}


@anvil.server.callable(require_user=True)
def put_save(data):
    me = C.require_user()
    if C.rate_limited("put_save", 240, 3600):
        return C.fail("Saving too often. Your progress is kept on this device and will sync in a bit.")
    data, err = _clean(data)
    if err:
        return C.fail(err)
    row = store(me, data)
    return C.ok(level=row["level"], worth=row["worth"])


@anvil.server.callable(require_user=True)
def reset_save():
    me = C.require_user()
    row = app_tables.saves.get(user=me)
    if row is not None:
        row.delete()
    return C.ok()


def _entry(r, me):
    return {"name": r["name"] or "Player", "level": r["level"] or 1, "worth": r["worth"] or 0, "missions": r["missions"] or 0,
            "turfs": r["turfs"] or 0, "biz": r["biz"] or 0, "kids": r["kids"] or 0, "partner": bool(r["partner"]),
            "day": r["day"] or 1, "me": me is not None and r["user"] == me, "demo": bool(r["is_demo"])}


@anvil.server.callable
def leaderboard():
    """Top players by net worth, level, blocks and missions. Public; names only (players pick them in the game)."""
    DemoData.ensure_loaded()
    me = C.me()
    rows = [r for r in app_tables.saves.search() if not r["hidden"]]
    out = {}
    for key, col in (("worth", "worth"), ("level", "xp"), ("turfs", "turfs"), ("missions", "missions")):
        top = sorted(rows, key=lambda r: (r[col] or 0, r["xp"] or 0), reverse=True)
        out[key] = [dict(_entry(r, me), rank=i + 1) for i, r in enumerate(top[:15])]
        if me is not None and not any(e["me"] for e in out[key]):
            mine = [i for i, r in enumerate(top) if r["user"] == me]
            if mine:
                out[key].append(dict(_entry(top[mine[0]], me), rank=mine[0] + 1))
    out["players"] = len(rows)
    out["missions_done"] = sum(r["missions"] or 0 for r in rows)
    out["turfs_won"] = sum(r["turfs"] or 0 for r in rows)
    return out


# ---------------------------------------------------------------------------------- admin
@anvil.server.callable(require_user=True)
def admin_players(query=None):
    C.require_admin()
    query = C.text(query, 80).lower()
    rows = list(app_tables.saves.search(tables.order_by("updated", ascending=False)))
    out = []
    for r in rows:
        u = r["user"]
        email = (u["email"] if u is not None else "") or ""
        if query and query not in email.lower() and query not in (r["name"] or "").lower():
            continue
        e = _entry(r, None)
        e.update(id=r.get_id(), email=email, hidden=bool(r["hidden"]), updated=C.iso(r["updated"]), created=C.iso(r["created"]))
        out.append(e)
    return {"players": out[:300], "total": len(out)}


@anvil.server.callable(require_user=True)
def admin_set_player(save_id, hidden=None, rename=None):
    """Hide a player from the leaderboard, or reset an unsuitable name to "Player"."""
    C.require_admin()
    r = C.row_by_id(app_tables.saves, save_id)
    if r is None:
        return C.fail("That player no longer exists.")
    if hidden is not None:
        r["hidden"] = bool(hidden)
    if rename:
        data = dict(r["data"] or {})
        data["name"] = "Player"
        r.update(data=data, name="Player")
    return C.ok()


def player_count():
    return len([r for r in app_tables.saves.search() if not r["is_demo"]])

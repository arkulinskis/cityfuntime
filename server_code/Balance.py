"""Game balance values set from Admin > Balance (the wiki of characters and numbers, theme/assets/cft-wiki.js).

The game's numbers live in theme/assets/cft-content.js (D.TUNE, D.MONSTERS, D.ITEMS...). The admin can override any of them
without a deploy: a flat map {"TUNE.combat.parry": 0.25, "MONSTERS.slime.hp": 3} kept in app_settings under the key
"balance". Every game asks for it when it starts (get_balance) and applies it with D.applyBalance before anything reads the
numbers. "Try it" drafts never reach the server: they stay in the admin's browser (localStorage) until published here.
The last 12 published versions are kept (key "balance_history") so a bad change can be rolled back.
"""
import math
import re

import anvil.server

from . import common as C

KEY, HISTORY = "balance", "balance_history"
MAX_VALUES, MAX_HISTORY = 3000, 12
PATH = re.compile(r"^[A-Za-z_]\w*(\.\w+){1,5}$")


def published():
    """The published overrides: {path: number} (empty = every default)."""
    v = C.get_setting(KEY) or {}
    vals = v.get("values") if isinstance(v, dict) else None
    return dict(vals) if isinstance(vals, dict) else {}


def tune(path, default):
    """One published number, for server code that must agree with the game (the level curve on the leaderboard)."""
    v = published().get(path)
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) else default


def clean(values):
    """Checks an override map from the browser: only dotted paths into the game data and finite numbers."""
    if not isinstance(values, dict):
        raise ValueError("The values must be a list of paths and numbers.")
    if len(values) > MAX_VALUES:
        raise ValueError("Too many changed values (at most %d)." % MAX_VALUES)
    out = {}
    for k, v in values.items():
        if not isinstance(k, str) or not PATH.match(k) or "__" in k or "prototype" in k or "constructor" in k:
            raise ValueError("Not a game value: %s" % str(k)[:60])
        if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or abs(v) > 1e7:
            raise ValueError("%s needs a number." % k)
        out[k] = round(float(v), 6)
    return out


@anvil.server.callable
def get_balance():
    """Public on purpose: every game (guests too) needs the published numbers before it starts. Numbers only, no people."""
    v = C.get_setting(KEY) or {}
    return {"values": published(), "updated": v.get("updated") if isinstance(v, dict) else None}


@anvil.server.callable(require_user=True)
def admin_balance_get():
    C.require_admin()
    v = C.get_setting(KEY) or {}
    hist = C.get_setting(HISTORY) or []
    return {"values": published(), "updated": v.get("updated"), "by": v.get("by"), "note": v.get("note"),
            "history": [{"i": i, "updated": h.get("updated"), "by": h.get("by"), "note": h.get("note"), "n": len(h.get("values") or {})}
                        for i, h in enumerate(hist)]}


@anvil.server.callable(require_user=True)
def admin_balance_save(values, note=None):
    """Publishes a new set of overrides for every player (the previous one goes into the history)."""
    me = C.require_admin()
    try:
        vals = clean(values)
    except ValueError as e:
        return C.fail(str(e))
    old = C.get_setting(KEY)
    if isinstance(old, dict) and old.get("values") is not None:
        hist = [old] + list(C.get_setting(HISTORY) or [])
        C.set_setting(HISTORY, hist[:MAX_HISTORY])
    rec = {"values": vals, "updated": C.iso(C.now()), "by": C.name_of(me), "note": C.text(note, 120)}
    C.set_setting(KEY, rec)
    return C.ok(values=vals, updated=rec["updated"])


@anvil.server.callable(require_user=True)
def admin_balance_restore(index):
    """Publishes an older version again (from admin_balance_get's history)."""
    C.require_admin()
    hist = C.get_setting(HISTORY) or []
    try:
        h = hist[int(index)]
    except (ValueError, TypeError, IndexError):
        return C.fail("That version is gone.")
    return admin_balance_save(h.get("values") or {}, "Restored the version from %s" % (h.get("updated") or "?")[:16])

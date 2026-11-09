"""Demo content, so the app never looks empty. Loaded automatically the first time anyone opens the app
(ensure_loaded), removed or reloaded from Admin -> Demo data. Removing it is remembered: it doesn't come back.

Demo users have is_demo=True and @example.com emails; they can't sign in (no password). Every demo row
is flagged is_demo=True, so remove() deletes exactly what load() added.
City Fun Time: six fictional players with saves, so the leaderboard has a crowd to beat.
"""
import datetime as dt

from anvil.tables import app_tables

from . import common as C

# name, email, game name, xp, money, missions, turfs, businesses, kids, partner, day
DEMO_PLAYERS = [
    ("Maya Chen", "maya.demo@example.com", "Maya", 26000, 184000, 96, 11, 8, 2, True, 61),
    ("Theo Martin", "theo.demo@example.com", "Theo", 2200, 1450, 21, 1, 2, 0, False, 9),
    ("Ines Ozola", "ines.demo@example.com", "Ines", 11500, 38200, 58, 6, 5, 1, True, 34),
    ("Kofi Mensah", "kofi.demo@example.com", "Kofi", 41000, 912000, 131, 17, 12, 3, True, 102),
    ("Léa Dubois", "lea.demo@example.com", "Léa", 640, 310, 8, 0, 1, 0, False, 3),
    ("Hiro Tanaka", "hiro.demo@example.com", "Hiro", 17800, 77000, 77, 9, 6, 0, True, 47),
]
DEMO_TABLES = ["saves"]
BIZ_ORDER = ["lemonade", "dogwalk", "bikeshop", "laundromat", "coffee", "foodtruck", "cleaning", "pizzeria", "salon", "phonefix",
             "sushi", "gym", "karaoke", "bistro", "hotel"]
STORY = [  # chapter 1-5 mission ids, in order (assets/cft-content.js)
    "c1-couch", "c1-coffee", "c1-rosa", "c1-bread", "c1-phone", "c1-stretch", "c1-library", "c1-snap", "c1-sleep",
    "c2-flyers", "c2-meatball", "c2-groceries", "c2-priya", "c2-lemons", "c2-squeeze", "c2-profit", "c2-room", "c2-warming",
    "c2-walkies", "c2-dogbiz", "c3-kai", "c3-ollie", "c3-bike", "c3-courier", "c3-license", "c3-scooter", "c3-scenic",
    "c4-jay", "c4-speedrun", "c4-noor", "c4-benny", "c4-recipe", "c4-zoe", "c4-vinyl", "c4-kai", "c4-crew",
    "c5-meet", "c5-roses", "c5-coffee", "c5-glowup", "c5-dinner", "c5-sunset", "c5-ask", "c5-movein",
]
HOME = {"lat": 45.52337, "lon": -73.58205, "label": "Rue Rachel Est, Plateau Mont-Royal, Montréal", "short": "Rue Rachel Est, Montréal"}
STICKERS = ["pigeon", "squirrel", "raccoon", "hotdog", "bagel", "slice", "taco", "donut", "cupcake", "bus", "metro",
            "tree", "duck", "kite", "maple", "sunny", "soccer", "palette", "clover", "phone", "laptop"]


def demo_save(name, xp, money, done, turfs, biz, kids, partner, day, active=None, home=None):
    """A believable save. Used for the demo players and for Ana on the local dev server."""
    home: dict = home or HOME
    m = {mid: {"s": "done", "done": max(1, day - 1)} for mid in STORY[:done]}
    for i in range(max(0, done - len(STORY))):
        m["s-extra-%d" % i] = {"s": "done", "done": day}
    if active:
        m[active] = {"s": "active", "st": 0, "d": day}
    b = {}
    for i, bid in enumerate(BIZ_ORDER[:biz]):
        lat, lon = home["lat"] + 0.0006 * (i % 3 - 1), home["lon"] + 0.0008 * (i // 3 - 1)
        b[bid] = {"lvl": 1 + i % 3, "mgr": i % 2 == 1, "name": "%s's %s" % (name, bid.capitalize()), "lat": lat, "lon": lon, "wlat": lat, "wlon": lon,
                  "nx": 1, "nz": 0, "till": 12.0, "earned": 400.0 * (i + 1), "since": max(1, day - 5), "addr": "Rue Rachel Est"}
    turf = {"%d_0" % i: {"own": True, "name": "Block %d" % (i + 1), "crew": "grannies", "tags": [1, 1, 1, 1]} for i in range(turfs)}
    tier = 5 if money > 150000 else 4 if money > 60000 else 3 if kids else 2 if partner else 1 if done > 16 else 0
    return {
        "v": 1, "created": 0, "updated": 0, "playMs": day * 1440000, "name": name,
        "look": {"skin": 0xe9b98f, "hair": 0x3a2618, "shirt": 0x7b52c7, "long": True}, "pref": "gf" if partner else None,
        "home": home, "apt": {"tier": tier, "lat": home["lat"], "lon": home["lon"], "label": home["short"]},
        "pos": None, "money": money, "savings": 0, "xp": xp, "energy": 80, "happy": 72, "maxE": 0,
        "stats": {"fit": 6.5, "charm": 7.25, "smarts": 5.5, "style": 6, "cred": 4.75},
        "day": day, "clock": 14.5, "gameMin": day * 1440, "bag": {"spray": 3, "bouquet": 1, "cookie": 2},
        "owned": {"phone2": True, "skateboard": True, "bicycle": True, "sneakers1": True, "tee": True, "plant_home": True, "sofa": True},
        "equip": {"phone": "phone2", "shoes": "sneakers1", "outfit": "tee"},
        "m": m, "track": active, "spots": {}, "castAt": {}, "vplaces": [], "jobs": {"day": 0, "list": []}, "dyn": {},
        "stickers": {k: 1 for k in STICKERS[:min(len(STICKERS), 6 + done // 3)]},
        "turf": turf, "biz": b, "rel": {"max": 70, "rosa": 80, "jay": 65, "noor": 62, "benny": 61, "sam": 90 if partner else 30},
        "friends": {"jay": True, "noor": True, "benny": True} if done > 30 else {}, "partner": "sam" if partner else None,
        "engaged": False, "married": kids > 0,
        "kids": [{"name": n, "born": max(1, day - 14 * (k + 1)), "seed": 42 + k} for k, n in enumerate(["Mia", "Leo", "Ivy"][:kids])],
        "pets": [{"kind": "dog", "name": "Biscuit", "since": 3}] if done > 20 else [],
        "counters": {"coins": 40 * done, "pickups": 60 * done, "chats": done, "photos": done // 6, "tags": turfs * 4, "missions": done},
        "metro": [], "log": [{"d": day, "h": 14, "t": "Took a walk around the neighbourhood", "e": "🚶"}],
        "hourPaid": 0, "walked": done * 900,
        "settings": {"follow": {"partner": True, "kids": True, "pets": True, "friend": None}, "quality": "auto", "sound": True},
    }


def state():
    return C.get_setting("demo", "never")  # "never" | "loaded" | "removed"


def ensure_loaded():
    """Call from the app's main data callables: loads the demo once, unless an admin removed it."""
    if state() == "never":
        load()


def load():
    from . import Game
    remove(remember=False)
    for name, email, game_name, xp, money, done, turfs, biz, kids, partner, day in DEMO_PLAYERS:
        u = app_tables.users.get(email=email) or app_tables.users.add_row(email=email, enabled=False)
        u.update(display_name=name, is_demo=True, signed_up=C.now() - dt.timedelta(days=day))
        Game.store(u, demo_save(game_name, xp, money, done, turfs, biz, kids, partner, day), is_demo=True)
    C.set_setting("demo", "loaded")
    return counts()


def remove(remember=True):
    for name in DEMO_TABLES:
        for r in getattr(app_tables, name).search(is_demo=True):
            r.delete()
    for u in app_tables.users.search(is_demo=True):
        u.delete()
    if remember:
        C.set_setting("demo", "removed")
    return counts()


def counts():
    out = {"users": len(app_tables.users.search(is_demo=True))}
    for name in DEMO_TABLES:
        out[name] = len(getattr(app_tables, name).search(is_demo=True))
    return out

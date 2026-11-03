"""City Fun Time's own copy of the map tiles, so the game keeps working if a map service closes.

The game builds its 3D city from two free services: street maps from OpenFreeMap (vector tiles, zoom 14) and hills
from Mapterhorn (elevation tiles, zoom 15 or the best lower zoom). Whenever a player loads tiles, their browser asks
the server to keep a copy (tile_archive): the server fetches each tile itself (it never stores what a browser sends)
and keeps it in the table `tiles`. If a service doesn't answer, the browser asks for the copy (tile_backup).
So every neighbourhood anyone has played keeps working; places nobody played yet would load without that data.
Admins can also copy a starter list of cities (Admin > Map backup).

Keys: "v/14/x/y" (street tiles) and "t/z/x/y" (hills). A row with missing=True remembers "the service has no tile
here" (the sea for streets; for hills, the browser then uses the zoom below).
"""
import base64
import gzip
import math
import re

import anvil
import anvil.http
import anvil.server
from anvil.tables import app_tables
import anvil.tables.query as q

from . import common as C

OFM_TILEJSON = "https://tiles.openfreemap.org/planet"
TERRAIN_URL = "https://tiles.mapterhorn.com/{z}/{x}/{y}.webp"
KEY = re.compile(r"^(v|t)/(\d{1,2})/(\d{1,6})/(\d{1,6})$")
MAX_KEYS = 8               # tiles per archive call (each may take a moment to fetch)
DEFAULT_CAP_MB = 3000      # stop copying once the table holds this much (app setting tiles_cap_mb)
SEED_RADIUS = 1200         # metres around each starter city

# Starter cities (Admin > Map backup): popular and hilly neighbourhoods, and the demo game's home.
STARTER = [
    ("Montréal, Plateau (demo)", 45.52337, -73.58205), ("Montréal, Mont Royal", 45.5048, -73.5874),
    ("Québec City, Old Town", 46.8123, -71.2065), ("Toronto, downtown", 43.6510, -79.3830),
    ("Vancouver, Kitsilano", 49.2680, -123.1550), ("New York, Midtown", 40.7549, -73.9840),
    ("Chicago, the Loop", 41.8819, -87.6278), ("Seattle, Capitol Hill", 47.6231, -122.3200),
    ("San Francisco, Nob Hill", 37.7930, -122.4161), ("London, Camden", 51.5390, -0.1426),
    ("Paris, Montmartre", 48.8867, 2.3431), ("Paris, Le Marais", 48.8590, 2.3600),
    ("Lisbon, Alfama", 38.7114, -9.1300), ("Barcelona, Gràcia", 41.4036, 2.1564),
    ("Rome, Trastevere", 41.8892, 12.4700), ("Berlin, Mitte", 52.5200, 13.4050),
    ("Amsterdam, Jordaan", 52.3752, 4.8816), ("Riga, Old Town", 56.9496, 24.1052),
    ("Tokyo, Shibuya", 35.6595, 139.7005), ("Sydney, Surry Hills", -33.8861, 151.2111),
]

_ofm = {"url": None, "at": None}


def parse(key):
    """'t/15/9685/11722' -> ('t', 15, 9685, 11722), or None if it isn't a map tile the game uses."""
    m = KEY.match(str(key or ""))
    if not m:
        return None
    kind, z, x, y = m.group(1), int(m.group(2)), int(m.group(3)), int(m.group(4))
    if kind == "v" and z != 14:
        return None
    if kind == "t" and not 8 <= z <= 15:
        return None
    if x >= 2 ** z or y >= 2 ** z:
        return None
    return kind, z, x, y


def _vector_url():
    """OpenFreeMap's current tile URL (it changes with every map update), from its TileJSON, kept 6 hours."""
    if _ofm["url"] and _ofm["at"] and (C.now() - _ofm["at"]).total_seconds() < 6 * 3600:
        return _ofm["url"]
    j = anvil.http.request(OFM_TILEJSON, json=True, timeout=20)
    _ofm["url"], _ofm["at"] = j["tiles"][0], C.now()
    return _ofm["url"]


def _bytes(r):
    if r is None:
        return b""
    if isinstance(r, (bytes, bytearray)):
        data = bytes(r)
    elif hasattr(r, "get_bytes"):
        data = r.get_bytes() or b""
    else:
        data = str(r).encode("utf-8")
    if data[:2] == b"\x1f\x8b":  # some servers send gzip; the game wants the plain tile
        data = gzip.decompress(data)
    return data


def fetch(kind, z, x, y):
    """The tile from its service: bytes (b'' = the service has no tile there). Raises if the service can't be reached."""
    url = (_vector_url() if kind == "v" else TERRAIN_URL).replace("{z}", str(z)).replace("{x}", str(x)).replace("{y}", str(y))
    try:
        return _bytes(anvil.http.request(url, timeout=20))
    except anvil.http.HttpError as e:
        if getattr(e, "status", None) in (204, 404):
            return b""
        raise


def _row(key):
    for r in app_tables.tiles.search(key=key):
        return r
    return None


def _full():
    cap = C.get_setting("tiles_cap_mb", DEFAULT_CAP_MB) or DEFAULT_CAP_MB
    return (C.get_setting("tiles_bytes", 0) or 0) >= cap * 1e6


def _store(key, data):
    kind = key[0]
    media = anvil.BlobMedia("image/webp" if kind == "t" else "application/x-protobuf", data, name=key.replace("/", "_")) if data else None
    app_tables.tiles.add_row(key=key, kind=kind, data=media, size=len(data), missing=not data, created=C.now())
    C.set_setting("tiles_bytes", (C.get_setting("tiles_bytes", 0) or 0) + len(data))


def _archive(keys):
    """Copies the keys not kept yet. Returns (keys kept now, keys newly added)."""
    keys = [k for k in keys if parse(k)]
    if not keys:
        return [], []
    have = {r["key"] for r in app_tables.tiles.search(key=q.any_of(*keys))}
    added = []
    for k in keys:
        if k in have:
            continue
        if _full():
            break
        try:
            data = fetch(*parse(k))
        except Exception as e:  # the service is down right now: try again another time
            print("tile %s: %s" % (k, e))
            continue
        _store(k, data)
        have.add(k)
        added.append(k)
    return [k for k in keys if k in have], added


@anvil.server.callable
def tile_archive(keys):
    """The game asks the server to keep a copy of tiles it just loaded (anyone playing, guests too)."""
    if not isinstance(keys, (list, tuple)):
        return C.fail("Expected a list of tiles.")
    keys = list(dict.fromkeys(str(k) for k in keys))[:MAX_KEYS]
    if C.rate_limited("tile_archive", 150, 600):
        return C.fail("Too many map requests. Try again in a few minutes.")
    if _full():
        return C.ok(have=[], full=True)
    have, _ = _archive(keys)
    return C.ok(have=have, full=False)


@anvil.server.callable
def tile_backup(key):
    """The server's copy of a tile, when the map service doesn't answer: {found, missing, data (base64)}."""
    if not parse(key):
        return C.fail("Unknown map tile.")
    if C.rate_limited("tile_backup", 600, 600):
        return C.fail("Too many map requests. Try again in a few minutes.")
    r = _row(key)
    if r is None:
        return C.ok(found=False)
    if r["missing"] or r["data"] is None:
        return C.ok(found=True, missing=True)
    return C.ok(found=True, missing=False, data=base64.b64encode(r["data"].get_bytes()).decode("ascii"))


# ------------------------------------------------------------------------------------------- admin: starter cities
def _tile_xy(lat, lon, z):
    n = 2 ** z
    r = math.radians(lat)
    return (lon + 180) / 360 * n, (1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * n


def area_keys(lat, lon, radius):
    """Street tiles (zoom 14) and hills tiles (zoom 15) within radius metres."""
    out = []
    for kind, z in (("v", 14), ("t", 15)):
        x, y = _tile_xy(lat, lon, z)
        m = 40075016.686 * math.cos(math.radians(lat)) / 2 ** z
        rt = radius / m
        for tx in range(int(math.floor(x - rt)), int(math.floor(x + rt)) + 1):
            for ty in range(int(math.floor(y - rt)), int(math.floor(y + rt)) + 1):
                d = m * math.hypot(max(tx - x, 0, x - tx - 1), max(ty - y, 0, y - ty - 1))
                if d <= radius:
                    out.append("%s/%d/%d/%d" % (kind, z, tx, ty))
    return out


@anvil.server.callable(require_user=True)
def admin_tiles_status():
    C.require_admin()
    rows = app_tables.tiles.search()
    n = len(rows)
    return C.ok(tiles=n, mb=round((C.get_setting("tiles_bytes", 0) or 0) / 1e6, 1),
                cap_mb=C.get_setting("tiles_cap_mb", DEFAULT_CAP_MB) or DEFAULT_CAP_MB,
                cities=[{"i": i, "name": c[0]} for i, c in enumerate(STARTER)])


@anvil.server.callable(require_user=True)
def admin_tiles_seed(city, offset):
    """Copies the next few tiles of starter city number `city`. The page calls it again with `next` until done."""
    C.require_admin()
    try:
        city, offset = int(city), max(0, int(offset or 0))
        name, lat, lon = STARTER[city]
    except (TypeError, ValueError, IndexError):
        return C.fail("Unknown city.")
    keys = area_keys(lat, lon, SEED_RADIUS)
    batch = keys[offset:offset + 6]
    added = 0
    for k in batch:
        # hills: no tile at zoom 15 here -> keep the zoom below too (what the game would use)
        while k:
            have, new = _archive([k])
            added += len(new)
            r = _row(k) if have else None
            kind, z, x, y = parse(k)
            k = "t/%d/%d/%d" % (z - 1, x // 2, y // 2) if (r is not None and r["missing"] and kind == "t" and z > 8) else None
    nxt = offset + len(batch)
    return C.ok(city=name, total=len(keys), next=nxt, done=nxt >= len(keys), added=added, full=_full())


@anvil.server.callable(require_user=True)
def admin_tiles_cap(mb):
    C.require_admin()
    try:
        mb = int(mb)
    except (TypeError, ValueError):
        return C.fail("Enter a number of megabytes.")
    if not 100 <= mb <= 100000:
        return C.fail("Choose between 100 and 100,000 MB.")
    C.set_setting("tiles_cap_mb", mb)
    return C.ok(cap_mb=mb)

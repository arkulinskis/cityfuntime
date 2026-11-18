"""Downloads the ground photo textures from Poly Haven (CC0) and bakes them into theme/assets/ground-*.jpg.

    python tools/ground_textures.py            (needs Pillow; not -I if Pillow is in your user site-packages)

Each texture: the 2K colour map times its ambient-occlusion map (at ~65% strength), shrunk to 1024 px, JPEG quality 82.
cft-world.js loads them into one texture array (TEX list near the top of `create`; the order there is the layer order).
To swap a photo: change NAMES below (Poly Haven id -> game name), re-run, and set TEX[i].m to the photo's real size in
metres (https://api.polyhaven.com/info/<id> "dimensions", in mm). Bump `?v=` in loadGround so browsers fetch the new files.
"""
import io
import pathlib
import urllib.request

from PIL import Image, ImageChops

OUT = pathlib.Path(__file__).resolve().parent.parent / "theme" / "assets"
NAMES = {
    "asphalt_02": "asphalt", "concrete_pavement": "sidewalk", "leafy_grass": "grass", "forest_leaves_02": "forest",
    "pavement_03": "bricks", "sand_01": "sand", "grass_path_3": "ground", "concrete_floor_01": "path",
}


def fetch(ph, kind):
    for name in ("diff", "diffuse") if kind == "diff" else ("ao",):
        url = "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/%s/%s_%s_2k.jpg" % (ph, ph, name)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "cft-ground-textures"})
            return Image.open(io.BytesIO(urllib.request.urlopen(req, timeout=60).read()))
        except Exception:
            continue
    raise SystemExit("could not download %s %s" % (ph, kind))


for ph, name in NAMES.items():
    d = fetch(ph, "diff").convert("RGB")
    ao = fetch(ph, "ao").convert("L").resize(d.size, Image.LANCZOS)
    ao = ao.point(lambda v: int(90 + v * (255 - 90) / 255))
    d = ImageChops.multiply(d, Image.merge("RGB", (ao, ao, ao))).resize((1024, 1024), Image.LANCZOS)
    p = OUT / ("ground-%s.jpg" % name)
    d.save(p, quality=82, optimize=True)
    print(p.name, p.stat().st_size // 1024, "KB")

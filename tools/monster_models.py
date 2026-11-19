"""Packs the figment models (Quaternius "Ultimate Monsters", CC0, https://quaternius.com/packs/ultimatemonsters.html)
into small GLB files in theme/assets (mon-<name>.glb), keeping only the animations the game plays.

    python -I tools/monster_models.py <folder with the pack's Big/ Blob/ Flying/ glTF folders>

Each source .gltf embeds its data as base64; the output is a binary GLB with the unused animations, accessors and
buffer views dropped. cft-world.js (MODELS / loadMonsters) maps monster kinds to these files and their clips.
Re-run after changing MODELS below; then python tools/assets.py is NOT needed (models are fetched by name with ?v=).
"""
import base64
import json
import pathlib
import struct
import sys

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE.parent / "theme" / "assets"

# output name: (pack folder, file, animations to keep)
BIG = ["Idle", "Walk", "Run", "Punch", "Weapon", "HitReact", "Death"]
BLOB = ["Idle", "Walk", "Bite_Front", "HitRecieve", "Death"]
FLY = ["Flying_Idle", "Fast_Flying", "Headbutt", "Punch", "HitReact", "Death"]
MODELS = {
    "greenblob": ("Blob", "GreenBlob", BLOB),
    "pinkblob": ("Blob", "PinkBlob", BLOB),
    "spikyblob": ("Blob", "GreenSpikyBlob", BLOB),
    "fatpigeon": ("Blob", "Pigeon", BLOB),
    "ghost": ("Flying", "Ghost", FLY),
    "ghostskull": ("Flying", "Ghost_Skull", FLY),
    "pigeon": ("Flying", "Pigeon", FLY),
    "ninja": ("Big", "Ninja", BIG),
    "fish": ("Big", "Fish", BIG),
    "bluedemon": ("Big", "BlueDemon", BIG),
    "orc": ("Big", "Orc", BIG),
    "alien": ("Big", "Alien", BIG),
}


def pack(src, keep, dst):
    g = json.loads(src.read_text(encoding="utf-8"))
    uri = g["buffers"][0]["uri"]
    data = base64.b64decode(uri.split(",", 1)[1])
    g["animations"] = [a for a in g.get("animations", []) if a["name"] in keep]
    used = set()
    for m in g["meshes"]:
        for p in m["primitives"]:
            used.update(p["attributes"].values())
            if "indices" in p:
                used.add(p["indices"])
            for t in p.get("targets", []):
                used.update(t.values())
    for s in g.get("skins", []):
        if "inverseBindMatrices" in s:
            used.add(s["inverseBindMatrices"])
    for a in g["animations"]:
        for s in a["samplers"]:
            used.update((s["input"], s["output"]))
    acc_map = {old: new for new, old in enumerate(sorted(used))}
    accessors = [g["accessors"][i] for i in sorted(used)]
    views_used = {a["bufferView"] for a in accessors if "bufferView" in a} | {im["bufferView"] for im in g.get("images", []) if "bufferView" in im}
    view_map, views, blob = {}, [], bytearray()
    for i in sorted(views_used):
        v = dict(g["bufferViews"][i])
        chunk = data[v.get("byteOffset", 0): v.get("byteOffset", 0) + v["byteLength"]]
        while len(blob) % 4:
            blob.append(0)
        v["byteOffset"] = len(blob)
        v["buffer"] = 0
        blob.extend(chunk)
        view_map[i] = len(views)
        views.append(v)
    for a in accessors:
        if "bufferView" in a:
            a["bufferView"] = view_map[a["bufferView"]]
    for im in g.get("images", []):
        if "bufferView" in im:
            im["bufferView"] = view_map[im["bufferView"]]
    for m in g["meshes"]:
        for p in m["primitives"]:
            p["attributes"] = {k: acc_map[v] for k, v in p["attributes"].items()}
            if "indices" in p:
                p["indices"] = acc_map[p["indices"]]
            if "targets" in p:
                p["targets"] = [{k: acc_map[v] for k, v in t.items()} for t in p["targets"]]
    for s in g.get("skins", []):
        if "inverseBindMatrices" in s:
            s["inverseBindMatrices"] = acc_map[s["inverseBindMatrices"]]
    for a in g["animations"]:
        for s in a["samplers"]:
            s["input"], s["output"] = acc_map[s["input"]], acc_map[s["output"]]
    while len(blob) % 4:
        blob.append(0)
    g["accessors"], g["bufferViews"] = accessors, views
    g["buffers"] = [{"byteLength": len(blob)}]
    g.setdefault("asset", {})["generator"] = "City Fun Time tools/monster_models.py (from Quaternius Ultimate Monsters, CC0)"
    js = json.dumps(g, separators=(",", ":")).encode()
    while len(js) % 4:
        js += b" "
    out = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(blob))
    out += struct.pack("<II", len(js), 0x4E4F534A) + js + struct.pack("<II", len(blob), 0x004E4942) + bytes(blob)
    dst.write_bytes(out)
    return len(out), [a["name"] for a in g["animations"]]


def main():
    root = pathlib.Path(sys.argv[1])
    total = 0
    for name, (folder, file, keep) in MODELS.items():
        n, anims = pack(root / folder / "glTF" / (file + ".gltf"), keep, OUT / ("mon-%s.glb" % name))
        total += n
        print("mon-%s.glb  %6.0f KB  %s" % (name, n / 1024, ", ".join(anims)))
    print("total %.1f MB" % (total / 1048576))


if __name__ == "__main__":
    main()

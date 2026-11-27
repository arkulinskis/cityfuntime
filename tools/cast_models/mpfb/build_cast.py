"""City Fun Time cast as realistic MPFB humans (2026-11-27), built in Blender (headless) and exported for three.js.

    blender -b -P build_cast.py -- OUT_DIR [ids...]        (no ids = all 11)

Per character: MPFB (MakeHuman for Blender) body with the CC0 MakeHuman skin, eyes, brows, lashes, teeth, hair and
clothes -> arms swung down (the game's rest pose: arms hang, faces -Z, left hand -X) -> scaled to the catalog height ->
clothes and hair recoloured per region (top / bottom / whole, measured in the baked texture so each region lands on its
target colour) + painted facial hair -> Cycles bakes every surface's colour and its ambient occlusion (the whole
assembled body occludes: collars, armpits, hair on the neck) -> one game rig (the 20 bone names cft-world drives:
MODEL_JOINTS + LipLower + LidL/LidR + hands/feet) with MPFB's 163 bone weights merged into it -> plain PBR materials
-> OUT_DIR/<id>.glb + OUT_DIR/<id>-portrait.png (Cycles head-and-shoulders) + OUT_DIR/<id>-preview.png (full body).
fix_rest.mjs then sets every bone's rest rotation to identity (the game copies its figure's joint quaternions onto them).
Run by ../build.py (python tools/cast_models/build.py --mpfb).
"""
import bpy, bmesh, sys, os, math
import numpy as np
from mathutils import Vector, Matrix, Quaternion

sys.path.insert(0, os.path.expanduser("~/Documents/CLAUDE/blender-studio/lib"))
import render
from bl_ext.blender_org.mpfb.services.humanservice import HumanService

DATA = os.path.join(os.environ["APPDATA"], "Blender Foundation/Blender/5.3/extensions/.user/blender_org/mpfb/data")


def age01(y):  # MakeHuman: 0.1875 = 11 y, 0.5 = 25, 1 = 90
    return 0.1875 + (y - 11) / 14 * 0.3125 if y <= 25 else 0.5 + (y - 25) / 65 * 0.5


def srgb(h):  # '#rrggbb' -> linear-ish target colour used on sRGB texture values (we edit sRGB pixels)
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])


# One entry per Actor Troop character (catalog.json desc in the comment). top/bottom/whole: sRGB colours the region of
# that clothing texture is moved to. facial: beard | mustache | stubble. extra: glasses | watch.
CAST = {
  # Woman, 30s, sharp and confident, dark bob, red blazer
  "ava": dict(g=0.0, age=34, mu=0.5, we=0.45, race=(0.0, 1.0, 0.0), skin="young_caucasian_female", eyes="brown", brows="eyebrow001",
              hair="bob02", hair_col="#2a1c16", clothes={"female_elegantsuit01": dict(top="#a3161c", bottom="#1d1d22"), "shoes05": dict(whole="#1a1a1a")}),
  # Muscular man, 30s, mohawk, black tank top and cargo pants, fighter
  "diego": dict(g=1.0, age=33, mu=0.95, we=0.6, race=(0.05, 0.75, 0.2), skin="middleage_caucasian_male", eyes="brown", brows="eyebrow007",
                hair="short04", hair_col="#141010", facial="stubble", clothes={"male_casualsuit06": dict(top="#2a2a2d", bottom="#5f6440"), "shoes03": {}}),
  # Older woman, 70, grey bun, purple cardigan, long skirt, wise
  "grace": dict(g=0.0, age=70, mu=0.4, we=0.55, race=(0.0, 1.0, 0.0), skin="old_caucasian_female", eyes="grey", brows="eyebrow002",
                hair="ponytail01", hair_col="#b9b6b2", clothes={"female_casualsuit01": dict(top="#5d3a7a", bottom="#3a3046"), "shoes02": {}}),
  # Young man, 20, spiky hair, yellow t-shirt and shorts, energetic
  "kenji": dict(g=1.0, age=20, mu=0.55, we=0.42, race=(1.0, 0.0, 0.0), skin="young_asian_male", eyes="brown", brows="eyebrow005",
                hair="short02", hair_col="#121010", clothes={"male_casualsuit04": dict(top="#f2c230", bottom="#8a7a5c"), "shoes06": {}}),
  # Woman, 20s, blonde ponytail, green sweater and skirt, cheerful
  "lena": dict(g=0.0, age=24, mu=0.5, we=0.45, race=(0.0, 1.0, 0.0), skin="young_caucasian_female2", eyes="blue", brows="eyebrow003",
               hair="ponytail01", hair_col="#d8b878", clothes={"female_casualsuit02": dict(top="#3f7a46", bottom="#2f4a36"), "shoes04": {}}),
  # Man, 30s, tall, short black hair, full beard, navy hoodie
  "marcus": dict(g=1.0, age=35, mu=0.65, we=0.6, race=(0.0, 0.2, 0.8), skin="middleage_african_male", eyes="brown", brows="eyebrow010",
                 hair="short01", hair_col="#0e0c0b", facial="beard", clothes={"male_casualsuit02": dict(top="#2f4277", bottom="#3d4c66"), "shoes03": {}}),
  # Woman, 30s, big afro, orange dress, warm and funny
  "nora": dict(g=0.0, age=33, mu=0.5, we=0.55, race=(0.0, 0.1, 0.9), skin="middleage_african_female", eyes="brownlight", brows="eyebrow004",
               hair="afro01", hair_col="#1a1210", clothes={"female_elegantsuit01": dict(top="#e2751e", bottom="#d0661a"), "shoes05": dict(whole="#5a3418")}),
  # Older man, 60s, bald with grey mustache, brown suit and fedora, gruff
  "otis": dict(g=1.0, age=64, mu=0.45, we=0.7, race=(0.0, 1.0, 0.0), skin="old_caucasian_male", eyes="grey", brows="eyebrow009",
               hair="", hair_col="#a8a39c", facial="mustache", clothes={"male_elegantsuit01": dict(whole="#5a3d26"), "fedora01": dict(whole="#4a3220"), "shoes02": {}}),
  # Man, 40s, glasses and mustache, white shirt and tie, precise
  "raj": dict(g=1.0, age=44, mu=0.5, we=0.55, race=(0.55, 0.25, 0.2), skin="middleage_asian_male", eyes="brown", brows="eyebrow008",
              hair="short01", hair_col="#15110f", facial="mustache", extra=["glasses"], clothes={"male_casualsuit03": dict(top="#eeeef0", bottom="#4a4e57"), "shoes02": {}}),
  # Teen girl, 15, curly hair, pink hoodie and jeans, sarcastic
  "zoe": dict(g=0.0, age=15, mu=0.45, we=0.42, race=(0.0, 0.55, 0.45), skin="young_african_female", eyes="brown", brows="eyebrow006",
              hair="afro01", hair_col="#3a2418", clothes={"female_casualsuit01": dict(top="#e8689e"), "shoes06": dict(whole="#e9e9ee")}),
  # Man, 30s, wavy swept-back dark hair, light stubble, all-black shirt and jeans, watch (the user's own likeness)
  "vitalijs": dict(g=1.0, age=34, mu=0.55, we=0.5, race=(0.0, 1.0, 0.0), skin="young_caucasian_male2", eyes="bluegreen", brows="eyebrow011",
                   hair="short02", hair_col="#2a2019", facial="stubble", extra=["watch"], clothes={"male_casualsuit03": dict(top="#262629", bottom="#2c2f38"), "shoes03": {}}),
}
HEIGHT = {"ava": 1.68, "diego": 1.8, "grace": 1.58, "kenji": 1.72, "lena": 1.65, "marcus": 1.88, "nora": 1.7, "otis": 1.76,
          "raj": 1.74, "zoe": 1.6, "vitalijs": 1.82}

# game bone -> parent (cft-world MODEL_JOINTS + face + hands/feet); left = -X in the game
GAME = [("Hips", None), ("Spine", "Hips"), ("Chest", "Spine"), ("Neck", "Chest"), ("Head", "Neck"), ("LipLower", "Head"),
        ("LidL", "Head"), ("LidR", "Head"),
        ("LeftUpperArm", "Chest"), ("LeftLowerArm", "LeftUpperArm"), ("LeftHand", "LeftLowerArm"),
        ("RightUpperArm", "Chest"), ("RightLowerArm", "RightUpperArm"), ("RightHand", "RightLowerArm"),
        ("LeftUpperLeg", "Hips"), ("LeftLowerLeg", "LeftUpperLeg"), ("LeftFoot", "LeftLowerLeg"),
        ("RightUpperLeg", "Hips"), ("RightLowerLeg", "RightUpperLeg"), ("RightFoot", "RightLowerLeg")]


def game_bone(name, parents):
    """MPFB deform bone -> game bone. MPFB .L is the character's left (= the game's Left after the 180 degree turn)."""
    side = "Left" if name.endswith(".L") else "Right" if name.endswith(".R") else ""
    b = name[:-2] if side else name
    chain = parents.get(name, [])
    if "jaw" in chain or b == "jaw":
        return "LipLower"
    if b == "orbicularis03":
        return "Lid" + ("L" if side == "Left" else "R")
    if b.startswith("upperarm"): return side + "UpperArm"
    if b.startswith("lowerarm"): return side + "LowerArm"
    if b.startswith(("wrist", "finger", "metacarpal")): return side + "Hand"
    if b.startswith("upperleg"): return side + "UpperLeg"
    if b.startswith("lowerleg"): return side + "LowerLeg"
    if b.startswith(("foot", "toe")): return side + "Foot"
    if b in ("root", "pelvis", "spine05"): return "Hips"
    if b in ("spine04", "spine03"): return "Spine"
    if b in ("spine02", "spine01", "breast", "clavicle", "shoulder01"): return "Chest"
    if b.startswith("neck"): return "Neck"
    return "Head"  # head, eyes, lower lids, the rest of the face


def op(obj, fn, **kw):
    with bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj], selected_editable_objects=[obj]):
        return fn(**kw)


def px(img):
    a = np.empty(img.size[0] * img.size[1] * 4, np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(img.size[1], img.size[0], 4)


def setpx(img, a):
    img.pixels.foreach_set(a.astype(np.float32).ravel())
    img.update()


def smooth01(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


# ------------------------------------------------------------------ build + pose
def make_human(cid):
    s = CAST[cid]
    info = HumanService._create_default_human_info_dict()
    a, c, af = s["race"]
    info["phenotype"].update(gender=s["g"], age=age01(s["age"]), muscle=s["mu"], weight=s["we"], height=0.5,
                             race=dict(asian=a, caucasian=c, african=af))
    info["name"] = cid
    info["rig"] = "default"
    info["eyes"] = "low-poly/low-poly.mhclo"
    info["eyebrows"] = f'{s["brows"]}/{s["brows"]}.mhclo'
    info["eyelashes"] = "eyelashes01/eyelashes01.mhclo"
    info["teeth"] = "teeth_base/teeth_base.mhclo"
    info["tongue"] = "tongue01/tongue01.mhclo"
    if s["hair"]:
        info["hair"] = f'{s["hair"]}/{s["hair"]}.mhclo'
    info["clothes"] = [f"{k}/{k}.mhclo" for k in s["clothes"]]
    info["skin_mhmat"] = f'{s["skin"]}/{s["skin"]}.mhmat'
    info["skin_material_type"] = "ENHANCED_SSS"
    info["eyes_material_type"] = "MAKESKIN"
    st = HumanService.get_default_deserialization_settings()
    st["subdiv_levels"] = 0
    body = HumanService.deserialize_from_dict(info, st)
    rig = body.parent
    return body, rig


def arms_down(rig):
    """Swing upper arms + forearms so each arm hangs (5 degrees out from the hip), then straighten the wrist."""
    bpy.context.view_layer.update()
    P = rig.pose.bones
    W = rig.matrix_world
    for side, sx in (("L", 1), ("R", -1)):
        target = Vector((sx * math.sin(math.radians(5)), 0, -math.cos(math.radians(5))))
        for bone, tip in (("upperarm01", "lowerarm01"), ("lowerarm01", "wrist"), ("wrist", "finger3-1")):
            pb, pt = P[f"{bone}.{side}"], P[f"{tip}.{side}"]
            d = (W @ pt.head) - (W @ pb.head)
            q = d.normalized().rotation_difference(target)
            h = pb.head.copy()
            pb.matrix = Matrix.Translation(h) @ q.to_matrix().to_4x4() @ Matrix.Translation(-h) @ pb.matrix
            bpy.context.view_layer.update()
    # legs straight under the hips (MPFB stands wide; the game's walk swings from a straight rest)
    for side, sx in (("L", 1), ("R", -1)):
        target = Vector((sx * math.sin(math.radians(1.5)), 0, -1)).normalized()
        for bone, tip in (("upperleg01", "lowerleg01"), ("lowerleg01", "foot")):
            pb, pt = P[f"{bone}.{side}"], P[f"{tip}.{side}"]
            d = (W @ pt.head) - (W @ pb.head)
            q = d.normalized().rotation_difference(target)
            h = pb.head.copy()
            pb.matrix = Matrix.Translation(h) @ q.to_matrix().to_4x4() @ Matrix.Translation(-h) @ pb.matrix
            bpy.context.view_layer.update()


def bake_pose(rig):
    for o in rig.children:
        if o.type != "MESH":
            continue
        if o.data.shape_keys:
            op(o, bpy.ops.object.shape_key_remove, all=True, apply_mix=True)
        for m in list(o.modifiers):
            if m.type in ("MASK", "ARMATURE"):
                op(o, bpy.ops.object.modifier_apply, modifier=m.name)
            elif m.type == "SUBSURF":
                o.modifiers.remove(m)


# ------------------------------------------------------------------ masks painted as vertex attributes
def add_attr(o, name, vals):
    if name in o.data.attributes:
        o.data.attributes.remove(o.data.attributes[name])
    at = o.data.attributes.new(name, "FLOAT_COLOR", "POINT")
    rgba = np.repeat(np.asarray(vals, np.float32)[:, None], 4, 1)
    rgba[:, 3] = 1
    at.data.foreach_set("color", rgba.ravel())


def verts(o):
    a = np.empty(len(o.data.vertices) * 3, np.float32)
    o.data.vertices.foreach_get("co", a)
    return a.reshape(-1, 3)


def facial_mask(body, kind, J, mouth):
    """Beard / mustache / stubble region on the body mesh (face looks +Y after the turn)."""
    v = verts(body)
    x, y, z = v[:, 0] - mouth[0], v[:, 1] - J["Head"][1], v[:, 2] - mouth[2]
    eye_z = J["LidL"][2] - mouth[2]
    my = v[:, 1] - mouth[1]                                   # depth from the lips: the nose sticks out past them
    nose = smooth01(my, -0.004, 0.006) * smooth01(z, 0.004, 0.012)
    front = smooth01(y, -0.035, 0.0)
    lips = np.exp(-((x / 0.026) ** 2 + (z / 0.013) ** 2) * 3)  # keep the lips bare
    if kind == "mustache":
        m = smooth01(z, 0.003, 0.008) * (1 - smooth01(z, 0.019, 0.026)) * (1 - smooth01(np.abs(x), 0.026, 0.034))
        m = m * front * (1 - lips * 0.9) * (1 - smooth01(my, 0.004, 0.012))
    else:
        chin = smooth01(z, -0.075, -0.055) * np.where(z < -0.04, smooth01(my, -0.075, -0.05), 1.0)  # under the jaw, not down the throat
        ztop = 0.006 + np.minimum(np.maximum(0, np.abs(x) - 0.022) * 0.75, 0.03)   # cheek line: mouth corner up to mid-ear
        top = 1 - smooth01(z - ztop, -0.014, 0.012)
        cheeks = 1.0
        musta = smooth01(z, 0.003, 0.008) * (1 - smooth01(z, 0.019, 0.026)) * (1 - smooth01(np.abs(x), 0.03, 0.038))
        m = np.maximum(chin * top * cheeks, musta) * smooth01(y, -0.06, -0.02) * (1 - lips) * (1 - nose)
    m = np.clip(m, 0, 1)
    sel = m > 0.5
    print("FHAIR", kind, "verts", int(sel.sum()), "x", np.round(np.percentile(x[sel], [5, 50, 95]), 3), "y", np.round(np.percentile(y[sel], [5, 50, 95]), 3),
          "z", np.round(np.percentile(z[sel], [5, 50, 95]), 3), "eye_z", round(float(eye_z), 3), "mouth", tuple(round(c, 3) for c in mouth), "head", tuple(round(c, 3) for c in J["Head"]))
    add_attr(body, "fhair", m)


def region_mask(o, waist):
    """1 = top, 0 = bottom. Shirts and trousers are usually separate loose pieces of one clothing mesh: a piece whose
    middle is above the waist is all top (so a long hem stays shirt). One-piece meshes fall back to the height cut."""
    z = np.array([(o.matrix_world @ v.co).z for v in o.data.vertices], np.float32)
    n = len(z)
    par = np.arange(n)
    def find(i):
        while par[i] != i:
            par[i] = par[par[i]]
            i = par[i]
        return i
    for e in o.data.edges:
        a, b = find(e.vertices[0]), find(e.vertices[1])
        if a != b:
            par[a] = b
    root = np.array([find(i) for i in range(n)])
    m = smooth01(z, waist - 0.02, waist + 0.02)
    parts = np.unique(root)
    if len(parts) > 1:
        for r in parts:
            sel = root == r
            lo, hi = z[sel].min(), z[sel].max()
            if hi > waist + 0.05 and lo < waist - 0.05 and sel.sum() > 0.6 * n:
                continue                       # one big piece across the waist: keep the height cut
            m[sel] = 1.0 if np.median(z[sel]) > waist else 0.0
    add_attr(o, "tmask", m)


# ------------------------------------------------------------------ extras (procedural)
def add_glasses(J, mouth, head_obj_ref):
    me = bpy.data.meshes.new("glasses")
    me_obj = bpy.data.objects.new("glasses", me)
    eyes = [J["LidL"], J["LidR"]]
    fy = max(e[1] for e in eyes) + 0.018
    # thicken the rims and build bridge + temples with a skin of cylinders
    bm = bmesh.new()
    def bar(a, b, r=0.0022):
        a, b = Vector(a), Vector(b)
        res = bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=r, radius2=r, depth=(b - a).length)
        q = Vector((0, 0, 1)).rotation_difference((b - a).normalized())
        bmesh.ops.rotate(bm, verts=res["verts"], cent=(0, 0, 0), matrix=q.to_matrix())
        bmesh.ops.translate(bm, verts=res["verts"], vec=(a + b) / 2)
    for e in eyes:
        pts = [Vector((e[0] + 0.021 * math.cos(t), fy, e[2] + 0.0165 * math.sin(t))) for t in np.linspace(0, 2 * math.pi, 19)]
        for p, q in zip(pts, pts[1:]):
            bar(p, q)
    l, r = sorted(eyes, key=lambda e: e[0])
    bar((l[0] + 0.021, fy, l[2] + 0.004), (r[0] - 0.021, fy, r[2] + 0.004))
    for e, sx in ((l, -1), (r, 1)):
        bar((e[0] + sx * 0.021, fy, e[2] + 0.004), (sx * 0.074, fy - 0.11, e[2] + 0.01))
    bm.to_mesh(me)
    bm.free()
    bpy.context.scene.collection.objects.link(me_obj)
    mat = bpy.data.materials.new("glasses")
    mat.use_nodes = True
    b = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (0.03, 0.03, 0.035, 1)
    b.inputs["Roughness"].default_value = 0.3
    me.materials.append(mat)
    me_obj["game_bone"] = "Head"
    return me_obj


def add_watch(J):
    hand, elbow = Vector(J["LeftHand"]), Vector(J["LeftLowerArm"])
    d = (hand - elbow).normalized()
    c = hand - d * 0.035
    bm = bmesh.new()
    res = bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=0.031, radius2=0.031, depth=0.02)
    q = Vector((0, 0, 1)).rotation_difference(d)
    bmesh.ops.rotate(bm, verts=res["verts"], cent=(0, 0, 0), matrix=q.to_matrix())
    face = bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=0.016, radius2=0.016, depth=0.008)
    bmesh.ops.rotate(bm, verts=face["verts"], cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, "X"))
    out = Vector((0, 1, 0)).cross(d).normalized()  # watch face on the outside of the wrist
    bmesh.ops.translate(bm, verts=face["verts"], vec=out * -0.03)
    bmesh.ops.translate(bm, verts=res["verts"] + face["verts"], vec=c)
    me = bpy.data.meshes.new("watch")
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new("watch", me)
    bpy.context.scene.collection.objects.link(o)
    mat = bpy.data.materials.new("watch")
    mat.use_nodes = True
    b = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (0.55, 0.56, 0.58, 1)
    b.inputs["Metallic"].default_value = 1
    b.inputs["Roughness"].default_value = 0.3
    me.materials.append(mat)
    o["game_bone"] = "LeftLowerArm"
    return o


# ------------------------------------------------------------------ baking
def bake(o, kind, size, emit_attr=None):
    """Bake one image for object o (all its materials into one image on its UV map)."""
    img = bpy.data.images.new(f"{o.name}.{kind}", size, size, alpha=True, float_buffer=False)
    img.colorspace_settings.name = "sRGB" if kind == "col" else "Non-Color"
    saved = []
    for slot in o.material_slots:
        m = slot.material
        nt = m.node_tree
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = img
        nt.nodes.active = n
        n.select = True
        if emit_attr:
            out = next(x for x in nt.nodes if x.type == "OUTPUT_MATERIAL" and x.is_active_output)
            old = out.inputs["Surface"].links[0].from_socket if out.inputs["Surface"].is_linked else None
            at = nt.nodes.new("ShaderNodeAttribute")
            at.attribute_name = emit_attr
            em = nt.nodes.new("ShaderNodeEmission")
            nt.links.new(at.outputs["Color"], em.inputs["Color"])
            nt.links.new(em.outputs[0], out.inputs["Surface"])
            saved.append((nt, n, out, old, [at, em]))
        else:
            saved.append((nt, n, None, None, []))
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    sc = bpy.context.scene
    if kind == "col":
        sc.cycles.samples = 4
        bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"}, margin=8)
    elif kind == "ao":
        sc.cycles.samples = 96
        bpy.ops.object.bake(type="AO", margin=8)
    else:
        sc.cycles.samples = 1
        bpy.ops.object.bake(type="EMIT", margin=8)
    for nt, n, out, old, extra in saved:
        nt.nodes.remove(n)
        for e in extra:
            nt.nodes.remove(e)
        if out is not None and old is not None:
            nt.links.new(old, out.inputs["Surface"])
    return img


def source_alpha(o, size):
    """The alpha of the object's own diffuse texture (hair cards, brows, lashes) at bake size (same UVs)."""
    for slot in o.material_slots:
        for n in slot.material.node_tree.nodes:
            if n.type == "TEX_IMAGE" and n.image and n.image.channels == 4 and "iffuse" in (n.label + n.image.name + "iffuse"):
                im = n.image.copy()
                im.scale(size, size)
                a = px(im)[..., 3].copy()
                bpy.data.images.remove(im)
                if a.min() < 0.98:
                    return a
    return None


def source_image(o, word):
    for slot in o.material_slots:
        for n in slot.material.node_tree.nodes:
            if n.type == "TEX_IMAGE" and n.image and word in n.label.lower():
                return n.image
    return None


def recolor(col, mask, target, alpha):
    """Move the pixels under mask to the target colour, keeping their light/dark detail (sRGB values).
    alpha: texels that count (covered by the UV islands and not see-through)."""
    L = col[..., :3] @ np.array([0.299, 0.587, 0.114])
    mask = mask * (alpha > 0.5)
    sel = mask > 0.5
    if sel.sum() < 50:
        return col
    avg = max(np.median(L[sel]), 0.03)
    rel = np.clip(L / avg, 0, 3) ** 0.85
    tgt = target[None, None, :] * rel[..., None]
    # keep a bit of the original's colour variation (denim, stripes) but mostly the new colour
    out = np.clip(tgt, 0, 1)
    col[..., :3] = col[..., :3] * (1 - mask[..., None]) + out * mask[..., None]
    return col


def dbg(out, name, a):
    if not os.environ.get("CFT_DEBUG"):
        return
    a = np.asarray(a)
    if a.ndim == 2:
        a = np.stack([a, a, a, np.ones_like(a)], -1)
    im = bpy.data.images.new("dbg", a.shape[1], a.shape[0], alpha=True)
    a = a.copy(); a[..., 3] = 1
    setpx(im, a)
    im.filepath_raw = os.path.join(out, "dbg_" + name + ".png"); im.file_format = "PNG"; im.save()
    bpy.data.images.remove(im)


# ------------------------------------------------------------------ game rig
def build_game_rig(objs, J):
    arm = bpy.data.armatures.new("Rig")
    rig = bpy.data.objects.new("Rig", arm)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    eb = {}
    for name, parent in GAME:
        b = arm.edit_bones.new(name)
        b.head = J[name]
        b.tail = Vector(J[name]) + Vector((0, 0, 0.04))
        if parent:
            b.parent = eb[parent]
        eb[name] = b
    bpy.ops.object.mode_set(mode="OBJECT")
    for o in objs:
        o.parent = rig
        o.matrix_parent_inverse = Matrix.Identity(4)
        md = o.modifiers.new("Rig", "ARMATURE")
        md.object = rig
    return rig


def remap_weights(o, parents):
    n = len(o.data.vertices)
    names = [g.name for g in o.vertex_groups]
    W = {b: np.zeros(n, np.float32) for b, _ in GAME}
    if "game_bone" in o.keys():
        W[o["game_bone"]][:] = 1
    else:
        for v in o.data.vertices:
            for ge in v.groups:
                gn = names[ge.group]
                if gn in parents:
                    W[game_bone(gn, parents)][v.index] += ge.weight
    tot = sum(W.values())
    miss = tot < 1e-5
    if miss.any():  # unweighted vertices ride the nearest... head for the face, hips otherwise
        W["Hips"][miss] = 1
        tot = sum(W.values())
    for g in list(o.vertex_groups):
        o.vertex_groups.remove(g)
    for b, w in W.items():
        w = w / tot
        idx = np.nonzero(w > 0.004)[0]
        if not len(idx):
            continue
        g = o.vertex_groups.new(name=b)
        for val in np.unique(np.round(w[idx], 3)):
            sel = idx[np.round(w[idx], 3) == val]
            g.add(sel.tolist(), float(val), "REPLACE")


# ------------------------------------------------------------------ export materials
ROUGH = {"body": 0.52, "hair": 0.5, "eyebrow": 0.6, "eyelashes": 0.6, "teeth": 0.25, "tongue": 0.35, "low-poly": 0.08}


def final_material(o, img, normal=None, alpha=False, rough=0.85):
    m = bpy.data.materials.new(o.name + ".m")
    m.use_nodes = True
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = img
    nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    if alpha == "mask":      # glTF MASK, cutoff 0.5: the exporter reads a Round node between texture alpha and BSDF alpha
        r = nt.nodes.new("ShaderNodeMath")
        r.operation = "ROUND"
        nt.links.new(t.outputs["Alpha"], r.inputs[0])
        nt.links.new(r.outputs[0], b.inputs["Alpha"])
    elif alpha:
        nt.links.new(t.outputs["Alpha"], b.inputs["Alpha"])
        m.surface_render_method = "BLENDED"
    b.inputs["Roughness"].default_value = rough
    if normal is not None:
        nm = nt.nodes.new("ShaderNodeNormalMap")
        tn = nt.nodes.new("ShaderNodeTexImage")
        tn.image = normal
        normal.colorspace_settings.name = "Non-Color"
        nt.links.new(tn.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    o.data.materials.clear()
    o.data.materials.append(m)


# ------------------------------------------------------------------ renders
def studio(target_z, dist, w, h, path, focal=50):
    sc = bpy.context.scene
    cam = bpy.data.objects.get("cam") or bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    if cam.name not in sc.collection.objects:
        sc.collection.objects.link(cam)
    cam.data.lens = focal
    cam.location = (0.0, dist, target_z)
    cam.rotation_euler = (math.radians(90), 0, math.radians(180))
    sc.camera = cam
    if not bpy.data.objects.get("key"):
        for nm, rot, e, size in (("key", (0.9, 0.0, 2.6), 4.0, 3), ("fill", (1.2, 0.0, -2.4), 1.2, 5), ("rim", (2.4, 0, 0.1), 3.0, 2)):
            L = bpy.data.objects.new(nm, bpy.data.lights.new(nm, "SUN"))
            L.data.energy = e
            L.data.angle = math.radians(size * 4)
            L.rotation_euler = rot
            sc.collection.objects.link(L)
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.film_transparent = False
    sc.cycles.samples = 64
    sc.cycles.use_denoising = True
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


# ------------------------------------------------------------------ one character
def build(cid, out):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    try:
        sc.render.engine = "CYCLES"
    except TypeError:
        pass
    render.gpu()
    w = bpy.data.worlds.new("w")
    sc.world = w
    w.use_nodes = True
    bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs[0].default_value = (0.42, 0.45, 0.5, 1)
    bg.inputs[1].default_value = 0.9
    w.light_settings.distance = 0.12
    s = CAST[cid]
    body, mrig = make_human(cid)
    parents = {b.name: [p.name for p in b.parent_recursive] for b in mrig.data.bones if b.use_deform}
    # eye colour: swap the eye texture for the chosen iris
    eye = next(o for o in mrig.children if o.name.endswith("low-poly"))
    ei = source_image(eye, "diffuse")
    if ei:
        ei.filepath = os.path.join(DATA, "eyes", "materials", s["eyes"] + "_eye.png")
        ei.reload()
    # top / bottom split of the clothes, measured in the A-pose (sleeves belong to the top)
    bpy.context.view_layer.update()
    P0 = {pb.name: mrig.matrix_world @ pb.head for pb in mrig.pose.bones}
    k0 = HEIGHT[cid] / max((body.matrix_world @ Vector(c)).z for c in body.bound_box)
    waist0 = (P0["upperleg01.L"].z + P0["upperleg01.R"].z) / 2 + 0.092 / k0
    for o in mrig.children:
        if o.type == "MESH":
            region_mask(o, waist0)
    arms_down(mrig)
    bpy.context.view_layer.update()
    P = {pb.name: mrig.matrix_world @ pb.head for pb in mrig.pose.bones}
    bake_pose(mrig)
    objs = [o for o in mrig.children if o.type == "MESH"]
    # turn 180 degrees (face +Y in Blender = -Z in glTF) and scale to the catalog height
    bz = max((body.matrix_world @ Vector(c)).z for c in body.bound_box)
    k = HEIGHT[cid] / bz
    M = Matrix.Rotation(math.pi, 4, "Z") @ Matrix.Scale(k, 4)
    for o in objs:
        o.parent = None
        o.data.transform(M @ o.matrix_world)
        o.matrix_world = Matrix.Identity(4)
    bpy.data.objects.remove(mrig)
    T = {n: M @ v for n, v in P.items()}
    J = {
        "Hips": (T["upperleg01.L"] + T["upperleg01.R"]) / 2 + Vector((0, 0, 0.012)),
        "Spine": T["spine04"], "Chest": T["spine02"], "Neck": T["neck01"], "Head": T["head"], "LipLower": T["jaw"],
        "LidL": T["eye.L"], "LidR": T["eye.R"],
    }
    for side, s_ in (("L", "Left"), ("R", "Right")):
        J[s_ + "UpperArm"] = T[f"upperarm01.{side}"]
        J[s_ + "LowerArm"] = T[f"lowerarm01.{side}"]
        J[s_ + "Hand"] = T[f"wrist.{side}"]
        J[s_ + "UpperLeg"] = T[f"upperleg01.{side}"]
        J[s_ + "LowerLeg"] = T[f"lowerleg01.{side}"]
        J[s_ + "Foot"] = T[f"foot.{side}"]
    J = {n: Vector(v) for n, v in J.items()}
    teeth = next(o for o in objs if "teeth" in o.name)
    tv = verts(teeth)
    front = tv[tv[:, 1] > tv[:, 1].max() - 0.006]
    mouth = Vector((0.0, float(front[:, 1].max()), float(np.median(front[:, 2]))))
    # extras
    extra = []
    if "glasses" in s.get("extra", []):
        extra.append(add_glasses(J, mouth, None))
    if "watch" in s.get("extra", []):
        extra.append(add_watch(J))
    # masks
    waist = J["Hips"].z + 0.08
    if s.get("facial"):
        facial_mask(body, s["facial"], J, mouth)
    # bake colour + AO + masks per surface
    size_of = lambda o: 2048 if o is body else 256 if any(t in o.name for t in ("eyebrow", "eyelashes", "teeth", "tongue", "low-poly")) else 1024
    finals = []
    for o in objs:
        sz = size_of(o)
        col = px(bake(o, "col", sz))
        cover = col[..., 3] > 0.5          # texels the bake wrote (inside the UV islands)
        ao = px(bake(o, "ao", sz))[..., 0]
        nm = o.name.split(".", 1)[-1]
        alpha = source_alpha(o, sz) if any(t in nm for t in ("eyebrow", "eyelashes")) or nm == s["hair"] else None
        a = alpha if alpha is not None else np.ones(col.shape[:2], np.float32)
        ca = a * cover
        spec = s["clothes"].get(nm)
        is_hair = s["hair"] and nm == s["hair"]
        if spec or is_hair or (s.get("facial") and o is body):
            tm = px(bake(o, "mask", sz, emit_attr="tmask"))[..., 0]
            dbg(out, f"{cid}_{nm}_tmask", tm)
            dbg(out, f"{cid}_{nm}_col", col)
            if spec and "whole" in spec:
                col = recolor(col, np.ones_like(tm), srgb(spec["whole"]),ca)
            if spec and "top" in spec:
                col = recolor(col, tm, srgb(spec["top"]),ca)
            if spec and "bottom" in spec:
                col = recolor(col, 1 - tm, srgb(spec["bottom"]),ca)
            if is_hair:
                col = recolor(col, np.ones_like(tm), srgb(s["hair_col"]),ca)
            if o is body and s.get("facial"):
                fm = px(bake(o, "mask", sz, emit_attr="fhair"))[..., 0]
                dbg(out, f"{cid}_fhair", fm)
                rng = np.random.default_rng(7)
                n = rng.random(fm.shape).astype(np.float32)
                st = sum(np.roll(n, k, 0) for k in range(-3, 4)) / 7          # short strands along the UV's v axis
                st = (st + np.roll(st, 1, 1) + np.roll(st, -1, 1)) / 3
                st = np.clip((st - st.mean()) / (st.std() * 3) + 0.5, 0, 1)
                lo = rng.random((fm.shape[0] // 32 + 1, fm.shape[1] // 32 + 1)).astype(np.float32)
                lo = np.kron(lo, np.ones((32, 32), np.float32))[:fm.shape[0], :fm.shape[1]]
                for ax in (0, 1):
                    lo = sum(np.roll(lo, k, ax) for k in range(-16, 17, 4)) / 9
                dens = {"beard": 0.85, "mustache": 0.88, "stubble": 0.28}[s["facial"]]
                hc = srgb(s["hair_col"]) if s["facial"] != "stubble" else None
                edge = smooth01(fm + (lo - 0.5) * 0.18, 0.25, 0.7)               # soft edge, a little uneven
                if s["facial"] == "stubble":   # an even shadow of short hair, fine grain only
                    cover = np.clip(edge * dens * (0.8 + 0.4 * n), 0, 1)[..., None]
                else:
                    cover = np.clip(edge * dens * (0.72 + 0.4 * st), 0, 1)[..., None]
                col[..., :3] *= 1 - 0.15 * edge[..., None] * dens            # beard shadow on the skin
                if hc is None:   # stubble: the skin goes a cool grey-dark, as short dark hair under the skin does
                    hc = col[..., :3] * np.array([0.58, 0.6, 0.66])
                    col[..., :3] = col[..., :3] * (1 - cover) + hc * cover
                else:
                    col[..., :3] = col[..., :3] * (1 - cover) + hc[None, None, :] * cover
        if "low-poly" in nm:   # eyes: the MakeHuman sclera is veiny pink; whiten it (bright, low-saturation texels), keep the iris
            v = col[..., :3].max(-1)
            g = col[..., :3].mean(-1, keepdims=True)
            w = smooth01(v, 0.5, 0.75)[..., None]
            col[..., :3] = col[..., :3] * (1 - w) + np.clip(g * 1.06 + 0.03, 0, 1) * w
        # ambient occlusion: softer on hair cards and the eyes
        strength = 0.45 if is_hair else 0.2 if "low-poly" in nm else 0.75
        col[..., :3] *= (1 - strength + strength * np.clip(ao, 0, 1) ** 0.8)[..., None]
        col[..., 3] = a
        img = bpy.data.images.new(f"{cid}_{nm}", sz if o is not body else 1024, sz if o is not body else 1024, alpha=alpha is not None)
        if o is body:
            big = bpy.data.images.new("tmp", sz, sz, alpha=False)
            setpx(big, col)
            big.scale(1024, 1024)
            col = px(big)
            bpy.data.images.remove(big)
        setpx(img, col)
        img.file_format = "PNG" if alpha is not None else "JPEG"
        nrm = source_image(o, "normal")
        if nrm is not None:
            tmp = bpy.data.images.load(bpy.path.abspath(nrm.filepath), check_existing=False)
            tmp.colorspace_settings.name = "Non-Color"
            tmp.scale(512, 512)
            nrm = bpy.data.images.new(f"{cid}_{nm}_n", 512, 512, alpha=False)
            nrm.colorspace_settings.name = "Non-Color"
            setpx(nrm, px(tmp))
            bpy.data.images.remove(tmp)
            print("NORMAL", nm, round(float(px(nrm)[..., 2].mean()), 3))
        finals.append((o, img, nrm, ("mask" if nm == s["hair"] else "blend") if alpha is not None else False, ROUGH.get(nm.split("0")[0] if "eyebrow" in nm else nm, 0.85)))
    for o, img, nrm, al, r in finals:
        final_material(o, img, None, al, r)
    allm = objs + extra
    # remove the inner-mouth tongue (never seen at game distance) to save triangles
    rig = build_game_rig(allm, J)
    for o in allm:
        remap_weights(o, parents)
    # renders: portrait + full body preview (face +Y, so the camera stands at +Y looking -Y)
    head = J["Head"]
    studio(head.z + 0.03, head.y + 0.95, 320, 320, os.path.join(out, cid + "-portrait.png"), focal=85)
    studio(HEIGHT[cid] * 0.52, 4.6, 360, 640, os.path.join(out, cid + "-preview.png"), focal=50)
    # export: now the cloth normal maps go in
    for o, img, nrm, al, r in finals:
        if nrm is not None:
            final_material(o, img, nrm, al, r)
    for o in bpy.data.objects:
        o.select_set(o in allm or o is rig)
    for nm in ("cam", "key", "fill", "rim"):
        if bpy.data.objects.get(nm):
            bpy.data.objects.remove(bpy.data.objects[nm])
    bpy.ops.export_scene.gltf(filepath=os.path.join(out, cid + ".glb"), export_format="GLB", use_selection=True,
                              export_yup=True, export_skins=True, export_animations=False, export_morph=False,
                              export_image_format="WEBP", export_image_quality=82, export_def_bones=False,
                              export_apply=False, export_texcoords=True, export_normals=True, export_tangents=False,
                              export_materials="EXPORT")
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, cid + ".blend"))
    print("BUILT", cid, {o.name: len(o.data.polygons) for o in allm})


if __name__ == "__main__":
    a = sys.argv[sys.argv.index("--") + 1:]
    out = a[0]
    os.makedirs(out, exist_ok=True)
    for cid in (a[1:] or list(CAST)):
        build(cid, out)

"""City Fun Time passers-by as realistic MPFB humans (2026-11-27), built in Blender (headless) for three.js.

    blender -b -P build_crowd.py -- OUT_DIR [ids...]        (no ids = all of CROWD)

Each townsperson is made exactly like a cast member (build_cast.build: MPFB body, CC0 skin, clothes recoloured per region,
hair, painted facial hair, Cycles-baked colour + ambient occlusion, the game rig) and then made cheap enough for dozens
on screen at once: every surface's baked texture goes into ONE 1024 px atlas (body, top/outfit and hair 512 px, shoes and
hats 256 px, eyes/brows/lashes/teeth/glasses 128 px), the meshes are joined into ONE skinned mesh with ONE material
(alpha-tested, so hair cards and brows still cut out), the tongue is dropped and there are no normal maps.
-> OUT_DIR/<id>.glb + OUT_DIR/<id>-preview.png. ../build.py --crowd runs this, fix_rest.mjs and a stronger slim.
Looks: CROWD in crowd_looks.py.
"""
import bpy, sys, os
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_cast as bc
from crowd_looks import CROWD

A = 1024  # atlas size


def base_image(o):
    m = o.data.materials[0] if o.data.materials else None
    if not m or not m.use_nodes:
        return None, (0.5, 0.5, 0.5)
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    s = b.inputs["Base Color"]
    if s.is_linked and s.links[0].from_node.type == "TEX_IMAGE":
        return s.links[0].from_node.image, None
    c = s.default_value
    return None, (c[0], c[1], c[2])


def to_srgb(c):
    c = np.asarray(c, np.float32)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(np.maximum(c, 0), 1 / 2.4) - 0.055)


class Packer:
    """Quadtree squares in an A x A atlas."""
    def __init__(self):
        self.free = [(0, 0, A)]

    def take(self, s):
        fits = sorted([f for f in self.free if f[2] >= s], key=lambda f: f[2])
        if not fits:
            raise RuntimeError("atlas full")
        f = fits[0]
        self.free.remove(f)
        while f[2] > s:
            x, y, w = f
            h = w // 2
            self.free += [(x + h, y, h), (x, y + h, h), (x + h, y + h, h)]
            f = (x, y, h)
        return f


def atlas(cid, out):
    meshes = [o for o in bpy.data.objects if o.type == "MESH" and o.modifiers.get("Rig")]
    rig = bpy.data.objects["Rig"]
    for o in list(meshes):
        if "tongue" in o.name:
            meshes.remove(o)
            bpy.data.objects.remove(o)
    spec = CROWD[cid]
    body = next(o for o in meshes if o.name.endswith(".body"))
    small = ("eyebrow", "eyelashes", "teeth", "low-poly", "glasses", "watch")
    clothes = sorted([o for o in meshes if o is not body and not any(t in o.name for t in small) and not (spec["hair"] and o.name.endswith(spec["hair"]))],
                     key=lambda o: -len(o.data.polygons))
    hair = [o for o in meshes if spec["hair"] and o.name.endswith(spec["hair"])]
    size = {body: 512}
    for o in hair:
        size[o] = 512
    for i, o in enumerate(clothes):
        size[o] = 512 if i == 0 else 256
    for o in meshes:
        size.setdefault(o, 128)
    pk = Packer()
    pix = np.zeros((A, A, 4), np.float32)
    pix[..., 3] = 1
    for o in sorted(meshes, key=lambda o: -size[o]):
        s = size[o]
        x0, y0, _ = pk.take(s)
        img, col = base_image(o)
        if img is not None:
            src = bc.px(img)          # (img.copy() of a generated image comes back blank: copy the pixels)
            t = bpy.data.images.new("tmp", img.size[0], img.size[1], alpha=True)
            bc.setpx(t, src)
            t.scale(s, s)
            a = bc.px(t)
            bpy.data.images.remove(t)
            pix[y0:y0 + s, x0:x0 + s] = a
            if not any(k in o.name for k in ("eyebrow", "eyelashes")) and not (spec["hair"] and o.name.endswith(spec["hair"])):
                pix[y0:y0 + s, x0:x0 + s, 3] = 1
        else:
            pix[y0:y0 + s, x0:x0 + s, :3] = to_srgb(col)
            pix[y0:y0 + s, x0:x0 + s, 3] = 1
        # UVs into the cell (2 px inset so mip levels do not bleed far)
        me = o.data
        if not me.uv_layers:
            me.uv_layers.new(name="UVMap")
        keep = me.uv_layers.active
        for l in [l for l in me.uv_layers if l != keep]:
            me.uv_layers.remove(l)
        me.uv_layers[0].name = "UVMap"
        uv = np.empty(len(me.loops) * 2, np.float32)
        me.uv_layers[0].data.foreach_get("uv", uv)
        uv = uv.reshape(-1, 2)
        if img is None:
            uv[:] = 0.5
        if uv.min() < -0.01 or uv.max() > 1.01:
            print("WARN uv outside 0-1", o.name, uv.min(), uv.max())
        uv = np.clip(uv, 0, 1)
        pad = 2 / s
        uv = uv * (1 - 2 * pad) + pad
        uv[:, 0] = (x0 + uv[:, 0] * s) / A
        uv[:, 1] = (y0 + uv[:, 1] * s) / A
        me.uv_layers[0].data.foreach_set("uv", uv.ravel())
    im = bpy.data.images.new(cid + "_atlas", A, A, alpha=True)
    bc.setpx(im, pix)
    # one mesh, one material
    for o in meshes:
        o.data.materials.clear()
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    body.name = "Body"
    m = bpy.data.materials.new(cid)
    m.use_nodes = True
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = im
    nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    r = nt.nodes.new("ShaderNodeMath")
    r.operation = "ROUND"
    nt.links.new(t.outputs["Alpha"], r.inputs[0])
    nt.links.new(r.outputs[0], b.inputs["Alpha"])
    b.inputs["Roughness"].default_value = 0.7
    body.data.materials.append(m)
    for p in body.data.polygons:
        p.material_index = 0
    for nm in ("cam", "key", "fill", "rim"):
        if bpy.data.objects.get(nm):
            bpy.data.objects.remove(bpy.data.objects[nm])
    bc.studio(spec["h"] * 0.52, 4.6, 300, 540, os.path.join(out, cid + "-preview.png"), focal=50)
    for o in bpy.data.objects:
        o.select_set(o is body or o is rig)
    bpy.ops.export_scene.gltf(filepath=os.path.join(out, cid + ".glb"), export_format="GLB", use_selection=True,
                              export_yup=True, export_skins=True, export_animations=False, export_morph=False,
                              export_image_format="WEBP", export_image_quality=80, export_def_bones=False,
                              export_apply=False, export_texcoords=True, export_normals=True, export_tangents=False,
                              export_materials="EXPORT")
    print("CROWD", cid, "faces", len(body.data.polygons))


if __name__ == "__main__":
    a = sys.argv[sys.argv.index("--") + 1:]
    out = a[0]
    os.makedirs(out, exist_ok=True)
    work = os.path.join(out, "_cast")
    os.makedirs(work, exist_ok=True)
    for cid in (a[1:] or list(CROWD)):
        bc.CAST[cid] = CROWD[cid]
        bc.HEIGHT[cid] = CROWD[cid]["h"]
        bc.build(cid, work)
        atlas(cid, out)

"""Re-textures the figment models in Blender (2026-11-27): the Quaternius monsters came with one flat colour-swatch atlas.

    blender -b -P tools/monster_render.py [-- name ...]        (no names = all 12; writes theme/assets/mon-<name>.glb)

Per model: import theme/assets/mon-<name>.glb (rig, skin weights and the kept animation clips come along) -> a new UV
layout (Smart UV Project) -> Cycles bakes, onto that layout, the atlas colour times a procedural surface for what the
creature is (RECIPE: slime bubbles, feathers, fish scales, leathery skin with pores, cloth weave, ghostly haze), and the
model's own ambient occlusion -> a 1024 px colour map and the surface's bump as a tangent-space normal map -> exported
again as mon-<name>.glb (WebP textures, same clip names). cft-world loadMonsters uses map + normalMap + roughness.
The untouched originals are in git history (and tools/monster_models.py rebuilds them from the pack).
Bump `?v=` in cft-world loadMonsters after re-running.
"""
import bpy, os, sys, math
import numpy as np

sys.path.insert(0, os.path.expanduser("~/Documents/CLAUDE/blender-studio/lib"))
import render

ASSETS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "theme", "assets")
OUT = os.environ.get("MON_OUT") or ASSETS
# name -> (recipe, roughness)
RECIPE = {"greenblob": ("slime", 0.18), "pinkblob": ("slime", 0.18), "spikyblob": ("slime", 0.22), "fatpigeon": ("feather", 0.75),
          "pigeon": ("feather", 0.75), "ghost": ("ghost", 0.45), "ghostskull": ("ghost", 0.45), "ninja": ("cloth", 0.85),
          "fish": ("scales", 0.3), "bluedemon": ("skin", 0.5), "orc": ("skin", 0.6), "alien": ("skin", 0.4)}


def nodes_for(nt, recipe, height):
    """-> (colour multiplier socket, bump height socket, bump strength). Object coordinates, scaled so the patterns are
    the same size on every model whatever its file units."""
    N = nt.nodes.new
    tc = N("ShaderNodeTexCoord")
    sc = N("ShaderNodeVectorMath"); sc.operation = "SCALE"; sc.inputs["Scale"].default_value = 1.6 / height
    nt.links.new(tc.outputs["Object"], sc.inputs[0])
    P = sc.outputs[0]

    def noise(scale, detail=4, rough=0.55, dist=0.0):
        n = N("ShaderNodeTexNoise"); n.inputs["Scale"].default_value = scale; n.inputs["Detail"].default_value = detail
        n.inputs["Roughness"].default_value = rough; n.inputs["Distortion"].default_value = dist
        nt.links.new(P, n.inputs["Vector"]); return n.outputs["Fac"]

    def voronoi(scale, feature="F1", out="Distance", rand=1.0):
        v = N("ShaderNodeTexVoronoi"); v.feature = feature; v.inputs["Scale"].default_value = scale
        v.inputs["Randomness"].default_value = rand
        nt.links.new(P, v.inputs["Vector"]); return v.outputs[out]

    def math(op, a, b=None, c=None):
        m = N("ShaderNodeMath"); m.operation = op
        for i, x in enumerate((a, b, c)):
            if x is None: continue
            if isinstance(x, (int, float)): m.inputs[i].default_value = x
            else: nt.links.new(x, m.inputs[i])
        return m.outputs[0]

    if recipe == "slime":      # bubbles (lighter, raised) in a wobbly gel
        bub = math("LESS_THAN", voronoi(14), 0.16)
        small = math("LESS_THAN", voronoi(38), 0.12)
        b = math("MAXIMUM", bub, math("MULTIPLY", small, 0.6))
        col = math("ADD", math("MULTIPLY_ADD", noise(4), 0.25, 0.86), math("MULTIPLY", b, 0.18))
        h = math("ADD", math("MULTIPLY", noise(6), 0.4), math("MULTIPLY", b, 0.6))
        return col, h, 0.35
    if recipe == "feather":    # overlapping feather scallops + fine barbs
        sc_ = voronoi(26)
        barbs = noise(160, 2, 0.4)
        col = math("MULTIPLY_ADD", math("ADD", math("MULTIPLY", sc_, 0.6), math("MULTIPLY", barbs, 0.4)), 0.38, 0.72)
        h = math("ADD", sc_, math("MULTIPLY", barbs, 0.5))
        return col, h, 0.5
    if recipe == "scales":     # fish scales: dark rims, shiny middles
        d = voronoi(48)
        col = math("MULTIPLY_ADD", math("POWER", d, 0.6), 0.45, 0.68)
        return col, d, 0.6
    if recipe == "cloth":      # woven fabric + soft creases
        w1 = N("ShaderNodeTexWave"); w1.inputs["Scale"].default_value = 90; nt.links.new(P, w1.inputs["Vector"])
        w2 = N("ShaderNodeTexWave"); w2.inputs["Scale"].default_value = 90; w2.bands_direction = "Y"; nt.links.new(P, w2.inputs["Vector"])
        weave = math("MULTIPLY", math("ADD", w1.outputs["Fac"], w2.outputs["Fac"]), 0.5)
        crease = noise(5, 3, 0.5, 0.6)
        col = math("MULTIPLY_ADD", math("ADD", math("MULTIPLY", weave, 0.5), math("MULTIPLY", crease, 0.5)), 0.3, 0.82)
        return col, math("ADD", weave, crease), 0.4
    if recipe == "ghost":      # soft drifting haze, almost no relief
        col = math("MULTIPLY_ADD", noise(3, 6, 0.6, 1.5), 0.3, 0.84)
        return col, noise(8, 3), 0.12
    # skin: leathery folds + pores + mottled colour
    folds = noise(9, 6, 0.6, 0.4)
    pores = math("LESS_THAN", voronoi(140), 0.18)
    mott = noise(3.5, 3)
    col = math("MULTIPLY_ADD", math("ADD", math("MULTIPLY", mott, 0.7), math("MULTIPLY", folds, 0.3)), 0.32, 0.82)
    col = math("SUBTRACT", col, math("MULTIPLY", pores, 0.06))
    h = math("SUBTRACT", folds, math("MULTIPLY", pores, 0.25))
    return col, h, 0.45


def px(img):
    a = np.empty(img.size[0] * img.size[1] * 4, np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(img.size[1], img.size[0], 4)


def one(name):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    render.gpu()
    w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True
    bpy.ops.import_scene.gltf(filepath=os.path.join(ASSETS, f"mon-{name}.glb"))
    meshes = [o for o in sc.objects if o.type == "MESH"]
    recipe, rough = RECIPE[name]
    zs = [(o.matrix_world @ v.co).z for o in meshes for v in o.data.vertices]
    height = max(zs) - min(zs)
    w.light_settings.distance = height * 0.08
    S = 1024
    for o in meshes:
        if not o.data.uv_layers or not o.material_slots or not o.material_slots[0].material:
            print("skip mesh", o.name, len(o.data.polygons)); continue
        old_uv = o.data.uv_layers[0].name
        new = o.data.uv_layers.new(name="baked")
        o.data.uv_layers.active = new
        bpy.ops.object.select_all(action="DESELECT"); o.select_set(True); bpy.context.view_layer.objects.active = o
        bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004)
        bpy.ops.object.mode_set(mode="OBJECT")
        m = o.material_slots[0].material
        nt = m.node_tree
        bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
        atlas = next(n for n in nt.nodes if n.type == "TEX_IMAGE")
        uvn = nt.nodes.new("ShaderNodeUVMap"); uvn.uv_map = old_uv
        nt.links.new(uvn.outputs["UV"], atlas.inputs["Vector"])
        cm, h, bs = nodes_for(nt, recipe, height)
        mul = nt.nodes.new("ShaderNodeMix"); mul.data_type = "RGBA"; mul.blend_type = "MULTIPLY"; mul.inputs["Factor"].default_value = 1
        nt.links.new(atlas.outputs["Color"], mul.inputs[6]); nt.links.new(cm, mul.inputs[7])
        nt.links.new(mul.outputs[2], bsdf.inputs["Base Color"])
        bump = nt.nodes.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = bs; bump.inputs["Distance"].default_value = height * 0.004
        nt.links.new(h, bump.inputs["Height"]); nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
        out = {}
        for kind in ("col", "ao", "nrm"):
            img = bpy.data.images.new(f"{name}_{kind}", S, S, alpha=False)
            img.colorspace_settings.name = "sRGB" if kind == "col" else "Non-Color"
            t = nt.nodes.new("ShaderNodeTexImage"); t.image = img
            uvb = nt.nodes.new("ShaderNodeUVMap"); uvb.uv_map = "baked"; nt.links.new(uvb.outputs["UV"], t.inputs["Vector"])
            for n in nt.nodes: n.select = False
            t.select = True; nt.nodes.active = t
            if kind == "col":
                sc.cycles.samples = 4; bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"}, margin=6)
            elif kind == "ao":
                sc.cycles.samples = 128; bpy.ops.object.bake(type="AO", margin=6)
            else:
                sc.cycles.samples = 4; bpy.ops.object.bake(type="NORMAL", normal_space="TANGENT", margin=6, uv_layer="baked")
            out[kind] = (img, t)
        c = px(out["col"][0]); ao = px(out["ao"][0])[..., 0]
        c[..., :3] *= (0.3 + 0.7 * np.clip(ao, 0, 1) ** 0.9)[..., None]
        out["col"][0].pixels.foreach_set(c.ravel()); out["col"][0].update()
        # final material: baked colour + normal map on the new UVs only
        fm = bpy.data.materials.new(f"{name}")
        fm.use_nodes = True
        ft = fm.node_tree
        fb = next(n for n in ft.nodes if n.type == "BSDF_PRINCIPLED")
        ci = ft.nodes.new("ShaderNodeTexImage"); ci.image = out["col"][0]
        ni = ft.nodes.new("ShaderNodeTexImage"); ni.image = out["nrm"][0]
        nm = ft.nodes.new("ShaderNodeNormalMap")
        ft.links.new(ci.outputs["Color"], fb.inputs["Base Color"])
        ft.links.new(ni.outputs["Color"], nm.inputs["Color"]); ft.links.new(nm.outputs["Normal"], fb.inputs["Normal"])
        fb.inputs["Roughness"].default_value = rough
        o.data.materials.clear(); o.data.materials.append(fm)
        o.data.uv_layers.remove(o.data.uv_layers[old_uv])
    clips = sorted(a.name for a in bpy.data.actions)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, f"mon-{name}.glb"), export_format="GLB", export_yup=True,
                              export_skins=True, export_animations=True, export_animation_mode="ACTIONS",
                              export_image_format="WEBP", export_image_quality=85, export_tangents=False, export_morph=False)
    print("MON", name, "height %.2f" % height, "clips", clips)


a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
for n in (a or list(RECIPE)):
    one(n)

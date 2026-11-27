"""Detail textures for trees and street objects, rendered in Blender (2026-11-27).

    blender -b -P tools/material_render.py [-- name ...]

Each one is a seamless 512 px tile in two files: theme/assets/mat-<name>.jpg (colour, rendered under an even white sky
so crevices and overlaps are shaded) and mat-<name>-h.jpg (height, white = high). cft-gfx.js projects them onto
untextured geometry (triplanar in object space, so instanced props and merged trees need no UVs), divides the colour
by its average (the object keeps its own vertex colour, the texture adds detail) and bump-maps from the height.
  bark    Poly Haven bark_brown_02 (displaced)        tree trunks and limbs
  leaves  ~2,700 bent leaf cards scattered in layers  tree crowns, bushes, hedges (built here, no photo)
  wood    Poly Haven weathered_brown_planks           benches, crates, planters (surface class 10)
  grime   Poly Haven concrete_floor_worn_001          everything matte (class 0): a faint weathering
  metal   brushed steel built from tileable 4D noise   class 3: poles, bins, rails
Order = layer order in cft-gfx MAT_TEX. Bump `?v=` there after re-rendering.
"""
import bpy, bmesh, os, sys, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.expanduser("~/Documents/CLAUDE/blender-studio/lib"))
import ground_render as GR
import polyhaven, render

OUT = os.environ.get("GROUND_OUT") or GR.OUT
SETS = {"bark": ("bark_brown_02", 0.05, 1.0), "wood": ("weathered_brown_planks", 0.015, 1.0),
        "grime": ("concrete_floor_worn_001", 0.01, 1.0)}
ORDER = ["bark", "leaves", "wood", "grime", "metal"]


def save_height_from_disp(ph, name):
    maps = polyhaven.texture_maps(ph, "2k")
    im = bpy.data.images.load(maps["disp"])
    im.scale(512, 512)
    im.filepath_raw = os.path.join(OUT, f"mat-{name}-h.jpg")
    im.file_format = "JPEG"
    im.save()


def leaves_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    render.gpu()
    sc.view_settings.view_transform = "Standard"
    sc.cycles.samples = 256
    sc.cycles.use_denoising = True
    rnd = random.Random(11)
    bm = bmesh.new()
    col = bm.loops.layers.color.new("col")
    leaf = [(math.sin(t) * 0.5, (1 - math.cos(t)) * 0.5 - 0.5) for t in [i / 12 * 2 * math.pi for i in range(12)]]
    N = 950
    for _ in range(N):
        x, y, z = rnd.random(), rnd.random(), rnd.random() * 0.06
        L, Wd = 0.075 + rnd.random() * 0.04, 0.034 + rnd.random() * 0.016
        a, tilt, roll = rnd.random() * 2 * math.pi, (rnd.random() - 0.5) * 1.0, (rnd.random() - 0.5) * 0.8
        shade = 0.55 + rnd.random() * 0.45
        hue = rnd.random()
        c = (0.16 * shade * (0.8 + 0.4 * hue), 0.36 * shade, 0.1 * shade * (1.2 - 0.6 * hue), 1)
        for ox in (-1, 0, 1):
            for oy in (-1, 0, 1):
                vs = []
                for px_, py_ in leaf:
                    lx, ly = px_ * Wd, (py_ + 0.5) * L          # base at the stem, tip at +L
                    lz = -abs(px_) * Wd * 0.35 + ly * ly * 0.8  # folded on the midrib, tip curling up
                    # tilt around the leaf's width, roll around its length, then turn
                    ly2, lz2 = ly * math.cos(tilt) - lz * math.sin(tilt), ly * math.sin(tilt) + lz * math.cos(tilt)
                    lx2, lz3 = lx * math.cos(roll) - lz2 * math.sin(roll), lx * math.sin(roll) + lz2 * math.cos(roll)
                    wx, wy = lx2 * math.cos(a) - ly2 * math.sin(a), lx2 * math.sin(a) + ly2 * math.cos(a)
                    vs.append(bm.verts.new((x + ox + wx, y + oy + wy, z + lz3)))
                f = bm.faces.new(vs)
                for lp in f.loops:
                    lp[col] = c
    me = bpy.data.meshes.new("leaves")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("leaves", me)
    sc.collection.objects.link(ob)
    m = bpy.data.materials.new("leaf")
    m.use_nodes = True
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    ca = nt.nodes.new("ShaderNodeVertexColor")
    ca.layer_name = "col"
    # veins: a fine wave pattern darkens the colour a little
    nt.links.new(ca.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.6
    me.materials.append(m)
    # the shadowed inside of the crown under the leaves
    bpy.ops.mesh.primitive_plane_add(size=3, location=(0.5, 0.5, -0.02))
    gnd = bpy.context.active_object
    mg = bpy.data.materials.new("under")
    mg.use_nodes = True
    next(n for n in mg.node_tree.nodes if n.type == "BSDF_PRINCIPLED").inputs["Base Color"].default_value = (0.03, 0.06, 0.02, 1)
    gnd.data.materials.append(mg)
    w = bpy.data.worlds.new("sky")
    sc.world = w
    w.use_nodes = True
    next(n for n in w.node_tree.nodes if n.type == "BACKGROUND").inputs[0].default_value = (1, 1, 1, 1)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 1.0
    cam.location = (0.5, 0.5, 2)
    sc.camera = cam
    sc.render.resolution_x = sc.render.resolution_y = 512
    return ob, gnd


def metal_scene():
    """Brushed steel: fine streaks along u + a few scratches, from 4D noise on a torus (u, v -> two circles) so the
    tile repeats without a seam."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    render.gpu()
    sc.view_settings.view_transform = "Standard"
    sc.cycles.samples = 64
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0.5, 0.5, 0))
    pl = bpy.context.active_object
    m = bpy.data.materials.new("steel")
    m.use_nodes = True
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["UV"], sep.inputs[0])
    def torus(ru, rv, seed):
        def trig(src, op, r):
            mul = nt.nodes.new("ShaderNodeMath"); mul.operation = "MULTIPLY"; mul.inputs[1].default_value = 2 * math.pi
            nt.links.new(src, mul.inputs[0])
            f = nt.nodes.new("ShaderNodeMath"); f.operation = op; nt.links.new(mul.outputs[0], f.inputs[0])
            k = nt.nodes.new("ShaderNodeMath"); k.operation = "MULTIPLY"; k.inputs[1].default_value = r
            nt.links.new(f.outputs[0], k.inputs[0])
            return k.outputs[0]
        cu, su = trig(sep.outputs["X"], "COSINE", ru), trig(sep.outputs["X"], "SINE", ru)
        cv, sv = trig(sep.outputs["Y"], "COSINE", rv), trig(sep.outputs["Y"], "SINE", rv)
        comb = nt.nodes.new("ShaderNodeCombineXYZ")
        nt.links.new(cu, comb.inputs[0]); nt.links.new(su, comb.inputs[1]); nt.links.new(cv, comb.inputs[2])
        nz = nt.nodes.new("ShaderNodeTexNoise"); nz.noise_dimensions = "4D"
        nz.inputs["Scale"].default_value = 1.0; nz.inputs["Detail"].default_value = 6
        add = nt.nodes.new("ShaderNodeMath"); add.operation = "ADD"; add.inputs[1].default_value = seed
        nt.links.new(sv, add.inputs[0])
        nt.links.new(comb.outputs[0], nz.inputs["Vector"]); nt.links.new(add.outputs[0], nz.inputs["W"])
        return nz.outputs["Fac"]
    streak = torus(1.2, 60.0, 0.0)       # long along u, very fine across v
    blotch = torus(2.5, 2.5, 7.0)        # big soft variation
    scr = torus(6.0, 40.0, 3.0)          # scratches: thin bright lines where this noise crosses a level
    ramp = nt.nodes.new("ShaderNodeMapRange")
    ramp.inputs["From Min"].default_value = 0.5; ramp.inputs["From Max"].default_value = 0.53
    ramp.inputs["To Min"].default_value = 0.0; ramp.inputs["To Max"].default_value = 1.0
    nt.links.new(scr, ramp.inputs["Value"])
    m1 = nt.nodes.new("ShaderNodeMath"); m1.operation = "MULTIPLY_ADD"
    m1.inputs[1].default_value = 0.35; m1.inputs[2].default_value = 0.42
    nt.links.new(streak, m1.inputs[0])
    m2 = nt.nodes.new("ShaderNodeMath"); m2.operation = "MULTIPLY_ADD"
    m2.inputs[1].default_value = 0.2; m2.inputs[2].default_value = 0.0
    nt.links.new(blotch, m2.inputs[0]); nt.links.new(m1.outputs[0], m2.inputs[2])
    pp = nt.nodes.new("ShaderNodeMath"); pp.operation = "PINGPONG"; pp.inputs[1].default_value = 0.5
    nt.links.new(ramp.outputs["Result"], pp.inputs[0])
    m3 = nt.nodes.new("ShaderNodeMath"); m3.operation = "MULTIPLY_ADD"
    m3.inputs[1].default_value = 0.25
    nt.links.new(pp.outputs[0], m3.inputs[0]); nt.links.new(m2.outputs[0], m3.inputs[2])
    em = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(m3.outputs[0], em.inputs["Color"])
    out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    pl.data.materials.append(m)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    cam.data.type = "ORTHO"; cam.data.ortho_scale = 1.0
    cam.location = (0.5, 0.5, 2)
    sc.camera = cam
    sc.render.resolution_x = sc.render.resolution_y = 512
    sc.render.filter_size = 0.8
    return pl


def height_material(z0, z1):
    m = bpy.data.materials.new("height")
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != "OUTPUT_MATERIAL":
            nt.nodes.remove(n)
    out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value = z0
    mr.inputs["From Max"].default_value = z1
    em = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(geo.outputs["Position"], sep.inputs[0])
    nt.links.new(sep.outputs["Z"], mr.inputs["Value"])
    nt.links.new(mr.outputs["Result"], em.inputs["Color"])
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    return m


def main():
    a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    for name in (a or ORDER):
        if name == "leaves":
            ob, gnd = leaves_scene()
        elif name == "metal":
            metal_scene()
        else:
            ph, disp, nstr = SETS[name]
            GR.scene_for_set(ph, disp, nstr)
            bpy.context.scene.render.resolution_x = bpy.context.scene.render.resolution_y = 512
        sc = bpy.context.scene
        sc.render.image_settings.file_format = "JPEG"
        sc.render.image_settings.quality = 88
        sc.render.filepath = os.path.join(OUT, f"mat-{name}.jpg")
        bpy.ops.render.render(write_still=True)
        if name == "leaves":
            hm = height_material(-0.02, 0.1)
            ob.data.materials[0] = hm
            gnd.data.materials[0] = hm
            sc.world.node_tree.nodes["Background"].inputs[1].default_value = 0
            sc.cycles.samples = 16
            sc.cycles.use_denoising = False
            sc.render.filepath = os.path.join(OUT, f"mat-{name}-h.jpg")
            bpy.ops.render.render(write_still=True)
        elif name == "metal":   # the streaks are the height too
            import shutil
            shutil.copy(sc.render.filepath, os.path.join(OUT, "mat-metal-h.jpg"))
        else:
            save_height_from_disp(SETS[name][0], name)
        print("MAT", name)


main()

"""Ground textures re-rendered in Blender (2026-11-27; replaces tools/ground_textures.py's colour x AO photos).

    blender -b -P tools/ground_render.py [-- name ...]      (no names = all six photo layers)

For each layer: the Poly Haven CC0 set (colour, normal, roughness, displacement; cached in
blender-studio/assets/polyhaven) on a 3 x 3 tile plane that is really displaced (1.3 M faces), lit by an even white
sky (so the light comes from everywhere: crevices, gaps between stones and the undersides of leaves go dark the way
they do outside, without a sun direction that would fight the game's own sun). An orthographic camera renders the
centre tile top-down (its neighbours cast the occlusion over the edges, so the tile is seamless):
  theme/assets/ground-<name>.jpg     1024 px colour (the game divides it by its average colour; see TEX in cft-world)
  theme/assets/ground-<name>-n.jpg   512 px tangent-space normal map (x = +u, y = +v), rendered from the displaced
                                     surface + the set's own normal map; cft-world's groundify lights it with the sun.
The drawn layers (cartoon road, herringbone pavement) get their normals in the game from the drawing itself.
Bump `?v=` in loadGround after re-rendering.
"""
import bpy, os, sys, math
sys.path.insert(0, os.path.expanduser("~/Documents/CLAUDE/blender-studio/lib"))
import polyhaven, render

OUT = os.environ.get("GROUND_OUT") or os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "theme", "assets")
# game layer -> Poly Haven id, displacement (fraction of one tile), extra normal-map strength
SETS = {
    "grass": ("leafy_grass", 0.030, 1.0),
    "forest": ("forest_leaves_02", 0.030, 1.0),
    "bricks": ("pavement_03", 0.012, 1.0),
    "sand": ("sand_01", 0.010, 0.8),
    "ground": ("grass_path_3", 0.022, 1.0),
    "path": ("concrete_floor_01", 0.006, 0.8),
}


def scene_for(name):
    return scene_for_set(*SETS[name])


def scene_for_set(ph, disp, nstr):
    """The displaced 3 x 3 tile plane of one Poly Haven set, sky, camera. -> (plane, material, normals material)."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    render.gpu()
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.cycles.samples = 256
    sc.cycles.use_denoising = True
    sc.render.film_transparent = False
    maps = polyhaven.texture_maps(ph, "2k")
    # plane: 3 x 3 tiles of 1 x 1 (UV repeats per tile), subdivided for real displacement
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=1152, y_subdivisions=1152, size=3)
    pl = bpy.context.active_object
    for l in pl.data.uv_layers[0].data:
        l.uv = (l.uv[0] * 3, l.uv[1] * 3)
    tex = bpy.data.textures.new("disp", "IMAGE")
    tex.image = bpy.data.images.load(maps["disp"])
    tex.image.colorspace_settings.name = "Non-Color"
    tex.extension = "REPEAT"
    d = pl.modifiers.new("disp", "DISPLACE")
    d.texture = tex
    d.texture_coords = "UV"
    d.strength = disp
    d.mid_level = 0.5
    m = bpy.data.materials.new(ph)
    m.use_nodes = True
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    def img(key, nc):
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = bpy.data.images.load(maps[key])
        if nc:
            n.image.colorspace_settings.name = "Non-Color"
        return n
    col = img("diff", False)
    nt.links.new(col.outputs["Color"], b.inputs["Base Color"])
    if "rough" in maps:
        nt.links.new(img("rough", True).outputs["Color"], b.inputs["Roughness"])
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nm.inputs["Strength"].default_value = nstr
    nt.links.new(img("nor", True).outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    pl.data.materials.append(m)
    # normal-out material (world normal -> colour) for the second pass
    mn = bpy.data.materials.new("normals")
    mn.use_nodes = True
    t2 = mn.node_tree
    for n in list(t2.nodes):
        if n.type != "OUTPUT_MATERIAL":
            t2.nodes.remove(n)
    out = next(n for n in t2.nodes if n.type == "OUTPUT_MATERIAL")
    im2 = t2.nodes.new("ShaderNodeTexImage")
    im2.image = bpy.data.images.load(maps["nor"], check_existing=True)
    im2.image.colorspace_settings.name = "Non-Color"
    nm2 = t2.nodes.new("ShaderNodeNormalMap")
    nm2.inputs["Strength"].default_value = nstr
    t2.links.new(im2.outputs["Color"], nm2.inputs["Color"])
    vm = t2.nodes.new("ShaderNodeVectorMath")
    vm.operation = "MULTIPLY_ADD"
    vm.inputs[1].default_value = (0.5, 0.5, 0.5)
    vm.inputs[2].default_value = (0.5, 0.5, 0.5)
    t2.links.new(nm2.outputs["Normal"], vm.inputs[0])
    em = t2.nodes.new("ShaderNodeEmission")
    t2.links.new(vm.outputs[0], em.inputs["Color"])
    t2.links.new(em.outputs[0], out.inputs["Surface"])
    # even white sky
    w = bpy.data.worlds.new("sky")
    sc.world = w
    w.use_nodes = True
    bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs[0].default_value = (1, 1, 1, 1)
    bg.inputs[1].default_value = 1.0
    # top-down orthographic camera on the centre tile
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 1.0
    cam.location = (0, 0, 2)
    cam.rotation_euler = (0, 0, 0)
    cam.data.clip_end = 10
    sc.camera = cam
    sc.render.resolution_x = sc.render.resolution_y = 1024
    sc.render.pixel_aspect_x = sc.render.pixel_aspect_y = 1
    return pl, m, mn


def main():
    a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    for name in (a or list(SETS)):
        pl, m, mn = scene_for(name)
        sc = bpy.context.scene
        sc.render.image_settings.file_format = "JPEG"
        sc.render.image_settings.quality = 88
        sc.render.filepath = os.path.join(OUT, f"ground-{name}.jpg")
        bpy.ops.render.render(write_still=True)
        # normals: emission only, one clean sample per pixel area (no denoise, no AA blur beyond the filter)
        pl.data.materials[0] = mn
        sc.world.node_tree.nodes["Background"].inputs[1].default_value = 0
        sc.cycles.samples = 16
        sc.cycles.use_denoising = False
        sc.render.resolution_x = sc.render.resolution_y = 512
        sc.render.image_settings.quality = 92
        sc.render.filepath = os.path.join(OUT, f"ground-{name}-n.jpg")
        bpy.ops.render.render(write_still=True)
        print("GROUND", name)


if __name__ == "__main__":
    main()

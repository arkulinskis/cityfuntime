"""Contact sheet of the installed MakeHuman clothes and hair (to pick each cast member's outfit).
blender -b -P catalog.py -- OUT_DIR"""
import bpy, sys, os, math
sys.path.insert(0, os.path.expanduser("~/Documents/CLAUDE/blender-studio/lib"))
import humans, render
from bl_ext.blender_org.mpfb.services.humanservice import HumanService
out = sys.argv[sys.argv.index("--") + 1]
os.makedirs(out, exist_ok=True)
D = os.path.join(os.environ["APPDATA"], "Blender Foundation/Blender/5.3/extensions/.user/blender_org/mpfb/data")
clothes = sorted(os.listdir(D + "/clothes")); hair = sorted(os.listdir(D + "/hair"))
looks = [("c_" + c, 0.0 if c.startswith("female") else 1.0, [c], "") for c in clothes] + [("h_" + h, 0.0, ["female_casualsuit01"], h) for h in hair]
for name, g, cl, hr in looks:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    info = HumanService._create_default_human_info_dict()
    info["phenotype"].update(gender=g, age=0.5)
    info["rig"] = ""
    if hr: info["hair"] = f"{hr}/{hr}.mhclo"
    info["clothes"] = [f"{c}/{c}.mhclo" for c in cl]
    info["skin_mhmat"] = "young_caucasian_male/young_caucasian_male.mhmat"
    st = HumanService.get_default_deserialization_settings(); st["subdiv_levels"] = 0
    HumanService.deserialize_from_dict(info, st)
    sc = bpy.context.scene
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
    hz = 1.0 if not name.startswith("h_") else 1.55
    cam.location = (0, -4.2 if not name.startswith("h_") else -1.3, hz); cam.rotation_euler = (math.radians(90), 0, 0)
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); sc.collection.objects.link(sun); sun.rotation_euler = (0.8, 0.2, 0.4); sun.data.energy = 3
    w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True; w.node_tree.nodes["Background"].inputs[0].default_value = (0.6, 0.62, 0.66, 1)
    sc.render.engine = "CYCLES"; render.gpu(); sc.cycles.samples = 24
    sc.render.resolution_x, sc.render.resolution_y = 240, 360
    sc.render.filepath = os.path.join(out, name + ".png"); bpy.ops.render.render(write_still=True)
    print("DONE", name)

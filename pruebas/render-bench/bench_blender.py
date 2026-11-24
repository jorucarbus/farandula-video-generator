# Escena de pasarela en Blender (misma escena.json que three.js). Uso:
# blender -b -P bench_blender.py -- --engine eevee|cycles --stride 1 --out carpeta
import bpy, json, math, sys, time, os, statistics
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(n, d):
    return argv[argv.index(n) + 1] if n in argv else d
ENGINE = arg('--engine', 'eevee'); STRIDE = int(arg('--stride', '1')); OUT = arg('--out', 'out_blender'); SAMPLES = int(arg('--samples', '64'))
HERE = os.path.dirname(os.path.abspath(__file__)); SC = json.load(open(os.path.join(HERE, 'scene.json')))
OUT = os.path.abspath(OUT); os.makedirs(OUT, exist_ok=True)

def hexlin(h):
    h = h.lstrip('#'); r, g, b = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    f = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (f(r), f(g), f(b), 1)

bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene
scn.render.resolution_x = SC['w']; scn.render.resolution_y = SC['h']; scn.render.resolution_percentage = 100
scn.render.image_settings.file_format = 'PNG'
scn.view_settings.view_transform = 'Standard'

MATS = {}
def mat(color, rough=0.6):
    k = (color, rough)
    if k not in MATS:
        m = bpy.data.materials.new('m' + color); m.use_nodes = True
        b = m.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = hexlin(color); b.inputs['Roughness'].default_value = rough
        MATS[k] = m
    return MATS[k]

def assign(o, color, rough=0.6):
    o.data.materials.clear(); o.data.materials.append(mat(color, rough))
    return o

def sphere(r, loc, scale=(1, 1, 1), color='#ffffff', seg=24):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=seg, ring_count=seg // 2)
    o = bpy.context.active_object; o.scale = scale; bpy.ops.object.shade_smooth(); return assign(o, color)

def limb(length, r, color, pivot):
    # cilindro con su origen en el extremo superior (pivote)
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=length, location=(0, 0, 0), vertices=16)
    o = bpy.context.active_object
    for v in o.data.vertices: v.co.z -= length / 2
    bpy.ops.object.shade_smooth(); o.location = pivot; return assign(o, color)

# suelo y pasarela
bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, 0)); assign(bpy.context.active_object, SC['floor'], 0.9)
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0)); rw = bpy.context.active_object
rw.scale = (SC['runwayW'], SC['runwayLen'], SC['runwayH']); rw.location = (0, 0, SC['runwayH'] / 2); assign(rw, SC['runway'], 0.4)
# NOTA: en Blender z es arriba; mapeo desde three: x->x, y(arriba)->z, z(profundidad)->-y... usamos (x, -z, y)
def P(x, y, z): return (x, -z, y)
rw.location = P(0, SC['runwayH'] / 2, 0); rw.scale = (SC['runwayW'], SC['runwayLen'], SC['runwayH'])

# público: torso + cabeza (sin rostro)
for a in SC['aud']:
    h = a['h']; x, z = a['x'], a['z']
    sphere(0.12, P(x, h - 0.1, z), color=a['c'])
    sphere(0.3, P(x, h * 0.55, z), scale=(0.7, 0.45, 1.2), color=a['c'])

# héroe
hero = SC['hero']; base_y = SC['runwayH']
torso = sphere(0.3, P(0, base_y + 1.2, SC['heroZ0']), scale=(0.65, 0.4, 1.1), color=hero)
head = sphere(0.13, P(0, base_y + 1.62, SC['heroZ0']), color=hero)
lp = [limb(0.85, 0.07, hero, P(sx * 0.1, base_y + 0.88, SC['heroZ0'])) for sx in (-1, 1)]
ap = [limb(0.6, 0.05, hero, P(sx * 0.26, base_y + 1.42, SC['heroZ0'])) for sx in (-1, 1)]
HERO = [torso, head] + lp + ap
HERO_X = [0, 0, -0.1, 0.1, -0.26, 0.26]

# luces: sol suave + ambiente del mundo
bpy.ops.object.light_add(type='SUN', location=(5, -3, 10)); sun = bpy.context.active_object
sun.rotation_euler = (math.radians(50), 0, math.radians(35)); sun.data.energy = 2.0; sun.data.angle = math.radians(4)
world = bpy.data.worlds.new('w'); scn.world = world; world.use_nodes = True
bg = world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = hexlin(SC['bg']); bg.inputs['Strength'].default_value = 0.6

# cámara
cam_d = bpy.data.cameras.new('cam'); cam_d.sensor_fit = 'VERTICAL'; cam_d.angle_y = math.radians(SC['fov'])
cam = bpy.data.objects.new('cam', cam_d); scn.collection.objects.link(cam); scn.camera = cam
def ease(t): return t * t * (3 - 2 * t)
def lookat(o, tgt):
    d = Vector(tgt) - o.location; o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()

if ENGINE == 'cycles':
    scn.render.engine = 'CYCLES'; scn.cycles.samples = SAMPLES; scn.cycles.use_denoising = True
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for t in ('OPTIX', 'CUDA'):
        try:
            prefs.compute_device_type = t; prefs.get_devices(); [setattr(d, 'use', d.type != 'CPU') for d in prefs.devices]; break
        except Exception: pass
    scn.cycles.device = 'GPU'
else:
    scn.render.engine = 'BLENDER_EEVEE_NEXT'
    ee = scn.eevee; ee.taa_render_samples = SAMPLES
    try: ee.use_shadows = True
    except Exception: pass

tiempos = []
N = SC['frames']
for f in range(0, N, STRIDE):
    t = f / (N - 1); e = ease(t)
    cam.location = P(*[SC['camA']['p'][i] + (SC['camB']['p'][i] - SC['camA']['p'][i]) * e for i in range(3)])
    lookat(cam, P(*[SC['camA']['t'][i] + (SC['camB']['t'][i] - SC['camA']['t'][i]) * e for i in range(3)]))
    hz = SC['heroZ0'] + (SC['heroZ1'] - SC['heroZ0']) * t; ph = f / SC['fps'] * 2 * math.pi * 1.0
    dz = SC['heroZ0'] - hz
    for o in HERO: o.location.y = -hz if False else o.location.y
    # mover todo el héroe en profundidad: ajustar y de cada pieza
    for i, o in enumerate(HERO):
        o.location.y = -hz
    # balanceo de piernas y brazos (rotación en X)
    for i, sx in enumerate((-1, 1)):
        lp[i].rotation_euler = (math.sin(ph + (0 if sx < 0 else math.pi)) * 0.5, 0, 0)
        ap[i].rotation_euler = (math.sin(ph + (math.pi if sx < 0 else 0)) * 0.4, 0, 0)
    scn.render.filepath = os.path.join(OUT, 'f%03d.png' % f)
    t0 = time.perf_counter(); bpy.ops.render.render(write_still=True); tiempos.append(time.perf_counter() - t0)
print('BENCH', json.dumps({'engine': ENGINE, 'samples': SAMPLES, 'frames': len(tiempos), 'first_s': round(tiempos[0], 3), 'median_s': round(statistics.median(tiempos[1:] or tiempos), 3), 'mean_s': round(statistics.mean(tiempos), 3), 'max_s': round(max(tiempos), 3)}))

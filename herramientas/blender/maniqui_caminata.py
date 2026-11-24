# Maniquí SIN ROSTRO (MPFB2, CC0) con esqueleto y ciclo de caminata en bucle, exportado a GLB para three.js.
# Uso: blender -b --python maniqui_caminata.py -- --genero 0|1 --salida carpeta/maniqui_f.glb [--png vista.png]
# La pose se define por DIRECCIONES en el espacio del esqueleto (muslo hacia abajo y adelante, etc.), no por ejes locales: así no depende de la orientación/roll de cada hueso.
import bpy, sys, os, math, bmesh
from mathutils import Vector, Quaternion, Matrix

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(n, d=None):
    return ARGS[ARGS.index(n) + 1] if n in ARGS else d
AMP = float(arg('--amp', '1')); GENERO = float(arg('--genero', '0')); SALIDA = os.path.abspath(arg('--salida', 'maniqui.glb')); PNG = arg('--png')
from bl_ext.user_default.mpfb.services import HumanService, TargetService

bpy.ops.wm.read_factory_settings(use_empty=True)
macro = TargetService.get_default_macro_info_dict(); macro['gender'] = GENERO; macro['age'] = 0.5; macro['proportions'] = 0.5
base = HumanService.create_human(mask_helpers=True, detailed_helpers=False, extra_vertex_groups=False, feet_on_ground=True, scale=0.1, macro_detail_dict=macro)
arm = HumanService.add_builtin_rig(base, 'game_engine', import_weights=True)

# --- sin rostro: se alisa la cabeza (se borran nariz, labios, cuencas) y el cuerpo lleva un solo material de arcilla ---
vg = {g.name: g.index for g in base.vertex_groups}
bm = bmesh.new(); bm.from_mesh(base.data); dl = bm.verts.layers.deform.verify()
cab = [v for v in bm.verts if any(vg.get(n) in v[dl] and v[dl][vg[n]] > 0.5 for n in ('head', 'neck_01'))]
zs = [v.co.z for v in cab]; zcorte = min(zs) + (max(zs) - min(zs)) * 0.25
cab = [v for v in cab if v.co.z > zcorte]
for _ in range(40):
    bmesh.ops.smooth_vert(bm, verts=cab, factor=0.6, use_axis_x=True, use_axis_y=True, use_axis_z=True)
bm.to_mesh(base.data); bm.free()
mat = bpy.data.materials.new('arcilla'); mat.use_nodes = True
b = mat.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (0.80, 0.62, 0.50, 1); b.inputs['Roughness'].default_value = 0.65
base.data.materials.clear(); base.data.materials.append(mat)
for p in base.data.polygons: p.use_smooth = True
bpy.context.view_layer.update()
h = max(v.co.z for v in base.data.vertices) - min(v.co.z for v in base.data.vertices); k = 1.75 / h if h > 0 else 1
arm.scale = (k, k, k)

pb = arm.pose.bones
def reposo():
    for p in pb: p.rotation_mode = 'QUATERNION'; p.rotation_quaternion = Quaternion((1, 0, 0, 0)); p.location = (0, 0, 0)
    bpy.context.view_layer.update()
def poner_dir(nombre, d):
    """Gira el hueso (en espacio del esqueleto) para que su eje Y apunte a d, sin mover su cabeza."""
    p = pb[nombre]; m = p.matrix.copy(); y = m.to_3x3().col[1].normalized(); q = y.rotation_difference(Vector(d).normalized())
    R = q.to_matrix() @ m.to_3x3(); n = R.to_4x4(); n.translation = m.translation; p.matrix = n; bpy.context.view_layer.update()

reposo()
# hacia dónde mira el maniquí: de la articulación del pie a la punta del pie, en horizontal
fw = (pb['ball_l'].head - pb['foot_l'].head); fw.z = 0; fw.normalize(); LAT = Vector((0, 0, 1)).cross(fw).normalized()  # LAT = izquierda del maniquí
lado_l = 1 if (pb['thigh_l'].head - pb['thigh_r'].head).dot(LAT) > 0 else -1
print('ADELANTE', tuple(round(x, 2) for x in fw), 'lat', tuple(round(x, 2) for x in LAT))
def dir_pierna(ang): return -Vector((0, 0, 1)) * math.cos(ang) + fw * math.sin(ang)

FPS = 24; N = 24
def pose(i):
    reposo(); ph = 2 * math.pi * i / N
    for lado in ('l', 'r'):
        off = 0 if lado == 'l' else math.pi; sg = lado_l if lado == 'l' else -lado_l
        a = AMP * 0.45 * math.sin(ph + off)                                   # muslo adelante (+) / atrás (-)
        flex = AMP * (0.12 + 0.75 * max(0.0, math.sin(ph + off + 1.9)))         # la rodilla se dobla al pasar la pierna
        poner_dir('thigh_' + lado, dir_pierna(a)); poner_dir('calf_' + lado, dir_pierna(a - flex))
        s = AMP * 0.40 * math.sin(ph + off + math.pi)                          # brazos opuestos a las piernas
        lat = LAT * sg * 0.10
        poner_dir('upperarm_' + lado, dir_pierna(s) + lat); poner_dir('lowerarm_' + lado, dir_pierna(s + 0.35) + lat * 0.5)
pose(0)
for n_ in ('thigh_l','calf_l','upperarm_l','lowerarm_l','spine_01','pelvis'):
    q_=pb[n_]; print('DIR', n_, tuple(round(x,2) for x in (q_.tail-q_.head).normalized()), 'head', tuple(round(x,2) for x in q_.head), 'padre', q_.parent.name if q_.parent else None)
for i in range(N):
    pose(i)
    for p in pb: p.keyframe_insert('rotation_quaternion', frame=i + 1); p.keyframe_insert('location', frame=i + 1)
sc = bpy.context.scene; sc.frame_start = 1; sc.frame_end = N; sc.render.fps = FPS
act = arm.animation_data.action; act.name = 'caminar'
for fc in act.fcurves:
    for kp in fc.keyframe_points: kp.interpolation = 'BEZIER'

if PNG:
    sc.render.engine = 'BLENDER_EEVEE_NEXT'; sc.render.resolution_x = 900; sc.render.resolution_y = 700
    cam_d = bpy.data.cameras.new('c'); cam = bpy.data.objects.new('c', cam_d); sc.collection.objects.link(cam); sc.camera = cam
    cam.location = LAT * 4.5 + Vector((0, 0, 0.95)); cam.rotation_euler = (Vector((0, 0, 0.9)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    l = bpy.data.lights.new('s', 'SUN'); l.energy = 3; lo = bpy.data.objects.new('s', l); sc.collection.objects.link(lo); lo.rotation_euler = (math.radians(50), 0, math.radians(60))
    sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True; sc.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.9, 0.88, 0.82, 1)
    for f in (1, 7, 13, 19):
        sc.frame_set(f); sc.render.filepath = os.path.abspath(PNG.replace('.png', f'_{f}.png')); bpy.ops.render.render(write_still=True)

bpy.ops.object.select_all(action='DESELECT'); base.select_set(True); arm.select_set(True); bpy.context.view_layer.objects.active = arm
os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=SALIDA, export_format='GLB', use_selection=True, export_animations=True, export_skins=True, export_apply=False, export_yup=True, export_morph=False)
print('EXPORTADO', SALIDA, os.path.getsize(SALIDA), 'bytes')

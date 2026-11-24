# Cabeza 3D modelo (MPFB2 / MakeHuman, CC0) con las 52 formas ARKit y los visemas, para renderizar hojas modelo de caras (visemas, emociones, ángulos).
# Uso (sin interfaz):  blender -b --python cabeza_modelo.py -- --salida <carpeta> [--prueba]
# Necesita: extensión MPFB instalada en Blender y los paquetes de assets (makehuman_system_assets, faceunits01, visemes02) descomprimidos en su carpeta de datos.
import bpy, sys, os, math, glob, json, mathutils

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(n, d=None):
    return ARGS[ARGS.index(n) + 1] if n in ARGS else d
SALIDA = arg('--salida', os.path.join(os.path.dirname(__file__), 'salida'))
os.makedirs(SALIDA, exist_ok=True)

from bl_ext.user_default.mpfb.services import HumanService, FaceService, TargetService, LocationService

DATOS = LocationService.get_user_data()
def activo(nombre):
    return os.path.join(DATOS, nombre)

def limpiar():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def crear_humano():
    macro = TargetService.get_default_macro_info_dict()
    macro['gender'] = 0.0                      # mujer
    macro['age'] = 0.5                         # joven (25 años)
    macro['race']['african'] = 0.0; macro['race']['asian'] = 0.3; macro['race']['caucasian'] = 0.7
    macro['proportions'] = 0.5
    base = HumanService.create_human(mask_helpers=True, detailed_helpers=True, extra_vertex_groups=True, feet_on_ground=True, scale=0.1, macro_detail_dict=macro)
    return base

def anadir(base, ruta, tipo, material=None):
    obj = HumanService.add_mhclo_asset(ruta, base, asset_type=tipo, subdiv_levels=0, material_type='MAKESKIN' if material is None else material)
    return obj

def construir():
    limpiar()
    base = crear_humano()
    # piel (la más joven de piel clara que exista)
    pieles = sorted(glob.glob(os.path.join(activo('skins'), '*', '*.mhmat')))
    cand = [p for p in pieles if 'young' in os.path.basename(p) and 'caucasian_female' in os.path.basename(p)] or [p for p in pieles if 'caucasian_female' in os.path.basename(p)]
    HumanService.set_character_skin(cand[0], base, skin_type='ENHANCED_SSS')
    # ojos, cejas, pestañas, dientes, lengua
    ojos = anadir(base, os.path.join(activo('eyes'), 'high-poly', 'high-poly.mhclo'), 'Eyes')
    cejas = anadir(base, os.path.join(activo('eyebrows'), 'eyebrow001', 'eyebrow001.mhclo'), 'Eyebrows')
    pestanas = anadir(base, os.path.join(activo('eyelashes'), 'eyelashes01', 'eyelashes01.mhclo'), 'Eyelashes')
    dientes = anadir(base, os.path.join(activo('teeth'), 'teeth_base', 'teeth_base.mhclo'), 'Teeth')
    lengua = anadir(base, os.path.join(activo('tongue'), 'tongue01', 'tongue01.mhclo'), 'Tongue')
    # formas faciales: ARKit (52) + visemas Oculus (15), propagadas a los hijos (ojos, dientes, lengua...)
    FaceService.load_targets(base, load_microsoft_visemes=False, load_meta_visemes=True, load_arkit_faceunits=True)
    FaceService.interpolate_targets(base)
    for h in base.children:
        if 'tongue' in h.name:
            try:
                HumanService.refit(h)
            except Exception as e:
                print('REFIT LENGUA FALLO', e)
    return base

if __name__ == '__main__':
    base = construir()
    claves = [k.name for k in base.data.shape_keys.key_blocks] if base.data.shape_keys else []
    print('FORMAS', len(claves), claves[:80])
    print('HIJOS', [c.name for c in base.children])
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SALIDA, 'cabeza_modelo.blend'))


# ───────────────────────── Render de poses ─────────────────────────
POSES_VISEMAS = {  # nuestras formas de boca → visema Oculus del modelo + formas ARKit para exagerarlas (que se distingan a simple vista)
    'Neutral': {'viseme_sil': 1.0}, 'Aa': {'viseme_aa': 1.0, 'jawOpen': 0.7, 'mouthLowerDownLeft': 0.4, 'mouthLowerDownRight': 0.4},
    'Ee': {'viseme_E': 1.0, 'mouthStretchLeft': 0.8, 'mouthStretchRight': 0.8, 'mouthSmileLeft': 0.4, 'mouthSmileRight': 0.4, 'jawOpen': 0.12},
    'Oh': {'viseme_O': 1.0, 'mouthFunnel': 0.7, 'jawOpen': 0.45}, 'Woo': {'viseme_U': 1.0, 'mouthPucker': 1.0, 'mouthFunnel': 0.4},
    'M': {'viseme_PP': 1.0, 'mouthPressLeft': 0.8, 'mouthPressRight': 0.8, 'mouthRollLower': 0.3}, 'F': {'viseme_FF': 1.0, 'mouthRollLower': 0.8, 'mouthUpperUpLeft': 0.4, 'mouthUpperUpRight': 0.4},
    'D': {'viseme_DD': 1.0, 'jawOpen': 0.25, 'tongueOut': 0.25}, 'S': {'viseme_SS': 1.0, 'mouthStretchLeft': 0.5, 'mouthStretchRight': 0.5, 'mouthClose': 0.2},
    'Uh': {'viseme_I': 0.5, 'jawOpen': 0.28}, 'R': {'viseme_RR': 1.0, 'mouthPucker': 0.5, 'jawOpen': 0.2},
}
LR = lambda n, v: {n + 'Left': v, n + 'Right': v}
POSES_EMOCIONES = {
    'feliz': {**LR('mouthSmile', 1.0), 'jawOpen': 0.32, **LR('cheekSquint', 0.7), **LR('eyeSquint', 0.35), 'browOuterUpLeft': 0.3, 'browOuterUpRight': 0.3},
    'sorpresa': {**LR('eyeWide', 1.0), 'browInnerUp': 1.0, 'browOuterUpLeft': 1.0, 'browOuterUpRight': 1.0, 'jawOpen': 0.45, 'mouthFunnel': 0.35},
    'triste': {'browInnerUp': 1.0, **LR('mouthFrown', 1.0), **LR('mouthPress', 0.3), **LR('eyeLookDown', 0.4), 'mouthShrugLower': 0.4},
    'enojo': {**LR('browDown', 1.0), **LR('eyeSquint', 0.6), **LR('noseSneer', 0.45), **LR('mouthPress', 0.9), 'jawForward': 0.2},
    'duda': {'browOuterUpLeft': 1.0, 'browDownRight': 0.6, 'mouthLeft': 0.7, 'mouthPucker': 0.35, 'mouthShrugLower': 0.3, 'eyeLookOutLeft': 0.5, 'eyeLookInRight': 0.5},
    'orgullo': {'mouthSmileLeft': 0.6, 'mouthSmileRight': 0.25, **LR('eyeBlink', 0.35), 'browOuterUpLeft': 0.25, 'browOuterUpRight': 0.25},
    'asco': {**LR('noseSneer', 1.0), **LR('mouthUpperUp', 1.0), **LR('browDown', 0.7), **LR('eyeSquint', 0.8), **LR('mouthFrown', 0.4)},
    'preocupacion': {'browInnerUp': 1.0, **LR('mouthFrown', 0.5), **LR('mouthPress', 0.5), **LR('eyeWide', 0.4)},
    'amor': {**LR('mouthSmile', 0.55), **LR('eyeSquint', 0.3), 'browInnerUp': 0.45, **LR('cheekSquint', 0.3)},
}

def preparar_escena(base):
    sc = bpy.context.scene
    try:
        sc.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError:
        sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x = int(arg('--ancho', 1024)); sc.render.resolution_y = int(arg('--alto', 1024)); sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'PNG'
    # fondo gris liso
    w = bpy.data.worlds.new('fondo'); w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (0.38, 0.38, 0.38, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 1.0; sc.world = w
    sc.view_settings.view_transform = 'Standard'
    # medidas de la cabeza
    zs = [(base.matrix_world @ v.co).z for v in base.data.vertices if v.co.z * 0 == 0]; top = max(zs); alto = top - min(zs)
    ojos = [h for h in base.children if 'high-poly' in h.name][0]
    bb = [ojos.matrix_world @ mathutils.Vector(c) for c in ojos.bound_box]
    ez = sum(v.z for v in bb) / 8.0; ey = sum(v.y for v in bb) / 8.0
    centro = mathutils.Vector((0, ey, ez - 0.035))   # centro de la cara: algo por debajo de los ojos
    u = alto / 1.7   # unidades de Blender por metro (el humano mide ~1.7 m)
    global UNIDAD; UNIDAD = u
    luz = lambda nombre, loc, e, tam: _luz(nombre, tuple(c * u for c in loc), e * u * u, tam * u, centro)
    z = centro.z / u
    luz('clave', (0.7, -1.3, z + 0.3), 55, 1.0); luz('relleno', (-1.1, -1.2, z), 22, 1.2); luz('contra', (0, 1.2, z + 0.3), 14, 0.8)
    cam = bpy.data.cameras.new('cam'); cam.lens = 105; obj = bpy.data.objects.new('cam', cam); sc.collection.objects.link(obj); sc.camera = obj
    return centro, alto

def _luz(nombre, loc, energia, tam, centro):
    l = bpy.data.lights.new(nombre, 'AREA'); l.energy = energia; l.size = tam; o = bpy.data.objects.new(nombre, l); o.location = loc; bpy.context.scene.collection.objects.link(o)
    d = centro - o.location; o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()

def poner_camara(centro, alto, azimut=0.0, distancia=None, desplaza=(0, 0), ancho_vista=0.30):
    cam = bpy.context.scene.camera
    dist = distancia or 1.6 * UNIDAD
    a = math.radians(azimut)
    cam.location = (centro.x + dist * math.sin(a) + desplaza[0], centro.y - dist * math.cos(a), centro.z + desplaza[1])
    d = mathutils.Vector((centro.x + desplaza[0], centro.y, centro.z + desplaza[1])) - cam.location
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    cam.data.sensor_width = 36; cam.data.lens = 105; cam.data.clip_start = 0.01 * UNIDAD; cam.data.clip_end = 20 * UNIDAD

def aplicar(base, valores):
    kb = base.data.shape_keys.key_blocks
    for k in kb:
        if k.name != 'Basis' and not k.name.startswith('$'):
            k.value = 0.0
    for n, v in valores.items():
        if n in kb: kb[n].value = v
        else: print('FORMA NO ENCONTRADA', n)
    # los hijos (ojos, dientes, lengua, cejas) llevan sus propias formas interpoladas con los mismos nombres
    for h in base.children:
        if h.data.shape_keys:
            for k in h.data.shape_keys.key_blocks:
                if k.name != 'Basis' and not k.name.startswith('$'): k.value = valores.get(k.name, 0.0)

def render(nombre):
    bpy.context.scene.render.filepath = os.path.join(SALIDA, nombre + '.png')
    bpy.ops.render.render(write_still=True)

if '--prueba' in ARGS:
    base = construir()
    centro, alto = preparar_escena(base)
    print('ALTO', alto, 'CENTRO', tuple(centro))
    poner_camara(centro, alto, 0)
    for n, v in [('p_neutral', POSES_VISEMAS['Neutral']), ('p_aa', POSES_VISEMAS['Aa']), ('p_feliz', POSES_EMOCIONES['feliz']), ('p_sorpresa', POSES_EMOCIONES['sorpresa'])]:
        aplicar(base, v); render(n)
    poner_camara(centro, alto, 90); aplicar(base, POSES_VISEMAS['Neutral']); render('p_perfil')


if '--todo' in ARGS:
    base = construir()
    centro, alto = preparar_escena(base)
    for n, v in POSES_VISEMAS.items():                 # bocas del habla: cámara cerrada sobre la boca (de la punta de la nariz al mentón)
        poner_camara(centro, alto, 0, distancia=0.55, desplaza=(0, -0.043)); aplicar(base, v); render('visema_' + n)
    for n, v in POSES_EMOCIONES.items():
        poner_camara(centro, alto, 0, distancia=0.62, desplaza=(0, 0.0)); aplicar(base, v); render('emosup_' + n)   # ojos y cejas
        poner_camara(centro, alto, 0, distancia=0.55, desplaza=(0, -0.043)); aplicar(base, v); render('emoinf_' + n)   # boca
    pivote = mathutils.Vector((0, -0.02, centro.z))      # el giro es alrededor del centro de la cabeza (no de los ojos)
    for az in (-90, -60, -30, 0, 30, 60, 90):          # giro de cabeza
        poner_camara(pivote, alto, az, distancia=1.25, desplaza=(0, -0.01))
        aplicar(base, POSES_VISEMAS['Neutral']); render('angulo_%+d' % az)

if '--cara' in ARGS:    # visemas con la CARA COMPLETA (para que Gemini la trate como un retrato y le ponga la identidad)
    base = construir()
    centro, alto = preparar_escena(base)
    for n, v in {**POSES_VISEMAS, 'feliz': POSES_EMOCIONES['feliz']}.items():
        poner_camara(centro, alto, 0, distancia=0.80, desplaza=(0, 0.0)); aplicar(base, v); render('vf_' + n)

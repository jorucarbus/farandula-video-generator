"""Detecta rostros en los clips de una carpeta de la biblioteca (local, gratis: MediaPipe BlazeFace) y escribe
<carpeta>.rostros.json = { id: { alto, ancho, cuadros: [ { t, caras: [ {cx, cy, w, h, p} ] } ] } }
Coordenadas relativas (0-1) al cuadro VISIBLE (ya rotado). Muestrea ~2 cuadros por segundo, máximo 24 por clip.
Uso: python scripts/rostros-clips.py <carpeta> [--rehacer]
Modelo: data-motor/modelos/blaze_face_short_range.tflite (no versionado)."""
import json, os, sys
import cv2
import mediapipe as mp
from mediapipe.tasks.python import vision
from mediapipe.tasks.python.core.base_options import BaseOptions

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data-motor')
MODELO = os.path.join(RAIZ, 'modelos', 'blaze_face_short_range.tflite')


def detector():
    opciones = vision.FaceDetectorOptions(base_options=BaseOptions(model_asset_path=MODELO), min_detection_confidence=0.55)
    return vision.FaceDetector.create_from_options(opciones)


def analizar(det, ruta, por_segundo=2, maximo=24):
    cap = cv2.VideoCapture(ruta)
    if not cap.isOpened():
        raise RuntimeError('no abre: ' + ruta)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    total = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0
    dur = total / fps if total else 0
    n = max(1, min(maximo, int(dur * por_segundo) or 1))
    tiempos = [dur * (i + 0.5) / n for i in range(n)] if dur else [0]
    cuadros, ancho, alto = [], 0, 0
    for t in tiempos:
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
        ok, bgr = cap.read()
        if not ok:
            continue
        alto, ancho = bgr.shape[:2]
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        r = det.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))
        caras = []
        for d in r.detections:
            b = d.bounding_box
            caras.append({'cx': round((b.origin_x + b.width / 2) / ancho, 4), 'cy': round((b.origin_y + b.height / 2) / alto, 4),
                          'w': round(b.width / ancho, 4), 'h': round(b.height / alto, 4), 'p': round(d.categories[0].score, 3)})
        cuadros.append({'t': round(t, 2), 'caras': caras})
    cap.release()
    return {'ancho': ancho, 'alto': alto, 'cuadros': cuadros}


def main():
    if len(sys.argv) < 2:
        print('Uso: python scripts/rostros-clips.py <carpeta> [--rehacer]'); sys.exit(1)
    carpeta, rehacer = sys.argv[1], '--rehacer' in sys.argv
    r_clips = os.path.join(RAIZ, 'biblioteca', carpeta + '.clips.json')
    r_out = os.path.join(RAIZ, 'biblioteca', carpeta + '.rostros.json')
    clips = json.load(open(r_clips, encoding='utf8'))
    previo = json.load(open(r_out, encoding='utf8')) if os.path.exists(r_out) and not rehacer else {}
    det = detector()
    for c in clips:
        if c['id'] in previo or not c.get('ruta') or not os.path.exists(c['ruta']):
            continue
        try:
            previo[c['id']] = analizar(det, c['ruta'])
            k = previo[c['id']]['cuadros']
            con = sum(1 for q in k if q['caras'])
            print(f"{c['name'][:44]:44} {con}/{len(k)} cuadros con rostro")
        except Exception as e:
            print('FALLO', c['id'], e)
    json.dump(previo, open(r_out, 'w', encoding='utf8'), ensure_ascii=False)
    print('listo ->', r_out)


main()

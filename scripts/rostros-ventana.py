"""Detecta rostros en un tramo corto de un clip, a 8 cuadros por segundo (para que las marcas sigan bien a la cara).
Uso: python scripts/rostros-ventana.py <ruta> <ss> <dur>  → imprime JSON { ancho, alto, cuadros: [ { t, caras: [ {cx, cy, w, h, p} ] } ] } (t = segundo del clip)."""
import json, os, sys
import cv2
import mediapipe as mp
from mediapipe.tasks.python import vision
from mediapipe.tasks.python.core.base_options import BaseOptions

MODELO = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data-motor', 'modelos', 'blaze_face_short_range.tflite')


def main():
    ruta, ss, dur = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
    det = vision.FaceDetector.create_from_options(vision.FaceDetectorOptions(base_options=BaseOptions(model_asset_path=MODELO), min_detection_confidence=0.55))
    cap = cv2.VideoCapture(ruta)
    if not cap.isOpened():
        print(json.dumps({'ancho': 0, 'alto': 0, 'cuadros': []})); return
    cuadros, ancho, alto, t = [], 0, 0, ss
    while t <= ss + dur:
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
        ok, bgr = cap.read()
        if not ok:
            break
        alto, ancho = bgr.shape[:2]
        r = det.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)))
        caras = [{'cx': round((d.bounding_box.origin_x + d.bounding_box.width / 2) / ancho, 4), 'cy': round((d.bounding_box.origin_y + d.bounding_box.height / 2) / alto, 4),
                  'w': round(d.bounding_box.width / ancho, 4), 'h': round(d.bounding_box.height / alto, 4), 'p': round(d.categories[0].score, 3)} for d in r.detections]
        cuadros.append({'t': round(t, 3), 'caras': caras})
        t += 0.125
    cap.release()
    print(json.dumps({'ancho': ancho, 'alto': alto, 'cuadros': cuadros}))


main()

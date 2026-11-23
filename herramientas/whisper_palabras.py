# Tiempos por palabra con faster-whisper (local, gratis, CPU). Uso: python whisper_palabras.py audio.mp3 salida.json [modelo]
# Salida: {"duracion": s, "palabras": [{"w": "texto", "s": inicio, "e": fin}]}. Sin red tras la primera descarga del modelo.
# El audio se decodifica con ffmpeg (FFMPEG_BIN o el del PATH) y se pasa como arreglo: así no depende de PyAV.
import json, os, shutil, subprocess, sys, time
import numpy as np
from faster_whisper import WhisperModel

audio, salida = sys.argv[1], sys.argv[2]
modelo = sys.argv[3] if len(sys.argv) > 3 else 'small'
ffmpeg = os.environ.get('FFMPEG_BIN') or shutil.which('ffmpeg')
if not ffmpeg:
    sys.exit('falta ffmpeg (definir FFMPEG_BIN)')
t0 = time.time()
raw = subprocess.run([ffmpeg, '-v', 'quiet', '-i', audio, '-f', 's16le', '-ac', '1', '-ar', '16000', '-'], capture_output=True, check=True).stdout
pcm = np.frombuffer(raw, np.int16).astype(np.float32) / 32768
m = WhisperModel(modelo, device='cpu', compute_type='int8')
segs, info = m.transcribe(pcm, language='es', word_timestamps=True, vad_filter=False, condition_on_previous_text=False)
palabras = [{'w': w.word.strip(), 's': round(w.start, 3), 'e': round(w.end, 3)} for s in segs for w in (s.words or [])]
json.dump({'duracion': round(len(pcm) / 16000, 3), 'modelo': modelo, 'palabras': palabras}, open(salida, 'w', encoding='utf8'), ensure_ascii=False)
print(f'{len(palabras)} palabras, audio {len(pcm) / 16000:.1f}s, {time.time() - t0:.0f}s de proceso')

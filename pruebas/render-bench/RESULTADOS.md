# Medición: three.js vs Blender (2026-11-24)

Escena de prueba compartida (`scene.json`, generada por `gen-scene.js`): pasarela, 44 maniquíes de público sin rostro, 1 maniquí caminando (piernas y brazos con swing), sol con sombras suaves, cámara que avanza. 1080x1920, 24 fps, 72 cuadros (3 s). PC: RTX 3070 8 GB.

| Motor | Tiempo por cuadro | 72 cuadros (3 s) | Notas |
|---|---|---|---|
| three.js, Chrome headless con GPU (ANGLE/D3D11) | render 2 ms + captura JPEG 16 ms (`toDataURL`) o 37 ms (`screenshot`) | ~1,5–3 s | cuadros en JPEG 0,92; el render real es casi gratis, manda la captura |
| three.js, Chrome headless sin GPU (SwiftShader) | render 81 ms + captura ~40 ms | ~9 s | referencia, no se usaría |
| Blender 4.5 Eevee Next, 64 muestras | 0,41 s (mediana; primer cuadro 1,05 s) | ~30 s | incluye escribir el PNG |
| Blender 4.5 Cycles, 64 muestras + denoise | 7,3 s (6 cuadros medidos) | ~9 min | no confirmé que usara la GPU; no es viable para producción diaria |

Proyección a 12 videos diarios con 15 s de 3D por video (4 320 cuadros): three.js ≈ 3–4 min; Eevee ≈ 30 min; Cycles ≈ 8,7 h.

## Qué NO prueba
- Una sola escena simple con figuras primitivas; sin assets pesados, sin esqueletos de Mixamo, sin postproceso (desenfoque, bloom), sin fondo transparente.
- La calidad visual de ambos es parecida en este estilo de juguete; Blender suaviza mejor las sombras, three.js muestra sombras algo más duras. Las luces no están calibradas igual (se ve en el color del fondo).
- three.js usó JPEG; capturar PNG sin pérdida costará más.
- Tiempo de carga de la página y de modelos no incluido (el primer cuadro de three.js tardó 0,13 s).

## Reproducir
```
node gen-scene.js
blender -b -P bench_blender.py -- --engine eevee --stride 1 --out out_eevee
blender -b -P bench_blender.py -- --engine cycles --stride 12 --samples 64 --out out_cycles
npm install && node bench_three.js --gpu on --out out_three
```

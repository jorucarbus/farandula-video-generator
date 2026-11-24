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

## Segunda prueba: maniquí con esqueleto (glTF), 12 clones, fondo transparente
Maniquí MPFB (CC0) sin descargas: `herramientas/blender/maniqui_caminata.py` crea cuerpo + rig `game_engine` (53 huesos), alisa la cabeza y exporta GLB con un ciclo de caminata de 24 cuadros. `bench_three_gltf.js` lo carga en three.js (GLTFLoader + SkeletonUtils.clone + AnimationMixer).

| Medida (RTX 3070, 1080x1920, 12 maniquíes de 53 huesos con sombras) | Resultado |
|---|---|
| Carga de página + 2 GLB de 1,4 MB | 0,53 s |
| Render por cuadro | 2 ms |
| Captura PNG con canal alfa | 24 ms |
| Captura JPEG | 16 ms |

**Lo que sí queda comprobado:** three.js carga glTF con esqueleto, anima 12 clones desfasados, proyecta sombras sobre un suelo invisible (`ShadowMaterial`) y entrega PNG con transparencia a ~24 ms por cuadro. El renderizado no es el cuello de botella.

**Lo que NO salió bien (problema del asset, no de three.js):** el maniquí que generé a mano con MPFB tiene la malla deformada con la caminata (piernas fundidas como falda, brazos largos) y la cara alisada aún deja ver nariz y cuencas, así que no es "sin rostro". No logré arreglarlo con poses por direcciones ni calibrando ejes. Un asset ya riggeado y animado de verdad (Mixamo, Quaternius, Kenney) probablemente evita esto, pero requiere descargarlo (permiso del usuario, y verificar su licencia).

**Alternativa sin assets:** construir el maniquí en código con piezas articuladas (torso ovoide, cabeza esférica sin rasgos, cápsulas en brazos y piernas), como el héroe de la primera prueba, con una biblioteca de animaciones procedurales (caminar, aplaudir, señalar, caer). Estilo arcilla/juguete, cero riesgo de licencias, el género se distingue por silueta (cadera/hombros/cabello) y cuesta pocos tokens.

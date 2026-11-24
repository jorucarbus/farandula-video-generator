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

## Tercera prueba: maniquíes descargados (CC0), 2026-11-24
Hoja comparativa: `muestras/maniquies-comparacion.png` (3 filas: caminar a dos tiempos y un clip alterno). Script: `bench_maniquies.js`.

| Modelo | ¿Sin rostro? | Deformación | Clips | Veredicto |
|---|---|---|---|---|
| **Quaternius `Mannequin_F` (UAL2) y modelo de UAL1 (masculino)** | **Sí**, cabeza lisa | Limpia, articulaciones marcadas | 42 clips de UAL1 + 42 de UAL2, rig universal de 65 huesos; **un clip de UAL1 anima el maniquí de UAL2 sin avisos** | **Elegido** |
| KayKit Mannequin_Medium / Large | No: cara sonriente dibujada, robot de juguete | Limpia | ~170 clips (Rig_Medium/Large) | Útil como personaje estilizado, no como maniquí sin rostro |
| Kenney Mini Characters | Sin texturas al cargar el GLB suelto (salen blancos); cuerpo cuadrado | Aceptable | Solo 7 huesos, clips idle/walk/sprint/sit | Descartado para esto |

Rendimiento con los maniquíes de Quaternius (65 huesos, 2 mallas con esqueleto), 1080x1920, RTX 3070, sombras activas:
| Maniquíes en pantalla | Render por cuadro | Captura PNG con alfa |
|---|---|---|
| 12 | 2 ms | 20 ms |
| 40 | 5 ms | 24 ms |

Comprobado: clips de un GLB aplican a otro modelo del mismo rig por nombre de hueso; género por silueta (F/M); multitud de 40 con animaciones desfasadas; fondo transparente. Avisos de three.js: solo `handslotr/handslotl` (huesos de KayKit que el maniquí no tiene; irrelevantes).
Limitaciones: el maniquí femenino lleva marcas de ropa interior en dos tonos (diseño del modelo); falta probar otros clips (caída, sentarse, hablar) con calidad, y colorear/vestir con materiales propios.

## Cuarta prueba: escena de pasarela de punta a punta (2026-11-24)
`pasarela.html` + `pasarela.js`: three.js (pasarela, pantalla LED, 4 focos, flashes de cámaras, público de 78 maniquíes Quaternius desfasados, protagonista dorada con `Walk_Formal_Loop`, dolly de cámara) + capa HTML/CSS (etiqueta "Recreación ilustrativa", tarjeta de nombre, subtítulos con una palabra resaltada, caja segura x 120-900 / y 288-1260) → capturas de página → ffmpeg con la voz.
Resultado: 10 s, 1080x1920, 24 fps, 240 cuadros renderizados y codificados en **13 s** (3,1 MB). Hoja de cuadros: `muestras/pasarela-hoja.png`.
Pendientes vistos: pasarela sobreexpuesta en primer plano; subtítulos cortados a mitad de frase; público oscuro y estático; sin sincronía con el resto del guion (solo las 2 primeras frases); la tarjeta y los textos son HTML a mano, aún no son recetas parametrizadas.

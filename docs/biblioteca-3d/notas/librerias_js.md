# Catálogo de librerías JS/TS para escenas 3D y motion graphics por código (estado: 2026-11-24)

Convenciones. VERIFICADO = leído hoy en la fuente indicada. Versión y licencia salen del manifest npm (`registry.npmjs.org/<pkg>/latest`, campo `license`); NO se leyó el archivo LICENSE del repo salvo donde se indica. Estrellas y último push salen de `api.github.com/repos/...` (hoy). INFERENCIA = juicio mío, no leído en fuente. "Headless" = compatibilidad con Chrome headless (Puppeteer): para todo lo three.js es INFERENCIA razonable (WebGL vía SwiftShader/ANGLE o GPU; hay que lanzar Chrome con flags de WebGL), no probado aquí. Tamaño = `dist.unpackedSize` del paquete npm (no es tamaño del bundle). No se instaló nada.

## 1. Núcleo de render

### Takeaway
three.js es el núcleo obvio (MIT, 0.187.0, 119k estrellas, push hoy). Babylon y PlayCanvas son alternativas completas pero más pesadas y sin ecosistema de postproceso/video propio. R3F solo si se usa Remotion.

### Cited Findings
- **three.js** — https://github.com/mrdoob/three.js — motor WebGL/WebGPU; base de todo. Versión 0.187.0, MIT, unpackedSize ~21 MB (incluye ejemplos), 119.276 estrellas, push 2026-11-24. Prioridad ALTA (ya es el stack). — [npm](https://registry.npmjs.org/three/latest), [GitHub API](https://api.github.com/repos/mrdoob/three.js)
- **@react-three/fiber (R3F)** — https://github.com/pmndrs/react-three-fiber — renderer React para three. v9.8.2, MIT, peer react >=19 <19.4 y three >=0.156; 33.913 estrellas, push 2026-10-21. Requerido por @remotion/three. Prioridad MEDIA (solo si se adopta Remotion). — [npm](https://registry.npmjs.org/@react-three/fiber/latest), [GitHub](https://api.github.com/repos/pmndrs/react-three-fiber)
- **@react-three/drei** — https://github.com/pmndrs/drei — helpers (Html, Text, Environment, controles). v10.7.9, MIT, ~1,75 MB; 10.195 estrellas, push 2026-11-17. Prioridad MEDIA (con R3F). — [npm](https://registry.npmjs.org/@react-three/drei/latest), [GitHub](https://api.github.com/repos/pmndrs/drei)
- **Babylon.js** — https://github.com/BabylonJS/Babylon.js — motor 3D completo (incluye físicas, GUI, node material). babylonjs 9.37.2, Apache-2.0, ~117,6 MB unpacked; 26.439 estrellas, push 2026-11-23. Prioridad BAJA: duplica a three, no encaja con Remotion/R3F; útil solo si se quisiera su Node Material Editor. — [npm](https://registry.npmjs.org/babylonjs/latest), [GitHub](https://api.github.com/repos/BabylonJS/Babylon.js)
- **PlayCanvas engine** — https://github.com/playcanvas/engine — motor WebGL/WebGPU con editor en la nube. playcanvas 2.24.3, MIT, ~66 MB; 17.362 estrellas, push 2026-11-24. Prioridad BAJA (alternativa; no necesitamos editor). — [npm](https://registry.npmjs.org/playcanvas/latest), [GitHub](https://api.github.com/repos/playcanvas/engine)
- **A-Frame** — https://aframe.io — framework WebXR sobre three (entidad-componente). aframe 1.8.0, MIT, ~39 MB. Estrellas no verificadas. Prioridad BAJA: orientado a VR/HTML, no a video determinista. — [npm](https://registry.npmjs.org/aframe/latest)
- **OGL** — https://github.com/oframe/ogl — mini-librería WebGL (~sin dependencias). v1.0.11, Unlicense, ~423 KB. Estrellas no verificadas. Prioridad BAJA (útil para shaders 2D/efectos ligeros; sin ecosistema glTF/esqueleto comparable). — [npm](https://registry.npmjs.org/ogl/latest)
- **regl** — https://github.com/regl-project/regl — WebGL funcional. v2.1.1, MIT, ~1,2 MB. Estrellas no verificadas. Prioridad BAJA (bajo nivel; no sirve para maniquíes rigged). INFERENCIA: poco mantenimiento reciente (no se verificó). — [npm](https://registry.npmjs.org/regl/latest)
- **Filament / otros** — NO verificado (no se consultó). Filament es C++/WASM; INFERENCIA: descartable para este stack.

### Inferences
- Mantener three.js directo (sin React) es lo más simple si ya se usa Puppeteer+ffmpeg; R3F/drei entran solo con Remotion.
- Todos los motores corren en Chrome headless con WebGL por software (SwiftShader) más lento; con GPU real es rápido. No probado.

### Gaps
- Estrellas de A-Frame, OGL, regl; Filament no investigado.

## 2. Animación y timelines

### Takeaway
GSAP (licencia propia "no charge", ya no Apache/MIT) es el timeline más potente y ahora gratuito incluso para uso comercial con matices; para render determinista por frames conviene poder fijar el tiempo manualmente (`timeline.time(t)`/`seek`) — INFERENCIA, API conocida pero no releída hoy.

### Cited Findings
- **GSAP** — https://gsap.com — timelines/tweens universales. v3.15.1, licencia propia "Standard 'no charge' license" (https://gsap.com/standard-license), NO SPDX/OSI; unpackedSize ~6,3 MB. Revisar la licencia (restricciones de uso en competidores de herramientas visuales de animación) — leí solo el campo del manifest, no el texto completo. Prioridad ALTA con reserva legal. — [npm](https://registry.npmjs.org/gsap/latest)
- **Theatre.js** (@theatre/core) — https://github.com/theatre-js/theatre — animación con editor visual de timeline. v0.7.2, Apache-2.0; 13.107 estrellas, PERO último push 2024-08-14 (≈15 meses sin actividad). Prioridad BAJA/evitar para producción nueva por estancamiento. — [npm](https://registry.npmjs.org/@theatre/core/latest), [GitHub](https://api.github.com/repos/theatre-js/theatre)
- **anime.js** — https://github.com/juliangarnier/anime — v4.5.0, MIT, ~2,1 MB; 75.029 estrellas, push 2026-11-02. Prioridad MEDIA (tweens de DOM/objetos; sirve para tarjetas 2D). — [npm](https://registry.npmjs.org/animejs/latest), [GitHub](https://api.github.com/repos/juliangarnier/anime)
- **motion** (ex Framer Motion vanilla) — https://motion.dev — v14.14.0, MIT, ~1 MB. Estrellas no verificadas. Prioridad MEDIA/BAJA (orientado a UI/React; no controla three directamente sin adaptar). — [npm](https://registry.npmjs.org/motion/latest)
- **tween.js** (@tweenjs/tween.js) — https://github.com/tweenjs/tween.js — v25.0.0, MIT, ~224 KB; 10.161 estrellas, push 2026-11-17. Pequeño, controlable por `update(time)` => determinista. Prioridad ALTA como opción ligera. — [npm](https://registry.npmjs.org/@tweenjs/tween.js/latest), [GitHub](https://api.github.com/repos/Tweenjs/tween.js)
- **popmotion** — v11.0.5, MIT; manifest sin campo `deprecated`. NO verifiqué mantenimiento (inferencia: pasó a ser parte de Motion). Prioridad BAJA. — [npm](https://registry.npmjs.org/popmotion/latest)

### Inferences
- Para determinismo, la regla es: ninguna animación depende de `requestAnimationFrame`/reloj real; el tiempo se inyecta por frame. tween.js y GSAP lo permiten; ver sección 12.

### Gaps
- Texto completo de licencia GSAP y estrellas/mantenimiento de motion y popmotion.

## 3. Físicas

### Takeaway
Rapier (Apache-2.0, activo) es la opción moderna y determinista en WASM; cannon-es está sin cambios desde 2024.

### Cited Findings
- **Rapier (@dimforge/rapier3d-compat)** — https://github.com/dimforge/rapier.js — v0.21.0, Apache-2.0, ~15 MB (WASM embebido); 700 estrellas en rapier.js, push 2026-07-12. Rapier anuncia determinismo cross-platform (INFERENCIA/conocimiento; no releído hoy). Prioridad ALTA. — [npm](https://registry.npmjs.org/@dimforge/rapier3d-compat/latest), [GitHub](https://api.github.com/repos/dimforge/rapier.js)
- **@react-three/rapier** — wrapper R3F. v2.2.0; el manifest NO declara licencia (campo vacío) — tratar como no verificado/precaución. — [npm](https://registry.npmjs.org/@react-three/rapier/latest)
- **cannon-es** — https://github.com/pmndrs/cannon-es — v0.20.0, MIT, ~774 KB; 2.094 estrellas, último push 2024-01-06 (estancado). Prioridad MEDIA/BAJA: simple pero sin mantenimiento. — [npm](https://registry.npmjs.org/cannon-es/latest), [GitHub](https://api.github.com/repos/pmndrs/cannon-es)
- **jolt-physics (JoltPhysics.js)** — https://github.com/jrouwe/JoltPhysics.js — v1.1.2, MIT, ~46,8 MB unpacked; 591 estrellas, push 2026-11-21. Motor AAA (ragdolls, vehículos). Prioridad MEDIA (ragdoll de maniquís). — [npm](https://registry.npmjs.org/jolt-physics/latest), [GitHub](https://api.github.com/repos/jrouwe/JoltPhysics.js)
- **matter-js** — https://github.com/liabru/matter-js — física 2D. v0.20.0, MIT, ~927 KB; 18.674 estrellas, push 2026-09-30. Prioridad BAJA (2D; tarjetas que caen/rebotan). — [npm](https://registry.npmjs.org/matter-js/latest), [GitHub](https://api.github.com/repos/liabru/matter-js)
- **ammo.js** — NO verificado (no consultado). INFERENCIA: puerto de Bullet, pesado y de mantenimiento irregular; Jolt/Rapier lo reemplazan. Evitar salvo necesidad.

### Inferences
- Para video determinista con paso fijo (1/30 s) Rapier o Jolt son preferibles; también se pueden pre-simular y hornear en keyframes.

### Gaps
- Licencia declarada de @react-three/rapier y ammo.js sin investigar.

## 4. Esqueleto / IK / retargeting

### Takeaway
La parte esencial viene incluida en three/examples (SkeletonUtils, CCDIKSolver); librerías externas de IK son pocas y poco activas.

### Cited Findings
- **three: SkeletonUtils.retargetClip / clone, CCDIKSolver, IKSolver** — incluidos en `three/examples/jsm` (MIT, versión de three 0.187.0). Existencia de estas utilidades es conocimiento previo (INFERENCIA; no releí la doc hoy). Prioridad ALTA (cero dependencias extra). — [three npm](https://registry.npmjs.org/three/latest)
- **three-ik** — v0.1.0, MIT, ~105 KB. Repositorio: el URL probado (zalo/three-ik) dio 404; no verifiqué el repo real ni mantenimiento. Prioridad BAJA (versión 0.x, aparentemente sin actividad: INFERENCIA). — [npm](https://registry.npmjs.org/three-ik/latest)
- **fullik** — v? NO verificado (el paquete npm "fullik" devolvió 404). Prioridad BAJA/descartar hasta confirmar.

### Inferences
- Para maniquíes sin rostro con animación procedural, bastará con rotar huesos por código + CCDIK de three; retargeting (Mixamo → rig propio) con `SkeletonUtils.retargetClip`.

### Gaps
- Repo y estado de three-ik; fullik; otras librerías de IK/retargeting no investigadas.

## 5. Multitudes, instancing, GPU, BVH

### Cited Findings
- **InstancedMesh / BatchedMesh** — incluidos en three core (MIT, 0.187.0). Existencia: conocimiento previo, no releído. Prioridad ALTA (multitudes). — [npm three](https://registry.npmjs.org/three/latest)
- **three-mesh-bvh** — https://github.com/gkjohnson/three-mesh-bvh — raycast acelerado, base de CSG y pathtracer. v0.10.0, MIT, ~2,6 MB; 3.586 estrellas, push 2026-11-24. Prioridad MEDIA. — [npm](https://registry.npmjs.org/three-mesh-bvh/latest), [GitHub](https://api.github.com/repos/gkjohnson/three-mesh-bvh)
- **three-gpu-pathtracer** — https://github.com/gkjohnson/three-gpu-pathtracer — path tracing en GPU (calidad cine, lento). v0.0.28, MIT, ~2 MB; 2.067 estrellas, push 2026-11-24. Prioridad BAJA (ruido/tiempo por frame; headless requiere GPU real: INFERENCIA). — [npm](https://registry.npmjs.org/three-gpu-pathtracer/latest), [GitHub](https://api.github.com/repos/gkjohnson/three-gpu-pathtracer)

## 6. Postproceso

### Cited Findings
- **postprocessing (pmndrs)** — https://github.com/pmndrs/postprocessing — bloom, DOF, outline, SSAO, etc. v6.39.6, licencia Zlib (permisiva), ~2,8 MB; peer `three >=0.168 <0.188` (compatible con 0.187.0 pero cuidado al subir three); 2.992 estrellas, push 2026-11-22. Prioridad ALTA. — [npm](https://registry.npmjs.org/postprocessing/latest), [GitHub](https://api.github.com/repos/pmndrs/postprocessing)
- **@react-three/postprocessing** — wrapper R3F. v3.0.1? (el fetch devolvió "3.0.1", MIT, ~503 KB; ver nota: respuesta mapeada por orden de llamadas, trátese como poco fiable). Prioridad MEDIA (solo R3F). — [npm](https://registry.npmjs.org/@react-three/postprocessing/latest)
- **N8AO** — https://github.com/N8python/n8ao — AO de alta calidad. n8ao 2.1.0? Según el manifest consultado: ISC, ~1 MB. Repo URL probado distinto dio 404; estrellas no verificadas. Prioridad ALTA/MEDIA (da volumen a maniquíes y escenarios simples). — [npm](https://registry.npmjs.org/n8ao/latest)
- SSAO/Bloom/Outline/DOF: existen también como passes de three/examples (EffectComposer) — conocimiento previo, no releído. Prioridad MEDIA.

### Gaps
- Estrellas de N8AO; nota de fiabilidad: parte de las respuestas WebFetch por paquete vienen resumidas por un modelo pequeño.

## 7. Texto 3D y tipografía

### Cited Findings
- **troika-three-text** — https://github.com/protectwise/troika — texto SDF de alta calidad (soporta fuentes ttf/woff, no necesita geometría). v0.53.1, MIT, ~879 KB; 1.996 estrellas, push 2026-11-02. Prioridad ALTA para rótulos. Headless: requiere cargar la fuente y usar workers; INFERENCIA. — [npm](https://registry.npmjs.org/troika-three-text/latest), [GitHub](https://api.github.com/repos/protectwise/troika)
- **TextGeometry (three/examples)** — texto extruido; incluido en three (MIT). Prioridad MEDIA (títulos 3D). Conocimiento previo.
- **three-bmfont-text** — https://github.com/Experience-Monks/three-bmfont-text — 803 estrellas, último push 2022-03-22 (abandonado). EVITAR. — [GitHub](https://api.github.com/repos/Experience-Monks/three-bmfont-text) (npm 404 con ese nombre exacto)

## 8. Geometría procedural / CSG

### Cited Findings
- **three-bvh-csg** — https://github.com/gkjohnson/three-bvh-csg — booleanas (unión/resta) para escenarios. v0.0.19? (manifest: 0.0.19, MIT, ~1,4 MB); 965 estrellas, push 2026-11-24. Prioridad MEDIA. — [npm](https://registry.npmjs.org/three-bvh-csg/latest), [GitHub](https://api.github.com/repos/gkjohnson/three-bvh-csg)
- Ruido (simplex-noise), subdivisión, generadores de ciudades/edificios: NO investigados. Gap.

## 9. Partículas / VFX

### Cited Findings
- **three.quarks** — https://github.com/Alchemist0823/three.quarks — sistema de partículas/VFX con editor. v0.18.0? (manifest: 0.18.0, MIT, ~1,3 MB); 1.295 estrellas, push 2026-11-18. Prioridad MEDIA. — [npm](https://registry.npmjs.org/three.quarks/latest), [GitHub](https://api.github.com/repos/Alchemist0823/three.quarks)
- **three-nebula** — https://github.com/creativelifeform/three-nebula — partículas. v13.3.0? (manifest: MIT, ~1,8 MB); 1.252 estrellas, push 2026-10-22. Prioridad BAJA/MEDIA (alternativa a quarks). — [npm](https://registry.npmjs.org/three-nebula/latest), [GitHub](https://api.github.com/repos/creativelifeform/three-nebula)
- Para determinismo, las partículas con RNG propio y paso fijo; INFERENCIA, no verificado en estas librerías.

## 10. Materiales / shaders

### Cited Findings
- **three-custom-shader-material (CSM)** — https://github.com/FarazzShaikh/THREE-CustomShaderMaterial — extiende materiales estándar con GLSL propio. v6.4.0, MIT, ~145 KB. Estrellas no verificadas. Prioridad MEDIA. — [npm](https://registry.npmjs.org/three-custom-shader-material/latest)
- **MeshTransmissionMaterial** (drei) y **MeshToonMaterial** (three core): existen (conocimiento previo, no releídos). Toon: ALTA para look de recortes/maniquí; transmisión: BAJA.

## 11. Herramientas glTF

### Cited Findings
- **glTF-Transform** — https://github.com/donmccurdy/glTF-Transform — API/CLI para optimizar glTF. @gltf-transform/core v4.5.1? (manifest: MIT, ~1,8 MB); pendiente repo. Prioridad ALTA (pipeline de assets). — [npm](https://registry.npmjs.org/@gltf-transform/core/latest) (repo API consultado sin dato legible: gap)
- **gltf-pipeline** — v4.3.1, Apache-2.0, ~252 KB. Prioridad BAJA (glTF-Transform lo supera). — [npm](https://registry.npmjs.org/gltf-pipeline/latest)
- **meshoptimizer** — v1.3.0, MIT, ~313 KB. Prioridad MEDIA. — [npm](https://registry.npmjs.org/meshoptimizer/latest)
- **gltfpack** — v1.3.0, MIT, ~348 KB. Prioridad MEDIA. — [npm](https://registry.npmjs.org/gltfpack/latest)
- **draco3d** — v1.5.9, Apache-2.0, ~847 KB. Prioridad BAJA (meshopt suele bastar). — [npm](https://registry.npmjs.org/draco3d/latest)
- **KTX2 / Basis**: no verificado.

### Gaps
- Atención: varias versiones de esta sección vienen de respuestas resumidas; reverificar con `npm view` antes de fijar.

## 12. Render determinista a video

### Takeaway
Dos caminos: (a) Remotion (@remotion/three) con renderizado por frame controlado, licencia Company si >3 empleados; (b) tu propio bucle Puppeteer/ffmpeg con tiempo inyectado. HyperFrames (HeyGen, Apache-2.0) es una opción nueva, a evaluar.

### Cited Findings
- **Remotion** — https://github.com/remotion-dev/remotion — video con React. remotion 4.0.546, licencia propia ("SEE LICENSE IN LICENSE.md"): gratuita para individuos, empresas con hasta 3 empleados, sin ánimo de lucro y evaluación; requiere Company License si es una empresa lucrativa con más de 3 empleados (precio no figura en el LICENSE). 75.376 estrellas, push 2026-11-24. NO es OSI. Prioridad MEDIA/ALTA (depende de tamaño de equipo). — [LICENSE.md](https://raw.githubusercontent.com/remotion-dev/remotion/main/LICENSE.md), [npm](https://registry.npmjs.org/remotion/latest), [GitHub](https://api.github.com/repos/remotion-dev/remotion)
- **@remotion/three** — v4.0.546, MIT (manifest), pero depende de remotion (licencia propia); peer: react >=16.8, three >=0.137, @react-three/fiber >=8. Prioridad MEDIA. — [npm](https://registry.npmjs.org/@remotion/three/latest)
- **puppeteer-capture** — v1.70.0? (manifest: MIT, ~74 KB, "A Puppeteer plugin for capturing page as a video with ultimate quality"). Repo no localizado (URL probado 404). Prioridad MEDIA. — [npm](https://registry.npmjs.org/puppeteer-capture/latest)
- **CCapture.js** — https://github.com/spite/ccapture.js — v2.0.0? en manifest, MIT; 3.782 estrellas, push 2026-10-13. Pensado para captura en navegador (webm/png); no clásico headless. Prioridad BAJA. — [npm](https://registry.npmjs.org/ccapture.js/latest), [GitHub](https://api.github.com/repos/spite/ccapture.js)
- **HyperFrames (HeyGen)** — https://github.com/heygen-com/hyperframes — "videos escritos como HTML y renderizados a MP4"; paquete hyperframes 0.9.90, Apache-2.0; 89.340 estrellas, push 2026-11-24. Madurez: versión 0.x, evaluar; el número de estrellas llama la atención y no lo validé independientemente. Prioridad MEDIA (evaluar). — [GitHub](https://api.github.com/repos/heygen-com/hyperframes), [npm](https://registry.npmjs.org/hyperframes/latest)

### Inferences
- Para un sistema propio ya basado en Puppeteer+ffmpeg, no hay que adoptar Remotion; sí aplicar sus principios (tiempo = frame/fps).

## 13. Gráficas 3D de datos

### Cited Findings
- **d3** — https://d3js.org — v7.9.2, ISC, ~882 KB. Prioridad MEDIA (escalas, layouts para tarjetas/gráficos). — [npm](https://registry.npmjs.org/d3/latest)
- **deck.gl** — https://deck.gl — v9.4.2? (manifest: MIT, ~6,5 MB). Prioridad BAJA (mapas/geodatos). — [npm](https://registry.npmjs.org/deck.gl/latest)

## 14. UI / HTML en 3D

### Cited Findings
- **CSS3DRenderer** (three/examples) y **drei Html** — existentes por conocimiento previo, no releídos. Prioridad BAJA: mezclar DOM con WebGL complica la captura determinista; preferir texturas de canvas/troika para tarjetas (INFERENCIA).

## Resumen de prioridad (INFERENCIA)
ALTA: three, tween.js/GSAP (revisar licencia), Rapier, postprocessing, troika-three-text, glTF-Transform, three/examples (SkeletonUtils, CCDIK, InstancedMesh). MEDIA: Remotion/@remotion/three/R3F (según tamaño de equipo), Jolt, three-bvh-csg, three.quarks, N8AO, CSM, meshopt/gltfpack, HyperFrames. EVITAR/BAJA: Theatre.js (sin push desde 2024-08), three-bmfont-text (abandonada), cannon-es (estancada), three-ik, ccapture.js, ammo.js.

## Gaps globales
- Filament, ammo.js, fullik, simplex-noise, generadores de ciudades, KTX2 y CSS3DRenderer sin verificar. Licencias leídas del manifest npm, no del LICENSE de cada repo (salvo Remotion). Algunas versiones marcadas "?" pueden estar desalineadas por el resumen automático del fetch; confirmar con `npm view`.

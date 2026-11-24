# Biblioteca 3D y animaciones: catálogo clasificado

Generado: 2026-11-24. Consolida 5 notas de investigación (librerias_js, animaciones, modelos_escenarios, personajes_y_ia3d, blender_pipeline). El detalle completo (URL, formatos, requisitos, condiciones, notas) está en `catalogo.json`; consúltalo con `node docs/biblioteca-3d/buscar.js <texto>`.

Reglas de lectura: `estado V` = la nota lo verificó en fuente; `I` = inferencia o memoria. Donde la nota no pudo verificar algo o hay fuentes en conflicto, se conserva esa incertidumbre. Nada se instaló ni descargó.

## Qué descargar primero (con permiso del usuario)

Ordenados por valor y menor riesgo de licencia. Nada se descarga sin tu visto bueno.

| # | Item | Por qué | Licencia (estado) |
|---|---|---|---|
| 1 | Quaternius — Universal Animation Library 1 (UAL1) | CC0, GLB, rig universal; locomoción, sentarse, empujar, emotes. | CC0 (libre para uso personal, educativo y comercial) (verificada) |
| 2 | Kenney (packs 3D) | CC0 sin atribución; ciudad, autos, mobiliario low-poly coherente. | CC0; uso comercial permitido; atribución no requerida… (verificada) |
| 3 | Quaternius (packs de modelos y personajes modulares) | CC0/QAL; personajes modulares, mobiliario, naturaleza (leer el .txt de cada kit). | CC0 o 'QAL License' según el kit (FAQ); uso comercial… (verificada) |
| 4 | Poly Haven | CC0; HDRI y texturas de fondo (descarga manual; la API tiene conflicto de términos). | CC0; uso comercial permitido; atribución no requerida;… (en_conflicto) |
| 5 | KayKit — Character Animations | CC0; wave, cheer, dance, throw, pick up (solo rigs KayKit antiguos; hará falta retarget). | CC0 (pago 'name your own price'), sin atribución (verificada) |
| 6 | Quaternius — Universal Animation Library 2 (UAL2) | CC0; 130+ clips en el mismo rig (beber para brindis). | CC0 (verificada) |
| 7 | glTF-Transform | CLI para optimizar/validar GLB (licencia de software sin confirmar; ver pendientes). | MIT (@gltf-transform/core v4.5.1?) según manifest; la… (no_verificada) |
| 8 | gltfpack | MIT; comprime con meshopt y KTX2. | MIT (v1.3.0) (verificada) |
| 9 | Blender 4.5 LTS + automatización headless (bpy) | Base scripteable del pipeline (GPL; el exportador glTF es Apache-2.0). | Blender GPL; exportador glTF Apache-2.0; la salida no… (no_verificada) |
| 10 | Mixamo (Adobe) | Mayor cobertura social gratuita; condiciones: no redistribuir FBX/GLB crudos; verificar términos hoy. | Royalty-free para proyectos personales, comerciales y… (verificada) |

Ya en el stack, sin descarga: three.js (MIT), SkeletonUtils/CCDIK/InstancedMesh de three/examples. Candidato fuerte pendiente de licencia: MPFB (leer LICENSE.ASSETS.md antes de usar).

## Lo que NO hay que usar

Licencia no comercial, servicio cerrado, abandonado, riesgo de seguridad o 'NO USAR sin verificar' según las notas.

- **No comerciales (datasets de movimiento):** AMASS; LAFAN1 (Ubisoft); Motion-X; HumanML3D; BABEL; Bandai Namco motion dataset (3.000 moves); 4TU.ResearchData — conversión FBX de CMU; MotionCLR; SMPL-X (Max Planck); HY-Motion 1.0 (Tencent)
- **Modelos texto→movimiento open-source (pesos con datos AMASS):** MoMask; T2M-GPT; MDM (Motion Diffusion Model); MotionGPT; MLD (Motion Latent Diffusion)
- **Cerrado, riesgoso o descartado:** Ready Player Me; blender-mcp comunitario (ahujasid, 'MCP for Blender'); Fork Atlas-3D-Artist/rokoko-studio-live-blender; Houdini Apprentice; Thingiverse; Synty (POLYGON, etc.)
- **Sin verificar: no usar hasta leer licencia:** Modelos de ejemplo de three.js (Soldier, Xbot, Michelle, RobotExpressive); MetaHuman (Epic); Daz 3D; KayKit (Kay Lousberg) — packs de modelos y personajes; OpenGameArt (OGA); TurboSquid; Free3D; CGTrader; Tripo; InstantMesh; Instant Meshes; RigNet; RancidMilk — Free Character Animations (itch.io)
- **Abandonado o estancado (JS):** Theatre.js (@theatre/core); three-bmfont-text; cannon-es; three-ik; CCapture.js; ammo.js
- Regla general: no usar packs CC-BY-SA, GPL o NC; en Sketchfab, evitar NC y modelos de marcas.

## Índice por tipo y categoría

### libreria_js (54 items)

**render_nucleo**

| Nombre | Para qué sirve | Licencia y estado | Prioridad | Acción |
|---|---|---|---|---|
| three.js | Núcleo del render determinista 9:16 con maniquíes; ya es nuestro stack. | MIT (v0.187.0) (verificada; comercial: si) | alta | usar_ya |
| @react-three/fiber (R3F) | Solo si se adopta Remotion (lo requiere @remotion/three). | MIT (v9.8.2) (verificada; comercial: si) | media | probar |
| @react-three/drei | Útil solo junto a R3F/Remotion. | MIT (v10.7.9) (verificada; comercial: si) | media | probar |
| Babylon.js | Duplica a three; solo útil por su Node Material Editor. | Apache-2.0 (babylonjs 9.37.2) (verificada; comercial: si) | baja | evitar |
| PlayCanvas engine | Alternativa a three; no necesitamos el editor. | MIT (playcanvas 2.24.3) (verificada; comercial: si) | baja | evitar |
| A-Frame | Orientado a VR/HTML, no a video determinista; no aporta. | MIT (aframe 1.8.0) (verificada; comercial: si) | baja | evitar |
| OGL | Posible para shaders 2D/efectos ligeros; sin ecosistema glTF/esqueleto comparable. | Unlicense (v1.0.11) (verificada; comercial: si) | baja | vigilar |
| regl | No sirve para maniquíes rigged. | MIT (v2.1.1) (verificada; comercial: si) | baja | evitar |
| Filament | Descartable para este stack (INFERENCIA). | NO verificada (no consultada) (no_verificada; comercial: desconocido) | evitar | evitar |

**animacion_timelines**

| Nombre | Para qué sirve | Licencia y estado | Prioridad | Acción |
|---|---|---|---|---|
| GSAP | Timeline potente para coreografía por frames; permite fijar el tiempo manualmente (INFERENCIA:… | Licencia propia 'Standard no charge' (https://gsap.com/stan… (no_verificada; comercial: desconocido) | alta | verificar_primero |
| Theatre.js (@theatre/core) | Estancada: evitar en producción nueva. | Apache-2.0 (v0.7.2) (verificada; comercial: si) | evitar | evitar |
| anime.js | Sirve para tarjetas 2D. | MIT (v4.5.0) (verificada; comercial: si) | media | probar |
| motion (ex Framer Motion vanilla) | No controla three directamente sin adaptar. | MIT (v14.14.0) (verificada; comercial: si) | baja | vigilar |
| tween.js (@tweenjs/tween.js) | Determinista por tiempo inyectado por frame; opción ligera para mover maniquíes/cámara. | MIT (v25.0.0) (verificada; comercial: si) | alta | descargar_con_permiso |
| popmotion | Sin valor frente a tween.js/GSAP. | MIT (v11.0.5) (verificada; comercial: si) | baja | evitar |

**fisicas**

| Nombre | Para qué sirve | Licencia y estado | Prioridad | Acción |
|---|---|---|---|---|
| Rapier (@dimforge/rapier3d-compat) | Física determinista a paso fijo (1/30 s) para caídas/tropiezos o pre-simular y hornear keyfram… | Apache-2.0 (v0.21.0) (verificada; comercial: si) | alta | descargar_con_permiso |
| @react-three/rapier | Solo con R3F. | El manifest NO declara licencia (campo vacío) (no_verificada; comercial: desconocido) | baja | verificar_primero |
| cannon-es | Simple pero estancada. | MIT (v0.20.0) (verificada; comercial: si) | baja | evitar |
| jolt-physics (JoltPhysics.js) | Ragdoll de maniquíes (caídas, desmayos). | MIT (v1.1.2) (verificada; comercial: si) | media | probar |
| matter-js | Tarjetas 2D que caen/rebotan. | MIT (v0.20.0) (verificada; comercial: si) | baja | vigilar |
| ammo.js | Jolt/Rapier lo reemplazan; evitar salvo necesidad. | NO verificada (no consultada) (no_verificada; comercial: desconocido) | evitar | evitar |

**esqueleto_ik_retargeting**

| Nombre | Para qué sirve | Licencia y estado | Prioridad | Acción |
|---|---|---|---|---|
| three/examples: SkeletonUtils.retargetClip/clone, CCDIKSolver, IKSolver | Retargeting Mixamo→rig propio y rotación de huesos/IK de maniquíes sin dependencias extra. | MIT (con three 0.187.0) (verificada; comercial: si) | alta | usar_ya |
| three-ik | Reemplazable por CCDIK de three. | MIT (v0.1.0) (verificada; comercial: si) | baja | evitar |
| fullik | Descartar hasta confirmar. | NO verificada: el paquete npm 'fullik' devolvió 404 (no_verificada; comercial: desconocido) | baja | verificar_primero |

**multitudes_instancing**

| Nombre | Para qué sirve | Licencia y estado | Prioridad | Acción |
|---|---|---|---|---|
| three: InstancedMesh / BatchedMesh | Multitudes (público, fotógrafos, asistentes) con un draw call. | MIT (con three 0.187.0) (verificada; comercial: si) | alta | usar_ya |
| three-mesh-bvh | Colisión/raycast de utilería; dependencia de CSG. | MIT (v0.10.0) (verificada; comercial: si) | media | probar |
| three-gpu-pathtracer | Poco práctico: ruido y tiempo por frame. | MIT (v0.0.28) (verificada; comercial: si) | baja | evitar |

**postproceso**

| Nombre | Para qué sirve | Licencia y estado | Prioridad | Acción |
|---|---|---|---|---|
| postprocessing (pmndrs) | Bloom/outline/DOF para look de recortes y flashes. | Zlib (v6.39.6) (verificada; comercial: si) | alta | descargar_con_permiso |
| @react-three/postprocessing | Solo con R3F. | MIT (v3.0.1?) (no_verificada; comercial: si) | media | probar |
| N8AO | Da volumen a maniquíes y escenarios simples. | ISC (n8ao 2.1.0?) (no_verificada; comercial: si) | alta | probar |
| three/examples: passes EffectComposer (SSAO, Bloom, Outline, DOF) | Alternativa sin dependencias a postprocessing. | MIT (con three 0.187.0) (verificada; comercial: si) | media | probar |

**texto_3d**

| Nombre | Para qué sirve | Licencia y estado | Prioridad | Acción |
|---|---|---|---|---|
| troika-three-text | Rótulos/titulares de noticias en pantalla. | MIT (v0.53.1) (verificada; comercial: si) | alta | descargar_con_permiso |
| TextGeometry (three/examples) | Títulos 3D. | MIT (con three) (verificada; comercial: si) | media | probar |
| three-bmfont-text | Abandonada: evitar. | No indicada (no_verificada; comercial: desconocido) | evitar | evitar |

**geometria_procedural_csg**

| Nombre | Para qué sirve | Licencia y estado | Prioridad | Acción |
|---|---|---|---|---|
| three-bvh-csg | Escenarios simples por geometría constructiva. | MIT (v0.0.19?) (verificada; comercial: si) | media | probar |
| simplex-noise / generadores de ciudades y edificios / subdivisión | Posible fondo procedural. | NO investigados (no_verificada; comercial: desconocido) | baja | verificar_primero |

**particulas_vfx**

| Nombre | Para qué sirve | Licencia y estado | Prioridad | Acción |
|---|---|---|---|---|
| three.quarks | Destellos de flash, confeti, humo. | MIT (v0.18.0?) (verificada; comercial: si) | media | probar |
| three-nebula | Alternativa a quarks. | MIT (v13.3.0?) (verificada; comercial: si) | baja | vigilar |

**materiales_shaders**

| Nombre | Para qué sirve | Licencia y estado | Prioridad | Acción |
|---|---|---|---|---|
| three-custom-shader-material (CSM) | Look arcilla/recorte personalizado. | MIT (v6.4.0) (verificada; comercial: si) | media | probar |
| MeshToonMaterial (three) / MeshTransmissionMaterial (drei) | Toon: ALTA para look de recortes/maniquí; transmisión: BAJA. | MIT (three) / MIT (drei) (verificada; comercial: si) | alta | usar_ya |

**compresion_gltf**

| Nombre | Para qué sirve | Licencia y estado | Prioridad | Acción |
|---|---|---|---|---|
| glTF-Transform | Optimizar y comprimir GLB de maniquíes y clips por CLI. | MIT (@gltf-transform/core v4.5.1?) según manifest; la págin… (no_verificada; comercial: si) | alta | descargar_con_permiso |
| gltf-pipeline | Superado por glTF-Transform. | Apache-2.0 (v4.3.1) (verificada; comercial: si) | baja | evitar |
| meshoptimizer | Base de gltfpack; meshopt comprime también keyframes. | MIT (v1.3.0) (verificada; comercial: si) | media | descargar_con_permiso |
| gltfpack | Comprimir GLB con meshopt + KTX2: gltfpack -i scene.gltf -o scene.glb -cc -tc. | MIT (v1.3.0) (verificada; comercial: si) | alta | descargar_con_permiso |
| draco3d | Meshopt suele bastar; Draco solo comprime geometría, no animación. | Apache-2.0 (v1.5.9) (verificada; comercial: si) | baja | vigilar |
| KTX2 / Basis | Reducir peso de texturas del GLB. | NO verificado (no_verificada; comercial: desconocido) | media | verificar_primero |

**render_determinista_video**

| Nombre | Para qué sirve | Licencia y estado | Prioridad | Acción |
|---|---|---|---|---|
| Remotion | Opción de render determinista; hoy no hace falta si ya hay Puppeteer+ffmpeg. | Licencia propia 'SEE LICENSE IN LICENSE.md' (remotion 4.0.5… (verificada; comercial: con_condiciones) | media | verificar_primero |
| @remotion/three | Solo si se adopta Remotion. | MIT (manifest v4.0.546) pero depende de remotion (licencia… (verificada; comercial: con_condiciones) | media | verificar_primero |
| puppeteer-capture | Captura frame a frame desde Chrome headless. | MIT (v1.70.0?) (verificada; comercial: si) | media | probar |
| CCapture.js | No es clásico headless; baja prioridad. | MIT (v2.0.0?) (verificada; comercial: si) | baja | evitar |
| HyperFrames (HeyGen) | Opción nueva a evaluar para render determinista. | Apache-2.0 (hyperframes 0.9.90) (verificada; comercial: si) | media | probar |

**graficas_datos**

| Nombre | Para qué sirve | Licencia y estado | Prioridad | Acción |
|---|---|---|---|---|
| d3 | Gráficos/tarjetas de datos en pantalla. | ISC (v7.9.2) (verificada; comercial: si) | media | probar |
| deck.gl | Poco relevante. | MIT (v9.4.2?) (verificada; comercial: si) | baja | evitar |

**ui_html_en_3d**

| Nombre | Para qué sirve | Licencia y estado | Prioridad | Acción |
|---|---|---|---|---|
| CSS3DRenderer (three/examples) / drei Html | Mezclar DOM con WebGL complica la captura determinista; preferir texturas de canvas/troika (IN… | MIT (three/drei) (verificada; comercial: si) | baja | evitar |

### animaciones (31 items)

**clips_libres**

| Nombre | Para qué sirve | Licencia y estado | Prioridad | Acción |
|---|---|---|---|---|
| Mixamo (Adobe) | Mayor cobertura social gratuita (aplaudir, señalar, hablar con gestos, caídas, sentarse, llora… | Royalty-free para proyectos personales, comerciales y sin f… (verificada; comercial: con_condiciones) | alta | descargar_con_permiso |
| Quaternius — Universal Animation Library 1 (UAL1) | Banco CC0 de locomoción, sentarse, empujar, muerte/knockdown y emotes con GLB directo a three.… | CC0 (libre para uso personal, educativo y comercial) (verificada; comercial: si) | alta | descargar_con_permiso |
| Quaternius — Universal Animation Library 2 (UAL2) | Más clips CC0 en el mismo rig que UAL1 (beber para brindis, actividades civiles). | CC0 (verificada; comercial: si) | alta | descargar_con_permiso |
| KayKit — Character Animations | Wave, cheer, dance, throw y pick up sirven para saludar, celebrar, bailar, lanzar y entregar o… | CC0 (pago 'name your own price'), sin atribución (verificada; comercial: si) | media | descargar_con_permiso |
| Kenney — Animated Characters 1/2/3 | Valor mínimo para nosotros. | CC0 (verificada; comercial: si) | baja | vigilar |

**mocap**

| Nombre | Para qué sirve | Licencia y estado | Prioridad | Acción |
|---|---|---|---|---|
| 100STYLE (Ian Mason) | Variantes de caminar para 'desfile', orgulloso/triste/borracho. | CC BY 4.0 (verificada; comercial: si) | media | probar |
| CMU Motion Capture Database | Cantidad e interacciones (abrazos, discusión, caídas, aplausos, saludos, gestos al hablar). | Términos CMU: puede incluirse en productos vendidos comerci… (en_conflicto; comercial: con_condiciones) | media | verificar_primero |
| Unity Asset Store — Huge FBX Mocap Library (partes 1-3) | Fuente cómoda de FBX de CMU para retargetear. | EULA estándar de Unity (no_verificada; comercial: desconocido) | media | verificar_primero |
| RancidMilk — Free Character Animations (itch.io) | Conveniencia; prioridad baja. | Afirmación del autor: uso libre en investigación y comercia… (no_verificada; comercial: desconocido) | baja | verificar_primero |
| Rokoko — free mocap assets / Motion Library | Packs sociales/temáticos gratis. | Páginas de packs dicen uso comercial permitido; términos fo… (no_verificada; comercial: desconocido) | media | verificar_primero |
| Truebones | Poco: no hay packs humanos gratis hallados. | Royalty-free comercial, redistribución/reventa prohibida; p… (verificada; comercial: con_condiciones) | baja | vigilar |
| MoCap Online | Poco. | Licencia del demo NO verificada; packs de pago bajo EULA Un… (no_verificada; comercial: desconocido) | baja | vigilar |

**mocap_no_comercial**

| Nombre | Para qué sirve | Licencia y estado | Prioridad | Acción |
|---|---|---|---|---|
| 4TU.ResearchData — conversión FBX de CMU | Ninguno: la licencia de esta copia es NC. | CC BY-NC 4.0 en metadatos (verificada; comercial: no) | evitar | evitar |
| AMASS | Ninguno directo: solo no comercial. | Solo investigación, educación y proyectos artísticos no com… (verificada; comercial: no) | evitar | evitar |
| LAFAN1 (Ubisoft) | Ninguno: NC-ND. | CC BY-NC-ND 4.0 (verificada; comercial: no) | evitar | evitar |
| Motion-X | Ninguno: NC-SA. | CC BY-NC-SA 4.0; requiere formulario de autorización; sub-d… (verificada; comercial: no) | evitar | evitar |
| HumanML3D | Ninguno: solo investigación. | Deriva de AMASS/HumanAct12, solo investigación (según el pa… (no_verificada; comercial: no) | evitar | evitar |
| BABEL | Ninguno. | NO VERIFICADO: INFERENCIA de que hereda la restricción no c… (no_verificada; comercial: no) | evitar | evitar |
| Bandai Namco motion dataset (3.000 moves) | Ninguno. | NO VERIFICADO; conocimiento previo: CC BY-NC-ND (no_verificada; comercial: no) | evitar | evitar |

**servicios_texto_movimiento**

| Nombre | Para qué sirve | Licencia y estado | Prioridad | Acción |
|---|---|---|---|---|
| DeepMotion Animate 3D / SayMotion | Posible camino comercial para acciones sin cobertura (desfile, abrazo, etc.). | Plan gratis solo no comercial; comercial requiere plan de p… (en_conflicto; comercial: con_condiciones) | media | verificar_primero |
| Move.ai | Requiere video de un actor; poco útil. | Gratis solo no comercial; Standard con uso comercial (en_conflicto; comercial: con_condiciones) | baja | vigilar |
| Plask | Poca. | Términos comerciales NO confirmados (no_verificada; comercial: desconocido) | baja | vigilar |
| Meshcapade (MoCapade, texto-a-movimiento) | Posible camino comercial; verificar. | Licencia comercial de las salidas NO confirmada; ofrecen li… (no_verificada; comercial: desconocido) | media | verificar_primero |
| Rokoko Create / Text-to-Motion (Rokoko Studio) | Posible camino comercial para acciones sin cobertura. | Términos de salida NO verificados (no_verificada; comercial: desconocido) | media | verificar_primero |
| Uthana (texto→movimiento) | Sin evaluar. | No leído (no_verificada; comercial: desconocido) | baja | verificar_primero |

**avatares_descartados**

| Nombre | Para qué sirve | Licencia y estado | Prioridad | Acción |
|---|---|---|---|---|
| Ready Player Me | Ninguno: DESCARTAR. | No aplica (servicio cerrado) (verificada; comercial: no) | evitar | evitar |

**modelos_texto_movimiento**

| Nombre | Para qué sirve | Licencia y estado | Prioridad | Acción |
|---|---|---|---|---|
| MoMask | Solo boceto interno. | Código MIT según mirrors del README (no confirmado en repo… (no_verificada; comercial: desconocido) | evitar | verificar_primero |
| T2M-GPT | Solo boceto interno. | Licencia de repo NO verificada; entrenado sobre HumanML3D (no_verificada; comercial: desconocido) | evitar | verificar_primero |
| MDM (Motion Diffusion Model) | Solo boceto interno. | Licencia NO verificada; entrenado sobre HumanML3D (no_verificada; comercial: desconocido) | evitar | verificar_primero |
| MotionGPT | Solo boceto interno. | Licencia NO verificada; entrenado sobre HumanML3D (no_verificada; comercial: desconocido) | evitar | verificar_primero |
| MLD (Motion Latent Diffusion) | Solo boceto interno. | Licencia NO verificada; entrenado sobre HumanML3D (no_verificada; comercial: desconocido) | evitar | verificar_primero |

### modelos_escenarios (21 items)

**hdri_texturas_modelos**

| Nombre | Para qué sirve | Licencia y estado | Prioridad | Acción |
|---|---|---|---|---|
| Poly Haven | HDRI de fondo (plaza, calle, playa, estudio) y texturas; modelos fotorrealistas de apoyo. | CC0; uso comercial permitido; atribución no requerida; redi… (en_conflicto; comercial: si) | alta | descargar_con_permiso |

**texturas**

| Nombre | Para qué sirve | Licencia y estado | Prioridad | Acción |
|---|---|---|---|---|
| ambientCG | Texturas (arena, tela roja de alfombra) y materiales para escenarios simples. | CC0 [I, muy conocida pero NO verificada]; la página de lice… (no_verificada; comercial: si) | alta | verificar_primero |

**packs_low_poly**

| Nombre | Para qué sirve | Licencia y estado | Prioridad | Acción |
|---|---|---|---|---|
| Kenney (packs 3D) | Escenarios 'juguete/arcilla': ciudad, autos, mobiliario; estilo coherente. | CC0; uso comercial permitido; atribución no requerida (se a… (verificada; comercial: si) | alta | descargar_con_permiso |
| Quaternius (packs de modelos y personajes modulares) | Figuras genéricas sin cara, mobiliario, naturaleza, vehículos, outfits para maniquíes. | CC0 o 'QAL License' según el kit (FAQ); uso comercial permi… (verificada; comercial: si) | alta | descargar_con_permiso |
| KayKit (Kay Lousberg) — packs de modelos y personajes | Furniture/Restaurant/City Builder Bits encajan con oficina/casa/hotel. | NO declarada en la página; CC0 para los gratuitos [I, no ve… (no_verificada; comercial: desconocido) | media | verificar_primero |

**buscadores_modelos**

| Nombre | Para qué sirve | Licencia y estado | Prioridad | Acción |
|---|---|---|---|---|
| Poly Pizza | Props sueltos: trofeo, micrófono, cámara, martillo, camilla, celulares genéricos. | Mezcla CC0 y CC-BY por modelo [I, consistente con la ficha]… (no_verificada; comercial: con_condiciones) | alta | descargar_con_permiso |
| Sketchfab | Cubrir huecos específicos (pasarela, estadio, tribunal, hospital, trofeos) con modelos CC0/CC-… | Por modelo: CC BY (por defecto), CC0 (minoría), CC BY-NC (N… (verificada; comercial: con_condiciones) | alta | descargar_con_permiso |
| Google Poly (archivo/espejos) | Respaldo; preferir Poly Pizza (curado). | CC-BY generalmente (no_verificada; comercial: con_condiciones) | baja | vigilar |
| OpenGameArt (OGA) | Complemento: packs CC0 filtrando por licencia. | Mezcla CC0, CC-BY, CC-BY-SA, GPL (no_verificada; comercial: con_condiciones) | media | verificar_primero |
| itch.io (packs gratuitos de terceros) | Fuente secundaria de packs. | Por página (p. ej. Creative Commons Zero) (no_verificada; comercial: desconocido) | media | verificar_primero |

**museos_agencias**

| Nombre | Para qué sirve | Licencia y estado | Prioridad | Acción |
|---|---|---|---|---|
| Smithsonian 3D (Open Access) | Poco para farándula (fósiles, objetos históricos). | CC0 (Open Access) (verificada; comercial: si) | baja | vigilar |
| NASA 3D Resources | Poco relevante. | Uso libre bajo las pautas de imagen/medios de NASA (verificada; comercial: con_condiciones) | baja | vigilar |
| glTF Sample Assets (Khronos) | Piezas de prueba, no escenarios. | Por modelo: README.md y metadata.json de cada carpeta; arch… (no_verificada; comercial: con_condiciones) | baja | vigilar |
| Modelos de ejemplo de three.js (Soldier, Xbot, Michelle, RobotExpressive) | Solo prueba técnica (pocos clips: idle/walk/run). | No indicada en el listado; licencias mezcladas por modelo (… (no_verificada; comercial: desconocido) | evitar | verificar_primero |

**marketplaces_blender**

| Nombre | Para qué sirve | Licencia y estado | Prioridad | Acción |
|---|---|---|---|---|
| BlenderKit | Assets renderizados dentro de Blender; no para reempaquetar. | Royalty-free o CC0; uso comercial permitido (en_conflicto; comercial: con_condiciones) | media | verificar_primero |
| Blender Studio / Blender demo files / Asset Browser | Human Base Meshes como base de maniquí; poses; personajes de producción. | Variable por asset: CC0 (Human Base Meshes, Cube Diorama),… (no_verificada; comercial: con_condiciones) | media | verificar_primero |

**marketplaces_pago**

| Nombre | Para qué sirve | Licencia y estado | Prioridad | Acción |
|---|---|---|---|---|
| TurboSquid | Baja: riesgo de marcas/IP y términos de IA. | Royalty-free salvo indicación; modelos 'Editorial' requiere… (verificada; comercial: con_condiciones) | baja | verificar_primero |
| Free3D | Baja. | Cada archivo con términos del autor (no_verificada; comercial: desconocido) | baja | verificar_primero |
| CGTrader | Baja. | Sin ficha oficial leída; términos por vendedor (no_verificada; comercial: desconocido) | baja | verificar_primero |
| Thingiverse | Ninguno: mala fidelidad visual y licencias a menudo NC/SA. | NC/SA a menudo [I] (no_verificada; comercial: no) | evitar | evitar |
| Synty (POLYGON, etc.) | Solo referencia de estilo; fuera de presupuesto cero. | Licencia propietaria que normalmente no permite redistribui… (no_verificada; comercial: desconocido) | evitar | evitar |

### personajes_ia3d (28 items)

**generadores_personajes**

| Nombre | Para qué sirve | Licencia y estado | Prioridad | Acción |
|---|---|---|---|---|
| MPFB / MakeHuman (MPFB2) | Base del maniquí F/M sin rostro: sliders de género/peso, cabeza lisa, material arcilla. | NO verificada: el repo tiene LICENSE.CODE.md, LICENSE.ASSET… (no_verificada; comercial: desconocido) | alta | verificar_primero |
| VRoid Studio (pixiv) | Solo como base de rig humanoide VRM; estilo anime con cara, quitarla es incómodo. | Meshes/texturas/presets pueden venderse o usarse comercialm… (no_verificada; comercial: con_condiciones) | baja | vigilar |
| MetaHuman (Epic) | No encaja: son rostros fotorrealistas. | UE 5.6+ aplica el EULA de Unreal; el EULA del MetaHuman Cre… (en_conflicto; comercial: desconocido) | evitar | verificar_primero |
| Daz 3D | Sin evaluar. | NO encontrado el EULA vigente; conocimiento previo NO verif… (no_verificada; comercial: desconocido) | evitar | verificar_primero |
| Blender Human Generator | Sin evaluar. | Sin datos (no_verificada; comercial: desconocido) | baja | verificar_primero |
| Character Creator (Reallusion) | Baja prioridad. | Sin datos (no_verificada; comercial: desconocido) | baja | verificar_primero |
| Avaturn | Sin evaluar. | Sin datos (la búsqueda no devolvió nada) (no_verificada; comercial: desconocido) | baja | verificar_primero |

**riggers**

| Nombre | Para qué sirve | Licencia y estado | Prioridad | Acción |
|---|---|---|---|---|
| UniRig (VAST-AI) | Experimento para riggear maniquíes; hoy MPFB/Mixamo/AccuRIG cubren. | Código MIT; licencia de los pesos NO indicada en el README… (no_verificada; comercial: desconocido) | media | verificar_primero |
| AccuRIG 2 (Reallusion) | Alternativa gratuita al auto-rigger de Mixamo para maniquíes propios. | Gratuito; personal de Reallusion indicó que con personaje e… (no_verificada; comercial: con_condiciones) | alta | verificar_primero |
| Auto-Rig Pro | Remap retargetea Mixamo/Quaternius a nuestro rig; robusto y probado. | Listada como 'Royalty Free' en Blender Market y 'GPL' en Su… (en_conflicto; comercial: desconocido) | media | verificar_primero |
| Rigify (Blender) | Armar el rig del maniquí y como estándar de retargeting. | GPL (la documentación lo lista GPL); el rig generado es del… (no_verificada; comercial: si) | alta | descargar_con_permiso |
| RigNet | Sin evaluar. | Licencia NO leída (no_verificada; comercial: desconocido) | evitar | verificar_primero |
| Blender rigid body | No aplica. | No aplica (no_verificada; comercial: desconocido) | evitar | evitar |

**ia_imagen_a_3d**

| Nombre | Para qué sirve | Licencia y estado | Prioridad | Acción |
|---|---|---|---|---|
| TripoSR | Solo para props/accesorios, no para maniquíes. | MIT (código, modelos pretrained y demo) (verificada; comercial: si) | media | probar |
| Stable Fast 3D | Props locales en 8 GB. | README enlaza LICENSE.md (Stability Community License según… (no_verificada; comercial: desconocido) | media | verificar_primero |
| Hunyuan3D 2.1 (Tencent) | Props de mayor calidad; solo forma cabe con trucos en 8 GB. | Tencent Hunyuan 3D 2.1 Community License (13-jun-2025): NO… (verificada; comercial: con_condiciones) | media | verificar_primero |
| TRELLIS (v1, Microsoft) | No cabe en 8 GB. | MIT (modelos y casi todo el código; submódulos con licencia… (verificada; comercial: si) | baja | evitar |
| TRELLIS.2 4B | No viable local. | Pesos MIT (verificada; comercial: si) | baja | evitar |
| InstantMesh | Baja. | Código Apache-2.0; licencia de los pesos NO leída (tarjeta… (no_verificada; comercial: desconocido) | baja | verificar_primero |
| Meshy | Props con prisa; un mes de plan Pro si hace falta. | Plan Free: CC BY 4.0 (comercial solo con atribución, la sal… (verificada; comercial: con_condiciones) | baja | vigilar |
| Tripo | Props; Free no recomendado. | Fuentes contradictorias sobre el plan Free (CC BY 4.0 vs no… (en_conflicto; comercial: desconocido) | baja | verificar_primero |
| Rodin (Hyper3D) | Props; sin evaluar más. | Licencia comercial explícita solo en Business (verificada; comercial: con_condiciones) | baja | vigilar |
| CSM | Sin evaluar. | No evaluada (no_verificada; comercial: desconocido) | baja | vigilar |

**retopologia**

| Nombre | Para qué sirve | Licencia y estado | Prioridad | Acción |
|---|---|---|---|---|
| Instant Meshes | Limpiar topología de mallas si se alteran. | Licencia no leída (LICENSE.txt); conocimiento previo sin co… (no_verificada; comercial: desconocido) | media | verificar_primero |
| QuadriFlow (Quadriflow Remesh en Blender) | Limpieza tras cambios de malla. | No investigado (no_verificada; comercial: desconocido) | media | verificar_primero |

**modelos_texto_movimiento**

| Nombre | Para qué sirve | Licencia y estado | Prioridad | Acción |
|---|---|---|---|---|
| HY-Motion 1.0 (Tencent) | Boceto; no producto. | Misma restricción territorial UE/UK/KR; depende de SMPL-X (… (no_verificada; comercial: desconocido) | evitar | verificar_primero |
| SMPL-X (Max Planck) | Ninguno. | Licencia original no permite uso comercial ni redistribució… (no_verificada; comercial: no) | evitar | verificar_primero |
| MotionCLR | Ninguno. | Licencia IDEA: uso comercial requiere pedir licencia (verificada; comercial: no) | evitar | evitar |

### blender_pipeline (22 items)

**base_automatizacion**

| Nombre | Para qué sirve | Licencia y estado | Prioridad | Acción |
|---|---|---|---|---|
| Blender 4.5 LTS + automatización headless (bpy) | Núcleo scripteable del pipeline: importar FBX/BVH, retarget, bake, exportar GLB. | Blender GPL; exportador glTF Apache-2.0; la salida no queda… (no_verificada; comercial: si) | alta | usar_ya |

**importadores_exportadores**

| Nombre | Para qué sirve | Licencia y estado | Prioridad | Acción |
|---|---|---|---|---|
| glTF-Blender-IO (exportador glTF de Khronos) | Camino principal Blender → three.js (operador export_scene.gltf; modo ACTIONS/NLA para clips). | Apache-2.0 (verificada; comercial: si) | alta | usar_ya |
| glTF-Validator (Khronos) | Control de calidad automático de cada GLB. | Apache-2.0 (verificada; comercial: si) | alta | descargar_con_permiso |
| Importadores nativos FBX y BVH de Blender | Importar clips de Mixamo (FBX) y CMU/100STYLE (BVH). | GPL (incluidos en Blender) (no_verificada; comercial: si) | alta | usar_ya |

**retargeting**

| Nombre | Para qué sirve | Licencia y estado | Prioridad | Acción |
|---|---|---|---|---|
| Rokoko Studio Live para Blender (retargeter) | Retargetear Mixamo/otros a nuestro maniquí gratis en Blender 4.5. | Ambigua: LGPL-3.0 en recursos vs badge MIT en README (en_conflicto; comercial: desconocido) | alta | verificar_primero |
| Fork Atlas-3D-Artist/rokoko-studio-live-blender | Ninguno: riesgo de seguridad. | No evaluada (no_verificada; comercial: desconocido) | evitar | evitar |
| Retarget (KBS-DEV) | Retarget Mixamo/Quaternius → Rigify si migramos a Blender 5.x. | GPL-3.0+ (verificada; comercial: si) | media | vigilar |
| Mixaify (Mixamo→Rigify) | Retarget Mixamo en Rigify con Blender 5. | Open source (licencia exacta no leída) (no_verificada; comercial: desconocido) | media | vigilar |
| QuickMO (Mixamo→Rigify) | Alternativa de pago. | GPL según la ficha (citada en PI) (no_verificada; comercial: desconocido) | baja | vigilar |
| Bone animation copy tool | Posible apoyo al retarget manual. | No leída (no_verificada; comercial: desconocido) | baja | verificar_primero |
| Retarget nativo: constraints Copy Rotation + bake NLA | Respaldo 100% scriptable para retargetear sin add-ons ni pagos. | Nativo de Blender (GPL) (no_verificada; comercial: si) | alta | probar |

**animacion_asistida**

| Nombre | Para qué sirve | Licencia y estado | Prioridad | Acción |
|---|---|---|---|---|
| Cascadeur | Poco: exportar glTF/FBX exige plan de pago. | Free no comercial (solo .casc); Indie (<$100k/año) añade FB… (en_conflicto; comercial: con_condiciones) | baja | vigilar |
| Houdini Apprentice | Incompatible con producción comercial. | Gratis solo personal NO comercial; marca de agua; render ≤1… (verificada; comercial: no) | evitar | evitar |

**librerias_poses**

| Nombre | Para qué sirve | Licencia y estado | Prioridad | Acción |
|---|---|---|---|---|
| Pose Library / Asset Browser (nativo de Blender) | Guardar y reutilizar poses clave (posar, estilo recorte). | GPL (nativo) (no_verificada; comercial: desconocido) | media | probar |

**otros**

| Nombre | Para qué sirve | Licencia y estado | Prioridad | Acción |
|---|---|---|---|---|
| Godot headless / Wings3D | No relevantes. | No investigadas (no_verificada; comercial: desconocido) | evitar | evitar |

**procedural_npr**

| Nombre | Para qué sirve | Licencia y estado | Prioridad | Acción |
|---|---|---|---|---|
| Geometry Nodes (nativo de Blender) | Multitudes/edificios procedurales y escenarios. | GPL (nativo) (no_verificada; comercial: si) | media | probar |
| Sverchok | Sin evaluar. | GPL (conocimiento previo, SIN verificar) (no_verificada; comercial: desconocido) | baja | verificar_primero |
| Building Tools (ranjian0) | Sin evaluar. | GPL (conocimiento previo, SIN verificar) (no_verificada; comercial: desconocido) | baja | verificar_primero |
| City Builder (add-on) | Sin evaluar. | SIN verificar (no_verificada; comercial: desconocido) | baja | verificar_primero |
| Freestyle / Grease Pencil / NPR (nativos) | Look arcilla/toon: Freestyle NO se exporta a glTF; reproducir con MeshToonMaterial y outlines… | Nativo (GPL) (no_verificada; comercial: desconocido) | media | probar |

**automatizacion_mcp**

| Nombre | Para qué sirve | Licencia y estado | Prioridad | Acción |
|---|---|---|---|---|
| Conector oficial de Blender para Claude (BlenderMCP) | Prototipar/explorar escenas; no para el pipeline reproducible. | Licencia no indicada (no_verificada; comercial: desconocido) | media | probar |
| blender-mcp comunitario (ahujasid, 'MCP for Blender') | Ninguno: riesgo de seguridad. | No evaluada (no_verificada; comercial: desconocido) | evitar | evitar |

## Matriz acción → fuentes

| Acción | Mejores fuentes (en orden) |
|---|---|
| caminar | Quaternius — Universal Animation Library 1 [quaternius-ual1] > Quaternius — Universal Animation Library 2 [quaternius-ual2] > Mixamo [mixamo] > KayKit — Character Animations [kaykit-animations] > 100STYLE [100style] > CMU Motion Capture Database [cmu-mocap] |
| correr | Quaternius — Universal Animation Library 1 [quaternius-ual1] > Quaternius — Universal Animation Library 2 [quaternius-ual2] > Mixamo [mixamo] > KayKit — Character Animations [kaykit-animations] |
| desfilar en pasarela | Mixamo [mixamo] > 100STYLE [100style] > CMU Motion Capture Database [cmu-mocap] |
| posar | Mixamo [mixamo] |
| aplaudir | Mixamo [mixamo] > KayKit — Character Animations [kaykit-animations] > Quaternius — Universal Animation Library 1 [quaternius-ual1] |
| señalar | Mixamo [mixamo] > CMU Motion Capture Database [cmu-mocap] |
| caer/tropezar | Mixamo [mixamo] > CMU Motion Capture Database [cmu-mocap] > Quaternius — Universal Animation Library 1 [quaternius-ual1] |
| discutir | Mixamo [mixamo] > CMU Motion Capture Database [cmu-mocap] |
| abrazar | CMU Motion Capture Database [cmu-mocap] > Mixamo [mixamo] |
| entregar premio / objeto | KayKit — Character Animations [kaykit-animations] > Quaternius — Universal Animation Library 1 [quaternius-ual1] > Mixamo [mixamo] |
| llorar | Mixamo [mixamo] |
| celebrar | KayKit — Character Animations [kaykit-animations] > Mixamo [mixamo] > Quaternius — Universal Animation Library 1 [quaternius-ual1] > Rokoko — free mocap assets / Motion Library [rokoko-free-assets] |
| hablar con gestos | Mixamo [mixamo] > CMU Motion Capture Database [cmu-mocap] |
| sentarse | Quaternius — Universal Animation Library 1 [quaternius-ual1] > Mixamo [mixamo] > CMU Motion Capture Database [cmu-mocap] |
| saludar | KayKit — Character Animations [kaykit-animations] > Mixamo [mixamo] > Quaternius — Universal Animation Library 1 [quaternius-ual1] |
| tomar foto | Mixamo [mixamo] |
| flash de fotógrafos (cámaras) | **sin cobertura libre** (ver 'Sin cobertura') |
| brindar | Quaternius — Universal Animation Library 2 [quaternius-ual2] > Mixamo [mixamo] |
| bailar | KayKit — Character Animations [kaykit-animations] > Mixamo [mixamo] > CMU Motion Capture Database [cmu-mocap] > Quaternius — Universal Animation Library 1 [quaternius-ual1] |
| desmayarse | Mixamo [mixamo] > Quaternius — Universal Animation Library 1 [quaternius-ual1] |
| mirar el celular / chismear al oído | Mixamo [mixamo] |
| lanzar / arrojar | KayKit — Character Animations [kaykit-animations] |
| empujar | Quaternius — Universal Animation Library 1 [quaternius-ual1] |
| esposado / arresto | **sin cobertura libre** (ver 'Sin cobertura') |
| dar entrevista a micrófono | **sin cobertura libre** (ver 'Sin cobertura') |
| firmar autógrafo | **sin cobertura libre** (ver 'Sin cobertura') |
| selfie | **sin cobertura libre** (ver 'Sin cobertura') |
| cuchichear / chismear | **sin cobertura libre** (ver 'Sin cobertura') |

Los nombres de clip citados en el JSON como 'probables' son memoria de las notas, no verificados: buscar dentro de Mixamo/CMU antes de depender.

## Matriz escena/prop → fuentes

| Escena / prop | Mejores fuentes (en orden) |
|---|---|
| pasarela / desfile | Sketchfab [sketchfab] > Poly Pizza [poly-pizza] |
| escenario de concurso de belleza | Sketchfab [sketchfab] > Kenney [kenney-modelos] > Quaternius [quaternius-modelos] |
| estadio | Poly Pizza [poly-pizza] > Quaternius [quaternius-modelos] > Sketchfab [sketchfab] |
| plaza / calle / ciudad | Kenney [kenney-modelos] > KayKit [kaykit-modelos] > Quaternius [quaternius-modelos] > Poly Haven [poly-haven] |
| oficina | KayKit [kaykit-modelos] > Kenney [kenney-modelos] > Quaternius [quaternius-modelos] > Poly Haven [poly-haven] |
| estudio de TV | Kenney [kenney-modelos] > Poly Pizza [poly-pizza] |
| tribunal | Sketchfab [sketchfab] > Kenney [kenney-modelos] > Quaternius [quaternius-modelos] > Poly Pizza [poly-pizza] |
| hospital | Sketchfab [sketchfab] > Quaternius [quaternius-modelos] > KayKit [kaykit-modelos] > Poly Pizza [poly-pizza] |
| aeropuerto | Kenney [kenney-modelos] > Sketchfab [sketchfab] |
| hotel / casa | KayKit [kaykit-modelos] > Kenney [kenney-modelos] > Quaternius [quaternius-modelos] |
| playa | Quaternius [quaternius-modelos] > Kenney [kenney-modelos] > Poly Haven [poly-haven] > ambientCG [ambientcg] |
| discoteca | Poly Haven [poly-haven] > Poly Pizza [poly-pizza] |
| alfombra roja | ambientCG [ambientcg] |
| rueda de prensa | Poly Pizza [poly-pizza] > Sketchfab [sketchfab] |
| corona / banda / trofeo | Poly Pizza [poly-pizza] > Sketchfab [sketchfab] > Quaternius [quaternius-modelos] |
| micrófono / cámara de fotos / flashes | Poly Pizza [poly-pizza] > Sketchfab [sketchfab] |
| sillas / mesas | KayKit [kaykit-modelos] > Kenney [kenney-modelos] > Quaternius [quaternius-modelos] |
| autos | Kenney [kenney-modelos] > Quaternius [quaternius-modelos] > Poly Pizza [poly-pizza] |
| celulares | Poly Pizza [poly-pizza] > Sketchfab [sketchfab] |
| ropa / vestidos | Quaternius [quaternius-modelos] > Mixamo [mixamo] > Blender Studio / Blender demo files / Asset Browser [blender-studio-assets] |
| bandera | **sin cobertura libre** (ver 'Sin cobertura') |
| cartelera / letrero | troika-three-text [troika-three-text] |
| texturas | ambientCG [ambientcg] > Poly Haven [poly-haven] |
| HDRI | Poly Haven [poly-haven] |

## Sin cobertura (hay que modelar o animar nosotros)

| Qué | Sugerencia |
|---|---|
| Desfile de pasarela con giro y pose ante fotógrafos | Kitbash con ramas del mismo rig en Blender (caminar + giro + pose); poses clave a mano (el estilo recorte/stop-motion encaja con maniquíes). |
| Flash/cámara de fotógrafos (rodilla/disparo) | Animar a mano o texto→movimiento comercial (licencia verificada); flashes como luces/partículas en código. |
| Interacción de dos personajes (abrazo, discusión con contacto, entrega de premio con apretón de manos) | Kitbash en Blender; texto→movimiento comercial; grabarse en video con DeepMotion/Move.ai plan comercial; poses clave a mano. |
| Tomar selfie | Poses a mano / kitbash. |
| Esposar / arrestar | Poses a mano / kitbash / servicio texto→movimiento comercial. |
| Dar entrevista a micrófono | Poses a mano / kitbash. |
| Firmar autógrafo | Poses a mano / kitbash. |
| Cuchichear / chismear | Poses a mano / kitbash. |
| Pasarela con luces y escenario de concurso (truss, cortinas, pantalla LED) | Modelar en código (plataforma + luces). |
| Estudio de TV, sala de prensa, tribunal con identidad propia | Modelar en código (set, mesa, pantallas, atril, backdrop) + props de Kenney/Poly Pizza. |
| Discoteca (luces dinámicas, bola de espejos, piso LED) | Código (luces, bola, piso) + HDRI/emisivos. |
| Alfombra roja con postes y cuerdas; banda de reina; corona con look uniforme | Plano + postes/cuerdas en código + textura de tela roja (ambientCG, verificar licencia). |
| Banderas, carteleras, flashes de cámara (efectos de luz) | Código: plano con ondulación + textura; texto 3D/planos; luces. |
| Vestidos de gala genéricos, cabello y maquillaje | Modelar o texturizar (Quaternius Modular Character Outfits como base). |
| Props de marcas reales (celulares, autos, logos) | Usar genéricos. |
| Maniquí F/M sin rostro, rigged, 10+ animaciones | MPFB + Rigify/Mixamo/AccuRIG + clips Mixamo/KayKit/UAL (ver flujo maniqui_sin_rostro). |
| Generadores procedurales de ciudades/edificios, ruido, KTX2, CSS3DRenderer, Filament, ammo.js, fullik | Investigar en una segunda pasada antes de decidir. |

## Pendientes de verificar

Orden = importancia. Comprobar antes de depender de ellos.

| # | Item | Qué comprobar |
|---|---|---|
| 1 | Mixamo (Adobe) (critica) | Leer hoy la FAQ/EULA/ToS vigentes de Mixamo y de Adobe (con navegador); confirmar que renderizar a video está cubierto y qué pasa si se entregan GLB con animaciones a te… |
| 2 | MPFB / MakeHuman (MPFB2) (critica) | Leer LICENSE.ASSETS.md y LICENSE.md del repo antes de comercializar los maniquíes. |
| 3 | CMU Motion Capture Database (alta) | Leer mocap.cs.cmu.edu términos y citar como pide; decidir qué copia usar (cgspeed/Unity/4TU/HF) — la copia 4TU es CC BY-NC y NO se usa. |
| 4 | GSAP (alta) | Leer https://gsap.com/standard-license completa y decidir si aplica a un motor que genera video; considerar tween.js como alternativa sin reserva. |
| 5 | ambientCG (alta) | Leer https://docs.ambientcg.com/license/ y probar un asset. |
| 6 | Poly Haven (alta) | Leer API Terms o pedir permiso antes de automatizar masivamente; descarga manual es segura. |
| 7 | KayKit (Kay Lousberg) — packs de modelos y personajes (alta) | Abrir la página de cada pack (Furniture/Restaurant/City Builder Bits) y confirmar licencia antes de usar. |
| 8 | AccuRIG 2 (Reallusion) (alta) | Leer el EULA incluido en la descarga. |
| 9 | Blender 4.5 LTS + automatización headless (bpy) (alta) | Contrastar con https://docs.blender.org/api/4.5/bpy.ops.export_scene.html y el manual CLI; probar con UNA pieza antes de procesar por lotes. |
| 10 | Rokoko Studio Live para Blender (retargeter) (alta) | Leer LICENSE del repo oficial, probar en Blender 4.5 con una animación, y comprobar si pide cuenta. |
| 11 | Retarget (KBS-DEV) (media) | Decidir si migramos a Blender 5.x antes de depender de este add-on. |
| 12 | Remotion (media) | Confirmar nuestro tamaño de equipo/categoría y el precio si se adopta. |
| 13 | glTF-Transform (media) | Leer LICENSE del repo y `gltf-transform help` (npm view para versiones). |
| 14 | Rapier (@dimforge/rapier3d-compat) (media) | Comprobar en la documentación oficial y probar render repetido con paso fijo. |
| 15 | three.js (media) | Prueba mínima de render headless con Puppeteer en esta máquina. |
| 16 | tween.js (@tweenjs/tween.js) (media) | Probar render dos veces y comparar frames. |
| 17 | HyperFrames (HeyGen) (media) | Revisar madurez, issues y licencia en el repo antes de evaluarlo. |
| 18 | Rokoko — free mocap assets / Motion Library (media) | Leer el texto de licencia en cada descarga; confirmar si exportar FBX/BVH exige plan Basic. |
| 19 | DeepMotion Animate 3D / SayMotion (media) | Leer https://www.deepmotion.com/pricing y /faq. |
| 20 | Meshcapade (MoCapade, texto-a-movimiento) (media) | Leer https://meshcapade.com/animation y términos. |
| 21 | Stable Fast 3D (media) | Leer LICENSE.md del repo. |
| 22 | Auto-Rig Pro (media) | Leer EULA antes de comprar. |
| 23 | Hunyuan3D 2.1 (Tencent) (media) | Confirmar territorio de la entrega y probar VRAM. |
| 24 | UniRig (VAST-AI) (media) | Revisar tarjeta HF de pesos y probar instalación. |
| 25 | BlenderKit (media) | Confirmar dominio oficial antes de crear cuenta o pagar. |
| 26 | Modelos de ejemplo de three.js (Soldier, Xbot, Michelle, RobotExpressive) (media) | No usar como assets redistribuibles; comprobar origen de cada modelo. |
| 27 | Quaternius (packs de modelos y personajes modulares) (media) | Leer el .txt de licencia dentro de cada descarga y guardar copia. |
| 28 | Quaternius — Universal Animation Library 2 (UAL2) (baja) | Verificar en quaternius.com. |
| 29 | Kenney (packs 3D) (baja) | Leer el archivo de licencia de cada pack. |
| 30 | Sketchfab (baja) | Leer la documentación de la API y probar con token del usuario. |
| 31 | @react-three/rapier (media) | Leer el texto de licencia/EULA/pesos vigente antes de usar; la nota no detalla condiciones. |
| 32 | fullik (media) | Leer el texto de licencia/EULA/pesos vigente antes de usar; la nota no detalla condiciones. |
| 33 | simplex-noise / generadores de ciudades y edificios / subdivisión (media) | Leer el texto de licencia/EULA/pesos vigente antes de usar; la nota no detalla condiciones. |
| 34 | KTX2 / Basis (media) | Leer el texto de licencia/EULA/pesos vigente antes de usar; la nota no detalla condiciones. |
| 35 | @remotion/three (media) | Leer el texto de licencia/EULA/pesos vigente antes de usar; condiciones citadas: Hereda condiciones de Remotion |
| 36 | Unity Asset Store — Huge FBX Mocap Library (partes 1-3) (media) | Leer el texto de licencia/EULA/pesos vigente antes de usar; condiciones citadas: INFERENCIA: la EULA de Unity limita redistribuir como assets sueltos; sirve para renderi… |
| 37 | 4TU.ResearchData — conversión FBX de CMU (baja) | Leer el texto de licencia/EULA/pesos vigente antes de usar; condiciones citadas: No comercial |
| 38 | RancidMilk — Free Character Animations (itch.io) (media) | Leer el texto de licencia/EULA/pesos vigente antes de usar; condiciones citadas: Hereda los riesgos de CMU |
| 39 | AMASS (baja) | Leer el texto de licencia/EULA/pesos vigente antes de usar; condiciones citadas: Licencia comercial: ps-license@tue.mpg.de |
| 40 | LAFAN1 (Ubisoft) (baja) | Leer el texto de licencia/EULA/pesos vigente antes de usar; condiciones citadas: No comercial, sin derivadas |
| 41 | Motion-X (baja) | Leer el texto de licencia/EULA/pesos vigente antes de usar; condiciones citadas: No comercial |
| 42 | HumanML3D (baja) | Leer el texto de licencia/EULA/pesos vigente antes de usar; condiciones citadas: No comercial (según segunda fuente) |
| 43 | BABEL (baja) | Leer el texto de licencia/EULA/pesos vigente antes de usar; la nota no detalla condiciones. |
| 44 | Bandai Namco motion dataset (3.000 moves) (baja) | Leer el texto de licencia/EULA/pesos vigente antes de usar; la nota no detalla condiciones. |
| 45 | Rokoko Create / Text-to-Motion (Rokoko Studio) (media) | Leer el texto de licencia/EULA/pesos vigente antes de usar; la nota no detalla condiciones. |
| 46 | Uthana (texto→movimiento) (media) | Leer el texto de licencia/EULA/pesos vigente antes de usar; la nota no detalla condiciones. |
| 47 | MoMask (baja) | Leer el texto de licencia/EULA/pesos vigente antes de usar; la nota no detalla condiciones. |
| 48 | T2M-GPT (baja) | Leer el texto de licencia/EULA/pesos vigente antes de usar; la nota no detalla condiciones. |
| 49 | MDM (Motion Diffusion Model) (baja) | Leer el texto de licencia/EULA/pesos vigente antes de usar; la nota no detalla condiciones. |
| 50 | MotionGPT (baja) | Leer el texto de licencia/EULA/pesos vigente antes de usar; la nota no detalla condiciones. |
| 51 | MLD (Motion Latent Diffusion) (baja) | Leer el texto de licencia/EULA/pesos vigente antes de usar; la nota no detalla condiciones. |
| 52 | OpenGameArt (OGA) (media) | Leer el texto de licencia/EULA/pesos vigente antes de usar; condiciones citadas: CC-BY-SA y GPL (copyleft): NO USAR sin verificar |
| 53 | itch.io (packs gratuitos de terceros) (media) | Leer el texto de licencia/EULA/pesos vigente antes de usar; condiciones citadas: Verificar autor por autor |
| 54 | Blender Studio / Blender demo files / Asset Browser (media) | Leer el texto de licencia/EULA/pesos vigente antes de usar; condiciones citadas: CC-BY exige atribución; ver /licensing de cada película |
| 55 | TurboSquid (media) | Leer el texto de licencia/EULA/pesos vigente antes de usar; condiciones citadas: No se pueden entregar archivos a un cliente sin licencia por cliente |
| 56 | Free3D (media) | Leer el texto de licencia/EULA/pesos vigente antes de usar; condiciones citadas: Verificar uno por uno |
| 57 | CGTrader (media) | Leer el texto de licencia/EULA/pesos vigente antes de usar; la nota no detalla condiciones. |
| 58 | Thingiverse (baja) | Leer el texto de licencia/EULA/pesos vigente antes de usar; la nota no detalla condiciones. |
| 59 | Synty (POLYGON, etc.) (baja) | Leer el texto de licencia/EULA/pesos vigente antes de usar; la nota no detalla condiciones. |
| 60 | MetaHuman (Epic) (baja) | Leer el texto de licencia/EULA/pesos vigente antes de usar; la nota no detalla condiciones. |
| 61 | Daz 3D (baja) | Leer el texto de licencia/EULA/pesos vigente antes de usar; la nota no detalla condiciones. |
| 62 | Blender Human Generator (media) | Leer el texto de licencia/EULA/pesos vigente antes de usar; la nota no detalla condiciones. |
| 63 | Character Creator (Reallusion) (media) | Leer el texto de licencia/EULA/pesos vigente antes de usar; la nota no detalla condiciones. |
| 64 | Avaturn (media) | Leer el texto de licencia/EULA/pesos vigente antes de usar; la nota no detalla condiciones. |
| 65 | RigNet (baja) | Leer el texto de licencia/EULA/pesos vigente antes de usar; la nota no detalla condiciones. |
| 66 | InstantMesh (media) | Leer el texto de licencia/EULA/pesos vigente antes de usar; la nota no detalla condiciones. |
| 67 | Tripo (media) | Leer el texto de licencia/EULA/pesos vigente antes de usar; la nota no detalla condiciones. |
| 68 | Instant Meshes (media) | Leer el texto de licencia/EULA/pesos vigente antes de usar; la nota no detalla condiciones. |
| 69 | QuadriFlow (Quadriflow Remesh en Blender) (media) | Leer el texto de licencia/EULA/pesos vigente antes de usar; la nota no detalla condiciones. |
| 70 | HY-Motion 1.0 (Tencent) (baja) | Leer el texto de licencia/EULA/pesos vigente antes de usar; la nota no detalla condiciones. |
| 71 | SMPL-X (Max Planck) (baja) | Leer el texto de licencia/EULA/pesos vigente antes de usar; la nota no detalla condiciones. |
| 72 | MotionCLR (baja) | Leer el texto de licencia/EULA/pesos vigente antes de usar; condiciones citadas: Solicitar licencia |
| 73 | Bone animation copy tool (media) | Leer el texto de licencia/EULA/pesos vigente antes de usar; la nota no detalla condiciones. |
| 74 | Sverchok (media) | Leer el texto de licencia/EULA/pesos vigente antes de usar; la nota no detalla condiciones. |
| 75 | Building Tools (ranjian0) (media) | Leer el texto de licencia/EULA/pesos vigente antes de usar; la nota no detalla condiciones. |
| 76 | City Builder (add-on) (media) | Leer el texto de licencia/EULA/pesos vigente antes de usar; la nota no detalla condiciones. |

## Flujos recomendados

Los comandos marcados INFERENCIA son memoria de las notas y no se han ejecutado.

### Animación de biblioteca → retarget → bake → GLB comprimido → three.js

Flujo scriptable en cuatro etapas: importar FBX/BVH, retarget (Rokoko/Remap/constraints), bake a acciones, exportar glTF + meshopt/KTX2 y validar. Nada fue ejecutado por las notas.

1. Fuente: Mixamo FBX (sin skin, 30 fps) u otro clip permisivo.
2. Blender -b con script: importar FBX; mapear huesos (Rokoko 'Build Bone List'/Remap o constraints Copy Rotation + Copy Location solo en hips).
3. bake NLA (visual_keying, clear_constraints, bake_types POSE); renombrar la acción; borrar el armature fuente.
4. Exportar GLB (modo ACTIONS) sin Draco en Blender; comprimir después con gltfpack o gltf-transform (un solo paso controlable).
5. Varias animaciones en un GLB: exportar cada acción como clip o fusionar GLBs con gltf-transform merge (no verificado).
6. Validar con gltf_validator y gltf-transform inspect.
7. three.js: GLTFLoader + MeshoptDecoder (+ KTX2Loader si hay texturas Basis) y AnimationMixer.clipAction(gltf.animations[i]). Verificar visualmente antes de procesar por lotes.

Comandos:
- `blender -b maniqui.blend --python-exit-code 1 -P retarget.py -- --src walk.fbx --out walk.glb` — INFERENCIA
- `bpy.ops.import_scene.fbx(filepath=src)` — INFERENCIA
- `bpy.ops.nla.bake(frame_start, frame_end, only_selected=False, visual_keying=True, clear_constraints=True, bake_types={'POSE'})` — INFERENCIA
- `bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animations=True, export_animation_mode='ACTIONS')` — INFERENCIA
- `gltfpack -i walk.glb -o walk.min.glb -cc -tc` — documentado_en_fuente
- `gltf-transform optimize walk.glb walk.min.glb --compress meshopt --texture-compress ktx2` — INFERENCIA
- `gltf_validator -o -m walk.min.glb` — documentado_en_fuente
- `loader.setMeshoptDecoder(MeshoptDecoder)` — documentado_en_fuente

Riesgos: Escalas FBX (cm vs m). Orientación de huesos (Mixamo A-pose vs maniquí), root motion, prefijo mixamorig:. La cuantización de meshopt con keyframes puede afectar la precisión (probar con una pieza). Retarget KBS-DEV exige Blender 5.0+ (no 4.5).

Estado: Mezcla: comandos de compresión/validación documentados; partes bpy y flags de Blender son INFERENCIA/conocimiento previo.

### Compresión y validación de GLB por CLI

Meshopt comprime geometría y keyframes (mejor que Draco para skinning). glTF-Transform y gltfpack cubren la compresión por CLI.

1. Instalar CLI (con permiso del usuario).
2. Optimizar/comprimir.
3. Validar.
4. Cargar en three con el decoder correspondiente.

Comandos:
- `npm install --global @gltf-transform/cli` — documentado_en_fuente
- `gltf-transform optimize input.glb output.glb --compress draco --texture-compress webp` — documentado_en_fuente
- `gltf-transform meshopt in.glb out.glb` — documentado_en_fuente
- `gltf-transform validate in.glb` — documentado_en_fuente
- `gltf-transform inspect in.glb` — documentado_en_fuente
- `gltfpack -i scene.gltf -o scene.glb -cc -tc` — documentado_en_fuente

Riesgos: Versiones npm marcadas '?' en las notas: reverificar con npm view antes de fijar. La licencia de glTF-Transform no está declarada en la página CLI.

Estado: Comandos documentados en fuentes oficiales; la conclusión 'meshopt mejor que Draco para skinning' es INFERENCIA de BP basada en la descripción de gltf-transform.

### Maniquí F/M sin rostro, paramétrico, rigged, 10+ animaciones

No hace falta IA 3D: un cuerpo paramétrico (MPFB) es mejor (topología limpia, simétrico, riggeable). Total estimado 1–2 días la primera vez (no medido).

1. Base (~2–3 h): Blender ≥4.2 + MPFB; un cuerpo F y uno M con sliders; cabeza lisa/ovoide; material arcilla único; género por silueta. Verificar LICENSE.ASSETS.md.
2. Rig (~1 h por personaje): rig Rigify/game-engine de MPFB; alternativa: exportar FBX y subir a Mixamo o AccuRIG 2.
3. Animaciones (~2–4 h): Mixamo (Idle, Walk, Run, Jump, Wave, Talk, Sit, Dance, Cheer, Defeat, Pick up) o KayKit (29 clips CC0); retarget con Rokoko/Auto-Rig Pro Remap/Mixaify/Retarget (según versión de Blender).
4. Limpieza (~1 h): Blender/QuadriFlow solo si hubo cambios de malla.
5. IA 3D opcional solo para props: TripoSR / SF3D locales (~6 GB) o Meshy Pro $20/mes un mes.

Riesgos: Si los maniquíes con animaciones Mixamo se redistribuyen a terceros aplica la cláusula 'no distribuir archivos a no-miembros del equipo' (post Adobe 2022): usarlos solo en video renderizado o preferir clips CC0. Eliminar el rostro modificando la malla es INFERENCIA no probada.

Estado: INFERENCIA salvo donde las fichas indican HECHO; tiempos no medidos.

### Render determinista en three.js (Puppeteer + ffmpeg)

Ninguna animación depende de requestAnimationFrame/reloj real: el tiempo se inyecta por frame (t = frame/fps). Para un sistema ya basado en Puppeteer+ffmpeg no hace falta Remotion.

1. Lanzar Chrome headless con flags de WebGL (SwiftShader/ANGLE o GPU real).
2. Inyectar el tiempo por frame: tween.js update(time) o GSAP timeline.time(t)/seek (si se aprueba la licencia).
3. Física con paso fijo (1/30 s) con Rapier/Jolt, o pre-simular y hornear en keyframes.
4. Partículas con RNG propio y paso fijo (no verificado en three.quarks/nebula).
5. Capturar cada frame (puppeteer-capture u otro) y componer con ffmpeg.
6. Preferir texturas de canvas/troika para tarjetas en lugar de DOM mezclado con WebGL.

Riesgos: Headless WebGL por software (SwiftShader) es más lento; no probado. three-gpu-pathtracer exige GPU real y es ruidoso (INFERENCIA).

Estado: Casi todo INFERENCIA (las notas dicen no haber probado nada).

### Manifiesto de licencias por asset

Llevar un CSV por asset con fuente, URL, licencia, autor, fecha de captura; obligatorio para CC-BY. Guardar captura/archivo LICENSE junto al asset y reconfirmar la licencia el día de uso.

1. Registrar fuente+URL+licencia+autor+fecha por asset.
2. Guardar LICENSE/captura junto al asset.
3. Para Sketchfab, conservar la licencia vigente al descargar.

Riesgos: Licencias y términos cambian (Mixamo, planes de Meshy/Tripo, Gumroad).

Estado: INFERENCIA de la nota modelos_escenarios.md.

### Acciones sin cobertura libre: kitbash, texto→movimiento comercial o poses a mano

Cuando no existe el clip: (a) kitbash con ramas del mismo rig en Blender, (b) texto→movimiento comercial con licencia verificada, (c) grabarse en video con DeepMotion/Move.ai plan comercial, (d) poses clave a mano (estilo recorte/stop-motion).

1. Intentar kitbash.
2. Si no, servicio comercial con licencia verificada.
3. Si no, poses clave a mano.

Riesgos: Los modelos open-source texto→movimiento heredan datos no comerciales (AMASS): solo boceto interno.

Estado: INFERENCIA de animaciones.md §6.

### Automatización de Blender: scripts versionados, MCP solo para explorar

Para producción usar scripts bpy versionados y ejecutados en -b; el conector oficial de Blender para Claude solo para prototipar; evitar blender-mcp comunitario y forks de repos con estrellas sospechosas (fijar commit y leer código).

1. Scripts bpy en el repo.
2. Auto Run Python apagado al abrir .blend ajenos.
3. Render por lotes si hiciera falta.

Comandos:
- `blender -b archivo.blend -o //out_#### -a` — INFERENCIA

Riesgos: blender-mcp comunitario: 4 CVE en 2026 (blog de terceros).

Estado: Recomendación de la nota; comando INFERENCIA.

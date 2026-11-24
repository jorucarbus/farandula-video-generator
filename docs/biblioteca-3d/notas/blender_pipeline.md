# Blender 4.5 LTS: ecosistema de pipeline (retarget, bake, glTF, three.js) — estado nov 2026

Metodología: solo lectura de páginas (WebFetch/WebSearch), nada descargado. "HECHO" = visto en página citada. "INFERENCIA" = deducción mía o conocimiento previo sin verificar en esta sesión. Varias páginas del manual de Blender (glTF, CLI) son enormes y la herramienta solo leyó el menú; esos puntos van en Gaps. Fichas con campos: qué hace / para qué / licencia / compat 4.5 / CLI / seguridad / prioridad.

## 1. Base: Blender 4.5 LTS y automatización headless (bpy)

### Takeaway
Blender 4.5 LTS (lanzado 15-jul-2025) tiene soporte hasta julio 2027, así que es una base estable para el pipeline; pero muchos add-ons nuevos ya exigen Blender 5.0+, lo que condiciona la elección. Blender y su exportador glTF son libres (GPL/Apache) y la salida no queda sujeta a GPL por ser datos (INFERENCIA estándar, no verificada en página).

### Cited Findings
- Blender 4.5 LTS: soporte hasta julio 2027; último parche citado 4.5.6; 4.5 es la última versión con soporte oficial de Mac Intel — [80.lv](https://80.lv/articles/blender-4-5-6-lts-blender-4-2-17-lts-released), [Neowin](https://www.neowin.net/news/blender-45-lts-brings-bad-news-for-intel-mac-users-improves-vulkan-support/), [DigitalProduction](https://digitalproduction.com/2025/11/03/blender-4-5-lts-lands/)
- Blender 5.0 es la estable actual según el repo del exportador; 4.5 figura como LTS vigente — [glTF-Blender-IO](https://github.com/KhronosGroup/glTF-Blender-IO)
- La referencia de API existe para 4.5 en `bpy.ops.export_scene` (operador `export_scene.gltf`; en 4.0 el default es `export_format='GLB'`; ejemplo comunitario usa `export_animation_mode="ACTIVE_ACTIONS"`; el modo `NLA_TRACKS` existe pero hubo reportes de fallos/lentitud con muchos objetos animados) — [API 4.5](https://docs.blender.org/api/4.5/bpy.ops.export_scene.html), [lista X3D (ejemplo script)](https://web3d.org/pipermail/x3d-ecosystem_web3d.org/2024-October/000081.html), [foro FS devsupport](https://devsupport.flightsimulator.com/t/errors-when-exporting-animations-as-nla-tracks-from-blender-3-6-23/17601)
- El manual 4.5 del glTF y de argumentos CLI existen en docs.blender.org/manual/en/4.5/... pero no pude leer su cuerpo — [CLI args 4.5](https://docs.blender.org/manual/en/4.5/advanced/command_line/arguments.html), [glTF 4.5](https://docs.blender.org/manual/en/4.5/addons/import_export/scene_gltf2.html)

### Inferences
- Comando headless típico (conocimiento previo, VERIFICAR en el manual CLI): `blender -b escena.blend --python-exit-code 1 -P pipeline.py -- --in anim.fbx --out salida.glb`. Flags `-b`, `-P`, `--python-expr`, `--` son estándar de Blender desde hace años.
- Dentro del script: `bpy.ops.import_scene.fbx(...)`, `bpy.ops.import_anim.bvh(...)`, `bpy.ops.nla.bake(...)` o `bpy.ops.export_scene.gltf(filepath=..., export_format='GLB', export_animations=True, export_animation_mode='ACTIONS', export_draco_mesh_compression_enable=False)` (nombres de parámetros a confirmar en la API 4.5; Draco no pude confirmarlo). Recomiendo NO comprimir con Draco en Blender y hacerlo después con gltf-transform/gltfpack para tener un solo paso controlable.
- Prioridad ALTA: es el núcleo; CLI sí; seguridad: scripts propios, sin riesgo de terceros; abrir .blend ajenos con "Auto Run Python" apagado.

### Gaps
- Texto exacto de flags CLI y lista de extensiones KHR_* soportadas por el exportador de Blender 4.5: no se pudo leer (páginas truncadas por la herramienta). Revisar la página del manual con offset o el README en GitHub. Conocimiento previo (no verificado aquí): exporta KHR_materials_* (emission, ior, specular, transmission, volume…), KHR_lights_punctual, KHR_texture_transform, KHR_mesh_quantization, KHR_animation_pointer (experimental).

## 2. Retargeting de animación (add-ons)

### Takeaway
Para un maniquí propio sin pagar: Rigify + el add-on gratuito GPL "Retarget" (solo Blender 5.0+) o el retargeter de Rokoko (gratis, 2.80+, funciona en 4.5). Auto-Rig Pro (de pago, ~$50 con Remap y exportador) es la opción más robusta y probada si el presupuesto lo permite.

### Cited Findings
- **Retarget (KBS-DEV)** — fork de Expy-Kit y AnimAide; retarget entre rigs, convertir a Rigify, gestor de acciones; GPL-3.0+; **requiere Blender 5.0+ (NO instala en 4.5)**; v5.2.0 en la ficha (otro resultado de búsqueda cita 5.1.1 de jul-2026: inconsistencia); 37.053 descargas, 5.0/15 reseñas — [extensions.blender.org](https://extensions.blender.org/add-ons/retarget/); repo github.com/KBSBAUDRICE/Retarget
- **Rokoko Studio Live para Blender** — repo oficial Rokoko/rokoko-studio-live-blender; retargeting integrado (elegir armature fuente y destino, "Build Bone List", "Auto Scale", "Retarget Animation"); Blender 2.80+; 523 estrellas; licencia ambigua (LGPL-3.0 en recursos vs badge MIT en README); sin releases, solo master; descarga librerías al instalar (requiere internet); no se declara cuenta para el retarget (Rokoko dice que el retarget no es de pago ni requiere premium; un usuario reporta que hace falta login) — [GitHub oficial](https://github.com/Rokoko/rokoko-studio-live-blender), [Rokoko guía](https://www.rokoko.com/insights/ace-retargeting-in-blender-with-this-simple-workflow-i-the-ultimate-retargeting-guide), [Rokoko soporte](https://support.rokoko.com/hc/en-us/articles/4410463481489)
  - Seguridad: existe un fork "Atlas-3D-Artist/rokoko-studio-live-blender" con 0 estrellas — evitar forks, usar el repo de Rokoko — [fork](https://github.com/Atlas-3D-Artist/rokoko-studio-live-blender)
- **Auto-Rig Pro** (Superhive/Blender Market) — de pago: paquete completo con exportador FBX/glTF y Remap $50, solo core $25; Blender 2.93–5.2 según ficha; Remap retarga entre rigs con distintos nombres/orientaciones (ARP, Rigify, custom); el changelog avisa que los exportadores FBX/glTF integrados no soportan propiedades animadas en huesos custom — [Superhive](https://superhivemarket.com/products/auto-rig-pro/versions), [BlenderNation](https://bazaar.blendernation.com/listing/auto-rig-pro/)
- **Mixaify** (Mixamo→Rigify, comunitario) — requiere Blender 5+ — [BlenderArtists](https://blenderartists.org/t/addon-mixaify-mixamo-to-rigify/1630129), [repo netherby](https://github.com/netherby/mixaify-retarget)
- **Bone animation copy tool** — extensión en extensions.blender.org (no leí ficha) — [enlace](https://extensions.blender.org/add-ons/bone-animation-copy-tool/)
- **Rigify** — documentación lo lista como GPL, add-on incluido con Blender; no se pudo confirmar si en 4.5 es bundled o extensión — [manual](https://docs.blender.org/manual/en/latest/addons/rigging/rigify)
- **Mixamo (fuente de animaciones)** — FAQ oficial de Adobe: personajes y animaciones libres de regalías para proyectos personales, comerciales y sin fines de lucro, con Adobe ID gratis; foros indican que no se pueden redistribuir los FBX crudos como assets ni usarlos para entrenar ML (fuente no oficial, tipo comunidad) — [Adobe FAQ](https://helpx.adobe.com/en/creative-cloud/faq/mixamo-faq.html), [Adobe community](https://community.adobe.com/t5/mixamo-discussions/mixamo-faq-licensing-royalties-ownership-eula-and-tos/td-p/13234775)

### Inferences
- Fichas resumidas (prioridad / CLI / seguridad):
  - Rokoko retarget: ALTA / parcial (se llama operadores bpy desde script tras habilitar add-on; no documentado en lo leído) / revisar código, es oficial del fabricante.
  - Retarget KBS-DEV: MEDIA (bloqueada por 5.0+; ALTA si migramos a Blender 5.x) / probablemente scriptable vía operadores / GPL, 15 reseñas = base pequeña; leer código.
  - Auto-Rig Pro: ALTA si hay presupuesto / sí vía operadores bpy (inferencia) / marketplace reputado; licencia comercial, salida sin restricción conocida (verificar EULA).
  - Rigify: ALTA para armar el maniquí; sus huesos DEF- son los que se exportan; CLI sí (generate rig por script).
  - Copy Attributes, Copy Transforms/constraints: nativo, "bake action" resuelve el retarget manual por constraints (flujo sin add-ons): ALTA como respaldo, 100% scriptable.
- Salida GPL: las animaciones/GLB producidos con add-ons GPL no heredan GPL (el código sí) — INFERENCIA no verificada en esta sesión.
- Alternativa libre de add-ons: constraints "Copy Rotation" por hueso + `bpy.ops.nla.bake(visual_keying=True, clear_constraints=True, bake_types={'POSE'})` por script (conocimiento previo, verificar API).

### Gaps
- Blender 4.5 compat de Rokoko master y de "Bone animation copy tool", Rigify bundled/extension, "Mixamo Converter" y "Blender Animation Retargeting" como nombres: no verifiqué fichas (el nombre exacto de "Mixamo Converter" no apareció en las búsquedas).
- EULA de Auto-Rig Pro sobre uso comercial de salidas: no leído.

## 3. Importadores/exportadores y glTF

### Takeaway
El exportador glTF oficial viene incluido en Blender (Apache-2.0) y es el camino principal a three.js. Para FBX de Mixamo usar el importador FBX nativo. gltf-transform y gltfpack cubren compresión por CLI.

### Cited Findings
- **glTF-Blender-IO (Khronos)** — Apache-2.0; incluido en Blender 2.80+; el repo documenta soporte 2.80–4.5 + 5.0/5.1 — [GitHub](https://github.com/KhronosGroup/glTF-Blender-IO). CLI: sí (operador bpy). Prioridad ALTA. Seguridad: oficial Khronos.
- **glTF Transform CLI** — instalación `npm install --global @gltf-transform/cli`; comandos: `optimize` (ej. `gltf-transform optimize input.glb output.glb --compress draco --texture-compress webp`), `meshopt`, `draco`, `etc1s`, `uastc`, `validate`, `inspect`; la página consultada no declara licencia del software (docs CC-BY 3.0) — [gltf-transform.dev/cli](https://gltf-transform.dev/cli). Prioridad ALTA; CLI sí.
- **gltfpack (meshoptimizer)** — MIT; CLI para optimizar glTF: `-i/-o`, `-c` (EXT_meshopt_compression), `-cc` (más compresión), `-tc` (texturas KTX2/Basis, KHR_texture_basisu), `-si R` (simplificar), `-kn`/`-km` (conservar nodos/materiales con nombre); binario nativo recomendado, también npm. Ejemplo: `gltfpack -i scene.gltf -o scene.glb -cc -tc`. Three.js ≥ r122 requiere `GLTFLoader.setMeshoptDecoder(MeshoptDecoder)` — [README gltfpack](https://raw.githubusercontent.com/zeux/meshoptimizer/master/gltf/README.md), [repo](https://github.com/zeux/meshoptimizer). Prioridad ALTA.
- **glTF-Validator** — Apache-2.0, Khronos; `gltf_validator [opciones] <entrada>`, `-o` stdout, `-m` mensajes; código de salida no cero si hay errores; paquete npm `gltf-validator`; valida .gltf/.glb recursivo en carpetas — [GitHub](https://github.com/KhronosGroup/glTF-Validator). CLI sí. Prioridad ALTA. (gltf-transform también trae `validate`.)

### Inferences
- Draco vs meshopt: para animaciones con skinning, meshopt (comprime también keyframes) es mejor que Draco (solo geometría) — fuente: la descripción de gltf-transform ("Compresses geometry and animation with Meshopt" vs "geometry with Draco"). Recomiendo meshopt + KTX2.
- FBX importador/exportador nativo de Blender: incluido, GPL; CLI sí (`bpy.ops.import_scene.fbx`); BVH `bpy.ops.import_anim.bvh` (nombres de operador de conocimiento previo, verificar en API 4.5). Prioridad ALTA/MEDIA.
- Extensiones KHR en three.js: GLTFLoader soporta Draco, meshopt, KTX2 (requiere KTX2Loader + transcoder Basis) — conocimiento previo, verificar en docs three.js.

### Gaps
- Lista KHR_* del exportador Blender 4.5 y opciones de animación (Sampling, NLA, "Always sample animations", optimización de keyframes): no leída.
- Licencia de gltf-transform (INFERENCIA: MIT, no confirmada).

## 4. Librerías de poses, animaciones y assets

### Takeaway
Fuentes legales de animación para retargetear: Mixamo (gratis, términos Adobe), BlenderKit (verificar), Blender Studio. Cascadeur es útil solo en plan de pago para exportar glTF/FBX.

### Cited Findings
- **Cascadeur** — plan Free no comercial y exporta solo .casc; Indie (<$100k/año de ingresos) añade FBX/DAE (otra fuente tercera dice también USD y glTF); Pro sin límites; se eliminó el límite de 300 fotogramas en 2024.1 — [FAQ licencias](https://cascadeur.com/blog/general/cascadeurs-new-licensing-structure-comprehensive-faq), [planes](https://cascadeur.com/plans), [review 2026 (tercero)](https://aisotools.com/blog/cascadeur-review-2026). Prioridad BAJA/MEDIA; CLI: no verificado.
- **Houdini Apprentice** — gratis, solo personal NO comercial, marca de agua, render ≤1920×1080; proyectos comerciales exigen Houdini Indie — [SideFX](https://www.sidefx.com/products/houdini-apprentice/). Prioridad BAJA (incompatible con producción comercial).
- **BlenderKit** — la página de precios redirige a blendkit.com (dominio que no pude verificar como oficial); no leí condiciones. Tratar con cautela — [redirección observada](https://www.blenderkit.com/plans/pricing/).

### Inferences
- Pose Library (Asset Browser nativo desde 3.x/4.x), Blender Studio assets (CC0/CC-BY en general según conocimiento previo, NO verificado aquí), catálogos de Asset Browser: nativos, GPL, CLI parcial (`bpy.ops.asset.*`). Prioridad MEDIA.
- Godot headless y Wings3D: no relevantes para este pipeline; descartar salvo que se busque motor alternativo (BAJA). No investigados.

### Gaps
- Licencias de Blender Studio assets, BlenderKit free, Pose Library, Godot, Wings3D: sin verificación.

## 5. Procedural (ciudades, edificios, multitudes) y estilos NPR

### Takeaway
No pude verificar fichas de estos add-ons en esta sesión; solo conocimiento previo.

### Cited Findings
- Ninguno verificado con fuente en esta sesión. Extensions.blender.org destaca add-ons gratuitos y de código abierto (listas destacadas no relacionadas con retarget) — [extensions.blender.org](https://extensions.blender.org/)

### Inferences (conocimiento previo, SIN verificar)
- Geometry Nodes (nativo, GPL): instancing/multitudes/edificios procedurales; Sverchok (GPL, add-on nodal), Building Tools (GPL, GitHub ranjian0), City Builder: confirmar licencia, compat 4.5 y mantenimiento antes de usar. Prioridad MEDIA para Geometry Nodes, BAJA/MEDIA para el resto.
- Freestyle/Grease Pencil/NPR: nativos; Freestyle NO se exporta a glTF (son render, no geometría): para three.js hay que reproducir el estilo arcilla/toon con shaders propios (MeshToonMaterial, outlines por post-proceso). Hornear texturas arcilla en Blender sí viaja por glTF. Prioridad MEDIA.
- Las instancias de Geometry Nodes deben "realizarse" o exportarse como instancias a glTF; GPU instancing en three.js requiere EXT_mesh_gpu_instancing (confirmar soporte del exportador).

### Gaps
- Todo el bloque requiere una segunda pasada.

## 6. Automatización y MCP

### Takeaway
Existe un conector oficial de Blender para Claude hecho por los desarrolladores de Blender; el repo comunitario "blender-mcp" (ahujasid) ejecuta código arbitrario y tuvo 4 CVE en 2026 — usar el oficial y solo para exploración, no para el pipeline reproducible.

### Cited Findings
- Conector oficial: construido por los desarrolladores de Blender, parte de "Claude for Creative Work"; requiere Blender 4.2+ y Claude Desktop en la misma máquina; add-on "BlenderMCP" instalado desde el repositorio de extensiones "lab"; da acceso a la escena vía API Python; permite pedir ver el código antes de ejecutar; licencia no indicada — [Claude Academy](https://academy.claude.com/tutorials/using-the-blender-connector-in-claude), [claude.com](https://claude.com/connectors/blender)
- Comunitario (ahujasid, renombrado "MCP for Blender"): 4 CVE medios en 2026 (ejecución de código arbitrario `execute_blender_code` cerrada como "por diseño", lectura de archivos por URL de imagen, SSRF, path traversal arreglado en jul-2026); riesgo de inyección de prompt por nombres/metadatos; modo `BLENDER_MCP_SAFE_MODE=1` es solo protección contra accidentes — [StraySpark](https://www.strayspark.studio/blog/is-blender-mcp-safe-security-guide-2026) (blog de terceros)
- Recomendación del blog: ejecutar en localhost, apagar integraciones no usadas, "Auto Run Python" apagado, guardar antes — misma fuente

### Inferences
- Para producción: scripts bpy versionados y ejecutados en `-b`; MCP solo para prototipar. Evitar clones/forks de repos con estrellas sospechosas; fijar commit y leer código. Prioridad: oficial MEDIA, comunitario BAJA.
- Render por lotes: `blender -b archivo.blend -o //out_#### -a` (conocimiento previo, verificar). No es necesario para glTF.

### Gaps
- Código/licencia del add-on oficial BlenderMCP no inspeccionados.

## 7. Flujo recomendado (animación de biblioteca → retarget → bake → GLB comprimido → three.js)

### Takeaway
Flujo scriptable en cuatro etapas: (1) importar FBX/BVH, (2) retarget por Rokoko/Remap/constraints, (3) bake a acciones, (4) export glTF + meshopt/KTX2 + validar.

### Cited Findings
- Comandos documentados oficialmente: `gltf-transform optimize in.glb out.glb --compress draco --texture-compress webp`, `gltf-transform meshopt in.glb out.glb`, `gltf-transform validate in.glb` — [gltf-transform CLI](https://gltf-transform.dev/cli)
- `gltfpack -i in.glb -o out.glb -cc -tc` — [README gltfpack](https://raw.githubusercontent.com/zeux/meshoptimizer/master/gltf/README.md)
- `gltf_validator -o -m in.glb` (JSON a stdout) — [glTF-Validator](https://github.com/KhronosGroup/glTF-Validator)
- three.js: `loader.setMeshoptDecoder(MeshoptDecoder)` — mismo README gltfpack.

### Inferences
Pipeline (esqueleto; partes bpy a verificar contra API 4.5):
1. Fuente: Mixamo FBX (sin skin, 30 fps) → `blender -b maniqui.blend --python-exit-code 1 -P retarget.py -- --src walk.fbx --out walk.glb`
2. `retarget.py`: `bpy.ops.import_scene.fbx(filepath=src)`; mapear huesos (Rokoko "Build Bone List"/Remap o constraints Copy Rotation + Copy Location solo en hips); `bpy.ops.nla.bake(frame_start, frame_end, only_selected=False, visual_keying=True, clear_constraints=True, bake_types={'POSE'})`; renombrar acción; borrar armature fuente; `bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animations=True, export_animation_mode='ACTIONS')`.
3. Varias animaciones en un solo GLB: exportar cada acción como clip (modo Actions/NLA) o fusionar GLBs con `gltf-transform merge` (comando no verificado, revisar `gltf-transform help`).
4. `gltfpack -i walk.glb -o walk.min.glb -cc -tc` o `gltf-transform optimize walk.glb walk.min.glb --compress meshopt --texture-compress ktx2` (flag ktx2 NO verificado; la página solo muestra webp, etc1s, uastc).
5. `gltf_validator walk.min.glb` y `gltf-transform inspect`.
6. three.js: GLTFLoader + MeshoptDecoder (+ KTX2Loader si hay texturas Basis), `AnimationMixer.clipAction(gltf.animations[i])`.
- Riesgos: escalas FBX (cm vs m), orientación de huesos (Mixamo A-pose vs maniquí), root motion, nombres de huesos con prefijo `mixamorig:`; quantización de meshopt con keyframes puede afectar precisión (probar con una pieza antes). Verificar visualmente en three.js antes de procesar por lotes.

### Gaps
- No ejecuté nada (restricción). Ningún comando de bpy fue probado; nombres de parámetros del exportador deben contrastarse con https://docs.blender.org/api/4.5/bpy.ops.export_scene.html.

## Resumen de prioridades
- ALTA: Blender 4.5 bpy headless, exportador glTF oficial, gltf-transform, gltfpack, glTF-Validator, Rokoko retarget, Rigify, Mixamo, bake NLA nativo.
- ALTA condicional (pago): Auto-Rig Pro ($25–$50).
- MEDIA: Retarget KBS-DEV (necesita 5.0+), conector oficial BlenderMCP, Geometry Nodes, Asset Browser.
- BAJA: Cascadeur (glTF/FBX solo en plan de pago), Houdini Apprentice (no comercial), blender-mcp comunitario, forks de Rokoko, Wings3D/Godot.
- Avisos de seguridad: BlenderKit redirige a blendkit.com (no verificado); fork Atlas-3D-Artist de Rokoko (0 estrellas).

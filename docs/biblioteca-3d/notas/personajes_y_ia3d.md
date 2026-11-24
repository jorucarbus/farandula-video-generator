# Herramientas para crear personajes 3D sin rostro, rigging automático e IA 3D (RTX 3070 8 GB, Windows) — estado nov-2026

Método: ~21 llamadas web (fetch de README/LICENSE + búsquedas). Donde la página no mostró el texto de la licencia lo digo y va a Gaps. Etiquetas: HECHO = visto en la fuente citada; INFERENCIA = mi deducción. "NO USAR sin verificar" = licencia ambigua/no comercial/no leída.

## 1. Generadores de personajes y packs listos (base de maniquíes)

### Takeaway
Para maniquíes lisos sin rostro, la ruta gratuita más clara es MPFB (Blender) o los packs CC0 (Quaternius/KayKit), porque se puede ocultar/omitir la cara y no dependen de nube. Ready Player Me ya no es opción; MetaHuman, Daz y VRoid tienen términos que exigen revisión.

### Cited Findings
**MPFB / MakeHuman (MPFB2)** — prioridad ALTA
- URL: https://github.com/makehumancommunity/mpfb2 y https://static.makehumancommunity.org/mpfb.html
- HECHO: "generador de humanos gratuito y open source para Blender"; MPFB 2.x requiere Blender 4.2 o superior; incluye temas de Rigify, "rig helpers" e integración Mixamo — [README](https://github.com/makehumancommunity/mpfb2), [docs](https://static.makehumancommunity.org/mpfb.html)
- El repo tiene tres archivos de licencia separados (LICENSE.CODE.md, LICENSE.ASSETS.md, LICENSE.md); no pude leer su contenido. No lo afirmo como CC0. → **verificar LICENSE.ASSETS.md antes de comercializar** (conocimiento previo, NO verificado en esta sesión: MakeHuman declara salidas CC0 y código GPL/AGPL).
- Costo: gratis. Requisitos: solo Blender (CPU/GPU irrelevante). Calidad para maniquí liso: alta (cuerpo anatómico, dimorfismo de género por siluetas; la cara se puede dejar sin rasgos o recortar la malla de la cabeza) — INFERENCIA.

**Quaternius** — prioridad ALTA
- URL: https://quaternius.com/faq.html
- HECHO: cada kit es CC0 o "QAL License"; uso comercial permitido; no exige atribución; solo se prohíbe la reventa directa en QAL; se puede modificar y combinar. La licencia exacta de cada kit está en su página y en un .txt dentro de la descarga. — [FAQ](https://quaternius.com/faq.html)
- Qué kit de personajes modulares es CC0 o QAL: no verificado → mirar el .txt del paquete concreto.

**KayKit (Kay Lousberg)** — prioridad ALTA (animaciones), MEDIA (personajes)
- URL: https://kaylousberg.itch.io/kaykit-animations
- HECHO: CC0, "pague lo que quiera" (gratis); 29 animaciones (17 base + 12 de la v1.2: Idle, Walk, Run, Jump, Cheer, Wave, Dance, Pick up, Throw, Interact, Roll, Dash…); FBX y glTF; el pack es para personajes KayKit antiguos sin piernas y no se actualiza; los personajes nuevos traen sus propias animaciones. — [itch.io](https://kaylousberg.itch.io/kaykit-animations)
- INFERENCIA: son personajes estilo juguete low-poly, no anatómicos; el género por silueta sería limitado. Útil como banco de animaciones solo si el rig es compatible (la página no confirma el esqueleto).

**Ready Player Me** — prioridad: DESCARTADA
- HECHO: Netflix la adquirió (anuncio 19-dic-2025); los servicios independientes (PlayerZero y otros) se apagaban el 31-ene-2026. — [TechCrunch](https://techcrunch.com/2025/12/19/netflix-acquires-gaming-avatar-maker-ready-player-me/), [PocketGamer.biz](https://www.pocketgamer.biz/netflix-acquires-avatar-creation-platform-ready-player-me)
- Gap: no encontré confirmación posterior al cierre. Marcar NO USAR.

**VRoid Studio (pixiv)** — prioridad BAJA/MEDIA
- HECHO: los meshes/texturas/presets provistos pueden venderse o usarse comercialmente salvo cláusulas especiales; usar VRoid Studio para otra cosa que no sea creación (p. ej. construir herramientas de creación de personajes) está restringido; exporta VRM; v2.14.0 el 29-jun-2026 (iPad ahora con anuncios). — [Guidelines](https://vroid.com/en/studio/guidelines), [condiciones VRM](https://developer.vroid.com/en/guidelines/conditions_of_use.html)
- INFERENCIA: estilo anime con cara; quitar cara es incómodo. Solo útil como base de rig humanoide VRM. Revisar el Artículo 11 de los Términos antes de uso comercial (no pude leerlo).

**MetaHuman (Epic)** — NO USAR sin verificar
- HECHO: con UE 5.6+ aplica el EULA de Unreal; el EULA del MetaHuman Creator cubre UE 5.5 y anteriores; la página oficial dice "usable con cualquier motor o software creativo", pero foros reportan lecturas contradictorias (renderizar fuera de Unreal, vender assets). — [metahuman.com/license](https://www.metahuman.com/license), [EULA](https://www.unrealengine.com/eula/mhc), [foro](https://forums.unrealengine.com/t/metahuman-commercial-use/1174378)
- Además son rostros fotorrealistas: no encaja con "sin rostro".

**Daz 3D** — NO USAR sin verificar: no encontré el EULA vigente en esta sesión (Gap). Conocimiento previo no verificado: restricciones para usar contenido en pipelines de IA/redistribución.

**Mixamo (personajes y animaciones)** — prioridad ALTA (animaciones)
- HECHO: gratis con Adobe ID; personajes y animaciones royalty-free para proyectos personales, comerciales y sin fines de lucro; el auto-rigger y las librerías son solo para humanoides bípedos; no disponible para IDs Enterprise/Federated ni con código de país China — [Adobe FAQ](https://helpx.adobe.com/be_en/creative-cloud/faq/mixamo-faq.html)
- HECHO (post de empleado Adobe, 2022, podría estar desactualizado): sin atribución obligatoria; prohibido entrenar modelos de ML con el contenido; los archivos no se pueden distribuir a clientes ni a no-miembros del equipo — [Foro Adobe](https://community.adobe.com/t5/mixamo-discussions/mixamo-faq-licensing-royalties-ownership-eula-and-tos/td-p/13234775)
- Riesgo: si vendes/entregas los maniquíes rigged con animaciones Mixamo incluidas como producto (biblioteca), la cláusula de distribución puede aplicar. Para un video final renderizado, el uso es el caso cubierto. Verificar con el EULA completo.

**Blender Human Generator / Character Creator (Reallusion) / Avaturn**: no verificados en esta sesión (Gap). Avaturn: la búsqueda no devolvió nada. Character Creator es de pago y genera la cara; baja prioridad.

### Inferences
- Para género distinguible por silueta sin cara, MPFB permite sliders de género/peso, y se elimina el rostro modificando la malla de la cabeza (óvalo liso) — INFERENCIA, no probada.
- Packs CC0 sirven para atajar animaciones y props, no para maniquíes anatómicos con género.

### Gaps
- Licencia exacta de salidas de MPFB (LICENSE.ASSETS.md no leído).
- Blender Human Generator, Avaturn, Character Creator, Daz EULA: sin datos.
- Qué kit de personajes modulares de Quaternius cumple la condición.

## 2. Riggers automáticos y retargeting

### Takeaway
Mixamo es el auto-rigger gratuito más simple para humanoides; AccuRIG 2 y Rigify son gratuitos y viables; UniRig es el candidato de IA open-source (MIT, 8 GB mínimo) pero no probado en Windows. Auto-Rig Pro es la opción de pago ($50) más completa.

### Cited Findings
**UniRig (VAST-AI)** — prioridad MEDIA (probar)
- URL: https://github.com/VAST-AI-Research/UniRig
- HECHO: código MIT; licencia de los pesos no indicada en el README (en HF VAST-AI/UniRig); requiere GPU CUDA con mínimo 8 GB de VRAM; Python 3.11, PyTorch ≥2.3.1, spconv, torch_scatter, torch_cluster, numpy 1.26.4, flash_attn puede fallar; entradas .obj/.fbx/.glb/.vrm; salida de esqueleto/skin en FBX y merge a .glb; solo está liberado el checkpoint entrenado con Articulation-XL2.0 (el modelo con Rig-XL/VRoid aún no); no menciona Windows. — [README](https://github.com/VAST-AI-Research/UniRig)
- INFERENCIA: 8 GB justo en tu 3070; instalación en Windows probablemente difícil (spconv/flash_attn). **Weights: NO USAR sin verificar.**

**AccuRIG 2 (Reallusion)** — prioridad ALTA (gratis, Windows)
- HECHO: gratuito; personal de Reallusion indicó que si el personaje es enteramente tuyo y sin contenido Reallusion puedes usar AccuRIG para riggearlo en tu juego; los motions de ActorCore solo se pueden usar dentro de AccuRIG; EULA vigente 2026 no confirmado. — [Foro EULA](https://discussions.reallusion.com/t/question-about-accurig-2s-eula/15034), [CG Channel](https://www.cgchannel.com/2025/07/rig-and-animate-3d-characters-for-free-with-accurig-2-0/)
- Las fuentes son foros/prensa, no el EULA → verificar el texto incluido en la descarga.

**Auto-Rig Pro** — prioridad MEDIA (si el presupuesto lo permite)
- HECHO: paquete completo $50 (ARP + Smart + Remap + export FBX) con 12 meses de soporte; solo core $25; Remap retargetea acciones entre armaduras con distintos nombres; licencia listada como "Royalty Free" en Blender Market y "GPL" en Superhive (conflicto). — [Superhive](https://superhivemarket.com/products/auto-rig-pro/faq), [Blender Market](https://blendermarket.com/products/auto-rig-pro)
- Útil para retargetear Mixamo/Quaternius a tu rig.

**Rigify (Blender)** — prioridad ALTA
- HECHO (indirecto): add-ons con bpy deben presentarse como GPL 3 en extensions.blender.org; existen retargeters Mixamo→Rigify: "Retarget" (GPL-3.0+, solo Blender 5+), Mixaify (open source, Blender 5), QuickMO (pago, Blender 4.3–5.2, GPL). — [Retarget](https://extensions.blender.org/add-ons/retarget/), [Mixaify](https://blenderartists.org/t/addon-mixaify-mixamo-to-rigify/1630129), [QuickMO](https://superhivemarket.com/products/quickmo)
- Licencia de Rigify en sí no confirmada en esta búsqueda; es parte oficial de Blender (conocimiento previo: GPL, el rig generado es tuyo) — NO VERIFICADO.

**RigNet, "Blender rigid body"**: no investigados (Gap). RigNet: investigación académica, licencia no leída → NO USAR sin verificar. "Rigid body" de Blender es física, no rigging: no aplica (INFERENCIA).

### Inferences
- Pipeline de menor riesgo: maniquí MPFB (que ya trae rig Rigify/Mixamo) o auto-rig con Mixamo/AccuRIG; UniRig solo como experimento.

### Gaps
- Licencia de pesos de UniRig; Windows real.
- RigNet, rigidez, EULA de AccuRIG 2 vigente.

## 3. Modelos IA imagen/texto-a-3D

### Takeaway
Para maniquíes lisos NO necesitas IA 3D: un cuerpo paramétrico es mejor (topología limpia, simétrico, riggeable). La IA sirve para props/accesorios. Locales viables en 8 GB: TripoSR y Stable Fast 3D (~6 GB, MIT / licencia Stability); Hunyuan3D 2.1 solo forma y con trucos; TRELLIS exige ≥16 GB.

### Cited Findings
- **TripoSR** — https://github.com/VAST-AI-Research/TripoSR — MIT en código, modelos pretrained y demo; ~6 GB VRAM por imagen; <0.5 s en A100; color como vertex colors o textura con --bake-texture — [README](https://github.com/VAST-AI-Research/TripoSR). Prioridad MEDIA (props). Calidad: mallas blandas, sin partes traseras fiables (INFERENCIA).
- **Stable Fast 3D** — https://github.com/Stability-AI/stable-fast-3d — ~6 GB VRAM; Windows experimental (requiere Visual Studio 2022 y PyTorch/CUDA acordes); licencia: README enlaza LICENSE.md (Stability Community License según conocimiento previo; el texto no se leyó) → **verificar umbral de ingresos**. Prioridad MEDIA.
- **Hunyuan3D 2.1 (Tencent)** — https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1 — VRAM oficial ~10 GB forma, ~21 GB textura, ~29 GB ambas; guías de comunidad dicen forma en 6–8 GB con modo low-VRAM (sin test de 3070 8 GB) — [README](https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1), [Guía Windows](https://codersera.com/blog/set-up-hunyuan3d-2-on-windows-a-step-by-step-guide/). Licencia: Tencent Hunyuan 3D 2.1 Community License (13-jun-2025): NO aplica en UE, Reino Unido ni Corea del Sur; más de 1 M de usuarios activos mensuales exige licencia aparte; Tencent no reclama derechos sobre las salidas; prohíbe usar salidas para mejorar otros modelos de IA — [LICENSE](https://raw.githubusercontent.com/Tencent-Hunyuan/Hunyuan3D-2.1/main/LICENSE). Prioridad MEDIA; **si estás en Ecuador, el territorio está cubierto (HECHO: solo excluye UE/UK/KR)**; igualmente marcar NO USAR sin verificar si tu entrega pasa por la UE.
- **TRELLIS (v1)** — https://github.com/microsoft/TRELLIS — MIT (modelos y casi todo el código; submódulos con licencias propias); mínimo 16 GB VRAM; probado solo en Linux — [README](https://github.com/microsoft/TRELLIS). **No cabe en 8 GB.** Prioridad BAJA.
- **TRELLIS.2 4B** — https://huggingface.co/microsoft/trellis.2-4b — pesos MIT; fichas dicen ≥24 GB, solo Linux; cifras por resolución (16/40/80 GB) de un artículo tercero no confirmadas — [HF](https://huggingface.co/microsoft/trellis.2-4b). No viable local.
- **InstantMesh** — https://github.com/TencentARC/InstantMesh — código Apache-2.0; licencia de pesos no leída (tarjeta HF); VRAM no indicada; Zero123++ modificado → **NO USAR sin verificar** pesos. Prioridad BAJA.
- **Meshy** — plan Free: CC BY 4.0 (comercial solo con atribución, la salida es tuya), descargas limitadas; Pro $20/mes: privado y uso comercial completo — [docs Meshy](https://docs.meshy.ai/pricing).
- **Tripo** — fuentes contradictorias sobre la licencia del plan Free (CC BY 4.0 vs no comercial); Pro ~$20/mes con propiedad de los assets — [Tripo blog](https://www.tripo3d.ai/blog/commercial-use-ai-3d-models) (fuente interesada), [Costbench](https://www.costbench.com/software/ai-3d-generation/tripo-ai/). Free: NO USAR sin verificar.
- **Rodin (Hyper3D)** — licencia comercial explícita solo en Business; ~$0.40/generación en fal.ai; precios mensuales contradictorios — [pricing](https://hyper3d.ai/pricing), [fal.ai](https://fal.ai/models/fal-ai/hyper3d/rodin/playground).
- **CSM** — un solo blog dice que Google lo adquirió en ene-2026 (NO confirmado) — [3D AI Studio](https://www.3daistudio.com/blog/best-3d-model-generation-apis-2026).

### Inferences
- Los resultados IA suelen salir como malla triangular densa sin topología ni rig → exigen retopo y rigging; para humanoide sin cara el ahorro es nulo frente a MPFB.
- Género por silueta es difícil de controlar con IA imagen-a-3D.

### Gaps
- Pesos de InstantMesh; texto de Stability Community License; planes actuales de Meshy/Tripo (cambian seguido).
- Calidad real en maniquíes lisos: no hay benchmark; todo es inferencia.

## 4. Retopología, textura y movimiento (referencia cruzada)

### Takeaway
Blender (Quad Remesh no existe nativo; sí Remesh/Voxel, y Instant Meshes/QuadriFlow) cubre limpieza gratis. Movimiento texto-a-animación open source tiene licencias problemáticas.

### Cited Findings
- **Instant Meshes** — https://github.com/wjakob/instant-meshes — remallador cuádruple guiado por campos; binarios para Windows/Mac/Linux; licencia no leída (LICENSE.txt); la página no dice nada sobre derechos de la salida — [GitHub](https://github.com/wjakob/instant-meshes). Prioridad MEDIA. Licencia: NO USAR sin verificar (conocimiento previo sin confirmar: BSD).
- **QuadriFlow**: no investigado (Gap; en Blender viene como "Quadriflow Remesh").
- **HY-Motion 1.0 (Tencent)** — misma restricción territorial UE/UK/KR; salida SMPL/SMPLH, FBX/BVH — [issue](https://github.com/Tencent-Hunyuan/HY-Motion-1.0/issues/49). SMPL-X: licencia original (Max Planck) no permite uso comercial ni redistribución — [foro](https://huggingface.co/spaces/wxDai/MotionLCM/blob/main/LICENSE) (fuente débil). NO USAR sin verificar.
- **MotionCLR**: licencia IDEA, uso comercial requiere pedir licencia — [HF](https://huggingface.co/EvanTHU/MotionCLR/blob/main/LICENSE). NO USAR.
- MoMask, MDM: licencia no verificada.
- Texto/imagen a textura: no investigado (Gap). Para maniquíes lisos no hace falta: material liso en Blender.

### Inferences
- Para animaciones, Mixamo (gratis) + KayKit/Quaternius (CC0) cubren 10+ clips sin IA.

### Gaps
- QuadriFlow, texturas IA, licencias MoMask/MDM.

## 5. Recomendación: flujo mínimo para 2 maniquíes (F/M) sin rostro, rigged, 10+ animaciones

INFERENCIA salvo donde se indica. Tiempos estimados para alguien que sabe Blender básico; no medidos.

1. **Base (gratis, ~2–3 h)**: Blender ≥4.2 + MPFB. Crear un cuerpo F y uno M con sliders; quitar rasgos faciales (cabeza lisa/ovoide), sin ropa o con ropa lisa; material arcilla único. El género queda por silueta (pecho, cadera, hombros). Verificar LICENSE.ASSETS.md.
2. **Rig (gratis, ~1 h por personaje)**: usar el rig Rigify/game-engine de MPFB; alternativa: exportar FBX y subir a Mixamo (auto-rigger solo bípedos) o AccuRIG 2.
3. **Animaciones (gratis, ~2–4 h)**: Mixamo (Idle, Walk, Run, Jump, Wave, Talk, Sit, Dance, Cheer, Defeat, Pick up…) — son 10+ fácilmente; o KayKit CC0 (29 clips). Retargetear con Retarget/Mixaify (Blender 5, GPL) o Auto-Rig Pro Remap ($50 opcional).
4. **Limpieza (gratis, ~1 h)**: Blender/QuadriFlow; solo si hiciste cambios de malla.
5. **IA 3D (opcional)**: solo para props. TripoSR/SF3D locales (6 GB) o Meshy Pro $20/mes un mes si hay prisa.
Total: ~1–2 días la primera vez; todo gratuito salvo Auto-Rig Pro y la nube opcional.

Cuidado: si los maniquíes con animaciones de Mixamo se redistribuyen a terceros, se aplica la cláusula "no distribuir archivos a no-miembros del equipo" (post de Adobe 2022) → solo usarlos en videos renderizados, o preferir clips CC0.

## Tabla resumen de prioridad
| Herramienta | Prioridad | Marca |
|---|---|---|
| MPFB | Alta | verificar LICENSE.ASSETS |
| Rigify + retargeters | Alta | — |
| Mixamo | Alta | revisar distribución |
| KayKit / Quaternius | Alta | verificar kit |
| AccuRIG 2 | Alta | verificar EULA |
| Auto-Rig Pro | Media | pago $50 |
| UniRig | Media | pesos NO USAR sin verificar |
| TripoSR, SF3D | Media | SF3D verificar licencia |
| Hunyuan3D 2.1 | Media | territorio UE/UK/KR; VRAM justa |
| TRELLIS / TRELLIS.2 | Baja | no cabe en 8 GB |
| InstantMesh, Tripo Free, HY-Motion, MotionCLR, MetaHuman, Daz | — | NO USAR sin verificar |
| Ready Player Me | — | descartada (cerrada) |

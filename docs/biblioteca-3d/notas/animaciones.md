# Bibliotecas de animación de humanoides (clips) para maniquíes sin rostro — estado nov. 2026

Leyenda: HECHO = leído en fuente citada esta sesión. INFERENCIA = deducción mía. NO VERIFICADO = conocimiento previo sin confirmar en página oficial hoy.
Nota de método: varias páginas oficiales fallaron (Adobe FAQ 403, kenney.nl 404, CMU/AMASS cert error en una de ellas); donde pasó, lo digo.

## 1. Fuentes con licencia permisiva (usar)

### 1.1 Quaternius — Universal Animation Library 1 (UAL1) — PRIORIDAD ALTA
- URL: https://quaternius.com/packs/universalanimationlibrary.html
- HECHO: 120+ animaciones, rig humanoide universal; locomoción en 8 direcciones, jog, sprint, empujar, gatear, nadar, sentarse, muerte, combate/armas y emotes. Formatos FBX, GLB y Blend. Licencia CC0 ("libre para uso personal, educativo y comercial"). Una parte es gratis (Standard); Pro y Source son de pago/Patreon (precio no aparece en el texto). Fuente: misma URL.
- Descarga: sin cuenta para la parte gratis (INFERENCIA; la página no lo dice explícitamente). Atribución no exigida (CC0).
- Retargeting: rig único pensado para retargeting; GLB directo a three.js. INFERENCIA: usar SkeletonUtils.retargetClip con nombres de huesos mapeados, o más simple, usar el mismo rig en tus maniquíes.
- Calidad: buena, estilo "game-ready"; cobertura de gestos sociales limitada.

### 1.2 Quaternius — Universal Animation Library 2 (UAL2) — ALTA
- URL: https://digitalproduction.com/2026/02/10/130-animations-one-rig-zero-drama/ (cobertura de prensa; verificar en quaternius.com)
- HECHO: más de 130 clips; la versión estándar gratis incluye ~70 %; locomoción, melee, armas, parkour, actividades civiles (agricultura, beber, pescar) y movimiento tipo zombi; CC0; mismo rig universal; fuente en .blend en la versión de pago. Sin garantía de compatibilidad directa con Mecanim/mannequin de Unreal.
- Fuente adicional: https://opengameart.org/content/universal-animation-library (listado, UAL1).

### 1.3 KayKit — Character Animations — MEDIA
- URL: https://kaylousberg.itch.io/kaykit-animations
- HECHO (versión 1.2 leída): 29 animaciones (idle, walk, run, jump, defeat, cheer, wave, dance, pick up, throw, interact, climbing, combate/disparo, roll, dash). FBX y glTF. CC0, pago "name your own price", sin atribución. Solo para personajes KayKit antiguos sin piernas ("newer-style characters include their own animations").
- Retargeting: rig propio; INFERENCIA: viable pero poco útil por escaso repertorio social. Wave/cheer/dance sí sirven.

### 1.4 Kenney — Animated Characters 1/2/3 — BAJA
- URLs: https://kenney-assets.itch.io/animated-characters-3 ; https://opengameart.org/content/animated-characters-1
- HECHO: CC0; Animated Characters 1 tiene solo 3 animaciones (idle, jump, run); atribución no obligatoria. No encontré "animation library" de Kenney (la URL kenney.nl/assets/animation-library dio 404) — NO existe confirmado.
- Valor: mínimo.

### 1.5 100STYLE (Ian Mason) — MEDIA (solo locomoción estilizada)
- URL: https://www.ianxmason.com/100style/
- HECHO: licencia CC BY 4.0; pide crédito ("The 100STYLE Dataset - Ian Mason") también en obra comercial. 
- NO VERIFICADO (conocimiento previo): 100 estilos de caminata/carrera, BVH, ~4 M frames. Útil para "desfile", "caminar orgulloso/triste/borracho", etc. Requiere BVH→retarget a tu rig. Esqueleto propio, no humanoide estándar.

### 1.6 CMU Motion Capture Database (BVH, también FBX en Unity Asset Store) — MEDIA/ALTA para cantidad
- URL oficial: https://mocap.cs.cmu.edu/ ; recursos: https://mocap.cs.cmu.edu/resources.php
- HECHO (vía búsqueda, no pude abrir la página de términos por error de certificado): los términos de CMU dicen que se puede incluir en productos vendidos comercialmente pero no revender directamente, ni convertido. Pide cita. Otras páginas resumen "free for all uses" (secundarias). Conversiones BVH de Bruce Hahne en cgspeed; un mirror dice que su READMEFIRST afirma "do whatever you want" (no verificado). 
- RIESGO: derivados con otra licencia — conversión FBX en 4TU.ResearchData marcada CC BY-NC 4.0 → **NO USAR sin verificar** esa copia. Otra copia (Hugging Face) CC-BY-4.0.
- Unity Asset Store "Huge FBX Mocap Library" parts 1-3 (gratis): conversión de CMU, 2 534 FBX, EULA estándar de Unity — https://assetstore.unity.com/packages/3d/animations/huge-fbx-mocap-library-part-1-19991 . INFERENCIA: la EULA de Unity limita redistribuir como assets sueltos; sirve para renderizar videos, y solo si no se redistribuyen los clips. Requiere cuenta Unity.
- Contenido real CMU (conocimiento previo, NO VERIFICADO hoy): ~2 600 trials, 6 categorías (locomoción, interacción entre personas, situaciones, deportes, baile...). Incluye abrazos, discusión/gestos al hablar, caídas/tropiezos, aplausos, saludos; mocap ruidoso, esqueleto propio, sin manos ni dedos.
- Calidad: media (ruido, pies deslizando); necesita limpieza.

### 1.7 Mixamo (Adobe) — ALTA, con condiciones
- URL: https://www.mixamo.com ; FAQ: https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html (403 al leerla directo)
- HECHO (vía búsqueda): la FAQ oficial dice que personajes y animaciones son royalty-free para proyectos personales, comerciales y sin fines de lucro (cine, videojuegos). Hilo oficial de Adobe (sept. 2022): lo único prohibido es distribuir los archivos crudos de personaje/animación; no se pueden entregar a clientes/no miembros del equipo; no se puede vender las animaciones como producto. Hilo: https://community.adobe.com/t5/mixamo-discussions/mixamo-faq-licensing-royalties-ownership-eula-and-tos/td-p/13234775 . Usuarios en 2026 aún dudan si sigue vigente; no hallé declaración nueva.
- Uso aquí: renderizar a video = embebido en producto final → encaja. No publicar los FBX en repos públicos.
- Descarga: cuenta Adobe gratuita requerida. FBX (y .dae); NO GLB nativo (convertir con Blender). ~2 000+ animaciones (NO VERIFICADO), rig Mixamo estándar (mixamorig:Hips...), el más soportado para retargeting (Blender addons, three.js).
- Categorías (conocimiento previo): hip hop/baile, aplausos, saludos, señalar, hablar con gestos, caídas, desmayos, sentarse, llorar, celebrar, correr, lanzar, besar, etc. Probablemente la mayor cobertura social gratuita.
- Calidad: alta (mocap/keyframe limpio), manos con dedos simples. Riesgo: Adobe puede cambiar términos; Mixamo ha tenido cero actualizaciones mayores (INFERENCIA).

### 1.8 Rokoko — free mocap assets / Motion Library — MEDIA
- URL: https://www.rokoko.com/mocap/free-mocap-assets (263 assets gratis según el título de la página)
- HECHO: páginas de packs gratis (TV, magia, superhéroes) dicen uso comercial permitido; 2020: ~150 moves gratis, resto $3-$6. Requiere cuenta de Rokoko Studio; exportar FBX/BVH requiere plan Basic (según cobertura). Términos formales de licencia NO encontrados → verificar el texto en cada descarga.
- Fuente: https://www.cgchannel.com/2020/03/get-150-free-mocap-moves-from-rokokos-motion-library

### 1.9 Truebones — MEDIA/BAJA
- URL: https://truebones.gumroad.com
- HECHO: licencia royalty-free comercial, pero **prohibida la redistribución o reventa** de los FBX/BVH; pide crédito. El Zoo ahora cuesta $100 y el código FREE se retiró (dic. 2025). Foco en animales; no hallé packs humanos gratis. Prioridad baja.

### 1.10 MoCap Online (mocaponline.com) — BAJA/MEDIA
- URLs: https://mocaponline.itch.io/mocap-online-demo ; guía de gratuitos https://mocaponline.com/blogs/mocap-news/free-3d-animations
- HECHO: demo gratis en itch (animaciones de packs Mobility, Rifle, Ninja, Zombie); formatos Unity/FBX/Blender; packs de pago en Unity Store bajo EULA (Mobility Starter $4.99, Pro $54.99). Licencia del demo NO verificada.

### 1.11 RancidMilk — Free Character Animations (itch.io)
- URL: https://rancidmilk.itch.io/free-character-animations
- HECHO: basado en CMU; el autor afirma uso libre en investigación y comercial (afirmación del autor, no de CMU). Ver riesgos de CMU. Prioridad baja (conveniencia).

### 1.12 three.js examples (Soldier, Xbot, Michelle, RobotExpressive)
- URL: https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf
- HECHO: existen Soldier.glb, Xbot.glb (+Xbot.blend), Michelle.glb, RobotExpressive/. El listado no muestra licencia.
- INFERENCIA/NO VERIFICADO: Soldier, Xbot y Michelle provienen de Mixamo (→ términos Mixamo); RobotExpressive es CC0 de Tomás Laulhé (Quaternius-like). **NO USAR sin verificar** como assets redistribuibles. Solo sirven como prueba técnica (pocos clips: idle/walk/run, etc.).

### 1.13 Sketchfab, Poly Pizza, OpenGameArt, itch.io — MEDIA (búsqueda caso a caso)
- No verifiqué páginas esta sesión salvo OpenGameArt/itch (listados arriba: Kenney y Quaternius). CONOCIMIENTO PREVIO NO VERIFICADO: Sketchfab permite filtrar por "Downloadable + Animated + CC0/CC-BY"; CC-BY exige atribución; las licencias "Standard" o NC no sirven. Poly Pizza: modelos CC0/CC-BY de Google Poly/Quaternius, pocos humanos animados. OpenGameArt: mezcla CC0, CC-BY, CC-BY-SA, GPL → revisar cada ficha; CC-BY-SA/GPL **NO USAR sin verificar** (copyleft). Calidad dispar.

### 1.14 Blender / Rigify packs
- NO VERIFICADO esta sesión. Blender Studio ofrece Rigify y personajes CC-BY/CC0 con animaciones de producción (Sprite Fright, etc.), pero no una biblioteca de acciones sociales genérica. Prioridad baja; Rigify sirve como estándar de rig para retargeting (addons como "Auto-Rig Pro" son de pago, "Rokoko Blender plugin" gratis).

## 2. Fuentes NO COMERCIALES o ambiguas — NO USAR sin verificar

| Fuente | Licencia (hecho) | Fuente |
|---|---|---|
| AMASS | Solo investigación, educación y proyectos artísticos no comerciales; prohíbe producto/servicio comercial y entrenar redes para uso comercial; comercial: ps-license@tue.mpg.de | https://amass.is.tue.mpg.de/license.html |
| LAFAN1 (Ubisoft) | CC BY-NC-ND 4.0 | https://github.com/ubisoft/ubisoft-laforge-animation-dataset |
| Motion-X | CC BY-NC-SA 4.0, requiere formulario de autorización; sub-datasets con licencias propias | https://github.com/IDEA-Research/Motion-X |
| HumanML3D | Deriva de AMASS/HumanAct12, solo investigación (según Motion-X paper) | https://arxiv.org/pdf/2307.00818 |
| BABEL | NO VERIFICADO: anotaciones sobre AMASS → hereda restricción no comercial (INFERENCIA) | — |
| 4TU FBX de CMU | CC BY-NC 4.0 en metadatos | https://data.4tu.nl/datasets/0448aab2-3332-449f-a8e2-d208cb58c7df/1 |
| Bandai Namco motion dataset (3 000 moves) | NO VERIFICADO; conocimiento previo: CC BY-NC-ND | https://www.cgchannel.com/?p=136588 |

## 3. Servicios de video/texto→movimiento (de pago o con términos)

- DeepMotion Animate 3D / SayMotion (texto→3D): plan gratis solo no comercial; comercial requiere plan de pago (la FAQ dice que solo el tipo de plan determina la licencia; créditos gratuitos no cambian eso). Precios conflictivos entre fuentes ($9-$18/mes iniciales, créditos 2 min/mes vs 60 s); verificar en https://www.deepmotion.com/pricing y https://deepmotion.com/faq . Prioridad media.
- Move.ai: precio oficial Standard $50/mes con uso comercial (otra fuente ~$99; conflicto); gratis solo no comercial. https://www.move.ai/pricing . Baja (necesitas video de un actor).
- Plask: Free/Standard/Pro; términos comerciales NO confirmados; precios en agregadores contradictorios. https://plask.ai/pricing . Baja/media.
- Meshcapade (MoCapade, texto-a-movimiento): precio y licencia comercial de salidas NO confirmados (precios entre $10 y €99/mes según agregadores); ofrecen licencias comerciales para body models y datasets. https://meshcapade.com/animation . Verificar antes de usar.
- Rokoko Create / Text-to-Motion (dentro de Rokoko Studio): https://www.rokoko.com/products/studio/text-to-motion ; términos de salida no verificados.
- Uthana (texto→movimiento): apareció en búsqueda, https://uthana.com/pricing ; no leído.
- Ready Player Me: HECHO — Netflix lo adquirió y cerró servicios/API el 31-ene-2026 (TechCrunch https://techcrunch.com/2025/12/19/netflix-acquires-gaming-avatar-maker-ready-player-me/). Su biblioteca de animaciones no es fuente viable. Un blog de competidor (Avatar SDK) indica además otro reporte de caída en jul-2026 sin aviso confirmado (conflicto, fuente interesada). **DESCARTAR.**

## 4. Modelos open-source texto→movimiento (GPU 8 GB: INFERENCIA/NO VERIFICADO)

- MoMask: código MIT según mirrors del README (https://github.com/EricGuo5513/momask-codes ; licencia no confirmada en repo oficial); entrenado con HumanML3D/KIT → los pesos heredan datos de AMASS = riesgo no comercial. NO USAR sin verificar.
- T2M-GPT, MDM, MotionGPT, MLD: licencias de repo NO verificadas (búsqueda no las devolvió). Todos entrenados sobre HumanML3D → misma duda sobre pesos/datos. NO USAR para producto comercial sin verificar.
- Motion-X: no comercial (ver sección 2).
- Requisitos de 8 GB VRAM: no encontré cifras oficiales. INFERENCIA: modelos tipo MDM/T2M-GPT/MoMask son pequeños (cientos de M de parámetros) y suelen correr en 8 GB para inferencia, pero no lo comprobé. Salida es SMPL/joints → hay que retargetear.
- Conclusión práctica: usar solo para boceto interno; para entregable comercial, el riesgo de licencia de datos supera al beneficio salvo contratar licencia de AMASS o usar servicio comercial (DeepMotion SayMotion, Rokoko Create).

## 5. Matriz acción → mejores fuentes
(Todo lo marcado "probable" es INFERENCIA por conocimiento previo de los catálogos; no vi las listas completas de clips. Verificar con búsqueda dentro de Mixamo/CMU.)

| Acción | Mejores fuentes | Notas |
|---|---|---|
| Desfile / pasarela | Mixamo ("Catwalk Walk", "Female Fashion"-tipo, probable); 100STYLE (estilos de caminar); CMU (walk) | Tal vez no exista pasarela exacta en libres → ver sección 6 |
| Caminar | UAL1/2, Mixamo, KayKit, 100STYLE, CMU | |
| Correr | UAL1/2, Mixamo, KayKit | |
| Posar | Mixamo (poses idle/"Standing Greeting"/"Female Standing Pose" probable) | Poses estáticas: se pueden fijar un frame |
| Aplaudir | Mixamo ("Clapping", probable), KayKit Cheer, UAL emotes (no verificado) | |
| Señalar | Mixamo ("Pointing", probable), CMU | |
| Caer / tropezar | Mixamo ("Falling", "Stumble"-tipo), CMU, UAL (muerte) | |
| Discutir | Mixamo ("Arguing", probable), CMU (interacción) | Dos personajes sincronizados: difícil |
| Abrazar | CMU (interacción entre dos), Mixamo ("Hug", probable) | Contacto entre dos rigs requiere ajuste manual |
| Entregar premio / entregar objeto | KayKit Interact/Pick up, UAL (no verificado), Mixamo | Prop manual |
| Llorar | Mixamo ("Crying", probable) | Sin cara: usar manos a la cara |
| Celebrar | KayKit Cheer, Mixamo ("Victory"), UAL emotes, Rokoko packs | |
| Hablar con gestos | Mixamo ("Talking", "Gesturing", probable), CMU | Buena cobertura |
| Sentarse | UAL1 (sentarse, HECHO), Mixamo ("Sit"), CMU | |
| Saludar | KayKit Wave (HECHO), Mixamo, UAL | |
| Tomar foto | Mixamo (algo cercano "Taking Picture"? NO VERIFICADO) | Probablemente a mano |
| Flash de fotógrafos (cámaras) | Ninguna confirmada | Animar a mano o texto→movimiento |
| Brindis | Mixamo ("Drinking"?), UAL2 (beber, HECHO: "drinking") | |
| Baile | KayKit Dance, Mixamo (muchos), CMU, UAL emotes | |
| Desmayo | Mixamo ("Fainting"-tipo, no verificado), UAL muerte/knockdown | |
| Mirar el celular / chismear al oído | Mixamo (texting/whisper? no verificado) | |
| Lanzar / arrojar | KayKit Throw (HECHO) | |
| Empujar | UAL1 (HECHO) | |
| Esposado / arresto | No confirmado | |

## 6. Acciones que probablemente NO existen en bibliotecas libres
INFERENCIA (no pude comprobar el catálogo completo de Mixamo): desfile de pasarela con giro y pose de fotógrafos, cámara/flash de fotógrafos (rodilla/disparo), interacción de dos personajes (abrazo, discusión con contacto, entrega de premio con apretón de manos), tomar selfie, esposar/arrestar, dar entrevista a micrófono, firmar autógrafo, cuchichear/chismear. Alternativas: (a) kitbash con ramas del mismo rig en Blender; (b) texto→movimiento comercial (DeepMotion SayMotion, Rokoko Create) con licencia verificada; (c) grabarse en video con DeepMotion/Move.ai plan comercial; (d) animar poses clave a mano (estilo recorte/stop-motion encaja con maniquíes).

## 7. Resumen de prioridad
Alta: Mixamo (cobertura social), Quaternius UAL1/UAL2 (CC0, mismo rig, GLB).
Media: CMU (cantidad, interacciones; verificar licencia derivada), Rokoko gratis, 100STYLE (caminatas), KayKit, DeepMotion con plan pago.
Baja: Kenney, Truebones, MoCap Online, Move.ai, Plask.
Descartar: Ready Player Me. No usar sin verificar: AMASS, LAFAN1, Motion-X, HumanML3D, BABEL, pesos text-to-motion, modelos de three.js examples.

## Lagunas
- Catálogo exacto de Mixamo no leído; Kenney/CMU términos oficiales no leídos directamente; Sketchfab/Poly Pizza/Blender Studio no investigados con fuente; precios exactos DeepMotion/Plask/Meshcapade sin confirmar; requisitos de VRAM de modelos de texto→movimiento sin fuente.

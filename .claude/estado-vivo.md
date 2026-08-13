# Estado vivo — para retomar desde cualquier herramienta (Claude Code, Codex, Mac)

Este archivo dice **qué está a medio hacer ahora mismo**. El plan completo (por qué, en qué
orden, qué investigación lo respalda) vive en `.claude/plan-maestro-automatizacion.md` — léelo
primero si no conoces el proyecto. Este archivo solo trackea progreso.

Las dos invariantes que ninguna fase puede romper: video == duración del audio (±0.1s), ningún
clip pasa de 3.0s (uso legítimo, ver memoria `farandula-limite-3-segundos`).

## Estado al 2026-08-13 — Cartel de portada en el frame 0 del video, fuera del plan maestro

`test-persistencia` en `b34598d` (push verificado). Sigue siendo aparte del plan maestro, como
la portada JPG del 2026-08-10 de abajo — esto la EXTIENDE, no la reemplaza.

Pedido del usuario: que TikTok (sin API de portada) tome directamente el primer fotograma del
video como su portada. Primer intento (`96e88ea`) quemó un banner AUTOMÁTICO en el frame 0
(texto = `nombreCorto`, sin fuente/tamaño elegidos) — el usuario corrigió: quería DISEÑAR el
cartel él mismo, ANTES de generar el video, y que ese diseño se reuse IDÉNTICO en dos lugares:
quemado en el frame 0, y superpuesto sobre una captura elegida DESPUÉS de ver el video, para el
JPG (que ya no se re-edita ahí). De paso pidió que la subcarpeta del video pase a
`AAAA-MM-DD - Título` (antes solo el título).

- El editor de cartel (titular/fuente/tamaño auto-manual/caja + mockup CSS) se movió del
  resultado post-render al **Paso 6** (`public/index.html`), como bloque estático — antes vivía
  armado como HTML dinámico dentro de `showResult()`. Ahí el mockup usa fondo placeholder (no
  hay video real todavía; se había descartado antes previsualizar un clip real por complicado).
- `server.js` arma `cartel` (`{titular, fuente, tamanoManual, escalaCajaManual}`) desde
  `efectos.portada*` en `/api/generate-video`, lo pasa a `montarVideoPlan` para el frame 0, y lo
  GUARDA en `previews.get(token).cartel` — así `/api/portada` (elegir foto, post-render) lo lee
  de ahí en vez de recibirlo del body, garantizando que el JPG y el frame 0 sean idénticos. 400
  si no hay cartel guardado (Paso 6 vacío).
- `portada.js`/`video.js`: `generarBannerFrame0` ahora acepta tamaño/caja manual (antes siempre
  automático a la fuerza).
- Carpeta: `nombreCorto` → `${fecha} - ${nombreCorto}` en las dos ramas de guardado (local y
  Drive API). Los archivos adentro (mp4/jpg) no cambian de nombre.

Verificado real: browser contra el server (mockup del Paso 6 responde en vivo, 9 fuentes
cargadas); render real con tamaño manual (60pt) + caja manual (200%) — caso que el banner viejo
nunca ejercitaba — confirma en el frame 0 extraído; `/api/portada` real con y sin cartel
guardado (JPG idéntico al cartel / 400 claro), con ruta de debug temporal removida después
(confirmado con `grep`).

**Pendiente real**: nada a medio hacer. No se probó en Railway (solo local) — próxima sesión que
toque este código, confirmar ahí antes de dar por cerrado si el usuario reporta algo raro en
producción.

**Corrección el mismo día (`871a3c3`, `494720c`)**: el usuario mandó capturas mostrando que el
mockup del Paso 6 no coincidía con el video final (caja más angosta en el mockup que en la
realidad). Dos bugs en cadena, ambos en `.portada-live-pink`/`pintarCartelMockup()`
(`public/app.js`/`style.css`), ninguno en `portada.js` (servidor) — el servidor siempre estuvo
bien:
1. `width: max-content` hacía que el navegador AUTO-AJUSTE la caja al ancho REAL medido del
   texto — pero el servidor nunca mide texto real, calcula el ancho con la misma ESTIMACIÓN
   (`factorAncho`) que decide cuántas líneas entran, y esa estimación casi siempre sobreestima
   un poco (a propósito, para no desbordar). Fix: `pintarCartelMockup()` ahora calcula `boxW`
   con la fórmula exacta de `portada.js` y fija `pink.style.width` explícito.
2. Quedaba un `max-width: 88%` viejo (de cuando la caja se autoajustaba, techo cosmético) que
   seguía capeando ese ancho explícito a valores de `escalaCaja` altos (probado con 210%: pedía
   314px, CSS lo recortaba a 281px). El servidor no tiene techo así. Sacado.

Verificado en 3 capas para el segundo bug (no solo código): fórmula reimplementada aparte
(boxW=1058 de 1080 = 98% a caja 210%), `getComputedStyle` en browser real antes/después del fix,
y un render real (`montarVideoPlan` directo) confirmando visualmente la misma proporción.

## Estado al 2026-08-10 — Portada (miniatura), fuera del plan maestro

`test-persistencia` en `cf46124` (push verificado). Pedido directo del usuario ("poner portada
al video, escoger un fotograma y poner un titular"). Fase 8 (música, todas las sub-partes) y
la Fase 9 (Director de edición) siguen sin tocar — esto se hizo aparte, no es parte del orden
del plan maestro.

**Qué es**: TikTok no expone API para fijar la portada al publicar, así que esto genera una
imagen JPG **aparte** (nunca toca el video final) con un fotograma elegido + un titular quemado
encima, para que el usuario la suba a mano al publicar.

- `portada.js` (nuevo) — `ffmpeg -ss <t> -frames:v 1` sobre el MP4 de preview (el que ya
  sobrevive a la limpieza de temporales del render, no el original) + `drawtext` para el
  titular. Tamaño de letra **dinámico** (`ajustarTamano`): prueba de 92pt a 40pt hasta que el
  titular entre en máximo 2 líneas sin desbordar el ancho útil, usando el `factorAncho` real de
  la tipografía elegida — mismo principio que `tamanoSeguro()` de `subtitulos.js` (Fase 6), pero
  aplicado a un titular completo en vez de una palabra sola. Reusa el catálogo de 9 tipografías
  tal cual.
- `server.js` — `POST /api/portada` (genera, `Map` de tokens con la misma política de
  "conservar los 3 últimos" que ya usan los previews) + `GET /api/portada-file/:token` (público,
  mismo patrón que `/api/preview/:token`, porque `<img src>` no puede mandar el header de la
  API key).
- `public/app.js` — bloque "Portada" debajo del resultado del video: el titular sale
  pre-rellenado desde el nombre de archivo que ya genera `generarNombreArchivo` (editable, no
  hace falta una llamada nueva a Gemini), selector de tipografía (mismo catálogo), botón que
  toma el `currentTime` del reproductor como fotograma elegido. `cargarFuentesEnSelect()`
  generaliza `cargarFuentesSubtitulos()` para selects que no necesitan trackear el estado global
  de subtítulos.

**Bug real encontrado y corregido antes de verificar** (no llegó a producción): la primera
versión envolvía el titular a 2 líneas con un límite fijo de caracteres (22), sin tener en
cuenta el tamaño de fuente real — con Anton a 72pt un titular normal se salía del cuadro por
los dos lados. Corregido con `ajustarTamano()` (ver arriba). Verificado quemando frames reales
con ffmpeg, no solo revisando el código.

**Falsa alarma, para no repetir la confusión**: una corrida de prueba vía `curl` desde bash
mostró glifos rotos (tofu/cuadros) en "Á" y "¿" con la tipografía Bebas Neue. Parecía un bug de
cobertura de glifos de la fuente. Repetido con un cliente `fetch` de Node (mismo mecanismo que
usa el navegador real) contra el mismo endpoint, mismo texto, mismo font: **perfecto, sin tofu**.
La corrupción era del propio `curl`/bash mangling UTF-8 al pasar el texto por argv, no del
servidor ni de la fuente. Las 9 tipografías del catálogo sí soportan acentos/ñ/¿/¡ completos —
confirmado, no asumido.

**Rediseño visual** (`279953d`), pedido con referencia de imagen del usuario: caja sólida rosa
con esquinas redondeadas + texto oscuro en negrita (antes: caja translúcida negra + texto
blanco). Sin colita de burbuja de chat — decisión explícita, no valía el riesgo en ffmpeg.

**Bug real de producción, encontrado por el usuario con screenshot** (`4c4cb02`): la caja
redondeada usaba el filtro `geq` (talla el alpha en las 4 esquinas) montado con `overlay` vía
`filter_complex`. Funcionaba local (Windows) pero en Railway (Linux) daba
`"Filter not found"` — el binario estático de `ffmpeg-static` en Linux no trae `geq` compilado,
a diferencia del de Windows. **Reemplazado por completo**: la caja ahora es un "drawing"
vectorial de ASS (rectángulo con esquinas en bézier) + el titular como texto, en el MISMO
`.ass`, quemado con el filtro `ass` (libass) — el mismo que ya usan los subtítulos de Fase 6
en producción todos los días. Cero `geq`, cero `overlay`, cero `filter_complex`. Lección para
cualquier filtro nuevo de ffmpeg en este proyecto: **verificar que esté compilado en el binario
de Linux, no asumir por que funciona local en Windows** — los dos binarios de `ffmpeg-static`
no traen el mismo set de filtros.

**Diseño final** (`3d199f9`): texto blanco centrado dentro de la burbuja (`\an5`, ancla al
centro de la caja), burbuja centrada horizontalmente en pantalla (antes pegada al margen
izquierdo).

**Video + portada juntos en una subcarpeta** (`76de615`), pedido explícito del usuario: en vez
de subir el video suelto a la carpeta del canal, `/api/generate-video` crea una subcarpeta con
el título (`nombreCorto`) — local (`fs.mkdirSync`, si hay Drive Desktop sincronizado) o por API
(`driveHelper.crearCarpetaInsumo`, si no) — y el video se guarda ahí. Cuando el usuario genera
la portada más tarde (paso separado, después de ver el video), se guarda en la MISMA subcarpeta
junto al video. El vínculo entre ambos pasos viaja en el `Map` `previews` de `server.js`, que
pasó de `token -> path` a `token -> {path, destino}`.
**Fix real encontrado en el camino**: `crearCarpetaInsumo` usaba Service-Account-only, pero
`subirVideo` (misma carpeta destino) ya necesitaba OAuth — asimetría que hacía sospechar que la
creación de subcarpeta fallaría en silencio por permisos en el camino API. Cambiado a
`getDriveOAuth() || getDrive()`, mismo criterio que el resto. Confirmado real (no supuesto):
probado contra un canal real (Supe Lupe), la subcarpeta se creó y subieron video+portada,
limpiado después.

**Sombra al texto** (`ef3c5ea`): `\shad` escalado con el fontsize (mínimo 2px), color negro al
62% de opacidad — más sutil que una sombra sólida.

**Selector manual de tamaño** (`d0e116e`): checkbox "automático" (default, sin cambios de
comportamiento) + slider/número 24-160pt. `envolverATamano()` extraído de `ajustarTamano()` para
reusar el cálculo de wrapping en las dos rutas. Con tamaño manual el texto se envuelve forzando
el desborde de la última línea si hace falta — el usuario lo eligió a propósito.

**Margen blanco + editor en vivo + frame inicial por defecto** (`b48748f`), tres pedidos juntos:
- La caja pasó de 1 rectángulo a 2 concéntricos (blanco completo + rosa angostado por un margen
  proporcional al fontsize) — el texto no se mueve (mismo centro).
- Mockup en vivo bajo los controles: fotograma REAL capturado del `<video>` a un `<canvas>` +
  aproximación CSS de la burbuja, se actualiza en cada tecla/cambio sin ir al server. Reusa
  `factorAncho` (ahora expuesto por `/api/fuentes-subtitulos`) para replicar `ajustarTamano()`
  del lado del cliente — mismo criterio que el mockup de subtítulos del Paso 6.
- El reproductor arranca en el primer fotograma por defecto (antes quedaba donde el video
  terminaba de renderizar).
**Bug real encontrado probando en el Browser pane contra el server real** (no en el código a
simple vista): el `<video>` nunca decodifica un frame pintable si `currentTime` YA está en 0 y
se le reasigna 0 — es un no-op, nunca dispara `seeked`, así que el `canvas.drawImage()` capturaba
negro. Fix: `currentTime = 0.01` en vez de `0` (diferencia visual nula, fuerza un seek real) +
reintento cada 100ms hasta 2s como red de seguridad. Verificado con un video de prueba
(`testsrc2`, para distinguir visualmente qué frame se capturó) — mockup y render real coinciden.

**Corrección del margen blanco + tamaño de caja independiente** (`f650943`): el margen blanco
del commit anterior estaba al revés — blanco afuera (agrandaba la caja), rosa adentro. El
usuario aclaró: la caja de color se queda EXACTA como estaba, y adentro va una línea blanca fina
paralela al borde (rosa→anillo blanco→rosa otra vez, 3 formas concéntricas en vez de 2). De paso
pidió poder cambiar el tamaño de la CAJA sin tocar el de la LETRA — nuevo control (slider
50-250%) que multiplica solo el padding.
**Bug de CSS real encontrado probando el slider en browser**: `.portada-live-pink` (mockup) tenía
`left:50%` + `transform:translateX(-50%)` sin `width` — el ancho "auto" de un `position:absolute`
así se calcula tomando como disponible SOLO la mitad del contenedor (gotcha clásico de CSS), así
que el ancho quedaba pegado sin importar el padding (el alto sí respondía bien). Fix:
`width:max-content`.

**Pendiente**: verificar en Railway (`adventurous-reflection`, redeploy automático al pushear)
que el fix de `geq`→`ass` funciona ahí también — se verificó local con ffmpeg real pero no en el
entorno Linux exacto donde falló originalmente. No se tocó `farandula-video-family` (no tiene
este flujo) ni se evaluó portarlo — no se pidió.

## Estado al 2026-08-08 (continuación — noche)

`test-persistencia` en `2cc1db0` (verificado, push llegó). Después de cerrar la Fase 7 hubo dos
frentes más, ambos pedidos del usuario usando la app ya en producción — no estaban en el plan
maestro, se hicieron fuera de orden porque eran pulido de algo recién construido (subtítulos,
Fase 6) o un bug real que rompía el flujo (síntesis de fuentes).

**1. Iteración de subtítulos, varias vueltas sobre el resultado real (commits `8729022` →
`8b52364`)**. Orden real de los cambios, cada uno pedido después de VER el anterior:
- 3 palabras en pantalla → 1 sola palabra a la vez.
- Tipografía Poppins ExtraBold → Anton → catálogo de **9 tipografías** seleccionables
  (`subtitulos.js` `FUENTES`, endpoint `GET /api/fuentes-subtitulos`), cada una con su propio
  `factorAncho` para el resguardo de palabras largas.
- MAYÚSCULAS, sin fundidos ("no quiero parpadeos, solo un pequeño rebote").
- Tamaño 66pt → 88pt → 264pt (3x, pedido explícito); posición MarginV 720 → 300 (más abajo,
  siempre por encima del 15% que tapa TikTok).
- **Preview arrastrable en el Paso 6** (`#subs-preview`, mockup NO real de 1080x1920 a escala):
  la palabra de ejemplo se arrastra con pointer events para fijar posición, slider para tamaño,
  franja roja marcando la zona de TikTok. Carga las 9 tipografías reales vía Google Fonts CSS2
  **solo para este preview** (el render final sigue self-hosted con ffmpeg/fontsdir, sin CDN).
- Puntuación: primero se sacó de la pantalla (`limpiarPuntuacion`), después el usuario propuso
  convertirla en PAUSA en vez de descartarla — `pausaPorPuntuacion()` recorta el `fin` de la
  palabra que traía el signo (100ms coma/punto y coma/dos puntos, 220ms punto/exclamación/
  interrogación/puntos suspensivos), dejando un hueco silencioso sin evento ASS antes de la
  siguiente palabra. No toca video/audio, solo el `.ass` — cero riesgo para las invariantes.

Todo verificado con Gemini+ElevenLabs reales en cada vuelta (nunca solo el `.ass` en crudo:
frames quemados con ffmpeg e inspeccionados, incluida una corrida confirmando que Bebas Neue/
Archivo Black/Bangers se aplican de verdad y no caen todas al mismo sustituto).

**2. Multifuente (Fase 4) — dos ajustes de UX, mismo día**:
- `c29c88c`: el botón hacía DOS cosas (guardar Y sintetizar), y al pasar de paso no quedaba
  claro que se podían seguir agregando fuentes. Separado en "Agregar fuente" (solo guarda) +
  "Ya, procesar fuentes" (nuevo botón, sintetiza con todas — reusa `/api/resintetizar`). Límite
  3→6 fuentes (no había techo técnico real).

**3. Bug real en producción, encontrado por el usuario (commit `2cc1db0`, el más importante de
esta tanda)**: `llamarJSON()` en `gemini.js` reintentaba con el MISMO modelo que acababa de
devolver JSON malformado, en vez de subir de verdad un escalón — rompía la lectura de fuentes
con "JSON inválido tras 2 intentos: JSON irreparable" en producción (screenshot real: leyendo
una noticia de Arianna Mejía). Causa: el cálculo de qué modelo probar en el reintento se basaba
en el NÚMERO de intento (`i-1`), no en qué modelo respondió de verdad — y `callGemini()` puede
saltar varios escalones en silencio por saturación dentro de un solo intento, así que "intento 1"
no es lo mismo que "escalón 0". Fix: `callGemini()` ahora devuelve `{texto, modelo}`; `llamarJSON()`
calcula el siguiente escalón con `cadena.indexOf(modelo) + 1`, así que por construcción nunca
puede repetir el modelo que acaba de fallar. Los 3 llamadores directos de `callGemini`
(`generarGuion`, `agregarMarcas`, `generarNombreArchivo`) actualizados a desestructurar `.texto`.
Verificado con Gemini real (los 3 caminos, sin regresión) — la escalación en sí no se pudo forzar
a reproducir el malformado exacto, verificada por inspección del cálculo, no por repro.
**Pendiente**: portar este fix a `farandula-video-family` (comparte `gemini.js` tal cual).

**4. Bug real de producción #2 (commit `f714e47`)**: el usuario reportó "no veo las
transiciones en el video final". Causa: `xfade` no escala — un solo `filter_complex` con las
58 entradas de un video real usó **más de 8GB de RAM** (probado local con el mismo tamaño real,
1080x1920) y no terminaba en tiempo razonable (0.34x tiempo real); Railway se quedaba sin
memoria y el catch de robustez (correcto, no perdía el video) lo tapaba en silencio cayendo a
cortes secos. Fix: el plan se corta en **tandas de 10 clips** (`TANDA_MAX`, `video.js`) — cada
tanda con sus transiciones internas, corte seco entre tandas. Verificado real: los mismos 58
clips que antes siempre fallaban ahora terminan en 53.7s con ~1.9GB estables, sin fallback,
sincronía exacta. Videos de ≤10 clips (la mayoría) van por el mismo camino de antes, sin cambio.

**5. Tres pedidos puntuales del usuario (commit `8a18283`)**:
- Selector de tipo de transición: `<select>` → grid de checkboxes. `video.js` `elegirTransicion()`
  acepta array (marcar 1 = fija, varias = al azar solo entre esas, ninguna = las 16). Bug propio
  encontrado y arreglado en el camino: array vacío caía a `'fade'` en vez de a las 16.
- Tamaño de subtítulo: input numérico al lado del slider, sincronizados (`fijarTamano()` en app.js).
- Ganancia de audio: `elevenlabs.js` baja **-3.4dB** automático en todo audio generado (mismo
  ajuste que el usuario hacía a mano en su editor) — provisional, se afina de verdad en Fase 8.

**6. Fase 8 dividida en 3 partes** (límite semanal ajustado, 85% al momento de dividir) —
**8a lista (commit `0f0b74b`)**: clasificación de tono en `gemini.js` (`PROMPTS.lectura` pide
el campo `tono` en el MISMO JSON de la crónica, sin llamada extra). **7 categorías, no 6** —
se revisaron 30 títulos reales del historial (Sheet) antes de decidir: ~13% eran
"misterio/intriga" (¿es la misma persona?, el misterio del tatuaje), tono no cubierto por las 6
originales del plan. Se agregó `misterio` como 7ma. Aclarado también: ruptura → `tragedia`, NUNCA
`romantico` (son opuestos musicalmente) — había una ruptura real en la muestra que lo confirmó.
`TONOS` exportado desde `gemini.js` (lista única, 8b la reusa). `server.js` ya devuelve `tono` en
`/api/read` y `/api/resintetizar`. Verificado con Gemini real: 6/7 en 7 casos (uno por tono,
incluidos los 2 trampa); el único fallo cayó en `neutral` (seguro), nunca en tono dañino.

**8b lista (commit `33fa2fd`)**: el usuario confirmó que `Musica/` ya existía en Drive. Dos
hallazgos reales al explorarla: (1) NO está compartida con el Service Account, solo con OAuth —
`drive.js` usa `getDriveOAuth() || getDrive()` (mismo criterio de `driveCache.js`), funciona hoy
sin pedir nada más; (2) typo real en una carpeta ("ESCÁDALO" sin la N) — `seleccion.emparejarCarpetaTono()`
tolera hasta 2 caracteres de diferencia (Levenshtein), lo cubre sin bloquear. `drive.js`:
`obtenerCarpetasMusica()`/`listarMusica()`/`descargarMusica()`. `seleccion.js`:
`emparejarCarpetaTono()` + `elegirPista()` (rotación vía `historial.json`, namespace `musica_<tono>`).
Verificado con Drive real: los 7 tonos emparejan bien (incluido el typo), rotación usa las 5
pistas reales de TRAGEDIA completas antes de repetir.

**8c lista (commit `ac6d320`) — Fase 8 COMPLETA**. El usuario simplificó de sidechaincompress a
corte fijo -18dB tras verificar real que la voz de ElevenLabs es casi continua (medido: 28
huecos de 53-153ms en un audio de 14s, ninguno llega a 0.25s — un compresor habría bombeado).
Pidió además "mapear y etiquetar" el silencio inicial de las pistas: `musica.js` nuevo
(`detectarInicio()` con ffmpeg silencedetect, `etiquetarTodo()`) escribe el offset EN EL NOMBRE
del archivo en Drive ("Gavel Lullaby.wav" → "Gavel Lullaby [inicio=0.00s].wav") — mapeo real ya
corrido sobre las 26 pistas, 0 errores. `video.js` `prepararMusica()`: corta el silencio inicial
una vez, loopea la pista limpia a la duración exacta, -18dB + fade 1s entrada/salida;
`montarVideoPlan()` la mezcla con `amix normalize=0` (si no, ffmpeg bajaría también la voz).
`server.js` resuelve tono→carpeta→pista→descarga y arma el mux; checkbox nuevo en Paso 6.

Verificado con datos reales de punta a punta: mapeo de las 26 pistas reales, render real (voz +
música de Drive + video) con sincronía exacta, volumen de la pista preparada medido en aislado
(-17.6dB nativo → -36.8dB preparada, ~-18dB de diferencia, 17dB bajo la voz — dentro del rango
profesional estándar).

**Próximo paso: Fase 9 (Director de edición: reglas → Gemini con fallback), sin empezar.**

---

## Estado al 2026-08-08 (Fases 1-7)

**Fases 1 a 7 TERMINADAS hoy** + una corrección importante sobre la Fase 2 y dos ajustes de UX
sobre multifuente, el mismo día. `test-persistencia` en `6682624`. `farandula-video-family`
`main` en `fce9aa1` (Fases 5, 6 y 7 no aplican a family: no usa ElevenLabs, sin alineación
real). `main` del principal sigue en `f801076` — sin mergear a propósito.

**Fase 7 (transiciones xfade + rampa de zoom), commit `6682624`** — la más delicada del plan,
toca las dos invariantes directo. `filtroZoom()` pasó de progreso lineal a ease-out cúbico
(cambio de una línea, el de mejor relación esfuerzo/resultado del plan). `renderizarConTransiciones()`
nueva en `video.js`: cadena xfade (16 tipos curados + "aleatorio") intercalada con concat según
preset ninguno/todos/alternado, en un solo filter_complex. Corrección de solapamiento: el clip
que empalma con el siguiente se corta `duración + D` de la fuente, pero el offset de cada xfade
usa la duración VISIBLE acumulada — la suma que ve el espectador no se toca. `seleccion.planificarClips()`
acepta `clipMax` opcional; `server.js` lo baja a `CLIP_MAX - D` cuando hay transiciones activas
para que duración+cola nunca pase del límite legal de 3s (modo Insumos no lo toca, no lleva
transiciones).

**Bug real encontrado probando "alternado"** (mezcla xfade+concat en la misma cadena, no solo
"todos" con puro xfade): NVENC deja timebases distintas entre segmentos que `concat` no
reconcilia antes del siguiente `xfade` — el fallback lo tapaba en silencio, así que "alternado"
habría quedado permanentemente roto (siempre cortes secos) sin que nadie lo notara. Fix:
re-normalizar `fps=30,format=yuv420p` en cada entrada Y después de cada etapa xfade/concat, no
solo al principio de la cadena.

Verificado con fuentes sintéticas (lavfi, sin Drive): sincronía exacta en 4 escenarios, límite
legal de 3s confirmado en el peor caso (transición al máximo 0.6s + clips al tope del CLIP_MAX
efectivo), y frame extraído a mitad de una transición real confirma la mezcla visual.

**Pendiente, fuera de alcance de esta pasada**: rampas de velocidad (`setpts`) y transiciones
"deformadas" (perspective/lenscorrection/gblur) que menciona el plan — se evaluó el tamaño ya
grande de la fase y se dejaron para una pasada aparte.

**Dos ajustes de UX sobre multifuente (Fase 4), mismo día, fuera del orden del plan** — el
usuario los pidió al usar la app en producción:
- `c29c88c`: el botón de agregar fuente hacía DOS cosas a la vez (guardar Y sintetizar), y al
  cambiar de paso no quedaba claro que se podían seguir agregando fuentes. Ahora son dos
  acciones separadas — "Agregar fuente" solo guarda; "Ya, procesar fuentes" (nuevo botón)
  sintetiza con todas juntas (reusa `/api/resintetizar` tal cual). Límite de fuentes 3→6 (no
  había techo técnico real, decisión de diseño). Verificado con HTTP real: 1→6 fuentes sin
  re-sintetizar de más, 7ma rechazada, resíntesis final incorpora todas correctamente.

**Fase 6 (subtítulos ASS), commit `8a66c59`**: estilo único de la Fase 0 (Poppins ExtraBold
66pt, blanco+contorno negro, resalte amarillo `#f7c204` con rebote `\t` accel<1, tercio
medio-bajo). `subtitulos.js` nuevo: un evento ASS por PALABRA (texto completo del fragmento,
palabra activa resaltada) — reusa `fragments` de la Fase 2 directo como bloque de 2 líneas, sin
re-agrupar. Timing por palabra sale de `tiempos.alinearFragmentos()` (antes
`duracionesPorFragmento`, ahora también da tiempo real por palabra, no solo por fragmento — un
solo matching, un solo reloj). `seleccion.tiemposPorFragmento()` extraída y exportada para que
video y subtítulos usen la MISMA línea de tiempo. Quemado en `video.js` con el filtro `ass` en
el mux final; si falla, reintenta sin subtítulos (nunca aborta el render). Checkbox en Paso 6,
marcado por defecto.

Verificado con Gemini+ElevenLabs reales: 39 eventos de palabra, tiempos ordenados sin exceder el
audio real, quemado real con ffmpeg sin error, frame extraído y revisado visualmente (tipografía,
contorno, color, rebote, posición — todo dentro de spec).

**Fase 5 (tiempos reales), commit `13f38a5`**: `seleccion.planificarClips()` repartía tiempo por
% de caracteres — estimado, el techo de calidad del `subtitulos.js` viejo. Ahora usa el tiempo
REAL que ElevenLabs mide (endpoint `/with-timestamps`, alineación carácter-por-carácter), detrás
de una interfaz intercambiable (`tiempos.js`) con un stub `runpod` para alineación forzada
después (sirve también para family, que no tiene timestamps de ningún proveedor). Si algo no
calza (Gemini reescribe puntuación en la etapa de marcas, o ElevenLabs no devuelve alineación),
cae solo al % de caracteres — nunca rompe el render.

Bug de paso, no de esta fase pero la bloqueaba: `agregarMarcas()` dejaba colar
`"Nombre_Famoso: "` en el texto que se manda a hablar — ElevenLabs lo habría narrado en voz alta
en producción, siempre, sin que nadie lo hubiera notado. Arreglado con regla nueva en el prompt +
sanitizador en el código (no confiar solo en que Gemini obedezca).

Verificado con 3 corridas reales (Gemini + ElevenLabs, sin mocks): caso corto (4 fragmentos) y
caso largo (42 fragmentos, 161 palabras) — suma de duraciones por fragmento EXACTA contra la
duración real medida por ffprobe en los dos, todas las duraciones >0s.

**Próximo paso: Fase 8 (música por sentido), sin empezar.**

**Fase 4 (multifuente + solo audio), commit `8a4bc19`** + portada en `fce9aa1`. Dos cosas:

1. **Bug preexistente encontrado y arreglado**: `youtube-dl-exec` rompía en silencio en esta
   máquina (path con espacio, "D:\claude pro apps\...") — `descargarAudio`/`descargarVideo`
   fallaban SIEMPRE localmente, nunca en Railway. Arreglado invocando yt-dlp con `execFile`
   directo (sin shell) en `fuentes.js`.
2. **La fase en sí**: `extraerActa()` saca hechos neutrales de UNA fuente (sesgo-independiente,
   "solo lo que se dice, nunca gestos"); `sintetizarCronica()` combina 1-3 actas en una crónica.
   `/api/read` acumula fuentes por `jobId` (máx 3); `/api/resintetizar` cambia de sesgo sin
   re-descargar nada. YouTube: transcripción → audio → Gemini-directo → video, cada escalón cae
   al siguiente sin abortar.

Verificado con Instagram real (link del usuario) y HTTP real contra el servidor: 3 fuentes
acumuladas, 4ta rechazada, resíntesis 3.8s sin descargas (vs 14.4s con descarga). YouTube:
transcripción/audio bloqueados ahora mismo por el anti-bot de YouTube (externo) pero el
fallback a Gemini-directo se probó real y funciona — degrada al comportamiento que ya existía,
sin romper nada.

**Próximo paso: Fase 5 (fuente de tiempos intercambiable), sin empezar.**

⚠️ **Lección del port a family**: copiar un bloque entre repos por rango de texto arrastró de
vuelta `agregarMarcas`, que en family se había borrado a propósito (no usa ElevenLabs). Quedó
rota y nadie la llamaba, así que no falló nada — pero al portar hay que revisar qué quedó
adentro del rango, no solo que compile. Corregido en `cd25a48`.

**Corrección post-Fase 2 (commit `1dbb633`, portada en `80fa63d`)**: el usuario vio el resultado
real y notó que Clara Chía, nombrada en el guion, nunca aparecía en pantalla. Causa: la regla 6
que yo mismo escribí en la Fase 2 ("elige al sujeto, no al mencionado de pasada") era el MISMO
bug de otra forma. Reescrito con dos cambios de fondo: (1) el corte ahora es por sintaxis
(coma/conector/sujeto-predicado, ~40-60 chars) en vez de "una oración = un fragmento"; (2) la
carpeta la decide LA MENCIÓN, y si el fragmento no nombra a nadie sigue al referente implícito
(pronombres/posesivos) de la idea. Verificado 4/4 corridas (lite×2, alto×2): reconstrucción
exacta, ambas invariantes, Clara Chía aparece siempre, y el referente implícito ("su elección"
vuelve a Shakira aunque el fragmento anterior fuera de Piqué) se sostiene siempre. Granularidad
subió de ~16-19 a ~31-37 fragmentos, clip medio 1.91s — cae en el rango 1.5-3s pedido.
**Confirma la Fase 3**: lite salió más consistente que el tier alto entre corridas.

**Fase 1 (reskin), commit `55ae1bc`**: `style.css` reescrito completo (variables CSS,
`prefers-color-scheme: dark`, acento único `#2563eb`/`#5b9bff` oscuro, superficie fija
`#121212` para audio/video, badge del paso activo = mayor contraste de la pantalla). Los 18
estilos inline reemplazados por clases utilitarias. Mismas clases/selectores estructurales.
Verificado por computed style (light + dark). **Sin verificar visualmente**: el panel de
preview no estaba desplegado, así que no hubo compositing para tomar screenshot — pendiente que
el usuario lo abra y confirme, sobre todo `.selected` de las tarjetas de ángulo y el toggle del
historial (usan clases JS dinámicas; el mecanismo se probó sano con un elemento de control pero
no se vio renderizado).

**Fase 2 (fragmentación), commit `e995e37`** + portada a family en `8dd764b`: reglas 2 y 6 del
prompt (partir por cambio de sujeto es obligatorio, sin importar la longitud),
`verificarReconstruccion()`, `CLIP_MIN = 0.7` con `agruparParaClips()`, aviso al Paso 4, y la
interfaz `FRAGMENTADORES` como puerta abierta para `ritmo`. Verificado con Gemini real: el caso
del diagnóstico (83 chars, dos sujetos) ahora sí se parte, y un guion de 193 palabras da 19
fragmentos → 31 clips, media 2.10s, 0 parpadeos, ambas invariantes OK.

**Observación anotada, sin arreglar** (no es el bug que se arregló, y la alternativa no tiene
respuesta obvia): cuando una oración no nombra a nadie ("La coincidencia fue demasiado exacta"),
Gemini le arrastra el famoso del fragmento anterior. Es continuidad visual razonable y el
usuario puede corregirlo en el Paso 4.

**Fase 3 (router de modelos), commit `042db6d`** + portada a family en `cd25a48`: dos cadenas
(`creativo` arranca en tier alto, `mecanico` en lite y escala) y un router `TAREAS` que decide
cuál usa cada llamada. `callGemini` loguea `🤖 tarea → modelo`. La robustez no cambió: las dos
cadenas llevan los 4 modelos.

**Decisión de la Fase 3 que conviene poder revertir**: la fragmentación quedó en `mecanico`. En
la comparación cabeza a cabeza, lite hizo 3 cortes menos que el tier alto; dos eran cortes de
más del tier alto (misma persona en las dos mitades), y el tercero —"Piqué ... publicaba una
historia con Clara Chía"— lite lo deja entero como Piqué. Según la regla 6 del propio prompt
(elegir el SUJETO de la acción, no al mencionado de pasada) lite tiene razón, pero si se
prefiere el otro criterio **el cambio es una línea**: mover `fragmentacion` a `CADENAS.creativo`
en `gemini.js`. Lite fue idéntico en 3/3 corridas y reconstruyó exacto siempre.

**Próximo paso: Fase 4 (multifuente + solo audio), sin empezar.** Es la de mayor ahorro real
(~8x, dejar de mandar video a Gemini) y no bloquea nada del pipeline de render.

## Fases del plan maestro (11 total)

| # | Fase | Estado | Modelo sugerido |
|---|---|---|---|
| 1 | Reskin neutro + ergonomía | **hecha (2026-08-08, `55ae1bc`)** | Sonnet |
| 2 | Fragmentación por cambio de sujeto | **hecha (2026-08-08, `e995e37`)** | Opus |
| 3 | Router de modelos dentro de Gemini | **hecha (2026-08-08, `042db6d`)** | Sonnet |
| 4 | Multifuente + solo audio | **hecha (2026-08-08, `8a4bc19`)** | Sonnet |
| 5 | Fuente de tiempos intercambiable | **hecha (2026-08-08, `13f38a5`)** | Sonnet |
| 6 | Subtítulos ASS | **hecha (2026-08-08, `8a66c59`)** | Sonnet |
| 7 | Transiciones xfade + rampas | **hecha parcial (2026-08-08, `6682624`) — falta setpts/deformado** | Opus |
| 8 | Música por sentido | **hecha (2026-08-09/10, `ac6d320`)** | Sonnet |
| 9 | Director (reglas → Gemini con fallback) | no empezada | Opus |
| 10 | Insumos ampliados | no empezada | Sonnet |
| 11 | Desplegar `farandula-video-family` a Railway | no empezada | Sonnet |

Regla de asignación: Opus donde el error es silencioso (desincronía, clip que excede 3s, guion
recortado sin que nadie lo note); Sonnet donde el error se ve al abrir la página.

## Deuda menor conocida (no bloquea nada, anotar si se toca)

- `decidirEfecto('intercalado', i)` en `video.js` devuelve `activo: true` para todo índice —
  el espejo debería alternar y no lo hace.
- Paso 6 del modo Insumos sigue pidiendo carpeta de destino que el servidor ignora desde julio.
- yt-dlp postinstall y un TikTok/IG real sin probar en producción.
- Fix de `descargarVideo` (race de archivo truncado, hecho en la Mac) sin verificar en Railway.

## Protocolo si trabajas desde otra herramienta o máquina

1. `git fetch` y revisar divergencia ANTES de tocar código.
2. Al terminar una fase: marcarla aquí como hecha (con fecha y SHA del commit), actualizar
   "Próximo paso", y verificar que el push llegó (`git rev-parse HEAD` == `git ls-remote origin
   <rama>`).
3. Nunca dejar este archivo desactualizado si hay algo a medio hacer — es la única fuente que
   una sesión sin memoria (como Codex) puede leer.

## Protocolo de traspaso Claude → Codex (cuota diaria/semanal agotada)

Codex no lee esta conversación, ni memoria, ni skills de Claude Code — solo lo que hay en el
repo. Por eso el traspaso es: parar en punto seguro, escribir el estado, empujar, y darle a
Codex un prompt fijo que apunte a estos dos archivos.

**Cuando notes que la cuota se acerca (o el usuario avisa que se cortó):**

1. **No cortar a mitad de una edición.** Terminar el paso atómico en curso (una función, un
   archivo) hasta un punto donde el código compile/corra, aunque la fase completa quede sin
   terminar.
2. **Actualizar este archivo** — sección "Estado al [fecha]":
   - Qué se terminó de la fase en curso (con lista de archivos tocados).
   - Qué quedó a medio hacer, en una frase accionable ("falta: aplicar el mismo cambio de color
     a `index.html` líneas 40-90, `style.css` ya está").
   - Cualquier decisión tomada en la sesión que no estuviera ya en el plan maestro.
3. **Commit + push.** Verificar con `git rev-parse HEAD` == `git ls-remote origin <rama>`.
4. **Avisar al usuario** con el prompt exacto para pegar en Codex (plantilla abajo) — no asumir
   que él arma el prompt solo.

**Plantilla para pegar en Codex, en la raíz del repo:**

```
Lee .claude/estado-vivo.md y .claude/plan-maestro-automatizacion.md antes de tocar nada.
Segui exactamente en "Próximo paso". No repreguntes decisiones que ya estén resueltas en el
plan. Las dos invariantes (duración video == duración audio, ningún clip pasa de 3.0s) son
innegociables — verificalas antes de dar algo por terminado.
Cuando termines o se corte tu sesión: actualiza .claude/estado-vivo.md con el mismo formato
(qué se hizo, qué queda, próximo paso), commitea y pushea, y confirma que el push llegó con
git rev-parse HEAD comparado contra git ls-remote origin <rama>.
```

5. **Vuelta a Claude** (cuando la cuota reponga): mismo protocolo — `git fetch`, leer qué avanzó
   Codex en "Sesiones recientes" de `CLAUDE.md` o en este archivo, y seguir desde ahí. Es
   ping-pong: cualquiera de los dos puede quedar como "última mano", el archivo es la posta.

**Qué NO traspasar por este archivo**: nada que necesite juicio de una sesión completa (por
ejemplo, "¿este ángulo de guion suena natural?"). Eso mejor esperar a que el usuario esté
presente para decidir, no delegarlo a ciegas entre herramientas.

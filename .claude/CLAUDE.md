# Claude Code Setup — Farandula Video Generator

## ⚠️ Protocolo de sincronización entre máquinas (leer ANTES de tocar código)

Este proyecto se trabaja desde 2 máquinas (PC Windows del usuario + Mac de trabajo), cada una
con su propia sesión de Claude Code que **NO comparte memoria ni contexto con la otra** — el
único canal real de comunicación entre sesiones es este repo de git (commits + este archivo).

**Ya pasó una vez (2026-07-19)**: la Mac hizo 5 commits (iconos Phosphor, tipografía, rediseño
de historial/header) mientras en paralelo, sin saberlo, se rehacía UI similar en Windows sobre
código desactualizado — hasta que el usuario preguntó por algo que ninguna sesión recordaba
haber hecho. Se reconciliaron sin perder nada, pero pudo evitarse.

**Al EMPEZAR a trabajar en este repo (o en `farandula-insumos`, mismo protocolo), SIEMPRE:**
1. `git fetch origin --prune`
2. `git log --oneline <rama-actual>..origin/<rama-actual>` — si aparece algo ahí, la OTRA
   máquina avanzó desde la última vez. Leerlo (`git show --stat <sha>`) antes de tocar los
   mismos archivos.
3. Si hay commits remotos nuevos: `git pull` **antes** de empezar a editar. Si ya hay cambios
   locales sin commitear que pisan lo mismo, parar y preguntarle al usuario cómo reconciliar
   (nunca descartar nada sin confirmar explícitamente — ver Git Safety Protocol).
4. Leer "Sesiones recientes" (abajo) para saber qué se tocó y por qué — evita redescubrir o
   reimplementar algo dos veces (pasó con la verificación de Bloque D: se hizo por separado en
   ambas máquinas el mismo día sin saberlo).

**Al TERMINAR una sesión (o antes de una pausa larga), SIEMPRE:**
1. Commit + push de TODO lo terminado — nunca dejar cambios importantes solo locales; la otra
   máquina no los puede ver hasta que están en el remoto.
2. Verificar el push: `git rev-parse HEAD` debe coincidir con `git ls-remote origin <rama> | cut -f1`
   (memoria: se perdieron 5 horas de trabajo por un push que pareció exitoso pero no llegó).
3. Agregar una entrada en "Sesiones recientes" con: fecha, qué se hizo, qué archivos, qué quedó
   pendiente o sin verificar. Esto reemplaza la comunicación directa entre máquinas.

## 📍 Dónde va el trabajo AHORA

**[estado-vivo.md](estado-vivo.md)** — qué está hecho, qué falta y qué quedó a medio hacer.
Leerlo primero: es la única fuente que una sesión sin memoria (otra máquina, o Codex cuando se
agota la cuota) puede consultar. Ahí está también el **protocolo de traspaso a Codex**.

## ⏭️ Trabajo aprobado y sin empezar

- **[plan-maestro-automatizacion.md](plan-maestro-automatizacion.md)** — **el único plan vigente**
  (2026-08-08). Absorbe y reemplaza a `plan-multifuente-reskin.md` y
  `borrador-automatizacion-video.md`, que se borraron para no tener tres documentos solapados
  (siguen en el historial de git si hace falta).

  Son **11 fases ordenadas para no repetir trabajo**: el orden es el aporte principal del
  documento, no un detalle. Todas las decisiones de diseño ya están consultadas con el usuario —
  leerlo antes de empezar y **no re-preguntar** lo que ya está resuelto ahí.

  Lo que conviene saber sin abrirlo:
  - **Dos invariantes** que arruinan el video en silencio si se rompen: la duración del video
    debe seguir igualando la del audio, y **ningún clip puede pasar de 3 segundos** (uso
    legítimo; `CLIP_MAX` ya lo cumple, el riesgo es que las capas nuevas lo rompan).
  - **El ahorro grande no está en cambiar de modelo**, está en dejar de mandar video a Gemini
    (~263 tokens/s contra ~32 del audio). El cambio de tier es secundario.
  - ffmpeg 6.1.1 ya trae todo lo necesario (`xfade` con 58 transiciones, `ass`,
    `sidechaincompress`, `perspective`, `setpts`): **sin dependencias nuevas**.
  - **Cuatro puertas abiertas** que se dejan preparadas sin construir: fuente de tiempos
    (RunPod), fragmentación por ritmo de música, guion desde el grafo, y director de edición.

## Limpieza de código muerto (2026-08-05)

Se borraron ~540 líneas que no ejecutaba nadie, en **ambos** repos. El render activo es
`montarVideoPlan` (cortes limpios de ffmpeg + zoom/espejo opcionales); todo lo demás eran
capas viejas que quedaron colgadas.

**Borrado**: `subtitulos.js` entero (su `require` en `server.js` era la única referencia);
en `video.js` → `montarVideoHyper` (hyperframes, ya marcado como retirado en un comentario de
`server.js`), `montarVideo` (v1), `asignarVideos` (lo reemplazó `seleccion.planificarClips`) y
sus auxiliares privadas `elegirSfx`/`rutaFiltro`/`cargarUso`/`guardarUso`/`duracionFragmento`,
más las constantes que solo ellas usaban y el `usage.json` que dejaban en disco; en `gemini.js`
→ `fragmentarGuion` (v1) y `generarGuionTecnico`, con `PROMPTS.fragmentacion`.
En `farandula-video-family`, además, `agregarMarcas` y `PROMPTS.marcas` (prosodia de
ElevenLabs, que esa versión no usa).

**Se conservó a propósito** — no volver a "limpiarlo":
- `decidirEfecto` / `filtroZoom` — zoom y espejo **siguen activos**, decisión explícita del
  usuario. Si los presets están en "ninguno" el resultado son cortes limpios, pero el código
  corre.
- `fuentes.descargarAudio()` — hoy sin llamadas, pero es el camino principal del plan de
  multifuente. Borrarla es tirar trabajo que hay que rehacer.
- `fuentes.descargarVideo()` — fallback de YouTube.

**Método, por si se repite**: contar llamadas reales con grep antes de borrar, y revisar qué
auxiliares privadas quedan huérfanas al sacar una función grande (fue el caso de las cinco de
`video.js`). Verificar después que los módulos carguen, que el server arranque y con un **render
real** — un chequeo de sintaxis no prueba que el pipeline siga entero.

## Graphify Knowledge Graph (Token Saver)

Este proyecto tiene un **grafo de conocimiento** generado con Graphify.

**Archivo:** `graphify-out/graph.json` (211 nodos, 283 edges)

Cuando hagas consultas sobre arquitetura, flujos, o relaciones entre archivos, Graphify te ahorra ~**71x tokens** vs búsquedas plain-text.

### Generar/Actualizar el grafo

Después de cambios significativos en el código:

```bash
graphify . --code-only
graphify cluster-only .
```

(Requiere: `pip install graphifyy` en la máquina)

## Repos Hermanos

- `farandula-insumos` — Mismo pipeline, output diferente (fragmentos+audio vs video MP4)
  - También tiene grafo: `graphify-out/graph.json`
  - Ambos comparten ~80% del código (fusionables)

## Setup Dev Actual (2026-07-16)

- **Gemini Fallback Chain:** modelo `gemini-flash-latest` con degradación a `gemini-3.1-flash-lite-preview` si falla
- **Video Understanding:** TikTok/IG descargan con `youtube-dl-exec` + se suben a Gemini File API (multimodal)
- **Frontend Unificado:** botón de modo (Video/Insumos) en Paso 1, router backend dinámico
- **Error Recovery:** botones "reintentar" (conserva state) y "volver" (edita paso anterior) por etapa

Ver `README.md` para detalles técnicos completos.

## Rama `test-persistencia` — Bloque A completo (2026-07-16)

**Regla vigente**: versión de prueba, NO tocar `main`/Railway hasta que usuario confirme funciona óptimo (ver memoria `farandula_test_version_rule`).

Hecho en esta rama (detalle en `README.md`, sección "Rama de prueba"):
- `jobStore.js` (nuevo) — persistencia JSON simple por jobId, sin Mongo
- `server.js` — jobId viaja por todos los endpoints del pipeline, cada uno guarda su etapa
- `sheets.js` — columna 11 "Guion" en la hoja + `leerHistorial()`
- `public/app.js` / `index.html` — banner "Continuar donde quedó" (recupera guion/fragmentos/audio exactos sin regenerar), panel de historial con tarjetas neobrutalism expandibles

Verificado en browser real: reload + recuperar job restauró guion de 206 palabras sin llamar a Gemini de nuevo.

**Para retomar en otra máquina:**
```bash
cd farandula-video-generator
git checkout test-persistencia
git pull
npm install   # ffmpeg-static no venía instalado, requerido para levantar server.js
node server.js   # o npm start — puerto 3000
```

## Bloque B completo (2026-07-16)

UI ya NO es wizard: los 6 pasos viven siempre en el DOM dentro de `.steps-grid` (`public/index.html`), grid 2 columnas desktop / 1 columna móvil (breakpoint 900px, `public/style.css`). Cada tarjeta tiene `data-status="locked|active|done"` controlado por `setStepStatus()` en `public/app.js` — locked = `pointer-events:none` + gris + badge ⏳, active = badge 🔓 + sombra, done = borde verde + badge ✅. `showSection()` (wizard viejo) fue eliminado; el progreso/errores ahora viven en una barra flotante (`showProgress()`/`hideProgress()`) fija al fondo que no tapa el grid. Verificado en browser real: flujo completo lectura→ángulo con estados y barra flotante funcionando.

## Bloque C completo (2026-07-16)

Rehacer un paso ya completado (editar y reenviar, ej. releer fuente con guion/audio ya generados) ahora invalida y re-bloquea automáticamente todo lo posterior. `STEP_ORDER` + `lockFrom(stepId)` en `public/app.js` — se llama al INICIO de `leerFuente()`, `handleGenerateScript()`, `aprobarGuion()` y `regenerarAudio()`, antes de la llamada a la API, bloqueando ese paso y todos los siguientes + ocultando `result-section` si estaba visible. Como los pasos "done" no tienen `pointer-events:none` (solo los "locked" lo tienen), el usuario ya podía reenviar un paso anterior — lo que faltaba era esta invalidación en cascada. `otroSesgo()` se simplificó para reusar `lockFrom` vía `leerFuente()`. Verificado en browser real: releer fuente con guion ya generado bloqueó guion/revisión/audio/destino al instante (antes de que terminara la nueva lectura) y los reactivó correctamente al completar.

## Bloque D completo y verificado (2026-07-17)

Objetivo: `historial.json` (rotación de clips) y `data/jobs.json` (jobs Bloque A) viven solo en el
disco efímero de Railway — un redeploy los borra. Se agregó respaldo/restauración en Drive:

- `driveCache.js` (nuevo) — `respaldar(localPath, nombreDrive)` sube/actualiza el archivo en la
  carpeta caché de Drive; `restaurar(localPath, nombreDrive)` lo trae de vuelta SOLO si el archivo
  local no existe o está vacío (nunca pisa progreso reciente). Preferencia OAuth (misma cuenta que
  sube renders), con fallback al Service Account si no hay OAuth configurado en el `.env` local.
- `drive.js` — export agregado de `getDrive`/`getDriveOAuth` (antes privados) para que `driveCache.js`
  los reuse.
- `seleccion.js` — `guardarHistorial()` ahora llama `driveCache.respaldar()` fire-and-forget.
- `jobStore.js` — `guardar()` (usado por `crearJob`/`actualizarJob`) ídem con `jobs.json`.
- `server.js` — al arrancar, `driveCache.restaurar()` para ambos archivos antes de `app.listen`.

**⚠️ OJO carpeta**: el ID `1irTudEARQWOrJr3y911Hwl_1VbvQqNP5` que se pensó usar es `Redes_Canales`
MISMO (la raíz que ya comparte renders/audios/recursos), NO una subcarpeta — confirmado con
`files.get`. Se creó una subcarpeta dedicada **`cache-estado`** dentro de Redes_Canales
(id `1s0OXuermFR4_DbNZP3gWFYDAV1xvf5ct`) y `driveCache.js` usa ESE id como default
(`GOOGLE_DRIVE_CACHE_FOLDER_ID` la puede sobreescribir).

**⚠️ REQUISITO DE PERMISO (hallado y resuelto 2026-07-17)**: si una máquina no tiene las variables
`GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN` en su `.env` local (p.ej. esta Mac no las tenía),
`driveCache` cae al Service Account — y el Service Account NO tenía acceso a `cache-estado` (a
diferencia de `renders`/`recursos`/`famosos`, que sí están compartidas explícitamente). Daba
`File not found` sin loguear nada (bug de silencio ya corregido: `restaurar()` ahora loguea
`ℹ️ ... no existe todavía en la carpeta caché` cuando el archivo no aparece). **Fix aplicado**:
se compartió `cache-estado` como Editor con `farandula-generator@n8n-automatizacion-chismex.iam.gserviceaccount.com`
desde Drive UI. Si se despliega a Railway sin las variables OAuth configuradas ahí, este mismo
permiso sobre `cache-estado` es lo que hace que el fallback a Service Account funcione igual.

**Verificado end-to-end (2026-07-17, en la Mac)**:
1. `respaldar()` — confirmado antes (Windows): sube/actualiza `jobs.json` en `cache-estado`.
2. `restaurar()` — borré `data/jobs.json` local, reinicié `node server.js`, el arranque lo trajo
   solo de Drive antes de que la app lo necesitara (log `♻️ Restaurado desde Drive: jobs.json`),
   con el contenido más reciente subido desde la sesión de Windows. Ciclo completo funciona.

Los 4 bloques (A/B/C/D) están completos en `test-persistencia`. Pendiente: decidir cuándo mergear
a `main` (regla: solo cuando el usuario confirme que todo funciona óptimo, ver memoria
`farandula_test_version_rule`).

## Despliegues en Railway (2 proyectos distintos, variables independientes)

- **`farandula-insumos`** (producción, repo `farandula-insumos` rama `main`) —
  `https://farandula-insumos-production.up.railway.app`
- **`generous-empathy`** (staging, entorno `test-persistencia`) — 3 servicios, redeploy
  automático en cada push a `test-persistencia` de cada repo:
  - **`adventurous-reflection`** = este repo (`farandula-video-generator`), rama
    `test-persistencia` — `https://adventurous-reflection-test-persistencia.up.railway.app`
    (nombre auto-generado por Railway, no se renombró)
  - `farandula-insumos` (Sleeping) y `farandula-video-genera...` (Sleeping) — servicios
    duplicados/sin uso dentro del mismo proyecto, no confundir con `adventurous-reflection`
    que es el que SÍ está activo

⚠️ Las variables de entorno (API keys, `GOOGLE_OAUTH_REFRESH_TOKEN`, etc.) son independientes
por servicio — actualizar una NO propaga a las demás. Si se regenera el refresh token OAuth
(pasa cuando da `invalid_grant` — expiró o fue revocado), actualizar en las 4 ubicaciones:
`.env` local de ambos repos + `farandula-insumos` (Railway) + `adventurous-reflection` (Railway).

## Pendiente Verificar (Railway Live — main, sin tocar por ahora)

- [ ] Redeploy de Railway → youtube-dl-exec postinstall descarga binario linux yt-dlp
- [ ] Test video real TikTok/IG (Instagram a veces pide cookies)

## Sesiones recientes

### 2026-08-08 (Windows, noche) — Fase 7, iteración de subtítulos, multifuente UX, fix real de producción

Estado detallado en **[estado-vivo.md](estado-vivo.md)**, sección "continuación — noche".
`test-persistencia` en `2cc1db0`. Resumen:

- **Fase 7 completa parcial** (`6682624`): transiciones `xfade` (16 tipos + aleatorio) con
  corrección de solapamiento y ajuste de `CLIP_MAX`, ease-out cúbico en el zoom. Bug real
  encontrado probando "alternado" (NVENC deja timebases que `concat` no reconcilia antes del
  siguiente `xfade`) — arreglado re-normalizando `fps=30` en cada etapa. Faltó `setpts`
  (rampas de velocidad) y transiciones deformadas — fuera de alcance, fase ya grande.
- **Subtítulos, varias vueltas sobre resultado real** (`8729022`→`8b52364`): terminó en UNA
  palabra a la vez, catálogo de 9 tipografías (Anton por defecto), mayúsculas, 264pt, más
  abajo en pantalla, preview arrastrable en el Paso 6 (mockup a escala, tipografía real vía
  Google Fonts solo para esa vista previa), y la puntuación convertida en PAUSA silenciosa en
  vez de mostrarse (idea del usuario).
- **Multifuente** (`c29c88c`): botón partido en "Agregar fuente" / "Ya, procesar fuentes"
  (antes uno solo hacía las dos cosas), límite 3→6.
- **Fix real de producción** (`2cc1db0`, encontrado por el usuario con un screenshot):
  `llamarJSON()` reintentaba con el MISMO modelo que acababa de fallar en vez de escalar de
  verdad — rompía la lectura de fuentes con "JSON inválido tras 2 intentos". `callGemini()`
  ahora devuelve `{texto, modelo}` para que el reintento sepa REALMENTE qué modelo probar
  después. **Pendiente portar a `farandula-video-family`** (mismo `gemini.js`).

### 2026-08-08 (Windows) — Fases 1, 2, 3 y 4 del plan maestro + protocolo de traspaso a Codex

Estado detallado en **[estado-vivo.md](estado-vivo.md)** (archivo nuevo). Resumen:

**Fase 1 — reskin neutro** (`55ae1bc`). Se fue el neobrutalism. Sistema claro con variables CSS
y `prefers-color-scheme`, un solo acento, superficie oscura fija (`#121212`) solo para los
reproductores. El fundamento no es de gusto: las guías de UI oscura la desaconsejan
explícitamente para apps con mucho texto y formularios, y esto es un flujo de texto que produce
video, no un editor de video. Los 18 estilos inline pasaron a clases utilitarias.
**Sin verificación visual** — el panel de preview no estaba desplegado, así que no hubo
compositing para screenshot. Trampa del entorno que conviene conocer: con el panel oculto,
`getComputedStyle` no refleja mutaciones de clase hechas por JS después del pintado, y eso
simula "bugs" que no existen. Se descartó con un elemento de control creado al vuelo.

**Fase 2 — fragmentación por cambio de sujeto** (`e995e37`, portada a family en `8dd764b`).
El diagnóstico del 2026-08-05 era correcto: **el prompt ordenaba el bug**. Reglas 2 y 6
reescritas, más tres cosas que no existían:
- `verificarReconstruccion()` — los fragmentos deben reconstruir el guion palabra por palabra.
  Nadie lo comprobaba y es la falla más silenciosa del pipeline: el tiempo de cada clip sale de
  su proporción de caracteres, así que si Gemini recorta una palabra **todos** los clips se
  corren respecto de la locución sin que falle nada visible. Ahora avisa en el Paso 4.
- `CLIP_MIN = 0.7` + `agruparParaClips()` — al partir más aparecen clips de ~0.3s (parpadeo).
  Se fusionan **solo con vecinos del mismo famoso**: un clip corto del famoso correcto es mejor
  que uno largo del equivocado, que es justo el bug que se estaba arreglando.
- Interfaz `FRAGMENTADORES` — puerta abierta para `ritmo` (cortes en el pulso de la música).

Verificado contra Gemini real con el truco de llamar `fragmentarGuionParrafos()` directo (~30s
por corrida): el caso del diagnóstico (83 chars, dos sujetos) ahora sí se parte, y un guion de
193 palabras da 19 fragmentos → 31 clips, media 2.10s, 0 parpadeos, ambas invariantes OK.
**No sobre-fragmenta**, que era el riesgo real.

**Fase 3 — router de modelos** (`042db6d`, portada a family en `cd25a48`). Dos cadenas en vez de
una: `creativo` arranca en el tier alto (guion, lectura), `mecanico` arranca en lite y **escala**
al tier alto si lite falla (fragmentar, marcas, nombre de archivo). La robustez es la misma: las
dos cadenas llevan los 4 modelos. `callGemini` ahora loguea `🤖 tarea → modelo`, que es lo único
que permite saber en producción si el router funciona o si todo se resuelve por fallback caro.
Mejora de paso: `llamarJSON` ya no reintenta con el MISMO modelo cuando el JSON viene
irreparable — sube un escalón, que es lo que de verdad arregla un problema de formato.

Lo que la comparación cabeza a cabeza mostró (vale la pena saberlo antes de tocar esto): con el
mismo guion, lite hace **3 cortes menos** que el tier alto. Dos son cortes que el tier alto hace
**de más** (la misma persona en las dos mitades). El tercero es *"Piqué … publicaba una historia
con Clara Chía"*: el alto lo parte y le da la mitad a Clara, lite lo deja entero como Piqué.
**Según la regla 6 del propio prompt, lite tiene razón** (Clara es complemento, no sujeto). Lite
además fue idéntico 3/3 corridas. Si algún día se prefiere el criterio del tier alto, el cambio
es mover `fragmentacion` a `CADENAS.creativo` — una línea.

⚠️ **Trampa al portar código entre repos**: copiar un bloque por rango de texto arrastró de
vuelta `agregarMarcas` a family, que estaba borrada a propósito (esa versión no usa ElevenLabs).
Quedó rota (`PROMPTS.marcas` no existe ahí) y nadie la llamaba, así que no falló nada visible.
Al portar, revisar **qué más quedó dentro del rango**, no solo que compile.

**Observación anotada sin arreglar**: si una oración no nombra a nadie, Gemini le arrastra el
famoso del fragmento anterior. No es el bug que se arregló, la alternativa no tiene respuesta
obvia, y el usuario lo corrige en el Paso 4.

**Fase 4 — multifuente + solo audio** (`8a4bc19`, portada a family en `fce9aa1`).

⚠️ **Bug preexistente encontrado y arreglado, importante para cualquiera que trabaje local en
Windows**: `youtube-dl-exec` activa `shell:true` cuando la ruta del binario tiene un espacio
(pasa en esta máquina: `D:\claude pro apps\...`). En ese modo Node NO escapa los demás
argumentos — cualquier flag con espacios (como `--output` apuntando a esta misma carpeta) se
corta en el primer espacio. `descargarAudio()`/`descargarVideo()` fallaban SIEMPRE en esta
máquina, en silencio, desde que existen — nunca se notó porque Railway no tiene espacios en su
path. Arreglado en `fuentes.js`: yt-dlp se invoca ahora con `execFile` directo (sin shell).

La fase en sí: `extraerActa()` saca hechos neutrales de UNA fuente (sesgo-independiente —
"solo lo que se dice, nunca gestos ni imagen", pedido explícito del usuario);
`sintetizarCronica()` combina 1-3 actas en una crónica. `/api/read` acumula fuentes por
`jobId` (máximo 3, rechaza la 4ta); `/api/resintetizar` cambia de sesgo sin re-descargar nada
(reemplaza lo que hacía `otroSesgo()`, que volvía a bajar y subir el video entero). YouTube:
transcripción (subtítulos, texto puro) → audio → Gemini lee la URL directo → video completo
(último recurso) — cada escalón que falla cae al siguiente, no aborta.

Verificado con un link real de Instagram (lo pasó el usuario): descarga de audio, acta correcta,
crónica sintetizada. Multifuente probado por HTTP contra el servidor local: 3 fuentes
acumuladas incorporando cada dato nuevo y resolviendo una contradicción entre fuentes con
naturalidad, 4ta rechazada. Resíntesis: 3.8s sin descargas contra 14.4s con descarga, confirmado
en el log ("sin re-descargar", sin línea de audio). YouTube: transcripción y audio están
bloqueados AHORA MISMO por el anti-bot de YouTube (externo, cambia con el tiempo) — pero el
fallback a Gemini-directo se probó real: degrada exactamente al comportamiento que la app ya
tenía antes de esta fase, sin romper nada.

**Pendiente**: nada a medio hacer. Sigue la Fase 5 (fuente de tiempos intercambiable).


### 2026-07-19 (Windows) — Fragmentación por oración, efectos, robustez Gemini, reconciliación con la Mac

**Fragmentación por oración + multi-clip dinámico** (`gemini.js`):
`fragmentarGuionParrafos` ahora segmenta **1 oración exacta por fragmento** (antes agrupaba 1-3).
Combinado con `CLIP_MAX=3` (`seleccion.js`, ya existía), las oraciones largas se reparten solas en
2-4 tomas de ≤3s y las cortas quedan como clip único breve. Verificado en render real (Shakira,
10 fragmentos/28 clips): oración de 29 caracteres → 1 toma de 1.6s; oración de 188 caracteres →
4 tomas de ~2.6s.

**Efectos zoom (Ken Burns) + espejo** (`video.js`, `server.js`, `public/index.html` Paso 6):
`decidirEfecto(preset, index)` + `filtroZoom(direccion, pct, duracionClip)` — 4 presets cada uno
(todos/alternado/intercalado/ninguno), zoom activo **toda** la duración del clip vía `zoompan`
(no Ken Burns de imagen fija). Verificado visualmente extrayendo frames del render real: zoom
progresivo confirmado (framing se cierra sobre el sujeto a medida que avanza el clip).

**⚠️ Estos efectos SOLO estaban en este repo — `farandula-insumos` (repo hermano) nunca los tuvo**
porque tiene su propio `exportar.js` (corta clips individuales para edición manual, no compone un
video final). El usuario lo notó después: "los insumos salen con cortes planos, sin zoom ni
espejo". Se portaron `decidirEfecto()`/`filtroZoom()` a `farandula-insumos/exportar.js`,
`/api/exportar` ahora acepta `efectos` en el body, y este repo's `public/app.js` (frontend
compartido) ahora manda `efectos` también en el flujo de insumos (antes solo en `/generate-video`).
Verificado igual: zoom + espejo confirmados en clip exportado por `exportarInsumos()`.

**Reconciliación con 5 commits de la Mac** (mismo día, ver protocolo arriba): la Mac ya había
rediseñado la UI (iconos Phosphor, tipografía Inter/Space Grotesk, layout `.layout-cols`
Procesos/Productos, historial compacto). Se descartaron los cambios UI locales en conflicto
(`app.js`/`index.html`/`style.css`), se hizo `git pull`, y se reaplicaron sobre esa base: pasos en
carrusel horizontal (un paso a la vez, flechas + "Paso X de 6" — decisión explícita del usuario
tras ver una versión con "peek" del siguiente paso), controles de zoom/espejo en Paso 6, y
"Resultado de la lectura" movido de arriba-de-todo a la columna Productos (es un producto del
paso 1, no un header). Bug real encontrado 2 veces en el camino: un hijo con `overflow-x:auto`
dentro de una columna CSS grid/flex necesita `min-width:0` en el padre o expande la columna entera
a su ancho de contenido — pasó primero con `.col-procesos` (1760px) y de nuevo al agregar el
carrusel.

**Robustez de Gemini** (`gemini.js`, ambos repos): un 400/404 de la API ya NO aborta la cadena de
`MODELOS` — los alias `-latest` rotan su destino (ahora hacia gemini-3.x) y una misma request
puede dar 400 en un modelo y funcionar en el siguiente. Solo 401/403 (auth) son fatales. Se
captura además el mensaje REAL de la API (`error.response.data.error.message`) en vez del genérico
de axios — esto reveló la causa de fondo de un error reportado como "400" random: era
`Unsupported MIME type: text/html` al leer ciertos links de YouTube (Shorts, privados/
age-restricted, páginas de canal) que hacen que Gemini fetchee HTML en vez de leer el video.
**Fix**: si la lectura directa de YouTube falla, se descarga con `yt-dlp` y se sube por File API
(mismo camino ya probado de TikTok/IG). Un `}` extra que Gemini a veces agrega al final del JSON
(rompía el parser) también se arregló: `extraerBalanceado()` en `parsearJsonRobusto()` recorta
basura después del objeto/array top-level balanceado.

**UI — panel de progreso/log**: era `position:fixed` (barra flotante de medio-pantalla, diseño de
Bloque B). Pasó a tarjeta normal dentro de `.col-productos`, debajo de Historial; log de 300px a
110px máx. `express.static` ahora manda `Cache-Control:no-cache` en html/css/js — el navegador se
quedaba con versiones viejas y parecía que los cambios de UI no aplicaban.

**Sin verificar / pendiente para la próxima sesión**: el flujo de Insumos con un video real de
punta a punta con los efectos ya wireados (se probó `exportarInsumos()` aislado con un video de
prueba, no el flujo completo `/api/exportar` vía UI). Decidir cuándo mergear `test-persistencia`
a `main` sigue pendiente (regla: solo cuando el usuario confirme que todo funciona óptimo).

### 2026-07-20 (Windows) — Refresh token OAuth expirado (`invalid_grant`)

`GOOGLE_OAUTH_REFRESH_TOKEN` expiró/fue revocado — `invalid_grant` al generar video (falla
downloads/uploads que usan `getDriveOAuth()`; los Service Accounts no tienen cuota de Drive así
que no hay fallback funcional para esas operaciones). Regenerado con `obtener-token.js` (flujo
manual: usuario abre URL de consentimiento, autoriza, pega el code). Actualizado en **4
ubicaciones** (son independientes, ninguna se propaga a las otras — ver sección de arriba
"Despliegues en Railway"): `.env` de ambos repos local, `farandula-insumos` (Railway prod) y
`adventurous-reflection` (Railway staging `test-persistencia`, recién identificado esta sesión).
Los 4 verificados con una llamada real a Drive tras cada actualización.

**Si vuelve a pasar**: los refresh tokens de OAuth "Testing" (no "In production" en el consent
screen de Google Cloud) expiran solos a los 7 días de inactividad — si esto se repite seguido,
revisar el "Publishing status" del proyecto OAuth en Google Cloud Console y pasarlo a producción
(o agregar el usuario como "Test user" no alcanza, hay que publicar la app).

**Bug encontrado al final de la sesión, SIN arreglar todavía — para la próxima sesión**:
`audiosPendientes` (`server.js`, línea ~55) es un `Map` en memoria, sin persistencia. Cada
reinicio del server (pasó varias veces hoy por los fixes) lo vacía, y si el usuario tenía un
`audioToken` de una locución ya aprobada, `/api/generate-video` falla con `"No se encontró la
locución aprobada: regenera el audio"` aunque el audio siga bien generado — solo se perdió la
referencia en memoria. Workaround inmediato: volver a Paso 5 y re-aprobar la locución (genera
token nuevo). **Fix real pendiente**: persistir `audiosPendientes` en disco (mismo patrón que
`jobStore.js` usa para el resto del job — Bloque A) para que sobreviva un restart del server.
El usuario pidió esto explícitamente, no se llegó a implementar antes de la pausa.

### 2026-07-21 (Mac) — Fix REAL del crash zoompan -22 + fallback por segmento

El fix anterior (`d=duracionClip`) NO sirvió: el crash `-22 (Invalid argument)` volvió en
Railway. **Causa raíz encontrada reproduciendo con ffmpeg real**: `zoompan` exige que `d`
sea un ENTERO de frames. `d=${duracionClip}` es un decimal (ej. `d=2.456`) → ffmpeg estricto
(Railway) lo rechaza con -22. (El ffmpeg-static local es tolerante y lo truncaba, por eso no
crasheaba acá — se confirmó probando variantes en /tmp con testsrc.)

**Recorrido de valores de `d`**: `d=1` (suave, correcto) → `d=frames` (congela, imagen fija)
→ `d=duracionClip` (crash -22 decimal) → **`d=1` de nuevo, el correcto**. `d=1` = 1 frame de
salida por frame de entrada; la expresión `z='1+on/frames*factor'` con `on` avanzando da el
zoom progresivo (verificado: 75 frames para clip de 2.5s, zoom 1.0→1.20).

**Fallback agregado** (`video.js` `montarVideoPlan`): si un segmento CON efectos falla al
codificar, se reintenta ESE segmento plano (sin zoom/hflip) en vez de abortar todo el render.
Así el video siempre se genera aunque el zoom falle en algún entorno/clip; el log dice
`⚠️ Segmento N falló con efectos, reintentando plano`.

**Verificado en Mac**: sintaxis OK; `d=1` produce 75 frames válidos con zoom progresivo.
El crash exacto de Railway NO se reprodujo local (ffmpeg tolerante) — **verificar en Railway**
que ahora genera con zoom. Si aún fallara, el fallback garantiza video plano igual.

### 2026-07-21 (Mac) — Botón "Recargar audio desde Drive" (Paso 5)

Permite incorporar una voz hecha/editada FUERA de la app: el usuario sube su `audio.mp3`
a la carpeta de insumos del job en Drive, y el botón lo baja y lo deja aprobable sin pasar
por ElevenLabs.

- `server.js` — `recuperarAudioDeDrive(job, force)` ahora acepta `force`: borra la copia
  local cacheada y re-baja (el usuario reemplazó el archivo). Endpoint nuevo
  `POST /api/recargar-audio {jobId}`: baja el audio.mp3 con force, mide duración con
  ffprobe, crea token nuevo en el Map + actualiza el job (`modelo: 'drive'`).
- `public/index.html` — botón `btn-recargar-audio` + nota en Paso 5.
- `public/app.js` — `recargarAudioDeDrive()`: llama al endpoint, actualiza reproductor,
  token y estados de paso (invalida destino, igual que regenerar).

**Verificado en Mac**: botón presente en DOM + función definida + endpoint valida jobId y
existencia del job. La descarga real necesita un job con audio.mp3 en su carpeta + OAuth
(no probado e2e acá). **Alcance elegido por el usuario**: solo audio (no guion/fragmentos).

### 2026-07-21 (Mac) — Recuperación de audio desde Drive (fix del bug audiosPendientes)

**Problema** (pendiente desde 2026-07-20 Windows): `audiosPendientes` era un `Map` en
memoria. Al reiniciar el server (o redeploy Railway) se vaciaba, y aunque el `audio.mp3`
seguía respaldado en Drive, se perdía la referencia → `/api/generate-video` fallaba con
"No se encontró la locución aprobada: regenera el audio". El usuario tenía que regenerar
la voz aunque ya existía.

**Hallazgo clave**: el `audio.mp3` YA se respaldaba en la carpeta de insumos de CADA job
(la carpeta se crea en el paso de lectura, server.js:226, tanto en modo Video como
Insumos). El token + duracion + modelo YA se persistían en `jobs.json` (server.js:406).
Solo faltaba la RECUPERACIÓN: nadie bajaba el mp3 de Drive cuando el Map estaba vacío.

**Fix (de raíz, no toca el flujo feliz)**:
- `drive.js` — `descargarDeInsumo(carpetaId, nombre, destPath)` (nuevo): baja un archivo
  BINARIO (mp3) a disco. `leerDeInsumo` existente NO servía: decodifica a texto/JSON y
  corrompía el mp3.
- `jobStore.js` — `buscarPorAudioToken(token)` (nuevo): halla el job dueño de un token.
- `server.js` — helper `recuperarAudioDeDrive(job)`: baja `audio.mp3` de la carpeta de
  insumos a `temp-videos/audio_recuperado_{jobId}.mp3` (cachea si ya existe). Usado como
  fallback en 2 lugares:
  - `/api/audio/:token` (ahora async): si el Map se vació, busca job por token, recupera
    de Drive y REPUEBLA el Map. El `<audio>` del Paso 5 vuelve a sonar al retomar.
  - `/api/generate-video`: si no hay audio en memoria ni en disco, recupera del job por
    `jobId` antes de dar el error.

**Verificado en Mac**: server bootea limpio (Drive conectado); token falso a
`/api/audio/:token` ejecuta el fallback sin crashear y devuelve 404 correcto
(job no existe → recuperar retorna null → 404). El camino de descarga exitosa NO se
probó e2e acá (necesita un job real con audio.mp3 en su carpeta + OAuth; esta Mac no
tiene las vars OAuth). **Pendiente verificar en Railway staging**: retomar un job viejo
y generar video sin regenerar audio.

### 2026-07-20 (Mac) — Bug fix: zoompan filter (Bloque E video composition)

**Problema**: Al generar video con zoom activo ("Intercalado in/out", 20%), FFmpeg fallaba con `libx264 error -22 (Invalid argument)` + "Nothing was written into output file".

**Causa**: `filtroZoom()` en `video.js` línea 383 pasaba `d=1` (procesar 1 frame solamente). FFmpeg `zoompan` espera `d` en **segundos**, no frames. Resultado: 0 frames reales para codificar → output vacío → crash libx264.

**Fix**:
- `video.js` línea 383: Cambio `d=1` → `d=${frames}` (primera corrección)
- Luego cambio `d=${frames}` → `d=${duracionClip}` (segunda corrección) — FFmpeg `zoompan` toma duración en segundos, no cantidad de frames

**Verificado**: Código compila sin errores. Clip duracionClip (1.5-4s) y frames (45-120) ahora coherentes con zoom lineal en toda la toma.

**Commit + push**: Dos commits separados (7c6b0d9, df3d501). Railway redeploya automáticamente.

**Pendiente**: Verificar flujo e2e en Railway — generar video con zoom active debería procesar sin congelarse.

### 2026-07-20 (Mac) — Bloque F: botones presionados durante procesos (evita doble-click accidental)

**Problema**: usuario presionaba botón 2 veces porque no notaba la pantalla de progreso (banner negro con letras verdes). Botones volvían a activarse, causando duplicación de procesos.

**Solución**: botones ahora se quedan "presionados" (disabled + opacity 0.6) durante todo su proceso, se reactivan cuando termina (éxito o error).

**Cambios**:
- `public/index.html` — agregué IDs a 9 botones: `btn-read`, `btn-generate-script`, `btn-approve-guion`, `btn-regenerate-guion`, `btn-confirm-assignments`, `btn-approve-audio`, `btn-regenerate-audio-v3`, `btn-regenerate-audio-v2`, `btn-generate-video`.
- `public/app.js` — función helper `setButtonDisabled(buttonId, disabled)` que deshabilita el botón + cambia opacity (0.6 deshabilitado, 1 habilitado). Todas las funciones async ahora deshabilitan su botón al inicio y lo habilitan en el `finally` (garantiza re-habilitación incluso con error).
- Funciones modificadas: `handleRead()`, `handleGenerateScript()`, `aprobarGuion()`, `confirmarAsignaciones()`, `regenerarAudio()` (deshabilita ambos botones de audio), `aprobarAudio()`, `regenerarGuion()` (hecha async), `handleGenerateVideo()`.

**Verificado en browser**: botón correcto se deshabilita (opacity 0.6) durante proceso y se reactiva (opacity 1) al terminar, incluso si hay error.

**Commit + push**: hecho a `test-persistencia`. Railway redeployará automáticamente.

**Pendiente**: none. Cambio está listo para verificar en Railway.

### 2026-07-20 (Mac) — Bloque E: rediseño visual completo

**Iconos Phosphor self-hosted** (34 SVG, bold weight): descargados desde CDN Phosphor, embebidos
en `public/icons.js` (nuevo) como constante `ICONS = {...}` + helper `icon(nombre, extraClass)`.
Reemplazan emoji en casi toda la UI (`videoCamera`, `scissors`, `article`, `microphone`,
`listChecks`, etc.) — excepto `<select>` de sesgo (nativo no permite iconos) y log-box (intención
de estilo terminal con emoji). Cross-verificado con `grep`: todos los `data-icon`/`icon('...')`
del código existen en `icons.js`, ninguno falta.

**Tipografía propia** (Google Fonts self-hosted): Space Grotesk (títulos) + Inter (texto),
variable-font `.woff2` descargados en `public/fonts/` (2 archivos: 22KB SpaceGrotesk + 48KB Inter).
CSS `@font-face` referencia local, sin CDN en producción. Variable-font: Google sirve UN SOLO
archivo `.woff2` para ambos weights (400/700 en Inter, 500/700 en SpaceGrotesk), economiza
descargas.

**Palanca de modo** (reemplaza 2 botones): `.modo-switch` neobrutalista con thumb deslizante
(`transform: translateX(100%)` bajo `[data-modo="insumos"]`), botones full-width bajo el thumb
con `pointer-events: auto`, label visual clara. Funciona en ambas direcciones.

**Panel "Productos"** (columna derecha, sobre Historial): 3 casillas (`producto-slot`) —
Guion/Audio/Video — con status `data-status="pendiente"|"listo"`. Opacas/dim por defecto
(opacity 0.4, grayscale 65%), se encienden a color pleno con borde verde (#2f8f2f, shadow) cuando
status="listo". Contenido real: extracto texto (guion), `<audio controls>` nativo (audio),
`<video>`/link (video). Se apagan auto al rehacer un paso anterior vía `lockFrom()` extendido con
`resetProductoSlot()`.

**On/off scroll-snap system** (quita badge "👉 Viendo"): nuevo `observarSnap()` por distancia al
centro (reemplaza IntersectionObserver) en `public/app.js`. El bloque centrado en Procesos/Historial
queda `.snapped` (encendido: opacity 1, filter none, borde azul, shadow fuerte); resto opaco
(opacity 0.45, grayscale 55%). Garantiza SIEMPRE exactamente 1 elemento encendido.

**Historial compacto**: tarjetas apiladas (título + fecha/protagonista/canal en fila), auto-load
sin botón, 1 tarjeta visible + ~30% peek de la siguiente. Botones copiar para título/guion usan
iconos.

**Verificado en browser local** (rama `test-persistencia`): switch bidireccional, badges de paso
con icono+texto (⏳/🔓/✅ → hourglass/lockOpen/checkCircle), casillas de producto en ambos estados
(opaco y lit con contenido mock), sin errores de consola nuevos.

**READMEs actualizados**: README.md + README-ECOSYSTEM.md documentan Bloque E en "Rama de prueba"
y "Próximas mejoras" (5 bloques A-E completos, pendiente merge a `main`).

**Pendiente**: merge `test-persistencia` → `main` (esperando confirmación del usuario que todo
funciona óptimo en test-persistencia). Railway actualmente deploya `main` (versión vieja sin Bloque
E), por eso adventurous-reflection muestra botones normales en lugar de palanca — el redeploy
automático ocurrirá al mergear.

### 2026-07-22 (Mac) — Evolución del generador de guiones (modo iteración/conceptualización)

**Objetivo**: mejorar el generador de guiones para producir variantes más viralizables en TikTok,
no limitado a 5 ángulos fijos sino explorando "caminos más viralizables" según contexto + literatura.

**Visión (3 capas, diseño arquitectónico — SIN implementar todavía)**:

1. **Capa de Literatura** (base de conocimiento): textos consolidados sobre viralidad en TikTok
   + farandula, actualizado, con buenas reseñas. Fuentes: libros (ej. "Contagious" Jonah Berger),
   papers académicos sobre TikTok+algoritmo, blogs actuales (Hootsuite, Think With Google). El
   usuario mencionó acceso a **zepl.films** (curso de guion cinematográfico de Nicolás Amelio-Ortiz)
   que quiere sintetizar — video-only sin transcripts descargables. **Opción propuesta**: Puppeteer
   que navega sesión autorizada, captura pantalla de cada lección, Claude Vision sintetiza 5 puntos
   clave por lección, compila en documento reutilizable.

2. **Capa de Generador mejorado** (propone + rankea + flexible):
   - Lee noticia/contexto
   - Consulta base de literatura + grafo (ver capa 3) para explorar qué patrones funcionan
   - Genera 5 variantes (NO solo 5 ángulos fijos del prompt actual) ordenadas por viralidad predicha
   - Usuario elige 1-3 opciones independientes (o combina elementos de varias, o personaliza)
   - Cada opción elegida se convierte en video (igual a hoy: texto → audio → video)

3. **Capa de Grafo incremental** (futuro monitor de noticias): dos fuentes alimentan el grafo:
   - **Literatura**: patrones narrativos consolidados extraídos de textos
   - **Noticias/Guiones generados**: usuario carga noticias (manualmente) o la app los genera;
     se "compactan" en grafo (extrae entidades: personas, eventos, relaciones; patrones narrativos
     que funcionaron). Sistema crece con el tiempo.

**Pregunta técnica abierta**: ¿Cómo calcular "viralidad predicha" en el ranking? Combinación de
literatura ("este patrón explota Gen Z", etc.) + grafo ("este contexto + patrón ganó 3 veces en
últimas 2 semanas"). Pendiente detalle en próxima sesión.

**Decisiones del usuario confirmadas esta sesión**:
- Agregar literatura (acepta sugerencias, busca textos más actuales posible)
- NO limitarse a 5 ángulos (explorar caminos viralizables)
- Ranking de 5 opciones por viralidad
- Opción de elegir 1-3 independientes, combinarlas o personalizar
- Monitor de noticias separado (tool independiente)
- Grafo crece con: noticias cargadas + links + guiones generados

**Pendiente primer paso**: extraer síntesis de zepl.films (Puppet + Claude Vision). User decidirá
si comenzamos ahí o primero documentamos literatura/patrones en grafo. Sin implementar até que user
confirme dirección.

### 2026-07-25 (Windows) — Consolidación: modo Insumos ya NO depende de un servicio separado

Contexto: el usuario quiere **un solo programa en producción** (antes: 2 servicios Railway
independientes, `farandula-video-generator` main + `farandula-insumos` aparte). El frontend
compartido ya tenía un switch visual Video/Insumos, pero por debajo `BACKENDS.insumos` apuntaba a
una URL externa (`farandula-insumos-production...`) — no estaba unificado en el código, solo en la UI.

**Port hecho** (detalle completo del código en el commit `4e8550c`):
- `exportar.js` (nuevo, en este repo): `exportarInsumos()` portado desde `farandula-insumos`,
  reusa los helpers de `video.js` (`ffmpeg`/`detectarEncoder`/`argsEncoder`/`decidirEfecto`/
  `filtroZoom`, ahora exportados) en vez de duplicarlos.
- `server.js`: nuevo `POST /api/exportar`. Más simple que el original de `farandula-insumos`:
  no pide `canalId`/`canal` en el body — usa `job.carpetaInsumoId` (ya fijado en `/api/read`,
  Paso 1), así que exportar ya no vuelve a preguntar destino a nivel de datos (aunque la UI de
  Paso 6 lo sigue mostrando por ahora — queda ignorado por el server, ver "pendiente" abajo).
- `public/app.js`: `BACKENDS.insumos` → `window.location.origin`. `FLUJO.insumos` unificado con
  `FLUJO.video` (mismos endpoints `/fragment` y `/generar-audio`, que ya eran genéricos — no le
  importaba a esos endpoints si el resultado final era 1 video o N fragmentos). Se eliminó la
  necesidad de un `/api/asignar` separado. Fix de paso: la llamada a `/exportar` mandaba `parrafos`
  (nombre viejo) y nunca mandaba `jobId` — tal como estaba, jamás hubiera funcionado ni siquiera
  contra el servicio viejo con el `server.js` nuevo.

**Verificado DOS VECES, no solo unitario**:
1. Por API directa (curl, job sintético): 30 fragmentos + locucion.mp3, zoom+espejo confirmados
   visualmente en frames extraídos.
2. **Por la UI real, click por click** (cambiar a modo Insumos, elegir canal, pegar texto, leer,
   elegir ángulo, aprobar guion, confirmar asignaciones, aprobar audio, setear efectos, exportar):
   13 fragmentos exportados correctamente, link de Drive válido, mensaje "🎉 ¡Insumos listos!".
   Carpetas de prueba de ambas verificaciones borradas de Drive al terminar.

**Bug preexistente encontrado de paso** (no es de esta sesión, sin arreglar): `decidirEfecto
('intercalado', i)` en `video.js` devuelve `activo:true` para TODO índice — el comentario dice
que en espejo debería equivaler a `alternado`, pero el código no lo hace (mirror queda en TODOS
los clips con preset "intercalado", no alternado).

**Gap encontrado**: faltaba `GOOGLE_DRIVE_INSUMOS_FOLDER_ID` en el `.env` local de esta máquina
(Windows) — no estaba documentado en ningún README. Se dedujo consultando el padre de una carpeta
de canal conocida vía Drive API y se agregó al `.env` local (no se sube a git, avisar a la Mac que
también lo necesita si corre esto local).

**Cerrado el mismo día — merge a `main` + apagado del servicio viejo (2026-07-25)**:
- `test-persistencia` → `main` mergeado (fast-forward limpio, sin conflictos, commit `df5996b`).
  `main` y `test-persistencia` quedaron en el mismo commit.
- Topología real de Railway (aclarada esta sesión, corrige confusión anterior): proyecto único
  `generous-empathy`, 2 entornos — **production** (`farandula-video-generator` service, dominio
  `farandula-video-generator-production.up.railway.app` = la app real que el usuario usa a
  diario) y **test-persistencia** (`adventurous-reflection`, staging). Cada entorno tenía TAMBIÉN
  un servicio separado `farandula-insumos` (el viejo backend aparte, dominio
  `farandula-insumos-production.up.railway.app`) — dos despliegues por entorno, cuatro en total.
- Al desplegar el merge en `farandula-video-generator-production`, faltaba la variable
  `GOOGLE_DRIVE_INSUMOS_FOLDER_ID` (nueva, nunca la tuvo ese servicio) — agregada
  (`1TpsxFGmeZU4ot9fG9CzcLM3dpCu0Qi4x`), verificado `/api/canales` 200 tras el redeploy.
- **Servicio `farandula-insumos` de producción APAGADO** (borrado desde Railway UI) — confirmado
  con `curl`: `farandula-insumos-production.up.railway.app` da 404, `farandula-video-generator-
  production.up.railway.app` sigue sano (200). El de `test-persistencia`/`adventurous-reflection`
  (staging) sigue como estaba, sin tocar — decisión de apagarlo pendiente, aparte.

**Pendiente real que queda**:
- Limpieza de UX menor: Paso 6 en modo Insumos sigue pidiendo "selecciona destino" aunque ya no
  se usa para nada (el server ignora ese valor) — podría simplificarse a un solo botón de
  confirmación sin selector, ya que el canal se elige una sola vez en Paso 1.
- El servicio `farandula-insumos` DENTRO del entorno `test-persistencia` (staging) sigue
  desplegado (Sleeping) — nadie lo usa tampoco, pero no se apagó esta sesión (menor prioridad,
  es staging no producción).

### 2026-07-27 (Windows) — Refresh token OAuth expirado otra vez + fix de concurrencia + apagado del `farandula-insumos` de staging

**Refresh token `invalid_grant` de nuevo** (tercera vez, ver sesiones 2026-07-20/21): esta vez
el proyecto OAuth YA estaba en "En producción" en Google Cloud Console (el usuario lo confirmó
en el momento), así que la causa NO fue el vencimiento de 7 días de "Testing" — el token se
invalidó por otra razón (revocación manual, límite de tokens del cliente, etc., sin confirmar
cuál). Regenerado con el mismo flujo de siempre (URL de consentimiento → código → intercambio).
Como el servicio `farandula-insumos` de producción ya está apagado (sesión 2026-07-25), esta vez
solo hubo que actualizar en **3 lugares** (antes eran 4): `.env` local, Railway
`farandula-video-generator` (producción) y Railway `adventurous-reflection` (staging,
`test-persistencia`). Verificado con `curl` real a `/api/canales` en los 3 — los 3 devuelven
231 carpetas de Famosos correctamente.

**Fix de concurrencia en `limpiarTemporales()`** (`video.js`): un job terminando (éxito o error)
borraba TODOS los `src_*.mp4` cacheados (caché de clips fuente, compartido entre jobs a
propósito para no re-descargar el mismo clip de Drive en cada video). Si dos generaciones
corrían cerca en el tiempo, la que terminaba primero borraba los clips que la otra acababa de
descargar y estaba por leer con ffmpeg → `Error opening input file ... No such file or
directory`. Reproducido en vivo en `adventurous-reflection` (screenshot del usuario). Fix:
`limpiarTemporales(jobId)` ya no toca `src_*` — solo borra archivos que empiezan con el
`jobId` de ESE render. La limpieza de `src_*` por antigüedad la sigue haciendo
`limpiarCache()` (TTL 1h) en `server.js`, que sí filtra correctamente por actividad reciente.
Commit `ec79935` en `test-persistencia`, pusheado y verificado (SHA remoto = SHA local).
Railway redeployó `adventurous-reflection` automáticamente.

**Apagado el `farandula-insumos` de staging** (el que quedaba pendiente desde la sesión
2026-07-25, ambiente `test-persistencia`): confirmado por el usuario que era un duplicado mal
configurado — mismo repo `farandula-video-generator` pero con la rama `main` conectada en vez
de `test-persistencia`, sin tráfico (Sleeping). Apagado desde Railway UI (Settings → Danger →
Remove Service). En `test-persistencia` solo queda ahora `adventurous-reflection` (activo,
rama correcta).

**Contexto aparte (otro repo, mencionado aquí para que quede registrado)**: se creó
`farandula-video-family` (repo nuevo, proyecto Railway nuevo) — versión para los hermanos del
usuario, sin ElevenLabs (suben su propio MP3), sin escritura a Drive (todo se descarga local,
ZIP para insumos), con login/registro y PostgreSQL para historial por usuario. Reusa
`gemini.js`/`video.js`/`seleccion.js` tal cual, y un `drive.js` recortado a SOLO LECTURA
(Service Account, mismo `credentials.json` que este repo) para leer los clips de `Famosos/`.
Verificado end-to-end con datos reales de Drive: video final (MP4 1080x1920 H264/AAC) e
insumos (ZIP con `clips/` + `locucion.mp3`) ambos generados y confirmados con ffprobe/unzip.
Pendiente: desplegar a Railway (aún no tiene proyecto propio en producción).

### 2026-07-28 (Mac) — Fix: carrera en `descargarVideo()` (crash -22 en producción, distinto del bug de zoompan)

**Reportado por el usuario**: screenshot de `adventurous-reflection` (staging) al 70% de
"Generando video...", mismo log que el crash de zoompan ya arreglado (2026-07-20/21):
`Task finished with error code -22 (Invalid argument)` / `Nothing was written into output
file, because at least one of its streams received no packets`.

**Causa real (distinta a la de zoompan)**: `drive.js` `descargarVideo(fileId, destDir)` —
`fs.existsSync(destPath)` se chequeaba como "caché" ANTES de que terminara de escribirse el
archivo (`createWriteStream` + pipe). El caché de clips fuente (`src_*.mp4`) es compartido
a propósito entre jobs concurrentes (evita redescargar el mismo clip para otro video) — si
dos jobs pedían el mismo `fileId` casi al mismo tiempo, el segundo veía `existsSync==true`
mientras el primero todavía escribía, y tomaba el archivo a medio descargar como listo.
ffmpeg lo leía truncado → mismo síntoma exacto que zoompan (`-22`, 0 frames), pero sin
relación con el filtro. Como el fallback "reintentar sin efectos" (`video.js`) usa el MISMO
archivo fuente roto, también fallaba — por eso llegaba hasta el error genérico de UI en vez
del auto-reintento.

**Fix** (`drive.js`, commit `96c2e29`): descarga a un temporal único
(`.tmp-src_<fileId>-<pid>-<random>.mp4`) y `fs.renameSync()` atómico al nombre final SOLO al
terminar con éxito (con cleanup del temporal si falla). `existsSync(destPath)` ya nunca ve
un archivo incompleto.

**Verificado con Drive real** (Service Account local, sin necesitar OAuth): 5 llamadas
concurrentes a `descargarVideo()` con el mismo `fileId` real (carpeta
`Dany_Alexis_bebeshita`) → las 5 resuelven a la misma ruta, 0 archivos `.tmp-` sueltos,
mp4 final íntegro confirmado con `ffprobe` (duración correcta, ~11s). No se pudo probar
e2e en Railway (esta sesión no tiene acceso de deploy) — **pendiente confirmar que el
crash no vuelve a aparecer en staging con generaciones concurrentes reales**.

### 2026-08-05 (Windows) — Dos diagnósticos SIN implementar: fragmentación por cambio de sujeto y carpetas congeladas al retomar un job

Sesión de análisis, **no se tocó código**. Ambos hallazgos quedaron acordados con el usuario para
ejecutarse en `test-persistencia`. Estimado del primero: ~50 min.

**A) Modelos Gemini — la cadena NO está desactualizada (verificado, no re-chequear)**

El usuario vio "3.6 Flash — Nuevo" en la UI de Gemini y preguntó si la app estaba atrasada. No:
el alias `gemini-flash-latest` que ya encabeza `MODELOS` en `gemini.js` **resuelve a
`gemini-3.6-flash`**, confirmado leyendo el campo `modelVersion` de una respuesta real de la API.
Los 4 modelos de la cadena existen en la cuenta. No "actualizar" la cadena pensando que está
vieja. Único cambio defendible (opcional): fijar `gemini-3.6-flash` explícito de primero y dejar
`-latest` de segundo, para que una rotación futura del alias no cambie el comportamiento en
silencio — riesgo ya documentado en el comentario de las líneas 6-10 de `gemini.js`.

**B) Asignación de famosos por fragmento — el prompt ordena el bug**

Síntoma del usuario: los fragmentos salen casi por párrafo y, cuando la narración pasa a hablar
de otra persona a mitad del fragmento, en pantalla sigue el famoso anterior.

Causa raíz en `fragmentarGuionParrafos()` (`gemini.js`): la **regla 5** del prompt dice literal
*"Si un fragmento habla de dos famosos, elige al que tenga más peso en ese fragmento"* — o sea,
ante un cambio de sujeto le ordena NO partir sino elegir un ganador. Y la **regla 2** hace que
partir sea opcional (`puedes partirla`) y disparado por LONGITUD (>140 chars), no por cambio de
sujeto. Por eso `"Shakira apareció radiante en la alfombra roja, pero Piqué prefirió quedarse en
casa."` (83 chars, dos personas) nunca se parte: corta para la regla 2, y la 5 manda elegir uno.

Causa secundaria, silenciosa: nadie verifica que los fragmentos reconstruyan el guion. La regla 3
lo pide, nada lo comprueba. Como el tiempo en pantalla sale de `chars_fragmento / chars_total`
(`seleccion.js`), si Gemini recorta o reescribe palabras se corren los tiempos de TODOS los clips.

Plan acordado — 3 cambios, ~40 líneas:
1. Arreglar reglas 2 y 5: partir cuando cambia el sujeto, sin importar el largo.
2. Verificación de reconstrucción (~10 líneas): pegar los fragmentos y comparar contra el guion;
   loguear alerta si no coinciden. Convierte una falla silenciosa en visible.
3. Guarda de duración mínima en `seleccion.js` (~10 líneas): al partir más aparecen fragmentos de
   ~0.6s (parpadeo). Si el tiempo calculado baja de ~0.7s, fusionar con el vecino del mismo famoso.

Se evaluó y **descartó por ahora** un rediseño mayor (cortar oraciones con regex determinista y
que Gemini solo devuelva quién/dónde, nunca texto): usa exactamente el mismo juicio del mismo
modelo, solo agrega garantías estructurales. Primero probar si con la instrucción correcta el 3.6
ya lo hace bien; si desobedece o corrompe texto, ahí el rediseño queda justificado por datos.

Al probar, vigilar el efecto colateral: más fragmentos = más transiciones y SFX (`video.js` los
dispara en cada cambio de `parrafoIdx`) y más ventanas de subtítulo (`subtitulos.js`). Revisar que
hyperframes no meta un efecto de sonido en cada micro-corte. Truco para iterar rápido: llamar
`fragmentarGuionParrafos()` directo con guiones que tengan cambios de sujeto, sin correr el
pipeline completo (~30s por corrida en vez de lectura+guion cada vez).

**C) Las carpetas de famosos se congelan al retomar un proceso del historial**

Síntoma: "no está actualizando la información de las carpetas de los famosos".

NO es caché ni permisos ni paginación — se descartaron los tres: `drive.js` y `server.js` no
cachean nada (ambos consultan Drive en vivo con `pageSize: 1000`), el Service Account ve las 243
carpetas actuales incluidas las creadas el mismo día, y no hay nombres duplicados (243 archivos =
243 nombres únicos, así que el mapa `nombre → id` de `obtenerCarpetasFamosos()` no pisa ninguna).

La causa es el snapshot del job:
- `server.js:370` — al fragmentar, la lista se guarda DENTRO del job:
  `actualizarJob(jobId, { paso: 'fragmentacion', fragments, carpetas })`. Es una foto del momento.
- `public/app.js:1148` — al retomar ese job: `state.carpetas = job.carpetas || []`. Lee la foto.
- `public/app.js:512` — los desplegables de asignación se arman desde `state.carpetas`.

Entonces al retomar un proceso viejo los desplegables muestran las carpetas de ESE día; todo
famoso creado después no aparece. En procesos nuevos no pasa (lista en vivo). Se volvió visible
ahora porque el usuario viene creando muchas carpetas (12 en los últimos días).

**RESUELTO el mismo día**, por pedido del usuario, con un botón manual en vez de refresco
automático al recuperar el job:
- `server.js` — endpoint nuevo `GET /api/carpetas-famosos` (antes la lista solo volvía dentro
  del POST `/api/fragment`).
- `public/index.html` — botón "Actualizar lista de carpetas" en el Paso 4, sobre la lista de
  asignaciones, con una nota explicando para qué sirve.
- `public/app.js` — `refrescarCarpetas()`: pide la lista viva y hace la **unión** con la
  guardada y con las ya asignadas. La unión importa: si una carpeta fue renombrada o borrada en
  Drive, el fragmento que la tenía asignada no se queda sin su opción seleccionada. Las
  selecciones se conservan solas porque `sel.onchange` ya las escribe en
  `state.fragments[i].famoso` y `renderAsignaciones()` repinta desde ahí.
- Recalcula además el aviso de "protagonista sin carpeta" con el mismo criterio que el server:
  si el usuario crea justo esa carpeta en Drive y refresca, el aviso desaparece solo.

Verificado en browser real con un job simulado que tenía lista vieja (3 carpetas) y un fragmento
asignado a una carpeta inexistente en Drive: pasó a 248 opciones, conservó las dos selecciones,
mantuvo disponible la carpeta borrada, y el aviso de protagonista se apagó al aparecer `Rosalia`.

### 2026-08-05 (Windows) — Merge a `main` y despliegue en producción

Por pedido explícito del usuario ("implementalo en railway"). `test-persistencia` → `main`
fast-forward limpio (`f5b1efa`), 7 commits: los dos fixes de concurrencia (`ec79935` mío sobre
`limpiarTemporales`, `96c2e29` de la Mac sobre `descargarVideo`), el cron de limpieza de
insumos, el botón de actualizar carpetas y 3 de documentación. `main` y `test-persistencia`
quedaron en el mismo commit.

**Sin variables de entorno nuevas**: `INSUMOS_RETENCION_HORAS` es opcional (default 48) y
`GOOGLE_DRIVE_INSUMOS_FOLDER_ID` ya estaba en producción desde el 25/07.

**Truco de verificación de despliegue**: usar un endpoint NUEVO como sonda
(`/api/carpetas-famosos` en este caso) en vez de `/api/health` — health responde 200 con el
build viejo también, así que no distingue "servicio vivo" de "código nuevo desplegado". Con la
sonda se confirmó el deploy a los ~40s.

**Verificado en producción**: el endpoint nuevo devuelve las 246 carpetas incluidas las creadas
hoy; `/api/canales` 200 (Drive + OAuth sanos); el `index.html` servido trae `btn-refrescar-carpetas`
y el `app.js` trae `refrescarCarpetas` y `nota-limpieza`. Staging sigue sano.

**Ojo**: producción y staging apuntan a la MISMA carpeta de insumos en Drive, así que el cron de
limpieza ahora corre desde los dos servicios. Es inofensivo (el segundo ya no ve lo que el primero
mandó a la papelera, y `listarSubcarpetas` filtra `trashed=false`), pero no confundirse si en los
logs aparece la limpieza dos veces.

**Pendiente**: el fix de `descargarVideo` de la Mac se estrena en producción sin haber sido
verificado e2e en Railway (ver su nota del 28/07). Si vuelve un `-22`, empezar por ahí.

### 2026-08-05 (Windows) — Limpieza automática de insumos en Drive a las 48h (IMPLEMENTADO)

**Problema**: las carpetas de insumos que crea cada job (`crearCarpetaInsumo`, con guion,
`audio.mp3`, `fragments.json`, `resultado.json`) nunca se borraban. Habían llegado a **117
carpetas / 1.17 GB**, la más antigua del 12/07. El caché local (`temp-videos/`) NO era el
problema: ya se limpia solo a la hora (`limpiarCache()` en `server.js`), eran 2.5 MB.

**Decisión del usuario**: retención de 48h. Razón textual suya: *"un audio en 48 horas pierde
toda vigencia sobre todo porque hago noticias"*. Acepta explícitamente el efecto secundario de
que retomar un job de más de 48h ya no pueda recuperar su locución desde Drive.

**Limpieza manual hecha en el momento**: 103 carpetas a la papelera (1164 MB), conservando las
14 de menos de 48h. **A la papelera, nunca borrado permanente** — recuperable ~30 días.
Verificado post-borrado que `Videos_Famosos_Carpetas` (246 carpetas), `renders` y `cache-estado`
quedaron intactos. ⚠️ Al verificar, Drive devolvió un conteo equivocado (94 en vez de 14) por
**consistencia eventual**: el índice tarda en reflejar los borrados. Re-medir un minuto después
da el número real — no asumir que algo salió mal por un conteo raro recién borrado.

**Código nuevo (rama `test-persistencia`)**:
- `limpiezaInsumos.js` (nuevo) — cron cada 6h, retención 48h configurable con
  `INSUMOS_RETENCION_HORAS`. Recorre canal → job dentro de `GOOGLE_DRIVE_INSUMOS_FOLDER_ID`.
  **Guarda de seguridad**: si esa raíz coincide con `GOOGLE_DRIVE_FOLDER_ID` (famosos),
  `GOOGLE_DRIVE_RENDERS_FOLDER_ID` o `GOOGLE_DRIVE_CACHE_FOLDER_ID`, aborta sin borrar nada y
  loguea el error. La primera pasada se demora 60s a propósito: `driveCache.restaurar()` está
  trayendo `jobs.json` al arrancar y pisaría las marcas si limpiáramos de inmediato.
- `drive.js` — `listarSubcarpetas(parentId)` y `enviarAPapelera(fileId)` (Service Account con
  fallback a OAuth).
- `jobStore.js` — `marcarInsumosLimpiados(carpetaIds)`: marca `insumosLimpiados` y borra el
  `driveLink` **solo si apunta a la carpeta de insumos**. En modo Video el `driveLink` apunta al
  render (carpeta del canal, que no se limpia) y se conserva — verificado en datos reales.
- `public/app.js` + `style.css` — nota en el historial explicando por qué ya no hay link.

**Reconciliación** (`reconciliar()` dentro del cron): marca también jobs cuya carpeta ya no
existe aunque la haya borrado otra cosa (limpieza manual, o el usuario desde Drive). Sin esto,
las 103 borradas a mano habrían dejado links muertos sin explicación en Railway para siempre.

**Verificado**: servidor arranca con el cron activo; las dos guardas abortan correctamente al
apuntar a famosos y a renders; `enviarAPapelera` probado con una carpeta descartable; pasadas
sucesivas son idempotentes; en el browser real se renderizan exactamente 2 notas (los 2 jobs
afectados) y el job de modo Video conserva su link a `renders`.

**Pendiente**: no se probó en Railway. Ojo que el `jobs.json` de cada entorno es independiente,
así que la reconciliación correrá por separado en producción y en staging la primera vez.

### 2026-08-13 (Mac) — Cartel de portada: UN solo dibujo (canvas → PNG), en vez de dos que se desincronizaban

**Reportado por el usuario** con dos capturas del mismo cartel: la vista previa del Paso 6 y el
video final NO coincidían. Distintos saltos de línea (`HACE EL FEO A JD / PANTOJA` en la previa vs
`HACE EL FEO A / JD PANTOJA` en el video) y distinto ancho de caja.

**Causa de fondo**: la geometría del cartel estaba escrita DOS veces —`portada.js` (servidor, que
la dibujaba con el filtro `ass` de libass) y `public/app.js` (el mockup, que la replicaba en CSS)—
con un contrato de "si cambiás allá, cambiá acá". Peor: los dos ESTIMABAN el ancho del texto con un
`factorAncho` promedio por tipografía en vez de medirlo, y una diferencia de un carácter por línea
cambia el corte, el tamaño de letra elegido y el ancho de la caja en cascada. Había al menos tres
caminos por los que podían separarse (tabla de `factorAncho` que se llenaba por fetch y caía a
0.62 si fallaba, redondeo del tamaño a la escala chica de la previa, y `white-space: pre-line` que
deja al navegador re-partir una línea). No se pudo determinar cuál de los tres causó ESTE caso sin
saber los ajustes exactos del usuario — y no hizo falta, porque el rediseño elimina los tres.

**Rediseño (propuesto por el usuario)**: el cartel se dibuja UNA vez, en el navegador, en un
`<canvas>` de 1080x1920 (el tamaño real del video, mostrado chico por CSS). Ese canvas ES la vista
previa, y `canvas.toDataURL()` da exactamente esos píxeles como PNG, que viaja en el cuerpo de
`/api/generate-video`. El server no redibuja nada: guarda el PNG y lo superpone con `overlay` en el
frame 0 del video y, después, sobre el fotograma que el usuario elija para el JPG. Los tres
(previa, video, JPG) son literalmente el mismo archivo — la divergencia dejó de ser posible.

- `public/app.js`: `dibujarCartel()` (caja redondeada por `arcTo`, anillo blanco, texto con sombra)
  + `exportarCartelPNG()`. El ajuste de línea usa `ctx.measureText()` — **desapareció la estimación
  `factorAncho`, que era la raíz del problema**. Borrado todo el bloque duplicado
  (`portadaEnvolver*`, `portadaAjustarTamano`, `pintarCartelMockup`, `FACTOR_ANCHO_POR_FUENTE`).
- `portada.js`: de 254 a ~50 líneas. Ya no construye ASS; solo superpone el PNG.
- `video.js`: el banner pasó de filtro `ass` encadenado a una ENTRADA más de ffmpeg con
  `overlay=0:0:enable='lt(n,1)'` (n = número de fotograma, así solo pinta el primero). `argsMux`
  ahora usa siempre `filter_complex`. **La escalera de degradación se mantiene** (cartel falla →
  video sin cartel; subtítulos fallan → sin subtítulos). Bonus: al entrar por `-i` desaparece el
  escapado de rutas del filtro.
- `server.js`: `guardarCartelPNG()` (valida y decodifica la data URL), `GET /api/cartel/:token`,
  límite de `express.json` subido a 8mb, y el PNG agregado al set de archivos protegidos de
  `limpiarCache()` — sin eso el TTL de 1h lo borraría antes de que el usuario elija el fotograma.

**Riesgo que apareció al verificar, y su arreglo**: al mover el dibujo al navegador, la tipografía
pasó a depender del CDN de Google Fonts. Si no carga, el canvas dibuja con una letra de reemplazo
—y AHORA eso se hornea en el video (antes no importaba: el server lo dibujaba con libass y el .ttf
real). Se agregó `GET /api/fuente/:clave`, que sirve el MISMO `.ttf` que el server ya descarga y
cachea para los subtítulos; el navegador lo carga con la API `FontFace`. Navegador y servidor
comparten el archivo exacto y no hay CDN de por medio. Si aun así falla, se muestra un aviso
visible (no se hornea otra letra en silencio) y **solo se cachean los éxitos**, para que un fallo
transitorio de red no deje la tipografía rota hasta recargar la página.

**Verificado local, con evidencia**:
- ffmpeg, los tres caminos: sin música, con música (el índice de entrada del cartel cambia), y el
  JPG. Muestreo de píxeles: frame 0 = rosa `fd2c67`, frames 1/2/5/30/60 = fondo. El cartel está
  SOLO en el primer fotograma.
- Alineación: justo dentro de los bordes de la caja hay rosa, justo afuera hay fondo → `overlay`
  no desplaza ni escala.
- Canvas en browser real: 1080x1920 internos, caja centrada en x=540 y borde superior en y=1114 =
  exactamente el 58% de 1920, 3 renglones de texto, PNG válido de ~167KB.
- `FontFace` contra `/api/fuente/anton`: carga y mide distinto al fallback (834 vs 803 px) → usa de
  verdad el archivo servido.
- `guardarCartelPNG()`: round-trip byte a byte idéntico; rechaza null/vacío/jpeg/basura.

**Ojo para la otra máquina**: este entorno (Mac) no tiene salida a internet, así que el server no
pudo bajar los `.ttf` reales y la prueba de tipografía se hizo con un archivo del sistema puesto a
mano en `temp-videos/fuentes/` (ya borrado). La cañería quedó probada, pero **la tipografía real
del cartel no se vio renderizada acá** — vale confirmarlo visualmente en staging.

**Pendiente**: probar en Railway. Ahí el riesgo específico es `overlay` (verificado presente en el
ffmpeg local, pero es exactamente la trampa que reventó con `geq`: funcionaba local y no estaba
compilado en producción). Si faltara, la degradación hace que el video salga sin cartel en vez de
fallar, pero habría que buscar otro camino.

### 2026-08-13 (Mac) — Secuela: el cartel no salía tras el deploy (pestaña vieja) + guarda para que no vuelva a pasar en silencio

Tras desplegar el cambio de arriba, el usuario generó un video en staging y **no salió el cartel,
ni apareció la opción de generar el JPG**.

**No era un bug del código nuevo.** Se reprodujo el flujo completo local con un render real (clips
de Drive, audio, `destFolder` a la carpeta `transicion`, después borrada): la respuesta trae
`cartelUrl`, el frame 0 del MP4 tiene el rosa del cartel (`ff4366`) y los frames 1/5/30 imagen
real, y `POST /api/portada` generó el JPG y lo guardó junto al video. La cadena entera funciona.

**Causa real**: la pestaña del navegador estaba abierta desde ANTES del deploy, así que corría el
`app.js` viejo — el que manda `portadaTitular/Fuente/Tamano/Caja` y no el PNG. El server nuevo
busca `efectos.cartelPNG`, no lo encuentra, y `guardarCartelPNG()` devuelve null. Resultado: video
sin cartel, sin `cartelUrl`, sin opción de JPG, y sin ninguna pista de por qué.

**Arreglado el modo de fallo, no solo el caso**:
- `server.js`: si el pedido trae `portadaTitular` pero no `cartelPNG`, es definitivamente un front
  viejo → 400 con el mensaje de recargar la página. Antes seguía y devolvía un video mudo.
- `public/app.js`: si hay titular escrito pero `exportarCartelPNG()` devolvió null, se avisa en el
  log en vez de seguir en silencio.

**Verificado** los tres casos por API: front viejo → el 400 con las instrucciones; front nuevo sin
titular (legítimo, no quiere cartel) → pasa; front nuevo con PNG → pasa.

**Para el usuario / la otra máquina**: si el cartel no aparece después de un deploy, recargar con
Cmd/Ctrl + Shift + R antes de buscar el problema en el código.

**Cierre de sesión 2026-08-13 (Mac) — qué queda por verificar en casa (Windows)**

Todo pusheado a `test-persistencia` (`7c578ec` + `0d883e8`, SHA local = remoto). Railway redeploya
staging solo. **Antes de probar: recargar con Ctrl + Shift + R** (ver la entrada de arriba).

Pendiente de confirmar en staging, en este orden:
1. Que la vista previa del Paso 6 y el cartel del video final ahora **coincidan** — que era el
   problema original que abrió todo esto.
2. Que el cartel se vea con la **tipografía elegida** y no con una de reemplazo. Es lo único que
   NO se pudo ver renderizado en la Mac (sin salida a internet, el server no bajaba los `.ttf`;
   la cañería se probó con un archivo del sistema puesto a mano, ya borrado). Si sale con otra
   letra, aparece un aviso en pantalla — no falla en silencio.
3. Que el filtro `overlay` exista en el ffmpeg de Railway. Es la trampa que reventó con `geq`
   (funcionaba local, no estaba compilado en producción). Si faltara, la degradación hace que el
   video salga sin cartel en vez de romperse, pero habría que buscar otro camino.

No tocado y todavía pendiente de antes: merge a `main` (producción sigue con el código previo a
este cambio).

### 2026-08-14 (Mac) — Música de fondo: -18dB → -20dB

El usuario escuchó la música muy alta en el resultado. **Medido antes de tocar nada**: el `-18dB`
sí se aplicaba (se replicó la cadena exacta de `prepararMusica()` con una pista real y dio -33.2
LUFS), y las 13 pistas del catálogo están parejas (-12.8 a -16.6 LUFS), sin ninguna anómala. Con
una locución real medida en -18.1 LUFS, la separación era de 15.1 dB — o sea, no había bug.

El ajuste es de gusto, con una razón concreta del usuario: la voz de ElevenLabs se atenúa -3.4dB
por venir saturada (`elevenlabs.js`), así que la música quedaba relativamente más alta de lo
pensado cuando se eligió el -18 original. Nuevo default **-20dB** → separación de 17.1 dB
(verificado con la misma medición).

**Ojo conceptual, anotado en el comentario de `prepararMusica()`**: esta ganancia atenúa el
ARCHIVO fuente, no se mide contra la voz — la etiqueta de la UI decía "-18dB bajo la voz", lo
cual era falso, y se corrigió a "-20dB" a secas. Con el catálogo actual alcanza porque está
parejo, pero una pista futura masterizada mucho más fuerte volvería a sonar alta con el mismo
número. Si vuelve a pasar, la solución de fondo es normalizar a LUFS (`loudnorm`) antes de
aplicar el offset, no seguir bajando el número.

**Cierre de sesión 2026-08-14 (Mac) — supersede el cierre del 2026-08-13**

Los tres puntos que el "Cierre de sesión 2026-08-13" dejaba por verificar **ya están todos
confirmados** en la entrada del 13 a la noche (Windows) — no volver a hacerlos:
1. Previa vs. video final: coinciden. ✔
2. Tipografía real (Anton, no de reemplazo) en el video. ✔
3. `overlay` compilado en el ffmpeg de Railway — NO era la trampa de `geq`. ✔

**Estado ahora**: `test-persistencia` en `4933cad`, todo pusheado (SHA local = remoto). Lo último
que entró (música a -20dB) todavía **no se escuchó en un video real** — es el único pendiente de
verificación de esta sesión, y es a oído, no medible: la medición ya se hizo (17.1 dB de
separación contra una locución real).

**Pendientes reales, en orden de peso**:
1. **Merge `test-persistencia` → `main`.** Producción sigue sin NADA de todo esto: ni Fases 1-8,
   ni portada, ni el fix de yt-dlp/TikTok, ni la música a -20. Es la brecha más grande abierta.
2. Desplegar `farandula-video-family` a Railway (repo aparte, nunca tuvo producción).
3. `decidirEfecto('intercalado', i)` en `video.js`: el espejo queda en TODOS los clips en vez de
   alternar (bug preexistente, documentado hace semanas, sin arreglar).
4. `getAngleName()` en `gemini.js` es código muerto — no se llama ni se exporta, y mapea sólo
   1-6 cuando la app tiene 7 ángulos. Sobrevivió al refactor de código muerto (`64f2359`).

**Recordatorio operativo**: tras cada deploy, recargar la pestaña con Cmd/Ctrl + Shift + R. Si no,
el server responde 400 pidiéndolo (guarda agregada en `0d883e8` justamente porque este error costó
una sesión entera de diagnóstico).

### 2026-08-16 (Windows) — Fix real de producción (offset-clamp en xfade) + portado masivo a `farandula-video-family`

**Fix de producción, este repo**: el usuario mandó un screenshot con "Generando video..." pegado
en 70% y `Output file does not contain any stream`. Root-caused con `railway logs` + reproducción
local: `seleccion.js` planifica el offset de cada clip contra `v.duracion` (metadata de Drive),
pero esa metadata a veces viene `undefined` — si offset+duración se pasa del final real del
archivo, `-ss`+`-t` de ffmpeg corta en SILENCIO un segmento más corto de lo pedido (sin error,
exit 0), y ese segmento roto tira abajo el filtro `xfade` (`matches no streams`) Y su fallback de
concat plano. Fix en `video.js` (`montarVideoPlan`): re-verificar offset+duración contra la
duración REAL del archivo ya descargado (ffprobe, cacheado por ruta) antes de cortar, corriendo
el offset hacia atrás si no cabe — nunca se acorta la duración pedida, solo cambia DE DÓNDE del
video sale. De paso, el wrapper `ffmpeg()` solo guardaba los últimos 500 caracteres de stderr
(cortaba el error real de un filter_complex largo) — subido a 4000. Verificado local reproduciendo
el caso exacto; pusheado a `test-persistencia` (`1d6efdd`, mergeado con música a -20dB de la Mac
sin conflictos) y confirmado en Railway con el mismo job que había fallado.

**Portado masivo a `farandula-video-family`** (mismo día, pedido explícito del usuario con
permiso abierto para las siguientes horas): ese repo estaba congelado en el estado PRE-Fase 7.
Se portaron transiciones xfade+TANDA, zoom ease-out, EL FIX DE OFFSET-CLAMP DE ARRIBA (mismo bug,
mismo día), y el cartel de portada completo (canvas→PNG, adaptado sin Drive-write). Música de
fondo se evaluó y quedó BLOQUEADA: el Service Account de Drive no tiene acceso a `Musica/` (solo
compartido con la cuenta OAuth), y compartir la carpeta con el Service Account vía API quedó
bloqueado por el clasificador de permisos del entorno (requiere que el usuario lo haga a mano
desde Drive). Subtítulos no se evaluaron para portar: necesitan timing por palabra que sale de la
alineación de ElevenLabs, que family no tiene. Detalle completo, verificación end-to-end y
pendientes reales en `farandula-video-family/.claude/CLAUDE.md` (archivo nuevo, ese repo no tenía
bitácora propia hasta ahora).

**Cierre 2026-08-16 (Mac) — supersede el cierre del 2026-08-14**

Revisado lo que entró de Windows (`5e09c19` offset-clamp, `cc66671` portado a family). Estado y
pendientes actualizados:

- La **música a -20dB** ya está mergeada (`1d6efdd`) y desplegada en staging. Sigue **sin
  escucharse en un video real** — es lo único de esa tanda que falta, y es a oído: la medición
  ya está hecha (17.1 dB de separación contra una locución real de -18.1 LUFS).
- El cierre del 14 listaba "desplegar `farandula-video-family`" como pendiente #2. Sigue
  pendiente, pero ahora ese repo tiene mucho más adentro (transiciones, zoom ease-out,
  offset-clamp, cartel de portada). Su bitácora propia está en
  `farandula-video-family/.claude/CLAUDE.md`.

⚠️ **Riesgo nuevo que conviene tener a la vista: código duplicado entre los dos repos.** El fix de
offset-clamp, las transiciones, el zoom ease-out y el cartel viven ahora en `video.js`/`portada.js`
de LOS DOS repos, copiados a mano. Es exactamente la forma del bug que costó esta semana: la
geometría del cartel estaba escrita dos veces y se desincronizó en silencio hasta que el usuario
notó que la previa mentía. Acá el riesgo es el mismo — el próximo fix en uno no llega al otro, y
nadie se entera hasta que falla en producción. No hay que resolverlo ya (family ni siquiera está
desplegado), pero **cada arreglo en `video.js` de este repo debería preguntarse si también va a
family**, y si la lista de duplicados sigue creciendo, vale la pena evaluar extraer lo compartido.

**Pendientes reales, en orden de peso** (sin cambios de fondo desde el 14):
1. **Merge `test-persistencia` → `main`.** Producción sigue sin nada: Fases 1-8, portada,
   yt-dlp/TikTok, música -20dB, y ahora también el offset-clamp — que es un fix de un crash REAL
   de producción. La brecha lleva abierta desde el 25 de julio y ya acumula un arreglo urgente.
2. Desplegar `farandula-video-family` a Railway.
3. `decidirEfecto('intercalado', i)`: espejo en TODOS los clips en vez de alternar (preexistente).
4. `getAngleName()` en `gemini.js`: código muerto, mapea 1-6 con 7 ángulos existentes.

### 2026-08-16 (Mac) — Nuevos valores por defecto del Paso 6

Pedido del usuario con dos capturas: dejar por defecto lo que venía eligiendo a mano en cada video.

| Opción | Antes | Ahora |
|---|---|---|
| Efecto zoom | Ninguno | **Intercalado (in/out)** |
| Intensidad zoom | 20 | 20 (sin cambio) |
| Efecto espejo | Ninguno | **Intercalado** |
| Transición entre clips | Ninguna (corte seco) | **Todos los cortes** |
| Tono de música | Automático | Automático (sin cambio) |
| Tipografía subtítulos | Anton | **Bangers** |
| Tamaño de letra | 264 pt | **210 pt** |
| Posición (MarginV) | 300 | **606** |

Tocados los DOS lados de cada valor, porque `public/app.js` avisa en un comentario que sus
defaults "tienen que calzar con TAMANO_DEFAULT/MARGIN_V de subtitulos.js": `public/index.html`
(atributos `selected`/`value`), `public/app.js` (`subsTamano`/`subsMarginV`/`subsFuente`) y
`subtitulos.js` (`TAMANO_DEFAULT`/`MARGIN_V`/`FUENTE_DEFAULT`).

**Dos cosas que conviene saber:**

1. **`FUENTE_DEFAULT` mueve DOS selectores.** Ese valor viaja por `/api/fuentes-subtitulos` y el
   frontend lo usa para preseleccionar tanto el select de subtítulos COMO el del cartel de
   portada. Ahora los dos arrancan en Bangers. Si se quisieran distintos, hay que separar el
   default (hoy es uno solo para ambos).
2. **MarginV 606 es una ESTIMACIÓN**, no un valor que el usuario haya dictado: se midió su
   captura calibrando contra la banda de "interfaz de TikTok" del preview (que es exactamente el
   15% del alto). Puede estar ±20. Se ajusta arrastrando la palabra y diciendo el valor nuevo.

**Ojo con la transición por defecto**: `xfade` no escala — con 58 clips en una sola cadena llegó a
+8GB de RAM (medido 2026-08-09), y por eso existe `TANDA_MAX=10`. Ahora TODOS los renders van a
usar transiciones, no solo cuando el usuario las pedía. Las tandas lo cubren, pero si aparecen
renders lentos o caídas en Railway con videos de muchos clips, este cambio de default es el primer
sospechoso.

**Verificado en browser local** (no solo en el código): con la app cargada, los 8 controles
devuelven exactamente los valores de arriba, incluido `subs-fuente` = `bangers` tras cargar el
catálogo por API, y la posición de la palabra reconvertida a MarginV da 606 clavado.

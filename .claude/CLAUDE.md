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

Fix propuesto (~20 líneas, sin implementar): endpoint `GET /api/carpetas-famosos` (hoy la lista
solo vuelve dentro del POST `/api/fragment`) y que la recuperación de job la pida en vivo en vez
de usar `job.carpetas`. Detalle importante: **unir** la lista viva con la guardada, para que si
una carpeta fue renombrada o borrada la asignación existente no se quede sin opción en el
desplegable.

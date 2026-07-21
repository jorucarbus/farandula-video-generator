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

# 🎬 Farándula Video Generator v2

App web que genera videos verticales de farándula para TikTok de forma automática: a partir de una noticia (link, video o texto), produce un video 1080x1920 con clips de famosos sincronizados a una locución IA, transiciones dinámicas, efectos de sonido y subtítulos animados. Guarda en Google Drive y registra cada video en Google Sheets.

## Pipeline v2 (flujo mejorado)

```
1. LECTURA       (Gemini)      Noticia (link/video/texto) → JSON: crónica + título + descripción
                               + hashtags + protagonista + secundario + acción
2. GUION         (Gemini)      Crónica + ángulo → 205-220 palabras, bucle por IDEA (no literal)
3. APROBACIÓN    (Usuario)     Editor en la UI: aprobar / editar / regenerar / cambiar ángulo
4. PÁRRAFOS      (Gemini)      Guion aprobado → párrafos con carpeta de famoso + % por caracteres
5. MARCAS        (Gemini)      Etiquetas de actuación [excited] [fast] [sarcastic] etc.
6. AUDIO         (ElevenLabs)  eleven_v3 (interpreta las marcas); respaldo MP3 en Drive
7. GUION TÉCNICO (Gemini)      Por cambio de párrafo: transición (fade/slide/circleopen/...)
                               + SFX (whoosh/impacto/pop/riser)
8. VIDEO         (FFmpeg)      Plan de clips + xfade + SFX + subtítulos ASS → MP4 sincronizado
9. REGISTRO      (Sheets)      Fila por video: metadatos + canal + links + dinero (manual)
```

### Fuentes de entrada (etapa 1)

- **Link de noticia**: extracción de texto de la página
- **YouTube**: Gemini lee el video directamente por URL
- **TikTok / Instagram / X / Facebook**: se descarga el **video completo** y se sube a la **File API de Gemini** → Gemini lo *VE* (imagen + audio: gestos, caras, texto en pantalla), no solo lo escucha. Descarta Whisper a propósito (perdería lo visual, clave para el ángulo "lenguaje corporal").
- **Texto manual**

> El link se autodetecta: YouTube → lectura directa; TikTok/IG/X/FB → descarga + File API; cualquier otro link → extracción de texto web. La opción "Forzar como video" descarga y ve cualquier URL.

### Sincronización por porcentajes (el corazón del v2)

- Fragmentación por **oración** (una oración exacta por fragmento, no grupos de 1-3): preserva
  el contexto narrativo mientras el multi-clip dinámico hace el resto
- Tiempo de cada fragmento = duración REAL del audio (ffprobe) × (caracteres del fragmento / caracteres totales)
- Fragmentos largos se parten en tomas iguales ≤3s (mejor 2 tomas de 2s que 1 alargada); una
  oración corta queda como clip único breve — el ritmo de corte varía según lo que dice el guion,
  no un tiempo fijo
- El video calza con la locución POR CONSTRUCCIÓN: sin ajuste de velocidad

### Efectos por clip: zoom (Ken Burns) + espejo

- Zoom activo **toda la duración** del clip (no una imagen fija) vía `zoompan`, 4 presets:
  `todos` / `alternado` / `intercalado` (in/out) / `ninguno`, intensidad configurable en %
- Espejo (flip horizontal) con los mismos 4 presets, independiente del zoom
- Configurable en el Paso 6 de la UI; mismo sistema en `farandula-insumos` (clips individuales
  para edición manual también llevan los efectos)

### Selección de clips (rotación sin repetir)

- No se repite video hasta agotar TODOS los de la carpeta del famoso (`historial.json`)
- Secuencia aleatoria siempre distinta a la del render anterior
- El offset avanza dentro de cada video: nunca se repite el mismo fragmento
- Primer y último clip del video final nunca salen del mismo video fuente (loop de TikTok)

### Hyperframes (etapas 7-8)

- Gemini decide por cada cambio de párrafo: transición + SFX según energía narrativa
- Transiciones xfade: corte, fade, slideleft/right, wipeleft/right, circleopen, dissolve, zoomin, fadeblack, hblur
- SFX desde `recursos/sfx/` clasificados (transicion/impacto/pop/suspenso/risa) — se eligen al azar dentro de la categoría; puedes agregar más MP3 a las carpetas
- Subtítulos ASS sincronizados por párrafo, bloques cortos con animación pop-in, 5 tipografías de Google Fonts (selector en la UI), 3 tamaños
- Encoder: NVENC (GPU NVIDIA) autodetectado, fallback libx264; timeout duro de 10 min por llamada FFmpeg
- ⚠️ Overlays de emoji descartados (colgaban FFmpeg); código tras flag `HABILITAR_EMOJIS=1`

## Estructura del proyecto

```
├── server.js        Express: endpoints del pipeline + auth API Key + preview
├── gemini.js        Prompts maestros (lectura JSON, guion, párrafos, técnico, marcas) + reintentos
├── elevenlabs.js    TTS eleven_v3 (audio tags nativos) con fallback multilingual_v2
├── fuentes.js       descarga de video (youtube-dl-exec), extracción web, detección de tipo de link
├── seleccion.js     Planificador de clips: %, rotación, historial, offsets, loop-check
├── video.js         FFmpeg: montaje Hyperframes (xfade+SFX+ASS), NVENC, timeouts
├── subtitulos.js    Generador ASS + descarga de tipografías/emojis
├── sheets.js        Registro en Google Sheets (Service Account)
├── drive.js         Drive: carpetas, listado con duración, descarga con caché, subida
├── public/          Frontend vanilla (pasos: fuente → lectura → ángulo → aprobación → destino)
├── credentials.json Service Account (NO va a git)
├── .env             Claves (NO va a git)
├── usage.json       Estado v1 de rotación (NO va a git)
└── historial.json   Estado v2 de rotación/secuencias (NO va a git)
```

## Recursos en Google Drive

```
Mi unidad/Redes_Canales/
├── renders/                  ← GOOGLE_DRIVE_RENDERS_FOLDER_ID (una subcarpeta por canal)
├── audios/                   ← respaldo MP3 de cada locución (mismo nombre que el video)
└── recursos/
    ├── sfx/{transicion,impacto,pop,suspenso,risa}/   ← efectos de sonido (MP3)
    ├── fuentes/               ← TTFs de Google Fonts (Poppins, Anton, Bangers, Luckiest, Archivo)
    └── emojis/                ← PNGs Twemoji (feature desactivada)

Videos_Famosos_Carpetas/       ← GOOGLE_DRIVE_FOLDER_ID (197 carpetas de famosos, lectura dinámica)
```

## Configuración

### Requisitos

- Node.js 18+, FFmpeg en PATH (o `ffmpeg-static` vía npm — ya incluido)
- **yt-dlp ya NO hace falta instalarlo**: `youtube-dl-exec` trae su propio binario (funciona en Railway sin instalar nada del sistema). El viejo `descargarAudio` aún usa el `yt-dlp` del sistema, pero el flujo de video ya no lo necesita.
- Google Drive para escritorio (guardado de renders por carpeta local)
- GPU NVIDIA opcional (NVENC acelera el render ~10x)

### .env

```env
PORT=3000
API_KEY=clave-propia-de-la-app        # NO reutilizar la key de Gemini
GEMINI_API_KEY=...                    # Google AI Studio, con facturación
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...
GOOGLE_DRIVE_FOLDER_ID=...            # carpeta de famosos
GOOGLE_DRIVE_RENDERS_FOLDER_ID=...    # carpeta de renders (subcarpetas = canales)
RENDERS_LOCAL_PATH=G:\Mi unidad\Redes_Canales\renders
GOOGLE_SHEET_ID=...                   # hoja "Registro Videos Farandula"
```

### Google Cloud (Service Account)

1. `credentials.json` en la raíz (clave JSON del Service Account)
2. APIs habilitadas: Drive + Sheets
3. Compartir como Editor con el email del Service Account: carpeta de famosos, carpeta de renders, carpeta recursos y la hoja de Sheets
4. Los Service Accounts NO tienen cuota de almacenamiento: no pueden crear/subir archivos propios a Drive — por eso el guardado usa la carpeta local sincronizada

### Google Sheets (columnas)

Fecha | Título | Descripción + Hashtags | Protagonista | Canal | Nombre archivo | Link fuente | Link render | Dinero generado (manual) | Status | Guion

## Rama de prueba `test-persistencia` (2026-07-16)

Branch separada, NO tocar `main`/Railway hasta confirmar que funciona óptimo. Ver `.claude/CLAUDE.md` para detalle de la sesión.

**Bloque A completo — Persistencia por jobId:**
- `jobStore.js`: store JSON simple en `data/jobs.json` (gitignored), sin MongoDB. `crearJob/actualizarJob/obtenerJob/listarJobs`.
- `jobId` (UUID) nace en `/api/read`, viaja en el body de cada endpoint siguiente (`generate-script`, `fragment`, `generar-audio`, `generate-video`), cada uno actualiza `paso` (`lectura→guion→fragmentacion→audio→completado`) + los datos de esa etapa.
- ⚠️ Variable interna preexistente `jobId` dentro de `/api/generate-video` (nombraba archivos temporales) renombrada a `renderId` para no chocar con el jobId persistente.
- `public/app.js`: al cargar, `chequearJobPendiente()` mira `localStorage.farandula_job_id`; si el job no está `completado`, muestra banner "🔁 Continuar donde quedó" / "🗑️ Empezar de cero". Recuperar rehidrata título/descripción/guion/fragmentos/audio según la etapa guardada — sin regenerar nada ya hecho.
- Endpoints nuevos: `GET /api/jobs` (últimos 20), `GET /api/jobs/:jobId`.
- **Verificado en browser real**: job recuperado tras reload restauró guion exacto (206 palabras) sin llamar a Gemini de nuevo.

**Historial real desde Sheets:**
- Columna 11 "Guion" agregada a la hoja (`ENCABEZADOS`, formato, `registrarVideo`).
- `sheets.leerHistorial(20)` lee `A2:K` y devuelve objetos con guion incluido.
- `GET /api/historial` + `public/app.js: cargarHistorial()` — tarjetas neobrutalism, clic en título expande descripción+hashtags/protagonista/canal/status/link/guion (copiable).

**Bloque B completo — UI no-wizard (grid de pasos):**
- Los 6 pasos del pipeline viven siempre en el DOM dentro de `.steps-grid` (`public/index.html`), grid 2 columnas desktop / 1 columna móvil (breakpoint 900px, `public/style.css`).
- Cada tarjeta tiene `data-status="locked|active|done"` (`setStepStatus()` en `public/app.js`): locked = `pointer-events:none` + gris + badge ⏳, active = badge 🔓, done = borde verde + badge ✅.
- El wizard viejo (`showSection()`, ocultaba todo menos un paso) se eliminó. Progreso/errores ahora en barra flotante fija al fondo (`showProgress()`/`hideProgress()`) que no tapa el grid.
- **Verificado en browser real**: flujo lectura→ángulo con estados y barra flotante funcionando; grid confirmado en 2 columnas (526px c/u) y 1 columna en mobile.

**Bloque C completo — rehacer un paso invalida lo posterior:**
- `STEP_ORDER` + `lockFrom(stepId)` en `public/app.js`, llamado al INICIO de `leerFuente()`, `handleGenerateScript()`, `aprobarGuion()` y `regenerarAudio()` (antes de la llamada a la API): bloquea ese paso + todos los siguientes y oculta `result-section` si estaba visible.
- Como los pasos "done" no tienen `pointer-events:none`, el usuario ya podía reenviar un paso anterior — faltaba esta invalidación en cascada para que los pasos posteriores no quedaran mostrando datos viejos.
- **Verificado en browser real**: releer fuente con guion ya generado bloqueó guion/revisión/audio/destino al instante y los reactivó correctamente al completar la nueva lectura.

**Bloque D completo — respaldo/restauración en Drive de historial/jobs:**
- `driveCache.js` (nuevo): `respaldar()`/`restaurar()` de archivos de estado (`historial.json`, `data/jobs.json`) contra una subcarpeta dedicada en Drive, porque Railway borra el disco en cada redeploy.
- ⚠️ La carpeta `Redes_Canales` (id `1irTudEARQWOrJr3y911Hwl_1VbvQqNP5`) es la raíz compartida con renders/audios/recursos, NO una carpeta de caché — se creó la subcarpeta dedicada **`cache-estado`** (id `1s0OXuermFR4_DbNZP3gWFYDAV1xvf5ct`) para no ensuciar la raíz.
- ⚠️ **Requisito de permiso**: si la máquina no tiene OAuth configurado en `.env`, `driveCache` cae al Service Account — y ese account necesita compartida `cache-estado` como Editor explícitamente (no la hereda de `Redes_Canales`). Si falta, `restaurar()` fallaba en silencio (bug de logging ya corregido).
- `respaldar()` y `restaurar()` **verificados end-to-end** (2026-07-17): borré `data/jobs.json` local, reinicié el server, el arranque lo trajo solo de Drive antes de que la app lo necesitara, con el contenido más reciente.

**Bloque E completo — rediseño visual (2026-07-17):**
- **Scroll-snap on/off**: quitado el badge de texto "👉 Viendo"; el bloque centrado en Procesos/Historial ahora se "enciende" a color pleno (`.snapped`), el resto queda opaco/`grayscale`. Algoritmo por distancia al centro (`observarSnap()` en `public/app.js`) reemplaza el viejo IntersectionObserver — garantiza que SIEMPRE hay exactamente un elemento encendido.
- **Panel "Productos"** (columna derecha, sobre Historial): 3 casillas — Guion, Audio, Video/Insumos — opacas hasta que el job actual genera ese producto, se encienden con contenido real (extracto de texto, `<audio>` nativo, `<video>`/link). Se apagan solas si se rehace un paso anterior (`lockFrom()` extendido con `resetProductoSlot()`).
- **Palanca de modo**: los 2 botones "Video final"/"Insumos" se reemplazaron por un switch neobrutalista (`.modo-switch`) con thumb deslizante.
- **Iconos Phosphor self-hosted**: 34 iconos (bold, MIT) inline en `public/icons.js`, sin CDN — reemplazan casi todos los emoji de la UI (excepto `<select>` de sesgo y el log-box, por limitación técnica/estilo).
- **Tipografía propia**: Space Grotesk (títulos) + Inter (texto), variable-font woff2 auto-hospedadas en `public/fonts/`, sin dependencia de Google Fonts en producción.
- Historial: tarjetas compactas (fecha + protagonista + canal), auto-carga sin botón, 1 tarjeta visible + peek de la siguiente.
- **Verificado en browser real**: switch en ambas direcciones, badges de paso con icono+texto, casillas de producto en ambos estados (opaco y encendido con contenido mock), sin errores de consola nuevos.

Los 5 bloques (A/B/C/D/E) están completos en `test-persistencia`. Pendiente: decidir el merge a `main` (solo cuando confirmes que todo funciona óptimo).

**2026-07-19 — Fragmentación por oración + efectos + robustez Gemini** (detalle completo en
`.claude/CLAUDE.md`, sección "Sesiones recientes"): fragmentación pasó de párrafo a oración exacta
(multi-clip dinámico real), zoom/espejo con 4 presets (portado también a `farandula-insumos`), UI
reconciliada con cambios paralelos hechos en la Mac (carrusel de pasos horizontal, "Resultado de
la lectura" movido a Productos), y Gemini ya no aborta ante un 400/404 — reveló y arregló un bug
real: ciertos links de YouTube hacían que Gemini fetcheara HTML en vez de leer el video.

## Estado (2026-07-13)

### ✅ Funcionando (probado)

- Pipeline v2 completo end-to-end (video real de Shakira: 29 clips, 76s exactos, registrado en Sheets)
- **Frontend unificado con selector de modo** 🎬 Video final / ✂️ Insumos: un solo front rutea al backend del modo activo (fusión bloque 1)
- **Gemini VE los videos de TikTok/IG** (descarga + File API multimodal) — verificado e2e: describió el contenido visual de un clip sin diálogo
- **Cadena de fallback de modelos Gemini** — verificado: con ambos flash en 503 cayó a `gemini-3.1-flash-lite` y generó el guion
- **Botones reintentar / volver atrás por paso** (no regasta tokens: conserva guion/audio/fragmentos ya hechos)
- Lectura multimodal (texto/web/YouTube/video social)
- Aprobación de guion con editor
- Fragmentación por %, rotación sin repetir con historial
- eleven_v3 con audio tags nativos (verificado el acceso de la cuenta)
- Hyperframes: transiciones + SFX + subtítulos (probado con clips sintéticos: 12s en 5.5s de render con RTX 3070)
- Visualizador de preview en la UI
- Registro automático en Google Sheets

### 📋 Pendiente

- [ ] **Verificar en Railway** que el postinstall de `youtube-dl-exec` baje el binario yt-dlp linux en el build; probar un TikTok/IG real ya desplegado (IG puede pedir cookies; TikTok público suele ir sin ellas)
- [x] Persistir estado por `jobId` entre recargas — hecho en rama `test-persistencia` (ver sección arriba), pendiente merge a `main`
- [x] Rediseño visual (iconos propios, tipografía, palanca, panel de productos) — Bloque E, misma rama
- [ ] Reordenar UI con pasos numerados (guía: screenshot cyberpunk del amigo — solo ORDEN, se mantiene neobrutalism)
- [ ] Probar un video REAL completo con Hyperframes + subtítulos (todo integrado)
- [ ] Deploy a Railway: OAuth para Drive (sin carpeta local), leer recursos desde Drive API
- [ ] Emojis overlay (descartado por ahora — colgaba FFmpeg por buffering)
- [ ] App hermana de publicación automática (leerá la hoja de Sheets)
- [ ] Multiusuario

## Notas técnicas (para no repetir errores)

- **Gemini — cadena de fallback (no un modelo fijo)**: `MODELOS = ['gemini-flash-latest','gemini-3.5-flash','gemini-3.1-flash-lite-preview','gemini-flash-lite-latest']`. Siempre intenta el más reciente primero; si un modelo da 503/500/429/**404** tras 2 reintentos con backoff, cae al siguiente (degrada a los `lite` estables). Errores no-temporales (400/401) abortan de una. `thinkingConfig: { thinkingBudget: 0 }` y `maxOutputTokens: 8192` (sin esto el razonamiento interno corta la salida). JSON con `responseMimeType: 'application/json'`.
- **⚠️ Esta cuenta es tier gemini-3.x**: la key empieza con `AQ.` (no `AIza`). Los modelos `gemini-2.5-flash` / `gemini-2.0-flash` / `gemini-3-pro-preview` dan **404 "no longer available to new users"** — NO usarlos. Ver lista real: `GET .../v1beta/models?key=KEY`.
- **Keys de Gemini** formato `AQ.` pueden expirar: si sale 401, generar una nueva en AI Studio.
- **Al extraer la key del `.env`**: NO usar `tr -d` en shell (borra letras y corrompe la key → 404 falsos). Léela con `node -e 'require("dotenv").config(); ...'`.
- **xfade**: el offset de cada transición = suma de duraciones ORIGINALES; cada segmento lleva el excedente de su transición + 0.5s de margen (el redondeo a frames de 30fps rompe la cadena si se corta justo).
- **Overlays con `-loop 1`**: JAMÁS dejar el stream infinito ni usar `setpts` desplazado — FFmpeg bufferea frames sin límite (GB de RAM) y se cuelga. Siempre `-t` finito. (Aun así los emojis colgaban: pendiente de debug.)
- **Duración del audio**: siempre ffprobe sobre el MP3 real, nunca estimada.
- **Git**: después de CADA push, verificar con `git ls-remote origin HEAD` que el SHA coincide con el local (se perdieron 5 horas de trabajo por un push fallido).

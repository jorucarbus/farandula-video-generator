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
- **TikTok / Instagram / X / Facebook**: `yt-dlp` descarga → audio MP3 → Gemini lo procesa
- **Texto manual**

### Sincronización por porcentajes (el corazón del v2)

- Tiempo de cada párrafo = duración REAL del audio (ffprobe) × (caracteres del párrafo / caracteres totales)
- Párrafos largos se parten en tomas iguales ≤3s (mejor 2 tomas de 2s que 1 alargada)
- El video calza con la locución POR CONSTRUCCIÓN: sin ajuste de velocidad

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
├── fuentes.js       yt-dlp (TikTok/IG), extracción web, detección de tipo de link
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

- Node.js 18+, FFmpeg en PATH, yt-dlp en PATH (`winget install yt-dlp`)
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

Fecha | Título | Descripción + Hashtags | Protagonista | Canal | Nombre archivo | Link fuente | Link render | Dinero generado (manual) | Status

## Estado (2026-07-11)

### ✅ Funcionando (probado)

- Pipeline v2 completo end-to-end (video real de Shakira: 29 clips, 76s exactos, registrado en Sheets)
- Lectura multimodal (texto/web/YouTube/yt-dlp)
- Aprobación de guion con editor
- Fragmentación por %, rotación sin repetir con historial
- eleven_v3 con audio tags nativos (verificado el acceso de la cuenta)
- Hyperframes: transiciones + SFX + subtítulos (probado con clips sintéticos: 12s en 5.5s de render con RTX 3070)
- Visualizador de preview en la UI
- Registro automático en Google Sheets

### 📋 Pendiente

- [ ] Probar un video REAL completo con Hyperframes + subtítulos (todo integrado)
- [ ] Deploy a Railway: OAuth para Drive (sin carpeta local), leer recursos desde Drive API
- [ ] Emojis overlay (descartado por ahora — colgaba FFmpeg por buffering)
- [ ] App hermana de publicación automática (leerá la hoja de Sheets)
- [ ] Multiusuario

## Notas técnicas (para no repetir errores)

- **Gemini**: `gemini-flash-latest`, `thinkingConfig: { thinkingBudget: 0 }` y `maxOutputTokens: 8192` (sin esto el razonamiento interno corta la salida). JSON con `responseMimeType: 'application/json'`.
- **Keys de Gemini** formato `AQ.` pueden expirar: si sale 401, generar una nueva en AI Studio.
- **xfade**: el offset de cada transición = suma de duraciones ORIGINALES; cada segmento lleva el excedente de su transición + 0.5s de margen (el redondeo a frames de 30fps rompe la cadena si se corta justo).
- **Overlays con `-loop 1`**: JAMÁS dejar el stream infinito ni usar `setpts` desplazado — FFmpeg bufferea frames sin límite (GB de RAM) y se cuelga. Siempre `-t` finito. (Aun así los emojis colgaban: pendiente de debug.)
- **Duración del audio**: siempre ffprobe sobre el MP3 real, nunca estimada.
- **Git**: después de CADA push, verificar con `git ls-remote origin HEAD` que el SHA coincide con el local (se perdieron 5 horas de trabajo por un push fallido).

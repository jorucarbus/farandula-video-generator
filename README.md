# 🎬 Farándula Video Generator

App web que genera videos verticales de farándula para TikTok de forma automática: a partir de una noticia (link o texto), produce un video 1080x1920 con clips de famosos sincronizados a una locución generada por IA, y lo guarda en Google Drive listo para publicar.

## Flujo completo (6 etapas)

```
1. LECTURA      (Gemini)      Noticia → Crónica + Título + Descripción TikTok + 5 hashtags
2. GUION        (Gemini)      Crónica + Ángulo elegido → Guion de 205-220 palabras (~70s) con bucle perfecto
3. FRAGMENTACIÓN (Gemini)     Guion → Oraciones cortas (55-60 caracteres) con carpeta de famoso asignada
4. MARCAS       (Gemini)      Fragmentos → Guion saturado de etiquetas [excited] [fast] [sarcastic] etc.
5. AUDIO        (ElevenLabs)  Guion con marcas → MP3 con voz personalizada (español latino)
6. VIDEO        (FFmpeg)      Clips de Drive + audio → MP4 vertical sincronizado, subido a Drive
```

### Detalles clave de cada etapa

- **Lectura**: crónica periodística con gancho viral. El título y descripción+hashtags se muestran en la UI con botón de copiar (para publicar en redes).
- **Guion**: 7 ángulos disponibles (1-Lenguaje corporal, 2-Pasado/Hipocresía, 3-Víctimas/Terceros, 4-Conspiración/Dinero, 5-Ruptura de expectativas, 6-Combinado, 7-Enfoque personalizado del usuario). El guion termina conectando con la primera frase (loop infinito).
- **Fragmentación**: lee las carpetas de famosos **dinámicamente desde Google Drive** (agregar una carpeta nueva no requiere tocar código). Formato de salida: `Nombre_Carpeta: fragmento`.
- **Selección de videos**: por cada fragmento elige un clip de la carpeta del famoso **sin repetir** hasta agotar todos los videos de esa carpeta (registro en `usage.json`).
- **Montaje**: descarta el primer segundo de cada clip, duración por fragmento según caracteres (1.5-4s), formato vertical 1080x1920 30fps, y **ajusta la velocidad del video completo para empatar exactamente con la duración de la locución**.
- **Nombre del archivo**: `AAAA-MM-DD Protagonista - Secundario - Hecho.mp4` (generado por Gemini).
- **Guardado**: copia el MP4 a la carpeta local de Google Drive para escritorio (`RENDERS_LOCAL_PATH`), que sincroniza solo. Los Service Accounts NO pueden subir por API a Drive personal (sin cuota) — por eso se usa la carpeta local.

## Estructura del proyecto

```
├── server.js        Servidor Express: endpoints de las 6 etapas + auth por API Key
├── gemini.js        4 prompts maestros + llamadas a Gemini (gemini-flash-latest) con reintentos
├── elevenlabs.js    Text-to-speech con voz personalizada (eleven_multilingual_v2, español)
├── video.js         FFmpeg: segmentos, concatenación, sincronización de velocidad, usage.json
├── drive.js         Google Drive: listar carpetas/videos, descargar clips, subir renders
├── public/          Frontend (HTML + CSS + JS vanilla)
│   ├── index.html   UI por pasos: fuente → lectura → ángulo → guion → carpeta destino → progreso
│   ├── app.js       Lógica del flujo, pide API Key al cargar (localStorage)
│   └── style.css    Estilos responsive
├── credentials.json Service Account de Google (NO se sube a git)
├── .env             Claves y configuración (NO se sube a git)
└── temp-videos/     Archivos temporales durante el render (se limpian solos)
```

## Configuración

### 1. Requisitos

- Node.js 18+
- FFmpeg instalado y en el PATH (`winget install ffmpeg` / `brew install ffmpeg`)
- Google Drive para escritorio (para el guardado de renders)

### 2. Instalar

```bash
git clone https://github.com/jorucarbus/farandula-video-generator.git
cd farandula-video-generator
npm install
```

### 3. Crear `.env` en la raíz

```env
PORT=3000
API_KEY=clave-secreta-para-acceder-a-la-app
GEMINI_API_KEY=tu-clave-de-google-ai-studio
ELEVENLABS_API_KEY=tu-clave-de-elevenlabs
ELEVENLABS_VOICE_ID=id-de-tu-voz-personalizada
GOOGLE_DRIVE_FOLDER_ID=id-carpeta-con-subcarpetas-de-famosos
GOOGLE_DRIVE_RENDERS_FOLDER_ID=id-carpeta-de-renders-por-canal
RENDERS_LOCAL_PATH=G:\Mi unidad\Redes_Canales\renders
```

- **GEMINI_API_KEY**: [Google AI Studio → API Keys](https://aistudio.google.com/api-keys). Con facturación activada (sin ella, el nivel gratuito da error 429 seguido).
- **ELEVENLABS_VOICE_ID**: [ElevenLabs → Voices](https://elevenlabs.io/app/voices) → tu voz → Voice ID.
- **RENDERS_LOCAL_PATH**: ruta local de la carpeta de renders sincronizada por Google Drive para escritorio. En Mac suele ser `/Users/usuario/Google Drive/Mi unidad/Redes_Canales/renders` o similar (verificar en Finder).

### 4. Credenciales de Google Drive

1. Google Cloud Console → Service Account → crear clave JSON → guardarla como `credentials.json` en la raíz del proyecto.
2. Compartir con el email del Service Account (`farandula-generator@n8n-automatizacion-chismex.iam.gserviceaccount.com`) como **Editor**:
   - La carpeta de famosos (`Videos_Famosos_Carpetas`)
   - La carpeta de renders (`Redes_Canales/renders`)

### 5. Correr

```bash
npm start
```

Abrir `http://localhost:3000`. Al cargar pide la API Key (la de `.env`), se guarda en localStorage.

## Estructura en Google Drive

```
Videos_Famosos_Carpetas/          ← GOOGLE_DRIVE_FOLDER_ID
├── Karina_Torres/  *.mp4
├── Shakira/        *.mp4
└── ... (196 carpetas, se leen dinámicamente)

Redes_Canales/renders/            ← GOOGLE_DRIVE_RENDERS_FOLDER_ID
├── Embajadores del Chisme/       ← una carpeta por canal
├── Chismex Picante/
├── La Naple/
└── Supe Lupe/
```

## Estado actual (2026-07-10)

### ✅ Funcionando

- Pipeline completo de las 6 etapas probado de extremo a extremo
- Guiones de 205-220 palabras con el enfoque correctamente aplicado
- Reintentos automáticos ante errores 429/500/503 de Gemini
- Lista de famosos dinámica desde Drive (196 carpetas)
- Selección de clips sin repetición (usage.json)
- Video vertical sincronizado con la locución (velocidad ajustada)
- Guardado en carpeta local de Drive con nombre `fecha protagonista - secundario - hecho.mp4`
- UI muestra crónica/título/descripción/guion con conteo de palabras y botones de copiar

### ⚠️ Problemas conocidos

- Las etiquetas `[excited]` `[fast]` etc. se **eliminan** antes de enviar a ElevenLabs porque el modelo v2 las leía en voz alta. Para que se interpreten hay que migrar al modelo **eleven_v3** de ElevenLabs (soporta audio tags nativamente).
- El nivel gratuito de Gemini limita peticiones por minuto; con facturación activada desaparece.

### 📋 Pendiente

- [ ] Migrar ElevenLabs a `eleven_v3` para que las marcas de actuación funcionen
- [ ] Deploy a Railway (requiere resolver subida a Drive por OAuth, ya que allá no existe Drive para escritorio)
- [ ] Soporte para leer videos/audios como fuente (hoy: solo link o texto)
- [ ] App hermana para publicar automáticamente los renders en redes sociales

## Notas técnicas importantes

- **Modelo Gemini**: `gemini-flash-latest` con `thinkingConfig: { thinkingBudget: 0 }` y `maxOutputTokens: 8192`. Sin esto, el razonamiento interno del modelo consume el límite de tokens y los guiones salen cortados (bug que costó horas encontrar).
- **Parsing de fragmentos**: se divide cada línea solo en el **primer** `:` — un `:` dentro del texto del fragmento no debe cortar nada.
- **Duración del audio**: se mide con ffprobe sobre el MP3 real, nunca estimada por caracteres.

# 🚂 Desplegar en Railway

En Railway no existe la carpeta local de Google Drive, así que los renders se **suben por OAuth** con tu cuenta (el Service Account no tiene cuota). FFmpeg y yt-dlp se instalan solos vía `nixpacks.toml`.

## 1. Credenciales OAuth (una sola vez)

1. [Google Cloud Console → Credenciales](https://console.cloud.google.com/apis/credentials) → proyecto `n8n-automatizacion-chismex`
2. **Crear credenciales → ID de cliente de OAuth 2.0** → tipo **App de escritorio** → crear
3. Copia **Client ID** y **Client Secret**
4. En tu PC, ponlos en `.env`:
   ```
   GOOGLE_OAUTH_CLIENT_ID=...
   GOOGLE_OAUTH_CLIENT_SECRET=...
   ```
5. Corre una vez: `node obtener-token.js` → abre la URL, autoriza con tu cuenta, pega el código
6. Copia el `GOOGLE_OAUTH_REFRESH_TOKEN=...` que imprime

> Si la primera vez Google marca la app como "no verificada", entra en **Configuración avanzada → Ir a (no seguro)** — es tu propia app.

## 2. Crear el proyecto en Railway

1. [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo** → `jorucarbus/farandula-video-generator`
2. Railway detecta `nixpacks.toml` e instala Node + FFmpeg + yt-dlp automáticamente

## 3. Variables de entorno (Settings → Variables)

Copia todas las de tu `.env` **menos** `RENDERS_LOCAL_PATH` (esa NO va: fuerza el modo local). Y añade las de OAuth y las credenciales como texto:

```
API_KEY=...
GEMINI_API_KEY=...
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...
GOOGLE_DRIVE_FOLDER_ID=...
GOOGLE_DRIVE_RENDERS_FOLDER_ID=...
GOOGLE_SHEET_ID=...
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_OAUTH_REFRESH_TOKEN=...
GOOGLE_CREDENTIALS_JSON={"type":"service_account",...}   ← el contenido COMPLETO de credentials.json en una línea
```

- `GOOGLE_CREDENTIALS_JSON`: abre `credentials.json`, copia todo el contenido y pégalo como valor (Railway acepta el JSON en una línea).
- NO pongas `RENDERS_LOCAL_PATH` ni `PORT` (Railway asigna el puerto solo; el server ya lee `process.env.PORT`).

## 4. Desplegar

Railway hace deploy solo al conectar el repo. Cada `git push` a `main` redespliega.
La URL pública sale en **Settings → Networking → Generate Domain**.

## Notas

- **Render sin GPU**: en Railway no hay NVENC, usa CPU (libx264). Un video de ~70s tarda ~3-5 min.
- **Disco efímero**: `temp-videos/` se borra en cada reinicio; no pasa nada, se limpia por job.
- **Costo**: plan Hobby (~$5/mes) alcanza para uso personal.
- El guardado de la locución en la carpeta `audios/` local se omite en Railway (solo aplica en el PC con Drive de escritorio).

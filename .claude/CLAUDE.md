# Claude Code Setup — Farandula Video Generator

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

**Pendiente (Bloques B/C/D, no empezados):**
- [ ] UI responsive 2 columnas desktop / 1 columna mobile, todos los pasos visibles a la vez, verde al completar (no-wizard)
- [ ] Saltar/rehacer un paso específico a elección (hoy solo hay "continuar desde el último pendiente")
- [ ] Carpeta caché en Google Drive dentro de `Redes_Canales` (id `1irTudEARQWOrJr3y911Hwl_1VbvQqNP5`) para historial.json/backups/guiones-audios-videos

## Pendiente Verificar (Railway Live — main, sin tocar por ahora)

- [ ] Redeploy de Railway → youtube-dl-exec postinstall descarga binario linux yt-dlp
- [ ] Test video real TikTok/IG (Instagram a veces pide cookies)

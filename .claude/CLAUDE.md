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

## Bloque B completo (2026-07-16)

UI ya NO es wizard: los 6 pasos viven siempre en el DOM dentro de `.steps-grid` (`public/index.html`), grid 2 columnas desktop / 1 columna móvil (breakpoint 900px, `public/style.css`). Cada tarjeta tiene `data-status="locked|active|done"` controlado por `setStepStatus()` en `public/app.js` — locked = `pointer-events:none` + gris + badge ⏳, active = badge 🔓 + sombra, done = borde verde + badge ✅. `showSection()` (wizard viejo) fue eliminado; el progreso/errores ahora viven en una barra flotante (`showProgress()`/`hideProgress()`) fija al fondo que no tapa el grid. Verificado en browser real: flujo completo lectura→ángulo con estados y barra flotante funcionando.

## Bloque C completo (2026-07-16)

Rehacer un paso ya completado (editar y reenviar, ej. releer fuente con guion/audio ya generados) ahora invalida y re-bloquea automáticamente todo lo posterior. `STEP_ORDER` + `lockFrom(stepId)` en `public/app.js` — se llama al INICIO de `leerFuente()`, `handleGenerateScript()`, `aprobarGuion()` y `regenerarAudio()`, antes de la llamada a la API, bloqueando ese paso y todos los siguientes + ocultando `result-section` si estaba visible. Como los pasos "done" no tienen `pointer-events:none` (solo los "locked" lo tienen), el usuario ya podía reenviar un paso anterior — lo que faltaba era esta invalidación en cascada. `otroSesgo()` se simplificó para reusar `lockFrom` vía `leerFuente()`. Verificado en browser real: releer fuente con guion ya generado bloqueó guion/revisión/audio/destino al instante (antes de que terminara la nueva lectura) y los reactivó correctamente al completar.

## Bloque D en progreso (2026-07-17) — falta verificar restore, no commiteado aún

Objetivo: `historial.json` (rotación de clips) y `data/jobs.json` (jobs Bloque A) viven solo en el
disco efímero de Railway — un redeploy los borra. Se agregó respaldo/restauración en Drive:

- `driveCache.js` (nuevo) — `respaldar(localPath, nombreDrive)` sube/actualiza el archivo en la
  carpeta caché de Drive; `restaurar(localPath, nombreDrive)` lo trae de vuelta SOLO si el archivo
  local no existe o está vacío (nunca pisa progreso reciente). Usa OAuth (misma cuenta que sube
  renders) porque el Service Account no tiene cuota para crear archivos.
- `drive.js` — export agregado de `getDrive`/`getDriveOAuth` (antes privados) para que `driveCache.js`
  los reuse.
- `seleccion.js` — `guardarHistorial()` ahora llama `driveCache.respaldar()` fire-and-forget.
- `jobStore.js` — `guardar()` (usado por `crearJob`/`actualizarJob`) ídem con `jobs.json`.
- `server.js` — al arrancar, `driveCache.restaurar()` para ambos archivos antes de `app.listen`.

**⚠️ OJO carpeta**: el ID `1irTudEARQWOrJr3y911Hwl_1VbvQqNP5` que se pensó usar es `Redes_Canales`
MISMO (la raíz que ya comparte renders/audios/recursos), NO una subcarpeta — confirmado con
`files.get`. Se creó una subcarpeta dedicada **`cache-estado`** dentro de Redes_Canales
(id `1s0OXuermFR4_DbNZP3gWFYDAV1xvf5ct`) y `driveCache.js` usa ESE id como default
(`GOOGLE_DRIVE_CACHE_FOLDER_ID` la puede sobreescribir). Un `jobs.json` que se subió por error
directo a la raíz de Redes_Canales ya se movió a `cache-estado`.

**Verificado:** `respaldar()` funciona — se confirmó con `files.list` que `jobs.json` queda dentro
de `cache-estado` (no en la raíz) tras crear un job real vía `/api/read`.

**Falta verificar (sesión cortada aquí, retomar en la Mac):** el flujo `restaurar()` completo —
borrar `data/jobs.json` local, reiniciar `node server.js`, confirmar que el arranque lo trae de
vuelta de Drive antes de que la app lo necesite. Se alcanzó a borrar el archivo local para probar
pero se interrumpió antes de reiniciar el server; el archivo ya se restauró manualmente a mano
(está sano, no falta nada), la prueba end-to-end del restore queda pendiente.

**Sin commitear todavía**: `driveCache.js`, `drive.js`, `seleccion.js`, `jobStore.js`, `server.js`
tienen cambios de Bloque D sin commit en `test-persistencia`. Revisar `git status`/`git diff` al
retomar antes de commitear (verificar primero el restore).

## Pendiente Verificar (Railway Live — main, sin tocar por ahora)

- [ ] Redeploy de Railway → youtube-dl-exec postinstall descarga binario linux yt-dlp
- [ ] Test video real TikTok/IG (Instagram a veces pide cookies)

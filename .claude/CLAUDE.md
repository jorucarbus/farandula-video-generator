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

## Pendiente Verificar (Railway Live)

- [ ] Redeploy de Railway → youtube-dl-exec postinstall descarga binario linux yt-dlp
- [ ] Test video real TikTok/IG (Instagram a veces pide cookies)
- [ ] Persistir state por jobId entre recargas (actual: solo en memoria)

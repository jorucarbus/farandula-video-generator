# 🎬 Farándula Video Generator — Ecosistema Completo

## 3 Aplicaciones Integradas

### 1. **farandula-video-generator** (v2 — Auto Render)
📍 **Este repo** | Produce videos finales automáticamente
- **Entrada**: Link/video/texto de noticia
- **Salida**: MP4 1080x1920 sincronizado a Google Drive
- **Pipeline**: 9 etapas (lectura → guion → audio → video) con **UI de aprobación**
- **Features**: Subtítulos ASS animados, transiciones dinámicas, SFX por párrafo, Sheets log
- **Stack**: Express + Gemini + ElevenLabs + FFmpeg + Google Drive/Sheets
- **Estado**: Producción, 2189 líneas

### 2. **farandula-insumos** (Companion — Manual Edit)
📍 Privado en GitHub | Exporta insumos para edición manual
- **Entrada**: Mismo que v2 (link/video/texto)
- **Salida**: Carpeta en Drive con fragmentos + locucion.mp3, listos para editar en Premiere/DaVinci
- **Diferencia**: Detiene en Etapa 4 (post-audio), no renderiza video
- **Casos de uso**: Edición personalizada, control total de creatividad, batch processing

### 3. **farandula-proyectos** (Scheduler — TBD)
📍 **Aún pendiente** | Coordinador de trabajos
- Propuesto: Dashboard que envíe trabajos a v2 o insumos
- Gestión de canales, cronograma, reportes

---

## Flujo Arquitectónico

```
ENTRADA (noticia)
    ↓
┌─────────────────────────────────┐
│  Etapas 1-4 (Contenido + Audio) │  [COMPARTIDO entre v2 e insumos]
└─────────────────────────────────┘
    ↓
    ├─────────────────────────────────────────────────────┐
    │                                                     │
    ├─→ [RUTA v2]                              [RUTA INSUMOS]
    │   Etapas 5-9 (Video Final)        →  Exportar a Drive
    │   • Selección clips                    • Fragmentos ordenados
    │   • Montaje FFmpeg                     • Locucion MP3
    │   • Subtítulos                         • Listo para editar
    │   • Output: MP4 final                  • Sin procesamiento video
    ↓
  SALIDA: Video en Drive       SALIDA: Assets en Drive (edición manual)
```

---

## Versionado y Mejoras

### v2 (GitHub — Actual)
✅ 9 etapas completas  
✅ UI con aprobación manual  
✅ Subtítulos ASS dinámicos  
✅ Transiciones + SFX por párrafo  
✅ Sheets logging  
✅ Railway deploy  
⚠️ Sincronización video-audio por ajuste de velocidad (puede distorsionar)

### v3 (Local — Mejoras Implementadas 2026-07-10)
✅ **Sincronización exacta**: video se corta EXACTO a tiempo de audio, sin ajustar velocidad  
✅ **Fragmentación mejorada**: llenar tiempo exacto (sin huecos si clip es corto)  
✅ **Fallbacks robustos**: nombre sin Gemini si falla  
✅ **Tabla jobId**: pasar estado entre endpoints  
✅ **Reintentos inteligentes**: Gemini 503 → switchear modelo  
⚠️ Más simple (sin UI, sin Sheets, sin subtítulos)

### Plan de Integración v3 → v2
1. Copiar módulos mejorados (`video-selector.js`, `video-composer.js` con sincronización exacta)
2. Mantener features de v2 (UI, Sheets, subtítulos)
3. Test e2e con contenido real
4. Nueva rama `main-v3` o merge directo a `main`

---

## Stack Técnico (Compartido)

| Componente | Herramienta | Responsabilidad |
|------------|-------------|-----------------|
| **Lectura** | Gemini v1 Beta | OCR de links, audio de videos, texto manual |
| **Escritura** | Gemini v1 Beta | Crónica, guion, párrafos, marcas, transiciones, nombres |
| **Audio** | ElevenLabs v3 | Síntesis TTS, interpretación de marcas [excited] [fast] etc. |
| **Video** | FFmpeg | Montaje, transiciones xfade, escalado 1080x1920, sincronización |
| **Subtítulos** | libass (ASS) | Animación pop-in, 5 tipografías, 3 tamaños |
| **Storage** | Google Drive | Clips fuente, renders, insumos |
| **Logging** | Google Sheets | Metadatos: canal, fecha, famosos, links, dinero |

---

## Configuración (Ambas Rutas)

### `.env` Requerido

```bash
# APIs
GEMINI_API_KEY=
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=

# Google
GOOGLE_DRIVE_FOLDER_ID=      # Carpeta raíz de famosos
GOOGLE_DRIVE_RENDERS_FOLDER_ID=
GOOGLE_SHEETS_ID=           # Hoja de logging (solo v2)

# Opcional
RENDERS_LOCAL_PATH=         # Path local Drive Desktop sync
RAILWAY_ENVIRONMENT_ID=     # Para deploy en Railway
```

### `credentials.json`
Service Account de Google Cloud con permiso en:
- Google Drive (famosos + renders)
- Google Sheets (logging)

---

## Endpoints (v2)

| Método | Ruta | Entrada | Salida |
|--------|------|---------|--------|
| POST | `/api/read` | `{type, content}` | Crónica + meta |
| POST | `/api/generate-script` | `{cronica, angle}` | Guion 205-220 pal |
| POST | `/api/generate-video` | `{fragments, audio, destFolder}` | Video MP4 en Drive |

**v3 (local)**: endpoints similares, pero sin UI de aprobación

---

## Próximas Mejoras

### Corto Plazo (1-2 sesiones)
- [ ] Integrar módulos v3 a v2 (sincronización exacta)
- [ ] Tabla jobId para pasar estado sin sesión HTTP
- [ ] Test e2e v2 + v3 con contenido real

### Mediano Plazo
- [ ] `farandula-proyectos` scheduler (cola de trabajos)
- [ ] Caché de clips descargados (paralelizar descargas 4-5x)
- [ ] Modelo fallback Gemini (flash → lite si 503)

### Largo Plazo
- [ ] Soporte multi-idioma (ElevenLabs soporta 29)
- [ ] Watermark/branding dinámico
- [ ] Analytics dashboard (Sheets → BigQuery)
- [ ] API REST pública (autenticación por API Key)

---

## Para Desarrolladores

### Clonar y Configurar (v2 + v3 local)

```bash
# v2 (GitHub)
git clone https://github.com/jorucarbus/farandula-video-generator.git
cd farandula-video-generator
npm install
cp .env.example .env  # completar credenciales
node server.js

# v3 (Local)
cd ~/farandula-video-generator
npm start
```

### Testing

```bash
# v2: manual (UI en http://localhost:3000)
# v3: automatizado
node test-pipeline.js         # etapas 5/6/8 sin APIs
node test-e2e-local.js        # FFmpeg real, videos sintéticos
node test-e2e-apis.js         # 6 endpoints con APIs reales
```

### Contribuir

1. Fork + Branch
2. Cambios en v3 local → test local
3. Push a GitHub
4. PR a `main` con descripción de mejora
5. Integración a v2 en próxima sesión de consolidación

---

## Estado del Proyecto

| Aspecto | v2 (Producción) | v3 (Local) | Insumos |
|---------|-----------------|-----------|---------|
| **Funcionalidad** | 100% | 80% (sin UI) | 100% |
| **Sincro Audio** | Velocidad ajuste | Exacta | Exacta |
| **Subtítulos** | Sí (ASS) | No | No |
| **Aprobación Manual** | Sí | No | Sí |
| **Confiabilidad** | Alta | Alta | Alta |
| **Líneas Código** | 2189 | 1361 | ~1500 |

**Siguiente Check-in**: 2026-07-17 (converger v3 mejoras a v2)

---

**Mantenido por**: [@jorucarbus](https://github.com/jorucarbus)  
**Stack**: Node.js + Gemini + ElevenLabs + FFmpeg + Google Drive/Sheets  
**Licencia**: MIT (privado para uso personal/laboral)

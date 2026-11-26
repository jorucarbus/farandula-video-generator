# Camino de consolidación: de la app de farándula + el motor nuevo a UNA sola herramienta

Fecha: 2026-11-25. Estado: borrador para aprobar. Nada de esto está construido todavía.

## 0. Hallazgo que cambia el plan

El motor nuevo NO es una app aparte: vive en el MISMO repositorio que la app de farándula
(`jorucarbus/farandula-video-generator`, rama `feat/edl-motor`, 92 commits por delante de `main`, 0 por detrás).
Los módulos viejos (`gemini.js`, `guionGrafo.js`, `fuentes.js`, `elevenlabs.js`, `revisionGuion.js`, `famosos.js`,
`colaRender.js`, `drive.js`, `sheets.js`…) están en la raíz y los módulos nuevos ya los usan
(`edl/director.js`, `edl/biblioteca.js`, `edl/personas.js`… requieren `../gemini`).

Consecuencia: "traer lo que sirve de la app vieja" no es portar código. Es **conectar** el motor a la tubería
que ya existe en `server.js` y **retirar** lo que el motor reemplaza. Hoy el motor sin muñeco se corre por
scripts (`scripts/video-narrativo.js`), no desde el servidor ni la interfaz.

## 1. La tubería objetivo (un solo camino, de link a MP4)

```
link / video / texto
 → LECTURA            fuentes.js + gemini.extraerActa            (YA EXISTE)
 → CRÓNICA            enriquecerContexto + sintetizarCronica     (YA EXISTE)
 → GUION              guionGrafo.js (elige estructura) + escribirGuion   (YA EXISTE)
 → REVISIÓN           revisionGuion.js (anti-invento, menores)   (YA EXISTE)
 → [aprobación]       editor de guion en la interfaz             (YA EXISTE)
 → VOZ + TIEMPOS      elevenlabs.generarAudioConTiempos          (EXISTE; hoy duplicado en scripts/noticia-voz.js)
 → DIRECTOR           edl/director.js: beats → elementos (mapa, cifra, lista, gráfico, círculos…)  (NUEVO)
 → ENSAMBLADOR+RENDER lienzo/ensamblador.js + render.js          (NUEVO)
 → COLA + DRIVE + SHEETS  colaRender, drive, sheets               (YA EXISTE)
```

Lo que falta no es ninguna etapa: es **el empalme** entre `revisión`/`voz` y el `director`, más sacar `generate-video`
del montaje viejo (`video.js`).

## 2. Qué se hace con cada módulo viejo

### Se usa tal cual (solo se cablea)
| Módulo | Por qué |
|---|---|
| `fuentes.js`, `gemini.js` (lectura, crónica, guion) | Ya lee link, YouTube, TikTok/IG/X/FB (video completo a Gemini) y texto. Hoy yo escribo los hechos a mano: es lo que más tokens gasta |
| `guionGrafo.js` + `catalogo-tecnicas.json` | El motor elige la estructura narrativa. Pedido explícito de la dueña |
| `revisionGuion.js` | Control anti-invento y de menores. Sin esto no se automatiza con seguridad |
| `famosos.js` | Corrige nombres fonéticos y los une con las ~272 carpetas de Drive |
| `expresiones.js`, `largos.js`, `ajusteDuracion.js` | Variedad de aperturas, reglas de longitud, ajuste a la ventana de duración |
| `colaRender.js`, `jobStore.js`, `driveCache.js`, `ajustes.js`, `metricas.js` | Cola, estado que sobrevive a Railway, interruptores, medición por etapa |
| `drive.js`, `sheets.js`, `portada.js` | Carpetas, subida, registro por video, portada |
| `encuadres.js` | Videos gemelos con sesgos opuestos por canal (base de `canales.json`) |
| `materiales.js` | Entrevistas, fotos y videos de apoyo que sube la usuaria; sirve para "fotos aumentables" de mencionados |

### Se reemplaza (la pieza nueva ya hace mejor el mismo trabajo)
| Viejo | Nuevo | Qué hay que portar antes de borrar |
|---|---|---|
| `video.js` (montaje xfade) | `lienzo/ensamblador.js` + `render.js` | Timeout duro de ffmpeg, NVENC si existe |
| `seleccion.js` (planificador por %) | `edl/biblioteca.js` + director | La rotación sin repetir (`historial.json`) y "primer y último clip de fuentes distintas" |
| `subtitulos.js` (ASS) | `lienzo/subtitulos.js` | Tipografías elegibles |
| `fragmentarPorGuion` / `asignarMateriales` | anclas por palabra del director | Nada |
| Guion técnico de Gemini (transiciones/SFX por párrafo) | director + `lienzo/sonidos.js` | Nada |
| `musica.js` vs `lienzo/musicaFondo.js` | unificar en uno | Etiquetas `[inicio]`/`[lufs]` ya comparten formato |
| `elevenlabs.js` vs `scripts/noticia-voz.js` | unificar en `elevenlabs.js` | Tiempos por carácter → palabras |

### Se descarta
- Overlays de emoji por ffmpeg (colgaban; el emoji nuevo va por canvas).
- Marcas de actuación `[excited]` en la parte de VIDEO: solo se conservan en la parte de voz.
- Todo el muñeco, 3D, hojas, kits de plastilina, `assets3d/`, `titere*.js`, `storyboard.js`: archivados por decisión del 2026-11-24 (ver memoria).

## 3. El camino, en orden, con criterio de salida

Regla: **no se construye nada que dependa de algo que todavía no funciona de punta a punta.**

### Fase A — Tubería de punta a punta sin interfaz (la que desbloquea todo)
`node scripts/noticia-a-video.js <link>` produce el MP4 sin intervención: lectura → crónica → guion (grafo) → revisión → voz → director → render.
- Salida: el video de Mara Topic reproducido desde el link, sin que yo escriba hechos.
- Medir: tiempo por etapa (`metricas.js`), costo Gemini + ElevenLabs, y comparar el guion automático con el que escribí a mano.
- Puntos de decisión que aparecen aquí: tope de palabras (≥60 s), cifras con decimales, una cifra por frase.

### Fase B — Meter el motor en el servidor
`/api/generate-video` elige motor (`edl` o legado), usa la cola real y guarda en Drive/Sheets. Un solo paso nuevo en la interfaz.
- Salida: un video del motor nuevo desde la interfaz, en staging (`test-persistencia`), sin tocar producción.
- Cuidado: un push a `test-persistencia` reinicia staging y mata renders; mirar `/api/cola` antes.

### Fase C — Canales
`canales.json` con una ficha por canal (hermano, monetiza, largo, voz, tono de música, carpeta Drive, hashtags, sesgo, estilo visual). Gemelos: lectura y crónica una vez; guion, voz y render por canal.
- Salida: una noticia → dos videos (canales hermanos) con guion distinto.

### Fase D — Biblioteca confiable (puerta de calidad)
Calidad por clip (resolución efectiva, bitrate, nitidez, bordes, rotación), texto/logos, rostro local (MediaPipe) y reencuadre del video dentro de su tarjeta cuando una tarjeta lo tapa.
- Salida: la hoja de contacto de una carpeta con notas, y el corte lo fija la dueña a ojo una vez.

### Fase E — Gráficos nuevos
Ruta de avión, VS/apoyo/emoji (con tope), resaltes de rostro/objeto, fondos por canal. Orden por costo/beneficio: avión → VS+emoji → fondos (dependen de Fase C) → resaltes (dependen de Fase D).

### Fase F — Gestor + Selector + editor en una sola ventana
Selector (Python) queda tal cual; el gestor indexa clips de famosos y videos editados por canal; "Crear video" lanza el motor. Dos procesos, un `INICIAR.bat`, etiquetas en JSON por clip.
- Va DESPUÉS porque el gestor solo vale si ya hay etiquetas fiables (Fase D) y un motor invocable (Fase B).

## 4. Qué es inútil hacer ahora (y por qué)

1. **Gestor o fusión con el Selector antes de la Fase A/D.** Sin tubería ni etiquetas no hay qué gestionar.
2. **Portar la rotación de `seleccion.js` a Python o a la interfaz.** Vive en la biblioteca del motor; basta una función.
3. **Resaltes por Gemini con cuadros extra** para rostros: el detector local lo hace gratis (Fase D).
4. **Fondos por canal antes de `canales.json`.** No tienen dónde vivir.
5. **Más gráficos antes de que el guion automático los pida.** Hoy el director los crea; sin guion automático los pruebo a mano.
6. **Reparar `video-downloader`.** Obsoleto; solo se rescatan piezas sueltas si hace falta.
7. **Pulir la interfaz del paso nuevo** antes de que el render automático salga bien.
8. **Más SFX, más texturas, más plantillas** sin una necesidad concreta que el video muestre.

## 5. Decisiones que necesito de la dueña

1. ¿Rama destino? Hoy `feat/edl-motor` (no está en `main` ni en `test-persistencia`). Propuesta: fusionar primero en `test-persistencia` (staging) y solo pasar a `main` cuando ella lo dé por probado.
2. El interruptor `videosCortos` (guiones de ~30 s) choca con el mínimo de 60 s del motor. ¿Se retira o se mantiene solo para el motor viejo?
3. ¿Qué escribe el guion: el motor `grafo` con Gemini (como hoy en la app) o también probar con Claude? Cuestión de costo y de tono, se mide a ciegas en la Fase A.
4. ¿Dónde corre el Selector? Debe ser un disco local, no `G:\Mi unidad` (las cookies de `datos/` se sincronizarían a Google Drive).

## 6. Riesgos conocidos

- Cifras con decimales (199,99 sale como 199) y frases con varios datos: se arreglan en la Fase A.
- Pocos clips buenos por carpeta → tomas repetidas (Mara: 12 buenos de 22).
- `drive.js` y `sheets.js` hacen llamadas reales: las pruebas locales usan el cliente falso, instalado ANTES de cargar `driveCache` (lección del vaciado de `jobs.json`).
- No se toca la carpeta de la app viva; todo se hace en el clon `C:\Users\jorucarbus\proyectos\farandula-motor-edl`.

## 7. Estado (2026-11-25)

- **A** (link → MP4 automático): hecha. **B** (motor en la cola del servidor, `POST /api/generate-video-edl`): hecha, probada con falsos y proceso real; falta botón en la interfaz vieja.
- **C** (`canales.json`, gemelos con lectura compartida): hecha. **D** (calidad por clip, rostros locales, reencuadre): hecha; falta censura de texto/logos.
- **E** (ruta de avión, VS/apoyo, resaltes de rostro que siguen la cara): hecha. Fondos por canal: descartados por la dueña por ahora. Resaltes de objetos: pendientes (necesitan Gemini).
- **F** (superapp): primera versión en `gestor/` (`INICIAR-SUPERAPP.bat`): biblioteca unificada con miniaturas y filtros de calidad, acciones en grupo (papelera con restauración, importar desde el Selector, medir calidad y rostros, etiquetar con Gemini), Selector incrustado, crear video (con gemelo) y videos listos. El Selector vive en `..\selector-videos` (copia local sin cookies) y sigue siendo un proceso Python aparte.

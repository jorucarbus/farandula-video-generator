# Plan: multifuente en la lectura + reskin neutro

> **Estado: APROBADO, sin empezar.** Acordado con el usuario el 2026-08-05 (Windows) para
> ejecutarse "mañana o pasado", posiblemente **desde la Mac**. Por eso vive en el repo y no
> solo en `~/.claude/plans/`, que es local a cada máquina.
>
> Las decisiones de abajo ya fueron consultadas y confirmadas por el usuario: acumulación
> secuencial en vez de una sola llamada, **solo audio** (no le interesa nada visual de los
> videos), YouTube automático sin preguntar, reskin **solo de la piel** y con
> `monitoreo-medios-cancilleria` como referencia. No re-preguntar lo ya decidido.

## Context

Dos pedidos independientes para `farandula-video-generator`, a ejecutar en la rama
`test-persistencia`:

**A. Multifuente.** Hoy el Paso 1 acepta UNA sola fuente (link, video o texto). El usuario
quiere cargar varias por noticia — hasta 3 videos cortos (TikTok sobre todo, a veces YouTube,
~2 min cada uno, esporádicamente) más los links y textos que haga falta, y que Gemini
sintetice todo en una sola crónica. Para YouTube prefiere que se intente primero la
**transcripción** en vez de procesar el video, porque el video es lo caro.

**B. Reskin.** El usuario se cansó del estilo neobrutalista (morado, bordes de 3px, sombras
duras). Quiere algo funcional y discreto, "que pueda pasar por una página cualquiera de la
web". Referencia elegida por él: su propio proyecto `monitoreo-medios-cancilleria`.
Alcance confirmado: **solo la piel**, sin tocar la estructura (carrusel de pasos, columnas
Procesos/Productos, historial se quedan como están).

---

## Parte A — Multifuente

### Diseño: acumulación secuencial (decidido con el usuario)

En vez de mandar todas las fuentes juntas en una sola llamada, **cada fuente se procesa por
separado a un "acta" de texto, las actas se acumulan en el job, y una segunda llamada
sintetiza la crónica a partir de ellas.**

Por qué, en orden de importancia real:

1. **Cambiar el sesgo deja de reprocesar los videos.** Hoy `otroSesgo()` (`public/app.js`
   ≈841) llama a `leerFuente()` con la fuente original, o sea vuelve a descargar el video y a
   subirlo a la File API. Con las actas cacheadas en el job, cambiar el sesgo re-ejecuta solo
   la síntesis. Siendo el video lo que disparó el gasto de Gemini, este es el mayor ahorro — y
   ni siquiera depende de la multifuente.
2. **Sin riesgo de límite de payload**: nunca se mandan 3 videos en una request. El tope de 3
   pasa a ser precaución, no límite estructural.
3. **Una fuente que falla no amenaza al resto.**
4. **Feedback progresivo**: "procesando fuente 2 de 3" en vez de una espera larga y opaca.

### Solo el audio: nada de video a Gemini

**Aclaración del usuario: de los videos no le interesa nada visual — ni gestos ni texto en
pantalla — solo lo que se dice.** Eso elimina la única desventaja que tenía la acumulación y
además abarata muchísimo la función.

Hallazgo: **`fuentes.descargarAudio()` ya existe y está exportada, pero no la usa nadie** —
quedó muerta cuando se cambió a video para capturar lo visual. Y `gemini.procesarLectura()` ya
tiene su rama `'audio'` (manda el MP3 inline en base64). El camino barato ya está construido y
probado, solo abandonado. Volver a él es de las cosas más baratas de este plan.

Impacto en costo: Gemini cobra video a ~263 tokens/segundo y audio a ~32. Para 3 fuentes de 2
minutos son **~95.000 tokens como video contra ~11.500 como audio, ~8x menos**. Sumado al
cacheo de actas (que evita reprocesar al cambiar el sesgo), el gasto por noticia baja mucho
respecto de hoy, incluso agregando fuentes.

Consecuencias en el diseño:
- Ninguna fuente sube a la **File API**: el audio va inline. Menos partes móviles y menos fallos.
- El tope de 3 videos deja de ser una preocupación de tamaño; se mantiene como límite de UI
  para que no se dispare el tiempo de descarga.
- El prompt del acta **no** debe pedir nada visual: solo lo dicho, quién lo dice, hechos,
  fechas y declaraciones textuales.

**Graphify: no en esta función.** Para 1-3 fuentes cortas de una noticia un grafo es
sobreingeniería (son pocos miles de tokens y Gemini los sintetiza bien); su valor es comprimir
corpus grandes. Donde sí corresponde es en la "Capa de Grafo incremental" ya esbozada en
`.claude/CLAUDE.md` (sesión 2026-07-22): acumular entidades y patrones narrativos **entre**
noticias para alimentar al generador. Guardar las actas como texto estructurado deja esa puerta
preparada sin construirla ahora.

`youtube-dl-exec` ya es dependencia (`package.json`) y sabe listar y bajar subtítulos, así
que la transcripción **no necesita paquete nuevo**.

### YouTube: transcripción primero, audio como respaldo automático

Decidido con el usuario: **sin preguntar**. Al abaratarse el respaldo (audio en vez de video),
la interrupción dejó de valer la pena. El endpoint queda de **una sola pasada**, sin preflight,
sin parámetro `decisiones` y sin UI de decisión en el Paso 1.

Para cada fuente de YouTube: intentar transcripción; si no hay, bajar el audio y seguir. La
respuesta incluye en `avisos` cuáles se resolvieron por audio, para que quede registro sin
cortar el flujo.

### Cambios

- **`fuentes.js`** — una función nueva:
  - `obtenerTranscripcion(url)`: `--write-auto-sub --sub-lang es --skip-download --sub-format vtt`.
    Parsea el VTT a texto plano (quitar timestamps, cabecera `WEBVTT` y las líneas duplicadas
    que los subtítulos automáticos repiten). Devuelve `null` si no hay subtítulos, y el
    llamador cae al audio. No hace falta un `hayTranscripcion()` aparte: al ser automático el
    respaldo, alcanza con intentar y ver si vino algo.
  Reusar `TEMP_DIR` y el patrón de rutas temporales de `descargarAudio()`.

- **`server.js` (`/api/read`)** — extraer la cadena `if/else` actual a
  `resolverFuente({ type, content })` que devuelve `{ texto | audioPath, etiqueta, error? }`.
  El endpoint pasa a recorrer un array. Reglas:
  - `link` + YouTube → `obtenerTranscripcion`; si devuelve `null` → `descargarAudio`.
  - `link` + social (TikTok/IG) → **`descargarAudio`** (ya no `descargarVideo` + File API).
  - `link` normal → `extraerTextoWeb` (igual que hoy).
  - `video` forzado → **`descargarAudio`**.
  - `text` → texto directo.
  - **Tope: 3 fuentes con audio.** Rechazar con 400 si se pasa.
  - `descargarVideo()` queda sin uso en este flujo. **No borrarla**: la usa el fallback de
    YouTube en el camino viejo y puede servir si algún día vuelve a interesar lo visual.
  - **Una fuente que falla no aborta el resto**: se acumula el error, se sigue con las demás y
    la respuesta incluye `avisos: []`. Solo falla si NO queda ninguna fuente utilizable.

- **`gemini.js`** — la lectura se parte en dos etapas y dos prompts:
  - `extraerActa(fuenteResuelta)` → **`PROMPTS.acta`** (nuevo): devuelve texto estructurado de
    UNA fuente de audio (qué se dice, quién lo dice, hechos, fechas, declaraciones textuales).
    **Nada visual.** Sin sesgo todavía: el acta es neutral y reutilizable para cualquier sesgo.
    Las fuentes que YA son texto (web, texto manual, transcripción de YouTube) **no necesitan
    esta llamada**: pasan directo a la síntesis. Solo el audio requiere extracción.
  - `sintetizarLectura(actas, sesgo)` → **`PROMPTS.lectura`** reescrito: recibe las actas y
    devuelve el mismo JSON de hoy (`cronica`, `titulo`, `descripcion`, `protagonista`,
    `secundario`, `accion`). Debe **sintetizar**, no concatenar: resolver contradicciones entre
    versiones y unificar. Aquí se gana o se pierde la calidad; conviene iterar con casos reales.
  - Mantener `procesarLectura()` con su firma actual como envoltorio, para no romper llamadas
    existentes.
  - **Las actas se guardan en el job** (`jobStore`) junto a `fuentes`. Es lo que permite que
    `otroSesgo()` re-sintetice sin volver a tocar los videos.

- **`public/index.html` + `app.js`** — el Paso 1 pasa a fila repetible (select de tipo +
  textarea + botón de quitar) con "+ Agregar fuente". El sesgo sigue siendo uno solo para todas.
  Recolectar en `state.fuentes = [{type, content}]`.

- **`otroSesgo()`** (`app.js` ≈841) — dejar de llamar a `leerFuente()`. Pasa a pedir solo la
  re-síntesis con las actas ya guardadas en el job. Es el cambio que materializa el ahorro.

- **Compatibilidad hacia atrás**: `jobStore` guarda hoy `fuente: {type, content, sesgo}`.
  Pasa a `fuentes: [...]` + `actas: [...]`, pero los 3 lugares que lo leen en `app.js` (≈307 al
  guardar, ≈841 en "otro sesgo", ≈1154 al recuperar un job) deben aceptar **las dos formas** o
  los jobs viejos del historial se rompen. Un job viejo no tiene actas: en ese caso
  `otroSesgo()` cae al camino actual de releer la fuente.

**Estimado: 5-6 h.** El segundo prompt, el cacheo de actas y el progreso por fuente suman
trabajo, pero se compensa: al resolverse YouTube automáticamente desaparecen el preflight, el
doble viaje al servidor y la UI de decisión, y al usar solo audio desaparece todo el manejo de
File API.

---

## Parte B — Reskin neutro

### Sistema de diseño extraído de `monitoreo-medios-cancilleria`

Leído de las clases Tailwind reales de sus componentes (`src/app/*.tsx`). El hallazgo que
define el look: **cero sombras en todo el proyecto**.

| Elemento | Patrón del monitor | Hex |
|---|---|---|
| Fondo de página | `bg-slate-50` | `#f8fafc` |
| Tarjeta | `rounded-lg border border-slate-200 bg-white p-5` | borde `#e2e8f0`, radio 8px |
| Fila anidada | `rounded border border-slate-100 bg-slate-50 p-3 text-sm` | — |
| Título principal | `text-2xl font-semibold text-blue-900` | `#1e3a8a` |
| Texto atenuado | `text-sm text-slate-500` | `#64748b` |
| Botón primario | `rounded bg-blue-900 px-4 py-2 text-sm font-medium text-white` | — |
| Enlace | `text-sm text-blue-700 hover:underline` | `#1d4ed8` |
| Bordes de input | `border-slate-300` | `#cbd5e1` |
| Peso dominante | `font-medium` (500) | — |
| Tamaño dominante | `text-sm` / `text-xs` — tipografía chica y compacta | — |

### Cambios

- **`public/style.css`** — reescribir el bloque `:root` (hoy `--purple`, `--pink`, `--shadow`,
  `--border`, fuentes Space Grotesk/Inter) con la paleta de arriba. Como el CSS **ya usa
  variables**, buena parte del reskin sale de ahí. Además hay que neutralizar las reglas que
  codifican el look duro: `border: 3px solid`, `box-shadow` de offset, `text-transform:
  uppercase` en botones y badges, y los fondos de color por tarjeta.
- **Tipografía**: reemplazar Space Grotesk + Inter por la fuente del sistema (el monitor usa
  `Arial, Helvetica, sans-serif`). Esto además **elimina los 2 archivos `.woff2`** de
  `public/fonts/` y sus `@font-face` — menos peso y más "página cualquiera".
- **18 estilos inline con color/borde** que se saltan las variables y quedarían como parches
  del look viejo: **12 en `public/index.html`** y **6 generados desde `public/app.js`**
  (`style.cssText` en `renderAsignaciones()` y en las tarjetas del historial). Hay que moverlos
  a clases. Es el trabajo más tedioso de esta parte y el que más se olvida.
- **Iconos Phosphor** (`public/icons.js`): se conservan, encajan con el estilo sobrio. Solo
  revisar que hereden `currentColor`.

**Estimado: 2-3 h.**

---

## Orden sugerido

**B (reskin) primero.** Es más corta, no toca lógica y no se pisa con nada. Hacer A después
evita tener que reescribir estilos de la UI multifuente dos veces — si se hace A primero, las
filas de fuente nuevas nacen con el estilo viejo y hay que rehacerlas.

Pendiente aparte, ya diagnosticado y con plan propio en `.claude/CLAUDE.md`: la fragmentación
por cambio de sujeto (~50 min). Es más barata que ambas y arregla algo que molesta en cada
video, así que si hay poco tiempo, va primero.

## Verificación

**Parte A**, probando en el navegador con el server local (`node server.js`, puerto 3000):
1. 2 links de noticia → una sola crónica que use ambos, no uno solo.
2. Link + texto manual pegado.
3. 1 TikTok + 1 link.
4. YouTube **con** subtítulos → confirmar en el log que usó transcripción y **no** descargó nada.
5. YouTube **sin** subtítulos → cae al audio solo, sin preguntar, y lo reporta en `avisos`.
6. 4 fuentes con audio → 400 con mensaje claro del tope.
7. Un link roto entre fuentes buenas → sigue, avisa cuál falló, la crónica sale igual.
8. Abrir un job **viejo** del historial → no se rompe (compatibilidad `fuente` → `fuentes`).
9. **La prueba que valida el diseño**: leer con un TikTok, después pedir "otro sesgo" y
   confirmar en el log del server que **no** hay descarga — solo la llamada de síntesis. Si
   aparece la descarga, el cacheo de actas no está funcionando.
10. Confirmar que ninguna fuente sube a la **File API** (el audio va inline). Si aparece una
    subida, quedó algún camino usando `descargarVideo`.

**Parte B**: recorrer los 6 pasos y el historial buscando restos del look viejo (morado,
sombras duras, mayúsculas forzadas). Revisar también los estados de error y el panel de
progreso, que son los que suelen quedar sin reskinear. Verificar en móvil (breakpoint 900px)
y con el navegador en 375px de ancho.

## Nota de sincronización

El usuario dijo que quizá haga esto **desde el trabajo (la Mac)**. Aplica el protocolo del
`.claude/CLAUDE.md`: `git fetch origin --prune` y revisar
`git log --oneline test-persistencia..origin/test-persistencia` **antes** de tocar código, y
verificar el push al terminar (`git rev-parse HEAD` == `git ls-remote origin <rama>`).
Hoy (2026-08-05) quedó todo pusheado y `main` == `test-persistencia` == `3f1df48`.

# Plan: automatización completa del video (música, subtítulos, transiciones, dirección)

> **ESTADO: BORRADOR.** No ejecutar. Sin fecha decidida ni alcance cerrado — quedan abiertas
> la elección del motor de TTS y la definición fina del estilo de subtítulos.
>
> El plan anterior (multifuente + reskin neutro) ya está **en el repo**, en
> `.claude/plan-multifuente-reskin.md`. Este es otro trabajo, posterior.

## Context

Hoy el render es cortes limpios de ffmpeg con zoom/espejo opcionales. El usuario quiere que
el video salga **terminado y solo**: música, subtítulos, transiciones y rampas de velocidad,
con salida en dos formatos —video final, o todos los insumos por separado para editar a mano.

Su descripción textual del efecto buscado: *"algo rápido, que entre tomas haga efectos de
deformado de pantalla y movimientos rápidos con cambios de velocidad, con esa curva como de
frenado, no lineal"*.

Decisiones ya tomadas con él:
- **Música**: carpeta en Drive que él cura, la app elige con rotación.
- **Dirección**: quiere los **dos** directores (reglas y Gemini) para poder compararlos, y que
  si uno falla se pase al otro automáticamente.
- **Subtítulos**: quiere varios estilos elegibles; el que le gusta es **palabras con rebote y
  aceleraciones variadas, que no se vea lineal**.

---

## Hallazgos que fundamentan el plan (verificados, no supuestos)

**1. El techo de calidad de los subtítulos era el timing.** El `subtitulos.js` viejo (borrado
hoy, recuperable con `git show 64f2359~1:subtitulos.js`) decía en su propia cabecera que
sincronizaba *"por porcentaje de caracteres"* — o sea **estimaba** cuándo se dice cada palabra.
Por eso derivaba del audio.

**2. ElevenLabs puede dar el timing real.** Endpoint
`POST /v1/text-to-speech/{voice_id}/with-timestamps` (confirmado en su documentación): devuelve
`audio_base64` + `alignment.characters` con `character_start_times_seconds` y
`character_end_times_seconds`. Agrupando caracteres en palabras se obtiene karaoke exacto.
Hoy `elevenlabs.js` usa el endpoint plano y tira esa información.

**3. ffmpeg 6.1.1 (el de `ffmpeg-static`) ya tiene todo.** Verificado con `-filters` sobre el
binario real: `xfade` (**58 transiciones** + `custom` con `expr` propia), `ass`, `subtitles`,
`sidechaincompress`, `amix`, `loudnorm`, `afade`, `setpts`, `atempo`, `perspective`,
`lenscorrection`, `rotate`, `gblur`, `minterpolate`. No hace falta ninguna dependencia nueva.

**4. ASS soporta el easing nativamente.** El tag `\t(<t1>,<t2>,<accel>,<modificadores>)` acepta
un parámetro de aceleración: **`accel` menor que 1 arranca rápido y termina lento** (la curva de
frenado que pide), mayor que 1 al revés. Encadenando dos `\t` con ventanas distintas se hace el
rebote (sobrepasar el tamaño y volver). Encadenar varios `\t` es técnica estándar en ASS pero la
documentación no lo garantiza — **validar en el primer render**.

**5. El zoom actual es lineal y por eso se siente plano.** `filtroZoom()` en `video.js` usa
`1+on/frames*factor`. Cambiarlo a `1+(1-pow(1-on/frames,3))*factor` lo vuelve ease-out cúbico:
una línea, y es el cambio con mejor relación esfuerzo/resultado de todo el plan.

---

## Restricción legal: ningún clip puede pasar de 3 segundos

Requisito explícito del usuario, por uso legítimo del material ajeno.

**Ya está implementado**: `seleccion.js` tiene `CLIP_MAX = 3` y `repartirTomas()` parte
cualquier duración mayor en tomas iguales de ≤3s. Hoy ningún clip individual supera el límite.
O sea, no hay que *agregar* la regla — hay que **evitar que las capas nuevas la rompan**.

Tres formas concretas en que este plan podría violarla si no se cuida:

1. **La corrección de solapamiento de `xfade`.** Para que las transiciones no desincronicen el
   audio hay que cortar `duracion + D` de la fuente. Con `duracion = 3` y `D = 0.3` se leen
   **3.3 segundos continuos** del video original. Solución: acotar de modo que
   `duracion + D ≤ 3`, bajando `CLIP_MAX` a `3 - D_max` cuando haya transiciones activas.
2. **El director fusionando cortes.** `porGemini()` no puede tener permiso para unir clips
   contiguos ni alargar uno. Su salida debe validarse contra el plan: si propone algo que
   exceda 3s, se descarta esa decisión y se usa la de reglas.
3. **Rampas que frenen de más.** Ya está cubierto por la restricción de duración de la sección
   siguiente (el `setpts` mapea `[0,d] → [0,d]`), pero conviene dejarlo asentado.

**Verificación obligatoria**: tras el render, medir cada segmento y afirmar que ninguno supera
3.0s. Es un chequeo barato y protege de una regresión con consecuencias legales, no solo
estéticas.

## La restricción que gobierna todo el diseño

**Cada clip debe conservar su duración exacta.** `seleccion.planificarClips()` reparte la
duración del audio entre los fragmentos, y el video calza con la locución *por construcción*.
Cualquier efecto que altere una duración desincroniza TODO lo que sigue.

Dos consecuencias que hay que respetar sí o sí:

- **`xfade` consume solapamiento.** Con N clips y transición de duración D se pierden
  `(N-1)·D` segundos. Con 28 clips y D=0.3s son **8.1 segundos** de desfase. Solución: al
  cortar cada segmento pedirle `duracion + D` de cola extra, y hacer el `xfade` con
  `offset = duracion`. Así cada segmento aporta exactamente su duración a la línea de tiempo.
  Necesita guarda para cuando el video fuente no tenga esa cola disponible (la lógica de
  offsets de `planificarClips` ya contempla pasarse del final).
- **Las rampas de velocidad no pueden cambiar la duración.** El `setpts` debe mapear
  `[0,d] → [0,d]` de forma monótona: es un *easing sobre el tiempo*, no un cambio de duración.
  Rápido al principio y frenando al final, pero el clip dura lo mismo.

---

## Arquitectura: separar director de renderizador

Esto es lo que le faltó a `montarVideoHyper` y por lo que "no terminó de funcionar": mezclaba
la decisión con el renderizado en un filtergraph gigante y frágil.

**`director.js` (nuevo)** — dos implementaciones con la **misma salida**:
- `porReglas(plan, estilo)` — presets con variación determinista, sin llamadas a Gemini.
- `porGemini(plan, guion)` — decide corte por corte según la energía narrativa.
- `decidir(plan, guion, { modo })` — usa el elegido y **cae automáticamente al otro si falla**,
  dejando en el log cuál se usó realmente (el usuario pidió poder compararlos).

Salida común, un objeto por corte: `{ transicion, duracion, intensidad, rampa }`. El
renderizador no sabe ni le importa quién la generó. Eso permite cambiar de director sin tocar
ffmpeg, y comparar resultados sobre el mismo plan.

**Regla de robustez, heredada de lo que ya funciona**: `montarVideoPlan` reintenta un segmento
plano si falla con efectos. Toda capa nueva mantiene esa propiedad — **el video sale igual**,
degradado pero entero. La cadena de `xfade` cae a `concat` plano si falla.

---

## Módulos

**`elevenlabs.js`** — `pedirTTS()` pasa a `/with-timestamps`; decodificar `audio_base64` y
guardar `alignment` en el job (`jobStore`), junto al audio. Es el habilitador de todo lo demás.

**`subtitulos.js`** — recuperar del historial git como base (ya resuelve partido en bloques,
saltos de línea, fuentes y emojis de Twemoji) y **reemplazar el timing** por los timestamps
reales. Estilos elegibles desde el Paso 6; el principal es rebote: `\t` encadenados con
`accel<1` para el frenado y sobrepaso de escala para el rebote. Las fuentes tipo TikTok que ya
contemplaba (Poppins ExtraBold, Anton, Bangers, Luckiest Guy, Archivo Black) se conservan.

### Especificación visual de los subtítulos

El usuario preguntó si tipografía, colores y formas estaban suficientemente definidos. **No lo
estaban** — la versión anterior de este plan solo nombraba las fuentes. Esto es lo que hay que
fijar, con los tags ASS concretos:

| Aspecto | Definición | Tag ASS |
|---|---|---|
| Lienzo | `PlayResX 1080` / `PlayResY 1920` — si no coincide con el render, todo escala mal | cabecera `[Script Info]` |
| Tamaño | 80-110 px sobre 1920 de alto | `Fontsize` |
| Contorno | Grueso (6-10 px) y negro. **Es lo que hace legible el texto sobre cualquier metraje** | `\bord`, `\3c&H000000&` |
| Sombra | 2-4 px, para despegar del fondo | `\shad`, `\4c` |
| Color base | Blanco | `\1c&HFFFFFF&` |
| Palabra activa | Color de acento (amarillo o verde lima funcionan sobre casi todo) | `\1c` en la línea de la palabra |
| Posición | Centrado, a ~60-65% de la altura | `\an5` + `\pos` |
| Renglones | Máximo 2, ~22 caracteres cada uno (ya resuelto en el código viejo) | `MAX_CHARS_LINEA` |
| Rebote | Sobrepasar escala y volver, con frenado | `\t(0,120,0.6,\fscx115\fscy115)` + `\t(120,200,1.4,\fscx100\fscy100)` |

**Zona segura**: la interfaz de TikTok tapa el ~15% inferior (descripción y botones) y una
franja derecha (~12%, los íconos de acción). Por eso los subtítulos van al 60-65% de altura y
no abajo del todo, que es donde los pondría uno por costumbre de cine.

**Sobre "formas"**: ASS no tiene cajas redondeadas nativas. Hay dos caminos —
`BorderStyle=3` da una caja rectangular opaca detrás del texto (simple, se ve algo tosco), o
dibujar la forma con comandos vectoriales `\p` (control total, bastante más trabajo). Para
empezar recomiendo sin caja, apoyándose en contorno grueso + sombra, que es lo que usa la
mayoría de las cuentas grandes y es lo más legible sobre metraje variado.

**Los estilos elegibles** serían combinaciones de estas variables (fuente + color de acento +
con o sin rebote + tamaño), no motores distintos. Eso mantiene un solo generador.

**`musica.js` (nuevo)** — carpeta nueva en Drive (`GOOGLE_DRIVE_MUSICA_FOLDER_ID`), con rotación
reusando el patrón de `historial.json` de `seleccion.js` para no repetir pista. Recorte a la
duración, `loudnorm` para nivel parejo entre pistas, **`sidechaincompress` para que la música
baje sola bajo la voz**, `afade` de entrada y salida.

**`video.js`** — cadena de `xfade` con la corrección de solapamiento, rampas con `setpts`,
deformado con `perspective`/`lenscorrection`/`gblur`, y el cambio de easing en `filtroZoom`.

**`exportar.js`** — el modo Insumos suma `subtitulos.ass` y `musica.mp3` a lo que ya entrega
(`clips/` + `locucion.mp3`).

---

## TTS propio en RunPod serverless (idea a evaluar, sin decidir)

El usuario quiere abaratar la locución reemplazando ElevenLabs por un modelo propio en RunPod
serverless. Es viable, pero **hay un acoplamiento que decide el diseño**.

### El problema que hay que resolver primero: los timestamps

Todo el plan de subtítulos se apoya en `/with-timestamps` de ElevenLabs. **Si se cambia de
proveedor, esa fuente desaparece.**

La solución correcta no es buscar un TTS que también dé timestamps, sino **desacoplarlos**:
generar el audio con el motor que sea, y sacar los tiempos con **alineación forzada**
(WhisperX o faster-whisper) sobre el audio ya producido, en el mismo worker de RunPod.

Eso tiene tres ventajas que van más allá del ahorro:
- El TTS pasa a ser **intercambiable** sin tocar los subtítulos.
- Funciona también con **audio subido por el usuario** — o sea, la app de tus hermanos, que hoy
  no puede tener subtítulos porque no hay timestamps de ningún lado.
- Permite volver a ElevenLabs cuando convenga sin rehacer nada.

**Recomendación**: hacer este desacople **antes** de migrar el TTS, incluso si al final se
decide seguir con ElevenLabs.

### Candidatos de modelo

| Modelo | Licencia | Nota para este caso |
|---|---|---|
| **Chatterbox** (Resemble) | MIT | Tiene control de intensidad emocional — lo más cercano a las marcas `[excited]`/`[sarcastic]` que ya genera `PROMPTS.marcas` |
| **F5-TTS** | permisiva | Rápido y con clonación por muestra corta; buen candidato general |
| **Kokoro** | Apache-2.0 | Diminuto (82M) y baratísimo, con voces en español. Sin clonación y poca expresividad |
| **XTTS-v2** (Coqui) | **CPML — no comercial** | Muy bueno en español, pero la licencia choca con monetizar TikTok. **Descartar salvo revisión legal** |

### Costos y lo que hay que mirar con cuidado

Un cálculo grueso: en una GPU chica de RunPod serverless (~0.0002-0.0004 USD/s), una locución de
70 segundos son unos 15-25s de GPU entre TTS y alineación, o sea **fracciones de centavo por
video** contra bastante más en ElevenLabs. El ahorro es real y crece con el volumen.

Lo que puede arruinarlo, y hay que medir antes de migrar:
- **Arranque en frío**: RunPod serverless puede tardar 10-60s en levantar si no hay worker
  activo. Con FlashBoot mejora, pero un worker siempre encendido come el ahorro.
- **Calidad expresiva en español**: ElevenLabs v3 con las marcas es difícil de igualar. Hace
  falta un A/B con guiones reales antes de decidir, no una comparación de fichas técnicas.
- **`PROMPTS.marcas` es específico de ElevenLabs**: las etiquetas `[excited]` etc. no las
  entiende otro motor. O se mapean a los controles del modelo elegido, o ese paso se elimina.
- **Consistencia de voz**: hay que fijar una muestra de referencia para clonación y versionarla,
  o la voz cambia entre videos.

**Camino sugerido**: (1) desacoplar timestamps con alineación forzada; (2) montar un worker de
RunPod con un modelo candidato y comparar A/B contra ElevenLabs con guiones reales; (3) recién
ahí decidir. Los pasos 1 y 2 son útiles aunque la decisión final sea quedarse.

## Fases (cada una verificable y desplegable sola)

1. **Easing del zoom** — una línea en `filtroZoom`. Ganancia inmediata, riesgo casi nulo.
2. **Timestamps por alineación forzada** — no atados a ElevenLabs (ver sección de RunPod).
   Habilita los subtítulos y deja el TTS intercambiable. Si se quiere algo más rápido para
   arrancar, `/with-timestamps` de ElevenLabs sirve como puente, pero el destino es la
   alineación propia.
3. **Subtítulos con estilos + rebote** — el bloque más visible para el usuario.
4. **Transiciones `xfade` + rampas** — el más delicado por la restricción de duración.
5. **Música con ducking** — independiente del resto.
6. **Director**: primero `porReglas`, después `porGemini`, con el fallback entre ambos.
7. **Insumos ampliados**.

La **fragmentación por cambio de sujeto** (~50 min, plan aparte en `.claude/CLAUDE.md`) conviene
hacerla **antes de la fase 4**: cambia cuántos fragmentos hay, y por lo tanto cuántas
transiciones y cuánta música/subtítulo se generan.

## Verificación

**Las dos pruebas que no pueden faltar, en cada fase**:

1. **Sincronía**: `ffprobe` sobre el video final y comparar su duración con la del audio. Deben
   coincidir dentro de ~0.1s. Es la regresión que arruinaría todo en silencio, porque el video
   *parece* bien hasta que se nota que la voz va corrida.
2. **Límite de 3 segundos**: medir cada segmento y afirmar que ninguno lo supera. Protege el uso
   legítimo del material, no solo la estética.

Además, por fase:
- **Subtítulos**: render real y revisar en 3 momentos (inicio, medio, final) que la palabra
  resaltada sea la que se está diciendo. El error típico aparece recién al final, cuando el
  desfase se acumula.
- **Transiciones**: contar clips en el video final y verificar que sean los del plan — si
  `xfade` se comió alguno, el conteo lo delata. Probar además con un video fuente **corto**,
  donde la cola extra de `D` segundos no exista, para ejercitar la guarda.
- **Música**: confirmar con el oído que baja bajo la voz, y con `loudnorm` que dos videos
  seguidos tengan nivel parecido.
- **Director**: forzar un fallo del de Gemini (API key inválida) y confirmar que cae a reglas y
  el video sale igual.
- **Fallbacks**: forzar que falle una transición y confirmar que el corte sale plano en vez de
  abortar el render.

## Decisiones que siguen abiertas (por eso es borrador)

- **Motor de TTS**: seguir con ElevenLabs o migrar a RunPod. Depende del A/B de calidad en
  español, que no se hizo.
- **Estilo de subtítulos**: la tabla de arriba fija el marco, pero los valores finales (qué
  fuente, qué color de acento, cuánto rebote) se afinan viendo renders reales, no en un
  documento.
- **Duración de las transiciones** (`D`): condiciona cuánto hay que bajar `CLIP_MAX` para no
  pasar de 3 segundos. Sale de probar cuál se ve bien.

## Nota

El usuario puede trabajar desde la Mac. Aplica el protocolo de `.claude/CLAUDE.md`: `git fetch`
y revisar divergencia antes de tocar código, verificar el push al terminar. Al 2026-08-05 quedó
todo en `f801076`, con `main` y `test-persistencia` alineadas y ambos repos limpios.

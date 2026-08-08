# Plan maestro: camino a la automatización total, sin repetir pasos

## Context

El usuario quiere llegar a que el video salga **terminado solo**: música, subtítulos animados,
transiciones con rampas de velocidad, y salida en dos formatos (video final o insumos sueltos
para editar a mano). Hay varios trabajos ya planificados por separado que si se hacen en el
orden equivocado obligan a rehacer cosas.

Este plan **reemplaza y absorbe** los dos anteriores (`plan-multifuente-reskin.md` y
`borrador-automatizacion-video.md`, ambos en `.claude/` del repo). El aporte propio es el
**orden**: cada fase deja lista la base que la siguiente necesita, para no construir dos veces.

Decisiones ya tomadas con el usuario:
- **TTS**: seguir con ElevenLabs, pero con la puerta abierta a RunPod (interfaz intercambiable).
- **Modelos**: quedarse dentro de Gemini. 3.6 Flash para lo creativo y la lectura de audio;
  3.1 Flash-Lite para lo mecánico. Misma plataforma, misma key, misma cadena de fallback.
- **Subtítulos**: sin muestrario — se va directo al estilo que la investigación indica como
  dominante, con los parámetros expuestos para afinarlos sobre renders reales.
- **Letter motion**: ASS 2D. Blender queda descartado por ahora (ver más abajo).
- **Límite de 3 segundos por clip**: innegociable, por uso legítimo del material.
- **Música por sentido**: subcarpetas por tono, y ante la duda nunca algo alegre.
- **Insumos no llevan transiciones**: son clips sueltos; las transiciones las pone el editor.
- **UI**: interfaz clara con el preview de video sobre superficie oscura, siguiendo al sistema, y
  menos decisiones por corrida — según la evidencia sobre fatiga visual y carga cognitiva, no por
  gusto ni por copiar otra app.

**Cuatro puertas abiertas** que se dejan preparadas sin construirlas:

| Puerta | Hoy | Después |
|---|---|---|
| Fuente de tiempos | ElevenLabs `/with-timestamps` | RunPod con alineación forzada |
| Fragmentación | por guion (cambio de sujeto) | por **ritmo de la música** |
| Guion | por ángulo (5 fijos) | desde el **grafo** acumulado |
| Director de edición | reglas | Gemini, con fallback a reglas |

En los cuatro casos el costo de dejar la puerta ahora es casi cero — una función detrás de un
nombre y un selector. Abrirla después obliga a tocar todo lo que dependa de esa forma. **Dejar
la puerta no es tener resuelto lo que hay del otro lado**: las de ritmo y grafo son proyectos en
sí mismos.

---

## Investigación de precios (agosto 2026, verificada en la web)

OpenAI recortó precios el 30 de julio (Luna −80%). Comparación con lo que el proyecto usa hoy:

| Modelo | Input /1M | Output /1M | Nota |
|---|---|---|---|
| **Gemini 3.6 Flash** | $1.50 | $7.50 | lo que hoy hace TODAS las llamadas |
| **Gemini 3.1 Flash-Lite** | $0.25 | $1.50 | **6x más barato; ya está en la cadena de fallback** |
| GPT-5.6 Luna | $0.20 | $1.20 | solo 20% menos que el anterior, y obliga a otra plataforma |
| Gemini 2.5 Flash-Lite | $0.10 | $0.40 | ⚠️ **deprecado el 16/10/2026** — no usar |
| DeepSeek V4-Flash | $0.14 | $0.28 | ⚠️ anunció **subida de precios** el 6/8/2026, sin tarifas publicadas |

**Conclusión**: quedarse en Gemini y bajar de tier captura casi todo el ahorro sin agregar
proveedor, key, SDK ni manejo de errores nuevo.

**Y lo más importante, para no vender humo**: el gasto grande de este proyecto **nunca estuvo
en el texto**. Estaba en leer video (~263 tokens/segundo contra ~32 del audio). El cambio a
solo-audio de la fase de multifuente baja el costo dominante ~8x por sí solo. El cambio de tier
es un ahorro **secundario y aditivo**.

**Para el guion, el costo es irrelevante**: ~$0.0045 por guion en 3.6 contra ~$0.0007 en un
lite. A 10 videos/día la diferencia es **poco más de un dólar al mes**. No se toca: es lo único
que decide si el video funciona, y `PROMPTS.guion` está afinado para ese modelo (205-220
palabras exactas, efecto bucle, alternancia de ritmo). Bajarlo de tier arriesga mucho para
ahorrar nada.

**Blender descartado**: viable en RunPod pero sin nada llave en mano para tipografía animada, y
con reportes de que en serverless no toma la GPU. Renderizar ~200 palabras animadas en 3D por
video es lento y caro para algo que ASS resuelve casi igual. Se puede retomar si algún día se
quiere un intro 3D distintivo — no para los subtítulos.

---

## Las dos invariantes que gobiernan todo

Cualquier fase que las rompa arruina el video en silencio.

**1. Sincronía.** `seleccion.planificarClips()` reparte la duración del audio entre fragmentos:
el video calza con la locución *por construcción*. Todo efecto debe preservar la duración de
cada clip.
- `xfade` consume solapamiento: con 28 clips y D=0.3s se pierden **8.1 segundos**. Se corrige
  cortando `duracion + D` de la fuente y haciendo el `xfade` con `offset = duracion`.
- Las rampas de velocidad mapean `[0,d] → [0,d]` de forma monótona: es *easing sobre el tiempo*,
  no cambio de duración.

**2. Ningún clip pasa de 3 segundos** (uso legítimo). Ya está implementado con `CLIP_MAX = 3` en
`seleccion.js`. **No hay que agregarlo — hay que evitar que las capas nuevas lo rompan**:
- La cola extra que necesita `xfade` haría leer `3 + D` segundos continuos. Hay que bajar
  `CLIP_MAX` a `3 − D` cuando haya transiciones activas.
- El director no puede fusionar clips contiguos ni alargarlos: su salida se valida contra el
  límite y se descarta lo que lo exceda.

**Verificación obligatoria en cada fase**: `ffprobe` sobre el resultado, comparar duración con la
del audio (±0.1s), y medir cada segmento para afirmar que ninguno supera 3.0s.

---

## Orden de ejecución (esto es el aporte del plan)

Cada fase está donde está por una razón de dependencia, no por preferencia.

### Fase 0 — ~~Muestrario~~ · ELIMINADA
El usuario preguntó si medio día no era mucho y si se podía ir directo a lo que funciona.
**Se puede**: la investigación de captions de TikTok 2026 da un estilo dominante y valores
concretos, así que no hace falta un muestrario para descubrirlos. Se implementa **un solo estilo
con los parámetros expuestos en config**, y el ajuste fino se hace cambiando un color o el
tamaño sobre renders reales — sin reescribir el generador.

**Valores por defecto, según la investigación** (no inventados):

| Parámetro | Valor | Fundamento |
|---|---|---|
| Estilo | **Palabra por palabra resaltada** | Es el que mejor rinde en 2026: mantiene el ojo en movimiento y sigue el ritmo del habla |
| Fuente | Sans-serif **bold 700+** (Poppins ExtraBold o Montserrat) | Las decorativas pierden legibilidad; bold da ~31% mejor lectura |
| Tamaño | **55-75 pt** sobre 1080×1920 | Rango estándar para 9:16 |
| Color | Blanco con **contorno negro** | El de mayor contraste sobre cualquier metraje |
| Resalte | **Amarillo `#f7c204`** | El más usado; rojo y verde son alternativas |
| Posición | **Tercio medio-bajo**, centrado | Legible sin chocar con la interfaz de TikTok |
| Renglones | Máximo 2 | — |

⚠️ Esto corrige algo del plan viejo: yo había listado fuentes decorativas (Bangers, Luckiest
Guy) tomadas del código borrado. **La investigación dice que perjudican la legibilidad.** Poppins
ExtraBold sí sirve, por ser sans geométrica.

El rebote con aceleración no lineal que pidió el usuario se suma encima de esa base, con `\t`
encadenados y `accel<1`.

### Fase 1 — Reskin neutro y de bajo cansancio · 3-4 h
**Por qué acá**: todas las fases siguientes agregan UI (filas de fuentes, opciones de subtítulo,
controles de transición). Si el reskin va después, esa UI nace con el estilo viejo y hay que
rehacerla.

**Descartada la referencia a `monitoreo-medios-cancilleria`**: es otro tipo de herramienta. La
base sale de investigar qué está establecido para trabajo de video y automatización.

**El hallazgo central, y contradice tanto mi recomendación anterior como la intuición de "es una
app de video, va oscura":**

Las herramientas de video (Premiere, DaVinci, CapCut) son oscuras por una razón concreta: **una
interfaz blanca al lado del video crea un contraste de luminancia incómodo y sesga cómo se
percibe el material**. Es una decisión funcional para gente que corrige color todo el día.

Pero las guías de UI oscura desaconsejan explícitamente usarla en **"contenido con mucho texto o
aplicaciones centradas en la lectura"** y en **"contenido mixto: formularios, tablas, widgets"**.
Y eso es exactamente esta app: se lee la crónica, se edita un guion de 205-220 palabras, se
revisan 14+ asignaciones con desplegables, se llenan formularios. **El video aparece al final,
unos segundos, como preview.** No es un editor de video: es un flujo de texto que produce video.

**Recomendación: interfaz clara, con el preview de video sobre superficie oscura.** Es lo que
hacen las herramientas de video en web (YouTube Studio, Descript): el reproductor va en una caja
oscura dentro de una interfaz clara. Se queda con la ventaja de cada cosa sin pagar la desventaja
de ninguna. Además `prefers-color-scheme` para que siga al sistema si trabaja de noche — con las
variables CSS que ya existen son pocas líneas.

**Valores concretos, si se usa oscuro en alguna zona** (superficie del preview, o el tema
nocturno): superficie **`#121212`**, texto **`#E0E0E0`–`#FAFAFA`**. **Nunca negro puro con
blanco puro**: la relación de luminancia extrema produce *halation* (el texto vibra o florece) y
es especialmente molesto para quien tiene astigmatismo. WCAG AA (4.5:1 en texto de cuerpo) es el
**piso, no la meta**.

**El contraste importa más que el modo.** En claro, evitar el blanco puro que encandila — usar un
gris muy claro de fondo (`#f8fafc`) con tarjetas blancas.

**3. Menos decisiones por corrida.** El usuario repite el mismo flujo varias veces al día; la
investigación de carga cognitiva recomienda **valores por defecto inteligentes y campos
prellenados**. Concretamente acá: recordar el último canal, los últimos presets de efectos y el
estilo de subtítulo elegido, en vez de volver a preguntarlos en cada video.

**4. Atajos de teclado** para el camino repetitivo — es la recomendación estándar para usuarios
expertos en herramientas de uso intensivo, y el usuario es experto en su propia app.

**5. Agrupar acciones relacionadas** visual y estructuralmente: acorta el tiempo de decisión.
Esto ya se cumple bastante con las columnas Procesos/Productos.

**6. Que se note dónde te toca intervenir.** El usuario pidió que sea intuitivo justo en los
puntos donde la app espera algo de él. Hoy eso está resuelto con `data-status` en cada paso
(`locked`/`active`/`done`), pero el estado *activo* tiene que ser el elemento de mayor contraste
de la pantalla — que al volver después de esperar un render se vea de un vistazo qué sigue, sin
buscarlo. Los pasos completados y bloqueados se atenúan; el activo destaca. Es el mismo criterio
que ya usa el sistema de scroll-snap, aplicado al estado del flujo.

Alcance: sigue siendo **solo la piel** más estos ajustes de ergonomía; no se rehace la
estructura. Ojo con los **18 estilos inline con color** (12 en `index.html`, 6 en `app.js`) que
se saltan las variables CSS y quedarían como parches del look viejo.

### Fase 2 — Fragmentación por cambio de sujeto · ~50 min
**Por qué acá**: cambia **cuántos fragmentos hay**, y de eso dependen cuántas transiciones,
cuánto subtítulo y cómo se reparte la música. Hacerlo después obliga a reafinar todo eso.
Además es lo más barato de la lista y arregla algo que molesta en cada video.
Causa raíz ya diagnosticada: la **regla 5** del prompt ordena *"si un fragmento habla de dos
famosos, elige al que tenga más peso"* — o sea, ante un cambio de sujeto le manda NO partir. Y
la regla 2 dispara por longitud (>140 chars), no por cambio de sujeto.
Tres cambios: arreglar reglas 2 y 5; verificar que los fragmentos reconstruyan el guion (hoy
nadie lo comprueba y si Gemini recorta palabras se corren los tiempos de todos los clips); y
guarda de duración mínima (~0.7s) para que no aparezcan parpadeos.

**Puerta abierta pedida por el usuario**: dejar la fragmentación como **interfaz con dos
implementaciones**, aunque hoy solo exista una.
- `fragmentarPorGuion()` — la actual: los cortes salen del texto y del cambio de sujeto.
- `fragmentarPorRitmo()` — **futura, no se construye ahora**: toma la duración de la locución
  igual que hoy, pero **los cortes caen en el pulso de la música elegida**.

Costo de dejar la puerta: prácticamente cero si se hace en esta fase (extraer la función actual
detrás de un nombre y un selector). Reabrirla después significa tocar todo lo que dependa de la
forma del plan.

Apunte técnico para cuando se retome: hace falta una grilla de pulsos de la pista (detección de
onsets con ffmpeg, o `aubio`/`librosa` en el worker), y después **encajar los cortes en los
pulsos más cercanos sin romper las dos invariantes** — la suma sigue siendo la duración del
audio, y ningún clip pasa de 3 segundos. Como los pulsos pueden estar más separados que eso,
habrá que subdividir compases. Esa es la parte difícil, y por eso queda para después.

**Segunda puerta, misma forma**: dejar también `generarGuion()` detrás de una interfaz.
- `porAngulo()` — la actual: lee la crónica, se elige uno de 5 ángulos, escribe.
- `porGrafo()` — **futura**: en vez de partir de ángulos fijos, consultar el grafo acumulado
  (entidades, relaciones y qué patrones narrativos funcionaron antes) para proponer variantes y
  ordenarlas.

Esto retoma el diseño que el usuario ya dejó esbozado el 2026-07-22 en `.claude/CLAUDE.md`
(capa de literatura + generador que rankea + grafo incremental). Y hay una sinergia real con la
Fase 4: **las "actas" de cada fuente son la entrada natural de ese grafo** — texto estructurado
por noticia, acumulándose solo. O sea, la Fase 4 alimenta esta puerta sin trabajo extra.

Honestidad sobre esta puerta: es la más especulativa de las cuatro. Dejarla cuesta casi nada
(una función detrás de un nombre), pero **construirla es un proyecto en sí mismo** — sobre todo
la parte de "viralidad predicha", que no tiene método validado. Conviene que quede claro que
abrir la puerta no es lo mismo que tener resuelto lo que hay del otro lado.

### Fase 3 — Router de modelos dentro de Gemini · ~1 h
3.6 Flash para `generarGuion` y `procesarLectura`; **3.1 Flash-Lite** para `fragmentarGuionParrafos`,
`agregarMarcas`, `generarNombreArchivo` y el futuro director.
**Por qué acá**: las fases siguientes agregan llamadas nuevas (director, énfasis de subtítulos).
Si el router existe antes, nacen ya en el tier barato en vez de migrarlas después.
Implementación: `callGemini()` ya recorre la constante `MODELOS`; basta con aceptar una cadena
de modelos por tarea manteniendo el fallback actual. Sin proveedor nuevo.

### Fase 4 — Multifuente + solo audio · 5-6 h
Varias fuentes por noticia, cada una procesada a un "acta" de texto que se **cachea en el job**;
una segunda llamada sintetiza la crónica.
**Por qué acá**: es el mayor ahorro real (solo-audio, ~8x) y es independiente del pipeline de
render, así que no bloquea nada. Su UI ya nace con el estilo nuevo de la Fase 1.
Beneficio que no depende de la multifuente: hoy `otroSesgo()` vuelve a **descargar y resubir el
video**; con las actas cacheadas solo re-sintetiza.
`fuentes.descargarAudio()` ya existe y está exportada, **sin usar** — quedó muerta cuando se
pasó a video. Volver a ella es de lo más barato del plan.

### Fase 5 — Fuente de tiempos, intercambiable · ~2 h
Interfaz `obtenerTiempos(audio, texto)` con **dos implementaciones**: ElevenLabs
`/with-timestamps` (ahora) y RunPod con alineación forzada (después). El resto del código no
sabe cuál se usó.
**Por qué así**: es la "puerta abierta a RunPod" pedida, sin pagar hoy su complejidad. Y de yapa,
la alineación forzada haría funcionar los subtítulos en la **app de los hermanos**, donde el
audio lo sube el usuario y no hay timestamps de ningún proveedor.
El `subtitulos.js` viejo (recuperable con `git show 64f2359~1:subtitulos.js`) estimaba el timing
*"por porcentaje de caracteres"* — ese era el techo de calidad.

### Fase 6 — Subtítulos · con el estilo de la Fase 0
Generador ASS con timing real. Contorno grueso (lo que los hace legibles sobre cualquier
metraje), palabra activa resaltada, rebote con `\t` encadenados y `accel<1` para el frenado.
Zona segura: al 60-65% de altura, porque TikTok tapa el 15% inferior con su interfaz.

### Fase 7 — Transiciones + rampas · la más delicada
`xfade` (58 transiciones + `custom` con expresión propia), `setpts` para las rampas,
`perspective`/`lenscorrection`/`gblur` para el deformado. Acá se aplica la corrección de
solapamiento y el ajuste de `CLIP_MAX`.
Cambio de una línea con la mejor relación esfuerzo/resultado de todo el plan: `filtroZoom()` usa
hoy `1+on/frames*factor`, **lineal**, y por eso el zoom se siente plano. Pasarlo a
`1+(1-pow(1-on/frames,3))*factor` lo vuelve ease-out cúbico.

### Fase 8 — Música por sentido · independiente
Carpeta nueva en Drive curada por el usuario (`GOOGLE_DRIVE_MUSICA_FOLDER_ID`), pero **con
subcarpetas por sentido**, no una bolsa única. Estructura tipo:

```
Musica/
  tragedia/     tension/      escandalo/
  alegre/       romantico/    neutral/
```

Misma forma que `Videos_Famosos_Carpetas/`, así que reusa `obtenerCarpetasFamosos()` y la
rotación de `historial.json` de `seleccion.js` — no hay que inventar nada.

**Quién elige el sentido**: la lectura ya produce la crónica y conoce el tono. Se le agrega un
campo `tono` al JSON de `PROMPTS.lectura` (una palabra, de la lista de subcarpetas existentes),
y la app busca la carpeta que coincida. Es una clasificación mecánica: va en el tier barato
(3.1 Flash-Lite) de la Fase 3.

**Requisito explícito del usuario**: *"no quiero que salga un perreo divertido en la noticia de
una tragedia"*. Por eso el comportamiento ante la duda es **caer a `neutral/`**, nunca a algo
alegre. Si el tono devuelto no coincide con ninguna subcarpeta, o viene vacío, va a `neutral/`.
Y si `neutral/` está vacía, **el video sale sin música** en vez de con una al azar — un video sin
música es un problema estético; uno con música equivocada sobre una tragedia es un problema
serio.

Lo demás igual: `loudnorm` para nivel parejo entre pistas, **`sidechaincompress` para que baje
sola bajo la voz**, `afade` de entrada y salida.

### Fase 9 — Director · usa la Fase 3 y ejecuta lo de la Fase 7
`director.js` con dos implementaciones de **misma salida**: `porReglas(plan, estilo)` y
`porGemini(plan, guion)`, más `decidir()` que usa el elegido y **cae al otro si falla**, dejando
en el log cuál se usó. Salida por corte: `{transicion, duracion, intensidad, rampa}`.
**Por qué al final**: separar decisión de renderizado es exactamente lo que le faltó a
`montarVideoHyper` (mezclaba ambas en un filtergraph gigante y por eso "no terminó de
funcionar"). El renderizador tiene que estar sólido antes de ponerle un director encima.

### Fase 10 — Insumos ampliados
**Corrección del usuario, importante**: en modo Insumos **no hay transiciones**. Las
transiciones son un efecto *entre* clips, y los insumos se entregan como clips sueltos para
editar a mano — el que corta decide sus propias transiciones.

Qué aplica y qué no en cada salida:

| | Video final | Insumos |
|---|---|---|
| Zoom / espejo / rampas (efectos **dentro** del clip) | sí | **sí** — van quemados en cada clip |
| Transiciones (efecto **entre** clips) | sí | **no** — no tiene sentido |
| Subtítulos | quemados en el video | como **`subtitulos.ass` aparte**, para que el editor lo aplique o lo modifique |
| Música | mezclada con ducking | como **`musica.mp3` aparte**, sin mezclar |

Consecuencia práctica: en Insumos **no aplica el ajuste de `CLIP_MAX` por la cola de `xfade`**
(no hay solapamiento que compensar), así que ahí los clips pueden usar los 3 segundos completos.
La UI del Paso 6 debe ocultar los controles de transición cuando el modo es Insumos — hoy
además sigue pidiendo carpeta de destino, que el servidor ignora desde julio; conviene limpiarlo
en la misma pasada.

### Fase 11 — Desplegar `farandula-video-family` a Railway
Independiente de todo. Pendiente desde que se construyó: falta proyecto propio, Postgres y las
variables (con `credentials.json` **como variable de entorno**, no como archivo).

---

## Regla de robustez, para todas las fases

`montarVideoPlan` ya reintenta un segmento plano si falla con efectos. **Toda capa nueva mantiene
esa propiedad**: el video sale igual, degradado pero entero. La cadena de `xfade` cae a `concat`
plano; el director de Gemini cae a reglas; los subtítulos, si fallan, se omiten sin abortar.

## Verificación

**Las dos que no pueden faltar en cada fase**: sincronía (duración del video == duración del
audio, ±0.1s) y límite de 3 segundos por segmento.

Por fase:
- **Subtítulos**: revisar en inicio, medio y **final** que la palabra resaltada sea la que se
  dice. El desfase se acumula, así que el error aparece recién al final.
- **Transiciones**: contar clips del video final contra el plan; si `xfade` se comió alguno, el
  conteo lo delata. Probar con un video fuente **corto**, donde la cola de `D` no exista.
- **Multifuente**: leer con un TikTok, pedir "otro sesgo" y confirmar en el log que **no hay
  descarga** — solo la síntesis. Si aparece, el cacheo de actas no funciona.
- **Router**: confirmar en el log qué modelo atendió cada llamada.
- **Director**: forzar un fallo (key inválida) y confirmar que cae a reglas y el video sale.
- **Fragmentación**: probar `fragmentarGuionParrafos()` directo con guiones que tengan cambios
  de sujeto, sin correr el pipeline completo (~30s por corrida).

## Nota de sincronización

El usuario puede trabajar desde la Mac. Protocolo de `.claude/CLAUDE.md`: `git fetch` y revisar
divergencia **antes** de tocar código; verificar el push al terminar (`git rev-parse HEAD` ==
`git ls-remote origin <rama>`). Al 2026-08-08 está todo en `1d8b1f4` (`test-persistencia`),
`main` en `f801076`, ambos repos limpios.

Las fases 1, 2 y 4 son bastante independientes entre sí: si se trabaja desde dos máquinas,
son las que menos riesgo de conflicto tienen.

# Estado vivo — para retomar desde cualquier herramienta (Claude Code, Codex, Mac)

Este archivo dice **qué está a medio hacer ahora mismo**. El plan completo (por qué, en qué
orden, qué investigación lo respalda) vive en `.claude/plan-maestro-automatizacion.md` — léelo
primero si no conoces el proyecto. Este archivo solo trackea progreso.

Las dos invariantes que ninguna fase puede romper: video == duración del audio (±0.1s), ningún
clip pasa de 3.0s (uso legítimo, ver memoria `farandula-limite-3-segundos`).

## Estado al 2026-08-08

**Fases 1, 2, 3 y 4 TERMINADAS hoy** + una corrección importante sobre la Fase 2 el mismo día.
`test-persistencia` en `8a4bc19`, `farandula-video-family` `main` en `fce9aa1` (los dos push
verificados). `main` del principal sigue en `f801076` — sin mergear a propósito.

**Fase 4 (multifuente + solo audio), commit `8a4bc19`** + portada en `fce9aa1`. Dos cosas:

1. **Bug preexistente encontrado y arreglado**: `youtube-dl-exec` rompía en silencio en esta
   máquina (path con espacio, "D:\claude pro apps\...") — `descargarAudio`/`descargarVideo`
   fallaban SIEMPRE localmente, nunca en Railway. Arreglado invocando yt-dlp con `execFile`
   directo (sin shell) en `fuentes.js`.
2. **La fase en sí**: `extraerActa()` saca hechos neutrales de UNA fuente (sesgo-independiente,
   "solo lo que se dice, nunca gestos"); `sintetizarCronica()` combina 1-3 actas en una crónica.
   `/api/read` acumula fuentes por `jobId` (máx 3); `/api/resintetizar` cambia de sesgo sin
   re-descargar nada. YouTube: transcripción → audio → Gemini-directo → video, cada escalón cae
   al siguiente sin abortar.

Verificado con Instagram real (link del usuario) y HTTP real contra el servidor: 3 fuentes
acumuladas, 4ta rechazada, resíntesis 3.8s sin descargas (vs 14.4s con descarga). YouTube:
transcripción/audio bloqueados ahora mismo por el anti-bot de YouTube (externo) pero el
fallback a Gemini-directo se probó real y funciona — degrada al comportamiento que ya existía,
sin romper nada.

**Próximo paso: Fase 5 (fuente de tiempos intercambiable), sin empezar.**

⚠️ **Lección del port a family**: copiar un bloque entre repos por rango de texto arrastró de
vuelta `agregarMarcas`, que en family se había borrado a propósito (no usa ElevenLabs). Quedó
rota y nadie la llamaba, así que no falló nada — pero al portar hay que revisar qué quedó
adentro del rango, no solo que compile. Corregido en `cd25a48`.

**Corrección post-Fase 2 (commit `1dbb633`, portada en `80fa63d`)**: el usuario vio el resultado
real y notó que Clara Chía, nombrada en el guion, nunca aparecía en pantalla. Causa: la regla 6
que yo mismo escribí en la Fase 2 ("elige al sujeto, no al mencionado de pasada") era el MISMO
bug de otra forma. Reescrito con dos cambios de fondo: (1) el corte ahora es por sintaxis
(coma/conector/sujeto-predicado, ~40-60 chars) en vez de "una oración = un fragmento"; (2) la
carpeta la decide LA MENCIÓN, y si el fragmento no nombra a nadie sigue al referente implícito
(pronombres/posesivos) de la idea. Verificado 4/4 corridas (lite×2, alto×2): reconstrucción
exacta, ambas invariantes, Clara Chía aparece siempre, y el referente implícito ("su elección"
vuelve a Shakira aunque el fragmento anterior fuera de Piqué) se sostiene siempre. Granularidad
subió de ~16-19 a ~31-37 fragmentos, clip medio 1.91s — cae en el rango 1.5-3s pedido.
**Confirma la Fase 3**: lite salió más consistente que el tier alto entre corridas.

**Fase 1 (reskin), commit `55ae1bc`**: `style.css` reescrito completo (variables CSS,
`prefers-color-scheme: dark`, acento único `#2563eb`/`#5b9bff` oscuro, superficie fija
`#121212` para audio/video, badge del paso activo = mayor contraste de la pantalla). Los 18
estilos inline reemplazados por clases utilitarias. Mismas clases/selectores estructurales.
Verificado por computed style (light + dark). **Sin verificar visualmente**: el panel de
preview no estaba desplegado, así que no hubo compositing para tomar screenshot — pendiente que
el usuario lo abra y confirme, sobre todo `.selected` de las tarjetas de ángulo y el toggle del
historial (usan clases JS dinámicas; el mecanismo se probó sano con un elemento de control pero
no se vio renderizado).

**Fase 2 (fragmentación), commit `e995e37`** + portada a family en `8dd764b`: reglas 2 y 6 del
prompt (partir por cambio de sujeto es obligatorio, sin importar la longitud),
`verificarReconstruccion()`, `CLIP_MIN = 0.7` con `agruparParaClips()`, aviso al Paso 4, y la
interfaz `FRAGMENTADORES` como puerta abierta para `ritmo`. Verificado con Gemini real: el caso
del diagnóstico (83 chars, dos sujetos) ahora sí se parte, y un guion de 193 palabras da 19
fragmentos → 31 clips, media 2.10s, 0 parpadeos, ambas invariantes OK.

**Observación anotada, sin arreglar** (no es el bug que se arregló, y la alternativa no tiene
respuesta obvia): cuando una oración no nombra a nadie ("La coincidencia fue demasiado exacta"),
Gemini le arrastra el famoso del fragmento anterior. Es continuidad visual razonable y el
usuario puede corregirlo en el Paso 4.

**Fase 3 (router de modelos), commit `042db6d`** + portada a family en `cd25a48`: dos cadenas
(`creativo` arranca en tier alto, `mecanico` en lite y escala) y un router `TAREAS` que decide
cuál usa cada llamada. `callGemini` loguea `🤖 tarea → modelo`. La robustez no cambió: las dos
cadenas llevan los 4 modelos.

**Decisión de la Fase 3 que conviene poder revertir**: la fragmentación quedó en `mecanico`. En
la comparación cabeza a cabeza, lite hizo 3 cortes menos que el tier alto; dos eran cortes de
más del tier alto (misma persona en las dos mitades), y el tercero —"Piqué ... publicaba una
historia con Clara Chía"— lite lo deja entero como Piqué. Según la regla 6 del propio prompt
(elegir el SUJETO de la acción, no al mencionado de pasada) lite tiene razón, pero si se
prefiere el otro criterio **el cambio es una línea**: mover `fragmentacion` a `CADENAS.creativo`
en `gemini.js`. Lite fue idéntico en 3/3 corridas y reconstruyó exacto siempre.

**Próximo paso: Fase 4 (multifuente + solo audio), sin empezar.** Es la de mayor ahorro real
(~8x, dejar de mandar video a Gemini) y no bloquea nada del pipeline de render.

## Fases del plan maestro (11 total)

| # | Fase | Estado | Modelo sugerido |
|---|---|---|---|
| 1 | Reskin neutro + ergonomía | **hecha (2026-08-08, `55ae1bc`)** | Sonnet |
| 2 | Fragmentación por cambio de sujeto | **hecha (2026-08-08, `e995e37`)** | Opus |
| 3 | Router de modelos dentro de Gemini | **hecha (2026-08-08, `042db6d`)** | Sonnet |
| 4 | Multifuente + solo audio | **hecha (2026-08-08, `8a4bc19`)** | Sonnet |
| 5 | Fuente de tiempos intercambiable | no empezada | Sonnet |
| 6 | Subtítulos ASS | no empezada | Sonnet |
| 7 | Transiciones xfade + rampas | no empezada | Opus |
| 8 | Música por sentido | no empezada | Sonnet |
| 9 | Director (reglas → Gemini con fallback) | no empezada | Opus |
| 10 | Insumos ampliados | no empezada | Sonnet |
| 11 | Desplegar `farandula-video-family` a Railway | no empezada | Sonnet |

Regla de asignación: Opus donde el error es silencioso (desincronía, clip que excede 3s, guion
recortado sin que nadie lo note); Sonnet donde el error se ve al abrir la página.

## Deuda menor conocida (no bloquea nada, anotar si se toca)

- `decidirEfecto('intercalado', i)` en `video.js` devuelve `activo: true` para todo índice —
  el espejo debería alternar y no lo hace.
- Paso 6 del modo Insumos sigue pidiendo carpeta de destino que el servidor ignora desde julio.
- yt-dlp postinstall y un TikTok/IG real sin probar en producción.
- Fix de `descargarVideo` (race de archivo truncado, hecho en la Mac) sin verificar en Railway.

## Protocolo si trabajas desde otra herramienta o máquina

1. `git fetch` y revisar divergencia ANTES de tocar código.
2. Al terminar una fase: marcarla aquí como hecha (con fecha y SHA del commit), actualizar
   "Próximo paso", y verificar que el push llegó (`git rev-parse HEAD` == `git ls-remote origin
   <rama>`).
3. Nunca dejar este archivo desactualizado si hay algo a medio hacer — es la única fuente que
   una sesión sin memoria (como Codex) puede leer.

## Protocolo de traspaso Claude → Codex (cuota diaria/semanal agotada)

Codex no lee esta conversación, ni memoria, ni skills de Claude Code — solo lo que hay en el
repo. Por eso el traspaso es: parar en punto seguro, escribir el estado, empujar, y darle a
Codex un prompt fijo que apunte a estos dos archivos.

**Cuando notes que la cuota se acerca (o el usuario avisa que se cortó):**

1. **No cortar a mitad de una edición.** Terminar el paso atómico en curso (una función, un
   archivo) hasta un punto donde el código compile/corra, aunque la fase completa quede sin
   terminar.
2. **Actualizar este archivo** — sección "Estado al [fecha]":
   - Qué se terminó de la fase en curso (con lista de archivos tocados).
   - Qué quedó a medio hacer, en una frase accionable ("falta: aplicar el mismo cambio de color
     a `index.html` líneas 40-90, `style.css` ya está").
   - Cualquier decisión tomada en la sesión que no estuviera ya en el plan maestro.
3. **Commit + push.** Verificar con `git rev-parse HEAD` == `git ls-remote origin <rama>`.
4. **Avisar al usuario** con el prompt exacto para pegar en Codex (plantilla abajo) — no asumir
   que él arma el prompt solo.

**Plantilla para pegar en Codex, en la raíz del repo:**

```
Lee .claude/estado-vivo.md y .claude/plan-maestro-automatizacion.md antes de tocar nada.
Segui exactamente en "Próximo paso". No repreguntes decisiones que ya estén resueltas en el
plan. Las dos invariantes (duración video == duración audio, ningún clip pasa de 3.0s) son
innegociables — verificalas antes de dar algo por terminado.
Cuando termines o se corte tu sesión: actualiza .claude/estado-vivo.md con el mismo formato
(qué se hizo, qué queda, próximo paso), commitea y pushea, y confirma que el push llegó con
git rev-parse HEAD comparado contra git ls-remote origin <rama>.
```

5. **Vuelta a Claude** (cuando la cuota reponga): mismo protocolo — `git fetch`, leer qué avanzó
   Codex en "Sesiones recientes" de `CLAUDE.md` o en este archivo, y seguir desde ahí. Es
   ping-pong: cualquiera de los dos puede quedar como "última mano", el archivo es la posta.

**Qué NO traspasar por este archivo**: nada que necesite juicio de una sesión completa (por
ejemplo, "¿este ángulo de guion suena natural?"). Eso mejor esperar a que el usuario esté
presente para decidir, no delegarlo a ciegas entre herramientas.

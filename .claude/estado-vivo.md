# Estado vivo — para retomar desde cualquier herramienta (Claude Code, Codex, Mac)

Este archivo dice **qué está a medio hacer ahora mismo**. El plan completo (por qué, en qué
orden, qué investigación lo respalda) vive en `.claude/plan-maestro-automatizacion.md` — léelo
primero si no conoces el proyecto. Este archivo solo trackea progreso.

Las dos invariantes que ninguna fase puede romper: video == duración del audio (±0.1s), ningún
clip pasa de 3.0s (uso legítimo, ver memoria `farandula-limite-3-segundos`).

## Estado al 2026-08-08

**Fases 1 y 2 TERMINADAS hoy.** `test-persistencia` en `e995e37`, `farandula-video-family`
`main` en `8dd764b` (los dos push verificados). `main` del principal sigue en `f801076` — sin
mergear a propósito, ver regla de la rama de prueba al pie de este archivo.

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

**Próximo paso: Fase 3 (router de modelos dentro de Gemini), sin empezar.** Dato útil que salió
de las pruebas de hoy: la fragmentación funcionó bien incluso cuando la cadena de fallback cayó
hasta `gemini-3.1-flash-lite-preview` — evidencia a favor de mandarla al tier barato.

## Fases del plan maestro (11 total)

| # | Fase | Estado | Modelo sugerido |
|---|---|---|---|
| 1 | Reskin neutro + ergonomía | **hecha (2026-08-08, `55ae1bc`)** | Sonnet |
| 2 | Fragmentación por cambio de sujeto | **hecha (2026-08-08, `e995e37`)** | Opus |
| 3 | Router de modelos dentro de Gemini | no empezada | Sonnet |
| 4 | Multifuente + solo audio | no empezada | Sonnet |
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

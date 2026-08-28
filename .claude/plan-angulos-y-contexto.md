# Plan: gemelos que se diferencian de verdad — contexto, encuadres y comentarios

## ⚠️ Leer primero: esto se cruza con el diseño hecho desde la Mac

El mismo día, desde la otra máquina, se trabajó el mismo síntoma ("los guiones se parecen") y se
llegó a la MISMA causa raíz por otro camino: **con sesgo neutral los dos gemelos comparten la misma
crónica**, así que el parafraseo es el techo (ver la entrada `2026-08-25 (Mac)` en `CLAUDE.md`).

**Atacan capas distintas del mismo problema y NO se pisan:**

| | Qué ataca | Estado |
|---|---|---|
| Diseño de la Mac | Que se repitan las **frases** (léxico) + escudo antibloqueo | Con orden ya acordado con el usuario |
| **Este plan** | Que los dos guiones cuenten **lo mismo** (contenido y encuadre) | Nuevo, sin ejecutar |

⚠️ **La Mac encontró una causa que este plan NO cubre y que es mucho más barata de arreglar**: la
regla 5 de `PROMPTS.guion` trae CUATRO ejemplos fijos ("lo hundió", "quedó expuesto", "se le cayó la
mentira", "la jugada le salió mal") y el modelo los copia literalmente. **Eso se arregla antes que
nada de este plan**, y probablemente explique buena parte de la sensación de repetición.

**Palanca barata que la Mac ya propuso** y que este plan reemplazaría por algo mejor: que el sesgo
neutral reparta favor/contra entre los gemelos. Es de una línea y usa lo que ya existe (`970c698`).
Los encuadres periodísticos de la Fase 2 son superiores —no obligan a tomar postura para
diferenciarse— pero cuestan más. **Si hace falta un resultado ya, esa es la vía rápida.**

**Orden acordado con el usuario en la Mac** (este plan no está en esa lista todavía):
1. Escudo antibloqueo — un video bloqueado vale cero y los strikes se acumulan.
2. Columna de rendimiento en la hoja del publicador.
3. Registro durable de frases con rotación y memoria entre videos.

**Y hay algo bloqueado esperando al usuario**: qué hashtag le borró TikTok. Cambia el diagnóstico del
escudo.

## Contexto

El usuario notó que los dos guiones gemelos se parecen demasiado, y su diagnóstico fue correcto:

> "capaz el problema de que se parezcan los guiones es que toman de una sola crónica de la primera
> lectura... capaz sería bueno modificar esa parte y que la primera lectura proponga dos textos"

**Por qué pasa, verificado en el código.** El flujo es `acta` (hechos crudos, sin sesgo) → `crónica`
(síntesis, acá se aplica el sesgo) → `guion`. El gemelo tiene un mecanismo para pedir su propia
crónica, pero está detrás de dos condiciones que casi nunca se cumplen a la vez:

```js
function sesgoOpuesto(sesgo) {
  if (sesgo === 'favor') return 'contra';
  if (sesgo === 'contra') return 'favor';
  return null;                      // ← 'neutral', que es el DEFAULT, cae acá
}
```

Y además solo se activa con el motor `grafo`. Resultado: **en la mayoría de los videos los dos
guiones salen de la misma crónica**, y se diferencian solo en redacción y estructura.

Lo que ya está resuelto y hay que reusar: las actas son **sesgo-independientes** y quedan cacheadas
desde la lectura, y `gemini.sintetizarCronica(actas, X)` ya sabe producir crónicas distintas desde
las mismas actas sin volver a tocar la fuente original (llamada barata, solo texto). **La tubería
existe; lo que falta es material y un eje mejor que "a favor / en contra".**

## Los tres ejes, y por qué se necesitan los tres

| Eje | Qué aporta | Sin él |
|---|---|---|
| 1. Enriquecer contexto (web) | **Material**: antecedentes, cronología, quién es quién | Un TikTok de 30s no da para dos ángulos honestos |
| 2. Dos encuadres | **Diferenciación real**: dos puntos de entrada a los mismos hechos | Los guiones se parecen aunque haya material |
| 3. Comentarios | **Pistas**: qué le importa a la gente, qué recuerda | Los ángulos los elige el modelo a ciegas |

El orden importa: **el 1 es prerrequisito del 2**. Sin material nuevo, pedir dos encuadres produce
relleno, no diferenciación.

## Investigación de costos (verificada en la web, agosto 2026)

| Servicio | Costo | Alcanza para |
|---|---|---|
| **Gemini + Google Search grounding** | 5.000 consultas/mes GRATIS en la familia 3.x, después $14/1.000 | El proyecto usa `gemini-3.5-flash` y `gemini-3.1-flash-lite`: **son 3.x**. A ~100 noticias/mes con 3-4 búsquedas cada una son ~400 consultas: **menos de 1/10 del cupo gratis** |
| **YouTube `commentThreads.list`** | 1 unidad; hay 10.000/día gratis | Cientos de videos por día sin pagar. Es la operación más barata de la API |
| **Facebook Graph API** (páginas propias) | Sin costo por llamada | Requiere Page Access Token y `pages_read_engagement` |
| **TikTok** | ❌ **No hay endpoint público de comentarios** | Ni siquiera para los videos propios. Solo la Research API, restringida a académicos de instituciones aprobadas |

⚠️ **TikTok queda afuera** y probablemente sea donde más comentarios tiene el usuario. Hay que
decírselo antes de que cuente con eso.

## La invariante que gobierna todo el plan

**Los hechos que el guion AFIRMA salen solo de las fuentes que cargó el usuario.**

Todo lo demás —lo que trae la web, lo que dicen los comentarios— entra como **contexto** y como
**pistas**, nunca como hechos nuevos de la noticia. Si esta línea no queda clavada en los prompts,
el segundo video empieza a afirmar cosas que nadie dijo, y en farándula sobre personas reales eso
no es un problema de estilo: es un problema legal.

De esa invariante sale el mecanismo más valioso del plan:

> **El comentario da la pista. La búsqueda web la verifica. Solo lo verificado se puede afirmar.**

Ejemplo del propio usuario: veinte comentarios dicen *"ese artista antes decía otra cosa"*. Eso NO
se publica: es una pista. Se manda a buscar; si aparece la declaración vieja con fuente y fecha, hay
un ángulo excelente **y verificado**. Si no aparece, se descarta y no pasó nada.

## Fase 1 — Enriquecer contexto (base de todo)

**Qué hace.** Un paso opcional después de la lectura: el modelo, con búsqueda de Google activada,
busca alrededor de la noticia y produce **un acta más**, marcada como `origen: 'web'`.

**Dónde encaja.** En las actas. El flujo ya sabe combinar varias (multifuente, Fase 4 del plan
maestro), así que la crónica no necesita saber que esta vino de otro lado.

**Qué debe traer, separado en dos bloques** (esta separación es la que habilita un ángulo entero):

- **Antecedentes**: qué pasó ANTES de la noticia. Declaraciones viejas, historia entre las partes.
- **Posterior**: qué pasó DESPUÉS. Reacciones, desmentidas, respuestas del otro lado.

Lo posterior puede contradecir a la fuente original. Eso es material, no error — pero mezclarlo sin
distinguir produce una crónica incoherente. Y "lo que vino después" es de los mejores ángulos
gemelos disponibles.

**Cada dato con su cita.** El grounding devuelve `groundingMetadata` con las consultas, los
resultados y las citas. Se muestran en el Paso 1 y el usuario decide qué acepta. Enriquecimiento
**visible y revisable**, nunca invisible.

**Degradación**: si la búsqueda falla o no trae nada, se sigue con las actas de siempre. Nunca
aborta.

## Fase 2 — Dos encuadres, elegidos por el modelo

**El error a evitar**: fijar "uno a favor y otro en contra". Eso es el problema de hoy con otro
nombre. Lo que rinde es que el modelo proponga **dos encuadres de familias distintas que estos
hechos concretos aguanten**.

**Catálogo de encuadres** (marcos genéricos del framing periodístico, adaptados a farándula):

| Marco | En farándula |
|---|---|
| Conflicto | Quién se enfrentó con quién, el cruce, la respuesta |
| Interés humano | El costo personal, la vulnerabilidad, la historia detrás |
| Atribución de responsabilidad | De quién fue la culpa, quién debía actuar y no actuó |
| Moralidad | Lo que estuvo bien o mal, el juicio del público |
| Consecuencia económica | Contratos que se caen, patrocinadores, cuánto pierde |

Más un recurso clásico de redacción que funciona muy bien acá: **cambiar quién es el protagonista**.
La misma pelea contada desde el que atacó, desde el que respondió, o desde el tercero que quedó en
el medio, son tres notas distintas con los mismos hechos.

**Criterio de calidad** (para que el modelo se autoevalúe): un ángulo sirve si responde al menos una
de estas — qué cambia, por qué importa, a quién afecta, qué lo demuestra, por qué ahora.

**Regla dura**: los dos encuadres deben ser de **familias distintas**. Dos variantes de "conflicto"
no son dos ángulos.

**Se muestran en el Paso 1**, editables, y cada video toma el suyo. Encaja con lo que ya existe: el
motor `grafo` elige la **estructura**, esto elige el **punto de vista**. Dos ejes independientes que
se multiplican.

**Degradación**: si los hechos no dan para dos ángulos honestos (fuente pobre), que lo diga y use
uno solo, en vez de inventar el segundo. Avisar que agregar otra fuente mejoraría el resultado —
multifuente y ángulos se potencian.

## Fase 3 — Líneas temáticas de los comentarios

**Solo YouTube y Facebook.** TikTok no se puede (ver costos).

**Qué se extrae: líneas temáticas, NUNCA frases.** Lo útil es *"la mayoría discute si ella tenía
derecho a responder así"*, no la cita de un anónimo. Citar a un comentarista en un video es traer su
error de hecho al canal.

**Catálogo de líneas** (pedido explícito del usuario, con su ejemplo primero):

| Línea | Cómo suena | Para qué sirve |
|---|---|---|
| **Contradicción** | "antes decía otra cosa" | El más fuerte: manda a buscar la declaración vieja |
| **El que falta** | "¿y qué dice el otro?" | Protagonista alterno |
| **Duda sobre la versión** | "eso no fue así" | Contraste de versiones |
| **Comparación** | "igual que cuando pasó X" | Antecedente, patrón |
| **Detalle ignorado** | se fijan en algo secundario | Lo que nadie contó |
| **Juicio moral** | "se lo merecía" / "pobre" | Marca el clima, no el ángulo |

**Dos fuentes de comentarios, y la segunda es la que nadie mira:**

1. Videos de OTROS sobre la misma noticia (noticieros, canales de espectáculos en YouTube).
2. **Los propios videos ya publicados.** Mejor señal: no dicen qué piensa "la gente" en abstracto,
   dicen qué le importa **a la audiencia del usuario**. Cierra un círculo: se publica un video, la
   gente discute algo que no se había destacado, y eso es el ángulo del video siguiente.

**Cómo alimenta la Fase 2**: las líneas entran como insumo para ELEGIR los encuadres, no como
hechos. Y las de tipo "contradicción" o "comparación" se mandan a verificar por la Fase 1.

## Riesgos, y qué hacer con cada uno

| Riesgo | Mitigación |
|---|---|
| La web mete rumores como hechos | La invariante: solo las fuentes del usuario se afirman. Citas visibles y revisables |
| El comentario más repetido es el más indignado, y suele basarse en algo que no pasó | Los comentarios eligen DE QUÉ hablar, nunca QUÉ afirmar |
| Guiarse por lo que resuena empuja a lo más agresivo | **Decisión editorial del usuario, no técnica.** Hay que planteárselo antes de automatizarlo |
| Fuente pobre → dos ángulos forzados | Degradar a uno solo con aviso |
| Lo posterior contradice a la fuente original | Separar antecedente / posterior desde la extracción |
| Costo | Verificado: prácticamente cero al volumen actual |

## Verificación

1. **La misma noticia, antes y después.** Generar el par de guiones con el flujo actual y con el
   nuevo, y comparar. La medida que ya se usó para el sesgo opuesto sirve acá: **vocabulario común
   entre los dos guiones** (hoy 46% con el motor tradicional, 16% con sesgo opuesto).
2. **Que el enriquecimiento no invente**: tomar una noticia con hechos conocidos y confirmar que
   ningún hecho afirmado en el guion sale de la web sin estar en las actas del usuario.
3. **Las citas**: que cada dato traído tenga su enlace y que el enlace realmente lo respalde.
4. **Fuente pobre**: un TikTok de 30 segundos con un solo hecho tiene que degradar a un ángulo, no
   inventar el segundo.
5. **Comentarios**: que las líneas extraídas sean temáticas y no citas; y que una línea de
   "contradicción" dispare una búsqueda de verificación.
6. **Regresión**: una noticia sin enriquecimiento ni encuadres tiene que salir exactamente como hoy.

## Orden recomendado

**Fase 1 primero, sola, y probarla.** Es la que no depende de nada externo (el grounding es una
opción de la llamada a Gemini que ya se hace) y es prerrequisito de las otras dos. Con eso ya se
puede juzgar si el material extra mejora los guiones.

**Fase 2 después**, que es donde se ve el resultado que el usuario pidió.

**Fase 3 al final**, y como fase aparte: necesita credenciales nuevas (YouTube Data API y token de
página de Facebook) y es la única que depende de servicios de terceros.

## Fuera de alcance

- TikTok como fuente de comentarios: no hay API. Si algún día importa mucho, la única vía sería
  scraping, con todo lo que eso implica (fragilidad, términos de servicio).
- Publicación automática: proyecto aparte, ya anotado en la bitácora.

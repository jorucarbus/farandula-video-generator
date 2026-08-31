# Claude Code Setup — Farandula Video Generator

## 🔴 CIERRE 2026-08-27 — variedad de guiones, IMPLEMENTADO (supersede lo anterior)

El usuario pidió ejecutar todo el diseño de variedad "sin preguntarme nada, con todos los permisos
en automático". Entraron **4 commits de código**. Trabajado en `test-persistencia`, desplegado y
verificado en staging (contenedor levantado 02:14 GMT, health 200).

| Repo | Rama | SHA | Estado |
|---|---|---|---|
| `farandula-video-generator` | `test-persistencia` | `7d07063` | local = remoto, desplegado |

### 2026-08-31 (Mac) — Auditoría de estado: qué había quedado sin anotar, y dónde está cada cosa

El usuario: *"revisa en el github y railway todos los cambios porque creo que no hice actualizar la
bitácora en mi casa"*. **Casi todo SÍ estaba anotado** — la tanda del 27 al 30 quedó documentada en
detalle desde Windows. Lo que faltaba eran **los cuatro últimos commits del 30/08**, los cuatro de
la misma noche y todos nacidos de que el usuario se quedó con procesos colgados. Se anotan acá
porque cuentan una historia sola: *la tanda de encuadres funcionaba en las pruebas y se rompía en
uso real*.

| Commit | Qué |
|---|---|
| `d007d21` | Sacar los encuadres del pedido de lectura — el gateway cortaba con 502 |
| `e138b3b` | Recuperar el proceso aunque el navegador nunca haya sabido su id |
| `62eb7ff` | Saltar los modelos que acaban de dar 503 en vez de volver a probarlos |
| `7d07063` | Los dos enfoques se preparan al ACTIVAR gemelos, no al terminar la lectura |

**El hilo común: un pedido HTTP, un trabajo.** Al meter los encuadres y las dos crónicas dentro de
`/api/read`, la lectura pasó a hacer **seis llamadas seguidas a Gemini** (acta, crónica base,
nombres, encuadres, y una crónica por enfoque). Con Gemini devolviendo 503 constante, cada una
tardaba minutos, el total se fue arriba de diez y **el gateway de Railway cortó con 502**. Los jobs
quedaban con crónica pero sin encuadres: ni avanzaban ni fallaban. El usuario: *"no avanza de ahí,
tengo 5 procesos colgados"*. `d007d21` movió ese trabajo a `POST /api/encuadres/generar`, que se
puede reintentar sin rehacer la lectura porque las actas están cacheadas. **Mismo criterio que ya
había sacado el render del HTTP largo** — vale como regla: si un endpoint encadena llamadas a
Gemini, el gateway es el techo, no el timeout del cliente.

**`e138b3b` es la secuela del 502, y la trampa es sutil**: el `jobId` se guardaba en `sessionStorage`
recién cuando la respuesta LLEGABA al navegador. Si el pedido moría en el camino, el servidor SÍ
había creado el proceso y guardado la crónica, pero la pantalla nunca se enteró de que existía. Al
recargar no había nada que ofrecer y el trabajo *parecía* perdido estando entero del otro lado.
Ahora, sin referencia local, se le **pregunta al servidor** por procesos sin terminar de las últimas
24h. ⚠️ **El patrón general**: guardar la referencia a un trabajo remoto recién al recibir la
respuesta deja huérfano todo lo que el servidor completó y el cliente no llegó a ver.

**`62eb7ff` — los 503 costaban 20-30s por llamada.** `gemini-flash-latest` daba 503 el 100% de las
veces durante horas y encabeza la cadena creativa: cada llamada pagaba dos intentos con 8s de espera
antes de caer al modelo que sí respondía. Medido con síntesis reales: **61,6s y 144,6s por llamada**.
Ahora un modelo que da 503 queda **en penitencia 3 minutos** y la cadena lo saltea. La penitencia es
corta a propósito (los 503 van y vienen) y si TODOS están penados se usa la cadena completa igual —
mejor probar uno saturado que ninguno.

**`7d07063` — el bug de flujo, y el más fácil de repetir.** El interruptor de gemelos vive en el
**Paso 2**; `generarEncuadres()` se disparaba al **final de la lectura**, cuando `state.gemelos`
todavía era `false`. Salía por su propia guarda sin hacer nada: **nunca se generaban**. El usuario:
*"con video gemelos solo aparece uno y regresamos al problema de similitud de guiones"* — y los
datos le daban la razón, de 6 procesos recientes solo UNO tenía los dos enfoques. Ahora la
preparación la dispara `toggleGemelos` al ACTIVARSE, y releer o agregar una fuente invalida los
enfoques anteriores. ⚠️ **La lección**: una guarda `if (!state.x) return` dentro de algo que se
dispara automáticamente falla en silencio; el disparo tiene que colgarse del momento en que la
condición se cumple, no de un paso anterior.

### Estado real verificado hoy (31/08, desde la Mac)

| Dónde | Estado |
|---|---|
| `origin/test-persistencia` | `7d07063` — la Mac ya está al día (venía 19 commits atrás) |
| Staging (`adventurous-reflection`) | **`/api/health` 200**, y el `app.js` servido tiene los marcadores del ÚLTIMO commit (`generarEncuadres`, "Preparar los dos enfoques", "Escribiendo las dos crónicas"). **Desplegado y al día.** |
| Producción (`farandula-video-generator-production`) | **200 y sano, pero `main` está en `624a24a` del 17/08 — 64 commits atrás.** Su `index.html` no tiene *Citas*, *enriquecer* ni *encuadre*: nada de la tanda de variedad está en producción. |
| `farandula-insumos-production` | 404 "Application not found" — **esperado**, se apagó el 27/07 al dejar de depender de un servicio separado. |

⚠️ **El riesgo más grande del proyecto sigue siendo el mismo y creció**: `main` acumula **64
commits** de atraso, incluidos varios fixes de crashes reales de producción. El merge sigue
pendiente.

📌 **Nota de convención**: desde Windows la bitácora pasó a escribirse **con lo más nuevo arriba**,
debajo del CIERRE. Antes se agregaba al final, en "Sesiones recientes". Se mantiene el criterio
nuevo — pero conviene saberlo, porque buscar lo último al final del archivo ahora da la entrada
equivocada.

### 🔴 2026-08-30 — El guionista recibía "[object Object]" y SE INVENTABA LA NOTICIA ENTERA

**El fallo más grave del proyecto hasta ahora.** El usuario lo vio en pantalla: los nombres y los
encuadres hablaban de Celeste Morán, KikeJav y Las Ñañas, y los guiones hablaban de **Emilia Mernes
y Duki** — gente que no aparece en ninguna parte de su noticia.

**Causa.** `sintetizarCronica` devuelve un OBJETO `{cronica, titulo, protagonista…}`, y
`cronicaConEncuadre`/`cronicaConSesgo` lo devolvían entero. Al interpolarlo en el prompt, el
guionista recibía literalmente:

```
=== MATERIAL BASE (los HECHOS de la noticia) ===
[object Object]
```

Sin hechos, y con un prompt que igual le exige 205 palabras de farándula con tensión, **el modelo
hace lo único que puede: inventar una noticia verosímil con famosos que conoce.**

⚠️ **La lección que hay que retener**: un modelo al que se le pide un texto convincente SIEMPRE va a
producir uno. Si el material base se rompe, no protesta — rellena. Cualquier dato que entre a un
prompt por interpolación tiene que ser texto verificado, no un objeto que "seguro trae lo que hace
falta".

**Historia del bug**: vivía en `cronicaConSesgo` desde `970c698` (24/08) pero solo se activaba con
motor grafo Y sesgo favor/contra, así que pasó desapercibido. Al aplicar los encuadres —que se
proponen SIEMPRE— pasó de latente a constante, y en `ebe7199` se replicó también al primer video.

**Alcance, revisado en los 20 procesos de staging**: 2 guiones inventados (el gemelo de "Naim
Darrechi y katy" del 29/08, y los de "El imparable ascenso de Celeste Morán" del 30/08).
✅ **Ninguno llegó a video**: los dos quedaron en el paso del guion. Nada falso se publicó.

**Dos arreglos** (`d1066f0`):
1. Tomar `.cronica` en vez del objeto.
2. **`exigirCronica()` en `escribirGuion`**, el punto común de los dos motores: si lo que llega no es
   texto con hechos, el paso **falla a la vista** en vez de dejar improvisar. La regla del proyecto
   es degradar sin abortar, pero acá no aplica — un guion inventado no es una degradación, es
   contenido falso sobre personas reales.

### 2026-08-30 — Dos crónicas desde la lectura (pedido del usuario)

> *"primera lectura: dos crónicas con distintos enfoques. Elaboración de guion con grafos basado
> cada guion en cada enfoque. Los grafos solo convierten esas crónicas a guiones de TikTok."*

Detrás del bug había un problema de diseño peor: **la crónica que el usuario veía y podía EDITAR en
el Paso 1 no era la que se usaba.** Al escribir el guion se re-sintetizaba otra por cada encuadre, y
su edición se perdía sin aviso.

**Cómo quedó** (`72246bc`):
- La lectura escribe **dos crónicas**, una por enfoque, y las guarda en el job.
- Se muestran en el Paso 1, rotuladas por canal y **editables**. `PUT /api/encuadres` las guarda
  (rechaza vacías: de ahí sale el guion).
- El Paso 3 **ya no sintetiza nada**: toma la crónica guardada de cada canal. Los jobs viejos —con
  encuadres pero sin crónicas— siguen por el camino anterior.
- **El motor grafo deja de decidir contenido.** Antes miraba el guion hermano para diferenciarse, y
  esa era la palanca DÉBIL: la estructura cambia el ORDEN en que se cuenta, no QUÉ se cuenta. Ahora
  solo evita que además suenen igual de forma.
- `bloqueDeEvitar` decía *"los hechos son los mismos y el ángulo es el mismo"*. Ya no es cierto y
  confundía: el modelo podía tomar de ahí contenido que su propia crónica no tiene.

**Verificado con una lectura real**: dos crónicas distintas sobre la noticia correcta —
`[humano]` "Las lágrimas de Celeste Morán en vivo" (791 car.) y `[protagonista]` "KikeJav resalta el
despegue" (939 car.)— cada una con su título de publicación propio. Y en el log del Paso 3:
`🎯 Este video con su crónica del Paso 1`.

### 2026-08-29 — Citas desde Drive: navegador + marcador, y solo se guarda el recorte

Idea del usuario, y mejor que lo que había: *"en lugar de descargar el archivo, usarlo desde el
Drive y solo marcarlo, y una vez escogido solo el fragmento, utilizar eso nada más"*. Él ya sube las
entrevistas a mano a **`Redes_Canales/Citas`**, en subcarpetas por fecha y protagonista.

**Qué entró** (`38c289d`):
- **Navegador** de esa carpeta (`/api/citas-drive`). Navegador y no desplegable porque tiene
  subcarpetas **y** archivos sueltos mezclados en la raíz.
- **Puente de reproducción** (`/api/cita-stream/:fileId`): el navegador pide un tramo de bytes y se
  le pide ese mismo tramo a Drive. Se salta a cualquier segundo de un video de 50 MB sin bajarlo
  entero ni escribirlo en el disco del servidor.
- **Marcador**: el video a la vista, "marcar inicio/fin acá" sobre el cursor, números editables al
  lado, y "ver solo el tramo" para confirmar antes de aceptar.
- **Al aceptar se recorta SOLO el tramo** y se guarda únicamente eso. El original nunca se toca.

**Por qué importa**: sus archivos pesan 50 MB. Antes se subían por el navegador y quedaban enteros
en el disco de Railway, que es efímero — eso ya hizo perder una entrevista entre el upload y el
render (2026-08-20). Medido: 13 MB → 1,9 MB de recorte.

⚠️ **DOS TRAMPAS que costaron y van a volver:**

1. **La carpeta está compartida con la cuenta OAuth del usuario, NO con el Service Account.** Con
   `getDrive()` a secas el listado vuelve **vacío, sin error**. Mismo caso que la música, que ya
   usaba `getDriveOAuth() || getDrive()`. **Si algo de Drive devuelve una lista vacía y debería
   traer datos, mirar esto primero.**
2. **`r.headers` de googleapis es un objeto `Headers` (fetch), no un diccionario.** Leerlo como
   `headers['content-range']` da `undefined` siempre: el puente contestaba 200 con el archivo entero
   aunque Drive hubiera respondido 206 correctamente. Se lee con `.get()`. Y **Drive no manda
   `accept-ranges`** aunque los soporta, así que hay que ponerlo a mano o el navegador ni intenta
   pedir tramos.

El recorte **re-codifica** en vez de copiar: cortar por tiempo con `-c copy` salta al keyframe más
cercano y se lleva hasta medio segundo — justo lo que se está ajustando al milímetro.

`GOOGLE_DRIVE_CITAS_FOLDER_ID` tiene el id por defecto en el código, así que funciona sin configurar
nada en Railway; ponerla como variable solo hace falta si algún día cambia la carpeta.

### 2026-08-28 — Las citas se cortaban antes de terminar la frase (NO era el límite de 3s)

El usuario lo reportó y preguntó si era por el límite de 3 segundos por clip. **No lo era**, y
conviene tenerlo claro para no volver a sospechar de ahí: la cita **abre su propio hueco** en la
línea de tiempo con su duración real (el pseudo-fragmento de `empalmarCitasReales`), y el plan lo
reparte en tomas consecutivas **del mismo archivo** con el offset avanzando. `CLIP_MAX` sigue siendo
un límite legal para material ajeno y no se tocó.

**La causa real**: los tiempos de cada cita los estima Gemini **de oído** — `PROMPT_CITAS` le pide
literalmente el momento *"aproximado"* — y se usaban tal cual. Un `fin` medio segundo corto corta la
frase a mitad de palabra. Había un clamp contra la duración del archivo, pero ningún margen.

**Dos arreglos** (`5556df4`), y el segundo salió de su repregunta:

1. **Colchón de 0,5s** al final de cada cita, antes del clamp. Solo al final, nunca al inicio:
   adelantar el inicio metería la cola de la frase anterior, que suena peor.
2. **"Oír el tramo"** en el Paso 4. Su repregunta fue *"¿pero cómo puedo saber qué parte de la cita
   es?"* — y tenía razón: los segundos eran números a ciegas, había que abrir la entrevista fuera de
   la app para corregirlos. Ahora un botón reproduce **exactamente lo que va a entrar**: salta al
   inicio y frena en el fin.

⚠️ **Detalle que costó encontrar**: el endpoint del archivo tuvo que ir a `/api/material-file/` y
**exento de la API key**, porque un `<audio>` no puede mandar cabeceras — lo mismo que ya pasaba con
el `<video>` de las previas. Y necesita soportar **Range**, sin lo cual el navegador no puede saltar
a un segundo concreto. Además el reproductor va con `preload="metadata"`: con `none`, fijar
`currentTime` no hace nada porque el navegador todavía no conoce la duración.

### ⚠️ Lo primero al retomar: preguntarle qué le pareció

Todo lo de esta tanda cambia **cómo salen los guiones**, y eso solo lo puede juzgar él. La pregunta
concreta: *¿los dos guiones gemelos ahora se sienten distintos de verdad?* Que salen más variados
está medido con números (abajo); si son **mejores** es criterio suyo y no hay métrica que lo diga.

### El diagnóstico del usuario era correcto

> "capaz el problema de que se parezcan los guiones es que toman de una sola crónica de la primera
> lectura... capaz sería bueno que la primera lectura proponga dos textos"

Confirmado en el código: `sesgoOpuesto('neutral')` devuelve `null` **y neutral es el default**, y
además la palanca solo se activaba con el motor `grafo`. O sea: en la mayoría de los videos los dos
guiones salían de **la misma crónica**, y el parafraseo era su techo.

### Qué entró

| # | Qué | Commit |
|---|---|---|
| 1 | Registro de expresiones con rotación, memoria entre videos y regla de atribución | `ca3c649` |
| 2 | Contexto desde la web y dos encuadres, uno por canal | `5a2e8a0` |
| 3 | Columnas de rendimiento en la hoja del publicador | `c235f7e` |
| 4 | El primer video también usa SU encuadre, no solo el gemelo | `ebe7199` |

#### 1. Las cuatro frases fijas (`ca3c649`) — la causa más barata, encontrada desde la Mac

La regla 5 de `PROMPTS.guion` traía CUATRO ejemplos fijos y el modelo **los copiaba literal**. Ahora
hay `expresiones.js`: 45 expresiones en 8 grupos por FUNCIÓN narrativa, de las que se le muestran
**7 por llamada**, repartidas entre grupos y priorizando las que hace más tiempo no salen.

⚠️ **La rotación es el punto, no el tamaño del catálogo.** Pasarle las 45 juntas cambia un problema
por otro: suena a recetario y se repiten 45 en vez de 4. Mismo mecanismo que ya rota clips por
famoso, en el mismo `historial.json`.

También entró la **memoria entre videos**: se guardan las últimas 12 aperturas y entran al prompt
como "así arrancaron los últimos, no repitas eso". `guionEvitar` solo cubría al gemelo del mismo job.

Y la **regla 8, de atribución**: acusaciones y rumores van matizados ("ella lo acusa de" en vez de
"le fue infiel"). Es lo único del escudo antibloqueo que no podía esperar — protege de lo grave
(afirmaciones sobre personas reales) y además es cómo se escribe bien una nota de farándula.

**Medido con Gemini real, 4 noticias**: las cuatro frases viejas aparecen **0 de 4**; **0 aperturas
repetidas**; cada guion usó expresiones distintas y uno escribió las suyas.

#### 2. Contexto web + dos encuadres (`5a2e8a0`) — la palanca de fondo

**Contexto** (`/api/enriquecer`, botón opcional en el Paso 1): Gemini busca en Google antecedentes,
lo posterior y quién es quién, y eso entra como **una fuente más** del job. Antecedente y posterior
van **separados**: lo posterior puede contradecir a la fuente original.

**Encuadres** (`encuadres.js`): la lectura propone **dos puntos de entrada de familias distintas**
(marcos del framing periodístico + protagonista alterno + cronología), y el gemelo re-sintetiza su
crónica con el segundo.

⚠️ **La regla de que sean marcos distintos se verifica EN CÓDIGO, no se le pide al modelo** — con la
estructura del motor `grafo` ya se aprendió que pedírselo no alcanza.

**LA INVARIANTE, escrita en los dos prompts**: lo que trae la web es CONTEXTO, nunca hechos nuevos
que el guion pueda afirmar. Sobre personas reales, inventar no es un problema de estilo.

**Verificado con búsquedas reales**: para la noticia de Miss Universo trajo el incidente previo
completo Y una gestión de orden de arresto POSTERIOR que la fuente no tenía —un video entero que hoy
no existiría— con 7 fuentes citadas. Y con una noticia pobre (un solo hecho), **se negó a inventar
el segundo ángulo**, textual: *"forzar un segundo marco implicaría inventar polémicas, antecedentes
o impactos que no están en el texto"*.

💰 **Costo**: 5.000 búsquedas gratis al mes en la familia 3.x (la que usa el proyecto). A ~100
noticias mensuales, ni se roza el cupo.

#### 3. Rendimiento en la hoja (`c235f7e`)

Dos columnas al final (**Vistas**, **Qué funcionó**), que llena el usuario a mano en la misma fila a
la que ya vuelve para pegar el link del post. ⚠️ Al tocar la hoja hay que mantener alineadas
**cuatro** listas: `ENCABEZADOS`, `ANCHOS`, `ALINEAR` y la fila de `registrarVideo()` — ahora 19
cada una, `ULTIMA_COL = 'S'`.

#### 4. Cada video con SU encuadre (`ebe7199`)

Incoherencia detectada al revisar lo ya escrito: la pantalla del Paso 1 muestra un encuadre por
canal, pero solo se aplicaba el del gemelo — el primero seguía usando la crónica sin encuadre. **La
pantalla decía una cosa y el guion hacía otra.** Ahora los dos re-sintetizan su propia crónica desde
las mismas actas. Con un video solo no se toca nada: no hay de qué diferenciarse, y la crónica que
el usuario revisó es la que corresponde usar tal cual.

### Cómo se verificó cada cosa (números, no impresiones)

| Qué | Resultado |
|---|---|
| Frases viejas repetidas | **0 de 4** guiones, con Gemini real |
| Aperturas repetidas | **0**, y 0 con las mismas 3 primeras palabras |
| Rotación de expresiones | 3 sorteos seguidos sin repetir ninguna |
| Lógica de encuadres | 7 casos con un Gemini falso: dos del mismo marco se reducen a uno y avisa; marco inventado se descarta; sin hechos lanza |
| Encuadres reales, noticia rica | 2 marcos distintos: `conflicto` + `protagonista` |
| Encuadres reales, noticia pobre | `suficiente: false`, **se negó a inventar el segundo** |
| Búsqueda web real | 3 consultas, 7 fuentes citadas, trajo un hecho posterior que la fuente no tenía |
| Guardas de `/api/enriquecer` | las 4 responden (sin jobId, job inexistente, sin fuentes, ya enriquecida) |
| Lectura completa de punta a punta | job guardado con sus 2 encuadres |
| Coherencia de la hoja | las 4 listas en 19 |

⚠️ **El patrón que sirvió para verificar sin depender de la red**: un `gemini` falso que devuelve lo
que uno le diga. Toda la lógica propia (reglas duras, degradación, descartes) se prueba así en
segundos; a Gemini real se lo deja solo para lo que de verdad necesita su criterio. Vale la pena
reusarlo — durante esta tanda Gemini estuvo devolviendo 503 casi todo el tiempo y las pruebas contra
él tardaban minutos.

### ⚠️ Lo que NO se hizo, y por qué

**Los comentarios de YouTube y Facebook** (tercer eje del plan). Necesitan credenciales que solo el
usuario puede generar: habilitar YouTube Data API v3 en su Google Cloud, y un token de página de
Meta. **TikTok quedó descartado**: no tiene endpoint público de comentarios, ni siquiera para los
videos propios — solo la Research API, para académicos. Y es probablemente donde más comentarios
tiene.

Su pedido, que sigue en pie para cuando pase las llaves: **líneas temáticas, nunca citas**. Su
ejemplo — *"ese artista antes decía otra cosa"* — habilita el mejor mecanismo del plan: **el
comentario da la pista, la búsqueda web la verifica, y solo lo verificado se puede afirmar.**

### Orden acordado con el usuario (cambiado por él)

El escudo antibloqueo estaba primero; el usuario lo mandó al final (*"creo que el hashtag y el escudo
es mejor trabajarlo al final"*) y se coincidió: el daño real hasta ahora es **un hashtag borrado**,
no un video bajado ni un strike. Lo urgente del escudo (la atribución) ya entró en `ca3c649`.

⚠️ **Lo que cambiaría ese orden**: si empiezan a borrarle más cosas o llega un strike, el escudo sube
solo al primer puesto. El usuario buscó qué hashtag le borraron y **no pudo encontrarlo** — ese hilo
quedó cerrado por decisión suya.

### Lo que solo el usuario puede cerrar

1. **Leer dos guiones gemelos de la misma noticia** y decir si ahora se sienten distintos. Que salen
   más variados está medido; si son *mejores* es criterio suyo. **Es la pregunta principal.**
2. **Probar el botón de contexto** en una noticia real y revisar que lo que trae sea correcto —
   sobre todo que no meta como hecho algo que la fuente no dice.
3. **Probar el flujo nuevo de citas**: "Elegir de mi carpeta Citas" en el Paso 1, marcar un tramo
   viendo el video, y confirmar que entra bien al guion. Es lo más nuevo y lo menos probado en uso real.
4. **Probar una cita vieja** y confirmar que ya no se corta la frase — y si se corta, ajustar el fin
   escuchando el tramo con el botón nuevo.
5. **Probar el cruce de canales** que quedó de la tanda anterior: mandar un canal, pasarse al otro
   mientras trabaja, y mandarlo también.
6. Y lo de antes: música a -20 dB, una pronunciación cargada a mano, y un par de gemelos completo.

### Notas operativas nuevas

- **La lectura del Paso 1 ahora tarda más**: suma la llamada de los encuadres. Con Gemini saturado
  (503, que fue constante durante esta tanda) puede irse a varios minutos. El techo de espera del
  navegador son 5 minutos (`TIMEOUT_PEDIDO_MS`), así que entra — pero si el usuario reporta que "la
  lectura no termina", mirar primero si Gemini está devolviendo 503.
- **El botón de contexto es opcional y se pide a mano**, nunca corre solo: cuesta ~2 minutos y no
  toda noticia lo necesita.
- ⚠️ **Levantar el servidor local corta las pruebas con `curl` en vuelo.** Dos peticiones de esta
  tanda terminaron en exit 56 por apagar el server mientras corrían; el trabajo del lado del
  servidor SÍ se había completado (se confirmó mirando `data/jobs.json`). Antes de dar por fallida
  una prueba larga, revisar el estado real en el job.

---


## CIERRE 2026-08-25 (superado por el de arriba, se conserva por contexto)

Día largo, sobre un solo pedido del usuario: **poder corregir UN video gemelo sin tener que repetir
el otro**. Fueron DOS tandas — la primera de noche (el desacople), la segunda con el usuario
probando y reportando lo que seguía roto. La segunda es la que encontró el problema de fondo.

| Repo | Rama | SHA | Estado |
|---|---|---|---|
| `farandula-video-generator` | `test-persistencia` | `0c23a10` | local = remoto, desplegado en staging |
| `generador-guion-graphify` | `main` | `b7cb077` | sin cambios hoy |

### ⚠️ LO MÁS IMPORTANTE DEL DÍA (si solo se lee una cosa, que sea esto)

**Los controles de la pantalla son UN SOLO juego en el DOM, compartido por las dos pestañas.** No se
duplican a propósito (dos juegos = el doble de superficie para desincronizarse, el bug que costó una
semana con la geometría del cartel). De ahí salen dos trampas que ya mordieron y volverán a morder:

1. **Apagar un botón lo apaga para los dos canales.** `setButtonDisabled` actúa sobre el único
   botón que existe. Por eso ahora hay un registro `ocupacion.A` / `ocupacion.B` y los botones se
   apagan según lo que hace **la pestaña abierta**, nunca la otra.
2. **Leer `state.varianteActiva` DESPUÉS de un `await` es un bug.** Para entonces el usuario pudo
   cambiar de pestaña y el resultado se anota en el canal equivocado. **Toda operación async fija su
   variante antes del primer `await`** y usa `setPasoDeVariante(v, ...)` en lugar de
   `setStepStatus`. Si se agrega una operación nueva al flujo, tiene que seguir esa regla.

Estas dos son la causa de lo que el usuario describió como *"aplasto y no me deja aplastar en el
otro canal"* y *"el primer canal se desconfigura, los indicadores pasan de verde a rojo"*.

### Lo que pedía el usuario, en sus palabras

> "estoy atascado solo quiero corregir un video B, pero me obliga a repetir el video A... si acepto
> la asignacion de un solo video debo poder llegar hasta el final"

Su hipótesis era que el acoplamiento servía para que no se repitieran las tomas entre canales.
**No era así**, y conviene tenerlo claro antes de tocar nada:

- La asignación (Paso 4) solo decide **qué famoso** va en cada párrafo. **Qué clip** se usa se
  decide recién en el render, dentro de `seleccion.planificarClips()`.
- La rotación vive en `historial.json`: por famoso, **global y permanente**, no del par A/B. Y la
  cola renderiza de a uno para que dos renders no lean el historial antes de que el otro lo
  actualice (ver el comentario de cabecera de `colaRender.js`).
- O sea: **las tomas no se repiten aunque los dos videos se hagan con días de diferencia**. El
  orden de encolado no tiene nada que ver.

### Qué entró (8 commits de código, en dos tandas)

**Primera tanda — el desacople (de noche, sin el usuario)**

| # | Qué | Commit |
|---|---|---|
| 1 | Cada video gemelo avanza y se genera por separado | `b21988c` |
| 2 | El servidor local ya no pisa el estado compartido en Drive | `a6fc5a5` |

**Segunda tanda — con el usuario probando (acá salió lo de fondo)**

| # | Qué | Commit |
|---|---|---|
| 3 | El botón de generar se libera al encolar, no al terminar el render | `9354fdd` |
| 4 | Un pedido sin respuesta ya no deja el botón muerto | `f87b4fc` |
| 5 | Cada botón dice a qué canal pertenece | `54cfb48` |
| 6 | Clips de a 6 en paralelo, con reintentos ante cortes de Drive | `c0139b6` |
| 7 | **Los dos canales dejan de pisarse — botones y estado por variante de verdad** | `0c23a10` |

⚠️ **El commit 5 fue un error de lectura mío y conviene no repetirlo.** El usuario pidió "botón por
canal" y yo entendí *ponerle el nombre del canal al botón*. Su respuesta: *"cuando quería un botón
para cada canal no me refería a lo estético"*. Lo que pedía era **independencia funcional**, que es
lo que entró recién en el commit 7. El renombrado igual quedó porque ayuda a leer la pantalla, pero
no resolvía nada por sí solo.

#### 1. El desacople (`b21988c`)

Eran **tres candados, todos de interfaz**, ninguno una dependencia real:

- `marcarPasoVariante` frenaba el avance hasta que las dos variantes aprobaran el paso, y saltaba
  solo a la otra pestaña. Ahora marca, avisa en el registro y sigue. El punto de color de la
  pestaña conserva el aviso: **te avisa, no te frena**.
- `lockFrom` bloqueaba en pantalla los pasos de las dos variantes y borraba lo aprobado de ambas.
  Ahora el estado de los pasos 3 a 6 es **propio de cada video** (`pasos` dentro de cada variante,
  restaurado por `pintarVista` al cambiar de pestaña). Los pasos 1 y 2 siguen compartidos, que es
  lo correcto: la lectura y el ángulo valen para los dos.
- El render exigía el destino de ambos y encolaba los dos juntos. Ahora el botón genera **el video
  de la pestaña activa** ("Generar &lt;canal&gt;") y al lado quedó **"Generar los dos"** para el flujo
  de siempre. Si uno falla, el otro sigue su camino.

Además, **"Regenerar solo este guion"** en la pestaña del gemelo: `soloGemela: true` en
`/api/generate-script` escribe el guion B contra el guion A **ya guardado**, sin reescribirlo y sin
tocar el `paso` del job.

⚠️ **La única dependencia real entre los dos videos** es esa: el guion de B se escribe contra el de
A ("esto es lo que NO podés parecerte"). No hace falta que el de A esté aprobado ni locutado, solo
que exista. De ahí en adelante son independientes.

#### 2. Dos desfases que el acoplamiento tapaba

- Reescribir el guion del gemelo dejaba colgados sus `fragments` y su `audioToken` viejos
  (`{ ...gemela, ...resultado }` los conservaba). No se notaba porque el `paso` global del job los
  ocultaba al rehidratar. Ahora `gemelaConGuionNuevo()` los limpia en el origen.
- Al retomar un proceso, el gemelo se rehidrataba **acotado por el `paso` global del primero** y
  perdía su propio avance: su pestaña se abría bloqueada aunque tuviera guion y locución. Ahora
  sale de sus propios datos (`pasosSegunDatos`).

#### 3. El riesgo de pérdida de datos (`a6fc5a5`) — leer esto

`jobs.json`, `historial.json`, `cola.json` y `famosos.json` se respaldan **al mismo nombre en la
misma carpeta de Drive** desde local, staging y producción. Y `driveCache.restaurar()` **no baja
nada si el archivo local ya existe con contenido**. Resultado: la máquina de casa nunca ve lo que
hicieron las otras — arranca con su copia vieja y la sube encima.

**Pasó de verdad esta noche**: levantar el servidor local para probar dejó el respaldo de
`jobs.json` con 4 jobs de prueba en lugar de los **11 reales**. Se recuperó desde las revisiones de
Drive (`drive.revisions.list` + `revisions.get`) y el respaldo quedó sano — pero si staging hubiera
reiniciado antes, el historial se habría ido con él.

Arreglado: desde local esos cuatro archivos **ya no se respaldan**. Existen para que Railway
sobreviva un redeploy (disco efímero); el disco local no lo es, así que respaldar desde ahí no
aporta nada y solo puede destruir. El material adicional se sigue subiendo desde donde sea.

💡 **Si alguna vez falta un job o el historial de tomas se ve raro**: el archivo en Drive guarda
revisiones y se puede recuperar una anterior. `jobs.json` es el fileId
`1lb-zMBFWfsQN1rwoZDe-CasphjW5a6wF`.

### Cómo quedó la pantalla

**Cada botón lleva el nombre del canal de la pestaña abierta**, desde el Paso 1 (antes decía
"Video B" hasta el Paso 6). `etiquetaVariante` lo busca en tres lados: la carpeta de destino ya
elegida, el canal del Paso 1 (y su hermano vía `GEMELAS`), o "Video A"/"Video B" como último
recurso. Con gemelos apagado, todos los textos vuelven a los de siempre.

| Paso | Texto con gemelos |
|---|---|
| 3 | "Aprobar guion **de La Naple** y continuar" |
| 3 | "**Regenerar los dos guiones**" (antes "Regenerar (mismo ángulo)" — se renombró porque nadie adivinaba que reescribía ambos) |
| 3, solo en el gemelo | "Regenerar solo el guion **de La Naple**" (y el de arriba se esconde, para que no se confundan) |
| 4 | "Confirmar asignaciones **de La Naple**" |
| 5 | "Aprobar locución **de La Naple**" / "Regenerar locución **de La Naple** (v3)" |
| 6 | "Generar **La Naple**" + "Generar los dos" |

Los botones se renombran dentro de `actualizarBotonesVariante()`, que llama `actualizarTabs()` — un
solo lugar del que acordarse cuando cambia el destino, el canal del Paso 1 o la pestaña abierta.

### La segunda tanda, en detalle

Cada uno salió de que el usuario probara y describiera con precisión qué veía. **Pedirle la
secuencia exacta (qué apretó, en qué orden, qué pasó después) fue lo que destrabó el diagnóstico**
— con "no funciona" no se llegaba.

#### 3. El botón atado al render entero (`9354fdd`)

*"una vez que terminó el renderizado del primer video recién me dejó presionar el botón"*.

`generarVideos` soltaba el botón en su `finally`, o sea **después de esperar el render completo**
(minutos). Encolar y esperar ahora están separados: el botón se libera con el video ya en la cola y
`seguirRender` sigue cada uno en segundo plano. Los renders **siguen yendo de a uno** — eso no
cambió, es lo que evita que las tomas se repitan.

#### 4. Pedidos que quedaban colgados para siempre (`f87b4fc`)

Captura del usuario: "Confirmar asignaciones" apagado y sin responder.

`apiCall` hacía `fetch` **sin techo de espera**. Si la respuesta se perdía —el gateway corta los
pedidos largos, y locutar 20+ párrafos tarda— la promesa no se resolvía NI fallaba: quedaba colgada,
y con ella el `finally` que rehabilita el botón. Única salida: recargar.

Explica también un síntoma anterior: la pantalla decía "todavía no se generó la locución" **mientras
el servidor sí la tenía** (los 71s del video B). Se generó; el navegador nunca se enteró.

Ahora: `AbortController` con techo de 5 min, y `regenerarAudio` **busca la locución en el job antes
de dar error** — si ya se generó, la rescata en vez de hacerle pagar otra.

#### 6. Descargas de clips en paralelo (`c0139b6`)

Pregunta del usuario: *"¿y no puede bajar todos a la vez? se supone que es una conexión súper
rápida"*. Los 20-30 clips se bajaban de a uno.

**Medido con clips reales (12 archivos, 41 MB): 7,0s de a uno contra 2,0s de a 6 — 3,4x.**

Por qué 6 y no todos: comparten el mismo enlace (la ganancia se aplana enseguida) y pedirle 30
archivos juntos a Drive invita a que corte por cuota.

Lo que más vale de este commit no es la velocidad: **`drive.js` no tenía NINGÚN reintento**. Un 403
por cuota tumbaba el render entero, y eso ya pasaba bajando de a uno. Ahora hasta 3 intentos con
espera creciente y jitter ante 403/429/5xx y cortes; un 404 no se reintenta.

Y apareció **otro cuelgue escondido**, hermano del #4 pero del lado del servidor: el stream de
entrada no tenía listener de `error`. Una descarga cortada a mitad no emitía `finish` ni fallaba —
promesa colgada para siempre, con el render clavado detrás. Si alguna vez aparece un render eterno
sin error, mirar ahí primero.

#### 7. La separación real de los canales (`0c23a10`)

Ver el bloque de arriba (⚠️ LO MÁS IMPORTANTE DEL DÍA). Alcanzó a ocho operaciones: `aprobarGuion`,
`confirmarAsignaciones`, `regenerarAudio`, `recargarAudioDeDrive`, `aprobarAudio`,
`regenerarSoloGemelo`, `regenerarGuion` y `generarVideos`. `lockFrom`, `invalidarPasos` y
`marcarPasoVariante` reciben la variante explícita. `rendersEnVuelo` se fusionó con `ocupacion`.

**Cómo se verificó** (vale como patrón para el próximo cambio de este tipo): interceptando `fetch`
para que el servidor conteste **cuando yo quiera**, y forzando el cruce exacto — los dos canales
trabajando a la vez y terminando **al revés** del orden en que se mandaron. Cada locución cayó en su
canal (60s y 71s), pasos correctos, indicadores sin saltar.

### 📺 Los canales y su emparejamiento (pregunta del usuario)

El usuario preguntó si "Embajadores del Chisme / La Naple" era un default. **No**: son sus 4 canales
reales, emparejados en el mapa `GEMELAS` (`public/app.js`), que ya existía desde los gemelos.

| Canal | Hermano |
|---|---|
| Embajadores del Chisme | La Naple |
| Chismex Picante | Supe Lupe |

⚠️ Dos cosas: el mapa está **duplicado** (en `public/app.js` y en `server.js:103`), así que tocar uno
sin el otro los deja discrepando. Y si se **agrega o renombra** un canal, ese par deja de
reconocerse: no rompe nada (avisa y se elige a mano) pero se pierde el automatismo.

### ⏳ Un límite práctico que el desacople hace más probable

`limpiezaInsumos` manda a la papelera la carpeta de insumos del job a las **48h de creada**
(retención elegida por el usuario el 2026-08-05, configurable con `INSUMOS_RETENCION_HORAS`). Ahí
viven el `audio.mp3` y el `guion.json` que usa `recuperarAudioDeDrive` para rescatar una locución ya
pagada.

Ahora que el segundo video se puede dejar para otro día, es fácil volver pasadas las 48h y
encontrarse con que **hay que regenerar la locución** (gasto de ElevenLabs) porque su respaldo ya se
fue a la papelera. No es una regresión —pasaba igual al retomar cualquier job viejo— pero antes era
raro llegar a esa situación y ahora no lo es. Si empieza a molestar, subir `INSUMOS_RETENCION_HORAS`
es una variable de entorno, no un cambio de código. Decisión del usuario.

### Lo que solo el usuario puede cerrar

1. **Probar el cruce que falló, con una noticia real**: mandar un canal, pasarse al otro mientras
   trabaja, y mandarlo también. Verificado en browser forzando ese cruce exacto, pero el que sabe si
   se siente bien es él. **Es lo primero que hay que preguntarle al retomar.**
2. **Corregir un video B con el A ya subido**, de punta a punta.
3. Sigue pendiente de antes: escuchar la música a **-20 dB**, escuchar una pronunciación cargada a
   mano, comparar los dos motores de guion, y un par de gemelos completo con sesgo opuesto.

### Pendientes de fondo (sin tocar hoy, a propósito)

1. **Merge `test-persistencia` → `main`.** Producción sigue en `624a24a` (17 de agosto) y ya le
   faltan **40 commits**. **Abierto desde el 25 de julio**, sigue siendo el riesgo más grande del
   proyecto. Recordar que **el usuario trabaja contra STAGING**.
   ⚠️ Además, la URL de producción que figura acá (`farandula-insumos-production.up.railway.app`)
   responde **404 en todo**: o el servicio se apagó o cambió de nombre. Hoy la única app viva es
   staging. El usuario lo confirmó — solo conoce y usa `test-persistencia`.
2. `/api/exportar` (modo Insumos) sigue sin cola ni gemelos. No es regresión.
3. Publicación automática a Facebook: proyecto aparte.
4. El usuario todavía tiene que revisar y limpiar a mano las carpetas viejas de Drive
   (`renders`, `insumos para edicion`).
5. `farandula-video-family` sigue sin desplegar, y el código duplicado entre repos sigue creciendo.
6. La portada JPG del video gemelo: sigue habiendo solo la del primero (`state.previewToken` es uno
   solo). No lo pidió nadie todavía.

### Recordatorios operativos

- Tras cada deploy, recargar con **Ctrl/Cmd + Shift + R**. Si no, el server responde 400 pidiéndolo
  (guarda de `0d883e8`). Los estáticos ya van con `Cache-Control: no-cache`, pero el JS que la
  pestaña abierta ya cargó no se cambia solo — **si el usuario dice "sigue pasando", lo primero es
  confirmar que recargó**, y lo segundo mirar el `last-modified` de `/app.js` en staging para saber
  a qué hora levantó el contenedor.
- **Antes de empezar en la otra máquina**: `git fetch origin --prune` y revisar la divergencia.
- ⚠️ **Levantar el servidor local ya es seguro** para el estado compartido (arreglado en `a6fc5a5`),
  pero seguí sin apuntar pruebas locales contra datos de producción.
- 🔍 **Para diagnosticar sin adivinar**: `GET /api/jobs` y `GET /api/cola` de staging (con
  `x-api-key`) dicen el estado real de cada video —guion, fragmentos, locución, archivo— y las horas
  exactas. Cotejar esas horas contra la del deploy resolvió sola una confusión entera: lo que el
  usuario había probado era la versión anterior.

---

## CIERRE 2026-08-24 (superado por el de arriba, se conserva por contexto)

Día trabajado desde las **dos máquinas**: Windows (fix de locución, nombres de famosos, motor de
guion nuevo) y Mac (sesgo opuesto en gemelos, auditoría de la música). Todo pusheado y desplegado
en staging; nada quedó a medias.

| Repo | Rama | SHA | Estado |
|---|---|---|---|
| `farandula-video-generator` | `test-persistencia` | `767adc0` | local = remoto, desplegado en staging |
| `generador-guion-graphify` | `main` | `b7cb077` | **repo NUEVO**, ver abajo |

### ⚠️ Lo primero: hay un repo nuevo

`generador-guion-graphify` **ya no vive en `G:\Mi unidad\`** (Google Drive). Ahora es un repo
propio: `github.com/jorucarbus/generador-guion-graphify` (privado), y en Windows está en
`D:\claude pro apps\generador-guion-graphify`.

Se movió porque el sync de Drive corrompe archivos por la carrera de escritura —ya había pasado
con `npm install`— y un `.git` a medio escribir es peor que un `node_modules` roto.

Para trabajarlo en la otra máquina: `git clone`, `npm install`, y un `.env` con `GEMINI_API_KEY`.
**No hace falta tener graphify instalado** salvo que se quiera reconstruir el grafo; el
`graph.json` viaja en el repo. La app **no importa ese código**: solo consume
`catalogo-tecnicas.json`, que se regenera con `node exportar-catalogo.js` y se copia.

⚠️ Git en `D:` (Windows) pide `git config --global --add safe.directory '<ruta>'` — exFAT no
registra propietario. Ya está puesto para los dos repos de esa máquina.

### Qué entró hoy (5 tandas, cada una con su entrada detallada más abajo)

| # | Qué | Commit | Dónde |
|---|---|---|---|
| 1 | Fix de la locución cruzada entre pestañas (el del screenshot) | `034129b` | Windows |
| 2 | Nombres de famosos: cotejo fonético + pronunciación por famoso | `342dd2d` | Windows |
| 3 | Motor de guion por estructura (grafo) + selector en el Paso 2 | `7c3daee` | Windows |
| 4 | Gemelos con **sesgo opuesto** en el motor `grafo` | `970c698` | Mac |
| 5 | Música: default de -18 a **-20 dB** tras auditar el emparejado | `767adc0` | Mac |

**El motor `grafo` quedó con DOS diferenciadores entre gemelos**, que se suman: la **estructura**
narrativa (la elige el motor, y para el segundo video tiene que apartarse de la del primero) y
ahora el **sesgo** (si el primero va a favor del protagonista, el hermano va en contra). Con el
motor de siempre, los gemelos siguen compartiendo ángulo y postura.

### Lo que solo el usuario puede cerrar (nadie más decide esto)

1. **Escuchar la música al nuevo -20 dB.** Está medido que la separación con la voz queda en ~18 dB
   —el nivel que él mismo aprobó el 14/08— pero no se generó un video completo con el default nuevo.
2. **Escuchar una locución con pronunciación cargada a mano** ("Nawat" → "Nagüat"). Que la
   alineación de subtítulos NO se rompe está medido; si suena mejor lo decide su oído.
3. **Comparar los dos motores de guion** sobre la misma noticia. Que los gemelos salen más
   distintos está medido (16% de vocabulario común contra 46%); si son *mejores* es criterio suyo.
4. **Un par de gemelos completo con sesgo opuesto**, de punta a punta. Lo verificado es que las dos
   crónicas salen opuestas, no el video final.

### Pendientes de fondo (sin tocar hoy, a propósito)

1. **Merge `test-persistencia` → `main`.** Producción sigue en `624a24a` (17 de agosto) y le faltan
   **27 commits**: gemelos, cola de renderizado, estructura nueva de Drive, música emparejada por
   LUFS, nombres de famosos, motor de guion nuevo y sesgo opuesto. **Abierto desde el 25 de julio**,
   y sigue siendo el riesgo más grande del proyecto. Recordar que **el usuario trabaja contra
   STAGING**, así que producción no es lo que él ve todos los días.
2. `/api/exportar` (modo Insumos) sigue sin cola ni gemelos. No es regresión.
3. Publicación automática a Facebook: proyecto aparte; acá solo quedó preparada la forma (carpeta
   plana por canal + la hoja como cola).
4. El usuario todavía tiene que revisar y limpiar a mano las carpetas viejas de Drive
   (`renders`, `insumos para edicion`).
5. `farandula-video-family` sigue sin desplegar, y el código duplicado entre repos sigue creciendo.

### Recordatorios operativos

- Tras cada deploy, recargar con **Ctrl/Cmd + Shift + R**. Si no, el server responde 400 pidiéndolo
  (guarda de `0d883e8`, puesta porque ese error costó una sesión entera de diagnóstico).
- **Antes de empezar en la otra máquina**: `git fetch origin --prune` y revisar la divergencia. Hoy
  pasó justamente eso — Windows encontró dos commits de la Mac esperando en el remoto.

### 2026-08-25 (Windows) — Un clip con color `reserved` tumbaba el render entero (NO era el orden A/B)

Reportado con captura: **-22 (Invalid argument) / Nothing was written into output file**, y una
hipótesis del usuario: *"me parece que si no respeta el orden se crashea, si hace primero la b ya
no logra hacer la a"*.

**Los datos dicen otra cosa.** `/api/cola` de staging, últimos 4 pares:

| Variante | Canal | Estado |
|---|---|---|
| A | Embajadores del Chisme | **error** (siempre, mismo stderr) |
| B | La Naple | listo (siempre) |

No es el orden: es el **material**. La A toca un clip que la B no toca, porque la rotación de
`historial.json` reparte archivos distintos a cada video. Vale como recordatorio de método: la
cola guarda el stderr completo de cada render fallido, y eso alcanzó para descartar la hipótesis
sin tocar código.

### El clip

`src_1aUouVvdCE2txjy7jVCl8QJ_cledQeGyz.mp4`, un HEVC de iPhone que ffprobe describe como
`yuv420p(tv, reserved/reserved/smpte170m)`. **`reserved` no es un valor válido de color**: la
especificación lo marca como no usable. ffmpeg 6 y 8 lo toleran; **el 7.0.2 que corre en Railway lo
rechaza** al montar el grafo:

```
[graph 0 input from stream 0:0] Invalid color range
[vf#0:0] Error reinitializing filters!
Task finished with error code: -22 (Invalid argument)
```

### El arreglo, y por qué ESE y no el otro

Antes de cortar, se revisa el color del clip; si tiene campos `reserved`, se usa una **copia** con
los metadatos corregidos a bt709, hecha en el bitstream con `-bsf:v hevc_metadata` + `-c copy`:
no recodifica (53 ms, cacheada por render) y **se puede comprobar con ffprobe que quedó bien**.

Ese punto decidió el enfoque. El primer intento fue pasar `-color_primaries` como opción de input
a cada corte, y **al verificarlo el archivo de salida seguía diciendo `reserved`**: no había forma
de saber si el decodificador la respetaba. El bsf es verificable y no depende de la versión de
ffmpeg.

Quirúrgico a propósito:
- **Solo `reserved`.** `unknown`/`unspecified` significan "no se sabe", son legítimos y los trae
  muchísimo material de redes: corregirlos también haría que esto tocara casi todos los clips.
- **Solo los campos rotos**: el `transfer_characteristics` válido del clip (smpte170m) se conserva,
  para no cambiarle el color a un video que hoy se ve bien.
- Códec que no sea H.264/HEVC, o bsf que falla → se sigue con el original.

### Verificación

Con el clip REAL bajado de Drive: la detección marca el roto y **no toca uno sano**; la corrección
deja `bt709/bt709` conservando `smpte170m`, misma duración (15.08s), sin recodificar; la segunda
llamada reusa la copia (53 ms); y un **render completo local** con ese clip, con zoom + espejo +
transiciones, salió sin errores.

⚠️ **El crash NO se pudo reproducir en local**: es específico del ffmpeg 7.0.2 de Railway. Se probó
con el 6.1.1 local y con un **8.1 descargado a propósito** — ninguno falla, ni con efectos, ni en
ningún tramo del clip. Es el mismo patrón que ya mordió con `zoompan` y `geq`: **funciona local,
revienta en producción**. La prueba definitiva es reintentar ese render en staging.

**Bug propio encontrado verificando**: `infoColor` mapeaba los campos de ffprobe POR POSICIÓN, y
ffprobe los imprime en SU orden, no en el que se piden — daba `transfer` donde iba `space`. Ahora
se parsea por clave.

### 2026-08-24 (Windows) — El video gemelo ahora se puede VER, no solo abrir en Drive

Pedido del usuario: *"necesito poder ver los dos videos renderizados"*.

El primero se mostraba con reproductor y el gemelo **solo con un link a Drive**, así que para
mirarlo había que salir de la app. Los dos renders generan preview por igual (`previews.set` corre
en cada uno, y se conservan los 3 más recientes: los dos del par entran) — el dato estaba, no se
estaba usando.

Ahora el bloque del gemelo trae reproductor, nombre de archivo, duración y carpeta destino, igual
que el primero. Y como quedan dos reproductores en pantalla, en modo gemelos el primer bloque se
rotula con **su canal** en vez de "Video generado exitosamente" — sin eso no se sabe cuál es cuál.
Sin gemelos, el texto queda como estaba.

Verificado en browser real: dos reproductores, los dos cargan (readyState 4, sin error), rotulados
"Chismex Picante" y "Supe Lupe"; y la regresión sin gemelos deja un solo reproductor con el
rótulo de siempre.

**Pendiente relacionado, NO hecho**: la portada JPG sigue siendo solo del primer video. El bloque
de "elegí la foto" usa `state.previewToken`, que es uno solo, así que el canal hermano se queda
sin su JPG. Si el usuario lo pide, hay que llevar el bloque de portada a la variante activa.

## 2026-08-24 (noche) — Motor de guion por estructura, sobre el grafo de técnica narrativa

El usuario tenía el generador con graphify funcionando aparte (por CLI) y pidió **las dos opciones
dentro de la app**: *"quiero tener las dos opciones, guion con graphify y guion tradicional, o sea
quiero poder elegir entre cuál usar"*. Y sobre cómo debía comportarse el nuevo: *"quiero que mi
motor escoja la mejor forma de estructurar la noticia, no me interesa escoger el ángulo en
graphify, quiero que él mismo lo escoja"*.

### Lo que ya estaba hecho jugó a favor

`MOTORES_GUION` (gemini.js) se creó el 22/08 **exactamente para esto**, calcado de `FRAGMENTADORES`.
El motor nuevo entró como una entrada más del objeto: `server.js` no cambió de forma, solo pasa qué
motor usar.

### La diferencia real entre los dos motores

| | Motor de siempre | Motor del grafo |
|---|---|---|
| Qué elige el usuario | uno de 7 ángulos (de qué va) | nada |
| Qué decide el motor | la redacción | **cómo estructurar** (apertura, orden de revelación, cierre) |
| De dónde sale el criterio | el prompt | 208 técnicas del grafo (curso de guion + redacción + retención de video corto) |
| Palabras medidas | 206-215 | 190-203 (ver guarda abajo) |

**Ojo con la distinción, que costó aclararla con el usuario**: el grafo aporta **técnica**, no
**tema**. Sus consultas son apertura, tensión, personaje, cierre y retención — ninguna decide de qué
habla el video. Sacar el selector de ángulos sin más dejaba esa decisión huérfana; el usuario eligió
que la tome el motor.

### Por qué NO hay Python en Railway

El catálogo viaja **congelado** en `catalogo-tecnicas.json` (208 técnicas, 85 KB, ~14.000 tokens).
`graphify query` es un binario de Python que vive en la máquina del usuario, y meterlo al build le
agregaría al pipeline de video —que ya está en producción— una dependencia que puede romperlo.

Y el catálogo completo es **mejor** que las 5 consultas fijas del proyecto original: la elección se
hace **con la noticia delante**, mientras las consultas de allá preguntan siempre lo mismo. Eso
además esquiva el punto ciego que ya apareció allá el 19/08: el BFS arranca por similitud de
palabras, así que el material de retención quedaba invisible para consultas redactadas con
vocabulario de cine.

Se excluyen del catálogo las comunidades de **maquetación de guion de cine** (formato de página,
formato de diálogo): no aplican a una locución de 70 segundos. Por NOMBRE, no por número de
comunidad — los números cambian en cada reconstrucción del grafo.

**Para actualizarlo**: en `generador-guion-graphify`, `graphify . --update` +
`node exportar-catalogo.js`, y copiar el archivo. Nada más.

### Sin duplicar prompts (la lección del cartel, aplicada)

El guion se escribe con el **mismo** `PROMPTS.guion` y los **mismos** bloques de citas y de
no-repetición: `bloqueDeCitas` y `bloqueDeEvitar` se extrajeron de `generarGuion()` a funciones
compartidas que exporta `gemini.js`. Duplicarlos era garantizar que un día se desincronizaran — es
el bug que costó una semana con la geometría del cartel. Efecto concreto: el motor nuevo **no
pierde** la feature de que el guion le haga lugar a las citas de la entrevista.

### Bug encontrado probando: elegía la misma estructura para los dos gemelos

Pedirle "que sea estructuralmente distinto del hermano" **no alcanzó**: eligió la misma (la de doble
caída, que es la más aplicable a video corto y por eso se vuelve la respuesta fácil). Ahora primero
tiene que **nombrar** la estructura del hermano en un campo `evitada` y después apartarse de ella.
Obligarlo a decir de qué se aparta es lo que lo saca de la respuesta cómoda — y quedó en el log,
que es lo único que permite confirmarlo en producción.

### Guarda de longitud (sirve a los dos motores)

Medido: el motor del grafo se queda corto seguido (190-203 palabras) porque al sumarle el bloque de
estructura el modelo recorta. Y **la longitud no es cosmética: de ella sale la duración del video**
— 190 palabras son ~5 segundos menos.

`escribirGuion` reintenta **una** vez cuando baja de 200 (el mínimo que el propio prompt declara).
Dos detalles del diseño:
- El aviso viaja por un parámetro `nota` **propio**, no por `guionEvitar`: en el motor del grafo,
  `guionEvitar` dispara las reglas del gemelo y habría ensuciado la elección de estructura.
- La nota va al prompt del **guion**, nunca al de la elección: si no, elegiría estructura "para
  escribir más largo" en vez de para la noticia.

Si el reintento sale peor, se usa el primero. Nunca aborta.

### Verificación (Gemini real, sin gastar ElevenLabs)

| Qué | Resultado |
|---|---|
| Guion por el grafo | "Doble caída de la dignidad", citando 4 técnicas reales, incluidas las de retención (Zeigarnik, romper patrón) |
| **Gemelos** | **dos estructuras distintas, 0 tiras de 5 palabras compartidas, 16% de vocabulario común** (el motor de siempre: 1 tira y 46%) |
| Guarda de longitud | detectó 192 → reintento → 202. El motor de siempre dio 215 sin reintento |
| Endpoints | motor inexistente 400, sin ángulo ni motor 400, grafo sin ángulo 200 |
| Regresión | con ángulo 2 y sin mandar motor: 212 palabras, el grafo no se activa |
| Browser real | el selector oculta la grilla de ángulos y la restaura; genera guion sin ángulo elegido y sin alertas |

**Los gemelos son la mejora más clara**: el motor de siempre los diferencia por redacción (46% de
vocabulario común); el del grafo, por estructura (16%). Es lo que TikTok mira cuando penaliza
contenido duplicado entre canales.

### El proyecto del grafo salió de Google Drive

`generador-guion-graphify` vivía en `G:\Mi unidad\` **sin git**. Ahora está en
`D:\claude pro apps\generador-guion-graphify` con remoto privado en GitHub
(`jorucarbus/generador-guion-graphify`).

Se movió porque el sync de Drive corrompe archivos por la carrera de escritura —ya había pasado con
`npm install`, está en su README— y un `.git` a medio escribir es peor que un `node_modules` roto.
Verificado antes de borrar el original: 480 archivos, checksums idénticos de todos los `.js`, y el
grafo respondiendo las 5 consultas desde la ubicación nueva. Fuera del repo: `.env`,
`node_modules`, el `graph.html` y el caché semántico.

⚠️ **Git en D: necesita excepción**: es exFAT y no registra propietario, así que pide
`git config --global --add safe.directory`. Ya está puesta para este repo.

### Pendiente

- **El juicio del usuario**: si los guiones del grafo le gustan más que los de siempre. Está
  medido que son más distintos entre gemelos; si son *mejores* lo decide él.
- Los ~200 palabras del motor del grafo dan videos ~4 segundos más cortos que los 215 del motor de
  siempre. Con la guarda quedan en el mínimo aceptable, no en el medio del rango.
- `graphify query` en vivo (elegir técnica según la noticia consultando el grafo, no el catálogo
  congelado) sigue siendo posible, pero exigiría Python en Railway. Hoy no hace falta.


## 2026-08-24 — Nombres de famosos: bien escritos (cotejo fonético) y bien pronunciados

Reporte del usuario: *"como suele poner lo que escucha a veces le cambia los nombres de los
protagonistas"*. Real y con consecuencias en cadena: cuando la fuente es hablada, Gemini
transcribe **de oído** y los nombres propios salen fonéticos — "Fátima Bosch" vuelve como
"Fátima Bos", "Nawat" como "Nagua".

**El error no se queda en la crónica**, y eso es lo que lo hace caro: viaja a la locución
(ElevenLabs lee lo que está escrito), a los subtítulos (en letra grande, todo el video), al
matching de la carpeta de clips (un nombre mal escrito no encuentra su famoso), al nombre del
archivo y a los **hashtags**, donde además mata el alcance del video.

### La fuente de verdad no es la web

Son **las 272 carpetas de Drive** que el usuario ya mantiene a mano. Buscar en Google se evaluó y
se descartó con él: en farándula la web está llena de nombres mal escritos, y sumaría rumor al
pipeline que justamente está diseñado para no inventar.

### Clave fonética, y por qué comparar letra a letra no sirve

`famosos.js` (nuevo) reduce cada nombre a **cómo suena**: b/v, ll/y, s/z/c, h muda, k/qu/c, w/gu,
tildes, dobles, y —la regla que resuelve el caso del reporte— **la consonante final atípica que el
oído castellano se come** ("Bosch" → "Bos", "Nawat" → "Nagua"). Comparando ortografías, "Bos" y
"Bosch" no se parecen lo suficiente; comparando sonidos, son el mismo nombre.

Dos detalles que costaron una vuelta:
- **La ñ se aparta antes de quitar tildes**: descompuesta es "n + tilde", así que el barrido de
  diacríticos la volvía n y hacía de "Peña" y "Pena" el mismo nombre.
- **`ch` se marca antes de la regla de la h muda** y se restituye después, o "Chávez" terminaba
  como "cabes".

**Medido contra el catálogo real**: 272 carpetas → **272 claves distintas, 0 colisiones y 0 pares a
distancia 1**. O sea que el riesgo de auto-corregir al famoso equivocado es nulo con el catálogo de
hoy. Si algún día aparece un choque, hay que revisar el umbral — el test está listo para
re-correrlo.

**Confianza alta** (misma clave) se corrige sola y se avisa qué cambió; **media** (un sonido de
distancia) va como sugerencia, porque con 272 nombres "Camila" y "Camilo" suenan casi igual;
**sin candidato** se deja como vino con aviso — decisión explícita del usuario: no corta el flujo.

### La corrección se aplica a TODA la lectura

No solo al campo `protagonista`: **el guion se escribe desde la crónica**, y el título y la
descripción son lo que se publica. Los hashtags se reescriben aparte (van pegados, y meterles el
nombre con espacios los partiría en dos).

Y **la tabla vive en `data/famosos.json`**, respaldada en Drive igual que `jobs.json` — NO en los
nombres de las carpetas, que son la llave con la que se buscan los clips: renombrarlas rompería el
matching de los procesos ya guardados. Cada corrección queda **aprendida** (campo `alias`): la
próxima vez ese nombre se arregla sin preguntar.

Además, `PROMPTS.acta` suma una regla: **si la fuente trae texto** (caption, título, rótulo en
pantalla), los nombres se copian de ahí en vez de escribirse de oído. Ahí suelen venir bien.

### Pronunciación por famoso, y el riesgo que traía

Escribir bien no es pronunciar bien: aunque el nombre quede correcto, la voz puede decir mal uno
extranjero. El campo `decir` de la tabla es lo que se le manda a hablar a ElevenLabs.

⚠️ **El camino limpio está bloqueado por permisos**: los diccionarios de pronunciación del API de
ElevenLabs dejarían el texto intacto, pero la API key de esta cuenta responde *"missing the
permission pronunciation_dictionaries_read"*. Si algún día el usuario amplía los permisos de la
key, ese camino existe y es más prolijo. Mientras tanto la sustitución se hace acá, y no depende
de permisos ni de qué modelo responda.

⚠️ **Y el riesgo real, que hay que entender antes de tocar esto**: `tiempos.matchTexto()` compara
el texto de cada fragmento contra los caracteres alineados **letra por letra**. Si se manda a
hablar "Nagüat" y el fragmento dice "Nawat", el match falla y `alinearFragmentos` devuelve null:
**cae TODA la locución** al reparto estimado por caracteres, que es como salen los subtítulos
corridos que el usuario ya sufrió. Por eso el mismo mapa viaja a `alinearFragmentos()` — los dos
lados comparan la forma **hablada**, y lo que se muestra sigue siendo la **escrita**.

### Dos bugs propios encontrados PROBANDO, no leyendo código

1. **El apellido suelto**: la crónica real que devolvió Gemini decía *"Bos abordó el altercado"* —
   no repite el nombre completo cada vez. El reemplazo del nombre completo no lo alcanzaba, así que
   ahora también se parean palabra a palabra (Fatima→Fátima, Bos→Bosch) cuando las dos formas
   tienen la misma cantidad de palabras. Solo palabras de 3+ letras, para no pisar partículas.
   Verificado que NO toca "Bosnia", "Bosque" ni "Bosco".
2. **Las marcas van pegadas**: `agregarMarcas` devuelve `"...directivo Nawat.[fast]Le puso..."`, así
   que partir por espacios daba el token `Nawat.[fast]Le` y el nombre no se reconocía. Ahora la
   sustitución usa lookarounds de letra.

### Hallazgo aparte: `agregarMarcas` inventa texto con guiones cortos

Probando con un guion de juguete (2 frases), Gemini **agregó contenido que nadie escribió** ("¡obvio
no! es que neta ni cómo defender lo indefendible ¡qué oso!...") y fusionó las dos frases quitando el
punto. Con el guion real de 207 palabras no pasó. **No es un bug de este cambio** —el prompt de
marcas espera un guion completo— pero explica un modo de falla ya visto: el aviso de "no calza con
el audio" del 2026-08-18. Si vuelve a aparecer con guiones normales, mirar ahí.

### Verificación

| Qué | Resultado |
|---|---|
| Colisiones en las 272 carpetas | 0 claves repetidas, 0 pares a distancia 1 |
| Nombres reales estropeados como lo haría el oído | **129 recuperados, 0 corregidos MAL**, 1 sin candidato ("Las ñañas") |
| Falsos positivos que no deben fundirse | Peña/Pena, Camila/Camilo, Daniel/Daniela: distintos |
| Lectura REAL (Gemini + Drive) | "Fatima Bos" → Fátima Bosch, "Nagua" → Nawat, con crónica, título y hashtags corregidos |
| Alineación con pronunciación | Sin el mapa: null (cae al estimado). Con el mapa: cuadra exacto, subtítulos con la forma escrita |
| Locución REAL de 207 palabras | 77.4s, **ningún aviso de desalineación** |
| Regresión con tabla vacía | Texto intacto, alineación igual, la firma vieja de 3 argumentos sigue andando |

Todo lo de prueba se limpió: la carpeta de insumos de prueba fue a la papelera de Drive, y
`jobs.json` / `famosos.json` locales quedaron como estaban.

### Decisión de UI que el usuario tomó en el camino

Preguntó por poner **pestañas A/B también en la columna Productos** porque no encontraba el título
y la descripción del gemelo; al ver que ese bloque ya existía (abajo del de A) **decidió dejarlo
como está**. Queda anotado el diagnóstico: guion B y audio B **no existen** en Productos (las tres
casillas se llenan solo con `state.varianteActiva === 'A'`), y si algún día se hacen esas pestañas,
**el título y la descripción deben quedar FUERA de ellas** — al publicar hacen falta los dos textos
a la vez.

### Pendiente

- **Escuchar** una locución con un nombre pronunciado a mano: que la alineación no se rompa está
  medido, pero si "Nagüat" suena mejor que "Nawat" lo juzga el oído del usuario.
- El **motor de guion con graphify** quedó conversado y fuera de alcance: catálogo de 233 técnicas
  embebido (302 KB, ~15.6k tokens, cabe de sobra), motor seleccionable en `MOTORES_GUION`, sin
  elegir ángulo (el motor lo decide), y **sin Python en Railway** — las 5 consultas del grafo son
  fijas, así que se congelan o se le pasa el catálogo entero a Gemini. Merece su propio plan.


## 2026-08-23 — La pestaña sin locución mostraba (y REPRODUCÍA) la de la otra variante

Reportado con captura: Paso 5, pestaña del video A, el texto decía *"Todavía no se generó la
locución de esta versión"* mientras el reproductor mostraba un audio de **1:13**, y "Aprobar
locución" contestaba *"No hay locución generada para esta versión"*. Tres mensajes contradictorios
sobre lo mismo.

**El 1:13 era el audio del video B** (73s; el de A dura 75.5s — se confirmó consultando el job real
en staging, que tenía los DOS tokens guardados). O sea: el reproductor mostraba la locución de la
otra pestaña.

### La causa, y por qué había que buscarla en la recuperación

`recuperarJobPendiente` llenaba la pestaña B con `job.gemela` **entero**
(`{...nuevaVarianteB(), ...job.gemela}`), sin mirar la etapa, mientras la A se rehidrataba **etapa
por etapa** (guion → fragmentos → audio → completado). Y el `paso` del job es **global: lo comparten
las dos variantes**. Entonces, al retomar un proceso que había vuelto atrás (rehacer el guion baja
el paso a `guion`), la A quedaba correctamente sin locución y la B se quedaba con la suya, marcada
como lista. Dos pestañas contando historias distintas.

`varianteBDesdeJob()` aplica ahora la misma escalera. **De paso apareció otro agujero**: el guion
del segundo video no se restauraba nunca — en el job se llama `script` y en el frontend `guion`,
así que el volcado con spread no lo copiaba y la pestaña B abría con el editor vacío.

### Los otros tres, del mismo reporte

- **`removeAttribute('src')` no descarga lo que el reproductor ya tenía.** Sin un `load()` detrás,
  la pestaña sin locución seguía mostrando —y reproduciendo— la anterior. **Medido en el navegador**:
  con el código viejo, tras quitarle el `src`, el reproductor seguía sonando con los 73.12s del
  video B; con el fix queda en blanco de verdad.
- **La locución vive en DOS lados** (el token local y el job del servidor) y solo se miraba el
  local. `rescatarAudioVariante()` la busca en el proceso guardado antes de darla por perdida, y
  **verifica que suene** con un `HEAD` a `/api/audio` — que ya recupera el mp3 desde Drive por su
  cuenta (fix de julio). Sin esto, un desfase de estado local costaba una locución de ElevenLabs YA
  PAGADA. Si el HEAD falla, no se adopta el token: mejor regenerar que aprobar un audio fantasma.
- **`confirmarAsignaciones` avanzaba con la locución fallada**: `regenerarAudio` atrapa su propio
  error (para poder ofrecer "reintentar"), así que había que mirar lo que devuelve. Marcaba el paso
  igual y mandaba a la otra pestaña, y el problema aparecía recién en el Paso 5, lejos de su origen.

### Verificación (navegador real, contra el job del reporte)

El job real de staging se copió al `data/jobs.json` local para probar contra sus archivos de Drive
de verdad (y se restauró al terminar). Los dos audios bajaron de Drive: `HEAD /api/audio/<token>`
dio 200 para A y para B.

1. Rescate de la locución de A: token repoblado y **audio sonando, 75.52s** (coincide con el job).
2. Reproductor: viejo → seguía con 73.12s del B; nuevo → `duration` nula, pausado, sin `src`.
3. `varianteBDesdeJob` en los 5 pasos: la B ya no adelanta a la etapa del job.
4. `aprobarAudio`: rescata sin alertar cuando hay algo que rescatar; alerta **con instrucciones**
   cuando de verdad no hay.
5. Paso 4 con la locución fallada: no marca el paso ni salta de pestaña.

### Decisión de UI que el usuario tomó en esta sesión

Preguntó por poner **pestañas A/B también en la columna Productos**, porque no encontraba el título
y la descripción del gemelo. Al ver que ese bloque ya existía (abajo del de A, hay que scrollear)
**decidió dejarlo como está**. Queda anotado el diagnóstico por si vuelve: guion B y audio B **no
existen** en Productos (las tres casillas se llenan solo con `state.varianteActiva === 'A'`), y si
algún día se hacen esas pestañas, **el título y la descripción deben quedar FUERA de ellas** — al
publicar hacen falta los dos textos a la vez, que es la razón por la que ese bloque se hizo así.

## 2026-08-22 — Faltaba el título y la descripción del segundo video en la UI

Reporte del usuario: *"noté que no tengo acceso al título de la lectura y descripción para redes del
canal B"*. Real, y era un agujero de la feature de gemelos: `gemini.variarMetadatos` **sí generaba**
título y descripción propios para el segundo video, se **guardaban** en `job.gemela.metadatos` y
**viajaban** al render (la fila de Sheets del video B sale con su título correcto)… pero el panel
"Resultado de la lectura", que es de donde el usuario copia el texto para publicar, mostraba siempre
los del primero. O sea: el texto existía y no había forma de llegar a él desde la interfaz.

**Fix**: bloque nuevo debajo del de siempre, con el título y la descripción del canal hermano y sus
propios botones de copiar (`pintarLecturaGemela()`).

Dos decisiones de diseño:

- **Los dos a la vez, no en pestañas** — a diferencia de los pasos 3 a 6. A la hora de publicar hacen
  falta ambos textos a mano; obligar a cambiar de pestaña para copiar uno y después el otro sería
  peor que verlos juntos.
- **Cada bloque rotulado con el nombre del canal** (`Para Chismex Picante` / `Para Supe Lupe`, en
  cuanto se elige el destino). Con dos juegos de título y descripción en pantalla, sin rótulo no se
  sabe cuál es de cuál. El rótulo del bloque de arriba solo aparece en modo gemelos.
- La **crónica no se duplica**: es compartida por los dos videos.

**Aviso de degradación**: `variarMetadatos` devuelve los del primero cuando falla (Regla de
robustez). Sin decirlo, el usuario vería el mismo texto dos veces sin saber si es un error de la app
o que Gemini no encontró otra manera de titularlo — y publicaría el mismo copy en los dos canales
sin darse cuenta. Ahora, si salen idénticos, aparece un aviso pidiendo editarlos a mano o regenerar.

**Verificado en browser real**: sin gemelos el bloque no existe (nada cambia del flujo de un solo
video); con gemelos aparece con el texto correcto; los botones de copiar copian el del hermano
(interceptando el portapapeles); los rótulos pasan a los nombres de canal al elegir destino; apagar
y volver a prender el modo oculta y restaura sin tocar el bloque del primero; y el aviso de texto
repetido aparece solo cuando de verdad son idénticos.

## 2026-08-22 — Música: emparejar el volumen entre pistas (LUFS), no bajarles el mismo número

El usuario: *"algunas canciones desde origen están con el volumen más alto"*. Tenía razón, y con
números: el catálogo de **26 pistas va de -16.7 a -12.8 LUFS — 3.9 dB de dispersión**, claramente
audible (a partir de ~1 dB se percibe).

**Esto ya estaba anticipado** en la entrada del 2026-08-14, cuando se bajó la música de -18 a
-20dB: *"esta ganancia atenúa el ARCHIVO fuente… una pista futura masterizada mucho más fuerte
volvería a sonar alta con el mismo número. Si vuelve a pasar, la solución de fondo es normalizar a
LUFS, no seguir bajando el número"*. Es exactamente lo que pasó.

### El cambio

`volume=-20dB` para todas → **ganancia por pista**: cada una se atenúa lo que ELLA necesita para
quedar al mismo nivel que las demás (`musica.gananciaPara(lufs, gananciaDeseada)`).

**El número que se elige sigue significando lo mismo que antes**, y por eso el usuario no tiene que
reaprenderlo: es cuánto se atenúa una pista de REFERENCIA (`REFERENCIA_LUFS = -15`, el promedio
medido del catálogo). "-18dB" da hoy exactamente el mismo volumen que daba el -18dB viejo sobre una
pista promedio; lo que cambió es que ahora TODAS suenan como esa referencia.

**Default -18dB y control manual en el Paso 6** (pedido del usuario en la misma conversación: *"con
ese ajuste entonces que vuelva a -18db nomás… solo tenía problemas con las que estaban más alto. o
también puedes dejarme ajustar el volumen manualmente, claro que quiero que todas partan del mismo
nivel"*). Se volvió a -18 porque el problema nunca fue el nivel general sino las pistas que se
salían: emparejadas, ninguna se pasa. El deslizador va de -30 a -10 dB y **mover el control no
reabre la dispersión** — solo desplaza el objetivo común.

### Dónde vive la medición: en el nombre del archivo

`[lufs=-14.4]`, al lado del `[inicio=0.00s]` que ya existía. Mismo patrón **y por la misma razón
que el usuario eligió en su momento**: un JSON aparte se desincroniza si se agregan o borran pistas
a mano en Drive. Una pista nueva sin etiquetar **se mide al vuelo durante el render** (el archivo
ya está descargado) y se etiqueta sola para la próxima — no hace falta correr nada manual.

`etiquetarTodo()` ahora completa las dos etiquetas y reconstruye el nombre desde cero, así
re-correrlo sobre una pista que ya tiene una de las dos no acumula duplicados.

### La ventana de medición importa

Se mide **desde el offset de inicio y solo los primeros 90s**, no el track entero: un video dura
~70s, así que la música que de verdad suena es ese tramo. Medido: con el track completo quedaban
**0.9 dB** de residuo entre las pistas extremas; acotando la ventana baja a **0.6 dB**.

### Verificación

Las dos pistas extremas del catálogo pasadas por la cadena REAL (`video.prepararMusica`: corte de
silencio + loop + ganancia + fades) y medido el resultado:

| Método | Diferencia entre la más fuerte y la más suave |
|---|---|
| Viejo (-20 fijo) | **3.2 dB** |
| Nuevo (por pista) | **0.6 dB** |

Y con el control en cuatro posiciones distintas, para confirmar que ajustar el volumen no reabre la
diferencia — el resultado se mueve **exactamente** lo que dice el control y la dispersión no se
mueve nada:

| Control | Las dos pistas extremas quedan en | Diferencia |
|---|---|---|
| -24 dB | -38.5 y -39.1 LUFS | 0.6 dB |
| -20 dB | -34.5 y -35.1 LUFS | 0.6 dB |
| **-18 dB (default)** | -32.5 y -33.1 LUFS | 0.6 dB |
| -14 dB | -28.5 y -29.1 LUFS | 0.6 dB |

Más dos renders reales de punta a punta: uno leyendo la etiqueta del nombre
(`-14.4 LUFS → -20.6dB` en el log), y otro con una pista a la que se le quitó la etiqueta a
propósito — la midió al vuelo, obtuvo **el mismo valor** que tenía antes y la etiquetó sola en
Drive. Las 26 pistas quedaron medidas y etiquetadas.

`video.prepararMusica` se exportó para poder medir el resultado real de la cadena sin replicarla en
el test — replicar es justo lo que desincronizó la geometría del cartel en su momento.

**Degradación**: si el análisis falla, `gananciaPara(null)` devuelve el -20 de siempre. El video
sale igual, solo sin emparejar.

### Nota al pasar

El catálogo tiene pistas duplicadas (`Melocotón Mural` en .wav y .mp3, `Güira Noticiero` y `(1)`,
`Sour Sawdust` y `(1)`). No molesta —la rotación las trata como pistas distintas— pero si el
usuario quiere limpiar, ahí están.


## 2026-08-22 — Estructura nueva de Drive: "para publicar" e "insumos edicion" + hoja para el publicador

### El bug de configuración, que NO era el que decía la bitácora

La entrada del 2026-08-18 anotó que `GOOGLE_DRIVE_INSUMOS_FOLDER_ID` estaba mal puesto en staging.
Al ir a arreglarlo, los valores reales mostraron lo contrario: **el mal puesto era
`GOOGLE_DRIVE_RENDERS_FOLDER_ID`**, que apuntaba al id de insumos. Producción los tenía bien.

Consecuencia real, mucho peor que el aviso del log: **todos los renders de staging desde principios
de agosto se guardaron en "insumos para edicion"**, no en "renders". Como los cuatro canales existen
con el mismo nombre en las dos raíces, no se notaba — el video aparecía en una carpeta "Chismex
Picante", solo que la del árbol equivocado.

⚠️ **Y de acá sale un dato que cambia el panorama del proyecto: el usuario trabaja contra STAGING,
no contra producción.** Se deduce del formato: las carpetas `AAAA-MM-DD - Título` las genera código
posterior al 25 de julio, que producción no tiene. Por eso `renders/` está casi vacía desde mayo y
producción, con la variable bien puesta, no recibe nada. Tenerlo presente antes de sacar
conclusiones sobre "qué versión usa el usuario".

### Qué se hizo (decisión del usuario: empezar limpio, no migrar)

Había 103 MP4 sueltos y 8 carpetas de render mal ubicados. El usuario aclaró que **los MP4 los puso
él exportando desde CapCut** (no son del bug) y pidió **no mover nada**: los revisa a mano. En su
lugar, dos carpetas nuevas dentro de `Redes_Canales`:

```
para publicar/     4 subcarpetas de canal — archivos SUELTOS
insumos edicion/   4 subcarpetas de canal — y adentro la carpeta del proceso
```

| Carpeta | ID |
|---|---|
| `para publicar` | `1Zni4Algee1RJTO7qt7BvGV7TwJfTZt1t` |
| `insumos edicion` | `1HHwbzZKNGlhvwzxEVQ0n4A-lEB1UB4zd` |
| Hoja `Publicaciones - farandula` | `1G-FUAwaKPbyppZDhoWJHIU3r8nXKPZFSt5JoYDKKjaE` |

Las tres puestas en staging (`adventurous-reflection`). **Producción sigue apuntando a las viejas
a propósito**: no se usa, y cambiarla sin desplegar el código nuevo la dejaría inconsistente.

### El video ya no va en una subcarpeta por render

Antes cada render creaba `AAAA-MM-DD - Título/` para que el video y su portada quedaran juntos.
Ahora el MP4 va **suelto** a la carpeta del canal y el JPG al lado con el **mismo nombre base**.

El motivo es el publicador automático (proyecto aparte que el usuario ya tiene en mente): con
archivos sueltos, la regla es de una línea — *"todo archivo nuevo en la carpeta de este canal se
publica en este canal"* — y las **imágenes que el usuario suba a mano** entran en la misma lógica
sin ninguna excepción. Con subcarpetas habría que recorrer niveles y distinguir carpeta de archivo.

⚠️ `RENDERS_LOCAL_PATH` (la ruta de Google Drive Desktop, solo local) también hubo que reapuntarla
a `para publicar`. Si apunta a la carpeta vieja, el render local escribe ahí y **Railway y local se
comportan distinto sin que nada falle** — pasó durante la verificación.

### La hoja es la cola del publicador

Hoja nueva, con las 11 columnas de siempre más 6:

| Columna | Para qué |
|---|---|
| Tipo | video / imagen |
| Destino | feed / historia |
| **ID noticia** | el `jobId`: **los dos gemelos lo comparten**, así el publicador sabe que son la misma historia en canales hermanos |
| Archivo en Drive | el id, para encontrar el archivo sin buscar por nombre |
| Publicado el / Link del post | los llena el publicador |

`Status` con `pendiente_publicar`/`publicado` ya existía desde el principio — la hoja ya estaba
insinuando esta forma. Los rangos de `sheets.js` dejaron de estar cableados a 11 columnas
(`NUM_COLS`/`ULTIMA_COL`), y `asegurarEncabezados` reescribe la fila si la hoja tiene menos
columnas de las que el código espera.

### Insumos con gemelos: cada variante en la carpeta de SU canal

`carpetaInsumoDeVariante(job, variante)` resuelve el canal hermano **por nombre** (mismo pareo que
el mapa `GEMELAS` del frontend) y crea la carpeta del gemelo perezosamente, la primera vez que hay
algo que guardar. Si no se identifica el hermano, todo cae en la carpeta del primero con sufijo
`-b` — degrada, no rompe.

Efecto secundario que había que resolver: **recuperar el audio tras un reinicio tiene que respetar
la variante**. Sin eso, el video B habría bajado la locución del A y salido con otra voz.
`jobStore.buscarVariantePorAudioToken()` distingue de quién es cada token.

### Verificación (contra Drive real)

1. Dos gemelos renderizados por la cola: quedaron **sueltos**, uno en cada canal de `para publicar`,
   sin subcarpetas, con su id de Drive registrado en la hoja nueva y `idNoticia` compartido.
2. Insumos del gemelo: la carpeta del primero quedó en `Chismex Picante` y la del hermano en
   `Supe Lupe`, con su propio `fragments.json` (sin sufijo, porque tiene carpeta propia).
3. `/api/folders` y `/api/canales` de staging devuelven los 4 canales nuevos, con los ids correctos
   (4, ya no 5 — la carpeta vieja incluía `transicion`).
4. **La limpieza automática de insumos volvió a funcionar**: el log pasó de
   `🛑 Limpieza de insumos ABORTADA` a `🧹 Insumos: nada que limpiar (retención 48h)`. Llevaba
   abortada desde el 2026-08-18.

Todo lo de prueba se mandó a la papelera al terminar. Panel de historial vaciado a pedido del
usuario (`jobs.json` en cero, con su respaldo actualizado para que Railway no lo restaure viejo).

### Ojo para la próxima sesión

- Un `.env.backup-*` se coló en un commit (con credenciales). Se sacó con `--amend` **antes del
  push**, nunca salió de la máquina, y `.gitignore` ahora lleva `.env.backup*`. Al hacer copias de
  seguridad del `.env`, guardarlas fuera del repo.
- La publicación automática a Facebook (feed + historias, videos e imágenes) es un **proyecto
  aparte** que el usuario ya anticipó. Acá solo quedó preparada la forma: carpeta plana por canal,
  y la hoja como cola con Status/Tipo/Destino.


## 2026-08-22 — Videos gemelos (dos videos por noticia) + cola de renderizado

Pedido del usuario: de los 4 canales solo usa dos a diario (**Chismex Picante** y **Embajadores
del Chisme**); los otros dos son sus gemelos abandonados (*Supe Lupe* y *La Naple*). Quiere que al
elegir noticia, fuentes y citas UNA vez salgan **dos videos hermanos** — mismos hechos, pero
distintos de verdad en guion, orden y fragmentos de tomas — y poder **abrir varias ventanas** para
trabajar noticias distintas en paralelo sin que los renders se atropellen.

Plan aprobado en modo plan (`C:\Users\jorucarbus\.claude\plans\piped-cooking-barto.md`).

### La cola de renderizado no es una optimización: es lo que hace posible la feature

`seleccion.planificarClips()` y `elegirPista()` leen y escriben `historial.json` para rotar clips y
música sin repetir. **Dos renders en paralelo leen el mismo historial antes de que ninguno lo haya
actualizado, y eligen lo mismo** — justo lo contrario de dos videos distintos. `colaRender.js`
(nuevo) serializa: un render a la vez, FIFO.

De paso resuelve dos cosas viejas: el render deja de vivir dentro de un pedido HTTP largo (el
límite de tiempo del gateway de Railway deja de ser un riesgo — `/api/generate-video` encola y
responde al instante, el navegador sondea `/api/render/:id`), y `GET /api/cola` le da el panorama
a TODAS las ventanas abiertas.

Detalles que costaron una vuelta cada uno:
- **Respaldo agrupado a Drive**: `guardar()` corre en cada cambio de estado (encolar, empezar,
  terminar). Medido: 12 subidas a Drive para 3 tareas. Ahora el disco se escribe siempre (local y
  gratis) y el respaldo va coalescido cada 15s.
- **Los `renderId` tienen largo fijo** (`render_<ts13>_<nnn>`). `video.limpiarTemporales(renderId)`
  borra por PREFIJO: si un id pudiera ser prefijo de otro, un render borraría los temporales del
  otro. Prefijo `render_` y no `job_` para no chocar con `/api/exportar`, que sigue usando
  `job_<timestamp>`.
- **Rehidratación al arrancar**: lo que estaba `renderizando` cuando el proceso murió perdió sus
  temporales, así que se marca como **error visible** en vez de desaparecer en silencio; lo que
  estaba `en_cola` vuelve a la fila.
- `limpiarCache()` respeta ahora los archivos de tareas pendientes: con la cola larga, un render
  podía llegar a su turno con el cartel ya barrido por el TTL de 1h.

### Fix real de producción encontrado probando (no leyendo código)

La prueba de punta a punta con dos renders reales dio: **video A bien, video B con "No se encontró
la locución aprobada"**. Causa: al terminar, `renderizarVideo()` hacía `unlinkSync(audioPath)`
SIEMPRE. Con la cola, eso borra el mp3 que otro render ya encolado todavía necesita. Además
contradecía a `limpiarCache()`, que justamente protege los audios de `audiosPendientes`.

**Fix**: `audioSigueEnUso()` — el mp3 se borra solo si no lo referencia ninguna locución aprobada
ni ninguna tarea pendiente (`colaRender.audioTokensPendientes()`). Arregla de paso el **reintento
de un render fallido**, que hasta ahora se quedaba sin audio en el segundo intento.

### Hallazgo contraintuitivo: los dos videos comparten archivos pero NO metraje

Medido con `planificarClips` real sobre cuatro escenarios de inventario:

| Inventario | Archivos fuente compartidos | **Segundos de metraje repetidos** |
|---|---|---|
| 12 clips de 40s | 90% | **0%** |
| 30 clips de 40s | 33% | **0%** |
| 12 clips de 12s | 90% | **0%** |
| 60 clips de 40s | 0% | **0%** |

Con 12 clips por carpeta y ~28 tomas por video, el primer video agota el ciclo y el segundo no
tiene archivos "frescos" — por eso el 90%. **Pero `historial.offsets` guarda dónde quedó cada
video y el segundo render continúa desde ahí**: el A muestra los segundos 1-4 de `a3.mp4` y el B
los 12-15. Ni un segundo repetido.

⚠️ **Esto importa para el futuro**: alguien que mire el plan de clips y vea los mismos `videoId` en
los dos videos va a pensar que hay un bug y va a "arreglarlo". No lo hay — lo que hay que mirar es
el par (videoId, offset), no el videoId solo. El plan original decía "solapamiento bajo o nulo de
videoIds", y eso era **incorrecto**; la garantía real es otra y es más fuerte.

### Gemelos

- `gemini.escribirGuion` + `MOTORES_GUION` — router calcado de `FRAGMENTADORES`. **Es la costura
  por donde va a entrar el motor de guion con graphify** (repo `generador-guion-graphify`), pedido
  explícito del usuario: entra como otra entrada del objeto, sin tocar `server.js`.
- `generarGuion(..., guionEvitar)`: mismos hechos y mismo ángulo, otro arranque, otro orden, otro
  vocabulario, sin reciclar tiras de más de 4 palabras.
- `gemini.variarMetadatos`: título/descripción/hashtags propios del segundo video. Los hashtags de
  NOMBRE PROPIO sí se pueden repetir — sacarlos por no repetir costaría alcance.
- **Reparto de citas**: alternadas por orden de detección (0→A, 1→B, 2→A…); con una sola, la
  comparten. Las fotos y videos de apoyo van a los DOS. Hay un log por variante (`🎞️ Variante A:
  N material(es)…`) porque es lo único que permite confirmar en producción que el reparto anda.
- **Dónde vive cada uno**: el video A se queda en los campos de siempre del job y el B cuelga de
  `job.gemela`. Asimetría a propósito: el historial, "continuar donde quedó" y los jobs viejos no
  se tocan. Mismo criterio en el frontend (`state` y `state.B`).
- `audiosPendientes` de 4 → 8: con 2 locuciones por noticia y varias ventanas, 4 expulsaba
  locuciones YA APROBADAS (el bug de "No se encontró la locución aprobada" que ya estaba anotado).

### UI: pestañas A/B, sin duplicar el DOM

El usuario pidió primero "lado a lado" y después lo corrigió: *"capaz las dos versiones para que no
sean tan amontonado podría funcionar como pestañas"*. Acertado — pero además **no se duplicó nada
del HTML**: los mismos controles se repintan con los datos de la variante activa (`V()`,
`volcarVista()`, `pintarVista()`). Duplicar habría significado dos editores, dos listas, dos
reproductores y dos canvas de cartel: el doble de superficie para desincronizarse, que es
exactamente el bug que costó una semana con la geometría del cartel.

Guarda incorporada: el botón de continuar de cada paso **no avanza hasta que las dos versiones
fueron atendidas**; si falta una, salta a su pestaña. Sin eso es fácil aprobar el Paso 5 sin haber
escuchado el audio B.

**El cartel se rellena ahora con el TÍTULO de la lectura**, no con `nombreCorto` (que es la base
del nombre de archivo, corto y seco). Cada variante con el suyo. Pedido explícito del usuario.

### Verificación

1. **Cola, en node contra el módulo real**: orden A→B→C, **máximo 1 render simultáneo**, un fallo
   no arrastra a los demás, y tras un "reinicio" la rehidratación devuelve lo pendiente y marca lo
   interrumpido como error.
2. **Endpoints por HTTP**: los tres 400 (sin fragments, sin destFolder, front viejo), encolado con
   posición, estado, y 404 de render inexistente.
3. **Guiones contra Gemini real**: arranques distintos, **1 sola tira de 5 palabras compartida** en
   206 vs 209 palabras, 46% de vocabulario común (comparten los hechos, no la redacción). Títulos
   distintos y 3 de 5 hashtags distintos.
4. **Reparto de citas por HTTP** con 3 citas + foto + video: A se llevó las citas 0 y 2, B la 1, y
   la foto y el video fueron a las dos.
5. **Punta a punta REAL** (dos renders con clips de Drive y ffmpeg, sin gastar ElevenLabs — audio
   generado con ffmpeg — y sin escribir en la hoja, con `GOOGLE_SHEET_ID` vacío en esa corrida):
   los dos MP4 salieron; el log confirma `Plan A → Montaje A → Guardado A → Plan B → Montaje B →
   Guardado B` **sin solaparse nunca**; y el job quedó con el A en la raíz y el B en `job.gemela`.
   La carpeta de prueba en Drive se mandó a la papelera al terminar.
6. **Browser real**: pestañas con nombre de canal y punto de estado, el volcado de ediciones al
   cambiar de pestaña (editar B y volver a A no pierde la edición), el autocompletado del canal
   hermano (Chismex Picante → Supe Lupe), la guarda contra aprobar a ciegas, el prefill del cartel
   con el título, el panel de cola en sus tres estados, y **el flujo de generación encolando 2
   tareas con el canal correcto en cada una**.
7. **Regresión con gemelos apagado**: `V()` devuelve `state`, pestañas ocultas, no autocompleta
   nada, encola UNA sola tarea. Encontró y arregló un bug real: `state.B === null` reventaba
   `actualizarTabs()` — por eso `V()` crea la estructura del B al primer uso aunque el modo esté
   apagado.

### Pendiente

- Un video gemelo **completo por la UI, con locución real de ElevenLabs**, no se hizo: gastaría dos
  locuciones del usuario. El pipeline está probado por partes y de punta a punta con audio
  sintético; lo que falta es la corrida real del usuario.
- `/api/exportar` (modo Insumos) sigue sin cola y sin gemelos — no es una regresión, ya era así.


## 2026-08-21 — La cita ahora DESPLAZA la voz en off, no la reemplaza (+ el guion le hace lugar)

Reporte del usuario: *"la cita no está funcionando bien, preferiría que desplace la voz en off
que está en ese lugar en vez de solo silenciarla, porque al continuar la voz en off es como que
vuelve a tener sonido, cuando la idea es que continúe donde se quedó… de hecho creo que sería
bueno que el guion acompañe más a esa cita, le dé espacio"*.

### El problema de diseño (no era un bug, era la semántica)

`tiempos.empalmarCitasReales()` **reemplazaba** el tramo sintético del fragmento con cita por el
audio de la entrevista. Consecuencia: ese pedazo del guion aprobado NUNCA se escuchaba — la voz en
off se cortaba, sonaba la cita, y volvía en el fragmento siguiente, saltándose una idea entera.
Por eso al usuario le sonaba como si el audio "volviera a tener sonido" en vez de continuar.

### Rediseño: insertar en vez de sustituir

Ahora la narración del fragmento se escucha **completa**, y la cita entra **después** de ella:

```
… voz en off (fragmento i, completo) → [CITA con audio original, sin voz en off] → voz en off (fragmento i+1) …
```

Costo real del cambio: la línea de tiempo gana un hueco que no pertenece a ningún fragmento del
guion. Como `seleccion.js` y `subtitulos.js` reconstruyen el tiempo **sumando duraciones en
orden**, la solución es que ese hueco SEA un fragmento: `empalmarCitasReales` devuelve ahora
`duraciones`/`palabras` **más largos** que los de entrada, más `inserciones:
[{indice, parrafoOrigen, duracion, empalme}]`, y `server.js` mete el pseudo-fragmento equivalente
(`{texto: '', famoso: <el del fragmento origen>, esCita: true, noFusionar: true}`) en una copia
local de `fragments` — el guion aprobado y la UI no se tocan.

Que el pseudo-fragmento vaya **sin texto** resuelve gratis el subtítulo: `subtitulos.generarASS`
ya salta los fragmentos sin texto (`if (!ventana || !f.texto) return`), así que durante la cita no
aparece ni una palabra en pantalla — que es justo lo correcto, ahí no habla la voz en off.

Y los timestamps de palabra de **su propio** fragmento ya no se mueven (su narración suena antes
de la cita); solo se corre lo que viene después. Con el diseño viejo ese fragmento perdía su
detalle por palabra entero (`palabras[idx] = null`).

Piezas de apoyo del cambio:
- `seleccion.agruparParaClips`: respeta `noFusionar`. Sin esto, una cita corta pegada a un
  fragmento del mismo famoso se fusionaba con el vecino y perdía su `parrafoIdx` propio — que es
  justamente la llave con la que `insertarMaterialesEnPlan` sabe qué clips reemplazar por el video
  de la entrevista. El material habría terminado pintado también sobre la narración de al lado.
- `server.js`: los materiales se **reindexan** al espacio de índices nuevo después del empalme
  (`+ inserciones con parrafoOrigen < idxViejo`), y el video de la entrevista recién ahí se cuelga
  de SU pseudo-fragmento (antes se colgaba del fragmento que la presenta, o sea encima de la
  narración). El `citasConVideo` intermedio existe por eso.
- Red de seguridad nueva: si `duraciones.length !== fragments.length` al llegar al plan, se
  ignoran los tiempos reales y se cae al reparto por caracteres. Renderizar con una línea de
  tiempo corrida es exactamente como salen los subtítulos "descuadrados" que el usuario ya
  reportó; mejor tiempos aproximados que corridos.
- El pseudo-fragmento lleva `caracteres` equivalentes a su duración, para que hasta ese fallback
  por caracteres le reserve su tiempo en vez de darle 0s.

### El guion ahora le hace lugar a la cita

Segundo pedido del usuario. Las citas se detectan al subir la entrevista (Paso 1), o sea **antes**
de escribir el guion — pero el guionista no se enteraba de que existían.

- `gemini.generarGuion(cronica, angle, angleContent, citas)`: cuarto parámetro nuevo. Con citas
  presentes, el user message suma un bloque con las frases textuales y reglas obligatorias: no
  escribir la cita en el guion (se oiría dos veces), una frase de **entrada** que se la entregue
  ("y ella misma lo dijo sin filtro"), una de **retoma** justo después ("ahí se le cayó todo"), y
  respetar el orden de las citas.
- `server.js /api/generate-script` junta las citas del job y se las pasa. Solo texto: no toca el
  archivo, no cuesta nada.
- `gemini.asignarMateriales`: regla nueva #2 — para una cita hay que elegir el fragmento que la
  **presenta**, no el que ya la comenta, porque ahora la cita suena DESPUÉS de ese fragmento.

### Verificación (offline, sin gastar API ni Drive)

1. **Empalme real con ffmpeg**: locución de 30s (6 fragmentos de 5s) + entrevista de 20s, dos
   citas (4s y 3.5s). Esperado 37.541s, real **37.538s** (3ms de redondeo de frame mp3).
   `duraciones` pasó de 6 a 8 entradas, inserciones en los índices 2 y 6, y **todas** las palabras
   quedaron dentro de la ventana de su fragmento en la línea de tiempo nueva.
2. **Pipeline** (plan de clips + subtítulos, inventario falso): el pseudo-fragmento se llevó
   exactamente sus 4s, partidos en 2 clips de 2s del material con offsets continuos (12 → 14),
   ningún otro clip tocó el material, y **0 eventos de subtítulo** dentro de la ventana de la cita.
   Último subtítulo termina en 24.00s con audio de 24.00s: sin corrimiento.

### Pendiente conocido

`/api/exportar` (el ZIP de insumos) sigue armando su plan sin materiales adicionales — ya era así
antes de este cambio, no es una regresión.


## 2026-08-20 (madrugada, autónomo) — Material adicional: durabilidad + espejo + verificación real completa

Sesión nocturna autónoma, sin supervisión (el usuario pidió dejarlo trabajando y contarle por
bitácora). Punto de partida: tras el fix de la cita (commit `7799694`, sección de arriba), el
usuario reportó que en la práctica **el video de la cita nunca se mostraba** — solo el audio
llegó a sonar una vez, y hasta ahí. Pidió además reforzar el concepto de las 3 variantes y avisó
"mucho cuidado con los subtítulos, los videos salen descuadrados".

### 1) Bug real encontrado: el archivo de material se perdía entre subir y renderizar

Root-caused con los logs reales de Railway (`railway logs`, job `670777a5`): el log decía
literal `Material adicional del fragmento X ya no existe en disco, se ignora`. Causa: el archivo
subido vive SOLO en `temp-videos/materiales/<jobId>/`, disco efímero de Railway — cada redeploy
lo borra, y esa noche hubo 2 redeploys míos entre que el usuario subió la entrevista y generó el
video. `historial.json`/`jobs.json` sobreviven un redeploy (Bloque D, `driveCache.js`); el
archivo de material no tenía ese respaldo.

**Fix**: mismo patrón que `jobs.json`/`historial.json`. `driveCache.respaldar()` ahora acepta
`mimeType` (antes fijo a `application/json`); `driveCache.borrar()` nuevo. Al subir un material
(3 endpoints en `server.js`) se respalda fire-and-forget a la carpeta `cache-estado` de Drive con
nombre `material_<jobId>_<archivo>`; al renderizar, si el archivo ya no está en disco, se
intenta restaurar desde ese respaldo ANTES de rendirse (`materiales.nombreDriveMaterial()` arma
el mismo nombre en los dos lados). Al borrar un material a mano, se borra también su respaldo.
Verificado con round-trip real: subir, borrar el archivo local (simula el redeploy), restaurar,
bytes idénticos al original.

### 2) Fix: espejo NUNCA en una foto de apoyo

Encontrado revisando el pedido del usuario (punto 3 de su mensaje: "aquí no se puede hacer
efecto espejo porque la imagen puede ser una captura de texto"). El código aplicaba espejo a
CUALQUIER clip por igual, incluida una foto. Fix de una línea en `video.js`:
`if (!clip.esImagen && decidirEfecto(...))`.

### 3) Investigación de "los subtítulos salen descuadrados" — pista falsa descartada con evidencia

Antes de tocar nada de subtítulos, auditoría matemática pura de
`tiempos.empalmarCitasReales()` (sin ffmpeg): array de palabras con timestamps conocidos, cita
insertada en el medio, verificado a mano que los timestamps de las palabras POSTERIORES a la
cita quedan desplazados EXACTAMENTE por el delta de duración, y que ese desplazamiento coincide
con dónde esas palabras realmente caen en el audio compuesto nuevo. Matemática correcta,
confirmado antes de sospechar de esa función.

Durante la verificación en vivo (ver sección 4) apareció un `⚠️ Tiempos reales: "pÃ¡nico" no
calza con el audio, cae a % de caracteres` que parecía un bug real de codificación de texto.
**Investigado a fondo y descartado**: el archivo `frag_result.json` guardado directo de la
respuesta HTTP (sin tocar) tenía los bytes UTF-8 correctos (`0xc3 0xb3` = "ó", verificado en
hexadecimal). La corrupción aparecía recién en MIS PROPIOS scripts de prueba de esta sesión:
`json.load(open(archivo))` sin `encoding='utf-8'` explícito usa en este Windows el codepage por
defecto en vez de UTF-8, y al re-guardar con `json.dump(..., ensure_ascii=True)` (default de
Python) esos caracteres ya mal leídos quedaban escapados como `Ã³` — JSON válido, pero
representando el carácter equivocado. Repetí el mismo render con los scripts corregidos
(`encoding='utf-8'` explícito en cada `open()`) y el subtítulo salió perfecto ("JURÓ", tilde
correcta) y la alineación real de ElevenLabs funcionó sin caer al estimado. **Conclusión: no hay
bug de codificación en la app** — el navegador real (`fetch`+`JSON.stringify`) nunca pasa por
`open()` de Python, así que este modo de falla no puede ocurrir en uso real. Ninguna causa
propia de la app quedó identificada para "subtítulos descuadrados" — el precedente del
2026-08-18 (Gemini saturado, ver sección de arriba) sigue siendo la explicación más creíble para
lo que el usuario venía viendo, no algo introducido esta noche.

### 4) Verificación real completa contra staging (no solo local, no solo lectura de código)

Con las 2 fixes desplegadas (`1dbd7d1`), armé un pipeline de punta a punta contra
`adventurous-reflection` real: fuente de texto → guion → fragmentación → asignación automática de
material → audio real (ElevenLabs) → render real (ffmpeg) → descarga del MP4 de Drive →
extracción de frames → inspección visual.

- **Entrevista de prueba con voz real**: sin `ELEVENLABS_API_KEY` local, usé el TTS de Windows
  (`System.Speech`, sin costo ni API key) para grabar una frase real en inglés, la mezclé con
  video de fondo por ffmpeg. Subida a staging: `gemini.detectarCitas()` la transcribió y sacó una
  cita real de 2.4s. `gemini.asignarMateriales()` la asignó sola al fragmento correcto del guion
  ("Aunque ella juró...").
- **Cita — confirmado con evidencia visual, no solo logs**: descargué el MP4 real de Drive,
  extraje 1 frame/segundo, y por tamaño de archivo (una imagen plana comprime mucho más chico)
  ubiqué el frame exacto de la cita — el fondo gris de mi "entrevista" de prueba, con el
  subtítulo "JURÓ" bien tildado quemado encima. El frame siguiente ya muestra al famoso real de
  vuelta, con el subtítulo "FUE" continuando en sincronía. Audio real: el log confirmó
  `⏱️ Usando tiempos reales de la locución` (alineación exacta, no el estimado) y
  `1 cita(s) con audio real empalmada(s)`.
- **Foto de apoyo — asignación automática confirmada**: subí una foto con una descripción
  temáticamente relacionada al guion, `asignarMateriales` la asignó sola al fragmento correcto
  (antes, con una descripción genérica sin relación, correctamente NO la asignó a nada — la
  selectividad funciona en los dos sentidos).
- **Espejo en foto — confirmado que NO se aplica**: imagen de prueba asimétrica (banda roja a la
  IZQUIERDA + texto "IZQUIERDA"), forzando `efectos.espejo:'todos'` en el render. El frame 0 del
  video real salió con la banda roja y el texto en el lugar correcto — sin espejar.
- **Video de apoyo**: no se hizo un render dedicado aparte (mismo costo que el de cita) — usa
  exactamente la misma rama de código que ya se probó con la cita cuando `tieneVideo=true`
  (`clip.esImagen=false`, mismo `-ss/-i` en `video.js`), así que queda cubierto por la misma
  evidencia.

**Limpieza**: los 3 videos de prueba (`TEST-cita-verificacion-nocturna.mp4`,
`TEST-cita-limpio.mp4`, `TEST-espejo-foto.mp4`) quedaron en la carpeta de Drive "Embajadores del
Chisme" — mi Service Account local no tuvo permiso para mandarlos a la papelera desde acá
(`insufficient permissions`, distinto del OAuth que usa el server). **Pendiente**: borrarlos a
mano desde Drive (y sus 3 filas correspondientes en Sheets) si molestan — no son contenido real.
Los materiales de prueba (fotos/entrevista subidas) sí se limpiaron solos vía
`DELETE /api/materiales/...` (borra local + respaldo de Drive).

**Estado final**: las 3 variantes (cita, foto de apoyo, video de apoyo) funcionan de punta a
punta en `test-persistencia`, con la durabilidad resuelta. Commits de la noche: `d4ad694` (feature
original), `7799694` (fix del bug de los 25s), `574a005`+`e3eecde` (bitácora), `1dbd7d1`
(durabilidad + espejo). Todo pusheado y verificado (SHA local = remoto en cada push).

## 2026-08-19 (Windows) — Material adicional por fragmento: cita con audio real / foto / video de apoyo

Feature nueva pedida por el usuario, implementada en `test-persistencia` (plan completo en
`C:\Users\jorucarbus\.claude\plans\piped-cooking-barto.md`, aprobado en plan mode). Permite
adjuntar al inicio del flujo (Paso 1), de forma opcional e independiente entre sí:

1. **Entrevista → cita con audio real**: sube audio/video, Gemini detecta 1-4 citas textuales
   con inicio/fin aproximados; en el fragmento donde corresponde, se reemplaza la voz sintética
   de ElevenLabs por el audio ORIGINAL de la persona (con su propio video si lo trae).
2. **Foto de apoyo** / 3. **Video de apoyo**: se insertan en el fragmento que corresponde
   temáticamente, mismo tratamiento de `CLIP_MAX`/zoom/espejo que cualquier clip.

La ubicación (a qué fragmento va cada material) la sugiere Gemini automáticamente
(`gemini.asignarMateriales`, mismo patrón que `fragmentarPorGuion`) y es editable a mano en el
Paso 4 — mismo lugar donde ya se corrige "famoso" por fragmento.

**Archivos**: `materiales.js` (nuevo — 3 uploaders `multer`, primer uso real de esa dependencia,
estaba en `package.json` desde el commit inicial sin conectar); `gemini.js` (`parteMultimodal`
separado de `armarUserParts`, `sourceType:'imagen'`, `detectarCitas`, `aplanarMateriales`,
`asignarMateriales`); `tiempos.js` (`empalmarCitasReales` — la pieza más invasiva: empalma en
SERIE el audio real dentro del sintético con un solo `ffmpeg -filter_complex concat`, y propaga
el delta de duración a los timestamps de palabra de los fragmentos posteriores); `seleccion.js`
(`insertarMaterialesEnPlan`, corre DESPUÉS de `planificarClips` para que cada fragmento con
material ya tenga un clip de famoso de fallback); `video.js` (`clip.esImagen` en
`montarVideoPlan` → `-loop 1` en vez de `-ss offset`); `server.js` (endpoints
`/api/materiales/*`, wiring en `/api/fragment` y `/api/generate-video`, fix de paso: `limpiarCache()`
no limpiaba `materiales/<jobId>/` porque `fs.unlinkSync` sobre una carpeta tira `EISDIR`
silencioso — ahora usa `fs.rmSync` recursivo con TTL de 6h); `public/index.html`/`app.js`/`style.css`
(Paso 1: 3 botones + inputs file + cola de subida antes de tener `jobId`; Paso 4: select de
material + inputs de inicio/fin editables por fragmento, con un bug real encontrado y corregido
en la verificación: al elegir una cita por primera vez los segundos quedaban en 0/0 en vez de
prellenar con lo que Gemini detectó).

**Regla de robustez aplicada en cada capa nueva** (ninguna aborta el render): upload rechazado →
400 claro; `detectarCitas`/`asignarMateriales` fallan → sin sugerencias, asignación manual;
archivo del material ya no existe al renderizar (ej. redeploy entre upload y render) → se ignora
ese fragmento; empalme de audio individual no calza (clamp <0.3s) → se descarta ESE, los demás
siguen; `empalmarCitasReales` falla completo → voz 100% sintética, el material de video de la
cita se saca también del plan (acoplamiento audio↔video: nunca queda el video de la entrevista en
pantalla con la voz sintética sonando encima).

**Verificado esta sesión** (sin Gemini real disponible localmente — ver nota abajo):
- Upload/listado/borrado de materiales por HTTP real contra el server local (`curl` multipart,
  archivo movido a `materiales/<jobId>/`, job actualizado, borrado limpia archivo+registro).
- `gemini.asignarMateriales`/`detectarCitas` degradan a `[]` limpiamente cuando Gemini falla —
  confirmado que es un problema de ENTORNO local (la key da "API key not valid" en TODA la
  cadena de modelos, incluso en una llamada preexistente sin tocar como `generarNombreArchivo`),
  no una regresión de este cambio.
- `video.montarVideoPlan` con un plan sintético mezclando un clip de video normal y un
  `clip.esImagen` (imagen loopeada con `-loop 1`) — render ffmpeg REAL, sin Gemini/Drive/
  ElevenLabs de por medio: salida 1080x1920, 2 clips, duración 3s exacta (1.5+1.5), confirmado
  con `ffprobe` y extracción de frame del tramo de imagen.
- UI en browser real (Chrome vía preview): cola de materiales antes de `jobId`, subida real al
  crear el job (flush), listado con botón "quitar", Paso 4 con select de material + inputs de
  cita que se prellenan con lo que Gemini detectó al elegir por primera vez (bug encontrado y
  corregido en el momento).

**Actualización 2026-08-20 — el usuario lo probó real y encontró un bug real, ya arreglado**:
usuario reportó "no funcionó lo de la cita" tras probar en staging. Confirmado con el job real
(`670777a5-2c0a-49ac-8c51-f2234883eda6`): el log mostraba "2 cita(s) empalmada(s)" pero la
duración caía de 74.5s a 49.8s — 25s de contenido desaparecidos. Reproducido local (sin
Gemini, solo ffmpeg con assets sintéticos) y encontrada la causa: `empalmarCitasReales()` es el
PRIMER lugar del repo con varios `-i` en un solo comando ffmpeg, y `-ss`/`-t` iban DESPUÉS de
cada `-i` en vez de antes — son opciones de INPUT, tienen que precederlo. Con un solo `-i` (como
hace el resto del proyecto, un `-i` por llamada) nunca importó el orden; con varios, ffmpeg
tomaba el `-t` repetido como opción de OUTPUT y ganaba el último, truncando todo a la duración
del último tramo. Fix de una línea (mover `-ss`/`-t` antes del `-i`), verificado con el mismo
repro (duración esperada = duración real del archivo, con 1 y con 2 citas no adyacentes).
Commit `7799694`, pusheado. **Confirmado por el usuario el mismo día**: reintentó y "salió el
video con cita" — la feature funciona de punta a punta en staging.

**Sin verificar — pendiente para cuando el usuario retome esto**: el camino feliz COMPLETO de
punta a punta (`/api/generate-video` real con una cita de verdad empalmada — `tiempos.
empalmarCitasReales` nunca corrió contra un archivo de entrevista real, solo se revisó el código
y se probó el resto del pipeline por partes) — no se pudo porque el `GEMINI_API_KEY` local está
saturado/rechazado ahora mismo (mismo síntoma que la entrada de ayer, "Gemini saturado, no es
código"). Antes de dar esto por terminado: subir una entrevista corta real, confirmar que
`detectarCitas` sugiere algo razonable, generar un video real con al menos 1 cita + 1 foto + 1
video de apoyo juntos (el caso explícito que pidió el usuario), y confirmar a oído/vista que la
voz cambia en el fragmento correcto y que los subtítulos posteriores siguen sincronizados (eso
confirma que el shift de `palabras[]` en `empalmarCitasReales` funciona con datos reales, no solo
en la lectura del código).


## ⚠️ Protocolo de sincronización entre máquinas (leer ANTES de tocar código)

Este proyecto se trabaja desde 2 máquinas (PC Windows del usuario + Mac de trabajo), cada una
con su propia sesión de Claude Code que **NO comparte memoria ni contexto con la otra** — el
único canal real de comunicación entre sesiones es este repo de git (commits + este archivo).

**Ya pasó una vez (2026-07-19)**: la Mac hizo 5 commits (iconos Phosphor, tipografía, rediseño
de historial/header) mientras en paralelo, sin saberlo, se rehacía UI similar en Windows sobre
código desactualizado — hasta que el usuario preguntó por algo que ninguna sesión recordaba
haber hecho. Se reconciliaron sin perder nada, pero pudo evitarse.

**Al EMPEZAR a trabajar en este repo (o en `farandula-insumos`, mismo protocolo), SIEMPRE:**
1. `git fetch origin --prune`
2. `git log --oneline <rama-actual>..origin/<rama-actual>` — si aparece algo ahí, la OTRA
   máquina avanzó desde la última vez. Leerlo (`git show --stat <sha>`) antes de tocar los
   mismos archivos.
3. Si hay commits remotos nuevos: `git pull` **antes** de empezar a editar. Si ya hay cambios
   locales sin commitear que pisan lo mismo, parar y preguntarle al usuario cómo reconciliar
   (nunca descartar nada sin confirmar explícitamente — ver Git Safety Protocol).
4. Leer "Sesiones recientes" (abajo) para saber qué se tocó y por qué — evita redescubrir o
   reimplementar algo dos veces (pasó con la verificación de Bloque D: se hizo por separado en
   ambas máquinas el mismo día sin saberlo).

**Al TERMINAR una sesión (o antes de una pausa larga), SIEMPRE:**
1. Commit + push de TODO lo terminado — nunca dejar cambios importantes solo locales; la otra
   máquina no los puede ver hasta que están en el remoto.
2. Verificar el push: `git rev-parse HEAD` debe coincidir con `git ls-remote origin <rama> | cut -f1`
   (memoria: se perdieron 5 horas de trabajo por un push que pareció exitoso pero no llegó).
3. Agregar una entrada en "Sesiones recientes" con: fecha, qué se hizo, qué archivos, qué quedó
   pendiente o sin verificar. Esto reemplaza la comunicación directa entre máquinas.

## 📍 Dónde va el trabajo AHORA

**[estado-vivo.md](estado-vivo.md)** — qué está hecho, qué falta y qué quedó a medio hacer.
Leerlo primero: es la única fuente que una sesión sin memoria (otra máquina, o Codex cuando se
agota la cuota) puede consultar. Ahí está también el **protocolo de traspaso a Codex**.

## ⏭️ Trabajo aprobado y sin empezar

- **[plan-maestro-automatizacion.md](plan-maestro-automatizacion.md)** — **el único plan vigente**
  (2026-08-08). Absorbe y reemplaza a `plan-multifuente-reskin.md` y
  `borrador-automatizacion-video.md`, que se borraron para no tener tres documentos solapados
  (siguen en el historial de git si hace falta).

  Son **11 fases ordenadas para no repetir trabajo**: el orden es el aporte principal del
  documento, no un detalle. Todas las decisiones de diseño ya están consultadas con el usuario —
  leerlo antes de empezar y **no re-preguntar** lo que ya está resuelto ahí.

  Lo que conviene saber sin abrirlo:
  - **Dos invariantes** que arruinan el video en silencio si se rompen: la duración del video
    debe seguir igualando la del audio, y **ningún clip puede pasar de 3 segundos** (uso
    legítimo; `CLIP_MAX` ya lo cumple, el riesgo es que las capas nuevas lo rompan).
  - **El ahorro grande no está en cambiar de modelo**, está en dejar de mandar video a Gemini
    (~263 tokens/s contra ~32 del audio). El cambio de tier es secundario.
  - ffmpeg 6.1.1 ya trae todo lo necesario (`xfade` con 58 transiciones, `ass`,
    `sidechaincompress`, `perspective`, `setpts`): **sin dependencias nuevas**.
  - **Cuatro puertas abiertas** que se dejan preparadas sin construir: fuente de tiempos
    (RunPod), fragmentación por ritmo de música, guion desde el grafo, y director de edición.

## Limpieza de código muerto (2026-08-05)

Se borraron ~540 líneas que no ejecutaba nadie, en **ambos** repos. El render activo es
`montarVideoPlan` (cortes limpios de ffmpeg + zoom/espejo opcionales); todo lo demás eran
capas viejas que quedaron colgadas.

**Borrado**: `subtitulos.js` entero (su `require` en `server.js` era la única referencia);
en `video.js` → `montarVideoHyper` (hyperframes, ya marcado como retirado en un comentario de
`server.js`), `montarVideo` (v1), `asignarVideos` (lo reemplazó `seleccion.planificarClips`) y
sus auxiliares privadas `elegirSfx`/`rutaFiltro`/`cargarUso`/`guardarUso`/`duracionFragmento`,
más las constantes que solo ellas usaban y el `usage.json` que dejaban en disco; en `gemini.js`
→ `fragmentarGuion` (v1) y `generarGuionTecnico`, con `PROMPTS.fragmentacion`.
En `farandula-video-family`, además, `agregarMarcas` y `PROMPTS.marcas` (prosodia de
ElevenLabs, que esa versión no usa).

**Se conservó a propósito** — no volver a "limpiarlo":
- `decidirEfecto` / `filtroZoom` — zoom y espejo **siguen activos**, decisión explícita del
  usuario. Si los presets están en "ninguno" el resultado son cortes limpios, pero el código
  corre.
- `fuentes.descargarAudio()` — hoy sin llamadas, pero es el camino principal del plan de
  multifuente. Borrarla es tirar trabajo que hay que rehacer.
- `fuentes.descargarVideo()` — fallback de YouTube.

**Método, por si se repite**: contar llamadas reales con grep antes de borrar, y revisar qué
auxiliares privadas quedan huérfanas al sacar una función grande (fue el caso de las cinco de
`video.js`). Verificar después que los módulos carguen, que el server arranque y con un **render
real** — un chequeo de sintaxis no prueba que el pipeline siga entero.

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

## Bloque D completo y verificado (2026-07-17)

Objetivo: `historial.json` (rotación de clips) y `data/jobs.json` (jobs Bloque A) viven solo en el
disco efímero de Railway — un redeploy los borra. Se agregó respaldo/restauración en Drive:

- `driveCache.js` (nuevo) — `respaldar(localPath, nombreDrive)` sube/actualiza el archivo en la
  carpeta caché de Drive; `restaurar(localPath, nombreDrive)` lo trae de vuelta SOLO si el archivo
  local no existe o está vacío (nunca pisa progreso reciente). Preferencia OAuth (misma cuenta que
  sube renders), con fallback al Service Account si no hay OAuth configurado en el `.env` local.
- `drive.js` — export agregado de `getDrive`/`getDriveOAuth` (antes privados) para que `driveCache.js`
  los reuse.
- `seleccion.js` — `guardarHistorial()` ahora llama `driveCache.respaldar()` fire-and-forget.
- `jobStore.js` — `guardar()` (usado por `crearJob`/`actualizarJob`) ídem con `jobs.json`.
- `server.js` — al arrancar, `driveCache.restaurar()` para ambos archivos antes de `app.listen`.

**⚠️ OJO carpeta**: el ID `1irTudEARQWOrJr3y911Hwl_1VbvQqNP5` que se pensó usar es `Redes_Canales`
MISMO (la raíz que ya comparte renders/audios/recursos), NO una subcarpeta — confirmado con
`files.get`. Se creó una subcarpeta dedicada **`cache-estado`** dentro de Redes_Canales
(id `1s0OXuermFR4_DbNZP3gWFYDAV1xvf5ct`) y `driveCache.js` usa ESE id como default
(`GOOGLE_DRIVE_CACHE_FOLDER_ID` la puede sobreescribir).

**⚠️ REQUISITO DE PERMISO (hallado y resuelto 2026-07-17)**: si una máquina no tiene las variables
`GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN` en su `.env` local (p.ej. esta Mac no las tenía),
`driveCache` cae al Service Account — y el Service Account NO tenía acceso a `cache-estado` (a
diferencia de `renders`/`recursos`/`famosos`, que sí están compartidas explícitamente). Daba
`File not found` sin loguear nada (bug de silencio ya corregido: `restaurar()` ahora loguea
`ℹ️ ... no existe todavía en la carpeta caché` cuando el archivo no aparece). **Fix aplicado**:
se compartió `cache-estado` como Editor con `farandula-generator@n8n-automatizacion-chismex.iam.gserviceaccount.com`
desde Drive UI. Si se despliega a Railway sin las variables OAuth configuradas ahí, este mismo
permiso sobre `cache-estado` es lo que hace que el fallback a Service Account funcione igual.

**Verificado end-to-end (2026-07-17, en la Mac)**:
1. `respaldar()` — confirmado antes (Windows): sube/actualiza `jobs.json` en `cache-estado`.
2. `restaurar()` — borré `data/jobs.json` local, reinicié `node server.js`, el arranque lo trajo
   solo de Drive antes de que la app lo necesitara (log `♻️ Restaurado desde Drive: jobs.json`),
   con el contenido más reciente subido desde la sesión de Windows. Ciclo completo funciona.

Los 4 bloques (A/B/C/D) están completos en `test-persistencia`. Pendiente: decidir cuándo mergear
a `main` (regla: solo cuando el usuario confirme que todo funciona óptimo, ver memoria
`farandula_test_version_rule`).

## Despliegues en Railway (2 proyectos distintos, variables independientes)

- **`farandula-insumos`** (producción, repo `farandula-insumos` rama `main`) —
  `https://farandula-insumos-production.up.railway.app`
- **`generous-empathy`** (staging, entorno `test-persistencia`) — 3 servicios, redeploy
  automático en cada push a `test-persistencia` de cada repo:
  - **`adventurous-reflection`** = este repo (`farandula-video-generator`), rama
    `test-persistencia` — `https://adventurous-reflection-test-persistencia.up.railway.app`
    (nombre auto-generado por Railway, no se renombró)
  - `farandula-insumos` (Sleeping) y `farandula-video-genera...` (Sleeping) — servicios
    duplicados/sin uso dentro del mismo proyecto, no confundir con `adventurous-reflection`
    que es el que SÍ está activo

⚠️ Las variables de entorno (API keys, `GOOGLE_OAUTH_REFRESH_TOKEN`, etc.) son independientes
por servicio — actualizar una NO propaga a las demás. Si se regenera el refresh token OAuth
(pasa cuando da `invalid_grant` — expiró o fue revocado), actualizar en las 4 ubicaciones:
`.env` local de ambos repos + `farandula-insumos` (Railway) + `adventurous-reflection` (Railway).

## Pendiente Verificar (Railway Live — main, sin tocar por ahora)

- [ ] Redeploy de Railway → youtube-dl-exec postinstall descarga binario linux yt-dlp
- [ ] Test video real TikTok/IG (Instagram a veces pide cookies)

## Sesiones recientes

### 2026-08-08 (Windows, noche) — Fase 7, iteración de subtítulos, multifuente UX, fix real de producción

Estado detallado en **[estado-vivo.md](estado-vivo.md)**, sección "continuación — noche".
`test-persistencia` en `2cc1db0`. Resumen:

- **Fase 7 completa parcial** (`6682624`): transiciones `xfade` (16 tipos + aleatorio) con
  corrección de solapamiento y ajuste de `CLIP_MAX`, ease-out cúbico en el zoom. Bug real
  encontrado probando "alternado" (NVENC deja timebases que `concat` no reconcilia antes del
  siguiente `xfade`) — arreglado re-normalizando `fps=30` en cada etapa. Faltó `setpts`
  (rampas de velocidad) y transiciones deformadas — fuera de alcance, fase ya grande.
- **Subtítulos, varias vueltas sobre resultado real** (`8729022`→`8b52364`): terminó en UNA
  palabra a la vez, catálogo de 9 tipografías (Anton por defecto), mayúsculas, 264pt, más
  abajo en pantalla, preview arrastrable en el Paso 6 (mockup a escala, tipografía real vía
  Google Fonts solo para esa vista previa), y la puntuación convertida en PAUSA silenciosa en
  vez de mostrarse (idea del usuario).
- **Multifuente** (`c29c88c`): botón partido en "Agregar fuente" / "Ya, procesar fuentes"
  (antes uno solo hacía las dos cosas), límite 3→6.
- **Fix real de producción** (`2cc1db0`, encontrado por el usuario con un screenshot):
  `llamarJSON()` reintentaba con el MISMO modelo que acababa de fallar en vez de escalar de
  verdad — rompía la lectura de fuentes con "JSON inválido tras 2 intentos". `callGemini()`
  ahora devuelve `{texto, modelo}` para que el reintento sepa REALMENTE qué modelo probar
  después. **Pendiente portar a `farandula-video-family`** (mismo `gemini.js`).

### 2026-08-08 (Windows) — Fases 1, 2, 3 y 4 del plan maestro + protocolo de traspaso a Codex

Estado detallado en **[estado-vivo.md](estado-vivo.md)** (archivo nuevo). Resumen:

**Fase 1 — reskin neutro** (`55ae1bc`). Se fue el neobrutalism. Sistema claro con variables CSS
y `prefers-color-scheme`, un solo acento, superficie oscura fija (`#121212`) solo para los
reproductores. El fundamento no es de gusto: las guías de UI oscura la desaconsejan
explícitamente para apps con mucho texto y formularios, y esto es un flujo de texto que produce
video, no un editor de video. Los 18 estilos inline pasaron a clases utilitarias.
**Sin verificación visual** — el panel de preview no estaba desplegado, así que no hubo
compositing para screenshot. Trampa del entorno que conviene conocer: con el panel oculto,
`getComputedStyle` no refleja mutaciones de clase hechas por JS después del pintado, y eso
simula "bugs" que no existen. Se descartó con un elemento de control creado al vuelo.

**Fase 2 — fragmentación por cambio de sujeto** (`e995e37`, portada a family en `8dd764b`).
El diagnóstico del 2026-08-05 era correcto: **el prompt ordenaba el bug**. Reglas 2 y 6
reescritas, más tres cosas que no existían:
- `verificarReconstruccion()` — los fragmentos deben reconstruir el guion palabra por palabra.
  Nadie lo comprobaba y es la falla más silenciosa del pipeline: el tiempo de cada clip sale de
  su proporción de caracteres, así que si Gemini recorta una palabra **todos** los clips se
  corren respecto de la locución sin que falle nada visible. Ahora avisa en el Paso 4.
- `CLIP_MIN = 0.7` + `agruparParaClips()` — al partir más aparecen clips de ~0.3s (parpadeo).
  Se fusionan **solo con vecinos del mismo famoso**: un clip corto del famoso correcto es mejor
  que uno largo del equivocado, que es justo el bug que se estaba arreglando.
- Interfaz `FRAGMENTADORES` — puerta abierta para `ritmo` (cortes en el pulso de la música).

Verificado contra Gemini real con el truco de llamar `fragmentarGuionParrafos()` directo (~30s
por corrida): el caso del diagnóstico (83 chars, dos sujetos) ahora sí se parte, y un guion de
193 palabras da 19 fragmentos → 31 clips, media 2.10s, 0 parpadeos, ambas invariantes OK.
**No sobre-fragmenta**, que era el riesgo real.

**Fase 3 — router de modelos** (`042db6d`, portada a family en `cd25a48`). Dos cadenas en vez de
una: `creativo` arranca en el tier alto (guion, lectura), `mecanico` arranca en lite y **escala**
al tier alto si lite falla (fragmentar, marcas, nombre de archivo). La robustez es la misma: las
dos cadenas llevan los 4 modelos. `callGemini` ahora loguea `🤖 tarea → modelo`, que es lo único
que permite saber en producción si el router funciona o si todo se resuelve por fallback caro.
Mejora de paso: `llamarJSON` ya no reintenta con el MISMO modelo cuando el JSON viene
irreparable — sube un escalón, que es lo que de verdad arregla un problema de formato.

Lo que la comparación cabeza a cabeza mostró (vale la pena saberlo antes de tocar esto): con el
mismo guion, lite hace **3 cortes menos** que el tier alto. Dos son cortes que el tier alto hace
**de más** (la misma persona en las dos mitades). El tercero es *"Piqué … publicaba una historia
con Clara Chía"*: el alto lo parte y le da la mitad a Clara, lite lo deja entero como Piqué.
**Según la regla 6 del propio prompt, lite tiene razón** (Clara es complemento, no sujeto). Lite
además fue idéntico 3/3 corridas. Si algún día se prefiere el criterio del tier alto, el cambio
es mover `fragmentacion` a `CADENAS.creativo` — una línea.

⚠️ **Trampa al portar código entre repos**: copiar un bloque por rango de texto arrastró de
vuelta `agregarMarcas` a family, que estaba borrada a propósito (esa versión no usa ElevenLabs).
Quedó rota (`PROMPTS.marcas` no existe ahí) y nadie la llamaba, así que no falló nada visible.
Al portar, revisar **qué más quedó dentro del rango**, no solo que compile.

**Observación anotada sin arreglar**: si una oración no nombra a nadie, Gemini le arrastra el
famoso del fragmento anterior. No es el bug que se arregló, la alternativa no tiene respuesta
obvia, y el usuario lo corrige en el Paso 4.

**Fase 4 — multifuente + solo audio** (`8a4bc19`, portada a family en `fce9aa1`).

⚠️ **Bug preexistente encontrado y arreglado, importante para cualquiera que trabaje local en
Windows**: `youtube-dl-exec` activa `shell:true` cuando la ruta del binario tiene un espacio
(pasa en esta máquina: `D:\claude pro apps\...`). En ese modo Node NO escapa los demás
argumentos — cualquier flag con espacios (como `--output` apuntando a esta misma carpeta) se
corta en el primer espacio. `descargarAudio()`/`descargarVideo()` fallaban SIEMPRE en esta
máquina, en silencio, desde que existen — nunca se notó porque Railway no tiene espacios en su
path. Arreglado en `fuentes.js`: yt-dlp se invoca ahora con `execFile` directo (sin shell).

La fase en sí: `extraerActa()` saca hechos neutrales de UNA fuente (sesgo-independiente —
"solo lo que se dice, nunca gestos ni imagen", pedido explícito del usuario);
`sintetizarCronica()` combina 1-3 actas en una crónica. `/api/read` acumula fuentes por
`jobId` (máximo 3, rechaza la 4ta); `/api/resintetizar` cambia de sesgo sin re-descargar nada
(reemplaza lo que hacía `otroSesgo()`, que volvía a bajar y subir el video entero). YouTube:
transcripción (subtítulos, texto puro) → audio → Gemini lee la URL directo → video completo
(último recurso) — cada escalón que falla cae al siguiente, no aborta.

Verificado con un link real de Instagram (lo pasó el usuario): descarga de audio, acta correcta,
crónica sintetizada. Multifuente probado por HTTP contra el servidor local: 3 fuentes
acumuladas incorporando cada dato nuevo y resolviendo una contradicción entre fuentes con
naturalidad, 4ta rechazada. Resíntesis: 3.8s sin descargas contra 14.4s con descarga, confirmado
en el log ("sin re-descargar", sin línea de audio). YouTube: transcripción y audio están
bloqueados AHORA MISMO por el anti-bot de YouTube (externo, cambia con el tiempo) — pero el
fallback a Gemini-directo se probó real: degrada exactamente al comportamiento que la app ya
tenía antes de esta fase, sin romper nada.

**Pendiente**: nada a medio hacer. Sigue la Fase 5 (fuente de tiempos intercambiable).


### 2026-07-19 (Windows) — Fragmentación por oración, efectos, robustez Gemini, reconciliación con la Mac

**Fragmentación por oración + multi-clip dinámico** (`gemini.js`):
`fragmentarGuionParrafos` ahora segmenta **1 oración exacta por fragmento** (antes agrupaba 1-3).
Combinado con `CLIP_MAX=3` (`seleccion.js`, ya existía), las oraciones largas se reparten solas en
2-4 tomas de ≤3s y las cortas quedan como clip único breve. Verificado en render real (Shakira,
10 fragmentos/28 clips): oración de 29 caracteres → 1 toma de 1.6s; oración de 188 caracteres →
4 tomas de ~2.6s.

**Efectos zoom (Ken Burns) + espejo** (`video.js`, `server.js`, `public/index.html` Paso 6):
`decidirEfecto(preset, index)` + `filtroZoom(direccion, pct, duracionClip)` — 4 presets cada uno
(todos/alternado/intercalado/ninguno), zoom activo **toda** la duración del clip vía `zoompan`
(no Ken Burns de imagen fija). Verificado visualmente extrayendo frames del render real: zoom
progresivo confirmado (framing se cierra sobre el sujeto a medida que avanza el clip).

**⚠️ Estos efectos SOLO estaban en este repo — `farandula-insumos` (repo hermano) nunca los tuvo**
porque tiene su propio `exportar.js` (corta clips individuales para edición manual, no compone un
video final). El usuario lo notó después: "los insumos salen con cortes planos, sin zoom ni
espejo". Se portaron `decidirEfecto()`/`filtroZoom()` a `farandula-insumos/exportar.js`,
`/api/exportar` ahora acepta `efectos` en el body, y este repo's `public/app.js` (frontend
compartido) ahora manda `efectos` también en el flujo de insumos (antes solo en `/generate-video`).
Verificado igual: zoom + espejo confirmados en clip exportado por `exportarInsumos()`.

**Reconciliación con 5 commits de la Mac** (mismo día, ver protocolo arriba): la Mac ya había
rediseñado la UI (iconos Phosphor, tipografía Inter/Space Grotesk, layout `.layout-cols`
Procesos/Productos, historial compacto). Se descartaron los cambios UI locales en conflicto
(`app.js`/`index.html`/`style.css`), se hizo `git pull`, y se reaplicaron sobre esa base: pasos en
carrusel horizontal (un paso a la vez, flechas + "Paso X de 6" — decisión explícita del usuario
tras ver una versión con "peek" del siguiente paso), controles de zoom/espejo en Paso 6, y
"Resultado de la lectura" movido de arriba-de-todo a la columna Productos (es un producto del
paso 1, no un header). Bug real encontrado 2 veces en el camino: un hijo con `overflow-x:auto`
dentro de una columna CSS grid/flex necesita `min-width:0` en el padre o expande la columna entera
a su ancho de contenido — pasó primero con `.col-procesos` (1760px) y de nuevo al agregar el
carrusel.

**Robustez de Gemini** (`gemini.js`, ambos repos): un 400/404 de la API ya NO aborta la cadena de
`MODELOS` — los alias `-latest` rotan su destino (ahora hacia gemini-3.x) y una misma request
puede dar 400 en un modelo y funcionar en el siguiente. Solo 401/403 (auth) son fatales. Se
captura además el mensaje REAL de la API (`error.response.data.error.message`) en vez del genérico
de axios — esto reveló la causa de fondo de un error reportado como "400" random: era
`Unsupported MIME type: text/html` al leer ciertos links de YouTube (Shorts, privados/
age-restricted, páginas de canal) que hacen que Gemini fetchee HTML en vez de leer el video.
**Fix**: si la lectura directa de YouTube falla, se descarga con `yt-dlp` y se sube por File API
(mismo camino ya probado de TikTok/IG). Un `}` extra que Gemini a veces agrega al final del JSON
(rompía el parser) también se arregló: `extraerBalanceado()` en `parsearJsonRobusto()` recorta
basura después del objeto/array top-level balanceado.

**UI — panel de progreso/log**: era `position:fixed` (barra flotante de medio-pantalla, diseño de
Bloque B). Pasó a tarjeta normal dentro de `.col-productos`, debajo de Historial; log de 300px a
110px máx. `express.static` ahora manda `Cache-Control:no-cache` en html/css/js — el navegador se
quedaba con versiones viejas y parecía que los cambios de UI no aplicaban.

**Sin verificar / pendiente para la próxima sesión**: el flujo de Insumos con un video real de
punta a punta con los efectos ya wireados (se probó `exportarInsumos()` aislado con un video de
prueba, no el flujo completo `/api/exportar` vía UI). Decidir cuándo mergear `test-persistencia`
a `main` sigue pendiente (regla: solo cuando el usuario confirme que todo funciona óptimo).

### 2026-07-20 (Windows) — Refresh token OAuth expirado (`invalid_grant`)

`GOOGLE_OAUTH_REFRESH_TOKEN` expiró/fue revocado — `invalid_grant` al generar video (falla
downloads/uploads que usan `getDriveOAuth()`; los Service Accounts no tienen cuota de Drive así
que no hay fallback funcional para esas operaciones). Regenerado con `obtener-token.js` (flujo
manual: usuario abre URL de consentimiento, autoriza, pega el code). Actualizado en **4
ubicaciones** (son independientes, ninguna se propaga a las otras — ver sección de arriba
"Despliegues en Railway"): `.env` de ambos repos local, `farandula-insumos` (Railway prod) y
`adventurous-reflection` (Railway staging `test-persistencia`, recién identificado esta sesión).
Los 4 verificados con una llamada real a Drive tras cada actualización.

**Si vuelve a pasar**: los refresh tokens de OAuth "Testing" (no "In production" en el consent
screen de Google Cloud) expiran solos a los 7 días de inactividad — si esto se repite seguido,
revisar el "Publishing status" del proyecto OAuth en Google Cloud Console y pasarlo a producción
(o agregar el usuario como "Test user" no alcanza, hay que publicar la app).

**Bug encontrado al final de la sesión, SIN arreglar todavía — para la próxima sesión**:
`audiosPendientes` (`server.js`, línea ~55) es un `Map` en memoria, sin persistencia. Cada
reinicio del server (pasó varias veces hoy por los fixes) lo vacía, y si el usuario tenía un
`audioToken` de una locución ya aprobada, `/api/generate-video` falla con `"No se encontró la
locución aprobada: regenera el audio"` aunque el audio siga bien generado — solo se perdió la
referencia en memoria. Workaround inmediato: volver a Paso 5 y re-aprobar la locución (genera
token nuevo). **Fix real pendiente**: persistir `audiosPendientes` en disco (mismo patrón que
`jobStore.js` usa para el resto del job — Bloque A) para que sobreviva un restart del server.
El usuario pidió esto explícitamente, no se llegó a implementar antes de la pausa.

### 2026-07-21 (Mac) — Fix REAL del crash zoompan -22 + fallback por segmento

El fix anterior (`d=duracionClip`) NO sirvió: el crash `-22 (Invalid argument)` volvió en
Railway. **Causa raíz encontrada reproduciendo con ffmpeg real**: `zoompan` exige que `d`
sea un ENTERO de frames. `d=${duracionClip}` es un decimal (ej. `d=2.456`) → ffmpeg estricto
(Railway) lo rechaza con -22. (El ffmpeg-static local es tolerante y lo truncaba, por eso no
crasheaba acá — se confirmó probando variantes en /tmp con testsrc.)

**Recorrido de valores de `d`**: `d=1` (suave, correcto) → `d=frames` (congela, imagen fija)
→ `d=duracionClip` (crash -22 decimal) → **`d=1` de nuevo, el correcto**. `d=1` = 1 frame de
salida por frame de entrada; la expresión `z='1+on/frames*factor'` con `on` avanzando da el
zoom progresivo (verificado: 75 frames para clip de 2.5s, zoom 1.0→1.20).

**Fallback agregado** (`video.js` `montarVideoPlan`): si un segmento CON efectos falla al
codificar, se reintenta ESE segmento plano (sin zoom/hflip) en vez de abortar todo el render.
Así el video siempre se genera aunque el zoom falle en algún entorno/clip; el log dice
`⚠️ Segmento N falló con efectos, reintentando plano`.

**Verificado en Mac**: sintaxis OK; `d=1` produce 75 frames válidos con zoom progresivo.
El crash exacto de Railway NO se reprodujo local (ffmpeg tolerante) — **verificar en Railway**
que ahora genera con zoom. Si aún fallara, el fallback garantiza video plano igual.

### 2026-07-21 (Mac) — Botón "Recargar audio desde Drive" (Paso 5)

Permite incorporar una voz hecha/editada FUERA de la app: el usuario sube su `audio.mp3`
a la carpeta de insumos del job en Drive, y el botón lo baja y lo deja aprobable sin pasar
por ElevenLabs.

- `server.js` — `recuperarAudioDeDrive(job, force)` ahora acepta `force`: borra la copia
  local cacheada y re-baja (el usuario reemplazó el archivo). Endpoint nuevo
  `POST /api/recargar-audio {jobId}`: baja el audio.mp3 con force, mide duración con
  ffprobe, crea token nuevo en el Map + actualiza el job (`modelo: 'drive'`).
- `public/index.html` — botón `btn-recargar-audio` + nota en Paso 5.
- `public/app.js` — `recargarAudioDeDrive()`: llama al endpoint, actualiza reproductor,
  token y estados de paso (invalida destino, igual que regenerar).

**Verificado en Mac**: botón presente en DOM + función definida + endpoint valida jobId y
existencia del job. La descarga real necesita un job con audio.mp3 en su carpeta + OAuth
(no probado e2e acá). **Alcance elegido por el usuario**: solo audio (no guion/fragmentos).

### 2026-07-21 (Mac) — Recuperación de audio desde Drive (fix del bug audiosPendientes)

**Problema** (pendiente desde 2026-07-20 Windows): `audiosPendientes` era un `Map` en
memoria. Al reiniciar el server (o redeploy Railway) se vaciaba, y aunque el `audio.mp3`
seguía respaldado en Drive, se perdía la referencia → `/api/generate-video` fallaba con
"No se encontró la locución aprobada: regenera el audio". El usuario tenía que regenerar
la voz aunque ya existía.

**Hallazgo clave**: el `audio.mp3` YA se respaldaba en la carpeta de insumos de CADA job
(la carpeta se crea en el paso de lectura, server.js:226, tanto en modo Video como
Insumos). El token + duracion + modelo YA se persistían en `jobs.json` (server.js:406).
Solo faltaba la RECUPERACIÓN: nadie bajaba el mp3 de Drive cuando el Map estaba vacío.

**Fix (de raíz, no toca el flujo feliz)**:
- `drive.js` — `descargarDeInsumo(carpetaId, nombre, destPath)` (nuevo): baja un archivo
  BINARIO (mp3) a disco. `leerDeInsumo` existente NO servía: decodifica a texto/JSON y
  corrompía el mp3.
- `jobStore.js` — `buscarPorAudioToken(token)` (nuevo): halla el job dueño de un token.
- `server.js` — helper `recuperarAudioDeDrive(job)`: baja `audio.mp3` de la carpeta de
  insumos a `temp-videos/audio_recuperado_{jobId}.mp3` (cachea si ya existe). Usado como
  fallback en 2 lugares:
  - `/api/audio/:token` (ahora async): si el Map se vació, busca job por token, recupera
    de Drive y REPUEBLA el Map. El `<audio>` del Paso 5 vuelve a sonar al retomar.
  - `/api/generate-video`: si no hay audio en memoria ni en disco, recupera del job por
    `jobId` antes de dar el error.

**Verificado en Mac**: server bootea limpio (Drive conectado); token falso a
`/api/audio/:token` ejecuta el fallback sin crashear y devuelve 404 correcto
(job no existe → recuperar retorna null → 404). El camino de descarga exitosa NO se
probó e2e acá (necesita un job real con audio.mp3 en su carpeta + OAuth; esta Mac no
tiene las vars OAuth). **Pendiente verificar en Railway staging**: retomar un job viejo
y generar video sin regenerar audio.

### 2026-07-20 (Mac) — Bug fix: zoompan filter (Bloque E video composition)

**Problema**: Al generar video con zoom activo ("Intercalado in/out", 20%), FFmpeg fallaba con `libx264 error -22 (Invalid argument)` + "Nothing was written into output file".

**Causa**: `filtroZoom()` en `video.js` línea 383 pasaba `d=1` (procesar 1 frame solamente). FFmpeg `zoompan` espera `d` en **segundos**, no frames. Resultado: 0 frames reales para codificar → output vacío → crash libx264.

**Fix**:
- `video.js` línea 383: Cambio `d=1` → `d=${frames}` (primera corrección)
- Luego cambio `d=${frames}` → `d=${duracionClip}` (segunda corrección) — FFmpeg `zoompan` toma duración en segundos, no cantidad de frames

**Verificado**: Código compila sin errores. Clip duracionClip (1.5-4s) y frames (45-120) ahora coherentes con zoom lineal en toda la toma.

**Commit + push**: Dos commits separados (7c6b0d9, df3d501). Railway redeploya automáticamente.

**Pendiente**: Verificar flujo e2e en Railway — generar video con zoom active debería procesar sin congelarse.

### 2026-07-20 (Mac) — Bloque F: botones presionados durante procesos (evita doble-click accidental)

**Problema**: usuario presionaba botón 2 veces porque no notaba la pantalla de progreso (banner negro con letras verdes). Botones volvían a activarse, causando duplicación de procesos.

**Solución**: botones ahora se quedan "presionados" (disabled + opacity 0.6) durante todo su proceso, se reactivan cuando termina (éxito o error).

**Cambios**:
- `public/index.html` — agregué IDs a 9 botones: `btn-read`, `btn-generate-script`, `btn-approve-guion`, `btn-regenerate-guion`, `btn-confirm-assignments`, `btn-approve-audio`, `btn-regenerate-audio-v3`, `btn-regenerate-audio-v2`, `btn-generate-video`.
- `public/app.js` — función helper `setButtonDisabled(buttonId, disabled)` que deshabilita el botón + cambia opacity (0.6 deshabilitado, 1 habilitado). Todas las funciones async ahora deshabilitan su botón al inicio y lo habilitan en el `finally` (garantiza re-habilitación incluso con error).
- Funciones modificadas: `handleRead()`, `handleGenerateScript()`, `aprobarGuion()`, `confirmarAsignaciones()`, `regenerarAudio()` (deshabilita ambos botones de audio), `aprobarAudio()`, `regenerarGuion()` (hecha async), `handleGenerateVideo()`.

**Verificado en browser**: botón correcto se deshabilita (opacity 0.6) durante proceso y se reactiva (opacity 1) al terminar, incluso si hay error.

**Commit + push**: hecho a `test-persistencia`. Railway redeployará automáticamente.

**Pendiente**: none. Cambio está listo para verificar en Railway.

### 2026-07-20 (Mac) — Bloque E: rediseño visual completo

**Iconos Phosphor self-hosted** (34 SVG, bold weight): descargados desde CDN Phosphor, embebidos
en `public/icons.js` (nuevo) como constante `ICONS = {...}` + helper `icon(nombre, extraClass)`.
Reemplazan emoji en casi toda la UI (`videoCamera`, `scissors`, `article`, `microphone`,
`listChecks`, etc.) — excepto `<select>` de sesgo (nativo no permite iconos) y log-box (intención
de estilo terminal con emoji). Cross-verificado con `grep`: todos los `data-icon`/`icon('...')`
del código existen en `icons.js`, ninguno falta.

**Tipografía propia** (Google Fonts self-hosted): Space Grotesk (títulos) + Inter (texto),
variable-font `.woff2` descargados en `public/fonts/` (2 archivos: 22KB SpaceGrotesk + 48KB Inter).
CSS `@font-face` referencia local, sin CDN en producción. Variable-font: Google sirve UN SOLO
archivo `.woff2` para ambos weights (400/700 en Inter, 500/700 en SpaceGrotesk), economiza
descargas.

**Palanca de modo** (reemplaza 2 botones): `.modo-switch` neobrutalista con thumb deslizante
(`transform: translateX(100%)` bajo `[data-modo="insumos"]`), botones full-width bajo el thumb
con `pointer-events: auto`, label visual clara. Funciona en ambas direcciones.

**Panel "Productos"** (columna derecha, sobre Historial): 3 casillas (`producto-slot`) —
Guion/Audio/Video — con status `data-status="pendiente"|"listo"`. Opacas/dim por defecto
(opacity 0.4, grayscale 65%), se encienden a color pleno con borde verde (#2f8f2f, shadow) cuando
status="listo". Contenido real: extracto texto (guion), `<audio controls>` nativo (audio),
`<video>`/link (video). Se apagan auto al rehacer un paso anterior vía `lockFrom()` extendido con
`resetProductoSlot()`.

**On/off scroll-snap system** (quita badge "👉 Viendo"): nuevo `observarSnap()` por distancia al
centro (reemplaza IntersectionObserver) en `public/app.js`. El bloque centrado en Procesos/Historial
queda `.snapped` (encendido: opacity 1, filter none, borde azul, shadow fuerte); resto opaco
(opacity 0.45, grayscale 55%). Garantiza SIEMPRE exactamente 1 elemento encendido.

**Historial compacto**: tarjetas apiladas (título + fecha/protagonista/canal en fila), auto-load
sin botón, 1 tarjeta visible + ~30% peek de la siguiente. Botones copiar para título/guion usan
iconos.

**Verificado en browser local** (rama `test-persistencia`): switch bidireccional, badges de paso
con icono+texto (⏳/🔓/✅ → hourglass/lockOpen/checkCircle), casillas de producto en ambos estados
(opaco y lit con contenido mock), sin errores de consola nuevos.

**READMEs actualizados**: README.md + README-ECOSYSTEM.md documentan Bloque E en "Rama de prueba"
y "Próximas mejoras" (5 bloques A-E completos, pendiente merge a `main`).

**Pendiente**: merge `test-persistencia` → `main` (esperando confirmación del usuario que todo
funciona óptimo en test-persistencia). Railway actualmente deploya `main` (versión vieja sin Bloque
E), por eso adventurous-reflection muestra botones normales en lugar de palanca — el redeploy
automático ocurrirá al mergear.

### 2026-07-22 (Mac) — Evolución del generador de guiones (modo iteración/conceptualización)

**Objetivo**: mejorar el generador de guiones para producir variantes más viralizables en TikTok,
no limitado a 5 ángulos fijos sino explorando "caminos más viralizables" según contexto + literatura.

**Visión (3 capas, diseño arquitectónico — SIN implementar todavía)**:

1. **Capa de Literatura** (base de conocimiento): textos consolidados sobre viralidad en TikTok
   + farandula, actualizado, con buenas reseñas. Fuentes: libros (ej. "Contagious" Jonah Berger),
   papers académicos sobre TikTok+algoritmo, blogs actuales (Hootsuite, Think With Google). El
   usuario mencionó acceso a **zepl.films** (curso de guion cinematográfico de Nicolás Amelio-Ortiz)
   que quiere sintetizar — video-only sin transcripts descargables. **Opción propuesta**: Puppeteer
   que navega sesión autorizada, captura pantalla de cada lección, Claude Vision sintetiza 5 puntos
   clave por lección, compila en documento reutilizable.

2. **Capa de Generador mejorado** (propone + rankea + flexible):
   - Lee noticia/contexto
   - Consulta base de literatura + grafo (ver capa 3) para explorar qué patrones funcionan
   - Genera 5 variantes (NO solo 5 ángulos fijos del prompt actual) ordenadas por viralidad predicha
   - Usuario elige 1-3 opciones independientes (o combina elementos de varias, o personaliza)
   - Cada opción elegida se convierte en video (igual a hoy: texto → audio → video)

3. **Capa de Grafo incremental** (futuro monitor de noticias): dos fuentes alimentan el grafo:
   - **Literatura**: patrones narrativos consolidados extraídos de textos
   - **Noticias/Guiones generados**: usuario carga noticias (manualmente) o la app los genera;
     se "compactan" en grafo (extrae entidades: personas, eventos, relaciones; patrones narrativos
     que funcionaron). Sistema crece con el tiempo.

**Pregunta técnica abierta**: ¿Cómo calcular "viralidad predicha" en el ranking? Combinación de
literatura ("este patrón explota Gen Z", etc.) + grafo ("este contexto + patrón ganó 3 veces en
últimas 2 semanas"). Pendiente detalle en próxima sesión.

**Decisiones del usuario confirmadas esta sesión**:
- Agregar literatura (acepta sugerencias, busca textos más actuales posible)
- NO limitarse a 5 ángulos (explorar caminos viralizables)
- Ranking de 5 opciones por viralidad
- Opción de elegir 1-3 independientes, combinarlas o personalizar
- Monitor de noticias separado (tool independiente)
- Grafo crece con: noticias cargadas + links + guiones generados

**Pendiente primer paso**: extraer síntesis de zepl.films (Puppet + Claude Vision). User decidirá
si comenzamos ahí o primero documentamos literatura/patrones en grafo. Sin implementar até que user
confirme dirección.

### 2026-07-25 (Windows) — Consolidación: modo Insumos ya NO depende de un servicio separado

Contexto: el usuario quiere **un solo programa en producción** (antes: 2 servicios Railway
independientes, `farandula-video-generator` main + `farandula-insumos` aparte). El frontend
compartido ya tenía un switch visual Video/Insumos, pero por debajo `BACKENDS.insumos` apuntaba a
una URL externa (`farandula-insumos-production...`) — no estaba unificado en el código, solo en la UI.

**Port hecho** (detalle completo del código en el commit `4e8550c`):
- `exportar.js` (nuevo, en este repo): `exportarInsumos()` portado desde `farandula-insumos`,
  reusa los helpers de `video.js` (`ffmpeg`/`detectarEncoder`/`argsEncoder`/`decidirEfecto`/
  `filtroZoom`, ahora exportados) en vez de duplicarlos.
- `server.js`: nuevo `POST /api/exportar`. Más simple que el original de `farandula-insumos`:
  no pide `canalId`/`canal` en el body — usa `job.carpetaInsumoId` (ya fijado en `/api/read`,
  Paso 1), así que exportar ya no vuelve a preguntar destino a nivel de datos (aunque la UI de
  Paso 6 lo sigue mostrando por ahora — queda ignorado por el server, ver "pendiente" abajo).
- `public/app.js`: `BACKENDS.insumos` → `window.location.origin`. `FLUJO.insumos` unificado con
  `FLUJO.video` (mismos endpoints `/fragment` y `/generar-audio`, que ya eran genéricos — no le
  importaba a esos endpoints si el resultado final era 1 video o N fragmentos). Se eliminó la
  necesidad de un `/api/asignar` separado. Fix de paso: la llamada a `/exportar` mandaba `parrafos`
  (nombre viejo) y nunca mandaba `jobId` — tal como estaba, jamás hubiera funcionado ni siquiera
  contra el servicio viejo con el `server.js` nuevo.

**Verificado DOS VECES, no solo unitario**:
1. Por API directa (curl, job sintético): 30 fragmentos + locucion.mp3, zoom+espejo confirmados
   visualmente en frames extraídos.
2. **Por la UI real, click por click** (cambiar a modo Insumos, elegir canal, pegar texto, leer,
   elegir ángulo, aprobar guion, confirmar asignaciones, aprobar audio, setear efectos, exportar):
   13 fragmentos exportados correctamente, link de Drive válido, mensaje "🎉 ¡Insumos listos!".
   Carpetas de prueba de ambas verificaciones borradas de Drive al terminar.

**Bug preexistente encontrado de paso** (no es de esta sesión, sin arreglar): `decidirEfecto
('intercalado', i)` en `video.js` devuelve `activo:true` para TODO índice — el comentario dice
que en espejo debería equivaler a `alternado`, pero el código no lo hace (mirror queda en TODOS
los clips con preset "intercalado", no alternado).

**Gap encontrado**: faltaba `GOOGLE_DRIVE_INSUMOS_FOLDER_ID` en el `.env` local de esta máquina
(Windows) — no estaba documentado en ningún README. Se dedujo consultando el padre de una carpeta
de canal conocida vía Drive API y se agregó al `.env` local (no se sube a git, avisar a la Mac que
también lo necesita si corre esto local).

**Cerrado el mismo día — merge a `main` + apagado del servicio viejo (2026-07-25)**:
- `test-persistencia` → `main` mergeado (fast-forward limpio, sin conflictos, commit `df5996b`).
  `main` y `test-persistencia` quedaron en el mismo commit.
- Topología real de Railway (aclarada esta sesión, corrige confusión anterior): proyecto único
  `generous-empathy`, 2 entornos — **production** (`farandula-video-generator` service, dominio
  `farandula-video-generator-production.up.railway.app` = la app real que el usuario usa a
  diario) y **test-persistencia** (`adventurous-reflection`, staging). Cada entorno tenía TAMBIÉN
  un servicio separado `farandula-insumos` (el viejo backend aparte, dominio
  `farandula-insumos-production.up.railway.app`) — dos despliegues por entorno, cuatro en total.
- Al desplegar el merge en `farandula-video-generator-production`, faltaba la variable
  `GOOGLE_DRIVE_INSUMOS_FOLDER_ID` (nueva, nunca la tuvo ese servicio) — agregada
  (`1TpsxFGmeZU4ot9fG9CzcLM3dpCu0Qi4x`), verificado `/api/canales` 200 tras el redeploy.
- **Servicio `farandula-insumos` de producción APAGADO** (borrado desde Railway UI) — confirmado
  con `curl`: `farandula-insumos-production.up.railway.app` da 404, `farandula-video-generator-
  production.up.railway.app` sigue sano (200). El de `test-persistencia`/`adventurous-reflection`
  (staging) sigue como estaba, sin tocar — decisión de apagarlo pendiente, aparte.

**Pendiente real que queda**:
- Limpieza de UX menor: Paso 6 en modo Insumos sigue pidiendo "selecciona destino" aunque ya no
  se usa para nada (el server ignora ese valor) — podría simplificarse a un solo botón de
  confirmación sin selector, ya que el canal se elige una sola vez en Paso 1.
- El servicio `farandula-insumos` DENTRO del entorno `test-persistencia` (staging) sigue
  desplegado (Sleeping) — nadie lo usa tampoco, pero no se apagó esta sesión (menor prioridad,
  es staging no producción).

### 2026-07-27 (Windows) — Refresh token OAuth expirado otra vez + fix de concurrencia + apagado del `farandula-insumos` de staging

**Refresh token `invalid_grant` de nuevo** (tercera vez, ver sesiones 2026-07-20/21): esta vez
el proyecto OAuth YA estaba en "En producción" en Google Cloud Console (el usuario lo confirmó
en el momento), así que la causa NO fue el vencimiento de 7 días de "Testing" — el token se
invalidó por otra razón (revocación manual, límite de tokens del cliente, etc., sin confirmar
cuál). Regenerado con el mismo flujo de siempre (URL de consentimiento → código → intercambio).
Como el servicio `farandula-insumos` de producción ya está apagado (sesión 2026-07-25), esta vez
solo hubo que actualizar en **3 lugares** (antes eran 4): `.env` local, Railway
`farandula-video-generator` (producción) y Railway `adventurous-reflection` (staging,
`test-persistencia`). Verificado con `curl` real a `/api/canales` en los 3 — los 3 devuelven
231 carpetas de Famosos correctamente.

**Fix de concurrencia en `limpiarTemporales()`** (`video.js`): un job terminando (éxito o error)
borraba TODOS los `src_*.mp4` cacheados (caché de clips fuente, compartido entre jobs a
propósito para no re-descargar el mismo clip de Drive en cada video). Si dos generaciones
corrían cerca en el tiempo, la que terminaba primero borraba los clips que la otra acababa de
descargar y estaba por leer con ffmpeg → `Error opening input file ... No such file or
directory`. Reproducido en vivo en `adventurous-reflection` (screenshot del usuario). Fix:
`limpiarTemporales(jobId)` ya no toca `src_*` — solo borra archivos que empiezan con el
`jobId` de ESE render. La limpieza de `src_*` por antigüedad la sigue haciendo
`limpiarCache()` (TTL 1h) en `server.js`, que sí filtra correctamente por actividad reciente.
Commit `ec79935` en `test-persistencia`, pusheado y verificado (SHA remoto = SHA local).
Railway redeployó `adventurous-reflection` automáticamente.

**Apagado el `farandula-insumos` de staging** (el que quedaba pendiente desde la sesión
2026-07-25, ambiente `test-persistencia`): confirmado por el usuario que era un duplicado mal
configurado — mismo repo `farandula-video-generator` pero con la rama `main` conectada en vez
de `test-persistencia`, sin tráfico (Sleeping). Apagado desde Railway UI (Settings → Danger →
Remove Service). En `test-persistencia` solo queda ahora `adventurous-reflection` (activo,
rama correcta).

**Contexto aparte (otro repo, mencionado aquí para que quede registrado)**: se creó
`farandula-video-family` (repo nuevo, proyecto Railway nuevo) — versión para los hermanos del
usuario, sin ElevenLabs (suben su propio MP3), sin escritura a Drive (todo se descarga local,
ZIP para insumos), con login/registro y PostgreSQL para historial por usuario. Reusa
`gemini.js`/`video.js`/`seleccion.js` tal cual, y un `drive.js` recortado a SOLO LECTURA
(Service Account, mismo `credentials.json` que este repo) para leer los clips de `Famosos/`.
Verificado end-to-end con datos reales de Drive: video final (MP4 1080x1920 H264/AAC) e
insumos (ZIP con `clips/` + `locucion.mp3`) ambos generados y confirmados con ffprobe/unzip.
Pendiente: desplegar a Railway (aún no tiene proyecto propio en producción).

### 2026-07-28 (Mac) — Fix: carrera en `descargarVideo()` (crash -22 en producción, distinto del bug de zoompan)

**Reportado por el usuario**: screenshot de `adventurous-reflection` (staging) al 70% de
"Generando video...", mismo log que el crash de zoompan ya arreglado (2026-07-20/21):
`Task finished with error code -22 (Invalid argument)` / `Nothing was written into output
file, because at least one of its streams received no packets`.

**Causa real (distinta a la de zoompan)**: `drive.js` `descargarVideo(fileId, destDir)` —
`fs.existsSync(destPath)` se chequeaba como "caché" ANTES de que terminara de escribirse el
archivo (`createWriteStream` + pipe). El caché de clips fuente (`src_*.mp4`) es compartido
a propósito entre jobs concurrentes (evita redescargar el mismo clip para otro video) — si
dos jobs pedían el mismo `fileId` casi al mismo tiempo, el segundo veía `existsSync==true`
mientras el primero todavía escribía, y tomaba el archivo a medio descargar como listo.
ffmpeg lo leía truncado → mismo síntoma exacto que zoompan (`-22`, 0 frames), pero sin
relación con el filtro. Como el fallback "reintentar sin efectos" (`video.js`) usa el MISMO
archivo fuente roto, también fallaba — por eso llegaba hasta el error genérico de UI en vez
del auto-reintento.

**Fix** (`drive.js`, commit `96c2e29`): descarga a un temporal único
(`.tmp-src_<fileId>-<pid>-<random>.mp4`) y `fs.renameSync()` atómico al nombre final SOLO al
terminar con éxito (con cleanup del temporal si falla). `existsSync(destPath)` ya nunca ve
un archivo incompleto.

**Verificado con Drive real** (Service Account local, sin necesitar OAuth): 5 llamadas
concurrentes a `descargarVideo()` con el mismo `fileId` real (carpeta
`Dany_Alexis_bebeshita`) → las 5 resuelven a la misma ruta, 0 archivos `.tmp-` sueltos,
mp4 final íntegro confirmado con `ffprobe` (duración correcta, ~11s). No se pudo probar
e2e en Railway (esta sesión no tiene acceso de deploy) — **pendiente confirmar que el
crash no vuelve a aparecer en staging con generaciones concurrentes reales**.

### 2026-08-05 (Windows) — Dos diagnósticos SIN implementar: fragmentación por cambio de sujeto y carpetas congeladas al retomar un job

Sesión de análisis, **no se tocó código**. Ambos hallazgos quedaron acordados con el usuario para
ejecutarse en `test-persistencia`. Estimado del primero: ~50 min.

**A) Modelos Gemini — la cadena NO está desactualizada (verificado, no re-chequear)**

El usuario vio "3.6 Flash — Nuevo" en la UI de Gemini y preguntó si la app estaba atrasada. No:
el alias `gemini-flash-latest` que ya encabeza `MODELOS` en `gemini.js` **resuelve a
`gemini-3.6-flash`**, confirmado leyendo el campo `modelVersion` de una respuesta real de la API.
Los 4 modelos de la cadena existen en la cuenta. No "actualizar" la cadena pensando que está
vieja. Único cambio defendible (opcional): fijar `gemini-3.6-flash` explícito de primero y dejar
`-latest` de segundo, para que una rotación futura del alias no cambie el comportamiento en
silencio — riesgo ya documentado en el comentario de las líneas 6-10 de `gemini.js`.

**B) Asignación de famosos por fragmento — el prompt ordena el bug**

Síntoma del usuario: los fragmentos salen casi por párrafo y, cuando la narración pasa a hablar
de otra persona a mitad del fragmento, en pantalla sigue el famoso anterior.

Causa raíz en `fragmentarGuionParrafos()` (`gemini.js`): la **regla 5** del prompt dice literal
*"Si un fragmento habla de dos famosos, elige al que tenga más peso en ese fragmento"* — o sea,
ante un cambio de sujeto le ordena NO partir sino elegir un ganador. Y la **regla 2** hace que
partir sea opcional (`puedes partirla`) y disparado por LONGITUD (>140 chars), no por cambio de
sujeto. Por eso `"Shakira apareció radiante en la alfombra roja, pero Piqué prefirió quedarse en
casa."` (83 chars, dos personas) nunca se parte: corta para la regla 2, y la 5 manda elegir uno.

Causa secundaria, silenciosa: nadie verifica que los fragmentos reconstruyan el guion. La regla 3
lo pide, nada lo comprueba. Como el tiempo en pantalla sale de `chars_fragmento / chars_total`
(`seleccion.js`), si Gemini recorta o reescribe palabras se corren los tiempos de TODOS los clips.

Plan acordado — 3 cambios, ~40 líneas:
1. Arreglar reglas 2 y 5: partir cuando cambia el sujeto, sin importar el largo.
2. Verificación de reconstrucción (~10 líneas): pegar los fragmentos y comparar contra el guion;
   loguear alerta si no coinciden. Convierte una falla silenciosa en visible.
3. Guarda de duración mínima en `seleccion.js` (~10 líneas): al partir más aparecen fragmentos de
   ~0.6s (parpadeo). Si el tiempo calculado baja de ~0.7s, fusionar con el vecino del mismo famoso.

Se evaluó y **descartó por ahora** un rediseño mayor (cortar oraciones con regex determinista y
que Gemini solo devuelva quién/dónde, nunca texto): usa exactamente el mismo juicio del mismo
modelo, solo agrega garantías estructurales. Primero probar si con la instrucción correcta el 3.6
ya lo hace bien; si desobedece o corrompe texto, ahí el rediseño queda justificado por datos.

Al probar, vigilar el efecto colateral: más fragmentos = más transiciones y SFX (`video.js` los
dispara en cada cambio de `parrafoIdx`) y más ventanas de subtítulo (`subtitulos.js`). Revisar que
hyperframes no meta un efecto de sonido en cada micro-corte. Truco para iterar rápido: llamar
`fragmentarGuionParrafos()` directo con guiones que tengan cambios de sujeto, sin correr el
pipeline completo (~30s por corrida en vez de lectura+guion cada vez).

**C) Las carpetas de famosos se congelan al retomar un proceso del historial**

Síntoma: "no está actualizando la información de las carpetas de los famosos".

NO es caché ni permisos ni paginación — se descartaron los tres: `drive.js` y `server.js` no
cachean nada (ambos consultan Drive en vivo con `pageSize: 1000`), el Service Account ve las 243
carpetas actuales incluidas las creadas el mismo día, y no hay nombres duplicados (243 archivos =
243 nombres únicos, así que el mapa `nombre → id` de `obtenerCarpetasFamosos()` no pisa ninguna).

La causa es el snapshot del job:
- `server.js:370` — al fragmentar, la lista se guarda DENTRO del job:
  `actualizarJob(jobId, { paso: 'fragmentacion', fragments, carpetas })`. Es una foto del momento.
- `public/app.js:1148` — al retomar ese job: `state.carpetas = job.carpetas || []`. Lee la foto.
- `public/app.js:512` — los desplegables de asignación se arman desde `state.carpetas`.

Entonces al retomar un proceso viejo los desplegables muestran las carpetas de ESE día; todo
famoso creado después no aparece. En procesos nuevos no pasa (lista en vivo). Se volvió visible
ahora porque el usuario viene creando muchas carpetas (12 en los últimos días).

**RESUELTO el mismo día**, por pedido del usuario, con un botón manual en vez de refresco
automático al recuperar el job:
- `server.js` — endpoint nuevo `GET /api/carpetas-famosos` (antes la lista solo volvía dentro
  del POST `/api/fragment`).
- `public/index.html` — botón "Actualizar lista de carpetas" en el Paso 4, sobre la lista de
  asignaciones, con una nota explicando para qué sirve.
- `public/app.js` — `refrescarCarpetas()`: pide la lista viva y hace la **unión** con la
  guardada y con las ya asignadas. La unión importa: si una carpeta fue renombrada o borrada en
  Drive, el fragmento que la tenía asignada no se queda sin su opción seleccionada. Las
  selecciones se conservan solas porque `sel.onchange` ya las escribe en
  `state.fragments[i].famoso` y `renderAsignaciones()` repinta desde ahí.
- Recalcula además el aviso de "protagonista sin carpeta" con el mismo criterio que el server:
  si el usuario crea justo esa carpeta en Drive y refresca, el aviso desaparece solo.

Verificado en browser real con un job simulado que tenía lista vieja (3 carpetas) y un fragmento
asignado a una carpeta inexistente en Drive: pasó a 248 opciones, conservó las dos selecciones,
mantuvo disponible la carpeta borrada, y el aviso de protagonista se apagó al aparecer `Rosalia`.

### 2026-08-05 (Windows) — Merge a `main` y despliegue en producción

Por pedido explícito del usuario ("implementalo en railway"). `test-persistencia` → `main`
fast-forward limpio (`f5b1efa`), 7 commits: los dos fixes de concurrencia (`ec79935` mío sobre
`limpiarTemporales`, `96c2e29` de la Mac sobre `descargarVideo`), el cron de limpieza de
insumos, el botón de actualizar carpetas y 3 de documentación. `main` y `test-persistencia`
quedaron en el mismo commit.

**Sin variables de entorno nuevas**: `INSUMOS_RETENCION_HORAS` es opcional (default 48) y
`GOOGLE_DRIVE_INSUMOS_FOLDER_ID` ya estaba en producción desde el 25/07.

**Truco de verificación de despliegue**: usar un endpoint NUEVO como sonda
(`/api/carpetas-famosos` en este caso) en vez de `/api/health` — health responde 200 con el
build viejo también, así que no distingue "servicio vivo" de "código nuevo desplegado". Con la
sonda se confirmó el deploy a los ~40s.

**Verificado en producción**: el endpoint nuevo devuelve las 246 carpetas incluidas las creadas
hoy; `/api/canales` 200 (Drive + OAuth sanos); el `index.html` servido trae `btn-refrescar-carpetas`
y el `app.js` trae `refrescarCarpetas` y `nota-limpieza`. Staging sigue sano.

**Ojo**: producción y staging apuntan a la MISMA carpeta de insumos en Drive, así que el cron de
limpieza ahora corre desde los dos servicios. Es inofensivo (el segundo ya no ve lo que el primero
mandó a la papelera, y `listarSubcarpetas` filtra `trashed=false`), pero no confundirse si en los
logs aparece la limpieza dos veces.

**Pendiente**: el fix de `descargarVideo` de la Mac se estrena en producción sin haber sido
verificado e2e en Railway (ver su nota del 28/07). Si vuelve un `-22`, empezar por ahí.

### 2026-08-05 (Windows) — Limpieza automática de insumos en Drive a las 48h (IMPLEMENTADO)

**Problema**: las carpetas de insumos que crea cada job (`crearCarpetaInsumo`, con guion,
`audio.mp3`, `fragments.json`, `resultado.json`) nunca se borraban. Habían llegado a **117
carpetas / 1.17 GB**, la más antigua del 12/07. El caché local (`temp-videos/`) NO era el
problema: ya se limpia solo a la hora (`limpiarCache()` en `server.js`), eran 2.5 MB.

**Decisión del usuario**: retención de 48h. Razón textual suya: *"un audio en 48 horas pierde
toda vigencia sobre todo porque hago noticias"*. Acepta explícitamente el efecto secundario de
que retomar un job de más de 48h ya no pueda recuperar su locución desde Drive.

**Limpieza manual hecha en el momento**: 103 carpetas a la papelera (1164 MB), conservando las
14 de menos de 48h. **A la papelera, nunca borrado permanente** — recuperable ~30 días.
Verificado post-borrado que `Videos_Famosos_Carpetas` (246 carpetas), `renders` y `cache-estado`
quedaron intactos. ⚠️ Al verificar, Drive devolvió un conteo equivocado (94 en vez de 14) por
**consistencia eventual**: el índice tarda en reflejar los borrados. Re-medir un minuto después
da el número real — no asumir que algo salió mal por un conteo raro recién borrado.

**Código nuevo (rama `test-persistencia`)**:
- `limpiezaInsumos.js` (nuevo) — cron cada 6h, retención 48h configurable con
  `INSUMOS_RETENCION_HORAS`. Recorre canal → job dentro de `GOOGLE_DRIVE_INSUMOS_FOLDER_ID`.
  **Guarda de seguridad**: si esa raíz coincide con `GOOGLE_DRIVE_FOLDER_ID` (famosos),
  `GOOGLE_DRIVE_RENDERS_FOLDER_ID` o `GOOGLE_DRIVE_CACHE_FOLDER_ID`, aborta sin borrar nada y
  loguea el error. La primera pasada se demora 60s a propósito: `driveCache.restaurar()` está
  trayendo `jobs.json` al arrancar y pisaría las marcas si limpiáramos de inmediato.
- `drive.js` — `listarSubcarpetas(parentId)` y `enviarAPapelera(fileId)` (Service Account con
  fallback a OAuth).
- `jobStore.js` — `marcarInsumosLimpiados(carpetaIds)`: marca `insumosLimpiados` y borra el
  `driveLink` **solo si apunta a la carpeta de insumos**. En modo Video el `driveLink` apunta al
  render (carpeta del canal, que no se limpia) y se conserva — verificado en datos reales.
- `public/app.js` + `style.css` — nota en el historial explicando por qué ya no hay link.

**Reconciliación** (`reconciliar()` dentro del cron): marca también jobs cuya carpeta ya no
existe aunque la haya borrado otra cosa (limpieza manual, o el usuario desde Drive). Sin esto,
las 103 borradas a mano habrían dejado links muertos sin explicación en Railway para siempre.

**Verificado**: servidor arranca con el cron activo; las dos guardas abortan correctamente al
apuntar a famosos y a renders; `enviarAPapelera` probado con una carpeta descartable; pasadas
sucesivas son idempotentes; en el browser real se renderizan exactamente 2 notas (los 2 jobs
afectados) y el job de modo Video conserva su link a `renders`.

**Pendiente**: no se probó en Railway. Ojo que el `jobs.json` de cada entorno es independiente,
así que la reconciliación correrá por separado en producción y en staging la primera vez.

### 2026-08-13 (Mac) — Cartel de portada: UN solo dibujo (canvas → PNG), en vez de dos que se desincronizaban

**Reportado por el usuario** con dos capturas del mismo cartel: la vista previa del Paso 6 y el
video final NO coincidían. Distintos saltos de línea (`HACE EL FEO A JD / PANTOJA` en la previa vs
`HACE EL FEO A / JD PANTOJA` en el video) y distinto ancho de caja.

**Causa de fondo**: la geometría del cartel estaba escrita DOS veces —`portada.js` (servidor, que
la dibujaba con el filtro `ass` de libass) y `public/app.js` (el mockup, que la replicaba en CSS)—
con un contrato de "si cambiás allá, cambiá acá". Peor: los dos ESTIMABAN el ancho del texto con un
`factorAncho` promedio por tipografía en vez de medirlo, y una diferencia de un carácter por línea
cambia el corte, el tamaño de letra elegido y el ancho de la caja en cascada. Había al menos tres
caminos por los que podían separarse (tabla de `factorAncho` que se llenaba por fetch y caía a
0.62 si fallaba, redondeo del tamaño a la escala chica de la previa, y `white-space: pre-line` que
deja al navegador re-partir una línea). No se pudo determinar cuál de los tres causó ESTE caso sin
saber los ajustes exactos del usuario — y no hizo falta, porque el rediseño elimina los tres.

**Rediseño (propuesto por el usuario)**: el cartel se dibuja UNA vez, en el navegador, en un
`<canvas>` de 1080x1920 (el tamaño real del video, mostrado chico por CSS). Ese canvas ES la vista
previa, y `canvas.toDataURL()` da exactamente esos píxeles como PNG, que viaja en el cuerpo de
`/api/generate-video`. El server no redibuja nada: guarda el PNG y lo superpone con `overlay` en el
frame 0 del video y, después, sobre el fotograma que el usuario elija para el JPG. Los tres
(previa, video, JPG) son literalmente el mismo archivo — la divergencia dejó de ser posible.

- `public/app.js`: `dibujarCartel()` (caja redondeada por `arcTo`, anillo blanco, texto con sombra)
  + `exportarCartelPNG()`. El ajuste de línea usa `ctx.measureText()` — **desapareció la estimación
  `factorAncho`, que era la raíz del problema**. Borrado todo el bloque duplicado
  (`portadaEnvolver*`, `portadaAjustarTamano`, `pintarCartelMockup`, `FACTOR_ANCHO_POR_FUENTE`).
- `portada.js`: de 254 a ~50 líneas. Ya no construye ASS; solo superpone el PNG.
- `video.js`: el banner pasó de filtro `ass` encadenado a una ENTRADA más de ffmpeg con
  `overlay=0:0:enable='lt(n,1)'` (n = número de fotograma, así solo pinta el primero). `argsMux`
  ahora usa siempre `filter_complex`. **La escalera de degradación se mantiene** (cartel falla →
  video sin cartel; subtítulos fallan → sin subtítulos). Bonus: al entrar por `-i` desaparece el
  escapado de rutas del filtro.
- `server.js`: `guardarCartelPNG()` (valida y decodifica la data URL), `GET /api/cartel/:token`,
  límite de `express.json` subido a 8mb, y el PNG agregado al set de archivos protegidos de
  `limpiarCache()` — sin eso el TTL de 1h lo borraría antes de que el usuario elija el fotograma.

**Riesgo que apareció al verificar, y su arreglo**: al mover el dibujo al navegador, la tipografía
pasó a depender del CDN de Google Fonts. Si no carga, el canvas dibuja con una letra de reemplazo
—y AHORA eso se hornea en el video (antes no importaba: el server lo dibujaba con libass y el .ttf
real). Se agregó `GET /api/fuente/:clave`, que sirve el MISMO `.ttf` que el server ya descarga y
cachea para los subtítulos; el navegador lo carga con la API `FontFace`. Navegador y servidor
comparten el archivo exacto y no hay CDN de por medio. Si aun así falla, se muestra un aviso
visible (no se hornea otra letra en silencio) y **solo se cachean los éxitos**, para que un fallo
transitorio de red no deje la tipografía rota hasta recargar la página.

**Verificado local, con evidencia**:
- ffmpeg, los tres caminos: sin música, con música (el índice de entrada del cartel cambia), y el
  JPG. Muestreo de píxeles: frame 0 = rosa `fd2c67`, frames 1/2/5/30/60 = fondo. El cartel está
  SOLO en el primer fotograma.
- Alineación: justo dentro de los bordes de la caja hay rosa, justo afuera hay fondo → `overlay`
  no desplaza ni escala.
- Canvas en browser real: 1080x1920 internos, caja centrada en x=540 y borde superior en y=1114 =
  exactamente el 58% de 1920, 3 renglones de texto, PNG válido de ~167KB.
- `FontFace` contra `/api/fuente/anton`: carga y mide distinto al fallback (834 vs 803 px) → usa de
  verdad el archivo servido.
- `guardarCartelPNG()`: round-trip byte a byte idéntico; rechaza null/vacío/jpeg/basura.

**Ojo para la otra máquina**: este entorno (Mac) no tiene salida a internet, así que el server no
pudo bajar los `.ttf` reales y la prueba de tipografía se hizo con un archivo del sistema puesto a
mano en `temp-videos/fuentes/` (ya borrado). La cañería quedó probada, pero **la tipografía real
del cartel no se vio renderizada acá** — vale confirmarlo visualmente en staging.

**Pendiente**: probar en Railway. Ahí el riesgo específico es `overlay` (verificado presente en el
ffmpeg local, pero es exactamente la trampa que reventó con `geq`: funcionaba local y no estaba
compilado en producción). Si faltara, la degradación hace que el video salga sin cartel en vez de
fallar, pero habría que buscar otro camino.

### 2026-08-13 (Mac) — Secuela: el cartel no salía tras el deploy (pestaña vieja) + guarda para que no vuelva a pasar en silencio

Tras desplegar el cambio de arriba, el usuario generó un video en staging y **no salió el cartel,
ni apareció la opción de generar el JPG**.

**No era un bug del código nuevo.** Se reprodujo el flujo completo local con un render real (clips
de Drive, audio, `destFolder` a la carpeta `transicion`, después borrada): la respuesta trae
`cartelUrl`, el frame 0 del MP4 tiene el rosa del cartel (`ff4366`) y los frames 1/5/30 imagen
real, y `POST /api/portada` generó el JPG y lo guardó junto al video. La cadena entera funciona.

**Causa real**: la pestaña del navegador estaba abierta desde ANTES del deploy, así que corría el
`app.js` viejo — el que manda `portadaTitular/Fuente/Tamano/Caja` y no el PNG. El server nuevo
busca `efectos.cartelPNG`, no lo encuentra, y `guardarCartelPNG()` devuelve null. Resultado: video
sin cartel, sin `cartelUrl`, sin opción de JPG, y sin ninguna pista de por qué.

**Arreglado el modo de fallo, no solo el caso**:
- `server.js`: si el pedido trae `portadaTitular` pero no `cartelPNG`, es definitivamente un front
  viejo → 400 con el mensaje de recargar la página. Antes seguía y devolvía un video mudo.
- `public/app.js`: si hay titular escrito pero `exportarCartelPNG()` devolvió null, se avisa en el
  log en vez de seguir en silencio.

**Verificado** los tres casos por API: front viejo → el 400 con las instrucciones; front nuevo sin
titular (legítimo, no quiere cartel) → pasa; front nuevo con PNG → pasa.

**Para el usuario / la otra máquina**: si el cartel no aparece después de un deploy, recargar con
Cmd/Ctrl + Shift + R antes de buscar el problema en el código.

**Cierre de sesión 2026-08-13 (Mac) — qué queda por verificar en casa (Windows)**

Todo pusheado a `test-persistencia` (`7c578ec` + `0d883e8`, SHA local = remoto). Railway redeploya
staging solo. **Antes de probar: recargar con Ctrl + Shift + R** (ver la entrada de arriba).

Pendiente de confirmar en staging, en este orden:
1. Que la vista previa del Paso 6 y el cartel del video final ahora **coincidan** — que era el
   problema original que abrió todo esto.
2. Que el cartel se vea con la **tipografía elegida** y no con una de reemplazo. Es lo único que
   NO se pudo ver renderizado en la Mac (sin salida a internet, el server no bajaba los `.ttf`;
   la cañería se probó con un archivo del sistema puesto a mano, ya borrado). Si sale con otra
   letra, aparece un aviso en pantalla — no falla en silencio.
3. Que el filtro `overlay` exista en el ffmpeg de Railway. Es la trampa que reventó con `geq`
   (funcionaba local, no estaba compilado en producción). Si faltara, la degradación hace que el
   video salga sin cartel en vez de romperse, pero habría que buscar otro camino.

No tocado y todavía pendiente de antes: merge a `main` (producción sigue con el código previo a
este cambio).

### 2026-08-14 (Mac) — Música de fondo: -18dB → -20dB

El usuario escuchó la música muy alta en el resultado. **Medido antes de tocar nada**: el `-18dB`
sí se aplicaba (se replicó la cadena exacta de `prepararMusica()` con una pista real y dio -33.2
LUFS), y las 13 pistas del catálogo están parejas (-12.8 a -16.6 LUFS), sin ninguna anómala. Con
una locución real medida en -18.1 LUFS, la separación era de 15.1 dB — o sea, no había bug.

El ajuste es de gusto, con una razón concreta del usuario: la voz de ElevenLabs se atenúa -3.4dB
por venir saturada (`elevenlabs.js`), así que la música quedaba relativamente más alta de lo
pensado cuando se eligió el -18 original. Nuevo default **-20dB** → separación de 17.1 dB
(verificado con la misma medición).

**Ojo conceptual, anotado en el comentario de `prepararMusica()`**: esta ganancia atenúa el
ARCHIVO fuente, no se mide contra la voz — la etiqueta de la UI decía "-18dB bajo la voz", lo
cual era falso, y se corrigió a "-20dB" a secas. Con el catálogo actual alcanza porque está
parejo, pero una pista futura masterizada mucho más fuerte volvería a sonar alta con el mismo
número. Si vuelve a pasar, la solución de fondo es normalizar a LUFS (`loudnorm`) antes de
aplicar el offset, no seguir bajando el número.

**Cierre de sesión 2026-08-14 (Mac) — supersede el cierre del 2026-08-13**

Los tres puntos que el "Cierre de sesión 2026-08-13" dejaba por verificar **ya están todos
confirmados** en la entrada del 13 a la noche (Windows) — no volver a hacerlos:
1. Previa vs. video final: coinciden. ✔
2. Tipografía real (Anton, no de reemplazo) en el video. ✔
3. `overlay` compilado en el ffmpeg de Railway — NO era la trampa de `geq`. ✔

**Estado ahora**: `test-persistencia` en `4933cad`, todo pusheado (SHA local = remoto). Lo último
que entró (música a -20dB) todavía **no se escuchó en un video real** — es el único pendiente de
verificación de esta sesión, y es a oído, no medible: la medición ya se hizo (17.1 dB de
separación contra una locución real).

**Pendientes reales, en orden de peso**:
1. **Merge `test-persistencia` → `main`.** Producción sigue sin NADA de todo esto: ni Fases 1-8,
   ni portada, ni el fix de yt-dlp/TikTok, ni la música a -20. Es la brecha más grande abierta.
2. Desplegar `farandula-video-family` a Railway (repo aparte, nunca tuvo producción).
3. `decidirEfecto('intercalado', i)` en `video.js`: el espejo queda en TODOS los clips en vez de
   alternar (bug preexistente, documentado hace semanas, sin arreglar).
4. `getAngleName()` en `gemini.js` es código muerto — no se llama ni se exporta, y mapea sólo
   1-6 cuando la app tiene 7 ángulos. Sobrevivió al refactor de código muerto (`64f2359`).

**Recordatorio operativo**: tras cada deploy, recargar la pestaña con Cmd/Ctrl + Shift + R. Si no,
el server responde 400 pidiéndolo (guarda agregada en `0d883e8` justamente porque este error costó
una sesión entera de diagnóstico).

### 2026-08-16 (Windows) — Fix real de producción (offset-clamp en xfade) + portado masivo a `farandula-video-family`

**Fix de producción, este repo**: el usuario mandó un screenshot con "Generando video..." pegado
en 70% y `Output file does not contain any stream`. Root-caused con `railway logs` + reproducción
local: `seleccion.js` planifica el offset de cada clip contra `v.duracion` (metadata de Drive),
pero esa metadata a veces viene `undefined` — si offset+duración se pasa del final real del
archivo, `-ss`+`-t` de ffmpeg corta en SILENCIO un segmento más corto de lo pedido (sin error,
exit 0), y ese segmento roto tira abajo el filtro `xfade` (`matches no streams`) Y su fallback de
concat plano. Fix en `video.js` (`montarVideoPlan`): re-verificar offset+duración contra la
duración REAL del archivo ya descargado (ffprobe, cacheado por ruta) antes de cortar, corriendo
el offset hacia atrás si no cabe — nunca se acorta la duración pedida, solo cambia DE DÓNDE del
video sale. De paso, el wrapper `ffmpeg()` solo guardaba los últimos 500 caracteres de stderr
(cortaba el error real de un filter_complex largo) — subido a 4000. Verificado local reproduciendo
el caso exacto; pusheado a `test-persistencia` (`1d6efdd`, mergeado con música a -20dB de la Mac
sin conflictos) y confirmado en Railway con el mismo job que había fallado.

**Portado masivo a `farandula-video-family`** (mismo día, pedido explícito del usuario con
permiso abierto para las siguientes horas): ese repo estaba congelado en el estado PRE-Fase 7.
Se portaron transiciones xfade+TANDA, zoom ease-out, EL FIX DE OFFSET-CLAMP DE ARRIBA (mismo bug,
mismo día), y el cartel de portada completo (canvas→PNG, adaptado sin Drive-write). Música de
fondo se evaluó y quedó BLOQUEADA: el Service Account de Drive no tiene acceso a `Musica/` (solo
compartido con la cuenta OAuth), y compartir la carpeta con el Service Account vía API quedó
bloqueado por el clasificador de permisos del entorno (requiere que el usuario lo haga a mano
desde Drive). Subtítulos no se evaluaron para portar: necesitan timing por palabra que sale de la
alineación de ElevenLabs, que family no tiene. Detalle completo, verificación end-to-end y
pendientes reales en `farandula-video-family/.claude/CLAUDE.md` (archivo nuevo, ese repo no tenía
bitácora propia hasta ahora).

**Cierre 2026-08-16 (Mac) — supersede el cierre del 2026-08-14**

Revisado lo que entró de Windows (`5e09c19` offset-clamp, `cc66671` portado a family). Estado y
pendientes actualizados:

- La **música a -20dB** ya está mergeada (`1d6efdd`) y desplegada en staging. Sigue **sin
  escucharse en un video real** — es lo único de esa tanda que falta, y es a oído: la medición
  ya está hecha (17.1 dB de separación contra una locución real de -18.1 LUFS).
- El cierre del 14 listaba "desplegar `farandula-video-family`" como pendiente #2. Sigue
  pendiente, pero ahora ese repo tiene mucho más adentro (transiciones, zoom ease-out,
  offset-clamp, cartel de portada). Su bitácora propia está en
  `farandula-video-family/.claude/CLAUDE.md`.

⚠️ **Riesgo nuevo que conviene tener a la vista: código duplicado entre los dos repos.** El fix de
offset-clamp, las transiciones, el zoom ease-out y el cartel viven ahora en `video.js`/`portada.js`
de LOS DOS repos, copiados a mano. Es exactamente la forma del bug que costó esta semana: la
geometría del cartel estaba escrita dos veces y se desincronizó en silencio hasta que el usuario
notó que la previa mentía. Acá el riesgo es el mismo — el próximo fix en uno no llega al otro, y
nadie se entera hasta que falla en producción. No hay que resolverlo ya (family ni siquiera está
desplegado), pero **cada arreglo en `video.js` de este repo debería preguntarse si también va a
family**, y si la lista de duplicados sigue creciendo, vale la pena evaluar extraer lo compartido.

**Pendientes reales, en orden de peso** (sin cambios de fondo desde el 14):
1. **Merge `test-persistencia` → `main`.** Producción sigue sin nada: Fases 1-8, portada,
   yt-dlp/TikTok, música -20dB, y ahora también el offset-clamp — que es un fix de un crash REAL
   de producción. La brecha lleva abierta desde el 25 de julio y ya acumula un arreglo urgente.
2. Desplegar `farandula-video-family` a Railway.
3. `decidirEfecto('intercalado', i)`: espejo en TODOS los clips en vez de alternar (preexistente).
4. `getAngleName()` en `gemini.js`: código muerto, mapea 1-6 con 7 ángulos existentes.

### 2026-08-16 (Mac) — Nuevos valores por defecto del Paso 6

Pedido del usuario con dos capturas: dejar por defecto lo que venía eligiendo a mano en cada video.

| Opción | Antes | Ahora |
|---|---|---|
| Efecto zoom | Ninguno | **Intercalado (in/out)** |
| Intensidad zoom | 20 | 20 (sin cambio) |
| Efecto espejo | Ninguno | **Intercalado** |
| Transición entre clips | Ninguna (corte seco) | **Todos los cortes** |
| Tono de música | Automático | Automático (sin cambio) |
| Tipografía subtítulos | Anton | **Bangers** |
| Tamaño de letra | 264 pt | **210 pt** |
| Posición (MarginV) | 300 | **606** |

Tocados los DOS lados de cada valor, porque `public/app.js` avisa en un comentario que sus
defaults "tienen que calzar con TAMANO_DEFAULT/MARGIN_V de subtitulos.js": `public/index.html`
(atributos `selected`/`value`), `public/app.js` (`subsTamano`/`subsMarginV`/`subsFuente`) y
`subtitulos.js` (`TAMANO_DEFAULT`/`MARGIN_V`/`FUENTE_DEFAULT`).

**Dos cosas que conviene saber:**

1. **`FUENTE_DEFAULT` mueve DOS selectores.** Ese valor viaja por `/api/fuentes-subtitulos` y el
   frontend lo usa para preseleccionar tanto el select de subtítulos COMO el del cartel de
   portada. Ahora los dos arrancan en Bangers. Si se quisieran distintos, hay que separar el
   default (hoy es uno solo para ambos).
2. **MarginV 606 es una ESTIMACIÓN**, no un valor que el usuario haya dictado: se midió su
   captura calibrando contra la banda de "interfaz de TikTok" del preview (que es exactamente el
   15% del alto). Puede estar ±20. Se ajusta arrastrando la palabra y diciendo el valor nuevo.

**Ojo con la transición por defecto**: `xfade` no escala — con 58 clips en una sola cadena llegó a
+8GB de RAM (medido 2026-08-09), y por eso existe `TANDA_MAX=10`. Ahora TODOS los renders van a
usar transiciones, no solo cuando el usuario las pedía. Las tandas lo cubren, pero si aparecen
renders lentos o caídas en Railway con videos de muchos clips, este cambio de default es el primer
sospechoso.

**Verificado en browser local** (no solo en el código): con la app cargada, los 8 controles
devuelven exactamente los valores de arriba, incluido `subs-fuente` = `bangers` tras cargar el
catálogo por API, y la posición de la palabra reconvertida a MarginV da 606 clavado.

### 2026-08-16 (Mac) — Preview de subtítulos: canvas real 1080x1920 con cuadrícula y zonas seguras

Pedido del usuario: que el preview de subtítulos sea, como el del cartel, una estimación REAL de
1080x1920, con cuadrícula y las zonas que tapan TikTok / YouTube Shorts / Facebook Reels, "así
sabré exactamente dónde van a estar los subtítulos".

**Qué cambió**: `#subs-preview` era un mockup CSS de 202px de ancho (un `<div>` rosa con un `<span>`
posicionado por `bottom` en px escalados). Ahora adentro va un `<canvas>` dibujado a 1080x1920
reales (`dibujarPreviewSubs()` en `public/app.js`), y el CSS solo decide a qué tamaño se MUESTRA
(280px, más ancho que antes porque la cuadrícula a 202px era ilegible). Se borraron
`#subs-preview-word` y `#subs-preview-tiktok-zone`.

El canvas dibuja: cuadrícula 10x10 (tercios más marcados), el velo rojo de la UNIÓN de las tres
apps, una línea punteada por app en su color, las bandas laterales "SE CORTARÁ", la línea amarilla
de la posición elegida, y la palabra con su contorno negro (como el Outline 4 del Style del .ass).
Además el arrastre ahora agarra en CUALQUIER punto del recuadro (antes solo la palabra, que a ese
tamaño era un blanco muy chico) y la etiqueta muestra el MarginV numérico — antes no había forma
de saber ni comunicar el valor.

**Las medidas de las zonas** (`SUBS_ZONAS_APPS`, único lugar donde viven):

| App | arriba | abajo | derecha |
|---|---|---|---|
| TikTok | 181 | 292 | 174 |
| YouTube Shorts | 181 | 195 | 169 |
| Facebook Reels | 191 | 302 | 164 |

Más `SUBS_CORTE_LATERAL = 48` (banda "SE CORTARÁ", igual en las tres plantillas).

**Origen y límite de esas medidas**: salen de las plantillas oficiales de zona segura 9:16 que
pasó el usuario, midiendo cada imagen y calibrando su marco contra 1080x1920. La primera tanda de
valores que se usó era de referencia general y quedó descartada. **Siguen siendo aproximadas**:
±10px de error de medición, y las plantillas mismas cambian entre versiones de cada app y entre
modelos de teléfono. Son guía, no garantía al píxel.

**Diferencia honesta con el cartel de portada**: ese canvas ES el PNG que se superpone, así que
previa y resultado son idénticos por construcción. Acá NO: los subtítulos los quema libass desde
el `.ass`, con su propio motor de texto. La geometría (posición, tamaño, márgenes) es fiel; el
trazo exacto de cada letra puede variar un pelo. Está dicho en el `hint` de la UI, no solo acá.

**Verificado en browser local**: canvas interno 1080x1920, muestreo de píxeles confirma velo
arriba/abajo/derecha y banda lateral en su sitio, zona central limpia; se exportó la imagen y se
revisó a ojo (cuadrícula, líneas por app, palabra en Bangers con contorno); y el arrastre simulado
al 25% de la altura dejó MarginV en 480 (esperado 480) con la lectura en pantalla sincronizada.

**Cierre 2026-08-16 (Mac, segunda tanda) — supersede el cierre anterior del mismo día**

Todo pusheado (`c484f18`, SHA local = remoto). Lo que entró después del cierre anterior:
`ecc6864` (nuevos defaults del Paso 6) y `c484f18` (preview de subtítulos en canvas real).

**Sin verificar todavía, en orden de importancia** — nada de esto se pudo probar acá:

1. **Música a -20dB**: mergeada y desplegada, pero **nadie la escuchó todavía en un video real**.
   Es a oído: la medición ya está hecha (17.1 dB de separación contra una locución real).
2. **Zonas seguras del preview de subtítulos**: las medidas salen de las plantillas del usuario
   con ±10px, y las plantillas envejecen con cada versión de las apps. Conviene contrastar un
   video ya publicado contra el preview y, si algo no calza, ajustar `SUBS_ZONAS_APPS`.
3. **Transiciones por defecto en "todos los cortes"** (`ecc6864`): hasta ahora eran opt-in. `xfade`
   no escala — 58 clips en una cadena llegaron a +8GB de RAM (medido 2026-08-09), de ahí
   `TANDA_MAX=10`. Las tandas deberían cubrirlo, pero **si aparecen renders lentos o caídas en
   Railway con videos de muchos clips, este default es el primer sospechoso**.
4. **MarginV 606**: era una estimación medida de una captura. Ahora la UI muestra el valor
   numérico, así que se puede afinar y decir el número exacto.

**Pendientes reales, sin cambios de fondo**:
1. **Merge `test-persistencia` → `main`.** Producción sigue sin NADA: Fases 1-8, portada,
   yt-dlp/TikTok, música, offset-clamp (que arregla un crash REAL de producción), defaults nuevos
   y el preview de subtítulos. **La brecha lleva abierta desde el 25 de julio.**
2. Desplegar `farandula-video-family` a Railway.
3. Código duplicado entre los dos repos (ver el cierre anterior): al tocar `video.js` acá,
   preguntarse si el cambio también va a family.
4. `decidirEfecto('intercalado', i)`: espejo en TODOS los clips en vez de alternar (preexistente).
   **Ojo que ahora el espejo intercalado es el DEFAULT**, así que este bug pasó de teórico a
   afectar todos los renders.
5. `getAngleName()` en `gemini.js`: código muerto, mapea 1-6 con 7 ángulos existentes.

**Recordatorio operativo**: tras cada deploy, recargar con Cmd/Ctrl + Shift + R. Si no, el server
responde 400 pidiéndolo (guarda de `0d883e8`).

### 2026-08-17 (Windows) — Nota: `farandula-video-family` ya tiene subtítulos, con Whisper en vez de ElevenLabs

Sin cambios de código acá — solo referencia, porque toca directamente el riesgo de duplicación
que quedó anotado el 16. El usuario pidió una fuente de timing por palabra para family (el audio
lo sube el usuario, sin alineación de ningún proveedor de TTS) y se resolvió con OpenAI Whisper-1
en vez de Google Cloud STT (comparado costo/calidad con el usuario: Whisper gana en precio y en
simplicidad de setup). `subtitulos.js`/`seleccion.tiemposPorFragmento()` se portaron **tal
cual** — el único módulo nuevo de verdad es `tiempos.js` de family, que reemplaza la alineación
carácter-por-carácter de ElevenLabs por un match palabra-por-palabra contra la transcripción de
Whisper (misma forma de salida `{ duraciones, palabras }`, así que el resto de la cadena no sabe
ni le importa de dónde salió el timing). Detalle completo en
`farandula-video-family/.claude/CLAUDE.md`.

**Relevante acá**: al portar se encontró que `seleccion.js` de family llevaba semanas en una
versión vieja — sin `duracionesReales`/`clipMax` en `planificarClips()` ni `tiemposPorFragmento()`
— así que el wiring de `clipMax` para transiciones que se hizo el 16 en ESE repo nunca tuvo
efecto real (JS ignora argumentos de más en vez de fallar). Si `seleccion.js` cambia acá de nuevo,
vale la pena confirmar que family lo siga de cerca — es el ejemplo concreto del riesgo que ya
estaba anotado, no uno nuevo.

### 2026-08-18 (Windows) — Fix real de producción: `subirVideo()` tumbaba el servidor entero

Reportado por el usuario con un screenshot en vivo: "Generando video..." pegado en 70%, dos
`Error: HTTP 502` seguidos. NO era el timeout de gateway ya conocido — `railway logs` mostró un
crash real del proceso (`node:events... throw er; // Unhandled 'error' event`).

**Causa**: `drive.js: subirVideo()` crea el stream de subida con `fs.createReadStream(localPath)`.
Si el archivo ya no existe (visto real: `portada_<token>.jpg`, borrado por la política de
"conservar solo las 3 portadas más recientes" o por el TTL de `limpiarCache()`), el stream no
lanza al crearse — emite el ENOENT como evento `'error'` ASÍNCRONO recién al intentar abrir el
archivo, y `googleapis` no le pone listener a un stream que el llamador le pasa. Un `'error'` sin
listener en Node tira TODO el proceso, no solo el request — de ahí los dos 502 seguidos (el
contenedor se reinició dos veces, cortando a cualquiera con un request en vuelo, no solo al que
disparó el bug). El try/catch que ya rodeaba las 4 llamadas a `subirVideo()` (video final,
portada, insumos, locución) nunca llegaba a correr: un throw asíncrono sin listener no es lo
mismo que una promesa rechazada.

**Fix**: engancharle un listener de error al stream ANTES de dárselo a `googleapis`, corriendo la
subida en carrera contra ese error — un stream roto ahora rechaza la promesa (el try/catch de
cada llamador sí lo atrapa) en vez de crashear el proceso. Un solo cambio adentro de `subirVideo()`
arregla los 4 call sites a la vez, sin tocarlos.

**Verificado**: reproducido local el crash EXACTO (misma firma, byte por byte, que el log de
Railway) con un cliente de Drive falso que nunca resuelve, para aislar la carrera contra el error
del stream sin llamar a la API real. Con el fix, el mismo escenario rechaza limpio como promesa y
el proceso sigue vivo (confirmado esperando 2s después sin caerse). Commit `85c0ece`, pusheado a
`test-persistencia`, Railway redeployando.

**De paso, encontrado pero NO arreglado** (no crashea, solo deja de limpiar): el mismo log mostró
`🛑 Limpieza de insumos ABORTADA: la raíz de insumos es la misma carpeta que
GOOGLE_DRIVE_RENDERS_FOLDER_ID` — la guarda de seguridad de `limpiezaInsumos.js` está funcionando
como debe (aborta en vez de borrar algo que no debía), pero indica que
`GOOGLE_DRIVE_INSUMOS_FOLDER_ID` en el `.env` de este servicio de Railway probablemente esté mal
puesto (igual al de renders). Revisar las variables de entorno del servicio `adventurous-reflection`
en Railway.

### 2026-08-18 (Windows) — Investigado: subtítulos "a destiempo" — NO es código, es Gemini saturado

El usuario reportó, sobre un video real recién generado: "se dañaron los subtítulos... sale a
destiempo... como si de repente no importara la puntuación, sale de corrido, no toma pausas, la
voz se adelanta o se atrasa". Preguntó explícitamente si algo de lo tocado hoy (fix de
offset-clamp, fix del crash de `subirVideo`) rompió esto.

**Confirmado que NO**: ni `tiempos.js`, ni `elevenlabs.js`, ni la parte de subtítulos/marcas de
`gemini.js` se tocaron hoy ni ayer — el último cambio real en esa zona es del 8 de agosto (Fase 5).
Lo único de ayer/hoy en subtítulos fueron los DEFAULTS visuales (Bangers/210pt/606, commit
`ecc6864` de la Mac), que no tocan el cálculo de tiempos.

**Diagnóstico con datos reales**: se ubicó el job real vía `GET /api/jobs/:jobId` contra el
servidor de Railway (ojo: el `job_<timestamp>` que aparece en los logs de ffmpeg es el `renderId`
efímero, NO el `jobId` persistente — el real es el UUID que aparece antes, ej. en la línea
`♻️ Audio recuperado desde Drive: <uuid>`). El log de ESE render nunca imprime
`⏱️ Usando tiempos reales de la locución` — confirma que cayó al reparto estimado por % de
caracteres en vez de la alineación real de ElevenLabs (exactamente lo que describe el usuario: sin
timing real no hay pausas de puntuación de verdad).

**Por qué cae la alineación**: `agregarMarcas()` (Gemini) corre justo ANTES de mandarle el texto a
ElevenLabs; si el texto que vuelve no calza carácter por carácter con el original, el matching
estricto de `tiempos.alinearFragmentos()` aborta y cae al estimado (Regla de robustez: nunca
rompe el render, solo degrada el timing). Se intentó reproducir LOCAL con el guion real de ese job
(vía script en el scratchpad, `agregarMarcas` + `generarConTiempos` + `alinearFragmentos` reales)
3 veces seguidas — las 3 Gemini devolvió `503 UNAVAILABLE: This model is currently experiencing
high demand` en TODA la cadena de modelos, confirmado también con un `curl` directo a la API
(no es un problema del código ni de la key: la MISMA key respondió bien a una llamada simple
minutos después). `503` es la señal de Google de "mi infraestructura está saturada", distinto de
un `429` de cuota propia — así que no parece ser "se acabó el límite de la cuenta", sino Gemini
mismo teniendo un mal momento del lado de Google.

**Conclusión**: no hay fix de código que hacer acá — es un fallback existente (desde Fase 5,
nunca tocado) disparado por inestabilidad externa de Gemini, agravada probablemente por el
volumen alto de llamadas de hoy (las pruebas de esta sesión + tráfico real del usuario, misma key
compartida). Debería autoresolverse cuando baje la demanda en Gemini. **Sin verificar**: no se
pudo confirmar el camino feliz (alineación exitosa) hoy porque Gemini no dejó de saturarse durante
toda la investigación — pendiente reintentar cuando el usuario note que Gemini responde normal, y
confirmar que un video nuevo sí trae `⏱️ Usando tiempos reales` en el log.

**Cierre 2026-08-18 (Mac) — supersede los dos cierres del 2026-08-16**

Bajado y revisado todo lo que entró de Windows desde entonces: el crash de `subirVideo`
(`85c0ece`), la feature de **material adicional** (`d4ad694`) y sus dos fixes de producción
(`7799694` cita truncada, `1dbd7d1` durabilidad + espejo en fotos), más la investigación de los
subtítulos desfasados (`624a24a`). Nada nuevo de la Mac desde `c484f18`.

**Cómo cambió el cuadro** (importa para decidir el merge a `main`):

- **Van CUATRO fixes de crashes/bugs reales de producción en tres días**, todos encontrados por el
  usuario usando la app, ninguno por tests: offset-clamp (xfade), `subirVideo()` (tumbaba el
  proceso entero, no solo el request), cita truncada 25s, y material que se perdía entre subir y
  renderizar.
- **Feature nueva grande**: material adicional por fragmento (cita con audio real / foto / video
  de apoyo), con `materiales.js` nuevo y cambios en gemini/tiempos/seleccion/video/server.
- **Los subtítulos "a destiempo" NO eran un bug**: Gemini devolviendo 503 por saturación hace caer
  `alinearFragmentos()` al reparto estimado por caracteres. Degrada, no rompe. **Si vuelve a
  pasar, no buscarlo en el código.**

**Sin verificar todavía** (nada de esto se pudo probar en la Mac):

1. **Música a -20dB** (`4933cad`): desplegada, nadie la escuchó aún en un video real. Es a oído;
   la medición ya está hecha (17.1 dB de separación contra una locución real).
2. **Zonas seguras del preview de subtítulos** (`c484f18`): ±10px, medidas de las plantillas del
   usuario. Contrastar contra un video publicado y ajustar `SUBS_ZONAS_APPS` si no calza.
3. **Transiciones por defecto en "todos los cortes"** (`ecc6864`): eran opt-in hasta el 16.
   `xfade` no escala (58 clips = +8GB RAM, medido 2026-08-09; de ahí `TANDA_MAX=10`). Si aparecen
   renders lentos o caídas con videos de muchos clips, es el primer sospechoso.

**Pendientes reales**:

1. **Merge `test-persistencia` → `main`.** Producción sigue sin NADA de lo acumulado — y eso ya
   incluye **cuatro fixes de bugs reales que el usuario sufrió en vivo**. Cada día que pasa, la
   versión que usa a diario es la que los tiene todos. **Abierta desde el 25 de julio; es el
   riesgo más grande del proyecto, por encima de cualquier feature nueva.**
2. Desplegar `farandula-video-family` a Railway.
3. Código duplicado entre los dos repos: al tocar `video.js`/`drive.js` acá, preguntarse si el
   cambio también va a family. **El fix de `subirVideo` es justo de los que aplican a los dos.**
4. `decidirEfecto('intercalado', i)`: espejo en TODOS los clips en vez de alternar. **Ya no es
   teórico: "intercalado" es el default del espejo desde `ecc6864`.**
5. `getAngleName()` en `gemini.js`: código muerto, mapea 1-6 con 7 ángulos existentes.

**Recordatorio operativo**: tras cada deploy, recargar con Cmd/Ctrl + Shift + R (guarda de
`0d883e8`). Y ojo con los redeploys mientras el usuario tiene material subido — ese fue justo el
caso de `1dbd7d1`.

### 2026-08-24 (Mac) — Gemelos con sesgo OPUESTO en el motor `grafo`

Pedido del usuario: "si una noticia está a favor del protagonista, en la otra está en contra, así
los canales presentarán ángulos distintos". Decidido con él: **elige a favor o en contra en el
Paso 1 y el gemelo toma el contrario**; con `neutral` no hay postura que invertir y queda como
antes. **Solo el motor `grafo`** (decisión suya) — el de siempre sigue con gemelos del mismo sesgo.

**Dónde se tocó y por qué ahí**: el sesgo NO vive en el guion, vive en la CRÓNICA
(`sintetizarCronica(actas, sesgo)`), así que basta con darle al gemelo una crónica distinta. Y es
barato: las actas son sesgo-independientes y ya quedaron cacheadas en `job.fuentes` desde la
lectura, así que re-sintetizar **no vuelve a descargar ni releer la fuente original** — es
exactamente el caso que anticipaba el comentario de `PROMPTS.acta`.

`server.js`: dos helpers nuevos (`sesgoOpuesto()`, `cronicaConSesgo()`) y el wiring dentro del
bloque `if (gemela)` de `/api/generate-script`. El título/descripción del gemelo se generan con SU
crónica, no con la del primero: si toma la postura contraria, el texto del post tiene que
acompañarla. Se guarda `gemela.sesgo` para que quede registro de con qué postura salió.

**Degradación** (Regla de robustez): si no hay actas guardadas o falla la re-síntesis, el gemelo
usa la crónica del primero y sale como antes — avisa por log, nunca se pierde el video.

**Verificado con Gemini real**, misma acta → dos crónicas: a favor da "se vio obligada a cancelar",
"severa e imprevista afección"; en contra da "público engañado y atrapado", "la versión oficial
alegó". Protagonista bien detectado en ambas y títulos acordes a cada postura. (De paso: la
llamada pegó 503 y la cadena de fallback cayó sola a `gemini-3.5-flash` — funcionando como debe.)

**Corregido de paso**: el texto de la UI decía "mismos hechos y mismo ángulo", que con esto pasaba
a ser falso. Ahora explica la condición (motor por estructura + sesgo no neutral).

**Sin probar de punta a punta**: no se generó un par de videos gemelos completo con esto. Lo
verificado es la inversión y que las crónicas salen opuestas.

### 2026-08-24 (Mac) — Auditoría del volumen de música: nada roto, pero el default quedó 2 dB alto

El usuario: "me parece que el último video que hizo el volumen estaba muy alto". Se auditó todo el
sistema de emparejado antes de tocar nada.

**Lo que está BIEN** (verificado, no supuesto):
- **Las 26 pistas están etiquetadas** y las 26 etiquetas son **exactas**: se re-midió cada archivo
  con `medirLoudness()` (mismo offset que usa `prepararMusica`) y se comparó contra su `[lufs=]`.
  Diferencia: 0.0 dB en las 26. Cero discrepancias.
- **El emparejado funciona**: en la cadena real, las pistas extremas (-13.2 y -17.0 LUFS) terminan
  en -34.1 y -34.3 → **0.3 dB de dispersión**, contra los 3.8 dB de origen. Sobre las 26, la
  dispersión aritmética da 0.0 dB.
- **El control manual funciona**: mover el slider mueve el nivel general sin reabrir la dispersión.

**Lo que estaba mal — el nivel general, no el mecanismo**: el default era `-18`, que deja la música
en **-34.1 LUFS** (medido en render real). El nivel que el usuario había aprobado el 2026-08-14 era
`-20` → **-36.1 LUFS**. O sea, venía sonando **2 dB más alto que lo aprobado**, y por eso lo notó.

**Por qué pasó**: cuando entró el emparejado por LUFS se volvió a -18 razonando que el problema
eran solo las pistas que se salían del promedio. Es cierto para la DISPERSIÓN, pero el número
también fija el nivel general, y volver de -20 a -18 lo subió 2 dB. Las dos cosas son
independientes: el emparejado da 0.3 dB de dispersión con cualquiera de los dos números.

**Cambio**: `GANANCIA_DEFAULT_DB` de -18 a **-20** (`musica.js`), más el default del slider
(`public/index.html`) y su fallback (`public/app.js`) para que los tres digan lo mismo. La historia
del número quedó escrita en el comentario de la constante, porque ya se movió dos veces y conviene
no repetir la vuelta.

**Separación resultante**: música ~-36 LUFS contra voz -18.1 LUFS ≈ **18 dB**, igual que lo que el
usuario ya había aprobado.

**Sin verificar**: no se generó un video completo con el default nuevo — la medición es de la
cadena real de `prepararMusica()`, no de un render de punta a punta. Falta el oído del usuario.

### 2026-08-25 (Mac) — Diseño: variedad de guiones y escudo antibloqueo (SIN código todavía)

Conversación de diseño, a pedido del usuario ("responde, no escribas código todavía"). Queda acá
porque son decisiones y búsquedas ya hechas: repetirlas cuesta tiempo y tokens.

**1. Gemelos del motor `grafo` se parecen en neutral.** El usuario: "solo parecen parafraseado".
Causa: la estructura cambia el ORDEN en que se cuenta, no QUÉ se cuenta. Con sesgo neutral los dos
gemelos comparten la misma crónica — mismos hechos, mismo énfasis, mismo encuadre — así que
parafraseo es el techo. `elegirEstructura()` ya obliga a nombrar la estructura del hermano y a
abrir desde otro grupo del catálogo, y aun así no alcanza, porque mueve el envase.
**Dos palancas**: (a) débil — imponer en CÓDIGO la exclusión del grupo del hermano en vez de
pedírselo al modelo; (b) fuerte — cambiar de qué habla cada video, que vive en la crónica. **Eso ya
está construido** (sesgo opuesto, `970c698`) pero apagado en neutral por decisión del usuario.
Recomendación pendiente de su respuesta: que neutral reparta favor/contra entre los gemelos.

**2. Repetición de frases — CAUSA ENCONTRADA, es literal.** El usuario notó "le salió el tiro por
la culata" repetido. La regla 5 de `PROMPTS.guion` trae CUATRO ejemplos fijos: *"lo hundió",
"quedó expuesto", "se le cayó la mentira", "la jugada le salió mal"*. El modelo los copia en vez
de inspirarse. Segunda fuente: `guionEvitar` solo compara contra el gemelo del MISMO job — entre
noticias de días distintos no hay memoria de qué frases ya salieron.
**Solución acordada**: glosario durable + **rotación** (mostrarle 5-8 al azar por llamada, no el
catálogo entero — si no, se repiten 200 en vez de 4 y suena a recetario) + **memoria entre videos**,
reusando el patrón de `historial.json` que ya rota clips por famoso.

**3. Jerga actual: DESCARTADA por el usuario, con razón.** Se investigó (agosto 2026: "farmear
aura", "six seven", "sigma", "lache"). Dos problemas: vida útil de meses, y **no son neutras** —
"six seven" viene de un rapero de EE.UU., "lache" es caló. Chocan con el requisito del usuario de
no confundir a ningún público. Su conclusión: *"puede ser una piedra en el zapato a futuro"*.
⚠️ **Y una trampa en las fuentes**: los listicles de "frases virales para TikTok" están llenos de
engagement bait ("nadie habla de esto", "no vas a creer") que el propio prompt ya prohíbe Y que
TikTok penaliza con menos alcance. **No construir el glosario desde ahí.**

**4. Minar los videos viejos: DESCARTADO, y el usuario tiene razón.** Se propuso sacar el glosario
de los guiones que funcionaron. Su objeción: *"queda corto, porque estaba encerrado en pocas frases"*
— o sea, la muestra está contaminada por el mismo problema que se quiere arreglar. Aprender de ahí
reforzaría el pozo. **El registro arranca desde cero, curado, y la retroalimentación empieza ahora.**

**5. Dónde va el informe de rendimiento: la HOJA DEL PUBLICADOR** (`55b1446`), que ya tiene una fila
por video con `Publicado el` y `Link del post` — el usuario ya vuelve a esa fila después de publicar,
así que una columna nueva se cuelga de un hábito existente. Como guarda el `jobId`, cada fila queda
atada a su guion. **Advertencia dicha al usuario**: con guiones de 200 palabras, atribuirle el éxito
a una frase es estadísticamente débil por mucho tiempo — sirve para SU criterio, no para que el
sistema aprenda solo.

**6. Escudo antibloqueo de TikTok.** El usuario reportó que **le borraron un hashtag**.
- **No existe lista oficial de palabras prohibidas.** Se buscó; TikTok no publica una. Las que
  circulan son inferencia de creadores. **No codificar folklore.**
- Lo que SÍ es oficial y pega en farándula: afirmaciones no verificadas sobre personas reales,
  acusaciones de delito como hecho, acoso, y engagement bait (baja alcance por sí solo).
- **Fuga concreta**: los hashtags salen del prompt `lectura` ("exactamente 5 hashtags estratégicos")
  — Gemini los inventa **sin ninguna lista de qué es seguro** y nadie los revisa.
- **El filtro fuerte NO es de palabras, es de AFIRMACIONES**: "le fue infiel" vs "habría sido
  infiel, según X" usan casi las mismas palabras y tienen riesgo distinto. Atribuir y matizar
  protege sin apagar el tono.
- **Dónde iría**: una pasada de revisión sobre el guion TERMINADO, común a los dos motores, no
  parcheando cada prompt (tres lugares que se desincronizan — el patrón que ya costó caro con la
  geometría del cartel).
- ⚠️ **Riesgo estructural que ninguna lista cubre**: los videos usan voz sintética (obligación de
  declarar IA desde 2026) y clips de terceros (puntaje de contenido original). Es de otra
  naturaleza; el escudo debería contemplarlo como capa aparte.

**ORDEN ACORDADO** (cambiado sobre la marcha: el escudo subió al primer puesto porque un video
bloqueado vale CERO y los strikes se acumulan, mientras que uno repetitivo igual funciona):
1. Escudo antibloqueo — empezando por hashtags y título/descripción, que es donde ya dolió.
2. Columna de rendimiento en la hoja del publicador — chica, y cuanto antes arranque más datos junta.
3. Registro durable de frases con rotación y memoria.

**BLOQUEADO ESPERANDO AL USUARIO**: qué hashtag le borraron. Cambia el diagnóstico — temático
(los hashtags salen del ángulo picante de la crónica), restringido conocido (alcanza una lista de
exclusión), o genérico sobreusado (puede no ser castigo sino saturación).

**Corrección al punto 6 (2026-08-25, mismo día)**: la entrada de arriba quedaba "bloqueada
esperando al usuario" sobre qué hashtag le borraron. **TikTok no se lo dijo** — no hay aviso. Dos
consecuencias:

- **Se puede averiguar igual con datos propios**: la hoja guarda por video `Descripción + Hashtags`
  (lo que generó la app, con los 5) y `Link del post`. Comparar una contra el caption vivo da el
  que falta.
- **Eso generaliza a algo MEJOR que una lista negra adivinada**: como las dos columnas existen para
  todos los videos, el sistema puede detectar las bajas solo y armar una lista de exclusión **con
  evidencia real de esta cuenta**, en vez de folklore de foros. La parte cara es leer el caption
  vivo (puede pedir sesión del usuario o pegado a mano); el mecanismo sirve igual manual.
- **Y NO bloquea el escudo**: el grupo de hashtags peligroso se deduce del mismo principio de
  afirmaciones — `#infiel`, `#estafadora`, `#mentirosa` acusan a una persona real con su nombre al
  lado. Lo seguro es descriptivo: famoso, tema, marca del canal. Aparte, los mega-tags genéricos
  (`#parati`) no acusan pero son señal de engagement bait.

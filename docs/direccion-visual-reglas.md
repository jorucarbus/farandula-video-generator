# Reglas para dirigir escenas verticales sin plantilla

Este informe propone un reglamento operativo para dirigir escenas y distribuir información en pantalla en videos verticales 9:16 de noticias y chismes de 45-75 s. El flujo es guion, luego dirección de escena con la escalera de cobertura (toma real exacta, toma real relacionada, recreación 3D sin rostro en Blender, gráfica, genérico) y al final graficación. La conclusión central es que **la evidencia dura sobre estos parámetros es escasa y las cifras de ritmo, zonas seguras y tamaños son casi todas heurísticas de blogs o inferencias**. Lo que sí tiene respaldo sólido es lo cualitativo: quitar lo que no aporta (coherencia, tamaño de efecto de Mayer de ~0,86), señalizar lo importante, usar posición y longitud para comparar datos, no pasar de unos 20 caracteres por segundo en subtítulos y escribir el guion para la imagen en vez de repetirla. Las cifras concretas de abajo (cambio visual cada 2,5-4 s, cifra héroe de 160-220 px, caja segura de 780 px de ancho) son puntos de partida a validar con la retención de YouTube Studio del propio canal; el plan de calibración de la sección 6 sirve para eso. La variedad anti-plantilla debe ser sobre todo cosmética (paleta, tarjeta, esquema, transición), pero las políticas de YouTube exigen además variación sustantiva (guion, ángulo, fuentes distintas), así que variar el "disfraz" visual no basta. **Huecos declarados**: no se pudo acceder a hilos reales de Reddit, Hacker News, Skool ni Discord (todo lo "de comunidad" es de blogs de proveedores) y los tiempos de render de Blender no están medidos. Todo el informe está en español neutro.

## Convención de etiquetas

Cada regla lleva una etiqueta. **HECHO VERIFICADO** significa que hay un estudio con método, una documentación oficial o una política publicada, con enlace. **OPINIÓN/ANECDÓTICO** significa blog, proveedor, tutorial o heurística de oficio sin método. **INFERENCIA** significa que la deduje yo de lo anterior y no la mide ningún estudio. Cuando un hecho verificado viene solo de un resumen de buscador, las notas fuente lo dicen y aquí se indica como "verificado con reserva".

## 1. La escalera de cobertura decide por necesidad visual, no por gusto

### Qué respalda la escalera

No existe un estándar escrito de jerarquía de cobertura; es consenso de oficio. El material que prueba pesa más que el que ilustra: el archivo dice "esto ocurrió" y el B-roll dice "de esto estamos hablando" (OPINIÓN, [Fiveable](https://fiveable.me/documentary-production/unit-12/narrative-structure-documentary-editing/study-guide/ImaHZdcuYc8nDo5i)). La pedagogía de noticiero repite dos reglas: no decirle al espectador lo que ya ve y evitar el "wallpaper video", imagen que no corresponde a la frase (OPINIÓN, [UEN Pressbooks](https://uen.pressbooks.pub/writingforelectronicmedia/chapter/vos/); [Poynter](https://www.poynter.org/?p=433453)). La queja más repetida sobre B-roll es lo genérico (un blog que resumió 17 hilos de Reddit: 5 de 17 hablaban de stock, [Vidrush](https://vidrush.ai/blog/what-is-b-roll)). Walter Murch ordena los criterios de corte con emoción 51 %, historia 23 %, ritmo 10 % y eye-trace 7 % ([StudioBinder](https://www.studiobinder.com/blog/walter-murch-rule-of-six/)), aunque hay críticas de que en video online rápido el eye-trace pesa más ([NoFilmSchool](https://nofilmschool.com/2018/08/editing-eye-trace-mind-rule-six-incorrect)). Por eso la escalera ordena por poder probatorio más coincidencia semántica con la palabra clave, y una toma correcta en significado puede relajar reglas de continuidad.

Sobre recreaciones, la norma institucional es usarlas solo para transmitir información factual, etiquetarlas claramente y no hacerlas pasar por archivo (política BBC citada en [Leveson](https://discoverleveson.com/evidence/Exhibit_BBC23/7039/media), versión antigua no confirmada como vigente; Channel 4 exige etiqueta en pantalla durante todo el uso de reconstrucciones sintéticas, [Channel 4](https://www.channel4.com/4producers/working-us/ai-guidelines)). YouTube pide divulgar contenido sintético que parezca realista y no exige divulgar lo claramente irreal ([YouTube Help](https://support.google.com/youtube/answer/14328491)); TikTok exige etiquetar contenido realista generado por IA ([Search Engine Land](https://searchengineland.com/tiktok-new-label-ai-generated-content-432127)). Un maniquí de arcilla hecho a mano en Blender probablemente queda fuera de esas reglas, pero eso es INFERENCIA; las políticas se escribieron para IA, no para 3D manual.

### Reglas de decisión (numeradas)

**R1. Orden fijo.** Para cada frase del guion, la dirección etiqueta una necesidad visual y recorre los escalones 1 a 5 hasta el primero que alcance confianza suficiente. Escalones: 1 toma real exacta, 2 toma real relacionada del mismo evento, 3 recreación 3D sin rostro, 4 gráfica, 5 genérico. Etiqueta INFERENCIA (síntesis propia de las notas, sin validación empírica).

**R2. Desempate.** Si dos candidatos empatan en escalón, gana el que cambie escala o tipo de plano respecto al anterior. INFERENCIA.

**R3. Escribir al video.** Si la frase aporta lo que la imagen no puede mostrar, se permite una imagen de contexto o mantener el plano anterior; no se cubre cada palabra con imagen literal. OPINIÓN de oficio de noticiero.

**R4. El genérico es último recurso y tiene tope.** Si nada alcanza confianza, mantener el plano activo no más de ~4 s o pasar a gráfica de texto, nunca a B-roll de relleno. INFERENCIA.

**R5. Nunca sustituir un rostro.** No usar el rostro de otra persona como sustituto de una persona nombrada. INFERENCIA editorial.

**R6. Recreación siempre etiquetada.** Toda escena 3D lleva una etiqueta fija en pantalla durante todo el plano ("Recreación ilustrativa"), con bandera `es_recreacion=true` por plano y estilo claramente artificial (nunca grano ni blanco y negro de archivo); además el aviso va en la descripción. Etiquetado en pantalla por política de Channel 4 (HECHO VERIFICADO como política de emisora); la bandera y el texto exacto son INFERENCIA. No se usa la recreación como prueba de un hecho disputado.

**R7. Límite de 3 s por clip real.** Se respeta la regla del usuario (uso legítimo); no se añade aviso legal.

### Escalera por tipo de necesidad

| Necesidad | 1 Real exacta | 2 Real relacionada | 3 Recreación 3D sin rostro | 4 Gráfica | 5 Genérico |
|---|---|---|---|---|---|
| Persona nombrada | Clip o foto de esa persona en el hecho | Foto de archivo con pan/zoom lento, recorte aislado, captura del post o titular con atribución | Maniquí sin rostro con prop identificable (solo si la acción es conocida) | Rótulo de nombre/lower third | Solo plano de reacción (manos, multitud) |
| Lugar | Clip del sitio | Foto del lugar; vista de lugar del mismo tipo (marcada referencial) | Escenario 3D simplificado | Mapa o rótulo de ubicación | Vista aérea o stock del mismo tipo |
| Acción concreta | Material del evento | Reacciones, público, escenario del mismo evento | Maniquí ejecutando la acción con prop | Texto de la acción | B-roll con transición suave |
| Cifra o dato | Captura del documento con el dato resaltado | Imagen relacionada con número superpuesto | Prop 3D que lleve el número (trofeo, caja) | Cifra héroe o gráfica simple | Ninguno (mantener plano) |
| Cita textual | Audio o video de la persona (máx. 3 s) | Captura del post o entrevista | Maniquí con globo de cita (solo si el guion lo cita) | Tipografía de la cita sobre recorte | Mantener plano |
| Concepto abstracto | Documento, titular o comentarios reales del caso | Imagen simbólica concreta del caso | Metáfora 3D específica (balanza, hoja que cae) | Diagrama simple | Mantener plano anterior |
| Emoción o valoración | Plano de reacción real coherente | Detalle o inserto expresivo | Muñeco protagonista que reacciona (según la regla del proyecto: reacciona, no narra) | Texto o emoji de reacción | Música o silencio sin cambio de imagen |

Esta tabla es INFERENCIA construida con las reglas de oficio citadas; ninguna fuente publica una taxonomía de necesidades visuales. Dos cautelas de las notas: la cifra de "~40 % del tiempo con B-roll" sale de un test de un solo creador ([Opus.pro](https://www.opus.pro/blog/does-b-roll-increase-watch-time)) y solo es orientativa, y en afirmaciones clave o líneas emocionales conviene volver a la fuente principal ([PremiumBeat](https://www.premiumbeat.com/blog/b-roll-video-edit-guide)).

## 2. Cuatro esquemas de pantalla con zonas seguras que no tienen cifra oficial

### Zonas seguras: lo que se sabe y lo que no

Ninguna plataforma publica zonas seguras oficiales en píxeles para contenido orgánico. La medición más concreta es de la plantilla de anuncios In-Feed de TikTok, escalada a 1080x1920: 240 px arriba, 660 px abajo, 120 px a los lados y columna de iconos de 180 px a la derecha ([ManyPixels](https://www.manypixels.co/blog/social-media-design/tiktok-ad-specs), tercero, medida el 11-nov-2026). Otros verificadores dan abajo 330, 480 o 660 y arriba 130-240, es decir, no hay consenso. Meta publica para anuncios en Reels 14 % arriba, 35 % abajo y 6 % a los lados (≈269/672/65 px), pero esas cifras vienen de terceros y no se confirmaron en documento oficial ([Sirency](https://www.sirency.com/blog/instagram-reels-safe-zone)). Para Shorts solo hay cifras de terceros (~984x1500 px, ~300 px inferiores, [Kapwing](https://www.kapwing.com/video-editor/youtube-shorts/safe-zone)). La esquina inferior derecha es la más peligrosa en todas ([Blitzcut](https://blitzcutai.com/blog/best-caption-placement-short-form-video)). Todas son guías de producción y hay que previsualizar en el teléfono ([Reap](https://reap.video/blog/short-form-video-safe-zones)).

**R8. Dos cajas.** Caja conservadora (publicar en las tres plataformas sin probar): x 120-900 y y 250-1260 (la franja inferior sigue los 660 px de TikTok ads). Caja estándar: x 120-900 y y 250-1400 (propuesta de las notas, que cita guías de "Y 220 a 1440"). Se usa la conservadora por defecto y la estándar solo si la prueba en teléfono la confirma. Los fondos y escenas sangran a pantalla completa; la regla aplica a texto, cifras, rostros y logos. INFERENCIA apoyada en los datos de terceros anteriores.

**R9. Columna derecha libre.** Nada importante en x > 900 (columna de iconos de ~180 px). Cuando haya fila de iconos más ancha en una plataforma, mandan 180 px. HECHO VERIFICADO como medición de terceros.

### Los cuatro esquemas

Ningún esquema tiene fuente que lo valide con datos de retención. Sí hay evidencia indirecta: la pantalla dividida cambia dónde mira el espectador sin cambio significativo en el recuerdo inmediato ([iMotions](https://imotions.com/blog/publications/short-form-videos-an-exploratory-study-on-the-impact-of-subtitles-and-asmr-split-screen-format-options-using-eyegaze-and-facial-expression-data/)), y en un preprint (N=75 y N=100, no revisado por pares) no hubo efecto fuerte en memoria ni en carga autorreportada, con algo menos de interés ([OSF](https://sciety.org/articles/activity/10.31234/osf.io/wumxc_v1)). La proximidad es un principio de agrupación muy fuerte que puede dominar sobre color o forma ([NN/g](https://www.nngroup.com/articles/gestalt-proximity/)), y los fondos con mucho movimiento atraen la mirada y hacen perder el primer plano ([Tubefilter](https://www.tubefilter.com/?p=195003)).

| Esquema | Estructura (1080x1920) | Cuándo | Cuándo no | Subtítulos |
|---|---|---|---|---|
| A. Escena completa con dato superpuesto | Toma o recreación a pantalla completa; una cifra o etiqueta dentro de la caja; oscurecer 30-50 % si hay poco contraste | Imagen protagonista, una sola cifra o etiqueta | Imagen cargada o varias cifras | Franja y≈1050-1250 |
| B. Pantalla dividida | Escena arriba (~55-60 % del alto útil), dato o gráfica abajo; tramo 1400+ solo relleno | Comparar escena y dato sostenido varios segundos | Si el alto útil (~1100 px) no alcanza o no caben subtítulos | Sobre la línea de corte o dentro del panel de datos |
| C. Tarjeta flotante | Caja redondeada centro-superior (y≈300-800) sobre escena visible | Nombre, cita o cifra de 2-4 s con la escena viva | Si compite con rostros o subtítulos | Franja inferior fija |
| D. Dato a pantalla completa | Cifra gigante sobre fondo plano | Golpe de la noticia, 1-2 s | Datos que necesitan contexto; no encadenar más de 1-2 | Opcional, abajo |

Los esquemas son INFERENCIA. **R10. Un solo bloque dominante.** Una sola cifra o gráfica protagonista por escena, con los subtítulos en su franja fija.

### Subtítulos y texto en pantalla

Los subtítulos de este flujo son una excepción razonable al principio de redundancia de Mayer, que es el más débil (tamaño de efecto ~0,10, 8 de 12 pruebas, según un resumen de buscador, verificado con reserva, [UNH](https://www.unh.edu/teaching-learning-resource-hub/sites/default/files/media/2023-06/itow-research-based-principles-for-designing-multimedia-instruction-mayer.pdf)). Hay evidencia con eye-tracking de que a 12, 20 y 28 caracteres por segundo la comprensión baja al subir la velocidad ([Szarkowska et al.](https://www.cambridge.org/core/journals/applied-psycholinguistics/article/abs/why-subtitle-speed-matters-evidence-from-word-skipping-and-rereading/A7DB0CBF5910353143738CF9C1721317)), y que a 12-20 cps los espectadores pueden seguir subtítulos y la imagen a la vez ([PLoS ONE 2018](https://discovery-pp.ucl.ac.uk/10050653/1/journal.pone.0199331.pdf)). Cortar las líneas en límites sintácticos no cambió la comprensión pero sí bajó la carga autoinformada (p<.01, n=74 y n=46; [Gerber-Morón et al.](https://pmc.ncbi.nlm.nih.gov/articles/PMC7901653)), y los tamaños mínimos de fuente salen de proveedores (OPINIÓN, [Blitzcut](https://blitzcutai.com/blog/best-caption-size-youtube-shorts-2026); [Eklipse](https://blog.eklipse.gg/basic-knowledge/common-vertical-video-mistakes-streamers-fix.html)).

**R11. Subtítulos.** Entre 1 y 2 líneas, cuerpo ~65 px (rango 55-75, mínimo 48-55), negrita, ancho ≤850 px, ≤32-38 caracteres por línea en español (Netflix usa 42 en idiomas latinos, pero el español es más largo y las notas recomiendan reducir), ≤17-20 cps, frases de 3-7 palabras de 1,5-3 s, cortes sintácticos, 1 palabra resaltada como máximo y solo si es la cifra o el nombre central. Contraste con caja, sombra o contorno (WCAG pide 4,5:1 para texto normal, [W3C](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum)). Subtítulos arriba pueden tapar el gancho que además es miniatura. Cifras de tamaño: OPINIÓN; límites de cps: HECHO VERIFICADO (estudios); franja concreta: INFERENCIA.

**R12. Jerarquía y proximidad.** Cada etiqueta más cerca de su cifra que de cualquier otro elemento; tarjeta visiblemente separada de los subtítulos. La jerarquía por escala, valor, color y posición está respaldada por [NN/g](https://www.nngroup.com/articles/principles-visual-design/) (HECHO VERIFICADO); la aplicación al video es INFERENCIA.

**R13. Atenuar al mostrar datos.** Cuando entra una cifra, desenfocar o atenuar el fondo en movimiento. INFERENCIA apoyada en el hallazgo de Tubefilter.

## 3. Ritmo y carga cognitiva: números de partida con respaldo débil

### Ritmo

Las recomendaciones de blogs se contradicen entre sí: cambio visual cada 2-4 s (la más repetida), cada 1,5-2 s o cada 5-7 s ([Opus.pro](https://www.opus.pro/blog/ideal-youtube-shorts-length-format-retention); [Satura](https://saturaai.com/blog/youtube-shorts-editing); [Fluxnote](https://fluxnote.io/guides/youtube-shorts-editing-tips-2026)), sin método publicado. YouTube documenta la métrica "Visto vs. deslizado" pero no publica benchmarks ([YouTube Help](https://support.google.com/youtube/answer/12220281)). La evidencia académica es indirecta: los cortes provocan respuesta de orientación y los cortes no relacionados y rápidos no pasan bien a memoria (teoría, [resumen de LC4MP](https://www.wikipedia.org/wiki/LC4MP)); un estudio de fMRI con estudiantes mostró peor recuerdo cuando el mismo contenido se presenta en 5-7 clips separados que en continuo ([PsyPost](https://www.psypost.org/?p=232698)); y la continuidad funciona porque se apoya en pistas de atención, con el audio ocultando cortes (Smith 2012, [UAL](https://ualresearchonline.arts.ac.uk/id/eprint/21187/)). Lo que estas evidencias apoyan es que **cada cambio debe estar anclado a una idea nueva**, no que exista un intervalo óptimo.

**R14. Cadencia.** Un cambio visual perceptible cada 2,5-4 s (con movimiento continuo suave, tipo zoom lento, se tolera hasta 5-7 s). Para 45-75 s eso son ~15-25 cambios en total (aritmética, a 3 s). INFERENCIA.

**R15. Duración por tipo de plano.** General o establishing 2-4 s; medio 1,5-3,5 s; inserto o detalle 0,8-2 s; recreación 3D 2-4 s; si una frase dura más de 4 s, partirla en 2 planos de tipo o ángulo distinto. INFERENCIA, de las notas de gramática.

**R16. Gancho.** Primera señal visual o auditiva significativa en <1 s, afirmación o cifra clave en 1-3 s, sin logo ni intro larga. OPINIÓN (blogs de VidIQ y Opus).

**R17. Cambio sincronizado con la palabra.** La imagen cambia 100-300 ms antes de la palabra clave (J-cut visual); la cifra aparece en la palabra que la dice con tolerancia ±0,3 s. INFERENCIA, no hay umbral publicado.

**R18. Anti-repetición inmediata.** Nunca el mismo clip ni un plano muy similar seguidos; alternar escala (general, medio, detalle); un mismo efecto no más de 2-3 veces seguidas; mantener dirección de pantalla coherente entre planos de una misma escena. INFERENCIA.

**R19. Estructura en beats.** 3-5 beats (gancho, contexto, dato, giro, cierre) con una transición clara entre beats. INFERENCIA.

### Carga cognitiva y duración de elementos

**R20. Un dato nuevo a la vez.** Una cifra nueva cada ~4-6 s como tope de trabajo y no más de 3 grupos de texto simultáneos (cifra o titular, etiqueta corta, subtítulos). Ambas cifras son INFERENCIA sin estudio detrás.

**R21. Duraciones mínimas en pantalla.** Valores derivados de la velocidad de lectura de subtítulos (~160-180 palabras/min, ~0,33-0,375 s por palabra, [Clevercast sobre BBC](https://clevercast.com/bbc-subtitling-guidelines), secundaria), no de un estudio sobre gráficas:

| Elemento | Parámetro de partida |
|---|---|
| Cifra única | entrada 0,3-0,5 s con ease-out, contador 0,8-1,2 s, luego ≥1,5-2 s estática |
| Gráfica de 3-5 barras o ranking de 5 | 3-4 s |
| Línea de tiempo | ~1 s por hito (3-4 hitos) |
| Cita | ~0,35 s/palabra + 0,5 s |
| Lower third de nombre | 2,5-3 s |
| Cifra héroe | alto de glifo 160-220 px (mínimo 120 px de cuerpo) |
| Etiquetas | ≥44-48 px |

**R22. Gráficas.** Máximo 5-6 barras o filas, una idea por gráfica, resaltar una serie y atenuar el resto, escala fija durante la animación (reescalar ejes en transición perjudica, [CSE512 UW](https://courses.cs.washington.edu/courses/cse512/16sp/lectures/CSE512-Animation.pdf)), animación por etapas cuando haya cambio de forma ([Heer y Robertson 2007](https://vis.berkeley.edu/papers/animated_transitions/2007-AnimatedTransitions-InfoVis.pdf)). Posición y longitud son las codificaciones más precisas y área o pastel las menos ([Cleveland y McGill](https://info3312.infosci.cornell.edu/slides/04-graphical-perception.html)), aunque las diferencias medias a veces son de 1-2 puntos de cada 100 (HECHO VERIFICADO; el máximo de 5-6 y los tamaños son OPINIÓN).

**R23. Color.** Usar Okabe-Ito ([NYU](https://siegal.bio.nyu.edu/color-palette/)) o dos colores semánticos azul/naranja en vez de rojo/verde, y rotular directo en la barra para no depender solo del color.

## 4. El sistema de variación cambia la piel y fija la marca

### Qué dice la evidencia

La publicidad muestra una curva de U invertida: la repetición ayuda hasta ~10 exposiciones y luego desgasta, y los anuncios creativos casi no se desgastan ([WARC](https://www.warc.com/content/article/ija/advertising-creativity-and-repetition-recall-wearout-and-wearin-effects/en-gb/99212), resumen). La variación cosmética funciona mejor con motivación de procesamiento baja (el espectador de scroll) y la sustantiva con motivación alta (Schumann, Petty y Clemons 1990, [PDF](https://fbaum.unc.edu/teaching/articles/Schuman_1990.pdf)). Un estudio preliminar de PLOS ONE (n=513, muestra de conveniencia, correlacional) halló que la fatiga con contenido IA se asocia más a "se ve barato" que a "es repetitivo" ([StudyFinds](https://studyfinds.com/ai-fatigue-may-be-bad-video-fatigue/)). Por tanto, la ejecución pulida pesa tanto como la diversidad.

Las políticas son la restricción más dura. YouTube reclasifica el contenido "repetitivo o producido en masa" como "inauthentic content" y lo no monetizable incluye "minimal variation between videos", pero **permite intros y outros compartidos si el contenido principal difiere** y personajes recurrentes si cada video tiene "distinct storyline, focus, or concept" ([YouTube Help](https://support.google.com/youtube/answer/1311392?hl=en)). Se aplica a nivel canal ([The Next Web](https://thenextweb.com/news/youtube-ai-slop-crackdown-faceless-creators-collateral-damage), secundaria; el dato de "30 uploads" no está confirmado por YouTube). TikTok excluye del FYF el contenido reutilizado "without anything new" ([TikTok](https://www.tiktok.com/community-guidelines/en/integrity-authenticity/)) y Meta penaliza el reposteo sin cambios significativos; "unir clips o poner marca de agua no basta" ([Meta](https://creators.facebook.com/blog/combating-unoriginal-content)). Ninguna plataforma publica un umbral numérico de variación suficiente.

### Elementos fijos de marca (INFERENCIA, de buenas prácticas de tokens)

La lógica de sistemas multimarca es componentes fijos con valores de token que cambian ([Infinum](https://infinum.com/blog/multibrand-design-system-tokens/)). **R24. Fijos:** logotipo y su posición, una familia tipográfica de titular y una de cuerpo, 1-2 colores de acento de marca, voz y tono de la locución, sonido firma ≤1 s, macroestructura (gancho, dato, cierre), proporciones y márgenes seguros, estilo base de subtítulos, etiqueta fija de "Recreación ilustrativa", y el maniquí base y .blend maestro (escenario, rig y luces fijos). Presupuesto inicial: ~20-30 % del look fijo (valor arbitrario).

### Ejes, opciones y cooldown (propuesta de ingeniería, no verificada)

| Eje | Saliencia | Opciones iniciales | Cooldown entre videos |
|---|---|---|---|
| Esquema de pantalla (A-D más variantes) | alta | 6-10 | no repetir en los últimos min(3, k-1) |
| Tipo de plano y encuadre | alta | 5-8 | min(3, k-1) |
| Paleta secundaria y fondo (dentro de la familia de marca) | alta | 5-8 | min(3, k-1) |
| Estilo de tarjeta o gráfica | alta | 5-6 | min(3, k-1) |
| Familia de transición | alta | 6-8 agrupadas en 2-3 familias | min(3, k-1) |
| Movimiento de cámara / Ken Burns | baja | 4-6 | libre |
| Animación de entrada de texto | baja | 5-8 | libre |
| Perfil de ritmo | baja | 2-3 | libre |
| Cama musical (mismo rango de género y BPM) | baja | 6-10 | libre |

**R25. Selección.** Bolsa barajada por eje (shuffle bag, [Tuts+](https://code.tutsplus.com/shuffle-bags-making-random-feel-more-random--gamedev-1249t)) que persiste en disco entre videos para ejes de 3-5 opciones; para ejes grandes, muestreo ponderado con enfriamiento w = w_base × (1 − exp(−t/τ)), con τ≈2-3 y t en videos desde el último uso.

**R26. Dentro de un video.** No repetir un esquema en escenas consecutivas, máximo 2 usos del mismo esquema por video si hay ≥5 opciones, rotar ≥3 esquemas distintos y no usar la misma tarjeta dos veces seguidas.

**R27. Entre videos adyacentes.** Cambiar ≥2 ejes de alta saliencia y ≥2 de baja; exigir diferencia en ≥3 de 6 ejes visibles respecto de cada uno de los últimos 3 videos. Generar M=10 combinaciones candidatas y elegir la de mayor λ·calidad − (1−λ)·similitud máxima con la huella de los últimos 5 videos (MMR, [Chen et al.](https://arxiv.org/pdf/1709.05135.pdf); λ≈0,6-0,7; similitud = fracción de ejes iguales ponderada por saliencia).

**R28. Reproducibilidad.** Semilla = hash(id_video + fecha), y guardar la "huella" (vector de opciones por eje) de cada video; matriz de exclusión para combinaciones incompatibles (paleta oscura × tarjeta de bajo contraste; transición brusca × música lenta).

**R29. Variación sustantiva obligatoria.** Cada video debe traer un elemento original propio (análisis, contexto, ángulo, fuentes distintas); la variación visual es necesaria pero insuficiente. Las pruebas heurísticas de blogs, como "¿se distinguen dos videos con el audio apagado?", sirven de control ([OutlierKit](https://outlierkit.com/resources/faceless-youtube-channel-demonetized/), OPINIÓN). Todos los números de esta sección son PROPUESTA sin evidencia en video; el valor de ≥3 de 6 ejes y λ requieren prueba propia.

## 5. Catálogo mínimo de recreaciones 3D y de tarjetas de datos

### Recreaciones 3D sin rostro

Hay consenso entre animadores en que la emoción se transmite primero con cuerpo, silueta y cámara, y la prueba de silueta en negro es el control de calidad estándar (OPINIÓN de tutoriales, [Animation Mentor](https://www.animationmentor.com/?p=99675)). Licencias: Kenney declara todos sus assets CC0 ([Kenney](https://kenney.nl/support)), Poly Haven es CC0 sin atribución ([Poly Haven](https://polyhaven.com/license)), Quaternius es CC0 según fuentes secundarias (verificar la licencia de cada pack) y Mixamo permite uso comercial sin redistribuir los archivos crudos (respuestas de empleados de Adobe en foro, la licencia formal antigua fue retirada; guardar captura fechada de los términos, [Adobe](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html)).

**R30. Estilo.** Maniquí de cabeza lisa sin rasgos, proporciones juguete, poses exageradas y asimétricas con holds de 0,3-0,5 s, un prop que cuente la acción, cámara baja = poder y alta = pequeñez o caída, luz suave con una luz de borde, un color de acento por emoción. INFERENCIA y OPINIÓN de oficio. Esto es compatible con la regla del usuario de que la protagonista reacciona y no narra.

Catálogo mínimo propuesto (12 recreaciones; INFERENCIA):

| # | Recreación | Necesidad que cubre |
|---|---|---|
| 1 | Maniquí frente a micrófono y flashes | declaración, rueda de prensa |
| 2 | Maniquí con trofeo o premio | logro, victoria |
| 3 | Maniquí cabizbajo con una hoja que cae o un cartel tachado | caída, cancelación |
| 4 | Dos maniquíes enfrentados con un objeto entre ellos | disputa, rivalidad |
| 5 | Multitud de maniquíes (pocas variantes de acción con desfase) | público, reacción masiva |
| 6 | Maniquí con celular y burbujas de mensaje | publicación, redes |
| 7 | Maniquí con documento o contrato | demanda, acuerdo |
| 8 | Maniquí con bolsas o monedas | dinero, ingresos |
| 9 | Maniquí caminando por un pasillo o una puerta | llegada, salida |
| 10 | Maniquí con manos a la cabeza o encogido de hombros | sorpresa, duda |
| 11 | Maniquí frente a una pantalla o tribunal simple | proceso, juicio |
| 12 | Escenario vacío con cámara lenta (establishing) | lugar, transición |

**R31. Variación 3D por parámetros.** Mismo .blend maestro; cambiar solo 3-5 paletas predefinidas, props y 3-4 posiciones de cámara, con un JSON por video que alimenta un script `bpy` (argumentos tras `--`, documentado en el [manual de Blender 4.5](https://docs.blender.org/manual/en/4.5/advanced/command_line/arguments.html)). La coherencia del fondo (mismo HDRI CC0) y el acento por tipo de noticia viven en el .blend, no en el JSON.

**Tiempos de render: sin medir.** No hay benchmarks de 8 GB a 1080x1920. Las anécdotas dan Eevee 3-10 veces más rápido que Cycles en escenas simples (por ejemplo 11 s contra 32 s por fotograma en una prueba de iRender, [DEV](https://dev.to/irender_gpu_cloud/which-renderer-should-we-choose-cycles-or-eevee-10o9)) pero también ~89 s por fotograma en EEVEE Next 4.2 en otro caso ([DevTalk](https://devtalk.blender.org/t/blender-4-2-eevee-next-feedback/31813?page=56)), con hardware distinto. La estimación de las notas (Eevee 1-10 s por fotograma, Cycles con denoise 10-60 s) es orientativa; un clip de 5 s a 24 fps son 120 fotogramas, es decir, minutos con Eevee y decenas de minutos con Cycles. Se desconoce también el comportamiento exacto de alfa en EEVEE Next 4.5 y si hay desfase por instancia nativo para multitudes. Medir un fotograma propio es el primer paso.

### Tarjetas y gráficas de datos

**R32. Catálogo mínimo (10 piezas; INFERENCIA):**

| # | Pieza | Uso | Esquema típico |
|---|---|---|---|
| 1 | Cifra héroe con etiqueta | un número protagonista | D o A |
| 2 | Cifra con delta (flecha y variación) | cambio de un valor | A o C |
| 3 | Barras de 3-5 con una resaltada | comparar | B |
| 4 | Ranking de 5 filas | posiciones | B o D |
| 5 | Línea de tiempo de 3-4 hitos | cronología | C |
| 6 | Tarjeta de cita sobre recorte | declaración | C |
| 7 | Lower third de nombre y cargo | presentar persona | A |
| 8 | Captura de documento o post con resaltado | evidencia | A o C |
| 9 | Mapa o rótulo de lugar | ubicación | A |
| 10 | Línea simple con un punto marcado | tendencia | B |

Se evitan pastel y área para comparar (R22). Cada pieza tiene 3-5 variantes de estilo (eje "estilo de tarjeta") con la misma estructura de datos.

## 6. Plan de calibración con retención de YouTube Studio

Todo lo anterior es punto de partida; este plan lo convierte en conocimiento propio. Las notas aconsejan no juzgar un cambio de gancho con un solo video y probar 4-6 Shorts ([Opus.pro](https://www.opus.pro/blog/youtube-shorts-hook-formulas), ANECDÓTICO). Con un canal chico y curvas ruidosas, las conclusiones serán de dirección, no estadísticamente firmes.

1. **Registro.** Antes de publicar, cada video guarda su "huella" (ejes y opciones de R27), la lista de escenas con tiempos de inicio y fin, el escalón de cobertura de cada una, el esquema, la tarjeta y los eventos de cifra. Es el eje común para cruzar con la curva.
2. **Métricas de Studio.** Por video: porcentaje "Visto vs. deslizado" (Studio > Contenido > Shorts), duración promedio de visualización y porcentaje promedio visto, y la curva de retención por segundo. El porcentaje visto puede superar 100 % por repeticiones, y los promedios describen solo a quienes pasaron la apertura ([ContentStudio](https://contentstudio.io/blog/youtube-shorts-analytics-guide)). La métrica del gancho es "Visto vs. deslizado"; la del cuerpo es la curva después de los primeros 3 s.
3. **Un parámetro por tanda.** Experimentos de 4-6 videos por brazo, cambiando una sola cosa y manteniendo el tipo de noticia comparable: (E1) cadencia 2,5 s contra 4 s; (E2) franja de subtítulos conservadora (y≈1050-1250) contra estándar (hasta 1400); (E3) duraciones de tarjeta (cifra 1,5 s contra 2,5 s tras la entrada); (E4) escalón 3 (recreación 3D) contra escalón 4 (gráfica) para la misma necesidad; (E5) alta contra baja variación entre videos adyacentes (R27).
4. **Lectura de caídas.** Cruzar cada caída de la curva con la escena en curso (por ejemplo, una caída tras una tarjeta sugiere duración o densidad inadecuada; una caída en un genérico sugiere subir de escalón). Las caídas de los primeros 3 s se atribuyen al gancho, no a la estética.
5. **Pruebas de dispositivo.** Antes de cada tanda, previsualizar en al menos dos teléfonos y en TikTok, Shorts y Reels para fijar la caja segura real; reemplazar R8 con lo medido.
6. **Medición de Blender.** Renderizar un fotograma de prueba a 1080x1920 en el equipo de 8 GB con Eevee y Cycles (con denoise, 64-128 muestras), repetir con 1 y con 10 maniquíes, y registrar segundos por fotograma y VRAM. Con eso se decide el tope de duración de recreación y de fps (24 fps o "en doses").
7. **Criterio de decisión.** Adoptar una opción si mejora en ≥2 tandas la retención media a los 15 s y al final, sin empeorar "Visto vs. deslizado"; si no hay diferencia clara, conservar la opción más barata de producir. Estos umbrales son INFERENCIA.
8. **Revisión de calidad.** Además de métricas, revisar a mano una muestra por tanda (¿se ve barato?, ¿se distinguen dos videos con el audio apagado?), porque el estudio de PLOS sugiere que "se ve barato" pesa más que "repetitivo".

## 7. Decisiones abiertas para el usuario

1. **Caja segura**: ¿publicas en las tres plataformas (usar caja conservadora y≤1260) o priorizas una (por ejemplo YouTube Shorts, caja y≤1400)?
2. **Cantidad de cambios**: ¿empezamos con cadencia de 3 s (≈15-25 cambios) o prefieres más rápido (2,5 s) o más calmado (4 s)?
3. **Peso de la recreación 3D**: ¿máximo de escenas 3D por video (por ejemplo, 2-3 de 15-25) y qué hacer con su tiempo de render una vez medido?
4. **Etiqueta de recreación**: texto exacto, posición y si va también en el audio o solo en pantalla y descripción.
5. **Elementos fijos de marca**: confirmar logotipo, tipografías, 1-2 colores de acento, sonido firma y si el sonido firma va en todos los videos.
6. **Presupuesto de variación**: ¿cuánto de la apariencia puede variar (la propuesta fija 20-30 %)?
7. **Granularidad del catálogo**: ¿aceptas los 12 escenarios 3D y las 10 piezas de datos como mínimo, o hay otros imprescindibles (por ejemplo, tarjeta de comparación de dos personas)?
8. **Recreación sobre personas reales**: ¿se permite maniquí con prop identificable de una persona real (por ejemplo, su trofeo) o solo genérico? Las notas piden respetar solo las reglas que definiste (3 s, menores, voces).
9. **Mixamo y Quaternius**: ¿aceptas guardar captura fechada de los términos y verificar la licencia de cada pack antes de producir a escala?
10. **Tamaño de muestra del plan de calibración**: ¿cuántos videos por tanda puedes publicar (la propuesta es 4-6 por brazo)?
11. **Dónde se calcula la huella de variación**: ¿se persiste en disco local o en Drive (para que otras máquinas la compartan)?

## Conclusión

La evidencia disponible sostiene menos de lo que los blogs de edición dan a entender: no hay estudio que fije el intervalo de corte, el tamaño de la cifra ni la zona segura en 9:16, y las pocas cifras con método (cps ≤20, coherencia, señalización, escala fija en animación) apuntan en una dirección simple, que es quitar lo que no aporta y anclar cada cambio a una idea. Eso reordena el trabajo: en lugar de optimizar parámetros a ciegas, conviene tratar los números de este informe como hipótesis y construir el registro de escenas con tiempos desde el primer video, porque ese registro es el único dato de cadencia, carga y variación que existirá.

El segundo hallazgo es que la variedad visual protege menos de lo esperado. Las políticas hablan de valor sustantivo distinto por video, no de layouts, y el estudio de fatiga con IA apunta a la apariencia barata más que a la repetición. El sistema de variación debe cuidar tanto la combinatoria (ejes, cooldown, huella) como el pulido de cada pieza y un aporte original por guion; sin eso, rotar paletas solo disfraza la plantilla.

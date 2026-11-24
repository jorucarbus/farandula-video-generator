# Convierte peso visual y color en reglas medibles

Un sistema automático de videos 9:16 con escenas 3D sin rostro, tarjetas y subtítulos puede regirse por **una función de costo de composición, un generador de paletas en OKLCH con compuertas de contraste y un presupuesto de producción**, pero casi todos los números son hipótesis a calibrar, no hallazgos. Lo que sí tiene respaldo experimental es cualitativo: la posición domina el juicio de equilibrio, el texto atrae la mirada **11,1 veces** más que regiones comparables, un color que difiere de su entorno salta (pop-out), y HSV tiene un error de luminosidad RMS de **11,59** frente a **0,20** de Oklab. En composición, la caja segura se reconcilia con el informe anterior en **x 120-900 e y 288-1260**, con subtítulos en y≈1050-1250 (hasta 1400 solo si la prueba en teléfono lo confirma). En color, una cuenta propia con la fórmula WCAG muestra un riesgo concreto del diseño del video de Daniel Alcaide: el amarillo #F0E442 rinde **13,7:1** sobre fondo oscuro pero solo **1,11:1** sobre una tarjeta crema, así que el acento amarillo no puede ser texto sobre crema. En producción, el cuello de botella no son los tokens (**≈0,02 USD por video**, ≈6-18 USD al mes para 12 diarios con Sonnet 5.5) ni ElevenLabs (**Pro, 99 USD/mes**, 288.000 de 600.000 créditos), sino el tiempo de render: con 3 escenas 3D de 3 s a 24 fps por video y 4 h nocturnas de GPU, el tope es **≈5,5 s por fotograma**, y el benchmark en la RTX 3070 todavía no existe. Los huecos están declarados en la sección siguiente.

## Qué está verificado, qué es opinión y qué es inferencia

Las etiquetas siguen la convención del informe anterior. **HECHO VERIFICADO** es un estudio con método, documentación oficial o política publicada con enlace; **OPINIÓN/ANECDÓTICO** es blog, proveedor, foro o autoinforme; **INFERENCIA** es derivación propia, incluida aritmética y cálculos de contraste que cualquiera puede reproducir. Las reglas llevan prefijo propio para no chocar con las R1-R32 del informe anterior: **C** para composición, **K** para color, **P** para producción e **I** para integración.

Los huecos que traen las notas condicionan todo lo demás y se declaran aquí, no al final. Primero, **no se pudo acceder a hilos de foros** (Reddit, Hacker News, Designer Hangout, Stack Exchange): lo que parece "consenso de comunidad" es de artículos y de Discourse, DevTalk y Blender Artists. Segundo, **HCT de Material 3 y las tablas APCA no se verificaron** (las páginas devolvieron 404 o vacío), de modo que el umbral "tono 40 ≈ 3:1 y 50 ≈ 4,5:1" y los valores Lc quedan como conocimiento previo; el algoritmo de abajo usa WCAG como compuerta dura y APCA solo como aviso. Tercero, **las zonas seguras no tienen especificación oficial**: las cifras para TikTok varían (108/320, 240/660, 130/480 píxeles arriba/abajo según la fuente) y todas son de terceros. Cuarto, **no hay tiempos de render medidos en la RTX 3070** ni para three.js ni para Eevee Next a 1080x1920. Quinto, **los coeficientes de peso visual son inferencias**: la literatura no publica valores de k por factor y no se obtuvieron los coeficientes de "Beyond Saliency" ni las ecuaciones de Ngo. Sexto, **no hay cifras publicadas de tokens por video** ni de creadores con 12 videos diarios, y los precios de Gemini no se verificaron. Séptimo, la semántica del color en Ecuador no está estudiada (Colombia fue el único país sudamericano de la muestra multinacional), y no hay estudios de color y credibilidad en noticias. Octavo, el video de Daniel Alcaide **no fue visto por quien redacta**: su contenido llega como contexto aportado por el usuario y se trata como tal.

## Composición: una función de costo en vez de intuición

### Qué respalda la evidencia

El equilibrio visual se modela como la distancia entre el centro de masa (ponderado por área, luminancia y saliencia) y el centro del cuadro. Los experimentos con fulcro muestran que **el juicio depende sobre todo de la posición**, con tamaño y color como influencias menores, y que el rojo pesó más que el azul en McManus (leído vía resumen) ([Frontiers 2016](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2016.00335/pdf)). Las métricas geométricas simples correlacionan débilmente con las calificaciones perceptuales en el mismo trabajo, por lo que sirven como control, no como verdad. "Beyond Saliency" (ACM MM 2017) halló que añadir detección de personas y punto de fuga mejora significativamente la predicción del centro visual frente a la saliencia sola ([Penn State](https://pure.psu.edu/en/publications/beyond-saliency-assessing-visual-balance-with-high-level-cues/)). Rostros y texto atraen la mirada **16,6 y 11,1 veces** más que regiones comparables ([Cerf et al.](https://resolver.caltech.edu/CaltechAUTHORS:20130816-103355264)); como este sistema no tiene rostros, **el texto (cifras, rótulos, subtítulos) es la masa dominante** y la figura 3D es el segundo ancla (INFERENCIA). Ngo, Teo y Byrne definen 14 medidas en [0,1] (balance, equilibrio, simetría, regularidad, economía, entre otras) combinadas linealmente ([Ngo](https://www.mi.sanu.ac.rs/vismath/ngo/index.html)), y PosterLayout (CVPR 2023) aporta ocho métricas reusables: validez, solapamiento, alineación, underlay, utilidad del espacio no saliente, oclusión de saliencia y legibilidad ([arXiv 2303.15937](https://arxiv.org/pdf/2303.15937)). Ninguna de estas métricas está validada contra retención en video corto.

Sobre Gestalt, la región común (una placa que delimita) y la conectividad agrupan con fuerza, y su orden de dominio con la proximidad es disputado ([Palmer y Rock](https://link.springer.com/content/pdf/10.3758/BF03200760.pdf); [Montoro et al. 2017](https://link.springer.com/content/pdf/10.3758/s13423-017-1254-3.pdf)), mientras que la proximidad puede dominar sobre color o forma ([NN/g](https://www.nngroup.com/articles/gestalt-proximity/)). La regla de tercios tiene sustento débil: Amirshahi et al. hallaron que juega un papel menor, si alguno ([Amirshahi 2014](https://uniklinikum-jena.de/anatomie1_media/Inhalte/AmirshahiARTP2014-font-1.pdf)); la proporción áurea y las escalas modulares no tienen sustento empírico en lo hallado. Sobre atención, Cowan sitúa el foco en **~4 chunks**, cifra discutida ([Cowan 2001](https://www.cambridge.org/core/journals/behavioral-and-brain-sciences/article/magical-number-4-in-shortterm-memory-a-reconsideration-of-mental-storage-capacity/44023F1147D4A1D44BDC0AD226838496)), y NN/g documenta que el patrón F persiste en móvil ([NN/g](https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content/)). En un estudio se pasó más del 40 % del tiempo leyendo subtítulos aunque hubiera audio redundante, lo que justifica no competir con ellos (cifra vía resumen) ([PMC4521331](https://pmc.ncbi.nlm.nih.gov/articles/PMC4521331)). "3 niveles de jerarquía" es convención, no cifra de un estudio.

### Reglas de composición (C1 a C14)

**C1. Lienzo y caja segura.** Lienzo 1080x1920. Texto, cifras, tarjetas y logos van dentro de **x 120-900, y 288-1260**; escenas y fondos sangran a pantalla completa. Es la intersección de la caja conservadora del informe anterior (x 120-900, y 250-1260) con la propuesta de esta ronda (x 120-960, y 288-1250); se elige el lado más estricto en cada borde. La columna x>900 queda libre (iconos de ~180 px, medición de terceros: [ManyPixels](https://www.manypixels.co/blog/social-media-design/tiktok-ad-specs)). INFERENCIA apoyada en cifras de terceros; sustituir por lo medido en teléfonos.

**C2. Un primario por beat.** Un foco primario (la cifra o la tarjeta dominante; la figura 3D es primaria solo en planos sin dato), máximo **3 elementos activos** simultáneos (escena/figura, tarjeta o cifra, subtítulo) y **4 como tope duro**. El resto en reposo (estático o baja opacidad). INFERENCIA, apoyada en el límite de ~4 de Cowan.

**C3. Presupuesto de masa.** Primario ≈ 55 %, secundario ≈ 28 %, terciario ≈ 17 % de la masa total, con tolerancia de ±10 puntos; y **masa del primario ≥ 1,5 veces la del segundo** (coherente con la razón tipográfica 1,5). INFERENCIA.

**C4. Fórmula de masa.** Para cada elemento i: m_i = A_i · (1 + k_c·contraste) · (1 + k_s·saturación) · (1 + k_t·es_texto) · (1 + k_p·es_figura) · (1 + k_a·aislamiento), con A_i como fracción del área del lienzo. Se excluye el fondo; de la escena solo cuenta la silueta de la figura (la máscara sale gratis de un pase de índice de objeto en el render 3D, a diferencia de una foto). Valores de partida **k_c=0,5, k_s=0,3, k_t=1,0, k_p=0,5, k_a=0,3**. Son INFERENCIA pura: la literatura da solo el orden (posición > tamaño≈contraste > saturación) y la magnitud del efecto del texto (11,1x como cota de que k_t debe ser el mayor). Calibrar con 20-30 composiciones calificadas por una persona.

**C5. Equilibrio.** Centro de masa CM = Σ m_i·c_i / Σ m_i, comparado con el **centro de la caja segura** (510, 774), no con el del lienzo. Error normalizado: E_x = |CM_x − 510| / 540 ≤ **0,15** y E_y = |CM_y − 774| / 960 ≤ **0,20** (la tolerancia vertical es mayor porque el 9:16 se lee de arriba abajo). Elementos pequeños y contrastados lejos del eje compensan a los grandes cercanos; la fórmula lo capta y la simetría por cuadrantes no. INFERENCIA (valores de las notas, a probar).

**C6. Orden de lectura vertical.** Figura/escena → titular de tarjeta → cifra → subtítulo, de arriba abajo; si la posición no lo sigue, se refuerza con tamaño o contraste. INFERENCIA apoyada en el patrón F.

**C7. Tipografía.** Escala de 3 niveles con razón ≈1,5: **96 / 64 / 42-44 px**, más un nivel "cifra héroe" de 160-220 px, y nunca más de 4 tamaños distintos en pantalla (3 si no hay cifra héroe). El tamaño del subtítulo es 64-65 px y el mínimo de rótulos 44-48 px, como en el informe anterior; la jerarquía se completa con peso y color, no solo con tamaño ([Frank Chimero](https://frankchimero.com/blog/2020/scales-and-hierarchy)). Grilla base de 8 px: toda posición y tamaño múltiplo de 8. OPINIÓN/INFERENCIA.

**C8. Distancias y alineación.** Entre bordes de elementos: separación **≥24 px o solape ≥25 %**; nunca 1-23 px ("casi tocarse"). Elementos con texto alineados a **≤3 líneas verticales**, con diferencias de 0 o ≥16 px. Un solo radio de esquina. Tangencias: ≥16-24 px entre el borde de una tarjeta y la silueta de la figura. INFERENCIA.

**C9. Agrupación.** Etiqueta y cifra se agrupan por región común (placa) y proximidad; espacio interno ≤0,5 veces el espacio entre grupos. Cada etiqueta más cerca de su objeto que de cualquier otro elemento (esto cubre las "etiquetas con línea guía" del video de Alcaide: la línea guía solo se añade si la etiqueta debe separarse más de 0,5 veces el espacio entre grupos). INFERENCIA apoyada en NN/g.

**C10. Reparto de pantalla.** Ventana de contenido principal: 55-70 % del alto de la caja segura; tarjeta: 20-30 %; **≥8-10 % de espacio negativo**. Tercios solo como posiciones discretas de ancla (y≈640 y y≈1280), no como regla estética. INFERENCIA.

**C11. Variación de layout sin romper coherencia.** Mantener fijos grilla, margen, escala tipográfica y paleta de marca; variar solo entre 2-3 anclas predefinidas, el lado de la tarjeta y un paso de escala. INFERENCIA; encaja con las R26 y R27 del informe anterior.

**C12. Subtítulos.** Conservan los parámetros de R11 del informe anterior (1-2 líneas, ~65 px, ≤850 px de ancho, ≤17-20 caracteres por segundo) con la **franja y≈1050-1250 por defecto**. La alternativa de esta ronda (base a 480-560 px del borde inferior, es decir y≈1360-1440) cae fuera de la caja conservadora y se trata como la variante "estándar" del experimento E2. El ancho de esta ronda (≤840) se reconcilia con ≤850 usando **≤840**. INFERENCIA.

**C13. Temporalidad de la animación.** No animar una tarjeta mientras aparece texto nuevo; escalonar entradas ≥300-400 ms. Atenuar o desenfocar el fondo en movimiento al entrar una cifra (R13). INFERENCIA.

**C14. Elección entre candidatos.** El generador produce 6-12 plantillas de layout por reglas y elige la de menor costo J (siguiente subsección), en lugar de optimizar libremente. INFERENCIA.

### Función de costo implementable

La función combina términos tomados de Ngo (balance, regularidad, economía) y de PosterLayout (solapamiento, alineación, oclusión, utilidad del espacio no saliente). Las restricciones duras descartan el candidato (zona segura, más de 4 focos, más de 4 tamaños de texto, contraste bajo la compuerta de la sección de color); las blandas suman. La implementación de referencia se ejecutó una vez para comprobar que corre y detecta una infracción de zona segura; los pesos son hiperparámetros sin calibrar.

```python
from dataclasses import dataclass
from itertools import combinations
W, H = 1080, 1920
SAFE = (120, 288, 900, 1260)                                   # x0, y0, x1, y1
K = dict(contrast=0.5, sat=0.3, text=1.0, figure=0.5, iso=0.3)  # a calibrar
TARGET_SHARE = (0.55, 0.28, 0.17)
WGT = dict(bal=3, occ=4, ove=3, ali=1, hier=2, uti=1)           # a calibrar

@dataclass
class El:
    role: str; x: float; y: float; w: float; h: float
    contrast: float = 0.5; sat: float = 0.3; iso: float = 0.0
    text: bool = False; figure: bool = False; font: int = 0
    @property
    def mass(self):
        a = self.w * self.h / (W * H)
        return (a * (1 + K['contrast']*self.contrast) * (1 + K['sat']*self.sat)
                * (1 + K['text']*self.text) * (1 + K['figure']*self.figure)
                * (1 + K['iso']*self.iso))
    @property
    def c(self): return (self.x + self.w/2, self.y + self.h/2)

def inter(a, b, pad=0):
    w = min(a.x+a.w, b.x+b.w+pad) - max(a.x, b.x-pad)
    h = min(a.y+a.h, b.y+b.h+pad) - max(a.y, b.y-pad)
    return max(w, 0) * max(h, 0)

def gap(a, b):
    dx = max(a.x-(b.x+b.w), b.x-(a.x+a.w), 0)
    dy = max(a.y-(b.y+b.h), b.y-(a.y+a.h), 0)
    return max(dx, dy) if (dx == 0 or dy == 0) else (dx*dx + dy*dy) ** 0.5

def score(els):
    hard = []
    for e in els:                                   # zona segura: solo texto y datos
        if e.text or e.role in ('tarjeta', 'cifra'):
            if e.x < SAFE[0] or e.y < SAFE[1] or e.x+e.w > SAFE[2] or e.y+e.h > SAFE[3]:
                hard.append(f'fuera de zona segura: {e.role}')
    act = [e for e in els if e.role != 'fondo']
    if len(act) > 4: hard.append('mas de 4 focos activos')
    if len({e.font for e in act if e.font}) > 4: hard.append('mas de 4 tamanos')
    m = sorted((e.mass for e in act), reverse=True); tot = sum(m)
    cx = sum(e.mass*e.c[0] for e in act)/tot; cy = sum(e.mass*e.c[1] for e in act)/tot
    rx, ry = (SAFE[0]+SAFE[2])/2, (SAFE[1]+SAFE[3])/2
    bal = max(abs(cx-rx)/(W/2)/0.15, abs(cy-ry)/(H/2)/0.20)   # <=1 cumple
    figs = [e for e in act if e.figure]
    occ = sum(inter(f, o, 20)/(f.w*f.h) for f in figs for o in act
              if o is not f and o.role != 'escena')            # tarjeta sobre silueta
    ove = ali = 0.0
    for a, b in combinations(act, 2):
        i = inter(a, b)/min(a.w*a.h, b.w*b.h); g = gap(a, b)
        if 0 < i < 0.25: ove += 1                              # solape timido
        if i == 0 and 0 < g < 24: ove += 1                     # casi tocarse
    lefts = sorted({round(e.x) for e in act if e.text or e.role == 'tarjeta'})
    lines = lefts[:1]
    for v in lefts[1:]:
        if 0 < v-lines[-1] < 16: ali += 1                      # casi alineado
        elif v-lines[-1] >= 16: lines.append(v)
    ali += max(0, len(lines)-3)                                # >3 lineas
    sh = [x/tot for x in m[:3]] + [0]*(3-len(m[:3]))
    hier = sum(abs(s-t) for s, t in zip(sh, TARGET_SHARE))
    if len(m) > 1 and m[0]/m[1] < 1.5: hier += 1               # sin primario claro
    uti = 0.0   # 1 - fraccion de overlays sobre zona no saliente (mascara de pase de objeto)
    J = sum(WGT[k]*v for k, v in dict(bal=bal, occ=occ, ove=ove, ali=ali, hier=hier, uti=uti).items())
    return (None if hard else J), hard
```

Uso: se construye la lista de `El` de cada candidato, se llama a `score` y se elige el de menor J entre los que no tienen infracciones duras. El término `uti` queda en cero hasta contar con la máscara de objeto del render 3D. Para validar los pesos, calificar a mano 20-30 composiciones del 1 al 5 y ajustar w y k hasta que el orden por J coincida con el orden humano (correlación de Spearman como métrica; el umbral de aceptación es decisión abierta).

## Color: paletas generadas en OKLCH y compuertas de contraste

### Qué respalda la evidencia

Oklab/OKLCH tiene respaldo medido: error RMS de luminosidad **0,20** frente a 1,70 en CIELAB y 11,59 en HSV, y de croma 0,81 frente a 1,84; CIELAB predice mal el tono azul (la mezcla blanco→azul vira a púrpura) ([Ottosson](https://bottosson.github.io/posts/oklab/)). OKLCH se obtiene como C = √(a²+b²), h = atan2(b,a). Adobe Leonardo ilustra el enfoque de generar escalas por razón de contraste objetivo contra un fondo ([InfoQ](https://www.infoq.com/news/2020/03/adobe-leonardo-accessible-colors); [repo](https://github.com/adobe/leonardo)). WCAG 2.x fija **4,5:1 para texto normal y 3:1 para texto grande**, con luminancia L = 0,2126 R + 0,7152 G + 0,0722 B sobre canales sRGB linealizados y razón (L1+0,05)/(L2+0,05) ([W3C](https://www.w3.org/wai/wcag22/understanding/contrast-minimum.html); [luminancia relativa](https://www.w3.org/WAI/WCAG22/Understanding/relative-luminance.html)). Okabe-Ito (#E69F00, #56B4E9, #009E73, #F0E442, #0072B2, #D55E00, #CC79A7, #000000) es la paleta segura para daltonismo ([NYU Siegal](https://siegal.bio.nyu.edu/color-palette/)). En atención, el modelo de Itti, Koch y Niebur usa mapas de intensidad, color oponente y orientación, y solo sobreviven ubicaciones que destacan de su entorno ([Itti et al. 1998](https://sites.krieger.jhu.edu/cns/files/2021/08/Itti_etal98.pdf)); el pop-out ocurre cuando el objetivo difiere en una sola dimensión ([Edinburgh](https://www.inf.ed.ac.uk/teaching/courses/ccs/lectures/ccs_l18_saliency.pdf)). Esto respalda el acento único: un matiz saturado sobre base de baja croma.

Sobre semántica, Jonauskaite et al. (4.598 participantes, 30 naciones) encontraron asociaciones color-emoción mayormente universales (r medio = 0,88) con diferencias locales mayores entre naciones lejanas ([Psychological Science 2020](https://www.psychologicalscience.org/journals/psychological-science/0956797620948810/)); Ecuador no está en la muestra. En render, las notas reportan que AgX desatura por diseño y Filmic desplaza colores en altas luces saturadas, y que para colores de marca exactos se sugieren Standard o Khronos PBR Neutral (Blender 4.2+), con un caso de coincidencia 1:1 con Standard (caso único) ([Blender Artists](https://blenderartists.org/t/dealing-with-aces-agx-srgb/1480752/7); [AgX](https://github.com/EaryChow/AgX)). Sobre subtítulos, no hay estudio controlado de contorno contra caja; la caja semitransparente es práctica de industria, no evidencia ([W3C 2012](https://lists.w3.org/Archives/Public/public-texttracks/2012Aug/0029.html)). La regla 60-30-10 es heurística sin respaldo hallado.

### Reglas de color (K1 a K12)

**K1. Generar en OKLCH, nunca en HSL/HSV.** La paleta se define por (L, C, h) y se convierte a sRGB con mapeo de gamut que **reduce C a L y h constantes** (no recorte por canal). Conversión con una librería establecida (por ejemplo culori o colorjs.io) en vez de matrices a mano. HECHO VERIFICADO (por qué OKLCH); el mapeo de gamut es INFERENCIA técnica de conocimiento previo.

**K2. Estructura de paleta por video.** Tokens: `fondo` (dominante), `superficie` (tarjetas), `tinta` (texto sobre fondo), `tinta_superficie` (texto sobre tarjeta), `acento` (uno solo), `positivo`, `negativo`, `neutros`. Máximo **3-4 matices simultáneos por fotograma** (neutros, dominante, acento) y **un único matiz de acento saturado**; solo el elemento clave puede tener diferencia grande de h y C respecto del entorno. INFERENCIA apoyada en pop-out; el tope de 3-4 es heurística sin cita.

**K3. Reparto de área.** Orientación 60-30-10 (dominante / secundario / acento), con el **acento ≤10 % del área**. OPINIÓN (sin respaldo empírico hallado).

**K4. Ancla de marca y variación.** Fijos entre videos: acento de marca y neutros. Variables por video: tono del dominante rotado **±15-30°** (o a offsets armónicos), C ±20 %, L ±0,05. Offsets armónicos: análogo ±30°, complementario +180°, split-complementario +150°/+210°, triádico +120°/+240°, monocromático (mismo h, varía L y C). La "belleza" de las armonías no está validada; se usan como aritmética de la rueda. INFERENCIA. Esto implementa R24 y R25 del informe anterior en el eje "paleta secundaria y fondo".

**K5. Escalas por contraste objetivo.** Cada color de texto se obtiene por búsqueda binaria de L (con h y C fijos) hasta alcanzar la razón objetivo contra su fondo, al estilo Leonardo; el contraste se cumple por construcción. INFERENCIA.

**K6. Compuertas de contraste.** Piso duro WCAG: texto ≥ **4,5:1**, texto grande (≥ 24 px de cuerpo equivalente a 18 pt, o negrita ≥ 19 px) y elementos gráficos ≥ **3:1**. Para subtítulos, objetivo **≥ 7:1** como holgura contra fondo variable (INFERENCIA). APCA (|Lc| ≥ 75-90) se calcula como aviso informativo, no como compuerta, porque sus tablas no se verificaron.

**K7. Contraste contra el peor fondo.** Para texto sobre escena, muestrear el cuadro detrás de la caja de texto y evaluar el **percentil 5/95 de luminancia** (el que dé el peor contraste), no la media. INFERENCIA.

**K8. Scrim de subtítulo calculado.** Si el fondo es variable, se coloca un scrim negro cuya opacidad α se calcula, no se fija. Con texto blanco (L=1) y mezcla en luz lineal, se necesita L_efectivo ≤ 0,183 para 4,5:1 (1,05/(L+0,05) ≥ 4,5), es decir, α ≥ 1 − 0,183/L_p95. Con un fondo de L_p95 = 0,9 resulta **α ≥ 0,80**, y con 0,5 resulta α ≥ 0,63. Por eso el rango de partida 60-80 % de las notas es suficiente solo para fondos medios; sobre fondos claros hay que oscurecer la escena en la franja (gradiente) o subir α. Cálculo propio (supone mezcla lineal; la mezcla en sRGB codificado difiere); INFERENCIA.

**K9. Color nunca solo.** Pares semánticos (✓/✗, subida/bajada, categorías) llevan forma, icono o posición además de color, y se comprueban con simulación de protan, deutan y tritan (matrices de Machado o Brettel; no verificadas aquí): exigir ΔL en OKLab ≥ **0,15** entre pares críticos tras la simulación (umbral propio). INFERENCIA.

**K10. Semántica como prior suave.** Rojo/amarillo para alerta y titular, azul/verde para calma o positivo, siempre con texto o icono que cargue el significado; lista de colores "evitar" por tema (colores de partidos y de equipos pueden cargar significado local fuerte). Ecuador no está en los estudios: transferencia regional con cautela. INFERENCIA.

**K11. Coherencia escena-tarjetas-subtítulos.** Una sola fuente de verdad: el JSON de paleta alimenta tanto el render 3D (materiales y luces) como las tarjetas y los subtítulos. En 3D: view transform **Standard** (o Khronos PBR Neutral) con materiales planos o emisivos para que los hex salgan sin desviarse, key neutro, rim light = acento, fondo = dominante desaturada. QA: muestrear el PNG final y exigir **ΔE en OKLab < 0,02** respecto del hex objetivo en las zonas de color de marca (umbral propuesto, no verificado). INFERENCIA.

**K12. Silueta legible sin rostro.** Diferencia de L en OKLab entre figura y fondo ≥ **0,3-0,4**, más rim light en el acento. INFERENCIA (práctica de iluminación, no verificada).

### Algoritmo de generación y verificación

```
entrada: ancla_marca (acento, neutros), tema, semilla = hash(id_video + fecha)
1. h0 = h_dominante_base(tema); aplicar offset armonico elegido por bolsa barajada (K4)
   h = h0 + U(-30, +30); C = C_base * U(0.8, 1.2); L = L_base + U(-0.05, +0.05)
2. fondo      = oklch(L_f in [0.15, 0.22], C <= 0.03..0.06, h)        # modo oscuro (rangos propuestos)
   superficie = oklch(L_s >= 0.92, C <= 0.04, h_calido)              # tarjeta crema
3. tinta = buscar L en OKLCH (h, C fijos) hasta WCAG(tinta, fondo) >= 7
   tinta_superficie = idem contra superficie
4. acento: si WCAG(acento, fondo) < 3 -> ajustar L (no h); NO usar acento como texto sobre superficie
   si WCAG(acento, superficie) < 4.5 -> definir acento_oscuro con L menor, mismo h
5. positivo/negativo: tomar de Okabe-Ito (#009E73, #D55E00) para fondo oscuro;
   para superficie, versiones con L menor hasta WCAG >= 3 (icono) o >= 4.5 (texto)
6. gamut-map a sRGB (bajar C a L,h constantes); redondear a hex
7. Verificar (todo debe pasar, si no: reintentar con otra semilla hasta 20 veces):
   a) todos los pares de texto: WCAG >= umbral (K6)
   b) |h_acento - h_dominante| >= 60 grados y C_acento >= 1.5 * C_dominante
   c) <= 4 matices distintos; acento <= 10 % del area en la plantilla
   d) simulacion de daltonismo: dL_OKLab >= 0.15 en pares criticos (K9)
   e) tras render y mezcla del scrim: muestreo del PNG, dE_OKLab < 0.02 en marca (K11), percentil de fondo bajo subtitulos (K7-K8)
   f) opcional: mapa de saliencia del cuadro final; el acento debe concentrar saliencia en la zona de texto o elemento clave
8. Guardar la paleta en la huella del video (R27/R28 del informe anterior)
```

Los umbrales de la verificación (b), (c) y los rangos de L del paso 2 son propuestas propias. El paso 4 recoge el hallazgo calculado de la tabla siguiente.

| Par (hex) | Razón WCAG calculada | Lectura |
|---|---|---|
| Crema #F4EBD0 sobre oscuro #14161A | **15,2:1** | texto crema sobre fondo oscuro, excelente |
| Amarillo #F0E442 sobre oscuro #14161A | **13,7:1** | acento amarillo como texto o relleno sobre oscuro, excelente |
| Oscuro sobre amarillo | 13,7:1 | texto oscuro sobre un relleno amarillo funciona |
| Amarillo sobre crema | **1,11:1** | inutilizable: el amarillo no puede ser texto ni borde fino sobre tarjeta crema |
| Azul Okabe-Ito #0072B2 sobre crema | 4,36:1 | por debajo de 4,5; solo texto grande o relleno |
| Verde #009E73 sobre oscuro / sobre crema | 5,29:1 / 2,87:1 | ✓ verde funciona sobre oscuro, no sobre crema |
| Bermellón #D55E00 sobre oscuro / sobre crema | 4,68:1 / 3,25:1 | ✗ rojo funciona sobre oscuro; sobre crema solo como relleno o icono de 3:1 |

Todos los valores son cálculo propio con la fórmula WCAG para colores de ejemplo, no medidas del video de referencia. Implican que, sobre tarjetas crema, los marcadores ✓ y ✗ deben usar versiones más oscuras del mismo matiz y que el acento amarillo vive sobre fondo oscuro o como relleno con texto oscuro encima.

## Aprendizajes del video de Daniel Alcaide

El contenido de esta sección es contexto aportado por el usuario sobre el video "Claude AHORA Crea Vídeos 3D… y es una Locura" (22-nov-2026). No se verificó viéndolo ni se dispone de un enlace; se etiqueta como **OPINIÓN/ANECDÓTICO** (relato de un creador) y las derivaciones al sistema son **INFERENCIA**. Cuatro lecciones de método y una de diseño de pantalla.

**A1. Motion graphics 3D por código con three.js, sin Blender.** El video muestra que Claude Code escribe escenas three.js. Para este sistema significa que la hipótesis de tener un solo motor (three.js) es plausible para escenas estilizadas, pero el video no resuelve las preguntas que importan aquí: render determinista a 9:16, rendimiento con GPU de 8 GB y calidad de sombras y materiales tipo arcilla. Esas dudas siguen abiertas y se atacan con el benchmark de la sección de producción. Las notas reportan que three.js tiene límites frente a Blender (sombras por shadow map, depth of field que rompe el alfa con composer, motion blur no determinista) y que la transparencia con postprocesado exige trabajo extra ([Discourse](https://discourse.threejs.org/t/how-to-use-transparent-background-when-adding-post-processing-after-using-webgpu/78323)).

**A2. Refinar con un video de referencia que Claude estudia y mide.** Es el mismo principio que la calibración del informe anterior: convertir un ejemplo en parámetros. Aplicación directa: tomar 3-5 videos de referencia del estilo deseado, extraer por código (no por LLM) los números que este informe define (masa por elemento, centro de masa, posiciones, tamaños tipográficos, paleta en OKLCH, duración de cada plano, razón de contraste) y usarlos para calibrar k, los pesos de J y los rangos de L y C. Es la forma más barata de sustituir los coeficientes "a calibrar" por números con origen, y no consume tokens salvo en la interpretación.

**A3. Skill con galería de 10 estilos y cómo se construye cada uno.** Equivale al eje "estilo de tarjeta/escena" de la variación (R25-R27): cada estilo es un conjunto de valores de tokens (paleta, materiales, luces, tipografía, transición) sobre estructuras fijas. Recomendación: guardar los estilos como JSON declarativo y que la skill contenga la receta de construcción, no el código completo, para que el LLM solo elija y parametrice. Esto mantiene bajo el costo en tokens (sección de presupuesto).

**A4. Convertir un motion 2D en 3D conservando guion, texto y ritmo.** Es el patrón correcto para este sistema: la **línea de tiempo y el texto son datos que no cambian**; solo cambia la representación. Aplicación: el JSON de dirección (escenas, tiempos, texto, escalón de cobertura) es la fuente de verdad y el render 3D es un backend intercambiable (three.js o Blender); así también se puede hacer la migración gradual de una tarjeta 2D a una escena 3D sin tocar guion ni subtítulos.

**A5. Diseño de pantalla (16:9) y su traducción a 9:16.** La siguiente tabla traduce cada rasgo del diseño; en 9:16 el ancho útil cae de 1920 a 780 px (caja segura), de modo que lo que en 16:9 está al lado va arriba o abajo.

| Rasgo en el video (16:9) | Qué dice la evidencia | Traducción a 9:16 (regla de este informe) |
|---|---|---|
| Ventana grande de contenido con etiquetas y línea guía sobre partes del objeto | proximidad y región común agrupan; texto atrae la mirada | esquema A o B del informe anterior; etiqueta ≥44 px, ≤2 palabras, línea guía solo si la etiqueta se aleja más de 0,5x el espacio entre grupos (C9); máx. 2-3 etiquetas por plano (C2) |
| Indicador de pasos arriba | no hay estudio específico; encaja con "beats" (R19) | barra o puntos de 3-5 pasos dentro de y≥288, alto ≤48 px, al 40-60 % de opacidad y sin animar mientras aparece texto nuevo (C13); cuenta como elemento activo solo cuando cambia de paso |
| Comparación con ✓ verde y ✗ rojo | R23 del informe anterior recomienda evitar rojo/verde como único canal | **conservar ✓/✗ pero con forma y texto**; verde #009E73 y bermellón #D55E00 (Okabe-Ito) sobre fondo oscuro; versiones oscurecidas sobre crema (K9) |
| Un único acento amarillo sobre fondo oscuro | pop-out por diferencia en una sola dimensión | K2 (un acento) con #F0E442 como candidato; fondo L 0,15-0,22; acento ≤10 % del área |
| Tarjetas crema | coherente con la referencia capitolinsiders del proyecto | superficie L≥0,92; texto oscuro; **acento amarillo no usable como texto sobre crema** (1,11:1) |
| Jerarquía título grande + rótulo pequeño | jerarquía por escala, valor, color y posición ([NN/g](https://www.nngroup.com/articles/principles-visual-design/)) | 96 px (título) + 42-44 px (rótulo), razón ≈2,2; la razón entre niveles adyacentes debe ser ≥1,5 (C3, C7) |
| Resultado en los primeros segundos (gancho) | solo blogs; R16 del informe anterior | primera señal en <1 s y cifra o resultado en 1-3 s; el render final (o su avance) abre el video y la explicación sigue |

Un cuidado extra: el estilo del video está pensado para una pantalla de 16:9 con tarjetas anchas; trasladarlo tal cual a 9:16 produce tarjetas de 3 o 4 líneas de texto. El tope de 2 líneas por tarjeta y 32-38 caracteres por línea del informe anterior (R11) prevalece.

## three.js frente a Blender: la decisión la toma el tiempo de render

### Qué se sabe

Remotion con `@remotion/three` permite renderizar three.js controlando el reloj con `useCurrentFrame()`; en Remotion 4.0 WebGL requiere `--gl=angle` (y `chromiumOptions: { gl: "angle" }` en `renderMedia()`), mientras que en 5.0 se activa solo y cae a software si no hay GPU compatible ([Remotion three](https://www.remotion.dev/docs/three); [WebGL](https://www.remotion.dev/docs/webgl)). Chrome headless suele ir sin GPU salvo que se fuerce ANGLE, y `npx remotion gpu` diagnostica ([Remotion GPU](https://www.remotion.dev/docs/gpu)). Remotion es gratis para individuos y empresas de hasta 3 personas ([licencia](https://www.remotion.dev/docs/license/pricing.md)). puppeteer-capture (MIT) captura fotogramas de forma determinista con `beginFrame` pero su API es experimental ([GitHub](https://github.com/alexey-pelykh/puppeteer-capture)); HyperFrames calcula cada fotograma a partir de su número ([HyperFrames](https://hyperframes.heygen.com/concepts/determinism)); y htmlrec soporta WebM VP9 con alfa y ProRes 4444 con alfa ([dev.to](https://dev.to/dsplce-co/htmlcss-animation-to-video-mp4-the-headless-deterministic-way-incl-claude-4a2)). Blender renderiza por línea de comandos (`-b`, `-a`) ([manual](https://docs.blender.org/manual/en/4.4/advanced/command_line/arguments.html)), y el fallo "Unable to open a display" es de Linux sin pantalla, no de Windows ([bug #77339](https://projects.blender.org/blender/blender/issues/77339)).

Las cifras de rendimiento son anecdóticas y de hardware distinto: Eevee 3-10 veces más rápido que Cycles en escenas simples (11 s contra 32 s por fotograma en una prueba de iRender, [DEV](https://dev.to/irender_gpu_cloud/which-renderer-should-we-choose-cycles-or-eevee-10o9)) frente a ~89 s por fotograma en EEVEE Next 4.2 en otro caso ([DevTalk](https://devtalk.blender.org/t/blender-4-2-eevee-next-feedback/31813?page=56)); para three.js, foros reportan ~300 ms de render y ~2000 ms de lectura de píxeles a 2048x2048 vía Puppeteer ([Discourse](https://discourse.threejs.org/t/server-side-render-and-get-pixel-data-fast/26784)). Ninguna cifra es a 1080x1920 con una RTX 3070. Mixamo permite uso comercial integrado sin redistribuir archivos crudos según respuestas de empleados en foros, y su licencia formal antigua fue retirada ([Adobe](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html)).

### Aritmética del presupuesto de render

Esta cuenta es INFERENCIA con supuestos explícitos. El informe anterior deja abierto el máximo de escenas 3D por video (propuesta 2-3 de 15-25); aquí se toma **3 escenas de 3 s a 24 fps = 216 fotogramas por video**, es decir, **2.592 fotogramas diarios para 12 videos**. Con una ventana nocturna de GPU de **4 h** (14.400 s, supuesto del usuario por confirmar), el tope es 14.400 / 2.592 ≈ **5,5 s por fotograma**. Animar "a doses" (12 fps efectivos) reduce a 1.296 fotogramas y sube el tope a ≈11 s. Si se renderizara **todo el video en 3D** (60 s a 30 fps = 1.800 fotogramas por video, 21.600 al día), el tope sería **≈0,67 s por fotograma**, régimen en el que solo three.js es plausible. La estimación de las notas para Blender (Eevee 1-10 s, Cycles con denoise 10-60 s por fotograma) implica que **Cycles (10-60 s) cuesta 7-43 h diarias a 2.592 fotogramas y queda fuera de la ventana**, mientras que Eevee solo cabe en la parte baja de su rango. Esa lectura se confirma o se refuta con el benchmark.

### Plan de medición en la RTX 3070 (≈1-2 horas)

Escena de prueba: 1080x1920, 5 s, 24 fps (120 fotogramas), con **10 figuras sin rostro** (y una segunda corrida con **200 instancias** de público), una luz de key con sombra, un rim light, un fondo plano, material emisivo del color de acento, un material "arcilla" (rugosidad alta) y fondo transparente en una segunda variante. La misma escena se construye en ambos motores con la misma paleta (hex fijos).

| Medición | Cómo | Se registra |
|---|---|---|
| Blender Eevee | `blender -b escena.blend -E <motor Eevee> -s 1 -e 10 -a` medido con `Measure-Command` (el nombre del motor depende de la versión: BLENDER_EEVEE_NEXT en 4.2-4.5 y BLENDER_EEVEE desde 5.0; verificar con `blender --help`) | segundos por fotograma (mediana de 10 tras descartar el primero), tiempo de arranque, VRAM (nvidia-smi) |
| Blender Cycles | OPTIX, 64 y 128 muestras con denoise, mismo `-b -a` | igual |
| three.js en Remotion | `npx remotion gpu`, luego render de 10 fotogramas con `--gl=angle` y con `swangle` | segundos por fotograma, tiempo de lectura de píxeles, VRAM, ¿usa GPU? |
| Alfa | render a PNG con alfa y a ProRes 4444/WebM VP9 alfa | bordes semitransparentes, artefactos de fotograma |
| Fidelidad de color | muestrear 5 hex de marca en el PNG | ΔE en OKLab contra el hex objetivo (K11) |
| Determinismo | renderizar dos veces y comparar con diff de píxeles | diferencia máxima (Remotion/HeyGen advierten diferencias de un píxel entre máquinas) |
| Calidad visual | 3 personas ciegas comparan sombras y "arcilla" | calificación 1-5 |

Criterios de decisión (propuestos): (1) si el tiempo por fotograma de un motor supera el tope (5,5 s con 3 escenas y 4 h), ese motor se limita a escenas "hero" o se descarta; (2) si three.js rinde ≤0,67 s por fotograma con GPU activa y calidad ≥ 3 de 5, puede cubrir todo el video; (3) si ambos son aceptables, gana la **calidad de sombras y materiales** para escenas con figuras y three.js gana para motion graphics, instancias y capas con alfa. Mientras no haya datos, la hipótesis de trabajo es un **camino mixto**: Blender (o three.js si pasa los criterios) para las 2-3 escenas 3D, three.js/Remotion para tarjetas animadas y composición de capas, y código de compositing para unir. Es una hipótesis, no una decisión.

## Presupuesto de tokens, ElevenLabs y Gemini para 12 videos diarios

### Arquitectura

El LLM solo interviene en dos pasos: tema a guion y guion a JSON de dirección con esquema fijo. Todo lo demás (paleta, composición, render, TTS, subtítulos, ensamblado con ffmpeg) es código determinista. Pasos concretos (INFERENCIA, coherente con las fuentes): (1) un módulo de ingesta entrega la nota de la noticia; (2) el LLM produce guion y JSON de dirección en una sola llamada con prompt cacheado (catálogo de plantillas y recetas); (3) un validador de esquema corrige en código y solo reintenta con el LLM si falla; (4) el generador de paletas (K) y el selector de layout (C) corren en código con la semilla del video; (5) ElevenLabs genera la voz por API; (6) render 3D y tarjetas; (7) ensamblado y revisión automática (contraste, zona segura, ΔE). La ejecución va en lote nocturno por API o `claude -p`, no en conversación interactiva. La API por lotes da **50 % de descuento** y se acumula con el caché ([Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)). Gemini ya se usa en el proyecto para análisis de video de noticieros, donde el costo lo dominó el video y no el modelo; no se verificaron precios actuales de Gemini Flash, así que aquí figura solo como pieza intercambiable para el guion de rutina (decisión abierta).

### Tokens y dinero

Precios por millón de tokens (entrada/salida): Sonnet 5.5 a 2/10 USD con lectura de caché a 0,10 USD; Haiku 5.5 a 0,10/0,50 USD; Opus 5.5 a 4/20 USD; escritura de caché a 1,25x (5 min) o 2x (1 h) ([Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)). El tokenizador nuevo produce ~30 % más tokens que el anterior (misma fuente). No hay cifras publicadas de tokens por video, así que las dos escenarios siguientes son supuestos míos.

| Escenario (Sonnet 5.5, por API) | Supuestos | Costo por video | 12/día y 30 días (360 videos) |
|---|---|---|---|
| Base (notas) | salida 1.500 tokens (guion ~300-350 + dirección ~900 + margen); entrada 1.000 sin caché + 5.000 en caché | 1.500×10/1M = 0,015; 1.000×2/1M = 0,002; 5.000×0,10/1M = 0,0005; **≈0,0175 USD** | **≈6,3 USD/mes** (≈0,21 USD/día) |
| Conservador (propio) | entrada 4.000 sin caché (artículo fuente), 5.000 en caché, salida 4.000 (reintentos y razonamiento) | 0,04 + 0,008 + 0,0005 ≈ **0,05 USD** | **≈18 USD/mes** (≈0,60 USD/día) |
| Base con Haiku 5.5 | los mismos tokens del escenario base | ≈0,002 USD | ≈0,7 USD/mes |
| Base por lotes (-50 %) | los mismos tokens del escenario base | ≈0,009 USD | ≈3,2 USD/mes |

Falta sumar las ~286 tokens de prompt de sistema por petición con herramientas (inmaterial) y la escritura de caché si el catálogo cambia (5.000 tokens a 2,50 USD/M = 0,0125 USD por escritura, una vez por lote). Los totales son pequeños frente a una sesión interactiva de Claude Code, que reenvía contexto en cada turno; por eso lo que gasta cuota es la conversación y no la tarea. Max a 100 USD/mes incluye 100 USD en créditos API ([Claude pricing](https://claude.com/pricing)), muy por encima de los 6-18 USD estimados. Anthropic no publica cifras absolutas de cuota de Claude Code en Pro ni en Max; el uso real se mide con `/usage` sobre un lote real. Las cifras de autoinformes de blogs (~0,05 USD de guion + ~0,50 USD de voz) son anecdóticas y no verificadas ([dev.to](https://dev.to/wedgemethoddev/how-i-automated-a-faceless-youtube-channel-that-runs-without-me-code-architecture-1fn8)).

### ElevenLabs

Planes mensuales: Starter 6 USD (30.000 créditos), Creator 22 USD (121.000), **Pro 99 USD (600.000)**, Scale 299 USD (1,8 M); v3 y Multilingual v2 cuestan 1 crédito por carácter, y Flash/Turbo 0,5 por API ([ElevenLabs](https://elevenlabs.io/pricing)). Supuesto de texto: ≈800 caracteres de guion por video (≈130 palabras, ≈50 s a ~150 palabras por minuto; el cálculo de ritmo es mío).

| Escenario | Créditos al mes | Plan |
|---|---|---|
| 12 × 800 × 30, modelo de 1 crédito/car. | **288.000** | Pro (48 % del plan; ≈0,275 USD por video a 99 USD/mes) |
| 12 × 1.100 (guion de 75 s) × 30 | 396.000 | Pro (66 %) |
| Anterior más 20 % de repeticiones | ≈475.000 | Pro (79 %) |
| 12 × 800 × 30, Flash/Turbo por API (0,5) | 144.000 | Creator (121.000) se queda corto en ~23.000; Pro sigue siendo el plan seguro |

Creator solo cubre ~3,7 videos diarios a 1 crédito por carácter. Quedan sin verificar la tarifa por crédito de sobreuso, el plan anual y la calidad de Flash/Turbo en español. En el proyecto ya está decidido ElevenLabs para la voz del agente de video, con Kokoro/Piper/Azure como respaldo.

## Integración con el informe anterior sin contradecirlo

El informe anterior ("Reglas de dirección visual para video corto") fija la escalera de cobertura, los cuatro esquemas, el ritmo, el sistema de variación y el plan de calibración. Este informe no cambia ninguna de esas reglas; **añade parámetros de composición y color debajo de ellas**. Regla de precedencia: lo que difiere entre ambos se resuelve con el valor más estricto, y la tabla siguiente indica cada reconciliación.

| Tema | Informe anterior | Esta ronda | Valor integrado |
|---|---|---|---|
| Caja segura | conservadora x 120-900, y 250-1260; estándar hasta y 1400 | x 120-960, y 288-1250 | **x 120-900, y 288-1260** por defecto; estándar hasta 1400 solo tras prueba en teléfono (C1) |
| Subtítulos, ancho | ≤850 px | ≤840 px | **≤840 px** |
| Subtítulos, posición | y≈1050-1250 | base a 480-560 px del borde inferior (y≈1360-1440) | y≈1050-1250 por defecto; la otra va en el experimento E2 (C12) |
| Cuerpo de subtítulo | ~65 px | 42 px (tercer nivel) | 64-65 px para subtítulos; **42-44 px solo para rótulos** |
| Jerarquía tipográfica | cifra héroe 160-220 px; etiquetas ≥44-48 px | escala 96/64/42 | **160-220 (cifra) / 96 (título) / 64 (subtítulo) / 44 (rótulo)**, con máximo 4 tamaños (C7) |
| Elementos activos | ≤3 grupos de texto simultáneos (R20) | ≤3 activos, 4 tope | **≤3 activos y 4 tope duro**, contando escena (C2) |
| Separación | no especificada | ≥24 px o solape ≥25 % | se añade (C8) |
| Color semántico | evitar rojo/verde como único canal (R23) | ✓ verde y ✗ rojo del video de Alcaide | **se conserva ✓/✗ con forma y texto**, Okabe-Ito sobre oscuro y versiones oscuras sobre crema (K9) |
| Elementos fijos de marca | logo, tipografías, 1-2 acentos, 20-30 % del look fijo | ancla de acento y neutros fijos; dominante rota ±15-30° | **compatible**: el acento y los neutros son parte del 20-30 % fijo; el dominante es parte del eje "paleta secundaria" (K4) |
| Estilo de recreación 3D | un color de acento por emoción; HDRI y acento en el .blend | rim light = acento; view transform Standard | el JSON de paleta alimenta el .blend o la escena three.js; el acento por tipo de noticia sigue en la plantilla (K11) |
| Cadencia | cambio cada 2,5-4 s | no cambia | sin cambios; C13 solo añade ≥300-400 ms entre entradas |
| Variación entre videos | ≥3 de 6 ejes distintos, MMR | paleta rotada con ancla | la paleta pasa a ser un eje más de la huella; se guarda en la huella (R28) |
| Etiqueta "Recreación ilustrativa" | fija en pantalla (R6) | no cambia | cuenta como elemento de texto: va en la caja segura y no se anima; debe respetar contraste K6 |

Los experimentos E1-E5 del informe anterior se amplían con tres: **E6** (franja de subtítulos 1050-1250 contra 1360-1440, que es E2 con la variante de esta ronda), **E7** (scrim de α calculada contra α fija de 70 %) y **E8** (con y sin indicador de pasos arriba). La huella de cada video añade: paleta (hex y offsets armónicos), anclas de layout elegidas, J del candidato ganador y el desglose de la función de costo. Con ese registro, la correlación entre J y retención se vuelve el primer dato propio para calibrar los pesos.

## Decisiones abiertas para el usuario

1. **Caja segura.** ¿Se acepta la intersección x 120-900 / y 288-1260 como defecto, y en qué dispositivos reales se prueba para confirmarla?
2. **Subtítulos.** ¿Franja y≈1050-1250 (conservadora) o más abajo (1360-1440) si la prueba en teléfono lo permite?
3. **Pesos de composición.** ¿Quién califica las 20-30 composiciones de calibración y cuál es el umbral de aceptación de la correlación?
4. **Marca de color.** ¿Se fija el amarillo #F0E442 como acento de marca, o se deja un acento fijo por tipo de noticia (farándula, política, deportes)? ¿Qué colores se evitan por tema (partidos, equipos)?
5. **Tarjeta crema con acento amarillo.** ¿Se acepta que el acento amarillo no se use como texto sobre crema (1,11:1) y que ✓/✗ tengan versiones oscuras sobre crema?
6. **Indicador de pasos.** ¿Se incluye en todos los videos o solo en los explicativos (E8)?
7. **Motor 3D.** ¿Se ejecuta el benchmark de 1-2 horas antes de decidir? ¿Cuántas horas de GPU por noche se pueden dedicar (el tope de 5,5 s por fotograma supone 4 h)?
8. **Cantidad de escenas 3D por video.** ¿3 de 3 s a 24 fps (supuesto), 2, o "a doses"?
9. **Motor para tarjetas animadas.** ¿Remotion (three.js/CSS) para tarjetas y composición, o seguir con el flujo actual?
10. **Presupuesto de modelo.** ¿Sonnet 5.5 para guion y dirección, Haiku 5.5 para el guion de rutina, o Gemini Flash (precio por verificar)? ¿Se acepta la ejecución en lote nocturno con descuento de 50 %?
11. **Plan de ElevenLabs.** ¿Pro (99 USD/mes) desde el inicio, o Creator (22 USD) mientras se mide el consumo real (≈3,7 videos al día)? ¿Modelo de 1 crédito por carácter o Flash/Turbo, tras una prueba ciega en español?
12. **Videos de referencia.** ¿Qué 3-5 videos sirven de referencia para extraer parámetros (A2)? ¿Se autoriza medirlos por código?
13. **Estilos de la galería.** ¿Cuántos estilos entran como mínimo (el video de Alcaide usa 10) y cuáles son imprescindibles?
14. **Dónde viven la huella y la paleta.** ¿En disco local o en Drive, para que otras máquinas la compartan?

## Conclusión

La lección más útil de estas notas es que **el texto, no la figura, es la masa que manda en un video sin rostros**: con una atracción de mirada de 11,1 veces frente a regiones comparables y subtítulos que absorben más del 40 % del tiempo de lectura, la composición se gana o se pierde en dónde se ubican cifras, rótulos y subtítulos, y en su contraste, no en la escena 3D. Por eso la función de costo da el mayor peso a la zona segura, la oclusión de la silueta y la jerarquía, y por eso el acento amarillo del video de Alcaide exige una regla propia: una paleta que funciona sobre fondo oscuro (13,7:1) puede ser ilegible sobre las tarjetas crema del mismo diseño (1,11:1).

El segundo hallazgo es que la pregunta cara no es la que parecía. Los tokens cuestan céntimos y ElevenLabs cabe con holgura en el plan Pro; lo que decide la arquitectura es si la RTX 3070 renderiza un fotograma de escena 3D en menos de unos 5,5 segundos (con 3 escenas por video y 4 horas nocturnas) o en menos de ~0,7 segundos (si todo el video fuera 3D). Un benchmark de una a dos horas resuelve esa incógnita, y cada coeficiente que hoy es inferencia puede reemplazarse por un número medido si se guarda desde el primer video la huella con paleta, anclas de layout y costo J.

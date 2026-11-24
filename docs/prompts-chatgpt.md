# Prompts para generar las piezas en ChatGPT (sin API)

Todo se genera a mano en ChatGPT con la suscripción fija. Los prompts están en inglés (los modelos de imagen lo siguen mejor); las instrucciones, en español.
ChatGPT tiene límites de uso de imágenes por ventana de tiempo (revisa los tuyos). Si se niega a generar el rostro de una persona real, no lo fuerces: avísame y vemos otra vía.

## Qué se genera y cuántas veces

| Pieza | Cuántas | Para qué |
|---|---|---|
| 1. Cabeza de cada artista | 1 por artista (2-3 intentos) | Es lo único propio de cada artista |
| 2. Juego compartido dibujado (bocas, ojos, cejas, efectos) | UNA vez, sirve para todos | Las mismas bocas y emociones en todos los muñecos |

Los cuerpos, el uniforme y las manos ya son compartidos (no hay que generarlos otra vez).

---

## 1. Cabeza de cada artista

**Cómo:** un chat NUEVO por artista. Adjunta 3 a 5 fotos de referencia de la misma persona (de frente, buena luz, cara completa, sin lentes ni filtros). Pega este prompt (cambia `[HER/HIS]` y `[her/his]`):

```
Using the attached reference photos of the SAME person, create ONE clean studio portrait photograph of [HER/HIS]: facing straight to the camera, head perfectly upright and centered, looking directly at the lens, relaxed neutral expression with the lips gently closed, eyes fully open. Keep [her/his] real hairstyle, hair color and length exactly as in the references, with the hair falling naturally on both sides of the face and over the shoulders. Show the head, the neck and the bare shoulders down to the collarbones (no clothes visible, no jewelry, no glasses), the neck clearly visible. Plain flat light-gray studio background, soft even front lighting, no shadows on the background, sharp realistic photograph, same framing as an ID headshot. Preserve [her/his] real facial features, skin tone, eye color and eyebrows exactly as in the references. Portrait orientation 1024x1536. No text, no watermark.
```

**Revisa antes de aceptarla (checklist):**
- [ ] De frente, cabeza derecha y centrada (nada ladeada).
- [ ] Boca cerrada y relajada, ojos abiertos mirando al lente.
- [ ] Cuello y hombros desnudos visibles; sin collares, aretes grandes ni lentes.
- [ ] Fondo gris liso, sin sombras, y el borde del pelo se distingue del fondo.
- [ ] Se parece a la persona (si no, pide: "Regenerate keeping the facial features closer to the references: [lo que falle]").

**Entrega:** guárdala como `<slug>-cabeza.png` (ej. `ninel-conde-cabeza.png`) y pásamela. Yo mido su geometría y la armo.

---

## 2. Juego compartido dibujado (una sola vez)

**Cómo:** un chat NUEVO para todo el juego (así el estilo no cambia entre hojas). Primero pega la **biblia de estilo**; cuando ChatGPT confirme, pega una hoja a la vez en ese mismo chat.

### 2.0 Biblia de estilo (pégala primero)

```
I need a set of 2D facial-feature "stickers" for a cut-out puppet, all in ONE consistent style. Memorize this style and apply it to every sheet I ask for next:
- Clean flat 2D cartoon with an anime lean, like die-cut stickers.
- One uniform dark outline (very dark brown #2B1A1A), medium-thick and the SAME thickness on every element, rounded line ends.
- Flat color fills only: no gradients, no textures, no soft shadows. One small white highlight allowed on eyes and tongue.
- Palette: lips/mouth outline #2B1A1A, mouth interior #5A1620, teeth #FFFFFF with thin light-gray separations, tongue #E86A74, lip pink #E8707A, eyebrows #3B2417, eye white #FFFFFF, iris dark brown #3A2218, blush #F08A80, tear/sweat blue #7FC8F8.
- Every sheet: PURE flat chroma-key green background #00FF00, a clean grid with generous empty space between cells, every element the same scale and centered in its own cell, nothing touching or overlapping, no labels, no text, no cell borders, no shadows.
- Elements are drawn FRONT VIEW and symmetrical unless I say otherwise. Square image 1024x1024.
Reply only "ready".
```

### 2.1 Hoja de bocas del habla (11 celdas)

```
Sheet 1 — MOUTH SHAPES for speech. 4 columns x 3 rows (11 mouths + 1 empty cell). All mouths exactly the same width, same center point, same outline, same style as the memorized style. In reading order:
1 Neutral: closed relaxed lips with a very slight smile.
2 Aa: mouth wide open as saying "ahh", upper teeth visible, tongue visible.
3 Ee: wide mouth, lips stretched, upper and lower teeth together visible, jaw barely open.
4 Oh: rounded open "O", teeth barely visible, tongue slightly visible.
5 Woo: small tight rounded pucker.
6 M: lips pressed together, a straight closed line.
7 F: upper teeth resting on the lower lip.
8 D: slightly open, upper teeth visible and the tongue tip behind them.
9 S: teeth clenched together and visible, lips slightly parted.
10 Uh: small relaxed open mouth, slight jaw drop.
11 R: slightly open, lips a little rounded and tense, upper teeth slightly visible.
```

### 2.2 Hoja de bocas de emoción (9 celdas)

```
Sheet 2 — EMOTION MOUTHS. 3 columns x 3 rows, same width, same center point, same style. In reading order:
1 Happy: big open smile showing teeth, cheeks implied by the curve.
2 Surprise: large round open "O".
3 Sad: lips pressed, corners strongly turned down, slight quiver on the lower lip.
4 Angry: tense mouth, teeth clenched and visible, corners down.
5 Doubt: small mouth pushed to ONE side, lips pursed (asymmetric).
6 Proud: closed confident smirk, one corner slightly higher (asymmetric).
7 Disgust: upper lip raised showing upper teeth, corners pulled down, slightly wavy.
8 Worried: lips pressed together and slightly wavy, corners slightly down.
9 Love: soft warm gentle smile, closed lips.
```

### 2.3 Hoja de ojos (12 celdas) — UN ojo por celda (yo lo espejo)

```
Sheet 3 — EYES. Draw ONE eye per cell (the viewer's RIGHT eye, as seen from the front), 4 columns x 3 rows, all the same width, same iris position and same style. In reading order:
1 Open neutral, small white highlight in the iris.
2 Closed (blink): a single downward-curved lid line with a few short lashes.
3 Happy closed: an upward arch "^" (smiling eye).
4 Wide surprised: big round eye, tiny pupil, lots of white all around the iris.
5 Angry: upper lid slanted down toward the nose, intense iris.
6 Sad: drooping upper lid, big shiny iris looking down.
7 Proud: half-closed lid, calm iris, relaxed.
8 Disgusted: squinting eye drawn as a ">" shape.
9 Worried: wide iris looking slightly up, lid raised on the inner side.
10 Loving: a pink heart-shaped pupil with sparkles.
11 Doubtful: half-lidded eye looking sideways.
12 Tearing: sad eye with a glossy iris and one tear welling at the bottom lid.
```

### 2.4 Hoja de cejas (8 celdas) — UNA ceja por celda (la derecha)

```
Sheet 4 — EYEBROWS. ONE eyebrow per cell (the viewer's RIGHT eyebrow), 4 columns x 2 rows, same length, same thickness, same color #3B2417, tapered ends. In reading order: 1 neutral gentle arch; 2 raised high (surprise); 3 angry (slanted down toward the nose); 4 sad (inner end raised, outer end lowered); 5 worried (strongly raised inner end); 6 doubt (one high arch); 7 proud (relaxed, slightly raised); 8 disgust (low and slightly slanted).
```

### 2.5 Hoja de efectos (12 celdas)

```
Sheet 5 — EFFECT STICKERS. 4 columns x 3 rows, same style. In reading order: 1 blush mark for a cheek (soft oval with 2-3 short diagonal lines); 2 anger vein (red "cross" pop mark); 3 sweat drop; 4 single teardrop; 5 two small teardrops side by side; 6 sparkle star (4 points, yellow); 7 three small sparkles; 8 pink heart; 9 two small hearts; 10 question mark; 11 exclamation mark; 12 small steam puff.
```

**Cómo mantener el estilo:** todas las hojas en el MISMO chat. Si alguna se desvía, pega otra vez la biblia de estilo y pide: "Regenerate Sheet N in exactly the memorized style". Si una celda sale mal, pide solo esa: "Redraw only cell K of the last sheet, same style, same position".

**Entrega:** descarga cada hoja como PNG y guárdala como `compartido-bocas-habla.png`, `compartido-bocas-emocion.png`, `compartido-ojos.png`, `compartido-cejas.png`, `compartido-efectos.png`. Yo las recorto en piezas y las armo (no se vuelve a generar nada por artista).

---

## Orden recomendado
1. Haz el juego compartido (sección 2) UNA vez y pásamelo: lo pruebo en la cabeza de Leidy y lo ajustamos.
2. Luego generas las cabezas (sección 1) de los artistas que más usas, de a uno.
3. Con 20 artistas son unas 20-60 imágenes de cabeza; el resto sale del juego compartido.

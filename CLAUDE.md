# Motor EDL de video de farándula: reglas del producto y protocolos

Este clon (`feat/edl-motor`) es el motor de video narrativo. NUNCA tocar la carpeta de la app viva de farandula. Idioma: español neutro (ecuatoriano), nunca de España ni voseo.

## Reglas del producto (decididas por la dueña del canal; no se renegocian)
1. **La protagonista NO habla con la voz del narrador.** Solo REACCIONA a lo que escucha (gestos, miradas, parpadeo, emociones). Su boca solo se sincroniza donde el guion la CITA (comillas « » “ ” " " o `beat.cita: true`). Código: `lienzo/citas.js` + `scripts/video-narrativo.js` (`--lipsync-total` solo para pruebas). Sin citas, la boca queda en reposo.
2. **3 s máximo por clip real** (innegociable por uso legítimo; el código lo cumple, la razón es legal).
3. **Sin menores:** `--nacimiento YYYY-MM-DD` (Leidy_Alvarez: 2006-11-30); los clips de antes de los 18 se excluyen.
4. **Nunca clonar voces reales.** Fotos de personas reales y citas textuales pasan por revisión de un abogado ecuatoriano antes de publicar. Hechos sensibles (familia, vida sentimental) con revisión humana. El audio actual todavía nombra a los padres: no publicable.
5. **Composición:** el video NUNCA va detrás del muñeco; con video, ventana flotante (~.56 de ancho) y solo tarjetas pequeñas de datos, tan abajo como la zona segura permita; sin video, el muñeco o la animación grande va al centro. Subtítulos en zona segura legible. Las expresiones nunca quedan tapadas.
6. **Muñeco = marionetas tipo Adobe Character Animator:** piezas sueltas movidas por código (cinemática inversa, resortes), NO una imagen regenerada por pose. Sin bailes de moda (no mantener movimientos). El pelo va detrás de la espalda (capa aparte).
7. **Estilo del muñeco actual:** rig de FOTOS (`assets/foto-rig`, traje `bastonera-foto`) con borde blanco tipo sticker. La plastilina y los dibujos vectoriales están DESCARTADOS (no volver a proponerlos).
8. **Uniones (hombro, codo, muñeca, cadera, cuello):** doble perfil. Cada pieza lleva su extremo redondo y se solapa con la siguiente; el pivote está en la unión; la pieza del torso va encima del brazo; manos como piezas aparte (relajada, abierta, puño, señalar) detrás del puño; codo en ángulo marcado, no curvo.
9. **Idioma/copy:** español neutro; el modo de respuesta del asistente es conciso.

## Protocolo ANTES de mostrar algo al usuario (checklist obligatorio)
- [ ] `npm test` en verde (reportar el número real de tests).
- [ ] Si cambió algo visible: renderizar y MIRAR la imagen (hoja `scripts/rig-prueba-foto.js`, cara `scripts/rig-cara-foto.js`, bocas `scripts/rig-bocas-foto.js`, o un tramo de video). Nunca afirmar "se ve bien" sin haber abierto la imagen.
- [ ] En video: correr `node scripts/qa-cuadros.js <video.mp4>` (detecta pantallas vacías) y revisar la hoja de cuadros que genera.
- [ ] Contrastar con la lista de reglas de arriba: ¿habla la protagonista sin cita? ¿video detrás del muñeco? ¿subtítulos tapados? ¿cortes visibles en uniones?
- [ ] Decir con honestidad lo que sigue mal (no solo lo que funciona) y lo que NO se verificó (p. ej. "no lo vi en movimiento", "no escuché el audio").
- [ ] Commit con la línea `Co-Authored-By` indicada, `git push` y VERIFICAR que `HEAD == origin/feat/edl-motor` (`git fetch` + `git rev-parse HEAD origin/feat/edl-motor`).
- [ ] Gasto externo (Gemini imágenes, etc.): avisar cuánto se usó.

## Protocolo para nuevas piezas gráficas
1. Primero probar UNA pieza o pose y mostrarla; recién con el visto bueno hacer el resto.
2. Si el usuario dice "se ve feo", no insistir: volver a la última versión aprobada y proponer UNA alternativa distinta.
3. Cada corrección repetida por el usuario se guarda aquí (regla) y en la memoria (`feedback`), para no repetirla.

## Ejecución
- `node scripts/video-narrativo.js --sin-llm --nacimiento 2006-11-30 --salida data-motor/lamina/x.mp4` (flags: `--hasta`, `--sin-clips`, `--sin-montaje`, `--cabeza rig-foto|plastilina|fotos`, `--lipsync-total`).
- El modelo de Gemini que elige clips necesita saldo en el proyecto `gen-lang-client-0790456846` (no el de Drive); si responde 402 el video sale casi sin clips y con huecos.
- Kit del rig de fotos: `node scripts/kit-foto-rig.js` (piezas desde `assets/kit`); bocas: `scripts/bocas-generar.js` + `scripts/bocas-elegir.js`; manos: `scripts/manos-generar.js`.

## Storyboard (experto en guion visual) — `edl/storyboard.js` + `edl/reacciones.json`
- Corre después del director y antes de ensamblar (`scripts/video-narrativo.js`; `--sin-storyboard` lo apaga). No gasta tokens: son reglas. Escribe `<video>.storyboard.md` (tabla por frase: pantalla, muñeco, plano, emoción, gestos, motivo) para revisar y aprobar.
- **El muñeco nunca va solo ni parado:** acompaña a los mapas/escenarios (comentarista abajo, señalando el dato), a las cifras/listas con carga emocional, y en toda frase con muñeco hace al menos una reacción o gesto de escucha. Un dato chico sin reacción va solo, con tomas de video (variedad).
- **Plantillas de reacción** (`edl/reacciones.json`, editable): qué le gusta (triunfo, orgullo, agradecimiento, fiesta), qué le duele (decepción, polémica, rechazo, preocupación) y neutros (duda, asombro, chisme). Si el logro es de OTRA persona con nombre propio → plantilla `rival` (inquietud, no celebra). `protagonista.alias` lista las palabras que nombran a la protagonista.
- **Planos de cámara:** cuerpo, lado, compañero (abajo), medio y PRIMER PLANO (solo reacciones fuertes, con enfriamiento de 3 frases), con movimiento suave (resortes). El muñeco cae SOLO la primera vez; después entra con fundido.
- **Emociones fotográficas** (por persona, `assets/foto-rig-<slug>`): feliz, sorpresa, triste, enojo, duda, orgullo, asco, preocupación, amor (`scripts/emociones-generar.js` + `scripts/bocas-elegir.js`). Gestos nuevos: senala_arriba, cabeza, menton, asiente.
- Para otra persona: `scripts/personas-foto.js` (geometría), generar cabeza (`cabeza-persona-generar.js`), bocas y emociones, `kit-foto-rig.js --persona <slug>`; `--persona` o la carpeta de la biblioteca eligen el muñeco.

### Reglas de composición añadidas (2026-11-24)
- **El muñeco debe aportar:** una frase con muñeco sin reacción, sin dato que señalar y que no abre ni cierra el video se convierte en principal `video` (tomas reales que ilustren). El muñeco solo se queda si hay algo que sentir/señalar o si no hay video disponible.
- **Lados:** el muñeco ocupa un lado (cuerpo/medio/primer plano/escenario, `lado: izq|der`, espejado con `espejo`) y las insignias/el escenario van al lado contrario; el lado cambia cada vez que el muñeco vuelve tras otra pieza. El comentarista de los mapas va centrado abajo.
- **Subtítulos:** una línea más arriba (y0 = 10.5 % − 1 línea) y máximo 2 líneas por bloque; el mapa con acompañante es más corto (alto .32) para no chocar.
- **Marcas sobre el video:** el círculo rojo solo va si el rostro se ve (r ≥ 0.17) y la palabra ancla habla de la protagonista (alias/corona/reina…); si no, la toma va sin marca (aviso en el log).
- **Pelo de atrás:** gira exactamente con la cabeza (`peloSigue`); si se desfasa, sobresale como una segunda pieza.

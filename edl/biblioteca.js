// Biblioteca de clips reales: descarga la carpeta de una persona (caché local), ETIQUETA cada clip por contenido con Gemini
// (qué se ve, vestuario, lugar, texto en pantalla, dónde está el rostro) y elige qué clip ilustra cada frase.
// Reglas: el modelo NO identifica a nadie por su cara (el dueño de la carpeta es la persona principal); un clip se usa como
// máximo 3 s por aparición (regla de uso legítimo del proyecto); las etiquetas se guardan en caché y se pagan una sola vez.
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', 'data-motor', 'biblioteca');
const USO_MAX_S = 3.0; // regla innegociable: ningún clip real se muestra más de 3 s seguidos
const TIPOS = ['selfie_hablando', 'baile', 'desfile', 'concurso_belleza', 'evento', 'entrevista', 'historia_instagram', 'musica', 'paisaje', 'otro'];

// El id de un video de TikTok guarda su fecha: nombre "cuenta_<epoch>_<id>.mp4" (el epoch en segundos es el 3.º grupo).
function fechaDeNombre(nombre) {
  const m = String(nombre).match(/_(1[5-9]\d{8})_\d{15,}/);
  return m ? new Date(parseInt(m[1], 10) * 1000).toISOString().slice(0, 10) : null;
}

async function descargarCarpeta(drive, nombreCarpeta, { max = Infinity, progreso = null } = {}) {
  const carpetas = await drive.obtenerCarpetasFamosos(), id = carpetas[nombreCarpeta];
  if (!id) throw new Error(`no existe la carpeta "${nombreCarpeta}" en la biblioteca`);
  const dir = path.join(RAIZ, nombreCarpeta); fs.mkdirSync(dir, { recursive: true });
  const videos = (await drive.listarVideos(id)).slice(0, max), out = [];
  for (const [i, v] of videos.entries()) {
    const destino = await drive.descargarVideo(v.id, dir);
    out.push({ id: v.id, name: v.name, ruta: typeof destino === 'string' ? destino : destino.path || destino.ruta, duracion: v.duracion, fecha: fechaDeNombre(v.name) });
    if (progreso) progreso(i + 1, videos.length);
  }
  return out;
}

const PROMPT_ETIQUETA = `Analiza este video corto (de la cuenta de una creadora de contenido). Describe SOLO lo que se ve y se oye. NO identifiques a nadie por su rostro ni inventes nombres: la persona principal es la dueña de la cuenta.
Responde SOLO JSON:
{"descripcion":"1-2 frases de lo que se ve y ocurre",
 "tipo":"${TIPOS.join('|')}",
 "vestuario":["prendas o accesorios llamativos que se vean: uniforme, corona, banda, vestido, bastón..."],
 "lugar":"escenario o lugar si se distingue (coliseo, calle, plaza, casa, estudio...) o vacío",
 "personas":numero de personas visibles,
 "texto_en_pantalla":"texto legible superpuesto o vacío",
 "dice":"resumen de lo que se dice (1 frase) o vacío",
 "rostro":{"visible":true,"t":segundo en que el rostro principal se ve mejor,"cx":0.5,"cy":0.4,"r":0.2}}
En "rostro": cx, cy = centro del rostro y r = radio, todos de 0 a 1 relativos a las dimensiones del cuadro en ese segundo t.`;

function llamarGeminiVideo(ruta) {
  const gemini = require('../gemini');
  return gemini.parteMultimodal('video', ruta).then(partes => gemini.llamarJSON(PROMPT_ETIQUETA, [...partes, { text: 'Analiza el video.' }], gemini.TAREAS.etiquetaClip));
}


// ETIQUETADO POR CUADROS (barato): en vez de subir el video entero (1 cuadro/s + audio), se mandan N cuadros al azar (uno por tramo del clip, así cubren toda la toma).
// Pierde lo que se DICE en el audio ("dice" queda vacío); el resto de la etiqueta sale igual. N=4 por defecto (env CUADROS_POR_CLIP).
const PROMPT_CUADROS = PROMPT_ETIQUETA.replace('Analiza este video corto', 'Analiza estos cuadros tomados al azar de un video corto').replace('"dice":"resumen de lo que se dice (1 frase) o vacío",', '"dice":"",').replace('"t":segundo en que el rostro principal se ve mejor', '"cuadro":número del cuadro (1 a N) donde el rostro principal se ve mejor').replace('relativos a las dimensiones del cuadro en ese segundo t.', 'relativos a las dimensiones de ESE cuadro.');
function cuadrosAlAzar(ruta, duracion, n = Number(process.env.CUADROS_POR_CLIP) || 4) {
  const FFM = process.env.FFMPEG_BIN || require('ffmpeg-static'), d = Math.max(0.5, duracion || 3), out = [];
  for (let i = 0; i < n; i++) {
    const t = +((i + Math.random()) * d / n).toFixed(2), tt = Math.min(t, Math.max(0, d - 0.1));
    try { const b = require('child_process').execFileSync(FFM, ['-v', 'error', '-ss', String(tt), '-i', ruta, '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '4', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-'], { maxBuffer: 1 << 24 }); if (b.length) out.push({ t: tt, data: b.toString('base64') }); } catch (e) { /* cuadro ilegible: se omite */ }
  }
  return out;
}
async function llamarGeminiCuadros(ruta, clip) {
  const gemini = require('../gemini'), cuadros = cuadrosAlAzar(ruta, clip && clip.duracion);
  if (!cuadros.length) throw new Error('sin cuadros legibles');
  const partes = []; cuadros.forEach((c, i) => { partes.push({ text: 'Cuadro ' + (i + 1) + ' (segundo ' + c.t + '):' }); partes.push({ inlineData: { mimeType: 'image/jpeg', data: c.data } }); });
  const r = await gemini.llamarJSON(PROMPT_CUADROS.replace('1 a N', '1 a ' + cuadros.length), [...partes, { text: 'Analiza los cuadros.' }], gemini.TAREAS.etiquetaClip);
  if (r && r.rostro && r.rostro.cuadro != null) { const c = cuadros[Math.min(cuadros.length, Math.max(1, Math.round(+r.rostro.cuadro))) - 1]; r.rostro.t = c ? c.t : 0; }
  return r;
}

function limpiarEtiqueta(r, clip) {
  const num = (x, a, b, d) => (Number.isFinite(+x) ? Math.min(b, Math.max(a, +x)) : d);
  const rostro = r.rostro && r.rostro.visible !== false ? { t: num(r.rostro.t, 0, Math.max(0, (clip.duracion || 3) - 0.1), 0), cx: num(r.rostro.cx, 0, 1, 0.5), cy: num(r.rostro.cy, 0, 1, 0.4), r: num(r.rostro.r, 0.02, 0.6, 0.2) } : null;
  return { id: clip.id, name: clip.name, fecha: clip.fecha, duracion: clip.duracion, descripcion: String(r.descripcion || '').slice(0, 300), tipo: TIPOS.includes(r.tipo) ? r.tipo : 'otro',
    vestuario: (Array.isArray(r.vestuario) ? r.vestuario : []).map(String).slice(0, 6), lugar: String(r.lugar || '').slice(0, 80), personas: Math.round(num(r.personas, 0, 50, 1)),
    texto_en_pantalla: String(r.texto_en_pantalla || '').slice(0, 160), dice: String(r.dice || '').slice(0, 200), rostro };
}

// clips: salida de descargarCarpeta. cache: ruta del JSON {id: etiqueta}. Reintenta cada clip una vez y sigue si falla.
async function etiquetarClips(clips, { cache, etiquetador = (process.env.ETIQUETAR_VIDEO_COMPLETO ? llamarGeminiVideo : llamarGeminiCuadros), concurrencia = 3, progreso = null } = {}) {
  const guardadas = cache && fs.existsSync(cache) ? JSON.parse(fs.readFileSync(cache, 'utf8')) : {}, fallos = [];
  const pendientes = clips.filter(c => !guardadas[c.id]); let hechas = 0;
  const trabajar = async c => {
    for (let intento = 0; intento < 2; intento++) {
      try { guardadas[c.id] = limpiarEtiqueta(await etiquetador(c.ruta, c), c); break; } catch (e) { if (intento) fallos.push({ id: c.id, name: c.name, error: e.message }); }
    }
    if (progreso) progreso(++hechas, pendientes.length);
    if (cache) fs.writeFileSync(cache, JSON.stringify(guardadas, null, 1));
  };
  const cola = [...pendientes];
  await Promise.all(Array.from({ length: Math.min(concurrencia, cola.length) }, async () => { while (cola.length) await trabajar(cola.shift()); }));
  return { etiquetas: guardadas, fallos };
}

// ── Elegir qué clip ilustra cada frase ───────────────────────────────────────────────────────────
const lineaDeClip = e => `${e.id} | ${e.fecha || '?'} | ${e.tipo} | ${e.descripcion}${e.vestuario.length ? ` | viste: ${e.vestuario.join(', ')}` : ''}${e.lugar ? ` | lugar: ${e.lugar}` : ''}${e.texto_en_pantalla ? ` | texto: ${e.texto_en_pantalla}` : ''} | ${Math.round(e.duracion || 0)}s`;

const PROMPT_ELEGIR = (catalogo, errores, protagonista) => `Eres editor de video de farándula. Los clips son SOLO de ${protagonista || 'la protagonista'}. Para cada frase del guion, elige el clip REAL que mejor la ilustra, o null si ninguno calza de verdad.
Catálogo (id | fecha | tipo | descripción...):
${catalogo}
Reglas:
- Solo en frases cuyo SUJETO es ${protagonista || 'la protagonista'} (ella, su nombre, sus logros). En frases sobre OTRAS personas (otras concursantes, su antecesora, la virreina, etc.) la respuesta es null.
- Dos niveles: "exacta" = el clip muestra lo que la frase dice (vestuario, lugar, evento, época; si la frase menciona un año, prefiere clips de ese año); "relacionada" = no es ese momento pero es el mismo tipo de situación (otro desfile para "desfiló", otro vestido de gala para "vestido", otra toma hablando a cámara para una declaración). Prefiere siempre "exacta". Responde null SOLO si ningún clip se parece a lo que dice la frase: en ese caso el sistema pondrá una toma cualquiera de la protagonista, no inventes una relación.
- No repitas un clip en dos frases. Máximo ${USO_MAX_S} s por aparición: "ss" es el segundo de inicio (0 hasta duración − ${USO_MAX_S}).
- "motivo": una frase breve de por qué calza.
Responde SOLO JSON: {"frases":[{"beat":1,"clip":"<id>"|null,"nivel":"exacta"|"relacionada","ss":0,"motivo":"..."}]}${errores.length ? `\nTu respuesta anterior tuvo problemas, corrígelos:\n- ${errores.join('\n- ')}` : ''}`;

function llamarGeminiTexto(prompt, mensaje) { const gemini = require('../gemini'); return gemini.llamarJSON(prompt, mensaje, gemini.TAREAS.etiquetaClip); }

function validarElecciones(elecciones, beats, etiquetas) {
  const errores = [], usados = new Set();
  if (!Array.isArray(elecciones)) return ['la respuesta no trae "frases"'];
  for (const e of elecciones) {
    if (!Number.isInteger(e.beat) || e.beat < 1 || e.beat > beats.length) { errores.push(`beat ${e.beat}: no existe`); continue; }
    if (e.clip === null || e.clip === undefined) continue;
    const t = etiquetas[e.clip];
    if (!t) { errores.push(`beat ${e.beat}: el clip "${e.clip}" no está en el catálogo`); continue; }
    if (usados.has(e.clip)) errores.push(`beat ${e.beat}: el clip ${e.clip} ya se usó en otra frase`);
    usados.add(e.clip);
    if (!Number.isFinite(e.ss) || e.ss < 0 || e.ss + USO_MAX_S > (t.duracion || 0) + 0.05) errores.push(`beat ${e.beat}: ss=${e.ss} no cabe en un clip de ${Math.round(t.duracion || 0)} s (necesita ${USO_MAX_S} s)`);
    if (!String(e.motivo || '').trim()) errores.push(`beat ${e.beat}: falta el motivo`);
  }
  return errores;
}

// Se queda con lo VÁLIDO (el primer uso de cada clip, inicio que cabe, motivo) y descarta lo malo, en vez de tirar toda la respuesta.
function filtrarElecciones(frases, beats, etiquetas) {
  const ok = [], descartes = [], usados = new Set();
  for (const e of Array.isArray(frases) ? frases : []) {
    const errs = validarElecciones([e], beats, etiquetas);
    if (e && e.clip && usados.has(e.clip)) errs.push('beat ' + e.beat + ': el clip ' + e.clip + ' ya se usó en otra frase');
    if (errs.length) { descartes.push(...errs); continue; }
    if (e.clip) usados.add(e.clip);
    ok.push(e);
  }
  return { ok, descartes };
}

// → Map beat(0-based) → { id, ss, motivo }. Sin modelo o sin nada válido: ninguna frase usa clip (nunca se inventa uno).
async function elegirClips(beats, etiquetas, { llamar = llamarGeminiTexto, maxReintentos = 1, protagonista = null } = {}) {
  const lista = Object.values(etiquetas).filter(e => (e.duracion || 0) >= USO_MAX_S);
  const avisos = []; if (!lista.length) return { elecciones: new Map(), avisos: ['la biblioteca no tiene clips etiquetados de al menos 3 s'] };
  const catalogo = lista.map(lineaDeClip).join('\n'), mensaje = JSON.stringify(beats.map((b, i) => ({ beat: i + 1, frase: b.frase })));
  let errores = [];
  for (let intento = 0; intento <= maxReintentos; intento++) {
    let r; try { r = await llamar(PROMPT_ELEGIR(catalogo, errores, protagonista), mensaje); } catch (e) { avisos.push(`el modelo falló (${e.message})`); break; }
    const { ok, descartes } = filtrarElecciones(r && r.frases, beats, etiquetas); errores = descartes;
    const hechas = new Map(ok.filter(f => f.clip).map(f => [f.beat - 1, { id: f.clip, ss: f.ss, motivo: f.motivo, nivel: f.nivel === 'relacionada' ? 'relacionada' : 'exacta' }]));
    if (!descartes.length) return { elecciones: hechas, avisos };
    if (intento === maxReintentos && hechas.size) { avisos.push('se descartó lo inválido: ' + descartes.join('; ')); return { elecciones: hechas, avisos }; }
  }
  avisos.push('sin clips reales (' + (errores.join('; ') || 'sin respuesta') + ')');
  return { elecciones: new Map(), avisos };
}

// ── Relleno con criterio (nivel 3): cuando ninguna toma se relaciona con la frase, va una toma cualquiera de la protagonista, pero que SEA de ella ──
// Es de la protagonista si sale sola y su rostro se ve (r ≥ 0.12 del ancho), o con otra persona pero con su rostro grande (r ≥ 0.22). Primero esas, de acción antes que "otro", rostro grande antes que pequeño; las demás solo si faltan.
const esDeLaProtagonista = t => { const n = t.personas == null ? 1 : t.personas; return Boolean(t.rostro) && ((n <= 1 && t.rostro.r >= 0.12) || (n === 2 && t.rostro.r >= 0.22)); }; // sola con rostro visible, o en pareja pero con su rostro grande
function candidatosRelleno(etiquetas) {
  const orden = (a, b) => (b.tipo !== 'otro') - (a.tipo !== 'otro') || (b.rostro ? b.rostro.r : 0) - (a.rostro ? a.rostro.r : 0);
  const todas = [...etiquetas].filter(t => t.rostro), buenas = todas.filter(esDeLaProtagonista).sort(orden), resto = todas.filter(t => !esDeLaProtagonista(t)).sort(orden);
  return [...buenas, ...resto].map(t => t.id); // las de ella primero; las demás solo cuando se acaban (mejor una toma cualquiera que una pantalla vacía)
}

// Rostro (centro y radio relativos al cuadro original; r respecto al ANCHO) → relativos a la ventana vertical 9:16 donde se muestra
// el clip con recorte "cover". Si el cuadro es más ancho que 9:16 se recortan los lados; si es más alto, arriba y abajo.
function rostroEnVentana(rostro, ancho, alto) {
  if (!rostro || !ancho || !alto) return null;
  const aV = 9 / 16, aF = ancho / alto; let cx, cy, r;
  if (aF > aV) { const vis = aV / aF; cx = (rostro.cx - (1 - vis) / 2) / vis; cy = rostro.cy; r = rostro.r / vis; }
  else { const vis = aF / aV; cx = rostro.cx; cy = (rostro.cy - (1 - vis) / 2) / vis; r = rostro.r; }
  return { cx: Math.min(0.95, Math.max(0.05, cx)), cy: Math.min(0.95, Math.max(0.05, cy)), r: Math.min(0.5, Math.max(0.08, r)) };
}

// Ancho y alto del video (para mapear el rostro a la ventana). Usa -show_streams: el ffprobe-static incluido no entiende stream_side_data.
function dimensiones(ruta) {
  const salida = require('child_process').execFileSync(require('ffprobe-static').path, ['-v', 'error', '-select_streams', 'v:0', '-show_streams', '-of', 'json', ruta], { encoding: 'utf8' });
  const v = (JSON.parse(salida).streams || [])[0]; if (!v) throw new Error('sin video: ' + ruta);
  const giro = Math.abs(Number(((v.tags || {}).rotate) || 0)) % 180 === 90; // metadato de rotación de móvil
  return giro ? { ancho: v.height, alto: v.width } : { ancho: v.width, alto: v.height };
}

module.exports = { esDeLaProtagonista, candidatosRelleno, filtrarElecciones, dimensiones, fechaDeNombre, descargarCarpeta, etiquetarClips, limpiarEtiqueta, elegirClips, validarElecciones, rostroEnVentana, lineaDeClip, RAIZ, USO_MAX_S, TIPOS };

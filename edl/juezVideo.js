// JUEZ del video terminado: una segunda mirada, barata, que busca lo que se ve mal antes de que el video salga.
//
// Costo mínimo a propósito (el consumo de Gemini ya subió): UNA llamada por video, con UNA sola imagen
// (una hoja con 12 fotogramas repartidos por todo el video) + el guion en texto. Va por la cadena "mecánica"
// (arranca en el modelo lite, el más barato, y solo sube de modelo si falla). Nunca rompe el flujo: si no puede, avisa y sigue.
// Primero corren revisiones GRATIS en código (duración, fotogramas casi iguales seguidos) que no gastan ningún token.
//
// Qué NO hace: no corrige el video solo (eso es decisión tuya: el resultado queda en juicio.json y se ve en "Videos listos").
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const FFMPEG = () => process.env.FFMPEG_BIN || require('ffmpeg-static');
const COLS = 4, FILAS = 3, N = COLS * FILAS, CW = 360, CH = 640;

const PROMPT = `Eres el crítico visual de una cuenta de TikTok/Reels de farándula. Te doy UNA imagen con ${N} fotogramas de un video vertical 9:16 (en orden de izquierda a derecha y de arriba a abajo; cada uno trae su segundo) y el guion que se narra.
Busca lo que se ve MAL o mejorable, con ojo de espectador de celular. Revisa en especial:
- Subtítulos: ilegibles, cortados, tapados por otro elemento, o dentro de la franja inferior (la interfaz de TikTok cubre el 17% de abajo).
- Texto de tarjetas o rótulos: demasiado pequeño, cortado, encimado con otra cosa.
- Caras o personas cortadas, borrosas, muy pequeñas o de baja calidad; fotos que no parecen de quien se habla.
- Fotogramas vacíos o aburridos (solo subtítulos sobre fondo liso), la misma toma repetida, o demasiada monotonía seguida.
- Saturación: demasiados elementos a la vez; o marcas de agua/logos ajenos visibles.
- Cualquier cosa que contradiga el guion.
Sé específico: di el segundo aproximado, qué ves y cómo mejorarlo. No inventes problemas: si algo se ve bien, no lo menciones.
Devuelve SOLO este JSON: {"puntaje": número 0-10 (10 = listo para publicar), "resumen": "una frase", "problemas": [{"t": segundo aproximado, "gravedad": "alta"|"media"|"baja", "que": "qué se ve mal", "mejora": "cómo arreglarlo"}], "bueno": ["lo mejor del video, máximo 2 ítems"]}
Máximo 8 problemas, los más importantes primero. "alta" = el espectador lo nota y afecta la retención o la confianza.`;

// Hoja de contacto: N fotogramas repartidos entre el 3% y el 97% del video, en una sola imagen jpg. Devuelve {ruta, tiempos}.
function hojaDeFotogramas(video, duracion, destino) {
  const tiempos = Array.from({ length: N }, (_, i) => +(duracion * (0.03 + 0.94 * i / (N - 1))).toFixed(2));
  const fps = (N / duracion).toFixed(6);
  const filtro = `fps=${fps},scale=${CW}:${CH}:force_original_aspect_ratio=decrease,pad=${CW}:${CH}:(ow-iw)/2:(oh-ih)/2:color=black,tile=${COLS}x${FILAS}`;
  execFileSync(FFMPEG(), ['-y', '-loglevel', 'error', '-i', video, '-vf', filtro, '-frames:v', '1', '-q:v', '4', destino], { stdio: 'pipe' });
  return { ruta: destino, tiempos };
}

function duracionDe(video) {
  try {
    const s = require('child_process').spawnSync(FFMPEG(), ['-i', video], { encoding: 'utf8' }).stderr || '';
    const m = s.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0;
  } catch { return 0; }
}

// Revisiones gratis en código sobre los datos que ya tenemos (no usan modelo).
function revisionesDeCodigo({ duracion, minimo = 0 }) {
  const out = [];
  if (minimo && duracion && duracion < minimo - 0.5) out.push({ t: 0, gravedad: 'alta', que: `El video dura ${duracion.toFixed(1)} s y el mínimo para este canal es ${minimo} s`, mejora: 'Alargar el guion o completar con más material', origen: 'código' });
  return out;
}

const GRAV = { alta: 3, media: 2, baja: 1 };
// Deja el juicio del modelo en una forma segura: números válidos, gravedades conocidas, textos cortos, sin basura.
function normalizarJuicio(r) {
  const puntaje = Math.max(0, Math.min(10, Math.round(Number(r && r.puntaje) * 10) / 10)), problemas = [];
  for (const p of Array.isArray(r && r.problemas) ? r.problemas : []) {
    const que = String((p && p.que) || '').trim().slice(0, 240); if (!que) continue;
    const g = GRAV[p.gravedad] ? p.gravedad : 'media', t = Number(p.t);
    problemas.push({ t: Number.isFinite(t) && t >= 0 ? Math.round(t * 10) / 10 : null, gravedad: g, que, mejora: String(p.mejora || '').trim().slice(0, 240), origen: 'modelo' });
  }
  problemas.sort((a, b) => GRAV[b.gravedad] - GRAV[a.gravedad]);
  return { puntaje: Number.isFinite(puntaje) ? puntaje : null, resumen: String((r && r.resumen) || '').trim().slice(0, 240), problemas: problemas.slice(0, 8), bueno: (Array.isArray(r && r.bueno) ? r.bueno : []).map(x => String(x).slice(0, 160)).slice(0, 2) };
}

function aMarkdown(j, titulo) {
  const L = [`# Juicio del video${titulo ? ': ' + titulo : ''}`, '', `**Puntaje:** ${j.puntaje === null ? '—' : j.puntaje + '/10'}  ·  ${j.resumen || ''}`, ''];
  if (j.problemas.length) { L.push('## Para mejorar'); for (const p of j.problemas) L.push(`- [${p.gravedad.toUpperCase()}]${p.t !== null ? ` ~${p.t}s` : ''} ${p.que}${p.mejora ? ` → ${p.mejora}` : ''}`); } else L.push('Sin problemas visibles.');
  if (j.bueno && j.bueno.length) { L.push('', '## Lo mejor'); j.bueno.forEach(b => L.push('- ' + b)); }
  return L.join('\n') + '\n';
}

// Juzga un video terminado. `llamar(prompt, partes)` es inyectable para pruebas. Guarda juicio.json (y .md junto al video).
async function juzgar({ video, guion = {}, dir, minimo = 0, log = () => {}, llamar = null, hojaFn = hojaDeFotogramas }) {
  if (!video || !fs.existsSync(video)) throw new Error('no existe el video a juzgar');
  const duracion = duracionDe(video), tmp = path.join(os.tmpdir(), `juez_${process.pid}_${Date.now()}.jpg`);
  try {
    const gratis = revisionesDeCodigo({ duracion, minimo });
    let r = null;
    const hoja = hojaFn(video, duracion || 60, tmp);
    const partes = [{ text: `GUION NARRADO:\n${String(guion.script || '').slice(0, 1800)}\n\nFotogramas, en orden, en los segundos: ${hoja.tiempos.map(t => t + ' s').join(', ')}.` }, { inlineData: { mimeType: 'image/jpeg', data: fs.readFileSync(hoja.ruta).toString('base64') } }];
    if (!llamar) { const g = require('../gemini'); llamar = async (p, m) => g.llamarJSON(p, m, g.TAREAS.juez); }
    try { r = await llamar(PROMPT, partes); } catch (e) { log(`  juez: no pude consultar al modelo (${String(e.message).slice(0, 100)})`); }
    const j = r ? normalizarJuicio(r) : { puntaje: null, resumen: 'El juez no pudo revisar el video con el modelo.', problemas: [], bueno: [] };
    j.problemas = [...gratis, ...j.problemas]; j.duracion = Math.round(duracion * 10) / 10; j.fecha = new Date().toISOString(); j.video = path.basename(video);
    if (dir) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'juicio.json'), JSON.stringify(j, null, 1)); }
    try { fs.writeFileSync(video.replace(/\.mp4$/i, '') + '.juicio.md', aMarkdown(j, guion.titulo)); } catch { /* opcional */ }
    log(`JUEZ: ${j.puntaje === null ? 'sin puntaje' : j.puntaje + '/10'} · ${j.problemas.filter(p => p.gravedad === 'alta').length} grave(s), ${j.problemas.length} en total · ${j.resumen}`);
    j.problemas.slice(0, 5).forEach(p => log(`  - [${p.gravedad}]${p.t !== null ? ' ~' + p.t + 's' : ''} ${p.que}${p.mejora ? ' → ' + p.mejora : ''}`));
    return j;
  } finally { try { fs.unlinkSync(tmp); } catch { /* temporal */ } }
}

module.exports = { juzgar, normalizarJuicio, aMarkdown, revisionesDeCodigo, hojaDeFotogramas, PROMPT, N };

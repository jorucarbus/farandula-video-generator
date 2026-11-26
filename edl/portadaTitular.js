// Titular de la portada: una llamada pequeña a Gemini (cadena mecánica, barata) que a partir del título y la descripción de la noticia devuelve un
// titular corto con gancho, la frase a resaltar y la etiqueta. No inventa: solo reordena y condensa lo que ya dice la noticia.
// Sin modelo (o si falla), un respaldo por reglas arma algo razonable del título.
const ETIQUETAS = ['VIRAL', 'ÚLTIMA HORA', 'POLÉMICA', 'CONFIRMADO', 'RUMOR', 'EXCLUSIVA'];
const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();

function porReglas({ titulo = '', hechosNoConfirmados = false }) {
  const t = String(titulo).replace(/[.!¡¿?]+$/g, '').trim(), pal = t.split(/\s+/);
  const resalte = pal.length > 4 ? pal.slice(-Math.min(3, Math.ceil(pal.length / 3))).join(' ') : pal.slice(-2).join(' ');
  return { titular: t, resalte, etiqueta: hechosNoConfirmados ? 'RUMOR' : 'VIRAL', origen: 'reglas' };
}

// Un resalte válido es una secuencia consecutiva de palabras del titular (si no, se corrige o se descarta).
function resalteValido(titular, resalte) {
  const pal = norm(titular).split(' '), r = norm(resalte).split(' ').filter(Boolean);
  if (!r.length || r.length > 5) return false;
  for (let i = 0; i + r.length <= pal.length; i++) if (r.every((x, k) => pal[i + k] === x)) return true;
  return false;
}

function limpiar(r, titulo) {
  let titular = String(r && r.titular || '').replace(/["«»]/g, '').replace(/\s+/g, ' ').trim().replace(/[.]+$/g, '');
  const n = titular.split(/\s+/).filter(Boolean).length;
  if (!titular || n < 3 || n > 14) return null;
  const resalte = resalteValido(titular, r.resalte) ? String(r.resalte).trim() : porReglas({ titulo: titular }).resalte;
  const etiqueta = ETIQUETAS.includes(String(r.etiqueta || '').toUpperCase()) ? String(r.etiqueta).toUpperCase() : 'VIRAL';
  return { titular, resalte, etiqueta, origen: 'modelo' };
}

const PROMPT = `Eres editor de portadas de farándula para TikTok/Reels (español neutro). Con el TÍTULO y la DESCRIPCIÓN de una noticia escribe el texto de la portada.
Reglas:
- "titular": 4 a 10 palabras, con gancho y en tono de chisme, pero SOLO con hechos que ya están en el título/descripción. Prohibido inventar nombres, cifras, causas o intenciones.
- Que no sea una pregunta vacía ni clickbait que prometa algo que la noticia no cuenta. Si el hecho no está confirmado, dilo ("según", "habría", "supuesto").
- "resalte": 2 a 4 palabras CONSECUTIVAS del propio titular (copiadas tal cual) que son lo más llamativo.
- "etiqueta": una de ${ETIQUETAS.join(' | ')} según el caso (RUMOR si no está confirmado; POLÉMICA si hay conflicto; CONFIRMADO si lo confirmó la persona; VIRAL por defecto).
Responde SOLO JSON: {"titular":"...","resalte":"...","etiqueta":"VIRAL"}`;

async function generar({ titulo, descripcion = '', hechosNoConfirmados = false, llamar = null }) {
  const respaldo = porReglas({ titulo, hechosNoConfirmados });
  try {
    const gemini = llamar ? null : require('../gemini');
    const r = await (llamar ? llamar(PROMPT, `TÍTULO: ${titulo}\nDESCRIPCIÓN: ${descripcion}`) : gemini.llamarJSON(PROMPT, `TÍTULO: ${titulo}\nDESCRIPCIÓN: ${descripcion}`, gemini.TAREAS.etiquetaClip));
    return limpiar(r, titulo) || respaldo;
  } catch { return respaldo; }
}

module.exports = { generar, porReglas, limpiar, resalteValido, ETIQUETAS };

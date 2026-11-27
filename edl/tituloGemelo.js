// Título y descripción propios para el video GEMELO. El gemelo comparte la lectura de la noticia (se paga una sola vez), y con ella heredaba el mismo
// título y descripción que su hermano: dos canales publicando el mismo titular. Aquí se piden unos distintos, escritos desde el guion del gemelo.
// Una llamada barata (modelo de etiquetas). Si falla, devuelve null y se conserva lo heredado.
const gemini = require('../gemini');

const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();

// ¿se parecen demasiado? (mismas palabras largas en su mayoría)
function parecidos(a, b) {
  const wa = new Set(norm(a).split(' ').filter(w => w.length > 3)), wb = norm(b).split(' ').filter(w => w.length > 3);
  if (!wb.length) return false; return wb.filter(w => wa.has(w)).length / wb.length >= 0.7;
}

function limpiar(r, original) {
  if (!r || typeof r.titulo !== 'string' || typeof r.descripcion !== 'string') return null;
  const titulo = r.titulo.replace(/^["«“]|["»”.]$/g, '').trim(), descripcion = r.descripcion.replace(/#\S+/g, '').replace(/\s+/g, ' ').trim();
  const n = titulo.split(/\s+/).length;
  if (n < 3 || n > 14 || descripcion.length < 20 || descripcion.length > 400) return null;
  if (norm(titulo) === norm(original.titulo) || parecidos(original.titulo, titulo) || norm(descripcion) === norm(original.descripcion)) return null;
  return { titulo, descripcion };
}

// script: guion del gemelo; original: { titulo, descripcion } del hermano. llamar inyectable para pruebas.
async function generar({ script, original, sesgo = '', llamar = null }) {
  llamar = llamar || ((p, m) => gemini.llamarJSON(p, m, gemini.TAREAS.etiquetaClip));
  const prompt = `Eres editor de un canal de farándula. Escribe un TÍTULO y una DESCRIPCIÓN para publicar este video, basados SOLO en el guion dado (no inventes datos). `
    + `Otro canal ya publicó esta misma noticia con el título "${original.titulo}" y la descripción "${original.descripcion}": los tuyos deben ser DISTINTOS (otro ángulo, otras palabras), sin copiar frases. `
    + `Título: 5 a 11 palabras, claro, sin comillas ni punto final. Descripción: 1 o 2 frases, sin hashtags. Español neutro. ${sesgo ? 'Tono del canal: ' + sesgo + '.' : ''} `
    + `Responde SOLO JSON: {"titulo":"...","descripcion":"..."}`;
  for (let i = 0; i < 2; i++) { // un reintento si salió igual al del hermano
    let r; try { r = await llamar(prompt + (i ? ' (el intento anterior se parecía demasiado: cambia el ángulo)' : ''), String(script || '').slice(0, 3000)); } catch { return null; }
    const ok = limpiar(r, original); if (ok) return ok;
  }
  return null;
}

module.exports = { generar, limpiar, parecidos };

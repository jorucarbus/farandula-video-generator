// GUION DEL COMPILADO DIARIO (16:9, sin tiempo fijo): varias noticias del día en un solo video, una sola llamada al modelo y una sola voz.
// Reglas del usuario: directo y de lo impactante, sin relleno (aquí no hace falta estirar para llegar a un minuto); noticias distintas por canal de YouTube;
// el largo sale de lo que haya, y se estima ANTES de pagar la voz. Nunca se reintenta por largo: se pide bien desde el primer pase.
const gemini = require('../gemini');
const pauta = require('./pautaGuion');
const DU = require('./duracionEstimada');

const PALABRAS_NOTICIA = { min: 45, max: 80 }; // ≈ 20-35 s de voz por noticia
const contar = t => (String(t || '').match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]+/g) || []).length;

function material(noticias) {
  return noticias.map((n, i) => `=== NOTICIA ${i + 1}: ${n.titulo} ===\n${n.hechos.map((h, k) => `${k + 1}. ${h.texto}${h.confirmado === false ? ' [NO CONFIRMADO: cuéntalo como versión]' : ''}`).join('\n')}`).join('\n\n');
}

function prompt({ canalYoutube, fecha, n }) {
  return `Eres el guionista del compilado diario del canal de YouTube "${canalYoutube}" (farándula). Con las ${n} noticias de abajo escribe UN solo guion para un video horizontal que se lee en voz alta.
REGLAS:
- Español neutro (nunca de España ni voseo). Tono directo, ágil y picante sin inventar; frases cortas.
- AL GRANO: de cada noticia cuenta solo el hecho central y los 2 o 3 datos más fuertes o impactantes. NO rellenes, no repitas, no expliques de más, no hagas preguntas retóricas de relleno.
- Cada noticia: entre ${PALABRAS_NOTICIA.min} y ${PALABRAS_NOTICIA.max} palabras. La noticia con más impacto va primero y la más ligera al final (puedes cambiar el orden).
- Entre noticias, una frase de enlace MUY corta (máx. 12 palabras) dentro del texto de la noticia siguiente (al inicio), que no repita muletillas.
- "intro": 1 o 2 frases (máx. 25 palabras) que enganchen con lo más fuerte del día; di la fecha (${fecha}) de forma natural solo si cabe. "cierre": 1 frase (máx. 20 palabras) invitando a suscribirse a ${canalYoutube}.
- Solo puedes afirmar lo que esté en los datos de cada noticia: ninguna cifra, nombre ni dato inventado. Lo marcado NO CONFIRMADO se cuenta como versión o rumor.
- No muestres rostros ni nombres de menores de edad; no culpes a nadie sin respaldo.
Para cada noticia devuelve además: "titular" (3 a 6 palabras, para el rótulo en pantalla) y "dato" (el cifra o dato más llamativo, máx. 5 palabras, para un recuadro en pantalla; vacío si no hay).
${pauta.PICANTE}
Responde SOLO JSON: {"titulo":"título del video (6 a 12 palabras, sin comillas)","descripcion":"1-2 frases sin hashtags","intro":"...","noticias":[{"n":1,"titular":"...","dato":"...","texto":"..."}],"cierre":"..."} donde "n" es el número de la noticia de origen (1 a ${n}) en el orden en que la cuentas.`;
}

// Revisión sin modelo: estructura, largo y datos inventados. Devuelve { ok, avisos, descartes }.
function validar(r, noticias) {
  const avisos = [];
  if (!r || typeof r !== 'object') return { ok: false, avisos: ['respuesta vacía'] };
  if (!r.intro || !r.cierre) avisos.push('falta intro o cierre');
  if (!Array.isArray(r.noticias) || r.noticias.length !== noticias.length) avisos.push(`debían ser ${noticias.length} noticias`);
  const vistos = new Set();
  for (const x of r.noticias || []) {
    const o = noticias[(x.n || 0) - 1];
    if (!o) { avisos.push(`noticia con n inválido: ${x.n}`); continue; }
    if (vistos.has(x.n)) avisos.push(`noticia ${x.n} repetida`); vistos.add(x.n);
    const nPal = contar(x.texto);
    if (nPal < PALABRAS_NOTICIA.min * 0.7) avisos.push(`noticia ${x.n} muy corta (${nPal} palabras)`);
    if (nPal > PALABRAS_NOTICIA.max * 1.3) avisos.push(`noticia ${x.n} muy larga (${nPal} palabras)`);
    const base = o.hechos.map(h => h.texto).join('\n') + '\n' + (o.cronica || '') + '\n' + (o.titulo || '');
    const inv = pauta.inventados(x.texto, base);
    if (inv.numeros.length) avisos.push(`noticia ${x.n}: cifras que no están en los datos: ${inv.numeros.join(', ')}`);
    if (inv.nombres.length) avisos.push(`noticia ${x.n}: nombres que no están en los datos: ${inv.nombres.join(', ')}`);
  }
  return { ok: avisos.length === 0, avisos };
}

// → { titulo, descripcion, intro, noticias:[{n,titular,dato,texto}], cierre, script, estimadaSeg, avisos }
// Una sola llamada. Si la revisión encuentra problemas se informan (no se reintenta solo: lo decide la persona antes de pagar la voz).
async function generar({ noticias, canalYoutube, fecha, llamar = null }) {
  llamar = llamar || ((p, m) => gemini.llamarJSON(p, m, gemini.TAREAS.guion));
  const r = await llamar(prompt({ canalYoutube, fecha, n: noticias.length }), material(noticias));
  const v = validar(r, noticias);
  const orden = (r.noticias || []).filter(x => noticias[(x.n || 0) - 1]);
  const partes = [r.intro, ...orden.map(x => x.texto), r.cierre].map(t => String(t || '').trim()).filter(Boolean);
  const script = partes.join('\n\n');
  return { titulo: r.titulo || '', descripcion: String(r.descripcion || '').replace(/#\S+/g, '').trim(), intro: r.intro, noticias: orden, cierre: r.cierre, script, estimadaSeg: DU.estimar(script), palabras: contar(script), avisos: v.avisos };
}

module.exports = { generar, validar, prompt, material, PALABRAS_NOTICIA };

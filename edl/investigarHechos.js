// Paso previo al guion narrativo: busca en la web el CONTEXTO que da contraste a una noticia
// (de dónde viene el personaje, qué pasó antes) y lo devuelve como HECHOS sueltos con su fuente.
// Reglas: sin citas de búsqueda no entra nada; lo no corroborado entra como confirmado:false
// (el guion lo dirá con "según…"); lo que ya estaba en los hechos base no se duplica.
// El usuario revisa la lista antes de escribir el guion (enriquecimiento visible, nunca invisible).
const { solapamiento } = require('./compilado');

const MAX_NUEVOS = 6;

// Temas con riesgo de privacidad/difamación: nunca entran solos al guion. Quedan en `apartados` para que
// una persona decida (decisión de plan v4: el riesgo legal principal en farándula es difamación/privacidad).
const SENSIBLE = /\b(intim[oa]s?|sexual(es)?|desnud[oa]s?|porn\w*|violacion|abus[oa]\w*|acoso|menor(es)? de edad|suicid\w*|enfermedad|cancer|vih|embarazo|aborto|detenid[oa]s?|arrestad[oa]s?|denuncia\w*|demanda\w*|imputad[oa]s?|condenad[oa]s?|carcel|drogas?|adiccion|infidelidad|amante|sentimental|romance|noviazgo|novi[oa]s?|pareja|divorciw*|separacion|esposo|esposa|casad[oa]s?)\b/;
const esSensible = t => SENSIBLE.test(String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));

const PROMPT = `Eres investigador de una redacción de farándula. Te doy los HECHOS de una noticia.
Busca en la web antecedentes que den contexto y contraste: de dónde viene el protagonista, su trayectoria,
qué pasó antes. Devuelve hechos sueltos, verificables y con su fuente.
Reglas:
- Máx. ${MAX_NUEVOS} hechos. Solo lo que encuentres en fuentes reales (medios, sitios oficiales). Nada de foros ni comentarios.
- Un hecho = una afirmación completa y autosuficiente (con nombres y fechas), sin opinión ni adjetivos de valoración.
- No repitas lo que ya está en los hechos dados.
- "fuente": nombre del medio o sitio donde lo encontraste. Sin fuente identificable, no lo incluyas.
- "corroborado": true solo si lo dicen al menos dos fuentes independientes o una fuente oficial/primaria; si no, false.
- Si la fuente usa "habría", "según allegados" u otra cautela, mantenla en el texto.
- Si no encuentras nada útil, devuelve la lista vacía. Vacío es una respuesta correcta; inventar no.
Responde SOLO JSON: {"hechos":[{"texto":"...","fuente":"...","corroborado":false}]}`;

// Dos pasos, porque un prompt "responde SOLO JSON" hace que Gemini se salte la búsqueda e invente
// medios (probado 22-nov): 1) búsqueda en lenguaje natural con citas reales; 2) estructurar SOLO lo
// hallado, eligiendo la fuente de la lista de citas del paso 1 (sin herramientas).
const PROMPT_BUSQUEDA = 'Eres investigador de una redacción de farándula. Busca en la web y responde en español con datos concretos y verificables (fechas, títulos, cargos, lugares), sin opinión. Cita de dónde sale cada dato. Si no encuentras algo, dilo; no inventes.';

async function buscarConGemini(mensaje) {
  const gemini = require('../gemini');
  const { texto, grounding } = await gemini.callGemini(PROMPT_BUSQUEDA, mensaje.replace(/Busca en la web y devuelve el JSON pedido\./, 'Busca en la web antecedentes y trayectoria del protagonista que den contexto y contraste, y cuéntame lo que encuentres con su fuente.'), gemini.TAREAS.contexto, {}, [{ google_search: {} }]);
  const citas = (grounding?.groundingChunks || []).map(c => c.web && { titulo: c.web.title, url: c.web.uri }).filter(Boolean);
  const consultas = grounding?.webSearchQueries || [];
  if (!citas.length) return { hechos: [], citas, consultas };
  const lista = [...new Set(citas.map(c => c.titulo))].join(' | ');
  const datos = await gemini.llamarJSON(PROMPT, `${mensaje}\n\n=== LO ENCONTRADO EN LA WEB ===\n${texto}\n=== FIN ===\nFuentes citadas por la búsqueda (elige "fuente" SOLO de esta lista): ${lista}\nUsa únicamente lo de "LO ENCONTRADO".`, gemini.TAREAS.contexto);
  const validas = new Set(citas.map(c => c.titulo.toLowerCase()));
  const hechos = (datos.hechos || []).map(h => validas.has(String(h.fuente || '').toLowerCase()) ? h : { ...h, fuente: '' });
  return { hechos, citas, consultas };
}

// hechosBase: [{texto, confirmado?, fuente?}]. buscar(mensaje) → {hechos:[{texto,fuente,corroborado}], citas, consultas}
async function investigarHechos(hechosBase, { tema = '', personas = [], buscar = buscarConGemini } = {}) {
  const avisos = [];
  const mensaje = `=== HECHOS DE LA NOTICIA ===\n${hechosBase.map((h, i) => `${i + 1}. ${h.texto}`).join('\n')}\n=== FIN ===\n`
    + `${tema ? `Tema: ${tema}\n` : ''}${personas.length ? `Personas: ${personas.join(', ')}\n` : ''}Busca en la web y devuelve el JSON pedido.`;
  let r;
  try { r = await buscar(mensaje); } catch (e) { return { hechos: hechosBase, nuevos: [], citas: [], consultas: [], avisos: [`la búsqueda falló (${e.message}); se sigue con los hechos base`] }; }
  const citas = r.citas || [];
  if (!citas.length) return { hechos: hechosBase, nuevos: [], citas, consultas: r.consultas || [], avisos: ['la búsqueda no citó ninguna fuente: no se agrega nada que no se pueda verificar'] };
  const fuentes = hechosBase.map(h => h.texto);
  const nuevos = [], apartados = [];
  for (const h of r.hechos || []) {
    const texto = String(h.texto || '').trim(), fuente = String(h.fuente || '').trim();
    if (!texto || !fuente) { avisos.push(`hecho descartado por no traer fuente: "${texto.slice(0, 50)}"`); continue; }
    if (esSensible(texto)) { apartados.push({ texto, fuente, confirmado: h.corroborado === true, origen: 'web' }); avisos.push(`hecho sensible apartado para revisión humana: "${texto.slice(0, 50)}"`); continue; }
    if (solapamiento(texto, [...fuentes, ...nuevos.map(n => n.texto)]) > 0.6) { avisos.push(`hecho repetido, descartado: "${texto.slice(0, 50)}"`); continue; }
    nuevos.push({ texto, fuente, confirmado: h.corroborado === true, origen: 'web' });
    if (nuevos.length >= MAX_NUEVOS) break;
  }
  return { hechos: [...hechosBase, ...nuevos], nuevos, apartados, citas, consultas: r.consultas || [], avisos };
}

module.exports = { investigarHechos, esSensible, PROMPT, MAX_NUEVOS };

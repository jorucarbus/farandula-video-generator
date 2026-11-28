// TOMAS POR FRASE para el compilado: cada oración de una noticia recibe tomas de la carpeta que le toca (la de la protagonista o la de la persona/grupo que se nombra),
// con la misma regla del motor: el tiempo REAL de la frase se reparte en tomas iguales (≤ 3 s en pantalla) y solo entran tomas de buena calidad.
// Sin llamadas extra por frase: el reparto entre carpetas usa la ÚNICA llamada barata de clipsDeOtros.planificar (solo si la noticia nombra a 2+ carpetas), y la relación
// frase ↔ toma se mide en local contra las etiquetas de la toma (qué se ve, vestuario, lugar, lo que dice).
const CO = require('./clipsDeOtros');
const RP = require('./repartoTomas');
const BIB = require('./biblioteca');

const MAXC = 2.6;
// Noticias graves (acoso, denuncias, rupturas, tragedias): no se ilustran con tomas reveladoras o festivas.
const GRAVE = /(acos|denunci|muri[oó]|fallec|tragedia|separaci|ruptura|violen|abus|amenaz|accident|crisis|divorci|vara[dn]|emergencia)/i;
const REVELADORA = /(bikini|bikinis|traje de ba[nñ]o|lencer|ropa interior|escote|desnud|topless|tanga)/i;
const contar = t => (String(t || '').match(/\S+/g) || []).length;

// Parte el texto en oraciones (en el MISMO orden y con las MISMAS palabras que se mandaron a la voz); las muy cortas (< 4 palabras) se pegan a la siguiente.
function oraciones(texto) {
  const crudas = String(texto || '').split(/(?<=[.!?…])\s+/).map(s => s.trim()).filter(Boolean), out = [];
  for (const s of crudas) { if (out.length && contar(out[out.length - 1]) < 4) out[out.length - 1] += ' ' + s; else out.push(s); }
  if (out.length > 1 && contar(out[out.length - 1]) < 4) { const u = out.pop(); out[out.length - 1] += ' ' + u; }
  return out;
}

// palabras: las de la voz de ESTE tramo [{palabra,t0,t1}]; devuelve [{ frase, t0, t1 }] contiguos (cada oración dura hasta que empieza la siguiente; la última hasta tFin).
function ventanasDeOraciones(frases, palabras, tFin) {
  let i = 0; const v = frases.map(f => { const n = contar(f), a = palabras[i], b = palabras[Math.min(palabras.length - 1, i + n - 1)]; i += n; return { frase: f, t0: a.t0, t1: b.t1 }; });
  v.forEach((x, k) => { x.t1 = k + 1 < v.length ? v[k + 1].t0 : tFin; }); return v;
}

const inadecuada = t => REVELADORA.test([t.descripcion, t.vestuario && [].concat(t.vestuario).join(' '), t.texto_en_pantalla].filter(Boolean).join(' '));

// → { tramos: [{ frase, t0, t1, carpeta, items:[{id,carpeta}] }], avisos }
// noticia: { texto, personas:[nombre], carpeta, nombre, palabras (de la voz, solo de este texto), t0, t1 }; ctx: { locales, drive, cargar, indexar, asignar, log }
async function planificarNoticia(noticia, ctx) {
  const avisos = [], log = ctx.log || (() => {}), frases = oraciones(noticia.texto), win = ventanasDeOraciones(frases, noticia.palabras, noticia.t1), beats = frases.map(frase => ({ frase }));
  win[0].t0 = noticia.t0; const grave = GRAVE.test(noticia.texto);
  const todas = [...new Set([...ctx.locales, ...ctx.drive])], yaListadas = noticia.personas;
  const extra = CO.personasEnTexto(noticia.texto, todas, { excluir: [noticia.carpeta, noticia.nombre], yaListadas });
  const personas = [...noticia.personas.map(nombre => ({ nombre })), ...extra];
  const otros = await CO.planificar({ asignar: ctx.asignar, beats, personas, protagonista: [noticia.carpeta, noticia.nombre], existentes: new Map(), carpetasLocales: ctx.locales, carpetasDrive: ctx.drive, cargar: ctx.cargar, indexar: ctx.indexar, tiempos: win, log });
  otros.avisos.forEach(a => avisos.push(a));
  // pool de la protagonista (carpeta principal): las de mejor calidad, en cantidad según el tiempo que le toca; en noticias graves sin tomas reveladoras
  const d = ctx.cargar(noticia.carpeta), et = d.etiquetas || {};
  const tProt = win.reduce((s, w, i) => s + (otros.carpetaPorFrase.has(i) ? 0 : w.t1 - w.t0), 0), nec = Math.max(6, Math.ceil(tProt / MAXC) + 4);
  let ids = BIB.candidatosRelleno(Object.values(et).filter(t => t.rostro && (t.duracion || (d.duraciones || {})[t.id] || 0) >= 2.2)).filter(id => !(grave && inadecuada(et[id])));
  const protIds = RP.ordenarPorCalidad(ids, d.calidad || {}, { necesarias: nec }).slice(0, nec + 8);
  if (grave) avisos.push(`noticia grave: se evitan tomas reveladoras (${ids.length} tomas utilizables en ${noticia.carpeta})`);
  const usadas = new Set(), tramos = win.map((w, i) => {
    const c = otros.carpetaPorFrase.get(i) || noticia.carpeta, eleg = otros.elecciones.get(i), esProt = c === noticia.carpeta;
    const pool = (esProt ? protIds : (otros.pools.get(c) || [])).map(id => ({ id, carpeta: c })), items = [];
    if (eleg && !usadas.has(eleg.id)) { items.push({ id: eleg.id, carpeta: c }); usadas.add(eleg.id); }
    else if (esProt) { // la toma de la protagonista que mejor se relaciona con la frase (coincidencia con lo que se ve y se dice)
      const ft = CO.norm(w.frase).split(' ').filter(Boolean), mejor = protIds.filter(id => !usadas.has(id)).map(id => ({ id, s: CO.puntuarToma(et[id], ft) })).sort((a, b) => b.s - a.s)[0];
      if (mejor && mejor.s >= 3) { items.push({ id: mejor.id, carpeta: c }); usadas.add(mejor.id); }
    }
    return { frase: w.frase, t0: w.t0, t1: w.t1, carpeta: c, items: [...items, ...pool.filter(x => !items.some(y => y.id === x.id))] };
  });
  return { tramos, protIds, avisos, otrasCarpetas: [...otros.pools.keys()] };
}

module.exports = { planificarNoticia, oraciones, ventanasDeOraciones, GRAVE, MAXC };

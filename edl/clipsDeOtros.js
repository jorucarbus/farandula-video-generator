// VIDEOS DE OTRAS PERSONAS: cuando el guion nombra a alguien que NO es la protagonista y esa persona tiene su propia carpeta de videos (en este equipo o en Drive),
// durante las frases que la nombran se muestran tomas SUYAS en vez de una toma genérica de la protagonista. Si no hay carpeta, no se hace nada (queda la foto en el círculo).
// Reglas: solo tomas donde se ve su rostro (sola o con rostro grande), cada toma una sola vez, a lo más `maxPorPersona` frases por persona, y el límite de 3 s por clip
// lo sigue aplicando el ensamblador. Si la carpeta de Drive no estaba indexada, se indexa antes (se etiquetan solo los clips sin etiqueta, una vez).
const fs = require('fs'), path = require('path');
const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();
const toks = t => norm(t).split(' ').filter(Boolean);
const leer = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };

// ¿Qué carpeta es de esta persona? Todas las palabras (3+ letras) de su nombre deben estar en el nombre de la carpeta; si hay más de una candidata, es ambigua y no se elige ninguna.
function buscarCarpeta(nombre, carpetas, { excluir = [] } = {}) {
  const ex = new Set(excluir.map(c => norm(String(c).replace(/_/g, ' ')))), pt = toks(nombre).filter(t => t.length >= 3); if (!pt.length) return null;
  const ok = carpetas.filter(c => { const ct = toks(String(c).replace(/_/g, ' ')); return !ex.has(ct.join(' ')) && pt.every(t => ct.includes(t)) && (pt.length >= 2 || ct.length <= 2); });
  return ok.length === 1 ? ok[0] : null;
}

// Personas NOMBRADAS EN EL TEXTO que tienen carpeta (aunque la lectura del guion no las haya listado): se recorre el nombre de cada carpeta y se busca en el guion.
// 2+ palabras: las dos primeras seguidas (Kike_Jav_Cuy → "Kike Jav"); 1 palabra: debe ir con mayúscula inicial y 5+ letras (evita falsos positivos).
// Si dos carpetas calzan, gana la de nombre exacto; si sigue empatado, se omite (ambigua). Devuelve [{ nombre, carpeta }].
function personasEnTexto(texto, carpetas, { excluir = [], yaListadas = [] } = {}) {
  const T = ' ' + toks(texto).join(' ') + ' ', ex = new Set(excluir.map(c => norm(String(c).replace(/_/g, ' ')))), ya = new Set(yaListadas.map(norm)), orig = String(texto || '');
  const out = new Map();
  for (const c of carpetas) {
    const ct = toks(String(c).replace(/_/g, ' ')); if (!ct.length || ex.has(ct.join(' '))) continue;
    let clave = null, largo = 0;
    if (ct.length >= 2 && ct[0].length >= 2 && ct[1].length >= 2) { const sec = ct.slice(0, 2).join(' '); if (T.includes(' ' + sec + ' ')) { clave = sec; largo = ct.length; } }
    else if (ct.length === 1 && ct[0].length >= 5 && new RegExp('(^|[^\p{L}])' + ct[0][0].toUpperCase() + ct[0].slice(1) + '(?![\p{L}])', 'u').test(orig.normalize('NFD').replace(/[̀-ͯ]/g, ''))) { clave = ct[0]; largo = 1; }
    if (!clave || ya.has(clave)) continue;
    const prev = out.get(clave); if (!prev) out.set(clave, [{ c, exacto: ct.length === clave.split(' ').length }]); else prev.push({ c, exacto: ct.length === clave.split(' ').length });
  }
  const res = [];
  for (const [clave, cs] of out) { const ex2 = cs.filter(x => x.exacto), el = ex2.length === 1 ? ex2[0] : cs.length === 1 ? cs[0] : null; if (el) res.push({ nombre: clave.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' '), carpeta: el.c }); }
  return res;
}

// Frases (0-based) que nombran a la persona (por su nombre o su apellido, 4+ letras).
const ARTICULOS = new Set(['el', 'la', 'los', 'las', 'de', 'del', 'don', 'dona']);
function frasesQueLaNombran(beats, nombre, { min = 4 } = {}) {
  const alias = new Set(toks(nombre).filter(t => t.length >= min && !(min < 4 && ARTICULOS.has(t)))); if (!alias.size) return [];
  return beats.map((b, i) => (toks(b.frase).some(t => alias.has(t)) ? i : -1)).filter(i => i >= 0);
}

// Tomas aptas de una carpeta, de mejor a peor: de ella (sola con rostro visible o con rostro grande), de al menos USO_MAX_S segundos.
function tomasAptas(etiquetas, { minDuracion = 3 } = {}) {
  const { esDeLaProtagonista } = require('./biblioteca');
  return Object.values(etiquetas || {}).filter(t => t && t.rostro && (t.duracion || 0) >= minDuracion && esDeLaProtagonista(t))
    .sort((a, b) => (b.tipo !== 'otro') - (a.tipo !== 'otro') || (b.rostro.r || 0) - (a.rostro.r || 0));
}

// Si la persona es un GRUPO (Las Ñañas: 2 a 6 por toma) o no hay tomas "solo ella con rostro grande", igual se usan sus videos: prioridad a lo que se nombra, y solo
// se omite cuando no hay nada. Orden: aptas estrictas, luego con rostro y menos gente, luego el resto. `duraciones`: id → segundos (las etiquetas viejas no la traen).
function tomasPosibles(etiquetas, { minDuracion = 3, duraciones = {} } = {}) {
  const dur = t => t.duracion || duraciones[t.id] || 0, estrictas = tomasAptas(Object.fromEntries(Object.entries(etiquetas || {}).map(([k, t]) => [k, { ...t, duracion: dur(t) }])), { minDuracion });
  const ids = new Set(estrictas.map(t => t.id));
  const resto = Object.values(etiquetas || {}).filter(t => t && !ids.has(t.id) && dur(t) >= minDuracion)
    .map(t => ({ ...t, duracion: dur(t) }))
    .sort((a, b) => (!!b.rostro - !!a.rostro) || ((a.tipo === 'otro') - (b.tipo === 'otro')) || ((a.personas || 1) - (b.personas || 1)));
  return [...estrictas, ...resto];
}

// COLECTIVOS (Las Ñañas): son un grupo, así que solo cuentan las tomas donde se ve al grupo (todas o casi todas). Si sale una sola integrante ya no son "ellas", es esa cantante
// (cada una tiene su carpeta aparte, como la de Tamara). Por eso NO se cae a tomas sueltas: si no hay tomas del grupo, no se pone nada.
// Quién es colectivo: data-motor/colectivos.json { "Las_ñañas": { "integrantes": 4 } } o, sin config, carpetas que empiezan con "Las/Los".
const CONFIG = path.join(__dirname, '..', 'data-motor', 'colectivos.json');
function colectivoDe(carpeta, nombre = '', config = leer(CONFIG, {})) {
  const c = config[carpeta] || null; if (c) return { integrantes: Number(c.integrantes) || 0 };
  return /^(las|los)[ _]/i.test(String(carpeta).replace(/^_+/, '')) || /^(las|los)\s/i.test(String(nombre)) ? { integrantes: 0 } : null;
}
function tomasColectivo(etiquetas, { integrantes = 0, duraciones = {}, minDuracion = 3 } = {}) {
  const minP = integrantes ? Math.max(2, integrantes - 1) : 3, maxP = integrantes ? integrantes * 2 : 8, dur = t => t.duracion || duraciones[t.id] || 0;
  return Object.values(etiquetas || {}).filter(t => t && t.rostro && (t.personas || 1) >= minP && (t.personas || 1) <= maxP && (dur(t) === 0 || dur(t) >= minDuracion))
    .map(t => ({ ...t, duracion: dur(t) }))
    .sort((a, b) => (integrantes ? Math.abs((a.personas || 1) - integrantes) - Math.abs((b.personas || 1) - integrantes) : (b.personas || 1) - (a.personas || 1)) || ((a.tipo === 'otro') - (b.tipo === 'otro')) || ((b.rostro.r || 0) - (a.rostro.r || 0)));
}

// beats: [{frase}]; personas: [{nombre}]; existentes: Map beat(0-based) → elección ya hecha para la protagonista (solo se pisan las 'relacionada': relleno sin dato exacto).
// Devuelve { elecciones: Map beat → {id, ss, motivo, nivel, persona, carpeta}, rutas: Map id → carpeta, avisos }.
// cargar(carpeta) → { etiquetas, clips } (inyectable); indexar(carpeta) → Promise (inyectable); carpetasLocales/carpetasDrive: nombres.
// REPARTO POR CARPETA (barato): UNA sola llamada a Gemini por video que, viendo las frases y los NOMBRES de las carpetas candidatas, dice de quién (de qué carpeta) habla
// cada frase. Dentro de la carpeta, la toma la elige el código por calidad (ya filtrada), etiquetas con algo de relación con la frase y rostro visible: sin más Gemini.
// Si hay una sola persona candidata no se llama a Gemini (basta con que la frase la nombre). Si la llamada falla, se usan las frases que nombran a la persona.
const PROMPT_CARPETAS = candidatos => `Eres editor de videos de farándula. Te doy las frases de un guion (numeradas) y una lista de personas o grupos que tienen carpeta de videos. Para cada frase, di de CUÁL de ellos habla (por su nombre, apodo o una referencia clara como "ella"/"el grupo" que apunta a uno solo), o null si no trata de ninguno de la lista. No inventes: ante la duda, null. La protagonista del video NO está en la lista.
Personas/grupos (carpeta → quién es):
${candidatos.map(c => `- ${c.carpeta} → ${c.nombre}${c.colectivo ? ' (grupo)' : ''}`).join('\n')}
Responde SOLO JSON: {"frases":[{"beat":1,"carpeta":"<carpeta>"|null}]}`;

async function elegirCarpetas(beats, candidatos, { llamar = null } = {}) {
  llamar = llamar || ((p, m) => { const g = require('../gemini'); return g.llamarJSON(p, m, g.TAREAS.etiquetaClip); });
  const r = await llamar(PROMPT_CARPETAS(candidatos), JSON.stringify(beats.map((b, i) => ({ beat: i + 1, frase: b.frase }))));
  const validas = new Set(candidatos.map(c => c.carpeta)), out = new Map();
  for (const f of (r && r.frases) || []) if (Number.isInteger(f.beat) && f.beat >= 1 && f.beat <= beats.length && validas.has(f.carpeta)) out.set(f.beat - 1, f.carpeta);
  return out;
}

// Relación mínima de una toma con la frase: palabras de la frase (4+ letras) que aparecen en sus etiquetas, más un punto si es una toma de acción (no "otro") y otro si se ve su rostro.
// Una toma sin ninguna relación ni rostro (puntaje < 1) no se usa.
function puntuarToma(t, fraseToks) {
  const meta = new Set(toks([t.descripcion, t.lugar, t.vestuario, t.tipo, t.dice, t.texto_en_pantalla].filter(Boolean).join(' ')));
  const coincide = fraseToks.filter(x => x.length >= 4 && meta.has(x)).length;
  return coincide * 2 + (t.tipo && t.tipo !== 'otro' ? 1 : 0) + (t.rostro ? 1 : 0) + ((t.rostro && t.rostro.r) || 0);
}

async function planificar({ asignar = null, beats, personas, protagonista = [], existentes = new Map(), carpetasLocales = [], carpetasDrive = [], cargar, indexar = null, maxPorPersona = 3, log = () => {} }) {
  const elecciones = new Map(), carpetaDe = new Map(), avisos = [], usadas = new Set();
  const todas = [...new Set([...carpetasLocales, ...carpetasDrive])], libre = i => !elecciones.has(i) && (!existentes.has(i) || existentes.get(i).nivel === 'relacionada');
  // 1) por persona: su carpeta y sus tomas posibles (indexa si hace falta; así Gemini solo ve carpetas que sí pueden aportar)
  const cands = [];
  for (const p of personas || []) {
    const carpeta = p.carpeta && todas.includes(p.carpeta) ? p.carpeta : buscarCarpeta(p.nombre, todas, { excluir: protagonista }); if (!carpeta || cands.some(c => c.carpeta === carpeta)) continue;
    let datos = cargar(carpeta);
    if ((!datos.etiquetas || !Object.keys(datos.etiquetas).length) && indexar && carpetasDrive.includes(carpeta)) { log(`${p.nombre}: la carpeta ${carpeta} no estaba indexada; se indexa (una sola vez)`); try { await indexar(carpeta); datos = cargar(carpeta); } catch (e) { avisos.push(`${p.nombre}: no pude indexar ${carpeta} (${String(e.message).slice(0, 80)})`); continue; } }
    const col = colectivoDe(carpeta, p.nombre), tomas = col ? tomasColectivo(datos.etiquetas, { integrantes: col.integrantes, duraciones: datos.duraciones || {} }) : tomasPosibles(datos.etiquetas, { duraciones: datos.duraciones || {} });
    if (!tomas.length) { avisos.push(col ? `${p.nombre}: es un grupo y la carpeta ${carpeta} no tiene tomas donde aparezca el grupo; no se pone nada` : `${p.nombre}: la carpeta ${carpeta} no tiene tomas utilizables`); continue; }
    cands.push({ p, carpeta, tomas, nombre: p.nombre, colectivo: Boolean(col), porNombre: [...new Set([...frasesQueLaNombran(beats, p.nombre), ...(p.alias || []).flatMap(n => frasesQueLaNombran(beats, n, { min: 3 }))])].sort((x, y) => x - y) });
  }
  // 2) qué carpeta va en cada frase: 1 llamada a Gemini si hay 2+ candidatas; con 1 sola (o si falla), las frases que la nombran
  let asignadas = null;
  if (asignar && cands.length >= 2) { try { asignadas = await asignar(beats, cands.map(c => ({ nombre: c.nombre, carpeta: c.carpeta, colectivo: c.colectivo }))); avisos.push(`Gemini repartió las frases entre ${cands.length} carpetas (1 llamada)`); } catch (e) { avisos.push(`no pude repartir con Gemini (${String(e.message).slice(0, 60)}); se usan las frases que nombran a cada persona`); } }
  // 3) por carpeta, las tomas de mejor calidad y relación con su frase
  for (const c of cands) {
    const frases = (asignadas && asignadas.size ? [...asignadas].filter(([, k]) => k === c.carpeta).map(([i]) => i).sort((x, y) => x - y) : c.porNombre).filter(libre).slice(0, maxPorPersona);
    let puestas = 0;
    for (const i of frases) {
      const ft = toks(beats[i].frase), mejor = c.tomas.filter(t => !usadas.has(t.id)).map(t => ({ t, s: puntuarToma(t, ft) })).filter(x => x.s >= 1).sort((a, b) => b.s - a.s)[0]; if (!mejor) continue;
      const t = mejor.t; usadas.add(t.id); puestas++;
      const ss = Math.max(0, Math.min(((t.rostro && t.rostro.t) || 0.5) - 0.4, (t.duracion || 3.2) - 3.2));
      elecciones.set(i, { id: t.id, ss: Math.round(ss * 10) / 10, motivo: `toma de ${c.nombre} (frase sobre ${c.nombre})`, nivel: 'exacta', persona: c.nombre, carpeta: c.carpeta }); carpetaDe.set(t.id, c.carpeta);
    }
    if (frases.length) avisos.push(`${c.nombre}: ${puestas} toma(s) de su carpeta ${c.carpeta}`);
  }
  return { elecciones, carpetaDe, avisos };
}

module.exports = { buscarCarpeta, frasesQueLaNombran, tomasAptas, tomasPosibles, tomasColectivo, colectivoDe, personasEnTexto, elegirCarpetas, puntuarToma, planificar, norm };

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
async function planificar({ beats, personas, protagonista = [], existentes = new Map(), carpetasLocales = [], carpetasDrive = [], cargar, indexar = null, maxPorPersona = 3, log = () => {} }) {
  const elecciones = new Map(), carpetaDe = new Map(), avisos = [], usadas = new Set();
  const todas = [...new Set([...carpetasLocales, ...carpetasDrive])];
  for (const p of personas || []) {
    const carpeta = p.carpeta && todas.includes(p.carpeta) ? p.carpeta : buscarCarpeta(p.nombre, todas, { excluir: protagonista }); if (!carpeta) continue;
    let datos = cargar(carpeta);
    if ((!datos.etiquetas || !Object.keys(datos.etiquetas).length) && indexar && carpetasDrive.includes(carpeta)) { log(`${p.nombre}: la carpeta ${carpeta} no estaba indexada; se indexa (una sola vez)`); try { await indexar(carpeta); datos = cargar(carpeta); } catch (e) { avisos.push(`${p.nombre}: no pude indexar ${carpeta} (${String(e.message).slice(0, 80)})`); continue; } }
    const col = colectivoDe(carpeta, p.nombre), tomas = (col ? tomasColectivo(datos.etiquetas, { integrantes: col.integrantes, duraciones: datos.duraciones || {} }) : tomasPosibles(datos.etiquetas, { duraciones: datos.duraciones || {} })).filter(t => !usadas.has(t.id)); if (!tomas.length) { avisos.push(col ? `${p.nombre}: es un grupo y la carpeta ${carpeta} no tiene tomas donde aparezca el grupo; no se pone nada` : `${p.nombre}: la carpeta ${carpeta} no tiene tomas utilizables`); continue; }
    const frases = [...new Set([...frasesQueLaNombran(beats, p.nombre), ...(p.alias || []).flatMap(n => frasesQueLaNombran(beats, n, { min: 3 }))])].sort((x, y) => x - y).filter(i => !elecciones.has(i) && (!existentes.has(i) || existentes.get(i).nivel === 'relacionada')).slice(0, maxPorPersona);
    frases.forEach((i, n) => {
      const t = tomas[n]; if (!t) return; usadas.add(t.id);
      const ss = Math.max(0, Math.min(((t.rostro && t.rostro.t) || 0.5) - 0.4, (t.duracion || 3.2) - 3.2));
      elecciones.set(i, { id: t.id, ss: Math.round(ss * 10) / 10, motivo: `toma de ${p.nombre} (se la nombra en esta frase)`, nivel: 'exacta', persona: p.nombre, carpeta }); carpetaDe.set(t.id, carpeta);
    });
    if (frases.length) avisos.push(`${p.nombre}: ${Math.min(frases.length, tomas.length)} toma(s) de su carpeta ${carpeta}`);
  }
  return { elecciones, carpetaDe, avisos };
}

module.exports = { buscarCarpeta, frasesQueLaNombran, tomasAptas, tomasPosibles, tomasColectivo, colectivoDe, personasEnTexto, planificar, norm };

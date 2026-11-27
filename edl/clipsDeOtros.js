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

// Frases (0-based) que nombran a la persona (por su nombre o su apellido, 4+ letras).
function frasesQueLaNombran(beats, nombre) {
  const alias = new Set(toks(nombre).filter(t => t.length >= 4)); if (!alias.size) return [];
  return beats.map((b, i) => (toks(b.frase).some(t => alias.has(t)) ? i : -1)).filter(i => i >= 0);
}

// Tomas aptas de una carpeta, de mejor a peor: de ella (sola con rostro visible o con rostro grande), de al menos USO_MAX_S segundos.
function tomasAptas(etiquetas, { minDuracion = 3 } = {}) {
  const { esDeLaProtagonista } = require('./biblioteca');
  return Object.values(etiquetas || {}).filter(t => t && t.rostro && (t.duracion || 0) >= minDuracion && esDeLaProtagonista(t))
    .sort((a, b) => (b.tipo !== 'otro') - (a.tipo !== 'otro') || (b.rostro.r || 0) - (a.rostro.r || 0));
}

// beats: [{frase}]; personas: [{nombre}]; existentes: Map beat(0-based) → elección ya hecha para la protagonista (solo se pisan las 'relacionada': relleno sin dato exacto).
// Devuelve { elecciones: Map beat → {id, ss, motivo, nivel, persona, carpeta}, rutas: Map id → carpeta, avisos }.
// cargar(carpeta) → { etiquetas, clips } (inyectable); indexar(carpeta) → Promise (inyectable); carpetasLocales/carpetasDrive: nombres.
async function planificar({ beats, personas, protagonista = [], existentes = new Map(), carpetasLocales = [], carpetasDrive = [], cargar, indexar = null, maxPorPersona = 3, log = () => {} }) {
  const elecciones = new Map(), carpetaDe = new Map(), avisos = [], usadas = new Set();
  const todas = [...new Set([...carpetasLocales, ...carpetasDrive])];
  for (const p of personas || []) {
    const carpeta = buscarCarpeta(p.nombre, todas, { excluir: protagonista }); if (!carpeta) continue;
    let datos = cargar(carpeta);
    if ((!datos.etiquetas || !Object.keys(datos.etiquetas).length) && indexar && carpetasDrive.includes(carpeta)) { log(`${p.nombre}: la carpeta ${carpeta} no estaba indexada; se indexa (una sola vez)`); try { await indexar(carpeta); datos = cargar(carpeta); } catch (e) { avisos.push(`${p.nombre}: no pude indexar ${carpeta} (${String(e.message).slice(0, 80)})`); continue; } }
    const tomas = tomasAptas(datos.etiquetas).filter(t => !usadas.has(t.id)); if (!tomas.length) { avisos.push(`${p.nombre}: la carpeta ${carpeta} no tiene tomas aptas con su rostro`); continue; }
    const frases = frasesQueLaNombran(beats, p.nombre).filter(i => !elecciones.has(i) && (!existentes.has(i) || existentes.get(i).nivel === 'relacionada')).slice(0, maxPorPersona);
    frases.forEach((i, n) => {
      const t = tomas[n]; if (!t) return; usadas.add(t.id);
      const ss = Math.max(0, Math.min((t.rostro.t || 0) - 0.4, (t.duracion || 3.2) - 3.2));
      elecciones.set(i, { id: t.id, ss: Math.round(ss * 10) / 10, motivo: `toma de ${p.nombre} (se la nombra en esta frase)`, nivel: 'exacta', persona: p.nombre, carpeta }); carpetaDe.set(t.id, carpeta);
    });
    if (frases.length) avisos.push(`${p.nombre}: ${Math.min(frases.length, tomas.length)} toma(s) de su carpeta ${carpeta}`);
  }
  return { elecciones, carpetaDe, avisos };
}

module.exports = { buscarCarpeta, frasesQueLaNombran, tomasAptas, planificar, norm };

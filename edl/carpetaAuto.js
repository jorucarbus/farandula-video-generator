// Detección automática de la carpeta de clips: de las personas que nombra la noticia, ¿cuál tiene carpeta en Drive y es la protagonista?
//
// Usa el mismo cotejo que la app de farándula (famosos.cotejar: clave fonética, nombre parcial, un sonido de distancia) contra la lista REAL de
// carpetas de Drive. Si hay varias personas con carpeta, gana la más mencionada en la noticia (la protagonista se nombra más). No gasta IA.
const famosos = require('../famosos');

const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();

// Cuántas veces aparece en el texto el nombre completo o cualquiera de sus palabras de 4+ letras.
function menciones(texto, persona) {
  const t = ' ' + norm(texto) + ' ', toks = norm(persona).split(' ').filter(w => w.length >= 4);
  let n = 0; for (const w of toks) n += (t.match(new RegExp(` ${w} `, 'g')) || []).length;
  return n;
}

// lectura: { acta: { personas[], hechos }, cronica }. carpetas: nombres de las carpetas de Drive.
// Devuelve { carpeta, persona, confianza, menciones, otras: [...] } o null si ninguna persona tiene carpeta.
function elegir(lectura, carpetas, { cotejar = famosos.cotejar } = {}) {
  const acta = (lectura && lectura.acta) || {}, personas = (acta.personas || []).filter(Boolean);
  const cron = lectura && lectura.cronica, texto = [acta.hechos || '', typeof cron === 'string' ? cron : (cron && (cron.cronica || '')) || '', cron && cron.titulo || ''].join('\n');
  const vistos = new Set(), cand = [];
  personas.forEach((p, i) => {
    const r = cotejar(p, carpetas); if (!r || !r.carpeta || vistos.has(r.carpeta)) return; vistos.add(r.carpeta);
    cand.push({ carpeta: r.carpeta, persona: p, confianza: r.confianza, menciones: menciones(texto, p), orden: i });
  });
  if (!cand.length) return null;
  // la más mencionada; a igualdad, la de confianza alta y luego la que la noticia nombra primero
  cand.sort((a, b) => b.menciones - a.menciones || (b.confianza === 'alta') - (a.confianza === 'alta') || a.orden - b.orden);
  const [mejor, ...otras] = cand;
  return { ...mejor, otras: otras.map(o => ({ carpeta: o.carpeta, persona: o.persona, menciones: o.menciones })) };
}

module.exports = { elegir, menciones };

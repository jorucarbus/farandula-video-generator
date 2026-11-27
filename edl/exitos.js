// Éxitos reales: el usuario anota cuántas vistas tuvo cada video publicado y de ahí salen las REFERENCIAS para juzgar guiones y planes
// ("estos pasaron de 100 mil vistas: ¿qué tienen en común?"). Es la señal que más vale: lo que la audiencia de verdad vio, no lo que una IA opina.
// Honestidad con los datos: las vistas dependen de la cuenta, la hora y el tema; con pocos videos es una pista, no una ley. Por eso solo se
// usan como contexto de comparación, nunca como regla fija.
const fs = require('fs'), path = require('path');
const UMBRAL = 100000;
const leer = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };

// dm = data-motor. Archivo: renders/vistas.json  { "<video>.mp4": { vistas, fecha } }
const archivoVistas = dm => path.join(dm, 'renders', 'vistas.json');
const leerVistas = dm => leer(archivoVistas(dm), {});

// Videos con vistas anotadas, con su guion y la secuencia visual que tuvieron (plan.json, si existe). Más vistas primero.
function conVistas(dm) {
  const v = leerVistas(dm), out = [];
  for (const [nombre, d] of Object.entries(v)) {
    const n = nombre.replace(/\.mp4$/i, ''), dir = path.join(dm, 'noticias', n), g = leer(path.join(dir, 'guion.json'), null), plan = leer(path.join(dir, 'plan.json'), null);
    if (!g || !g.script || !Number.isFinite(d.vistas)) continue;
    out.push({ nombre: n, vistas: d.vistas, titulo: g.titulo || '', canal: g.canal || '', script: g.script, palabras: g.palabras || 0,
      secuencia: plan && Array.isArray(plan.escenas) ? plan.escenas.map(e => e.principal) : null });
  }
  return out.sort((a, b) => b.vistas - a.vistas);
}
const exitos = (dm, umbral = UMBRAL) => conVistas(dm).filter(x => x.vistas >= umbral);

// Texto breve para meter en un prompt: hasta `max` éxitos (del mismo canal primero) con su guion y su secuencia visual. '' si no hay ninguno.
function referencias(dm, { canal = '', max = 2, umbral = UMBRAL } = {}) {
  const lista = exitos(dm, umbral).sort((a, b) => (b.canal === canal) - (a.canal === canal) || b.vistas - a.vistas).slice(0, max);
  if (!lista.length) return '';
  return lista.map((x, i) => `REFERENCIA ${i + 1}: pasó de ${Math.floor(x.vistas / 1000)} mil vistas (${x.canal || 'canal'}).\nGuion: ${x.script.slice(0, 900)}${x.secuencia ? `\nSecuencia visual: ${x.secuencia.join(' > ')}` : ''}`).join('\n\n');
}

module.exports = { conVistas, exitos, referencias, leerVistas, archivoVistas, UMBRAL };

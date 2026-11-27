// Fuentes de una noticia escritas en UNA sola caja: links (uno por línea) y/o texto pegado (párrafos).
//  - Una línea que es solo un link http(s) es una fuente de tipo "link".
//  - El resto de líneas seguidas forman un bloque de texto; una línea en blanco o un link lo cierra. Cada bloque es una fuente "texto".
// Así se puede pegar "link, link, y unas líneas con lo que sé" sin separadores especiales.
const MAX_FUENTES = 8, MAX_TEXTO = 20000;

function parsearFuentes(entrada) {
  const lineas = String(entrada || '').replace(/\r/g, '').split('\n');
  const fuentes = [], vistos = new Set(); let bloque = [];
  const cerrar = () => { const t = bloque.join('\n').trim(); bloque = []; if (t.length >= 20) fuentes.push({ tipo: 'texto', contenido: t.slice(0, MAX_TEXTO) }); };
  for (const crudo of lineas) {
    const l = crudo.trim();
    if (!l) { cerrar(); continue; }
    if (/^https?:\/\/\S+$/i.test(l)) { cerrar(); const k = l.replace(/[#?].*$/, '').toLowerCase(); if (!vistos.has(k)) { vistos.add(k); fuentes.push({ tipo: 'link', contenido: l }); } continue; }
    bloque.push(l);
  }
  cerrar();
  return fuentes.slice(0, MAX_FUENTES);
}

// Texto corto para mostrar de qué fuente se trata (títulos de trabajo, logs).
const etiquetaDe = f => f.tipo === 'link' ? f.contenido.replace(/^https?:\/\//i, '').slice(0, 60) : `texto: ${f.contenido.replace(/\s+/g, ' ').slice(0, 40)}…`;

// Une las actas de varias fuentes en una sola con la forma de siempre ({hechos, personas, ...}): los hechos se concatenan y las personas se unen sin repetir.
function unirActas(actas) {
  if (!actas.length) throw new Error('no hay ninguna fuente leída');
  if (actas.length === 1) return actas[0];
  const personas = []; for (const a of actas) for (const p of a.personas || []) if (p && !personas.some(q => q.toLowerCase() === String(p).toLowerCase())) personas.push(p);
  return { ...actas[0], hechos: actas.map((a, i) => `--- FUENTE ${i + 1} ---\n${a.hechos}`).join('\n\n'), personas };
}

module.exports = { parsearFuentes, etiquetaDe, unirActas, MAX_FUENTES };

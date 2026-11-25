// PAUTA DEL GUION AUTOMÁTICO: que el guion use TODOS los datos de la noticia, tenga picante y no invente nada.
// Pedido de la dueña (2026-11-25): "que sepa poner picante a la noticia, si no queda como un robot leyendo el periódico; que tenga en cuenta
// todos los datos; si necesita llenar, que sea con los mismos datos; la estructura de storytelling es indispensable; y todo automático con Gemini".
// Acá viven las tres piezas que lo hacen posible SIN intervención de Claude:
//   1) extraerHechos   → la lista de datos de la noticia (una llamada barata); es la verdad contra la que se mide el guion.
//   2) bloqueMaterial  → lo que se le entrega al guionista: crónica + DATOS OBLIGATORIOS + permiso de picante + prohibición de inventar.
//   3) cobertura / inventados → chequeos SIN modelo (cero tokens): qué datos faltan y qué datos nuevos aparecieron. Si fallan, hay UN reintento.
const MAX_HECHOS = 20;
const normalizar = t => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Números en palabras (1-31 y decenas) → cifras, para comparar "veintiséis de noviembre" con "26 de noviembre".
const NUM = { uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21, veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29, treinta: 30 };
function aDigitos(texto) {
  return normalizar(texto).replace(/\btreinta y (uno|una)\b/g, '31').replace(/\b[a-z]+\b/g, w => (NUM[w] !== undefined && !['una', 'uno'].includes(w) ? String(NUM[w]) : w));
}
const STOP = new Set('para como pero porque cuando donde desde hasta entre sobre tambien ademas esta este estos estas esas esos ellos ellas aquel aquella tiene tienen sera seran habia hacia segun todo todos toda todas otra otro otros otras mismo misma muy mas menos cada solo todavia aunque mientras'.split(' '));
const clave = t => [...new Set((normalizar(aDigitos(t)).match(/[a-z0-9ñ]+/g) || []).filter(w => /\d/.test(w) || (w.length >= 5 && !STOP.has(w))).map(w => (/\d/.test(w) ? w : w.slice(0, 5))))];

const PROMPT_HECHOS = `Extraes los DATOS de una noticia de farándula. Recibes el texto base y devuelves SOLO JSON: {"hechos":[{"texto":"...","confirmado":true|false}]}
- Entre 6 y ${MAX_HECHOS} datos ATÓMICOS (uno por afirmación), con las mismas palabras, nombres, fechas y cifras del texto. No inventes ni interpretes.
- Incluye TODO lo que sea concreto: quién, qué, dónde, cuándo, citas textuales, cifras, fechas, premios, antecedentes, quién la acompañó, qué dijo.
- Cada dato corto: máximo 25 palabras. Una CITA textual larga se reduce a su fragmento más fuerte (máximo 20 palabras), copiado tal cual, entre comillas simples.
- "confirmado":false solo si el texto lo presenta como rumor, versión sin confirmar o "según fuentes".`;

async function extraerHechos(material, { llamar = null } = {}) {
  if (!llamar) { const gemini = require('../gemini'); llamar = (p, m) => gemini.llamarJSON(p, m, gemini.TAREAS.fragmentacion); }
  const r = await llamar(PROMPT_HECHOS, material);
  const hechos = (Array.isArray(r && r.hechos) ? r.hechos : []).filter(h => h && typeof h.texto === 'string' && h.texto.trim()).slice(0, MAX_HECHOS)
    .map(h => (h.confirmado === false ? { texto: h.texto.trim(), confirmado: false } : { texto: h.texto.trim() }));
  if (hechos.length < 3) throw new Error('el modelo devolvió menos de 3 datos');
  return hechos;
}

const PICANTE = `TONO (importante): cuenta la noticia con chisme y gancho, como una amiga que se la cuenta a otra: frases cortas, preguntas al espectador, ironía suave, énfasis en lo más jugoso de los DATOS. NO suenes a periódico.
PARA LLENAR ESPACIO no inventes: vuelve sobre los mismos DATOS desde otro ángulo (el contraste, el antes y el después, la cuenta regresiva, lo que significa, la pregunta que deja) o háblale al espectador.
PROHIBIDO: agregar hechos, intenciones, motivos, reacciones, resultados, citas o cifras que no estén en los DATOS; decir qué hará, piensa o siente alguien si los DATOS no lo dicen; metáforas que afirmen algo nuevo (p. ej. que alguien va a quitarle algo a otra persona). Una cita textual se copia tal cual y puede acortarse a su frase más fuerte (máximo 20 palabras).
FORMATO: fechas y cifras con dígitos (26 de noviembre, 12 de diciembre, 0,99 dólares), no en letras.`;

function bloqueMaterial(cronica, hechos, nota = '') {
  return `${cronica}\n\n=== DATOS OBLIGATORIOS (TODOS deben aparecer en el guion; son lo único que puedes afirmar) ===\n${hechos.map((h, i) => `${i + 1}. ${h.texto}${h.confirmado === false ? ' [NO CONFIRMADO: cuéntalo como versión, no como hecho]' : ''}`).join('\n')}\n=== FIN DE LOS DATOS ===\n\n=== PAUTA DE TONO ===\n${PICANTE}\n=== FIN DE LA PAUTA ===${nota ? `\n\n${nota}` : ''}`;
}

// ¿Qué datos del hecho aparecen en el guion? Un dato cuenta como cubierto si al menos el 60 % de sus palabras clave (cifras y palabras de 5+ letras,
// comparadas por sus primeras 5 letras para tolerar conjugaciones) están en el guion. Sin modelo, determinista.
function cobertura(script, hechos) {
  const enGuion = new Set(clave(script)), faltan = [];
  hechos.forEach((h, i) => { const k = clave(h.texto); if (k.length && k.filter(w => enGuion.has(w)).length / k.length < 0.6) faltan.push({ n: i + 1, texto: h.texto }); });
  return { total: hechos.length, faltan, pct: hechos.length ? (hechos.length - faltan.length) / hechos.length : 1 };
}

// ¿Aparecieron cifras o nombres propios que NO están en el material? (determinista) Cifras: números de 10 en adelante o con decimales.
// Nombres: palabras con mayúscula que no abren frase, de 4+ letras, que no están en el material.
function inventados(script, base) {
  const nb = normalizar(aDigitos(base)), ns = aDigitos(script);
  const cifrasBase = new Set((nb.match(/\d+(?:[.,]\d+)*/g) || []).map(x => x.replace(/[.,]/g, '')));
  const numeros = [...new Set((ns.match(/\d+(?:[.,]\d+)*/g) || []).filter(x => x.replace(/[.,]/g, '').length >= 2 && !cifrasBase.has(x.replace(/[.,]/g, ''))))];
  const nombres = new Set(), baseN = normalizar(base);
  const reP = /[A-Za-zÁÉÍÓÚÑÜáéíóúñü]+/g, texto = String(script);
  for (const m of texto.matchAll(reP)) {
    const w = m[0]; if (w.length < 4 || !/^[A-ZÁÉÍÓÚÑ]/.test(w)) continue;
    const previo = texto.slice(0, m.index).trimEnd(); // lo que va antes, sin espacios
    if (!previo || /[.!?…¿¡«»“”"]$/.test(previo)) continue; // abre frase o cita
    if (!baseN.includes(normalizar(w))) nombres.add(w);
  }
  return { numeros, nombres: [...nombres] };
}


// ---- pulido: repetidos, relleno y largo (todo sin modelo) ----
const partir = s => String(s).replace(/\s+/g, ' ').trim().split(/(?<=[.!?…»])\s+(?=[A-ZÁÉÍÓÚÑ¿¡«"“0-9])/).filter(Boolean);

// Fechas repetidas ("26 de noviembre" dos veces) y frases casi iguales (misma carga de palabras clave).
function repetidos(script) {
  const out = [], fechas = aDigitos(script).match(/\b\d{1,2} de [a-z]+/g) || [], vistas = new Set();
  for (const f of fechas) { if (vistas.has(f) && !out.includes(f)) out.push(f); vistas.add(f); }
  const fr = partir(script).map(f => ({ f, k: new Set(clave(f)) }));
  for (let i = 0; i < fr.length; i++) for (let j = i + 1; j < fr.length; j++) {
    const comun = [...fr[i].k].filter(w => fr[j].k.has(w)).length, union = new Set([...fr[i].k, ...fr[j].k]).size;
    if (fr[i].k.size >= 4 && fr[j].k.size >= 4 && comun / union >= 0.5) out.push(`frases casi iguales: "${fr[i].f.slice(0, 50)}…" y "${fr[j].f.slice(0, 50)}…"`);
  }
  return out;
}

// Relleno: frases afirmativas (no preguntas ni citas) cuyas palabras clave casi no aparecen en NINGÚN dato de la noticia.
function relleno(script, hechos) {
  const dat = new Set(hechos.flatMap(h => clave(h.texto)));
  return partir(script).filter(f => !/[?»]/.test(f) && !f.includes('«')).filter(f => { const k = clave(f); return k.length >= 4 && k.filter(w => dat.has(w)).length / k.length < 0.25; });
}

function problemas(script, hechos, base, { maxPalabras = null } = {}) {
  const c = cobertura(script, hechos), inv = inventados(script, base);
  const lista = [];
  if (c.faltan.length) lista.push(`faltan datos: ${c.faltan.map(f => f.texto).join(' | ')}`);
  if (inv.numeros.length) lista.push(`cifras que no están en la noticia: ${inv.numeros.join(', ')}`);
  if (inv.nombres.length) lista.push(`nombres que no están en la noticia: ${inv.nombres.join(', ')}`);
  const rep = repetidos(script), rel = relleno(script, hechos), n = (script.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]+/g) || []).length, largo = maxPalabras && n > maxPalabras;
  if (rep.length) lista.push(`repeticiones: ${rep.join(' | ')}`);
  if (rel.length > 1) lista.push(`frases de relleno sin ningún dato (quítalas o reemplázalas por un dato que aún no hayas usado): ${rel.map(f => '"' + f.slice(0, 70) + '…"').join(' | ')}`);
  if (largo) lista.push(`demasiado largo: ${n} palabras, el máximo es ${maxPalabras}; quita relleno, no datos`);
  return { cobertura: c, inventados: inv, repetidos: rep, relleno: rel, palabras: n, lista, ok: c.pct >= 0.85 && !inv.numeros.length && !inv.nombres.length && !rep.length && rel.length <= 1 && !largo };
}

function notaDeCorreccion(p) {
  return `CORRECCIÓN: el intento anterior de este guion tuvo estos problemas: ${p.lista.join('; ')}. Escríbelo de nuevo incluyendo TODOS los DATOS OBLIGATORIOS, sin ninguna cifra ni nombre que no esté en ellos, y conservando el tono de chisme. LA LONGITUD NO CAMBIA: respeta el número de palabras pedido; para que quepan los datos, sé más conciso con cada uno.`;
}

module.exports = { repetidos, relleno, extraerHechos, bloqueMaterial, cobertura, inventados, problemas, notaDeCorreccion, aDigitos, PICANTE, PROMPT_HECHOS };

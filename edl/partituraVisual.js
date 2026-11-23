// "Partitura visual" del guion narrativo: para cada frase, qué pieza gráfica (receta del estilo) la acompaña.
// El modelo elige de un catálogo CERRADO y rellena params; el código exige que TODO lo que aparece en pantalla
// salga de la frase narrada (el texto en pantalla nunca puede traer un dato que la voz no dice) y que el
// sello de rumor solo vaya donde la frase usa un hecho no confirmado. Sin modelo o con respuesta mala:
// respaldo por reglas (fechas, cifras, hechos no confirmados).
const recetas = require('../recetas');

const PIEZAS = ['cifra_pildora', 'tarjeta_dato', 'sello_animado'];
const ETIQUETAS = ['Fecha', 'Lugar', 'Cargo', 'Título', 'Antes', 'Después'];
const DENSIDAD_MAX = 0.6; // fracción de frases con pieza: más que eso es ruido

const normalizar = t => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const NUMEROS = { uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, cien: 100, mil: 1000 };

// Valores numéricos que la frase dice (en cifras, con o sin puntos de miles, o en palabras).
function numerosEnFrase(frase) {
  const n = normalizar(frase), vals = new Set();
  for (const m of n.matchAll(/\d[\d.]*/g)) { const v = parseInt(m[0].replace(/\./g, ''), 10); if (Number.isFinite(v)) vals.add(v); }
  for (const w of n.match(/[a-zñ]+/g) || []) if (NUMEROS[w] !== undefined) vals.add(NUMEROS[w]);
  return vals;
}

const contiene = (frase, texto) => normalizar(frase).includes(normalizar(texto).trim());

function validarPieza(p, beats, hechos) {
  const errores = [];
  const n = p.beat;
  if (!Number.isInteger(n) || n < 1 || n > beats.length) return [`beat ${n}: no existe`];
  const frase = beats[n - 1].frase;
  if (!PIEZAS.includes(p.recipe)) return [`beat ${n}: pieza "${p.recipe}" fuera del catálogo (${PIEZAS.join(', ')})`];
  const malos = recetas.validarParams(p.recipe, p.params);
  if (malos.length) return [`beat ${n}: params de ${p.recipe} inválidos (${malos[0]})`];
  const params = p.params || {};
  if (p.recipe === 'cifra_pildora') {
    if (!numerosEnFrase(frase).has(params.valor)) errores.push(`beat ${n}: la cifra ${params.valor} no está en la frase`);
    const suf = normalizar(params.sufijo || '').replace(/[$%€]/g, '').trim();
    if (suf && !contiene(frase, suf)) errores.push(`beat ${n}: el sufijo "${params.sufijo}" no está en la frase`);
  }
  if (p.recipe === 'tarjeta_dato') {
    if (!contiene(frase, params.titulo)) errores.push(`beat ${n}: el titular "${params.titulo}" no está literalmente en la frase`);
    if (params.detalle && !contiene(frase, params.detalle)) errores.push(`beat ${n}: el detalle "${params.detalle}" no está literalmente en la frase`);
    if (params.etiqueta && !ETIQUETAS.map(normalizar).includes(normalizar(params.etiqueta))) errores.push(`beat ${n}: etiqueta "${params.etiqueta}" fuera de la lista (${ETIQUETAS.join(', ')})`);
  }
  if (p.recipe === 'sello_animado') {
    const usaNoConfirmado = (beats[n - 1].hechos || []).some(r => hechos[r - 1] && hechos[r - 1].confirmado === false);
    if (!usaNoConfirmado) errores.push(`beat ${n}: sello de rumor en una frase sin hechos no confirmados`);
  }
  return errores;
}

function validarPartitura(piezas, beats, hechos) {
  const errores = [];
  if (!Array.isArray(piezas)) return ['la respuesta no trae "piezas"'];
  const vistos = new Set();
  for (const p of piezas) {
    if (vistos.has(p.beat)) errores.push(`beat ${p.beat}: más de una pieza`);
    vistos.add(p.beat);
    errores.push(...validarPieza(p, beats, hechos));
  }
  const tope = Math.max(1, Math.ceil(beats.length * DENSIDAD_MAX));
  if (piezas.length > tope) errores.push(`${piezas.length} piezas para ${beats.length} frases (máx. ${tope}): deja solo las que aportan`);
  return errores;
}

const PROMPT = (beats, errores) => `Eres director visual de un video corto de farándula, estilo "noticia contada". Para cada frase del guion puedes añadir UNA pieza gráfica, o ninguna.
Piezas (catálogo cerrado):
${PIEZAS.map(id => `- ${id}: ${recetas.obtener(id).cuando}`).join('\n')}
Reglas:
- Solo si la frase tiene un dato que se gana la pantalla: una cifra, una fecha, un lugar o cargo concreto, o un hecho no confirmado. Máx. ${Math.ceil(beats.length * DENSIDAD_MAX)} piezas en total; las frases sin dato fuerte quedan sin pieza.
- Todo texto en pantalla (titulo, detalle, sufijo) COPIA palabras exactas de la frase; nunca añadas nada que la frase no diga.
- cifra_pildora: {"valor": entero que la frase dice, "sufijo": palabra de la frase o "$"/"%", "agrupar": false si es un año}. tarjeta_dato: {"etiqueta": ${ETIQUETAS.join('|')}, "titulo": máx. 60 caracteres copiados de la frase, "detalle": opcional, copiado}. sello_animado: {} solo si la frase usa un hecho no confirmado (campo "noConfirmado": true).
- No repitas la misma pieza en frases seguidas.
Responde SOLO JSON: {"piezas":[{"beat":1,"recipe":"tarjeta_dato","params":{...}}]}${errores.length ? `\nTu respuesta anterior tuvo estos problemas, corrígelos:\n- ${errores.join('\n- ')}` : ''}`;

function llamarGemini(prompt, mensaje) {
  const gemini = require('../gemini');
  return gemini.llamarJSON(prompt, mensaje, gemini.TAREAS.guionNarrativo);
}

// Respaldo por reglas: fecha → tarjeta; cifra suelta → píldora; hecho no confirmado → sello. Respeta la densidad.
function partituraDeterminista(beats, hechos) {
  const piezas = [];
  const RE_FECHA = /\b\d{1,2} de [a-záéíóúñ]+(?: de \d{4})?/i;
  beats.forEach((b, i) => {
    const beat = i + 1, frase = b.frase;
    const noConf = (b.hechos || []).some(r => hechos[r - 1] && hechos[r - 1].confirmado === false);
    const fecha = frase.match(RE_FECHA);
    if (fecha) { piezas.push({ beat, recipe: 'tarjeta_dato', params: { etiqueta: 'Fecha', titulo: fecha[0] } }); return; }
    const sinFecha = frase.replace(RE_FECHA, '');
    const cifra = sinFecha.match(/(\d[\d.]*)\s+([a-záéíóúñ]+)?/i);
    if (cifra) {
      const valor = parseInt(cifra[1].replace(/\./g, ''), 10);
      const esAnio = valor >= 1900 && valor <= 2100;
      if (Number.isFinite(valor) && !esAnio && valor > 1) { piezas.push({ beat, recipe: 'cifra_pildora', params: { valor, ...(cifra[2] && cifra[2].length <= 11 ? { sufijo: ` ${cifra[2]}` } : {}) } }); return; }
    }
    if (noConf) piezas.push({ beat, recipe: 'sello_animado', params: {} });
  });
  const tope = Math.max(1, Math.ceil(beats.length * DENSIDAD_MAX));
  return piezas.slice(0, tope);
}

// beats: [{frase, rol, hechos:[n]}]; hechos: [{texto, confirmado?}] → { piezas:[{beat(1-based), recipe, params}], origen, avisos }
async function partituraVisual(beats, hechos, { llamar = llamarGemini, maxReintentos = 1 } = {}) {
  const avisos = [];
  const mensaje = JSON.stringify(beats.map((b, i) => ({ beat: i + 1, frase: b.frase, noConfirmado: (b.hechos || []).some(r => hechos[r - 1] && hechos[r - 1].confirmado === false) })));
  let errores = [];
  for (let intento = 0; intento <= maxReintentos; intento++) {
    let r;
    try { r = await llamar(PROMPT(beats, errores), mensaje); } catch (e) { avisos.push(`el modelo falló (${e.message})`); break; }
    const piezas = ((r && r.piezas) || []).filter(p => p && p.recipe && p.recipe !== 'ninguna');
    errores = validarPartitura(piezas, beats, hechos);
    if (!errores.length) return { piezas, origen: 'llm', avisos };
  }
  const piezas = partituraDeterminista(beats, hechos).filter(p => !validarPieza(p, beats, hechos).length);
  avisos.push(`partitura determinista de respaldo (${errores.join('; ') || 'sin respuesta'})`);
  return { piezas, origen: 'respaldo', avisos };
}

// Mapa que entiende el modo recetas del render: índice de fragmento (0-based) → { recipe, params }.
const recetasPorParrafo = piezas => Object.fromEntries(piezas.map(p => [p.beat - 1, { recipe: p.recipe, params: p.params || {} }]));

module.exports = { partituraVisual, partituraDeterminista, validarPartitura, recetasPorParrafo, numerosEnFrase, PIEZAS, ETIQUETAS };

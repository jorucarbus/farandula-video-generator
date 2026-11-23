// Paso entre investigarHechos y generarGuion: de TODOS los hechos elige los que sirven a un arco de
// contraste y propone el gancho (qué se contrasta y con qué hechos). Reglas deterministas encima del modelo:
// índices válidos, presupuesto de palabras, núcleo de la noticia (hechos base) siempre presente.
// Sin modelo o con respuesta mala: respaldo = base + hechos web hasta llenar el presupuesto.
// palabras de hechos → el guion sale ~190-215 (≈ 60-68 s a ~190 ppm)
const PRESUPUESTO = 185;
// por debajo el guion sale raquítico: el modelo podó de más
const PISO = 140;

const normalizar = t => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const palabras = t => (normalizar(t).match(/[a-z0-9ñ]+/g) || []).length;

const PROMPT = (presupuesto, piso = PISO) => `Eres editor de videos cortos de farándula, estilo "noticia contada". Te doy una lista numerada de HECHOS.
Elige los que cuentan la historia mejor y propón el gancho.
Reglas:
- Un gancho es un CONTRASTE entre dos hechos de la lista (de dónde venía / qué logró; lo que se ve / lo que pasó). Indica cuáles ("de" y "a") y resúmelo en una frase SIN inventar nada ni usar adjetivos de valoración.
- El mejor contraste es el ORIGEN o punto de partida del protagonista (cómo empezó) contra el logro de hoy. Si la lista trae un hecho de orígenes, úsalo como "de".
- Si no hay contraste real en los hechos, "gancho" es null; no lo fuerces.
- Mantén entre ${piso} y ${presupuesto} palabras de hechos: no podes de más. El evento principal con sus datos concretos (dónde, cuándo, contra quién, quién entregó el premio) va completo.
- Elige hechos que aporten al arco (inicio → hito → resultado). Descarta datos de relleno (fecha de nacimiento, listas largas de finalistas, agradecimientos) salvo que sean el contraste.
- El hecho central de la noticia (el que pasó ahora) siempre va.
Responde SOLO JSON: {"gancho":{"de":1,"a":2,"frase":"..."}|null,"elegidos":[1,2,3]}`;

function llamarGemini(prompt, mensaje) {
  const gemini = require('../gemini');
  return gemini.llamarJSON(prompt, mensaje, gemini.TAREAS.guionNarrativo);
}

function respaldo(hechos, presupuesto) {
  const idx = []; let total = 0;
  const orden = [...hechos.keys()].sort((a, b) => (hechos[a].origen === 'web') - (hechos[b].origen === 'web') || a - b);
  for (const i of orden) { const p = palabras(hechos[i].texto); if (total + p <= presupuesto || !idx.length) { idx.push(i); total += p; } }
  return idx.sort((a, b) => a - b);
}

function validar(r, hechos, presupuesto, pisoMax = PISO) {
  const piso = Math.min(pisoMax, Math.floor(hechos.reduce((t, h) => t + palabras(h.texto), 0) * 0.8));
  const errores = [];
  const n = hechos.length;
  const elegidos = Array.isArray(r && r.elegidos) ? [...new Set(r.elegidos)].filter(i => Number.isInteger(i)) : [];
  if (!elegidos.length) return { errores: ['no elegiste ningún hecho'] };
  const malos = elegidos.filter(i => i < 1 || i > n);
  if (malos.length) errores.push(`hechos inexistentes: ${malos.join(', ')}`);
  const idx = elegidos.filter(i => i >= 1 && i <= n).map(i => i - 1).sort((a, b) => a - b);
  const total = idx.reduce((t, i) => t + palabras(hechos[i].texto), 0);
  if (total > presupuesto) errores.push(`los hechos elegidos suman ${total} palabras (máx. ${presupuesto}); quita los menos importantes`);
  if (total < piso) errores.push(`los hechos elegidos suman solo ${total} palabras (mín. ${piso}): agrega los que completan el arco (qué pasó, quién ganó, contra quién)`);
  if (!idx.some(i => hechos[i].origen !== 'web')) errores.push('falta el hecho central de la noticia (uno de los dados por el usuario)');
  let gancho = null;
  const g = r && r.gancho;
  if (g) {
    const ok = Number.isInteger(g.de) && Number.isInteger(g.a) && g.de !== g.a && idx.includes(g.de - 1) && idx.includes(g.a - 1) && String(g.frase || '').trim();
    if (ok) gancho = { de: g.de - 1, a: g.a - 1, frase: String(g.frase).trim() };
    else errores.push('gancho inválido: "de" y "a" deben ser dos hechos distintos de los elegidos, con frase');
  }
  return { errores, idx, gancho, total };
}

// → { hechos: [...elegidos, en su orden original], gancho: {de,a,frase}|null  (de/a = índices en `hechos` devuelto), descartados, origen, avisos }
async function seleccionarHechos(hechos, { tema = '', presupuesto = PRESUPUESTO, piso = PISO, llamar = llamarGemini, maxReintentos = 1 } = {}) {
  const avisos = [];
  const mensaje = JSON.stringify({ tema, hechos: hechos.map((h, i) => ({ n: i + 1, texto: h.texto, confirmado: h.confirmado !== false })) });
  let errores = [], v = null;
  for (let intento = 0; intento <= maxReintentos; intento++) {
    let r;
    try { r = await llamar(PROMPT(presupuesto, piso) + (errores.length ? `\nTu respuesta anterior tuvo estos problemas, corrígelos:\n- ${errores.join('\n- ')}` : ''), mensaje); }
    catch (e) { avisos.push(`el modelo falló (${e.message})`); break; }
    v = validar(r, hechos, presupuesto, piso);
    errores = v.errores;
    if (!errores.length) break;
  }
  let idx, gancho = null, origen = 'llm';
  if (errores.length || !v || !v.idx) {
    origen = 'respaldo'; idx = respaldo(hechos, presupuesto);
    avisos.push(`selección determinista de respaldo (${errores.join('; ') || 'sin respuesta'})`);
  } else { idx = v.idx; gancho = v.gancho; }
  const nuevoIdx = new Map(idx.map((o, k) => [o, k]));
  if (gancho) gancho = { de: nuevoIdx.get(gancho.de), a: nuevoIdx.get(gancho.a), frase: gancho.frase };
  const descartados = hechos.filter((_, i) => !nuevoIdx.has(i));
  return { hechos: idx.map(i => hechos[i]), gancho, descartados, origen, avisos };
}

module.exports = { seleccionarHechos, PRESUPUESTO, PROMPT };

// GRÁFICOS ANIMADOS del compilado (cifra con conteo, cita, lista numerada, mapa con avión). Se reutilizan los componentes de lienzo/elementos.js; aquí solo se DECIDE cuáles van y cuándo.
// Una sola llamada barata al modelo para todo el compilado (no cobra voz). Cada gráfico se valida en local contra el texto: la cifra debe estar en la frase, la cita debe ser literal,
// los elementos de la lista deben salir de la noticia y los lugares deben existir en nuestras tablas (las coordenadas NUNCA las inventa el modelo).
const fs = require('fs'), path = require('path');
const gemini = require('../gemini');

const ASSETS = path.join(__dirname, '..', 'assets');
const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();
const leerJ = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return {}; } };

// Lugares conocidos: nombre → { lon, lat, nombre }. Ecuador (lugares.json) y ciudades del mundo (ciudades-mundo.json); las claves que empiezan con "_" son notas.
function lugaresConocidos() {
  const out = {}; for (const f of ['lugares.json', 'ciudades-mundo.json']) for (const [k, v] of Object.entries(leerJ(path.join(ASSETS, f)))) if (!k.startsWith('_') && v && Number.isFinite(v.lat) && Number.isFinite(v.lon)) out[norm(k)] = { lon: v.lon, lat: v.lat, nombre: k, ecuador: f === 'lugares.json' };
  return out;
}

const PROMPT = lugares => `Eres el director de gráficos de un compilado de noticias de farándula. Para cada noticia te doy sus oraciones numeradas (desde 0). Elige de 0 a 3 gráficos por noticia, separados entre sí (como mucho uno cada ~8 segundos), SOLO cuando el dato esté escrito en esa oración. Tipos:
- cifra: {"tipo":"cifra","frase":i,"valor":número,"sufijo":" años","prefijo":""}  si la oración dice una cifra concreta (años, personas, dinero, porcentaje). El valor debe aparecer en la oración.
- cita: {"tipo":"cita","frase":i,"texto":"cita LITERAL de la oración (6 a 14 palabras)","autor":"quién lo dice"}  solo si alguien dice algo textual (entre comillas) en la oración.
- lista: {"tipo":"lista","frase":i,"titulo":"2 o 3 palabras","items":["3 o 4 elementos de máximo 5 palabras, tomados de la noticia"]}  para una enumeración clara (problemas, hechos seguidos).
- mapa: {"tipo":"mapa","frase":i,"desde":"Ciudad","hasta":"Ciudad"} para un viaje o traslado entre dos lugares, o {"tipo":"mapa","frase":i,"lugar":"Ciudad"} para un solo lugar DE ECUADOR (un lugar fuera de Ecuador solo va como destino de una ruta). SOLO con nombres de esta lista exacta: ${lugares.join(', ')}.
No inventes nada. Si una noticia no tiene un dato que ilustrar, no le pongas gráficos. Responde SOLO JSON: {"graficos":[{"noticia":1,"tipo":"...","frase":0,...}]} (noticia = número de la noticia, desde 1).`;

function mensaje(noticias) {
  return noticias.map((n, k) => `=== NOTICIA ${k + 1}: ${n.titular} ===\n${n.frases.map((f, i) => `${i}. ${f.frase}`).join('\n')}`).join('\n\n');
}

const stem = w => norm(w).slice(0, 5);
function validarUno(g, noticia, lugares) {
  const f = noticia.frases[g.frase]; if (!f) return 'frase inexistente';
  const textoNoticia = norm(noticia.frases.map(x => x.frase).join(' ')), textoFrase = norm(f.frase);
  if (g.tipo === 'cifra') {
    const v = Number(g.valor); if (!Number.isFinite(v) || v <= 0) return 'valor inválido';
    if (Number.isInteger(v) && v >= 1900 && v <= 2100) return 'es un año, no una cifra';
    const digitos = textoFrase.replace(/(\d)[ .](\d{3})/g, '$1$2'); if (!new RegExp('(^|[^0-9])' + String(v).replace('.', '[.,]?') + '([^0-9]|$)').test(digitos)) return `la cifra ${v} no está en la frase`;
    return null;
  }
  if (g.tipo === 'cita') {
    const t = norm(g.texto), n = t.split(' ').filter(Boolean).length; if (n < 4 || n > 16) return 'cita de largo inválido';
    return textoFrase.includes(t) ? null : 'la cita no es literal';
  }
  if (g.tipo === 'lista') {
    const items = Array.isArray(g.items) ? g.items.map(x => String(x).trim()).filter(Boolean) : []; if (items.length < 3 || items.length > 4) return 'la lista debe tener 3 o 4 elementos';
    const st = new Set(textoNoticia.split(' ').map(stem));
    for (const it of items) { const ws = norm(it).split(' ').filter(w => w.length >= 4); if (!ws.length || ws.filter(w => st.has(stem(w))).length / ws.length < 0.5) return `elemento fuera de la noticia: "${it}"`; if (it.split(/\s+/).length > 7) return 'elemento muy largo'; }
    return null;
  }
  if (g.tipo === 'mapa') {
    const ok = n => lugares[norm(n)];
    if (g.desde || g.hasta) return ok(g.desde) && ok(g.hasta) && norm(g.desde) !== norm(g.hasta) ? null : 'lugares desconocidos en la ruta';
    return ok(g.lugar) && ok(g.lugar).ecuador ? null : 'un lugar suelto solo puede ser de Ecuador';
  }
  return 'tipo desconocido';
}

// noticias: [{ titular, t0, t1, frases:[{ frase, t0, t1 }] }] (tiempos reales de la voz). Devuelve [{ noticia (0-based), tipo, frase, t0, t1, ...params }] ya validados y sin traslapes, y los avisos.
async function seleccionar(noticias, { llamar = null, lugares = lugaresConocidos() } = {}) {
  llamar = llamar || ((p, m) => gemini.llamarJSON(p, m, gemini.TAREAS.planEdl));
  const r = await llamar(PROMPT(Object.values(lugares).map(l => l.nombre)), mensaje(noticias)), avisos = [], ok = [];
  for (const g of (r && r.graficos) || []) {
    const n = noticias[(g.noticia || 0) - 1]; if (!n) { avisos.push(`gráfico de una noticia inexistente (${g.noticia})`); continue; }
    const e = validarUno(g, n, lugares); if (e) { avisos.push(`noticia ${g.noticia}, ${g.tipo}: descartado (${e})`); continue; }
    const f = n.frases[g.frase], t0 = Math.max(f.t0, n.t0 + 0.3), minimo = g.tipo === 'lista' ? 3.6 : g.tipo === 'mapa' ? 4.2 : 2.8;
    let t1 = Math.min(Math.max(f.t1 + 0.4, t0 + minimo), n.t1 - 0.3), ini = t0; if (t1 - ini < minimo) ini = Math.max(n.t0 + 0.3, t1 - minimo); if (t1 - ini < 2.2) { avisos.push(`noticia ${g.noticia}, ${g.tipo}: no cabe en la noticia`); continue; }
    ok.push({ ...g, noticia: g.noticia - 1, t0: ini, t1 });
  }
  ok.sort((a, b) => a.t0 - b.t0); const sin = []; // sin traslapes (gana el que empieza antes)
  for (const g of ok) { const p = sin[sin.length - 1]; if (p && g.t0 < p.t1 + 0.25) { avisos.push(`noticia ${g.noticia + 1}, ${g.tipo}: se traslapa con ${p.tipo}; descartado`); continue; } sin.push(g); }
  return { graficos: sin, avisos };
}

// → [{ t0, t1, noticia, el }] con los componentes de lienzo/elementos.js. palabras: [{palabra,t0,t1}] de TODA la voz (para alinear la cita palabra por palabra).
function construir(graficos, { palabras = [], lugares = lugaresConocidos() } = {}) {
  const E = require('../lienzo/elementos');
  return graficos.map(g => {
    const base = { t0: g.t0, t1: g.t1, cy: 0.5 };
    if (g.tipo === 'cifra') return { ...g, el: E.cifra({ valor: Number(g.valor), sufijo: g.sufijo || '', prefijo: g.prefijo || '', ...base }) };
    if (g.tipo === 'cita') {
      const ws = String(g.texto).trim().split(/\s+/), idx = palabras.findIndex((_, i) => ws.every((w, k) => palabras[i + k] && norm(palabras[i + k].palabra) === norm(w)));
      return { ...g, el: E.cita({ texto: g.texto, autor: g.autor || '', palabras: idx >= 0 ? ws.map((_, k) => ({ t: palabras[idx + k].t0 })) : [], ...base }) };
    }
    if (g.tipo === 'lista') { const n = g.items.length, paso = Math.max(0.6, (g.t1 - g.t0 - 1.0) / n); return { ...g, el: E.listaNumerada({ titulo: g.titulo || '', items: g.items.map((texto, i) => ({ texto, t: g.t0 + 0.5 + i * paso })), ...base }) }; }
    if (g.tipo === 'mapa') {
      const L = n => lugares[norm(n)];
      return { ...g, el: g.desde ? E.mapa({ desde: L(g.desde), hasta: L(g.hasta), alto: 0.5, ...base }) : E.mapa({ pais: 'Ecuador', lugar: L(g.lugar), tPin: g.t0 + 1.0, alto: 0.5, ...base }) };
    }
    throw new Error('tipo de gráfico desconocido: ' + g.tipo);
  });
}

module.exports = { seleccionar, construir, validarUno, lugaresConocidos, PROMPT, mensaje };

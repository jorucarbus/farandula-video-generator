// Guion NARRATIVO (estilo "noticia contada"): cuenta lo que pasó, en orden, sin opinión, y cada frase lleva su
// "partitura visual" (rol) para que los gráficos nazcan con el guion. Referencia: nota 29 (capitolinsiders).
// El modelo (Gemini o Claude, inyectable) solo ordena y redacta los HECHOS que se le dan; un validador
// rechaza lo que invente (nombres/cifras/fechas nuevos), la opinión, la moraleja y lo no confirmado sin fuente.
const { hechosNuevos, solapamiento } = require('./compilado');

const ROLES = ['persona', 'cifra', 'fecha', 'lugar', 'objeto', 'rumor', 'dato'];
const PALABRAS_MIN = 190, PALABRAS_MAX = 250, PALABRAS_FRASE_MAX = 26;

const normalizar = t => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const contarPalabras = t => (normalizar(t).match(/[a-z0-9ñ]+/g) || []).length;

const VALORACION = ['increible', 'escandalo', 'escandaloso', 'impactante', 'polemico', 'tremendo', 'brutal', 'devastador', 'sorprendente', 'indignante', 'lamentable', 'espectacular', 'bochornoso'];
const MORALEJA = /\b(moraleja|ensenanza|leccion|conclusion|reflexion|al final del dia)\b/;
const ATRIBUCION = /\b(segun|de acuerdo con|asegura|aseguran|afirma|afirman|dijo|dice|dicen|declaro|conto|cuenta|publico|informo|informa|medios|prensa|se rumora|presuntamente|supuestamente|habria|rumor)\b/;
const TEMPORAL = /\b(hoy|ayer|antes|despues|luego|mientras|al final|desde|hace|en 1\d{3}|en 20\d{2}|ese dia|esa noche|meses|semanas|anos|primero|finalmente|entonces|cuando|tras)\b|\b(19|20)\d{2}\b/;

// hechos: [{ texto, confirmado?: boolean (por defecto true), fuente?: string }]
// Largo esperado según los hechos dados: el modelo no puede decir mucho más de lo que se le dio.
function limitesDeLargo(hechos) {
  const base = hechos.reduce((t, h) => t + contarPalabras(h.texto), 0);
  return { palabrasMin: Math.max(40, Math.min(PALABRAS_MIN, Math.floor(base * 0.7))), palabrasMax: Math.min(PALABRAS_MAX, Math.ceil(base * 1.25)) };
}

function validarGuion(beats, hechos, { palabrasMin = PALABRAS_MIN, palabrasMax = PALABRAS_MAX, maxSolape = 0.5 } = {}) {
  const errores = [], avisos = [];
  if (!Array.isArray(beats) || !beats.length) return { errores: ['sin frases'], avisos };
  const fuentes = hechos.map(h => h.texto);
  let total = 0, conTiempo = 0;
  beats.forEach((b, i) => {
    const n = i + 1, frase = String(b.frase || '').trim();
    if (!frase) { errores.push(`frase ${n}: vacía`); return; }
    const pal = contarPalabras(frase); total += pal;
    if (!ROLES.includes(b.rol)) errores.push(`frase ${n}: rol "${b.rol}" no válido (${ROLES.join(', ')})`);
    if (pal > PALABRAS_FRASE_MAX) errores.push(`frase ${n}: ${pal} palabras (máx. ${PALABRAS_FRASE_MAX}, una idea por frase)`);
    const nuevos = hechosNuevos(frase, fuentes);
    if (nuevos.length) errores.push(`frase ${n}: datos que no están en los hechos: ${nuevos.join(', ')}`);
    if (solapamiento(frase, fuentes) > maxSolape) avisos.push(`frase ${n}: copia casi literal de un hecho`);
    const n0 = normalizar(frase);
    const val = VALORACION.filter(v => new RegExp(`\\b${v}\\b`).test(n0));
    if (val.length) errores.push(`frase ${n}: adjetivo de valoración (${val.join(', ')}); cuenta, no opines`);
    if (TEMPORAL.test(n0)) conTiempo++;
    const refs = Array.isArray(b.hechos) ? b.hechos : [];
    for (const r of refs) {
      const h = hechos[r - 1];
      if (!h) errores.push(`frase ${n}: hecho ${r} no existe`);
      else if (h.confirmado === false && !ATRIBUCION.test(n0)) errores.push(`frase ${n}: usa el hecho ${r} (no confirmado) sin decir quién lo afirma`);
    }
  });
  if (total < palabrasMin || total > palabrasMax) errores.push(`${total} palabras en total (entre ${palabrasMin} y ${palabrasMax})`);
  if (MORALEJA.test(normalizar(beats[beats.length - 1].frase || ''))) errores.push('el cierre no puede ser una moraleja: termina con un dato');
  if (conTiempo / beats.length < 0.4) avisos.push(`pocas marcas de tiempo (${conTiempo}/${beats.length} frases): cuenta en orden con hoy/antes/mientras/al final`);
  const usos = new Map();
  for (const b of beats) for (const r of new Set(b.hechos || [])) usos.set(r, (usos.get(r) || 0) + 1);
  for (const [r, veces] of usos) if (veces > 2) errores.push(`el hecho ${r} se repite en ${veces} frases: dilo una sola vez`);
  const usados = new Set(beats.flatMap(b => b.hechos || []));
  const sinUsar = hechos.map((_, i) => i + 1).filter(i => !usados.has(i));
  if (sinUsar.length > hechos.length * 0.2) avisos.push(`hechos sin usar: ${sinUsar.join(', ')}`);
  return { errores, avisos, palabras: total };
}

const PROMPT = (errores, min = PALABRAS_MIN, max = PALABRAS_MAX) => `Eres guionista de videos cortos de farándula, estilo "noticia contada": narras lo que pasó, en orden, sin opinar.
Usa SOLO los hechos que te doy. Español neutro, frases cortas, una sola idea por frase.
Reglas:
- Entre ${min} y ${max} palabras en total (cuéntalas; NO rellenes: si hay pocos hechos, el guion es corto); máx. ${PALABRAS_FRASE_MAX} por frase.
- Cada hecho se dice UNA vez; no lo repitas ni lo reformules. No generalices ("años de trayectoria", "certámenes locales") si los hechos no lo dicen.
- Primera frase = gancho: contrasta lo que todos ven con lo que pasa de verdad, o promete lo menos contado. Sin saludos ni presentaciones.
- Ordena con marcas de tiempo y orden: hoy, antes, mientras tanto, desde, al final.
- NO introduzcas nombres propios, cifras, fechas, lugares ni motivos que no estén en los hechos. NO describas escenas ni emociones.
- NO uses adjetivos de valoración (increíble, escandaloso, impactante...). NO opines ni concluyas.
- Un hecho con "confirmado": false se dice SIEMPRE con su fuente ("según…", "afirma…", "se rumora…"); nunca como cierto.
- Cierra con un dato concreto. Nada de moraleja, lección ni invitación a opinar.
- Cada frase lleva "rol" (lo que se dibujaría): ${ROLES.join(' | ')}, y "hechos": los números (1..N) de los hechos que usa.
Responde SOLO JSON: {"beats":[{"frase":"...","rol":"persona","hechos":[1]}]}${errores.length ? `\nTu respuesta anterior tuvo estos problemas, corrígelos:\n- ${errores.join('\n- ')}` : ''}`;

function llamarGemini(prompt, mensaje) {
  const gemini = require('../gemini');
  return gemini.llamarJSON(prompt, mensaje, gemini.TAREAS.guionNarrativo);
}

// Respaldo sin modelo: los hechos tal cual, en el orden dado. No es bonito pero es fiel y cumple el formato.
function guionDeterminista(hechos) {
  return hechos.map((h, i) => ({
    frase: h.confirmado === false && !ATRIBUCION.test(normalizar(h.texto)) ? `Según ${h.fuente || 'la prensa'}, ${h.texto.charAt(0).toLowerCase()}${h.texto.slice(1)}` : h.texto,
    rol: 'dato', hechos: [i + 1],
  }));
}

async function generarGuion(hechos, { tema = '', llamar = llamarGemini, maxReintentos = 2, ...opciones } = {}) {
  const avisos = [];
  const mensaje = JSON.stringify({ tema, hechos: hechos.map((h, i) => ({ n: i + 1, texto: h.texto, confirmado: h.confirmado !== false, fuente: h.fuente || null })) });
  const limites = { ...limitesDeLargo(hechos), ...opciones };
  let errores = [];
  for (let intento = 0; intento <= maxReintentos; intento++) {
    let r;
    try { r = await llamar(PROMPT(errores, limites.palabrasMin, limites.palabrasMax), mensaje); } catch (e) { avisos.push(`el modelo falló (${e.message})`); break; }
    const beats = (r && r.beats) || [];
    const v = validarGuion(beats, hechos, limites);
    errores = v.errores;
    if (!errores.length) return { beats, script: beats.map(b => b.frase.trim()).join(' '), origen: 'llm', palabras: v.palabras, avisos: [...avisos, ...v.avisos] };
  }
  const beats = guionDeterminista(hechos);
  avisos.push(`guion determinista de respaldo (problemas sin resolver: ${errores.join('; ') || 'sin respuesta'})`);
  return { beats, script: beats.map(b => b.frase).join(' '), origen: 'respaldo', palabras: beats.reduce((t, b) => t + contarPalabras(b.frase), 0), avisos };
}

module.exports = { limitesDeLargo, generarGuion, validarGuion, guionDeterminista, ROLES, PROMPT };

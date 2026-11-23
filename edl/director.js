// DIRECTOR de escena: para cada frase del guion narrativo decide QUÉ se ve (qué pieza principal, qué hace el muñeco, qué
// insignias acompañan) de un catálogo CERRADO, y a qué PALABRA se ancla cada cosa. El modelo propone; el código valida
// que todo texto en pantalla salga LITERAL de la frase narrada, que los íconos/lugares/poses existan y que el sello de
// rumor solo vaya con hechos no confirmados. Sin modelo o con respuesta mala: director por reglas (determinista).
// La protagonista NO narra: el muñeco ACTÚA lo narrado (pose, emoción, accesorio).
const fs = require('fs');
const path = require('path');
const { disponibles } = require('../lienzo/iconos');
const { existePieza } = require('../lienzo/recortes');
const { numerosEnFrase } = require('./partituraVisual');

const LUGARES = Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'assets', 'lugares.json'), 'utf8'))).filter(([k]) => !k.startsWith('_')));
const PRINCIPALES = ['muneco', 'mapa', 'cifra', 'lista', 'escenario', 'clip'];
const GESTOS = Object.keys(require('../lienzo/titere-rig').GESTOS); // reacciones de las manos del muñeco (catálogo cerrado)
const POSES = ['reposo', 'senalar', 'celebrar'], EMOCIONES = ['normal', 'feliz', 'sorpresa', 'enojo', 'triste'], TRAJES = ['bastonera', 'gala'];
const ACCESORIOS = ['corona'], PEGATINAS = ['guante-pulgar', 'guante-abierto', 'baston'], ESCENARIOS = ['casa', 'escenario', 'cartel'];
const MAX_EXTRAS = 2;

const normalizar = t => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const tokens = frase => normalizar(frase).split(/[^a-z0-9ñ]+/).filter(Boolean);
const contiene = (frase, texto) => normalizar(frase).replace(/\s+/g, ' ').includes(normalizar(texto).replace(/\s+/g, ' ').trim());
const tieneAncla = (frase, ancla) => tokens(frase).includes(normalizar(ancla).trim());
const nombreDePieza = (traje, pose) => (pose === 'reposo' ? `cuerpo-${traje}` : `cuerpo-${traje}-${pose}`);

// clips: Map beat(0-based) → { id, ss, motivo } con los clips reales candidatos (de edl/biblioteca.elegirClips).
function validarEscena(e, beats, hechos, clips = null) {
  const errores = [], n = e && e.beat, frase = n >= 1 && n <= beats.length ? beats[n - 1].frase : null;
  if (frase === null) return [`beat ${n}: no existe`];
  const err = m => errores.push(`beat ${n}: ${m}`);
  const ancla = (a, quien) => { if (a !== undefined && a !== null && !tieneAncla(frase, a)) err(`${quien}: la palabra ancla "${a}" no está en la frase`); };
  const literal = (t, quien) => { if (!t || !contiene(frase, t)) err(`${quien}: el texto "${t}" no está literalmente en la frase`); };
  if (!PRINCIPALES.includes(e.principal)) return [`beat ${n}: principal "${e.principal}" fuera del catálogo (${PRINCIPALES.join(', ')})`];
  if (e.muneco && !['muneco', 'escenario', 'clip'].includes(e.principal)) err('el muñeco solo puede ir con principal muneco, escenario o clip');
  if (e.principal === 'muneco' && !e.muneco) err('principal muneco sin datos del muñeco');
  if (e.muneco) {
    const m = e.muneco;
    if (!TRAJES.includes(m.traje)) err(`traje "${m.traje}" no válido (${TRAJES.join(', ')})`);
    if (!POSES.includes(m.pose)) err(`pose "${m.pose}" no válida (${POSES.join(', ')})`);
    else if (TRAJES.includes(m.traje) && !existePieza(nombreDePieza(m.traje, m.pose))) err(`el traje ${m.traje} no tiene la pose ${m.pose}`);
    if (!EMOCIONES.includes(m.emocion)) err(`emoción "${m.emocion}" no válida (${EMOCIONES.join(', ')})`);
    if (m.accesorio && !ACCESORIOS.includes(m.accesorio)) err(`accesorio "${m.accesorio}" no válido`);
    if (m.pegatina && !PEGATINAS.includes(m.pegatina.id)) err(`pegatina "${m.pegatina.id}" no válida (${PEGATINAS.join(', ')})`);
    ancla(m.ancla_pose, 'ancla_pose'); ancla(m.ancla_emocion, 'ancla_emocion'); ancla(m.ancla_accesorio, 'ancla_accesorio'); if (m.pegatina) ancla(m.pegatina.ancla, 'pegatina');
    for (const s of m.saltos || []) ancla(s, 'salto');
    if (m.gesto) { if (!GESTOS.includes(m.gesto.id)) err(`gesto "${m.gesto.id}" no válido (${GESTOS.join(', ')})`); ancla(m.gesto.ancla, 'gesto'); }
  }
  if (e.principal === 'mapa') {
    if (!e.mapa || !LUGARES[e.mapa.lugar]) err(`lugar "${e.mapa && e.mapa.lugar}" fuera del catálogo`); else { literal(e.mapa.lugar, 'lugar'); ancla(e.mapa.ancla, 'mapa'); }
  }
  if (e.principal === 'cifra') {
    const c = e.cifra || {};
    if (!numerosEnFrase(frase).has(c.valor)) err(`la cifra ${c.valor} no está en la frase`);
    if (c.sufijo && !/^[$%]/.test(c.sufijo.trim()) && !contiene(frase, c.sufijo)) err(`el sufijo "${c.sufijo}" no está en la frase`);
    ancla(c.ancla, 'cifra');
  }
  if (e.principal === 'lista') {
    const l = e.lista || {};
    if (!Array.isArray(l.items) || l.items.length < 2 || l.items.length > 4) err('la lista necesita de 2 a 4 elementos');
    else for (const it of l.items) { literal(it.texto, 'elemento de lista'); ancla(it.ancla, 'elemento de lista'); }
    if (l.titulo && !/^[\p{L} ]{3,20}$/u.test(l.titulo)) err('título de lista inválido');
  }
  if (e.principal === 'escenario') {
    const s = e.escenario || {};
    if (!ESCENARIOS.includes(s.tipo)) err(`escenario "${s.tipo}" no válido`); literal(s.texto, 'letrero'); ancla(s.ancla, 'escenario');
  }
  if (e.principal === 'clip') { // video real: solo el candidato elegido por la búsqueda, nunca uno inventado
    const cand = clips && clips.get(n - 1), c = e.clip || {};
    if (!cand) err('no hay clip real candidato para esta frase');
    else { if (c.id !== cand.id) err('el clip debe ser el candidato ' + cand.id + ', no ' + c.id); if (Number(c.ss) !== Number(cand.ss)) err('el inicio (ss) debe ser el del candidato'); }
    if (c.marca) { if (c.marca.tipo !== 'circulo') err('la marca solo puede ser un círculo'); ancla(c.marca.ancla, 'marca'); }
  }
  const extras = e.extras || [];
  if (extras.length > MAX_EXTRAS) err(`más de ${MAX_EXTRAS} extras`);
  const iconos = new Set(disponibles());
  for (const x of extras) {
    if (x.tipo === 'insignia') { if (!iconos.has(x.icono)) err(`ícono "${x.icono}" no existe`); literal(x.etiqueta, 'etiqueta'); ancla(x.ancla, 'insignia'); }
    else if (x.tipo === 'sello') {
      const noConf = (beats[n - 1].hechos || []).some(r => hechos[r - 1] && hechos[r - 1].confirmado === false);
      if (!noConf) err('sello de rumor en una frase sin hechos no confirmados'); ancla(x.ancla, 'sello');
    } else err(`extra "${x.tipo}" desconocido`);
  }
  return errores;
}

function validarDireccion(escenas, beats, hechos, clips = null) {
  if (!Array.isArray(escenas)) return ['la respuesta no trae "escenas"'];
  const errores = [], vistos = new Set();
  for (const e of escenas) { if (vistos.has(e.beat)) errores.push(`beat ${e.beat}: más de una escena`); vistos.add(e.beat); errores.push(...validarEscena(e, beats, hechos, clips)); }
  for (let i = 1; i <= beats.length; i++) if (!vistos.has(i)) errores.push(`beat ${i}: sin escena (cada frase necesita al menos una pieza)`);
  return errores;
}

// ── Director por REGLAS (respaldo y base): fechas, cifras, lugares, listas, escenarios, y el muñeco actuando lo narrado ──
const ICONO_DE = { bastonera: 'wand', corona: 'crown', reina: 'crown', educativa: 'school', colegio: 'school', escuela: 'school', musical: 'music', grupo: 'music', tiktok: 'brand-tiktok', instagram: 'brand-instagram', youtube: 'brand-youtube', titulos: 'trophy', titulo: 'trophy', premio: 'trophy', virreina: 'award', finalista: 'medal', coliseo: 'building-stadium', desfiles: 'flag', desfile: 'flag', respaldo: 'heart', agradecio: 'heart' };
const COLOR_DE = { crown: 'rojo', trophy: 'verde', heart: 'rojo', award: 'verde', medal: 'verde', school: 'verde', music: 'rojo', 'brand-instagram': 'rojo' };
const RE_FECHA = /\b\d{1,2} de [a-záéíóúñ]+(?: de \d{4})?/i;
const RE_VERBO_LISTA = /^(?:Antes,?\s*|Despu[eé]s,?\s*)?(?:gan[oó] (?:los )?(?:t[ií]tulos? de )?|obtuvo (?:los )?(?:t[ií]tulos? de )?)/i; // quita el verbo que antecede al primer elemento
const RE_ESCENARIO = [/Unidad Educativa \p{Lu}\p{L}+/u, /Coliseo La California/u, /Escuela \p{Lu}\p{L}+/u];

function palabraOriginal(frase, norm) { return (frase.match(/[\p{L}\p{N}]+/gu) || []).find(w => normalizar(w) === norm); }

function escenaPorReglas(b, i, hechos, previa, clips = null) {
  const frase = b.frase, n = i + 1, toks = tokens(frase), usa = new Set();
  const noConf = (b.hechos || []).some(r => hechos[r - 1] && hechos[r - 1].confirmado === false);
  const e = { beat: n, extras: [] };
  const cand = clips && clips.get(i); // si hay video real que calza, va primero: es la mejor evidencia
  if (cand) { e.principal = 'clip'; e.clip = { id: cand.id, ss: cand.ss, marca: { tipo: 'circulo', ancla: toks.find(t => t.length >= 6) || toks[0] } }; }
  const anios = frase.match(/\b(19|20)\d{2}\b/g) || [];
  const lugar = Object.keys(LUGARES).find(l => contiene(frase, l));
  const cifra = (() => { const m = frase.replace(RE_FECHA, '').match(/(\d[\d.]*)\s+([a-záéíóúñ]+)?/i); if (!m) return null; const v = parseInt(m[1].replace(/\./g, ''), 10); return Number.isFinite(v) && v > 1 && !(v >= 1900 && v <= 2100) ? { valor: v, sufijo: m[2] && m[2].length <= 11 ? m[2] : undefined, ancla: normalizar(m[1].replace(/\./g, '')) } : null; })();
  const escen = RE_ESCENARIO.map(re => frase.match(re)).find(Boolean);
  if (!e.principal && anios.length >= 3) {
    const partes = frase.split(/,\s*| y /).map(p => p.trim()).filter(p => /\b(19|20)\d{2}\b/.test(p));
    if (partes.length >= 2) { e.principal = 'lista'; e.lista = { titulo: 'Títulos', items: partes.slice(0, 4).map(p => { const t = p.replace(RE_VERBO_LISTA, '').replace(/[.]$/, ''); return { texto: t, ancla: tokens(t)[0] }; }) }; }
  }
  if (!e.principal && lugar && !(previa && previa.principal === 'mapa')) { e.principal = 'mapa'; e.mapa = { lugar, ancla: normalizar(lugar).split(' ')[0] }; }
  if (!e.principal && cifra) { e.principal = 'cifra'; e.cifra = cifra; }
  const celebra = /\b(gan[oó]|corona|reina|campe|titulo|triunf|logr[oó])/i.test(normalizar(frase));
  const muneco = () => {
    const m = { traje: 'bastonera', pose: celebra ? 'celebrar' : 'reposo', emocion: celebra ? 'feliz' : 'normal' };
    const w = toks.find(t => /^(gano|corona|campeona|triunfo)$/.test(t)); if (celebra && w) { m.ancla_pose = w; m.ancla_emocion = w; }
    if (toks.includes('corona')) { m.accesorio = 'corona'; m.ancla_accesorio = 'corona'; }
    if (toks.includes('bastonera')) m.pegatina = { id: 'baston', ancla: 'bastonera' };
    // gesto de reacción según lo que se cuenta (palabras de la frase; el ancla es la propia palabra)
    const gesto = [[/^(segun|aseguran|supuestamente|rumor|presuntamente|dicen)$/, 'boca'], [/^(sorprendio|sorpresa|increible|nadie|inesperado)$/, 'mejillas'], [/^(agradecio|gracias|respaldo|carino|apoyo)$/, 'pecho'], [/^(premio|aplausos|reconocimiento|reconocio)$/, 'aplauso'], [/^(supero|enfrento|desafio|competencia)$/, 'cintura'], [/^(quiza|posible|talvez|duda)$/, 'encoger']];
    for (const [re, id] of gesto) { const w2 = toks.find(t => re.test(t)); if (w2) { m.gesto = { id, ancla: w2 }; break; } }
    return m;
  };
  if (e.principal === 'clip' && !e.muneco) e.muneco = muneco(); // tras los 3 s del clip, el muñeco actúa lo narrado
  if (!e.principal && escen) { e.principal = 'escenario'; e.escenario = { tipo: 'casa', texto: escen[0], ancla: tokens(escen[0])[0] }; e.muneco = { traje: 'bastonera', pose: 'senalar', emocion: 'normal', ancla_pose: tokens(escen[0])[0] }; }
  if (!e.principal) { e.principal = 'muneco'; e.muneco = muneco(); }
  // extras: fecha, y el primer ícono que calce con una palabra de la frase (sin repetir lo que ya hace el principal)
  const fecha = frase.match(RE_FECHA);
  if (fecha) e.extras.push({ tipo: 'insignia', icono: 'calendar-event', color: 'negro', etiqueta: fecha[0], ancla: tokens(fecha[0])[0] });
  for (const t of toks) {
    if (e.extras.length >= MAX_EXTRAS || !ICONO_DE[t] || usa.has(ICONO_DE[t])) continue;
    if (e.muneco && e.muneco.accesorio && ICONO_DE[t] === 'crown') continue;
    if (e.escenario && ICONO_DE[t] === 'school') continue;
    if (e.principal === 'muneco' && ICONO_DE[t] === 'wand') continue; // el bastón ya es pegatina del muñeco
    usa.add(ICONO_DE[t]); e.extras.push({ tipo: 'insignia', icono: ICONO_DE[t], color: COLOR_DE[ICONO_DE[t]] || 'negro', etiqueta: palabraOriginal(frase, t), ancla: t });
  }
  if (noConf && e.extras.length < MAX_EXTRAS) { const a = toks.find(t => /^(segun|medios|prensa|asegura|aseguran|rumor)$/.test(t)) || toks[0]; e.extras.push({ tipo: 'sello', ancla: a }); }
  return e;
}

function directorPorReglas(beats, hechos, clips = null) {
  const escenas = []; beats.forEach((b, i) => escenas.push(escenaPorReglas(b, i, hechos, escenas[i - 1], clips)));
  return escenas;
}

// ── Director con modelo (catálogo cerrado) + validador + respaldo ─────────────────────────────────────────────
const PROMPT = (errores) => `Eres director de escena de un video corto de farándula, estilo "noticia contada". Para CADA frase del guion decide qué se ve.
Catálogo cerrado:
- principal: "muneco" (la protagonista ACTÚA lo que se cuenta; NO habla) | "mapa" (lugar de Ecuador de esta lista: ${Object.keys(LUGARES).join(', ')}) | "cifra" (un número que la frase dice) | "lista" (2-4 elementos que la frase enumera) | "escenario" (casa/escenario/cartel con un letrero) | "clip" (VIDEO REAL de la protagonista: SOLO si la frase trae "clipCandidato"; copia su id y ss tal cual; "marca" opcional {"tipo":"circulo","ancla":palabra} encierra su rostro con un círculo rojo dibujado a mano; el clip dura 3 s y DESPUÉS entra el muñeco: puedes dar "muneco" en esa misma frase) .
- "muneco": {traje: ${TRAJES.join('|')}, pose: ${POSES.join('|')} (celebrar/senalar solo con traje bastonera), emocion: ${EMOCIONES.join('|')}, accesorio?: "corona", pegatina?: {id: ${PEGATINAS.join('|')}, ancla}, gesto?: {id: ${GESTOS.join('|')}, ancla} (reacción de las manos: mejillas=sorpresa, pecho=ternura/agradecimiento, boca=chisme o rumor, aplauso=premio, cintura=reto/competencia, encoger=duda, saludo), ancla_pose?, ancla_emocion?, ancla_accesorio?}. Solo con principal muneco o escenario.
- extras (máx. ${MAX_EXTRAS}): {tipo:"insignia", icono: uno de [${disponibles().join(', ')}], etiqueta, ancla, color?: negro|rojo|verde} o {tipo:"sello", ancla} (solo si la frase usa un hecho no confirmado).
Reglas:
- Toda frase lleva al menos una pieza. Todo texto en pantalla (etiqueta, letrero, elementos de lista, sufijo) COPIA palabras exactas de la frase; nunca añadas nada que la frase no diga.
- Cada "ancla" es UNA palabra de la frase: en ella aparece esa pieza.
- Los elementos de una lista son las cosas nombradas (nombres propios, títulos, cifras), no palabras sueltas como "primera" o "segunda"; si no hay al menos 2 así, usa otro principal.
- Si la frase trae clipCandidato, úsalo como principal "clip" (con el muñeco actuando después); solo descártalo si la frase pide un mapa, una cifra o una lista.
- Varía: no repitas el mismo principal más de 2 frases seguidas; la protagonista actúa el hito (ganar, coronarse) con pose celebrar y emoción feliz; nadie habla.
Formas EXACTAS (una por tipo de principal; usa estas claves tal cual):
{"beat":1,"principal":"muneco","muneco":{"traje":"bastonera","pose":"celebrar","emocion":"feliz","accesorio":"corona","ancla_pose":"ganó","ancla_emocion":"ganó","ancla_accesorio":"corona","pegatina":{"id":"baston","ancla":"bastonera"}},"extras":[{"tipo":"insignia","icono":"wand","etiqueta":"bastonera","ancla":"bastonera","color":"negro"}]}
{"beat":2,"principal":"mapa","mapa":{"lugar":"Chone","ancla":"Chone"},"extras":[]}
{"beat":3,"principal":"cifra","cifra":{"valor":12,"sufijo":"aspirantes","ancla":"doce"},"extras":[]}
{"beat":4,"principal":"lista","lista":{"titulo":"Títulos","items":[{"texto":"Chonera Bonita 2023","ancla":"Chonera"},{"texto":"Miss Turismo Manabí 2024","ancla":"Miss"}]},"extras":[]}
{"beat":5,"principal":"escenario","escenario":{"tipo":"casa","texto":"Unidad Educativa Amazonas","ancla":"Unidad"},"muneco":{"traje":"bastonera","pose":"senalar","emocion":"normal","ancla_pose":"Unidad"},"extras":[]}
{"beat":6,"principal":"clip","clip":{"id":"<id del clipCandidato>","ss":2,"marca":{"tipo":"circulo","ancla":"corona"}},"extras":[]}
Responde SOLO JSON: {"escenas":[ ... una por frase ... ]}${errores.length ? `\nTu respuesta anterior tuvo estos problemas, corrígelos:\n- ${errores.join('\n- ')}` : ''}`;

function llamarGemini(prompt, mensaje) { const gemini = require('../gemini'); return gemini.llamarJSON(prompt, mensaje, gemini.TAREAS.guionNarrativo); }

// El modelo a veces escribe la lista como {elementos:[texto,...]} o la deja en la raíz: se acepta esa variante SIN relajar el contenido.
function normalizarEscena(e) {
  const x = { ...e, extras: e.extras || [] };
  if (x.principal === 'lista') {
    const l = x.lista || {}, crudos = l.items || l.elementos || x.items || x.elementos || [];
    x.lista = { titulo: l.titulo || x.titulo || 'Lista', items: crudos.map(t => (typeof t === 'string' ? { texto: t, ancla: tokens(t)[0] } : t)) };
  }
  return x;
}

async function dirigir(beats, hechos, { llamar = llamarGemini, maxReintentos = 1, clips = null } = {}) {
  const avisos = [], mensaje = JSON.stringify(beats.map((b, i) => ({ beat: i + 1, frase: b.frase, ...(clips && clips.get(i) ? { clipCandidato: { id: clips.get(i).id, ss: clips.get(i).ss, motivo: clips.get(i).motivo } } : {}), noConfirmado: (b.hechos || []).some(r => hechos[r - 1] && hechos[r - 1].confirmado === false) })));
  let errores = [];
  for (let intento = 0; intento <= maxReintentos; intento++) {
    let r; try { r = await llamar(PROMPT(errores), mensaje); } catch (e) { avisos.push(`el modelo falló (${e.message})`); break; }
    const escenas = ((r && r.escenas) || []).map(normalizarEscena);
    errores = validarDireccion(escenas, beats, hechos, clips);
    if (!errores.length) {
      // Tras los 3 s del clip la pantalla no puede quedar vacía: si el modelo no dio muñeco para una frase con clip, lo completa el código.
      const porReglas = directorPorReglas(beats, hechos, clips);
      for (const e of escenas) if (e.principal === 'clip' && !e.muneco && porReglas[e.beat - 1] && porReglas[e.beat - 1].muneco) e.muneco = porReglas[e.beat - 1].muneco;
      return { escenas, origen: 'llm', avisos };
    }
  }
  const escenas = directorPorReglas(beats, hechos, clips), malas = validarDireccion(escenas, beats, hechos, clips);
  avisos.push(`director por reglas de respaldo (${errores.join('; ') || 'sin respuesta'})`);
  if (malas.length) avisos.push(`el respaldo tiene avisos: ${malas.join('; ')}`);
  return { escenas, origen: 'respaldo', avisos };
}

module.exports = { GESTOS, normalizarEscena, dirigir, directorPorReglas, validarDireccion, validarEscena, nombreDePieza, LUGARES, PRINCIPALES, POSES, EMOCIONES, TRAJES, ACCESORIOS, PEGATINAS, ESCENARIOS, MAX_EXTRAS, normalizar, tokens };

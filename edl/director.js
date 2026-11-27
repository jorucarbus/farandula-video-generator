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

const RE_VIAJE = /\b(viaj|vuel|volo|rumbo|despeg|abord|aterriz|lleg|part[ie]|rumb)/;
const LUGARES = Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'assets', 'lugares.json'), 'utf8'))).filter(([k]) => !k.startsWith('_')));
// Países que el mapa sabe acercar (español → nombre en el atlas mundial). Ecuador y su zona usan LUGARES (ciudades).
const PAISES = { 'Puerto Rico': 'Puerto Rico', 'Estados Unidos': 'United States of America', 'México': 'Mexico', 'España': 'Spain', 'Colombia': 'Colombia', 'Perú': 'Peru', 'Venezuela': 'Venezuela', 'Argentina': 'Argentina', 'Brasil': 'Brazil', 'Chile': 'Chile', 'República Dominicana': 'Dominican Rep.', 'Cuba': 'Cuba', 'Panamá': 'Panama', 'Francia': 'France', 'Italia': 'Italy', 'Reino Unido': 'United Kingdom', 'Canadá': 'Canada', 'Japón': 'Japan', 'China': 'China', 'Rusia': 'Russia', 'Alemania': 'Germany', 'Tailandia': 'Thailand', 'Filipinas': 'Philippines', 'Australia': 'Australia', 'India': 'India', 'Vietnam': 'Vietnam', 'Corea del Sur': 'South Korea', 'Costa Rica': 'Costa Rica', 'Bolivia': 'Bolivia', 'Paraguay': 'Paraguay', 'Uruguay': 'Uruguay', 'Guatemala': 'Guatemala', 'Honduras': 'Honduras', 'Nicaragua': 'Nicaragua', 'El Salvador': 'El Salvador', 'Jamaica': 'Jamaica', 'Haití': 'Haiti', 'Portugal': 'Portugal', 'Venezuela ': 'Venezuela' };
delete PAISES['Venezuela '];
const CIUDADES = Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'assets', 'ciudades-mundo.json'), 'utf8'))).filter(([k]) => !k.startsWith('_')));
const PAISES_RUTA = { ...PAISES, Ecuador: 'Ecuador' }; // en una ruta, Ecuador también puede ser punto de salida o llegada
const esPuntoDeRuta = n => Boolean(n && (LUGARES[n] || CIUDADES[n] || PAISES_RUTA[n]));

// Punto de una ruta para el mapa: ciudad → coordenadas; país → nombre en el atlas (el mapa usa su centro).
function resolverPunto(nombre) {
  const c = LUGARES[nombre] || CIUDADES[nombre];
  if (c) return { lon: c.lon, lat: c.lat, nombre };
  return PAISES_RUTA[nombre] ? { pais: PAISES_RUTA[nombre], nombre } : null;
}

// Lugares de la frase en orden de aparición (los nombres más largos primero para no confundir "Ciudad de Panamá" con "Panamá").
function lugaresEnFrase(frase) {
  let txt = ' ' + normalizar(frase).replace(/\s+/g, ' ') + ' ';
  const nombres = [...Object.keys(LUGARES), ...Object.keys(CIUDADES), ...Object.keys(PAISES_RUTA)].filter((n, i, a) => a.indexOf(n) === i).sort((a, b) => b.length - a.length), hallados = [];
  for (const n of nombres) { const k = ' ' + normalizar(n).replace(/\s+/g, ' ') + ' '; const i = txt.search(new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '[ ,.;:!?¿¡)"»]'))); if (i >= 0) { hallados.push({ nombre: n, pos: i }); txt = txt.slice(0, i) + ' '.repeat(k.length) + txt.slice(i + k.length); } }
  return hallados.sort((a, b) => a.pos - b.pos);
}

// Salida y llegada de un viaje contado en la frase. Llegada = el lugar que sigue a "rumbo a / hacia / con destino a / viajó a..."; si no hay marca, el último. Salida = el primero que no es la llegada.
function rutaDeFrase(frase) {
  let L = lugaresEnFrase(frase); if (L.some(l => LUGARES[l.nombre] || CIUDADES[l.nombre])) L = L.filter(l => l.nombre !== 'Ecuador'); // "Guayaquil, Ecuador" es un solo lugar
  if (L.length < 2) return null;
  const norm = ' ' + normalizar(frase).replace(/\s+/g, ' ') + ' ', marca = /(rumbo a|rumbo|hacia|con destino a|destino a|viaj\w+ a|vol\w+ a|lleg\w+ a|aterriz\w+ en|part\w+ a)\s+(el |la |los |las )?$/;
  const llegada = L.find(l => marca.test(norm.slice(Math.max(0, l.pos - 30), l.pos + 1).replace(/\s+$/, ' '))) || L[L.length - 1], salida = L.find(l => l !== llegada);
  const na = normalizar(salida ? salida.nombre : ""), nb = normalizar(llegada.nombre); if (!salida || na === nb || na.includes(nb) || nb.includes(na)) return null; // "Ciudad de Panamá" y "Panamá" son el mismo sitio
  return { desde: salida.nombre, hasta: llegada.nombre };
}

const PRINCIPALES = ['muneco', 'mapa', 'cifra', 'lista', 'escenario', 'clip', 'video', 'grafico', 'cita']; // 'video' = montaje de tomas reales de fondo (sin dato): lo usa el modo sin muñeco y el storyboard
const GESTOS = Object.keys(require('../lienzo/titere-rig').GESTOS); // reacciones de las manos del muñeco (catálogo cerrado)
const POSES = ['reposo', 'senalar', 'celebrar'], EMOCIONES = ['normal', 'feliz', 'sorpresa', 'enojo', 'triste', 'duda', 'orgullo', 'asco', 'preocupacion', 'amor'], TRAJES = ['bastonera', 'gala'];
const ACCESORIOS = ['corona'], PEGATINAS = ['guante-pulgar', 'guante-abierto', 'baston'], ESCENARIOS = ['casa', 'escenario', 'cartel'];
const MAX_EXTRAS = 2;

const normalizar = t => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const tokens = frase => normalizar(frase).replace(/(\d)[.,](?=\d)/g, '$1').split(/[^a-z0-9ñ]+/).filter(Boolean); // 6.000 y 0,99 son UNA palabra (6000, 099), como en la línea de tiempo de la voz
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
    const m = e.mapa || {};
    if (m.lugar) { if (!LUGARES[m.lugar]) err(`lugar "${m.lugar}" fuera del catálogo`); else { literal(m.lugar, 'lugar'); ancla(m.ancla, 'mapa'); } }
    else if (m.ruta) { const r = m.ruta; for (const k of ['desde', 'hasta']) { if (!esPuntoDeRuta(r[k])) err(`ruta.${k} "${r[k]}" fuera del catálogo de ciudades y países`); else literal(r[k], 'ruta.' + k); } if (r.desde && r.desde === r.hasta) err('la ruta necesita dos lugares distintos'); ancla(m.ancla, 'mapa'); }
    else if (m.pais) { if (!PAISES[m.pais]) err(`país "${m.pais}" fuera del catálogo (${Object.keys(PAISES).join(', ')})`); else { literal(m.pais, 'país'); ancla(m.ancla, 'mapa'); } }
    else err('el mapa necesita "lugar" (ciudad de Ecuador), "pais" o "ruta"');
  }
  if (e.principal === 'cifra') {
    const c = e.cifra || {};
    if (!numerosEnFrase(frase).has(c.valor)) err(`la cifra ${c.valor} no está en la frase`);
    else if (c.valor < 10 && !/\d/.test(frase)) err(`la cifra ${c.valor} es pequeña y viene escrita con letras ("dos piezas"): no es un dato destacable, usa otro principal`);
    if (c.sufijo && !/^[$%]/.test(c.sufijo.trim()) && !contiene(frase, c.sufijo)) err(`el sufijo "${c.sufijo}" no está en la frase`);
    if (Number.isInteger(c.valor) && c.valor >= 1900 && c.valor <= 2100) err(`${c.valor} es un año, no una cifra destacable`);
    if (c.sufijo && /\d/.test(c.sufijo)) err(`el sufijo "${c.sufijo}" no puede llevar números (salía como "12 Top 12")`);
    ancla(c.ancla, 'cifra');
  }
  if (e.principal === 'grafico') { // barras que crecen: 2 a 5 barras, cada una con una cifra que la frase dice y una palabra (etiqueta) que la frase dice
    const g = e.grafico || {}, it = g.items;
    if (!Array.isArray(it) || it.length < 2 || it.length > 5) err('el gráfico necesita de 2 a 5 barras');
    else { const nums = numerosEnFrase(frase); for (const b of it) { if (!nums.has(b.valor)) err(`la cifra ${b.valor} del gráfico no está en la frase`); literal(b.etiqueta, 'etiqueta de barra'); ancla(b.ancla, 'barra'); } }
    if (g.titulo && !/^[\p{L} ]{3,22}$/u.test(g.titulo)) err('título de gráfico inválido');
  }
  if (e.principal === 'cita') { // frase textual que la frase cita: se muestra tal cual, palabra por palabra, en una tarjeta
    const c = e.cita || {}, nPal = tokens(c.texto || '').length;
    if (nPal < 4 || nPal > 22) err('la cita debe tener de 4 a 22 palabras'); else literal(c.texto, 'cita');
    if (c.autor) literal(c.autor, 'autor de la cita'); ancla(c.ancla, 'cita');
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

// MODO SIN MUÑECO: la pantalla la llevan las tomas reales y las piezas de datos. Un principal "muneco" pasa a "video" (montaje de tomas) y se borra todo dato del muñeco.
function quitarMuneco(e) { if (e.principal === 'muneco') e.principal = 'video'; delete e.muneco; return e; }

// ── Director por REGLAS (respaldo y base): fechas, cifras, lugares, listas, escenarios, y el muñeco actuando lo narrado ──
const ICONO_DE = { bastonera: 'wand', corona: 'crown', reina: 'crown', educativa: 'school', colegio: 'school', escuela: 'school', musical: 'music', grupo: 'music', tiktok: 'brand-tiktok', instagram: 'brand-instagram', youtube: 'brand-youtube', titulos: 'trophy', titulo: 'trophy', premio: 'trophy', virreina: 'award', finalista: 'medal', coliseo: 'building-stadium', desfiles: 'flag', desfile: 'flag', respaldo: 'heart', agradecio: 'heart' };
const COLOR_DE = { crown: 'rojo', trophy: 'verde', heart: 'rojo', award: 'verde', medal: 'verde', school: 'verde', music: 'rojo', 'brand-instagram': 'rojo' };
const RE_FECHA = /\b\d{1,2} de [a-záéíóúñ]+(?: de \d{4})?/i;
const RE_FECHAS = new RegExp(RE_FECHA.source, 'gi'); // todas las fechas de la frase
const CONECTORES = new Set(['y', 'e', 'o', 'u', 'de', 'del', 'en', 'a', 'al', 'la', 'el', 'los', 'las', 'con', 'por', 'para', 'que', 'se', 'su', 'sus', 'un', 'una', 'como', 'pero', 'mas', 'tras', 'ante', 'sin', 'sobre', 'entre', 'hacia', 'desde']);
const RE_VERBO_LISTA = /^(?:Antes,?\s*|Despu[eé]s,?\s*)?(?:gan[oó] (?:los )?(?:t[ií]tulos? de )?|obtuvo (?:los )?(?:t[ií]tulos? de )?)/i; // quita el verbo que antecede al primer elemento
const RE_ESCENARIO = [/Unidad Educativa \p{Lu}\p{L}+/u, /Coliseo La California/u, /Escuela \p{Lu}\p{L}+/u];

function palabraOriginal(frase, norm) { return (frase.match(/[\p{L}\p{N}]+/gu) || []).find(w => normalizar(w) === norm); }

function escenaPorReglas(b, i, hechos, previa, clips = null, sinMuneco = false) {
  const frase = b.frase, n = i + 1, toks = tokens(frase), usa = new Set();
  const noConf = (b.hechos || []).some(r => hechos[r - 1] && hechos[r - 1].confirmado === false);
  const e = { beat: n, extras: [] };
  const cand = clips && clips.get(i); // si hay video real que calza, va primero: es la mejor evidencia
  if (cand) { e.principal = 'clip'; e.clip = { id: cand.id, ss: cand.ss, marca: { tipo: 'circulo', ancla: toks.find(t => t.length >= 6) || toks[0] } }; }
  const anios = frase.match(/\b(19|20)\d{2}\b/g) || [];
  const lugar = Object.keys(LUGARES).find(l => contiene(frase, l)), pais = !lugar && Object.keys(PAISES).sort((a, b) => b.length - a.length).find(p => contiene(frase, p));
  const cifra = (() => { const m = frase.replace(RE_FECHAS, '').match(/(\d[\d.]*)\s+([a-záéíóúñ]+)?/i); if (!m) return null; const v = parseInt(m[1].replace(/\./g, ''), 10); return Number.isFinite(v) && v > 1 && !(v >= 1900 && v <= 2100) ? { valor: v, sufijo: m[2] && m[2].length <= 11 && !CONECTORES.has(normalizar(m[2])) ? m[2] : undefined, ancla: normalizar(m[1].replace(/\./g, '')) } : null; })();
  const escen = RE_ESCENARIO.map(re => frase.match(re)).find(Boolean);
  if (!e.principal) { // 2 a 5 cifras con su palabra ("6 años ... 3 títulos"): gráfico de barras
    const pares = [...frase.replace(RE_FECHAS, '').matchAll(/(?<![\d,.])(\d[\d.]*)\s+([a-záéíóúñ]{3,})/gi)].map(m => ({ valor: parseInt(m[1].replace(/\./g, ''), 10), etiqueta: m[2], ancla: normalizar(m[1].replace(/\./g, '')) })).filter(p => Number.isFinite(p.valor) && p.valor > 1 && !(p.valor >= 1900 && p.valor <= 2100));
    if (pares.length >= 2 && pares.length <= 5) { e.principal = 'grafico'; e.grafico = { items: pares }; }
  }
  if (!e.principal && anios.length >= 3) {
    const partes = frase.split(/,\s*| y /).map(p => p.trim()).filter(p => /\b(19|20)\d{2}\b/.test(p));
    if (partes.length >= 2) { e.principal = 'lista'; e.lista = { titulo: 'Títulos', items: partes.slice(0, 4).map(p => { const t = p.replace(RE_VERBO_LISTA, '').replace(/[.]$/, ''); return { texto: t, ancla: tokens(t)[0] }; }) }; }
  }
  const fechasDe = [...new Set((frase.match(RE_FECHAS) || []).map(f => f.trim()))];
  if (!e.principal && fechasDe.length >= 2 && fechasDe.length <= 4) { e.principal = 'lista'; e.lista = { titulo: 'Fechas', items: fechasDe.map(t => ({ texto: t, ancla: tokens(t)[0] })) }; } // calendario: "el 26 de noviembre..., el 29 de noviembre... y el 12 de diciembre"
  // viaje: dos lugares cualesquiera del mundo (ciudad o país) con verbo de viaje → ruta de avión (la línea punteada) en vez de un mapa suelto
  const rutaV = !e.principal && RE_VIAJE.test(normalizar(frase)) ? rutaDeFrase(frase) : null;
  if (rutaV && !(previa && previa.principal === 'mapa')) { e.principal = 'mapa'; e.mapa = { ruta: rutaV, ancla: normalizar(rutaV.hasta).split(' ')[0] }; }
  if (!e.principal && lugar && !(previa && previa.principal === 'mapa')) { e.principal = 'mapa'; e.mapa = { lugar, ancla: normalizar(lugar).split(' ')[0] }; }
  if (!e.principal && pais && !(previa && previa.principal === 'mapa')) { e.principal = 'mapa'; e.mapa = { pais, ancla: normalizar(pais).split(' ')[0] }; }
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
  const citaTxt = sinMuneco && !e.principal ? (frase.match(/[«“"]([^»”"]{18,200})[»”"]/) || [])[1] : null; // lo entrecomillado de la frase, tal cual
  if (citaTxt && tokens(citaTxt).length >= 4 && tokens(citaTxt).length <= 22) { e.principal = 'cita'; e.cita = { texto: citaTxt.trim(), ancla: tokens(citaTxt)[0] }; }
  if (!e.principal && escen) { e.principal = 'escenario'; e.escenario = { tipo: 'casa', texto: escen[0], ancla: tokens(escen[0])[0] }; e.muneco = { traje: 'bastonera', pose: 'senalar', emocion: 'normal', ancla_pose: tokens(escen[0])[0] }; }
  if (!e.principal) { e.principal = 'muneco'; e.muneco = muneco(); }
  if (sinMuneco) quitarMuneco(e); // modo sin muñeco: lo que iba al muñeco pasa a tomas reales de video
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

function directorPorReglas(beats, hechos, clips = null, { sinMuneco = false } = {}) {
  const escenas = []; beats.forEach((b, i) => escenas.push(escenaPorReglas(b, i, hechos, escenas[i - 1], clips, sinMuneco)));
  return escenas;
}

// ── Director con modelo (catálogo cerrado) + validador + respaldo ─────────────────────────────────────────────
const PROMPT = (errores) => `Eres director de escena de un video corto de farándula, estilo "noticia contada". Para CADA frase del guion decide qué se ve.
Catálogo cerrado:
- principal: "muneco" (la protagonista ACTÚA lo que se cuenta; NO habla) | "mapa" (ciudad de Ecuador de esta lista: ${Object.keys(LUGARES).join(', ')}, o un PAÍS de esta lista: ${Object.keys(PAISES).join(', ')}; usa {"lugar":...} o {"pais":...}) | "cifra" (un número que la frase dice) | "lista" (2-4 elementos que la frase enumera) | "grafico" (barras que crecen: 2 a 5 cifras que la frase dice, cada una con su etiqueta y su ancla: {"grafico":{"titulo"?:"...","items":[{"etiqueta":"años","valor":6,"ancla":"seis"}]}}) | "escenario" (casa/escenario/cartel con un letrero) | "clip" (VIDEO REAL de la protagonista: SOLO si la frase trae "clipCandidato"; copia su id y ss tal cual; "marca" opcional {"tipo":"circulo","ancla":palabra} encierra su rostro con un círculo rojo dibujado a mano; el clip dura 3 s y DESPUÉS entra el muñeco: puedes dar "muneco" en esa misma frase) .
- "muneco": {traje: ${TRAJES.join('|')}, pose: ${POSES.join('|')} (celebrar/senalar solo con traje bastonera), emocion: ${EMOCIONES.join('|')}, accesorio?: "corona", pegatina?: {id: ${PEGATINAS.join('|')}, ancla}, gesto?: {id: ${GESTOS.join('|')}, ancla} (reacción de las manos: mejillas=sorpresa, pecho=ternura/agradecimiento, boca=chisme o rumor, aplauso=premio, cintura=reto/competencia, encoger=duda, saludo), ancla_pose?, ancla_emocion?, ancla_accesorio?}. Solo con principal muneco o escenario.
- extras (máx. ${MAX_EXTRAS}): {tipo:"insignia", icono: uno de [${disponibles().join(', ')}], etiqueta, ancla, color?: negro|rojo|verde} o {tipo:"sello", ancla} (solo si la frase usa un hecho no confirmado).
Reglas:
- Toda frase lleva al menos una pieza. Todo texto en pantalla (etiqueta, letrero, elementos de lista, sufijo) COPIA palabras exactas de la frase; nunca añadas nada que la frase no diga.
- Cada "ancla" es UNA palabra de la frase: en ella aparece esa pieza.
- GRAFICA CUANDO QUEDE BONITO: si la frase nombra un lugar o país, un número, una enumeración o un letrero, prefiere mapa/cifra/lista/escenario sobre un video genérico (la pieza de datos se dibuja sobre la tarjeta del video, que sigue de fondo). El video solo queda como principal cuando nada de eso aplica o cuando hay un clipCandidato que ilustra exacto.
- Los elementos de una lista son las cosas nombradas (nombres propios, títulos, cifras), no palabras sueltas como "primera" o "segunda"; si no hay al menos 2 así, usa otro principal.
- Si la frase trae clipCandidato, úsalo como principal "clip" (con el muñeco actuando después); solo descártalo si la frase pide un mapa, una cifra o una lista.
- Varía: no repitas el mismo principal más de 2 frases seguidas; la protagonista actúa el hito (ganar, coronarse) con pose celebrar y emoción feliz; nadie habla.
Formas EXACTAS (una por tipo de principal; usa estas claves tal cual):
{"beat":1,"principal":"muneco","muneco":{"traje":"bastonera","pose":"celebrar","emocion":"feliz","accesorio":"corona","ancla_pose":"ganó","ancla_emocion":"ganó","ancla_accesorio":"corona","pegatina":{"id":"baston","ancla":"bastonera"}},"extras":[{"tipo":"insignia","icono":"wand","etiqueta":"bastonera","ancla":"bastonera","color":"negro"}]}
{"beat":2,"principal":"mapa","mapa":{"lugar":"Chone","ancla":"Chone"},"extras":[]}
{"beat":2,"principal":"mapa","mapa":{"pais":"Puerto Rico","ancla":"Puerto"},"extras":[]}
{"beat":3,"principal":"cifra","cifra":{"valor":12,"sufijo":"aspirantes","ancla":"doce"},"extras":[]}
{"beat":4,"principal":"lista","lista":{"titulo":"Títulos","items":[{"texto":"Chonera Bonita 2023","ancla":"Chonera"},{"texto":"Miss Turismo Manabí 2024","ancla":"Miss"}]},"extras":[]}
{"beat":5,"principal":"escenario","escenario":{"tipo":"casa","texto":"Unidad Educativa Amazonas","ancla":"Unidad"},"muneco":{"traje":"bastonera","pose":"senalar","emocion":"normal","ancla_pose":"Unidad"},"extras":[]}
{"beat":6,"principal":"clip","clip":{"id":"<id del clipCandidato>","ss":2,"marca":{"tipo":"circulo","ancla":"corona"}},"extras":[]}
Responde SOLO JSON: {"escenas":[ ... una por frase ... ]}${errores.length ? `\nTu respuesta anterior tuvo estos problemas, corrígelos:\n- ${errores.join('\n- ')}` : ''}`;

const PROMPT_SIN_MUNECO = (errores) => `Eres director de escena de un video corto de farándula, estilo "noticia contada", SIN personajes ni ilustraciones: la pantalla la llevan tomas de video REAL y piezas de datos. Para CADA frase del guion decide qué se ve.
Catálogo cerrado:
- principal: "clip" (VIDEO REAL de la protagonista: SOLO si la frase trae "clipCandidato"; copia su id y ss tal cual; "marca" opcional {"tipo":"circulo","ancla":palabra} encierra su rostro con un círculo rojo dibujado a mano; dura 3 s) | "mapa" (ciudad de Ecuador de esta lista: ${Object.keys(LUGARES).join(', ')}, o un PAÍS de esta lista: ${Object.keys(PAISES).join(', ')}; usa {"lugar":...} o {"pais":...}) | "cifra" (un número que la frase dice) | "lista" (2-4 elementos que la frase enumera) | "escenario" (casa/escenario/cartel con un letrero) | "grafico" (barras que crecen: 2 a 5 cifras que la frase dice, cada una con su etiqueta y su ancla: {"grafico":{"titulo"?:"...","items":[{"etiqueta":"años","valor":6,"ancla":"seis"}]}}) | "cita" (la frase CITA textualmente lo que alguien dijo o escribió: copia esas palabras exactas, de 4 a 22; {"cita":{"texto":"...","autor":"quien lo dijo, solo si la frase lo nombra","ancla":"primera palabra de la cita"}}) | "video" (montaje de tomas reales de fondo, sin dato: úsalo cuando no haya mapa, cifra, lista, escenario ni clipCandidato; el sistema escoge las tomas).
- extras (máx. ${MAX_EXTRAS}): {tipo:"insignia", icono: uno de [${disponibles().join(', ')}], etiqueta, ancla, color?: negro|rojo|verde} o {tipo:"sello", ancla} (solo si la frase usa un hecho no confirmado).
Reglas:
- Toda frase lleva al menos una pieza. Todo texto en pantalla (etiqueta, letrero, elementos de lista, sufijo) COPIA palabras exactas de la frase; nunca añadas nada que la frase no diga.
- Cada "ancla" es UNA palabra de la frase: en ella aparece esa pieza.
- GRAFICA CUANDO QUEDE BONITO: si la frase nombra un lugar o país, un número, una enumeración o un letrero, prefiere mapa/cifra/lista/escenario sobre un video genérico (la pieza de datos se dibuja sobre la tarjeta del video, que sigue de fondo). El video solo queda como principal cuando nada de eso aplica o cuando hay un clipCandidato que ilustra exacto.
- Los elementos de una lista son las cosas nombradas (nombres propios, títulos, cifras), no palabras sueltas como "primera" o "segunda"; si no hay al menos 2 así, usa otro principal.
- Si la frase trae clipCandidato, úsalo como principal "clip"; solo descártalo si la frase pide un mapa, una cifra o una lista.
- Si la frase cita lo que alguien dijo o escribió (entre comillas o con "dijo", "escribió", "respondió"), usa "cita": remarca esas palabras en una tarjeta. Si la frase da 2 a 5 cifras comparables, usa "grafico". Cada pieza de datos se dibuja en una tarjeta blanca abajo del video: aprovéchalas, el video sin dato es lo último.
- NO uses "muneco" (no existe en este modo). Varía: no repitas el mismo principal más de 2 frases seguidas.
Formas EXACTAS:
{"beat":1,"principal":"video","extras":[{"tipo":"insignia","icono":"crown","etiqueta":"corona","ancla":"corona","color":"rojo"}]}
{"beat":2,"principal":"mapa","mapa":{"lugar":"Chone","ancla":"Chone"},"extras":[]}
{"beat":2,"principal":"mapa","mapa":{"pais":"Puerto Rico","ancla":"Puerto"},"extras":[]}
{"beat":3,"principal":"cifra","cifra":{"valor":12,"sufijo":"aspirantes","ancla":"doce"},"extras":[]}
{"beat":4,"principal":"lista","lista":{"titulo":"Títulos","items":[{"texto":"Chonera Bonita 2023","ancla":"Chonera"},{"texto":"Miss Turismo Manabí 2024","ancla":"Miss"}]},"extras":[]}
{"beat":5,"principal":"escenario","escenario":{"tipo":"casa","texto":"Unidad Educativa Amazonas","ancla":"Unidad"},"extras":[]}
{"beat":7,"principal":"grafico","grafico":{"titulo":"Su trayectoria","items":[{"etiqueta":"años","valor":6,"ancla":"seis"},{"etiqueta":"títulos","valor":3,"ancla":"tres"}]},"extras":[]}
{"beat":8,"principal":"cita","cita":{"texto":"no voy a permitir que me falten el respeto","autor":"Mara","ancla":"no"},"extras":[]}
{"beat":6,"principal":"clip","clip":{"id":"<id del clipCandidato>","ss":2,"marca":{"tipo":"circulo","ancla":"corona"}},"extras":[]}
Responde SOLO JSON: {"escenas":[ ... una por frase ... ]}${errores.length ? `\nTu respuesta anterior tuvo estos problemas, corrígelos:\n- ${errores.join('\n- ')}` : ''}`;

function llamarGemini(prompt, mensaje) { const gemini = require('../gemini'); return gemini.llamarJSON(prompt, mensaje, gemini.TAREAS.guionNarrativo); }

// El modelo a veces escribe la lista como {elementos:[texto,...]} o la deja en la raíz: se acepta esa variante SIN relajar el contenido.
function normalizarEscena(e) {
  const x = { ...e, extras: e.extras || [] };
  if (x.principal === 'lista') {
    const l = x.lista || {}, crudos = l.items || l.elementos || x.items || x.elementos || [];
    const limpio = String(l.titulo || x.titulo || '').replace(/[^\p{L} ]/gu, ' ').replace(/\s+/g, ' ').trim(), corto = limpio.length > 20 ? limpio.slice(0, 20).replace(/ \S*$/, '') : limpio; // el título del modelo se limpia en vez de tumbar toda la dirección
    x.lista = { titulo: corto.length >= 3 ? corto : 'Lista', items: crudos.map(t => (typeof t === 'string' ? { texto: t, ancla: tokens(t)[0] } : t)) };
  }
  return x;
}

async function dirigir(beats, hechos, { llamar = llamarGemini, maxReintentos = 1, clips = null, sinMuneco = false } = {}) {
  const avisos = [], mensaje = JSON.stringify(beats.map((b, i) => ({ beat: i + 1, frase: b.frase, ...(clips && clips.get(i) ? { clipCandidato: { id: clips.get(i).id, ss: clips.get(i).ss, motivo: clips.get(i).motivo } } : {}), noConfirmado: (b.hechos || []).some(r => hechos[r - 1] && hechos[r - 1].confirmado === false) })));
  let errores = [];
  for (let intento = 0; intento <= maxReintentos; intento++) {
    let r; try { r = await llamar(sinMuneco ? PROMPT_SIN_MUNECO(errores) : PROMPT(errores), mensaje); } catch (e) { avisos.push(`el modelo falló (${e.message})`); break; }
    const escenas = ((r && r.escenas) || []).map(normalizarEscena); if (sinMuneco) escenas.forEach(quitarMuneco);
    errores = validarDireccion(escenas, beats, hechos, clips);
    if (!errores.length) {
      // Tras los 3 s del clip la pantalla no puede quedar vacía: si el modelo no dio muñeco para una frase con clip, lo completa el código.
      const porReglas = directorPorReglas(beats, hechos, clips, { sinMuneco });
      for (const e of escenas) { const pr = porReglas[e.beat - 1]; if (pr && pr.principal === 'mapa' && pr.mapa && pr.mapa.ruta && e.principal === 'mapa' && e.mapa && !e.mapa.ruta) { e.mapa = pr.mapa; avisos.push(`frase ${e.beat}: viaje, se dibujó la ruta del avión`); } if (pr && !(e.extras || []).length && pr.extras.length) e.extras = pr.extras.slice(0, MAX_EXTRAS); } // más gráficos: si el modelo no dio insignias y las reglas sí (fecha, ícono), se completan
      for (const e of escenas) if (!sinMuneco && e.principal === 'clip' && !e.muneco && porReglas[e.beat - 1] && porReglas[e.beat - 1].muneco) e.muneco = porReglas[e.beat - 1].muneco;
      for (const e of escenas) { const pr = porReglas[e.beat - 1]; if (pr && pr.principal === 'lista' && pr.lista && pr.lista.titulo === 'Fechas' && e.principal !== 'lista' && e.principal !== 'clip') { e.principal = 'lista'; e.lista = pr.lista; delete e.cifra; delete e.mapa; delete e.grafico; avisos.push(`frase ${e.beat}: varias fechas, se usó la lista de fechas`); } }
      return { escenas, origen: 'llm', avisos };
    }
  }
  const escenas = directorPorReglas(beats, hechos, clips, { sinMuneco }), malas = validarDireccion(escenas, beats, hechos, clips);
  avisos.push(`director por reglas de respaldo (${errores.join('; ') || 'sin respuesta'})`);
  if (malas.length) avisos.push(`el respaldo tiene avisos: ${malas.join('; ')}`);
  return { escenas, origen: 'respaldo', avisos };
}

module.exports = { resolverPunto, rutaDeFrase, lugaresEnFrase, CIUDADES, PAISES, GESTOS, quitarMuneco, normalizarEscena, dirigir, directorPorReglas, validarDireccion, validarEscena, nombreDePieza, LUGARES, PRINCIPALES, POSES, EMOCIONES, TRAJES, ACCESORIOS, PEGATINAS, ESCENARIOS, MAX_EXTRAS, normalizar, tokens };

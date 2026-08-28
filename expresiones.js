// Registro durable de expresiones de farándula, con rotación y memoria entre videos.
//
// POR QUÉ EXISTE. La regla 5 de `PROMPTS.guion` traía CUATRO ejemplos fijos ("lo hundió", "quedó
// expuesto", "se le cayó la mentira", "la jugada le salió mal") y el modelo los copiaba literal en
// vez de inspirarse en ellos. El usuario lo notó solo: "le salió el tiro por la culata" repetido
// video tras video. Con cuatro ejemplos siempre a la vista, el guion no tiene de dónde más agarrar.
//
// LA ROTACIÓN ES EL PUNTO, NO EL TAMAÑO DEL CATÁLOGO. Pasarle las 60 expresiones de una vez cambia
// un problema por otro: el guion suena a recetario y se repiten 60 en vez de 4. Se le muestran unas
// pocas por llamada, elegidas priorizando las que hace más tiempo no salen — mismo principio que
// `seleccion.elegirPista()` con la música y que la rotación de clips por famoso.
//
// MEMORIA ENTRE VIDEOS. `guionEvitar` solo compara contra el gemelo del MISMO job: entre noticias de
// días distintos no había memoria de qué frases ya salieron. El ciclo vive en `historial.json`, el
// mismo archivo que ya rota clips y música (y que ya se respalda en Drive), bajo su propia clave.
//
// QUÉ NO ENTRA ACÁ, y por decisión del usuario:
// - Jerga del momento ("farmear aura", "six seven", "lache"): vida útil de meses y NO son neutras
//   entre países. Su conclusión: "puede ser una piedra en el zapato a futuro".
// - Nada sacado de listicles de "frases virales": están llenos de engagement bait ("nadie habla de
//   esto", "no vas a creer") que el propio prompt ya prohíbe y que TikTok penaliza con alcance.
// - Nada minado de los guiones viejos: esa muestra está contaminada por el mismo problema que se
//   quiere arreglar. El registro arranca curado y desde cero.
//
// El criterio de cada entrada: español neutro, que se entienda igual en Ecuador, México o Argentina,
// y que no caduque en seis meses.
const fs = require('fs');
const path = require('path');
const driveCache = require('./driveCache');

const HISTORIAL_FILE = path.join(__dirname, 'historial.json');
const CLAVE_CICLO = 'expresiones';

// Cuántas se le muestran al guionista por llamada. Suficientes para tener de dónde elegir, pocas
// como para que no las use todas y suene a catálogo.
const POR_LLAMADA = 7;

// Agrupadas por FUNCIÓN narrativa, no por tema: así el sorteo puede repartir entre grupos y el
// guion no recibe siete maneras distintas de decir lo mismo.
const CATALOGO = {
  exposicion: [
    'quedó expuesto',
    'se le cayó la careta',
    'quedó en evidencia',
    'lo dejó al descubierto',
    'se le notó todo',
    'no pudo disimular',
    'quedó retratado',
  ],
  contradiccion: [
    'sus propias palabras lo delataron',
    'se contradijo solo',
    'dijo lo contrario hace nada',
    'la versión no le cierra',
    'los tiempos no le cuadran',
    'olvidó lo que había dicho antes',
  ],
  reaccion: [
    'no se quedó callada',
    'salió con todo',
    'respondió sin filtro',
    'no se lo dejó pasar',
    'contestó de una',
    'le devolvió el golpe',
    'rompió el silencio',
  ],
  consecuencia: [
    'le salió caro',
    'pagó el precio',
    'se le vino todo encima',
    'terminó peor de lo que empezó',
    'le costó más de lo que pensaba',
    'el tiro le salió por la culata',
  ],
  silencio: [
    'prefirió no responder',
    'el silencio dijo más',
    'esquivó la pregunta',
    'cambió de tema al toque',
    'nadie del entorno quiso hablar',
  ],
  revelacion: [
    'salió a la luz',
    'se destapó todo',
    'apareció el detalle que faltaba',
    'lo que nadie había contado',
    'quedó grabado',
  ],
  presion: [
    'la cosa se le complicó',
    'el asunto escaló rápido',
    'se le juntó todo',
    'quedó en el ojo de la tormenta',
    'el tema no para de crecer',
  ],
  duda: [
    'nadie termina de creerle',
    'la explicación convenció a pocos',
    'quedaron más preguntas que respuestas',
    'la historia tiene un hueco',
  ],
};

const TODAS = Object.entries(CATALOGO).flatMap(([grupo, frases]) =>
  frases.map(texto => ({ texto, grupo }))
);

function cargarHistorial() {
  try { return JSON.parse(fs.readFileSync(HISTORIAL_FILE, 'utf8')); } catch { return {}; }
}

function guardarHistorial(h) {
  try {
    fs.writeFileSync(HISTORIAL_FILE, JSON.stringify(h, null, 2));
    driveCache.respaldar(HISTORIAL_FILE, 'historial.json');
  } catch (e) {
    // Igual que el resto del proyecto: perder la rotación degrada la variedad, nunca corta el flujo.
    console.warn(`⚠️ No se pudo guardar el ciclo de expresiones: ${e.message}`);
  }
}

// Sortea expresiones para UNA llamada al guionista, priorizando las que hace más tiempo no salen.
// Cuando se agota el ciclo (ya salieron todas) se reinicia, igual que la rotación de clips.
//
// Reparte entre grupos a propósito: siete frases del grupo "exposición" le darían al guion siete
// formas de decir lo mismo, que es justo lo que se está tratando de evitar.
function sortear(cuantas = POR_LLAMADA) {
  const historial = cargarHistorial();
  const h = (historial[CLAVE_CICLO] ??= { ciclo: [] });

  let disponibles = TODAS.filter(e => !h.ciclo.includes(e.texto));
  if (disponibles.length < cuantas) {
    h.ciclo = [];
    disponibles = TODAS;
  }

  // Una por grupo hasta donde alcance, después se completa con lo que quede.
  const elegidas = [];
  const grupos = [...new Set(disponibles.map(e => e.grupo))].sort(() => Math.random() - 0.5);
  for (const grupo of grupos) {
    if (elegidas.length >= cuantas) break;
    const delGrupo = disponibles.filter(e => e.grupo === grupo && !elegidas.includes(e));
    if (delGrupo.length) elegidas.push(delGrupo[Math.floor(Math.random() * delGrupo.length)]);
  }
  while (elegidas.length < cuantas) {
    const resto = disponibles.filter(e => !elegidas.includes(e));
    if (!resto.length) break;
    elegidas.push(resto[Math.floor(Math.random() * resto.length)]);
  }

  h.ciclo.push(...elegidas.map(e => e.texto));
  guardarHistorial(historial);
  return elegidas.map(e => e.texto);
}

// Las expresiones del catálogo que aparecen en un guion ya escrito. Sirve para dos cosas: medir si
// la rotación está funcionando de verdad, y alimentar el "no repitas esto" del próximo video.
function usadasEn(guion) {
  const texto = (guion || '').toLowerCase();
  return TODAS.filter(e => texto.includes(e.texto.toLowerCase())).map(e => e.texto);
}

// MEMORIA ENTRE VIDEOS. `guionEvitar` solo compara contra el gemelo del MISMO job: entre noticias de
// días distintos no había memoria de qué aperturas ya salieron, y las aperturas son lo que más se
// nota repetido (son lo primero que escucha el espectador).
//
// Se guardan las primeras palabras de cada guion, no el guion entero: es lo que hay que evitar
// repetir y ocupa poco. `LARGO_MEMORIA` acotado a propósito — pedirle al modelo que esquive 50
// aperturas es ruido, y las viejas ya nadie las recuerda.
const CLAVE_APERTURAS = 'aperturas';
const LARGO_MEMORIA = 12;
const PALABRAS_APERTURA = 8;

function aperturaDe(guion) {
  return (guion || '').trim().split(/\s+/).slice(0, PALABRAS_APERTURA).join(' ');
}

function recordarApertura(guion) {
  const apertura = aperturaDe(guion);
  if (!apertura) return;
  const historial = cargarHistorial();
  const h = (historial[CLAVE_APERTURAS] ??= { recientes: [] });
  h.recientes = [apertura, ...h.recientes.filter(a => a !== apertura)].slice(0, LARGO_MEMORIA);
  guardarHistorial(historial);
}

function aperturasRecientes() {
  try {
    return cargarHistorial()[CLAVE_APERTURAS]?.recientes || [];
  } catch { return []; }
}

// Bloque de prompt con las aperturas de los videos anteriores. Vacío si todavía no hay ninguna.
function bloqueDeAperturas() {
  const recientes = aperturasRecientes();
  if (!recientes.length) return '';
  return `

=== ASÍ ARRANCARON LOS ÚLTIMOS VIDEOS DEL CANAL (no son material: son lo que NO podés repetir) ===
${recientes.map(a => `- "${a}…"`).join('\n')}
=== FIN ===

Tu primera frase tiene que arrancar de otra manera: otra construcción y otro tipo de gancho, no
solo otras palabras. Si todas esas abren nombrando al famoso, abrí por el hecho; si abren con una
pregunta, no abras con pregunta.`;
}

// Bloque de prompt con las expresiones sorteadas. Se arma acá y no en gemini.js para que el criterio
// —son inspiración, no un menú de donde copiar— viva junto al catálogo.
function bloqueDeTono() {
  const muestra = sortear();
  return `Lenguaje de farándula real. Algunas expresiones del registro (para que agarres el TONO, `
    + `no para copiarlas — usa como mucho UNA, y si se te ocurre algo mejor en ese mismo registro, `
    + `preferilo): ${muestra.map(f => `"${f}"`).join(', ')}.`;
}

module.exports = {
  CATALOGO, TODAS, sortear, usadasEn, bloqueDeTono, POR_LLAMADA, CLAVE_CICLO,
  recordarApertura, aperturasRecientes, bloqueDeAperturas, aperturaDe, LARGO_MEMORIA, CLAVE_APERTURAS,
};

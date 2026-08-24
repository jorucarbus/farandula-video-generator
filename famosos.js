// Nombres de famosos: cómo se ESCRIBEN y cómo se DICEN.
//
// El problema que resuelve: cuando la fuente es hablada (TikTok, entrevista, noticiero), Gemini
// transcribe lo que OYE, así que los nombres propios salen fonéticos — "Fátima Bosch" queda
// "Fátima Bos", "Nawat" queda "Nagua". Ese error no se queda en la crónica: viaja a la locución
// (ElevenLabs lee lo que está escrito), a los subtítulos (en letra grande, todo el video), al
// matching de la carpeta de famosos (un nombre mal escrito no encuentra sus clips), al nombre del
// archivo y a los hashtags — donde además mata el alcance del video.
//
// La verdad de referencia NO es la web (en farándula está llena de nombres mal escritos): son las
// ~272 carpetas de Drive que el usuario ya mantiene a mano, una por famoso.
const fs = require('fs');
const path = require('path');

const TABLA_PATH = path.join(__dirname, 'data', 'famosos.json');
const NOMBRE_DRIVE = 'famosos.json';

// =================================================================================================
// CLAVE FONÉTICA
//
// Comparar letra a letra no sirve: "Bos" y "Bosch" no se parecen lo suficiente, y son el mismo
// nombre. Los errores de Gemini son SIEMPRE fonéticos, y en español eso significa un conjunto
// chico y conocido de confusiones: b/v, ll/y, s/z/c, la h muda, k/qu/c, w/gu, y las tildes.
//
// Esta función reduce un nombre a "cómo suena", para que las dos escrituras caigan en la misma
// clave. El orden de las reglas importa: cada una asume que las anteriores ya corrieron.
// =================================================================================================

// Consonantes con las que una palabra española PUEDE terminar. Cualquier otra al final es un
// extranjerismo que el oído castellano se come — que es justo lo que le pasa a Gemini:
// "Bosch" → "Bos", "Nawat" → "Nagua". Sin esta regla, esos dos casos (los del reporte original
// del usuario) no se detectarían.
const FINALES_VALIDAS = new Set(['a', 'e', 'i', 'o', 'u', 'n', 'r', 's', 'l', 'd', 'y', 'ñ']);

function claveFonetica(nombre) {
  if (!nombre) return '';
  let s = String(nombre)
    .toLowerCase()
    .replace(/[_.\-]+/g, ' ')
    // La ñ se aparta ANTES de quitar tildes: descompuesta es "n + tilde", así que el barrido de
    // diacríticos la volvería n y haría de "Peña" y "Pena" el mismo nombre.
    .replace(/ñ/g, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(//g, 'ñ')
    .replace(/[^a-zñü\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 'ch' es un sonido propio: se marca ANTES de que la regla de la h muda lo destruya, y se
  // restituye al final. Sin esto, "Chávez" se convertiría en "cabes" y dejaría de parecerse a
  // sí mismo.
  s = s.replace(/ch/g, '');

  s = s
    .replace(/ll/g, 'y')          // "Sevilla"/"Seviya"
    .replace(/qu([ei])/g, 'k$1')  // "Quique"/"Kike"
    .replace(/gu([ei])/g, 'g$1')  // la u es muda: "Guillermo"/"Gillermo"
    .replace(/g([ei])/g, 'j$1')   // "Ángel"/"Ánjel": mismo sonido que la j
    .replace(/c([ei])/g, 's$1')   // seseo: "Cecilia"/"Sesilia"
    .replace(/[ckq]/g, 'k')
    .replace(/z/g, 's')           // seseo: "Pérez"/"Péres"
    .replace(/v/g, 'b')           // "Vargas"/"Bargas"
    .replace(/w/g, 'gu')          // "Nawat"/"Naguat"
    .replace(/x/g, 's')           // "Ximena"/"Simena"
    .replace(/h/g, '')            // muda: "Hilda"/"Ilda"
    .replace(/ü/g, 'u')
    .replace(/y(?=\s|$)/g, 'i')   // "Nataly"/"Natali"
    .replace(/(.)\1+/g, '$1');    // dobles: "Anna"/"Ana"

  s = s.replace(//g, 'ch');

  // Consonante final atípica: se cae, palabra por palabra.
  s = s.split(' ').map(p => {
    while (p.length > 1 && !FINALES_VALIDAS.has(p.slice(-1))) p = p.slice(0, -1);
    return p;
  }).join(' ');

  return s.replace(/\s+/g, ' ').trim();
}

// Levenshtein clásico, sobre la CLAVE (no sobre el nombre): mide cuánto se parecen dos sonidos,
// no dos ortografías.
function distancia(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const fila = [i];
    for (let j = 1; j <= n; j++) {
      fila[j] = Math.min(prev[j] + 1, fila[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = fila;
  }
  return prev[n];
}

// =================================================================================================
// TABLA (data/famosos.json, respaldada en Drive igual que jobs.json e historial.json)
//
// Forma: { "<clave fonetica>": { escribir, decir, alias: [] } }
//   escribir: la ortografía buena (la de la carpeta de Drive, o la que el usuario tipeó)
//   decir:    cómo se pronuncia, para ElevenLabs (null = se dice como se escribe)
//   alias:    formas mal escritas YA VISTAS. Es lo que el sistema aprende: la próxima vez que
//             Gemini oiga mal ese nombre, se corrige solo y sin preguntar.
// =================================================================================================

let _tabla = null;

function cargar() {
  if (_tabla) return _tabla;
  try {
    _tabla = JSON.parse(fs.readFileSync(TABLA_PATH, 'utf-8'));
    if (!_tabla || typeof _tabla !== 'object') _tabla = {};
  } catch {
    // No existe, está vacío o quedó corrupto: se arranca con la tabla vacía y todo se comporta
    // como antes de esta feature (Regla de robustez).
    _tabla = {};
  }
  return _tabla;
}

function guardar() {
  const tabla = cargar();
  try {
    fs.mkdirSync(path.dirname(TABLA_PATH), { recursive: true });
    fs.writeFileSync(TABLA_PATH, JSON.stringify(tabla, null, 2));
  } catch (e) {
    console.warn(`⚠️ No se pudo guardar ${NOMBRE_DRIVE}: ${e.message}`);
    return;
  }
  // Respaldo a Drive fire-and-forget: el disco de Railway es efímero (mismo patrón que jobStore).
  try {
    const driveCache = require('./driveCache');
    driveCache.respaldar(TABLA_PATH, NOMBRE_DRIVE).catch(() => {});
  } catch { /* sin Drive configurado: queda solo en disco */ }
}

// Un famoso conocido, buscado por cómo suena (da igual cómo venga escrito).
function buscar(nombre) {
  const clave = claveFonetica(nombre);
  if (!clave) return null;
  const tabla = cargar();
  if (tabla[clave]) return { clave, ...tabla[clave] };
  for (const [k, v] of Object.entries(tabla)) {
    if ((v.alias || []).some(a => claveFonetica(a) === clave)) return { clave: k, ...v };
  }
  return null;
}

// Registra (o actualiza) un famoso. `leido` es la forma equivocada que hay que recordar como alias.
function registrar({ escribir, decir = undefined, leido = null, carpeta = undefined }) {
  if (!escribir) return null;
  const clave = claveFonetica(escribir);
  if (!clave) return null;
  const tabla = cargar();
  const actual = tabla[clave] || { escribir, decir: null, alias: [] };
  actual.escribir = escribir;
  if (decir !== undefined) actual.decir = decir || null;
  if (carpeta !== undefined) actual.carpeta = carpeta || null;
  if (!Array.isArray(actual.alias)) actual.alias = [];
  if (leido && claveFonetica(leido) !== clave && !actual.alias.includes(leido)) {
    actual.alias.push(leido);
  }
  tabla[clave] = actual;
  guardar();
  return { clave, ...actual };
}

// =================================================================================================
// COTEJO
// =================================================================================================

// Las carpetas de Drive usan guion bajo ("Abby_Capriles"); en el texto del guion va con espacios.
function nombreDeCarpeta(carpeta) {
  return String(carpeta || '').replace(/_/g, ' ').trim();
}

// Compara un nombre leído contra el catálogo de carpetas de Drive.
//   confianza 'alta'  → misma clave fonética (o todas sus palabras calzan): se corrige solo
//   confianza 'media' → a un solo sonido de distancia: se sugiere, decide el usuario
//   confianza null    → sin candidato: se deja como vino, con aviso
function cotejar(nombre, carpetas = []) {
  const leido = (nombre || '').trim();
  const clave = claveFonetica(leido);
  const vacio = { leido, sugerido: leido, carpeta: null, confianza: null, decir: null };
  if (!clave) return vacio;

  // Lo aprendido gana: si el usuario ya corrigió este nombre alguna vez, no se vuelve a preguntar.
  const conocido = buscar(leido);
  if (conocido) {
    return { leido, sugerido: conocido.escribir, carpeta: conocido.carpeta || null, confianza: 'alta', decir: conocido.decir || null };
  }

  const candidatos = carpetas.map(c => ({ carpeta: c, clave: claveFonetica(c) })).filter(c => c.clave);

  const exacta = candidatos.find(c => c.clave === clave);
  if (exacta) {
    return { leido, sugerido: nombreDeCarpeta(exacta.carpeta), carpeta: exacta.carpeta, confianza: 'alta', decir: null };
  }

  // Nombre parcial: "Fátima" contra la carpeta "Fatima_Bosch". Solo cuenta si TODAS las palabras
  // del leído aparecen en la carpeta Y hay un único candidato — con 272 carpetas, un nombre de
  // pila suelto ("Camila") calza con varias, y ahí adivinar es peor que no hacer nada.
  const palabras = clave.split(' ').filter(Boolean);
  const porPalabras = candidatos.filter(c => {
    const suyas = c.clave.split(' ');
    return palabras.every(p => suyas.includes(p));
  });
  if (porPalabras.length === 1) {
    return { leido, sugerido: nombreDeCarpeta(porPalabras[0].carpeta), carpeta: porPalabras[0].carpeta, confianza: 'alta', decir: null };
  }

  let mejor = null;
  for (const c of candidatos) {
    const d = distancia(clave, c.clave);
    if (d <= 1 && (!mejor || d < mejor.d)) mejor = { ...c, d };
  }
  if (mejor) {
    return { leido, sugerido: nombreDeCarpeta(mejor.carpeta), carpeta: mejor.carpeta, confianza: 'media', decir: null };
  }

  return vacio;
}

// El nombre se reescribe en TODOS los textos de la lectura, no solo en el campo `protagonista`:
// el guion se escribe desde la CRÓNICA, y el título y la descripción son los que se publican.
function reemplazarEn(result, viejo, nuevo) {
  const escapar = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const partes = viejo.trim().split(/\s+/).map(escapar);
  // Sin \b: en JS no reconoce las letras acentuadas como parte de la palabra, así que "\bÁngel"
  // no matchea. Los lookarounds con \p{L} sí.
  const re = new RegExp(`(?<!\\p{L})${partes.join('\\s+')}(?!\\p{L})`, 'giu');
  const sub = t => (typeof t === 'string' ? t.replace(re, nuevo) : t);

  // Los hashtags van pegados (#FatimaBos), así que el reemplazo de arriba no los toca — y meterle
  // el nombre con espacios partiría el hashtag en dos. Se reescriben aparte, sin espacios.
  // Sin espacios en la comparación: en el hashtag el nombre va pegado (#FatimaBos), así que su
  // clave nunca coincidiría con la del nombre suelto ("fatima bos") si el espacio contara.
  const pegada = n => claveFonetica(n).replace(/\s+/g, '');
  const claveVieja = pegada(viejo);
  const nuevoPegado = nuevo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
  const subHashtags = t => (typeof t === 'string'
    ? t.replace(/#[\p{L}\p{N}_]+/gu, h => (pegada(h.slice(1)) === claveVieja ? `#${nuevoPegado}` : h))
    : t);

  // Menciones sueltas: la crónica no repite el nombre completo cada vez — dice "Bos abordó el
  // altercado" usando solo el apellido, y ese suelto no lo alcanza el reemplazo de arriba. Se
  // parean palabra a palabra (Fatima→Fátima, Bos→Bosch) cuando el nombre viejo y el nuevo tienen
  // la misma cantidad de palabras. Encontrado en una lectura real, no leyendo el código.
  const nuevasPartes = nuevo.trim().split(/\s+/);
  const viejasPartes = viejo.trim().split(/\s+/);
  const sueltas = [];
  if (viejasPartes.length === nuevasPartes.length) {
    viejasPartes.forEach((v, i) => {
      const n = nuevasPartes[i];
      // Solo palabras con cuerpo: reemplazar partículas ("de", "la") pisaría texto que no es el
      // nombre de nadie.
      if (v.length < 3 || v === n) return;
      sueltas.push([new RegExp(`(?<!\\p{L})${escapar(v)}(?!\\p{L})`, 'giu'), n]);
    });
  }
  const subSueltas = t => (typeof t === 'string' ? sueltas.reduce((acc, [re2, n]) => acc.replace(re2, n), t) : t);

  const texto = t => subHashtags(subSueltas(sub(t)));
  const out = {
    ...result,
    cronica: texto(result.cronica),
    titulo: texto(result.titulo),
    descripcion: texto(result.descripcion),
    protagonista: sub(result.protagonista),
    secundario: sub(result.secundario),
  };
  out.nombreCorto = [out.protagonista, out.secundario, out.accion].filter(Boolean).join(' - ').slice(0, 80)
    || result.nombreCorto;
  return out;
}


// =================================================================================================
// PRONUNCIACIÓN (lo que escucha ElevenLabs)
//
// Escribir bien no es pronunciar bien: aunque el nombre quede correcto en pantalla, la voz puede
// decir mal uno extranjero ("Nawat"). La forma de arreglarlo es mandarle al TTS una escritura
// distinta de la que se muestra.
//
// El camino "limpio" sería el diccionario de pronunciación del API de ElevenLabs (el texto viajaría
// intacto), pero la API key de esta cuenta no tiene ese permiso —"missing the permission
// pronunciation_dictionaries_read"— así que la sustitución se hace acá. Ventaja: no depende de
// permisos ni de qué modelo responda.
//
// ⚠️ Lo que hay que cuidar: `tiempos.matchTexto()` compara el texto de cada fragmento contra los
// caracteres que ElevenLabs alineó, letra por letra. Si el texto hablado dice "Nagüat" y el
// fragmento dice "Nawat", el match falla y se cae TODA la locución al reparto estimado — que es
// como salen los subtítulos corridos. Por eso la sustitución se aplica PALABRA POR PALABRA y la
// alineación usa exactamente la misma función: los dos lados hablan igual, y lo que se muestra
// sigue siendo lo que se escribe.

// Una palabra reducida a lo comparable (sin tildes, sin puntuación pegada).
function clavePalabra(p) {
  return String(p || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ]/g, '');
}

// Mapa palabra escrita -> cómo se dice, armado desde la tabla.
function mapaPronunciacion() {
  const mapa = new Map();
  for (const v of Object.values(cargar())) {
    if (!v || !v.decir || !v.escribir) continue;
    const escritas = String(v.escribir).trim().split(/\s+/);
    const dichas = String(v.decir).trim().split(/\s+/);
    // Un nombre de una sola palabra puede sonar como varias ("JD" -> "Yei Di"): la palabra que se
    // MUESTRA sigue siendo una, así que el conteo de la alineación no cambia.
    if (escritas.length === 1) { mapa.set(clavePalabra(escritas[0]), { escrita: escritas[0], dicha: String(v.decir).trim() }); continue; }
    if (escritas.length !== dichas.length) {
      console.warn(`⚠️ Pronunciación de "${v.escribir}" ignorada: tiene ${escritas.length} palabras y se dice con ${dichas.length}`);
      continue;
    }
    escritas.forEach((p, i) => {
      if (clavePalabra(p) !== clavePalabra(dichas[i])) mapa.set(clavePalabra(p), { escrita: p, dicha: dichas[i] });
    });
  }
  return mapa;
}

// Cómo se DICE una palabra suelta. Conserva la puntuación pegada (comas, comillas) para no
// alterar la cadencia, y no toca las marcas de actuación [excited] que lee el modelo v3.
function hablar(palabra, mapa) {
  if (!mapa || mapa.size === 0 || !palabra) return palabra;
  if (palabra.startsWith('[')) return palabra;
  const m = String(palabra).match(/^([^\p{L}\p{N}]*)([\s\S]*?)([^\p{L}\p{N}]*)$/u);
  if (!m) return palabra;
  const [, antes, nucleo, despues] = m;
  const dicho = mapa.get(clavePalabra(nucleo));
  return dicho ? `${antes}${dicho.dicha}${despues}` : palabra;
}

// Texto entero. NO se puede partir por espacios: las marcas de actuación que agrega Gemini van
// PEGADAS a la palabra ("...directivo Nawat.[fast]Le puso límites"), así que el token quedaría
// "Nawat.[fast]Le" y no se reconocería el nombre. Encontrado probando con un guion marcado real.
// Con lookarounds de letra, el nombre se ubica esté pegado a lo que esté.
function aplicarPronunciacion(texto, mapa) {
  if (!texto || !mapa || mapa.size === 0) return texto;
  const escapar = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let out = String(texto);
  for (const { escrita, dicha } of mapa.values()) {
    out = out.replace(new RegExp(`(?<!\\p{L})${escapar(escrita)}(?!\\p{L})`, 'giu'), dicha);
  }
  return out;
}

module.exports = {
  claveFonetica, distancia, cotejar, nombreDeCarpeta,
  cargar, guardar, buscar, registrar, reemplazarEn,
  mapaPronunciacion, aplicarPronunciacion, hablar, clavePalabra,
  TABLA_PATH, NOMBRE_DRIVE, FINALES_VALIDAS,
};

// Fase 6 del plan maestro — subtítulos ASS, estilo palabra por palabra.
//
// Rediseñado dos veces sobre datos reales (2026-08-08): primero de "fragmento entero con una
// palabra resaltada" a "grupos de 3 palabras", después a UNA palabra a la vez — pedido explícito
// del usuario, con tipografía Anton, mayúsculas, sin fundidos (solo un rebote chico) y tamaño
// 3x más grande, más abajo en pantalla (justo arriba de donde TikTok pone su propia interfaz).
//
// El timing POR PALABRA sale de la alineación real de ElevenLabs (Fase 5) cuando está
// disponible; si no, se estima repartiendo por caracteres dentro de la ventana del fragmento
// (mismo principio que el subtitulos.js viejo, pero anclado a un tiempo de fragmento que ya es
// mejor que antes). Nunca lanza: sin datos suficientes, genera igual con el estimado.
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const TEMP_DIR = path.join(__dirname, 'temp-videos');
const FUENTES_DIR = path.join(TEMP_DIR, 'fuentes');
const FUENTE_URL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/anton/Anton-Regular.ttf';
const FUENTE_ARCHIVO = 'Anton-Regular.ttf';
const FUENTE_FAMILIA = 'Anton';

// 3x el tamaño anterior (88pt) — pedido explícito del usuario. Con una sola palabra en pantalla
// a la vez hay espacio; el resguardo real está en tamanoSeguro() más abajo, para palabras largas.
const TAMANO_DEFAULT = 264;
const MAX_CHARS_LINEA = 18; // ya casi no se usa con 1 palabra por grupo, se deja por si se sube porGrupo
const PALABRAS_POR_GRUPO = 1; // una palabra a la vez — pedido explícito del usuario
const COLOR_RESALTE = '&H0004C2F7&'; // amarillo #f7c204 en BGR (formato ASS)
const COLOR_BASE = '&H00FFFFFF&';
// Más abajo que antes (MarginV 720→300), pedido explícito: "más abajo, solo más arriba que
// donde está lo de TikTok". TikTok tapa el 15% inferior (288px de 1920) con su propia interfaz;
// 300 deja el borde del texto justo por encima de esa franja, sin invadirla.
const MARGIN_V = 300;
// Ancho útil del canvas para el resguardo de palabras largas (ver tamanoSeguro): PlayResX menos
// los márgenes laterales del Style.
const ANCHO_UTIL = 1080 - 60 - 60;
// Ancho aproximado de un carácter en Anton, como fracción del tamaño de fuente — es una
// tipográfica condensada (por eso se eligió: entran más letras por punto de tamaño que en una
// sans-serif normal), pero a 264pt una palabra larga en MAYÚSCULAS igual puede desbordar.
const FACTOR_ANCHO_ANTON = 0.62;

// Descarga la tipografía UNA sola vez (cache en disco, sobrevive entre renders del mismo
// proceso). Si falla (sin internet, URL cambiada), no aborta: libass sustituye por una fuente
// del sistema — el subtítulo sale igual, solo sin la tipografía exacta.
async function obtenerCarpetaFuentes() {
  try {
    fs.mkdirSync(FUENTES_DIR, { recursive: true });
    const destino = path.join(FUENTES_DIR, FUENTE_ARCHIVO);
    if (!fs.existsSync(destino) || fs.statSync(destino).size < 10000) {
      console.log('  🔤 Descargando tipografía de subtítulos (una sola vez)...');
      const res = await axios.get(FUENTE_URL, { responseType: 'arraybuffer', timeout: 15000 });
      fs.writeFileSync(destino, res.data);
    }
    return FUENTES_DIR;
  } catch (e) {
    console.warn(`  ⚠️ No se pudo descargar la tipografía de subtítulos (${e.message}), sigue con la del sistema`);
    return null;
  }
}

function tiempoASS(segundos) {
  const s = Math.max(0, segundos);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const cs = Math.round((s % 1) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function escaparASS(texto) {
  return texto.replace(/[{}]/g, '').replace(/\\(?!N)/g, '');
}

// Quita puntuación de los BORDES de la palabra ("CUMPLEAÑOS." → "CUMPLEAÑOS", "¿QUÉ" → "QUÉ") —
// pedido del usuario, en subtítulo grande de una sola palabra un punto o coma suelto se ve como
// ruido, no como puntuación real. No toca guiones/apóstrofes INTERNOS (co-conductora se queda
// igual) ni letras/tildes/eñes.
function limpiarPuntuacion(texto) {
  return texto.replace(/^[.,;:!?¡¿"'"«»…]+|[.,;:!?¡¿"'"«»…]+$/g, '');
}

// Si la palabra (ya en MAYÚSCULAS) no entra en el ancho útil al tamaño pedido, la achica lo
// justo para que quepa — nunca por debajo del tamaño anterior (88pt), como piso razonable.
function tamanoSeguro(texto, tamanoBase) {
  const anchoEstimado = texto.length * tamanoBase * FACTOR_ANCHO_ANTON;
  if (anchoEstimado <= ANCHO_UTIL) return tamanoBase;
  return Math.max(88, Math.floor(ANCHO_UTIL / (texto.length * FACTOR_ANCHO_ANTON)));
}

// Palabra en pantalla: pop con rebote CHICO (accel<1 = arranca rápido, frena), sin fundidos de
// opacidad — pedido explícito ("no quiero parpadeos, solo un pequeño rebote"). \fs al frente
// para el resguardo de tamaño de tamanoSeguro(); \r al final vuelve a color/escala/tamaño base.
function resaltar(texto, tamano) {
  return `{\\fs${tamano}\\c${COLOR_RESALTE}\\fscx112\\fscy112\\t(0,60,0.6,\\fscx100\\fscy100)}${escaparASS(texto)}{\\r}`;
}

// Reparte un grupo en líneas de hasta maxChars, en límites de palabra. Con PALABRAS_POR_GRUPO=1
// nunca hay más de una palabra por grupo, así que esto en la práctica siempre da 1 línea — se
// deja general por si se vuelve a subir porGrupo más adelante.
function construirLineas(palabras, maxChars) {
  const lineas = [];
  let actual = [];
  for (const p of palabras) {
    const candidata = [...actual, p];
    const largo = candidata.map(x => x.texto).join(' ').length;
    if (largo > maxChars && actual.length) {
      lineas.push(actual);
      actual = [p];
    } else {
      actual = candidata;
    }
  }
  if (actual.length) lineas.push(actual);
  return lineas;
}

// Texto completo del bloque con la palabra de índice idxActivo resaltada (con su propio tamaño
// seguro), el resto en el estilo base. `tamano` es el pedido por el usuario (opciones.tamano en
// generarASS, o TAMANO_DEFAULT) — tamanoSeguro() lo respeta salvo que la palabra no entre.
function renderBloque(lineas, idxActivo, tamano) {
  let i = -1;
  return lineas
    .map(linea => linea.map(p => {
      i++;
      return i === idxActivo ? resaltar(p.texto, tamanoSeguro(p.texto, tamano)) : escaparASS(p.texto);
    }).join(' '))
    .join('\\N');
}

// Sin alineación real: reparte el fragmento por caracteres dentro de su ventana de tiempo
// (mismo principio que el subtitulos.js viejo, pero ancla a un tiempo de fragmento que en la
// Fase 5 ya puede ser real en vez de estimado desde cero).
function palabrasEstimadas(texto, ventana) {
  const palabras = texto.split(/\s+/).filter(Boolean);
  const totalChars = palabras.reduce((s, w) => s + w.length, 0) || 1;
  const dur = ventana.fin - ventana.inicio;
  let cursor = ventana.inicio;
  return palabras.map(w => {
    const d = dur * (w.length / totalChars);
    const item = { texto: w, inicio: cursor, fin: cursor + d };
    cursor += d;
    return item;
  });
}

// fragments: [{texto, famoso, caracteres}] en orden narrativo (misma lista de la Fase 2)
// tiemposFragmentos: segundos reales por fragmento (seleccion.tiemposPorFragmento — real o %)
// palabrasPorFragmento (Fase 5, opcional): [[{texto,inicio,fin}, ...], ...] de tiempos.alinearFragmentos
// Devuelve la ruta del .ass generado. No lanza por datos raros: un fragmento sin palabras se
// omite y sigue con el resto — nunca tumba el render completo por un subtítulo.
function generarASS(fragments, tiemposFragmentos, palabrasPorFragmento, opciones = {}) {
  const tamano = opciones.tamano || TAMANO_DEFAULT;
  const marginV = Number.isFinite(opciones.marginV) ? opciones.marginV : MARGIN_V;
  const maxCharsLinea = opciones.maxCharsLinea || MAX_CHARS_LINEA;
  const porGrupo = opciones.palabrasPorGrupo || PALABRAS_POR_GRUPO;

  let t = 0;
  const ventanas = tiemposFragmentos.map(d => {
    const v = { inicio: t, fin: t + d };
    t += d;
    return v;
  });

  // 1. Aplanar TODAS las palabras de TODOS los fragmentos, en orden, con su tiempo real (o
  // estimado dentro de la ventana de su fragmento); MAYÚSCULAS (toUpperCase respeta tildes/eñes:
  // CAFÉ, AÑO) y sin puntuación en los bordes. Si a una palabra no le queda nada tras limpiarla
  // (rarísimo: un token que era solo puntuación), se descarta en vez de mostrar un evento vacío.
  const todas = [];
  fragments.forEach((f, idx) => {
    const ventana = ventanas[idx];
    if (!ventana || !f.texto) return;
    const real = palabrasPorFragmento && palabrasPorFragmento[idx];
    const palabras = (real && real.length) ? real : palabrasEstimadas(f.texto, ventana);
    todas.push(...palabras
      .map(p => ({ ...p, texto: limpiarPuntuacion(p.texto.toUpperCase()) }))
      .filter(p => p.texto));
  });

  // 2. Agrupar de a `porGrupo` palabras consecutivas — en pantalla nunca hay más que eso.
  const grupos = [];
  for (let i = 0; i < todas.length; i += porGrupo) {
    grupos.push(todas.slice(i, i + porGrupo));
  }

  // 3. Un evento por PALABRA dentro de cada grupo (con porGrupo=1, un evento = una palabra =
  // todo lo que se ve en pantalla en ese instante).
  const eventos = [];
  for (const grupo of grupos) {
    if (!grupo.length) continue;
    const lineas = construirLineas(grupo, maxCharsLinea);
    grupo.forEach((p, i) => {
      if (p.fin <= p.inicio) return; // evento de duración ≤0, se salta (no rompe el .ass)
      const texto = renderBloque(lineas, i, tamano);
      eventos.push(`Dialogue: 0,${tiempoASS(p.inicio)},${tiempoASS(p.fin)},Base,,0,0,0,,${texto}`);
    });
  }

  const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Base,${FUENTE_FAMILIA},${tamano},${COLOR_BASE},${COLOR_BASE},&H00000000&,&H00000000,-1,0,0,0,100,100,0,0,1,4,0,2,60,60,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${eventos.join('\n')}
`;

  const tempDir = opciones.tempDir || TEMP_DIR;
  const assPath = path.join(tempDir, `${opciones.jobId || 'subs_' + Date.now()}_subs.ass`);
  fs.writeFileSync(assPath, ass, 'utf8');
  return assPath;
}

module.exports = {
  generarASS,
  obtenerCarpetaFuentes,
  FUENTE_FAMILIA,
};

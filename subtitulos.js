// Fase 6 del plan maestro — subtítulos ASS, estilo palabra por palabra resaltada.
//
// Valores por defecto NO son gusto: vienen de la investigación de captions de TikTok 2026 que
// deja el plan maestro (Fase 0). Un solo estilo, sin muestrario — se afina cambiando un número
// acá si hace falta, no reescribiendo el generador.
//
// El texto y el timing salen de fragments (la misma fragmentación de la Fase 2, ~40-60 chars,
// que ya calza casi exacto con un bloque de subtítulo de 2 líneas — no hace falta re-agrupar).
// El timing POR PALABRA sale de la alineación real de ElevenLabs (Fase 5) cuando está
// disponible; si no, se estima repartiendo por caracteres dentro de la ventana del fragmento
// (mismo principio que el subtitulos.js viejo, pero anclado a un tiempo de fragmento que ya es
// mejor que antes). Nunca lanza: sin datos suficientes, genera igual con el estimado.
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const TEMP_DIR = path.join(__dirname, 'temp-videos');
const FUENTES_DIR = path.join(TEMP_DIR, 'fuentes');
const FUENTE_URL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/Poppins-ExtraBold.ttf';
const FUENTE_ARCHIVO = 'Poppins-ExtraBold.ttf';
const FUENTE_FAMILIA = 'Poppins ExtraBold';

// Investigación Fase 0: sans-serif bold 700+ (decorativas pierden legibilidad), 55-75pt sobre
// 1080x1920, blanco con contorno negro, resalte amarillo, tercio medio-bajo, máx 2 renglones.
const TAMANO_DEFAULT = 66;
const MAX_CHARS_LINEA = 22;
const COLOR_RESALTE = '&H0004C2F7&'; // amarillo #f7c204 en BGR (formato ASS)
const COLOR_BASE = '&H00FFFFFF&';
// MarginV=720 con Alignment=2 (ancla abajo, PlayResY 1920) deja el texto a ~62% de altura —
// dentro del "60-65%" que pide el plan para no chocar con la interfaz de TikTok (tapa el 15%
// inferior, y=1632 en adelante).
const MARGIN_V = 720;

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

// Palabra activa: pop más grande que 100%, rebote con aceleración no lineal (accel<1 = arranca
// rápido y frena) en dos tramos encadenados, vuelve a color/escala base con \r al terminar.
function resaltar(texto) {
  return `{\\c${COLOR_RESALTE}\\fscx132\\fscy132\\t(0,70,0.6,\\fscx102\\fscy102)\\t(70,150,1.4,\\fscx100\\fscy100)}${escaparASS(texto)}{\\r}`;
}

// Reparte un fragmento en líneas de hasta maxChars, en límites de palabra — mismo resultado
// sin importar cuál palabra esté activa, así el bloque no "salta" de línea entre eventos.
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

// Texto completo del bloque con la palabra de índice idxActivo resaltada, el resto en el
// estilo base de la línea (blanco, definido en el Style).
function renderBloque(lineas, idxActivo) {
  let i = -1;
  return lineas
    .map(linea => linea.map(p => {
      i++;
      return i === idxActivo ? resaltar(p.texto) : escaparASS(p.texto);
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
  const maxCharsLinea = opciones.maxCharsLinea || MAX_CHARS_LINEA;

  let t = 0;
  const ventanas = tiemposFragmentos.map(d => {
    const v = { inicio: t, fin: t + d };
    t += d;
    return v;
  });

  const eventos = [];
  fragments.forEach((f, idx) => {
    const ventana = ventanas[idx];
    if (!ventana || !f.texto) return;
    const real = palabrasPorFragmento && palabrasPorFragmento[idx];
    const palabras = (real && real.length) ? real : palabrasEstimadas(f.texto, ventana);
    if (!palabras.length) return;

    const lineas = construirLineas(palabras, maxCharsLinea);
    palabras.forEach((p, i) => {
      if (p.fin <= p.inicio) return; // evento de duración ≤0, se salta (no rompe el .ass)
      const texto = renderBloque(lineas, i);
      eventos.push(`Dialogue: 0,${tiempoASS(p.inicio)},${tiempoASS(p.fin)},Base,,0,0,0,,${texto}`);
    });
  });

  const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Base,${FUENTE_FAMILIA},${tamano},${COLOR_BASE},${COLOR_BASE},&H00000000&,&H00000000,-1,0,0,0,100,100,0,0,1,4,0,2,60,60,${MARGIN_V},1

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

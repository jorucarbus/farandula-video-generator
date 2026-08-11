// Portada (miniatura) — pedido del usuario: "escoger un fotograma y poner un titular".
// TikTok no expone API para fijar portada al publicar por su cuenta, así que esto genera una
// imagen aparte (fotograma elegido + titular quemado) para que el usuario la suba a mano al
// publicar. No toca el video final ni el pipeline de render.
//
// Reusa el mismo catálogo de tipografías de subtitulos.js (Fase 6) — mismo criterio de
// contraste (blanco con contorno negro grueso) en vez de inventar un estilo nuevo.
const path = require('path');
const { ffmpeg, TEMP_DIR } = require('./video');
const subtitulos = require('./subtitulos');

// Ancho útil del canvas 1080x1920 (mismo margen lateral que ANCHO_UTIL de subtitulos.js).
const ANCHO_UTIL = 1080 - 70 - 70;
const FONTSIZE_MAX = 92;
const FONTSIZE_MIN = 40;

// Escapa texto para el filtro drawtext de ffmpeg. La comilla simple no tiene escape dentro de
// drawtext (rompe el parseo del filtro sin importar qué se anteponga), así que se sustituye por
// la tipográfica — no cambia el sentido del titular.
function escaparDrawtext(texto) {
  return texto
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, '’')
    .replace(/%/g, '\\%');
}

// Intenta acomodar `palabras` en como máximo `maxLineas` líneas de hasta `maxChars` caracteres
// cada una, sin partir ninguna palabra. Devuelve null si no entra (para que el caller pruebe un
// tamaño de letra más chico); `forzar=true` lo obliga igual, desbordando la última línea si hace
// falta — es el último recurso cuando ya se llegó a FONTSIZE_MIN.
function envolver(palabras, maxChars, maxLineas, forzar = false) {
  const lineas = [''];
  for (const palabra of palabras) {
    const actual = lineas[lineas.length - 1];
    const candidata = actual ? `${actual} ${palabra}` : palabra;
    if (candidata.length <= maxChars || !actual) {
      lineas[lineas.length - 1] = candidata;
    } else if (lineas.length < maxLineas) {
      lineas.push(palabra);
    } else if (forzar) {
      lineas[lineas.length - 1] = candidata;
    } else {
      return null;
    }
  }
  return lineas;
}

// Busca el tamaño de letra más grande (entre FONTSIZE_MAX y FONTSIZE_MIN) que deja el titular
// en máximo 2 líneas sin desbordar el ancho útil, según el `factorAncho` real de la tipografía
// elegida (mismo principio que tamanoSeguro() en subtitulos.js, aplicado a un titular completo
// en vez de a una palabra sola).
function ajustarTamano(texto, factorAncho) {
  const palabras = texto.trim().split(/\s+/).filter(Boolean);
  for (let fontsize = FONTSIZE_MAX; fontsize >= FONTSIZE_MIN; fontsize -= 4) {
    const maxChars = Math.max(1, Math.floor(ANCHO_UTIL / (fontsize * factorAncho)));
    const lineas = envolver(palabras, maxChars, 2);
    if (lineas) return { lineas, fontsize };
  }
  const maxChars = Math.max(1, Math.floor(ANCHO_UTIL / (FONTSIZE_MIN * factorAncho)));
  return { lineas: envolver(palabras, maxChars, 2, true), fontsize: FONTSIZE_MIN };
}

// videoPath: mp4 fuente (el preview que sobrevive a la limpieza de temporales, ver server.js).
// timestamp: segundos dentro del video, el fotograma que el usuario eligió pausando el player.
// titular: texto libre, se pone en mayúsculas.
// fuenteClave: clave del catálogo de subtitulos.js (default 'anton' si no llega o no existe).
async function generarPortada(videoPath, timestamp, titular, fuenteClave, token) {
  const outPath = path.join(TEMP_DIR, `portada_${token}.jpg`);
  const fuentesDir = await subtitulos.obtenerCarpetaFuentes(fuenteClave);
  const fuente = subtitulos.FUENTES[fuenteClave] || subtitulos.FUENTES[subtitulos.FUENTE_DEFAULT];

  const { lineas, fontsize } = ajustarTamano(titular.toUpperCase(), fuente.factorAncho);
  const texto = escaparDrawtext(lineas.join('\n'));

  const partes = [`drawtext=text='${texto}'`];
  if (fuentesDir) {
    // ffmpeg en Windows necesita los ':' de la unidad (C\:) escapados dentro del valor del filtro.
    const fontfile = path.join(fuentesDir, fuente.archivo).replace(/\\/g, '/').replace(/:/g, '\\:');
    partes.push(`:fontfile='${fontfile}'`);
  }
  partes.push(
    `:fontsize=${fontsize}:fontcolor=white:borderw=${Math.max(3, Math.round(fontsize / 12))}:bordercolor=black`,
    ':box=1:boxcolor=black@0.35:boxborderw=20',
    ':x=(w-text_w)/2:y=h*0.68',
    `:line_spacing=${Math.round(fontsize * 0.15)}`,
  );
  const drawtext = partes.join('');

  await ffmpeg([
    '-ss', Math.max(0, timestamp).toFixed(2),
    '-i', videoPath,
    '-frames:v', '1',
    '-vf', drawtext,
    '-q:v', '2',
    outPath,
  ]);
  return outPath;
}

module.exports = { generarPortada };

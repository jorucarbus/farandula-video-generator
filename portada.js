// Portada (miniatura) — pedido del usuario: "escoger un fotograma y poner un titular", con el
// look de credibilidad de farándula (referencia real que mandó: caja sólida redondeada de color,
// texto oscuro en negrita encima). TikTok no expone API para fijar la portada al publicar, así
// que esto genera una imagen JPG aparte (nunca toca el video final) para subirla a mano.
//
// Sin colita/pico de burbuja de chat (decisión explícita: la matemática extra en ffmpeg para esa
// forma no vale el riesgo de que algo salga raro en un caso límite). Caja redondeada sí, vía un
// filtro `geq` que talla el alpha en las 4 esquinas — ver `alphaRedondeada()`.
//
// Reusa el mismo catálogo de tipografías de subtitulos.js (Fase 6) para el titular.
const path = require('path');
const { ffmpeg, TEMP_DIR } = require('./video');
const subtitulos = require('./subtitulos');

// Asume el mismo canvas 1080x1920 que subtitulos.js (formato vertical fijo de toda la app).
const ANCHO_VIDEO = 1080;
const ALTO_VIDEO = 1920;
const ANCHO_UTIL = ANCHO_VIDEO - 70 - 70; // margen lateral, mismo criterio que ANCHO_UTIL de subtitulos.js
const FONTSIZE_MAX = 78;
const FONTSIZE_MIN = 36;
const MARGEN_IZQUIERDO = 60;
const POS_Y_FRACCION = 0.58; // top de la caja, fracción de ALTO_VIDEO — encima de la franja de TikTok
const COLOR_CAJA = '0xFF2D6B'; // rosa/rojo vivo, según la referencia del usuario
const COLOR_TEXTO = '0x141414'; // casi negro, alto contraste sobre el rosa

// Escapa texto para el valor de una opción DENTRO de un filtro de ffmpeg (drawtext text=...).
// La comilla simple no tiene escape posible ahí (rompe el parseo pase lo que se anteponga), así
// que se sustituye por la tipográfica — no cambia el sentido del titular.
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

// Busca el tamaño de letra más grande (entre FONTSIZE_MAX y FONTSIZE_MIN) que deja el titular en
// máximo 3 líneas sin desbordar el ancho útil, según el `factorAncho` real de la tipografía
// elegida (mismo principio que tamanoSeguro() en subtitulos.js, aplicado a un titular completo).
function ajustarTamano(texto, factorAncho) {
  const palabras = texto.trim().split(/\s+/).filter(Boolean);
  for (let fontsize = FONTSIZE_MAX; fontsize >= FONTSIZE_MIN; fontsize -= 3) {
    const maxChars = Math.max(1, Math.floor(ANCHO_UTIL / (fontsize * factorAncho)));
    const lineas = envolver(palabras, maxChars, 3);
    if (lineas) return { lineas, fontsize };
  }
  const maxChars = Math.max(1, Math.floor(ANCHO_UTIL / (FONTSIZE_MIN * factorAncho)));
  return { lineas: envolver(palabras, maxChars, 3, true), fontsize: FONTSIZE_MIN };
}

// Expresión `geq` (con las comas ya escapadas para ir dentro de un filtro encadenado) que deja
// alpha=0 en el triángulo exterior de cada esquina y alpha=255 en el resto — la forma clásica de
// tallar un rectángulo con esquinas redondeadas a partir de 4 pruebas de círculo. Probado antes de
// integrarlo (renderizado suelto, esquinas limpias en las 4 puntas).
function alphaRedondeada(w, h, r) {
  const circulo = (cx, cy) => `(X-(${cx}))*(X-(${cx}))+(Y-(${cy}))*(Y-(${cy}))`;
  const esquina = (condX, condY, cx, cy) =>
    `if(${condX}*${condY}\\, if(gt(${circulo(cx, cy)}\\,${r * r})\\,0\\,255)`;
  return (
    `${esquina(`lt(X\\,${r})`, `lt(Y\\,${r})`, r, r)}, ` +
    `${esquina(`lt(${w}-X\\,${r})`, `lt(Y\\,${r})`, w - r, r)}, ` +
    `${esquina(`lt(X\\,${r})`, `lt(${h}-Y\\,${r})`, r, h - r)}, ` +
    `${esquina(`lt(${w}-X\\,${r})`, `lt(${h}-Y\\,${r})`, w - r, h - r)}, ` +
    `255)))) `
  ).replace(/\s+/g, '');
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

  // Geometría de la caja, estimada con el mismo factorAncho que ya se usó para decidir que el
  // texto entra — da un poco de aire extra (holgado, no ajustado al pixel) en vez de medir el
  // render real, que ffmpeg no expone de vuelta sin un segundo paso.
  const padX = Math.round(fontsize * 0.5);
  const padY = Math.round(fontsize * 0.4);
  const lineHeight = Math.round(fontsize * 1.18);
  const lineSpacing = Math.round(fontsize * 0.12);
  const anchoMaxLinea = Math.max(...lineas.map(l => l.length)) * fontsize * fuente.factorAncho;
  const boxW = Math.min(ANCHO_UTIL + padX * 2, Math.round(anchoMaxLinea + padX * 2));
  const boxH = lineas.length * lineHeight + (lineas.length - 1) * lineSpacing + padY * 2;
  const boxX = MARGEN_IZQUIERDO;
  const boxY = Math.round(ALTO_VIDEO * POS_Y_FRACCION);
  const radio = Math.max(14, Math.min(32, Math.round(fontsize * 0.4)));

  const partes = [`drawtext=text='${texto}'`];
  if (fuentesDir) {
    // ffmpeg en Windows necesita los ':' de la unidad (C\:) escapados dentro del valor del filtro.
    const fontfile = path.join(fuentesDir, fuente.archivo).replace(/\\/g, '/').replace(/:/g, '\\:');
    partes.push(`:fontfile='${fontfile}'`);
  }
  partes.push(
    `:fontsize=${fontsize}:fontcolor=${COLOR_TEXTO}`,
    `:x=${boxX + padX}:y=${boxY + padY}`,
    `:line_spacing=${lineSpacing}`,
  );
  const drawtext = partes.join('');

  const filterComplex =
    `[1:v]format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${alphaRedondeada(boxW, boxH, radio)}'[caja];` +
    `[0:v][caja]overlay=${boxX}:${boxY}[fondo];` +
    `[fondo]${drawtext}[out]`;

  await ffmpeg([
    '-ss', Math.max(0, timestamp).toFixed(2),
    '-i', videoPath,
    '-f', 'lavfi',
    '-i', `color=c=${COLOR_CAJA}:s=${boxW}x${boxH}`,
    '-filter_complex', filterComplex,
    '-map', '[out]',
    '-frames:v', '1',
    '-q:v', '2',
    outPath,
  ]);
  return outPath;
}

module.exports = { generarPortada };

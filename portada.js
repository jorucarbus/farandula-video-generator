// Portada (miniatura) — pedido del usuario: "escoger un fotograma y poner un titular", con el
// look de credibilidad de farándula (referencia real: caja sólida redondeada de color, texto
// oscuro en negrita encima). TikTok no expone API para fijar la portada al publicar, así que
// esto genera una imagen JPG aparte (nunca toca el video final) para subirla a mano.
//
// Sin colita/pico de burbuja de chat (decisión explícita: no vale el riesgo de un caso límite
// raro por esa forma).
//
// La caja se dibuja con el filtro `ass` (libass) en vez de `geq`+`overlay`: la primera versión
// usaba `geq` para tallar las esquinas redondeadas y funcionaba local (Windows), pero reventó en
// producción (Railway/Linux) con "Filter not found" — el binario estático de ffmpeg de ese
// entorno no trae `geq` compilado. `ass` sí está probado en producción (Fase 6, subtítulos
// quemados con este mismo filtro todos los días), así que la caja se dibuja como un "drawing"
// vectorial de ASS (rectángulo con esquinas en bézier) y el titular como texto encima, en el
// MISMO archivo .ass — sin filter_complex, sin geq, sin overlay.
const fs = require('fs');
const path = require('path');
const { ffmpeg, TEMP_DIR } = require('./video');
const subtitulos = require('./subtitulos');

// Asume el mismo canvas 1080x1920 que subtitulos.js (formato vertical fijo de toda la app).
const ANCHO_VIDEO = 1080;
const ALTO_VIDEO = 1920;
const ANCHO_UTIL = ANCHO_VIDEO - 70 - 70; // margen lateral, mismo criterio que ANCHO_UTIL de subtitulos.js
const FONTSIZE_MAX = 94;
const FONTSIZE_MIN = 36;
// Rango del tamaño MANUAL (Paso extra, selector del usuario) — más ancho que el que recorre el
// automático: permite letra bien chica o bien gigante a propósito, algo que el auto nunca elige
// porque busca el equilibrio "entra sin desbordar", no un efecto visual particular.
const TAMANO_MANUAL_MIN = 24;
const TAMANO_MANUAL_MAX = 160;
const POS_Y_FRACCION = 0.58; // top de la caja, fracción de ALTO_VIDEO — encima de la franja de TikTok
const COLOR_CAJA = 'FF2D6B'; // rosa/rojo vivo, según la referencia del usuario (RRGGBB)
const COLOR_TEXTO = 'FFFFFF'; // blanco, pedido explícito del usuario (RRGGBB)

// ffmpeg necesita los ':' de una ruta de Windows (C\:) escapados dentro del valor de un filtro —
// mismo criterio que rutaFiltro() en video.js (no exportada, se replica acá).
function rutaFiltro(p) {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:');
}

// "RRGGBB" → "&H00BBGGRR&" (formato de color ASS: alfa-azul-verde-rojo, 00 = opaco). Mismo
// esquema que COLOR_RESALTE/COLOR_BASE en subtitulos.js.
function colorASS(rrggbb) {
  const r = rrggbb.slice(0, 2), g = rrggbb.slice(2, 4), b = rrggbb.slice(4, 6);
  return `&H00${b}${g}${r}&`.toUpperCase();
}

// Escapa texto para el campo Text de un evento ASS. La llave abre/cierra bloques de override
// (rompería el parseo), y la barra invertida no tiene escape simple ahí — ambas se sustituyen en
// vez de intentar escaparlas (un titular normal jamás las necesita).
function escaparASS(texto) {
  return texto.replace(/\\/g, '').replace(/\{/g, '(').replace(/\}/g, ')');
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

// Envuelve `texto` a como máximo 3 líneas para un tamaño de letra YA elegido (manual o cada
// intento del automático) — `forzar` decide si puede desbordar la última línea en vez de fallar.
function envolverATamano(texto, fontsize, factorAncho, forzar) {
  const palabras = texto.trim().split(/\s+/).filter(Boolean);
  const maxChars = Math.max(1, Math.floor(ANCHO_UTIL / (fontsize * factorAncho)));
  return envolver(palabras, maxChars, 3, forzar);
}

// Busca el tamaño de letra más grande (entre FONTSIZE_MAX y FONTSIZE_MIN) que deja el titular en
// máximo 3 líneas sin desbordar el ancho útil, según el `factorAncho` real de la tipografía
// elegida (mismo principio que tamanoSeguro() en subtitulos.js, aplicado a un titular completo).
function ajustarTamano(texto, factorAncho) {
  for (let fontsize = FONTSIZE_MAX; fontsize >= FONTSIZE_MIN; fontsize -= 3) {
    const lineas = envolverATamano(texto, fontsize, factorAncho, false);
    if (lineas) return { lineas, fontsize };
  }
  return { lineas: envolverATamano(texto, FONTSIZE_MIN, factorAncho, true), fontsize: FONTSIZE_MIN };
}

// Path ASS ("drawing") de un rectángulo w x h con esquinas redondeadas de radio r, ancladas en el
// origen (0,0) — se posiciona en pantalla con \pos al usarlo. Curva bézier estándar por esquina
// (constante 0.5523 = aproximación circular clásica de una cuarta de círculo con bézier cúbica).
function dibujoCajaRedondeada(w, h, r) {
  const k = Math.round(r * 0.5523);
  return [
    `m ${r} 0`,
    `l ${w - r} 0`,
    `b ${w - r + k} 0 ${w} ${r - k} ${w} ${r}`,
    `l ${w} ${h - r}`,
    `b ${w} ${h - r + k} ${w - r + k} ${h} ${w - r} ${h}`,
    `l ${r} ${h}`,
    `b ${r - k} ${h} 0 ${h - r + k} 0 ${h - r}`,
    `l 0 ${r}`,
    `b 0 ${r - k} ${r - k} 0 ${r} 0`,
  ].join(' ');
}

// videoPath: mp4 fuente (el preview que sobrevive a la limpieza de temporales, ver server.js).
// timestamp: segundos dentro del video, el fotograma que el usuario eligió pausando el player.
// titular: texto libre, se pone en mayúsculas.
// fuenteClave: clave del catálogo de subtitulos.js (default 'anton' si no llega o no existe).
// tamanoManual: opcional — si el usuario elige un tamaño a mano (Paso extra), se usa TAL CUAL
// (clamp a [TAMANO_MANUAL_MIN, TAMANO_MANUAL_MAX]) en vez del automático, y el texto se envuelve
// forzando el desborde de la última línea si hace falta (el usuario eligió el tamaño a propósito,
// no tiene sentido que el código lo achique solo). Sin valor, o no numérico: automático de siempre.
async function generarPortada(videoPath, timestamp, titular, fuenteClave, token, tamanoManual) {
  const outPath = path.join(TEMP_DIR, `portada_${token}.jpg`);
  const fuentesDir = await subtitulos.obtenerCarpetaFuentes(fuenteClave);
  const fuente = subtitulos.FUENTES[fuenteClave] || subtitulos.FUENTES[subtitulos.FUENTE_DEFAULT];

  const textoMayus = titular.toUpperCase();
  const { lineas, fontsize } = Number.isFinite(tamanoManual)
    ? (() => {
        const tam = Math.max(TAMANO_MANUAL_MIN, Math.min(TAMANO_MANUAL_MAX, Math.round(tamanoManual)));
        return { lineas: envolverATamano(textoMayus, tam, fuente.factorAncho, true), fontsize: tam };
      })()
    : ajustarTamano(textoMayus, fuente.factorAncho);

  // Geometría de la caja, estimada con el mismo factorAncho que ya se usó para decidir que el
  // texto entra. El padding es la caja MISMA (se dibuja exacto, sin margen de error de por sí,
  // a diferencia de la estimación de ancho que sí necesita ser holgada) — ajustado angosto a
  // propósito para que el texto llene la burbuja en vez de flotar con aire de sobra alrededor.
  const padX = Math.round(fontsize * 0.32);
  const padY = Math.round(fontsize * 0.22);
  const lineHeight = Math.round(fontsize * 1.08);
  const lineSpacing = Math.round(fontsize * 0.08);
  const anchoMaxLinea = Math.max(...lineas.map(l => l.length)) * fontsize * fuente.factorAncho;
  const boxW = Math.min(ANCHO_UTIL + padX * 2, Math.round(anchoMaxLinea + padX * 2));
  const boxH = lineas.length * lineHeight + (lineas.length - 1) * lineSpacing + padY * 2;
  const boxX = Math.round((ANCHO_VIDEO - boxW) / 2); // burbuja centrada horizontalmente
  const boxY = Math.round(ALTO_VIDEO * POS_Y_FRACCION);
  const radio = Math.max(14, Math.min(32, Math.round(fontsize * 0.4)));
  const sombra = Math.max(2, Math.round(fontsize * 0.045));

  const textoASS = lineas.map(escaparASS).join('\\N');

  const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: ${ANCHO_VIDEO}
PlayResY: ${ALTO_VIDEO}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Portada,${fuente.familia},${fontsize},${colorASS(COLOR_TEXTO)},${colorASS(COLOR_TEXTO)},&H00000000&,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:59.00,Portada,,0,0,0,,{\\an7\\pos(${boxX},${boxY})\\bord0\\shad0\\1c${colorASS(COLOR_CAJA)}\\p1}${dibujoCajaRedondeada(boxW, boxH, radio)}{\\p0}
Dialogue: 1,0:00:00.00,0:00:59.00,Portada,,0,0,0,,{\\an5\\pos(${boxX + boxW / 2},${boxY + boxH / 2})\\bord0\\shad${sombra}\\4c&H000000&\\4a&H60&}${textoASS}
`;

  const assPath = path.join(TEMP_DIR, `portada_${token}.ass`);
  fs.writeFileSync(assPath, ass, 'utf8');

  const filtroV = `ass='${rutaFiltro(assPath)}'${fuentesDir ? `:fontsdir='${rutaFiltro(fuentesDir)}'` : ''}`;

  try {
    await ffmpeg([
      '-ss', Math.max(0, timestamp).toFixed(2),
      '-i', videoPath,
      '-frames:v', '1',
      '-vf', filtroV,
      '-q:v', '2',
      outPath,
    ]);
  } finally {
    try { fs.unlinkSync(assPath); } catch {}
  }
  return outPath;
}

module.exports = { generarPortada };

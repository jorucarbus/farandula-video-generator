// Fase 8c del plan maestro — preparación de las pistas de música antes de mezclarlas.
//
// Muchas pistas de stock traen unos segundos de silencio o aire al principio antes de que entre
// el "cuerpo" de la canción — si el video arranca la música justo en t=0 del archivo, pierde esa
// energía justo cuando más la necesita (el gancho inicial del video). Pedido del usuario: en vez
// de un mapeo aparte (un JSON que se desincroniza si se agregan/borran pistas a mano en Drive),
// el offset de inicio se ETIQUETA en el nombre del archivo mismo — visible, durable, y el
// análisis se hace una sola vez por archivo (si ya tiene la etiqueta, no se vuelve a tocar).
const fs = require('fs');
const drive = require('./drive');
const video = require('./video');
const { execFile } = require('child_process');
const FFMPEG_BIN = require('ffmpeg-static');

const TAG_REGEX = /\[inicio=([\d.]+)s\]/i;

function estaEtiquetada(nombre) {
  return TAG_REGEX.test(nombre);
}

// Offset de inicio ya etiquetado en el nombre, en segundos (0 si no tiene etiqueta).
function offsetDeNombre(nombre) {
  const m = nombre.match(TAG_REGEX);
  return m ? parseFloat(m[1]) : 0;
}

// Analiza un archivo de audio local y devuelve desde qué segundo arranca el contenido real.
// Umbral conservador a propósito (-35dB, mínimo 0.4s de silencio) para no recortar el ataque
// suave de una intro — solo saltar silencio muerto real. Solo cuenta si el silencio arranca
// prácticamente en t=0 (primeros 0.3s): uno que aparece más adelante es parte de la canción,
// no "aire inicial", y no se toca.
function detectarInicio(localPath) {
  return new Promise((resolve) => {
    execFile(FFMPEG_BIN, ['-i', localPath, '-af', 'silencedetect=noise=-35dB:d=0.4', '-t', '20', '-f', 'null', '-'], (err, stdout, stderr) => {
      const out = stderr || '';
      const inicioSilencio = out.match(/silence_start:\s*([\d.]+)/);
      const finSilencio = out.match(/silence_end:\s*([\d.]+)/);
      if (inicioSilencio && finSilencio && parseFloat(inicioSilencio[1]) < 0.3) {
        resolve(parseFloat(finSilencio[1]));
      } else {
        resolve(0);
      }
    });
  });
}

// Recorre TODAS las carpetas de Musica/ y etiqueta las pistas que todavía no lo estén — sirve
// tanto para el mapeo inicial (pedido del usuario) como para pistas nuevas que se agreguen
// después (llamar de nuevo no vuelve a tocar las ya etiquetadas). Nunca aborta por una pista
// individual: si una falla, se anota el error y sigue con las demás.
async function etiquetarTodo() {
  const carpetas = await drive.obtenerCarpetasMusica();
  const resultado = [];
  for (const [carpetaNombre, folderId] of Object.entries(carpetas)) {
    const pistas = await drive.listarMusica(folderId);
    for (const pista of pistas) {
      if (estaEtiquetada(pista.name)) {
        resultado.push({ carpeta: carpetaNombre, nombre: pista.name, offset: offsetDeNombre(pista.name), yaEstaba: true });
        continue;
      }
      let tmp;
      try {
        const ext = (pista.name.match(/\.[^.]+$/) || ['.mp3'])[0];
        tmp = await drive.descargarMusica(pista.id, video.TEMP_DIR, ext);
        const offset = await detectarInicio(tmp);

        const base = pista.name.replace(/\.[^.]+$/, '');
        const nuevoNombre = `${base} [inicio=${offset.toFixed(2)}s]${ext}`;
        await drive.renombrarArchivo(pista.id, nuevoNombre);
        resultado.push({ carpeta: carpetaNombre, nombre: nuevoNombre, offset, yaEstaba: false });
      } catch (e) {
        console.warn(`  ⚠️ No se pudo etiquetar "${pista.name}" (${carpetaNombre}): ${e.message}`);
        resultado.push({ carpeta: carpetaNombre, nombre: pista.name, offset: 0, error: e.message });
      } finally {
        if (tmp) { try { fs.unlinkSync(tmp); } catch {} }
      }
    }
  }
  return resultado;
}

module.exports = { estaEtiquetada, offsetDeNombre, detectarInicio, etiquetarTodo, TAG_REGEX };

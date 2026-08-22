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
const TAG_LUFS = /\[lufs=(-?[\d.]+)\]/i;

// Antes se le bajaba a TODAS las pistas el mismo número (-20dB sobre el archivo), y eso conserva
// las diferencias de origen: el catálogo real va de -16.7 a -12.8 LUFS, así que unas canciones
// entraban casi 4 dB más fuerte que otras — el usuario lo notó de oído ("algunas están con el
// volumen más alto desde origen"). Bajar más el número no lo arregla: mueve las dos parejo.
//
// Ahora el número que elige el usuario significa otra cosa, y por eso sigue siendo comparable con
// los -18/-20 de antes: es cuánto se atenúa una pista de REFERENCIA. Cada pista real se mueve lo
// que haga falta para sonar como esa referencia, así que el control ajusta el volumen de la música
// SIN volver a abrir la dispersión entre unas y otras.
//
// -15 LUFS es el promedio medido del catálogo de 26 pistas (2026-08-22). O sea que "-18dB" da hoy
// exactamente el mismo volumen que daba el -18dB viejo sobre una pista promedio — el usuario no
// tiene que reaprender el número. Si el catálogo cambiara mucho de nivel con el tiempo, esta
// constante es lo único que habría que volver a medir.
const REFERENCIA_LUFS = -15;
const GANANCIA_DEFAULT_DB = -18;
// Nunca subir una pista más que esto. Con estos objetivos siempre se atenúa, pero una pista
// futura grabada muy floja podría pedir ganancia positiva y saturar al mezclarla con la voz.
const SUBIDA_MAX_DB = 6;
// Rango que ofrece la UI. Fuera de esto no tiene sentido: más alto tapa la voz, más bajo no se oye.
const GANANCIA_MIN_DB = -30;
const GANANCIA_MAX_DB = -10;

function estaEtiquetada(nombre) {
  return TAG_REGEX.test(nombre);
}

// Offset de inicio ya etiquetado en el nombre, en segundos (0 si no tiene etiqueta).
function offsetDeNombre(nombre) {
  const m = nombre.match(TAG_REGEX);
  return m ? parseFloat(m[1]) : 0;
}

// Loudness ya etiquetado en el nombre, en LUFS (null si la pista todavía no se midió).
function lufsDeNombre(nombre) {
  const m = nombre.match(TAG_LUFS);
  return m ? parseFloat(m[1]) : null;
}

// Cuánto del track se mide. Un video dura ~70s, así que la música que de verdad suena son los
// primeros ~70-90s a partir del offset de inicio — no el track entero. Medir el archivo completo
// deja un residuo: si el final de la canción es más suave que el principio, la medición sale más
// baja que lo que el espectador escucha. Medido: con el track completo quedaba 0.9 dB de
// diferencia entre las pistas extremas; acotando la ventana, baja más.
const VENTANA_MEDICION_S = 90;

// Mide el loudness integrado del archivo con `loudnorm` en modo análisis (no toca el audio, solo
// imprime el JSON con la medición). Devuelve null si no se pudo leer — el llamador cae entonces a
// la ganancia fija de siempre.
// `offsetInicio`: se saltea el silencio inicial igual que hace prepararMusica(), para medir
// exactamente el tramo que va a sonar.
function medirLoudness(localPath, offsetInicio = 0) {
  return new Promise((resolve) => {
    const args = [];
    if (offsetInicio > 0) args.push('-ss', offsetInicio.toFixed(2));
    args.push('-t', String(VENTANA_MEDICION_S), '-i', localPath, '-af', 'loudnorm=print_format=json', '-f', 'null', '-');
    execFile(FFMPEG_BIN, args,
      { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
        const m = (stderr || '').match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);
        if (!m) return resolve(null);
        try {
          const j = JSON.parse(m[0]);
          const lufs = parseFloat(j.input_i);
          resolve(Number.isFinite(lufs) ? lufs : null);
        } catch { resolve(null); }
      });
  });
}

// Cuántos dB hay que mover ESTA pista para que quede al volumen elegido, igual que todas las demás.
// `gananciaDeseada` es lo que el usuario ajusta en el Paso 6: cuánto se atenuaría una pista de
// referencia. Sin medición (pista nueva y análisis fallado) se aplica ese número tal cual — el
// video sale igual, solo sin emparejar con el resto.
function gananciaPara(lufsMedido, gananciaDeseada = GANANCIA_DEFAULT_DB) {
  const deseada = Number.isFinite(gananciaDeseada)
    ? Math.min(GANANCIA_MAX_DB, Math.max(GANANCIA_MIN_DB, gananciaDeseada))
    : GANANCIA_DEFAULT_DB;
  if (!Number.isFinite(lufsMedido)) return deseada;
  const objetivo = REFERENCIA_LUFS + deseada;
  const bruta = objetivo - lufsMedido;
  return Math.round(Math.min(bruta, SUBIDA_MAX_DB) * 10) / 10;
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
      const faltaInicio = !estaEtiquetada(pista.name);
      const faltaLufs = lufsDeNombre(pista.name) === null;
      if (!faltaInicio && !faltaLufs) {
        resultado.push({
          carpeta: carpetaNombre, nombre: pista.name, yaEstaba: true,
          offset: offsetDeNombre(pista.name), lufs: lufsDeNombre(pista.name),
        });
        continue;
      }
      let tmp;
      try {
        const ext = (pista.name.match(/\.[^.]+$/) || ['.mp3'])[0];
        tmp = await drive.descargarMusica(pista.id, video.TEMP_DIR, ext);
        // Solo se calcula lo que falta: una pista ya etiquetada con su inicio no se vuelve a analizar
        const offset = faltaInicio ? await detectarInicio(tmp) : offsetDeNombre(pista.name);
        const lufs = faltaLufs ? await medirLoudness(tmp, offset) : lufsDeNombre(pista.name);

        // El nombre se reconstruye desde cero (sin etiquetas viejas) para no acumularlas al
        // re-correr esto sobre una pista que ya tenía una de las dos.
        const base = pista.name.replace(/\.[^.]+$/, '').replace(TAG_REGEX, '').replace(TAG_LUFS, '').trim();
        const etiquetaLufs = Number.isFinite(lufs) ? ` [lufs=${lufs.toFixed(1)}]` : '';
        const nuevoNombre = `${base} [inicio=${offset.toFixed(2)}s]${etiquetaLufs}${ext}`;
        await drive.renombrarArchivo(pista.id, nuevoNombre);
        resultado.push({ carpeta: carpetaNombre, nombre: nuevoNombre, offset, lufs, yaEstaba: false });
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

module.exports = {
  estaEtiquetada, offsetDeNombre, detectarInicio, etiquetarTodo, TAG_REGEX,
  lufsDeNombre, medirLoudness, gananciaPara, TAG_LUFS,
  REFERENCIA_LUFS, GANANCIA_DEFAULT_DB, GANANCIA_MIN_DB, GANANCIA_MAX_DB,
};

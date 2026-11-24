// Música de fondo para el motor: reutiliza la biblioteca de música de Drive (carpetas por TONO, pistas etiquetadas con inicio y LUFS) y la preparación del generador
// (corta el silencio inicial, ganancia emparejada por LUFS, fundidos, bucle hasta la duración del video). Sin ducking dinámico: nivel fijo bajo la voz (decisión del usuario, 2026-08).
const fs = require('fs');
const path = require('path');
const drive = require('../drive');
const musica = require('../musica');
const video = require('../video');

const DESTINO = path.join(__dirname, '..', 'data-motor', 'musica');
const TONOS = ['tragedia', 'tension', 'escandalo', 'alegre', 'romantico', 'misterio', 'neutral'];

// Tono por reglas a partir del guion (sin gastar un modelo): si el usuario no lo pide con --tono.
function tonoDeGuion(texto) {
  const t = String(texto).toLowerCase();
  if (/(fallec|muri[oó]|muerte|tragedia|accidente)/.test(t)) return 'tragedia';
  if (/(esc[aá]ndalo|pol[eé]mic|denunci|acusa|infiel|traici)/.test(t)) return 'escandalo';
  if (/(boda|pareja|romanc|enamor|compromiso|novi[oa])/.test(t)) return 'romantico';
  if (/(gan[oó]|corona|reina|triunf|celebr|desfil|campe[oó]n|logr[oó]|premio)/.test(t)) return 'alegre';
  return 'neutral';
}

// Elige una pista del tono (determinista por semilla, para que repetir el video repita la música) y la descarga; devuelve { ruta, nombre, offset, gananciaDb, tono }.
async function elegirPista(tono, semilla = 0) {
  const carpetas = await drive.obtenerCarpetasMusica(); const id = carpetas[tono] || carpetas.neutral || Object.values(carpetas)[0];
  if (!id) throw new Error('no hay carpetas de música en Drive');
  const pistas = (await drive.listarMusica(id)).sort((a, b) => a.name.localeCompare(b.name)); if (!pistas.length) throw new Error(`la carpeta de música "${tono}" está vacía`);
  const p = pistas[Math.abs(semilla) % pistas.length]; fs.mkdirSync(DESTINO, { recursive: true });
  const dest = await drive.descargarMusica(p.id, DESTINO), ruta = typeof dest === 'string' ? dest : dest.path || dest.ruta;
  const lufs = musica.lufsDeNombre(p.name), gananciaDb = lufs == null ? -20 : musica.gananciaPara(lufs);
  return { ruta, nombre: p.name, offset: musica.offsetDeNombre(p.name) || 0, gananciaDb, tono: carpetas[tono] ? tono : 'neutral', total: pistas.length };
}

// → ruta del .m4a listo para mezclar (dura `duracion` s, con fundidos).
async function prepararFondo({ tono, duracion, jobId = 'motor', semilla = 0 }) {
  const pista = await elegirPista(tono, semilla), listo = await video.prepararMusica(pista.ruta, pista.offset, duracion, jobId, pista.gananciaDb);
  return { ...pista, listo };
}

module.exports = { TONOS, tonoDeGuion, elegirPista, prepararFondo };

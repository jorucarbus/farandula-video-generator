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
// Sin semilla explícita, la pista rota: se evitan las últimas usadas en ese tono (data-motor/musica-uso.json) y entre las demás se elige por la clave del video
// (así el mismo video repite su música, pero dos videos seguidos —y un video y su gemelo— no suenan igual).
const USO = path.join(__dirname, '..', 'data-motor', 'musica-uso.json');
const leerUso = () => { try { return JSON.parse(fs.readFileSync(USO, 'utf8')); } catch { return {}; } };
const hashDe = s => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
function indiceRotado(nombres, tono, clave, uso) {
  const recientes = (uso[tono] || []).slice(-Math.min(3, nombres.length - 1)); // con 1 sola pista no hay nada que evitar
  const libres = nombres.map((n, i) => i).filter(i => !recientes.includes(nombres[i]));
  return (libres.length ? libres : nombres.map((n, i) => i))[hashDe(clave) % (libres.length || nombres.length)];
}
async function elegirPista(tono, semilla = null, clave = '') {
  const carpetas = await drive.obtenerCarpetasMusica(); const id = carpetas[tono] || carpetas.neutral || Object.values(carpetas)[0];
  if (!id) throw new Error('no hay carpetas de música en Drive');
  const pistas = (await drive.listarMusica(id)).sort((a, b) => a.name.localeCompare(b.name)); if (!pistas.length) throw new Error(`la carpeta de música "${tono}" está vacía`);
  const uso = leerUso(), nombres = pistas.map(x => x.name), i = semilla != null && semilla !== 0 ? Math.abs(semilla) % pistas.length : indiceRotado(nombres, tono, clave || String(Date.now()), uso);
  const p = pistas[i]; fs.mkdirSync(DESTINO, { recursive: true });
  try { uso[tono] = [...(uso[tono] || []).filter(n => n !== p.name), p.name].slice(-12); fs.writeFileSync(USO, JSON.stringify(uso, null, 1)); } catch { /* el historial es opcional */ }
  const dest = await drive.descargarMusica(p.id, DESTINO), ruta = typeof dest === 'string' ? dest : dest.path || dest.ruta;
  const lufs = musica.lufsDeNombre(p.name), gananciaDb = lufs == null ? -20 : musica.gananciaPara(lufs);
  return { ruta, nombre: p.name, offset: musica.offsetDeNombre(p.name) || 0, gananciaDb, tono: carpetas[tono] ? tono : 'neutral', total: pistas.length };
}

// → ruta del .m4a listo para mezclar (dura `duracion` s, con fundidos).
async function prepararFondo({ tono, duracion, jobId = 'motor', semilla = null, clave = '' }) {
  const pista = await elegirPista(tono, semilla, clave), listo = await video.prepararMusica(pista.ruta, pista.offset, duracion, jobId, pista.gananciaDb);
  return { ...pista, listo };
}

module.exports = { TONOS, tonoDeGuion, elegirPista, prepararFondo, indiceRotado };

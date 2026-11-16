// Pone al día el estado local con el de Drive ANTES de arrancar el servidor en la PC.
//
// Por qué existe (2026-11-16): el usuario quiere que los videos los procese su computador y no
// Railway, para gastar menos ahí. La PC pasa a ser la que ESCRIBE el estado compartido (procesos,
// historial de tomas, famosos, ajustes, métricas) y Railway queda de respaldo. Pero la primera vez
// —y cada vez que se haya trabajado desde Railway— la copia local está atrasada, y `restaurar()` no
// baja nada si el archivo local ya existe. Arrancar así subiría una copia VIEJA encima de la buena:
// es exactamente como se vaciaron los datos reales el 2026-09-20.
//
// Regla, archivo por archivo: gana el más NUEVO.
//   - Drive más nuevo que el local  -> se baja (el local se guarda antes en data/respaldo-local/).
//   - Local más nuevo que Drive     -> se deja; el servidor lo sube solo en su próximo guardado.
//   - Iguales                       -> nada.
// Nunca se baja un archivo vacío encima de uno con contenido.
//
// `cola.json` queda fuera a propósito: la cola es de cada máquina (ver ENTORNO en colaRender.js) y
// el disco de la PC no es efímero, así que no hace falta traerla ni subirla.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const driveCache = require('./driveCache');
const famosos = require('./famosos');
const ajustes = require('./ajustes');
const metricas = require('./metricas');

const ARCHIVOS = [
  [path.join(__dirname, 'data', 'jobs.json'), 'jobs.json'],
  [path.join(__dirname, 'historial.json'), 'historial.json'],
  [famosos.TABLA_PATH, famosos.NOMBRE_DRIVE],
  [ajustes.AJUSTES_FILE, ajustes.NOMBRE_DRIVE],
  [metricas.ARCHIVO, metricas.NOMBRE_DRIVE],
];
const RESPALDOS_DIR = path.join(__dirname, 'data', 'respaldo-local');
const RESPALDOS_MAX = 10;

function jsonVacio(texto) {
  try {
    const d = JSON.parse(texto);
    return Array.isArray(d) ? d.length === 0 : (!d || (typeof d === 'object' && !Object.keys(d).length));
  } catch { return !texto.trim(); }
}

function podarRespaldos() {
  try {
    const dirs = fs.readdirSync(RESPALDOS_DIR).sort();
    for (const d of dirs.slice(0, Math.max(0, dirs.length - RESPALDOS_MAX))) {
      fs.rmSync(path.join(RESPALDOS_DIR, d), { recursive: true, force: true });
    }
  } catch {}
}

async function sincronizar() {
  const marca = new Date().toISOString().replace(/[:.]/g, '-');
  const resumen = [];
  for (const [local, nombre] of ARCHIVOS) {
    try {
      const remoto = await driveCache.infoRemota(nombre);
      if (!remoto) { resumen.push(`${nombre}: no existe en Drive (se usa el local)`); continue; }
      const contenidoRemoto = await driveCache.leerRemoto(remoto.id);
      const existeLocal = fs.existsSync(local) && fs.statSync(local).size > 0;
      const contenidoLocal = existeLocal ? fs.readFileSync(local, 'utf8') : '';

      if (existeLocal && contenidoLocal === contenidoRemoto) { resumen.push(`${nombre}: al día`); continue; }
      if (jsonVacio(contenidoRemoto) && existeLocal && !jsonVacio(contenidoLocal)) {
        resumen.push(`${nombre}: el de Drive está VACÍO, se conserva el local`);
        continue;
      }
      const tRemoto = Date.parse(remoto.modifiedTime);
      const tLocal = existeLocal ? fs.statSync(local).mtimeMs : 0;
      if (existeLocal && tLocal > tRemoto) {
        resumen.push(`${nombre}: el local es más nuevo (se subirá al guardar)`);
        continue;
      }
      if (existeLocal) {
        const destino = path.join(RESPALDOS_DIR, marca);
        fs.mkdirSync(destino, { recursive: true });
        fs.copyFileSync(local, path.join(destino, nombre));
      }
      fs.mkdirSync(path.dirname(local), { recursive: true });
      const parcial = `${local}.sincronizando`;
      fs.writeFileSync(parcial, contenidoRemoto);
      fs.renameSync(parcial, local);
      resumen.push(`${nombre}: actualizado desde Drive (${(contenidoRemoto.length / 1024).toFixed(0)} KB)`);
    } catch (e) {
      resumen.push(`${nombre}: no se pudo sincronizar (${e.message}); se usa el local`);
    }
  }
  podarRespaldos();
  return resumen;
}

if (require.main === module) {
  sincronizar()
    .then(r => { console.log('Estado sincronizado con Drive:'); r.forEach(l => console.log('  - ' + l)); })
    .catch(e => { console.warn('No se pudo sincronizar el estado: ' + e.message); })
    .finally(() => process.exit(0));   // nunca frena el arranque: sin red se trabaja con lo local
}

module.exports = { sincronizar, ARCHIVOS };

// El ÍNDICE de la biblioteca (etiquetas, calidad, rostros y lista de clips de cada carpeta) es la base de todo: el orden, la elección de tomas
// y las decisiones de distribución salen de ahí. Costó llamadas a Gemini y, en un solo disco, un fallo lo perdía.
//
// Aquí se protege de tres maneras:
//   1) escritura segura: nunca se deja un archivo a medias y se conserva la versión anterior (.bak);
//   2) respaldo en Drive (carpeta "cache-estado", archivos `indice-<carpeta>.<tipo>.json`), con FUSIÓN: lo que exista en Drive y no aquí se
//      suma (etiquetas hechas desde otra computadora), y nunca se sube un archivo vacío encima de uno con contenido;
//   3) restauración: lo que falte en este equipo (disco nuevo, otra PC, Railway) se trae de Drive al arrancar.
// Las miniaturas no se respaldan: se rehacen con "Actualizar índice".
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DM = process.env.DATA_MOTOR_DIR || path.join(__dirname, '..', 'data-motor');
const BIB = path.join(DM, 'biblioteca');
const TIPOS = ['clips', 'etiquetas', 'calidad', 'rostros'];
const PREFIJO = 'indice-';
const carpetaOk = c => /^[\p{L}\p{N}_ .-]+$/u.test(c || '');
const rutaLocal = (carpeta, tipo) => path.join(BIB, `${carpeta}.${tipo}.json`);
const nombreRemoto = (carpeta, tipo) => `${PREFIJO}${carpeta}.${tipo}.json`;
const leer = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const vacio = d => (Array.isArray(d) ? d.length === 0 : !d || typeof d !== 'object' || !Object.keys(d).length);

// Escritura segura: archivo temporal + renombrar, y copia de la versión anterior en <archivo>.bak.
function escribirSeguro(archivo, obj) {
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  const tmp = `${archivo}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1));
  if (fs.existsSync(archivo)) { try { fs.copyFileSync(archivo, archivo + '.bak'); } catch {} }
  fs.renameSync(tmp, archivo);
}

// Fusión de dos versiones del mismo índice. Nada se pierde: la unión de ambas. En un choque gana la que se editó a mano más recientemente
// (campo `editado`); si ninguna se editó a mano, gana la local.
function fusionar(local, remoto) {
  const esLista = Array.isArray(local) || Array.isArray(remoto);
  const aMapa = d => (Array.isArray(d) ? Object.fromEntries(d.filter(x => x && x.id).map(x => [x.id, x])) : (d && typeof d === 'object' ? d : {}));
  const L = aMapa(local), Rm = aMapa(remoto), out = { ...L };
  for (const [k, v] of Object.entries(Rm)) {
    if (!(k in L)) { out[k] = v; continue; }
    if (Date.parse((v && v.editado) || 0) > Date.parse((L[k] && L[k].editado) || 0)) out[k] = v;
  }
  return esLista ? Object.values(out) : out;
}

// RESPALDO_DRIVE=0 apaga todo lo que toca Drive (pruebas y modo local sin credenciales).
const sinDrive = () => process.env.RESPALDO_DRIVE === '0';
const clienteDrive = () => { const d = require('../drive'); return d.getDriveOAuth() || d.getDrive(); };
async function listarRemotos() {
  const { CACHE_FOLDER_ID } = require('../driveCache'), c = clienteDrive(), todos = []; let pageToken;
  do {
    const r = await c.files.list({ q: `'${CACHE_FOLDER_ID}' in parents and name contains '${PREFIJO}' and trashed=false`, fields: 'nextPageToken, files(id, name, size, modifiedTime)', pageSize: 1000, pageToken, includeItemsFromAllDrives: true, supportsAllDrives: true });
    todos.push(...r.data.files); pageToken = r.data.nextPageToken;
  } while (pageToken);
  return new Map(todos.map(f => [f.name, f]));
}

const subido = new Map(); // nombre → hash de lo último subido (no se vuelve a subir lo que no cambió)
const hash = o => crypto.createHash('sha1').update(JSON.stringify(o)).digest('hex');

// Fusiona con Drive y sube el índice de UNA carpeta. Devuelve { subidos, traidos }.
async function respaldarCarpeta(carpeta, { remotos = null, log = () => {} } = {}) {
  if (!carpetaOk(carpeta)) throw new Error('carpeta inválida');
  if (sinDrive()) return { subidos: 0, traidos: 0 };
  const driveCache = require('../driveCache'); remotos = remotos || await listarRemotos(); let subidos = 0, traidos = 0;
  for (const tipo of TIPOS) {
    const f = rutaLocal(carpeta, tipo), nombre = nombreRemoto(carpeta, tipo); let local = leer(f, null);
    if (vacio(local)) continue; // nunca se sube un índice vacío
    const r = remotos.get(nombre);
    if (r) {
      const remoto = JSON.parse(await driveCache.leerRemoto(r.id)), fus = fusionar(local, remoto), antes = Object.keys(Array.isArray(local) ? Object.fromEntries(local.map(x => [x.id, 1])) : local).length;
      const despues = Array.isArray(fus) ? fus.length : Object.keys(fus).length;
      if (despues > antes || hash(fus) !== hash(local)) { escribirSeguro(f, fus); traidos += Math.max(0, despues - antes); local = fus; }
    }
    const h = hash(local); if (subido.get(nombre) === h) continue;
    await driveCache.respaldar(f, nombre); subido.set(nombre, h); subidos++; log(`respaldado: ${nombre}`);
  }
  return { subidos, traidos };
}

async function respaldarTodas({ log = () => {} } = {}) {
  if (sinDrive() || !fs.existsSync(BIB)) return { carpetas: 0, subidos: 0, traidos: 0 };
  const carpetas = fs.readdirSync(BIB).filter(f => f.endsWith('.clips.json')).map(f => f.replace(/\.clips\.json$/, '')), remotos = await listarRemotos(); let subidos = 0, traidos = 0;
  for (const c of carpetas) { const r = await respaldarCarpeta(c, { remotos, log }); subidos += r.subidos; traidos += r.traidos; }
  return { carpetas: carpetas.length, subidos, traidos };
}

// Trae de Drive lo que NO exista en este equipo (disco nuevo, otra PC, Railway). Las rutas de los clips se reescriben a las de este equipo.
async function restaurarFaltantes({ log = () => {} } = {}) {
  if (sinDrive()) return [];
  const driveCache = require('../driveCache'), remotos = await listarRemotos(), traidos = [];
  for (const [nombre] of remotos) {
    const m = nombre.match(/^indice-(.+)\.(clips|etiquetas|calidad|rostros)\.json$/); if (!m || !carpetaOk(m[1])) continue;
    const f = rutaLocal(m[1], m[2]); if (fs.existsSync(f) && fs.statSync(f).size > 2) continue;
    if (await driveCache.restaurar(f, nombre)) { traidos.push(nombre); if (m[2] === 'clips') normalizarRutas(m[1]); log(`restaurado: ${nombre}`); }
  }
  return traidos;
}

// Las rutas de clips.json son absolutas y de OTRO equipo: los videos de Drive van en <biblioteca>/<carpeta>/src_<id>.mp4.
function normalizarRutas(carpeta) {
  const f = rutaLocal(carpeta, 'clips'), clips = leer(f, []); let cambios = 0;
  for (const c of clips) if (c && c.id && !/^loc_/.test(c.id)) { const r = path.join(BIB, carpeta, `src_${c.id}.mp4`); if (c.ruta !== r) { c.ruta = r; cambios++; } }
  if (cambios) escribirSeguro(f, clips);
  return cambios;
}

module.exports = { BIB, TIPOS, escribirSeguro, fusionar, listarRemotos, respaldarCarpeta, respaldarTodas, restaurarFaltantes, normalizarRutas, nombreRemoto, rutaLocal };

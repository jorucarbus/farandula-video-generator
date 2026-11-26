// Los videos viven en Drive; en este equipo solo hay un ÍNDICE (etiquetas, calidad, rostros, miniaturas) y un caché temporal.
//
// - Indexar una carpeta: se descargan sus videos, se analizan (calidad, rostros, Gemini, miniatura) y se borran del disco.
// - Editar un video: el motor baja de Drive SOLO los clips que va a usar (`asegurar`).
// - Los clips bajados quedan en data-motor/biblioteca/<carpeta>/src_<id>.mp4 y se borran solos pasadas 48 h
//   (`limpiarCaducados`), salvo las carpetas marcadas como "recurrentes" (artistas que se usan seguido), que se quedan.
// Los archivos que NO vienen de Drive (importados del Selector, `src_loc_*`) nunca se borran desde aquí.
const fs = require('fs');
const path = require('path');

const DM = process.env.DATA_MOTOR_DIR || path.join(__dirname, '..', 'data-motor');
const BIB = path.join(DM, 'biblioteca');
const F_RECURRENTES = path.join(BIB, 'recurrentes.json');
const TTL_HORAS = 48;
const esDeDrive = nombre => /^src_(?!loc_).+\.mp4$/i.test(nombre);

const leer = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const rutaClip = (carpeta, id) => path.join(BIB, carpeta, `src_${id}.mp4`);
const carpetaOk = c => /^[\w .-]+$/.test(c || '');

function recurrentes() { const l = leer(F_RECURRENTES, []); return Array.isArray(l) ? l : []; }
function marcarRecurrente(carpeta, si) {
  if (!carpetaOk(carpeta)) throw new Error('carpeta inválida');
  const s = new Set(recurrentes()); si ? s.add(carpeta) : s.delete(carpeta);
  fs.mkdirSync(BIB, { recursive: true }); fs.writeFileSync(F_RECURRENTES, JSON.stringify([...s].sort(), null, 1));
  return [...s];
}

// Baja de Drive los clips que falten en disco. `ids`: ids de Drive. Devuelve { rutas: {id: ruta}, bajados, fallos }.
async function asegurar(carpeta, ids, { drive = require('../drive'), log = () => {} } = {}) {
  if (!carpetaOk(carpeta)) throw new Error('carpeta inválida');
  const dir = path.join(BIB, carpeta); fs.mkdirSync(dir, { recursive: true });
  const rutas = {}, fallos = []; let bajados = 0, i = 0; const pend = [...new Set(ids)];
  await Promise.all(Array.from({ length: Math.min(3, pend.length) }, async () => {
    while (i < pend.length) {
      const id = pend[i++], ruta = rutaClip(carpeta, id);
      try {
        if (!fs.existsSync(ruta)) { if (/^loc_/.test(id)) throw new Error('no es de Drive y falta el archivo'); log(`bajando de Drive: ${id}`); await drive.descargarVideo(id, dir); bajados++; }
        else { const t = new Date(); try { fs.utimesSync(ruta, t, t); } catch {} } // se usó ahora: el reloj de las 48 h arranca de nuevo
        rutas[id] = ruta;
      } catch (e) { fallos.push({ id, error: String(e.message).slice(0, 120) }); }
    }
  }));
  return { rutas, bajados, fallos };
}

// Borra del disco los videos de Drive de una carpeta (el índice se queda). Devuelve { borrados, bytes }.
function purgar(carpeta) {
  if (!carpetaOk(carpeta)) throw new Error('carpeta inválida');
  const dir = path.join(BIB, carpeta); let borrados = 0, bytes = 0;
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (esDeDrive(f)) { const p = path.join(dir, f); try { bytes += fs.statSync(p).size; fs.unlinkSync(p); borrados++; } catch {} }
  return { borrados, bytes };
}

// Borra los videos de Drive con más de `ttlHoras` sin usarse, salvo en carpetas recurrentes.
function limpiarCaducados({ ttlHoras = TTL_HORAS, ahora = Date.now() } = {}) {
  const keep = new Set(recurrentes()); let borrados = 0, bytes = 0;
  if (!fs.existsSync(BIB)) return { borrados, bytes };
  for (const e of fs.readdirSync(BIB, { withFileTypes: true })) {
    if (!e.isDirectory() || keep.has(e.name)) continue;
    const dir = path.join(BIB, e.name);
    for (const f of fs.readdirSync(dir)) {
      if (!esDeDrive(f)) continue; const p = path.join(dir, f);
      try { const st = fs.statSync(p); if (ahora - Math.max(st.mtimeMs, st.atimeMs) > ttlHoras * 3600e3) { fs.unlinkSync(p); borrados++; bytes += st.size; } } catch {}
    }
  }
  return { borrados, bytes };
}

// Espacio que ocupan los videos de Drive en disco, por carpeta.
function uso() {
  const out = []; if (!fs.existsSync(BIB)) return out;
  for (const e of fs.readdirSync(BIB, { withFileTypes: true })) {
    if (!e.isDirectory()) continue; let n = 0, b = 0;
    for (const f of fs.readdirSync(path.join(BIB, e.name))) if (esDeDrive(f)) { n++; try { b += fs.statSync(path.join(BIB, e.name, f)).size; } catch {} }
    if (n) out.push({ carpeta: e.name, videos: n, bytes: b });
  }
  return out;
}

module.exports = { BIB, TTL_HORAS, rutaClip, esDeDrive, recurrentes, marcarRecurrente, asegurar, purgar, limpiarCaducados, uso };

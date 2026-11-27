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
const TOPE_GB = Number(process.env.CACHE_CLIPS_GB) || 2;   // lo que se conserva por ser recurrente nunca pasa de esto: se borra lo menos usado
const USOS_RECURRENTE = 3, VENTANA_DIAS = 30;
const F_USO = path.join(BIB, 'uso-cache.json');
const esDeDrive = nombre => /^src_(?!loc_).+\.mp4$/i.test(nombre);

const leer = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const rutaClip = (carpeta, id) => path.join(BIB, carpeta, `src_${id}.mp4`);
const carpetaOk = c => /^[\p{L}\p{N}_ .-]+$/u.test(c || '');

function recurrentesManuales() { const l = leer(F_RECURRENTES, []); return Array.isArray(l) ? l : []; }
// Cada vez que el motor baja o reutiliza clips de una carpeta se anota el día. Un artista usado ≥ 3 veces en 30 días es recurrente solo: sus videos se conservan.
function registrarUso(carpeta, ahora = Date.now()) {
  const uso = leer(F_USO, {}), corte = ahora - VENTANA_DIAS * 86400e3, dia = new Date(ahora).toISOString().slice(0, 10);
  const l = (uso[carpeta] || []).filter(d => Date.parse(d) > corte); if (!l.includes(dia)) l.push(dia); uso[carpeta] = l;
  fs.mkdirSync(BIB, { recursive: true }); fs.writeFileSync(F_USO, JSON.stringify(uso, null, 1)); return l.length;
}
function usosRecientes(carpeta, ahora = Date.now()) { const corte = ahora - VENTANA_DIAS * 86400e3; return (leer(F_USO, {})[carpeta] || []).filter(d => Date.parse(d) > corte).length; }
function recurrentes(ahora = Date.now()) {
  const auto = Object.keys(leer(F_USO, {})).filter(c => usosRecientes(c, ahora) >= USOS_RECURRENTE);
  return [...new Set([...recurrentesManuales(), ...auto])].sort();
}
function marcarRecurrente(carpeta, si) {
  if (!carpetaOk(carpeta)) throw new Error('carpeta inválida');
  const s = new Set(recurrentesManuales()); si ? s.add(carpeta) : s.delete(carpeta);
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
  try { registrarUso(carpeta); } catch {}
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
  // Tope de espacio: lo que se conserva por recurrente no puede pasar de TOPE_GB; se borra primero lo menos usado.
  const guardados = [];
  for (const e of fs.readdirSync(BIB, { withFileTypes: true })) { if (!e.isDirectory() || !keep.has(e.name)) continue; for (const f of fs.readdirSync(path.join(BIB, e.name))) if (esDeDrive(f)) { const p = path.join(BIB, e.name, f); try { const st = fs.statSync(p); guardados.push({ p, t: Math.max(st.mtimeMs, st.atimeMs), n: st.size }); } catch {} } }
  let total = guardados.reduce((s, x) => s + x.n, 0);
  for (const x of guardados.sort((a, b) => a.t - b.t)) { if (total <= TOPE_GB * 1e9) break; try { fs.unlinkSync(x.p); total -= x.n; borrados++; bytes += x.n; } catch {} }
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

module.exports = { BIB, TTL_HORAS, TOPE_GB, USOS_RECURRENTE, VENTANA_DIAS, registrarUso, usosRecientes, recurrentesManuales, rutaClip, esDeDrive, recurrentes, marcarRecurrente, asegurar, purgar, limpiarCaducados, uso };

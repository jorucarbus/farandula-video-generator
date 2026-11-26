// Gestor de la biblioteca de clips: una sola vista de TODO lo que sirve para los videos.
//
// Fuentes que une:
//   1) la biblioteca del motor: data-motor/biblioteca/<carpeta>.clips.json (+ .etiquetas.json, .calidad.json, .rostros.json)
//   2) lo que baja el Selector de videos (Python): <SELECTOR_DIR>/Descargas/@usuario, Instagram/@usuario, X/@usuario
//
// Reglas de seguridad: nada se borra de verdad (la "papelera" mueve el archivo a data-motor/papelera/<fecha>/ y se puede restaurar),
// y ninguna ruta que venga del navegador se usa sin comprobar que cae dentro de las carpetas permitidas.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RAIZ = path.join(__dirname, '..');
const DM = process.env.DATA_MOTOR_DIR || path.join(RAIZ, 'data-motor');
const BIB = path.join(DM, 'biblioteca');
const PAPELERA = path.join(DM, 'papelera');
const MANIFIESTO = path.join(PAPELERA, 'manifiesto.json');
const SELECTOR_DIR = process.env.SELECTOR_DIR || path.join(RAIZ, '..', 'selector-videos');
const EXT_VIDEO = /\.(mp4|mov|m4v|webm|mkv)$/i;

const clipsDrive = require('../edl/clipsDrive');
const leer = (f, def) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return def; } };
const escribir = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 1)); };
const idDe = ruta => 'loc_' + crypto.createHash('sha1').update(path.resolve(ruta).toLowerCase()).digest('hex').slice(0, 16);

// Una ruta es "permitida" si está dentro de la biblioteca, de las descargas del Selector o de la papelera.
function rutaPermitida(ruta, raices = [BIB, path.join(SELECTOR_DIR, 'Descargas'), PAPELERA, path.join(DM, 'renders')]) {
  const r = path.resolve(String(ruta || ''));
  return raices.some(b => { const x = path.resolve(b) + path.sep; return (r + path.sep).toLowerCase().startsWith(x.toLowerCase()) && r.length > x.length - 1; });
}

function carpetasBiblioteca() {
  if (!fs.existsSync(BIB)) return [];
  return fs.readdirSync(BIB).filter(f => f.endsWith('.clips.json')).map(f => f.replace(/\.clips\.json$/, '')).sort();
}

// Descargas del Selector: cada carpeta @usuario (TikTok), Instagram/@usuario, X/@usuario.
function carpetasSelector() {
  const base = path.join(SELECTOR_DIR, 'Descargas'), out = [];
  if (!fs.existsSync(base)) return out;
  const ls = d => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).filter(e => e.isDirectory()) : []);
  for (const e of ls(base)) if (e.name.startsWith('@')) out.push({ nombre: e.name, red: 'TikTok', dir: path.join(base, e.name) });
  for (const red of ['Instagram', 'X']) for (const e of ls(path.join(base, red))) if (e.name.startsWith('@')) out.push({ nombre: `${red}/${e.name}`, red, dir: path.join(base, red, e.name) });
  return out;
}

const videosDe = dir => (fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => EXT_VIDEO.test(f)).map(f => path.join(dir, f)) : []);

// Fecha del nombre de archivo del Selector: 20260315_<id>_<titulo>.mp4
function fechaDeArchivo(nombre) {
  const m = String(nombre).match(/^(\d{4})(\d{2})(\d{2})_/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function resumenCarpetas() {
  const lib = carpetasBiblioteca().map(c => {
    const clips = leer(path.join(BIB, `${c}.clips.json`), []), et = leer(path.join(BIB, `${c}.etiquetas.json`), {}), cal = leer(path.join(BIB, `${c}.calidad.json`), {});
    const medidos = clips.filter(x => cal[x.id]).length, malos = clips.filter(x => cal[x.id] && cal[x.id].apto === false).length;
    return { tipo: 'biblioteca', nombre: c, clips: clips.length, etiquetados: clips.filter(x => et[x.id]).length, medidos, malos, enCache: clips.filter(x => x.ruta && fs.existsSync(x.ruta)).length, recurrente: clipsDrive.recurrentes().includes(c) };
  });
  const sel = carpetasSelector().map(c => ({ tipo: 'selector', nombre: c.nombre, red: c.red, clips: videosDe(c.dir).length }));
  return { biblioteca: lib, selector: sel, selectorDir: SELECTOR_DIR, selectorExiste: fs.existsSync(SELECTOR_DIR) };
}

// Clips de una carpeta de la biblioteca con todo lo que se sabe de cada uno.
function clipsDeBiblioteca(carpeta) {
  if (!carpetasBiblioteca().includes(carpeta)) throw new Error('carpeta desconocida');
  const clips = leer(path.join(BIB, `${carpeta}.clips.json`), []), et = leer(path.join(BIB, `${carpeta}.etiquetas.json`), {}), cal = leer(path.join(BIB, `${carpeta}.calidad.json`), {}), ros = leer(path.join(BIB, `${carpeta}.rostros.json`), {});
  return clips.map(c => {
    const t = et[c.id] || null, q = cal[c.id] || null, r = ros[c.id];
    const conRostro = r && r.cuadros && r.cuadros.length ? r.cuadros.filter(x => (x.caras || []).length).length / r.cuadros.length : null;
    const existe = Boolean(c.ruta && fs.existsSync(c.ruta)), mini = path.join(BIB, `${carpeta}.minis`, `${c.id}.jpg`);
    return { id: c.id, nombre: c.name, ruta: c.ruta, existe, soloDrive: !existe && !/^loc_/.test(c.id), mini: fs.existsSync(mini) ? `/mini?carpeta=${encodeURIComponent(carpeta)}&id=${encodeURIComponent(c.id)}` : null, fecha: c.fecha || (t && t.fecha) || fechaDeArchivo(c.name), duracion: c.duracion || (t && t.duracion) || null,
      etiqueta: t, editada: Boolean(t && t.editado), tipo: t ? t.tipo : null, descripcion: t ? t.descripcion : null, personas: t ? t.personas : null, textoEnPantalla: t ? t.texto_en_pantalla : null,
      calidad: q ? { puntaje: q.puntaje, apto: q.apto, motivos: q.motivos || [], avisos: q.avisos || [], ancho: q.ancho, alto: q.alto } : null,
      fraccionRostro: conRostro == null ? null : +conRostro.toFixed(2) };
  });
}

function clipsDeSelector(nombre) {
  const c = carpetasSelector().find(x => x.nombre === nombre); if (!c) throw new Error('carpeta desconocida');
  return videosDe(c.dir).map(ruta => ({ id: idDe(ruta), nombre: path.basename(ruta), ruta, existe: true, fecha: fechaDeArchivo(path.basename(ruta)), duracion: null, tipo: null, descripcion: null, calidad: null, fraccionRostro: null, sinImportar: true }));
}

// ---- papelera: mover, nunca borrar; con manifiesto para restaurar
function aPapelera(rutas, { motivo = 'manual' } = {}) {
  const dia = new Date().toISOString().slice(0, 10), dir = path.join(PAPELERA, dia), man = leer(MANIFIESTO, []), hechos = [], fallos = [];
  for (const ruta of rutas) {
    try {
      if (!rutaPermitida(ruta, [BIB, path.join(SELECTOR_DIR, 'Descargas')])) throw new Error('ruta fuera de las carpetas permitidas');
      if (!fs.existsSync(ruta)) throw new Error('no existe');
      fs.mkdirSync(dir, { recursive: true });
      let destino = path.join(dir, path.basename(ruta)); for (let n = 1; fs.existsSync(destino); n++) destino = path.join(dir, `${n}_${path.basename(ruta)}`);
      try { fs.renameSync(ruta, destino); } catch { fs.copyFileSync(ruta, destino); fs.unlinkSync(ruta); } // otro disco: copiar y quitar
      const reg = { origen: path.resolve(ruta), papelera: destino, fecha: new Date().toISOString(), motivo }; man.push(reg); hechos.push(reg);
    } catch (e) { fallos.push({ ruta, error: e.message }); }
  }
  if (hechos.length) escribir(MANIFIESTO, man);
  return { hechos, fallos };
}

function enPapelera() { return leer(MANIFIESTO, []).filter(r => fs.existsSync(r.papelera)); }

function restaurar(rutasPapelera) {
  const man = leer(MANIFIESTO, []), hechos = [], fallos = [];
  for (const p of rutasPapelera) {
    const reg = man.find(r => r.papelera === p);
    try {
      if (!reg) throw new Error('no está en el manifiesto');
      if (fs.existsSync(reg.origen)) throw new Error('ya existe un archivo en el lugar de origen');
      fs.mkdirSync(path.dirname(reg.origen), { recursive: true }); fs.renameSync(reg.papelera, reg.origen); hechos.push(reg);
    } catch (e) { fallos.push({ ruta: p, error: e.message }); }
  }
  escribir(MANIFIESTO, man.filter(r => !hechos.includes(r)));
  return { hechos, fallos };
}

// Quita de la carpeta (clips.json) los clips cuyo archivo ya no está, para que el motor no los elija. Guarda copia del json anterior.
function limpiarFaltantes(carpeta) {
  const f = path.join(BIB, `${carpeta}.clips.json`), clips = leer(f, []), vivos = clips.filter(c => (c.ruta && fs.existsSync(c.ruta)) || !/^loc_/.test(c.id)); // lo que está en Drive no se quita aunque su archivo no esté en disco
  if (vivos.length === clips.length) return { quitados: 0 };
  fs.copyFileSync(f, f + '.bak'); escribir(f, vivos);
  return { quitados: clips.length - vivos.length };
}

// ---- importar descargas del Selector a una carpeta de la biblioteca (copia el archivo; el Selector sigue recordando lo bajado)
function importarDeSelector(rutas, carpeta, { mover = false } = {}) {
  if (!/^[\w .-]+$/.test(carpeta || '')) throw new Error('nombre de carpeta inválido');
  const destDir = path.join(BIB, carpeta), fClips = path.join(BIB, `${carpeta}.clips.json`), clips = leer(fClips, []), ya = new Set(clips.map(c => c.ruta)), hechos = [], fallos = [];
  fs.mkdirSync(destDir, { recursive: true });
  for (const ruta of rutas) {
    try {
      if (!rutaPermitida(ruta, [path.join(SELECTOR_DIR, 'Descargas')])) throw new Error('ruta fuera de las descargas del Selector');
      if (!fs.existsSync(ruta)) throw new Error('no existe');
      const nombre = path.basename(ruta), id = idDe(ruta), destino = path.join(destDir, `src_${id}${path.extname(nombre).toLowerCase()}`);
      if (ya.has(destino)) throw new Error('ya está importado');
      if (mover) { try { fs.renameSync(ruta, destino); } catch { fs.copyFileSync(ruta, destino); fs.unlinkSync(ruta); } } else fs.copyFileSync(ruta, destino);
      clips.push({ id, name: nombre, ruta: destino, duracion: null, fecha: fechaDeArchivo(nombre) }); hechos.push({ id, nombre });
    } catch (e) { fallos.push({ ruta, error: e.message }); }
  }
  if (hechos.length) escribir(fClips, clips);
  return { hechos, fallos };
}

module.exports = { RAIZ, DM, BIB, PAPELERA, SELECTOR_DIR, rutaPermitida, carpetasBiblioteca, carpetasSelector, resumenCarpetas, clipsDeBiblioteca, clipsDeSelector, aPapelera, enPapelera, restaurar, limpiarFaltantes, importarDeSelector, fechaDeArchivo, idDe };

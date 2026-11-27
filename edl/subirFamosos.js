// SUBIR A DRIVE lo que baja el Selector: cada video va a la carpeta de su artista dentro de la carpeta de famosos de Drive.
//  - Si el artista YA tiene carpeta (aunque se escriba distinto: "Conny Garces", "conny-garces", "Conny_Garcés"), se usa esa: es una actualización.
//  - Si NO tiene, se crea una carpeta nueva con el nombre dado (es un artista nuevo).
//  - Un video que ya está en esa carpeta (mismo nombre de archivo) no se vuelve a subir. Nunca borra nada en Drive ni, salvo que se pida, en el Selector.
const fs = require('fs'), path = require('path');
const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const MIME = { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.m4v': 'video/mp4' };
// Las carpetas del proyecto son ASCII (Nombre_Apellido): se quitan tildes y se cambian los espacios por guion bajo.
const nombreDeCarpeta = t => String(t || '').trim().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_');

// ¿Cuál es la carpeta de Drive de este artista? { id, nombre, nueva:false } si existe; null si hay que crearla. Varias que normalizan igual → error (que el usuario elija).
function buscarExistente(carpeta, mapa) {
  const n = norm(carpeta); if (!n) return null;
  const ok = Object.entries(mapa).filter(([nombre]) => norm(nombre) === n);
  if (ok.length > 1) throw new Error(`Hay ${ok.length} carpetas en Drive que se parecen a "${carpeta}" (${ok.map(x => x[0]).join(', ')}): elige una exacta`);
  return ok.length ? { id: ok[0][1], nombre: ok[0][0], nueva: false } : null;
}

// rutas: archivos locales ya validados; drive: { obtenerCarpetasFamosos, listarVideos, crearCarpetaFamoso, subirVideo } (inyectable para pruebas).
async function subirAFamosos({ carpeta, rutas, drive, log = () => {}, borrarLocal = false, registro = null }) {
  const nombre = nombreDeCarpeta(carpeta); if (!/^[\w.-]{2,60}$/.test(nombre)) throw new Error('nombre de carpeta inválido (usa letras, números, guion o guion bajo)');
  const mapa = await drive.obtenerCarpetasFamosos();
  let dest = buscarExistente(nombre, mapa);
  if (dest) log(`Carpeta existente en Drive: ${dest.nombre} (se agregan los videos nuevos)`);
  else { const id = await drive.crearCarpetaFamoso(nombre); dest = { id, nombre, nueva: true }; log(`Artista nuevo: se creó la carpeta ${nombre} en Drive`); }
  const enDrive = new Set((dest.nueva ? [] : await drive.listarVideos(dest.id)).map(v => v.name));
  const subidos = [], saltados = [], fallos = [], prev = registro ? registro.leer() : {};
  for (const ruta of rutas) {
    const nom = path.basename(ruta);
    try {
      if (!fs.existsSync(ruta)) throw new Error('no existe');
      const mime = MIME[path.extname(ruta).toLowerCase()]; if (!mime) throw new Error('no es un video');
      if (enDrive.has(nom) || (prev[ruta] && prev[ruta].carpetaId === dest.id)) { saltados.push(nom); log(`  ya estaba: ${nom}`); continue; }
      const r = await drive.subirVideo(ruta, nom, dest.id, mime); enDrive.add(nom); subidos.push({ nombre: nom, id: r.id });
      if (registro) registro.anotar(ruta, { carpetaId: dest.id, carpeta: dest.nombre, driveId: r.id, fecha: new Date().toISOString() });
      log(`  subido ${subidos.length}: ${nom}`);
      if (borrarLocal) { try { fs.unlinkSync(ruta); } catch { /* si no se puede borrar, queda */ } }
    } catch (e) { fallos.push({ nombre: nom, error: String(e.message).slice(0, 120) }); log(`  FALLÓ ${nom}: ${String(e.message).slice(0, 120)}`); }
  }
  return { carpeta: dest.nombre, carpetaId: dest.id, nueva: dest.nueva, subidos, saltados, fallos };
}

module.exports = { subirAFamosos, buscarExistente, nombreDeCarpeta, norm };

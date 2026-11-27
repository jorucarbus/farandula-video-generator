// Sube un video terminado a Drive: carpeta "para publicar" → subcarpeta de SU canal. El video va suelto (sin subcarpeta) y su portada JPG al lado con el MISMO nombre base,
// que es la convención de la app de farándula (el publicador empareja .mp4 y .jpg por nombre).
// Uso: node scripts/publicar-en-drive.js <nombre> --canal "<canal>" [--forzar]     (lee data-motor/renders/<nombre>.mp4 y data-motor/noticias/<nombre>/guion.json)
// Deja data-motor/renders/<nombre>.drive.json con los ids; si ya existe, no vuelve a subir (salvo --forzar). Nunca borra nada.
require('dotenv').config({ quiet: true });
const fs = require('fs'), path = require('path');
const RAIZ = path.join(__dirname, '..'), DM = path.join(RAIZ, 'data-motor');
const PUBLICAR_ID = process.env.GOOGLE_DRIVE_PUBLICAR_FOLDER_ID || '1Zni4Algee1RJTO7qt7BvGV7TwJfTZt1t'; // carpeta "para publicar" (una subcarpeta por canal)
const normCanal = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const nombreSeguro = t => String(t || 'video').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 100);

// Subcarpeta del canal dentro de "para publicar" (por nombre normalizado). `cliente` es el Drive de googleapis.
async function carpetaDelCanal(cliente, canal, padre = PUBLICAR_ID) {
  const r = await cliente.files.list({ q: `'${padre}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`, fields: 'files(id,name)', pageSize: 200, includeItemsFromAllDrives: true, supportsAllDrives: true });
  const c = (r.data.files || []).find(f => normCanal(f.name) === normCanal(canal));
  return c || null;
}

async function publicar(nombre, canal, { forzar = false, log = console.log, cliente = null, subir = null } = {}) {
  const mp4 = path.join(DM, 'renders', `${nombre}.mp4`), marca = path.join(DM, 'renders', `${nombre}.drive.json`);
  if (!fs.existsSync(mp4)) throw new Error('no existe el video: ' + mp4);
  if (fs.existsSync(marca) && !forzar) { log('Ya estaba en Drive:', JSON.parse(fs.readFileSync(marca, 'utf8')).nombreArchivo); return JSON.parse(fs.readFileSync(marca, 'utf8')); }
  const drive = require('../drive'); cliente = cliente || drive.getDriveOAuth() || drive.getDrive(); subir = subir || drive.subirVideo;
  const carpeta = await carpetaDelCanal(cliente, canal);
  if (!carpeta) throw new Error(`no encuentro la subcarpeta de "${canal}" dentro de "para publicar"`);
  let g = {}; try { g = JSON.parse(fs.readFileSync(path.join(DM, 'noticias', nombre, 'guion.json'), 'utf8')); } catch { /* sin guion: nombre por defecto */ }
  // Nombre como la app vieja: "<fecha> <Protagonista> - <Secundario> - <hecho corto>" (sale de la crónica que ya se leyó: sin llamadas extra)
  const leerJ = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return {}; } }, NA = require('../edl/nombreArchivo');
  const lec = leerJ(path.join(DM, 'noticias', nombre, 'lectura.json')), rj = leerJ(path.join(DM, 'noticias', nombre, 'render.json'));
  const base = nombreSeguro(NA.nombreCompleto(nombre, lec.cronica && (lec.cronica.protagonista || lec.cronica.accion) ? lec.cronica : { titulo: g.titulo || nombre }, { carpeta: rj.carpeta }));
  log(`Subiendo a "para publicar/${carpeta.name}": ${base}.mp4`);
  const v = await subir(mp4, `${base}.mp4`, carpeta.id);
  let portadaId = null; const jpg = path.join(DM, 'renders', `${nombre}.portada.jpg`);
  if (fs.existsSync(jpg)) { try { portadaId = (await subir(jpg, `${base}.jpg`, carpeta.id, 'image/jpeg')).id; } catch (e) { log('  la portada no subió: ' + String(e.message).slice(0, 100)); } }
  const out = { nombreArchivo: `${base}.mp4`, driveId: v.id, link: v.webViewLink || null, portadaId, carpeta: carpeta.name, carpetaId: carpeta.id, subido: new Date().toISOString() };
  fs.writeFileSync(marca, JSON.stringify(out, null, 2)); log('Listo en Drive:', out.link || out.driveId);
  return out;
}

module.exports = { publicar, carpetaDelCanal, nombreSeguro, normCanal };

if (require.main === module) {
  const a = process.argv.slice(2), nombre = a.find(x => !x.startsWith('--')), i = a.indexOf('--canal'), canal = i >= 0 ? a[i + 1] : '';
  if (!nombre || !canal) { console.error('Uso: publicar-en-drive.js <nombre> --canal "<canal>" [--forzar]'); process.exit(1); }
  publicar(nombre, canal, { forzar: a.includes('--forzar') }).catch(e => { console.error('FALLO', e.message); process.exit(1); });
}

// Bloque D: respaldo/restauración en Drive de archivos de estado (historial.json, data/jobs.json).
// Railway usa filesystem efímero: cada redeploy los borra. Esta subcarpeta ("cache-estado", dentro
// de Redes_Canales) guarda una copia para que la rotación de clips y los jobs en progreso sobrevivan
// un restart. OJO: Redes_Canales (1irTudEARQWOrJr3y911Hwl_1VbvQqNP5) es la raíz compartida con
// renders/audios/recursos — NO subir aquí directo, usar siempre la subcarpeta dedicada.
const fs = require('fs');
const path = require('path');
const { getDrive, getDriveOAuth } = require('./drive');

const CACHE_FOLDER_ID = process.env.GOOGLE_DRIVE_CACHE_FOLDER_ID || '1s0OXuermFR4_DbNZP3gWFYDAV1xvf5ct';

function cliente() {
  return getDriveOAuth() || getDrive();
}

async function buscarArchivo(nombre) {
  const res = await cliente().files.list({
    q: `'${CACHE_FOLDER_ID}' in parents and name='${nombre}' and trashed=false`,
    fields: 'files(id, name)',
    pageSize: 1,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });
  return res.data.files[0] || null;
}

// Al arrancar: si el archivo local no existe (o está vacío), lo trae de la carpeta caché.
// Nunca pisa un archivo local que ya tenga contenido (evita perder progreso reciente).
async function restaurar(localPath, nombreDrive) {
  try {
    if (fs.existsSync(localPath) && fs.statSync(localPath).size > 0) return false;
    const archivo = await buscarArchivo(nombreDrive);
    if (!archivo) {
      console.log(`ℹ️ ${nombreDrive} no existe todavía en la carpeta caché de Drive (nada que restaurar)`);
      return false;
    }

    const res = await cliente().files.get(
      { fileId: archivo.id, alt: 'media', supportsAllDrives: true },
      { responseType: 'stream' }
    );
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(localPath);
      res.data.pipe(out);
      out.on('finish', resolve);
      out.on('error', reject);
    });
    console.log(`♻️  Restaurado desde Drive: ${nombreDrive}`);
    return true;
  } catch (e) {
    console.warn(`⚠️ No se pudo restaurar ${nombreDrive} desde Drive: ${e.message}`);
    return false;
  }
}

// Respalda (crea o actualiza) un archivo local en la carpeta caché de Drive.
// Fire-and-forget: nunca debe tumbar el flujo principal si Drive falla.
async function respaldar(localPath, nombreDrive) {
  try {
    if (!fs.existsSync(localPath)) return;
    const media = { mimeType: 'application/json', body: fs.createReadStream(localPath) };
    const archivo = await buscarArchivo(nombreDrive);
    if (archivo) {
      await cliente().files.update({ fileId: archivo.id, media, supportsAllDrives: true });
    } else {
      await cliente().files.create({
        requestBody: { name: nombreDrive, parents: [CACHE_FOLDER_ID] },
        media,
        fields: 'id',
        supportsAllDrives: true,
      });
    }
  } catch (e) {
    console.warn(`⚠️ No se pudo respaldar ${nombreDrive} en Drive: ${e.message}`);
  }
}

module.exports = { restaurar, respaldar, CACHE_FOLDER_ID };

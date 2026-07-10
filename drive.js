const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

let drive;

function getDrive() {
  if (!drive) {
    const auth = new google.auth.GoogleAuth({
      keyFile: path.join(__dirname, 'credentials.json'),
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    drive = google.drive({ version: 'v3', auth });
  }
  return drive;
}

// Buscar las carpetas de famosos (hijas de la carpeta principal) por nombre
async function obtenerCarpetasFamosos() {
  const res = await getDrive().files.list({
    q: `'${process.env.GOOGLE_DRIVE_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
    pageSize: 1000,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });
  const mapa = {};
  for (const f of res.data.files) mapa[f.name] = f.id;
  return mapa;
}

// Listar videos dentro de una carpeta
async function listarVideos(folderId) {
  const res = await getDrive().files.list({
    q: `'${folderId}' in parents and trashed=false and (mimeType contains 'video/')`,
    fields: 'files(id, name)',
    pageSize: 1000,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });
  return res.data.files;
}

// Descargar un archivo de Drive a una ruta local (con caché por fileId)
async function descargarVideo(fileId, destDir) {
  const destPath = path.join(destDir, `src_${fileId}.mp4`);
  if (fs.existsSync(destPath)) return destPath; // caché

  const res = await getDrive().files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' }
  );

  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(destPath);
    res.data.pipe(out);
    out.on('finish', resolve);
    out.on('error', reject);
  });

  return destPath;
}

// Subir el video final a la carpeta de destino
async function subirVideo(localPath, fileName, destFolderId) {
  const res = await getDrive().files.create({
    requestBody: {
      name: fileName,
      parents: [destFolderId],
    },
    media: {
      mimeType: 'video/mp4',
      body: fs.createReadStream(localPath),
    },
    fields: 'id, name, webViewLink',
    supportsAllDrives: true,
  });
  return res.data;
}

// Obtener nombre de una carpeta por su ID
async function nombreCarpeta(folderId) {
  const res = await getDrive().files.get({
    fileId: folderId,
    fields: 'name',
    supportsAllDrives: true,
  });
  return res.data.name;
}

module.exports = {
  obtenerCarpetasFamosos,
  listarVideos,
  descargarVideo,
  subirVideo,
  nombreCarpeta,
};

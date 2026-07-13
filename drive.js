const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

let drive;      // Service Account: lee/descarga clips de famosos
let driveOAuth; // OAuth (cuenta del usuario): sube renders (el Service Account no tiene cuota)

// Cliente Service Account. En Railway no hay credentials.json en disco:
// se acepta la variable GOOGLE_CREDENTIALS_JSON con el contenido del archivo.
function getDrive() {
  if (!drive) {
    const opciones = { scopes: ['https://www.googleapis.com/auth/drive'] };
    if (process.env.GOOGLE_CREDENTIALS_JSON) {
      opciones.credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
    } else {
      opciones.keyFile = path.join(__dirname, 'credentials.json');
    }
    drive = google.drive({ version: 'v3', auth: new google.auth.GoogleAuth(opciones) });
  }
  return drive;
}

// Cliente OAuth con la cuenta del usuario (para subir a su Drive con cuota).
// Requiere GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN.
function getDriveOAuth() {
  if (!hayOAuth()) return null;
  if (!driveOAuth) {
    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    );
    oauth2.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
    driveOAuth = google.drive({ version: 'v3', auth: oauth2 });
  }
  return driveOAuth;
}

function hayOAuth() {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
    process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN
  );
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

// Listar videos dentro de una carpeta (con duración en segundos si Drive ya la procesó)
async function listarVideos(folderId) {
  const res = await getDrive().files.list({
    q: `'${folderId}' in parents and trashed=false and (mimeType contains 'video/')`,
    fields: 'files(id, name, videoMediaMetadata(durationMillis))',
    pageSize: 1000,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });
  return res.data.files.map(f => ({
    id: f.id,
    name: f.name,
    duracion: f.videoMediaMetadata?.durationMillis
      ? Number(f.videoMediaMetadata.durationMillis) / 1000
      : null,
  }));
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

// Subir un archivo a la carpeta de destino. Usa OAuth (cuenta del usuario) si está
// configurado — los Service Accounts no tienen cuota en Drive personal.
async function subirVideo(localPath, fileName, destFolderId, mimeType = 'video/mp4') {
  const cliente = getDriveOAuth() || getDrive();
  const res = await cliente.files.create({
    requestBody: {
      name: fileName,
      parents: [destFolderId],
    },
    media: {
      mimeType,
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
  hayOAuth,
};

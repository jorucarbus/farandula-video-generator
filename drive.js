const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');

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

// Descargar un archivo de Drive a una ruta local (con caché por fileId).
// Descarga a un archivo temporal único y renombra al final: así `existsSync(destPath)`
// nunca ve un archivo a medio escribir. Sin esto, dos jobs concurrentes pidiendo el mismo
// clip (caché compartido a propósito) podían chocar: el segundo veía el archivo "ya existe"
// mientras el primero todavía lo estaba descargando, y ffmpeg leía un mp4 truncado
// ("Nothing was written into output file... received no packets", crash -22).
async function descargarVideo(fileId, destDir) {
  const destPath = path.join(destDir, `src_${fileId}.mp4`);
  if (fs.existsSync(destPath)) return destPath; // caché

  const tmpPath = path.join(destDir, `.tmp-src_${fileId}-${process.pid}-${crypto.randomBytes(4).toString('hex')}.mp4`);

  const res = await getDrive().files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' }
  );

  try {
    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(tmpPath);
      res.data.pipe(out);
      out.on('finish', resolve);
      out.on('error', reject);
    });
    fs.renameSync(tmpPath, destPath); // atómico: destPath solo aparece completo
  } catch (e) {
    try { fs.unlinkSync(tmpPath); } catch {}
    throw e;
  }

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

// Listar los 4 canales dentro de la carpeta de insumos
async function listarCanales() {
  const res = await getDrive().files.list({
    q: `'${process.env.GOOGLE_DRIVE_INSUMOS_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
    pageSize: 100,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });
  return res.data.files.map(f => ({ id: f.id, name: f.name }));
}

// Crear una carpeta dentro de un canal (para guardar insumos de un job)
async function crearCarpetaInsumo(canalId, nombreCarpeta) {
  const res = await getDrive().files.create({
    requestBody: {
      name: nombreCarpeta,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [canalId],
    },
    fields: 'id, name',
    supportsAllDrives: true,
  });
  return res.data.id;
}

// Guardar un archivo en una carpeta de insumo (texto, JSON, audio MP3, etc.)
async function guardarEnInsumo(carpetaId, nombreArchivo, contenido) {
  const cliente = getDriveOAuth() || getDrive();

  const buffer = Buffer.isBuffer(contenido)
    ? contenido
    : Buffer.from(typeof contenido === 'string' ? contenido : JSON.stringify(contenido));

  const mimeType = nombreArchivo.endsWith('.mp3') ? 'audio/mpeg' : 'application/octet-stream';

  const res = await cliente.files.create({
    requestBody: {
      name: nombreArchivo,
      parents: [carpetaId],
    },
    media: {
      mimeType,
      // media.body debe ser un stream: googleapis-common hace part.body.pipe() internamente
      // en el multipart upload — un Buffer crudo revienta con "part.body.pipe is not a function".
      body: Readable.from(buffer),
    },
    fields: 'id, name, webViewLink',
    supportsAllDrives: true,
  });
  return res.data;
}

// Leer un archivo desde una carpeta de insumo
async function leerDeInsumo(carpetaId, nombreArchivo) {
  // Buscar el archivo por nombre dentro de la carpeta
  const res = await getDrive().files.list({
    q: `'${carpetaId}' in parents and name='${nombreArchivo.replace(/'/g, "\\'")}' and trashed=false`,
    fields: 'files(id)',
    pageSize: 1,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });

  if (!res.data.files.length) return null;

  const fileId = res.data.files[0].id;
  const contenido = await getDrive().files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' }
  );

  // Convertir stream a buffer/string
  return new Promise((resolve, reject) => {
    let data = [];
    contenido.data.on('data', chunk => data.push(chunk));
    contenido.data.on('end', () => {
      const buffer = Buffer.concat(data);
      // Si es JSON o texto, decodificar
      const texto = buffer.toString('utf-8');
      try {
        resolve(JSON.parse(texto)); // intenta JSON primero
      } catch {
        resolve(texto); // sino, devuelve como string
      }
    });
    contenido.data.on('error', reject);
  });
}

// Descargar un archivo BINARIO (ej. audio.mp3) de una carpeta de insumo a disco local.
// A diferencia de leerDeInsumo (que decodifica a texto/JSON y corrompería un mp3), esto
// escribe el stream crudo a destPath. Devuelve destPath, o null si el archivo no existe.
async function descargarDeInsumo(carpetaId, nombreArchivo, destPath) {
  const res = await getDrive().files.list({
    q: `'${carpetaId}' in parents and name='${nombreArchivo.replace(/'/g, "\\'")}' and trashed=false`,
    fields: 'files(id)',
    pageSize: 1,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });
  if (!res.data.files.length) return null;

  const fileId = res.data.files[0].id;
  const resp = await getDrive().files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' }
  );

  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(destPath);
    resp.data.pipe(out);
    out.on('finish', resolve);
    out.on('error', reject);
  });

  return destPath;
}

module.exports = {
  obtenerCarpetasFamosos,
  listarVideos,
  descargarVideo,
  subirVideo,
  nombreCarpeta,
  hayOAuth,
  getDrive,
  getDriveOAuth,
  listarCanales,
  crearCarpetaInsumo,
  guardarEnInsumo,
  descargarDeInsumo,
  leerDeInsumo,
};

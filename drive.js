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

// Fase 8b (música por sentido): carpeta Musica/ con 7 subcarpetas, una por tono (ver
// gemini.js TONOS). Mismo patrón que obtenerCarpetasFamosos(), pero con OAuth preferido
// (mismo criterio que driveCache.js) — esta carpeta todavía no está compartida con el
// Service Account, solo con la cuenta OAuth del usuario. Si algún día se comparte también con
// el Service Account, esto sigue funcionando igual (OAuth gana si está configurado).
const MUSICA_FOLDER_ID = process.env.GOOGLE_DRIVE_MUSICA_FOLDER_ID || '1TzmDHv-L-fwqpOuAK6CcdJUlJNkPz33Z';

async function obtenerCarpetasMusica() {
  const cliente = getDriveOAuth() || getDrive();
  const res = await cliente.files.list({
    q: `'${MUSICA_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
    pageSize: 100,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });
  const mapa = {};
  for (const f of res.data.files) mapa[f.name] = f.id;
  return mapa;
}

// Listar pistas de audio dentro de una carpeta de música (mp3/wav/etc.)
async function listarMusica(folderId) {
  const cliente = getDriveOAuth() || getDrive();
  const res = await cliente.files.list({
    q: `'${folderId}' in parents and trashed=false and mimeType contains 'audio/'`,
    fields: 'files(id, name)',
    pageSize: 200,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });
  return res.data.files.map(f => ({ id: f.id, name: f.name }));
}

// Descarga una pista de música al disco local (caché por fileId, descarga atómica — mismo
// patrón que descargarVideo(): si dos jobs concurrentes piden la misma pista, ninguno la ve a
// medio escribir).
async function descargarMusica(fileId, destDir, extension = '.mp3') {
  const destPath = path.join(destDir, `musica_${fileId}${extension}`);
  if (fs.existsSync(destPath)) return destPath;

  const tmpPath = path.join(destDir, `.tmp-musica_${fileId}-${process.pid}-${crypto.randomBytes(4).toString('hex')}${extension}`);
  const cliente = getDriveOAuth() || getDrive();
  const res = await cliente.files.get(
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
    fs.renameSync(tmpPath, destPath);
  } catch (e) {
    try { fs.unlinkSync(tmpPath); } catch {}
    throw e;
  }

  return destPath;
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
// Fallos que vale la pena reintentar: Drive corta con 403 (cuota) o 429 cuando se le piden varios
// archivos a la vez, y con 5xx cuando el que tiene un mal momento es él. Todos pasan solos. Un 404
// —el clip no existe— no se reintenta: sería esperar por algo que nunca va a estar.
const CODIGOS_REINTENTABLES = new Set([403, 429, 500, 502, 503, 504]);
const INTENTOS_DESCARGA = 3;

function vaARendir(e) {
  // Corte a mitad de la transferencia. Va primero porque muchas veces llega como un Error pelado
  // ("socket hang up") sin `code` ni status: mirando solo el código no se reintentaba nunca, y es
  // justo el fallo que un reintento arregla — el archivo quedó incompleto, no hay nada que perder.
  if (e?.corteDeDescarga) return true;
  const codigo = e?.code || e?.response?.status;
  if (CODIGOS_REINTENTABLES.has(Number(codigo))) return true;
  return ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'EPIPE', 'ENOTFOUND'].includes(e?.code);
}

const esperar = ms => new Promise(r => setTimeout(r, ms));

async function descargarVideo(fileId, destDir) {
  const destPath = path.join(destDir, `src_${fileId}.mp4`);
  if (fs.existsSync(destPath)) return destPath; // caché

  let ultimo = null;
  for (let intento = 1; intento <= INTENTOS_DESCARGA; intento++) {
    try {
      return await intentarDescarga(fileId, destDir, destPath);
    } catch (e) {
      ultimo = e;
      if (!vaARendir(e) || intento === INTENTOS_DESCARGA) break;
      // Espera creciente con una pizca de azar: si varias descargas chocan con la cuota a la vez,
      // el jitter evita que vuelvan todas juntas en el mismo instante y la vuelvan a chocar.
      const pausa = Math.round(1000 * Math.pow(2, intento - 1) * (1 + Math.random() * 0.3));
      console.warn(`  ⏳ Descarga de ${fileId} falló (${e.code || e.message}); reintento ${intento + 1}/${INTENTOS_DESCARGA} en ${pausa} ms`);
      await esperar(pausa);
    }
  }
  throw ultimo;
}

async function intentarDescarga(fileId, destDir, destPath) {
  const tmpPath = path.join(destDir, `.tmp-src_${fileId}-${process.pid}-${crypto.randomBytes(4).toString('hex')}.mp4`);

  const res = await getDrive().files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' }
  );

  try {
    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(tmpPath);
      // El stream de ENTRADA también puede fallar (conexión cortada, corte de Drive a mitad del
      // archivo). Sin este listener ese error no lo escuchaba nadie: 'finish' nunca llegaba y la
      // promesa quedaba colgada para siempre, con el render clavado detrás.
      const cortado = (e) => {
        e.corteDeDescarga = true;   // pasó con la transferencia ya empezada: siempre vale reintentar
        reject(e);
      };
      res.data.on('error', cortado);
      out.on('error', cortado);
      out.on('finish', resolve);
      res.data.pipe(out);
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
//
// Crash real de producción (2026-08-18, encontrado por un screenshot del usuario con 502
// repetidos): si `localPath` ya no existe cuando esto corre (ej. la portada se generó pero el
// archivo se limpió — por TTL o por la política de "conservar solo las 3 más recientes" del Map
// en server.js — antes de que esta subida lo leyera), `fs.createReadStream` no lanza: crea el
// stream igual y emite el ENOENT como evento 'error' ASÍNCRONO cuando intenta abrir el archivo.
// `googleapis` no le pone un listener de error a un stream que el LLAMADOR le pasa, así que ese
// evento queda sin nadie escuchando — y un 'error' sin listener en Node no se ignora: tira todo
// el proceso abajo. No solo rompía ESTE request: tumbaba el servidor entero, cortando a todos los
// usuarios con requests en vuelo (los 502 seguidos que vio el usuario son exactamente el
// contenedor reiniciándose dos veces). El try/catch que ya rodea esta llamada en server.js nunca
// llegaba a ejecutarse: un throw asíncrono sin listener no es lo mismo que una promesa rechazada.
// Fix: engancharle un listener de error al stream ANTES de dárselo a googleapis, y correr la
// subida contra ESE error en carrera — así un stream roto rechaza la promesa (el try/catch de
// quien llama sí lo atrapa) en vez de crashear el proceso.
async function subirVideo(localPath, fileName, destFolderId, mimeType = 'video/mp4') {
  const cliente = getDriveOAuth() || getDrive();
  const stream = fs.createReadStream(localPath);
  const errorDeStream = new Promise((_, reject) => stream.once('error', reject));
  const res = await Promise.race([
    cliente.files.create({
      requestBody: {
        name: fileName,
        parents: [destFolderId],
      },
      media: {
        mimeType,
        body: stream,
      },
      fields: 'id, name, webViewLink',
      supportsAllDrives: true,
    }),
    errorDeStream,
  ]);
  return res.data;
}

// Renombrar un archivo existente (Fase 8c: etiquetar pistas de música con su offset de inicio
// directo en el nombre, en vez de un mapeo aparte que se puede desincronizar).
async function renombrarArchivo(fileId, nuevoNombre) {
  const cliente = getDriveOAuth() || getDrive();
  const res = await cliente.files.update({
    fileId,
    requestBody: { name: nuevoNombre },
    fields: 'id, name',
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

// Crear una carpeta dentro de un canal (insumos de un job, o la subcarpeta de un video con su
// portada). OAuth primero: la carpeta de destino de los videos (`destFolder`) necesita OAuth
// para subirVideo() — el Service Account solo no siempre tiene acceso a esa misma carpeta.
async function crearCarpetaInsumo(canalId, nombreCarpeta) {
  const cliente = getDriveOAuth() || getDrive();
  const res = await cliente.files.create({
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

// Listar subcarpetas de una carpeta, con su fecha de creación. Usado por la limpieza
// automática de insumos para decidir cuáles ya pasaron su tiempo de retención.
async function listarSubcarpetas(parentId) {
  const res = await getDrive().files.list({
    q: `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name, createdTime)',
    pageSize: 1000,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });
  return res.data.files;
}

// Carpeta "Citas" del usuario (dentro de Redes_Canales): ahí sube a mano las entrevistas de las
// que después saca los testimonios. La tiene organizada en subcarpetas por fecha y protagonista
// ("2026-08-21 Alejandra Jaramillo"), con archivos sueltos mezclados en la raíz.
const CITAS_FOLDER_ID = process.env.GOOGLE_DRIVE_CITAS_FOLDER_ID || '1oN0GceJughLAvVnRFMpONx785vBKpzwe';

// Lista el contenido de una carpeta para NAVEGARLA: subcarpetas y archivos juntos, en un solo
// pedido, con lo que hace falta para pintar la lista y decidir qué se puede marcar.
//
// Por qué navegar y no un selector fijo: el usuario tiene subcarpetas por fecha/protagonista Y
// archivos sueltos en la raíz. Un desplegable plano no le serviría.
async function listarContenido(folderId) {
  // OAuth preferido, mismo criterio que la música: esta carpeta está compartida con la cuenta del
  // usuario, no con el Service Account — con getDrive() a secas devuelve una lista vacía.
  const res = await (getDriveOAuth() || getDrive()).files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: 'files(id, name, mimeType, size, modifiedTime, videoMediaMetadata(durationMillis))',
    pageSize: 1000,
    orderBy: 'folder,modifiedTime desc',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });
  return (res.data.files || []).map(f => {
    const esCarpeta = f.mimeType === 'application/vnd.google-apps.folder';
    return {
      id: f.id,
      name: f.name,
      esCarpeta,
      mimeType: f.mimeType,
      // `esImagen` decide si se muestra el marcador: en una foto no hay nada que recortar.
      esImagen: f.mimeType?.startsWith('image/') || false,
      esVideo: f.mimeType?.startsWith('video/') || false,
      esAudio: f.mimeType?.startsWith('audio/') || false,
      tamMB: f.size ? Math.round(Number(f.size) / 1048576 * 10) / 10 : null,
      duracion: f.videoMediaMetadata?.durationMillis
        ? Number(f.videoMediaMetadata.durationMillis) / 1000
        : null,
    };
  });
}

// Datos de un archivo suelto (para volver a él sin re-listar la carpeta).
async function infoArchivo(fileId) {
  const res = await (getDriveOAuth() || getDrive()).files.get({
    fileId,
    fields: 'id, name, mimeType, size, parents',
    supportsAllDrives: true,
  });
  return res.data;
}

// Devuelve un stream de un tramo de bytes del archivo, para el puente de reproducción. El
// navegador pide "de tal byte a tal byte" y eso se le pasa a Drive tal cual: así se puede saltar a
// un segundo cualquiera de un video de 50 MB sin bajarlo entero ni guardarlo en el servidor.
async function streamArchivo(fileId, rango = null) {
  const opciones = { responseType: 'stream' };
  if (rango) opciones.headers = { Range: rango };
  const res = await (getDriveOAuth() || getDrive()).files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    opciones
  );
  return res;
}

// Mandar un archivo/carpeta a la PAPELERA de Drive (recuperable ~30 días), nunca borrado
// permanente: si la limpieza automática se equivoca, el usuario puede restaurar.
// Intenta con el Service Account (dueño de las carpetas de insumo) y cae a OAuth si no
// tiene permiso sobre ese ítem en particular.
async function enviarAPapelera(fileId) {
  const cuerpo = { fileId, requestBody: { trashed: true }, supportsAllDrives: true };
  try {
    await getDrive().files.update(cuerpo);
  } catch (e) {
    const oauth = getDriveOAuth();
    if (!oauth) throw e;
    await oauth.files.update(cuerpo);
  }
}

module.exports = {
  obtenerCarpetasFamosos,
  listarContenido, infoArchivo, streamArchivo, CITAS_FOLDER_ID,
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
  listarSubcarpetas,
  enviarAPapelera,
  obtenerCarpetasMusica,
  listarMusica,
  descargarMusica,
  renombrarArchivo,
};

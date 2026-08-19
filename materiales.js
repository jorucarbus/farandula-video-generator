// Upload de "material adicional" por job — entrevista (cita con audio real), foto de apoyo,
// video de apoyo. Primer uso real de `multer` en este repo (estaba en package.json desde el
// commit inicial, nunca conectado).
//
// Los archivos entran a una carpeta plana con nombre aleatorio (multer no tiene garantizado que
// `req.body.jobId` ya esté parseado cuando corre `storage.filename()` en multipart — el body va
// DESPUÉS del archivo en el stream) y se reubican a `materiales/<jobId>/` recién en el handler,
// una vez que `req.body` ya está completo. `limpiarCache()` en server.js debe recorrer esta
// carpeta de forma recursiva (ver fix de EISDIR documentado ahí).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const video = require('./video');

const MATERIALES_DIR = path.join(video.TEMP_DIR, 'materiales');
if (!fs.existsSync(MATERIALES_DIR)) fs.mkdirSync(MATERIALES_DIR, { recursive: true });

// Límites generosos pero no infinitos — evitan que un upload gigante tumbe el disco efímero de
// Railway. La foto es la más chica a propósito (nunca debería pesar como un video).
const LIMITES = {
  entrevista: 300 * 1024 * 1024,
  foto: 15 * 1024 * 1024,
  video: 300 * 1024 * 1024,
};

function nombreAleatorio(mimetype) {
  const ext = { 'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'audio/wav': '.wav', 'audio/x-wav': '.wav',
    'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/webm': '.webm',
    'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[mimetype] || '';
  return `${crypto.randomBytes(8).toString('hex')}${ext}`;
}

function crearUploader(tipo, mimeRegex) {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, MATERIALES_DIR),
    filename: (req, file, cb) => cb(null, nombreAleatorio(file.mimetype)),
  });
  const fileFilter = (req, file, cb) => {
    if (!mimeRegex.test(file.mimetype)) return cb(new Error(`Tipo de archivo no permitido para "${tipo}": ${file.mimetype}`));
    cb(null, true);
  };
  return multer({ storage, limits: { fileSize: LIMITES[tipo] }, fileFilter });
}

const uploadEntrevista = crearUploader('entrevista', /^(audio|video)\//);
const uploadFoto = crearUploader('foto', /^image\/(jpeg|png|webp)$/);
const uploadVideoApoyo = crearUploader('video', /^video\//);

// Mueve el archivo ya subido (carpeta plana, nombre aleatorio) a materiales/<jobId>/ — se llama
// DESPUÉS de que multer terminó de parsear el body completo, así jobId siempre está disponible.
function moverAJob(file, jobId) {
  const destDir = path.join(MATERIALES_DIR, jobId);
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  const destPath = path.join(destDir, path.basename(file.path));
  fs.renameSync(file.path, destPath);
  return destPath;
}

module.exports = { uploadEntrevista, uploadFoto, uploadVideoApoyo, moverAJob, MATERIALES_DIR };

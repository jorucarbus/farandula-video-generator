require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const gemini = require('./gemini');
const elevenlabs = require('./elevenlabs');
const driveHelper = require('./drive');
const video = require('./video');
const fuentes = require('./fuentes');
const sheets = require('./sheets');
const seleccion = require('./seleccion');
const tiempos = require('./tiempos');
const encuadres = require('./encuadres');
const subtitulos = require('./subtitulos');
const musica = require('./musica');
const jobStore = require('./jobStore');
const famosos = require('./famosos');
const driveCache = require('./driveCache');
const limpiezaInsumos = require('./limpiezaInsumos');
const exportar = require('./exportar');
const portada = require('./portada');
const materiales = require('./materiales');
const colaRender = require('./colaRender');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY;

// Middleware
app.use(cors());
// 8mb (el default de express son 100kb): el cartel de portada viaja como PNG en data URL dentro
// del cuerpo de /api/generate-video. Un cartel 1080x1920 casi todo transparente pesa decenas de
// kb, pero el margen evita que un titular largo con letra grande haga fallar el render entero
// con un 413 poco claro.
app.use(express.json({ limit: '8mb' }));
// no-cache en estáticos: el HTML/CSS/JS cambia seguido durante el desarrollo y el
// navegador se quedaba pegado con versiones viejas (parecía que los cambios no aplicaban).
app.use(express.static('public', {
  etag: true,
  setHeaders: (res, ruta) => {
    if (/\.(html|css|js)$/i.test(ruta)) res.setHeader('Cache-Control', 'no-cache');
  },
}));

// Autenticación por API Key
// Rutas públicas: key-prompt/health (bootstrap) y preview (el tag <video> no puede enviar headers;
// se protege con un token aleatorio de un solo uso por render)
const authenticateApiKey = (req, res, next) => {
  if (req.path === '/key-prompt' || req.path === '/health' || req.path.startsWith('/preview/') || req.path.startsWith('/audio/') || req.path.startsWith('/portada-file/') || req.path.startsWith('/cartel/') || req.path.startsWith('/fuente/') || req.path.startsWith('/material-file/') || req.path.startsWith('/cita-stream/')) {
    return next();
  }
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== API_KEY) {
    return res.status(401).json({ error: 'API Key inválida' });
  }
  next();
};

app.use('/api', authenticateApiKey);

// Previews en memoria: token aleatorio -> {path del MP4 renderizado, destino, cartelPath}
const previews = new Map();

// Guarda en disco el PNG del cartel que mandó el navegador (data URL "data:image/png;base64,...").
// Ese archivo es la ÚNICA versión del cartel: se superpone tal cual en el frame 0 del video y,
// después, en el JPG de portada — así los dos salen idénticos entre sí y a la previa, sin que el
// server tenga que redibujar nada. Devuelve null si no vino cartel (el usuario no quiso) o si el
// dato no tiene la forma esperada; el video sale igual, sin cartel.
function guardarCartelPNG(dataUrl, renderId) {
  if (typeof dataUrl !== 'string') return null;
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  if (!m) {
    if (dataUrl.trim()) console.warn(`⚠️ [${renderId}] El cartel recibido no es un PNG en data URL, el video sale sin cartel`);
    return null;
  }
  try {
    const ruta = path.join(video.TEMP_DIR, `cartel_${renderId}.png`);
    fs.writeFileSync(ruta, Buffer.from(m[1], 'base64'));
    return ruta;
  } catch (e) {
    console.warn(`⚠️ [${renderId}] No se pudo guardar el cartel, el video sale sin él: ${e.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Videos gemelos: una misma noticia produce DOS videos, uno por canal hermano (Chismex Picante /
// Supe Lupe, Embajadores del Chisme / La Naple). Comparten fuentes, crónica y material adicional;
// se diferencian en guion, título/descripción, cita, cartel, tomas y música.
//
// Dónde vive cada uno: el video A se queda en los campos de SIEMPRE del job (`script`,
// `fragments`, `audioToken`, …) y el B cuelga de `job.gemela`. Esa asimetría es a propósito: el
// historial, el banner de "continuar donde quedó" y los jobs viejos siguen funcionando sin tocar
// una línea, y solo lo nuevo es nuevo.
function guardarEnVariante(jobId, variante, cambios, comunes = {}) {
  if (variante !== 'B') return jobStore.actualizarJob(jobId, { ...cambios, ...comunes });
  const actual = jobStore.obtenerJob(jobId)?.gemela || {};
  return jobStore.actualizarJob(jobId, { gemela: { ...actual, ...cambios }, ...comunes });
}

// Canales hermanos, por nombre normalizado. Mismo pareo que el mapa GEMELAS del frontend, y por
// la misma razón: los cuatro canales existen con el mismo nombre en "para publicar" y en
// "insumos edición", así que el hermano se resuelve por nombre, no por id.
const CANALES_HERMANOS = {
  chismexpicante: 'supelupe',
  supelupe: 'chismexpicante',
  embajadoresdelchisme: 'lanaple',
  lanaple: 'embajadoresdelchisme',
};
function normalizarCanal(nombre) {
  return (nombre || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}

// Carpeta de insumos donde va el material de una variante. El video A usa la del canal elegido en
// el Paso 1; el B usa una carpeta propia dentro de SU canal hermano — el usuario pidió que los
// insumos queden separados por canal, para abrir la carpeta del canal que va a editar y encontrar
// solo lo suyo. Se crea perezosamente la primera vez que hay algo que guardar del gemelo.
async function carpetaInsumoDeVariante(job, variante) {
  if (!job) return null;
  if (variante !== 'B') return job.carpetaInsumoId || null;
  if (job.gemela?.carpetaInsumoId) return job.gemela.carpetaInsumoId;
  try {
    const canales = await driveHelper.listarCanales();
    const propio = canales.find(c => c.id === job.canalId);
    const objetivo = CANALES_HERMANOS[normalizarCanal(propio?.name)];
    const hermano = objetivo ? canales.find(c => normalizarCanal(c.name) === objetivo) : null;
    if (!hermano) {
      // Sin canal hermano identificable (carpeta renombrada, canal nuevo): el material del gemelo
      // se queda en la carpeta del canal A con sufijo -b. Degrada, no rompe.
      console.warn(`  ⚠️ Sin canal hermano para "${propio?.name}": los insumos del gemelo van junto a los del primero`);
      return job.carpetaInsumoId || null;
    }
    const nombreCarpeta = await driveHelper.nombreCarpeta(job.carpetaInsumoId).catch(() => `gemelo-${job.jobId}`);
    const id = await driveHelper.crearCarpetaInsumo(hermano.id, nombreCarpeta);
    const actual = jobStore.obtenerJob(job.jobId)?.gemela || {};
    jobStore.actualizarJob(job.jobId, { gemela: { ...actual, carpetaInsumoId: id, canalId: hermano.id } });
    console.log(`  📁 Carpeta de insumos del gemelo creada en "${hermano.name}"`);
    return id;
  } catch (e) {
    console.warn(`  ⚠️ No se pudo crear la carpeta de insumos del gemelo (${e.message}), se usa la del primero`);
    return job.carpetaInsumoId || null;
  }
}

// Dónde y con qué nombre se guarda un archivo de insumos de una variante.
// Si el gemelo consiguió carpeta propia (su canal hermano), los archivos se llaman igual que los
// del primero — no hace falta distinguirlos, los separa la carpeta. Solo cuando los dos terminan
// en la misma carpeta (no se pudo identificar el canal hermano) se usa el sufijo `-b`, para que
// el segundo no pise al primero.
async function destinoInsumo(job, variante) {
  const carpetaId = await carpetaInsumoDeVariante(job, variante);
  const compartida = variante === 'B' && carpetaId === job?.carpetaInsumoId;
  return { carpetaId, sufijo: compartida ? '-b' : '' };
}

// ¿Este mp3 lo sigue necesitando alguien? Lo referencia una locución aprobada (el usuario puede
// reintentar el render, o generar el gemelo después) o un render que todavía espera turno.
function audioSigueEnUso(audioPath) {
  if (!audioPath) return false;
  const base = path.basename(audioPath);
  for (const a of audiosPendientes.values()) {
    if (a?.path && path.basename(a.path) === base) return true;
  }
  for (const token of colaRender.audioTokensPendientes()) {
    const a = audiosPendientes.get(token);
    if (a?.path && path.basename(a.path) === base) return true;
  }
  return colaRender.rutasProtegidas().some(r => path.basename(r) === base);
}

// Sesgo contrario, para que los dos canales presenten ángulos opuestos sobre el mismo hecho
// (pedido del usuario, 2026-08-24). `neutral` no tiene opuesto: no hay postura que invertir, así
// que devuelve null y el gemelo se queda con la crónica del primero, como hasta ahora.
function sesgoOpuesto(sesgo) {
  if (sesgo === 'favor') return 'contra';
  if (sesgo === 'contra') return 'favor';
  return null;
}

// Crónica del gemelo con el sesgo dado a partir de las ACTAS ya extraídas del job. Es barata a
// propósito: las actas son sesgo-independientes y quedan cacheadas desde la lectura (ver
// PROMPTS.acta en gemini.js), así que esto NO vuelve a descargar ni releer la fuente original —
// solo re-sintetiza. Devuelve null si algo falta o falla: el llamador cae a la crónica del
// primero y el gemelo sale como antes, nunca se pierde el video por esto.
// Pide los dos encuadres y los guarda en el job. Degrada en silencio: si el modelo falla o los
// hechos no dan para dos ángulos honestos, el job queda sin encuadres y todo sigue como antes.
async function proponerEncuadres(job, fuentesDelJob) {
  try {
    const propuesta = await encuadres.proponerDos(gemini, (fuentesDelJob || []).map(f => f.acta));
    const cuantos = propuesta.encuadres.length;
    if (propuesta.suficiente && cuantos >= 2) {
      console.log(`  🎯 Dos encuadres: "${propuesta.encuadres[0].titulo}" (${propuesta.encuadres[0].marco}) y "${propuesta.encuadres[1].titulo}" (${propuesta.encuadres[1].marco})`);
    } else {
      console.log(`  🎯 El material solo da para ${cuantos} encuadre(s): los gemelos se diferencian como antes`);
    }
    return jobStore.actualizarJob(job.jobId, { encuadres: propuesta });
  } catch (e) {
    console.warn(`  ⚠️ No se pudieron proponer encuadres (${e.message}); los gemelos se diferencian como antes`);
    return job;
  }
}

// Crónica del gemelo con OTRO ENCUADRE, desde las mismas actas. Igual de barata que la de sesgo
// —las actas ya están extraídas y son solo texto— y por la misma razón: no vuelve a tocar la fuente
// original. La diferencia con el sesgo es qué cambia: el sesgo mueve la postura, el encuadre mueve
// de qué habla el video.
async function cronicaConEncuadre(job, encuadre) {
  const actas = (job?.fuentes || []).map(f => f.acta).filter(Boolean);
  if (!actas.length) {
    console.warn('  ⚠️ El job no tiene actas guardadas: el gemelo usa la crónica del primero');
    return null;
  }
  try {
    return await gemini.sintetizarCronica(actas, job.sesgo || 'neutral', encuadres.instruccionPara(encuadre));
  } catch (e) {
    console.warn(`  ⚠️ No se pudo sintetizar la crónica del gemelo con el encuadre "${encuadre.titulo}" (${e.message}), usa la del primero`);
    return null;
  }
}

async function cronicaConSesgo(job, sesgo) {
  const actas = (job?.fuentes || []).map(f => f.acta).filter(Boolean);
  if (!actas.length) {
    console.warn('  ⚠️ El job no tiene actas guardadas: el gemelo usa la crónica del primero');
    return null;
  }
  try {
    return await gemini.sintetizarCronica(actas, sesgo);
  } catch (e) {
    console.warn(`  ⚠️ No se pudo sintetizar la crónica ${sesgo} del gemelo (${e.message}), usa la del primero`);
    return null;
  }
}

// Cuántas descargas de Drive van a la vez. Ni 1 (era esperar la red 30 veces seguidas) ni "todas"
// (comparten el mismo enlace, así que la ganancia se aplana enseguida, y encima Drive corta por
// cuota). Entre 6 y 8 se satura el enlace en la práctica; 6 deja aire para lo demás.
const DESCARGAS_EN_PARALELO = 6;

// Corre `tarea` sobre todos los items, con como mucho `tope` a la vez. Si una falla, se cancela el
// conjunto (Promise.all) — igual que antes, cuando la primera descarga rota abortaba el render.
async function enTandas(items, tope, tarea) {
  if (!items.length) return;
  const pendientes = [...items];
  const obreros = Array.from({ length: Math.min(tope, pendientes.length) }, async () => {
    while (pendientes.length) {
      const item = pendientes.shift();
      await tarea(item);
    }
  });
  await Promise.all(obreros);
}

// Reparto de citas entre gemelos: alternadas por orden de detección (0→A, 1→B, 2→A…). Con una
// sola cita los dos la comparten: es mejor repetir el testimonio real que dejar un video sin él.
function citasDeVariante(materialesAdicionales, variante) {
  const todas = [];
  for (const m of materialesAdicionales || []) {
    if (m.tipo === 'entrevista') for (const c of m.citas || []) todas.push({ materialId: m.id, ...c });
  }
  if (todas.length <= 1) return todas;
  const resto = variante === 'B' ? 1 : 0;
  return todas.filter((_, i) => i % 2 === resto);
}

// Los ítems que puede usar una variante: SUS citas, más TODAS las fotos y videos de apoyo (esos
// ilustran la noticia y no compiten entre sí — los dos videos los quieren).
function itemsDeVariante(materialesAdicionales, variante) {
  const items = gemini.aplanarMateriales(materialesAdicionales);
  const permitidas = new Set(citasDeVariante(materialesAdicionales, variante).map(c => `${c.materialId}:${c.citaId}`));
  return items.filter(it => it.tipo !== 'cita' || permitidas.has(it.id));
}
// ---------------------------------------------------------------------------------------------

// Portadas en memoria: token aleatorio -> ruta del JPG generado (fotograma + titular)
const portadas = new Map();

// Audios pendientes de aprobación: token -> {path, duracion, modelo}
const audiosPendientes = new Map();

// Recuperar el audio.mp3 de un job desde su carpeta de insumos en Drive, a disco local.
// Se usa cuando el Map audiosPendientes se vació (reinicio del server / redeploy de Railway)
// pero el audio ya fue generado y respaldado. Devuelve la ruta local, o null si no hay nada.
// `variante`: el gemelo tiene su locución en la carpeta de SU canal (o con sufijo `-b` en la del
// primero, si no se pudo identificar el canal hermano). Sin esto, recuperar el audio del video B
// tras un reinicio bajaría el del A y el video saldría con la voz equivocada.
async function recuperarAudioDeDrive(job, force = false, variante = 'A') {
  if (!job) return null;
  const carpetaId = variante === 'B'
    ? (job.gemela?.carpetaInsumoId || job.carpetaInsumoId)
    : job.carpetaInsumoId;
  if (!carpetaId) return null;
  const sufijo = (variante === 'B' && carpetaId === job.carpetaInsumoId) ? '-b' : '';
  const destPath = path.join(__dirname, 'temp-videos', `audio_recuperado_${job.jobId}${variante === 'B' ? '_b' : ''}.mp3`);
  // force=true: el usuario reemplazó el audio.mp3 en Drive y quiere re-bajarlo aunque
  // ya haya una copia local cacheada (botón "Recargar audio desde Drive").
  if (fs.existsSync(destPath)) {
    if (!force) return destPath; // ya restaurado en una llamada anterior
    try { fs.unlinkSync(destPath); } catch {}
  }
  try {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const ruta = await driveHelper.descargarDeInsumo(carpetaId, `audio${sufijo}.mp3`, destPath);
    if (ruta) console.log(`♻️ Audio recuperado desde Drive: ${job.jobId} (${variante})`);
    return ruta;
  } catch (e) {
    console.warn(`⚠️ No se pudo recuperar audio de Drive (${job.jobId}): ${e.message}`);
    return null;
  }
}

// Servir un audio para escucharlo en la UI (público: el tag <audio> no envía headers)
app.get('/api/audio/:token', async (req, res) => {
  const token = req.params.token;
  let audio = audiosPendientes.get(token);
  // Fallback: si el Map se vació tras un reinicio, recuperar el audio desde Drive
  // usando el job dueño de este token, y repoblar el Map para próximas lecturas.
  if (!audio || !fs.existsSync(audio.path)) {
    const hallado = jobStore.buscarVariantePorAudioToken(token);
    const ruta = hallado ? await recuperarAudioDeDrive(hallado.job, false, hallado.variante) : null;
    if (ruta) {
      const datos = hallado.variante === 'B' ? (hallado.job.gemela || {}) : hallado.job;
      audio = { path: ruta, duracion: datos.duracion, modelo: datos.modelo };
      audiosPendientes.set(token, audio);
    }
  }
  if (!audio || !fs.existsSync(audio.path)) {
    return res.status(404).json({ error: 'Audio no disponible' });
  }
  res.sendFile(audio.path);
});

// Servir el video renderizado para verlo en la UI sin descargarlo
app.get('/api/preview/:token', (req, res) => {
  const entrada = previews.get(req.params.token);
  if (!entrada || !fs.existsSync(entrada.path)) {
    return res.status(404).json({ error: 'Preview no disponible' });
  }
  res.sendFile(entrada.path);
});

// Archivo .ttf de una tipografía del catálogo, el MISMO que el server ya descarga (y cachea) para
// quemar los subtítulos con libass. El navegador lo carga con la API FontFace para dibujar el
// cartel de portada. Sin esto, el canvas dependía del CDN de Google Fonts: si no cargaba (red
// lenta, bloqueo, offline), dibujaba con una tipografía de reemplazo — y como ese dibujo AHORA es
// lo que se hornea en el video, el error dejaba de ser solo visual. Con el .ttf servido de acá,
// navegador y servidor usan literalmente el mismo archivo.
// Público (sin API key) a propósito: FontFace.load() no puede mandar headers.
app.get('/api/fuente/:clave', async (req, res) => {
  const fuente = subtitulos.FUENTES[req.params.clave];
  if (!fuente) return res.status(404).json({ error: 'Tipografía desconocida' });
  try {
    const dir = await subtitulos.obtenerCarpetaFuentes(req.params.clave);
    const ruta = dir && path.join(dir, fuente.archivo);
    if (!ruta || !fs.existsSync(ruta)) {
      return res.status(503).json({ error: `No se pudo obtener la tipografía "${fuente.familia}"` });
    }
    res.type('font/ttf');
    res.sendFile(ruta);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PNG del cartel que el navegador dibujó en el Paso 6 y el server quemó en el frame 0. Se sirve
// para que la UI lo muestre encima del fotograma elegido — la imagen REAL, no una aproximación.
app.get('/api/cartel/:token', (req, res) => {
  const entrada = previews.get(req.params.token);
  if (!entrada?.cartelPath || !fs.existsSync(entrada.cartelPath)) {
    return res.status(404).json({ error: 'Cartel no disponible' });
  }
  res.sendFile(entrada.cartelPath);
});

// Portada (miniatura): fotograma elegido por el usuario + EL MISMO PNG de cartel superpuesto —
// pedido explícito del usuario: el cartel se diseña UNA sola vez, antes de generar el video, y se
// reusa tal cual acá (nunca se re-edita), para que el JPG y el frame 0 del video sean idénticos.
// Ese "idéntico" ahora es literal: es el mismo archivo PNG (`entrada.cartelPath`), no un redibujo
// a partir de los mismos parámetros. Se genera a partir del MP4 de preview (sobrevive a la
// limpieza de temporales del render), nunca del original — así funciona aunque el render ya se
// haya limpiado del disco. Además de servirla para descargar, se guarda junto al video (misma
// subcarpeta que creó /api/generate-video), para no tener que subirla aparte a mano.
app.post('/api/portada', async (req, res) => {
  const { previewToken, timestamp } = req.body;
  const entrada = previews.get(previewToken);
  if (!entrada || !fs.existsSync(entrada.path)) {
    return res.status(404).json({ error: 'El preview del video ya no está disponible, genera el video de nuevo' });
  }
  if (!entrada.cartelPath || !fs.existsSync(entrada.cartelPath)) {
    return res.status(400).json({ error: 'No se diseñó un cartel en el Paso 6, no hay nada que superponer' });
  }
  try {
    const token = crypto.randomBytes(16).toString('hex');
    const ruta = await portada.generarPortada(entrada.path, Number(timestamp) || 0, entrada.cartelPath, token);
    // Conservar solo las 3 portadas más recientes, mismo criterio que los previews.
    const viejas = [...portadas.entries()].slice(0, Math.max(0, portadas.size - 2));
    for (const [tok, ruta2] of viejas) {
      try { fs.unlinkSync(ruta2); } catch {}
      portadas.delete(tok);
    }
    portadas.set(token, ruta);

    // Copiarla/subirla junto al video, si se sabe dónde quedó guardado. Nunca rompe la
    // respuesta al usuario: si esto falla, la portada sigue disponible para descargar igual.
    let guardadaJuntoAlVideo = false;
    if (entrada.destino) {
      try {
        if (entrada.destino.modo === 'local') {
          fs.copyFileSync(ruta, path.join(entrada.destino.carpetaLocal, `${entrada.destino.nombreBase}.jpg`));
        } else if (entrada.destino.modo === 'api') {
          await driveHelper.subirVideo(ruta, `${entrada.destino.nombreBase}.jpg`, entrada.destino.carpetaDriveId, 'image/jpeg');
        }
        guardadaJuntoAlVideo = true;
      } catch (e) {
        console.warn(`⚠️ No se pudo guardar la portada junto al video: ${e.message}`);
      }
    }

    res.json({ portadaUrl: `/api/portada-file/${token}`, guardadaJuntoAlVideo });
  } catch (e) {
    console.error('Error generando portada:', e.message);
    res.status(500).json({ error: `No se pudo generar la portada: ${e.message}` });
  }
});

app.get('/api/portada-file/:token', (req, res) => {
  const ruta = portadas.get(req.params.token);
  if (!ruta || !fs.existsSync(ruta)) {
    return res.status(404).json({ error: 'Portada no disponible' });
  }
  res.sendFile(ruta);
});

// Material adicional por fragmento: entrevista (cita con audio real), foto de apoyo, video de
// apoyo. Los 3 son opcionales e independientes — el job puede tener 0, 1 o varios de cada uno.
// El upload multipart necesita su propio manejo de error (multer llama al callback con `err` en
// vez de rechazar una promesa) — de ahí el wrapper manual en vez de un simple `async (req,res)`.
function manejarErrorUpload(uploader) {
  return (req, res, next) => {
    uploader.single('archivo')(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message });
      next();
    });
  };
}

app.post('/api/materiales/entrevista', manejarErrorUpload(materiales.uploadEntrevista), async (req, res) => {
  try {
    const { jobId } = req.body;
    if (!jobId) return res.status(400).json({ error: 'Falta jobId' });
    if (!req.file) return res.status(400).json({ error: 'Falta el archivo de entrevista' });

    const rutaFinal = materiales.moverAJob(req.file, jobId);
    // Respaldo a Drive (driveCache, fire-and-forget): el disco de Railway es efímero, un
    // redeploy entre "subir la entrevista" y "generar el video" lo borra (bug real de
    // producción, 2026-08-20 — el usuario subió una entrevista, hubo un redeploy de por medio,
    // y el render la ignoró por completo). Se restaura de vuelta al vuelo si hace falta, ver el
    // bloque de resolución de materiales en /api/generate-video.
    driveCache.respaldar(rutaFinal, materiales.nombreDriveMaterial(jobId, rutaFinal), req.file.mimetype);
    const tieneVideo = req.file.mimetype.startsWith('video/');
    const citas = await gemini.detectarCitas(rutaFinal, tieneVideo);

    const material = {
      id: crypto.randomBytes(6).toString('hex'),
      tipo: 'entrevista',
      archivoPath: rutaFinal,
      mimeType: req.file.mimetype,
      tieneVideo,
      descripcion: null,
      citas,
    };
    const job = jobStore.obtenerJob(jobId);
    const lista = [...(job?.materialesAdicionales || []), material];
    jobStore.actualizarJob(jobId, { materialesAdicionales: lista });

    res.json({ status: 'success', materialId: material.id, tipo: 'entrevista', tieneVideo, citas });
  } catch (error) {
    console.error('Error subiendo entrevista:', error);
    res.status(500).json({ error: error.message });
  }
});

function endpointMaterialSimple(tipo) {
  return async (req, res) => {
    try {
      const { jobId, descripcion } = req.body;
      if (!jobId) return res.status(400).json({ error: 'Falta jobId' });
      if (!req.file) return res.status(400).json({ error: `Falta el archivo de ${tipo}` });

      const rutaFinal = materiales.moverAJob(req.file, jobId);
      driveCache.respaldar(rutaFinal, materiales.nombreDriveMaterial(jobId, rutaFinal), req.file.mimetype);
      const material = {
        id: crypto.randomBytes(6).toString('hex'),
        tipo,
        archivoPath: rutaFinal,
        mimeType: req.file.mimetype,
        tieneVideo: tipo === 'video',
        descripcion: descripcion || null,
        citas: [],
      };
      const job = jobStore.obtenerJob(jobId);
      const lista = [...(job?.materialesAdicionales || []), material];
      jobStore.actualizarJob(jobId, { materialesAdicionales: lista });

      res.json({ status: 'success', materialId: material.id, tipo });
    } catch (error) {
      console.error(`Error subiendo ${tipo}:`, error);
      res.status(500).json({ error: error.message });
    }
  };
}

app.post('/api/materiales/foto', manejarErrorUpload(materiales.uploadFoto), endpointMaterialSimple('foto'));
app.post('/api/materiales/video', manejarErrorUpload(materiales.uploadVideoApoyo), endpointMaterialSimple('video'));

app.patch('/api/materiales/:jobId/:materialId', (req, res) => {
  const { jobId, materialId } = req.params;
  const job = jobStore.obtenerJob(jobId);
  if (!job) return res.status(404).json({ error: 'Job no encontrado' });
  const lista = (job.materialesAdicionales || []).map(m => m.id === materialId ? { ...m, descripcion: req.body.descripcion ?? m.descripcion } : m);
  jobStore.actualizarJob(jobId, { materialesAdicionales: lista });
  res.json({ status: 'success' });
});

app.delete('/api/materiales/:jobId/:materialId', (req, res) => {
  const { jobId, materialId } = req.params;
  const job = jobStore.obtenerJob(jobId);
  if (!job) return res.status(404).json({ error: 'Job no encontrado' });
  const material = (job.materialesAdicionales || []).find(m => m.id === materialId);
  if (material) {
    try { fs.unlinkSync(material.archivoPath); } catch {}
    driveCache.borrar(materiales.nombreDriveMaterial(jobId, material.archivoPath));
  }
  const lista = (job.materialesAdicionales || []).filter(m => m.id !== materialId);
  jobStore.actualizarJob(jobId, { materialesAdicionales: lista });
  res.json({ status: 'success' });
});

app.get('/api/materiales/:jobId', (req, res) => {
  const job = jobStore.obtenerJob(req.params.jobId);
  res.json({ materialesAdicionales: job?.materialesAdicionales || [] });
});

// ---------------------------------------------------------------------------------------------
// CITAS DESDE DRIVE
//
// El usuario ya sube las entrevistas a mano a una carpeta "Citas" dentro de Redes_Canales, con
// subcarpetas por fecha y protagonista. Su idea, textual: "en lugar de descargar el archivo, usarlo
// desde el Drive y solo marcarlo, y una vez escogido solo el fragmento, utilizar eso nada más".
//
// Es mejor que subirlo por el navegador, que es lo que se hacía:
//   - No se sube nada (sus archivos pesan 50 MB y ya están en Drive).
//   - No ocupa el disco de Railway, que es efímero y ya hizo perder una entrevista entre el upload
//     y el render (bug real, 2026-08-20).
//   - Del archivo grande solo se guarda, al final, el recorte de unos segundos.
// ---------------------------------------------------------------------------------------------

// Navegar la carpeta de citas. Sin `folderId` abre la raíz; con él, entra en esa subcarpeta.
app.get('/api/citas-drive', async (req, res) => {
  try {
    const folderId = req.query.folderId || driveHelper.CITAS_FOLDER_ID;
    const contenido = await driveHelper.listarContenido(folderId);
    res.json({ folderId, raiz: driveHelper.CITAS_FOLDER_ID, contenido });
  } catch (error) {
    console.error('Error listando la carpeta de citas:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUENTE de reproducción: el navegador pide un tramo de bytes y se le pide ese mismo tramo a Drive.
// Así se puede saltar a cualquier segundo de un video de 50 MB sin bajarlo entero ni escribirlo en
// el disco del servidor.
//
// Exenta de la API key (ver `authenticateApiKey`): un <video> no puede mandar cabeceras.
app.get('/api/cita-stream/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const rango = req.headers.range || null;
    const r = await driveHelper.streamArchivo(fileId, rango);
    // Se copian las cabeceras que Drive ya calculó (rango, largo, tipo): recalcularlas a mano sería
    // duplicar su aritmética y equivocarse en los bordes.
    //
    // ⚠️ `r.headers` es un objeto `Headers` (fetch), NO un diccionario: leerlo como `headers['x']`
    // devuelve undefined siempre. Con eso el puente contestaba 200 con el archivo entero aunque
    // Drive hubiera respondido 206 correctamente, y el navegador no podía saltar a un segundo.
    const leer = (h) => (typeof r.headers?.get === 'function' ? r.headers.get(h) : r.headers?.[h]);
    for (const h of ['content-type', 'content-length', 'content-range']) {
      const v = leer(h);
      if (v) res.setHeader(h, v);
    }
    // Drive no manda `accept-ranges` aunque los soporta; sin esta cabecera el navegador ni intenta
    // pedir un tramo y se baja el video entero para poder moverse por la línea de tiempo.
    res.setHeader('Accept-Ranges', 'bytes');
    res.status(leer('content-range') ? 206 : 200);
    r.data.on('error', (e) => {
      console.warn(`⚠️ Puente de cita cortado (${fileId}): ${e.message}`);
      res.destroy();
    });
    r.data.pipe(res);
  } catch (error) {
    console.error('Error en el puente de cita:', error.message);
    if (!res.headersSent) res.status(500).json({ error: error.message });
  }
});

// Toma un archivo de la carpeta Citas y lo suma al job como material.
//
// Con `inicio`/`fin` recorta SOLO ese tramo y guarda únicamente el recorte: de una entrevista de
// 50 MB quedan unos segundos. Es lo que pidió el usuario ("una vez escogido solo el fragmento,
// utilizar eso nada más") y de paso evita el modo de falla que ya mordió: el archivo grande
// desapareciendo del disco efímero entre que se marca y se genera el video.
//
// Sin `inicio`/`fin` (una foto, o un video que se quiere entero) se trae tal cual.
//
// El original NUNCA se toca: sigue en el Drive del usuario, por si después quiere sacar otra cita.
app.post('/api/citas-drive/usar', async (req, res) => {
  try {
    const { jobId, fileId, nombre, inicio, fin, tipo, descripcion, texto } = req.body;
    if (!jobId || !fileId) return res.status(400).json({ error: 'Faltan jobId o fileId' });
    const job = jobStore.obtenerJob(jobId);
    if (!job) return res.status(404).json({ error: 'Job no encontrado' });

    const info = await driveHelper.infoArchivo(fileId);
    const esImagen = (info.mimeType || '').startsWith('image/');
    const esVideo = (info.mimeType || '').startsWith('video/');
    const recorta = !esImagen && Number.isFinite(inicio) && Number.isFinite(fin) && fin > inicio;

    // Misma carpeta y estructura que los materiales subidos a mano (MATERIALES_DIR/jobId/), para
    // que el borrado, el respaldo y la restauración desde Drive los traten igual sin saber de dónde
    // vinieron.
    const destDir = path.join(materiales.MATERIALES_DIR, jobId);
    fs.mkdirSync(destDir, { recursive: true });
    const ext = path.extname(info.name || '') || (esImagen ? '.jpg' : '.mp4');
    const destino = path.join(destDir, `drive_${crypto.randomBytes(6).toString('hex')}${ext}`);

    // Se baja el original a un temporal, se recorta, y el original se descarta. Bajarlo entero es
    // inevitable: para cortar por tiempo hay que leer el índice del contenedor, y Drive solo sabe
    // servir rangos de BYTES, que en un mp4 no mapean a segundos.
    const tmp = path.join(video.TEMP_DIR, `cita_src_${crypto.randomBytes(4).toString('hex')}${ext}`);
    fs.mkdirSync(video.TEMP_DIR, { recursive: true });
    const r = await driveHelper.streamArchivo(fileId);
    await new Promise((ok, err) => {
      const out = fs.createWriteStream(tmp);
      r.data.on('error', err);
      out.on('error', err);
      out.on('finish', ok);
      r.data.pipe(out);
    });

    try {
      if (recorta) {
        const dur = (fin - inicio).toFixed(2);
        console.log(`✂️ Recortando cita de "${info.name}": ${inicio.toFixed(2)}s a ${fin.toFixed(2)}s (${dur}s)`);
        // Re-codifica en vez de copiar: un corte por tiempo con `-c copy` salta al keyframe más
        // cercano y se lleva puesto hasta medio segundo, que es justo lo que se está tratando de
        // ajustar al milímetro.
        await video.ffmpeg(['-ss', String(inicio), '-i', tmp, '-t', dur,
          ...(esVideo ? ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20'] : []),
          '-c:a', 'aac', '-b:a', '192k', destino]);
      } else {
        fs.copyFileSync(tmp, destino);
      }
    } finally {
      try { fs.unlinkSync(tmp); } catch {}
    }

    driveCache.respaldar(destino, materiales.nombreDriveMaterial(jobId, destino), info.mimeType);

    const material = {
      id: crypto.randomBytes(6).toString('hex'),
      tipo: tipo || (esImagen ? 'foto' : 'entrevista'),
      archivoPath: destino,
      mimeType: info.mimeType,
      tieneVideo: esVideo,
      descripcion: descripcion || null,
      origenDrive: { fileId, nombre: nombre || info.name },
      // Ya viene recortado: los tiempos son del archivo NUEVO, que arranca en 0. Guardar acá los
      // del original confundiría al Paso 4, que los usaría como offsets dentro del recorte.
      citas: recorta
        ? [{ citaId: crypto.randomBytes(3).toString('hex'), texto: texto || '', inicioAprox: 0, finAprox: Math.round((fin - inicio) * 100) / 100 }]
        : [],
    };

    const lista = [...(job.materialesAdicionales || []), material];
    jobStore.actualizarJob(jobId, { materialesAdicionales: lista });
    const tam = Math.round(fs.statSync(destino).size / 1048576 * 10) / 10;
    console.log(`  ✅ Material agregado desde Drive: ${info.name} → ${tam} MB${recorta ? ' (solo el tramo marcado)' : ''}`);

    res.json({ status: 'success', material, recortado: recorta, tamMB: tam });
  } catch (error) {
    console.error('Error usando la cita de Drive:', error);
    res.status(500).json({ error: error.message });
  }
});

// Sirve el archivo de un material para poder ESCUCHARLO en el Paso 4.
//
// Por qué hace falta: los tiempos de cada cita los estima Gemini de oído (el prompt le pide el
// momento "aproximado"), y se usan tal cual. Cuando el `fin` cae medio segundo antes de que la
// persona termine de hablar, la frase sale cortada en el video. El usuario podía corregir los
// números a mano desde el Paso 4, pero no tenía cómo saber QUÉ tramo era sin abrir el archivo por
// fuera de la app y buscar el segundo a ojo. Su pregunta, textual: "¿pero cómo puedo saber qué
// parte de la cita es?".
//
// Soporta Range para que el navegador pueda saltar a un segundo concreto sin bajarse el archivo
// entero: sin esto, `currentTime = 12.4` en un video largo no funciona en Chrome.
//
// Va en `/api/material-file/` y NO bajo `/api/materiales/` porque tiene que estar EXENTA de la API
// key: un `<audio>` no puede mandar cabeceras, igual que el `<video>` de las previas. Mismo criterio
// que `/preview/` y `/audio/` — la protección es que la ruta lleva dos identificadores opacos
// (`jobId` es un UUID v4), no que se pida la clave.
app.get('/api/material-file/:jobId/:materialId', (req, res) => {
  const { jobId, materialId } = req.params;
  const job = jobStore.obtenerJob(jobId);
  if (!job) return res.status(404).json({ error: 'Job no encontrado' });
  const material = (job.materialesAdicionales || []).find(m => m.id === materialId);
  if (!material) return res.status(404).json({ error: 'Material no encontrado' });
  if (!material.archivoPath || !fs.existsSync(material.archivoPath)) {
    // El disco de Railway es efímero: tras un redeploy el archivo puede no estar aunque el job sí.
    return res.status(404).json({ error: 'El archivo ya no está en el disco del servidor' });
  }

  const total = fs.statSync(material.archivoPath).size;
  const tipo = material.tieneVideo ? 'video/mp4' : 'audio/mpeg';
  const range = req.headers.range;
  if (!range) {
    res.writeHead(200, { 'Content-Length': total, 'Content-Type': tipo, 'Accept-Ranges': 'bytes' });
    return fs.createReadStream(material.archivoPath).pipe(res);
  }
  const [desdeStr, hastaStr] = range.replace(/bytes=/, '').split('-');
  const desde = parseInt(desdeStr, 10) || 0;
  const hasta = hastaStr ? parseInt(hastaStr, 10) : total - 1;
  res.writeHead(206, {
    'Content-Range': `bytes ${desde}-${hasta}/${total}`,
    'Accept-Ranges': 'bytes',
    'Content-Length': hasta - desde + 1,
    'Content-Type': tipo,
  });
  fs.createReadStream(material.archivoPath, { start: desde, end: hasta }).pipe(res);
});

// Inicializar Google Drive
let driveClient;

async function initializeDrive() {
  try {
    // En Railway no hay credentials.json en disco: se usa GOOGLE_CREDENTIALS_JSON
    const opciones = { scopes: ['https://www.googleapis.com/auth/drive'] };
    if (process.env.GOOGLE_CREDENTIALS_JSON) {
      opciones.credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
    } else {
      const credentialsPath = path.join(__dirname, 'credentials.json');
      if (!fs.existsSync(credentialsPath)) {
        console.error('❌ credentials.json no encontrado (ni GOOGLE_CREDENTIALS_JSON)');
        return;
      }
      opciones.keyFile = credentialsPath;
    }

    driveClient = google.drive({ version: 'v3', auth: new google.auth.GoogleAuth(opciones) });
    console.log(`✅ Google Drive conectado${driveHelper.hayOAuth() ? ' (subidas por OAuth)' : ''}`);
  } catch (error) {
    console.error('Error conectando Google Drive:', error);
  }
}

// Rutas públicas (sin autenticación)
app.get('/api/key-prompt', (req, res) => {
  res.json({ requiresKey: true, message: 'Ingresa tu API Key' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Servidor activo' });
});

// Lista las subcarpetas de famosos (hijas de la carpeta principal)
async function listarCarpetasFamosos() {
  const parentId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const response = await driveClient.files.list({
    q: `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
    pageSize: 1000,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });
  return response.data.files;
}

// Lista viva de carpetas de famosos. La usa el botón "Actualizar lista de carpetas" del
// Paso 4: al retomar un job, las carpetas salen de la foto guardada en el job
// (jobStore), así que un famoso creado en Drive DESPUÉS de fragmentar no aparecía en los
// desplegables. Este endpoint permite refrescarla sin rehacer la fragmentación.
app.get('/api/carpetas-famosos', async (req, res) => {
  try {
    if (!driveClient) return res.status(500).json({ error: 'Drive no inicializado' });
    const folders = await listarCarpetasFamosos();
    const carpetas = folders.map(f => f.name).sort((a, b) => a.localeCompare(b));
    res.json({ carpetas });
  } catch (error) {
    console.error('Error listando carpetas de famosos:', error);
    res.status(500).json({ error: error.message });
  }
});

// Carpetas de destino para renders (hijas de la carpeta de renders, una por canal)
app.get('/api/folders', async (req, res) => {
  try {
    if (!driveClient) {
      return res.status(500).json({ error: 'Drive no inicializado' });
    }

    const rendersId = process.env.GOOGLE_DRIVE_RENDERS_FOLDER_ID;
    const response = await driveClient.files.list({
      q: `'${rendersId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      pageSize: 100,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });

    // Si no hay subcarpetas, ofrecer la carpeta raíz de renders como destino
    let folders = response.data.files;
    if (folders.length === 0) {
      const root = await driveClient.files.get({
        fileId: rendersId,
        fields: 'id, name',
        supportsAllDrives: true,
      });
      folders = [root.data];
    }

    res.json({ folders });
  } catch (error) {
    console.error('Error obteniendo carpetas:', error);
    res.status(500).json({ error: error.message });
  }
});

// Listar los 4 canales de insumos para edición
app.get('/api/canales', async (req, res) => {
  try {
    const canales = await driveHelper.listarCanales();
    res.json({ canales });
  } catch (error) {
    console.error('Error obteniendo canales:', error);
    res.status(500).json({ error: error.message });
  }
});

// Catálogo de tipografías de subtítulos (Fase 6) — la UI lo pide en vez de mantener una lista
// duplicada; si se agrega/saca una fuente en subtitulos.js, el selector se actualiza solo.
app.get('/api/fuentes-subtitulos', (req, res) => {
  // factorAncho viaja también: lo usa la vista previa en vivo de la portada (public/app.js) para
  // replicar el mismo cálculo de ajustarTamano() de portada.js sin llamar al server en cada tecla.
  const fuentes = Object.entries(subtitulos.FUENTES).map(([clave, f]) => ({ clave, familia: f.familia, factorAncho: f.factorAncho }));
  res.json({ fuentes, default: subtitulos.FUENTE_DEFAULT });
});

// Catálogo de tonos de música (Fase 8) — para el selector manual del Paso 6. gemini.TONOS es
// la única fuente de verdad (seleccion.emparejarCarpetaTono también la usa indirectamente vía
// lo que llega en `tono`), así que este endpoint nunca queda desincronizado del código real.
app.get('/api/tonos-musica', (req, res) => {
  res.json({ tonos: gemini.TONOS });
});

// Decide CÓMO leer una fuente y devuelve su acta ya extraída (Fase 4 del plan maestro:
// multifuente + solo audio). El orden de intentos SIEMPRE prioriza lo más barato — de los
// videos no importa nada visual (pedido explícito del usuario), así que "ver" el video queda
// como último recurso si todo lo demás falla, nunca como default. Cada escalón que falla cae
// al siguiente en vez de abortar (regla de robustez del plan: degradar, no romper).
async function extraerActaDeFuente(type, content) {
  if (type !== 'link' && type !== 'video') {
    // Texto manual u otro tipo simple: directo, sin branching.
    const acta = await gemini.extraerActa(type, content);
    return { acta, tipoReal: type };
  }

  if (fuentes.esYoutube(content)) {
    // 1) Transcripción (subtítulos manuales o autogenerados): texto puro, CERO tokens de
    //    audio/video en Gemini — la fuente más barata que existe. Se intenta siempre primero.
    try {
      const transcripcion = await fuentes.obtenerTranscripcionYoutube(content);
      if (transcripcion) {
        console.log('  📄 Transcripción de YouTube obtenida (sin tocar audio ni video)');
        const acta = await gemini.extraerActa('transcripcion', transcripcion);
        return { acta, tipoReal: 'youtube-transcripcion' };
      }
      console.log('  ℹ️ YouTube sin subtítulos disponibles; probando audio...');
    } catch (e) {
      console.warn(`  ⚠️ Transcripción de YouTube falló (${e.message}); probando audio...`);
    }

    // 2) Audio solo: ~1/8 del costo de mandar el video completo (263 vs 32 tokens/s).
    try {
      const audioPath = await fuentes.descargarAudio(content);
      try {
        console.log('  🔊 Audio de YouTube descargado (sin video)');
        const acta = await gemini.extraerActa('audio', audioPath);
        return { acta, tipoReal: 'youtube-audio' };
      } finally {
        try { fs.unlinkSync(audioPath); } catch {}
      }
    } catch (e) {
      console.warn(`  ⚠️ Audio de YouTube falló (${e.message}); probando lectura directa...`);
    }

    // 3) Gemini lee la URL de YouTube directo, sin pasar por yt-dlp (más caro — video completo
    //    — pero robusto: no depende de que yt-dlp pueda acceder a YouTube en este momento).
    try {
      console.log('  📖 Lectura de YouTube directa (Gemini)...');
      const acta = await gemini.extraerActa('youtube', content);
      return { acta, tipoReal: 'youtube-directo' };
    } catch (e) {
      console.warn(`  ⚠️ Lectura directa de YouTube falló (${e.message}); último recurso: descargar el video...`);
    }

    // 4) Último recurso: descargar el video completo (yt-dlp) y subirlo a la File API.
    const videoPath = await fuentes.descargarVideo(content);
    try {
      const acta = await gemini.extraerActa('video', videoPath);
      return { acta, tipoReal: 'youtube-video' };
    } finally {
      try { fs.unlinkSync(videoPath); } catch {}
    }
  }

  if (fuentes.esVideoSocial(content) || type === 'video') {
    // TikTok/IG/etc: audio primero — nunca importa lo visual — video completo como fallback.
    try {
      const audioPath = await fuentes.descargarAudio(content);
      try {
        console.log('  🔊 Audio descargado (sin video)');
        const acta = await gemini.extraerActa('audio', audioPath);
        return { acta, tipoReal: 'social-audio' };
      } finally {
        try { fs.unlinkSync(audioPath); } catch {}
      }
    } catch (e) {
      console.warn(`  ⚠️ Audio-only falló (${e.message}); descargando video completo...`);
      const videoPath = await fuentes.descargarVideo(content);
      try {
        const acta = await gemini.extraerActa('video', videoPath);
        return { acta, tipoReal: 'social-video' };
      } finally {
        try { fs.unlinkSync(videoPath); } catch {}
      }
    }
  }

  // Link normal de noticia: extraer el texto de la página.
  console.log('  📄 Extrayendo texto de la página...');
  const texto = await fuentes.extraerTextoWeb(content);
  const acta = await gemini.extraerActa('web', texto);
  return { acta, tipoReal: 'web' };
}

// ETAPA 1: Lectura — multifuente (hasta 3 por noticia). Con `jobId` agrega una fuente más al
// job existente; sin `jobId` crea uno nuevo (requiere canalId). Cada fuente se procesa a su
// ACTA (barata, sesgo-independiente) y luego se sintetiza UNA crónica con TODAS las actas
// acumuladas — nunca se vuelve a tocar una fuente ya leída para agregar la siguiente.

// -------------------------------------------------------------------------------------------
// NOMBRES DE FAMOSOS BIEN ESCRITOS
//
// Gemini transcribe DE OÍDO: "Fátima Bosch" vuelve como "Fátima Bos", "Nawat" como "Nagua". Ese
// nombre mal escrito no se queda en la crónica — se propaga a la locución (ElevenLabs lee lo que
// está escrito), a los subtítulos, a la carpeta de clips (que no matchea y deja al video sin su
// famoso), al nombre del archivo y a los hashtags, donde además mata el alcance.
//
// Se cotejan los nombres recién leídos contra las carpetas de Drive — la única fuente de verdad
// que el usuario mantiene a mano — ANTES de que nada más los use. Lo de confianza 'alta' se
// corrige solo (y se avisa qué cambió); lo de 'media' viaja a la UI como sugerencia.
// Regla de robustez: si Drive no responde, la lectura sigue sin cotejar nada.
// -------------------------------------------------------------------------------------------

async function revisarNombres(result, actas = []) {
  let carpetas = [];
  try {
    carpetas = Object.keys(await driveHelper.obtenerCarpetasFamosos());
  } catch (e) {
    console.warn(`⚠️ No se pudieron leer las carpetas para cotejar nombres: ${e.message}`);
    return { result, nombresDetectados: [] };
  }

  // `acta.personas` ya existía: es la lista de nombres que Gemini detectó en cada fuente.
  const candidatos = [];
  const agregar = (n) => {
    const v = (n || '').trim();
    if (!v) return;
    if (candidatos.some(c => famosos.claveFonetica(c) === famosos.claveFonetica(v))) return;
    candidatos.push(v);
  };
  agregar(result.protagonista);
  agregar(result.secundario);
  for (const a of actas) for (const p of (a?.personas || [])) agregar(p);

  const nombresDetectados = candidatos.map(n => famosos.cotejar(n, carpetas));
  let corregido = result;
  for (const n of nombresDetectados) {
    if (n.confianza !== 'alta' || !n.sugerido || n.sugerido === n.leido) continue;
    corregido = famosos.reemplazarEn(corregido, n.leido, n.sugerido);
    console.log(`  ✏️ Nombre corregido: "${n.leido}" → "${n.sugerido}"`);
    // Se aprende para la próxima: el mismo error ya no se vuelve a preguntar ni a cotejar.
    try { famosos.registrar({ escribir: n.sugerido, leido: n.leido, carpeta: n.carpeta }); } catch {}
  }
  return { result: corregido, nombresDetectados };
}

app.post('/api/read', async (req, res) => {
  try {
    const { type, content, sesgo, canalId, jobId: jobIdExistente, sintetizar } = req.body;
    if (!type || !content) {
      return res.status(400).json({ error: 'Faltan type o content' });
    }

    let job = null;
    if (jobIdExistente) {
      job = jobStore.obtenerJob(jobIdExistente);
      if (!job) return res.status(404).json({ error: 'Job no encontrado' });
    } else if (!canalId) {
      return res.status(400).json({ error: 'Falta canalId' });
    }

    const fuentesActuales = job?.fuentes || [];
    const MAX_FUENTES = 6;
    if (fuentesActuales.length >= MAX_FUENTES) {
      return res.status(400).json({ error: `Ya hay ${MAX_FUENTES} fuentes (máximo). Quita una para agregar otra.` });
    }

    const sesgoElegido = ['favor', 'contra', 'neutral'].includes(sesgo) ? sesgo : (job?.sesgo || 'neutral');
    const contenido = content.trim();

    console.log(`📖 ${job ? 'Agregando fuente' : 'Leyendo fuente'} ${fuentesActuales.length + 1}/${MAX_FUENTES} (${type})...`);
    const { acta, tipoReal } = await extraerActaDeFuente(type, contenido);

    const nuevaFuente = { type, content: contenido, tipoReal, acta };
    const todasLasFuentes = [...fuentesActuales, nuevaFuente];

    // La PRIMERA fuente siempre sintetiza: hace falta la crónica (nombreCorto) para nombrar la
    // carpeta de insumos y crear el job. De la 2da en adelante, sintetizar=false solo GUARDA el
    // acta nueva y no toca la crónica — deja que el usuario siga agregando fuentes sin gastar
    // una síntesis por cada una; "Procesar fuentes" (POST /api/resintetizar) hace la síntesis
    // final con todas juntas cuando el usuario decide que ya terminó de agregar.
    const debeSintetizar = !job || sintetizar !== false;

    if (!debeSintetizar) {
      job = jobStore.actualizarJob(job.jobId, { fuentes: todasLasFuentes });
      return res.json({
        status: 'success',
        jobId: job.jobId,
        numFuentes: todasLasFuentes.length,
        maxFuentes: MAX_FUENTES,
        fuenteResumen: acta.fuenteResumen,
        tipoReal,
        sintetizado: false,
      });
    }

    console.log(`📝 Sintetizando crónica (${todasLasFuentes.length} fuente${todasLasFuentes.length > 1 ? 's' : ''}, sesgo: ${sesgoElegido})...`);
    const cronicaBase = await gemini.sintetizarCronica(todasLasFuentes.map(f => f.acta), sesgoElegido);
    const { result, nombresDetectados } = await revisarNombres(cronicaBase, todasLasFuentes.map(f => f.acta));

    if (!job) {
      // Primera fuente del video: crear la carpeta de insumos y el job.
      const timestamp = new Date().toISOString().split('T')[0];
      const nombreCarpeta = `${result.nombreCorto}-${timestamp}`;
      console.log(`📁 Creando carpeta de insumos: ${nombreCarpeta}`);
      const carpetaInsumoId = await driveHelper.crearCarpetaInsumo(canalId, nombreCarpeta);
      job = jobStore.crearJob({
        paso: 'lectura',
        canalId,
        carpetaInsumoId,
        sesgo: sesgoElegido,
        fuentes: todasLasFuentes,
        ...result,
      });
    } else {
      job = jobStore.actualizarJob(job.jobId, { sesgo: sesgoElegido, fuentes: todasLasFuentes, ...result });
    }

    // Dos puntos de entrada distintos a la misma noticia, uno por video gemelo. Se calculan acá y no
    // al escribir el guion porque el usuario tiene que poder verlos y cambiarlos en el Paso 1, antes
    // de que decidan nada. Es una llamada de texto, barata.
    //
    // Nunca tumba la lectura: si falla o el material no da para dos, el job sigue sin encuadres y
    // los gemelos se diferencian como hasta ahora.
    job = await proponerEncuadres(job, todasLasFuentes);

    // Guardar la lectura en Drive (carpeta de insumos) — incluye TODAS las actas acumuladas.
    driveHelper.guardarEnInsumo(job.carpetaInsumoId, 'lectura.json', JSON.stringify({ fuentes: todasLasFuentes, ...result }, null, 2))
      .catch(e => console.warn(`⚠️ No se pudo respaldar lectura.json en Drive: ${e.message}`));

    res.json({
      status: 'success',
      jobId: job.jobId,
      carpetaInsumoId: job.carpetaInsumoId,
      numFuentes: todasLasFuentes.length,
      maxFuentes: MAX_FUENTES,
      fuenteResumen: acta.fuenteResumen,   // resumen de la fuente RECIÉN agregada (para la UI)
      tipoReal,                             // cómo se leyó de verdad (audio/transcripción/video/web)
      sintetizado: true,
      cronica: result.cronica,
      titulo: result.titulo,
      descripcion: result.descripcion,
      protagonista: result.protagonista,
      secundario: result.secundario,
      accion: result.accion,
      nombreCorto: result.nombreCorto,
      tono: result.tono, // Fase 8 (música por sentido): ya viaja desde acá, aunque nada lo use todavía
      nombresDetectados,   // [{leido, sugerido, carpeta, confianza, decir}] — para confirmar en el Paso 1
      encuadres: job.encuadres || null,   // los dos puntos de entrada propuestos (null si no se pudo)
    });
  } catch (error) {
    console.error('Error lectura:', error);
    res.status(500).json({ error: error.message });
  }
});

// Re-sintetizar la crónica con OTRO sesgo, SIN re-descargar ni re-procesar ninguna fuente: las
// actas ya cacheadas en el job son sesgo-independientes (Fase 4 del plan maestro — antes
// "otro sesgo" volvía a descargar y resubir el video entero para esto).
app.post('/api/resintetizar', async (req, res) => {
  try {
    const { jobId, sesgo } = req.body;
    if (!jobId) return res.status(400).json({ error: 'Falta jobId' });
    const job = jobStore.obtenerJob(jobId);
    if (!job) return res.status(404).json({ error: 'Job no encontrado' });
    if (!job.fuentes || job.fuentes.length === 0) {
      return res.status(400).json({ error: 'Este job no tiene fuentes cacheadas (versión anterior a la Fase 4) — hay que releer la fuente' });
    }

    const sesgoElegido = ['favor', 'contra', 'neutral'].includes(sesgo) ? sesgo : 'neutral';
    console.log(`📝 Re-sintetizando con sesgo ${sesgoElegido} (${job.fuentes.length} fuente(s) cacheadas, sin re-descargar)...`);
    const cronicaBase = await gemini.sintetizarCronica(job.fuentes.map(f => f.acta), sesgoElegido);
    const { result, nombresDetectados } = await revisarNombres(cronicaBase, job.fuentes.map(f => f.acta));

    const jobActualizado = jobStore.actualizarJob(jobId, { sesgo: sesgoElegido, ...result });
    driveHelper.guardarEnInsumo(jobActualizado.carpetaInsumoId, 'lectura.json', JSON.stringify({ fuentes: job.fuentes, ...result }, null, 2))
      .catch(e => console.warn(`⚠️ No se pudo respaldar lectura.json en Drive: ${e.message}`));

    res.json({
      status: 'success',
      jobId,
      cronica: result.cronica,
      titulo: result.titulo,
      descripcion: result.descripcion,
      protagonista: result.protagonista,
      secundario: result.secundario,
      accion: result.accion,
      nombreCorto: result.nombreCorto,
      tono: result.tono, // Fase 8 (música por sentido): ya viaja desde acá, aunque nada lo use todavía
    });
  } catch (error) {
    console.error('Error re-síntesis:', error);
    res.status(500).json({ error: error.message });
  }
});

// ENRIQUECER CONTEXTO: busca en la web alrededor de la noticia y suma lo encontrado como UNA FUENTE
// MÁS del job. Entra por el mismo camino que las fuentes que carga el usuario, así que la crónica no
// necesita saber que esta vino de otro lado.
//
// Es opcional y se pide a mano desde el Paso 1: cuesta ~2 minutos y no toda noticia lo necesita.
// Cuando termina, re-sintetiza la crónica para que el material nuevo entre de verdad — si no, el
// contexto quedaría guardado sin efecto sobre el guion.
app.post('/api/enriquecer', async (req, res) => {
  try {
    const { jobId } = req.body;
    if (!jobId) return res.status(400).json({ error: 'Falta jobId' });
    const job = jobStore.obtenerJob(jobId);
    if (!job) return res.status(404).json({ error: 'Job no encontrado' });
    if (!job.fuentes || !job.fuentes.length) {
      return res.status(400).json({ error: 'Este proceso no tiene fuentes guardadas: hay que leer la fuente primero' });
    }
    if (job.fuentes.some(f => f.acta?.origen === 'web')) {
      return res.status(400).json({ error: 'Esta noticia ya está enriquecida' });
    }

    const hechos = job.fuentes.map(f => f.acta?.hechos).filter(Boolean).join('\n\n');
    const personas = [...new Set(job.fuentes.flatMap(f => f.acta?.personas || []))];
    console.log(`🔎 Enriqueciendo contexto de ${jobId} (${personas.join(', ') || 'sin personas detectadas'})...`);

    const contexto = await gemini.enriquecerContexto(hechos, personas);
    console.log(`  🔎 ${contexto.consultas.length} búsqueda(s), ${contexto.citas.length} fuente(s)`);

    const acta = gemini.actaDeContexto(contexto);
    if (!acta) {
      console.log('  ℹ️ La búsqueda no encontró contexto útil: el job queda como estaba');
      return res.json({ status: 'sin_resultados', contexto, cronica: job.cronica });
    }

    // El contexto entra como una fuente más, marcada. `type: 'web'` la distingue en la lista del
    // Paso 1 y evita que se la confunda con algo que cargó el usuario.
    const fuentes = [...job.fuentes, { type: 'web', content: '(búsqueda automática)', acta, tipoReal: 'contexto-web' }];
    const cronicaBase = await gemini.sintetizarCronica(fuentes.map(f => f.acta), job.sesgo || 'neutral');
    const { result, nombresDetectados } = await revisarNombres(cronicaBase, fuentes.map(f => f.acta));

    const actualizado = jobStore.actualizarJob(jobId, { fuentes, ...result });
    driveHelper.guardarEnInsumo(actualizado.carpetaInsumoId, 'lectura.json', JSON.stringify({ fuentes, ...result }, null, 2))
      .catch(e => console.warn(`⚠️ No se pudo respaldar lectura.json en Drive: ${e.message}`));

    res.json({
      status: 'success',
      jobId,
      contexto,
      nombresDetectados,
      cronica: result.cronica,
      titulo: result.titulo,
      descripcion: result.descripcion,
      protagonista: result.protagonista,
      secundario: result.secundario,
      accion: result.accion,
      nombreCorto: result.nombreCorto,
      tono: result.tono,
    });
  } catch (error) {
    console.error('Error enriqueciendo contexto:', error);
    res.status(500).json({ error: error.message });
  }
});

// Escribe el guion del gemelo a partir del guion del primero. Extraída del endpoint para poder
// pedirla SOLA (`soloGemela`): rehacer el video B no tiene por qué reescribir el A, que puede estar
// ya locutado o incluso subido.
//
// `scriptA` es la única dependencia real entre los dos videos: entra como "esto es lo que NO podés
// parecerte". No hace falta que esté aprobado, ni locutado — solo que exista.
//
// Sesgo opuesto (solo motor `grafo`, pedido del usuario 2026-08-24): si el video A se narró a favor
// del protagonista, el gemelo se narra en contra y viceversa, para que los dos canales presenten
// ángulos distintos del mismo hecho. Se hace re-sintetizando la crónica desde las actas ya
// extraídas (barato, no re-lee la fuente) — el sesgo vive en la crónica, no en el guion, así que
// este es el único lugar donde hay que tocarlo. Con `neutral` no hay postura que invertir y el
// gemelo sigue con la crónica del primero, como antes.
//
// Devuelve null si falla: regla de robustez, el video A no se cae por culpa del gemelo.
async function escribirGuionGemelo({ job, cronica, angle, angleContent, motorElegido, materiales, metadatos, scriptA }) {
  try {
    const citasB = citasDeVariante(materiales, 'B');
    let cronicaB = cronica;

    // PRIMERO el encuadre, que es la palanca fuerte: cambia DE QUÉ habla el video, no solo desde qué
    // postura. Si la lectura propuso dos, el gemelo se queda con el segundo y re-sintetiza su propia
    // crónica desde las mismas actas. Sin esto los dos guiones salen del mismo texto y el parafraseo
    // es su techo — que es justo lo que el usuario notó.
    const encuadreB = job?.encuadres?.encuadres?.[1];
    if (encuadreB) {
      console.log(`  🎯 Gemelo con otro encuadre: "${encuadreB.titulo}" (${encuadreB.marco})`);
      cronicaB = (await cronicaConEncuadre(job, encuadreB)) || cronica;
    } else {
      // Sin encuadres, la palanca de antes: sesgo invertido, que solo aplica si el usuario eligió
      // favor o contra (con neutral no hay postura que invertir).
      const opuesto = motorElegido === 'grafo' ? sesgoOpuesto(job?.sesgo) : null;
      if (opuesto) {
        console.log(`  🔄 Gemelo con sesgo opuesto: "${job.sesgo}" → "${opuesto}" (re-sintetiza la crónica desde las actas)`);
        cronicaB = (await cronicaConSesgo(job, opuesto)) || cronica;
      }
    }
    const scriptB = await gemini.escribirGuion(cronicaB, angle, angleContent, citasB, scriptA, motorElegido);
    const palabrasB = scriptB.split(/\s+/).filter(Boolean).length;
    // Título/descripción del gemelo salen de SU crónica: si toma la postura contraria, el
    // texto del post tiene que acompañarla, no repetir el enfoque del primero.
    const metadatosB = await gemini.variarMetadatos(cronicaB, scriptB, metadatos || {});
    const resultado = { script: scriptB, palabras: palabrasB, metadatos: metadatosB };
    if (cronicaB !== cronica) {
      if (encuadreB) resultado.encuadre = encuadreB;
      else resultado.sesgo = sesgoOpuesto(job?.sesgo);
    }
    const comoSeDiferencia = resultado.encuadre ? `encuadre ${resultado.encuadre.marco}`
      : (resultado.sesgo ? `sesgo ${resultado.sesgo}` : 'misma crónica');
    console.log(`  📝 Guion gemelo (${comoSeDiferencia}): ${palabrasB} palabras — "${metadatosB.titulo}"`);
    return resultado;
  } catch (e) {
    // Regla de robustez: el video A ya está listo. El usuario sigue con uno solo o reintenta.
    console.warn(`⚠️ No se pudo generar el guion gemelo: ${e.message}`);
    return null;
  }
}

// Guion nuevo del gemelo = sus asignaciones y su locución dejan de valer. Antes esto quedaba
// colgado (`{ ...gemela, ...resultado }` conservaba `fragments` y `audioToken` de un guion que ya
// no existía) y solo no se notaba porque el `paso` global del job los ocultaba al rehidratar. Con
// los dos videos avanzando por separado hay que limpiarlo de verdad.
function gemelaConGuionNuevo(previa, resultado) {
  const { fragments, audioToken, duracion, modelo, ...resto } = previa || {};
  return { ...resto, ...resultado };
}

// Respalda en Drive el guion de una variante. No se espera (fire-and-forget): Drive caído no puede
// frenar el pipeline, y el guion ya quedó en el job.
function respaldarGuionEnDrive(job, variante, datos) {
  if (!job?.carpetaInsumoId) return;
  if (variante === 'A') {
    driveHelper.guardarEnInsumo(job.carpetaInsumoId, 'guion.json', JSON.stringify(datos, null, 2))
      .catch(e => console.warn(`⚠️ No se pudo respaldar guion.json en Drive: ${e.message}`));
    return;
  }
  destinoInsumo(job, 'B')
    .then(d => d.carpetaId && driveHelper.guardarEnInsumo(d.carpetaId, `guion${d.sufijo}.json`, JSON.stringify(datos, null, 2)))
    .catch(e => console.warn(`⚠️ No se pudo respaldar el guion del gemelo en Drive: ${e.message}`));
}

// ETAPA 2: Generar Guion
app.post('/api/generate-script', async (req, res) => {
  try {
    const { cronica, angle, angleContent, jobId, gemela, metadatos, motor, soloGemela } = req.body;

    // Motor de guion (router `MOTORES_GUION` de gemini.js). `grafo` elige él mismo la estructura
    // narrativa a partir del catálogo de técnicas, así que en ese modo NO hace falta ángulo — es
    // justamente lo que el usuario pidió no tener que elegir.
    const motorElegido = motor && gemini.MOTORES_GUION[motor] ? motor : 'gemini';
    if (motor && !gemini.MOTORES_GUION[motor]) {
      return res.status(400).json({ error: `Motor de guion desconocido: ${motor}` });
    }
    if (!cronica) return res.status(400).json({ error: 'Falta cronica' });
    if (!angle && motorElegido !== 'grafo') {
      return res.status(400).json({ error: 'Faltan cronica o angle' });
    }

    const job = jobId ? jobStore.obtenerJob(jobId) : null;
    const materiales = job?.materialesAdicionales || [];

    // Rehacer SOLO el video B. El guion del primero se toma del job tal cual está —no se
    // reescribe— y el del gemelo se escribe contra él. Es lo que permite corregir un video sin
    // arrastrar al hermano, que puede estar ya locutado o subido.
    if (soloGemela) {
      const scriptA = job?.script;
      if (!scriptA) {
        return res.status(400).json({ error: 'No hay guion del primer video guardado: generá los dos juntos' });
      }
      console.log(`✍️ Regenerando SOLO el guion del gemelo (${motorElegido === 'grafo' ? 'estructura del grafo' : `ángulo ${angle}`})...`);
      const soloB = await escribirGuionGemelo({
        job, cronica, angle, angleContent, motorElegido, materiales, metadatos, scriptA,
      });
      if (!soloB) {
        return res.status(500).json({ error: 'No se pudo escribir el guion del gemelo' });
      }
      if (jobId) {
        try {
          // Solo se toca `gemela`. Ni `script` ni `paso`: el video A queda exactamente como estaba.
          const actualizado = jobStore.actualizarJob(jobId, { gemela: gemelaConGuionNuevo(job.gemela, soloB) });
          respaldarGuionEnDrive(actualizado, 'B', soloB);
        } catch (e) { console.warn(`⚠️ No se pudo actualizar job ${jobId}: ${e.message}`); }
      }
      return res.json({ status: 'success', script: scriptA, palabras: job.palabras, gemela: soloB });
    }

    // Si el usuario adjuntó entrevistas al inicio, el guionista tiene que saber qué frases se van
    // a escuchar con voz real para dejarles lugar (entrada + retoma) en vez de que la cita caiga
    // en mitad de una idea. Solo texto: barato, no toca el archivo.
    // En modo gemelo cada video recibe SUS citas (repartidas), no todas.
    const citasA = citasDeVariante(materiales, 'A');

    // Si la lectura propuso dos encuadres, el PRIMERO es de este video. Se re-sintetiza su crónica
    // igual que la del gemelo: si no, la pantalla diría que este canal se cuenta con un encuadre que
    // en realidad no se aplica, y solo el hermano quedaría diferenciado.
    //
    // Solo cuando hay gemelo: con un video solo no hay de qué diferenciarse, y la crónica que el
    // usuario revisó en el Paso 1 es la que corresponde usar tal cual.
    const encuadreA = gemela ? job?.encuadres?.encuadres?.[0] : null;
    let cronicaA = cronica;
    if (encuadreA) {
      console.log(`  🎯 Este video con su encuadre: "${encuadreA.titulo}" (${encuadreA.marco})`);
      cronicaA = (await cronicaConEncuadre(job, encuadreA)) || cronica;
    }

    const comoElige = motorElegido === 'grafo' ? 'estructura del grafo' : `ángulo ${angle}`;
    console.log(`✍️ Generando guion (${comoElige})${citasA.length ? `, con espacio para ${citasA.length} cita(s)` : ''}${gemela ? ' + su gemelo' : ''}...`);
    const script = await gemini.escribirGuion(cronicaA, angle, angleContent, citasA, null, motorElegido);
    const palabras = script.split(/\s+/).filter(Boolean).length;
    console.log(`  📝 Guion generado: ${palabras} palabras, ${script.length} caracteres`);

    // Video gemelo: mismos hechos, redacción distinta (ver `escribirGuionGemelo`).
    const gemelaResultado = gemela
      ? await escribirGuionGemelo({ job, cronica, angle, angleContent, motorElegido, materiales, metadatos, scriptA: script })
      : null;

    if (jobId) {
      try {
        const cambios = { paso: 'guion', script, palabras };
        if (gemelaResultado) cambios.gemela = gemelaConGuionNuevo(job?.gemela, gemelaResultado);
        const actualizado = jobStore.actualizarJob(jobId, cambios);
        respaldarGuionEnDrive(actualizado, 'A', { script, palabras });
        if (gemelaResultado) respaldarGuionEnDrive(actualizado, 'B', gemelaResultado);
      } catch (e) { console.warn(`⚠️ No se pudo actualizar job ${jobId}: ${e.message}`); }
    }

    res.json({
      status: 'success',
      script: script,
      palabras: palabras,
      gemela: gemelaResultado,   // null si no se pidió o si falló
    });
  } catch (error) {
    console.error('Error guion:', error);
    res.status(500).json({ error: error.message });
  }
});

// ETAPA 3: Fragmentación + Carpetas
app.post('/api/fragment', async (req, res) => {
  try {
    const { script, protagonista, jobId, variante = 'A' } = req.body;

    if (!script) {
      return res.status(400).json({ error: 'Falta script' });
    }

    // Obtener lista dinámica de carpetas de famosos desde Drive
    let carpetas = [];
    if (driveClient) {
      const folders = await listarCarpetasFamosos();
      carpetas = folders.map(f => f.name).sort((a, b) => a.localeCompare(b));
    }
    if (carpetas.length === 0) {
      return res.status(500).json({ error: 'No se encontraron carpetas de famosos en Drive' });
    }

    console.log(`📂 Fragmentando guion en párrafos (${carpetas.length} carpetas)...`);
    const fragments = await gemini.fragmentarGuionParrafos(script, carpetas);

    // Porcentaje de tiempo de cada párrafo (por caracteres, incluye espacios)
    const totalChars = fragments.reduce((s, f) => s + f.caracteres, 0);
    const conPorcentaje = fragments.map(f => ({
      ...f,
      porcentaje: Math.round((f.caracteres / totalChars) * 1000) / 10,
    }));

    // ¿El protagonista tiene carpeta propia? (aviso para el paso de revisión)
    const norm = s => (s || '').toLowerCase().replace(/[_\s]/g, '');
    const p = norm(protagonista);
    const protagonistaSinCarpeta = Boolean(p) && !carpetas.some(c => norm(c).includes(p) || p.includes(norm(c)));

    let materialesDisponibles = [];
    if (jobId) {
      try {
        const job = guardarEnVariante(jobId, variante, { fragments: conPorcentaje }, { paso: 'fragmentacion', carpetas });
        const destino = await destinoInsumo(job, variante);
        const nombreArchivo = `fragments${destino.sufijo}.json`;
        if (destino.carpetaId) {
          driveHelper.guardarEnInsumo(destino.carpetaId, nombreArchivo, JSON.stringify(conPorcentaje, null, 2))
            .catch(e => console.warn(`⚠️ No se pudo respaldar ${nombreArchivo} en Drive: ${e.message}`));
        }

        // Material adicional (cita/foto/video de apoyo): sugerencia automática de a qué
        // fragmento va cada uno. Regla de robustez: si falla, sigue sin sugerencias — el
        // usuario asigna a mano en el Paso 4.
        // En modo gemelo, cada variante ve SUS citas (repartidas) pero TODAS las fotos y videos.
        materialesDisponibles = job.materialesAdicionales || [];
        if (materialesDisponibles.length) {
          try {
            const items = itemsDeVariante(materialesDisponibles, variante);
            // Deja rastro de QUÉ cita le tocó a cada video: es lo único que permite confirmar en
            // producción que el reparto entre gemelos está funcionando (dos videos que salen con
            // la misma cita se ven como copias, y sin este log no habría cómo saber por qué).
            const citas = items.filter(it => it.tipo === 'cita');
            console.log(`  🎞️ Variante ${variante}: ${items.length} material(es) candidato(s)${citas.length ? ` — cita(s): ${citas.map(c => `"${(c.texto || '').slice(0, 40)}"`).join(', ')}` : ' (sin citas)'}`);
            const sugerencias = await gemini.asignarMateriales(conPorcentaje, items);
            for (const s of sugerencias) {
              const material = materialesDisponibles.find(m => m.id === s.materialId);
              const cita = s.tipo === 'cita' ? material?.citas.find(c => c.citaId === s.citaId) : null;
              conPorcentaje[s.parrafoIdx].materialAdicional = {
                materialId: s.materialId, tipo: s.tipo, citaId: s.citaId,
                ...(cita ? { inicio: cita.inicioAprox, fin: cita.finAprox } : {}),
              };
            }
            if (sugerencias.length) guardarEnVariante(jobId, variante, { fragments: conPorcentaje });
          } catch (e) { console.warn(`⚠️ Asignación de materiales falló, sigue sin sugerencias: ${e.message}`); }
        }
      } catch (e) { console.warn(`⚠️ No se pudo actualizar job ${jobId}: ${e.message}`); }
    }

    // Si los fragmentos no reconstruyen el guion, los tiempos de TODOS los clips quedan
    // corridos. No aborta (el video igual sale) pero el usuario tiene que enterarse.
    const avisoReconstruccion = fragments.verificacion && !fragments.verificacion.ok
      ? fragments.verificacion.mensaje
      : null;

    res.json({
      status: 'success',
      fragments: conPorcentaje,
      carpetas,
      protagonista,
      protagonistaSinCarpeta,
      avisoReconstruccion,
      materialesDisponibles,
    });
  } catch (error) {
    console.error('Error fragmentación:', error);
    res.status(500).json({ error: error.message });
  }
});

// ETAPA 4: Agregar Marcas ElevenLabs
app.post('/api/add-markers', async (req, res) => {
  try {
    const { fragments } = req.body;

    if (!fragments || !Array.isArray(fragments)) {
      return res.status(400).json({ error: 'Faltan fragments' });
    }

    console.log('🎙️ Agregando marcas ElevenLabs...');
    const marked = await gemini.agregarMarcas(fragments);
    console.log(`  🏷️ Guion con marcas: ${marked.length} caracteres`);

    res.json({
      status: 'success',
      marked: marked,
    });
  } catch (error) {
    console.error('Error marcas:', error);
    res.status(500).json({ error: error.message });
  }
});

// ETAPA 5 v2: Generar locución para APROBACIÓN (marcas + ElevenLabs, se escucha antes de renderizar)
// body: { fragments, modelo?: 'eleven_v3' | 'eleven_multilingual_v2' }
app.post('/api/generar-audio', async (req, res) => {
  try {
    const { fragments, modelo, jobId, variante = 'A' } = req.body;
    if (!Array.isArray(fragments) || fragments.length === 0) {
      return res.status(400).json({ error: 'Faltan fragments' });
    }

    console.log('🎙️ Generando locución para aprobación...');
    const marcado = await gemini.agregarMarcas(fragments);
    // Pronunciación por famoso: lo que se MANDA A HABLAR puede escribirse distinto de lo que se
    // muestra ("Nawat" -> "Nagüat"). El mismo mapa viaja a la alineación, que si no daría por
    // desalineada la locución entera y tiraría los subtítulos al reparto estimado.
    const mapaVoz = famosos.mapaPronunciacion();
    const paraHablar = famosos.aplicarPronunciacion(marcado, mapaVoz);
    if (paraHablar !== marcado) console.log(`  🗣️ Pronunciación aplicada a ${mapaVoz.size} nombre(s)`);
    // Fase 5: audio + alineación carácter-por-carácter en la misma llamada (sin costo extra
    // sobre lo que ya se pagaba). Si algo falla, cae al TTS simple — el render no se detiene.
    let audio, duracion, duracionesReales, palabrasAlineadas;
    try {
      audio = await tiempos.generarConTiempos(paraHablar, { modelo: modelo || 'eleven_v3' });
      duracion = await video.obtenerDuracion(audio.audioPath);
      const alineado = tiempos.alinearFragmentos(fragments, audio, duracion, mapaVoz);
      duracionesReales = alineado?.duraciones || null;
      palabrasAlineadas = alineado?.palabras || null;
    } catch (errTiempos) {
      console.warn(`  ⚠️ Tiempos reales fallaron (${errTiempos.message}), cae a TTS simple + % de caracteres`);
      audio = await elevenlabs.generarAudio(paraHablar, modelo || 'eleven_v3');
      duracion = await video.obtenerDuracion(audio.audioPath);
      duracionesReales = null;
      palabrasAlineadas = null;
    }

    const token = crypto.randomBytes(16).toString('hex');
    // Conservar solo los 8 audios más recientes. Eran 4, y con videos gemelos (2 locuciones por
    // noticia) más varias ventanas abiertas en paralelo, 4 expulsaba locuciones YA APROBADAS —
    // que es el bug de "No se encontró la locución aprobada" que ya está en la bitácora.
    const viejos = [...audiosPendientes.entries()].slice(0, Math.max(0, audiosPendientes.size - 7));
    for (const [t, a] of viejos) {
      try { fs.unlinkSync(a.path); } catch {}
      audiosPendientes.delete(t);
    }
    audiosPendientes.set(token, { path: audio.audioPath, duracion, modelo: audio.modelo, duracionesReales, palabrasAlineadas });

    console.log(`  ⏱️ ${duracion.toFixed(1)}s (${audio.modelo}) — esperando aprobación`);

    if (jobId) {
      try {
        const job = guardarEnVariante(jobId, variante, { audioToken: token, duracion, modelo: audio.modelo }, { paso: 'audio' });
        const destino = await destinoInsumo(job, variante);
        const nombreArchivo = `audio${destino.sufijo}.mp3`;
        if (destino.carpetaId) {
          fs.promises.readFile(audio.audioPath)
            .then(buffer => driveHelper.guardarEnInsumo(destino.carpetaId, nombreArchivo, buffer))
            .catch(e => console.warn(`⚠️ No se pudo respaldar ${nombreArchivo} en Drive: ${e.message}`));
        }
      } catch (e) { console.warn(`⚠️ No se pudo actualizar job ${jobId}: ${e.message}`); }
    }

    res.json({
      status: 'success',
      audioToken: token,
      audioUrl: `/api/audio/${token}`,
      duracion: Math.round(duracion),
      modelo: audio.modelo,
    });
  } catch (e) {
    console.error('Error generando audio:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Recargar el audio.mp3 desde la carpeta de insumos en Drive (force). Sirve para
// incorporar un audio generado/editado fuera de la app: el usuario lo sube a la
// carpeta del job en Drive y este endpoint lo baja, mide su duración, y lo deja
// aprobable (nuevo token en el Map) sin pasar por ElevenLabs.
app.post('/api/recargar-audio', async (req, res) => {
  try {
    const { jobId, variante = 'A' } = req.body;
    if (!jobId) return res.status(400).json({ error: 'Falta jobId' });

    const job = jobStore.obtenerJob(jobId);
    if (!job) return res.status(404).json({ error: 'Job no encontrado' });
    if (!job.carpetaInsumoId) {
      return res.status(400).json({ error: 'Este job no tiene carpeta de insumos en Drive' });
    }

    // force: re-baja aunque haya caché. La variante decide de qué carpeta (cada gemelo tiene su
    // locución en la carpeta de su canal).
    const ruta = await recuperarAudioDeDrive(job, true, variante);
    if (!ruta || !fs.existsSync(ruta)) {
      return res.status(404).json({ error: 'No hay audio.mp3 en la carpeta de insumos de Drive' });
    }

    const duracion = await video.obtenerDuracion(ruta);
    const token = crypto.randomBytes(16).toString('hex');
    audiosPendientes.set(token, { path: ruta, duracion, modelo: 'drive' });
    guardarEnVariante(jobId, variante, { audioToken: token, duracion, modelo: 'drive' }, { paso: 'audio' });

    console.log(`♻️ Audio recargado desde Drive (${jobId}, ${variante}): ${duracion.toFixed(1)}s`);
    res.json({
      status: 'success',
      audioToken: token,
      audioUrl: `/api/audio/${token}`,
      duracion: Math.round(duracion),
      modelo: 'drive',
    });
  } catch (e) {
    console.error('Error recargando audio:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ETAPA 5 (v1, compatibilidad): Generar Audio
app.post('/api/generate-audio', async (req, res) => {
  try {
    const { guionConMarcas } = req.body;

    if (!guionConMarcas) {
      return res.status(400).json({ error: 'Falta guionConMarcas' });
    }

    console.log('🎙️ Generando audio con ElevenLabs...');
    const audioResult = await elevenlabs.generarAudio(guionConMarcas);

    // Duración REAL del audio medida con ffprobe (no estimada)
    const duracionReal = await video.obtenerDuracion(audioResult.audioPath);
    console.log(`  ⏱️ Duración real del audio: ${duracionReal.toFixed(1)}s`);

    res.json({
      status: 'success',
      audioPath: audioResult.audioPath,
      audioFile: audioResult.audioFile,
      duration: Math.round(duracionReal),
      caracteres: audioResult.caracteres,
    });
  } catch (error) {
    console.error('Error audio:', error);
    res.status(500).json({ error: error.message });
  }
});

// ETAPA 6: Generar Video — el trabajo REAL.
//
// Ya no corre dentro del pedido HTTP: lo llama la cola (`colaRender`), de a uno por vez. El cuerpo
// es el mismo de siempre; lo único que cambió es que ahora recibe `params` en vez de `req.body`,
// devuelve el resultado en vez de escribirlo en `res`, y lanza en vez de responder 400/500.
//
// `params.cartelPath` viene ya resuelto desde el endpoint: el PNG del cartel se guarda a disco al
// ENCOLAR, no acá. Si el data URL (hasta 8MB en base64) viajara dentro de la tarea, terminaría
// persistido en cola.json y respaldado a Drive en cada cambio de estado.
async function renderizarVideo(params, renderId) {
  try {
    const { fragments, audioPath: audioPathBody, audioToken, destFolder, guion, metadatos, jobId, efectos, cartelPath, variante = 'A' } = params;
    // metadatos (opcional): { titulo, descripcion, protagonista, nombreCorto, linkFuente }

    // Audio: preferir el aprobado por token; compatibilidad con audioPath directo
    const audioAprobado = audioToken ? audiosPendientes.get(audioToken) : null;
    let audioPath = audioAprobado?.path || audioPathBody;
    // Fallback: si el Map se vació tras un reinicio, recuperar el audio.mp3 del job
    // desde su carpeta de insumos en Drive antes de dar por perdida la locución.
    if ((!audioPath || !fs.existsSync(audioPath)) && jobId) {
      const ruta = await recuperarAudioDeDrive(jobStore.obtenerJob(jobId), false, variante);
      if (ruta) audioPath = ruta;
    }
    if (!audioPath || !fs.existsSync(audioPath)) {
      throw new Error('No se encontró la locución aprobada: regenera el audio');
    }

    // 1. Duración real de la locución: define el tiempo total del video
    let durAudio = await video.obtenerDuracion(audioPath);
    console.log(`🎬 [${renderId}] Audio: ${durAudio.toFixed(1)}s. Buscando videos en Drive...`);

    // 1b. Material adicional por fragmento (cita con audio real / foto de apoyo / video de
    // apoyo) — opcional, degrada sin abortar el render (Regla de robustez). `materialesPorFragmento`
    // alimenta seleccion.insertarMaterialesEnPlan() más abajo; `empalmesAudio` dispara el empalme
    // de audio real cuando corresponde.
    const jobParaMateriales = jobId ? jobStore.obtenerJob(jobId) : null;
    const materialesPorFragmento = new Map(); // parrafoIdx -> {archivoId, archivoPath, nombre, tipo, esImagen, offsetInicio}
    const citasConVideo = new Map(); // parrafoIdx ORIGINAL -> material de la entrevista (se remapea tras el empalme)
    const empalmesAudio = [];
    for (let fi = 0; fi < fragments.length; fi++) {
      const ma = fragments[fi].materialAdicional;
      if (!ma) continue;
      const material = jobParaMateriales?.materialesAdicionales?.find(m => m.id === ma.materialId);
      if (!material) continue;
      if (!fs.existsSync(material.archivoPath)) {
        // Restauración perezosa: el disco de Railway es efímero, un redeploy entre "subir la
        // entrevista/foto/video" y "generar el video" lo borra (bug real de producción,
        // 2026-08-20) — antes de rendirse, intentar traerlo de vuelta del respaldo en Drive
        // (driveCache, mismo archivo que se respaldó al subirlo).
        const restaurado = await driveCache.restaurar(material.archivoPath, materiales.nombreDriveMaterial(jobId, material.archivoPath));
        if (!restaurado) {
          console.warn(`  ⚠️ [${renderId}] Material adicional del fragmento ${fi} ya no existe en disco ni en el respaldo de Drive, se ignora`);
          continue;
        }
        console.log(`  ♻️ [${renderId}] Material adicional del fragmento ${fi} restaurado desde Drive`);
      }
      if (ma.tipo === 'cita') {
        empalmesAudio.push({ parrafoIdx: fi, archivoPath: material.archivoPath, inicio: ma.inicio, fin: ma.fin, esVideo: material.tieneVideo });
        // La cita ya NO pinta sobre el fragmento que la presenta: desde el rediseño de
        // 2026-08-21 vive en su propio pseudo-fragmento, que recién existe después del empalme
        // de audio (más abajo). Acá solo se guarda a qué fragmento acompaña; si la entrevista no
        // trae video propio se deja el clip de famoso normal para lo visual (pedido explícito del
        // usuario) — solo cambia el audio de ese tramo.
        if (material.tieneVideo) {
          citasConVideo.set(fi, { archivoId: `mat_${material.id}`, archivoPath: material.archivoPath, nombre: 'Entrevista', tipo: 'cita', esImagen: false, offsetInicio: ma.inicio });
        }
      } else {
        materialesPorFragmento.set(fi, { archivoId: `mat_${material.id}`, archivoPath: material.archivoPath, nombre: material.tipo === 'foto' ? 'Foto de apoyo' : 'Video de apoyo', tipo: material.tipo, esImagen: material.tipo === 'foto', offsetInicio: 0 });
      }
    }

    let duracionesParaPlan = audioAprobado?.duracionesReales;
    let palabrasParaSubs = audioAprobado?.palabrasAlineadas;
    // Copia local de los fragmentos SOLO para este render: cada cita con audio real agrega un
    // pseudo-fragmento sin texto (ver tiempos.empalmarCitasReales). Nada de esto vuelve al job ni
    // a la UI — el guion que el usuario aprobó no se toca.
    let fragmentsRender = fragments;
    if (empalmesAudio.length > 0) {
      try {
        const baseDur = duracionesParaPlan || seleccion.tiemposPorFragmento(fragments, durAudio, null);
        const basePal = palabrasParaSubs || fragments.map(() => null);
        const empalmado = await tiempos.empalmarCitasReales(audioPath, baseDur, basePal, empalmesAudio, renderId);
        if (empalmado) {
          audioPath = empalmado.audioPath;
          duracionesParaPlan = empalmado.duraciones;
          palabrasParaSubs = empalmado.palabras;

          // La línea de tiempo ganó un hueco por cita: `fragments` tiene que crecer igual para
          // seguir siendo paralelo a duraciones/palabras (seleccion.js y subtitulos.js suman
          // duraciones en orden y confían en que los tres arrays midan lo mismo). El
          // pseudo-fragmento va sin texto — subtitulos.js salta los fragmentos sin texto, así que
          // durante la cita no sale ni un subtítulo, que es justamente lo que se quiere: ahí no
          // habla la voz en off.
          const nuevos = [...fragments];
          // `caracteres` equivalentes al tiempo que ocupa la cita: el pseudo-fragmento no tiene
          // texto, pero si algo hiciera caer el reparto al modo "% de caracteres", con 0 el hueco
          // de la cita valdría 0 segundos de video y todo lo posterior saldría corrido.
          const charsPorSegundo = (fragments.reduce((n, f) => n + (f.caracteres || 0), 0) / Math.max(durAudio, 0.001)) || 15;
          for (const ins of empalmado.inserciones) {
            const origen = fragments[ins.parrafoOrigen] || fragments[0];
            nuevos.splice(ins.indice, 0, {
              texto: '',
              famoso: origen.famoso, // fallback visual si la entrevista no trae video propio
              caracteres: Math.max(1, Math.round(ins.duracion * charsPorSegundo)),
              esCita: true,
              noFusionar: true, // no se puede fusionar con el vecino: perdería su parrafoIdx propio
            });
          }
          fragmentsRender = nuevos;

          // Reindexar los materiales al espacio de índices NUEVO, y recién ahora colgar cada
          // video de entrevista de SU pseudo-fragmento.
          const corridos = new Map();
          for (const [idxViejo, mat] of materialesPorFragmento) {
            const desplazo = empalmado.inserciones.filter(ins => ins.parrafoOrigen < idxViejo).length;
            corridos.set(idxViejo + desplazo, mat);
          }
          materialesPorFragmento.clear();
          for (const [k, v] of corridos) materialesPorFragmento.set(k, v);
          for (const ins of empalmado.inserciones) {
            const mat = citasConVideo.get(ins.parrafoOrigen);
            if (mat) materialesPorFragmento.set(ins.indice, mat);
          }

          durAudio = await video.obtenerDuracion(audioPath);
          console.log(`  🎙️ [${renderId}] ${empalmado.aplicados.length} cita(s) con audio real insertada(s)${empalmado.descartados.length ? `, ${empalmado.descartados.length} descartada(s)` : ''} — duración final ${durAudio.toFixed(1)}s`);
        }
      } catch (e) {
        console.warn(`  ⚠️ [${renderId}] Empalme de citas reales falló por completo, el video sale con voz 100% sintética: ${e.message}`);
        fragmentsRender = fragments;
        duracionesParaPlan = audioAprobado?.duracionesReales;
        palabrasParaSubs = audioAprobado?.palabrasAlineadas;
      }
    }

    // Red de seguridad: si por lo que sea los arrays quedaron desalineados, es preferible caer al
    // reparto por % de caracteres (video con tiempos aproximados) que renderizar con una línea de
    // tiempo corrida — que es exactamente como salen los subtítulos "descuadrados".
    if (duracionesParaPlan && duracionesParaPlan.length !== fragmentsRender.length) {
      console.warn(`  ⚠️ [${renderId}] duraciones(${duracionesParaPlan.length}) != fragmentos(${fragmentsRender.length}), se ignoran los tiempos reales`);
      duracionesParaPlan = null;
      palabrasParaSubs = null;
    }

    // 2. Inventario de videos por famoso (con duración de cada video)
    const mapaCarpetas = await driveHelper.obtenerCarpetasFamosos();
    const nombresNecesarios = [...new Set(fragmentsRender.map(f => f.famoso))];

    const inventario = {};
    for (const nombre of nombresNecesarios) {
      const folderId = mapaCarpetas[nombre];
      if (folderId) {
        inventario[nombre] = await driveHelper.listarVideos(folderId);
        console.log(`  📂 ${nombre}: ${inventario[nombre].length} videos`);
      } else {
        console.warn(`  ⚠️ Carpeta no encontrada: ${nombre}`);
        inventario[nombre] = [];
      }
    }

    // 3. Plan de clips: tiempo real por fragmento (Fase 5) si el audio aprobado lo trae, si no
    // % por caracteres → tomas ≤clipMax con rotación sin repetir.
    // Fase 7: con transiciones activas, cada clip que empalma con el siguiente necesita
    // `transicionDur` segundos EXTRA de metraje fuente para la cola de mezcla — bajar el techo
    // de planificación a CLIP_MAX-D asegura que esa cola nunca empuje la extracción real por
    // encima del límite legal de 3s (ver seleccion.repartirTomas y video.montarVideoPlan).
    const transicionActiva = (efectos?.transicion || 'ninguno') !== 'ninguno';
    const transicionDur = Math.min(0.6, Math.max(0.1, Number.isFinite(efectos?.transicionDur) ? efectos.transicionDur : 0.35));
    const clipMaxEfectivo = transicionActiva ? Math.max(0.8, seleccion.CLIP_MAX - transicionDur) : seleccion.CLIP_MAX;
    const planBase = seleccion.planificarClips(fragmentsRender, durAudio, inventario, duracionesParaPlan, clipMaxEfectivo);
    const plan = seleccion.insertarMaterialesEnPlan(planBase, materialesPorFragmento);
    const clipsValidos = plan.filter(Boolean);
    console.log(`  🎯 Plan: ${clipsValidos.length} clips (${[...new Set(clipsValidos.map(c => c.videoId))].length} videos distintos)${transicionActiva ? `, CLIP_MAX efectivo ${clipMaxEfectivo.toFixed(2)}s (transiciones activas)` : ''}${materialesPorFragmento.size ? `, ${materialesPorFragmento.size} con material adicional` : ''}`);

    // 4. Descargar los videos únicos del plan — los materiales adicionales ya están en disco
    // local (subidos por el usuario), se saltan de la descarga de Drive.
    //
    // En paralelo con tope: un video usa 20-30 clips distintos y bajarlos de a uno era esperar la
    // red 30 veces seguidas. El tope existe porque "todos a la vez" NO es más rápido —comparten el
    // mismo enlace y la ganancia se aplana— y además hace que Drive corte por cuota. Con 6 se
    // captura casi todo el beneficio sin provocarlo; los 403 que igual aparezcan los absorbe el
    // reintento de `driveHelper.descargarVideo`.
    const archivos = {};
    for (const m of materialesPorFragmento.values()) archivos[m.archivoId] = m.archivoPath;
    const porBajar = [...new Set(clipsValidos.map(c => c.videoId))].filter(id => !archivos[id]);
    console.log(`⬇️ [${renderId}] Descargando ${porBajar.length} clips (de a ${DESCARGAS_EN_PARALELO})...`);
    const arranque = Date.now();
    await enTandas(porBajar, DESCARGAS_EN_PARALELO, async (videoId) => {
      archivos[videoId] = await driveHelper.descargarVideo(videoId, video.TEMP_DIR);
    });
    if (porBajar.length) {
      console.log(`  ✅ ${porBajar.length} clips listos en ${((Date.now() - arranque) / 1000).toFixed(1)}s`);
    }

    // 5. Subtítulos (Fase 6): palabra por palabra resaltada, timing real si el audio aprobado
    // lo trae (Fase 5). Opt-out con efectos.subtitulos===false. Nunca aborta el render: si algo
    // falla generando el .ass, el video sale igual, sin subtítulos.
    let subsPath = null;
    let fuentesDir = null;
    if (efectos?.subtitulos !== false) {
      try {
        const tiemposFragmentos = seleccion.tiemposPorFragmento(fragmentsRender, durAudio, duracionesParaPlan);
        const fuenteElegida = efectos?.subtitulosFuente || subtitulos.FUENTE_DEFAULT;
        subsPath = subtitulos.generarASS(fragmentsRender, tiemposFragmentos, palabrasParaSubs, {
          jobId: renderId,
          tempDir: video.TEMP_DIR,
          fuente: fuenteElegida,
          tamano: Number.isFinite(efectos?.subtitulosTamano) ? efectos.subtitulosTamano : undefined,
          marginV: Number.isFinite(efectos?.subtitulosMarginV) ? efectos.subtitulosMarginV : undefined,
        });
        fuentesDir = await subtitulos.obtenerCarpetaFuentes(fuenteElegida);
      } catch (e) {
        console.warn(`  ⚠️ [${renderId}] Subtítulos no se pudieron generar (${e.message}), el video sale sin ellos`);
        subsPath = null;
      }
    }

    // 5b. Música por sentido (Fase 8c). Opt-out con efectos.musica===false. El tono es
    // efectos.musicaTono si el usuario eligió uno a mano (Paso 6); si no, el que dejó la
    // síntesis (Fase 8a) en el job — sin ninguno de los dos, cae a "neutral" dentro de
    // emparejarCarpetaTono(); si ni neutral existe, sale sin música. Nunca aborta el render por
    // esto: cualquier fallo acá deja musicaPath en null y sigue.
    let musicaPath = null;
    let musicaOffset = 0;
    let musicaGananciaDb = musica.GANANCIA_DEFAULT_DB; // se recalcula por pista según su loudness medido
    if (efectos?.musica !== false) {
      try {
        const jobActual = jobId ? jobStore.obtenerJob(jobId) : null;
        const tono = (efectos?.musicaTono && efectos.musicaTono !== 'auto') ? efectos.musicaTono : (jobActual?.tono || 'neutral');
        const carpetasMusica = await driveHelper.obtenerCarpetasMusica();
        let folderId = seleccion.emparejarCarpetaTono(tono, carpetasMusica);
        let pistas = folderId ? await driveHelper.listarMusica(folderId) : [];
        if (pistas.length === 0 && tono !== 'neutral') {
          // Carpeta del tono vacía (o no encontrada): cae a neutral, nunca a algo alegre por defecto.
          folderId = seleccion.emparejarCarpetaTono('neutral', carpetasMusica);
          pistas = folderId ? await driveHelper.listarMusica(folderId) : [];
        }
        if (pistas.length > 0) {
          const elegida = seleccion.elegirPista(`musica_${tono}`, pistas);
          const ext = (elegida.name.match(/\.[^.]+$/) || ['.mp3'])[0];
          musicaPath = await driveHelper.descargarMusica(elegida.id, video.TEMP_DIR, ext);
          musicaOffset = musica.offsetDeNombre(elegida.name);

          // Emparejar el volumen: cada pista se atenúa lo que ELLA necesita para quedar al mismo
          // nivel que todas las demás, en vez de bajarles a todas el mismo número (que conserva
          // las diferencias de origen — ver OBJETIVO_LUFS en musica.js).
          let lufs = musica.lufsDeNombre(elegida.name);
          if (lufs === null) {
            // Pista nueva sin medir: se mide ahora, que el archivo ya está en disco, y se etiqueta
            // en Drive para que el próximo render la lea del nombre y no vuelva a analizarla.
            lufs = await musica.medirLoudness(musicaPath, musicaOffset);
            if (Number.isFinite(lufs)) {
              const base = elegida.name.replace(/\.[^.]+$/, '');
              driveHelper.renombrarArchivo(elegida.id, `${base} [lufs=${lufs.toFixed(1)}]${ext}`)
                .catch(e => console.warn(`  ⚠️ No se pudo etiquetar el loudness de "${elegida.name}": ${e.message}`));
            }
          }
          musicaGananciaDb = musica.gananciaPara(lufs, efectos?.musicaVolumenDb);
          console.log(`  🎵 [${renderId}] Música (${tono}): "${elegida.name}" (offset ${musicaOffset}s, ${Number.isFinite(lufs) ? `${lufs.toFixed(1)} LUFS → ` : 'sin medir → '}${musicaGananciaDb}dB)`);
        } else {
          console.warn(`  ⚠️ [${renderId}] Sin pistas de música disponibles (tono "${tono}" y neutral vacíos), el video sale sin música`);
        }
      } catch (e) {
        console.warn(`  ⚠️ [${renderId}] No se pudo resolver música (${e.message}), el video sale sin ella`);
      }
    }

    // Nombre de archivo: "2026-07-11 Protagonista - Secundario - Hecho.mp4" — adelantado a ANTES
    // del render (antes vivía después) porque el cartel del frame 0 (más abajo) lo necesita para
    // nombrar la subcarpeta. Viene de la lectura (sin llamada extra a Gemini); fallback:
    // generarlo desde el guion.
    const fecha = new Date().toISOString().slice(0, 10);
    const nombreCorto = metadatos?.nombreCorto
      || await gemini.generarNombreArchivo(guion || fragments.map(f => f.texto).join(' '));
    const fileName = `${fecha} ${nombreCorto}.mp4`;

    // Cartel de portada (Paso 6): el navegador ya lo dibujó y manda el PNG EXACTO que el usuario
    // vio en la previa. El server no lo re-dibuja — solo lo guarda en disco y lo superpone dos
    // veces, idéntico las dos: en el frame 0 acá abajo, y en el JPG cuando el usuario elija un
    // fotograma real (POST /api/portada, que lee esta misma ruta desde `previews`). Antes esto
    // reconstruía la geometría a partir de texto/fuente/tamaño/caja, con la lógica duplicada
    // entre servidor y navegador: siempre terminaban difiriendo (ver portada.js).
    // (El PNG ya quedó en disco al encolar — acá solo se usa la ruta.)

    // 6. Montar (cortes secos, zoom/espejo opcionales, subtítulos quemados, cartel en el frame 0
    // y música si se generaron). Hyperframes retirado: no terminó de funcionar. El código queda
    // en video.js (montarVideoHyper) y en el historial de git por si se retoma.
    console.log(`🎞️ [${renderId}] Montando video con FFmpeg...`);
    const resultado = await video.montarVideoPlan(plan, archivos, audioPath, renderId, {
      ...(efectos || {}), subsPath, fuentesDir, musicaPath, musicaOffset, musicaGananciaDb,
      cartelPath,
    });
    console.log(`  ✅ ${resultado.clips} clips montados, duración final: ${resultado.duracion}s${resultado.conMusica ? ' (con música)' : ''}`);

    // 7. Guardar el video SUELTO en la carpeta del canal, sin subcarpeta por video.
    //
    // Antes cada render creaba una subcarpeta "AAAA-MM-DD - Título" para que el video y su portada
    // quedaran juntos. Cambió con la carpeta "para publicar" (2026-08-22): esa carpeta va a
    // alimentar al publicador automático, y ahí "todo archivo nuevo en la carpeta de este canal se
    // publica en este canal" es una regla de una línea — con subcarpetas habría que recorrer
    // niveles y distinguir carpeta de archivo. La portada queda al lado con el MISMO nombre base
    // (`.mp4` y `.jpg`), que es lo que le dice al publicador que van juntos, y las imágenes que el
    // usuario suba a mano entran en la misma lógica sin ninguna excepción.
    const folderName = await driveHelper.nombreCarpeta(destFolder);
    const localBase = process.env.RENDERS_LOCAL_PATH;
    let driveLink;
    // Dónde guardar la portada más tarde (se genera después, con el usuario ya viendo el
    // resultado). `nombreBase` incluye ahora la fecha, porque ya no hay carpeta con fecha que la
    // aporte: el JPG tiene que llamarse igual que el MP4 para quedar emparejado con él.
    const nombreBasePortada = fileName.replace(/\.mp4$/i, '');
    let destinoPortada = null;
    // Id del archivo en Drive: lo necesita el publicador automático para encontrar el video sin
    // tener que buscarlo por nombre. Queda null si el video se guardó en la carpeta local (ahí lo
    // sube el cliente de escritorio de Drive y el id recién existe después de sincronizar).
    let archivoDriveId = null;

    if (localBase && fs.existsSync(path.join(localBase, folderName))) {
      // Copiar a la carpeta local de Google Drive (el cliente de escritorio la sincroniza solo)
      const carpetaCanal = path.join(localBase, folderName);
      const destPath = path.join(carpetaCanal, fileName);
      console.log(`💾 [${renderId}] Guardando en Drive local: ${destPath}`);
      fs.copyFileSync(resultado.finalPath, destPath);
      driveLink = `https://drive.google.com/drive/folders/${destFolder}`;
      destinoPortada = { modo: 'local', carpetaLocal: carpetaCanal, nombreBase: nombreBasePortada };
    } else {
      // Fallback: subir por API (requiere OAuth, los Service Accounts no tienen cuota)
      console.log(`⬆️ [${renderId}] Subiendo a Drive por API: ${fileName}`);
      const subido = await driveHelper.subirVideo(resultado.finalPath, fileName, destFolder);
      driveLink = subido.webViewLink;
      archivoDriveId = subido.id || null;
      destinoPortada = { modo: 'api', carpetaDriveId: destFolder, nombreBase: nombreBasePortada };
    }

    // 8. Respaldar la locución en Drive con el mismo nombre que el video
    try {
      if (localBase) {
        const audiosDir = path.join(path.dirname(localBase), 'audios');
        fs.mkdirSync(audiosDir, { recursive: true });
        const audioBackup = path.join(audiosDir, fileName.replace(/\.mp4$/i, '.mp3'));
        fs.copyFileSync(audioPath, audioBackup);
        console.log(`🎵 [${renderId}] Audio respaldado: ${audioBackup}`);
      }
    } catch (e) {
      console.warn(`⚠️ [${renderId}] No se pudo respaldar el audio: ${e.message}`);
    }

    // 9. Registrar en Google Sheets (si falla, el video ya está guardado: solo avisar)
    try {
      await sheets.registrarVideo({
        fecha,
        titulo: metadatos?.titulo,
        descripcion: metadatos?.descripcion,
        protagonista: metadatos?.protagonista,
        canal: folderName,
        nombreArchivo: fileName,
        linkFuente: metadatos?.linkFuente,
        linkRender: driveLink,
        guion: guion || '',
        // Campos para el publicador automático (proyecto aparte). `idNoticia` es el jobId: los dos
        // videos gemelos lo comparten, así el publicador sabe que son la misma historia en canales
        // hermanos.
        tipo: 'video',
        destino: 'feed',
        idNoticia: jobId || '',
        archivoDriveId,
      });
    } catch (e) {
      console.warn(`⚠️ [${renderId}] No se pudo registrar en Sheets: ${e.message}`);
    }

    // 10. Registrar preview (copia que sobrevive a la limpieza de temporales) — junto con
    // `destino`, para que /api/portada sepa dónde dejar la miniatura al lado del video.
    const previewToken = crypto.randomBytes(16).toString('hex');
    const previewPath = path.join(video.TEMP_DIR, `preview_${previewToken}.mp4`);
    try {
      fs.copyFileSync(resultado.finalPath, previewPath);
      // Conservar solo los 3 previews más recientes
      const viejos = [...previews.entries()].slice(0, Math.max(0, previews.size - 2));
      for (const [tok, entrada] of viejos) {
        try { fs.unlinkSync(entrada.path); } catch {}
        if (entrada.cartelPath) { try { fs.unlinkSync(entrada.cartelPath); } catch {} }
        previews.delete(tok);
      }
      previews.set(previewToken, { path: previewPath, destino: destinoPortada, cartelPath });
    } catch (e) {
      console.warn(`⚠️ [${renderId}] No se pudo crear el preview: ${e.message}`);
    }

    // 11. Limpiar temporales (incluido el video final)
    video.limpiarTemporales(renderId);
    // El audio NO se borra si todavía lo referencia una locución aprobada o un render que espera
    // turno en la cola. Bug real encontrado probando gemelos de punta a punta (2026-08-22): el
    // render del primer video borraba el mp3 y el segundo, que ya estaba encolado, fallaba con
    // "No se encontró la locución aprobada". Además el borrado a mano contradecía a
    // `limpiarCache()`, que justamente protege los audios de `audiosPendientes` — el TTL de esa
    // limpieza ya se encarga de los que quedan sueltos.
    if (!audioSigueEnUso(audioPath)) {
      try { fs.unlinkSync(audioPath); } catch {}
    }

    if (jobId) {
      try {
        // `paso: 'completado'` es del JOB, no de la variante: se marca cuando termina cualquiera
        // de los dos videos (el historial muestra el proceso como terminado desde el primero).
        const job = guardarEnVariante(jobId, variante, { fileName, folderName, driveLink }, { paso: 'completado' });
        const destino = await destinoInsumo(job, variante);
        const nombreArchivo = `resultado${destino.sufijo}.json`;
        if (destino.carpetaId) {
          driveHelper.guardarEnInsumo(destino.carpetaId, nombreArchivo, JSON.stringify({ fileName, folderName, driveLink }, null, 2))
            .catch(e => console.warn(`⚠️ No se pudo respaldar ${nombreArchivo} en Drive: ${e.message}`));
        }
      } catch (e) { console.warn(`⚠️ No se pudo actualizar job ${jobId}: ${e.message}`); }
    }

    console.log(`✅ [${renderId}] Video guardado: ${fileName}`);
    return {
      status: 'success',
      fileName: fileName,
      folderName: folderName,
      duration: resultado.duracion,
      driveLink: driveLink,
      previewUrl: previews.has(previewToken) ? `/api/preview/${previewToken}` : null,
      // URL del PNG del cartel (el mismo que se quemó en el frame 0). El cliente lo usa para
      // saber si mostrar el paso "elegir portada" y para dibujarlo encima del fotograma elegido
      // —la imagen REAL, ya no una aproximación en CSS.
      cartelUrl: (cartelPath && previews.has(previewToken)) ? `/api/cartel/${previewToken}` : null,
    };
  } catch (error) {
    console.error(`Error video [${renderId}]:`, error);
    video.limpiarTemporales(renderId);
    throw error; // la cola lo marca como tarea fallida y sigue con la siguiente
  }
}

// El endpoint ya no renderiza: valida lo barato, deja el cartel en disco y encola. Responde al
// instante con el id del render, y el navegador sondea `/api/render/:renderId`. Así un render
// largo no puede cruzar el límite de tiempo del gateway de Railway, y —más importante— dos
// renders nunca corren a la vez pisándose en historial.json (ver colaRender.js).
app.post('/api/generate-video', async (req, res) => {
  try {
    const { fragments, destFolder, efectos, jobId, variante, etiqueta, canal } = req.body;

    if (!fragments || !Array.isArray(fragments) || fragments.length === 0) {
      return res.status(400).json({ error: 'Faltan fragments' });
    }
    if (!destFolder) {
      return res.status(400).json({ error: 'Falta destFolder' });
    }
    // Navegador con la versión vieja del front cargada (pestaña abierta desde antes del deploy):
    // manda `portadaTitular` —el campo que se usaba cuando el server redibujaba el cartel— y no
    // el PNG que ahora dibuja el navegador. Sin esta guarda el render salía SIN cartel y sin
    // explicación: no aparecía ni la opción de generar el JPG. Pasó de verdad tras el primer
    // deploy de ese cambio, y no había forma de saber por qué.
    if (efectos?.portadaTitular && !efectos?.cartelPNG) {
      return res.status(400).json({
        error: 'Tenés cargada una versión vieja de la página: recargala (Cmd/Ctrl + Shift + R) y volvé a generar. El cartel de portada ahora lo dibuja el navegador, y esta pestaña todavía no tiene ese código.',
      });
    }

    // El PNG se escribe a disco ACÁ, con el renderId que va a usar la tarea, y en la tarea viaja
    // solo la ruta (ver comentario de renderizarVideo).
    const renderId = colaRender.nuevoRenderId();
    const cartelPath = guardarCartelPNG(efectos?.cartelPNG, renderId);
    const efectosSinPNG = { ...(efectos || {}) };
    delete efectosSinPNG.cartelPNG;

    const tarea = colaRender.encolar({
      renderId,
      jobId: jobId || null,
      variante: variante || 'A',
      etiqueta: etiqueta || req.body?.metadatos?.nombreCorto || 'Video',
      canal: canal || '',
      params: { ...req.body, efectos: efectosSinPNG, cartelPath },
    });

    console.log(`📋 [${tarea.renderId}] Encolado (${tarea.etiqueta}${tarea.canal ? ` → ${tarea.canal}` : ''})`);
    res.json({ status: 'encolado', ...colaRender.obtener(tarea.renderId) });
  } catch (error) {
    console.error('Error encolando video:', error);
    res.status(500).json({ error: error.message });
  }
});

// Estado de UN render (el que sondea la ventana que lo pidió). Cuando termina, `resultado` trae
// exactamente el mismo objeto que este endpoint devolvía antes de existir la cola.
app.get('/api/render/:renderId', (req, res) => {
  const tarea = colaRender.obtener(req.params.renderId);
  if (!tarea) return res.status(404).json({ error: 'Render no encontrado' });
  res.json(tarea);
});

// Panorama completo de la cola: qué se renderiza ahora, qué espera y qué terminó recién. Lo
// consultan TODAS las ventanas abiertas — el usuario trabaja varias noticias en paralelo y
// necesita ver cuánto tiene por delante antes de que le toque.
app.get('/api/cola', (req, res) => {
  res.json(colaRender.listar());
});

// ETAPA 6 (modo Insumos): Exportar fragmentos numerados + locución, sin componer video final.
// A diferencia de generate-video, no pide destFolder: usa la carpeta de insumos que el job ya
// tiene desde /api/read (mismo canal elegido en Paso 1, sin preguntar destino de nuevo).
app.post('/api/exportar', async (req, res) => {
  const renderId = `job_${Date.now()}`;
  try {
    const { fragments, audioToken, guion, metadatos, jobId, efectos } = req.body;

    if (!fragments || !Array.isArray(fragments) || fragments.length === 0) {
      return res.status(400).json({ error: 'Faltan fragments' });
    }
    const job = jobId ? jobStore.obtenerJob(jobId) : null;
    if (!job || !job.carpetaInsumoId) {
      return res.status(400).json({ error: 'Job no encontrado o sin carpeta de insumos en Drive' });
    }

    const audioAprobado = audioToken ? audiosPendientes.get(audioToken) : null;
    let audioPath = audioAprobado?.path;
    if (!audioPath || !fs.existsSync(audioPath)) {
      const ruta = await recuperarAudioDeDrive(job);
      if (ruta) audioPath = ruta;
    }
    if (!audioPath || !fs.existsSync(audioPath)) {
      return res.status(400).json({ error: 'No se encontró la locución aprobada: regenera el audio' });
    }

    const durAudio = await video.obtenerDuracion(audioPath);
    console.log(`✂️ [${renderId}] Audio: ${durAudio.toFixed(1)}s. Buscando videos en Drive...`);

    const mapaCarpetas = await driveHelper.obtenerCarpetasFamosos();
    const nombresNecesarios = [...new Set(fragments.map(f => f.famoso))];
    const inventario = {};
    for (const nombre of nombresNecesarios) {
      const folderId = mapaCarpetas[nombre];
      if (folderId) {
        inventario[nombre] = await driveHelper.listarVideos(folderId);
        console.log(`  📂 ${nombre}: ${inventario[nombre].length} videos`);
      } else {
        console.warn(`  ⚠️ Carpeta no encontrada: ${nombre}`);
        inventario[nombre] = [];
      }
    }

    const plan = seleccion.planificarClips(fragments, durAudio, inventario, audioAprobado?.duracionesReales);
    const clipsValidos = plan.filter(Boolean);
    console.log(`  🎯 Plan: ${clipsValidos.length} fragmentos`);

    console.log(`⬇️ [${renderId}] Descargando clips...`);
    const archivos = {};
    for (const videoId of [...new Set(clipsValidos.map(c => c.videoId))]) {
      archivos[videoId] = await driveHelper.descargarVideo(videoId, video.TEMP_DIR);
    }

    const tmpDir = path.join(video.TEMP_DIR, `${renderId}_out`);
    console.log(`✂️ [${renderId}] Cortando fragmentos...`);
    const resultado = await exportar.exportarInsumos(plan, archivos, audioPath, tmpDir, efectos || {});

    console.log(`⬆️ [${renderId}] Subiendo ${resultado.archivos.length + 1} archivos a Drive...`);
    for (const nombre of resultado.archivos) {
      await driveHelper.subirVideo(path.join(tmpDir, nombre), nombre, job.carpetaInsumoId, 'video/mp4');
    }
    await driveHelper.subirVideo(path.join(tmpDir, 'locucion.mp3'), 'locucion.mp3', job.carpetaInsumoId, 'audio/mpeg');
    fs.rmSync(tmpDir, { recursive: true, force: true });

    video.limpiarTemporales(renderId);
    if (audioToken) audiosPendientes.delete(audioToken);

    const driveLink = `https://drive.google.com/drive/folders/${job.carpetaInsumoId}`;
    const canalNombre = await driveHelper.nombreCarpeta(job.canalId).catch(() => job.canalId);

    if (jobId) {
      try {
        jobStore.actualizarJob(jobId, { paso: 'completado', insumosExportados: resultado.fragmentos, driveLink });
        driveHelper.guardarEnInsumo(job.carpetaInsumoId, 'resultado.json', JSON.stringify({ fragmentos: resultado.fragmentos, driveLink }, null, 2))
          .catch(e => console.warn(`⚠️ No se pudo respaldar resultado.json en Drive: ${e.message}`));
      } catch (e) { console.warn(`⚠️ No se pudo actualizar job ${jobId}: ${e.message}`); }
    }

    try {
      await sheets.registrarVideo({
        fecha: new Date().toISOString().slice(0, 10),
        titulo: metadatos?.titulo,
        descripcion: metadatos?.descripcion,
        protagonista: metadatos?.protagonista,
        canal: canalNombre,
        nombreArchivo: job.nombreCorto || metadatos?.nombreCorto || renderId,
        linkFuente: metadatos?.linkFuente,
        linkRender: driveLink,
        guion: guion || '',
        status: 'insumos_exportados',
      });
    } catch (e) {
      console.warn(`⚠️ [${renderId}] No se pudo registrar en Sheets: ${e.message}`);
    }

    console.log(`✅ [${renderId}] ${resultado.fragmentos} fragmentos + locucion.mp3 exportados`);
    res.json({
      status: 'success',
      fragmentos: resultado.fragmentos,
      folderName: canalNombre,
      driveLink,
    });
  } catch (error) {
    console.error(`Error exportando insumos [${renderId}]:`, error);
    video.limpiarTemporales(renderId);
    res.status(500).json({ error: error.message });
  }
});

// Historial de jobs (persistencia local): recuperar/listar procesos por jobId
// El usuario confirma o corrige en el Paso 1 los nombres detectados. Cada corrección se aplica a
// TODA la lectura guardada (crónica incluida, que es de donde se escribe el guion) y queda
// APRENDIDA: la próxima vez que Gemini oiga mal ese nombre, se corrige solo y sin preguntar.
// Acá también se guarda la pronunciación, que es lo que después escucha ElevenLabs.
app.put('/api/nombres', (req, res) => {
  try {
    const { jobId, nombres } = req.body;
    if (!Array.isArray(nombres) || nombres.length === 0) {
      return res.status(400).json({ error: 'Faltan nombres' });
    }
    const job = jobId ? jobStore.obtenerJob(jobId) : null;
    if (jobId && !job) return res.status(404).json({ error: 'Job no encontrado' });

    let lectura = job ? {
      cronica: job.cronica, titulo: job.titulo, descripcion: job.descripcion,
      protagonista: job.protagonista, secundario: job.secundario,
      accion: job.accion, nombreCorto: job.nombreCorto,
    } : null;

    const aplicados = [];
    for (const n of nombres) {
      const escribir = (n?.escribir || '').trim();
      if (!escribir) continue;
      const leido = (n?.leido || '').trim();
      famosos.registrar({ escribir, leido: leido || null, decir: n?.decir, carpeta: n?.carpeta });
      if (lectura && leido && leido !== escribir) {
        lectura = famosos.reemplazarEn(lectura, leido, escribir);
        aplicados.push(`${leido} -> ${escribir}`);
      }
    }

    if (job && lectura) jobStore.actualizarJob(jobId, lectura);
    if (aplicados.length) console.log(`  ✏️ Nombres corregidos a mano: ${aplicados.join(', ')}`);
    res.json({ status: 'success', aplicados, ...(lectura || {}) });
  } catch (e) {
    console.error('Error guardando nombres:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/jobs', (req, res) => {
  res.json({ jobs: jobStore.listarJobs(20) });
});

app.get('/api/jobs/:jobId', (req, res) => {
  const job = jobStore.obtenerJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job no encontrado' });
  res.json(job);
});

// Historial real desde la Hoja de Cálculo (título, descripción+hashtags, guion, etc.)
app.get('/api/historial', async (req, res) => {
  try {
    const filas = await sheets.leerHistorial(20);
    res.json({ historial: filas });
  } catch (error) {
    console.error('Error leyendo historial de Sheets:', error);
    res.status(500).json({ error: error.message });
  }
});

// Limpieza de cache cada hora: borra de temp-videos los archivos de más de 1h
// (clips descargados src_*, previews y audios huérfanos) para no llenar el disco.
const UNA_HORA = 60 * 60 * 1000;
function limpiarCache() {
  try {
    const ahora = Date.now();
    const activos = new Set([
      ...[...previews.values()].map(entrada => entrada.path),
      // El PNG del cartel tiene que sobrevivir tanto como su preview: el usuario puede tardar
      // más de 1h en elegir el fotograma, y sin este archivo /api/portada no puede armar el JPG
      // (es el cartel mismo, ya no se puede redibujar a partir de parámetros).
      ...[...previews.values()].map(entrada => entrada.cartelPath).filter(Boolean),
      ...[...portadas.values()],
      ...[...audiosPendientes.values()].map(a => a.path),
      // Archivos de renders que todavía esperan turno en la cola: con varias ventanas trabajando
      // en paralelo, una tarea puede pasar más de 1h en la fila y llegar a su turno con el cartel
      // y la locución ya barridos por el TTL.
      ...colaRender.rutasProtegidas(),
    ].map(p => path.basename(p)));

    for (const f of fs.readdirSync(video.TEMP_DIR)) {
      if (activos.has(f)) continue; // no tocar previews/carteles/audios en uso
      if (/^yt-dlp-legacy/.test(f)) continue; // binario de fallback (fuentes.js) — cachear, no volver a descargar cada hora
      const ruta = path.join(video.TEMP_DIR, f);
      // materiales/<jobId>/ es una CARPETA — fs.unlinkSync tira EISDIR (silenciado por el catch
      // de abajo, así que nunca se limpiaba sola). TTL más generoso que el resto (6h en vez de
      // 1h): el usuario puede tardar en pasar del Paso 1 al render con el material ya subido.
      if (f === 'materiales') {
        try {
          for (const jobDir of fs.readdirSync(ruta)) {
            const jobRuta = path.join(ruta, jobDir);
            try {
              if (ahora - fs.statSync(jobRuta).mtimeMs > 6 * UNA_HORA) fs.rmSync(jobRuta, { recursive: true, force: true });
            } catch {}
          }
        } catch {}
        continue;
      }
      try {
        if (ahora - fs.statSync(ruta).mtimeMs > UNA_HORA) fs.unlinkSync(ruta);
      } catch {}
    }
    console.log('🧹 Cache limpiado (archivos de más de 1h)');
  } catch {}
}
setInterval(limpiarCache, UNA_HORA);

// Iniciar servidor
initializeDrive();

// Bloque D: restaurar historial.json/jobs.json desde Drive si el disco llegó vacío
// (Railway lo borra en cada redeploy). Fire-and-forget: no bloquea el arranque.
driveCache.restaurar(path.join(__dirname, 'historial.json'), 'historial.json');
driveCache.restaurar(path.join(__dirname, 'data', 'jobs.json'), 'jobs.json');
driveCache.restaurar(famosos.TABLA_PATH, famosos.NOMBRE_DRIVE);

// Cola de renderizado: primero traer del respaldo lo que el redeploy borró del disco, y recién
// después rehidratar y arrancar el worker — al revés, la cola arrancaría vacía y los renders que
// estaban esperando se perderían sin que nadie se entere.
driveCache.restaurar(path.join(__dirname, 'data', 'cola.json'), 'cola.json')
  .catch(() => {})
  .then(() => {
    colaRender.rehidratar();
    colaRender.configurar(renderizarVideo);
  });

// Las carpetas de insumos en Drive crecían sin límite (nadie las borraba). Al ser
// contenido noticioso pierden vigencia rápido: se mandan a la papelera a las 48h.
limpiezaInsumos.start();

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`🔑 Usa API Key: ${API_KEY}`);
});

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
const subtitulos = require('./subtitulos');
const jobStore = require('./jobStore');
const driveCache = require('./driveCache');
const limpiezaInsumos = require('./limpiezaInsumos');
const exportar = require('./exportar');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY;

// Middleware
app.use(cors());
app.use(express.json());
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
  if (req.path === '/key-prompt' || req.path === '/health' || req.path.startsWith('/preview/') || req.path.startsWith('/audio/')) {
    return next();
  }
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== API_KEY) {
    return res.status(401).json({ error: 'API Key inválida' });
  }
  next();
};

app.use('/api', authenticateApiKey);

// Previews en memoria: token aleatorio -> ruta del MP4 renderizado
const previews = new Map();

// Audios pendientes de aprobación: token -> {path, duracion, modelo}
const audiosPendientes = new Map();

// Recuperar el audio.mp3 de un job desde su carpeta de insumos en Drive, a disco local.
// Se usa cuando el Map audiosPendientes se vació (reinicio del server / redeploy de Railway)
// pero el audio ya fue generado y respaldado. Devuelve la ruta local, o null si no hay nada.
async function recuperarAudioDeDrive(job, force = false) {
  if (!job || !job.carpetaInsumoId) return null;
  const destPath = path.join(__dirname, 'temp-videos', `audio_recuperado_${job.jobId}.mp3`);
  // force=true: el usuario reemplazó el audio.mp3 en Drive y quiere re-bajarlo aunque
  // ya haya una copia local cacheada (botón "Recargar audio desde Drive").
  if (fs.existsSync(destPath)) {
    if (!force) return destPath; // ya restaurado en una llamada anterior
    try { fs.unlinkSync(destPath); } catch {}
  }
  try {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const ruta = await driveHelper.descargarDeInsumo(job.carpetaInsumoId, 'audio.mp3', destPath);
    if (ruta) console.log(`♻️ Audio recuperado desde Drive: ${job.jobId}`);
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
    const job = jobStore.buscarPorAudioToken(token);
    const ruta = await recuperarAudioDeDrive(job);
    if (ruta) {
      audio = { path: ruta, duracion: job.duracion, modelo: job.modelo };
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
  const ruta = previews.get(req.params.token);
  if (!ruta || !fs.existsSync(ruta)) {
    return res.status(404).json({ error: 'Preview no disponible' });
  }
  res.sendFile(ruta);
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
    const result = await gemini.sintetizarCronica(todasLasFuentes.map(f => f.acta), sesgoElegido);

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
    const result = await gemini.sintetizarCronica(job.fuentes.map(f => f.acta), sesgoElegido);

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
    });
  } catch (error) {
    console.error('Error re-síntesis:', error);
    res.status(500).json({ error: error.message });
  }
});

// ETAPA 2: Generar Guion
app.post('/api/generate-script', async (req, res) => {
  try {
    const { cronica, angle, angleContent, jobId } = req.body;

    if (!cronica || !angle) {
      return res.status(400).json({ error: 'Faltan cronica o angle' });
    }

    console.log(`✍️ Generando guion (ángulo ${angle})...`);
    const script = await gemini.generarGuion(cronica, angle, angleContent);
    const palabras = script.split(/\s+/).filter(Boolean).length;
    console.log(`  📝 Guion generado: ${palabras} palabras, ${script.length} caracteres`);

    if (jobId) {
      try {
        const job = jobStore.actualizarJob(jobId, { paso: 'guion', script, palabras });
        if (job.carpetaInsumoId) {
          driveHelper.guardarEnInsumo(job.carpetaInsumoId, 'guion.json', JSON.stringify({ script, palabras }, null, 2))
            .catch(e => console.warn(`⚠️ No se pudo respaldar guion.json en Drive: ${e.message}`));
        }
      } catch (e) { console.warn(`⚠️ No se pudo actualizar job ${jobId}: ${e.message}`); }
    }

    res.json({
      status: 'success',
      script: script,
      palabras: palabras,
    });
  } catch (error) {
    console.error('Error guion:', error);
    res.status(500).json({ error: error.message });
  }
});

// ETAPA 3: Fragmentación + Carpetas
app.post('/api/fragment', async (req, res) => {
  try {
    const { script, protagonista, jobId } = req.body;

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

    if (jobId) {
      try {
        const job = jobStore.actualizarJob(jobId, { paso: 'fragmentacion', fragments: conPorcentaje, carpetas });
        if (job.carpetaInsumoId) {
          driveHelper.guardarEnInsumo(job.carpetaInsumoId, 'fragments.json', JSON.stringify(conPorcentaje, null, 2))
            .catch(e => console.warn(`⚠️ No se pudo respaldar fragments.json en Drive: ${e.message}`));
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
    const { fragments, modelo, jobId } = req.body;
    if (!Array.isArray(fragments) || fragments.length === 0) {
      return res.status(400).json({ error: 'Faltan fragments' });
    }

    console.log('🎙️ Generando locución para aprobación...');
    const marcado = await gemini.agregarMarcas(fragments);
    // Fase 5: audio + alineación carácter-por-carácter en la misma llamada (sin costo extra
    // sobre lo que ya se pagaba). Si algo falla, cae al TTS simple — el render no se detiene.
    let audio, duracion, duracionesReales, palabrasAlineadas;
    try {
      audio = await tiempos.generarConTiempos(marcado, { modelo: modelo || 'eleven_v3' });
      duracion = await video.obtenerDuracion(audio.audioPath);
      const alineado = tiempos.alinearFragmentos(fragments, audio, duracion);
      duracionesReales = alineado?.duraciones || null;
      palabrasAlineadas = alineado?.palabras || null;
    } catch (errTiempos) {
      console.warn(`  ⚠️ Tiempos reales fallaron (${errTiempos.message}), cae a TTS simple + % de caracteres`);
      audio = await elevenlabs.generarAudio(marcado, modelo || 'eleven_v3');
      duracion = await video.obtenerDuracion(audio.audioPath);
      duracionesReales = null;
      palabrasAlineadas = null;
    }

    const token = crypto.randomBytes(16).toString('hex');
    // Conservar solo los 4 audios más recientes
    const viejos = [...audiosPendientes.entries()].slice(0, Math.max(0, audiosPendientes.size - 3));
    for (const [t, a] of viejos) {
      try { fs.unlinkSync(a.path); } catch {}
      audiosPendientes.delete(t);
    }
    audiosPendientes.set(token, { path: audio.audioPath, duracion, modelo: audio.modelo, duracionesReales, palabrasAlineadas });

    console.log(`  ⏱️ ${duracion.toFixed(1)}s (${audio.modelo}) — esperando aprobación`);

    if (jobId) {
      try {
        const job = jobStore.actualizarJob(jobId, { paso: 'audio', audioToken: token, duracion, modelo: audio.modelo });
        if (job.carpetaInsumoId) {
          fs.promises.readFile(audio.audioPath)
            .then(buffer => driveHelper.guardarEnInsumo(job.carpetaInsumoId, 'audio.mp3', buffer))
            .catch(e => console.warn(`⚠️ No se pudo respaldar audio.mp3 en Drive: ${e.message}`));
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
    const { jobId } = req.body;
    if (!jobId) return res.status(400).json({ error: 'Falta jobId' });

    const job = jobStore.obtenerJob(jobId);
    if (!job) return res.status(404).json({ error: 'Job no encontrado' });
    if (!job.carpetaInsumoId) {
      return res.status(400).json({ error: 'Este job no tiene carpeta de insumos en Drive' });
    }

    const ruta = await recuperarAudioDeDrive(job, true); // force: re-baja aunque haya caché
    if (!ruta || !fs.existsSync(ruta)) {
      return res.status(404).json({ error: 'No hay audio.mp3 en la carpeta de insumos de Drive' });
    }

    const duracion = await video.obtenerDuracion(ruta);
    const token = crypto.randomBytes(16).toString('hex');
    audiosPendientes.set(token, { path: ruta, duracion, modelo: 'drive' });
    jobStore.actualizarJob(jobId, { paso: 'audio', audioToken: token, duracion, modelo: 'drive' });

    console.log(`♻️ Audio recargado desde Drive (${jobId}): ${duracion.toFixed(1)}s`);
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

// ETAPA 6: Generar Video
app.post('/api/generate-video', async (req, res) => {
  const renderId = `job_${Date.now()}`; // id interno solo para nombrar temporales de este render
  try {
    const { fragments, audioPath: audioPathBody, audioToken, destFolder, guion, metadatos, jobId, efectos } = req.body;
    // metadatos (opcional): { titulo, descripcion, protagonista, nombreCorto, linkFuente }

    if (!fragments || !Array.isArray(fragments) || fragments.length === 0) {
      return res.status(400).json({ error: 'Faltan fragments' });
    }
    // Audio: preferir el aprobado por token; compatibilidad con audioPath directo
    const audioAprobado = audioToken ? audiosPendientes.get(audioToken) : null;
    let audioPath = audioAprobado?.path || audioPathBody;
    // Fallback: si el Map se vació tras un reinicio, recuperar el audio.mp3 del job
    // desde su carpeta de insumos en Drive antes de dar por perdida la locución.
    if ((!audioPath || !fs.existsSync(audioPath)) && jobId) {
      const ruta = await recuperarAudioDeDrive(jobStore.obtenerJob(jobId));
      if (ruta) audioPath = ruta;
    }
    if (!audioPath || !fs.existsSync(audioPath)) {
      return res.status(400).json({ error: 'No se encontró la locución aprobada: regenera el audio' });
    }
    if (!destFolder) {
      return res.status(400).json({ error: 'Falta destFolder' });
    }

    // 1. Duración real de la locución: define el tiempo total del video
    const durAudio = await video.obtenerDuracion(audioPath);
    console.log(`🎬 [${renderId}] Audio: ${durAudio.toFixed(1)}s. Buscando videos en Drive...`);

    // 2. Inventario de videos por famoso (con duración de cada video)
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

    // 3. Plan de clips: tiempo real por fragmento (Fase 5) si el audio aprobado lo trae, si no
    // % por caracteres → tomas ≤clipMax con rotación sin repetir.
    // Fase 7: con transiciones activas, cada clip que empalma con el siguiente necesita
    // `transicionDur` segundos EXTRA de metraje fuente para la cola de mezcla — bajar el techo
    // de planificación a CLIP_MAX-D asegura que esa cola nunca empuje la extracción real por
    // encima del límite legal de 3s (ver seleccion.repartirTomas y video.montarVideoPlan).
    const transicionActiva = (efectos?.transicion || 'ninguno') !== 'ninguno';
    const transicionDur = Math.min(0.6, Math.max(0.1, Number.isFinite(efectos?.transicionDur) ? efectos.transicionDur : 0.35));
    const clipMaxEfectivo = transicionActiva ? Math.max(0.8, seleccion.CLIP_MAX - transicionDur) : seleccion.CLIP_MAX;
    const plan = seleccion.planificarClips(fragments, durAudio, inventario, audioAprobado?.duracionesReales, clipMaxEfectivo);
    const clipsValidos = plan.filter(Boolean);
    console.log(`  🎯 Plan: ${clipsValidos.length} clips (${[...new Set(clipsValidos.map(c => c.videoId))].length} videos distintos)${transicionActiva ? `, CLIP_MAX efectivo ${clipMaxEfectivo.toFixed(2)}s (transiciones activas)` : ''}`);

    // 4. Descargar los videos únicos del plan
    console.log(`⬇️ [${renderId}] Descargando clips...`);
    const archivos = {};
    for (const videoId of [...new Set(clipsValidos.map(c => c.videoId))]) {
      archivos[videoId] = await driveHelper.descargarVideo(videoId, video.TEMP_DIR);
    }

    // 5. Subtítulos (Fase 6): palabra por palabra resaltada, timing real si el audio aprobado
    // lo trae (Fase 5). Opt-out con efectos.subtitulos===false. Nunca aborta el render: si algo
    // falla generando el .ass, el video sale igual, sin subtítulos.
    let subsPath = null;
    let fuentesDir = null;
    if (efectos?.subtitulos !== false) {
      try {
        const tiemposFragmentos = seleccion.tiemposPorFragmento(fragments, durAudio, audioAprobado?.duracionesReales);
        subsPath = subtitulos.generarASS(fragments, tiemposFragmentos, audioAprobado?.palabrasAlineadas, {
          jobId: renderId,
          tempDir: video.TEMP_DIR,
          tamano: Number.isFinite(efectos?.subtitulosTamano) ? efectos.subtitulosTamano : undefined,
          marginV: Number.isFinite(efectos?.subtitulosMarginV) ? efectos.subtitulosMarginV : undefined,
        });
        fuentesDir = await subtitulos.obtenerCarpetaFuentes();
      } catch (e) {
        console.warn(`  ⚠️ [${renderId}] Subtítulos no se pudieron generar (${e.message}), el video sale sin ellos`);
        subsPath = null;
      }
    }

    // 6. Montar (cortes secos, zoom/espejo opcionales, subtítulos quemados si se generaron)
    // Hyperframes retirado: no terminó de funcionar. El código queda en video.js
    // (montarVideoHyper) y en el historial de git por si se retoma.
    console.log(`🎞️ [${renderId}] Montando video con FFmpeg...`);
    const resultado = await video.montarVideoPlan(plan, archivos, audioPath, renderId, { ...(efectos || {}), subsPath, fuentesDir });
    console.log(`  ✅ ${resultado.clips} clips montados, duración final: ${resultado.duracion}s`);

    // 6. Nombre de archivo: "2026-07-11 Protagonista - Secundario - Hecho.mp4"
    // Viene de la lectura (sin llamada extra a Gemini); fallback: generarlo desde el guion
    const fecha = new Date().toISOString().slice(0, 10);
    const nombreCorto = metadatos?.nombreCorto
      || await gemini.generarNombreArchivo(guion || fragments.map(f => f.texto).join(' '));
    const fileName = `${fecha} ${nombreCorto}.mp4`;

    // 7. Guardar en la carpeta de destino
    const folderName = await driveHelper.nombreCarpeta(destFolder);
    const localBase = process.env.RENDERS_LOCAL_PATH;
    let driveLink;

    if (localBase && fs.existsSync(path.join(localBase, folderName))) {
      // Copiar a la carpeta local de Google Drive (el cliente de escritorio la sincroniza solo)
      const destPath = path.join(localBase, folderName, fileName);
      console.log(`💾 [${renderId}] Guardando en Drive local: ${destPath}`);
      fs.copyFileSync(resultado.finalPath, destPath);
      driveLink = `https://drive.google.com/drive/folders/${destFolder}`;
    } else {
      // Fallback: subir por API (requiere OAuth, los Service Accounts no tienen cuota)
      console.log(`⬆️ [${renderId}] Subiendo a Drive por API: ${fileName}`);
      const subido = await driveHelper.subirVideo(resultado.finalPath, fileName, destFolder);
      driveLink = subido.webViewLink;
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
      });
    } catch (e) {
      console.warn(`⚠️ [${renderId}] No se pudo registrar en Sheets: ${e.message}`);
    }

    // 10. Registrar preview (copia que sobrevive a la limpieza de temporales)
    const previewToken = crypto.randomBytes(16).toString('hex');
    const previewPath = path.join(video.TEMP_DIR, `preview_${previewToken}.mp4`);
    try {
      fs.copyFileSync(resultado.finalPath, previewPath);
      // Conservar solo los 3 previews más recientes
      const viejos = [...previews.entries()].slice(0, Math.max(0, previews.size - 2));
      for (const [tok, ruta] of viejos) {
        try { fs.unlinkSync(ruta); } catch {}
        previews.delete(tok);
      }
      previews.set(previewToken, previewPath);
    } catch (e) {
      console.warn(`⚠️ [${renderId}] No se pudo crear el preview: ${e.message}`);
    }

    // 11. Limpiar temporales (incluido el video final y el audio)
    video.limpiarTemporales(renderId);
    try { fs.unlinkSync(audioPath); } catch {}

    if (jobId) {
      try {
        const job = jobStore.actualizarJob(jobId, { paso: 'completado', fileName, folderName, driveLink });
        if (job.carpetaInsumoId) {
          driveHelper.guardarEnInsumo(job.carpetaInsumoId, 'resultado.json', JSON.stringify({ fileName, folderName, driveLink }, null, 2))
            .catch(e => console.warn(`⚠️ No se pudo respaldar resultado.json en Drive: ${e.message}`));
        }
      } catch (e) { console.warn(`⚠️ No se pudo actualizar job ${jobId}: ${e.message}`); }
    }

    console.log(`✅ [${renderId}] Video guardado: ${fileName}`);
    res.json({
      status: 'success',
      fileName: fileName,
      folderName: folderName,
      duration: resultado.duracion,
      driveLink: driveLink,
      previewUrl: previews.has(previewToken) ? `/api/preview/${previewToken}` : null,
    });
  } catch (error) {
    console.error(`Error video [${renderId}]:`, error);
    video.limpiarTemporales(renderId);
    res.status(500).json({ error: error.message });
  }
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
      ...[...previews.values()],
      ...[...audiosPendientes.values()].map(a => a.path),
    ].map(p => path.basename(p)));

    for (const f of fs.readdirSync(video.TEMP_DIR)) {
      if (activos.has(f)) continue; // no tocar previews/audios en uso
      const ruta = path.join(video.TEMP_DIR, f);
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

// Las carpetas de insumos en Drive crecían sin límite (nadie las borraba). Al ser
// contenido noticioso pierden vigencia rápido: se mandan a la papelera a las 48h.
limpiezaInsumos.start();

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`🔑 Usa API Key: ${API_KEY}`);
});

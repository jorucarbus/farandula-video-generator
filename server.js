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
const subtitulos = require('./subtitulos');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

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

// Servir un audio para escucharlo en la UI (público: el tag <audio> no envía headers)
app.get('/api/audio/:token', (req, res) => {
  const audio = audiosPendientes.get(req.params.token);
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
    const credentialsPath = path.join(__dirname, 'credentials.json');
    if (!fs.existsSync(credentialsPath)) {
      console.error('❌ credentials.json no encontrado');
      return;
    }

    const auth = new google.auth.GoogleAuth({
      keyFile: credentialsPath,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });

    driveClient = google.drive({ version: 'v3', auth });
    console.log('✅ Google Drive conectado');
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

// ETAPA 1: Lectura
app.post('/api/read', async (req, res) => {
  try {
    const { type, content, sesgo } = req.body;

    if (!type || !content) {
      return res.status(400).json({ error: 'Faltan type o content' });
    }

    // Detectar el tipo real de la fuente cuando es un link
    const sesgoElegido = ['favor', 'contra', 'neutral'].includes(sesgo) ? sesgo : 'neutral';
    console.log(`📖 Lectura con sesgo: ${sesgoElegido}`);
    let result;
    if (type === 'link' && fuentes.esYoutube(content)) {
      console.log('📖 Lectura de video de YouTube (Gemini directo)...');
      result = await gemini.procesarLectura('youtube', content.trim(), sesgoElegido);
    } else if (type === 'link' && fuentes.esVideoSocial(content)) {
      console.log('📖 Descargando audio con yt-dlp (TikTok/Instagram)...');
      const audioPath = await fuentes.descargarAudio(content.trim());
      try {
        result = await gemini.procesarLectura('audio', audioPath, sesgoElegido);
      } finally {
        try { fs.unlinkSync(audioPath); } catch {}
      }
    } else if (type === 'link') {
      console.log('📖 Extrayendo texto de la página...');
      const texto = await fuentes.extraerTextoWeb(content.trim());
      result = await gemini.procesarLectura('web', texto, sesgoElegido);
    } else {
      console.log(`📖 Procesando lectura (${type})...`);
      result = await gemini.procesarLectura(type, content, sesgoElegido);
    }

    res.json({
      status: 'success',
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

// ETAPA 2: Generar Guion
app.post('/api/generate-script', async (req, res) => {
  try {
    const { cronica, angle, angleContent } = req.body;

    if (!cronica || !angle) {
      return res.status(400).json({ error: 'Faltan cronica o angle' });
    }

    console.log(`✍️ Generando guion (ángulo ${angle})...`);
    const script = await gemini.generarGuion(cronica, angle, angleContent);
    const palabras = script.split(/\s+/).filter(Boolean).length;
    console.log(`  📝 Guion generado: ${palabras} palabras, ${script.length} caracteres`);

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
    const { script, protagonista } = req.body;

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

    res.json({
      status: 'success',
      fragments: conPorcentaje,
      carpetas,
      protagonista,
      protagonistaSinCarpeta,
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
    const { fragments, modelo } = req.body;
    if (!Array.isArray(fragments) || fragments.length === 0) {
      return res.status(400).json({ error: 'Faltan fragments' });
    }

    console.log('🎙️ Generando locución para aprobación...');
    const marcado = await gemini.agregarMarcas(fragments);
    const audio = await elevenlabs.generarAudio(marcado, modelo || 'eleven_v3');
    const duracion = await video.obtenerDuracion(audio.audioPath);

    const token = crypto.randomBytes(16).toString('hex');
    // Conservar solo los 4 audios más recientes
    const viejos = [...audiosPendientes.entries()].slice(0, Math.max(0, audiosPendientes.size - 3));
    for (const [t, a] of viejos) {
      try { fs.unlinkSync(a.path); } catch {}
      audiosPendientes.delete(t);
    }
    audiosPendientes.set(token, { path: audio.audioPath, duracion, modelo: audio.modelo });

    console.log(`  ⏱️ ${duracion.toFixed(1)}s (${audio.modelo}) — esperando aprobación`);
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
  const jobId = `job_${Date.now()}`;
  try {
    const { fragments, audioPath: audioPathBody, audioToken, destFolder, guion, metadatos } = req.body;
    // metadatos (opcional): { titulo, descripcion, protagonista, nombreCorto, linkFuente }

    if (!fragments || !Array.isArray(fragments) || fragments.length === 0) {
      return res.status(400).json({ error: 'Faltan fragments' });
    }
    // Audio: preferir el aprobado por token; compatibilidad con audioPath directo
    const audioAprobado = audioToken ? audiosPendientes.get(audioToken) : null;
    const audioPath = audioAprobado?.path || audioPathBody;
    if (!audioPath || !fs.existsSync(audioPath)) {
      return res.status(400).json({ error: 'No se encontró la locución aprobada: regenera el audio' });
    }
    if (!destFolder) {
      return res.status(400).json({ error: 'Falta destFolder' });
    }

    // 1. Duración real de la locución: define el tiempo total del video
    const durAudio = await video.obtenerDuracion(audioPath);
    console.log(`🎬 [${jobId}] Audio: ${durAudio.toFixed(1)}s. Buscando videos en Drive...`);

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

    // 3. Plan de clips: % por caracteres → tiempo por párrafo → tomas ≤3s con rotación sin repetir
    const plan = seleccion.planificarClips(fragments, durAudio, inventario);
    const clipsValidos = plan.filter(Boolean);
    console.log(`  🎯 Plan: ${clipsValidos.length} clips (${[...new Set(clipsValidos.map(c => c.videoId))].length} videos distintos)`);

    // 4. Descargar los videos únicos del plan
    console.log(`⬇️ [${jobId}] Descargando clips...`);
    const archivos = {};
    for (const videoId of [...new Set(clipsValidos.map(c => c.videoId))]) {
      archivos[videoId] = await driveHelper.descargarVideo(videoId, video.TEMP_DIR);
    }

    // 5. Montar (simple y estable: cortes secos, sin transiciones ni subtítulos)
    // Hyperframes retirado: no terminó de funcionar. El código queda en video.js
    // (montarVideoHyper) y en el historial de git por si se retoma.
    console.log(`🎞️ [${jobId}] Montando video con FFmpeg...`);
    const resultado = await video.montarVideoPlan(plan, archivos, audioPath, jobId);
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
      console.log(`💾 [${jobId}] Guardando en Drive local: ${destPath}`);
      fs.copyFileSync(resultado.finalPath, destPath);
      driveLink = `https://drive.google.com/drive/folders/${destFolder}`;
    } else {
      // Fallback: subir por API (requiere OAuth, los Service Accounts no tienen cuota)
      console.log(`⬆️ [${jobId}] Subiendo a Drive por API: ${fileName}`);
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
        console.log(`🎵 [${jobId}] Audio respaldado: ${audioBackup}`);
      }
    } catch (e) {
      console.warn(`⚠️ [${jobId}] No se pudo respaldar el audio: ${e.message}`);
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
      });
    } catch (e) {
      console.warn(`⚠️ [${jobId}] No se pudo registrar en Sheets: ${e.message}`);
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
      console.warn(`⚠️ [${jobId}] No se pudo crear el preview: ${e.message}`);
    }

    // 11. Limpiar temporales (incluido el video final y el audio)
    video.limpiarTemporales(jobId);
    try { fs.unlinkSync(audioPath); } catch {}

    console.log(`✅ [${jobId}] Video guardado: ${fileName}`);
    res.json({
      status: 'success',
      fileName: fileName,
      folderName: folderName,
      duration: resultado.duracion,
      driveLink: driveLink,
      previewUrl: previews.has(previewToken) ? `/api/preview/${previewToken}` : null,
    });
  } catch (error) {
    console.error(`Error video [${jobId}]:`, error);
    video.limpiarTemporales(jobId);
    res.status(500).json({ error: error.message });
  }
});

// Iniciar servidor
initializeDrive();

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`🔑 Usa API Key: ${API_KEY}`);
});

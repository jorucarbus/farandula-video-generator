require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const gemini = require('./gemini');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Autenticación por API Key
const authenticateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== API_KEY) {
    return res.status(401).json({ error: 'API Key inválida' });
  }
  next();
};

app.use('/api', authenticateApiKey);

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

// Rutas de prueba
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Servidor activo' });
});

app.get('/api/folders', async (req, res) => {
  try {
    if (!driveClient) {
      return res.status(500).json({ error: 'Drive no inicializado' });
    }

    // Obtener lista de carpetas desde Drive
    const response = await driveClient.files.list({
      q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
      spaces: 'drive',
      fields: 'files(id, name)',
      pageSize: 100,
    });

    res.json({ folders: response.data.files });
  } catch (error) {
    console.error('Error obteniendo carpetas:', error);
    res.status(500).json({ error: error.message });
  }
});

// ETAPA 1: Lectura
app.post('/api/read', async (req, res) => {
  try {
    const { type, content } = req.body;

    if (!type || !content) {
      return res.status(400).json({ error: 'Faltan type o content' });
    }

    console.log(`📖 Procesando lectura (${type})...`);
    const result = await gemini.procesarLectura(type, content);

    res.json({
      status: 'success',
      cronica: result.cronica,
      titulo: result.titulo,
      descripcion: result.descripcion,
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

    res.json({
      status: 'success',
      script: script,
    });
  } catch (error) {
    console.error('Error guion:', error);
    res.status(500).json({ error: error.message });
  }
});

// ETAPA 3: Fragmentación + Carpetas
app.post('/api/fragment', async (req, res) => {
  try {
    const { script } = req.body;

    if (!script) {
      return res.status(400).json({ error: 'Falta script' });
    }

    // Obtener lista de carpetas de Drive
    let carpetas = [];
    if (driveClient) {
      const response = await driveClient.files.list({
        q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
        spaces: 'drive',
        fields: 'files(name)',
        pageSize: 100,
      });
      carpetas = response.data.files.map(f => f.name);
    } else {
      carpetas = ['Aaron', 'Karina_Torres', 'Shakira']; // Fallback
    }

    console.log(`📂 Fragmentando guion (${carpetas.length} carpetas)...`);
    const fragments = await gemini.fragmentarGuion(script, carpetas);

    res.json({
      status: 'success',
      fragments: fragments,
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

    res.json({
      status: 'success',
      marked: marked,
    });
  } catch (error) {
    console.error('Error marcas:', error);
    res.status(500).json({ error: error.message });
  }
});

// ETAPA 5: Generar Audio (placeholder)
app.post('/api/generate-audio', async (req, res) => {
  res.json({ status: 'pending', message: 'Etapa 5: Audio - Próximamente' });
});

// ETAPA 6: Generar Video (placeholder)
app.post('/api/generate-video', async (req, res) => {
  res.json({ status: 'pending', message: 'Etapa 6: Video - Próximamente' });
});

// Iniciar servidor
initializeDrive();

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`🔑 Usa API Key: ${API_KEY}`);
});

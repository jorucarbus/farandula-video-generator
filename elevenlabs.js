const axios = require('axios');
const fs = require('fs');
const path = require('path');

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;
const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

// Quitar todas las marcas [tag] del texto (para modelos que las leerían en voz alta)
function quitarMarcas(texto) {
  return texto.replace(/\[[a-z_ ]+\]/gi, '').replace(/\s+/g, ' ').trim();
}

// Petición de text-to-speech a ElevenLabs
async function pedirTTS(texto, modelId, extra = {}) {
  return axios.post(
    `${ELEVENLABS_API_URL}/text-to-speech/${ELEVENLABS_VOICE_ID}`,
    {
      text: texto,
      model_id: modelId,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        ...extra.voiceSettings,
      },
      ...extra.body,
    },
    {
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      responseType: 'arraybuffer',
    }
  );
}

// Generar audio a partir del guion con marcas.
// modeloPreferido:
//   'eleven_v3' → actúa las marcas [excited] etc., pero el acento puede variar
//   'eleven_multilingual_v2' → marcas removidas, acento español forzado (language_code)
async function generarAudio(guionConMarcas, modeloPreferido = 'eleven_v3') {
  if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
    throw new Error('Falta ELEVENLABS_API_KEY o ELEVENLABS_VOICE_ID en .env');
  }

  console.log(`🎙️ Generando audio con ElevenLabs (${modeloPreferido})...`);
  let response;
  let modeloUsado;

  if (modeloPreferido === 'eleven_multilingual_v2') {
    response = await pedirTTS(quitarMarcas(guionConMarcas), 'eleven_multilingual_v2', {
      body: { language_code: 'es' },
      voiceSettings: { style: 0.6, use_speaker_boost: true },
    });
    return guardarAudio(response, guionConMarcas, 'eleven_multilingual_v2');
  }

  try {
    // v3: el texto va CON las marcas, el modelo las actúa
    response = await pedirTTS(guionConMarcas, 'eleven_v3');
    modeloUsado = 'eleven_v3';
  } catch (errV3) {
    const detalle = errV3.response?.data
      ? Buffer.from(errV3.response.data).toString().slice(0, 200)
      : errV3.message;
    console.warn(`  ⚠️ eleven_v3 no disponible (${errV3.response?.status}): ${detalle}`);
    console.log('  ↩️ Usando eleven_multilingual_v2 (marcas removidas)...');

    try {
      response = await pedirTTS(quitarMarcas(guionConMarcas), 'eleven_multilingual_v2', {
        body: { language_code: 'es' },
        voiceSettings: { style: 0.6, use_speaker_boost: true },
      });
      modeloUsado = 'eleven_multilingual_v2';
    } catch (errV2) {
      console.error('Error ElevenLabs:', errV2.response?.data ? Buffer.from(errV2.response.data).toString().slice(0, 300) : errV2.message);
      throw new Error(`Error generando audio: ${errV2.message}`);
    }
  }

  return guardarAudio(response, guionConMarcas, modeloUsado);
}

// Guardar el MP3 en la carpeta temporal
function guardarAudio(response, guionConMarcas, modeloUsado) {
  const tempDir = path.join(__dirname, 'temp-videos');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const audioFile = `audio_${Date.now()}.mp3`;
  const audioPath = path.join(tempDir, audioFile);
  fs.writeFileSync(audioPath, response.data);

  console.log(`✅ Audio generado con ${modeloUsado}: ${audioPath}`);
  return {
    audioPath: audioPath,
    audioFile: audioFile,
    modelo: modeloUsado,
    caracteres: guionConMarcas.length,
  };
}

// Obtener información de la voz (verificar que existe)
async function verificarVoz() {
  try {
    if (!ELEVENLABS_API_KEY) {
      throw new Error('Falta ELEVENLABS_API_KEY en .env');
    }

    const response = await axios.get(
      `${ELEVENLABS_API_URL}/voices/${ELEVENLABS_VOICE_ID}`,
      {
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
        },
      }
    );

    console.log(`✅ Voz verificada: ${response.data.name}`);
    return response.data;
  } catch (error) {
    console.error('Error verificando voz:', error.message);
    throw error;
  }
}

module.exports = {
  generarAudio,
  verificarVoz,
};

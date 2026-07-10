const axios = require('axios');
const fs = require('fs');
const path = require('path');

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;
const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

// Generar audio a partir del guion con marcas
async function generarAudio(guionConMarcas) {
  try {
    if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
      throw new Error('Falta ELEVENLABS_API_KEY o ELEVENLABS_VOICE_ID en .env');
    }

    console.log('🎙️ Generando audio con ElevenLabs...');

    // Preparar para API de ElevenLabs: las marcas van en un campo aparte "pronunciation_dictionary_locators"
    // o como parte del "voice_guidance". Para v2 multilingual, usamos text directo sin BML.
    // Las marcas [excited], [fast] etc. se pasan via parámetro de estilo, no en el texto.

    // Limpiar el texto: remover todas las marcas para que ElevenLabs no las lea
    const textoLimpio = guionConMarcas
      .replace(/\[excited\]/gi, '')
      .replace(/\[fast\]/gi, '')
      .replace(/\[sarcastic\]/gi, '')
      .replace(/\[whispering\]/gi, '')
      .replace(/\[laughing\]/gi, '')
      .replace(/\[shouting\]/gi, '')
      .replace(/\[surprised\]/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Llamar a ElevenLabs v2 (más estable que v3, soporta español latino)
    const response = await axios.post(
      `${ELEVENLABS_API_URL}/text-to-speech/${ELEVENLABS_VOICE_ID}`,
      {
        text: textoLimpio,
        model_id: 'eleven_multilingual_v2',
        language_code: 'es', // Español
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.6, // Rango 0-1, aumentamos ligeramente para dramaticidad
          use_speaker_boost: true,
        },
      },
      {
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
      }
    );

    // Guardar audio en carpeta temporal
    const tempDir = path.join(__dirname, 'temp-videos');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const audioPath = path.join(tempDir, `audio_${Date.now()}.mp3`);
    fs.writeFileSync(audioPath, response.data);

    // Obtener duración (aproximada: 1 segundo por ~150 caracteres)
    const caracteres = guionConMarcas.length;
    const duracionEstimada = Math.ceil(caracteres / 150);

    console.log(`✅ Audio generado: ${audioPath}`);
    console.log(`⏱️ Duración estimada: ${duracionEstimada}s (${caracteres} caracteres)`);

    return {
      audioPath: audioPath,
      audioFile: `audio_${Date.now()}.mp3`,
      duration: duracionEstimada,
      caracteres: caracteres,
    };
  } catch (error) {
    console.error('Error ElevenLabs:', error.response?.data || error.message);
    throw new Error(`Error generando audio: ${error.message}`);
  }
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

const axios = require('axios');

// El mensaje REAL de ElevenLabs. axios solo dice "Request failed with status code 401", que no
// distingue una clave mala de una cuota agotada — y ElevenLabs contesta 401 en las dos. Medido
// 2026-10-20: "0 credits remaining" llegó como un 401 pelado y parecía un problema de la clave.
function detalleDeElevenLabs(err) {
  let data = err?.response?.data;
  if (data && (Buffer.isBuffer(data) || data instanceof ArrayBuffer || ArrayBuffer.isView(data))) {
    try { data = JSON.parse(Buffer.from(data).toString()); } catch { data = null; }
  }
  const d = data?.detail;
  return { codigo: d?.status || d?.code || null, mensaje: d?.message || null };
}

// Sin créditos no hay modelo que lo arregle: probar v2 gastaría otra llamada para el mismo error.
function esCuotaAgotada(err) {
  return detalleDeElevenLabs(err).codigo === 'quota_exceeded';
}

function errorLegible(err, prefijo) {
  const { codigo, mensaje } = detalleDeElevenLabs(err);
  if (codigo === 'quota_exceeded') {
    return new Error(`${prefijo}: se acabaron los créditos de ElevenLabs. Recarga en https://elevenlabs.io/app/subscription `
      + `(dijo: ${(mensaje || '').slice(0, 160)})`);
  }
  return new Error(`${prefijo}: ${mensaje || err.message}`);
}
const fs = require('fs');
const path = require('path');
const video = require('./video');

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;
const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

// El audio de ElevenLabs suele saturar un poco — el usuario SIEMPRE le baja esto a mano en su
// editor antes de usarlo, en cada video. Se aplica acá una sola vez para no repetir ese paso
// manual. Provisional: la Fase 8 (música + mezcla, loudnorm) va a afinar niveles de verdad —
// esto es solo la corrección de ganancia que ya se sabe que hace falta.
const GANANCIA_DB = -3.4;

// Reencodea el mp3 con la ganancia bajada, pisando el archivo original. No aborta el flujo si
// falla (ffmpeg raro, disco lleno): el audio se queda sin corregir en vez de perderse.
async function aplicarGanancia(audioPath) {
  try {
    const ajustado = audioPath.replace(/\.mp3$/, '_g.mp3');
    await video.ffmpeg(['-i', audioPath, '-af', `volume=${GANANCIA_DB}dB`, '-c:a', 'libmp3lame', '-q:a', '2', ajustado]);
    fs.unlinkSync(audioPath);
    fs.renameSync(ajustado, audioPath);
  } catch (e) {
    console.warn(`  ⚠️ No se pudo bajar la ganancia del audio (${e.message}), se usa el original de ElevenLabs`);
  }
}

// Quitar todas las marcas [tag] del texto (para modelos que las leerían en voz alta)
function quitarMarcas(texto) {
  // Cualquier cosa entre corchetes: con v4 las marcas son libres y pueden traer guiones, números o
  // tildes ("[fast-paced]"); con la regla vieja de solo letras, una así se leía en voz alta.
  // Se reemplaza por un espacio y no por nada: Gemini pega las marcas a las palabras ("embarazo[fast]y"),
  // y quitarlas a secas dejaba "embarazoy" — el respaldo v2 leía palabras fusionadas.
  return texto.replace(/\[[^\]\n]{1,40}\]/g, ' ').replace(/\s+/g, ' ').trim();
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

// Igual que pedirTTS pero devuelve también la alineación carácter-por-carácter
// (endpoint /with-timestamps). Respuesta viene en JSON, no en binario.
async function pedirTTSConTiempos(texto, modelId, extra = {}) {
  return axios.post(
    `${ELEVENLABS_API_URL}/text-to-speech/${ELEVENLABS_VOICE_ID}/with-timestamps`,
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
      responseType: 'json',
    }
  );
}

// v4 turbo es el de uso (2026-11-21): misma voz, mismas marcas y misma alineación que v4, habla igual
// de rápido (2,68 contra 2,70 palabras por segundo, medido con un guion real) y cuesta la mitad.
const MODELOS = { v4t: 'eleven_v4_turbo', v4: 'eleven_v4', v3: 'eleven_v3', v2: 'eleven_multilingual_v2' };

// Cadena de respaldo: cada modelo cae al siguiente si falla (salvo cuota agotada, que no lo arregla
// ningún modelo). v4 y v3 actúan las marcas; v2 no, así que a v2 se le quitan.
function cadenaDeModelos(preferido) {
  const p = preferido || MODELOS.v4t;
  if (p === MODELOS.v2) return [MODELOS.v2];
  if (p === MODELOS.v3) return [MODELOS.v3, MODELOS.v2];
  if (p === MODELOS.v4) return [MODELOS.v4, MODELOS.v3, MODELOS.v2];
  return [MODELOS.v4t, MODELOS.v4, MODELOS.v3, MODELOS.v2];
}

// Lo que se le manda a cada modelo: v4/v3 reciben el texto CON marcas; v2 las recibiría como
// palabras, así que va sin ellas y con el acento forzado a español.
function configDeModelo(modelo, guionConMarcas) {
  if (modelo === MODELOS.v2) {
    return {
      texto: quitarMarcas(guionConMarcas),
      extra: { body: { language_code: 'es' }, voiceSettings: { style: 0.6, use_speaker_boost: true } },
    };
  }
  return { texto: guionConMarcas, extra: {} };
}

async function pedirConRespaldo(guionConMarcas, preferido, pedir, prefijoError) {
  const cadena = cadenaDeModelos(preferido);
  let ultimo;
  for (let i = 0; i < cadena.length; i++) {
    const modelo = cadena[i];
    const { texto, extra } = configDeModelo(modelo, guionConMarcas);
    try {
      if (i > 0) console.log(`  ↩️ Usando ${modelo}${modelo === MODELOS.v2 ? ' (marcas removidas)' : ''}...`);
      const response = await pedir(texto, modelo, extra);
      return { response, modelo, texto };
    } catch (err) {
      if (esCuotaAgotada(err)) throw errorLegible(err, prefijoError);
      ultimo = err;
      const detalle = detalleDeElevenLabs(err).mensaje || err.message;
      console.warn(`  ⚠️ ${modelo} no disponible (${err.response?.status}): ${String(detalle).slice(0, 200)}`);
    }
  }
  console.error('Error ElevenLabs:', detalleDeElevenLabs(ultimo).mensaje || ultimo.message);
  throw errorLegible(ultimo, prefijoError);
}

// Generar audio a partir del guion con marcas.
// modeloPreferido: 'eleven_v4_turbo' (por defecto) | 'eleven_v4' | 'eleven_v3' | 'eleven_multilingual_v2'. Cae en cadena
// al siguiente si el elegido falla.
async function generarAudio(guionConMarcas, modeloPreferido = MODELOS.v4t) {
  if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
    throw new Error('Falta ELEVENLABS_API_KEY o ELEVENLABS_VOICE_ID en .env');
  }
  console.log(`🎙️ Generando audio con ElevenLabs (${modeloPreferido})...`);
  const { response, modelo } = await pedirConRespaldo(guionConMarcas, modeloPreferido, pedirTTS, 'Error generando audio');
  return guardarAudio(response, guionConMarcas, modelo);
}

// Igual que generarAudio pero además devuelve la alineación carácter-por-carácter
// que ElevenLabs mide sobre el TEXTO QUE REALMENTE MANDÓ A HABLAR (con o sin marcas
// según el modelo que terminó respondiendo). Fase 5: fuente real de tiempos, en vez
// de estimar por % de caracteres.
async function generarAudioConTiempos(guionConMarcas, modeloPreferido = MODELOS.v4t) {
  if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
    throw new Error('Falta ELEVENLABS_API_KEY o ELEVENLABS_VOICE_ID en .env');
  }
  console.log(`🎙️ Generando audio + tiempos con ElevenLabs (${modeloPreferido})...`);
  const { response, modelo, texto } = await pedirConRespaldo(guionConMarcas, modeloPreferido, pedirTTSConTiempos, 'Error generando audio con tiempos');
  return guardarAudioConTiempos(response, texto, modelo);
}

// Guarda el MP3 (viene en base64 dentro del JSON) y devuelve la alineación cruda
// junto al texto exacto que se le mandó a hablar — hace falta para casar cada
// fragmento del guion contra su tramo de la alineación.
async function guardarAudioConTiempos(response, textoEnviado, modeloUsado) {
  const tempDir = path.join(__dirname, 'temp-videos');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const audioFile = `audio_${Date.now()}.mp3`;
  const audioPath = path.join(tempDir, audioFile);
  const buffer = Buffer.from(response.data.audio_base64, 'base64');
  fs.writeFileSync(audioPath, buffer);
  await aplicarGanancia(audioPath);

  const align = response.data.alignment || {};
  const caracteres = align.characters || [];
  const inicios = align.character_start_times_seconds || [];
  const fines = align.character_end_times_seconds || [];

  console.log(`✅ Audio + tiempos generados con ${modeloUsado}: ${audioPath} (${caracteres.length} caracteres alineados)`);
  return {
    audioPath,
    audioFile,
    modelo: modeloUsado,
    textoEnviado,
    caracteres,
    inicios,
    fines,
  };
}

// Guardar el MP3 en la carpeta temporal
async function guardarAudio(response, guionConMarcas, modeloUsado) {
  const tempDir = path.join(__dirname, 'temp-videos');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const audioFile = `audio_${Date.now()}.mp3`;
  const audioPath = path.join(tempDir, audioFile);
  fs.writeFileSync(audioPath, response.data);
  await aplicarGanancia(audioPath);

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
  MODELOS,
  generarAudio,
  generarAudioConTiempos,
  verificarVoz,
};

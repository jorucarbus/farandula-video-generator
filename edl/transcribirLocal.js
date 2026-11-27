// Transcribe un audio EN ESTA PC con Whisper (faster-whisper, gratis, sin red): reemplaza a Gemini para "oír" las fuentes.
// Por qué: oír audio con Gemini cuesta ~263 tokens por segundo; la transcripción local cuesta 0 y luego Gemini solo lee TEXTO.
// Medido (2026-11-27, CPU, modelo "small"): 65 s de audio en 10 s, 1.2% de palabras distintas contra el guion conocido.
// Si Whisper no está disponible o no oye voz (video solo con música), devuelve null y quien llama cae al camino de antes.
const { ejecutarWhisper } = require('./tiemposPalabras');
const MIN_PALABRAS = 25; // menos que esto no es una noticia hablada (música, un grito, ruido)

async function transcribir(audio, { modelo = process.env.WHISPER_MODELO || 'small', ejecutar = ejecutarWhisper, log = () => {} } = {}) {
  if (process.env.SIN_WHISPER === '1') return null;
  try {
    const r = await ejecutar(audio, { modelo }), texto = (r.palabras || []).map(p => p.w).join(' ').replace(/\s+/g, ' ').trim();
    const n = texto ? texto.split(' ').length : 0;
    if (n < MIN_PALABRAS) { log(`  Whisper oyó solo ${n} palabras: se usa el camino de antes`); return null; }
    log(`  Whisper (local): ${n} palabras en ${Math.round(r.duracion || 0)} s de audio`);
    return texto;
  } catch (e) { log(`  Whisper no disponible (${String(e.message).slice(0, 100)}): se usa el camino de antes`); return null; }
}

module.exports = { transcribir, MIN_PALABRAS };

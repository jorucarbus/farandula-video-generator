// Alargar un poco la locución cuando se quedó a punto de no llegar al minuto.
//
// Por qué (pedido del usuario, 2026-11-10): para los programas que pagan por vistas el video tiene
// que pasar de 60 segundos, y ElevenLabs no habla siempre igual de rápido — la misma voz y el mismo
// guion varían entre 5% y 7% de una generación a otra, más que la ventana de 62-70 s que se busca.
// Contar palabras no puede garantizar esa ventana.
//
// Se corrige DESPUÉS de generar, sin gastar créditos: si la locución duró entre ~59 y 62 s, se
// estira con ffmpeg (`atempo`, que cambia la velocidad sin tocar el tono) hasta pasar el minuto. El
// tope es 5%: más se nota al oído.
//
// SOLO alarga. Una locución que ya pasó de 70 s no se acelera: los créditos ya se gastaron y para el
// minuto de monetización más largo no es un problema (decisión del usuario).
const fs = require('fs');
const video = require('./video');
const largos = require('./largos');

const OBJETIVO_SEG = largos.MINIMO_MONETIZA_SEG + 0.4;   // el .4 cubre el relleno que agrega el codificador mp3
const TOPE_ALARGUE = 1.05;                                // hasta un 5% más de duración

// Cuánto hay que alargar una locución de `duracion` segundos, o null si no hace falta o no se puede
// (ya llega al minuto, o faltaría más del 5%: eso lo avisa la pantalla y decide el usuario).
function factorParaAlargar(duracion) {
  if (!(duracion > 0) || duracion >= largos.MINIMO_MONETIZA_SEG) return null;
  const factor = OBJETIVO_SEG / duracion;
  return factor <= TOPE_ALARGUE ? factor : null;
}

// Alarga el mp3 de `audio.audioPath` y reescala los tiempos de la alineación con el mismo factor
// (si no, los subtítulos y los cortes de clip quedarían corridos respecto de la voz). Devuelve la
// duración final. Nunca lanza: si algo falla, el audio queda como estaba.
async function alargarSiHaceFalta(audio, duracion) {
  const factor = factorParaAlargar(duracion);
  if (!factor) return { duracion, factor: null };
  const original = audio.audioPath;
  const alargado = original.replace(/\.mp3$/, '_t.mp3');
  try {
    await video.ffmpeg(['-i', original, '-filter:a', `atempo=${(1 / factor).toFixed(5)}`, '-c:a', 'libmp3lame', '-q:a', '2', alargado]);
    const nueva = await video.obtenerDuracion(alargado);
    // Verificación: si el resultado no quedó donde debía (ffmpeg raro), se descarta y se deja el original.
    if (!(nueva >= duracion) || nueva > duracion * TOPE_ALARGUE + 0.3) throw new Error(`duración inesperada (${nueva.toFixed(1)}s)`);
    fs.unlinkSync(original);
    fs.renameSync(alargado, original);
    if (Array.isArray(audio.inicios)) audio.inicios = audio.inicios.map(t => t * factor);
    if (Array.isArray(audio.fines)) audio.fines = audio.fines.map(t => t * factor);
    console.log(`  ⏩ Locución alargada ${((factor - 1) * 100).toFixed(1)}% para llegar al minuto: ${duracion.toFixed(1)}s → ${nueva.toFixed(1)}s`);
    return { duracion: nueva, factor };
  } catch (e) {
    try { fs.unlinkSync(alargado); } catch {}
    console.warn(`  ⚠️ No se pudo alargar la locución (${e.message}); se queda como salió`);
    return { duracion, factor: null };
  }
}

module.exports = { factorParaAlargar, alargarSiHaceFalta, TOPE_ALARGUE };

// Completar con una cola de música la locución que se quedó corta para el minuto.
//
// Para los programas que pagan por vistas el video tiene que pasar de 60 segundos, y ElevenLabs no
// habla siempre igual de rápido: la misma voz y el mismo guion varían entre 5% y 7% de una generación
// a otra. Contar palabras no puede garantizar la duración.
//
// Primera versión (2026-11-10): estirar la voz hasta un 5% con `atempo`. Reemplazada el 2026-11-15
// por idea del usuario: "en lugar de modificar la voz, solo se pone la música hasta que pase el
// minuto y dos segundos, y ahí se corta". Es mejor: la voz queda intacta, no hay que reescalar los
// tiempos de subtítulos y tomas, y no tiene tope — "no importa si es más de 4 segundos lo que toque
// llenar: la mayoría nunca se queda hasta el final, solo quiero cumplir el requisito del minuto".
//
// Cómo: se agrega SILENCIO al final del mp3 hasta 62,4 s. El video dura lo que dura ese audio, así
// que la música de fondo (que cubre el video entero y cierra con su fundido) sigue sonando sola en la
// cola, y las tomas del último párrafo se extienden para cubrirla. Sin créditos, sin regenerar.
//
// Solo completa lo corto. Una locución que ya pasó del minuto no se toca.
const fs = require('fs');
const video = require('./video');
const largos = require('./largos');

const OBJETIVO_SEG = largos.MINIMO_MONETIZA_SEG + 0.4;   // el .4 cubre el redondeo del codificador mp3

// Segundos de cola que le faltan a una locución de `duracion` segundos (0 si ya llega al minuto).
function colaQueFalta(duracion) {
  if (!(duracion > 0) || duracion >= largos.MINIMO_MONETIZA_SEG) return 0;
  return OBJETIVO_SEG - duracion;
}

// Agrega la cola de silencio al mp3 de `audio.audioPath`. Devuelve la duración final, dónde termina
// la VOZ (para que el último subtítulo no se quede colgado durante la cola) y cuántos segundos se
// agregaron. Nunca lanza: si algo falla, el audio queda como estaba y el aviso de pantalla decide.
async function completarConCola(audio, duracion) {
  const cola = colaQueFalta(duracion);
  if (!cola) return { duracion, finDeVoz: null, cola: 0 };
  const original = audio.audioPath;
  const completado = original.replace(/\.mp3$/, '_c.mp3');
  try {
    await video.ffmpeg(['-i', original, '-af', `apad=whole_dur=${OBJETIVO_SEG.toFixed(2)}`, '-c:a', 'libmp3lame', '-q:a', '2', completado]);
    const nueva = await video.obtenerDuracion(completado);
    // Verificación: si no quedó donde debía (ffmpeg raro), se descarta y se deja el original.
    if (!(nueva >= largos.MINIMO_MONETIZA_SEG) || nueva > OBJETIVO_SEG + 1) throw new Error(`duración inesperada (${nueva.toFixed(1)}s)`);
    fs.unlinkSync(original);
    fs.renameSync(completado, original);
    console.log(`  🎵 Locución corta (${duracion.toFixed(1)}s): se completa con ${cola.toFixed(1)}s de música al final → ${nueva.toFixed(1)}s`);
    return { duracion: nueva, finDeVoz: duracion, cola: nueva - duracion };
  } catch (e) {
    try { fs.unlinkSync(completado); } catch {}
    console.warn(`  ⚠️ No se pudo completar la locución con la cola de música (${e.message}); se queda como salió`);
    return { duracion, finDeVoz: null, cola: 0 };
  }
}

module.exports = { colaQueFalta, completarConCola, OBJETIVO_SEG };

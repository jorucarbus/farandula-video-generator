// DURACIÓN ESTIMADA DE LA VOZ, ANTES de pagarla.
// ElevenLabs cobra por carácter y el video tiene un tope de 74 s: un guion que se pasa obliga a rehacer la voz (otro cobro) o a cortar la narración.
// Calibrado con 14 guiones reales (voz + tiempos medidos): palabras/s varía 6,2 % entre guiones, caracteres/s 4,0 %, y (caracteres + 10 × signos de puntuación)/s solo 2,7 %
// (media 18,7). Las pausas de la puntuación cuentan casi como 10 letras. Recalibrar con `node scripts/calibrar-duracion.js` si cambia la voz.
const K = 18.7, LIMITE_VIDEO = 74, COLA = 0.8;
const TOPE_ESTIMADO = 69;   // por encima de esto el guion se acorta antes de generar la voz (con 5-7 % de variación entre generaciones, 69 s → ≤ 73,2 s)
const OBJETIVO = 66.5;      // a cuánto se acorta (ventana buscada 62-70 s)

function estimar(texto) {
  const t = String(texto || '').replace(/\[[^\]]*\]/g, ''); // las etiquetas de emoción entre corchetes no se pronuncian
  return (t.length + 10 * (t.match(/[.,;:?!¿¡…]/g) || []).length) / K;
}
const palabras = t => (String(t || '').match(/\S+/g) || []).length;

// Acorta con UNA llamada de texto (cadena creativa) conservando gancho, datos clave y pregunta final. `llamar(prompt, mensaje)` es inyectable.
async function acortar(script, { llamar = null, objetivo = OBJETIVO, actual = null } = {}) {
  llamar = llamar || ((p, m) => { const g = require('../gemini'); return g.llamarJSON(p, m, g.TAREAS.guion); });
  const metaPal = Math.round(objetivo * (palabras(script) / Math.max(1, estimar(script)))), act = actual || estimar(script);
  const prompt = `Acorta este guion de video corto de farándula. Ahora dura ~${act.toFixed(0)} s hablado y debe durar ~${objetivo.toFixed(0)} s (unas ${metaPal} palabras).
Reglas: conserva el gancho de apertura, los datos más fuertes (nombres, cifras, lugares), el orden y la pregunta o consecuencia final. Quita lo repetitivo, los datos secundarios y los adornos. NO agregues datos, nombres ni cifras nuevos; no cambies ningún hecho. Conserva las etiquetas entre corchetes que ya haya. Escribe en español neutro.
Responde SOLO JSON: {"guion":"..."}`;
  const r = await llamar(prompt, `GUION:\n${script}`), nuevo = String((r && r.guion) || '').trim();
  return nuevo && palabras(nuevo) >= 60 && estimar(nuevo) < act ? nuevo : script; // si el modelo devolvió algo inservible, se conserva el original
}

module.exports = { estimar, acortar, palabras, K, LIMITE_VIDEO, COLA, TOPE_ESTIMADO, OBJETIVO };

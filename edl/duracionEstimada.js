// DURACIÓN ESTIMADA DE LA VOZ, ANTES de pagarla.
// ElevenLabs cobra por carácter y el video tiene un tope de 74 s: un guion que se pasa obliga a rehacer la voz (otro cobro) o a cortar la narración.
// Calibrado con 14 guiones reales (voz + tiempos medidos): palabras/s varía 6,2 % entre guiones, caracteres/s 4,0 %, y (caracteres + 10 × signos de puntuación)/s solo 2,7 %
// (media 18,7). Las pausas de la puntuación cuentan casi como 10 letras. Recalibrar con `node scripts/calibrar-duracion.js` si cambia la voz.
const K = 18.7, LIMITE_VIDEO = 74, COLA = 0.8;

function estimar(texto) {
  const t = String(texto || '').replace(/\[[^\]]*\]\s*/g, ''); // las etiquetas de emoción entre corchetes no se pronuncian
  return (t.length + 10 * (t.match(/[.,;:?!¿¡…]/g) || []).length) / K;
}
const palabras = t => (String(t || '').match(/\S+/g) || []).length;

module.exports = { estimar, palabras, K, LIMITE_VIDEO, COLA };

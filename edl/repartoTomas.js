// REPARTO DE TOMAS POR TIEMPO (como la app vieja): cada carpeta recibe el tiempo REAL (segundos) de las frases que le tocan, y ese tiempo se divide en tomas iguales.
// Regla de los 3 s: ninguna toma pasa de `max`. Si a una carpeta le tocan 7 s con max 3, NO son 3+3+1: son 3 tomas de 2,33 s (el tiempo se reparte parejo).
// La puerta de calidad sube: de cada carpeta solo entran tomas con buen puntaje (calidad.json), ordenadas por puntaje y por lo adecuadas que sean.
const MIN_CALIDAD = () => Number(process.env.CALIDAD_MIN_TOMAS) || 75;

// largo (s) y tope por toma → cuántas tomas y cuánto dura cada una (parejas).
function dividir(largo, max) { const n = Math.max(1, Math.ceil(largo / max - 1e-9)); return { n, dur: largo / n }; }

// ids: ya en el orden de preferencia de quien los dio (rostro, acción…). Mezcla ese orden (50 %) con el puntaje de calidad (50 %), descarta lo que esté bajo `min`
// y, si quedan menos de `necesarias`, baja el mínimo de 5 en 5 (hasta 50) antes de aceptar menos tomas que tiempo que cubrir. Un clip `apto:false` nunca entra.
function ordenarPorCalidad(ids, calidad = {}, { necesarias = 0, min = MIN_CALIDAD() } = {}) {
  const n = Math.max(1, ids.length), punt = id => (calidad[id] && Number.isFinite(calidad[id].puntaje) ? calidad[id].puntaje : 70);
  const validos = ids.filter(id => !(calidad[id] && calidad[id].apto === false));
  const puntuados = validos.map((id, i) => ({ id, s: 0.5 * (1 - i / n) + 0.5 * punt(id) / 100 })).sort((a, b) => b.s - a.s);
  let m = min, sel = puntuados.filter(x => punt(x.id) >= m);
  while (sel.length < necesarias && m > 50) { m -= 5; sel = puntuados.filter(x => punt(x.id) >= m); }
  return sel.map(x => x.id);
}

module.exports = { dividir, ordenarPorCalidad, MIN_CALIDAD };

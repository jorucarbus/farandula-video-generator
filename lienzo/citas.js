// REGLA DEL PRODUCTO: la protagonista NO habla con la voz del narrador; solo REACCIONA a lo que escucha (gestos, miradas, emociones). Su boca solo se sincroniza
// cuando el guion la CITA textualmente (entre comillas « », “ ” o " ") o cuando el beat trae `cita: true`. Aquí se calculan esas ventanas de tiempo.
const { palabrasDeGuion } = require('../edl/tiemposPalabras');

// beats: [{ frase, cita? }]; palabras: palabras con tiempos (una por palabra del guion, en orden); V: salida de ventanasDeFrases (t0, t1, desde, hasta por beat).
// → [{ t0, t1, beat }]  (segundos del video)
function ventanasDeCitas(beats, palabras, V) {
  const out = [];
  beats.forEach((b, i) => {
    if (!V[i]) return;
    if (b.cita === true) { out.push({ t0: V[i].t0, t1: V[i].t1, beat: i }); return; }
    const re = /[«“"]([^»”"]{2,})[»”"]/g; let m;
    while ((m = re.exec(b.frase))) {
      const antes = palabrasDeGuion(b.frase.slice(0, m.index)).length, dentro = palabrasDeGuion(m[1]).length; if (!dentro) continue;
      const a = palabras[V[i].desde + antes], z = palabras[V[i].desde + antes + dentro - 1]; if (a && z) out.push({ t0: a.t0, t1: z.t1, beat: i });
    }
  });
  return out;
}

// Deja la voz (abertura, energía, visemas) solo dentro de las ventanas de cita; fuera de ellas la boca queda en reposo. Devuelve null si no hay ninguna cita.
function vozSoloEnCitas(voz, ventanas, fps = 30) {
  if (!voz || !ventanas.length) return null;
  const dentro = f => ventanas.some(w => f / fps >= w.t0 - 0.05 && f / fps <= w.t1 + 0.1), n = voz.visemas ? voz.visemas.length : voz.abertura.length;
  const visemas = Array.from({ length: n }, (_, f) => (dentro(f) && voz.visemas ? voz.visemas[f] : 'N'));
  const abertura = Float32Array.from({ length: voz.abertura.length }, (_, f) => (dentro(f) ? voz.abertura[f] : 0));
  return { ...voz, abertura, visemas };
}

module.exports = { ventanasDeCitas, vozSoloEnCitas };

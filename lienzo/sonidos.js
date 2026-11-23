// Efectos de sonido SINTETIZADOS en código (sin licencias, deterministas, mismo sonido cada vez). Cada animación
// declara sus eventos [{t, sonido}] en tiempo absoluto; aquí se genera una pista WAV mono que el renderer mezcla bajo la voz.
// Niveles en estilos/*.js (sonido.ganancias, dB): se ajustan a oído y no tocan este código.
const fs = require('fs');

const SR = 44100;
const TAU = Math.PI * 2;
const dbALin = db => Math.pow(10, db / 20);
// Ruido determinista (misma "tirada" en cada render).
function ruido(semilla = 1) { let a = semilla >>> 0; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 2147483648 - 1; }; }

const SONIDOS = {
  // Aparece un elemento: barrido ascendente corto y redondo.
  pop() { const n = Math.floor(SR * 0.16), s = new Float32Array(n); let fase = 0;
    for (let i = 0; i < n; i++) { const t = i / SR; fase += TAU * (420 + 700 * Math.min(1, t / 0.06)) / SR; s[i] = Math.sin(fase) * Math.exp(-t * 28) * Math.min(1, t / 0.004); } return s; },
  // Un trazo a mano o un deslizamiento: ruido filtrado con barrido de frecuencia.
  trazo() { const n = Math.floor(SR * 0.28), s = new Float32Array(n), r = ruido(7); let lp = 0, bp = 0;
    for (let i = 0; i < n; i++) { const t = i / SR, x = t / 0.28, fc = 500 + 2400 * Math.pow(x, 1.5), f = 2 * Math.sin(Math.PI * fc / SR);
      const hp = r() - lp - 0.8 * bp; bp += f * hp; lp += f * bp; s[i] = bp * Math.pow(Math.sin(Math.PI * x), 2) * 0.55; } return s; },
  // Pulso corto de contador: cada cambio de cifra.
  tick() { const n = Math.floor(SR * 0.03), s = new Float32Array(n), r = ruido(3);
    for (let i = 0; i < n; i++) { const t = i / SR; s[i] = (Math.sin(TAU * 2100 * t) * 0.8 + r() * 0.2) * Math.exp(-t * 260); } return s; },
  // Impacto grave: sello que cae, marcador que aterriza.
  golpe() { const n = Math.floor(SR * 0.26), s = new Float32Array(n), r = ruido(11); let fase = 0, lp = 0;
    for (let i = 0; i < n; i++) { const t = i / SR; fase += TAU * (48 + 70 * Math.exp(-t * 22)) / SR; lp += 0.25 * (r() - lp);
      s[i] = Math.sin(fase) * Math.exp(-t * 14) + lp * Math.exp(-t * 90) * 0.6; } return s; },
  // Cierre de un conteo o un logro: dos parciales que se apagan despacio.
  ding() { const n = Math.floor(SR * 0.55), s = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / SR; s[i] = (Math.sin(TAU * 1318.5 * t) * 0.6 + Math.sin(TAU * 1975.5 * t) * 0.35) * Math.exp(-t * 7) * Math.min(1, t / 0.003); } return s; },
  // Aparición suave (filas de una lista, etiquetas): pop más grave y corto.
  clic() { const n = Math.floor(SR * 0.09), s = new Float32Array(n); let fase = 0;
    for (let i = 0; i < n; i++) { const t = i / SR; fase += TAU * (330 + 260 * Math.min(1, t / 0.035)) / SR; s[i] = Math.sin(fase) * Math.exp(-t * 45) * Math.min(1, t / 0.003); } return s; },
};

// eventos: [{ t, sonido, db? }]; ganancias: { sonido: dB }; maestro en dB. Devuelve Float32Array (mono, SR).
function mezclar(eventos, duracion, { ganancias = {}, maestro = 0 } = {}) {
  const total = new Float32Array(Math.ceil(duracion * SR));
  const cache = {};
  for (const e of eventos) {
    const f = SONIDOS[e.sonido]; if (!f) continue;
    const buf = cache[e.sonido] || (cache[e.sonido] = f());
    const g = dbALin((ganancias[e.sonido] ?? 0) + (e.db || 0) + maestro), ini = Math.round(e.t * SR);
    for (let i = 0; i < buf.length && ini + i < total.length; i++) if (ini + i >= 0) total[ini + i] += buf[i] * g;
  }
  let pico = 0; for (let i = 0; i < total.length; i++) pico = Math.max(pico, Math.abs(total[i]));
  if (pico > 0.95) { const k = 0.95 / pico; for (let i = 0; i < total.length; i++) total[i] *= k; } // nunca recorta
  return total;
}

function escribirWav(ruta, muestras) {
  const n = muestras.length, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(muestras[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(ruta, b);
  return ruta;
}

// Momentos en que cambia el número mostrado por un conteo (los "tick"); como mucho `max`, repartidos parejo.
function ticksDeConteo(valor, t0, dur, ease, max = 14) {
  const cambios = []; let previo = 0;
  for (let t = 0; t <= dur; t += 1 / 120) { const v = Math.round(valor * ease(t / dur)); if (v !== previo) { cambios.push(t0 + t); previo = v; } }
  if (cambios.length <= max) return cambios;
  return Array.from({ length: max }, (_, k) => cambios[Math.round(k * (cambios.length - 1) / (max - 1))]);
}

module.exports = { SONIDOS, mezclar, escribirWav, ticksDeConteo, SR };

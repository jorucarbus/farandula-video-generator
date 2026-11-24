// Efectos de sonido SINTETIZADOS en código (sin licencias, deterministas). Cada animación declara sus eventos
// [{t, sonido, db?, pitch?}] en tiempo absoluto; aquí se genera una pista WAV mono que el renderer mezcla bajo la voz.
// Para que NO suenen repetitivos: cada sonido tiene varias variantes que se turnan, cada evento lleva una pequeña
// variación de tono y de volumen (determinista), los agudos se suavizan y el mismo sonido no se repite pegado.
// Niveles en estilos/*.js (sonido.ganancias y maestro, dB): se ajustan a oído y no tocan este código.
const fs = require('fs');

const SR = 44100;
const TAU = Math.PI * 2;
const dbALin = db => Math.pow(10, db / 20);
// Ruido determinista (misma "tirada" en cada render).
function ruido(semilla = 1) { let a = semilla >>> 0; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 2147483648 - 1; }; }
// Filtro pasa-bajos de un polo: quita lo áspero de los agudos.
function suavizar(s, hz) { const a = 1 - Math.exp(-TAU * hz / SR); let y = 0; for (let i = 0; i < s.length; i++) { y += a * (s[i] - y); s[i] = y; } return s; }

// Cada generador acepta { pitch (razón de tono, 1 = base), variante (0..n-1) }.

// ── Muestras REALES (CC0, Freesound vía Openverse; assets/sfx/<sonido>-N.wav, ver MANIFEST.json): si existen, reemplazan a la síntesis; si no, queda el sintético de respaldo.
// SFX_SINTETICOS=1 fuerza el sintético. El tono (pitch) remuestrea la muestra con interpolación lineal.
const DIR_SFX = require('path').join(__dirname, '..', 'assets', 'sfx');
const GANANCIA_REAL = { pop: 0, clic: -1, tick: 0, golpe: 0, trazo: -6, ding: 0, whoosh: 3 }; // nivel base de cada muestra real respecto al sintético (dB)
const _muestras = {};
function leerWav(ruta) { // WAV PCM 16 bits mono → Float32Array
  const b = require('fs').readFileSync(ruta); let p = 12;
  while (p + 8 <= b.length) { const id = b.toString('ascii', p, p + 4), n = b.readUInt32LE(p + 4); if (id === 'data') { const m = Math.floor(Math.min(n, b.length - p - 8) / 2), out = new Float32Array(m); for (let i = 0; i < m; i++) out[i] = b.readInt16LE(p + 8 + i * 2) / 32768; return out; } p += 8 + n + (n % 2); }
  return new Float32Array(0);
}
function muestrasDe(sonido) {
  if (process.env.SFX_SINTETICOS) return [];
  if (_muestras[sonido]) return _muestras[sonido];
  const fs = require('fs'), lista = []; if (fs.existsSync(DIR_SFX)) for (let i = 1; i < 10; i++) { const f = require('path').join(DIR_SFX, `${sonido}-${i}.wav`); if (fs.existsSync(f)) lista.push(leerWav(f)); else break; }
  return (_muestras[sonido] = lista.filter(x => x.length > 0));
}
function realDe(sonido, { pitch = 1, variante = 0 } = {}) {
  const m = muestrasDe(sonido); if (!m.length) return null;
  const src = m[variante % m.length], n = Math.floor(src.length / pitch), out = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i * pitch, i0 = Math.floor(x), fr = x - i0; out[i] = src[i0] * (1 - fr) + (src[i0 + 1] ?? 0) * fr; }
  return out;
}

const SONIDOS = {
  whoosh({ pitch = 1 } = {}) { // respaldo sintético: ruido filtrado con barrido de brillo
    const dur = 0.42, n = Math.round(dur * SR), s = new Float32Array(n), r = ruido(7); let y = 0;
    for (let i = 0; i < n; i++) { const t = i / SR, x = t / dur, fc = (300 + 3200 * Math.sin(Math.PI * x)) * pitch, a = 1 - Math.exp(-TAU * fc / SR); y += a * (r() - y); s[i] = y * Math.sin(Math.PI * x) * 1.6; }
    return s;
  },

  // Aparece un elemento: barrido ascendente corto y redondo (3 voces).
  pop({ pitch = 1, variante = 0 } = {}) {
    const v = variante % 3, dur = [0.16, 0.13, 0.10][v], f0 = [420, 360, 520][v] * pitch, f1 = [1120, 880, 1500][v] * pitch, dec = [28, 34, 45][v], sw = [0.06, 0.05, 0.035][v];
    const n = Math.floor(SR * dur), s = new Float32Array(n); let fase = 0;
    for (let i = 0; i < n; i++) { const t = i / SR; fase += TAU * (f0 + (f1 - f0) * Math.min(1, t / sw)) / SR; s[i] = (Math.sin(fase) + (v === 1 ? 0.22 * Math.sin(3 * fase) : 0)) * Math.exp(-t * dec) * Math.min(1, t / 0.004); }
    return suavizar(s, 5200);
  },
  // Un trazo a mano o un deslizamiento: ruido filtrado con barrido de frecuencia (3 voces).
  trazo({ pitch = 1, variante = 0 } = {}) {
    const v = variante % 3, dur = [0.28, 0.22, 0.32][v], [a, b] = [[500, 2900], [300, 1800], [700, 3600]][v];
    const n = Math.floor(SR * dur), s = new Float32Array(n), r = ruido(7 + v * 13); let lp = 0, bp = 0;
    for (let i = 0; i < n; i++) { const t = i / SR, x = t / dur, fc = (a + (b - a) * Math.pow(x, 1.5)) * pitch, f = 2 * Math.sin(Math.PI * Math.min(fc, 9000) / SR);
      const hp = r() - lp - 0.8 * bp; bp += f * hp; lp += f * bp; s[i] = bp * Math.pow(Math.sin(Math.PI * x), 2) * 0.5; }
    return suavizar(s, 6000);
  },
  // Pulso corto de contador: cada cambio de cifra (el tono sube con la cuenta).
  tick({ pitch = 1 } = {}) {
    const n = Math.floor(SR * 0.03), s = new Float32Array(n), r = ruido(3);
    for (let i = 0; i < n; i++) { const t = i / SR; s[i] = (Math.sin(TAU * 1700 * pitch * t) * 0.85 + r() * 0.15) * Math.exp(-t * 240); }
    return suavizar(s, 5000);
  },
  // Impacto grave: sello que cae, marcador que aterriza (2 voces).
  golpe({ pitch = 1, variante = 0 } = {}) {
    const v = variante % 2, base = [48, 62][v] * pitch, barrido = [70, 90][v];
    const n = Math.floor(SR * 0.26), s = new Float32Array(n), r = ruido(11 + v); let fase = 0, lp = 0;
    for (let i = 0; i < n; i++) { const t = i / SR; fase += TAU * (base + barrido * Math.exp(-t * 22)) / SR; lp += 0.25 * (r() - lp); s[i] = Math.sin(fase) * Math.exp(-t * 14) + lp * Math.exp(-t * 90) * 0.5; }
    return suavizar(s, 3500);
  },
  // Cierre de un conteo o un logro: dos parciales que se apagan despacio (2 voces).
  ding({ pitch = 1, variante = 0 } = {}) {
    const v = variante % 2, [f1, f2] = [[1318.5, 1975.5], [1174.7, 1760]][v];
    const n = Math.floor(SR * 0.5), s = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / SR; s[i] = (Math.sin(TAU * f1 * pitch * t) * 0.6 + Math.sin(TAU * f2 * pitch * t) * 0.32) * Math.exp(-t * 8) * Math.min(1, t / 0.003); }
    return suavizar(s, 5500);
  },
  // Aparición suave (filas de una lista, etiquetas): pop más grave y corto (2 voces).
  clic({ pitch = 1, variante = 0 } = {}) {
    const v = variante % 2, f0 = [330, 290][v] * pitch, f1 = [590, 520][v] * pitch;
    const n = Math.floor(SR * 0.09), s = new Float32Array(n); let fase = 0;
    for (let i = 0; i < n; i++) { const t = i / SR; fase += TAU * (f0 + (f1 - f0) * Math.min(1, t / 0.035)) / SR; s[i] = Math.sin(fase) * Math.exp(-t * 45) * Math.min(1, t / 0.003); }
    return suavizar(s, 4500);
  },
};
const VARIANTES = { pop: 3, trazo: 3, golpe: 2, ding: 2, clic: 2, tick: 1 };
const SEPARACION_MIN = 0.28; // s: el mismo sonido no se repite más pegado que esto (salvo el conteo)

// eventos: [{ t, sonido, db?, pitch? }]; ganancias: { sonido: dB }; maestro en dB. Devuelve Float32Array (mono, SR).
function mezclar(eventos, duracion, { ganancias = {}, maestro = 0 } = {}) {
  const total = new Float32Array(Math.ceil(duracion * SR));
  const cache = new Map(), azar = ruido(12345), contador = {}, ultimo = {};
  for (const e of [...eventos].sort((a, b) => a.t - b.t)) {
    const f = SONIDOS[e.sonido]; if (!f && !muestrasDe(e.sonido).length) continue;
    if (e.sonido !== 'tick' && ultimo[e.sonido] !== undefined && e.t - ultimo[e.sonido] < SEPARACION_MIN) continue;
    ultimo[e.sonido] = e.t;
    const k = contador[e.sonido] = (contador[e.sonido] ?? -1) + 1;
    const nReal = muestrasDe(e.sonido).length, variante = (k + e.sonido.length) % (nReal || VARIANTES[e.sonido] || 1);
    const pitch = (e.pitch || 1) * (1 + azar() * 0.06), jitterDb = azar() * 1.5; // ±6 % de tono, ±1.5 dB
    const clave = `${e.sonido}|${variante}|${pitch.toFixed(3)}`;
    const buf = cache.get(clave) || (cache.set(clave, (nReal ? realDe(e.sonido, { pitch, variante }) : null) || f({ pitch, variante })), cache.get(clave));
    const g = dbALin((ganancias[e.sonido] ?? 0) + (nReal ? (GANANCIA_REAL[e.sonido] ?? -6) : 0) + (e.db || 0) + jitterDb + maestro), ini = Math.round(e.t * SR);
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

// Momentos en que cambia el número mostrado por un conteo (los "tick"); como mucho `max`, repartidos parejo y
// con el tono subiendo a medida que avanza la cuenta (pitch 1 → 1.4).
function ticksDeConteo(valor, t0, dur, ease, max = 10) {
  const cambios = []; let previo = 0;
  for (let t = 0; t <= dur; t += 1 / 120) { const v = Math.round(valor * ease(t / dur)); if (v !== previo) { cambios.push(t0 + t); previo = v; } }
  const elegidos = cambios.length <= max ? cambios : Array.from({ length: max }, (_, k) => cambios[Math.round(k * (cambios.length - 1) / (max - 1))]);
  return elegidos;
}

module.exports = { muestrasDe, SONIDOS, VARIANTES, mezclar, escribirWav, ticksDeConteo, SR };

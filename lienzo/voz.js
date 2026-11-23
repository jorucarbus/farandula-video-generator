// Envolvente de la voz para animar la marioneta: abertura de boca por cuadro (0..1) y energía para el cuerpo.
// Se decodifica el audio con ffmpeg a PCM mono y se mide el volumen RMS por ventana de cuadro; luego se suaviza
// con ataque rápido y caída lenta (la boca abre de golpe y cierra suave, como al hablar), y se normaliza contra
// el percentil 95 para que no dependa del volumen de la grabación. Sin modelos ni red.
const { execFile } = require('child_process');

function decodificar(audio, ffmpeg, sr = 16000) {
  return new Promise((res, rej) => execFile(ffmpeg, ['-v', 'error', '-i', audio, '-f', 'f32le', '-ac', '1', '-ar', String(sr), '-'],
    { encoding: 'buffer', maxBuffer: 1 << 29 }, (e, out) => (e ? rej(e) : res(new Float32Array(out.buffer, out.byteOffset, Math.floor(out.length / 4))))));
}

// → { fps, abertura: Float32Array, energia: Float32Array }  (un valor por cuadro de video)
async function envolventeDeVoz(audio, { fps = 30, duracion = null, ffmpeg = process.env.FFMPEG_BIN || require('ffmpeg-static') } = {}) {
  const sr = 16000, pcm = await decodificar(audio, ffmpeg, sr);
  const n = Math.ceil((duracion ?? pcm.length / sr) * fps), paso = sr / fps, rms = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let j = Math.floor(i * paso); j < Math.min(pcm.length, Math.floor((i + 1) * paso)); j++, c++) s += pcm[j] * pcm[j]; rms[i] = c ? Math.sqrt(s / c) : 0; }
  const orden = [...rms].sort((a, b) => a - b), p95 = orden[Math.floor(orden.length * 0.95)] || 1e-6, piso = orden[Math.floor(orden.length * 0.2)] || 0;
  const norm = rms.map(v => Math.min(1, Math.max(0, (v - piso * 1.2) / Math.max(1e-6, p95 - piso * 1.2))));
  const suavizar = (x, ataque, caida) => { const y = new Float32Array(x.length); let a = 0; for (let i = 0; i < x.length; i++) { a += (x[i] > a ? ataque : caida) * (x[i] - a); y[i] = a; } return y; };
  return {
    fps,
    abertura: suavizar(norm.map(v => Math.pow(v, 0.8)), 0.65, 0.35),   // boca: rápida
    energia: suavizar(norm, 0.18, 0.06),                                // cuerpo/cabeza: lenta
  };
}

module.exports = { envolventeDeVoz };

// Tiempo de cada palabra del guion. Whisper (local, gratis) oye el audio y da tiempos por palabra; como el guion
// es conocido, se ALINEA lo oído con lo escrito (Needleman-Wunsch sobre palabras normalizadas): donde Whisper se
// equivoca en un nombre propio, la palabra del guion igual recibe tiempo (interpolado entre vecinas seguras).
// Sirve para cualquier audio (voz propia, citas de terceros) y es el mismo contrato que usarían los efectos y
// los subtítulos: [{ palabra, t0, t1, exacta }] en el orden del guion.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const normalizar = t => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ]+/g, '');
// El guion como palabras visibles (con su puntuación) y su forma normalizada para comparar.
const palabrasDeGuion = guion => String(guion).trim().split(/\s+/).filter(Boolean).map(p => ({ palabra: p, norm: normalizar(p) }));

// Alineación global de dos secuencias: devuelve, por cada palabra del guion, el índice de la palabra de Whisper
// emparejada (o -1). Coincidencia exacta suma 3; casi-igual (mismo comienzo de 4+ letras) suma 1; hueco o error resta 2.
function alinear(guion, oidas) {
  const n = guion.length, m = oidas.length, G = -2;
  const punt = (a, b) => (a === b ? 3 : (a.length >= 4 && b.length >= 4 && (a.startsWith(b.slice(0, 4)) || b.startsWith(a.slice(0, 4))) ? 1 : -2));
  const S = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = 1; i <= n; i++) S[i][0] = i * G;
  for (let j = 1; j <= m; j++) S[0][j] = j * G;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    S[i][j] = Math.max(S[i - 1][j - 1] + punt(guion[i - 1], oidas[j - 1]), S[i - 1][j] + G, S[i][j - 1] + G);
  }
  const par = new Array(n).fill(-1);
  let i = n, j = m;
  while (i > 0 && j > 0) {
    const d = S[i - 1][j - 1] + punt(guion[i - 1], oidas[j - 1]);
    if (S[i][j] === d) { if (punt(guion[i - 1], oidas[j - 1]) > 0) par[i - 1] = j - 1; i--; j--; }
    else if (S[i][j] === S[i - 1][j] + G) i--;
    else j--;
  }
  return par;
}

// guion: texto; whisper: [{w,s,e}] → [{ palabra, t0, t1, exacta }]
function alinearPalabras(guion, whisper, { duracion = null } = {}) {
  const g = palabrasDeGuion(guion);
  const oidas = whisper.map(p => normalizar(p.w));
  const par = alinear(g.map(p => p.norm), oidas);
  const out = g.map((p, k) => ({ palabra: p.palabra, t0: null, t1: null, exacta: par[k] >= 0 }));
  par.forEach((j, k) => { if (j >= 0) { out[k].t0 = whisper[j].s; out[k].t1 = whisper[j].e; } });
  // Palabras sin pareja: se reparten entre la vecina segura anterior y la siguiente, proporcional a su largo.
  const fin = duracion ?? (whisper.length ? whisper[whisper.length - 1].e : 0);
  let k = 0;
  while (k < out.length) {
    if (out[k].t0 !== null) { k++; continue; }
    let a = k; while (k < out.length && out[k].t0 === null) k++;
    const antes = a > 0 ? out[a - 1].t1 : 0, despues = k < out.length ? out[k].t0 : fin;
    const tramo = out.slice(a, k), pesos = tramo.map(p => Math.max(1, normalizar(p.palabra).length)), total = pesos.reduce((x, y) => x + y, 0);
    let t = antes;
    tramo.forEach((p, q) => { const d = Math.max(0.05, (despues - antes) * pesos[q] / total); p.t0 = +t.toFixed(3); p.t1 = +Math.min(despues, t + d).toFixed(3); t += d; });
  }
  return out;
}

// Frases del guion → ventanas de tiempo. beats: [{frase}]; palabras: salida de alinearPalabras para el guion = frases unidas.
function ventanasDeFrases(beats, palabras) {
  let i = 0;
  return beats.map(b => {
    const n = palabrasDeGuion(b.frase).length;
    const tramo = palabras.slice(i, i + n); i += n;
    return { t0: tramo[0].t0, t1: tramo[tramo.length - 1].t1, desde: i - n, hasta: i };
  });
}

// Ejecuta herramientas/whisper_palabras.py. py: intérprete con faster-whisper (WHISPER_PY o argumento).
function ejecutarWhisper(audio, { py = process.env.WHISPER_PY || 'python', modelo = 'small', ffmpeg = process.env.FFMPEG_BIN || require('ffmpeg-static') } = {}) {
  return new Promise((resolve, reject) => {
    if (!py) return reject(new Error('define WHISPER_PY (python con faster-whisper)'));
    const salida = path.join(os.tmpdir(), `whisper_${Date.now()}.json`);
    execFile(py, [path.join(__dirname, '..', 'herramientas', 'whisper_palabras.py'), audio, salida, modelo],
      { timeout: 600000, env: { ...process.env, FFMPEG_BIN: ffmpeg } }, (err, _o, stderr) => {
        if (err) return reject(new Error(`whisper: ${(stderr || err.message).slice(-400)}`));
        try { resolve(JSON.parse(fs.readFileSync(salida, 'utf8'))); } finally { try { fs.unlinkSync(salida); } catch {} }
      });
  });
}

module.exports = { alinearPalabras, ventanasDeFrases, palabrasDeGuion, ejecutarWhisper, normalizar };

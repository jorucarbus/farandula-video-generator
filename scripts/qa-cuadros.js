// QA automático de un video renderizado: detecta PANTALLAS VACÍAS (huecos sin muñeco, clip ni elemento) y deja una hoja de cuadros (uno cada 3 s) para mirarla.
// Uso: node scripts/qa-cuadros.js <video.mp4> [--umbral 5] [--min 1.0]   → imprime los huecos y escribe <video>.cuadros.png
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? Number(process.argv[i + 1]) : d; };
const video = process.argv[2]; if (!video || !fs.existsSync(video)) { console.error('Uso: node scripts/qa-cuadros.js <video.mp4>'); process.exit(1); }
const FF = process.env.FFMPEG_BIN || require('ffmpeg-static'), UMBRAL = arg('--umbral', 5), MIN = arg('--min', 0.4), FPS = 4, W = 108, H = 192;
// cuadros pequeños en gris (4 por segundo): se mide cuánto varía el brillo en la zona central (sin subtítulos arriba ni piso abajo)
const raw = execFileSync(FF, ['-v', 'error', '-i', video, '-vf', `fps=${FPS},scale=${W}:${H},format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 29 }), n = Math.floor(raw.length / (W * H)), desv = [];
for (let f = 0; f < n; f++) { let s = 0, s2 = 0, c = 0; for (let y = Math.round(H * 0.18); y < Math.round(H * 0.88); y++) for (let x = 0; x < W; x++) { const v = raw[f * W * H + y * W + x]; s += v; s2 += v * v; c++; } const m = s / c; desv.push(Math.sqrt(Math.max(0, s2 / c - m * m))); }
if (process.argv.includes('--debug')) console.log(desv.map((d, f) => (f / FPS).toFixed(1) + ':' + d.toFixed(1)).join(' '));
const huecos = []; let ini = null;
desv.forEach((d, f) => { const vacio = d < UMBRAL; if (vacio && ini === null) ini = f; if ((!vacio || f === n - 1) && ini !== null) { const fin = vacio ? f + 1 : f; if ((fin - ini) / FPS >= MIN) huecos.push([ini / FPS, fin / FPS]); ini = null; } });
console.log(`Cuadros: ${n} (${(n / FPS).toFixed(1)} s). Pantallas vacías ≥ ${MIN} s: ${huecos.length ? huecos.map(([a, b]) => `${a.toFixed(1)}-${b.toFixed(1)}s`).join(', ') : 'ninguna'}`);
// hoja de cuadros cada 3 s
const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'qa-'));
execFileSync(FF, ['-y', '-v', 'error', '-i', video, '-vf', 'fps=1/3,scale=270:-1', path.join(tmp, 'f_%03d.png')]);
(async () => {
  const fl = fs.readdirSync(tmp).sort(), cols = 10, filas = Math.ceil(fl.length / cols), c = createCanvas(cols * 270, filas * 480), x = c.getContext('2d');
  for (let k = 0; k < fl.length; k++) { const im = await loadImage(path.join(tmp, fl[k])); x.drawImage(im, (k % cols) * 270, Math.floor(k / cols) * 480); const t = k * 3, vac = huecos.some(([a, b]) => t >= a && t < b); if (vac) { x.strokeStyle = '#e11'; x.lineWidth = 6; x.strokeRect((k % cols) * 270 + 3, Math.floor(k / cols) * 480 + 3, 264, 474); } x.fillStyle = '#000'; x.font = '16px sans-serif'; x.fillText(t + 's', (k % cols) * 270 + 6, Math.floor(k / cols) * 480 + 474); }
  const sal = video.replace(/\.mp4$/i, '') + '.cuadros.png'; fs.writeFileSync(sal, c.toBuffer('image/png')); console.log('Hoja de cuadros:', sal);
  fs.rmSync(tmp, { recursive: true, force: true }); process.exit(huecos.length ? 2 : 0);
})();

// Escena de pasarela (three.js + capa HTML 2D) -> fotogramas -> MP4 con la voz. Uso:
//   node pasarela.js --stills 0,60,120,180,230      (solo imágenes de prueba)
//   node pasarela.js --out salida.mp4 [--audio ruta.mp3] [--T 10]
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process'), puppeteer = require('puppeteer-core');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const RAIZ = __dirname, A3D = path.join(RAIZ, '..', '..', 'assets3d'), DALIA = path.join(RAIZ, '..', '..', 'data-motor', 'noticias', 'dalia');
const T = Number(arg('--T', 10)), STILLS = arg('--stills', ''), OUT = path.resolve(arg('--out', 'pasarela.mp4')), AUDIO = arg('--audio', path.join(RAIZ, '..', '..', 'data-motor', 'audios', '2026-11-24 Dalia.mp3'));
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary' };
const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); const f = u.startsWith('/assets3d/') ? path.join(A3D, u.slice(10)) : u.startsWith('/dalia/') ? path.join(DALIA, u.slice(7)) : path.join(RAIZ, u === '/' ? 'pasarela.html' : u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': TIPOS[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
(async () => {
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const br = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', headless: true, args: ['--headless=new', '--ignore-gpu-blocklist', '--use-angle=d3d11'], defaultViewport: { width: 1080, height: 1920 } });
  const pg = await br.newPage(); pg.on('pageerror', e => console.log('ERROR pagina', e.message)); pg.on('console', m => m.type() === 'error' && console.log('consola', m.text()));
  const t0 = Date.now(); await pg.goto(`http://localhost:${port}/?T=${T}`); await pg.waitForFunction('window.ready===true', { timeout: 120000 }); console.log('carga', ((Date.now() - t0) / 1000).toFixed(1), 's');
  const NF = await pg.evaluate('window.NF');
  if (STILLS) { for (const f of STILLS.split(',').map(Number)) { await pg.evaluate(`window.setFrame(${f})`); await pg.screenshot({ path: path.join(RAIZ, 'muestras', `pasarela-f${String(f).padStart(3, '0')}.png`) }); } console.log('stills listos'); }
  else {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    const ff = spawn('ffmpeg', ['-y', '-f', 'image2pipe', '-framerate', '24', '-c:v', 'mjpeg', '-i', '-', '-i', AUDIO, '-t', String(T), '-c:v', 'libx264', '-crf', '19', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', OUT], { stdio: ['pipe', 'ignore', 'pipe'] });
    let err = ''; ff.stderr.on('data', d => err += d); const fin = new Promise(r => ff.on('close', r));
    const ini = Date.now(); for (let f = 0; f < NF; f++) { await pg.evaluate(`window.setFrame(${f})`); const b = await pg.screenshot({ type: 'jpeg', quality: 95 }); if (!ff.stdin.write(b)) await new Promise(r => ff.stdin.once('drain', r)); if (f % 48 === 0) process.stdout.write(`\r${f}/${NF}  `); }
    ff.stdin.end(); const code = await fin; console.log(`\nLISTO ${OUT} (codigo ${code}) cuadros ${NF} en ${((Date.now() - ini) / 1000).toFixed(0)} s`); if (code) console.log(err.slice(-400));
  }
  await br.close(); srv.close();
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });

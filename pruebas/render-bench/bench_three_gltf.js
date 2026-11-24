// three.js con maniquíes glTF animados (esqueleto), clones y fondo TRANSPARENTE. Uso: node bench_three_gltf.js [--n 12] [--frames 72] [--out out_gltf]
const http = require('http'), fs = require('fs'), path = require('path'), puppeteer = require('puppeteer-core');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const N = Number(arg('--n', 12)), F = Number(arg('--frames', 72)), OUT = path.resolve(arg('--out', 'out_gltf')); fs.mkdirSync(OUT, { recursive: true });
const T = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary' };
const srv = http.createServer((q, r) => { const f = path.join(__dirname, decodeURIComponent(q.url.split('?')[0])); if (!f.startsWith(__dirname) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }, r3 = x => +(x / 1000).toFixed(3);
(async () => {
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const br = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', headless: true, args: ['--headless=new', '--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=d3d11'], defaultViewport: { width: 1080, height: 1920 } });
  const pg = await br.newPage(); pg.on('pageerror', e => console.log('ERROR pagina', e.message)); pg.on('console', m => m.type() === 'error' && console.log('consola', m.text()));
  const t0 = Date.now(); await pg.goto(`http://localhost:${port}/bench_three_gltf.html?n=${N}`); await pg.waitForFunction('window.ready===true', { timeout: 90000 }); const carga = Date.now() - t0;
  const info = await pg.evaluate('window.info'), gpu = await pg.evaluate('window.gpu');
  const tr = [], tp = [], tj = []; let pngBytes = 0;
  for (let f = 0; f < F; f++) {
    tr.push(await pg.evaluate(`window.renderFrame(${f})`));
    let a = performance.now(); const pj = await pg.evaluate('window.jpeg()'); tj.push(performance.now() - a);
    a = performance.now(); const pp = await pg.evaluate('window.png()'); tp.push(performance.now() - a);
    if (f % 12 === 0) { fs.writeFileSync(path.join(OUT, `f${String(f).padStart(3, '0')}.png`), Buffer.from(pp.split(',')[1], 'base64')); pngBytes = pp.length; }
  }
  console.log('BENCH', JSON.stringify({ gpu, clones: N, bones_por_maniqui: info.bones, clip: info.clips, carga_s: r3(carga), render_median_s: r3(med(tr.slice(1))), captura_png_alfa_median_s: r3(med(tp)), captura_jpeg_median_s: r3(med(tj)), frames: F }));
  await br.close(); srv.close();
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });

// Mide three.js en Chrome headless con la misma escena. Uso: node bench_three.js [--gpu on|off] [--out carpeta]
const http = require('http'), fs = require('fs'), path = require('path'), puppeteer = require('puppeteer-core');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const GPU = arg('--gpu', 'on') === 'on', OUT = path.resolve(arg('--out', 'out_three')), N = Number(arg('--frames', 72));
fs.mkdirSync(OUT, { recursive: true });
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
const srv = http.createServer((q, r) => { const f = path.join(__dirname, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/bench_three.html')); if (!f.startsWith(__dirname) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': TIPOS[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
(async () => {
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const args = ['--headless=new', '--ignore-gpu-blocklist', '--enable-webgl', ...(GPU ? ['--use-angle=d3d11', '--enable-gpu-rasterization'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])];
  const br = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', headless: true, args, defaultViewport: { width: 1080, height: 1920 } });
  const pg = await br.newPage(); pg.on('pageerror', e => console.log('ERROR pagina', e.message)); pg.on('console', m => m.type() === 'error' && console.log('consola', m.text()));
  await pg.goto(`http://localhost:${port}/`); await pg.waitForFunction('window.ready===true', { timeout: 60000 });
  const gpu = await pg.evaluate('window.gpu'); const tr = [], tc = [], tj = [];
  for (let f = 0; f < N; f++) {
    tr.push(await pg.evaluate(`window.renderFrame(${f})`));
    let t0 = performance.now(); const b64 = await pg.evaluate('window.jpeg(0.92)'); tj.push(performance.now() - t0);
    t0 = performance.now(); const shot = await pg.screenshot({ type: 'jpeg', quality: 92 }); tc.push(performance.now() - t0);
    if (f % 12 === 0 || f === N - 1) fs.writeFileSync(path.join(OUT, 'f' + String(f).padStart(3, '0') + '.jpg'), shot);
  }
  const r = x => +(x / 1000).toFixed(3);
  console.log('BENCH', JSON.stringify({ engine: 'three.js', gpu, modo: GPU ? 'GPU (d3d11)' : 'swiftshader (CPU)', frames: N, render_first_s: r(tr[0]), render_median_s: r(med(tr.slice(1))), toDataURL_jpeg_median_s: r(med(tj)), screenshot_jpeg_median_s: r(med(tc)) }));
  await br.close(); srv.close();
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });

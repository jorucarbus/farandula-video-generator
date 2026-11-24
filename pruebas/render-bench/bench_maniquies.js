const http = require('http'), fs = require('fs'), path = require('path'), puppeteer = require('puppeteer-core');
const RAIZ = __dirname, A3D = path.join(__dirname, '..', '..', 'assets3d');
const T = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary' };
const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); const f = u.startsWith('/assets3d/') ? path.join(A3D, u.slice(10)) : path.join(RAIZ, u); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
(async () => {
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const br = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', headless: true, args: ['--headless=new', '--ignore-gpu-blocklist', '--use-angle=d3d11'], defaultViewport: { width: 1800, height: 1560 } });
  const pg = await br.newPage(); pg.on('pageerror', e => console.log('ERROR pagina', e.message));
  await pg.goto(`http://localhost:${port}/bench_maniquies.html`); await pg.waitForFunction('window.ready===true', { timeout: 120000 });
  console.log(JSON.stringify(await pg.evaluate('window.info'), null, 1)); console.log('AVISOS', JSON.stringify(await pg.evaluate('window.warns')));
  const b64 = await pg.evaluate("document.querySelector('canvas').toDataURL('image/png')"); fs.writeFileSync(path.join(RAIZ, 'muestras', 'maniquies-comparacion.png'), Buffer.from(b64.split(',')[1], 'base64'));
  await br.close(); srv.close();
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });

// Registra un archivo descargado en assets3d/MANIFEST.json (fuente, licencia leída, fecha, tamaño, SHA-256).
// Uso: node scripts/assets3d-registrar.js <archivo> --fuente <url> --licencia "<texto>" [--nota "<texto>"] [--md5 <hash>]
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const arg = (n, d = '') => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const archivo = path.resolve(process.argv[2]), RAIZ = path.join(__dirname, '..', 'assets3d'), M = path.join(RAIZ, 'MANIFEST.json');
const buf = fs.readFileSync(archivo), sha = crypto.createHash('sha256').update(buf).digest('hex'), md5 = crypto.createHash('md5').update(buf).digest('hex');
const esperado = arg('--md5'); if (esperado && esperado !== md5) { console.error('MD5 NO COINCIDE', md5, 'esperado', esperado); process.exit(2); }
const man = fs.existsSync(M) ? JSON.parse(fs.readFileSync(M, 'utf8')) : { descripcion: 'Assets 3D descargados con permiso del usuario. Ver catálogo en docs/biblioteca-3d.', archivos: [] };
const rel = path.relative(RAIZ, archivo).split(path.sep).join('/'), e = { archivo: rel, bytes: buf.length, sha256: sha, md5_verificado: Boolean(esperado), fuente: arg('--fuente'), licencia_leida: arg('--licencia'), nota: arg('--nota'), descargado: new Date().toISOString().slice(0, 10) };
man.archivos = man.archivos.filter(x => x.archivo !== rel).concat(e); fs.writeFileSync(M, JSON.stringify(man, null, 1)); console.log('registrado', rel, (buf.length / 1e6).toFixed(1) + ' MB', esperado ? 'MD5 ok' : '');

// Pruebas del aislamiento de datos: las variables HISTORIAL_PATH / JOBS_PATH redirigen la escritura
// y, sin ellas, las rutas son exactamente las de siempre.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = path.resolve(__dirname, '..');
const REAL_HISTORIAL = path.join(RAIZ, 'historial.json');
const REAL_JOBS = path.join(RAIZ, 'data', 'jobs.json');

function sha(p) {
  return fs.existsSync(p) ? crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex') : null;
}

// Ejecuta código en un proceso aparte, SIN las variables de ruta, para ver los valores por defecto.
function enHijoSinVariables(codigo) {
  const env = { ...process.env };
  delete env.HISTORIAL_PATH; delete env.JOBS_PATH;
  return execFileSync(process.execPath, ['-e', codigo], { cwd: RAIZ, env }).toString().trim();
}

test('sin variables, las rutas por defecto son las de siempre', () => {
  const salida = JSON.parse(enHijoSinVariables(
    "const s=require('./seleccion');const j=require('./jobStore');" +
    'console.log(JSON.stringify({h:s.HISTORIAL_FILE,j:j.JOBS_FILE}))'));
  assert.equal(path.resolve(salida.h), REAL_HISTORIAL);
  assert.equal(path.resolve(salida.j), REAL_JOBS);
});

test('aislar() se niega si los módulos ya se cargaron con las rutas reales', () => {
  const salida = enHijoSinVariables(
    "require('./seleccion');" +
    "try{require('./test/helpers/aislar').aislar();console.log('NO-LANZO')}catch(e){console.log('LANZO:'+e.message.slice(0,60))}");
  assert.match(salida, /^LANZO:aislar\(\) debe llamarse ANTES/);
});

test('con aislar(), jobs e historial van a un temporal y los datos reales no se tocan', () => {
  const antes = { h: sha(REAL_HISTORIAL), j: sha(REAL_JOBS) };
  // Todo el trabajo ocurre en un hijo: así esta prueba no contamina la caché de módulos.
  const salida = JSON.parse(execFileSync(process.execPath, ['-e', `
    const { aislar } = require('./test/helpers/aislar');
    const iso = aislar();
    const jobStore = require('./jobStore');
    const seleccion = require('./seleccion');
    const job = jobStore.crearJob({ tema: 'prueba' });
    const fs = require('fs');
    const escribioTemp = fs.existsSync(iso.jobsPath);
    const rutasOk = jobStore.JOBS_FILE === iso.jobsPath && seleccion.HISTORIAL_FILE === iso.historialPath;
    console.log(JSON.stringify({ escribioTemp, rutasOk, id: Boolean(job && (job.id || job.jobId)), drive: iso.llamadasDrive.map(l => l[0] + ':' + l[2]) }));
    iso.limpiar();
  `], { cwd: RAIZ, env: { ...process.env, HISTORIAL_PATH: '', JOBS_PATH: '' } }).toString().trim());

  assert.equal(salida.rutasOk, true);
  assert.equal(salida.escribioTemp, true);
  assert.ok(salida.drive.includes('respaldar:jobs.json'), 'el respaldo a Drive debió ir al cliente falso');
  assert.equal(sha(REAL_HISTORIAL), antes.h, 'historial.json real cambió');
  assert.equal(sha(REAL_JOBS), antes.j, 'data/jobs.json real cambió');
});

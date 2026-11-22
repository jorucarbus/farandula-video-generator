// Aislamiento de datos para pruebas que importan seleccion.js / jobStore.js / driveCache.js.
//
// Por qué existe: una prueba que llame planificarClips(), crearJob() o renderizarVideo() muta la
// rotación real (historial.json) y puede subir ese estado a Drive. Ya pasó (jobs.json con 4 jobs de
// prueba en lugar de los 11 reales; `{}` subido encima de los dos archivos el 2026-09-20).
//
// Uso: llamar aislar() ANTES del primer require de seleccion/jobStore/driveCache.
//   const iso = aislar();
//   const jobStore = require('../jobStore');
//   ... pruebas ...
//   iso.limpiar();
//
// Hace tres cosas:
//  1. Apunta HISTORIAL_PATH y JOBS_PATH a una carpeta temporal fuera del repo.
//  2. Reemplaza driveCache por un cliente falso que solo anota las llamadas (nada sale a Drive).
//  3. Quita las variables que habilitan escribir estado compartido (PC_PRINCIPAL, credenciales).
// Y se niega a continuar si alguno de esos módulos ya estaba cargado (ya habrían leído las rutas
// reales) o si las rutas resultantes no cuelgan del directorio temporal.
const fs = require('fs');
const os = require('os');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..', '..');
const MODULOS = ['seleccion.js', 'jobStore.js', 'driveCache.js', 'drive.js'].map(m => path.join(RAIZ, m));

function aislar() {
  for (const m of MODULOS) {
    if (require.cache[m]) throw new Error(`aislar() debe llamarse ANTES de cargar ${path.basename(m)} (ya está en caché con las rutas reales)`);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'farandula-test-'));
  const historialPath = path.join(dir, 'historial.json');
  const jobsPath = path.join(dir, 'data', 'jobs.json');

  process.env.HISTORIAL_PATH = historialPath;
  process.env.JOBS_PATH = jobsPath;
  for (const v of ['PC_PRINCIPAL', 'RAILWAY_ENVIRONMENT_NAME', 'RAILWAY_SERVICE_NAME', 'GOOGLE_OAUTH_REFRESH_TOKEN',
    'GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET']) delete process.env[v];

  // Guarda de arranque: las rutas deben colgar del directorio temporal.
  const tmp = path.resolve(os.tmpdir()).toLowerCase();
  for (const p of [historialPath, jobsPath]) {
    if (!path.resolve(p).toLowerCase().startsWith(tmp)) throw new Error(`Ruta de prueba fuera del directorio temporal: ${p}`);
  }
  if (path.resolve(historialPath).toLowerCase().startsWith(RAIZ.toLowerCase())) throw new Error('La ruta de prueba cae dentro del repo');

  // Cliente Drive falso: reemplaza el módulo completo antes de que nadie lo cargue.
  const llamadasDrive = [];
  const falso = {
    respaldar: async (...a) => { llamadasDrive.push(['respaldar', ...a]); },
    restaurar: async (...a) => { llamadasDrive.push(['restaurar', ...a]); return false; },
    borrar: async (...a) => { llamadasDrive.push(['borrar', ...a]); },
  };
  const rutaDriveCache = path.join(RAIZ, 'driveCache.js');
  require.cache[rutaDriveCache] = { id: rutaDriveCache, filename: rutaDriveCache, loaded: true, exports: falso, children: [], paths: [] };

  return {
    dir, historialPath, jobsPath, llamadasDrive,
    limpiar() {
      delete require.cache[rutaDriveCache];
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    },
  };
}

module.exports = { aislar };

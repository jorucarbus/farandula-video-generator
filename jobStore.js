// Persistencia simple de jobs en JSON local (versión de prueba, sin MongoDB).
// Permite recuperar el estado de un proceso tras un reload o un fallo,
// sin tener que repetir pasos ya completados (lectura, guion, fragmentos...).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const driveCache = require('./driveCache');

const DATA_DIR = path.join(__dirname, 'data');
const JOBS_FILE = path.join(DATA_DIR, 'jobs.json');
const MAX_JOBS = 100; // evita crecimiento infinito del archivo

function cargar() {
  try {
    return JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function guardar(jobs) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(JOBS_FILE, JSON.stringify(jobs, null, 2));
  // Bloque D: respaldo en Drive (fire-and-forget, Railway borra el disco en cada redeploy)
  driveCache.respaldar(JOBS_FILE, 'jobs.json');
}

function podar(jobs) {
  const entradas = Object.entries(jobs);
  if (entradas.length <= MAX_JOBS) return jobs;
  entradas.sort((a, b) => new Date(b[1].actualizado) - new Date(a[1].actualizado));
  return Object.fromEntries(entradas.slice(0, MAX_JOBS));
}

function crearJob(datosIniciales) {
  const jobs = cargar();
  const jobId = crypto.randomUUID();
  const ahora = new Date().toISOString();
  jobs[jobId] = { jobId, creado: ahora, actualizado: ahora, paso: 'lectura', ...datosIniciales };
  guardar(podar(jobs));
  return jobs[jobId];
}

function actualizarJob(jobId, cambios) {
  const jobs = cargar();
  if (!jobs[jobId]) throw new Error(`Job no encontrado: ${jobId}`);
  jobs[jobId] = { ...jobs[jobId], ...cambios, actualizado: new Date().toISOString() };
  guardar(jobs);
  return jobs[jobId];
}

function obtenerJob(jobId) {
  return cargar()[jobId] || null;
}

function listarJobs(limite = 20) {
  return Object.values(cargar())
    .sort((a, b) => new Date(b.actualizado) - new Date(a.actualizado))
    .slice(0, limite);
}

module.exports = { crearJob, actualizarJob, obtenerJob, listarJobs };

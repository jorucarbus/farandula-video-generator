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

// Estado visible en el historial: terminado (paso completado), en_proceso (tocado hace poco)
// o incompleto (abandonado a medio camino, sin actividad reciente — recuperable igual).
const MINUTOS_ABANDONO = 30;
function calcularEstado(job) {
  if (job.paso === 'completado') return 'terminado';
  const minutos = (Date.now() - new Date(job.actualizado).getTime()) / 60000;
  return minutos > MINUTOS_ABANDONO ? 'incompleto' : 'en_proceso';
}

function conEstado(job) {
  return { ...job, estado: calcularEstado(job) };
}

function obtenerJob(jobId) {
  const job = cargar()[jobId];
  return job ? conEstado(job) : null;
}

// Buscar el job dueño de un audioToken (para recuperar su audio.mp3 desde Drive
// cuando el Map en memoria se vació por un reinicio del server).
function buscarPorAudioToken(token) {
  return Object.values(cargar()).find(j => j.audioToken === token) || null;
}

function listarJobs(limite = 20) {
  return Object.values(cargar())
    .sort((a, b) => new Date(b.actualizado) - new Date(a.actualizado))
    .slice(0, limite)
    .map(conEstado);
}

module.exports = { crearJob, actualizarJob, obtenerJob, listarJobs, buscarPorAudioToken };

// Servicio del compilado horizontal: la lógica de los endpoints, sin Express y con el almacén de jobs
// inyectado (así se prueba sin servidor, sin Drive y sin tocar jobs.json real).
const { fusionarHistorias, generarPuentes, hechosNuevos } = require('./compilado');

const error400 = (mensaje, status = 400) => Object.assign(new Error(mensaje), { status });

function cargarJobs(jobIds, obtenerJob) {
  if (!Array.isArray(jobIds) || jobIds.length < 2 || jobIds.length > 4) throw error400('Elige entre 2 y 4 historias terminadas');
  if (new Set(jobIds).size !== jobIds.length) throw error400('Hay historias repetidas');
  return jobIds.map(id => {
    const job = obtenerJob(id);
    if (!job) throw error400(`No existe el proceso ${id}`, 404);
    if (job.compilado) throw error400(`"${job.titulo}" ya es un compilado: no se puede compilar un compilado`);
    if (!job.script || !Array.isArray(job.fragments) || !job.fragments.length) throw error400(`"${job.titulo || id}" todavía no tiene guion y fragmentos`);
    return job;
  });
}

async function proponerPuentes({ jobIds }, { obtenerJob, llamar }) {
  const jobs = cargarJobs(jobIds, obtenerJob);
  const r = await generarPuentes(jobs.map(j => ({ titulo: j.titulo, texto: j.script })), llamar ? { llamar } : {});
  return { historias: jobs.map(j => ({ jobId: j.jobId, titulo: j.titulo })), puentes: r.puentes, origen: r.origen, avisos: r.avisos };
}

// Crea el proceso del compilado. Los textos de puente pudo editarlos el usuario: no se bloquean (la
// revisión humana manda), pero se le avisa de lo que parece un dato nuevo.
function crearCompilado({ jobIds, puentes }, { obtenerJob, crearJob }) {
  const jobs = cargarJobs(jobIds, obtenerJob);
  const fusion = fusionarHistorias(jobs, puentes);
  const fuentesTexto = jobs.map(j => `${j.titulo}. ${j.script}`);
  const avisos = fusion.compilado.puentes
    .map(p => ({ id: p.id, nuevos: hechosNuevos(p.texto, fuentesTexto) }))
    .filter(x => x.nuevos.length)
    .map(x => `El puente ${x.id} menciona ${x.nuevos.join(', ')}, que no aparece en las historias: confírmalo antes de publicar`);
  const base = jobs[0];
  const job = crearJob({
    paso: 'fragmentacion',
    canalId: base.canalId,
    carpetas: base.carpetas,
    sesgo: 'neutral',
    fuentes: [],
    titulo: fusion.titulo,
    descripcion: `Compilado de ${jobs.length} historias: ${jobs.map(j => j.titulo).join('; ')}`,
    cronica: fusion.script,
    protagonista: base.protagonista,
    tono: base.tono,
    script: fusion.script,
    palabras: fusion.script.split(/\s+/).filter(Boolean).length,
    fragments: fusion.fragments,
    compilado: fusion.compilado,
  });
  return { jobId: job.jobId, titulo: job.titulo, fragmentos: job.fragments.length, avisos };
}

module.exports = { cargarJobs, proponerPuentes, crearCompilado };

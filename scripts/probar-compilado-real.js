// Prueba real de un compilado: locución ElevenLabs + render 16:9 en el clon (salida local data-motor/renders).
// Uso: node scripts/probar-compilado-real.js   (servidor del clon en el puerto 3001)
require('dotenv').config();
const fs = require('fs');
const BASE = 'http://localhost:3001';
const H = { 'Content-Type': 'application/json', 'x-api-key': process.env.API_KEY };
const post = async (ruta, body) => {
  const r = await fetch(BASE + ruta, { method: 'POST', headers: H, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(`${ruta}: ${j.error || r.status}`);
  return j;
};
(async () => {
  const raw = JSON.parse(fs.readFileSync('data-motor/jobs.json', 'utf8'));
  const lista = Array.isArray(raw) ? raw : Object.values(raw.jobs || raw);
  const job = lista.find(x => x.compilado);
  console.log('Job:', job.jobId, job.fragments.length, 'fragmentos');
  const audio = await post('/api/generar-audio', { fragments: job.fragments, jobId: job.jobId });
  console.log('Audio:', audio.duracion, 's', audio.modelo, audio.audioToken);
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const enc = await post('/api/generate-video', {
    fragments: job.fragments, audioToken: audio.audioToken, destFolder: folderId, jobId: job.jobId,
    guion: job.script, metadatos: { titulo: job.titulo, nombreCorto: 'Compilado prueba', protagonista: job.protagonista },
    efectos: { aspect: '16:9', planPorRecetas: false }, etiqueta: 'Compilado prueba', canal: 'prueba',
  });
  console.log('Encolado:', enc.renderId);
  for (;;) {
    await new Promise(r => setTimeout(r, 5000));
    const e = await (await fetch(`${BASE}/api/render/${enc.renderId}`, { headers: H })).json();
    console.log(e.estado, e.progreso, e.mensaje || '');
    if (['listo', 'completado', 'error', 'fallido'].includes(e.estado)) { console.log(JSON.stringify(e.resultado || e.error || e, null, 1).slice(0, 1500)); break; }
  }
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });

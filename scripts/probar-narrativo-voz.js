// Prueba real del guion narrativo CON VOZ: hechos → guion → partitura visual → job → ElevenLabs → render 9:16
// con las piezas del estilo capitol sincronizadas a cada frase. Salida local (data-motor/renders).
// Uso: node scripts/probar-narrativo-voz.js [--regenerar]   (servidor del clon corriendo, ver PORT en .env)
// Los clips de relleno son de la biblioteca (Shakira/pique/Karol_G): prueban mecánica y tiempos, no la historia.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const BASE = `http://localhost:${process.env.PORT || 3001}`;
const H = { 'Content-Type': 'application/json', 'x-api-key': process.env.API_KEY };
const post = async (ruta, body) => {
  const r = await fetch(BASE + ruta, { method: 'POST', headers: H, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(`${ruta}: ${j.error || r.status}`);
  return j;
};
const CACHE = path.join(__dirname, '..', 'data-motor', 'guion-reina.json');
const TEMA = 'Chone retiene la corona de Reina de Manabí';
const HECHOS = [
  'El Coliseo La California de Portoviejo fue la sede de la elección de la Reina de Manabí 2026-2027.',
  'La noche del viernes 30 de octubre de 2026, Leidy Michelle Alvarez Corral, conocida como la Chonera Bonita, ganó el título.',
  'Compitió contra 12 aspirantes de la provincia.',
  'La corona se la entregó Paula Zambrano, su antecesora, que también representó a Chone.',
  'Marcel Ponce Zamora, de Manta, fue virreina.',
  'Ariana Espinoza, de Bolívar, fue primera finalista; Camille Ramírez, de Portoviejo, segunda; y Diana Andrade, de El Carmen, tercera.',
  'Alvarez acumula seis años de presencia en TikTok e Instagram.',
  'Antes ganó los títulos de Chonera Bonita 2023, Miss Turismo Manabí 2024 y Reina de Chone 2026.',
  'Al terminar, agradeció el respaldo de su cantón y de las autoridades locales que impulsaron su candidatura.',
].map(texto => ({ texto }));

async function guion() {
  if (!process.argv.includes('--regenerar') && fs.existsSync(CACHE)) return JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  const { investigarHechos } = require('../edl/investigarHechos');
  const { seleccionarHechos } = require('../edl/seleccionarHechos');
  const { generarGuion } = require('../edl/guionNarrativo');
  const inv = await investigarHechos(HECHOS, { tema: TEMA, personas: ['Leidy Michelle Alvarez Corral'] });
  const sel = await seleccionarHechos(inv.hechos, { tema: TEMA });
  const g = await generarGuion(sel.hechos, { tema: TEMA, gancho: sel.gancho });
  const out = { hechos: sel.hechos, beats: g.beats, script: g.script, origen: g.origen, palabras: g.palabras };
  fs.writeFileSync(CACHE, JSON.stringify(out, null, 2));
  return out;
}

(async () => {
  const { partituraVisual, recetasPorParrafo } = require('../edl/partituraVisual');
  const { crearJob } = require('../jobStore');
  const g = await guion();
  console.log(`GUION (${g.origen}, ${g.palabras} palabras):`); g.beats.forEach((b, i) => console.log(`  ${i + 1}. ${b.frase}`));
  const pv = await partituraVisual(g.beats, g.hechos);
  console.log(`PARTITURA (${pv.origen}) ${pv.avisos.join(' || ')}`); pv.piezas.forEach(p => console.log(`  frase ${p.beat}: ${p.recipe} ${JSON.stringify(p.params)}`));

  const carpetas = ['Shakira', 'pique', 'Karol_G'];
  const fragments = g.beats.map((b, i) => ({ texto: b.frase, famoso: carpetas[i % carpetas.length], caracteres: b.frase.length, porcentaje: 0 }));
  const total = fragments.reduce((t, f) => t + f.caracteres, 0); fragments.forEach(f => { f.porcentaje = +(f.caracteres / total * 100).toFixed(2); });
  const reusar = process.argv.includes('--reusar') && process.argv[process.argv.indexOf('--reusar') + 1];
  const previo = reusar && require('../jobStore').obtenerJob(reusar);
  const job = previo || crearJob({ paso: 'fragmentacion', canalId: 'canal-prueba', carpetas, sesgo: 'neutral', fuentes: [], titulo: 'De bastonera a Reina de Manabí', descripcion: 'Prueba narrativo con voz', cronica: g.script, protagonista: 'Shakira', script: g.script, palabras: g.palabras, fragments });
  console.log('Job:', job.jobId);
  // --reusar <jobId>: mismo audio ya pagado (audioToken guardado en el job); solo se vuelve a renderizar.
  const audio = previo ? { audioToken: previo.audioToken, duracion: previo.duracion, modelo: previo.modelo } : await post('/api/generar-audio', { fragments, jobId: job.jobId });
  console.log('Audio:', audio.duracion, 's', audio.modelo);
  const enc = await post('/api/generate-video', {
    fragments, audioToken: audio.audioToken, destFolder: process.env.GOOGLE_DRIVE_FOLDER_ID, jobId: job.jobId, guion: g.script,
    metadatos: { titulo: job.titulo, nombreCorto: 'Narrativo con voz', protagonista: 'Shakira' },
    efectos: { aspect: '9:16', planPorRecetas: true, recetasPorParrafo: recetasPorParrafo(pv.piezas) }, etiqueta: 'Narrativo con voz', canal: 'prueba',
  });
  console.log('Encolado:', enc.renderId);
  for (;;) {
    await new Promise(r => setTimeout(r, 5000));
    const e = await (await fetch(`${BASE}/api/render/${enc.renderId}`, { headers: H })).json();
    console.log(e.estado, e.progreso, e.mensaje || '');
    if (['listo', 'completado', 'error', 'fallido'].includes(e.estado)) { console.log(JSON.stringify(e.resultado || e.error || e, null, 1).slice(0, 1200)); break; }
  }
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });

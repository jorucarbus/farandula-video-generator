// Mide la calidad de los clips de una carpeta de la biblioteca y escribe <carpeta>.calidad.json. Gratis (ffmpeg local).
// Uso: node scripts/calidad-clips.js <carpeta> [--rehacer]
const path = require('path');
const C = require('../edl/calidadClip');
const carpeta = process.argv[2], raiz = path.join(__dirname, '..', 'data-motor', 'biblioteca');
if (!carpeta) { console.error('Uso: node scripts/calidad-clips.js <carpeta> [--rehacer]'); process.exit(1); }
(async () => {
  const t0 = Date.now();
  const r = await C.analizarBiblioteca(raiz, carpeta, { rehacer: process.argv.includes('--rehacer'), progreso: (c, q) => console.log(`${q.apto ? 'OK ' : 'NO '} ${String(q.puntaje).padStart(3)}  ${(c.name || c.id).slice(0, 44).padEnd(44)} ${q.ancho}x${q.alto} amp ${q.ampliacion} nit ${q.nitidez}  ${[...q.motivos, ...q.avisos].join('; ')}`) });
  const ids = Object.keys(r), aptos = ids.filter(i => r[i].apto);
  console.log(`\n${aptos.length} de ${ids.length} clips aptos (${Math.round((Date.now() - t0) / 1000)} s) → data-motor/biblioteca/${carpeta}.calidad.json`);
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });

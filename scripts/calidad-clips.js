// Mide la calidad de los clips de una carpeta de la biblioteca y escribe <carpeta>.calidad.json. Gratis (ffmpeg local).
// Uso: node scripts/calidad-clips.js <carpeta> [--rehacer]
const path = require('path');
const C = require('../edl/calidadClip');
const carpeta = process.argv[2], recalcular = process.argv.includes('--recalcular'), raiz = path.join(__dirname, '..', 'data-motor', 'biblioteca');
if (!carpeta) { console.error('Uso: node scripts/calidad-clips.js <carpeta> [--rehacer]'); process.exit(1); }
(async () => {
  if (recalcular) { // recalcula la resolución de lo ya medido, sin necesitar los videos
    const fs = require('fs'), f = path.join(raiz, `${carpeta}.calidad.json`), q = JSON.parse(fs.readFileSync(f, 'utf8')), antes = Object.values(q).filter(x => x.apto).length;
    for (const id of Object.keys(q)) q[id] = C.reevaluarGuardado(q[id]);
    require('../edl/respaldoIndice').escribirSeguro(f, q); const despues = Object.values(q).filter(x => x.apto).length;
    console.log(`${carpeta}: aptos ${antes} → ${despues} de ${Object.keys(q).length} (tarjeta ${C.SALIDA.ancho}x${C.SALIDA.alto})`); return;
  }
  const t0 = Date.now();
  const r = await C.analizarBiblioteca(raiz, carpeta, { rehacer: process.argv.includes('--rehacer'), progreso: (c, q) => console.log(`${q.apto ? 'OK ' : 'NO '} ${String(q.puntaje).padStart(3)}  ${(c.name || c.id).slice(0, 44).padEnd(44)} ${q.ancho}x${q.alto} amp ${q.ampliacion} nit ${q.nitidez}  ${[...q.motivos, ...q.avisos].join('; ')}`) });
  const ids = Object.keys(r), aptos = ids.filter(i => r[i].apto);
  console.log(`\n${aptos.length} de ${ids.length} clips aptos (${Math.round((Date.now() - t0) / 1000)} s) → data-motor/biblioteca/${carpeta}.calidad.json`);
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });

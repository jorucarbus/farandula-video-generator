// Descarga (caché local) y etiqueta con Gemini los clips de una carpeta de la biblioteca. Una sola vez por carpeta.
// Uso: node scripts/biblioteca-etiquetar.js Leidy_Alvarez [--max 50]
require('dotenv').config();
const fs = require('fs'), path = require('path');
const drive = require('../drive');
const { descargarCarpeta, etiquetarClips, RAIZ } = require('../edl/biblioteca');
const nombre = process.argv[2]; if (!nombre) { console.error('falta el nombre de la carpeta'); process.exit(1); }
const max = Number(process.argv[process.argv.indexOf('--max') + 1]) || Infinity;
(async () => {
  const t0 = Date.now();
  const clips = await descargarCarpeta(drive, nombre, { max, progreso: (i, n) => process.stdout.write(`\rdescargando ${i}/${n}  `) });
  console.log(`\n${clips.length} clips en ${RAIZ}/${nombre} (${Math.round((Date.now() - t0) / 1000)} s)`);
  { const f = path.join(RAIZ, `${nombre}.clips.json`), previos = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : [], ids = new Set(clips.map(c => c.id)); // con --max no se pierde el resto del índice
    require('../edl/respaldoIndice').escribirSeguro(f, [...clips, ...previos.filter(c => !ids.has(c.id))]); }
  const r = await etiquetarClips(clips, { cache: path.join(RAIZ, `${nombre}.etiquetas.json`), progreso: (i, n) => process.stdout.write(`\retiquetando ${i}/${n}  `) });
  console.log(`\n${Object.keys(r.etiquetas).length} etiquetados, ${r.fallos.length} fallos ${r.fallos.map(f => f.name + ': ' + f.error).join(' | ')}`);
})().catch(e => { console.error('FALLO', e); process.exit(1); });

// Etiqueta con Gemini los clips de una carpeta de la biblioteca que YA están en disco (p. ej. importados desde el Selector).
// No descarga nada y no repite los ya etiquetados. Mide la duración de los clips que no la traen.
// Uso: node scripts/biblioteca-etiquetar-local.js <carpeta>
require('dotenv').config({ quiet: true });
const fs = require('fs'), path = require('path');
const { etiquetarClips, RAIZ } = require('../edl/biblioteca');
const nombre = process.argv[2]; if (!nombre) { console.error('falta el nombre de la carpeta'); process.exit(1); }
(async () => {
  const fClips = path.join(RAIZ, `${nombre}.clips.json`);
  const todos = JSON.parse(fs.readFileSync(fClips, 'utf8')), clips = todos.filter(c => c.ruta && fs.existsSync(c.ruta)); // solo se etiquetan los que están en disco; el índice completo se conserva
  const video = require('../video');
  for (const c of clips) if (!c.duracion) { try { c.duracion = await video.obtenerDuracion(c.ruta); } catch {} }
  require('../edl/respaldoIndice').escribirSeguro(fClips, todos); // los objetos de `clips` son los mismos de `todos` (duración al día)
  const r = await etiquetarClips(clips, { cache: path.join(RAIZ, `${nombre}.etiquetas.json`), progreso: (i, n) => process.stdout.write(`etiquetando ${i}/${n}\n`) });
  try { const rb = await require('../edl/respaldoIndice').respaldarCarpeta(nombre); console.log(`índice respaldado en Drive (${rb.subidos} archivos)`); } catch (e) { console.log('(no pude respaldar en Drive:', String(e.message).slice(0, 80) + ')'); }
  console.log(`${Object.keys(r.etiquetas).length} etiquetados, ${r.fallos.length} fallos ${r.fallos.map(f => f.name + ': ' + f.error).join(' | ')}`);
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });

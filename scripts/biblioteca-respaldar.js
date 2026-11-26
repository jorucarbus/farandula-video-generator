// Respalda en Drive (cache-estado) el índice de la biblioteca: etiquetas, calidad, rostros y lista de clips. Fusiona con lo que ya haya allí.
// Uso: node scripts/biblioteca-respaldar.js <carpeta>      una carpeta
//      node scripts/biblioteca-respaldar.js --todas         todas las carpetas
//      node scripts/biblioteca-respaldar.js --restaurar     trae de Drive lo que falte en este equipo
require('dotenv').config({ quiet: true });
const R = require('../edl/respaldoIndice');
const a = process.argv[2];
(async () => {
  const log = m => console.log('  ' + m);
  if (a === '--restaurar') { const t = await R.restaurarFaltantes({ log }); console.log(`${t.length} archivo(s) restaurados de Drive`); }
  else if (a === '--todas') { const r = await R.respaldarTodas({ log }); console.log(`${r.carpetas} carpetas: ${r.subidos} archivos subidos, ${r.traidos} entradas traídas de Drive`); }
  else if (a) { const r = await R.respaldarCarpeta(a, { log }); console.log(`${a}: ${r.subidos} archivos subidos, ${r.traidos} entradas traídas de Drive`); }
  else { console.error('Uso: biblioteca-respaldar.js <carpeta> | --todas | --restaurar'); process.exit(1); }
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });

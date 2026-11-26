// Libera espacio: borra del disco los videos de Drive de una carpeta (el índice con etiquetas, calidad, rostros y miniaturas se queda).
// Uso: node scripts/biblioteca-purgar.js <carpeta> [--si-no-recurrente]
const C = require('../edl/clipsDrive');
const carpeta = process.argv[2]; if (!carpeta) { console.error('falta la carpeta'); process.exit(1); }
if (process.argv.includes('--si-no-recurrente') && C.recurrentes().includes(carpeta)) { console.log(`${carpeta} es recurrente: se conservan sus videos en disco`); process.exit(0); }
const r = C.purgar(carpeta); console.log(`${r.borrados} videos borrados del disco (${(r.bytes / 1e6).toFixed(0)} MB); el índice sigue intacto`);

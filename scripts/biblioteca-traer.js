// Trae a disco los videos de una carpeta de Drive (la misma lista de "famosos" que usa la app de farándula) SIN etiquetar:
// deja data-motor/biblioteca/<carpeta>/ y suma los clips a <carpeta>.clips.json (no repite los ya traídos).
// Uso: node scripts/biblioteca-traer.js <carpeta> [--max N]
require('dotenv').config({ quiet: true });
const fs = require('fs'), path = require('path');
const drive = require('../drive');
const { descargarCarpeta, RAIZ } = require('../edl/biblioteca');
const nombre = process.argv[2]; if (!nombre || !/^[\p{L}\p{N}_ .-]+$/u.test(nombre)) { console.error('falta el nombre de la carpeta (o es inválido)'); process.exit(1); }
const max = Number(process.argv[process.argv.indexOf('--max') + 1]) || Infinity;
(async () => {
  const t0 = Date.now(), nuevos = await descargarCarpeta(drive, nombre, { max, progreso: (i, n) => console.log(`descargando ${i}/${n}`) });
  const f = path.join(RAIZ, `${nombre}.clips.json`), previos = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : [], ids = new Set(previos.map(c => c.id));
  const todos = [...previos, ...nuevos.filter(c => !ids.has(c.id))];
  fs.writeFileSync(f, JSON.stringify(todos, null, 1));
  console.log(`${todos.length} clips en ${nombre} (${nuevos.length - (todos.length - previos.length)} ya estaban) · ${Math.round((Date.now() - t0) / 1000)} s`);
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });

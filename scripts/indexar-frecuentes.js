// Etiqueta (una vez) los clips de los artistas que más se publican, según data-motor/analisis/publicados.json (ver analisis-publicados.js).
// Por cada artista con carpeta en Drive: baja SOLO los clips sin etiqueta (temporal), los etiqueta, mide calidad/rostros, guarda miniaturas, respalda el
// índice en Drive y borra los videos del disco (salvo carpetas recurrentes). Es reanudable: lo ya etiquetado no se repite ni gasta IA.
// Uso: node scripts/indexar-frecuentes.js [--minimo 3] [--max-artistas 60] [--max-por-carpeta 150]
require('dotenv').config({ quiet: true });
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? Number(process.argv[i + 1]) : d; };
const minimo = arg('--minimo', 3), maxArt = arg('--max-artistas', 60), maxCarpeta = arg('--max-por-carpeta', 150);
const RAIZ = path.join(__dirname, '..'), A = path.join(RAIZ, 'data-motor', 'analisis'), PROG = path.join(A, 'indexado-progreso.json');
const datos = JSON.parse(fs.readFileSync(path.join(A, 'publicados.json'), 'utf8'));
const lista = []; const vistas = new Set();
for (const a of datos.artistas) { if (!a.carpeta || a.total < minimo || vistas.has(a.carpeta)) continue; vistas.add(a.carpeta); lista.push(a); }
const objetivo = lista.slice(0, maxArt);
const prog = fs.existsSync(PROG) ? JSON.parse(fs.readFileSync(PROG, 'utf8')) : { carpetas: {} };
const guardar = () => { prog.actualizado = new Date().toISOString(); fs.writeFileSync(PROG, JSON.stringify(prog, null, 1)); };
const etiquetados = c => { try { return Object.keys(JSON.parse(fs.readFileSync(path.join(RAIZ, 'data-motor', 'biblioteca', `${c}.etiquetas.json`), 'utf8'))).length; } catch { return 0; } };
console.log(`Indexando ${objetivo.length} artistas frecuentes (≥ ${minimo} videos publicados), hasta ${maxCarpeta} clips por carpeta.`);
for (const [i, a] of objetivo.entries()) {
  const antes = etiquetados(a.carpeta), t0 = Date.now();
  console.log(`\n[${i + 1}/${objetivo.length}] ${a.carpeta} (${a.total} videos publicados) — ya etiquetados: ${antes}`);
  const r = spawnSync(process.execPath, [path.join(__dirname, 'biblioteca-indexar-nuevos.js'), a.carpeta, '--max', String(maxCarpeta)], { stdio: 'inherit', cwd: RAIZ });
  spawnSync(process.execPath, [path.join(__dirname, 'biblioteca-purgar.js'), a.carpeta, '--si-no-recurrente'], { stdio: 'inherit', cwd: RAIZ }); // libera el disco de esta carpeta
  const despues = etiquetados(a.carpeta);
  prog.carpetas[a.carpeta] = { artista: a.nombre, publicados: a.total, etiquetadosAntes: antes, etiquetadosAhora: despues, segundos: Math.round((Date.now() - t0) / 1000), ok: r.status === 0 }; guardar();
}
const nuevos = Object.values(prog.carpetas).reduce((s, c) => s + (c.etiquetadosAhora - c.etiquetadosAntes), 0);
console.log(`\nLISTO: ${objetivo.length} artistas revisados, ${nuevos} clips etiquetados nuevos en esta corrida.`);
prog.terminado = new Date().toISOString(); guardar();

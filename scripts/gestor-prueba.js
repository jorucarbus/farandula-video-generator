// Arranca el gestor sobre COPIAS (sin tocar la biblioteca real): 4 clips de la primera carpeta + 3 "descargas del Selector" de mentira.
// Uso: node scripts/gestor-prueba.js   → http://127.0.0.1:3101
const fs = require('fs'), os = require('os'), path = require('path');
const real = path.join(__dirname, '..', 'data-motor', 'biblioteca'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gestor-prueba-'));
const dm = path.join(tmp, 'data-motor'), bib = path.join(dm, 'biblioteca'), sel = path.join(tmp, 'selector-videos');
const carpeta = fs.readdirSync(real).find(f => f.endsWith('.clips.json')).replace('.clips.json', '');
fs.mkdirSync(path.join(bib, carpeta), { recursive: true });
const clips = JSON.parse(fs.readFileSync(path.join(real, carpeta + '.clips.json'), 'utf8')).filter(c => fs.existsSync(c.ruta)).slice(0, 4);
const copia = clips.map(c => { const d = path.join(bib, carpeta, path.basename(c.ruta)); fs.copyFileSync(c.ruta, d); return { ...c, ruta: d }; });
fs.writeFileSync(path.join(bib, carpeta + '.clips.json'), JSON.stringify(copia));
for (const ext of ['etiquetas', 'calidad', 'rostros']) { const f = path.join(real, `${carpeta}.${ext}.json`); if (fs.existsSync(f)) { const j = JSON.parse(fs.readFileSync(f, 'utf8')); fs.writeFileSync(path.join(bib, `${carpeta}.${ext}.json`), JSON.stringify(Object.fromEntries(copia.map(c => [c.id, j[c.id]]).filter(([, v]) => v)))); } }
const des = path.join(sel, 'Descargas', '@usuario_prueba'); fs.mkdirSync(des, { recursive: true });
clips.slice(0, 3).forEach((c, i) => fs.copyFileSync(c.ruta, path.join(des, `2026031${i}_${7000 + i}_video_de_prueba_${i}.mp4`)));
process.env.RESPALDO_DRIVE = '0'; // la prueba nunca toca el respaldo real en Drive
process.env.DATA_MOTOR_DIR = dm; process.env.SELECTOR_DIR = sel; process.env.GESTOR_PUERTO = process.env.PORT || '3101';
console.log('Datos de prueba en', tmp);
require('../gestor/servidor').iniciar();

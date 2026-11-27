// Sube a Drive (carpeta de famosos) los videos que bajó el Selector. Lo corre la cola del gestor.
// Uso: node scripts/subir-selector-a-drive.js <carpeta> <lista.json> [--borrar]     lista.json = { rutas: [...] } (solo rutas dentro de las descargas del Selector)
require('dotenv').config({ quiet: true });
const fs = require('fs'), path = require('path');
const G = require('../gestor/biblioteca'), { subirAFamosos } = require('../edl/subirFamosos');
const F_REG = path.join(G.DM, 'subidos-selector.json');
const registro = { leer: () => { try { return JSON.parse(fs.readFileSync(F_REG, 'utf8')); } catch { return {}; } }, anotar(ruta, d) { const r = this.leer(); r[ruta] = d; require('../edl/respaldoIndice').escribirSeguro(F_REG, r); } };
(async () => {
  const [carpeta, lista] = process.argv.slice(2).filter(a => !a.startsWith('--')); if (!carpeta || !lista) throw new Error('uso: subir-selector-a-drive.js <carpeta> <lista.json> [--borrar]');
  const rutas = (JSON.parse(fs.readFileSync(lista, 'utf8')).rutas || []).filter(r => G.rutaPermitida(r, [path.join(G.SELECTOR_DIR, 'Descargas')]));
  if (!rutas.length) throw new Error('ninguna ruta válida (deben estar en las descargas del Selector)');
  const drive = require('../drive'); if (!drive.hayOAuth()) console.log('Aviso: sin OAuth del usuario; se intenta con la cuenta de servicio (puede no tener permiso de escritura)');
  const r = await subirAFamosos({ carpeta, rutas, drive, registro, borrarLocal: process.argv.includes('--borrar'), log: m => console.log(m) });
  console.log(`\nLISTO: ${r.nueva ? 'carpeta NUEVA ' : 'carpeta existente '}${r.carpeta} · ${r.subidos.length} subidos, ${r.saltados.length} ya estaban, ${r.fallos.length} fallaron`);
  try { fs.unlinkSync(lista); } catch { /* temporal */ }
  if (r.fallos.length && !r.subidos.length) process.exit(1);
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });

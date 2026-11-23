// Recorta todas las piezas crudas del kit (fondo liso → PNG con alfa). Uso: node scripts/recortar-kit.js [carpetaCrudo] [carpetaSalida]
const fs = require('fs'), path = require('path');
const { quitarFondo } = require('../lienzo/recorte');
const ent = process.argv[2] || 'data-motor/kit/crudo', sal = process.argv[3] || 'data-motor/kit/png';
fs.mkdirSync(sal, { recursive: true });
(async () => {
  for (const f of fs.readdirSync(ent).filter(x => x.endsWith('.png'))) {
    try { const c = await quitarFondo(path.join(ent, f)); fs.writeFileSync(path.join(sal, f), c.toBuffer('image/png')); console.log(f, `${c.width}x${c.height}`); }
    catch (e) { console.log(f, 'FALLO', e.message); }
  }
})();

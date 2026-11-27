// Cierra un "volver a renderizar": el video nuevo se hizo aparte (<nombre>.rerender.mp4); aquí reemplaza al anterior SOLO si existe y tiene contenido.
// Mueve también su portada. El anterior se guarda como <nombre>.anterior.mp4 hasta el siguiente reemplazo. Uso: node scripts/reemplazar-render.js <nombre>
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..', 'data-motor', 'renders');
function reemplazar(n, dir = R) {
  const nuevo = path.join(dir, `${n}.rerender.mp4`), actual = path.join(dir, `${n}.mp4`);
  if (!fs.existsSync(nuevo) || fs.statSync(nuevo).size < 50000) throw new Error('el video nuevo no se generó (o salió vacío); el anterior queda intacto');
  if (fs.existsSync(actual)) fs.renameSync(actual, path.join(dir, `${n}.anterior.mp4`));
  fs.renameSync(nuevo, actual);
  for (const ext of ['portada.jpg', 'portada.png']) { const o = path.join(dir, `${n}.rerender.${ext}`); if (fs.existsSync(o)) fs.renameSync(o, path.join(dir, `${n}.${ext}`)); }
  return actual;
}
module.exports = { reemplazar };
if (require.main === module) { try { console.log('Reemplazado:', reemplazar(process.argv[2])); } catch (e) { console.error('FALLO', e.message); process.exit(1); } }

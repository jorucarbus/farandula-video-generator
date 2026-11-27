// Memoria de alias de personas. Uso:
//   node scripts/alias.js listar
//   node scripts/alias.js agregar "El Cuy" Kike_Jav_Cuy      (manual: queda para siempre)
//   node scripts/alias.js quitar "El Cuy"
const A = require('../edl/aliasPersonas'), { norm } = require('../edl/clipsDeOtros');
const [, , cmd, a, b] = process.argv, reg = A.cargar();
if (cmd === 'agregar' && a && b) { A.registrar(reg, a, b, 'manual'); A.guardar(reg); console.log(`ok: "${a}" → ${b}`); }
else if (cmd === 'quitar' && a) { delete reg.alias[norm(a)]; delete reg.sinCarpeta[norm(a)]; A.guardar(reg); console.log('quitado', a); }
else {
  console.log(`Alias (${Object.keys(reg.alias).length}):`);
  for (const [k, v] of Object.entries(reg.alias)) console.log(`  ${k} → ${v.carpeta} [${v.fuente}]`);
  console.log(`Sin carpeta (${Object.keys(reg.sinCarpeta).length}):`, Object.keys(reg.sinCarpeta).join(', ') || '-');
}

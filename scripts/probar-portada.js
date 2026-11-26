// Prueba de la portada 9:16. Uso: node scripts/probar-portada.js <carpeta> "<canal>" "<título>" ["<resalte>"] [--sin-modelo] [--circulos]
//   Ej.: node scripts/probar-portada.js Gisselle_Rosales "Embajadores del Chisme" "Giselle Rosales destaca en Japón sin corona"
// Deja data-motor/qa/portada/<carpeta>.png
require('dotenv').config({ quiet: true });
const fs = require('fs'), path = require('path');
const estilo = require('../estilos/capitol'), { dibujarPortada } = require('../lienzo/portada'), Foto = require('../edl/portadaFoto'), Tit = require('../edl/portadaTitular');
const [carpeta, canal, titulo, resalteArg] = process.argv.slice(2).filter(a => !a.startsWith('--'));
(async () => {
  if (!carpeta || !titulo) { console.error('Uso: probar-portada.js <carpeta> "<canal>" "<título>" ["<resalte>"]'); process.exit(1); }
  const f = await Foto.elegirFoto(carpeta, { semilla: titulo }); if (!f) throw new Error('sin foto utilizable en el índice de ' + carpeta);
  console.log('foto:', f.clipId, `${f.ancho}x${f.alto}`, 'puntaje', f.puntaje);
  const t = process.argv.includes('--sin-modelo') ? Tit.porReglas({ titulo }) : await Tit.generar({ titulo, descripcion: '' });
  const r = resalteArg ? { ...t, resalte: resalteArg } : t; console.log('titular:', r.titular, '| resalte:', r.resalte, '|', r.etiqueta, '(' + r.origen + ')');
  const circ = []; if (process.argv.includes('--circulos')) { const d = path.join(__dirname, '..', 'data-motor', 'personas'); for (const x of fs.readdirSync(d).filter(n => /_circulo\.jpg$/.test(n)).slice(0, 3)) circ.push({ foto: path.join(d, x), nombre: x.replace(/_circulo\.jpg$/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }); }
  const png = await dibujarPortada({ foto: f.buffer, foco: f.foco, titular: r.titular, resalte: r.resalte, etiqueta: r.etiqueta, canal, circulos: circ, estilo });
  const out = path.join(__dirname, '..', 'data-motor', 'qa', 'portada'); fs.mkdirSync(out, { recursive: true }); const f2 = path.join(out, `${carpeta}.png`); fs.writeFileSync(f2, png); console.log('listo', f2);
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });

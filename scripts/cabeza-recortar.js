// Recorta una cabeza (con pelo y cuello) de una imagen generada sobre fondo verde liso.
// Uso: node scripts/cabeza-recortar.js <entrada.png> <salida.png> [--corte 0.62]
//   --corte: fracción del alto del recorte (ya sin fondo) donde se corta hacia abajo, justo bajo el cuello (la ropa y los hombros se quitan).
// Deja un degradado de 6 % en el corte para que el cuello se funda con el cuerpo.
const { createCanvas } = require('@napi-rs/canvas');
const fs = require('fs');
const { quitarFondo } = require('../lienzo/recorte');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
(async () => {
  const [entrada, salida] = process.argv.slice(2);
  const corte = Number(arg('--corte', 0.62));
  const full = await quitarFondo(entrada, { tol: 40, suave: 30, margen: 2, matiz: 28, sat: 0.18, limpiarGlobal: false });
  const alto = Math.round(full.height * corte), c = createCanvas(full.width, alto), x = c.getContext('2d');
  x.drawImage(full, 0, 0, full.width, alto, 0, 0, full.width, alto);
  const f = Math.round(alto * Number(arg("--fundido", 0.06))), id = x.getImageData(0, alto - f, full.width, f), d = id.data; // degradado de salida
  for (let j = 0; j < f; j++) for (let i = 0; i < full.width; i++) d[(j * full.width + i) * 4 + 3] *= 1 - (j + 1) / f;
  x.putImageData(id, 0, alto - f);
  fs.writeFileSync(salida, c.toBuffer('image/png'));
  console.log('ok', c.width + 'x' + c.height, '→', salida, '| completo', full.width + 'x' + full.height);
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });

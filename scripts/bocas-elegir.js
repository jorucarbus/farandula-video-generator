// Elige (según `elegidas` en scripts/personas-foto.js) una imagen por visema, la alinea con la cara base y guarda solo la zona de la boca en la carpeta de bocas de la persona.
// Uso: node scripts/bocas-elegir.js [--persona leidy]   (lee data-motor/kit/.../bocas-crudo, escribe assets/kit/.../bocas)
const fs = require('fs'), path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { PERSONAS } = require('./personas-foto');
const i = process.argv.indexOf('--persona'), nombre = i >= 0 ? process.argv[i + 1] : 'generica', P = PERSONAS[nombre];
if (!P) { console.error('Persona desconocida: ' + nombre); process.exit(1); }
async function elegir(geo, elegidas, crudo, destino) {
  const { BX, BY, BW, BH, alinear } = geo; fs.mkdirSync(destino, { recursive: true });
  const base = await loadImage(fs.readFileSync(P.cabeza)), W = base.width, H = base.height, bc = createCanvas(W, H), bx = bc.getContext('2d'); bx.drawImage(base, 0, 0); const bd = bx.getImageData(0, 0, W, H).data;
  const lum = (d, k) => d[k] * 0.3 + d[k + 1] * 0.59 + d[k + 2] * 0.11, [ax0, ay0, ax1, ay1] = alinear;
  for (const [v, f] of Object.entries(elegidas)) {
    const img = await loadImage(fs.readFileSync(path.join(crudo, f + '.png'))), c = createCanvas(W, H), x = c.getContext('2d'); x.drawImage(img, 0, 0, W, H); const d = x.getImageData(0, 0, W, H).data;
    // desplazamiento que mejor alinea la zona de los ojos y la nariz (sin tocar la boca) con la cara base
    let mejor = 1e18, bdx = 0, bdy = 0;
    for (let dy = -14; dy <= 14; dy += 2) for (let dx = -14; dx <= 14; dx += 2) { let s = 0, n = 0; for (let y = ay0; y < ay1; y += 3) for (let xx = ax0; xx < ax1; xx += 3) { const a = (y * W + xx) * 4, b = ((y + dy) * W + xx + dx) * 4; s += Math.abs(lum(bd, a) - lum(d, b)); n++; } s /= n; if (s < mejor) { mejor = s; bdx = dx; bdy = dy; } }
    const o = createCanvas(BW, BH), ox = o.getContext('2d'); ox.drawImage(c, BX + bdx, BY + bdy, BW, BH, 0, 0, BW, BH);
    fs.writeFileSync(path.join(destino, v + '.png'), o.toBuffer('image/png')); console.log(nombre, v, 'desplaz', bdx, bdy, 'sad', mejor.toFixed(1));
  }
}
(async () => {
  await elegir(P.geo.boca, P.elegidas, P.crudoBocas, P.bocas);
  if (P.emocionesElegidas && P.geo.emo) await elegir(P.geo.emo, P.emocionesElegidas, P.crudoEmociones, P.emociones);
})();

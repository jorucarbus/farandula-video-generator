// Elige (a ojo) una imagen por visema, la alinea con la cara base y guarda solo la zona de la boca en assets/kit/bocas/<visema>.png (caja BX,BY,BW,BH de la foto).
const fs = require('fs'), path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const ELEG = { Aa: 'Aa-1', Ee: 'Ee-1', Oh: 'Oh-1', Woo: 'Woo-1', M: 'M-1', F: 'F-1', D: 'D-1', S: 'S-1', Uh: 'Uh-1', R: 'R-1' };
const BX = 210, BY = 470, BW = 450, BH = 360;
(async () => {
  const base = await loadImage(fs.readFileSync('assets/kit/cabeza-relleno-mujer.png')), W = base.width, H = base.height, bc = createCanvas(W, H), bx = bc.getContext('2d'); bx.drawImage(base, 0, 0); const bd = bx.getImageData(0, 0, W, H).data;
  const lum = (d, i) => d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
  for (const [v, f] of Object.entries(ELEG)) {
    const img = await loadImage(fs.readFileSync(path.join('data-motor', 'kit', 'bocas-crudo', f + '.png'))), c = createCanvas(W, H), x = c.getContext('2d'); x.drawImage(img, 0, 0, W, H); const d = x.getImageData(0, 0, W, H).data;
    // desplazamiento que mejor alinea la zona de la nariz/ojos (sin tocar la boca)
    let mejor = 1e18, bdx = 0, bdy = 0;
    for (let dy = -14; dy <= 14; dy += 2) for (let dx = -14; dx <= 14; dx += 2) { let s = 0, n = 0; for (let y = 300; y < 470; y += 3) for (let xx = 250; xx < 620; xx += 3) { const i = (y * W + xx) * 4, j = ((y + dy) * W + xx + dx) * 4; s += Math.abs(lum(bd, i) - lum(d, j)); n++; } s /= n; if (s < mejor) { mejor = s; bdx = dx; bdy = dy; } }
    const o = createCanvas(BW, BH), ox = o.getContext('2d'); ox.drawImage(c, BX + bdx, BY + bdy, BW, BH, 0, 0, BW, BH);
    fs.writeFileSync(path.join('assets', 'kit', 'bocas', v + '.png'), o.toBuffer('image/png')); console.log(v, 'desplaz', bdx, bdy, 'sad', mejor.toFixed(1));
  }
})();

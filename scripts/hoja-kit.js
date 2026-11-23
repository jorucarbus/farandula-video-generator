// Hoja de contacto del kit recortado sobre fondo crema. Uso: node scripts/hoja-kit.js [carpeta] [salida.png]
const fs = require('fs'), path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const dir = process.argv[2] || 'data-motor/kit/png', salida = process.argv[3] || 'data-motor/kit/hoja-recortes.png';
(async () => {
  const fs_ = fs.readdirSync(dir).filter(f => f.endsWith('.png')), CW = 240, CH = 400, cols = 7, filas = Math.ceil(fs_.length / cols);
  const c = createCanvas(CW * cols, CH * filas), x = c.getContext('2d'); x.fillStyle = '#F3F1ED'; x.fillRect(0, 0, c.width, c.height);
  for (const [i, f] of fs_.entries()) {
    const img = await loadImage(fs.readFileSync(path.join(dir, f))), e = Math.min((CW - 20) / img.width, (CH - 40) / img.height), w = img.width * e, h = img.height * e;
    const ox = (i % cols) * CW, oy = Math.floor(i / cols) * CH;
    x.shadowColor = 'rgba(0,0,0,0.25)'; x.shadowBlur = 10; x.shadowOffsetY = 4; x.drawImage(img, ox + (CW - w) / 2, oy + (CH - 30 - h) / 2, w, h); x.shadowColor = 'transparent';
    x.fillStyle = '#555'; x.font = '14px sans-serif'; x.textAlign = 'center'; x.fillText(f.replace('.png', ''), ox + CW / 2, oy + CH - 10);
  }
  fs.writeFileSync(salida, c.toBuffer('image/png')); console.log('ok', fs_.length);
})();

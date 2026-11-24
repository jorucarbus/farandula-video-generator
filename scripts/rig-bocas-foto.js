// Prueba de las bocas fotográficas del rig: reposo y los 10 visemas, recortando la cabeza. Uso: node scripts/rig-bocas-foto.js
const fs = require('fs'), path = require('path');
const { createCanvas } = require('@napi-rs/canvas');
const estilo = require('../estilos/capitol'), B = require('../lienzo/base');
const { titereRig } = require('../lienzo/titere-rig');
const V = ['N', 'Aa', 'Ee', 'Oh', 'Woo', 'M', 'F', 'D', 'S', 'Uh', 'R'];
(async () => {
  const W = 330, Hh = 400, cols = 6, filas = Math.ceil(V.length / cols), out = createCanvas(W * cols, Hh * filas), ox = out.getContext('2d'); ox.fillStyle = '#eee'; ox.fillRect(0, 0, out.width, out.height);
  for (let k = 0; k < V.length; k++) {
    const voz = { fps: 30, abertura: new Array(300).fill(0.5), visemas: new Array(300).fill(V[k]) };
    const el = titereRig({ traje: 'bastonera-foto', cx: 0.5, base: 0.96, alto: 0.9, t0: 0, t1: 10, voz });
    await el.preparar({ w: 1080, h: 1920 }); const c = createCanvas(1080, 1920), x = c.getContext('2d');
    for (let f = 0; f <= 40; f++) { x.clearRect(0, 0, 1080, 1920); B.fondo(x, 1080, 1920, estilo); await el.dibujar(x, { t: f / 30, tAbs: f / 30, w: 1080, h: 1920, u: 1080, estilo }); }
    ox.drawImage(c, 330, 120, 420, 510, (k % cols) * W, Math.floor(k / cols) * Hh, W, Hh * 1.0); ox.fillStyle = '#000'; ox.font = '20px sans-serif'; ox.fillText(V[k], (k % cols) * W + 8, Math.floor(k / cols) * Hh + 24);
  }
  const sal = path.join(__dirname, '..', 'data-motor', 'lamina', 'estilos', 'rig-bocas-foto.png'); fs.writeFileSync(sal, out.toBuffer('image/png')); console.log('listo', sal);
})().catch(e => { console.error('FALLO', e); process.exit(1); });

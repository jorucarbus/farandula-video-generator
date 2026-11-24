// Prueba de las emociones fotográficas del rig: reposo y las 9 emociones, con borde blanco. Uso: node scripts/rig-emociones-foto.js leidy
const fs = require('fs'), path = require('path');
const { createCanvas } = require('@napi-rs/canvas');
const estilo = require('../estilos/capitol'), B = require('../lienzo/base');
const { titereRig } = require('../lienzo/titere-rig');
const persona = process.argv[2] || 'leidy', traje = 'bastonera-foto@' + persona, E = ['normal', 'feliz', 'sorpresa', 'triste', 'enojo', 'duda', 'orgullo', 'asco', 'preocupacion', 'amor'];
(async () => {
  const W = 260, Hh = 360, cols = 5, out = createCanvas(W * cols, Hh * 2), ox = out.getContext('2d'); ox.fillStyle = '#eee'; ox.fillRect(0, 0, out.width, out.height);
  for (let k = 0; k < E.length; k++) {
    const el = titereRig({ traje, cx: 0.5, base: 0.96, alto: 0.9, t0: 0, t1: 10, emociones: [{ t: 0.9, e: E[k] }] });
    await el.preparar({ w: 1080, h: 1920 }); const c = createCanvas(1080, 1920), x = c.getContext('2d');
    for (let f = 0; f <= 60; f++) { x.clearRect(0, 0, 1080, 1920); B.fondo(x, 1080, 1920, estilo); await el.dibujar(x, { t: f / 30, tAbs: f / 30, w: 1080, h: 1920, u: 1080, estilo }); }
    ox.drawImage(c, 330, 140, 420, 580, (k % cols) * W, Math.floor(k / cols) * Hh, W, Hh); ox.fillStyle = '#000'; ox.font = '20px sans-serif'; ox.fillText(E[k], (k % cols) * W + 8, Math.floor(k / cols) * Hh + 24);
  }
  const sal = path.join(__dirname, '..', 'data-motor', 'lamina', 'estilos', 'emociones-' + persona + '.png'); fs.writeFileSync(sal, out.toBuffer('image/png')); console.log('listo', sal);
})().catch(e => { console.error('FALLO', e); process.exit(1); });

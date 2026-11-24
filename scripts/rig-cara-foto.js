// Prueba de la cara del rig de fotos: emociones, parpadeo y habla (boca abierta según la voz). Recorta la cabeza. Uso: node scripts/rig-cara-foto.js
const fs = require('fs'), path = require('path');
const { createCanvas } = require('@napi-rs/canvas');
const estilo = require('../estilos/capitol'), B = require('../lienzo/base');
const { titereRig } = require('../lienzo/titere-rig');
const casos = [['normal', 0, 0.9], ['normal', 0, 1.65], ['sorpresa', 0, 1.0], ['feliz', 0, 1.0], ['enojo', 0, 1.0], ['triste', 0, 1.0], ['normal', 0.9, 1.0], ['normal', 0.4, 1.0]]; // [emoción, abertura de voz, instante]
(async () => {
  const W = 360, Hh = 420, out = createCanvas(W * 4, Hh * 2), ox = out.getContext('2d'); ox.fillStyle = '#eee'; ox.fillRect(0, 0, out.width, out.height);
  for (let k = 0; k < casos.length; k++) { const [emo, ab, tt] = casos[k];
    const voz = { fps: 30, abertura: new Array(300).fill(ab) };
    const el = titereRig({ traje: 'bastonera-foto', cx: 0.5, base: 0.96, alto: 0.9, t0: 0, t1: 10, emociones: [{ t: 0.1, e: emo }], voz });
    await el.preparar({ w: 1080, h: 1920 }); const c = createCanvas(1080, 1920), x = c.getContext('2d');
    for (let f = 0; f <= Math.round(tt * 30); f++) { x.clearRect(0, 0, 1080, 1920); B.fondo(x, 1080, 1920, estilo); await el.dibujar(x, { t: f / 30, tAbs: f / 30, w: 1080, h: 1920, u: 1080, estilo }); }
    ox.drawImage(c, 290, 130, 500, 580, (k % 4) * W, Math.floor(k / 4) * Hh, W, Hh); ox.fillStyle = '#000'; ox.font = '20px sans-serif'; ox.fillText(emo + (ab ? ' · habla ' + ab : ''), (k % 4) * W + 10, Math.floor(k / 4) * Hh + 26);
  }
  const sal = path.join(__dirname, '..', 'data-motor', 'lamina', 'estilos', 'rig-cara-foto.png'); fs.writeFileSync(sal, out.toBuffer('image/png')); console.log('listo', sal);
})().catch(e => { console.error('FALLO', e); process.exit(1); });

// Hoja de prueba del rig con piezas de FOTO: reposo y cada gesto, sobre fondo crema. Uso: node scripts/rig-prueba-foto.js [salida.png]
const fs = require('fs'), path = require('path');
const { createCanvas } = require('@napi-rs/canvas');
const estilo = require('../estilos/capitol'), B = require('../lienzo/base');
const { titereRig, GESTOS } = require('../lienzo/titere-rig');
const casos = [['reposo', null], ['celebrar', null], ['senalar', null], ...Object.keys(GESTOS).map(g => ['reposo', g])];
(async () => {
  const W = 540, Hh = 960, cols = 5, filas = Math.ceil(casos.length / cols), sal = process.argv[2] || path.join(__dirname, '..', 'data-motor', 'lamina', 'estilos', 'rig-foto-prueba.png');
  const out = createCanvas(W * cols, Hh * filas), ox = out.getContext('2d'); ox.fillStyle = '#eee'; ox.fillRect(0, 0, out.width, out.height); let k = 0;
  for (const [pose, gesto] of casos) {
    const el = titereRig({ traje: 'bastonera-foto', cx: 0.5, base: 0.96, alto: 0.9, t0: 0, t1: 10, poses: pose === 'reposo' ? [] : [{ t: 0.1, pieza: 'cuerpo-bastonera-' + pose }], emociones: [], gestos: gesto ? [{ id: gesto, t: 0.3 }] : [], accesorios: [] });
    await el.preparar({ w: 1080, h: 1920 }); const c = createCanvas(1080, 1920), x = c.getContext('2d');
    const tFin = gesto ? 0.3 + GESTOS[gesto].dur / 2 : 1.4; for (let f = 0; f <= Math.round(tFin * 30); f++) { x.clearRect(0, 0, 1080, 1920); B.fondo(x, 1080, 1920, estilo); await el.dibujar(x, { t: f / 30, tAbs: f / 30, w: 1080, h: 1920, u: 1080, estilo }); }
    ox.drawImage(c, (k % cols) * W, Math.floor(k / cols) * Hh, W, Hh); ox.fillStyle = '#000'; ox.font = '22px sans-serif'; ox.fillText(pose + (gesto ? ' + ' + gesto : ''), (k % cols) * W + 12, Math.floor(k / cols) * Hh + 30); k++;
  }
  fs.writeFileSync(sal, out.toBuffer('image/png')); console.log('listo', sal);
})().catch(e => { console.error('FALLO', e); process.exit(1); });

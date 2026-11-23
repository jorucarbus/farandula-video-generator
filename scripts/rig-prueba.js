// Hoja de prueba del muñeco articulado: dibuja cada pose y gesto en un instante y los junta en una imagen (sin render de video).
// Uso: node scripts/rig-prueba.js [salida.png]
const fs = require('fs'), path = require('path');
const { createCanvas } = require('@napi-rs/canvas');
const estilo = require('../estilos/capitol');
const { registrarFuentes } = (() => { try { return require('../lienzo/render'); } catch { return {}; } })();
const B = require('../lienzo/base');
const { titereRig, GESTOS } = require('../lienzo/titere-rig');
const casos = [['reposo', null, 'normal', 'gala'], ['reposo', 'mejillas', 'sorpresa', 'gala'], ['reposo', null, 'normal'], ['celebrar', null, 'feliz'], ['senalar', null, 'normal'], ...Object.keys(GESTOS).map(g => ['reposo', g, g === 'mejillas' ? 'sorpresa' : g === 'pecho' ? 'triste' : g === 'cintura' ? 'enojo' : 'feliz'])];
(async () => {
  const W = 540, Hh = 960, sal = process.argv[2] || path.join(__dirname, '..', 'data-motor', 'lamina', 'estilos', 'rig-prueba.png'), cols = 5, filas = Math.ceil(casos.length / cols);
  const out = createCanvas(W * cols, Hh * filas), ox = out.getContext('2d'); ox.fillStyle = '#eee'; ox.fillRect(0, 0, out.width, out.height);
  let k = 0;
  for (const [pose, gesto, emo, traje] of casos) {
    const el = titereRig({ traje: traje || 'bastonera', cx: 0.5, base: 0.96, alto: 0.9, t0: 0, t1: 10, poses: pose === 'reposo' ? [] : [{ t: 0.1, pieza: 'cuerpo-bastonera-' + pose }], emociones: [{ t: 0.1, e: emo }], gestos: gesto ? [{ id: gesto, t: 0.3 }] : [], accesorios: [] });
    await el.preparar({ w: 1080, h: 1920 }); const c = createCanvas(1080, 1920), x = c.getContext('2d');
    const tFin = gesto ? 0.3 + GESTOS[gesto].dur / 2 : 1.4; for (let f = 0; f <= Math.round(tFin * 30); f++) { x.clearRect(0, 0, 1080, 1920); B.fondo(x, 1080, 1920, estilo); await el.dibujar(x, { t: f / 30, tAbs: f / 30, w: 1080, h: 1920, u: 1080, estilo }); }
    ox.drawImage(c, (k % cols) * W, Math.floor(k / cols) * Hh, W, Hh); ox.fillStyle = '#000'; ox.font = '22px sans-serif'; ox.fillText((traje ? traje + ' ' : '') + pose + (gesto ? ' + ' + gesto : '') + ' / ' + emo, (k % cols) * W + 12, Math.floor(k / cols) * Hh + 30); k++;
  }
  fs.writeFileSync(sal, out.toBuffer('image/png')); console.log('listo', sal);
})().catch(e => { console.error('FALLO', e); process.exit(1); });

// Hoja de poses de la marioneta + escenario, con voz simulada. Uso: node scripts/previsualizar-titere.js [salida.png]
const fs = require('fs'), path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { execFileSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const estilo = require('../estilos/capitol');
const { registrarFuentes } = require('../overlay/animacion');
const B = require('../lienzo/base');
const { titere } = require('../lienzo/titere');
const { escenario } = require('../lienzo/escenarios');
registrarFuentes(estilo);
const W = 1080, H = 1920, ESC = 0.25;
const foto = execFileSync(ffmpeg, ['-v', 'error', '-ss', '1.2', '-i', path.join(__dirname, '..', 'temp-videos', 'src_12-mpm8Qds6RaJCeQDbEdjStPjDahmJ8T.mp4'), '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-'], { maxBuffer: 1 << 26 });
const vozFalsa = ap => ({ fps: 30, abertura: new Float32Array(900).fill(ap), energia: new Float32Array(900).fill(ap) });
const poses = [
  ['reposo', 0, []], ['hablando', 0.9, []], ['señalar', 0.6, [{ plantilla: 'senalar', lado: 'D', t0: 0, t1: 9 }]],
  ['celebrar', 0.8, [{ plantilla: 'celebrar', t0: 0, t1: 9 }]], ['encoger', 0.2, [{ plantilla: 'encoger', t0: 0, t1: 9 }]], ['sorpresa', 1, [{ plantilla: 'sorpresa', t0: 0, t1: 9 }]],
];
(async () => {
  const hoja = createCanvas(Math.round(W * ESC) * 6, Math.round(H * ESC) * 2), c = hoja.getContext('2d');
  const tile = createCanvas(W, H), tx = tile.getContext('2d');
  const fila = async (fila, mk, t) => {
    for (const [i, [nombre, ap, acciones]] of poses.entries()) {
      const el = mk(acciones, ap); await el.preparar({ w: W, h: H });
      B.fondo(tx, W, H, estilo);
      if (el.extra) await el.extra(tx);
      const tt = t + (nombre === 'sorpresa' ? 0.12 : 0.0);
      el.dibujar(tx, { t: 2, tAbs: tt, w: W, h: H, u: W, estilo });
      c.drawImage(tile, i * W * ESC, fila * H * ESC, W * ESC, H * ESC);
    }
  };
  await fila(0, (acc, ap) => titere({ genero: 'mujer', foto, recorte: { cx: 0.5, cy: 0.37, rx: 0.40, ry: 0.25 }, voz: vozFalsa(ap), acciones: acc, t0: 0, t1: 9, cx: 0.5, base: 0.92, alto: 0.46 }), 1.3);
  // fila 2: hombre genérico con casa detrás
  const casa = escenario({ tipo: 'casa', texto: 'Mansión VIP', cx: 0.68, base: 0.92, ancho: 0.56, t0: 0, t1: 9 });
  await fila(1, (acc, ap) => { const t = titere({ genero: 'hombre', voz: vozFalsa(ap), acciones: acc, t0: 0, t1: 9, cx: 0.32, base: 0.92, alto: 0.44 }); t.extra = async x => casa.dibujar(x, { t: 2, tAbs: 2, w: W, h: H, u: W, estilo }); return t; }, 1.3);
  fs.writeFileSync(process.argv[2] || 'data-motor/lamina/hoja-titere.png', hoja.toBuffer('image/png'));
  console.log('ok');
})().catch(e => { console.error(e); process.exit(1); });

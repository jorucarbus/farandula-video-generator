// Hoja del muñeco de recortes: expresiones sobre la foto (ampliadas) y el cuerpo entero en varios instantes.
const fs = require('fs'), path = require('path');
const { createCanvas } = require('@napi-rs/canvas');
const estilo = require('../estilos/capitol');
const { registrarFuentes } = require('../overlay/animacion');
const B = require('../lienzo/base');
const { muneco, EMOCIONES } = require('../lienzo/recortes');
registrarFuentes(estilo);
const W = 1080, H = 1920;
const foto = fs.readFileSync(path.join(__dirname, '..', 'assets', 'kit', 'cabeza-relleno-mujer.png'));
const recorte = { cx: 0.5, cy: 0.345, rx: 0.353, ry: 0.28 }, anclas = { ojoY: 0.01, ojoDx: 0.17, ojoR: 0.05, bocaY: 0.33 };
(async () => {
  const salida = process.argv[2] || 'data-motor/lamina/hoja-recortes-muneco.png';
  const tile = createCanvas(W, H), tx = tile.getContext('2d'), CW = 300, CH = Math.round(CW * H / W);
  const hoja = createCanvas(CW * 5, CH * 2), c = hoja.getContext('2d');
  // fila 1: cada emoción (cerca)
  for (const [i, emo] of EMOCIONES.entries()) {
    const m = muneco({ cuerpo: 'cuerpo-bastonera', cabeza: foto, recorte, anclas, emociones: [{ t: 0, e: emo }], t0: -5, t1: 99, cx: 0.5, base: 0.97, alto: 0.78 });
    await m.preparar({ w: W, h: H }); B.fondo(tx, W, H, estilo); m.dibujar(tx, { t: 9, tAbs: 4, w: W, h: H, u: W, estilo });
    c.drawImage(tile, 0, H * 0.18, W, H * 0.45, i * CW, 0, CW, CW * 0.45 * H / W);
  }
  // fila 2: poses y accesorio
  const casos = [[{ cuerpo: 'cuerpo-bastonera' }, 0.3], [{ cuerpo: 'cuerpo-bastonera' }, 0.45], [{ cuerpo: 'cuerpo-bastonera', poses: [{ t: 1, pieza: 'cuerpo-bastonera-celebrar' }], emociones: [{ t: 1, e: 'sorpresa' }] }, 2], [{ cuerpo: 'cuerpo-bastonera', poses: [{ t: 1, pieza: 'cuerpo-bastonera-senalar' }], accesorios: [{ id: 'corona', t: 1.2 }], emociones: [{ t: 1.2, e: 'feliz' }], pegatinas: [{ id: 'guante-pulgar', t0: 1.4, dx: 0.34, dy: 0.62, ancho: 0.26 }] }, 3], [{ cuerpo: 'cuerpo-gala', accesorios: [{ id: 'corona', t: 0.2 }], emociones: [{ t: 0.2, e: 'feliz' }] }, 2]];
  for (const [i, [cfg, t]] of casos.entries()) {
    const m = muneco({ cabeza: foto, recorte, anclas, t0: 0, t1: 99, cx: 0.5, base: 0.93, alto: 0.5, ...cfg });
    await m.preparar({ w: W, h: H }); B.fondo(tx, W, H, estilo);
    for (let k = 0; k <= Math.round(t * 30); k++) { B.fondo(tx, W, H, estilo); m.dibujar(tx, { t: k / 30, tAbs: k / 30, w: W, h: H, u: W, estilo }); } // avanza la simulación
    c.drawImage(tile, 0, 0, W, H, i * CW, CH, CW, CH);
  }
  fs.writeFileSync(salida, hoja.toBuffer('image/png')); console.log('ok');
})().catch(e => { console.error(e); process.exit(1); });

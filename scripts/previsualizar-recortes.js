// Hojas de revisión del muñeco de recortes.
//   node scripts/previsualizar-recortes.js proporciones [salida.png]   → 3 proporciones cabeza-cuerpo, en reposo y feliz
//   node scripts/previsualizar-recortes.js emociones [salida.png] [prop] → las 5 emociones con el rostro grande
const fs = require('fs'), path = require('path');
const { createCanvas } = require('@napi-rs/canvas');
const estilo = require('../estilos/capitol');
const { registrarFuentes } = require('../overlay/animacion');
const B = require('../lienzo/base');
const { muneco, EMOCIONES } = require('../lienzo/recortes');
registrarFuentes(estilo);
const W = 1080, H = 1920;
const foto = fs.readFileSync(path.join(__dirname, '..', 'assets', 'kit', 'cabeza-relleno-mujer.png'));
const recorte = { cx: 0.5, cy: 0.345, rx: 0.353, ry: 0.28 };

async function cuadro(cfg, tAbs = 4) {
  const tile = createCanvas(W, H), tx = tile.getContext('2d');
  const m = muneco({ cabeza: foto, recorte, t0: -9, t1: 99, ...cfg });
  await m.preparar({ w: W, h: H });
  for (let k = Math.round((tAbs - 2) * 30); k <= Math.round(tAbs * 30); k++) { B.fondo(tx, W, H, estilo); m.dibujar(tx, { t: k / 30 + 9, tAbs: k / 30, w: W, h: H, u: W, estilo }); }
  return tile;
}

(async () => {
  const modo = process.argv[2] || 'proporciones';
  if (modo === 'proporciones') {
    const props = [0.26, 0.30, 0.34, 0.42], CW = 330, CH = Math.round(CW * H / W), hoja = createCanvas(CW * props.length, CH * 2), c = hoja.getContext('2d');
    for (const [i, p] of props.entries()) for (const [fila, emo] of ['normal', 'feliz'].entries()) {
      const t = await cuadro({ proporcion: p, emociones: [{ t: -9, e: emo }], accesorios: emo === 'feliz' ? [{ id: 'corona', t: -9 }] : [], cx: 0.5, base: 0.93, alto: 0.62 }, 4.0);
      c.drawImage(t, 0, 0, W, H, i * CW, fila * CH, CW, CH);
      c.fillStyle = '#222'; c.font = '22px sans-serif'; c.fillText(`cabeza ${Math.round(p * 100)} %${p === 0.42 ? ' (la anterior)' : ''}`, i * CW + 10, fila * CH + 28);
    }
    fs.writeFileSync(process.argv[3] || 'data-motor/lamina/hoja-proporciones.png', hoja.toBuffer('image/png'));
  } else {
    const prop = Number(process.argv[4]) || 0.30, CW = 360, CH = 444, hoja = createCanvas(CW * 5, CH), c = hoja.getContext('2d');
    for (const [i, emo] of EMOCIONES.entries()) {
      const alto = 1.6, base = 1.9, t = await cuadro({ proporcion: prop, emociones: [{ t: -9, e: emo }], alto, base, cx: 0.5 }, emo === 'normal' ? 0.5 : 4.0);
      c.drawImage(t, W * 0.14, H * 0.28, W * 0.72, H * 0.5, i * CW, 0, CW, CH);
    }
    fs.writeFileSync(process.argv[3] || 'data-motor/lamina/hoja-emociones.png', hoja.toBuffer('image/png'));
  }
  console.log('ok');
})().catch(e => { console.error(e); process.exit(1); });

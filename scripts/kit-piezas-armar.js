// Corta la HOJA DE PIEZAS (data-motor/kit/plastilina-crudo/hoja-piezas.png, generada con kit-plastilina-generar.js hoja-piezas) en piezas sueltas
// para el muñeco articulado: quita el fondo, separa cada pieza (componente conexo), le da textura de plastilina y la guarda en
// assets/kit-plastilina/rig/<nombre>.png. La asignación de componentes a nombres se hace por su posición en la hoja elegida.
// Uso: node scripts/kit-piezas-armar.js
const fs = require('fs'), path = require('path');
const { createCanvas } = require('@napi-rs/canvas');
const { quitarFondo } = require('../lienzo/recorte');
const { arcillar } = require('./kit-plastilina-armar');
const CRUDO = path.join(__dirname, '..', 'data-motor', 'kit', 'plastilina-crudo'), SALIDA = path.join(__dirname, '..', 'assets', 'kit-plastilina', 'rig');
// nombre ← función que reconoce el componente por su caja (fracciones del ancho y alto de la hoja recortada)
const REGLAS_BASTONERA = [
  ['cabeza', b => b.cy < 0.45 && b.cx > 0.2 && b.cx < 0.6], ['pelo', b => b.cy < 0.55 && b.cx > 0.65], ['torso', b => b.cy > 0.4 && b.cy < 0.7 && b.cx > 0.2 && b.cx < 0.6 && b.h < 0.4],
  ['falda', b => b.cy > 0.7 && b.cx > 0.2 && b.cx < 0.6], ['brazo-abierto', b => b.cx < 0.15 && b.h > 0.3], ['brazo-puno', b => b.cy > 0.6 && b.cx > 0.6 && b.cx < 0.85 && b.h > 0.3], ['pierna', b => b.cx > 0.85 && b.h > 0.3],
];
// Borde sin mellas: erosiona 1 px y suaviza el alfa (los blancos sobre el verde del croma quedan con dientes de sierra)
function suavizarBorde(im) {
  const w = im.width, h = im.height, a = new Uint8Array(w * h), d = im.data; for (let i = 0; i < w * h; i++) a[i] = d[i * 4 + 3];
  const er = new Uint8Array(a); for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; er[i] = Math.min(a[i], a[i - 1], a[i + 1], a[i - w], a[i + w]); }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; s += er[yy * w + xx]; n++; } d[(y * w + x) * 4 + 3] = Math.round(s / n); }
}
// Traje de gala: torso (corpiño con banda), falda larga, brazos desnudos. La cabeza y el pelo son los de la bastonera.
const REGLAS_GALA = [
  ['torso-gala', b => b.cy < 0.35 && b.cx > 0.3 && b.cx < 0.7], ['falda-gala', b => b.cy > 0.4 && b.cx > 0.3 && b.cx < 0.7 && b.h > 0.4],
  ['brazo-abierto-gala', b => b.cx < 0.3 && b.h > 0.25], ['brazo-puno-gala', b => b.cx > 0.7 && b.h > 0.25],
];
const HOJAS = [
  { hoja: 'hoja-piezas.png', reglas: REGLAS_BASTONERA, op: { tol: 48, suave: 24, margen: 0, matiz: 30, sat: 0.16 } },
  { hoja: 'hoja-piezas-gala.png', reglas: REGLAS_GALA, op: { tol: 28, suave: 24, margen: 0, matiz: 9, sat: 0.4 } },
];
async function cortar({ hoja, reglas: REGLAS, op }) {
  const c = await quitarFondo(path.join(CRUDO, hoja), op), w = c.width, h = c.height, id = c.getContext('2d').getImageData(0, 0, w, h), d = id.data;
  const lab = new Int32Array(w * h), comps = []; let nl = 0;
  for (let p0 = 0; p0 < w * h; p0++) {
    if (lab[p0] || d[p0 * 4 + 3] < 128) continue; nl++; const st = [p0]; lab[p0] = nl; let n = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
    while (st.length) { const p = st.pop(), x = p % w, y = (p / w) | 0; n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const [q, ok] of [[p - 1, x > 0], [p + 1, x < w - 1], [p - w, y > 0], [p + w, y < h - 1]]) if (ok && !lab[q] && d[q * 4 + 3] >= 128) { lab[q] = nl; st.push(q); } }
    comps.push({ id: nl, n, x0, y0, x1, y1 });
  }
  const grandes = comps.filter(k => k.n > 3000).map(k => ({ ...k, cx: (k.x0 + k.x1) / 2 / w, cy: (k.y0 + k.y1) / 2 / h, w: (k.x1 - k.x0) / w, h: (k.y1 - k.y0) / h }));
  fs.mkdirSync(SALIDA, { recursive: true });
  for (const [nombre, regla] of REGLAS) {
    const k = grandes.find(regla); if (!k) { console.log('FALTA', nombre); continue; } console.log(nombre, '←', JSON.stringify({ x0: k.x0, y0: k.y0, cx: +k.cx.toFixed(2), cy: +k.cy.toFixed(2), h: +k.h.toFixed(2) }));
    const pw = k.x1 - k.x0 + 1, ph = k.y1 - k.y0 + 1, o = createCanvas(pw, ph), ox = o.getContext('2d'), oi = ox.createImageData(pw, ph);
    for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) { const p = (k.y0 + y) * w + k.x0 + x; if (lab[p] !== k.id) continue; const q = (y * pw + x) * 4, s = p * 4; oi.data[q] = d[s]; oi.data[q + 1] = d[s + 1]; oi.data[q + 2] = d[s + 2]; oi.data[q + 3] = d[s + 3]; }
    suavizarBorde(oi); ox.putImageData(oi, 0, 0); arcillar(o, REGLAS.findIndex(r => r[0] === nombre) + 40, 1.2, nombre !== 'cabeza');
    fs.writeFileSync(path.join(SALIDA, nombre + '.png'), o.toBuffer('image/png')); console.log(nombre, pw + 'x' + ph);
  }
}
(async () => { for (const h of HOJAS) await cortar(h); })().catch(e => { console.error('FALLO', e); process.exit(1); });

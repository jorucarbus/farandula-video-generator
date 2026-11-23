// Arma el kit de plastilina: toma las piezas elegidas de data-motor/kit/plastilina-crudo/, les quita el fondo de color liso y las deja en
// assets/kit-plastilina/ con los MISMOS nombres que el kit de fotos (cuerpo-bastonera, cuerpo-bastonera-celebrar, corona, baston, ...),
// para que el muñeco las use con solo cambiar de kit ({ kit: 'plastilina' }). La cabeza (sin cara) se recorta bajo el cuello y se guarda
// como cabeza.png con su cabeza.json (caja de la cara y anclas de ojos, cejas y boca).
// Uso: node scripts/kit-plastilina-armar.js
const fs = require('fs'), path = require('path');
const { createCanvas } = require('@napi-rs/canvas');
const { quitarFondo } = require('../lienzo/recorte');
const CRUDO = path.join(__dirname, '..', 'data-motor', 'kit', 'plastilina-crudo'), SALIDA = path.join(__dirname, '..', 'assets', 'kit-plastilina');
// ── Textura de PLASTILINA: relieve de grumos a tres escalas y huellas de dedo (crestas concéntricas) iluminados desde arriba a la izquierda,
// más un grano fino. Se aplica a cada pieza ya recortada, solo donde hay píxeles opacos; no toca el alfa.
function valor(w, h, paso, semilla) { // ruido de valor suavizado (0..1)
  let s = semilla * 9301 + 49297; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296, gw = Math.ceil(w / paso) + 2, gh = Math.ceil(h / paso) + 2, g = new Float32Array(gw * gh).map(rnd), o = new Float32Array(w * h);
  for (let y = 0; y < h; y++) { const fy = y / paso, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty); for (let x = 0; x < w; x++) { const fx = x / paso, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx);
    const a = g[y0 * gw + x0], b = g[y0 * gw + x0 + 1], c = g[(y0 + 1) * gw + x0], d = g[(y0 + 1) * gw + x0 + 1]; o[y * w + x] = (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy; } }
  return o;
}
function arcillar(c, semilla = 1, fuerza = 1, conHuellas = true) {
  const w = c.width, h = c.height, ctx = c.getContext('2d'), id = ctx.getImageData(0, 0, w, h), d = id.data, n1 = valor(w, h, 9, semilla), n2 = valor(w, h, 26, semilla + 11), n3 = valor(w, h, 80, semilla + 23), alt = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) alt[i] = n1[i] * 0.2 + n2[i] * 0.45 + n3[i] * 0.35;
  let s = semilla * 7919 + 17; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296, huellas = conHuellas ? Math.max(6, Math.round(w * h / 140000)) : 0;
  for (let k = 0; k < huellas; k++) { // cada huella: crestas concéntricas deformadas, más marcadas en el centro
    const cx = rnd() * w, cy = rnd() * h, R = 18 + rnd() * 26, per = 5 + rnd() * 3, fase = rnd() * 6.28, ex = 0.7 + rnd() * 0.5, x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(w - 1, Math.ceil(cx + R)), y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(h - 1, Math.ceil(cy + R));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const dx = (x - cx) * ex, dy = y - cy, r = Math.hypot(dx, dy); if (r > R) continue; alt[y * w + x] += Math.sin(r / per * 6.283 + fase + n2[y * w + x] * 9 + n1[y * w + x] * 4) * 0.28 * (1 - r / R) ** 1.6; }
  }
  const o = new Uint8ClampedArray(d);
  for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
    const i = y * w + x, p = i * 4; if (d[p + 3] < 20) continue;
    const luz = (alt[i - w - 1] + alt[i - 1] * 0.5 + alt[i - w] * 0.5) - (alt[i + w + 1] + alt[i + 1] * 0.5 + alt[i + w] * 0.5), grano = (n1[i] - 0.5) * 0.05, k = 1 + (luz * 0.34 + grano) * fuerza;
    o[p] = Math.max(0, Math.min(255, d[p] * k)); o[p + 1] = Math.max(0, Math.min(255, d[p + 1] * k)); o[p + 2] = Math.max(0, Math.min(255, d[p + 2] * k));
  }
  id.data.set(o); ctx.putImageData(id, 0, 0); return c;
}
const BASE = { tol: 40, suave: 30, margen: 2, matiz: 28, sat: 0.18, limpiarGlobal: false };
// nombre de salida ← [archivo crudo elegido a ojo, opciones del recorte]. El vestido verde de la gala va sobre fondo azul: matiz estrecho para no comerse el vestido.
const ELEGIDAS = {
  'cuerpo-bastonera': ['cuerpo-reposo-1'], 'cuerpo-bastonera-celebrar': ['cuerpo-celebrar-1'], 'cuerpo-bastonera-senalar': ['cuerpo-senalar-2'],
  'cuerpo-gala': ['cuerpo-gala-1', { matiz: 9, sat: 0.4, tol: 28 }], corona: ['corona-3'], baston: ['baston-2'], 'guante-pulgar': ['mano-pulgar-1'], 'guante-abierto': ['mano-abierta-1'],
};
// Cabeza: se corta a CORTE del alto (justo bajo el cuello, sin pecho) y los últimos FUNDIDO del recorte se desvanecen. La caja de la cara y las
// anclas son fracciones de la imagen recortada, medidas sobre una rejilla.
const CABEZA = { crudo: 'cabeza-2', corte: 0.62, fundido: 0.10, cuelloDesde: 0.85, cuelloAncho: 0.11, // cuelloDesde: fracción del alto bajo la cual se quita el cuello; cuelloAncho: media anchura de la columna quitada
  libre: { caja: { cx: 0.5, cy: 0.4715, w: 0.42, h: 0.691 }, tope: 0.817, limpia: true, cuelloK: -0.05 },
  anclas: { ojoY: -0.06, ojoDx: 0.30, ojoR: 0.065, bocaY: 0.316, bocaAncho: 0.15, cejaY: -0.12 } };
(async () => {
  fs.mkdirSync(SALIDA, { recursive: true });
  for (const [salida, [crudo, op]] of Object.entries(ELEGIDAS)) {
    const c = await quitarFondo(path.join(CRUDO, crudo + '.png'), { ...BASE, ...(op || {}) });
    arcillar(c, Object.keys(ELEGIDAS).indexOf(salida) + 1); fs.writeFileSync(path.join(SALIDA, salida + '.png'), c.toBuffer('image/png')); console.log(salida, c.width + 'x' + c.height);
  }
  const full = await quitarFondo(path.join(CRUDO, CABEZA.crudo + '.png'), BASE), alto = Math.round(full.height * CABEZA.corte), c = createCanvas(full.width, alto), x = c.getContext('2d');
  arcillar(full, 99, 1, false); x.drawImage(full, 0, 0, full.width, alto, 0, 0, full.width, alto);
  const f = Math.round(alto * CABEZA.fundido), id = x.getImageData(0, alto - f, full.width, f), d = id.data;
  for (let j = 0; j < f; j++) for (let i = 0; i < full.width; i++) d[(j * full.width + i) * 4 + 3] *= 1 - (j + 1) / f;
  x.putImageData(id, 0, alto - f);
  // El cuello de debajo de la barbilla se quita: el cuerpo de plastilina trae el suyo, y así no queda una mancha difusa sobre el cuello del traje.
  // Solo la columna central (el pelo de los lados se queda y cae sobre los hombros).
  { const y0 = Math.round(alto * CABEZA.cuelloDesde), p = x.getImageData(0, y0, full.width, alto - y0), q = p.data, mitad = CABEZA.cuelloAncho * full.width, suave = full.width * 0.03;
    for (let j = 0; j < alto - y0; j++) for (let i = 0; i < full.width; i++) { const dx = Math.abs(i - full.width / 2), k = Math.min(1, Math.max(0, (dx - mitad) / suave)), ky = Math.min(1, j / (alto * 0.03)); q[(j * full.width + i) * 4 + 3] *= 1 - (1 - k) * ky; }
    x.putImageData(p, 0, y0); }
  fs.writeFileSync(path.join(SALIDA, 'cabeza.png'), c.toBuffer('image/png'));
  fs.writeFileSync(path.join(SALIDA, 'cabeza.json'), JSON.stringify({ descripcion: 'Cabeza de plastilina SIN CARA (ojos, cejas y boca se modelan encima como piezas de arcilla), con pelo y cuello. Se dibuja detrás del cuerpo: el cuello entra por el cuello del traje.', libre: CABEZA.libre, anclas: CABEZA.anclas }, null, 2));
  console.log('cabeza', c.width + 'x' + c.height);
})().catch(e => { console.error('FALLO', e); process.exit(1); });

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
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const dx = (x - cx) * ex, dy = y - cy, r = Math.hypot(dx, dy); if (r > R) continue; alt[y * w + x] += Math.sin(r / per * 6.283 + fase + n2[y * w + x] * 14 + n1[y * w + x] * 9) * 0.16 * (1 - r / R) ** 1.8; }
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
const FIGURAS = ['cuerpo-bastonera', 'cuerpo-bastonera-celebrar', 'cuerpo-bastonera-senalar', 'cuerpo-gala']; // nombres de salida que son figuras completas
const ELEGIDAS = {
  'cuerpo-bastonera': ['figura-maestra'], 'cuerpo-bastonera-celebrar': ['figura-celebrar-1'], 'cuerpo-bastonera-senalar': ['figura-senalar-2'],
  'cuerpo-gala': ['figura-gala-3', { matiz: 9, sat: 0.4, tol: 28 }], corona: ['corona-3'], baston: ['baston-2'], 'guante-pulgar': ['mano-pulgar-1'], 'guante-abierto': ['mano-abierta-1'],
};
// FIGURAS de una sola pieza (cabeza + cuello + cuerpo esculpidos juntos, cara en blanco): además de recortarlas se mide dónde está la cara para
// poner ahí las expresiones modeladas. Se guarda <nombre>.json con { caja: {cx, cy, w, h} de la cara, top: fila de lo más alto de la cabeza,
// pies: columna central de los pies } en fracciones de la imagen recortada.
function detectarCara(c, nombre) {
  const w = c.width, h = c.height, d = c.getContext('2d').getImageData(0, 0, w, h).data;
  // columna de los pies: centro de los píxeles opacos del 6 % de abajo; con ella se acota dónde buscar la cara
  let sx = 0, n = 0; for (let y = Math.floor(h * 0.94); y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 128) { sx += x; n++; }
  const pies = n ? sx / n : w / 2;
  const piel = i => { const r = d[i], g = d[i + 1], b = d[i + 2]; if (d[i + 3] < 200 || r < 170 || g < 130) return false; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), s = (mx - mn) / mx; return r >= g && g >= b * 0.95 && s > 0.08 && s < 0.33; };
  const x0 = Math.max(0, Math.round(pies - w * 0.2)), x1 = Math.min(w - 1, Math.round(pies + w * 0.2)), filas = [];
  for (let y = 0; y < h * 0.4; y++) { let mn = 1e9, mx = -1, k = 0; for (let x = x0; x <= x1; x++) if (piel((y * w + x) * 4)) { if (x < mn) mn = x; if (x > mx) mx = x; k++; } filas.push(k > 4 ? { mn, mx, ancho: mx - mn } : null); }
  const anchos = filas.map(f => (f ? f.ancho : 0)), maxA = Math.max(...anchos), yMax = anchos.indexOf(maxA);
  let top = yMax; while (top > 0 && anchos[top - 1] >= maxA * 0.35) top--;
  let chin = yMax; while (chin < anchos.length - 1 && anchos[chin + 1] >= maxA * 0.55) chin++;
  const centros = []; for (let y = Math.max(top, yMax - 10); y <= yMax + 10; y++) if (filas[y]) centros.push((filas[y].mn + filas[y].mx) / 2);
  const cx = centros.reduce((a, b) => a + b, 0) / centros.length;
  // lo más alto de la cabeza (pelo): primera fila opaca en la columna de la cara
  let topPelo = 0; for (let y = 0; y < h; y++) { let hay = false; for (let x = Math.round(cx - w * 0.04); x <= Math.round(cx + w * 0.04); x++) if (d[(y * w + x) * 4 + 3] > 128) { hay = true; break; } if (hay) { topPelo = y; break; } }
  const caja = { cx: +(cx / w).toFixed(4), cy: +(((top + chin) / 2) / h).toFixed(4), w: +(maxA / w).toFixed(4), h: +((chin - top) / h).toFixed(4) };
  // comprobación visual
  const o = createCanvas(w, h), ox = o.getContext('2d'); ox.fillStyle = '#f3ecd8'; ox.fillRect(0, 0, w, h); ox.drawImage(c, 0, 0); ox.strokeStyle = 'red'; ox.lineWidth = 3;
  ox.strokeRect(cx - maxA / 2, top, maxA, chin - top); ox.beginPath(); ox.moveTo(0, topPelo); ox.lineTo(w, topPelo); ox.stroke();
  fs.mkdirSync(path.join(__dirname, '..', 'data-motor', 'lamina', 'estilos'), { recursive: true }); fs.writeFileSync(path.join(__dirname, '..', 'data-motor', 'lamina', 'estilos', 'cara-' + nombre + '.png'), o.toBuffer('image/png'));
  return { caja, top: +(topPelo / h).toFixed(4), pies: +(pies / w).toFixed(4) };
}
// Anclas de las expresiones, relativas a la caja de la cara (ojos en la raíz de la nariz, boca bajo ella).
const ANCLAS = { ojoY: -0.10, ojoDx: 0.25, ojoR: 0.075, bocaY: 0.30, bocaAncho: 0.20, cejaY: -0.13 };
module.exports = { arcillar, valor };
if (require.main === module) (async () => {
  fs.mkdirSync(SALIDA, { recursive: true });
  for (const f of fs.readdirSync(SALIDA)) if (/^cabeza\./.test(f)) fs.unlinkSync(path.join(SALIDA, f)); // la cabeza suelta ya no se usa
  for (const [salida, [crudo, op]] of Object.entries(ELEGIDAS)) {
    const c = await quitarFondo(path.join(CRUDO, crudo + '.png'), { ...BASE, ...(op || {}) }), esFigura = FIGURAS.includes(salida);
    const meta = esFigura ? detectarCara(c, salida) : null; // la cara se mide ANTES de la textura (el relieve cambia el tono)
    arcillar(c, Object.keys(ELEGIDAS).indexOf(salida) + 1, esFigura ? 1.3 : 1);
    fs.writeFileSync(path.join(SALIDA, salida + '.png'), c.toBuffer('image/png'));
    if (meta) fs.writeFileSync(path.join(SALIDA, salida + '.json'), JSON.stringify({ descripcion: 'Figura de plastilina de una sola pieza con la cara en blanco; las expresiones se modelan sobre la caja de la cara.', ...meta, anclas: ANCLAS }, null, 2));
    console.log(salida, c.width + 'x' + c.height, meta ? JSON.stringify(meta.caja) : '');
  }
})().catch(e => { console.error('FALLO', e); process.exit(1); });

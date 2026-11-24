// Corta el kit de FOTOS en piezas para el muñeco articulado (rig): cabeza (con cuello), pelo (detrás de la espalda), torso+falda, brazo, piernas.
// Entrada: assets/kit/cuerpo-bastonera.png (cuerpo sin cabeza, brazos colgando) y assets/kit/cabeza-relleno-mujer.png (cabeza FICTICIA genérica).
// Salida: assets/foto-rig/*.png, con el torso centrado en x y el brazo centrado sobre su eje, listos para lienzo/titere-rig.js (traje 'bastonera-foto').
// Uso: node scripts/kit-foto-rig.js
const fs = require('fs'), path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const KIT = path.join(__dirname, '..', 'assets', 'kit'), SAL = path.join(__dirname, '..', 'assets', 'foto-rig');
const interp = (pts, y) => { if (y <= pts[0][0]) return pts[0][1]; for (let i = 1; i < pts.length; i++) if (y <= pts[i][0]) { const [y0, v0] = pts[i - 1], [y1, v1] = pts[i]; return v0 + (v1 - v0) * (y - y0) / (y1 - y0); } return pts[pts.length - 1][1]; };
// borde interior del brazo izquierdo (el que da al torso) por fila; el derecho es el espejo respecto al eje x = CX
const CX = 221, BORDE = [[22, 176], [50, 152], [88, 140], [150, 139], [220, 136], [290, 128], [320, 116], [398, 112], [402, 82], [470, 82]], Y_HOMBRO = 22, PIV_Y = 40, Y_CODO = 280, Y_MANO = 470, Y_CADERA = 458;
const EJE_BRAZO = 104; // x del eje del brazo (centro de la manga) en la foto

function pixeles(img) { const c = createCanvas(img.width, img.height), x = c.getContext('2d'); x.drawImage(img, 0, 0); return { c, x, id: x.getImageData(0, 0, img.width, img.height) }; }
// suaviza el alfa (3x3) para que los cortes rectos no se vean dentados; no toca el color
function suavizaAlfa(c) { const w = c.width, h = c.height, x = c.getContext('2d'), id = x.getImageData(0, 0, w, h), d = id.data, a = new Float32Array(w * h); for (let i = 0; i < w * h; i++) a[i] = d[i * 4 + 3];
  for (let y = 1; y < h - 1; y++) for (let xx = 1; xx < w - 1; xx++) { const i = y * w + xx; if (!d[i * 4 + 3] && !a[i - 1] && !a[i + 1] && !a[i - w] && !a[i + w]) continue; let s = 0; for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) s += a[i + k * w + j]; d[i * 4 + 3] = Math.min(d[i * 4 + 3] || 255, s / 9 + 18) > 255 ? 255 : Math.round(s / 9 < 40 ? s / 9 : Math.min(255, s / 9 + 18)); }
  x.putImageData(id, 0, 0); return c; }
const guardar = (c, n) => (n === 'cabeza' || n === 'pelo' ? 0 : suavizaAlfa(c),  fs.writeFileSync(path.join(SAL, n + '.png'), c.toBuffer('image/png')));

// ── cuerpo ──
async function cuerpo() {
  const img = await loadImage(fs.readFileSync(path.join(KIT, 'cuerpo-bastonera.png'))), W = img.width, H = img.height, { id } = pixeles(img), d = id.data;
  const dentroBrazoI = (x, y) => y >= Y_HOMBRO && y <= Y_MANO && x < interp(BORDE, y), dentroBrazoD = (x, y) => y >= Y_HOMBRO && y <= Y_MANO && (W - 1 - x + (2 * CX - W + 1)) < interp(BORDE, y);
  // torso + falda: todo menos los brazos, hasta la línea de la cadera
  const core = createCanvas(W, Y_CADERA + 4), cx = core.getContext('2d'), cid = cx.createImageData(W, Y_CADERA + 4);
  for (let y = 0; y < Y_CADERA + 4; y++) for (let x = 0; x < W; x++) { if (dentroBrazoI(x, y) || dentroBrazoD(x, y)) continue; const i = (y * W + x) * 4, o = i; cid.data[o] = d[i]; cid.data[o + 1] = d[i + 1]; cid.data[o + 2] = d[i + 2]; cid.data[o + 3] = d[i + 3]; }
  cx.putImageData(cid, 0, 0); guardar(core, 'torso');
  // brazo (el izquierdo de la foto), recortado y centrado en su eje; el derecho se obtiene espejando este
  const aw = 2 * (EJE_BRAZO + 6), ah = Y_MANO - Y_HOMBRO + 4, br = createCanvas(aw, ah), bx = br.getContext('2d'), bid = bx.createImageData(aw, ah);
  for (let y = Y_HOMBRO; y < Y_HOMBRO + ah; y++) for (let x = 0; x < EJE_BRAZO + 80; x++) { if (!dentroBrazoI(x, y)) continue; const ox = x - EJE_BRAZO + aw / 2, oy = y - Y_HOMBRO; if (ox < 0 || ox >= aw) continue; const i = (y * W + x) * 4, o = (oy * aw + ox) * 4; bid.data[o] = d[i]; bid.data[o + 1] = d[i + 1]; bid.data[o + 2] = d[i + 2]; bid.data[o + 3] = d[i + 3]; }
  bx.putImageData(bid, 0, 0); guardar(br, 'brazo-abierto'); guardar(br, 'brazo-puno');
  // piernas: desde justo bajo el dobladillo hasta las botas; en las filas de las manos solo la zona central
  const lg = createCanvas(W, H - Y_CADERA), lx = lg.getContext('2d'), lid = lx.createImageData(W, H - Y_CADERA);
  for (let y = Y_CADERA; y < H; y++) for (let x = 0; x < W; x++) { if (y < Y_MANO && (x < 100 || x > 342)) continue; const i = (y * W + x) * 4, o = ((y - Y_CADERA) * W + x) * 4; lid.data[o] = d[i]; lid.data[o + 1] = d[i + 1]; lid.data[o + 2] = d[i + 2]; lid.data[o + 3] = d[i + 3]; }
  lx.putImageData(lid, 0, 0); guardar(lg, 'piernas');
  return { W, H };
}

// ── cabeza y pelo, a partir de la foto: se quita el fondo gris por inundación desde el borde con un modelo de fondo suave ──
async function cabeza() {
  const img = await loadImage(fs.readFileSync(path.join(KIT, 'cabeza-relleno-mujer.png'))), W = img.width, H = img.height, { id } = pixeles(img), d = id.data;
  const media = (x0, y0) => { let r = 0, g = 0, b = 0, n = 0; for (let y = y0; y < y0 + 16; y++) for (let x = x0; x < x0 + 16; x++) { const i = (y * W + x) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; } return [r / n, g / n, b / n]; };
  const q = [media(2, 2), media(W - 18, 2), media(2, 120), media(W - 18, 120)]; // el fondo gris: solo se muestrea arriba (abajo está el suéter)
  const fondo = (x, y) => { const fx = x / W, fy = Math.min(1, y / 120), a = q[0].map((v, k) => v + (q[1][k] - v) * fx), b = q[2].map((v, k) => v + (q[3][k] - v) * fx); return a.map((v, k) => v + (b[k] - v) * fy); };
  const esF = (x, y) => { const i = (y * W + x) * 4, f = fondo(x, y); return Math.hypot(d[i] - f[0], d[i + 1] - f[1], d[i + 2] - f[2]) < 40; };
  const bg = new Uint8Array(W * H), pila = []; const mete = (x, y) => { if (x < 0 || y < 0 || x >= W || y >= H || bg[y * W + x] || !esF(x, y)) return; bg[y * W + x] = 1; pila.push(x, y); };
  for (let x = 0; x < W; x++) { mete(x, 0); mete(x, 1); } for (let y = 0; y < 400; y++) { mete(0, y); mete(W - 1, y); }
  while (pila.length) { const y = pila.pop(), x = pila.pop(); mete(x + 1, y); mete(x - 1, y); mete(x, y + 1); mete(x, y - 1); }
  // alfa con borde suave: 1 px de erosión y desenfoque de la máscara
  const al = new Float32Array(W * H); for (let i = 0; i < W * H; i++) al[i] = bg[i] ? 0 : 1;
  const er = new Float32Array(W * H); for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; er[i] = Math.min(al[i], al[i - 1], al[i + 1], al[i - W], al[i + W]); }
  const bl = new Float32Array(W * H); for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) { let s = 0; for (let k = -2; k <= 2; k++) for (let j = -2; j <= 2; j++) s += er[(y + k) * W + x + j]; bl[y * W + x] = s / 25; }
  const S = 0.32, cw = Math.round(W * S), ch = Math.round(H * S), NECK_Y = 830, CHIN_Y = 735;
  const hacer = (filtro) => { const c = createCanvas(W, H), x = c.getContext('2d'), o = x.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) { const i = y * W + xx, a = bl[i] * filtro(xx, y, d[i * 4], d[i * 4 + 1], d[i * 4 + 2]); if (a <= 0) continue; o.data[i * 4] = d[i * 4]; o.data[i * 4 + 1] = d[i * 4 + 1]; o.data[i * 4 + 2] = d[i * 4 + 2]; o.data[i * 4 + 3] = Math.round(a * 255); }
    x.putImageData(o, 0, 0); const r = createCanvas(cw, ch); r.getContext('2d').drawImage(c, 0, 0, cw, ch); return r; };
  // cabeza: todo hasta la barbilla; entre la barbilla y la base del cuello, solo la columna de piel central (no el suéter ni el pelo)
  const lum = (r, g, b) => 0.3 * r + 0.59 * g + 0.11 * b;
  const cab = hacer((x, y) => y <= 560 ? 1 : y <= 700 ? (x > 235 && x < 640 ? 1 : (700 - y) / 140) : y <= NECK_Y && x > 300 && x < 585 ? 1 : 0); // el pelo de los lados se desvanece: sigue en la capa de pelo de atrás
  // pelo (detrás de la espalda): toda la foto, pero por debajo de la barbilla solo lo oscuro (sin suéter ni piel)
  const CORTE = NECK_Y + (50 - 26) / S, pel = hacer((x, y, r, g, b) => (y <= 640 ? 1 : lum(r, g, b) < 105 ? 1 : 0) * (y <= CORTE - 60 ? 1 : y >= CORTE ? 0 : (CORTE - y) / 60)); // el pelo termina en la línea de los hombros: no asoma por el hueco del brazo
  guardar(cab, 'cabeza'); guardar(pel, 'pelo');
  return { cw, ch, pivoteY: NECK_Y * S / ch, chinY: CHIN_Y * S, neckY: NECK_Y * S, cara: { cx: 432 * S, cy: 408 * S, w: 610 * S, h: 663 * S } }; // caja de la cara medida sobre esta foto
}
(async () => {
  fs.mkdirSync(SAL, { recursive: true });
  const c = await cuerpo(), h = await cabeza();
  fs.writeFileSync(path.join(SAL, 'rig.json'), JSON.stringify({ descripcion: 'Piezas del rig de fotos (cuerpo FICTICIO genérico + cabeza FICTICIA). Coordenadas en píxeles de estas piezas.', cuerpo: c, cabeza: h, CX, EJE_BRAZO, Y_HOMBRO, PIV_Y, Y_CODO, Y_MANO, Y_CADERA, codoFrac: (Y_CODO - Y_HOMBRO) / (Y_MANO - Y_HOMBRO + 4), largo: { sup: Y_CODO - Y_HOMBRO - PIV_Y, ant: Y_MANO - 30 - Y_CODO } }, null, 2));
  console.log('listo', SAL, JSON.stringify(h));
})().catch(e => { console.error('FALLO', e); process.exit(1); });

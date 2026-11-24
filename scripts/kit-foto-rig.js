// Corta el kit de FOTOS en piezas para el muñeco articulado (rig): cabeza (con cuello), pelo (detrás de la espalda), torso+falda, brazo, piernas.
// Entrada: assets/kit/cuerpo-bastonera.png (cuerpo sin cabeza, brazos colgando) y assets/kit/cabeza-relleno-mujer.png (cabeza FICTICIA genérica).
// Salida: assets/foto-rig/*.png, con el torso centrado en x y el brazo centrado sobre su eje, listos para lienzo/titere-rig.js (traje 'bastonera-foto').
// Uso: node scripts/kit-foto-rig.js
const fs = require('fs'), path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const KIT = path.join(__dirname, '..', 'assets', 'kit'), SAL = path.join(__dirname, '..', 'assets', 'foto-rig');
const interp = (pts, y) => { if (y <= pts[0][0]) return pts[0][1]; for (let i = 1; i < pts.length; i++) if (y <= pts[i][0]) { const [y0, v0] = pts[i - 1], [y1, v1] = pts[i]; return v0 + (v1 - v0) * (y - y0) / (y1 - y0); } return pts[pts.length - 1][1]; };
// borde interior del brazo izquierdo (el que da al torso) por fila; el derecho es el espejo respecto al eje x = CX
const CX = 221, BORDE = [[40, 160], [88, 140], [150, 139], [220, 136], [290, 128], [320, 116], [398, 112], [402, 82], [470, 82]], Y_PIV = 66, R_HOMBRO = 38, Y_HOMBRO = Y_PIV - R_HOMBRO, PIV_Y = R_HOMBRO, Y_CORE = 96, Y_CODO = 280, Y_MUN = 395, Y_MANO = 470, Y_CADERA = 458;
const EJE_BRAZO = 108; // x del eje del brazo (centro de la manga) en la foto

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
  for (let y = 0; y < Y_CADERA + 4; y++) for (let x = 0; x < W; x++) { if (y >= Y_CORE && (dentroBrazoI(x, y) || dentroBrazoD(x, y))) continue; const i = (y * W + x) * 4, o = i; cid.data[o] = d[i]; cid.data[o + 1] = d[i + 1]; cid.data[o + 2] = d[i + 2]; cid.data[o + 3] = d[i + 3]; }
  cx.putImageData(cid, 0, 0); guardar(core, 'torso');
  // brazo (el izquierdo de la foto), recortado y centrado en su eje; el derecho se obtiene espejando este
  const aw = 2 * (EJE_BRAZO + 6), ah = Y_MUN - Y_HOMBRO + 2, br = createCanvas(aw, ah), bx = br.getContext('2d'), bid = bx.createImageData(aw, ah);
  // color de la manga (blanco del uniforme) para el disco del hombro
  let mr = 0, mg = 0, mb = 0, mn = 0; for (let y = 110; y < 130; y++) for (let x = 70; x < 130; x++) { const i = (y * W + x) * 4; if (d[i + 3] > 250 && d[i] > 190 && Math.abs(d[i] - d[i + 2]) < 16) { mr += d[i]; mg += d[i + 1]; mb += d[i + 2]; mn++; } }
  const colM = mn ? `rgb(${Math.round(mr / mn)},${Math.round(mg / mn)},${Math.round(mb / mn)})` : '#e8e8e8';
  for (let y = Y_PIV; y < Y_HOMBRO + ah && y <= Y_MUN; y++) for (let x = 0; x < EJE_BRAZO + 80; x++) { if (!dentroBrazoI(x, y)) continue; const ox = x - EJE_BRAZO + aw / 2, oy = y - Y_HOMBRO; if (ox < 0 || ox >= aw) continue; const i = (y * W + x) * 4, o = (oy * aw + ox) * 4; bid.data[o] = d[i]; bid.data[o + 1] = d[i + 1]; bid.data[o + 2] = d[i + 2]; bid.data[o + 3] = d[i + 3]; }
  bx.fillStyle = colM; bx.beginPath(); bx.arc(aw / 2 + 4, R_HOMBRO, 24, 0, Math.PI * 2); bx.fill();
  const tmp = createCanvas(aw, ah); tmp.getContext('2d').putImageData(bid, 0, 0); bx.drawImage(tmp, 0, 0);
  guardar(br, 'brazo-abierto'); guardar(br, 'brazo-puno');
  // hombros del torso (a la izquierda y derecha del cuello), se dibujan ENCIMA del brazo: ahí está la unión; el borde inferior se desvanece
  { const hh = Y_CORE + 16, hc = createCanvas(W, hh), hx = hc.getContext('2d'), hid = hx.createImageData(W, hh);
    for (let y = 0; y < hh; y++) for (let x = 0; x < W; x++) { if (Math.abs(x - CX) < 64) continue; const i = (y * W + x) * 4, f = y < Y_CORE ? 1 : (hh - y) / 16; hid.data[i] = d[i]; hid.data[i + 1] = d[i + 1]; hid.data[i + 2] = d[i + 2]; hid.data[i + 3] = Math.round(d[i + 3] * f); }
    hx.putImageData(hid, 0, 0); guardar(hc, 'hombros'); }
  // piernas: desde justo bajo el dobladillo hasta las botas; en las filas de las manos solo la zona central
  const lg = createCanvas(W, H - Y_CADERA), lx = lg.getContext('2d'), lid = lx.createImageData(W, H - Y_CADERA);
  for (let y = Y_CADERA; y < H; y++) for (let x = 0; x < W; x++) { if (y < Y_MANO && (x < 100 || x > 342)) continue; const i = (y * W + x) * 4, o = ((y - Y_CADERA) * W + x) * 4; lid.data[o] = d[i]; lid.data[o + 1] = d[i + 1]; lid.data[o + 2] = d[i + 2]; lid.data[o + 3] = d[i + 3]; }
  lx.putImageData(lid, 0, 0); guardar(lg, 'piernas');
  return { W, H };
}

// ── cabeza y pelo, a partir de la foto: se quita el fondo gris por inundación desde el borde con un modelo de fondo suave ──
// Bocas FOTOGRÁFICAS (visemas): cada una es la zona de la boca de la misma cara con otra posición de labios (scripts/bocas-generar.js → assets/kit/bocas/<visema>.png).
// Se iguala el color a la cara base, se pega con borde suave y se limita a la silueta de la cabeza. El rig las cambia según lo que se dice.
const BOCA = { BX: 210, BY: 470, BW: 450, BH: 360 }, VISEMAS = ['Aa', 'Ee', 'Oh', 'Woo', 'M', 'F', 'D', 'S', 'Uh', 'R'];
async function bocas() {
  const S = 0.32, { BX, BY, BW, BH } = BOCA, base = await loadImage(fs.readFileSync(path.join(KIT, 'cabeza-relleno-mujer.png'))), cab = await loadImage(path.join(SAL, 'cabeza.png'));
  const bb = createCanvas(BW, BH), bbx = bb.getContext('2d'); bbx.drawImage(base, BX, BY, BW, BH, 0, 0, BW, BH); const bd = bbx.getImageData(0, 0, BW, BH).data, cx0 = 432 - BX, cy0 = 655 - BY, RX = 150, RY = 115, pw = Math.round(BW * S), ph = Math.round(BH * S);
  const salida = {};
  for (const v of VISEMAS) {
    const img = await loadImage(fs.readFileSync(path.join(KIT, 'bocas', v + '.png'))), c = createCanvas(BW, BH), x = c.getContext('2d'); x.drawImage(img, 0, 0); const id = x.getImageData(0, 0, BW, BH), d = id.data;
    // ganancia de color por canal en un anillo exterior (piel alrededor de la boca): iguala la luz y el tono de la imagen generada a los de la cara base
    let sg = [0, 0, 0], sb = [0, 0, 0], n = 0; for (let y = 0; y < BH; y++) for (let xx = 0; xx < BW; xx++) { const r = Math.hypot((xx - cx0) / RX, (y - cy0) / RY); if (r > 0.95 && r < 1.2) { const i = (y * BW + xx) * 4; for (let k = 0; k < 3; k++) { sg[k] += d[i + k]; sb[k] += bd[i + k]; } n++; } }
    const gan = sg.map((v, k) => (sg[k] ? sb[k] / sg[k] : 1));
    for (let y = 0; y < BH; y++) for (let xx = 0; xx < BW; xx++) { const i = (y * BW + xx) * 4, r = Math.hypot((xx - cx0) / RX, (y - cy0) / RY), a = Math.max(0, Math.min(1, (1 - r) / 0.35)); for (let k = 0; k < 3; k++) d[i + k] = Math.min(255, d[i + k] * gan[k]); d[i + 3] = Math.round(255 * a * a * (3 - 2 * a)); }
    x.putImageData(id, 0, 0);
    const pc = createCanvas(pw, ph), px = pc.getContext('2d'); px.imageSmoothingQuality = 'high'; px.drawImage(c, 0, 0, pw, ph); px.globalCompositeOperation = 'destination-in'; px.drawImage(cab, Math.round(BX * S), Math.round(BY * S), pw, ph, 0, 0, pw, ph);
    fs.writeFileSync(path.join(SAL, 'boca-' + v + '.png'), pc.toBuffer('image/png')); salida[v] = true;
  }
  return { x: Math.round(BX * S), y: Math.round(BY * S), w: pw, h: ph, lista: VISEMAS };
}
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
let MUNECA = null, MANOS = {};
// Manos como piezas aparte, de PIEL: fotos generadas con scripts/manos-generar.js (elegidas a ojo, en assets/kit/manos/), con la muñeca arriba y los dedos abajo.
// Se quita el fondo verde, se corta el antebrazo sobrante a la altura de la muñeca (corte recto: queda escondido bajo el puño del uniforme) y se escala para que
// la muñeca mida lo mismo que la manga del brazo.
const { quitarFondo } = require('../lienzo/recorte');
const MANOS_FOTO = { // corte = fracción de la altura (de la foto ya sin fondo) donde se corta el antebrazo, desde arriba
  relajada: { corte: 0.34, muneca: 40 }, abierta: { corte: 0.33, muneca: 40 }, puno: { corte: 0.38, muneca: 40 }, senalar: { corte: 0.30, muneca: 40 },
};
async function manos(arm) {
  for (const [nombre, o] of Object.entries(MANOS_FOTO)) {
    const c0 = await quitarFondo(path.join(KIT, 'manos', nombre + '.png'), { tol: 40, suave: 30, margen: 2, matiz: 28, sat: 0.18 }), W = c0.width, H = c0.height, y0 = Math.round(H * o.corte);
    const d0 = c0.getContext('2d').getImageData(0, y0, W, 4).data; let m0 = W, m1 = 0;
    for (let y = 0; y < 4; y++) for (let x = 0; x < W; x++) if (d0[(y * W + x) * 4 + 3] > 40) { if (x < m0) m0 = x; if (x > m1) m1 = x; }
    const k = o.muneca / Math.max(8, m1 - m0), cx0 = (m0 + m1) / 2, ax = cx0 * k, w = W * k, h = (H - y0) * k, W2 = Math.ceil(2 * Math.max(ax, w - ax)), c = createCanvas(W2, Math.ceil(h)), cx = c.getContext('2d');
    cx.imageSmoothingQuality = 'high'; cx.drawImage(c0, 0, y0, W, H - y0, W2 / 2 - ax, 0, w, h); guardar(c, 'mano-' + nombre); MANOS[nombre] = { w: W2, h: Math.ceil(h), ax: W2 / 2 };
    console.log('mano', nombre, W2 + 'x' + Math.ceil(h));
  }
  // centro de la manga en la muñeca (en el lienzo del brazo)
  const bcv = await loadImage(path.join(SAL, 'brazo-abierto.png')), t = createCanvas(bcv.width, bcv.height), tx = t.getContext('2d'); tx.drawImage(bcv, 0, 0); const row = bcv.height - 6, bd = tx.getImageData(0, row, bcv.width, 1).data; let a0 = 1e9, a1 = -1; for (let x = 0; x < bcv.width; x++) if (bd[x * 4 + 3] > 200) { if (x < a0) a0 = x; if (x > a1) a1 = x; }
  MUNECA = { x: (a0 + a1) / 2, y: bcv.height - 2, ancho: a1 - a0 };
}
(async () => {
  fs.mkdirSync(SAL, { recursive: true });
  const c = await cuerpo(), h = await cabeza(); await manos(); const bc = await bocas();
  fs.writeFileSync(path.join(SAL, 'rig.json'), JSON.stringify({ descripcion: 'Piezas del rig de fotos (cuerpo FICTICIO genérico + cabeza FICTICIA). Coordenadas en píxeles de estas piezas.', cuerpo: c, cabeza: h, CX, EJE_BRAZO, Y_HOMBRO, PIV_Y, Y_CODO, Y_MANO, Y_CADERA, bocas: bc, codoFrac: (Y_CODO - Y_HOMBRO) / (Y_MUN - Y_HOMBRO + 2), largo: { sup: Y_CODO - Y_PIV, ant: Y_MUN + 50 - Y_CODO }, muneca: MUNECA, manos: MANOS }, null, 2));
  console.log('listo', SAL, JSON.stringify(h));
})().catch(e => { console.error('FALLO', e); process.exit(1); });

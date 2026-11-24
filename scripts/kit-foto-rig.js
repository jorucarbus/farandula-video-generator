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
// Manos como piezas aparte, de PIEL, sacadas de las mismas fotos del kit (mismo tono que el cuerpo): se aísla la piel (sin el puño rojo ni la manga), se tapan los
// huecos que dejó el recorte, se gira para que la muñeca quede ARRIBA y los dedos abajo, y se escala a un tamaño común. La muñeca se esconde bajo el puño al armar el rig.
const esPiel = (r, g, b, a) => { if (a < 128) return false; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = (mx - mn) / (mx || 1); return r > 150 && g > 100 && b > 70 && r >= g && g >= b * 0.95 && r - b > 18 && sat > 0.1 && sat < 0.5; };
// fuente: { archivo, región, punto de la muñeca (en la foto), ángulo (grados: gira la mano para que apunte hacia abajo), recorte de antebrazo (px), alto final }
async function mano({ arch, reg, wr, ang, saltar = 0, alto = 100 }) {
  const img = await loadImage(fs.readFileSync(arch)), { id } = pixeles(img), d = id.data, W = img.width, H = img.height, { x0, y0, x1, y1 } = reg;
  const dentro = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const sk = new Uint8Array(W * H), re = new Uint8Array(W * H);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = (y * W + x) * 4; if (esPiel(d[i], d[i + 1], d[i + 2], d[i + 3])) sk[y * W + x] = 1; }
  // cierre morfológico: localiza los huecos del recorte dentro de la mano para rellenarlos con el tono de la piel de alrededor
  const dil = (a, rad) => { const o = new Uint8Array(W * H); for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { let v = 0; for (let j = -rad; j <= rad && !v; j++) for (let i2 = -rad; i2 <= rad; i2++) { if (dentro(x + i2, y + j) && a[(y + j) * W + x + i2]) { v = 1; break; } } o[y * W + x] = v; } return o; };
  const ero = (a, rad) => { const o = new Uint8Array(W * H); for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { let v = 1; for (let j = -rad; j <= rad && v; j++) for (let i2 = -rad; i2 <= rad; i2++) { if (!dentro(x + i2, y + j) || !a[(y + j) * W + x + i2]) { v = 0; break; } } o[y * W + x] = v; } return o; };
  const cerrado = ero(dil(sk, 5), 5), col = new Float32Array(W * H * 3);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (sk[y * W + x]) { const i = (y * W + x) * 4, o = (y * W + x) * 3; col[o] = d[i]; col[o + 1] = d[i + 1]; col[o + 2] = d[i + 2]; re[y * W + x] = 1; }
  for (let pasada = 0; pasada < 4; pasada++) {
    const nuevo = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (cerrado[y * W + x] && !re[y * W + x]) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let j = -3; j <= 3; j++) for (let i2 = -3; i2 <= 3; i2++) if (dentro(x + i2, y + j) && re[(y + j) * W + x + i2]) { const o = ((y + j) * W + x + i2) * 3; r += col[o]; g += col[o + 1]; b += col[o + 2]; n++; }
      if (n) nuevo.push([x, y, r / n, g / n, b / n]);
    }
    for (const [x, y, r, g, b] of nuevo) { re[y * W + x] = 1; const o = (y * W + x) * 3; col[o] = r; col[o + 1] = g; col[o + 2] = b; }
  }
  const t = createCanvas(W, H), tx = t.getContext('2d'), td = tx.createImageData(W, H);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (re[y * W + x]) { const i = (y * W + x) * 4, o = (y * W + x) * 3; td.data[i] = col[o]; td.data[i + 1] = col[o + 1]; td.data[i + 2] = col[o + 2]; td.data[i + 3] = 255; }
  tx.putImageData(td, 0, 0);
  const G = 420, r = createCanvas(G, G), rx = r.getContext('2d'); rx.translate(G / 2, -saltar); rx.rotate(ang * Math.PI / 180); rx.translate(-wr.x, -wr.y); rx.drawImage(t, 0, 0);
  const dd = rx.getImageData(0, 0, G, G).data; let a0 = G, a1 = 0, b0 = G, b1 = 0;
  for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) if (dd[(y * G + x) * 4 + 3] > 40) { if (x < a0) a0 = x; if (x > a1) a1 = x; if (y < b0) b0 = y; if (y > b1) b1 = y; }
  const k = alto / (b1 - b0 + 1); let m0 = G, m1 = 0;
  for (let y = b0; y < b0 + 3; y++) for (let x = a0; x <= a1; x++) if (dd[(y * G + x) * 4 + 3] > 40) { if (x < m0) m0 = x; if (x > m1) m1 = x; }
  const ax = ((m0 + m1) / 2 - a0) * k, w = (a1 - a0 + 1) * k, h = (b1 - b0 + 1) * k, W2 = Math.ceil(2 * Math.max(ax, w - ax)), c = createCanvas(W2, Math.ceil(h)), cx = c.getContext('2d');
  cx.drawImage(r, a0, b0, a1 - a0 + 1, b1 - b0 + 1, W2 / 2 - ax, 0, w, h);
  return { c, w: W2, h: Math.ceil(h), muneca: (m1 - m0) * k };
}
async function manos(arm) {
  const kit = n => path.join(KIT, n + '.png');
  const fuentes = {
    relajada: { arch: kit('cuerpo-bastonera'), reg: { x0: 0, y0: 394, x1: 98, y1: 478 }, wr: { x: 70, y: 397 }, ang: -47, alto: 96 },                       // mano en reposo (la del cuerpo base)
    abierto: { arch: kit('cuerpo-bastonera-celebrar'), reg: { x0: 0, y0: 0, x1: 118, y1: 90 }, wr: { x: 100, y: 82 }, ang: -130, saltar: 28, alto: 104 },  // mano abierta, dedos separados
    senalar: { arch: kit('cuerpo-bastonera-senalar'), reg: { x0: 0, y0: 38, x1: 119, y1: 100 }, wr: { x: 117, y: 60 }, ang: -84, saltar: 0, alto: 112 },    // mano señalando
  };
  for (const [nombre, f] of Object.entries(fuentes)) { const a = await mano(f); guardar(a.c, 'mano-' + nombre); MANOS[nombre] = { w: a.w, h: a.h, ax: a.w / 2 }; console.log('mano', nombre, a.w + 'x' + a.h, 'muneca', a.muneca.toFixed(0)); }
  // puño: foto del kit (data-motor/kit/png/mano-puno.png), antebrazo hacia abajo; se gira 180° (muñeca arriba) y se iguala el tono al de las otras manos
  {
    const img = await loadImage(fs.readFileSync(path.join(__dirname, '..', 'data-motor', 'kit', 'png', 'mano-puno.png'))), W = img.width, H = Math.round(img.height * 0.62), t = createCanvas(W, H), tx = t.getContext('2d');
    tx.translate(W / 2, H / 2); tx.rotate(Math.PI); tx.drawImage(img, 0, 0, W, H, -W / 2, -H / 2, W, H); // se descarta el borde roto de abajo; el antebrazo queda arriba
    const k = 100 / H, w = W * k, h = H * k, W2 = Math.ceil(w), c = createCanvas(W2, Math.ceil(h)), cx = c.getContext('2d'); cx.drawImage(t, 0, 0, W, H, 0, 0, w, h);
    const ref = await loadImage(path.join(SAL, 'mano-senalar.png')), rc = createCanvas(ref.width, ref.height), rcx = rc.getContext('2d'); rcx.drawImage(ref, 0, 0);
    const rd = rcx.getImageData(0, 0, ref.width, ref.height).data, md = { r: 0, g: 0, b: 0, n: 0 }, pd = cx.getImageData(0, 0, W2, Math.ceil(h)), pp = pd.data, mp = { r: 0, g: 0, b: 0, n: 0 };
    for (let i = 0; i < rd.length; i += 4) if (rd[i + 3] > 200) { md.r += rd[i]; md.g += rd[i + 1]; md.b += rd[i + 2]; md.n++; }
    for (let i = 0; i < pp.length; i += 4) if (pp[i + 3] > 200) { mp.r += pp[i]; mp.g += pp[i + 1]; mp.b += pp[i + 2]; mp.n++; }
    const gr = (md.r / md.n) / (mp.r / mp.n), gg = (md.g / md.n) / (mp.g / mp.n), gb = (md.b / md.n) / (mp.b / mp.n);
    for (let i = 0; i < pp.length; i += 4) { pp[i] = Math.min(255, pp[i] * gr); pp[i + 1] = Math.min(255, pp[i + 1] * gg); pp[i + 2] = Math.min(255, pp[i + 2] * gb); }
    cx.putImageData(pd, 0, 0); guardar(c, 'mano-puno'); MANOS.puno = { w: W2, h: Math.ceil(h), ax: W2 / 2 };
  }
  // centro de la manga en la muñeca (en el lienzo del brazo)
  const bcv = await loadImage(path.join(SAL, 'brazo-abierto.png')), t = createCanvas(bcv.width, bcv.height), tx = t.getContext('2d'); tx.drawImage(bcv, 0, 0); const row = bcv.height - 6, bd = tx.getImageData(0, row, bcv.width, 1).data; let a0 = 1e9, a1 = -1; for (let x = 0; x < bcv.width; x++) if (bd[x * 4 + 3] > 200) { if (x < a0) a0 = x; if (x > a1) a1 = x; }
  MUNECA = { x: (a0 + a1) / 2, y: bcv.height - 2, ancho: a1 - a0 };
}
(async () => {
  fs.mkdirSync(SAL, { recursive: true });
  const c = await cuerpo(), h = await cabeza(); await manos();
  fs.writeFileSync(path.join(SAL, 'rig.json'), JSON.stringify({ descripcion: 'Piezas del rig de fotos (cuerpo FICTICIO genérico + cabeza FICTICIA). Coordenadas en píxeles de estas piezas.', cuerpo: c, cabeza: h, CX, EJE_BRAZO, Y_HOMBRO, PIV_Y, Y_CODO, Y_MANO, Y_CADERA, codoFrac: (Y_CODO - Y_HOMBRO) / (Y_MUN - Y_HOMBRO + 2), largo: { sup: Y_CODO - Y_PIV, ant: Y_MUN + 50 - Y_CODO }, muneca: MUNECA, manos: MANOS }, null, 2));
  console.log('listo', SAL, JSON.stringify(h));
})().catch(e => { console.error('FALLO', e); process.exit(1); });

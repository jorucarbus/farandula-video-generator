// Recorta las hojas (rejillas) que devolvió Gemini en celdas, registra cada celda contra la cabeza base (escala + desplazamiento, por correlación sobre cejas-ojos-nariz) y la deja
// como imagen de la cabeza completa, ALINEADA con la cabeza base, en data-motor/kit/personas/<persona>3d/{bocas,emociones}-crudo/<nombre>-1.png: el mismo formato que usan
// scripts/bocas-elegir.js y scripts/kit-foto-rig.js (que recortan la boca / la cara, igualan el color y la pegan con borde suave).
// Uso: node scripts/hojas-recortar.js --persona leidy
const fs = require('fs'), path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const PERSONA = arg('--persona', 'leidy'), RAIZ = path.join(__dirname, '..'), HOJAS = path.join(RAIZ, 'data-motor', 'kit', 'personas', PERSONA, 'hojas-3d'), SAL = path.join(RAIZ, 'data-motor', 'kit', 'personas', PERSONA + '3d');
const BASE = path.join(RAIZ, 'assets', 'kit', 'personas', PERSONA, 'cabeza.png'), REGION = { x0: 250, y0: 330, x1: 600, y1: 560 }; // cejas-ojos-nariz de la cabeza base (px de 864x1184)
const GRILLAS = [ // archivo, columnas, filas, nombres por celda (lectura), carpeta de destino
  { f: process.argv.includes('--visa') ? process.argv[process.argv.indexOf('--visa') + 1] : 'visa-5.png', c: 3, r: 2, n: ['Neutral', 'Aa', 'Ee', 'Oh', 'Woo', 'M'], d: 'bocas-crudo' },
  { f: 'visb-6.png', c: 3, r: 2, n: ['F', 'D', 'S', 'Uh', 'R', 'feliz-boca'], d: 'bocas-crudo' },
  { f: 'sup-2.png', c: 3, r: 3, n: ['feliz', 'sorpresa', 'triste', 'enojo', 'duda', 'orgullo', 'asco', 'preocupacion', 'amor'], d: 'emociones-crudo' },
];
const UNICA = process.argv.includes('--unica'), EMO9 = ['feliz', 'sorpresa', 'triste', 'enojo', 'duda', 'orgullo', 'asco', 'preocupacion', 'amor'], VIS11 = ['Neutral', 'Aa', 'Ee', 'Oh', 'Woo', 'M', 'F', 'D', 'S', 'Uh', 'R'];
const GR = UNICA ? [{ f: process.argv[process.argv.indexOf('--unica') + 1] || 'unica-7.png', c: 5, r: 4, n: [...EMO9, ...VIS11], d: 'x' }] : GRILLAS;
const gris = (img, ancho, alto) => { const c = createCanvas(ancho, alto), x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, ancho, alto); const d = x.getImageData(0, 0, ancho, alto).data, g = new Float32Array(ancho * alto); for (let i = 0; i < ancho * alto; i++) g[i] = d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11; return g; };
// separadores blancos entre celdas: columnas/filas casi todo blanco
function rangos(gray, w, h, eje) {
  const n = eje === 'x' ? w : h, m = eje === 'x' ? h : w, blanco = new Uint8Array(n);
  for (let i = 0; i < n; i++) { let b = 0; for (let j = 0; j < m; j++) { const v = eje === 'x' ? gray[j * w + i] : gray[i * w + j]; if (v > 238) b++; } blanco[i] = b / m > 0.92 ? 1 : 0; }
  const out = []; let a = null; for (let i = 0; i <= n; i++) { const g = i < n && !blanco[i]; if (g && a === null) a = i; if (!g && a !== null) { if (i - a > n * 0.05) out.push([a, i]); a = null; } } return out;
}
function ncc(G, gw, T, tw, th, ox, oy) { let sg = 0, st = 0, sgg = 0, stt = 0, sgt = 0, n = tw * th; for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) { const g = G[(oy + y) * gw + ox + x], t = T[y * tw + x]; sg += g; st += t; sgg += g * g; stt += t * t; sgt += g * t; } const cg = sgg - sg * sg / n, ct = stt - st * st / n; return cg > 1e-6 && ct > 1e-6 ? (sgt - sg * st / n) / Math.sqrt(cg * ct) : -1; }
(async () => {
  const base = await loadImage(fs.readFileSync(BASE)), BW = base.width, BH = base.height; fs.mkdirSync(path.join(SAL, 'bocas-crudo'), { recursive: true }); fs.mkdirSync(path.join(SAL, 'emociones-crudo'), { recursive: true });
  for (const gr of GR) {
    const ruta = path.join(HOJAS, gr.f); if (!fs.existsSync(ruta)) { console.log('falta', gr.f); continue; }
    const hoja = await loadImage(fs.readFileSync(ruta)), W = hoja.width, H = hoja.height, G = gris(hoja, W, H), xs = rangos(G, W, H, 'x'), ys = rangos(G, W, H, 'y');
    if (xs.length !== gr.c || ys.length !== gr.r) console.log(gr.f, 'AVISO: celdas detectadas', xs.length + 'x' + ys.length, 'esperadas', gr.c + 'x' + gr.r);
    let k = 0;
    for (const [y0, y1] of ys.slice(0, gr.r)) for (const [x0, x1] of xs.slice(0, gr.c)) {
      const nombre = gr.n[k++]; if (!nombre) continue; const cw = x1 - x0, ch = y1 - y0, cc = createCanvas(cw, ch); cc.getContext('2d').drawImage(hoja, x0, y0, cw, ch, 0, 0, cw, ch);
      // registro: escala s (px de celda por px de base) y posición; en media resolución para ir rápido
      const f = UNICA ? 4 : 2, cg = gris(cc, Math.round(cw / f), Math.round(ch / f)), cgw = Math.round(cw / f), cgh = Math.round(ch / f); let mejor = { v: -2 };
      for (let s = UNICA ? 0.6 : 0.26; s <= (UNICA ? 1.4 : 0.66); s += UNICA ? 0.04 : 0.02) {
        const tw = Math.round((REGION.x1 - REGION.x0) * s / f), th = Math.round((REGION.y1 - REGION.y0) * s / f); if (tw < 12 || th < 12 || tw >= cgw || th >= cgh) continue;
        const tc = createCanvas(tw, th), tx = tc.getContext('2d'); tx.imageSmoothingQuality = 'high'; tx.drawImage(base, REGION.x0, REGION.y0, REGION.x1 - REGION.x0, REGION.y1 - REGION.y0, 0, 0, tw, th);
        const td = tx.getImageData(0, 0, tw, th).data, T = new Float32Array(tw * th); for (let i = 0; i < tw * th; i++) T[i] = td[i * 4] * 0.3 + td[i * 4 + 1] * 0.59 + td[i * 4 + 2] * 0.11;
        const paso = UNICA ? 2 : 1; for (let oy = 0; oy + th <= cgh; oy += paso) for (let ox = 0; ox + tw <= cgw; ox += paso) { const v = ncc(cg, cgw, T, tw, th, ox, oy); if (v > mejor.v) mejor = { v, s, ox: ox * f, oy: oy * f }; }
      }
      // pega la celda en el marco de la cabeza base (base debajo, celda encima en su posición registrada)
      const s = mejor.s, o = createCanvas(BW, BH), ox = o.getContext('2d'); ox.drawImage(base, 0, 0);
      const dx = REGION.x0 - mejor.ox / s, dy = REGION.y0 - mejor.oy / s; ox.imageSmoothingQuality = 'high'; ox.drawImage(cc, dx, dy, cw / s, ch / s);
      const dir = gr.d === 'x' ? (EMO9.includes(nombre) ? 'emociones-crudo' : 'bocas-crudo') : gr.d, destino = path.join(SAL, dir, nombre + '-1.png'); fs.writeFileSync(destino, o.toBuffer('image/png')); if (UNICA && nombre === 'feliz') fs.writeFileSync(path.join(SAL, 'bocas-crudo', 'feliz-boca-1.png'), o.toBuffer('image/png')); console.log(gr.f, nombre, 'escala', s.toFixed(2), 'ncc', mejor.v.toFixed(2));
    }
  }
})();

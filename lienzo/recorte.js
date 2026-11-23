// Recorte de fondo liso (para el kit de piezas fotográficas): estima el color del fondo en el borde, marca como fondo
// lo parecido que está CONECTADO al borde (relleno por inundación: no borra magenta "dentro" de la ropa), y en el
// contorno reconstruye el color real del objeto (C = a·F + (1-a)·B → F), así no queda halo rosa. Recorta al contenido.
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const fs = require('fs');

const mediana = v => { v.sort((a, b) => a - b); return v[v.length >> 1]; };

// entrada: Buffer | ruta. → canvas recortado con alfa. opciones: tol (distancia RGB al fondo), suave (rampa del borde), margen (px).
async function quitarFondo(entrada, { tol = 32, suave = 30, margen = 3, matiz = 18, sat = 0.2 } = {}) {
  const img = await loadImage(Buffer.isBuffer(entrada) ? entrada : fs.readFileSync(entrada));
  const w = img.width, h = img.height, c = createCanvas(w, h), ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, w, h), d = id.data;
  // color del fondo: mediana de un anillo de 4 px en el borde
  const R = [], G = [], Bv = [];
  const muestra = (x, y) => { const i = (y * w + x) * 4; R.push(d[i]); G.push(d[i + 1]); Bv.push(d[i + 2]); };
  for (let k = 0; k < 4; k++) for (let x = 0; x < w; x += 3) { muestra(x, k); muestra(x, h - 1 - k); }
  for (let k = 0; k < 4; k++) for (let y = 0; y < h; y += 3) { muestra(k, y); muestra(w - 1 - k, y); }
  const br = mediana(R), bg = mediana(G), bb = mediana(Bv);
  const dist = i => Math.hypot(d[i] - br, d[i + 1] - bg, d[i + 2] - bb);
  // Tono del fondo (hue en grados): los fondos de estudio traen degradado y sombra, así que "parecido" = mismo tono y buena
  // saturación (aunque más oscuro), además de estar cerca del color mediano. Las prendas rosa pálido (poca saturación) se conservan.
  const hsv = (r, g, b) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), dl = mx - Math.min(r, g, b); let h = 0;
    if (dl) { h = mx === r ? ((g - b) / dl) % 6 : mx === g ? (b - r) / dl + 2 : (r - g) / dl + 4; h *= 60; if (h < 0) h += 360; } return [h, mx ? dl / mx : 0, mx]; };
  const [tono] = hsv(br, bg, bb);
  const parecido = p => {
    const i = p * 4; if (dist(i) < tol) return true;
    const [hh, ss, vv] = hsv(d[i], d[i + 1], d[i + 2]), dh = Math.min(Math.abs(hh - tono), 360 - Math.abs(hh - tono));
    return dh < matiz && ss > sat && vv > 0.15;
  };
  // inundación desde el borde sobre píxeles parecidos al fondo
  const fondo = new Uint8Array(w * h), cola = new Int32Array(w * h); let ini = 0, fin = 0;
  const semilla = (x, y) => { const p = y * w + x; if (!fondo[p] && parecido(p)) { fondo[p] = 1; cola[fin++] = p; } };
  for (let x = 0; x < w; x++) { semilla(x, 0); semilla(x, h - 1); }
  for (let y = 0; y < h; y++) { semilla(0, y); semilla(w - 1, y); }
  while (ini < fin) {
    const p = cola[ini++], x = p % w, y = (p / w) | 0;
    if (x > 0) semilla(x - 1, y); if (x < w - 1) semilla(x + 1, y); if (y > 0) semilla(x, y - 1); if (y < h - 1) semilla(x, y + 1);
  }
  // Islotes: manchas sueltas (esquinas del degradado, motas) que no son el objeto → también son fondo. Se conservan los trozos
  // con al menos 0.3 % del área del cuadro (manos, botas u otras partes separadas del objeto).
  { const visto = new Uint8Array(w * h), minimo = Math.max(30, Math.round(w * h * 0.003)), pila = new Int32Array(w * h);
    for (let p0 = 0; p0 < w * h; p0++) {
      if (fondo[p0] || visto[p0]) continue;
      let n = 0, sp = 0; pila[sp++] = p0; visto[p0] = 1; const miembros = [];
      while (sp) { const p = pila[--sp], x = p % w, y = (p / w) | 0; miembros.push(p); n++;
        for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) if (q >= 0 && !fondo[q] && !visto[q]) { visto[q] = 1; pila[sp++] = q; } }
      if (n < minimo) for (const p of miembros) fondo[p] = 1;
    } }
  // alfa: fondo = 0; contorno = rampa según la distancia; interior = 255. Y se reconstruye el color del objeto en el contorno.
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x, i = p * 4;
    if (fondo[p]) { d[i + 3] = 0; continue; }
    const vecinoFondo = (x > 0 && fondo[p - 1]) || (x < w - 1 && fondo[p + 1]) || (y > 0 && fondo[p - w]) || (y < h - 1 && fondo[p + w])
      || (x > 1 && fondo[p - 2]) || (x < w - 2 && fondo[p + 2]) || (y > 1 && fondo[p - 2 * w]) || (y < h - 2 && fondo[p + 2 * w]);
    if (vecinoFondo) {
      const a = Math.max(0.15, Math.min(1, (dist(i) - tol * 0.5) / (tol * 0.5 + suave)));
      d[i] = Math.max(0, Math.min(255, (d[i] - (1 - a) * br) / a)); d[i + 1] = Math.max(0, Math.min(255, (d[i + 1] - (1 - a) * bg) / a)); d[i + 2] = Math.max(0, Math.min(255, (d[i + 2] - (1 - a) * bb) / a));
      if (tono > 70 && tono < 170) d[i + 1] = Math.min(d[i + 1], Math.max(d[i], d[i + 2])); // despill: sin reflejo verde del croma en el contorno
      const verde = d[i + 1] - Math.max(d[i], d[i + 2]);
      d[i + 3] = Math.round(255 * a * a * (tono > 70 && tono < 170 && verde > 6 ? 0.2 : 1)); // el borde cae más rápido; lo aún verdoso casi desaparece
    } else d[i + 3] = 255;
    if (d[i + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  ctx.putImageData(id, 0, 0);
  if (x1 <= x0 || y1 <= y0) throw new Error('el recorte no dejó nada: ¿el fondo no es liso?');
  const cx = Math.max(0, x0 - margen), cy = Math.max(0, y0 - margen), cw = Math.min(w, x1 + margen + 1) - cx, ch = Math.min(h, y1 + margen + 1) - cy;
  const out = createCanvas(cw, ch); out.getContext('2d').drawImage(c, cx, cy, cw, ch, 0, 0, cw, ch);
  return out;
}

module.exports = { quitarFondo };

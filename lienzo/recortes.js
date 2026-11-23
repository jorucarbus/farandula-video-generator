// Muñeco de RECORTES FOTOGRÁFICOS (estilo "paper doll" de los Shorts de Cazadores de Mitos y de ElMattayon): cabeza de
// foto enorme sobre un cuerpo que también es foto (kit en assets/kit), animado como dibujo animado: anticipación,
// estirar y encoger, rebote con resortes en cabeza y pegatinas, entrada con caída. Expresiones DIBUJADAS (anime) sobre la
// foto: ojos, cejas, boca y marcas (gota, vena, rubor, brillos). El cuerpo cambia de pose cambiando de foto; los
// accesorios (corona) caen y quedan pegados a la cabeza. No habla por sí solo: la boca solo se mueve si se le da una voz.
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { lerp, acotar, easeOutCubic, easeOutBack } = require('../overlay/animacion');
const B = require('./base');
const { cabezaDesdeFoto } = require('./titere');

const KITS = { fotos: path.join(__dirname, '..', 'assets', 'kit'), plastilina: path.join(__dirname, '..', 'assets', 'kit-plastilina') }; // kit de piezas: fotos de trajes o figura de plastilina
const KIT = KITS.fotos;
const CUELLO_K = 0.06; // cabeza libre: la barbilla queda a esta fracción del alto de la cara por encima del borde del cuello del traje
const EMOCIONES = ['normal', 'feliz', 'sorpresa', 'enojo', 'triste'];
const ACCESORIOS = { corona: { archivo: 'corona', ancho: 0.62, dy: -0.47 } };       // fracción del ancho de la cabeza / del alto
const PEGATINAS = ['guante-pulgar', 'guante-abierto', 'guante-senalar', 'baston', 'corona'];
const cache = new Map();
const piezaKit = async (n, kit = 'fotos') => { const k = kit + '/' + n; if (!cache.has(k)) cache.set(k, loadImage(fs.readFileSync(path.join(KITS[kit], `${n}.png`)))); return cache.get(k); };
const existePieza = (n, kit = 'fotos') => /^[a-z0-9-]+$/.test(n) && Boolean(KITS[kit]) && fs.existsSync(path.join(KITS[kit], `${n}.png`));

// Resorte amortiguado (integrado en pasos pequeños: estable y determinista).
class Resorte {
  constructor(k = 140, c = 13, x = 0) { this.k = k; this.c = c; this.x = x; this.v = 0; }
  paso(objetivo, dt) { const n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n; for (let i = 0; i < n; i++) { this.v += (this.k * (objetivo - this.x) - this.c * this.v) * h; this.x += this.v * h; } return this.x; }
}

// Salto de dibujo animado en el instante tj: anticipación (se agacha), aire (se estira), aterrizaje (se aplasta).
function salto(t, tj, alto = 0.07) {
  const x = t - tj;
  if (x < -0.10 || x > 0.55) return { dy: 0, sy: 1 };
  if (x < 0) return { dy: 0, sy: 1 - 0.10 * Math.sin(Math.PI * (x + 0.10) / 0.10 / 2) };
  if (x < 0.35) { const u = x / 0.35; return { dy: alto * 4 * u * (1 - u), sy: 1 + 0.08 * Math.sin(Math.PI * u) }; }
  return { dy: 0, sy: 1 - 0.12 * Math.sin(Math.PI * (x - 0.35) / 0.2) };
}

// Caída de entrada: baja desde arriba, golpea el suelo y se aplasta.
function caida(t) { // t desde que entra
  if (t < 0) return { dy: 1.3, sy: 1 };
  if (t < 0.5) { const u = t / 0.5; return { dy: 1.3 * (1 - u * u), sy: 1 + 0.12 * u }; }
  return { dy: 0, sy: 1 - 0.16 * Math.sin(Math.PI * Math.min(1, (t - 0.5) / 0.25)) };
}

// x del cuello: centro de los píxeles opacos de la franja superior de la foto del cuerpo (la pose asimétrica no pierde el eje).
function ejeCuello(img) {
  const c = createCanvas(img.width, img.height), x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const franja = Math.max(2, Math.round(img.height * 0.12)), d = x.getImageData(0, 0, img.width, franja).data; let s = 0, n = 0;
  for (let j = 0; j < franja; j++) for (let i = 0; i < img.width; i++) if (d[(j * img.width + i) * 4 + 3] > 128) { s += i; n++; }
  return n ? s / n : img.width / 2;
}

// y del cuello: primera fila opaca en la franja central (±8 % del eje). En poses con los brazos arriba, las manos son lo más alto de la foto
// y el cuello queda más abajo: sin esto la cabeza flota sobre el torso.
function cuelloY(img, eje) {
  const c = createCanvas(img.width, img.height), x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const x0 = Math.max(0, Math.round(eje - img.width * 0.08)), ancho = Math.max(2, Math.round(img.width * 0.16)), d = x.getImageData(x0, 0, ancho, img.height).data;
  for (let j = 0; j < img.height; j++) { let n = 0; for (let i = 0; i < ancho; i++) if (d[(j * ancho + i) * 4 + 3] > 128) n++; if (n > ancho * 0.5) return j; }
  return 0;
}

// ── Expresiones dibujadas sobre la foto (origen en el centro de la cabeza; w,h = tamaño de la cabeza) ──────────────────
// Regla: cada dibujo es OPACO y MÁS GRANDE que la parte real que reemplaza (ojos ×1.55, boca ×1.45, cejas más gruesas), y
// debajo se CLONA piel de otra zona de la cara (con su textura) para que no asome nada del ojo, la ceja o los labios reales.
const TINTA = '#1b1b1b', LABIO = '#C24E5A', LABIO_OSC = '#8E2F3A', INTERIOR = '#3A0E14';

// Borra una zona (ojo, ceja, labios) rellenándola con piel interpolada: se toman muestras de color en un anillo JUSTO fuera de la
// zona y cada píxel interior es el promedio de esas muestras ponderado por cercanía (así sigue la luz y el tono de ese punto de la
// cara, sin copiar de otro sitio que puede estar fuera del óvalo). Borde difuminado. Se calcula una vez por zona y se cachea.
const _borrados = new Map();
function borrar(ctx, fuente, x, y, rx, ry, _dx, _dy, color = '#d9a37f') {
  const W = Math.max(4, Math.round(rx * 2)), Hh = Math.max(4, Math.round(ry * 2));
  const clave = fuente ? [fuente.cab.width, fuente.cab.height, Math.round(x), Math.round(y), W, Hh].join('|') : null;
  let img = clave && _borrados.get(clave);
  if (!img) {
    img = createCanvas(W, Hh); const tx = img.getContext('2d'), id = tx.createImageData(W, Hh), d = id.data;
    let muestras = [];
    if (fuente) {
      const { cab } = fuente, cx = cab.getContext('2d'); // el origen (x, y) es el centro del lienzo de la cabeza
      for (let k = 0; k < 24; k++) {
        const an = (k / 24) * Math.PI * 2, px = Math.round(x + cab.width / 2 + Math.cos(an) * rx * 1.18), py = Math.round(y + cab.height / 2 + Math.sin(an) * ry * 1.25);
        if (px < 1 || py < 1 || px >= cab.width - 1 || py >= cab.height - 1) continue;
        const p = cx.getImageData(px - 1, py - 1, 3, 3).data; let r = 0, g = 0, bl = 0, al = 0;
        for (let i = 0; i < 36; i += 4) { r += p[i]; g += p[i + 1]; bl += p[i + 2]; al += p[i + 3]; }
        if (al / 9 > 240) muestras.push({ x: Math.cos(an) * rx * 1.18, y: Math.sin(an) * ry * 1.25, c: [r / 9, g / 9, bl / 9] }); // solo píxeles dentro de la cara
      }
    }
    if (muestras.length > 4) { // se descartan pelo, cejas y pestañas: lo que se aleja del tono de piel típico del anillo
      const med = c => { const v = muestras.map(m => m.c[c]).sort((p, q) => p - q); return v[v.length >> 1]; }, mr = med(0), mg = med(1), mb = med(2);
      const luz = (mr + mg + mb) / 3, buenas = muestras.filter(m => Math.hypot(m.c[0] - mr, m.c[1] - mg, m.c[2] - mb) < 38 && (m.c[0] + m.c[1] + m.c[2]) / 3 > luz - 14); // sin sombras de pestañas/cejas
      if (buenas.length >= 3) muestras = buenas;
    }
    for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) {
      const px = i - W / 2 + 0.5, py = j - Hh / 2 + 0.5, nr = Math.hypot(px / (W / 2), py / (Hh / 2)); let r = 0, g = 0, bl = 0, wt = 0;
      if (muestras.length) for (const m of muestras) { const w = 1 / ((px - m.x) ** 2 + (py - m.y) ** 2 + 4); r += m.c[0] * w; g += m.c[1] * w; bl += m.c[2] * w; wt += w; }
      const o = (j * W + i) * 4;
      if (wt) { d[o] = r / wt; d[o + 1] = g / wt; d[o + 2] = bl / wt; } else { const n = parseInt(color.slice(1), 16); d[o] = n >> 16 & 255; d[o + 1] = n >> 8 & 255; d[o + 2] = n & 255; }
      d[o + 3] = Math.round(255 * acotar((1 - nr) / 0.32)); // borde suave
    }
    tx.putImageData(id, 0, 0); if (clave) _borrados.set(clave, img);
  }
  ctx.drawImage(img, x - rx, y - ry);
}

// ── Modo ARCILLA: con una cara en blanco (cabeza de plastilina) las expresiones se MODELAN como piezas de plastilina: relleno con luz arriba a la
// izquierda y sombra abajo, huellas (textura), sombra proyectada y borde fino, en vez de dibujo plano con contorno negro.
let ARCILLA = false, PIEL_ARC = 'rgb(214,170,140)', _tex = null;
function textura() {
  if (_tex) return _tex; const c = createCanvas(96, 96), x = c.getContext('2d'), id = x.createImageData(96, 96); let s = 12345; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 96 * 96; i++) { const v = 118 + Math.round(rnd() * 22 - 11) + ((i % 96) % 7 === 0 ? 7 : 0); id.data[i * 4] = v; id.data[i * 4 + 1] = v; id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; }
  x.putImageData(id, 0, 0); _tex = x.createPattern(c, 'repeat'); return _tex;
}
// Rellena el trazado actual (bx, by, bw, bh = su caja). Sin modo arcilla es un relleno plano.
function rell(ctx, color, bx, by, bw, bh) {
  if (!ARCILLA) { ctx.fillStyle = color; ctx.fill(); return; }
  ctx.save(); ctx.shadowColor = 'rgba(70,35,15,0.4)'; ctx.shadowBlur = Math.max(2, bh * 0.14); ctx.shadowOffsetY = Math.max(1, bh * 0.08); ctx.fillStyle = color; ctx.fill(); ctx.restore();
  ctx.save(); ctx.lineWidth = Math.max(1, bh * 0.035); ctx.strokeStyle = 'rgba(60,25,10,0.32)'; ctx.stroke(); ctx.clip();
  const g = ctx.createLinearGradient(0, by, 0, by + bh); g.addColorStop(0, 'rgba(255,255,255,0.2)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(30,10,0,0.3)'); ctx.fillStyle = g; ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
  const cx = bx + bw * 0.3, cy = by + bh * 0.26, rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(bw, bh) * 0.6); rg.addColorStop(0, 'rgba(255,255,255,0.5)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = rg; ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
  ctx.globalAlpha = 0.2; ctx.globalCompositeOperation = 'overlay'; ctx.fillStyle = textura(); ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4); ctx.restore();
}
const elip = (ctx, x, y, rx, ry) => { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); };

function ojoAbierto(ctx, x, y, r, mirar = 0, trazo = r * 0.16) { // ojo: esclera, iris grande, brillos (en arcilla: globo, iris y párpado modelados)
  if (ARCILLA) {
    const ix = x + mirar * r * 0.2, iy = y + r * 0.05;
    elip(ctx, x, y, r * 1.05, r * 1.2); rell(ctx, '#f4efe2', x - r * 1.05, y - r * 1.2, r * 2.1, r * 2.4);
    elip(ctx, ix, iy, r * 0.62, r * 0.78); rell(ctx, '#5a3a26', ix - r * 0.62, iy - r * 0.78, r * 1.24, r * 1.56);
    elip(ctx, ix, iy + r * 0.05, r * 0.3, r * 0.4); rell(ctx, '#1d120c', ix - r * 0.3, iy - r * 0.35, r * 0.6, r * 0.8);
    elip(ctx, ix - r * 0.2, iy - r * 0.28, r * 0.17, r * 0.17); rell(ctx, '#ffffff', ix - r * 0.37, iy - r * 0.45, r * 0.34, r * 0.34);
    ctx.beginPath(); ctx.ellipse(x, y - r * 0.1, r * 1.22, r * 1.34, 0, Math.PI * 1.04, Math.PI * 1.96); ctx.ellipse(x, y + r * 0.02, r * 1.1, r * 0.86, 0, Math.PI * 1.96, Math.PI * 1.04, true); ctx.closePath(); // párpado: rollito de arcilla
    rell(ctx, PIEL_ARC, x - r * 1.22, y - r * 1.44, r * 2.44, r * 0.95); return;
  }
  ctx.fillStyle = '#fff'; ctx.strokeStyle = TINTA; ctx.lineWidth = trazo; ctx.beginPath(); ctx.ellipse(x, y, r * 1.05, r * 1.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#2a1a14'; ctx.beginPath(); ctx.ellipse(x + mirar * r * 0.2, y + r * 0.05, r * 0.62, r * 0.78, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + mirar * r * 0.2 - r * 0.2, y - r * 0.28, r * 0.2, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(x + mirar * r * 0.2 + r * 0.22, y + r * 0.2, r * 0.1, 0, Math.PI * 2); ctx.fill();
}
function ojoCerradoFeliz(ctx, x, y, r, grosor) {
  if (ARCILLA) { // rollito de arcilla curvo (media luna)
    const g = Math.max(grosor, r * 0.36), o = r * 1.15 + g / 2, i = r * 1.15 - g / 2; ctx.beginPath(); ctx.arc(x, y + r * 0.45, o, Math.PI * 1.1, Math.PI * 1.9); ctx.arc(x, y + r * 0.45, i, Math.PI * 1.9, Math.PI * 1.1, true); ctx.closePath();
    rell(ctx, '#4a2c1c', x - o, y + r * 0.45 - o, o * 2, g * 1.6); return;
  }
  ctx.strokeStyle = TINTA; ctx.lineWidth = grosor; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(x, y + r * 0.45, r * 1.15, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
}
function ojoEnojado(ctx, x, y, r, lado, trazo) { // medio párpado: arriba plano e inclinado
  if (ARCILLA) {
    elip(ctx, x, y, r * 1.1, r * 0.82); rell(ctx, '#f4efe2', x - r * 1.1, y - r * 0.82, r * 2.2, r * 1.64);
    elip(ctx, x - lado * r * 0.12, y + r * 0.12, r * 0.5, r * 0.55); rell(ctx, '#5a3a26', x - lado * r * 0.12 - r * 0.5, y - r * 0.43, r, r * 1.1);
    elip(ctx, x - lado * r * 0.12, y + r * 0.15, r * 0.24, r * 0.3); rell(ctx, '#1d120c', x - lado * r * 0.12 - r * 0.24, y - r * 0.15, r * 0.48, r * 0.6);
    ctx.save(); ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(x - r * 1.3, y - r * 1.0 - lado * r * 0.3); ctx.lineTo(x + r * 1.3, y - r * 1.0 + lado * r * 0.3); ctx.lineTo(x + r * 1.3, y - r * 0.12 + lado * r * 0.3); ctx.lineTo(x - r * 1.3, y - r * 0.12 - lado * r * 0.3); ctx.closePath();
    rell(ctx, PIEL_ARC, x - r * 1.3, y - r * 1.3, r * 2.6, r * 1.2); ctx.restore(); return;
  }
  ctx.save(); ctx.beginPath(); ctx.ellipse(x, y, r * 1.1, r * 0.75, 0, 0, Math.PI * 2); ctx.clip(); ctx.fillStyle = '#fff'; ctx.fillRect(x - r * 2, y - r * 2, r * 4, r * 4);
  ctx.fillStyle = '#2a1a14'; ctx.beginPath(); ctx.ellipse(x - lado * r * 0.12, y + r * 0.05, r * 0.5, r * 0.62, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  ctx.strokeStyle = TINTA; ctx.lineWidth = trazo; ctx.beginPath(); ctx.ellipse(x, y, r * 1.1, r * 0.75, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = trazo * 1.8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - r * 1.2, y - r * 0.45 - lado * r * 0.2); ctx.lineTo(x + r * 1.2, y - r * 0.45 + lado * r * 0.2); ctx.stroke();
}
function cejaGruesa(ctx, x, y, largo, ang, grosor) { // ceja con forma (más gruesa al centro), siempre más ancha que la real
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.beginPath(); ctx.moveTo(-largo / 2, grosor * 0.1);
  ctx.quadraticCurveTo(0, -grosor * 1.5, largo / 2, grosor * 0.1); ctx.quadraticCurveTo(0, grosor * 0.55, -largo / 2, grosor * 0.1); ctx.closePath();
  rell(ctx, ARCILLA ? '#7b5632' : TINTA, -largo / 2, -grosor * 1.2, largo, grosor * 1.6); ctx.restore();
}
function estrella(ctx, x, y, r, color = '#FFE27A') { ctx.save(); ctx.translate(x, y); ctx.beginPath(); for (let i = 0; i < 8; i++) { const an = i * Math.PI / 4, rr = i % 2 ? r * 0.28 : r; ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); } ctx.closePath(); rell(ctx, color, -r, -r, r * 2, r * 2); ctx.restore(); }

// Boca de labios completa. a = semiancho. abre 0..1 (apertura), k = curvatura de las comisuras (<0 sonrisa, >0 triste),
// dientes: muestra dientes. Estados: cerrada (abre 0), pequeña/grande (abre), "O" (a chico y abre alto), sonrisa (k<0), triste (k>0).
function boca(ctx, { x, y, a, abre = 0, k = 0, dientes = false, trazo }) {
  const o = abre * a * 0.95, c = k * a, d = o * 1.9; // d = cuánto baja el labio de abajo
  const lleno = (color, bx, by, bw, bh) => { if (ARCILLA) rell(ctx, color, bx, by, bw, bh); else { ctx.fillStyle = color; ctx.fill(); ctx.stroke(); } };
  ctx.save(); ctx.translate(x, y); ctx.lineJoin = 'round'; ctx.lineWidth = trazo; ctx.strokeStyle = TINTA;
  if (o > 1) { // interior oscuro con dientes y lengua
    ctx.beginPath(); ctx.moveTo(-a * 0.96, c); ctx.quadraticCurveTo(0, c * 0.3 - a * 0.04, a * 0.96, c); ctx.quadraticCurveTo(0, c + d, -a * 0.96, c); ctx.closePath(); ctx.fillStyle = INTERIOR; ctx.fill();
    ctx.save(); ctx.clip();
    if (dientes) {
      const alto = Math.min(d * 0.55, a * 0.34); ctx.fillStyle = ARCILLA ? '#f4efe2' : '#fff'; ctx.fillRect(-a, c * 0.3 - a * 0.06, a * 2, alto + a * 0.06);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = trazo * 0.5; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * a * 0.28, c * 0.3); ctx.lineTo(i * a * 0.28, c * 0.3 + alto); ctx.stroke(); }
    }
    ctx.fillStyle = '#E56F7A'; ctx.beginPath(); ctx.ellipse(0, c + d * 0.72, a * 0.5, Math.max(1, d * 0.28), 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  ctx.strokeStyle = TINTA; ctx.lineWidth = trazo;
  // labio de arriba (con arco de cupido)
  ctx.beginPath(); ctx.moveTo(-a, c); ctx.quadraticCurveTo(-a * 0.5, -a * 0.36 + c * 0.5, 0, -a * 0.22); ctx.quadraticCurveTo(a * 0.5, -a * 0.36 + c * 0.5, a, c);
  ctx.quadraticCurveTo(0, c * 0.3 - a * 0.02, -a, c); ctx.closePath(); lleno(LABIO, -a, -a * 0.4, a * 2, a * 0.6);
  // labio de abajo (baja con la apertura)
  ctx.beginPath(); ctx.moveTo(-a, c); ctx.quadraticCurveTo(0, c * 0.3 - a * 0.02 + (o > 1 ? d : 0), a, c);
  ctx.quadraticCurveTo(a * 0.55, c + d + a * 0.46, 0, c + d + a * 0.44); ctx.quadraticCurveTo(-a * 0.55, c + d + a * 0.46, -a, c); ctx.closePath(); lleno(LABIO, -a, c, a * 2, d + a * 0.5);
  if (!ARCILLA) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(-a * 0.12, c + d + a * 0.24, a * 0.3, a * 0.06, -0.05, 0, Math.PI * 2); ctx.fill(); } // brillo (la arcilla ya trae el suyo)
  ctx.strokeStyle = LABIO_OSC; ctx.lineWidth = ARCILLA ? Math.max(1.5, trazo * 0.5) : trazo * 0.7; ctx.beginPath(); ctx.moveTo(-a * 0.9, c); ctx.quadraticCurveTo(0, c * 0.3 - a * 0.02, a * 0.9, c); ctx.stroke(); // línea de unión
  ctx.restore();
}

// Parpadeo: cada ~3.1 s los ojos se cierran 0.14 s (la fase se desfasa por muñeco con 'fase'). Solo en reposo.
const parpadea = (tAbs, fase = 0) => ((tAbs + fase) % 3.1) < 0.14;
const EMOCION_BOCA = { normal: { k: -0.04, dientes: false, base: 0 }, feliz: { k: -0.28, dientes: true, base: 0.2 }, sorpresa: { k: 0, dientes: false, base: 0.8, estrecha: 0.85 }, enojo: { k: 0.14, dientes: true, base: 0.22 }, triste: { k: 0.3, dientes: false, base: 0 } };

function dibujarExpresion(ctx, { emocion, t, w, h, piel, anclas: an, ap, tAbs = 0, fase = 0, cab = null, escala = 1, limpia = false }) {
  // limpia: la cabeza no tiene ojos, cejas ni boca (cabeza de plastilina): no hay nada que borrar y la cara siempre lleva sus piezas modeladas
  ARCILLA = limpia; if (limpia) { const m = String(Array.isArray(piel) ? piel[0] : piel).match(/\d+/g); if (m) PIEL_ARC = `rgb(${m.slice(0, 3).map(v => Math.max(0, Math.round(v * 0.93))).join(',')})`; }
  const fuente = cab ? { cab, hw: w, hh: h } : null, pielDe = s => (Array.isArray(piel) ? piel[s < 0 ? 0 : 1] : piel);
  const ojoY = h * an.ojoY, dx = w * an.ojoDx, rReal = w * an.ojoR, R = rReal * 1.55 * escala, cejaY = ojoY + h * an.cejaY, bocaY = h * an.bocaY, aReal = w * an.bocaAncho;
  const trazo = Math.max(2, w * 0.016), p = easeOutBack(acotar(t / 0.25), 2);
  const hablando = ap > 0.08, bocaVisible = limpia || emocion !== 'normal' || hablando;
  ctx.save(); ctx.scale(lerp(0.92, 1, p), lerp(0.92, 1, p)); ctx.globalAlpha = limpia ? 1 : acotar(t / 0.08);
  const cierra = emocion === 'normal' && parpadea(tAbs, fase), dibujaOjos = emocion !== 'normal' || cierra;
  if (dibujaOjos && !limpia) for (const s of [-1, 1]) borrar(ctx, fuente, s * dx, ojoY, R * 1.15, R * 0.8, 0, R * 2.6, pielDe(s));                       // el ojo real desaparece
  if (emocion !== 'normal' && !limpia) for (const s of [-1, 1]) borrar(ctx, fuente, s * dx, cejaY, R * 1.5, R * 0.55, 0, -R * 2.4, pielDe(s));             // y la ceja real
  if (bocaVisible && !limpia) borrar(ctx, fuente, 0, bocaY, aReal * 1.2, aReal * 0.5, 0, aReal * 1.5, pielDe(1));                                      // y los labios reales
  const st = EMOCION_BOCA[emocion] || EMOCION_BOCA.normal, aD = aReal * 1.3 * (st.estrecha || 1) * escala;
  if (cierra) for (const s of [-1, 1]) ojoCerradoFeliz(ctx, s * dx, ojoY, R * 0.95, trazo * 1.5);
  if (emocion === 'sorpresa') {
    for (const s of [-1, 1]) ojoAbierto(ctx, s * dx, ojoY, R * 1.12, 0, trazo);
    for (const s of [-1, 1]) cejaGruesa(ctx, s * dx, cejaY - R * 0.5, R * 2.5, s * -0.1, R * 0.5);
    ctx.fillStyle = '#7FC8F8'; ctx.strokeStyle = '#3B8FCB'; ctx.lineWidth = trazo * 0.5; ctx.beginPath(); ctx.moveTo(w * 0.38, ojoY - h * 0.1); ctx.quadraticCurveTo(w * 0.44, ojoY - h * 0.02, w * 0.38, ojoY + h * 0.02); ctx.quadraticCurveTo(w * 0.32, ojoY - h * 0.02, w * 0.38, ojoY - h * 0.1); ctx.fill(); ctx.stroke(); // gota
  } else if (emocion === 'feliz') {
    for (const s of [-1, 1]) ojoCerradoFeliz(ctx, s * dx, ojoY, R, trazo * 1.8);
    for (const s of [-1, 1]) cejaGruesa(ctx, s * dx, cejaY - R * 0.4, R * 2.4, s * -0.2, R * 0.42);
    ctx.fillStyle = 'rgba(255,110,125,0.5)'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * w * 0.3, ojoY + h * 0.12, w * 0.075, h * 0.042, 0, 0, Math.PI * 2); ctx.fill(); }
    estrella(ctx, -w * 0.4, -h * 0.34, w * 0.055); estrella(ctx, w * 0.42, -h * 0.2, w * 0.04);
  } else if (emocion === 'enojo') {
    for (const s of [-1, 1]) ojoEnojado(ctx, s * dx, ojoY, R, s, trazo);
    for (const s of [-1, 1]) cejaGruesa(ctx, s * dx * 0.95, cejaY + R * 0.1, R * 2.7, s * 0.45, R * 0.55);
    ctx.strokeStyle = '#D8232A'; ctx.lineWidth = w * 0.02; ctx.lineCap = 'round'; const vx = w * 0.3, vy = -h * 0.3; for (const [ax, ay] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.beginPath(); ctx.moveTo(vx + ax * w * 0.012, vy + ay * h * 0.012); ctx.quadraticCurveTo(vx + ax * w * 0.045, vy + ay * h * 0.01, vx + ax * w * 0.055, vy + ay * h * 0.055); ctx.stroke(); } // vena
  } else if (emocion === 'triste') {
    for (const s of [-1, 1]) ojoAbierto(ctx, s * dx, ojoY + R * 0.1, R * 1.05, -s * 0.1, trazo);
    for (const s of [-1, 1]) cejaGruesa(ctx, s * dx, cejaY - R * 0.2, R * 2.4, s * 0.36, R * 0.46);
    ctx.fillStyle = '#7FC8F8'; const ly = ojoY + h * 0.1 + ((t * 1.2) % 1) * h * 0.18; for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * (dx + w * 0.03), ly, w * 0.018, h * 0.03, 0, 0, Math.PI * 2); ctx.fill(); }
  } else if (limpia && !cierra) { // en reposo con cara en blanco: ojos abiertos y cejas tranquilas, modelados
    for (const s of [-1, 1]) ojoAbierto(ctx, s * dx, ojoY, R, 0, trazo);
    for (const s of [-1, 1]) cejaGruesa(ctx, s * dx, cejaY - R * 0.1, R * 2.4, s * -0.06, R * 0.62);
  }
  if (bocaVisible) boca(ctx, { x: 0, y: bocaY, a: aD, abre: Math.min(1, Math.max(st.base, hablando ? ap : 0)), k: st.k, dientes: st.dientes || (hablando && ap > 0.5), trazo });
  ctx.restore();
}

// Cabeza LIBRE: recorte con pelo y cuello (sin óvalo). recorte.libre = { caja:{cx,cy,w,h} (cara: de la línea del pelo a la barbilla, fracciones
// de la imagen), tope (fracción del alto desde el pelo hasta la barbilla) }. Se escala para que pelo→barbilla mida `hh`, y el lienzo se rellena
// arriba con transparencia para que su CENTRO sea el centro de la cara (así las expresiones y el borrado de piel usan el mismo origen).
async function cabezaLibre(foto, libre, hh) {
  const img = await loadImage(Buffer.isBuffer(foto) ? foto : fs.readFileSync(foto)), s = hh / (libre.tope * img.height), { caja } = libre;
  const cw = Math.round(img.width * s), ch = Math.round(2 * Math.max(caja.cy, 1 - caja.cy) * img.height * s), c = createCanvas(cw, ch);
  c.getContext('2d').drawImage(img, 0, ch / 2 - caja.cy * img.height * s, cw, img.height * s);
  c.caja = { w: caja.w * img.width * s, h: caja.h * img.height * s }; c.hhCabeza = hh; c.limpia = Boolean(libre.limpia); c.cuelloK = libre.cuelloK ?? CUELLO_K; // alto de la cabeza completa (para accesorios)
  return c;
}

// Elemento del lienzo. cabeza: foto (Buffer|ruta) + recorte (óvalo, o recorte.libre). Todo lo temporal en segundos ABSOLUTOS del video.
function muneco({ cuerpo = 'cuerpo-bastonera', cabeza, recorte = {}, anclas = {}, cx = 0.5, base = 0.9, alto = 0.5, proporcion = 0.30, escalaExpr = 1, t0, t1,
  saltos = [], poses = [], emociones = [], accesorios = [], pegatinas = [], voz = null, kit = 'fotos', fpsMov = kit === 'plastilina' ? 12 : 0 }) {
  // Anclas de la cabeza de relleno de mujer (fracciones del óvalo): posición y tamaño REAL de ojos, cejas y boca.
  const A = { ojoY: 0.01, ojoDx: 0.17, ojoR: 0.058, bocaY: 0.33, bocaAncho: 0.118, cejaY: -0.075, ...anclas };
  const lista = [...emociones].sort((a, b) => a.t - b.t), cambios = [{ t: t0, pieza: cuerpo }, ...poses].sort((a, b) => a.t - b.t);
  let imgs = {}, ejes = {}, cuellos = {}, cab = null, piel = '#d9a37f', estado = null;
  const eventos = [{ t: t0 + 0.5, sonido: 'golpe' }, ...poses.map(p => ({ t: p.t, sonido: 'clic' })), ...saltos.map(t => ({ t, sonido: 'clic', db: -3 })),
    ...accesorios.map(a => ({ t: a.t + 0.45, sonido: 'ding' })), ...pegatinas.map(p => ({ t: p.t0, sonido: 'pop' })), ...lista.filter(e => e.t > t0).map(e => ({ t: e.t, sonido: 'trazo', db: -5 }))];
  const nuevoEstado = () => ({ ult: null, cabDx: new Resorte(150, 11), cabDy: new Resorte(170, 12), cabAng: new Resorte(130, 9), pegs: pegatinas.map(() => ({ x: new Resorte(90, 9), y: new Resorte(90, 9) })) });
  return {
    t0, t1, flota: false, eventos,
    async preparar({ w, h }) {
      const nombres = new Set([cuerpo, ...poses.map(p => p.pieza), ...accesorios.map(a => ACCESORIOS[a.id].archivo), ...pegatinas.map(p => p.id)]);
      for (const n of nombres) { if (!existePieza(n, kit)) throw new Error(`pieza del kit desconocida: ${n}`); imgs[n] = await piezaKit(n, kit); }
      for (const n of new Set([cuerpo, ...poses.map(p => p.pieza)])) { ejes[n] = ejeCuello(imgs[n]); cuellos[n] = cuelloY(imgs[n], ejes[n]); }
      const H = h * alto, hh = Math.round(H * proporcion), hw = Math.round(hh * 0.92);
      cab = recorte.libre ? await cabezaLibre(cabeza, recorte.libre, hh) : await cabezaDesdeFoto(cabeza, recorte, hw, hh);
      const bx = cab.caja || { w: cab.width, h: cab.height };
      const muestra = fx => { const d = cab.getContext('2d').getImageData(Math.round(cab.width / 2 + (fx - 0.5) * bx.w) - 3, Math.round(cab.height / 2 + (A.ojoY + 0.15) * bx.h) - 3, 6, 6).data; return `rgb(${d[0]},${d[1]},${d[2]})`; };
      piel = [muestra(0.5 - A.ojoDx), muestra(0.5 + A.ojoDx)]; // piel justo bajo cada ojo: el tono que rodea al párpado
    },
    dibujar(ctx, { t, tAbs, w, h, u, estilo }) {
      if (!estado || tAbs < estado.ult) estado = nuevoEstado();
      const dt = estado.ult === null ? 0 : Math.min(0.1, tAbs - estado.ult); estado.ult = tAbs;
      const H = h * alto, X = w * cx, Y = h * base, hw = cab.width, hh = cab.height, caja = cab.caja, hAcc = cab.hhCabeza ? cab.hhCabeza * 1.12 : hh;
      // pose y emoción vigentes
      const pose = [...cambios].reverse().find(c => c.t <= tAbs) || cambios[0], poseIni = pose.t;
      const emo = [...lista].reverse().find(e => e.t <= tAbs) || { t: t0, e: 'normal' };
      const img = imgs[pose.pieza], bodyH = H * (1 - 0.84 * proporcion), e = bodyH / img.height, bodyW = img.width * e, eje = ejes[pose.pieza] * e;
      // movimiento del cuerpo: caída de entrada + saltos + respiración y balanceo
      const T = fpsMov ? Math.floor(tAbs * fpsMov) / fpsMov : tAbs; // stop-motion: el movimiento avanza a saltos de 1/fpsMov s
      const c = caida(T - t0); let dy = c.dy, sy = c.sy;
      for (const tj of saltos) { const s = salto(T, tj); dy += s.dy; sy *= s.sy; }
      const cambio = tAbs - poseIni; if (cambio >= 0 && cambio < 0.22 && pose.t > t0) sy *= 1 + 0.07 * Math.sin(Math.PI * cambio / 0.22); // pop al cambiar de pose
      sy *= 1 + 0.012 * Math.sin(T * 2.1); const sx = 1 + (1 - sy) * 0.6, giro = Math.sin(T * 1.3) * 0.022;
      // cabeza con resortes: se retrasa respecto al cuerpo (rebote)
      const obj = -dy * 0.35 * (c.dy > 0 ? 0 : 1);
      const hDy = estado.cabDy.paso(obj + (1 - sy) * 0.4, dt), hDx = estado.cabDx.paso(Math.sin(T * 1.3) * 0.012, dt), hAng = estado.cabAng.paso(giro * 1.4 + (emo.e === 'enojo' ? 0.05 : emo.e === 'triste' ? -0.05 : 0), dt);
      const ap = voz ? (voz.abertura[Math.floor(tAbs * (voz.fps || 30))] ?? 0) : 0;
      // sombra de contacto: se achica cuando salta
      B.sombraDeContacto(ctx, X, Y + H * 0.005, bodyW * 0.62 * (1 - dy * 0.5), H * 0.03, 0.30 * acotar(t / 0.2) * (1 - Math.min(0.6, dy)));
      ctx.save(); ctx.globalAlpha *= acotar((tAbs - t0) / 0.05 + 0.0001); ctx.translate(X, Y - dy * H); ctx.rotate(giro); ctx.scale(sx, sy);
      const cuerpoYa = () => { B.sombraDeCapa(ctx, u, 0.35, 0.28); ctx.drawImage(img, -eje, -bodyH, bodyW, bodyH); B.sinSombra(ctx); };
      // cabeza libre: se dibuja DETRÁS del cuerpo y su cuello baja por la abertura del cuello del traje (el cuello del traje tapa la base); la de óvalo va delante
      // la barbilla queda un poco por encima del borde del cuello del traje
      const yCab = caja ? -bodyH + cuellos[pose.pieza] * e - caja.h * cab.cuelloK - caja.h / 2 : -bodyH + cuellos[pose.pieza] * e - hh * 0.34;
      const cabezaYa = () => { ctx.save(); ctx.translate(hDx * H, yCab + hDy * H); ctx.rotate(hAng);
      B.sombraDeCapa(ctx, u, 0.3, 0.25); ctx.drawImage(cab, -hw / 2, -hh / 2); B.sinSombra(ctx);
      dibujarExpresion(ctx, { emocion: emo.e, t: tAbs - emo.t, w: caja ? caja.w : hw, h: caja ? caja.h : hh, piel, anclas: A, ap, tAbs, fase: 0.9, cab, escala: escalaExpr, limpia: Boolean(cab.limpia) });
      for (const a of accesorios) { // el accesorio cae sobre la cabeza y se queda pegado
        const ac = ACCESORIOS[a.id], im = imgs[ac.archivo], tt = tAbs - a.t; if (tt < 0) continue;
        const aw = (caja ? caja.w * 1.5 : hw) * ac.ancho, ah = aw * im.height / im.width, caidaY = tt < 0.45 ? -(1 - (tt / 0.45) ** 2) * hAcc * 1.1 : 0, rebote = tt >= 0.45 ? Math.exp(-(tt - 0.45) * 7) * Math.sin((tt - 0.45) * 22) * hAcc * 0.04 : 0;
        ctx.save(); ctx.translate(0, hAcc * ac.dy + caidaY + rebote); ctx.rotate(tt < 0.45 ? tt * 3 : Math.exp(-(tt - 0.45) * 7) * Math.sin((tt - 0.45) * 18) * 0.12);
        B.sombraDeCapa(ctx, u, 0.4, 0.3); ctx.drawImage(im, -aw / 2, -ah * 0.85, aw, ah); B.sinSombra(ctx); ctx.restore();
      }
      ctx.restore(); };
      if (caja && !cab.limpia) { cabezaYa(); cuerpoYa(); } else { cuerpoYa(); cabezaYa(); } // cuerpo de plastilina: tiene su propio cuello y la cabeza va delante (el pelo cae sobre el traje)
      ctx.restore();
      // pegatinas flotantes (guante, bastón…) con resortes y giro opcional
      pegatinas.forEach((p, i) => {
        if (tAbs < p.t0 || tAbs >= (p.t1 ?? t1)) return;
        const tt = tAbs - p.t0, im = imgs[p.id], pw = H * (p.ancho ?? 0.3), ph = pw * im.height / im.width, r = estado.pegs[i];
        const tx = X + (p.dx ?? 0.3) * H + Math.sin(tAbs * 2.2 + i) * H * 0.012, ty = Y - (p.dy ?? 0.5) * H + Math.cos(tAbs * 1.7 + i) * H * 0.014;
        if (!r.listo) { r.x.x = tx; r.y.x = ty - H * 0.25; r.listo = true; }
        const ex = r.x.paso(tx, dt), ey = r.y.paso(ty - (tt < 0.4 ? (1 - tt / 0.4) * H * 0.25 : 0), dt), pp = easeOutBack(acotar(tt / 0.35), 2);
        ctx.save(); ctx.translate(ex, ey); ctx.rotate((p.giro ? tAbs * 7 : Math.sin(tAbs * 2 + i) * 0.1) + (p.angulo ?? 0)); ctx.scale(lerp(0.3, 1, pp), lerp(0.3, 1, pp)); ctx.globalAlpha *= acotar(tt / 0.1);
        B.sombraDeCapa(ctx, u, 0.55, 0.3); ctx.drawImage(im, -pw / 2, -ph / 2, pw, ph); B.sinSombra(ctx); ctx.restore();
      });
    },
  };
}

module.exports = { cuelloY, parpadea, muneco, EMOCIONES, PEGATINAS, ACCESORIOS, Resorte, salto, caida, ejeCuello, piezaKit, existePieza, dibujarExpresion };

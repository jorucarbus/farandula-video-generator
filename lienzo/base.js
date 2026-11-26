// Primitivas del lienzo (estilo capitol + profundidad): fondo, sombras de capas, retrato circular y trazos a mano.
// Todo en proporciones del cuadro. La PROFUNDIDAD sale de tres cosas: sombra suave desplazada hacia abajo, sombra de
// contacto (elipse en el "suelo") y un leve flote vertical, para que los elementos se lean como capas sobre el papel.
const { rectRedondo } = require('../overlay/componentes');
const { acotar, easeOutCubic } = require('../overlay/animacion');

function rng(semilla) { // mulberry32: mismo trazo a mano en cada render
  let a = semilla >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Papel crema con una viñeta apenas perceptible: el fondo no es plano del todo (da lugar a que las sombras se noten).
function fondo(ctx, w, h, estilo) {
  ctx.fillStyle = estilo.colores.fondo; ctx.fillRect(0, 0, w, h);
  const g = ctx.createRadialGradient(w / 2, h * 0.5, Math.min(w, h) * 0.35, w / 2, h * 0.5, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(255,255,255,0.28)'); g.addColorStop(1, 'rgba(120,105,80,0.07)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}

// Sombra de capa. `altura` 0..1: más alto = sombra más larga y difusa (el elemento "flota" más).
function sombraDeCapa(ctx, u, altura = 0.5, alfa = 0.30) {
  ctx.shadowColor = `rgba(40,30,15,${alfa})`;
  ctx.shadowBlur = u * (0.018 + 0.05 * altura);
  ctx.shadowOffsetX = u * 0.004 * altura; ctx.shadowOffsetY = u * (0.008 + 0.02 * altura);
}
const sinSombra = ctx => { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; };

// Elipse difusa en el suelo, debajo del elemento: ancla visual de profundidad.
function sombraDeContacto(ctx, cx, cy, rx, ry, alfa = 0.22) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(40,30,15,${alfa})`); g.addColorStop(1, 'rgba(40,30,15,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}

// Foto recortada en círculo (cubre el círculo, centrada en `foco` {x,y} 0..1 de la imagen) con aro blanco.
function retratoCircular(ctx, img, cx, cy, r, { aro = r * 0.09, foco = { x: 0.5, y: 0.4 }, colorAro = '#FFFFFF', u = r * 6 } = {}) {
  ctx.save();
  sombraDeCapa(ctx, u, 0.55, 0.32);
  ctx.fillStyle = colorAro; ctx.beginPath(); ctx.arc(cx, cy, r + aro, 0, Math.PI * 2); ctx.fill();
  sinSombra(ctx);
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  const e = Math.max((2 * r) / img.width, (2 * r) / img.height);
  const dw = img.width * e, dh = img.height * e;
  ctx.drawImage(img, cx - dw * foco.x, cy - dh * foco.y, dw, dh);
  ctx.restore();
}

// Trazo a mano alzada: polilínea que se dibuja de 0 a `p` (0..1) con punta redonda y una pizca de sombra.
function trazar(ctx, puntos, p, { color, ancho, u }) {
  const n = Math.max(2, Math.floor(puntos.length * acotar(p)));
  if (p <= 0) return;
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = ancho; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(80,0,10,0.25)'; ctx.shadowBlur = ancho * 0.8; ctx.shadowOffsetY = ancho * 0.3;
  ctx.beginPath(); ctx.moveTo(puntos[0].x, puntos[0].y);
  for (let i = 1; i < n; i++) ctx.lineTo(puntos[i].x, puntos[i].y);
  ctx.stroke(); ctx.restore();
}

// Óvalo dibujado a mano: ~1.1 vueltas, radio con ruido suave, un poco inclinado; no cierra exacto (como un marcador).
function puntosDeOvalo(cx, cy, rx, ry, semilla = 7, pasos = 70) {
  const r = rng(semilla), fase = r() * 6.28, inc = (r() - 0.5) * 0.35, v = 1.12;
  const ruido = [r(), r(), r(), r()].map(x => (x - 0.5) * 0.10);
  const pts = [];
  for (let i = 0; i <= pasos; i++) {
    const a = fase + (i / pasos) * Math.PI * 2 * v;
    const k = 1 + ruido[0] * Math.sin(a * 2 + 1) + ruido[1] * Math.sin(a * 3 + 2) + (i / pasos) * 0.06; // se abre hacia el final
    const x = Math.cos(a) * rx * k, y = Math.sin(a) * ry * k;
    pts.push({ x: cx + x * Math.cos(inc) - y * Math.sin(inc), y: cy + x * Math.sin(inc) + y * Math.cos(inc) });
  }
  return pts;
}

// Subrayado a mano: línea casi recta con una ligera curva y temblor.
function puntosDeSubrayado(x0, y0, x1, y1, semilla = 3, pasos = 30) {
  const r = rng(semilla), pts = [], comba = (r() - 0.5) * 8;
  for (let i = 0; i <= pasos; i++) { const t = i / pasos; pts.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * comba + (r() - 0.5) * 1.2 }); }
  return pts;
}

// Entrada con escala + opacidad. p = progreso 0..1 de la aparición.
const entrada = (p, desde = 0.82) => ({ escala: desde + (1 - desde) * easeOutCubic(p), alfa: acotar(p / 0.35) });

// Cuadro dibujado a mano alrededor de una cara: cuatro lados con esquinas algo desviadas, y vuelve casi al inicio (como un marcador).
function puntosDeCuadro(cx, cy, rx, ry, semilla = 5) {
  const r = rng(semilla), j = () => (r() - 0.5) * Math.min(rx, ry) * 0.12;
  const c = [[-rx + j(), -ry + j()], [rx + j(), -ry + j()], [rx + j(), ry + j()], [-rx + j(), ry + j()], [-rx + j() * 0.5, -ry * 0.78 + j()]], pts = [];
  for (let s = 0; s < c.length - 1; s++) for (let i = 0; i < 14; i++) { const q = i / 14; pts.push({ x: cx + c[s][0] + (c[s + 1][0] - c[s][0]) * q, y: cy + c[s][1] + (c[s + 1][1] - c[s][1]) * q }); }
  pts.push({ x: cx + c[4][0], y: cy + c[4][1] });
  return pts;
}

// Flecha a mano que apunta a una cara de radio R desde abajo a un lado (dir = +1 viene de la derecha, -1 de la izquierda). Devuelve 3 trazos: cuerpo y dos alas.
function puntosDeFlecha(cx, cy, R, dir = 1, xMin = 0, xMax = 1e9, semilla = 5) {
  const r = rng(semilla), L = Math.min(R * 2.1, (xMax - xMin) * 0.28), punta = { x: cx + dir * R * 0.8, y: cy + R * 0.5 }, ini = { x: Math.max(xMin + 12, Math.min(xMax - 12, punta.x + dir * L)), y: punta.y + L * 0.95 }; // el largo del cuerpo tiene tope: una cara muy grande no estira la flecha fuera de la tarjeta
  const ang = Math.atan2(punta.y - ini.y, punta.x - ini.x), comba = (r() - 0.5) * R * 0.5, nx = -Math.sin(ang), ny = Math.cos(ang), cuerpo = [];
  for (let i = 0; i <= 18; i++) { const q = i / 18, b = Math.sin(q * Math.PI) * comba; cuerpo.push({ x: ini.x + (punta.x - ini.x) * q + nx * b, y: ini.y + (punta.y - ini.y) * q + ny * b }); }
  const ala = s => { const a = ang + Math.PI + s * 0.5, L = R * 0.6; return [punta, { x: punta.x + Math.cos(a) * L, y: punta.y + Math.sin(a) * L }]; };
  return [cuerpo, ala(1), ala(-1)];
}

module.exports = { puntosDeCuadro, puntosDeFlecha, rng, fondo, sombraDeCapa, sinSombra, sombraDeContacto, retratoCircular, trazar, puntosDeOvalo, puntosDeSubrayado, entrada, rectRedondo };

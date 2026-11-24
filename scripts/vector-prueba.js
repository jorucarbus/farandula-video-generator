// Prueba de estilo: personaje VECTORIAL dibujado por código (contorno + relleno plano + una sombra).
// Hoja: cuerpo completo, 12 bocas, ojos/párpados, 3 vistas de cabeza. Salida: data-motor/lamina/estilos/vector-prueba.png
const fs = require('fs'), path = require('path');
const { createCanvas } = require('@napi-rs/canvas');
const C = { tinta: '#2b1b1b', piel: '#e8b48f', sombra: '#d19672', pelo: '#3b2417', peloL: '#5a3622', rojo: '#d8333f', rojoS: '#a8232e', blanco: '#fbf7ef', oro: '#f2c230', bota: '#f4efe6', fondo: '#f3ecd8', lengua: '#e86a74', boca: '#5a1620', mej: '#f08a80' };
const LW = 5;
function trazo(x, f, grosor = LW) { x.lineWidth = grosor; x.lineJoin = 'round'; x.lineCap = 'round'; x.strokeStyle = C.tinta; if (f) { x.fillStyle = f; x.fill(); } x.stroke(); }
const elip = (x, cx, cy, rx, ry, f, g) => { x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); trazo(x, f, g); };
const rect = (x, px, py, w, h, r, f, g) => { x.beginPath(); x.roundRect(px, py, w, h, r); trazo(x, f, g); };

// ── 12 bocas, mismo ancho y centro (0,0) ──
function boca(x, tipo, w = 90) {
  x.save(); const a = w / 2;
  const abierta = (ancho, alto, dientes, lengua) => {
    x.beginPath(); x.moveTo(-ancho, -alto * 0.15); x.quadraticCurveTo(0, -alto * 0.35, ancho, -alto * 0.15); x.quadraticCurveTo(ancho * 0.85, alto, 0, alto); x.quadraticCurveTo(-ancho * 0.85, alto, -ancho, -alto * 0.15); x.closePath(); trazo(x, C.boca);
    x.save(); x.clip();
    if (lengua) { elip(x, 0, alto * 0.78, ancho * 0.5, alto * 0.38, C.lengua, 3); }
    if (dientes) { x.fillStyle = C.blanco; x.fillRect(-ancho, -alto * 0.4, ancho * 2, alto * 0.42); x.strokeStyle = C.tinta; x.lineWidth = 3; x.strokeRect(-ancho, -alto * 0.4, ancho * 2, alto * 0.42); }
    x.restore(); x.beginPath(); x.moveTo(-ancho, -alto * 0.15); x.quadraticCurveTo(0, -alto * 0.35, ancho, -alto * 0.15); x.quadraticCurveTo(ancho * 0.85, alto, 0, alto); x.quadraticCurveTo(-ancho * 0.85, alto, -ancho, -alto * 0.15); x.closePath(); x.lineWidth = LW; x.strokeStyle = C.tinta; x.stroke();
  };
  const linea = (curv) => { x.beginPath(); x.moveTo(-a, 0); x.quadraticCurveTo(0, curv, a, 0); x.lineWidth = LW; x.strokeStyle = C.tinta; x.lineCap = 'round'; x.stroke(); };
  switch (tipo) {
    case 'Neutral': linea(14); break;
    case 'Aa': abierta(a * 0.8, 46, false, true); break;
    case 'D': abierta(a * 0.85, 30, true, true); break;
    case 'Ee': abierta(a * 1.0, 20, true, false); break;
    case 'F': linea(4); x.beginPath(); x.roundRect(-a * 0.55, -2, a * 1.1, 13, 5); x.fillStyle = C.blanco; x.fill(); x.lineWidth = 3.5; x.strokeStyle = C.tinta; x.stroke(); break;
    case 'L': abierta(a * 0.7, 30, true, true); x.beginPath(); x.ellipse(0, 2, 18, 9, 0, 0, Math.PI * 2); x.fillStyle = C.lengua; x.fill(); x.lineWidth = 3; x.stroke(); break;
    case 'M': linea(0); break;
    case 'Oh': abierta(a * 0.42, 44, false, true); break;
    case 'R': abierta(a * 0.6, 26, true, false); break;
    case 'S': x.beginPath(); x.roundRect(-a * 0.9, -9, a * 1.8, 18, 8); x.fillStyle = C.blanco; x.fill(); x.lineWidth = LW; x.strokeStyle = C.tinta; x.stroke(); x.beginPath(); x.moveTo(-a * 0.9, 0); x.lineTo(a * 0.9, 0); x.lineWidth = 3; x.stroke(); break;
    case 'Uh': abierta(a * 0.55, 26, false, true); break;
    case 'WOo': abierta(a * 0.3, 28, false, false); break;
  }
  x.restore();
}
const BOCAS = ['Neutral', 'Aa', 'D', 'Ee', 'F', 'L', 'M', 'Oh', 'R', 'S', 'Uh', 'WOo'];

// ── ojo: globo + pupila + párpado ──
function ojo(x, cx, cy, r, { mx = 0, my = 0, cierre = 0, feliz = false } = {}) {
  x.save(); x.translate(cx, cy);
  if (feliz) { x.beginPath(); x.arc(0, r * 0.35, r * 0.95, Math.PI * 1.1, Math.PI * 1.9); x.lineWidth = LW + 1; x.strokeStyle = C.tinta; x.lineCap = 'round'; x.stroke(); x.restore(); return; }
  elip(x, 0, 0, r, r * 1.1, C.blanco);
  x.save(); x.beginPath(); x.ellipse(0, 0, r, r * 1.1, 0, 0, Math.PI * 2); x.clip();
  x.beginPath(); x.arc(mx * r * 0.45, my * r * 0.4, r * 0.52, 0, Math.PI * 2); x.fillStyle = C.tinta; x.fill();
  x.beginPath(); x.arc(mx * r * 0.45 - r * 0.15, my * r * 0.4 - r * 0.18, r * 0.16, 0, Math.PI * 2); x.fillStyle = '#fff'; x.fill();
  if (cierre > 0) { x.fillStyle = C.piel; x.fillRect(-r * 1.2, -r * 1.3, r * 2.4, r * 2.4 * cierre * 0.5 + r * 0.2 * (cierre > 0)); x.fillRect(-r * 1.2, -r * 1.3, r * 2.4, (r * 2.4) * cierre * 0.55); }
  x.restore();
  elip(x, 0, 0, r, r * 1.1, null);
  if (cierre > 0.5) { x.beginPath(); x.moveTo(-r, 0); x.quadraticCurveTo(0, r * 0.35, r, 0); x.lineWidth = LW; x.stroke(); }
  x.restore();
}
function ceja(x, cx, cy, w, ang, g = 8) { x.save(); x.translate(cx, cy); x.rotate(ang); x.beginPath(); x.moveTo(-w / 2, 0); x.quadraticCurveTo(0, -w * 0.18, w / 2, 0); x.lineWidth = g; x.strokeStyle = C.pelo; x.lineCap = 'round'; x.stroke(); x.restore(); }

// ── cabeza: vista = 'frontal' | 'cuartoI' | 'cuartoD'; (cx,cy) centro de la cara, s escala ──
function cabeza(x, cx, cy, s, vista = 'frontal', { bocaT = 'Neutral', mx = 0, my = 0, cierre = 0, feliz = false, ceja: cj = 0 } = {}) {
  x.save(); x.translate(cx, cy); x.scale(s, s);
  const d = vista === 'frontal' ? 0 : vista === 'cuartoI' ? -1 : 1, desp = d * 20, ancho = vista === 'frontal' ? 100 : 92;
  // pelo de atrás
  x.beginPath(); x.ellipse(d * 4, -6, ancho + 14, 125, 0, 0, Math.PI * 2); trazo(x, C.pelo);
  // orejas
  if (vista === 'frontal') { elip(x, -ancho + 2, 6, 15, 22, C.piel); elip(x, ancho - 2, 6, 15, 22, C.piel); }
  else elip(x, d > 0 ? -ancho + 6 : ancho - 6, 8, 14, 22, C.sombra);
  // cara
  x.beginPath(); x.ellipse(d * 4, 4, ancho, 112, 0, 0, Math.PI * 2); trazo(x, C.piel);
  // mejillas
  elip(x, -50 + desp, 40, 18, 11, C.mej, 0); elip(x, 50 + desp, 40, 18, 11, C.mej, 0);
  // ojos con la ley del paralaje: el rasgo más cercano al giro se desplaza más
  const ex = vista === 'frontal' ? 40 : 36, sep = vista === 'frontal' ? 1 : 0.9;
  ojo(x, -ex * sep + desp * 1.3, -14, 21, { mx, my, cierre, feliz }); ojo(x, ex * sep + desp * 1.3, -14, 21, { mx, my, cierre, feliz });
  ceja(x, -ex * sep + desp * 1.3, -50 - cj, 44, -0.12 - cj * 0.01); ceja(x, ex * sep + desp * 1.3, -50 - cj, 44, 0.12 + cj * 0.01);
  // nariz
  x.beginPath(); x.moveTo(desp * 1.6, 2); x.quadraticCurveTo(desp * 1.6 + 10, 22, desp * 1.6 - 4, 26); x.lineWidth = 4.5; x.strokeStyle = C.tinta; x.stroke();
  // boca
  x.save(); x.translate(desp * 1.4, 62); boca(x, bocaT, vista === 'frontal' ? 78 : 66); x.restore();
  // flequillo
  x.beginPath(); x.moveTo(-ancho + 2 + d * 4, -40); x.quadraticCurveTo(-30 + d * 6, -122, 20 + d * 8, -104); x.quadraticCurveTo(70 + d * 8, -100, ancho - 2 + d * 4, -40); x.quadraticCurveTo(40 + d * 8, -82, 0 + d * 8, -66); x.quadraticCurveTo(-50 + d * 6, -86, -ancho + 2 + d * 4, -40); x.closePath(); trazo(x, C.pelo);
  x.beginPath(); x.moveTo(-40 + d * 6, -96); x.quadraticCurveTo(-10 + d * 6, -108, 18 + d * 8, -96); x.lineWidth = 4; x.strokeStyle = C.peloL; x.stroke();
  x.restore();
}

// ── cuerpo de bastonera ──
function cuerpo(x, cx, base, s, { brazoI = 25, brazoD = -25 } = {}) {
  x.save(); x.translate(cx, base); x.scale(s, s);
  // piernas (de y=-250 a 0)
  for (const sg of [-1, 1]) { rect(x, sg * 34 - 17, -250, 34, 205, 14, C.piel); rect(x, sg * 34 - 20, -62, 40, 40, 12, C.blanco); elip(x, sg * 34 + sg * 4, -12, 28, 14, C.bota); }
  // falda
  x.beginPath(); x.moveTo(-70, -330); x.lineTo(70, -330); x.lineTo(98, -228); x.quadraticCurveTo(0, -206, -98, -228); x.closePath(); trazo(x, C.rojo);
  x.beginPath(); x.moveTo(-98, -228); x.quadraticCurveTo(0, -206, 98, -228); x.lineTo(94, -240); x.quadraticCurveTo(0, -218, -94, -240); x.closePath(); trazo(x, C.oro, 3);
  // brazos (detrás del torso: se dibujan antes)
  const brazo = (sg, ang) => { x.save(); x.translate(sg * 78, -462); x.rotate(sg * ang * Math.PI / 180); rect(x, -17, -6, 34, 150, 17, C.piel); elip(x, 0, 150, 24, 22, C.piel); rect(x, -19, -8, 38, 40, 16, C.rojo); x.restore(); };
  brazo(-1, brazoI); brazo(1, -brazoD * -1);
  // torso
  x.beginPath(); x.moveTo(-72, -480); x.quadraticCurveTo(0, -500, 72, -480); x.lineTo(62, -326); x.lineTo(-62, -326); x.closePath(); trazo(x, C.rojo);
  x.beginPath(); x.moveTo(-62, -440); x.lineTo(62, -440); x.lineWidth = 12; x.strokeStyle = C.oro; x.stroke(); x.beginPath(); x.moveTo(-62, -340); x.lineTo(62, -340); x.stroke();
  for (let i = -1; i <= 1; i++) elip(x, i * 28, -392, 8, 8, C.oro, 3);
  // cuello
  rect(x, -20, -516, 40, 44, 12, C.sombra);
  x.restore();
}

(async () => {
  const W = 1500, H = 1000, c = createCanvas(W, H), x = c.getContext('2d'); x.fillStyle = C.fondo; x.fillRect(0, 0, W, H);
  x.fillStyle = C.tinta; x.font = 'bold 22px sans-serif'; x.fillText('VECTORIAL (código): cuerpo + 3 vistas de cabeza + 12 bocas + ojos', 20, 34);
  // cuerpo completo con la cabeza encima
  cuerpo(x, 250, 960, 1.18, { brazoI: 30, brazoD: -150 }); cabeza(x, 250, 960 - 516 * 1.18 - 112 * 0.62 + 18, 0.62, 'frontal', { bocaT: 'Aa', feliz: false });
  // 3 vistas
  const vs = [['cuartoI', 'cuarto izq.'], ['frontal', 'frontal'], ['cuartoD', 'cuarto der.']];
  vs.forEach(([v, n], i) => { cabeza(x, 640 + i * 230, 190, 0.8, v, { bocaT: 'Neutral' }); x.fillStyle = C.tinta; x.font = '18px sans-serif'; x.fillText(n, 600 + i * 230, 330); });
  // estados de ojos / emociones
  const em = [['normal', {}], ['parpadeo', { cierre: 1 }], ['feliz', { feliz: true, bocaT: 'Ee' }], ['sorpresa', { bocaT: 'Oh', ceja: 14, my: -0.6 }]];
  em.forEach(([n, o], i) => { cabeza(x, 640 + i * 205, 480, 0.62, 'frontal', o); x.fillStyle = C.tinta; x.font = '18px sans-serif'; x.fillText(n, 610 + i * 205, 590); });
  // 12 bocas
  BOCAS.forEach((b, i) => { const col = i % 6, fila = (i / 6) | 0, px = 520 + col * 160, py = 700 + fila * 130; x.fillStyle = C.piel; x.fillRect(px - 62, py - 45, 124, 90); x.save(); x.translate(px, py); boca(x, b, 90); x.restore(); x.fillStyle = C.tinta; x.font = '16px sans-serif'; x.fillText(b, px - 14, py + 64); });
  const out = path.join(__dirname, '..', 'data-motor', 'lamina', 'estilos'); fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'vector-prueba.png'), c.toBuffer('image/png')); console.log('ok');
})().catch(e => { console.error(e); process.exit(1); });

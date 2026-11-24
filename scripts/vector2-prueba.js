// Prueba 2: estilo editorial plano (contorno negro fino, color liso, UNA sombra azul dura por pieza, ojos grandes con pestañas, nariz de prisma).
// Genera la hoja de piezas y dos cuadros 9:16 con el diseño ya aprobado (muñeco al centro sin video / video flotante + muñeco chico + tarjeta baja).
const fs = require('fs'), path = require('path');
const { createCanvas } = require('@napi-rs/canvas');
const C = { tinta: '#111311', piel: '#f4a58a', sombra: '#3f74c0', pelo: '#111311', jersey: '#f7e015', falda: '#ef5b4c', blanco: '#f6f4ef', boca: '#2a1212', lengua: '#ef5b4c', crema: '#f3ecd8', verde: '#52b04c', zapato: '#2c4f9c' };
const LW = 4.5;
const ell = (cx, cy, rx, ry) => x => { x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); };
const rr = (px, py, w, h, r) => x => { x.beginPath(); x.roundRect(px, py, w, h, r); };
// pieza plana con sombra dura: la sombra es el borde que queda al desplazar la forma base hacia arriba-izquierda
function pieza(x, trazar, base, sombra = C.sombra, off = [-14, -8], lw = LW) {
  x.save(); trazar(x); x.fillStyle = sombra; x.fill();
  x.save(); trazar(x); x.clip(); x.translate(off[0], off[1]); trazar(x); x.fillStyle = base; x.fill(); x.restore();
  trazar(x); x.lineWidth = lw; x.lineJoin = 'round'; x.lineCap = 'round'; x.strokeStyle = C.tinta; x.stroke(); x.restore();
}
const plano = (x, trazar, f, lw = LW) => { trazar(x); x.fillStyle = f; x.fill(); x.lineWidth = lw; x.lineJoin = 'round'; x.lineCap = 'round'; x.strokeStyle = C.tinta; x.stroke(); };

function boca(x, tipo, w = 84) {
  x.save(); const a = w / 2; x.lineJoin = 'round'; x.lineCap = 'round';
  const contorno = () => { x.lineWidth = LW; x.strokeStyle = C.tinta; x.stroke(); };
  const abierta = (an, al, dientes, lengua) => {
    const p = () => { x.beginPath(); x.moveTo(-an, -al * 0.15); x.quadraticCurveTo(0, -al * 0.32, an, -al * 0.15); x.quadraticCurveTo(an * 0.85, al, 0, al); x.quadraticCurveTo(-an * 0.85, al, -an, -al * 0.15); x.closePath(); };
    p(); x.fillStyle = C.boca; x.fill(); x.save(); p(); x.clip();
    if (lengua) { x.beginPath(); x.ellipse(0, al * 0.85, an * 0.55, al * 0.42, 0, 0, Math.PI * 2); x.fillStyle = C.lengua; x.fill(); }
    if (dientes) { x.fillStyle = C.blanco; x.fillRect(-an, -al * 0.4, an * 2, al * 0.5); }
    x.restore(); p(); contorno();
  };
  const linea = c => { x.beginPath(); x.moveTo(-a, 0); x.quadraticCurveTo(0, c, a, 0); contorno(); };
  switch (tipo) {
    case 'Neutral': linea(10); break;
    case 'Aa': abierta(a * 0.8, 46, false, true); break;
    case 'D': abierta(a * 0.85, 32, true, true); break;
    case 'Ee': abierta(a, 22, true, false); break;
    case 'F': linea(4); x.beginPath(); x.roundRect(-a * 0.55, -1, a * 1.1, 13, 5); x.fillStyle = C.blanco; x.fill(); contorno(); break;
    case 'L': abierta(a * 0.7, 32, true, true); break;
    case 'M': linea(0); break;
    case 'Oh': abierta(a * 0.4, 44, false, true); break;
    case 'R': abierta(a * 0.6, 28, true, false); break;
    case 'S': x.beginPath(); x.roundRect(-a * 0.9, -9, a * 1.8, 19, 8); x.fillStyle = C.blanco; x.fill(); contorno(); x.beginPath(); x.moveTo(-a * 0.9, 0); x.lineTo(a * 0.9, 0); x.lineWidth = 3; x.stroke(); break;
    case 'Uh': abierta(a * 0.55, 28, false, true); break;
    case 'WOo': abierta(a * 0.3, 30, false, false); break;
  }
  x.restore();
}
const BOCAS = ['Neutral', 'Aa', 'D', 'Ee', 'F', 'L', 'M', 'Oh', 'R', 'S', 'Uh', 'WOo'];

// ojo grande: globo + pupila pequeña + pestañas en rayitas; cierre 0..1; feliz = arco
function ojo(x, cx, cy, r, { mx = 0, my = 0, cierre = 0, feliz = false } = {}) {
  x.save(); x.translate(cx, cy); x.lineCap = 'round'; x.strokeStyle = C.tinta; x.lineWidth = LW - 0.5;
  const pestanas = (desde, hasta, largo = 11) => { for (let i = 0; i <= 6; i++) { const a = desde + (hasta - desde) * i / 6, c = Math.cos(a), s = Math.sin(a); x.beginPath(); x.moveTo(c * (r + 5), s * (r + 5)); x.lineTo(c * (r + 5 + largo), s * (r + 5 + largo)); x.stroke(); } };
  if (feliz) { x.beginPath(); x.arc(0, r * 0.3, r * 0.85, Math.PI * 1.12, Math.PI * 1.88); x.lineWidth = LW + 1.5; x.stroke(); x.restore(); return; }
  if (cierre >= 0.6) { x.beginPath(); x.moveTo(-r, 0); x.quadraticCurveTo(0, r * 0.5, r, 0); x.lineWidth = LW + 1; x.stroke(); pestanas(Math.PI * 0.12, Math.PI * 0.88, 9); x.restore(); return; }
  x.beginPath(); x.arc(0, 0, r, 0, Math.PI * 2); x.fillStyle = C.blanco; x.fill(); x.stroke();
  x.beginPath(); x.arc(mx * r * 0.5, my * r * 0.45, r * 0.2, 0, Math.PI * 2); x.fillStyle = C.tinta; x.fill();
  pestanas(Math.PI * 1.1, Math.PI * 1.9);
  x.restore();
}
function ceja(x, cx, cy, w, ang) { x.save(); x.translate(cx, cy); x.rotate(ang); x.beginPath(); x.moveTo(-w / 2, 0); x.lineTo(w / 2, 0); x.lineWidth = LW; x.lineCap = 'round'; x.strokeStyle = C.tinta; x.stroke(); x.restore(); }
function nariz(x, cx, cy) { // prisma: cara coral + cara azul
  plano(x, p => { p.beginPath(); p.moveTo(cx + 4, cy - 30); p.lineTo(cx + 18, cy - 24); p.lineTo(cx + 2, cy + 22); p.lineTo(cx - 12, cy + 18); p.closePath(); }, C.falda, 3.5);
  plano(x, p => { p.beginPath(); p.moveTo(cx + 18, cy - 24); p.lineTo(cx + 30, cy + 22); p.lineTo(cx + 2, cy + 22); p.closePath(); }, C.sombra, 3.5);
}
// cabeza centrada en (0,0): pelo de atrás, orejas, cara con sombra, ojos, nariz, boca, flequillo de nubes
function cabeza(x, { bocaT = 'Neutral', mx = 0, my = 0, cierre = 0, feliz = false, ceja: cj = 0, torcer = 0 } = {}) {
  // pelo trasero: masa de bolas que cae hasta los hombros
  const bolas = [[-140, -60, 50], [-150, 10, 52], [-140, 90, 52], [-125, 150, 48], [140, -60, 50], [150, 10, 52], [140, 90, 52], [125, 150, 48], [-110, -120, 52], [110, -120, 52], [-60, -150, 56], [0, -158, 58], [60, -150, 56]];
  x.fillStyle = C.pelo; for (const [bx, by, br] of bolas) { x.beginPath(); x.arc(bx, by, br, 0, Math.PI * 2); x.fill(); }
  x.beginPath(); x.roundRect(-150, -120, 300, 270, 60); x.fill();
  // orejas
  pieza(x, ell(-106, 6, 19, 28), C.piel, C.sombra, [-4, -3], LW - 1); pieza(x, ell(106, 6, 19, 28), C.piel, C.sombra, [-6, -4], LW - 1);
  // cara
  pieza(x, ell(0, 0, 108, 128), C.piel, C.sombra, [-17, -9]);
  // rasgos (torcer desplaza los rasgos para insinuar un giro; el más cercano se mueve más)
  const dx = torcer * 16;
  ojo(x, -44 + dx * 1.2, -18, 31, { mx, my, cierre, feliz }); ojo(x, 44 + dx * 1.2, -18, 31, { mx, my, cierre, feliz });
  ceja(x, -44 + dx * 1.2, -66 - cj, 46, -0.06 - cj * 0.012); ceja(x, 44 + dx * 1.2, -66 - cj, 46, 0.06 + cj * 0.012);
  nariz(x, dx * 1.5, 14);
  x.save(); x.translate(dx * 1.3, 82); boca(x, bocaT, 80); x.restore();
  // flequillo de nubes
  x.fillStyle = C.pelo; for (let i = -2; i <= 2; i++) { x.beginPath(); x.arc(i * 44 + dx * 0.6, -112 + Math.abs(i) * 6, 44, 0, Math.PI * 2); x.fill(); }
  x.beginPath(); x.arc(-98 + dx * 0.4, -84, 30, 0, Math.PI * 2); x.fill(); x.beginPath(); x.arc(98 + dx * 0.4, -84, 30, 0, Math.PI * 2); x.fill();
}
// cuerpo con pies en (0,0), hacia arriba negativo; devuelve la altura del centro de la cabeza
const ALTO_CABEZA = -800;
function cuerpo(x, { brazoI = 12, brazoD = 12, cab = {} } = {}) {
  const brazo = (sg, ang) => { x.save(); x.translate(sg * 108, -628); x.rotate(-sg * ang * Math.PI / 180); pieza(x, rr(-21, -14, 42, 176, 21), C.jersey, C.sombra, [-8, -4]); pieza(x, ell(0, 164, 24, 28), C.piel, C.sombra, [-7, -6]); x.restore(); };
  // piernas y zapatos
  for (const sg of [-1, 1]) { pieza(x, rr(sg * 34 - 21, -340, 42, 300, 20), C.piel, C.sombra, [-9, -4]); pieza(x, ell(sg * 34 + sg * 6, -26, 36, 22), C.zapato, '#233a76', [-6, -5]); }
  // falda
  pieza(x, p => { p.beginPath(); p.moveTo(-84, -436); p.lineTo(84, -436); p.lineTo(112, -330); p.quadraticCurveTo(0, -306, -112, -330); p.closePath(); }, C.falda, '#c8453a', [-14, -6]);
  if (brazoI <= 90) brazo(-1, brazoI); if (brazoD <= 90) brazo(1, brazoD);
  // torso (suéter) y cuello
  pieza(x, rr(-36, -716, 72, 84, 20), C.piel, C.sombra, [-8, -30]);
  pieza(x, p => { p.beginPath(); p.moveTo(-118, -632); p.quadraticCurveTo(0, -668, 118, -632); p.lineTo(92, -424); p.lineTo(-92, -424); p.closePath(); }, C.jersey, '#cdb800', [-16, -5]);
  // cuello de rayas
  pieza(x, rr(-56, -704, 112, 50, 16), C.jersey, '#cdb800', [-8, -6]);
  x.strokeStyle = C.tinta; x.lineWidth = 3.5; x.lineCap = 'round'; for (let i = -4; i <= 4; i++) { x.beginPath(); x.moveTo(i * 12, -692); x.lineTo(i * 12 + 1, -664); x.stroke(); }
  if (brazoI > 90) brazo(-1, brazoI); if (brazoD > 90) brazo(1, brazoD);
  x.save(); x.translate(0, ALTO_CABEZA); cabeza(x, cab); x.restore();
}
const poner = (x, cx, base, s, op) => { x.save(); x.translate(cx, base); x.scale(s, s); cuerpo(x, op); x.restore(); };
const rotulo = (x, t, px, py, tam = 20, f = C.tinta) => { x.fillStyle = f; x.font = 'bold ' + tam + 'px sans-serif'; x.fillText(t, px, py); };

(async () => {
  const out = path.join(__dirname, '..', 'data-motor', 'lamina', 'estilos'); fs.mkdirSync(out, { recursive: true });
  // ── hoja de piezas ──
  { const W = 1500, H = 1000, c = createCanvas(W, H), x = c.getContext('2d'); x.fillStyle = C.crema; x.fillRect(0, 0, W, H); rotulo(x, 'ESTILO EDITORIAL PLANO: cuerpo + emociones + 12 bocas', 20, 34, 22);
    poner(x, 240, 960, 0.88, { brazoI: 14, brazoD: 160, cab: { bocaT: 'Aa' } });
    const em = [['normal', {}], ['parpadeo', { cierre: 1 }], ['feliz', { feliz: true, bocaT: 'Ee', ceja: 8 }], ['sorpresa', { bocaT: 'Oh', ceja: 16, my: -0.7 }], ['mirando lado', { mx: 1, bocaT: 'M' }], ['giro leve', { torcer: 1.2, bocaT: 'D' }]];
    em.forEach(([n, o], i) => { x.save(); x.translate(560 + (i % 3) * 300, 190 + ((i / 3) | 0) * 290); x.scale(0.55, 0.55); cabeza(x, o); x.restore(); rotulo(x, n, 520 + (i % 3) * 300, 330 + ((i / 3) | 0) * 290, 18); });
    BOCAS.forEach((b, i) => { const col = i % 6, fila = (i / 6) | 0, px = 520 + col * 160, py = 770 + fila * 120; x.fillStyle = C.piel; x.fillRect(px - 62, py - 40, 124, 80); x.save(); x.translate(px, py); boca(x, b, 90); x.restore(); rotulo(x, b, px - 14, py + 58, 16); });
    fs.writeFileSync(path.join(out, 'vector2-hoja.png'), c.toBuffer('image/png')); }
  // ── dos cuadros 9:16 con el diseño aprobado ──
  { const W = 540, H = 960, c = createCanvas(W * 2 + 30, H), x = c.getContext('2d'); x.fillStyle = '#222'; x.fillRect(0, 0, c.width, H);
    const cuadro = (ox, f) => { x.save(); x.translate(ox, 0); x.beginPath(); x.rect(0, 0, W, H); x.clip(); x.fillStyle = C.crema; x.fillRect(0, 0, W, H); f(); x.restore(); };
    const subt = (t, y) => { x.font = 'bold 34px sans-serif'; const w = x.measureText(t).width + 40; x.fillStyle = '#fff'; x.beginPath(); x.roundRect(W / 2 - w / 2, y - 40, w, 58, 14); x.fill(); x.lineWidth = 3; x.strokeStyle = C.tinta; x.stroke(); x.fillStyle = C.tinta; x.fillText(t, W / 2 - w / 2 + 20, y); };
    // A: sin video, muñeco protagonista al centro
    cuadro(0, () => { rotulo(x, 'A · sin video: la marioneta es la protagonista', 14, 24, 15, '#6b5d3f'); poner(x, W / 2, 790, 0.7, { brazoI: 14, brazoD: 150, cab: { bocaT: 'Oh', ceja: 14, my: -0.5 } }); subt('Se quedó sin palabras', 880); });
    // B: video flotante + tarjeta baja + muñeco chico
    cuadro(W + 30, () => { rotulo(x, 'B · con video: ventana flotante + tarjeta baja', 14, 24, 15, '#6b5d3f');
      x.save(); x.translate(W * 0.22, H * 0.48 - 200); x.rotate(-0.03); x.fillStyle = '#9aa0a6'; x.beginPath(); x.roundRect(0, 0, W * 0.56, 400, 16); x.fill(); x.lineWidth = LW; x.strokeStyle = C.tinta; x.stroke(); rotulo(x, 'clip · 3 s', 70, 205, 26, '#fff'); x.restore();
      pieza(x, rr(W * 0.56, 640, 200, 74, 18), '#fff', C.sombra, [-8, -6]); rotulo(x, '3 premios', W * 0.56 + 20, 688, 28);
      poner(x, 130, 790, 0.38, { brazoI: 14, brazoD: 20, cab: { bocaT: 'D', mx: 1 } }); subt('Ganó tres premios', 880); });
    fs.writeFileSync(path.join(out, 'vector2-cuadros.png'), c.toBuffer('image/png')); }
  console.log('ok');
})().catch(e => { console.error(e); process.exit(1); });

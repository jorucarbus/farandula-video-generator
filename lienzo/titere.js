// Marioneta 2D estilo "Adobe Character Animator", en código: cuerpo genérico (mujer u hombre) con respiración, balanceo,
// gestos al hablar y PLANTILLAS de acción (señalar, celebrar, encoger hombros, sorpresa, caminar); la cabeza es una foto
// recortada en óvalo con la mandíbula separada, que se abre según la envolvente de la voz (lip-sync de recortes).
// Solo se programa el movimiento: el modelo elige la plantilla de un enum cerrado y los tiempos salen de las palabras.
// Medidas en fracción de la altura H de la marioneta; origen en el suelo, entre los pies; y negativo = arriba.
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { lerp, acotar, easeOutCubic, easeOutBack } = require('../overlay/animacion');
const B = require('./base');

const RAD = Math.PI / 180;
const PLANTILLAS = ['senalar', 'celebrar', 'encoger', 'sorpresa', 'caminar'];
const PIERNA = 0.30, TORSO = 0.28, CUELLO = 0.03, CAB_H = 0.39, CAB_W = 0.35, BR1 = 0.13, BR2 = 0.12; // cabeza grande: caricatura de recorte
const PALETAS = {
  mujer: { piel: '#E9BC9B', ropa: '#16A37A', ropaOscura: '#0E7A5A', pierna: '#E9BC9B', zapato: '#2A2A2E', pelo: '#3B2A22' },
  hombre: { piel: '#D8A47F', ropa: '#2F4B8F', ropaOscura: '#1F3469', pierna: '#2B2D3A', zapato: '#18181B', pelo: '#2A2320' },
};
const bump = (t, t0, dur) => { const x = (t - t0) / dur; return x <= 0 || x >= 1 ? 0 : Math.pow(Math.sin(Math.PI * x), 2); };
const meseta = (t, t0, t1, ent = 0.25) => acotar((t - t0) / ent) * acotar((t1 - t) / ent);

// Foto → cabeza ovalada lista para animar. recorte: óvalo en fracciones de la imagen { cx, cy, rx, ry }.
// recorte.boca: altura de la línea de los labios dentro de la cabeza (0..1) para esta foto.
async function cabezaDesdeFoto(foto, { cx = 0.5, cy = 0.4, rx = 0.3, ry = 0.2, boca } = {}, ancho, alto) {
  const img = Buffer.isBuffer(foto) ? await loadImage(foto) : await loadImage(require('fs').readFileSync(foto));
  const c = createCanvas(ancho, alto), x = c.getContext('2d');
  x.beginPath(); x.ellipse(ancho / 2, alto / 2, ancho / 2, alto / 2, 0, 0, Math.PI * 2); x.clip();
  x.drawImage(img, (cx - rx) * img.width, (cy - ry) * img.height, 2 * rx * img.width, 2 * ry * img.height, 0, 0, ancho, alto);
  if (boca !== undefined) c.boca = boca;
  return c;
}

// Cabeza genérica dibujada (cuando no hay foto): óvalo con ojos, cejas y boca que sigue la abertura.
function cabezaGenerica(ancho, alto, paleta, genero) {
  const c = createCanvas(ancho, alto), x = c.getContext('2d');
  x.fillStyle = paleta.pelo; x.beginPath(); x.ellipse(ancho / 2, alto * 0.45, ancho / 2, alto * 0.5, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = paleta.piel; x.beginPath(); x.ellipse(ancho / 2, alto * 0.56, ancho * 0.43, alto * 0.42, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#fff'; for (const sx of [-1, 1]) { x.beginPath(); x.ellipse(ancho / 2 + sx * ancho * 0.17, alto * 0.48, ancho * 0.075, alto * 0.06, 0, 0, Math.PI * 2); x.fill(); }
  x.fillStyle = '#222'; for (const sx of [-1, 1]) { x.beginPath(); x.arc(ancho / 2 + sx * ancho * 0.17, alto * 0.485, ancho * 0.035, 0, Math.PI * 2); x.fill(); }
  x.strokeStyle = paleta.pelo; x.lineWidth = ancho * 0.03; x.lineCap = 'round'; for (const sx of [-1, 1]) { x.beginPath(); x.moveTo(ancho / 2 + sx * ancho * 0.1, alto * 0.37); x.lineTo(ancho / 2 + sx * ancho * 0.25, alto * 0.36); x.stroke(); }
  x.fillStyle = 'rgba(233,120,120,0.35)'; for (const sx of [-1, 1]) { x.beginPath(); x.ellipse(ancho / 2 + sx * ancho * 0.28, alto * 0.62, ancho * 0.06, alto * 0.04, 0, 0, Math.PI * 2); x.fill(); }
  return c;
}

// Cabeza con mandíbula: la parte de abajo (desde 62 % del alto) se estira hacia abajo SIN separarse (no hay hueco) y
// sobre los labios (a `boca` del alto) se abre una boca oscura que crece con la voz. Con ap = 0 es la foto intacta.
function dibujarCabeza(ctx, cab, w, h, ap, boca = cab.boca ?? 0.655) {
  const corte = Math.round(cab.height * 0.62), estira = 1 + Math.min(1, ap) * 0.13;
  ctx.save(); ctx.translate(-w / 2, -h / 2);
  ctx.drawImage(cab, 0, 0, cab.width, corte + 1, 0, 0, w, h * 0.62 + 1);
  ctx.drawImage(cab, 0, corte, cab.width, cab.height - corte, 0, h * 0.62, w, h * 0.38 * estira);
  if (ap > 0.08) {
    const cy = h * boca + ap * h * 0.02, rx = w * 0.14 * (0.75 + ap * 0.45), ry = Math.max(1, h * 0.05 * ap);
    const g = ctx.createRadialGradient(w / 2, cy, 0, w / 2, cy, rx); g.addColorStop(0, '#2A0A10'); g.addColorStop(0.75, '#4A1A20'); g.addColorStop(1, 'rgba(74,26,32,0.85)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(w / 2, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(245,238,230,0.9)'; ctx.beginPath(); ctx.ellipse(w / 2, cy - ry * 0.6, rx * 0.74, Math.max(0.5, ry * 0.2), 0, 0, Math.PI); ctx.fill(); // dientes de arriba
  }
  ctx.restore();
}

function capsula(ctx, x0, y0, x1, y1, ancho, color) {
  ctx.strokeStyle = color; ctx.lineWidth = ancho; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
}

// Dibuja el cuerpo completo en (0,0) = suelo. j = articulaciones del cuadro (ver articular()).
function dibujarFigura(ctx, { H, genero, paleta, cabeza, j, ap }) {
  const mujer = genero === 'mujer', hipY = -PIERNA * H, sh = (mujer ? 0.075 : 0.095) * H;
  ctx.save(); ctx.translate(j.balanceoX * H, -j.saltoY * H);
  // piernas
  for (const [lado, ang] of [[-1, j.piernaI], [1, j.piernaD]]) {
    ctx.save(); ctx.translate(lado * (mujer ? 0.04 : 0.05) * H, hipY); ctx.rotate(ang * RAD);
    capsula(ctx, 0, 0, 0, PIERNA * H * 0.93, 0.062 * H, paleta.pierna);
    ctx.fillStyle = paleta.zapato; ctx.beginPath(); ctx.ellipse(lado * 0.012 * H, PIERNA * H * 0.97, 0.05 * H, 0.022 * H, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // torso (respira: estira un poco hacia arriba) con todo lo que cuelga de él
  ctx.save(); ctx.translate(0, hipY); ctx.rotate(j.torsoAng * RAD); ctx.scale(1 + j.respira * 0.25, (1 + j.respira) * j.escalaY);
  ctx.fillStyle = paleta.ropa; ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = Math.max(1.5, H * 0.004); ctx.lineJoin = 'round';
  ctx.beginPath();
  if (mujer) { // vestido: hombros → cintura → vuelo
    ctx.moveTo(-sh, -TORSO * H); ctx.lineTo(sh, -TORSO * H); ctx.quadraticCurveTo(0.07 * H, -0.12 * H, 0.14 * H, 0.1 * H);
    ctx.quadraticCurveTo(0, 0.13 * H, -0.14 * H, 0.1 * H); ctx.quadraticCurveTo(-0.07 * H, -0.12 * H, -sh, -TORSO * H);
  } else { // camisa recta con esquinas suaves
    const a = 0.095 * H; ctx.moveTo(-a, -TORSO * H + 0.02 * H); ctx.quadraticCurveTo(-a, -TORSO * H, -a + 0.025 * H, -TORSO * H); ctx.lineTo(a - 0.025 * H, -TORSO * H);
    ctx.quadraticCurveTo(a, -TORSO * H, a, -TORSO * H + 0.02 * H); ctx.lineTo(a * 0.9, 0.02 * H); ctx.lineTo(-a * 0.9, 0.02 * H); ctx.closePath();
  }
  ctx.fill(); ctx.stroke();
  if (mujer) { ctx.fillStyle = paleta.ropaOscura; ctx.fillRect(-0.062 * H, -0.135 * H, 0.124 * H, 0.014 * H); } // cinturón
  // brazos: manga corta (ropa) en el brazo y piel en el antebrazo y la mano
  for (const [lado, br] of [[-1, j.brazoI], [1, j.brazoD]]) {
    ctx.save(); ctx.translate(lado * sh * 0.96, -TORSO * H + 0.025 * H); ctx.rotate(lado === -1 ? br.a * RAD : -br.a * RAD);
    capsula(ctx, 0, 0, 0, BR1 * H, 0.05 * H, paleta.ropa);
    ctx.translate(0, BR1 * H); ctx.rotate(lado === -1 ? br.c * RAD : -br.c * RAD);
    capsula(ctx, 0, 0, 0, BR2 * H, 0.042 * H, paleta.piel);
    ctx.fillStyle = paleta.piel; ctx.beginPath(); ctx.arc(0, BR2 * H + 0.01 * H, 0.03 * H, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // cuello y cabeza (pivote en la base de la cabeza)
  capsula(ctx, 0, -TORSO * H + 0.01 * H, 0, -(TORSO + CUELLO) * H, 0.05 * H, paleta.piel);
  ctx.save(); ctx.translate(0, -(TORSO + CUELLO) * H + 0.02 * H + j.cabezaDy * H); ctx.rotate(j.cabezaAng * RAD);
  ctx.translate(0, -CAB_H * H / 2 + 0.01 * H);
  dibujarCabeza(ctx, cabeza, CAB_W * H, CAB_H * H, ap);
  ctx.restore();
  ctx.restore(); // torso
  ctx.restore();
}

// Articulaciones en el segundo t. en = energía de la voz (0..1). gestos: de las palabras; acciones: plantillas explícitas.
function articular(t, en, gestos, acciones) {
  const j = { respira: Math.sin(Math.PI * 2 * t / 3.3) * 0.012, balanceoX: Math.sin(Math.PI * 2 * t / 4.7) * 0.007, torsoAng: Math.sin(Math.PI * 2 * t / 5.3) * 1.2,
    cabezaAng: Math.sin(Math.PI * 2 * t / 5.1 + 1) * 2.2 + en * 2.6 * Math.sin(Math.PI * 2 * 2.1 * t), cabezaDy: en * 0.006 * Math.sin(Math.PI * 2 * 3.4 * t),
    brazoI: { a: 9 + Math.sin(Math.PI * 2 * t / 3.1) * 2, c: 5 }, brazoD: { a: 9 + Math.sin(Math.PI * 2 * t / 3.1 + 2) * 2, c: 5 },
    piernaI: 2, piernaD: -2, saltoY: 0, escalaY: 1 };
  for (const g of gestos) { // gestos al hablar: el brazo sube y el antebrazo se abre, con un rebote suave
    const b = bump(t, g.t, g.dur); if (!b) continue;
    const br = g.lado === 'I' ? j.brazoI : j.brazoD, otro = g.lado === 'I' ? j.brazoD : j.brazoI;
    br.a += 42 * g.amp * b; br.c += 58 * g.amp * b; otro.a += 8 * g.amp * b; j.cabezaAng += (g.lado === 'I' ? -1 : 1) * 3 * b;
  }
  for (const a of acciones) {
    const m = meseta(t, a.t0, a.t1); if (!m) continue;
    const tt = t - a.t0, mezclar = (x, y) => lerp(x, y, m);
    if (a.plantilla === 'senalar') { const br = a.lado === 'I' ? j.brazoI : j.brazoD; br.a = mezclar(br.a, 96); br.c = mezclar(br.c, 4); j.cabezaAng += (a.lado === 'I' ? -1 : 1) * 4 * m; j.torsoAng += (a.lado === 'I' ? -1 : 1) * 2 * m; }
    if (a.plantilla === 'celebrar') { for (const br of [j.brazoI, j.brazoD]) { br.a = mezclar(br.a, 150 + 12 * Math.sin(Math.PI * 2 * 2.4 * tt)); br.c = mezclar(br.c, 14); } j.saltoY += Math.abs(Math.sin(Math.PI * 2 * 1.2 * tt)) * 0.03 * m; }
    if (a.plantilla === 'encoger') { for (const br of [j.brazoI, j.brazoD]) { br.a = mezclar(br.a, 34); br.c = mezclar(br.c, 62); } j.cabezaAng += 6 * m; j.cabezaDy += -0.012 * m; }
    if (a.plantilla === 'sorpresa') { for (const br of [j.brazoI, j.brazoD]) { br.a = mezclar(br.a, 58); br.c = mezclar(br.c, 48); } j.escalaY *= 1 + 0.05 * bump(tt, 0, 0.35); j.saltoY += 0.035 * bump(tt, 0, 0.4); }
    if (a.plantilla === 'caminar') { const s = Math.sin(Math.PI * 2 * 1.9 * tt); j.piernaI = 22 * s * m; j.piernaD = -22 * s * m; j.brazoI.a = mezclar(j.brazoI.a, 9 + 15 * -s); j.brazoD.a = mezclar(j.brazoD.a, 9 + 15 * s); j.saltoY += Math.abs(s) * 0.006 * m; }
  }
  return j;
}

// Gestos automáticos: uno por frase (cortada en la puntuación) cuando dura >1 s, alternando brazo; dos si es larga.
function gestosDePalabras(palabras, t0, t1, semilla = 5) {
  const r = B.rng(semilla), grupos = []; let actual = [];
  for (const p of palabras.filter(x => x.t0 >= t0 && x.t1 <= t1)) { actual.push(p); if (/[.,;:!?]$/.test(p.palabra)) { grupos.push(actual); actual = []; } }
  if (actual.length) grupos.push(actual);
  const gestos = []; let lado = r() < 0.5 ? 'I' : 'D';
  for (const g of grupos) {
    const ini = g[0].t0, fin = g[g.length - 1].t1, dur = fin - ini; if (dur < 1.0) continue;
    gestos.push({ t: ini + dur * 0.3, dur: 0.9, lado, amp: 0.6 + 0.4 * r() }); lado = lado === 'I' ? 'D' : 'I';
    if (dur > 3.4) { gestos.push({ t: ini + dur * 0.7, dur: 0.9, lado, amp: 0.6 + 0.4 * r() }); lado = lado === 'I' ? 'D' : 'I'; }
  }
  return gestos;
}

// Elemento del lienzo. foto: Buffer|ruta (opcional). voz: salida de voz.envolventeDeVoz. palabras: [{palabra,t0,t1}].
function titere({ genero = 'mujer', paleta = {}, foto = null, recorte = {}, cx = 0.5, base = 0.9, alto = 0.40, voz = null, palabras = [], acciones = [], t0, t1 }) {
  const pal = { ...PALETAS[genero], ...paleta };
  const gestos = gestosDePalabras(palabras, t0, t1);
  let cabeza = null, fig = null, tinta = null;
  return {
    t0, t1, flota: false, gestos,
    eventos: [{ t: t0, sonido: 'pop' }, ...acciones.filter(a => a.plantilla === 'sorpresa').map(a => ({ t: a.t0, sonido: 'golpe', db: -6 })), ...acciones.filter(a => a.plantilla === 'celebrar').map(a => ({ t: a.t0, sonido: 'ding' }))],
    async preparar({ w, h }) {
      const H = h * alto, cw = Math.round(CAB_W * H), ch = Math.round(CAB_H * H);
      cabeza = foto ? await cabezaDesdeFoto(foto, recorte, cw, ch) : cabezaGenerica(cw, ch, pal, genero);
      fig = createCanvas(Math.round(H * 1.5), Math.round(H * 1.3)); tinta = createCanvas(fig.width, fig.height);
    },
    dibujar(ctx, { t, tAbs, w, h, u, estilo }) {
      const H = h * alto, X = w * cx, Y = h * base, fps = (voz && voz.fps) || 30, fi = Math.max(0, Math.floor(tAbs * fps));
      const ap = voz ? (voz.abertura[fi] ?? 0) : 0, en = voz ? (voz.energia[fi] ?? 0) : 0;
      const j = articular(tAbs, en, gestos, acciones);
      const fx = fig.getContext('2d'); fx.clearRect(0, 0, fig.width, fig.height);
      fx.save(); fx.translate(fig.width / 2, fig.height * 0.96); dibujarFigura(fx, { H, genero, paleta: pal, cabeza, j, ap }); fx.restore();
      const e = lerp(0.9, 1, easeOutBack(t / 0.4, 1.4)), r = Math.max(3, H * 0.011);
      B.sombraDeContacto(ctx, X, Y + H * 0.01, H * 0.22 * e, H * 0.035 * e, 0.28 * acotar(t / 0.3));
      ctx.save(); ctx.globalAlpha *= acotar(t / 0.12); ctx.translate(X, Y); ctx.scale(e, e); ctx.translate(-fig.width / 2, -fig.height * 0.96);
      const tx = tinta.getContext('2d'); tx.clearRect(0, 0, tinta.width, tinta.height); tx.globalCompositeOperation = 'source-over'; tx.drawImage(fig, 0, 0); tx.globalCompositeOperation = 'source-in'; tx.fillStyle = '#fff'; tx.fillRect(0, 0, tinta.width, tinta.height);
      for (let k = 0; k < 12; k++) ctx.drawImage(tinta, Math.cos(k * Math.PI / 6) * r, Math.sin(k * Math.PI / 6) * r); // contorno blanco de pegatina
      B.sombraDeCapa(ctx, u, 0.25, 0.22); ctx.drawImage(fig, 0, 0); B.sinSombra(ctx);
      ctx.restore();
    },
  };
}

module.exports = { titere, articular, gestosDePalabras, cabezaDesdeFoto, cabezaGenerica, PLANTILLAS, PALETAS };

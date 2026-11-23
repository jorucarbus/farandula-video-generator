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

const KIT = path.join(__dirname, '..', 'assets', 'kit');
const EMOCIONES = ['normal', 'feliz', 'sorpresa', 'enojo', 'triste'];
const ACCESORIOS = { corona: { archivo: 'corona', ancho: 0.62, dy: -0.47 } };       // fracción del ancho de la cabeza / del alto
const PEGATINAS = ['guante-pulgar', 'guante-abierto', 'guante-senalar', 'baston', 'corona'];
const cache = new Map();
const piezaKit = async n => { if (!cache.has(n)) cache.set(n, loadImage(fs.readFileSync(path.join(KIT, `${n}.png`)))); return cache.get(n); };
const existePieza = n => /^[a-z0-9-]+$/.test(n) && fs.existsSync(path.join(KIT, `${n}.png`));

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

// ── Expresiones dibujadas sobre la foto (coordenadas con origen en el centro de la cabeza; w,h = tamaño de la cabeza) ──
function parche(ctx, x, y, rx, ry, color) { // tapa el ojo/ceja de la foto con el color de la piel, borde suave
  const g = ctx.createRadialGradient(x, y, Math.min(rx, ry) * 0.5, x, y, Math.max(rx, ry)); g.addColorStop(0, color); g.addColorStop(0.7, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx); ctx.translate(-x, -y); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rx, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}
function ojoAbierto(ctx, x, y, r, mirar = 0) { // ojo anime: esclera, iris grande, brillos
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = r * 0.16; ctx.beginPath(); ctx.ellipse(x, y, r * 1.05, r * 1.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#2a1a14'; ctx.beginPath(); ctx.ellipse(x + mirar * r * 0.2, y + r * 0.05, r * 0.62, r * 0.78, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + mirar * r * 0.2 - r * 0.2, y - r * 0.28, r * 0.2, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(x + mirar * r * 0.2 + r * 0.22, y + r * 0.2, r * 0.1, 0, Math.PI * 2); ctx.fill();
}
function ceja(ctx, x, y, largo, ang, grosor) { ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.strokeStyle = '#1b1b1b'; ctx.lineCap = 'round'; ctx.lineWidth = grosor; ctx.beginPath(); ctx.moveTo(-largo / 2, 0); ctx.lineTo(largo / 2, 0); ctx.stroke(); ctx.restore(); }
function estrella(ctx, x, y, r, color = '#FFE27A') { ctx.save(); ctx.translate(x, y); ctx.fillStyle = color; ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? r * 0.28 : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); ctx.restore(); }

function dibujarExpresion(ctx, { emocion, t, w, h, piel, anclas: a, ap }) {
  const ojoY = h * a.ojoY, dx = w * a.ojoDx, r = w * a.ojoR, bocaY = h * a.bocaY, p = easeOutBack(acotar(t / 0.25), 2);
  ctx.save(); ctx.scale(lerp(0.9, 1, p), lerp(0.9, 1, p)); ctx.globalAlpha = acotar(t / 0.08);
  const pielDe = s => (Array.isArray(piel) ? piel[s < 0 ? 0 : 1] : piel); // color de piel bajo CADA ojo
  const ojos = (f) => { for (const s of [-1, 1]) f(s * dx, ojoY, s); };
  if (emocion === 'sorpresa') {
    ojos((x, y, s) => { parche(ctx, x, y, r * 1.7, r * 1.5, pielDe(s)); ojoAbierto(ctx, x, y, r * 1.15); });
    for (const s of [-1, 1]) ceja(ctx, s * dx, ojoY - r * 2.1, r * 1.9, s * -0.12, w * 0.018);
    ctx.fillStyle = '#4A1A20'; ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = w * 0.012; ctx.beginPath(); ctx.ellipse(0, bocaY + h * 0.03, w * 0.07, h * 0.07 + ap * h * 0.03, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#7FC8F8'; ctx.beginPath(); ctx.moveTo(w * 0.36, ojoY - h * 0.1); ctx.quadraticCurveTo(w * 0.42, ojoY - h * 0.02, w * 0.36, ojoY + h * 0.02); ctx.quadraticCurveTo(w * 0.3, ojoY - h * 0.02, w * 0.36, ojoY - h * 0.1); ctx.fill(); // gota de sudor
  } else if (emocion === 'feliz') {
    ojos((x, y, s) => { parche(ctx, x, y, r * 1.35, r * 0.95, pielDe(s)); ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = w * 0.022; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(x, y + r * 0.5, r * 1.0, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); });
    for (const s of [-1, 1]) ceja(ctx, s * dx, ojoY - r * 1.9, r * 1.7, s * -0.18, w * 0.017);
    ctx.strokeStyle = '#7A2A30'; ctx.fillStyle = '#4A1A20'; ctx.lineWidth = w * 0.016; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-w * 0.11, bocaY - h * 0.01); ctx.quadraticCurveTo(0, bocaY + h * 0.085 + ap * h * 0.03, w * 0.11, bocaY - h * 0.01); if (ap > 0.08) { ctx.closePath(); ctx.fill(); } ctx.stroke(); // sonrisa (se abre al hablar)
    ctx.fillStyle = 'rgba(255,120,130,0.45)'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * w * 0.3, ojoY + h * 0.12, w * 0.07, h * 0.04, 0, 0, Math.PI * 2); ctx.fill(); }
    estrella(ctx, -w * 0.4, -h * 0.34, w * 0.05); estrella(ctx, w * 0.42, -h * 0.2, w * 0.035);
  } else if (emocion === 'enojo') {
    ojos((x, y, s) => { parche(ctx, x, y, r * 1.5, r * 1.2, pielDe(s)); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = r * 0.16; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.62, s * 0.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#2a1a14'; ctx.beginPath(); ctx.arc(x - s * r * 0.15, y, r * 0.38, 0, Math.PI * 2); ctx.fill(); });
    for (const s of [-1, 1]) ceja(ctx, s * dx * 0.95, ojoY - r * 1.3, r * 2.2, s * 0.42, w * 0.026);
    ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = w * 0.016; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-w * 0.1, bocaY + h * 0.02); ctx.quadraticCurveTo(0, bocaY - h * 0.03, w * 0.1, bocaY + h * 0.02); ctx.stroke();
    ctx.strokeStyle = '#D8232A'; ctx.lineWidth = w * 0.017; const vx = w * 0.3, vy = -h * 0.3; for (const [ax, ay] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.beginPath(); ctx.moveTo(vx + ax * w * 0.012, vy + ay * h * 0.012); ctx.quadraticCurveTo(vx + ax * w * 0.04, vy + ay * h * 0.01, vx + ax * w * 0.05, vy + ay * h * 0.05); ctx.stroke(); } // vena
  } else if (emocion === 'triste') {
    ojos((x, y, s) => { parche(ctx, x, y, r * 1.5, r * 1.3, pielDe(s)); ojoAbierto(ctx, x, y + r * 0.1, r * 1.0, -s * 0.1); });
    for (const s of [-1, 1]) ceja(ctx, s * dx, ojoY - r * 1.7, r * 1.8, s * 0.32, w * 0.017);
    ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = w * 0.014; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-w * 0.09, bocaY + h * 0.03); ctx.quadraticCurveTo(0, bocaY - h * 0.02, w * 0.09, bocaY + h * 0.03); ctx.stroke();
    ctx.fillStyle = '#7FC8F8'; const ly = ojoY + h * 0.1 + ((t * 1.2) % 1) * h * 0.18; for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * (dx + w * 0.03), ly, w * 0.016, h * 0.028, 0, 0, Math.PI * 2); ctx.fill(); }
  }
  if (ap > 0.08 && emocion === 'normal') { // boca dibujada que aparece SOLO cuando habla (estilo Robot Chicken)
    ctx.fillStyle = '#3A0E14'; ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = w * 0.012; ctx.beginPath(); ctx.ellipse(0, bocaY + ap * h * 0.02, w * 0.1 * (0.8 + ap * 0.3), h * 0.012 + ap * h * 0.05, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

// Elemento del lienzo. cabeza: foto (Buffer|ruta) + recorte (óvalo). Todo lo temporal en segundos ABSOLUTOS del video.
function muneco({ cuerpo = 'cuerpo-bastonera', cabeza, recorte = {}, anclas = {}, cx = 0.5, base = 0.9, alto = 0.5, t0, t1,
  saltos = [], poses = [], emociones = [], accesorios = [], pegatinas = [], voz = null }) {
  const A = { ojoY: -0.09, ojoDx: 0.2, ojoR: 0.062, bocaY: 0.155, ...anclas };
  const lista = [...emociones].sort((a, b) => a.t - b.t), cambios = [{ t: t0, pieza: cuerpo }, ...poses].sort((a, b) => a.t - b.t);
  let imgs = {}, ejes = {}, cab = null, piel = '#d9a37f', estado = null;
  const eventos = [{ t: t0 + 0.5, sonido: 'golpe' }, ...poses.map(p => ({ t: p.t, sonido: 'clic' })), ...saltos.map(t => ({ t, sonido: 'clic', db: -3 })),
    ...accesorios.map(a => ({ t: a.t + 0.45, sonido: 'ding' })), ...pegatinas.map(p => ({ t: p.t0, sonido: 'pop' })), ...lista.filter(e => e.t > t0).map(e => ({ t: e.t, sonido: 'trazo', db: -5 }))];
  const nuevoEstado = () => ({ ult: null, cabDx: new Resorte(150, 11), cabDy: new Resorte(170, 12), cabAng: new Resorte(130, 9), pegs: pegatinas.map(() => ({ x: new Resorte(90, 9), y: new Resorte(90, 9) })) });
  return {
    t0, t1, flota: false, eventos,
    async preparar({ w, h }) {
      const nombres = new Set([cuerpo, ...poses.map(p => p.pieza), ...accesorios.map(a => ACCESORIOS[a.id].archivo), ...pegatinas.map(p => p.id)]);
      for (const n of nombres) { if (!existePieza(n)) throw new Error(`pieza del kit desconocida: ${n}`); imgs[n] = await piezaKit(n); }
      for (const n of new Set([cuerpo, ...poses.map(p => p.pieza)])) ejes[n] = ejeCuello(imgs[n]);
      const H = h * alto, hh = Math.round(H * 0.42), hw = Math.round(hh * 0.92);
      cab = await cabezaDesdeFoto(cabeza, recorte, hw, hh);
      const muestra = fx => { const d = cab.getContext('2d').getImageData(Math.round(hw * fx) - 3, Math.round(hh * (0.5 + A.ojoY + 0.15)) - 3, 6, 6).data; return `rgb(${d[0]},${d[1]},${d[2]})`; };
      piel = [muestra(0.5 - A.ojoDx), muestra(0.5 + A.ojoDx)]; // piel justo bajo cada ojo: el tono que rodea al párpado
    },
    dibujar(ctx, { t, tAbs, w, h, u, estilo }) {
      if (!estado || tAbs < estado.ult) estado = nuevoEstado();
      const dt = estado.ult === null ? 0 : Math.min(0.1, tAbs - estado.ult); estado.ult = tAbs;
      const H = h * alto, X = w * cx, Y = h * base, hh = cab.height, hw = cab.width;
      // pose y emoción vigentes
      const pose = [...cambios].reverse().find(c => c.t <= tAbs) || cambios[0], poseIni = pose.t;
      const emo = [...lista].reverse().find(e => e.t <= tAbs) || { t: t0, e: 'normal' };
      const img = imgs[pose.pieza], bodyH = H * 0.60, e = bodyH / img.height, bodyW = img.width * e, eje = ejes[pose.pieza] * e;
      // movimiento del cuerpo: caída de entrada + saltos + respiración y balanceo
      const c = caida(tAbs - t0); let dy = c.dy, sy = c.sy;
      for (const tj of saltos) { const s = salto(tAbs, tj); dy += s.dy; sy *= s.sy; }
      const cambio = tAbs - poseIni; if (cambio >= 0 && cambio < 0.22 && pose.t > t0) sy *= 1 + 0.07 * Math.sin(Math.PI * cambio / 0.22); // pop al cambiar de pose
      sy *= 1 + 0.012 * Math.sin(tAbs * 2.1); const sx = 1 + (1 - sy) * 0.6, giro = Math.sin(tAbs * 1.3) * 0.022;
      // cabeza con resortes: se retrasa respecto al cuerpo (rebote)
      const obj = -dy * 0.35 * (c.dy > 0 ? 0 : 1);
      const hDy = estado.cabDy.paso(obj + (1 - sy) * 0.4, dt), hDx = estado.cabDx.paso(Math.sin(tAbs * 1.3) * 0.012, dt), hAng = estado.cabAng.paso(giro * 1.4 + (emo.e === 'enojo' ? 0.05 : emo.e === 'triste' ? -0.05 : 0), dt);
      const ap = voz ? (voz.abertura[Math.floor(tAbs * (voz.fps || 30))] ?? 0) : 0;
      // sombra de contacto: se achica cuando salta
      B.sombraDeContacto(ctx, X, Y + H * 0.005, bodyW * 0.62 * (1 - dy * 0.5), H * 0.03, 0.30 * acotar(t / 0.2) * (1 - Math.min(0.6, dy)));
      ctx.save(); ctx.globalAlpha *= acotar((tAbs - t0) / 0.05 + 0.0001); ctx.translate(X, Y - dy * H); ctx.rotate(giro); ctx.scale(sx, sy);
      B.sombraDeCapa(ctx, u, 0.35, 0.28); ctx.drawImage(img, -eje, -bodyH, bodyW, bodyH); B.sinSombra(ctx);
      // cabeza (centrada sobre el cuello, con la barbilla un poco sobre el cuello del traje)
      ctx.save(); ctx.translate(hDx * H, -bodyH - hh * 0.34 + hDy * H); ctx.rotate(hAng);
      B.sombraDeCapa(ctx, u, 0.3, 0.25); ctx.drawImage(cab, -hw / 2, -hh / 2); B.sinSombra(ctx);
      dibujarExpresion(ctx, { emocion: emo.e, t: tAbs - emo.t, w: hw, h: hh, piel, anclas: A, ap });
      for (const a of accesorios) { // el accesorio cae sobre la cabeza y se queda pegado
        const ac = ACCESORIOS[a.id], im = imgs[ac.archivo], tt = tAbs - a.t; if (tt < 0) continue;
        const aw = hw * ac.ancho, ah = aw * im.height / im.width, caidaY = tt < 0.45 ? -(1 - (tt / 0.45) ** 2) * hh * 1.1 : 0, rebote = tt >= 0.45 ? Math.exp(-(tt - 0.45) * 7) * Math.sin((tt - 0.45) * 22) * hh * 0.04 : 0;
        ctx.save(); ctx.translate(0, hh * ac.dy + caidaY + rebote); ctx.rotate(tt < 0.45 ? tt * 3 : Math.exp(-(tt - 0.45) * 7) * Math.sin((tt - 0.45) * 18) * 0.12);
        B.sombraDeCapa(ctx, u, 0.4, 0.3); ctx.drawImage(im, -aw / 2, -ah * 0.85, aw, ah); B.sinSombra(ctx); ctx.restore();
      }
      ctx.restore(); ctx.restore();
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

module.exports = { muneco, EMOCIONES, PEGATINAS, ACCESORIOS, Resorte, salto, caida, ejeCuello, piezaKit, existePieza, dibujarExpresion };

// MUÑECO ARTICULADO de plastilina (estilo Adobe Character Animator): el personaje está hecho de PIEZAS SUELTAS (cabeza sin cara, pelo, torso, falda,
// brazos, piernas) y todo movimiento, pose o gesto se logra moviendo esas piezas con código: ángulos en hombros, codos, cuello y cadera, resortes y
// un poco de squash & stretch. No hay una imagen por pose. La cara lleva expresiones modeladas (ver recortes.dibujarExpresion con limpia: true).
// Piezas: assets/kit-plastilina/rig/*.png (scripts/kit-piezas-armar.js). Las coordenadas del armado están en píxeles de esas piezas.
const fs = require('fs');
const path = require('path');
const { loadImage, createCanvas } = require('@napi-rs/canvas');
const { lerp, acotar, easeOutBack } = require('../overlay/animacion');
const B = require('./base');
const { Resorte, salto, caida, dibujarExpresion, piezaKit, ACCESORIOS, parpadea } = require('./recortes');

const RIG = path.join(__dirname, '..', 'assets', 'kit-plastilina', 'rig');
const GRAD = Math.PI / 180;

// ── Armado en reposo, por traje (origen en la parte de arriba del torso, x en el centro; y hacia abajo) ──────────────────────────────────────
// Posiciones en píxeles de las piezas. Los pivotes son fracciones del tamaño de cada pieza. alto = de la punta del pelo a los pies.
const COMUN = ['cabeza', 'pelo'];
const TRAJES_RIG = {
  bastonera: {
    piezas: [...COMUN, 'torso', 'falda', 'brazo-abierto', 'brazo-puno', 'pierna'], torso: 'torso', falda: 'falda', brazos: ['brazo-abierto', 'brazo-puno'], piernas: true,
    cabeza: { x: 0, y: 8, px: 0.5, py: 0.93 }, pelo: { x: 0, y: -212, px: 0.5, py: 0.06 }, torsoPiv: { px: 0.5, py: 0.97 }, faldaPos: { x: 0, y: 214, px: 0.5, py: 0.04 },
    hombro: { x: 118, y: 80 }, cadera: { x: 36, y: 300 }, pies: 598, alto: 838,
  },
  gala: { // corpiño con banda + falda larga hasta el suelo (sin piernas) + brazos desnudos
    piezas: [...COMUN, 'torso-gala', 'falda-gala', 'brazo-abierto-gala', 'brazo-puno-gala'], torso: 'torso-gala', falda: 'falda-gala', brazos: ['brazo-abierto-gala', 'brazo-puno-gala'], piernas: false,
    cabeza: { x: 0, y: 20, px: 0.5, py: 0.93 }, pelo: { x: 0, y: -200, px: 0.5, py: 0.06 }, torsoPiv: { px: 0.5, py: 0.96 }, faldaPos: { x: 0, y: 186, px: 0.5, py: 0.02 },
    hombro: { x: 100, y: 52 }, cadera: { x: 36, y: 300 }, pies: 634, alto: 862,
  },
};
// Traje de FOTOS (cuerpo y cabeza ficticios, scripts/kit-foto-rig.js): sin falda aparte, las dos piernas en una sola pieza, la cabeza se dibuja antes que el torso
// (el cuello queda detrás del cuello alto del uniforme) y la cara es la de la foto (sin expresiones dibujadas).
const RIG_FOTO = path.join(__dirname, '..', 'assets', 'foto-rig');
function registrarTrajeFoto(nombre, dir) { // un traje por persona: 'bastonera-foto' (cabeza genérica) y 'bastonera-foto@<slug>' (assets/foto-rig-<slug>)
  try { const m = JSON.parse(fs.readFileSync(path.join(dir, 'rig.json'), 'utf8')), pv = m.cabeza.pivoteY;
  TRAJES_RIG[nombre] = { dir, piezas: ['cabeza', 'pelo', 'torso', 'hombros', 'brazo-abierto', 'piernas', 'mano-relajada', 'mano-abierta', 'mano-puno', 'mano-senalar', ...m.bocas.lista.map(v => 'boca-' + v), ...(m.emociones ? m.emociones.lista.map(v => 'emo-' + v) : [])], torso: 'torso', falda: null, brazos: ['brazo-abierto', 'brazo-abierto'], piernas: true, piernasJuntas: true, cabezaAntes: true,
    cabeza: { x: 0, y: 26, px: 0.5, py: pv }, pelo: { x: 0, y: 26, px: 0.5, py: pv }, torsoPiv: { px: 0.5, py: 0 }, hombro: { x: m.CX - m.EJE_BRAZO, y: m.Y_HOMBRO + m.PIV_Y }, cadera: { x: 0, y: m.Y_CADERA - 2 }, pies: m.cuerpo.H, alto: m.cuerpo.H + m.cabeza.neckY + 4, long: m.largo, brazoPivY: m.PIV_Y, codoFrac: m.codoFrac, codoDuro: true, hombros: true, cabezaK: m.cabeza.k || 1, manoFotos: m.manos, muneca: m.muneca, bocasFoto: m.bocas, emocionesFoto: m.emociones, peloSigue: true, borde: { color: '#ffffff', grosor: 0.0055 }, caraFoto: m.cabeza.cara };
  } catch { /* sin piezas de foto: el traje no existe */ }
}
registrarTrajeFoto('bastonera-foto', RIG_FOTO);
for (const d of fs.readdirSync(path.join(__dirname, '..', 'assets'))) { const mm = /^foto-rig-(.+)$/.exec(d); if (mm) registrarTrajeFoto('bastonera-foto@' + mm[1], path.join(__dirname, '..', 'assets', d)); }
// ── Visemas (formas de la boca al hablar). Si la voz trae `visemas` (un nombre por cuadro; 'N' = boca en reposo) se usa tal cual; si no, se elige por la abertura. ──
const VISEMA_POR_ABERTURA = [[0.08, null], [0.22, 'Uh'], [0.40, 'D'], [0.58, 'Oh'], [0.76, 'Ee'], [2, 'Aa']];
function visemaAhora(voz, ap, tAbs) {
  if (voz && voz.visemas) { const v = voz.visemas[Math.floor(tAbs * (voz.fps || 30))]; return !v || v === 'N' ? null : v; }
  for (const [lim, v] of VISEMA_POR_ABERTURA) if (ap < lim) return v; return 'Aa';
}
// Visemas a partir del texto y los tiempos de cada palabra (español): reparte las sílabas de cada palabra a lo largo de su duración y deja la boca cerrada entre palabras.
// palabras: [{ texto, t0, t1 }] en segundos del video. → array de nombres por cuadro ('N' = reposo).
function visemasDesdePalabras(palabras, fps = 30, nCuadros = 0) {
  const total = nCuadros || Math.ceil(Math.max(0, ...palabras.map(p => p.t1)) * fps) + 1, out = new Array(total).fill('N');
  const VOC = { a: 'Aa', e: 'Ee', i: 'Ee', o: 'Oh', u: 'Woo' }, CON = { m: 'M', b: 'M', p: 'M', f: 'F', v: 'F', s: 'S', z: 'S', x: 'S', d: 'D', t: 'D', l: 'D', n: 'D', r: 'R', c: 'Uh', g: 'Uh', j: 'Uh', k: 'Uh', q: 'Uh', y: 'Uh', h: null };
  for (const p of palabras) {
    const letras = String(p.texto).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, ''), seq = [];
    for (let i = 0; i < letras.length; i++) { const c = letras[i], v = VOC[c] || CON[c]; if (!v) continue; if (seq.length && seq[seq.length - 1] === v) continue; seq.push(v); }
    if (!seq.length) continue; const dur = Math.max(0.05, p.t1 - p.t0), paso = dur / seq.length;
    seq.forEach((v, k) => { const a = Math.floor((p.t0 + k * paso) * fps), b = Math.max(a + 1, Math.floor((p.t0 + (k + 1) * paso) * fps)); for (let f = a; f < b && f < total; f++) if (f >= 0) out[f] = v; });
  }
  return out;
}
// Parpadeo de foto: un párpado del tono de la piel que tapa el ojo (borde difuminado) y una línea fina de pestañas; ctx ya está en el centro de la caja de la cara k.
function parpadeoFoto(ctx, k, tAbs, piel) {
  if (!parpadea(tAbs, 0.9)) return; const dx = k.w * ANCLAS_FOTO.ojoDx, oy = k.h * ANCLAS_FOTO.ojoY, R = k.w * ANCLAS_FOTO.ojoR, tono = Array.isArray(piel) ? piel : [piel, piel];
  [-1, 1].forEach((s, n) => { ctx.save(); ctx.translate(s * dx, oy); const g = ctx.createRadialGradient(0, 0, R * 0.5, 0, 0, R * 2.0); g.addColorStop(0, tono[n]); g.addColorStop(0.45, tono[n]); g.addColorStop(1, tono[n].replace('rgb(', 'rgba(').replace(')', ',0)'));
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, -R * 0.1, R * 2.0, R * 1.25, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(40,24,20,0.85)'; ctx.lineWidth = Math.max(1.2, k.w * 0.011); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-R * 1.25, R * 0.08); ctx.quadraticCurveTo(0, R * 0.5, R * 1.25, R * 0.08); ctx.stroke(); ctx.restore(); });
}
const ANCLAS_FOTO = { ojoY: 0.01, ojoDx: 0.17, ojoR: 0.058, bocaY: 0.33, bocaAncho: 0.118, cejaY: -0.075 }; // medidas sobre la foto de la cabeza ficticia (misma que usa recortes.muneco)
const LONG = { sup: 150, ant: 118 }; // brazo superior y antebrazo hasta el centro de la mano (píxeles del armado)
// Caja de la cara (píxeles de la pieza «cabeza») y anclas de ojos, cejas y boca relativas a ella
const CARA = { cx: 109, cy: 159, w: 150, h: 222 };
const ANCLAS = { ojoY: -0.20, ojoDx: 0.27, ojoR: 0.075, bocaY: 0.255, bocaAncho: 0.17, cejaY: -0.14 };

// ── Poses base y gestos: ángulos en grados. Para cada brazo: s = hombro (+ = hacia afuera), c = codo (+ = el antebrazo se dobla hacia el cuerpo) ──
const POSES = {
  reposo: { I: { s: 7, c: 5 }, D: { s: 7, c: 5 } },
  celebrar: { I: { s: 152, c: 6 }, D: { s: 152, c: 6 }, salta: true },
  senalar: { I: { s: 7, c: 5 }, D: { s: 92, c: 0 }, mano: { D: 'senalar' } },
};
// Cada gesto: duración (s), si los brazos se dibujan delante de la cabeza, y una función (τ en segundos desde el inicio) → dónde debe quedar la
// MANO de cada brazo ({ mx, my } en el espacio del brazo: mx > 0 = hacia afuera del cuerpo, my hacia abajo; origen = arriba del torso, centro) y
// la forma de la mano. Los ángulos de hombro y codo los calcula la cinemática inversa (ik). La cara está en y ≈ -240..28; las mejillas en ≈ -60.
const osc = (t, f, a) => Math.sin(t * f * 6.283) * a;
const GESTOS = {
  mejillas: { dur: 1.6, delante: true, j: () => ({ I: { mx: 92, my: -58, mano: 'abierto' }, D: { mx: 92, my: -58, mano: 'abierto' }, cabeza: -4 }) },            // manos a las mejillas (sorpresa)
  pecho: { dur: 1.6, delante: true, j: () => ({ D: { mx: -22, my: 100, mano: 'abierto', muneca: 25 }, cabeza: 5 }) },                                                       // mano al pecho (me conmueve)
  encoger: { dur: 1.2, j: t => ({ I: { mx: 168, my: 150, mano: 'abierto' }, D: { mx: 168, my: 150, mano: 'abierto' }, subir: 12 + osc(t, 2, 2), cabeza: -3 }) },     // encogerse de hombros
  aplauso: { dur: 1.6, delante: true, j: t => ({ I: { mx: 14 + osc(t, 3.2, 14), my: 120, mano: 'abierto' }, D: { mx: 14 + osc(t, 3.2, 14), my: 120, mano: 'abierto' } }) }, // aplauso
  cintura: { dur: 1.8, j: () => ({ I: { mx: 100, my: 214, mano: 'puno' }, D: { mx: 100, my: 214, mano: 'puno' }, cabeza: 4 }) },                                  // manos en la cintura (reto)
  boca: { dur: 1.6, delante: true, j: () => ({ D: { mx: 30, my: -18, mano: 'abierto' }, cabeza: -3 }) },                                                       // mano a la boca (chisme)
  senala_arriba: { dur: 1.8, j: t => ({ D: { mx: 150 + osc(t, 2.5, 6), my: -190, mano: 'senalar' }, cabeza: -4 }) },                                                        // señala el dato que está arriba
  cabeza: { dur: 1.8, delante: true, j: t => ({ I: { mx: 98, my: -196, mano: 'abierto' }, D: { mx: 98, my: -196, mano: 'abierto' }, cabeza: osc(t, 2, 3), subir: 4 }) },                // manos a la cabeza (no puede ser / me duele)
  menton: { dur: 2.0, delante: true, j: () => ({ D: { mx: 76, my: -44, mano: 'relajada' }, cabeza: 7 }) },                                                                          // pensativa, mano en el mentón (duda)
  asiente: { dur: 1.4, j: t => ({ cabeza: osc(t, 2.4, 7) }) },                                                                                                                 // asiente con la cabeza (de acuerdo)
  saludo: { dur: 1.8, j: t => ({ D: { mx: 175 + osc(t, 3, 22), my: -100, mano: 'abierto', muneca: osc(t, 3, 28) }, cabeza: 4 }) },                                                      // saludo con la mano
};

// Cinemática inversa de 2 huesos: dado el hombro S y el punto T donde debe llegar la mano, devuelve los ángulos { s, c } (grados) con el codo hacia afuera.
// L1 = brazo superior, L2 = antebrazo hasta el centro de la mano. Convención: 0° = el hueso cuelga hacia abajo, positivo = hacia afuera.
function ik(S, T, L1, L2) {
  const dx = T.x - S.x, dy = T.y - S.y; let d = Math.hypot(dx, dy); d = Math.min(L1 + L2 - 1, Math.max(Math.abs(L1 - L2) + 1, d));
  const a = Math.atan2(dy, dx), B = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
  let mejor = null;
  for (const sg of [1, -1]) {
    const th1 = a + sg * B, ex = S.x + L1 * Math.cos(th1), ey = S.y + L1 * Math.sin(th1), th2 = Math.atan2(T.y - ey, T.x - ex);
    const f1 = Math.atan2(Math.cos(th1), Math.sin(th1)), f2 = Math.atan2(Math.cos(th2), Math.sin(th2)); // ángulo desde «hacia abajo», positivo hacia afuera: φ = atan2(dx, dy)
    let c = f1 - f2; while (c > Math.PI) c -= 2 * Math.PI; while (c < -Math.PI) c += 2 * Math.PI;
    if (!mejor || ex > mejor.ex) mejor = { ex, s: f1 / GRAD, c: c / GRAD };
  }
  return { s: mejor.s, c: mejor.c };
}

// Elemento del lienzo. Misma interfaz que recortes.muneco para que el ensamblador lo use igual; kit: 'plastilina'.
// poses: [{ t, pieza }] con piezas 'cuerpo-bastonera[-celebrar|-senalar]'; gestos: [{ id, t }] (t absoluto, en la palabra ancla).
function titereRig({ traje = 'bastonera', cx = 0.5, base = 0.9, alto = 0.5, encuadres = [], entrada = 'caida', espejo = false, escalaExpr = 1.1, t0, t1, saltos = [], poses = [], emociones = [], accesorios = [], pegatinas = [], gestos = [], voz = null, anclas = {} }) {
  const A = { ...ANCLAS, ...anclas }, R = TRAJES_RIG[traje] || TRAJES_RIG.bastonera, LG = R.long || LONG, DIR = R.dir || RIG;
  const nombrePose = p => (/celebrar/.test(p) ? 'celebrar' : /senalar/.test(p) ? 'senalar' : 'reposo');
  const lineaPoses = [{ t: t0, pose: 'reposo' }, ...poses.map(p => ({ t: p.t, pose: nombrePose(p.pieza) }))].sort((a, b) => a.t - b.t);
  const lista = [...emociones].sort((a, b) => a.t - b.t), gs = [...gestos].sort((a, b) => a.t - b.t);
  let pielP = null, cabCara = null, img = {}, imgs = {}, piel = 'rgb(230,190,165)', estado = null;
  const eventos = [{ t: t0 + 0.5, sonido: 'golpe' }, ...poses.map(p => ({ t: p.t, sonido: 'clic' })), ...saltos.map(t => ({ t, sonido: 'clic', db: -3 })), ...gs.map(g => ({ t: g.t, sonido: 'pop', db: -6 })),
    ...accesorios.map(a => ({ t: a.t + 0.45, sonido: 'ding' })), ...pegatinas.map(p => ({ t: p.t0, sonido: 'pop' })), ...lista.filter(e => e.t > t0).map(e => ({ t: e.t, sonido: 'trazo', db: -5 }))];
  const nuevoEstado = () => ({ ult: null, enc: { cx: new Resorte(60, 17), base: new Resorte(60, 17), alto: new Resorte(60, 17), listo: false }, j: {}, pelo: new Resorte(60, 6), cab: new Resorte(140, 12), sw: new Resorte(90, 10), subir: new Resorte(120, 12), pegs: pegatinas.map(() => ({ x: new Resorte(90, 9), y: new Resorte(90, 9) })) });
  const spr = (k, nombre, objetivo, dt) => { const r = estado.j[nombre] || (estado.j[nombre] = new Resorte(170, 13)); if (r.listo !== true) { r.x = objetivo; r.listo = true; } return r.paso(objetivo, dt); };
  const el = {
    t0, t1, flota: false, eventos, gestosUsados: gs,
    async preparar() {
      for (const n of R.piezas) img[n] = await loadImage(fs.readFileSync(path.join(DIR, n + '.png')));
      for (const n of new Set([...accesorios.map(a => ACCESORIOS[a.id].archivo), ...pegatinas.map(p => p.id)])) imgs[n] = await piezaKit(n, 'plastilina');
      if (R.codoDuro) { const im = img[R.brazos[0]], fy = Math.round(im.height * R.codoFrac), cv2 = require('@napi-rs/canvas').createCanvas(im.width, 5), x2 = cv2.getContext('2d'); x2.drawImage(im, 0, fy - 2, im.width, 5, 0, 0, im.width, 5);
        const dd = x2.getImageData(0, 0, im.width, 5).data; let r0 = 0, g0 = 0, b0 = 0, n0 = 0, mn = 1e9, mx = -1; for (let yy = 0; yy < 5; yy++) for (let xx = 0; xx < im.width; xx++) { const o = (yy * im.width + xx) * 4; if (dd[o + 3] > 250 && dd[o] > 190 && Math.abs(dd[o] - dd[o + 2]) < 16) { r0 += dd[o]; g0 += dd[o + 1]; b0 += dd[o + 2]; n0++; if (xx < mn) mn = xx; if (xx > mx) mx = xx; } }
        if (n0) R.codoInfo = { col: `rgb(${Math.round(r0 / n0)},${Math.round(g0 / n0)},${Math.round(b0 / n0)})`, r: (mx - mn) / 2 }; }
      if (R.caraFoto) { // cara de FOTO: se borran ojos y boca reales y se dibujan expresiones y habla encima (recortes.dibujarExpresion con la cabeza como fuente del tono de piel)
        const k = R.caraFoto, KK = R.cabezaK || 1, im = require('@napi-rs/canvas').createCanvas(img.cabeza.width / KK, img.cabeza.height / KK); im.getContext('2d').drawImage(img.cabeza, 0, 0, im.width, im.height); // copia a la resolución del rig (para el borrado de piel y las muestras)
        const cw = Math.ceil(2 * Math.max(k.cx, im.width - k.cx)), chh = Math.ceil(2 * Math.max(k.cy, im.height - k.cy)), cc = require('@napi-rs/canvas').createCanvas(cw, chh);
        cc.getContext('2d').drawImage(im, cw / 2 - k.cx, chh / 2 - k.cy); cabCara = cc;
        const muestra = (x0, y0) => { const d = im.getContext ? null : null; const t = require('@napi-rs/canvas').createCanvas(6, 6), tx = t.getContext('2d'); tx.drawImage(im, x0, y0, 6, 6, 0, 0, 6, 6); const dd = tx.getImageData(0, 0, 6, 6).data; let r = 0, g = 0, b = 0, n = 0; for (let i = 0; i < dd.length; i += 4) if (dd[i + 3] > 200) { r += dd[i]; g += dd[i + 1]; b += dd[i + 2]; n++; } return n ? `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})` : 'rgb(230,190,165)'; };
        piel = [muestra(k.cx - k.w * 0.3, k.cy + k.h * 0.05), muestra(k.cx + k.w * 0.25, k.cy + k.h * 0.05)];
        { const a = muestra(k.cx - k.w * 0.17, k.cy + k.h * 0.13).match(/\d+/g).map(Number), b = muestra(k.cx + k.w * 0.17, k.cy + k.h * 0.13).match(/\d+/g).map(Number); pielP = `rgb(${Math.round((a[0] + b[0]) / 2)},${Math.round((a[1] + b[1]) / 2)},${Math.round((a[2] + b[2]) / 2)})`; } // tono de los párpados: media de las mejillas bajo los ojos
      } else if (!R.sinExpr) { const c = img.cabeza, cv = require('@napi-rs/canvas').createCanvas(8, 8), x = cv.getContext('2d'); x.drawImage(c, CARA.cx + CARA.w * 0.3, CARA.cy + CARA.h * 0.1, 8, 8, 0, 0, 8, 8);
      const d = x.getImageData(0, 0, 8, 8).data; let r = 0, g = 0, b = 0, n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; } if (n) piel = `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`; }
    },
    dibujar(ctx, { t, tAbs, w, h, u, estilo }) {
      if (!estado || tAbs < estado.ult) estado = nuevoEstado();
      const dt = estado.ult === null ? 0 : Math.min(0.1, tAbs - estado.ult); estado.ult = tAbs;
      // ENCUADRE: el muñeco puede cambiar de plano (cuerpo entero, medio, primer plano, acompañante abajo, al lado) con un movimiento suave de cámara
      const objE = encuadres.length ? ([...encuadres].reverse().find(q => q.t <= tAbs) || encuadres[0]) : { cx, base, alto };
      if (!estado.enc.listo) { estado.enc.cx.x = objE.cx; estado.enc.base.x = objE.base; estado.enc.alto.x = objE.alto; estado.enc.listo = true; }
      const cxV = estado.enc.cx.paso(objE.cx, dt), baseV = estado.enc.base.paso(objE.base, dt), altoV = estado.enc.alto.paso(objE.alto, dt);
      const H = h * altoV, X = w * cxV, Y = h * baseV, e = H / R.alto;
      const pose = POSES[[...lineaPoses].reverse().find(p => p.t <= tAbs).pose], emo = [...lista].reverse().find(v => v.t <= tAbs) || { t: t0, e: 'normal' };
      // gesto activo (con entrada y salida suaves)
      const g = gs.filter(q => q.t <= tAbs).pop(), G = g && GESTOS[g.id] && tAbs < g.t + GESTOS[g.id].dur ? GESTOS[g.id] : null, tau = g ? tAbs - g.t : 0;
      const peso = G ? acotar(tau / 0.28) * acotar((G.dur - tau) / 0.28) : 0, obj = G ? G.j(tau) : {};
      for (const L of ['I', 'D']) if (obj[L] && obj[L].mx !== undefined && !obj[L].s) Object.assign(obj[L], ik({ x: R.hombro.x, y: R.hombro.y - (obj.subir || 0) }, { x: obj[L].mx, y: obj[L].my }, LG.sup, LG.ant));
      const lado = L => ({ s: lerp(pose[L].s, obj[L] ? obj[L].s : pose[L].s, peso), c: lerp(pose[L].c, obj[L] ? obj[L].c : pose[L].c, peso) });
      const aI = lado('I'), aD = lado('D'), manoI = peso > 0.5 && obj.I && obj.I.mano ? obj.I.mano : (pose.mano && pose.mano.I) || 'relajada', manoD = peso > 0.5 && obj.D && obj.D.mano ? obj.D.mano : (pose.mano && pose.mano.D) || 'relajada';
      const munI = spr(0, 'mI', peso && obj.I && obj.I.muneca ? obj.I.muneca * peso : 0, dt), munD = spr(0, 'mD', peso && obj.D && obj.D.muneca ? obj.D.muneca * peso : 0, dt);
      const sI = spr(0, 'sI', aI.s, dt), cI = spr(0, 'cI', aI.c, dt), sD = spr(0, 'sD', aD.s, dt), cD = spr(0, 'cD', aD.c, dt);
      // cuerpo: caída de entrada, saltos y respiración
      const c = entrada === 'caida' ? caida(tAbs - t0) : { dy: 0, sy: 1 }; let dy = c.dy, sy = c.sy; // entrada: 'caida' (la primera vez que aparece) o 'fundido' (las demás: no vuelve a caer cada vez)
      for (const tj of saltos) { const s = salto(tAbs, tj); dy += s.dy; sy *= s.sy; }
      if (pose.salta) { const b = Math.abs(Math.sin(tAbs * 5.2)) * 0.035; dy += b; }
      sy *= 1 + 0.014 * Math.sin(tAbs * 2.1); const sx = 1 + (1 - sy) * 0.6, giro = Math.sin(tAbs * 1.3) * 0.02;
      const subir = estado.subir.paso(obj.subir && peso ? obj.subir * peso : 0, dt);
      const cabObj = (obj.cabeza || 0) * peso * GRAD + (emo.e === 'enojo' ? 0.05 : emo.e === 'triste' ? -0.06 : 0) + Math.sin(tAbs * 1.1) * 0.025 + (pose.salta ? Math.sin(tAbs * 5.2) * 0.07 : 0);
      const cabAng = estado.cab.paso(cabObj, dt), pelo = R.peloSigue ? cabAng : estado.pelo.paso((-cabAng * 1.3 + giro * 2 + (dy > 0 ? -0.05 : 0)) * (R.peloK ?? 1), dt); // peloSigue: el pelo de atrás gira EXACTAMENTE con la cabeza (si no, sobresale como una segunda pieza)
      const ap = voz ? (voz.abertura[Math.floor(tAbs * (voz.fps || 30))] ?? 0) : 0;
      B.sombraDeContacto(ctx, X, Y + H * 0.005, 240 * e * 0.62 * (1 - dy * 0.5), H * 0.03, 0.30 * acotar(t / 0.2) * (1 - Math.min(0.6, dy)));
      ctx.save(); ctx.globalAlpha *= acotar((tAbs - t0) / (entrada === 'fundido' ? 0.35 : 0.05) + 0.0001); ctx.translate(X, Y - dy * H); ctx.rotate(giro); ctx.scale(sx * e * (espejo ? -1 : 1), sy * e); ctx.translate(0, -R.pies); // espejo: el muñeco mira hacia el otro lado cuando ocupa el lado derecho
      const dib = (im, x, y, px, py, ang = 0, espejo = false, sombra = 0.35, kk = 1) => { // dibuja una pieza girando alrededor de su pivote (px, py fracciones)
        ctx.save(); ctx.translate(x, y); ctx.rotate(ang); if (espejo) ctx.scale(-1, 1); B.sombraDeCapa(ctx, u / e, sombra, 0.28 * 0); ctx.drawImage(im, -im.width / kk * px, -im.height / kk * py, im.width / kk, im.height / kk); B.sinSombra(ctx); ctx.restore();
      };
      // 1) pelo (detrás de todo, cuelga con resorte)
      dib(img.pelo, R.pelo.x, R.pelo.y - subir * (R.peloSigue ? 0.8 : 0.3), R.pelo.px, R.pelo.py, pelo, false, 0.3, R.cabezaK || 1);
      // 2) piernas y falda
      if (R.piernasJuntas) dib(img.piernas, 0, R.cadera.y, 0.5, 0, 0, false); else if (R.piernas) for (const lado of [-1, 1]) dib(img.pierna, lado * R.cadera.x, R.cadera.y, 0.5, 0.04, -lado * (pose.salta ? 0.12 : 0.02), lado < 0);
      if (R.falda) dib(img[R.falda], R.faldaPos.x, R.faldaPos.y, R.faldaPos.px, R.faldaPos.py, Math.sin(tAbs * 2.4) * 0.02 - giro, false);
      // 3) torso y brazos (en reposo los brazos van delante del torso; en gestos de cara, también delante de la cabeza)
      const brazo = (lado, s, c, mano, mun = 0) => { // lado -1 = izquierda de la pantalla; s, c en grados (+ hacia afuera / + doblar hacia el cuerpo)
        const im = img[mano === 'puno' ? R.brazos[1] : R.brazos[0]], wB = im.width, hB = im.height, cod = hB * (R.codoFrac ?? 0.5);
        ctx.save(); ctx.translate(lado * R.hombro.x, R.hombro.y - subir); if (lado > 0) ctx.scale(-1, 1); // espejo para el derecho: mismas convenciones
        ctx.rotate(s * GRAD);
        B.sombraDeCapa(ctx, u / e, 0.35, 0);
        if (R.codoDuro) { // codo en bisagra: dos tramos rígidos con ángulo marcado; un disco del color de la manga tapa la cuña que abre la esquina
          const piv = R.brazoPivY ?? 0, ci = R.codoInfo || { col: '#e8e8e8', r: wB * 0.3 };
          ctx.translate(-wB / 2, -piv);
          if (Math.abs(c) > 10) { ctx.beginPath(); ctx.arc(wB / 2, cod, ci.r * 0.72, 0, Math.PI * 2); ctx.fillStyle = ci.col; ctx.fill(); } // relleno de la esquina, debajo de los dos tramos
          ctx.save(); ctx.beginPath(); ctx.rect(0, 0, wB, cod + 2); ctx.clip(); ctx.drawImage(im, 0, 0); ctx.restore(); // brazo superior (con todo el hombro)
          ctx.save(); ctx.translate(wB / 2, cod); ctx.rotate(-c * GRAD); ctx.translate(-wB / 2, -cod);
          if (R.manoFotos) { // la mano es una pieza aparte: queda DETRÁS de la manga (la muñeca se esconde bajo el puño del uniforme) y gira en la muñeca
            const nm = R.manoFotos[mano] ? mano : mano === 'abierto' ? 'abierta' : 'relajada', mi = img['mano-' + nm], mf = R.manoFotos[nm];
            ctx.save(); ctx.translate(R.muneca.x, R.muneca.y - 10); ctx.rotate(mun * GRAD); ctx.drawImage(mi, -mf.ax, 0); ctx.restore(); }
          ctx.save(); ctx.beginPath(); ctx.rect(0, cod - 2, wB, hB - cod + 4); ctx.clip(); ctx.drawImage(im, 0, 0); ctx.restore(); ctx.restore(); // antebrazo (manga) por delante de la mano
          B.sinSombra(ctx); ctx.restore(); return;
        }
        // brazo superior (mitad de arriba) y antebrazo con mano (mitad de abajo, un poco solapadas), girando en el codo
        ctx.save(); ctx.beginPath(); ctx.rect(-wB, -hB * 0.03, wB * 2, cod + hB * 0.03); ctx.clip(); ctx.drawImage(im, -wB / 2, -hB * 0.03); ctx.restore();
        ctx.translate(0, cod); ctx.rotate(-c * GRAD);
        ctx.save(); ctx.beginPath(); ctx.rect(-wB, -hB * 0.05, wB * 2, hB); ctx.clip(); ctx.drawImage(im, -wB / 2, -cod); ctx.restore();
        B.sinSombra(ctx); ctx.restore();
      };
      // el torso se dibuja entre los brazos y la cabeza: primero brazos que van detrás del torso, luego torso, luego (opcional) brazos delante
      const delante = Boolean(G && G.delante && peso > 0.01);
      if (R.cabezaAntes) cabezaF();
      dib(img[R.torso], 0, -subir * 0.6, 0.5, 0, Math.sin(tAbs * 1.3 + 1) * 0.012, false);
      if (!delante || R.hombros) { brazo(-1, sI, cI, manoI, munI); brazo(1, sD, cD, manoD, munD); }
      if (R.hombros) dib(img.hombros, 0, -subir * 0.6, 0.5, 0, Math.sin(tAbs * 1.3 + 1) * 0.012, false); // el hombro del torso va encima del brazo: ahí está la unión
      // 4) cabeza con expresión modelada y accesorios (con cabezaAntes se dibuja antes del torso: el cuello queda detrás del cuello del traje)
      function cabezaF() {
      const hy = R.cabeza.y - subir * 0.8, im = img.cabeza, KK = R.cabezaK || 1, iw = im.width / KK, ih = im.height / KK;
      ctx.save(); ctx.translate(R.cabeza.x, hy); ctx.rotate(cabAng);
      B.sombraDeCapa(ctx, u / e, 0.3, 0); ctx.drawImage(im, -iw * R.cabeza.px, -ih * R.cabeza.py, iw, ih); B.sinSombra(ctx);
      ctx.save(); ctx.translate(CARA.cx - iw * R.cabeza.px, CARA.cy - ih * R.cabeza.py);
      // EMOCIÓN FOTOGRÁFICA (cejas, ojos y boca de la misma cara): entra y sale con un fundido corto; mientras dura no hay visemas ni parpadeo
      const EF = R.emocionesFoto ? R.emocionesFoto.lista : [], emoFoto = EF.includes(emo.e), emoDib = ['feliz', 'sorpresa', 'enojo', 'triste'].includes(emo.e) ? emo.e : 'normal', emoN = !emoFoto && emoDib === 'normal';
      if (EF.length) {
        const E = R.emocionesFoto, ix = lista.indexOf(emo), prev = ix > 0 ? lista[ix - 1] : null, a = Math.min(1, Math.max(0, (tAbs - emo.t) / 0.22)); ctx.restore();
        if (prev && EF.includes(prev.e) && a < 1) { ctx.globalAlpha *= 1 - a; ctx.drawImage(img['emo-' + prev.e], E.x - iw * R.cabeza.px, E.y - ih * R.cabeza.py, E.w, E.h); ctx.globalAlpha /= (1 - a) || 1; }
        if (emoFoto) { const g0 = ctx.globalAlpha; ctx.globalAlpha = g0 * a; ctx.drawImage(img['emo-' + emo.e], E.x - iw * R.cabeza.px, E.y - ih * R.cabeza.py, E.w, E.h); ctx.globalAlpha = g0; }
        ctx.save();
      }
      if (R.bocasFoto && emoN) { // boca FOTOGRÁFICA según lo que se dice (visema); en silencio queda la boca de la foto
        const vz = visemaAhora(voz, ap, tAbs), b = R.bocasFoto; ctx.restore(); if (vz && img['boca-' + vz]) ctx.drawImage(img['boca-' + vz], b.x - iw * R.cabeza.px, b.y - ih * R.cabeza.py, b.w, b.h); ctx.save();
      }
      if (R.caraFoto) { const k = R.caraFoto; ctx.restore(); ctx.save(); ctx.translate(k.cx - iw * R.cabeza.px, k.cy - ih * R.cabeza.py); if (emoFoto) { /* la emoción ya trae sus ojos */ } else if (emoN && R.bocasFoto) parpadeoFoto(ctx, k, tAbs, pielP || piel); // con la boca fotográfica el parpadeo también es de foto (párpado de piel + línea de pestañas)
        else dibujarExpresion(ctx, { emocion: emoDib, t: tAbs - emo.t, w: k.w, h: k.h, piel, anclas: ANCLAS_FOTO, ap: R.bocasFoto && emoDib === 'normal' ? 0 : ap, tAbs, fase: 0.9, cab: cabCara, escala: escalaExpr * 0.8, limpia: false }); }
      else if (!R.sinExpr) dibujarExpresion(ctx, { emocion: emo.e, t: tAbs - emo.t, w: CARA.w, h: CARA.h, piel, anclas: A, ap, tAbs, fase: 0.9, cab: null, escala: escalaExpr, limpia: true }); ctx.restore();
      for (const a of accesorios) { // el accesorio cae sobre la cabeza y se queda pegado
        const ac = ACCESORIOS[a.id], ia = imgs[ac.archivo], tt = tAbs - a.t; if (tt < 0) continue;
        const aw = iw * 0.72, ah = aw * ia.height / ia.width, cai = tt < 0.45 ? -(1 - (tt / 0.45) ** 2) * ih * 1.1 : 0, reb = tt >= 0.45 ? Math.exp(-(tt - 0.45) * 7) * Math.sin((tt - 0.45) * 22) * ih * 0.04 : 0;
        ctx.save(); ctx.translate(CARA.cx - iw * R.cabeza.px, -ih * R.cabeza.py + ih * 0.07 + cai + reb); ctx.rotate(tt < 0.45 ? tt * 3 : Math.exp(-(tt - 0.45) * 7) * Math.sin((tt - 0.45) * 18) * 0.12);
        B.sombraDeCapa(ctx, u / e, 0.4, 0); ctx.drawImage(ia, -aw / 2, -ah * 0.85, aw, ah); B.sinSombra(ctx); ctx.restore();
      }
      ctx.restore();
      }
      if (!R.cabezaAntes) cabezaF();
      if (delante && !R.hombros) { brazo(-1, sI, cI, manoI, munI); brazo(1, sD, cD, manoD, munD); }
      ctx.restore();
      // pegatinas flotantes (bastón…) con resortes y giro opcional
      pegatinas.forEach((p, i) => {
        if (tAbs < p.t0 || tAbs >= (p.t1 ?? t1)) return;
        const tt = tAbs - p.t0, im2 = imgs[p.id], pw = H * (p.ancho ?? 0.3), ph = pw * im2.height / im2.width, r = estado.pegs[i];
        const tx = X + (p.dx ?? 0.3) * H + Math.sin(tAbs * 2.2 + i) * H * 0.012, ty = Y - (p.dy ?? 0.5) * H + Math.cos(tAbs * 1.7 + i) * H * 0.014;
        if (!r.listo) { r.x.x = tx; r.y.x = ty - H * 0.25; r.listo = true; }
        const ex = r.x.paso(tx, dt), ey = r.y.paso(ty - (tt < 0.4 ? (1 - tt / 0.4) * H * 0.25 : 0), dt), pp = easeOutBack(acotar(tt / 0.35), 2);
        ctx.save(); ctx.translate(ex, ey); ctx.rotate((p.giro ? tAbs * 7 : Math.sin(tAbs * 2 + i) * 0.1) + (p.angulo ?? 0)); ctx.scale(lerp(0.3, 1, pp), lerp(0.3, 1, pp)); ctx.globalAlpha *= acotar(tt / 0.1);
        B.sombraDeCapa(ctx, u, 0.55, 0.3); ctx.drawImage(im2, -pw / 2, -ph / 2, pw, ph); B.sinSombra(ctx); ctx.restore();
      });
    },
  };
  // BORDE BLANCO tipo recorte/sticker (estilo de referencia): une las piezas en una sola silueta, tapa las costuras y despega al muñeco del fondo. Se dibuja el muñeco en un lienzo
  // aparte, se saca su silueta blanca, se estampa desplazada en varias direcciones y encima va el muñeco.
  if (R.borde) {
    const interno = el.dibujar; let off = null, sil = null;
    el.dibujar = (ctx, a) => {
      const { w, h, u } = a; if (!off || off.width !== w || off.height !== h) { off = createCanvas(w, h); sil = createCanvas(w, h); }
      const ox = off.getContext('2d'), sx = sil.getContext('2d'); ox.clearRect(0, 0, w, h); interno(ox, a);
      sx.globalCompositeOperation = 'source-over'; sx.clearRect(0, 0, w, h); sx.drawImage(off, 0, 0); sx.globalCompositeOperation = 'source-in'; sx.fillStyle = R.borde.color || '#ffffff'; sx.fillRect(0, 0, w, h);
      const g = Math.max(3, (R.borde.grosor ?? 0.0055) * (u || w)), N = 14;
      ctx.save(); ctx.shadowColor = 'rgba(40,30,20,0.32)'; ctx.shadowBlur = g * 2.2; ctx.shadowOffsetY = g * 0.9; ctx.drawImage(sil, 0, 0); ctx.restore(); // sombra suave bajo el borde: despega el recorte del fondo claro
      for (let k = 0; k < N; k++) { const an = (k / N) * Math.PI * 2; ctx.drawImage(sil, Math.cos(an) * g, Math.sin(an) * g); }
      ctx.drawImage(off, 0, 0);
    };
  }
  return el;
}

module.exports = { visemasDesdePalabras, ik, titereRig, POSES, GESTOS, TRAJES_RIG, CARA, ANCLAS };

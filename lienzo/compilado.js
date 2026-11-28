// ESCENA 16:9 del COMPILADO DIARIO en TRES COLUMNAS verticales (640 px cada una):
//   · izquierda  = TÍTULO de la noticia (logo del canal, "NOTICIA X DE N", titular) — siempre fija;
//   · las otras dos = VIDEO (ventana vertical 9:16 sobre fondo desenfocado) y ANIMACIONES (gráficos + subtítulos en forma de lettering, debajo del gráfico).
//   Video y animaciones se INTERCAMBIAN de lugar en cada noticia con un barrido (se cruzan), y flotan suavemente.
// Los clips de la biblioteca son TikToks verticales (9:16). Regla de los 3 s: cada toma se muestra como mucho USO_MAX_S (3 s) contando la transición;
// el tiempo de cada tramo se reparte en tomas IGUALES.
const fs = require('fs'), path = require('path'), os = require('os');
const { execFile } = require('child_process');
const { loadImage, createCanvas } = require('@napi-rs/canvas');
const { acotar, easeOutCubic, easeOutBack, lerp } = require('../overlay/animacion');
const B = require('./base');

const USO_MAX_S = 3.0, TRANS = 0.3, MAXC = USO_MAX_S - TRANS - 0.1; // 2,6 s por toma como máximo
const W = 1920, H = 1080, COL = W / 3, WH = Math.round(H * 0.91), WW = Math.round(WH * 9 / 16), VY = Math.round(H * 0.5); // ventana vertical 553×983 dentro de una columna de 640
const MARCAS = path.join(__dirname, '..', 'assets', 'marcas');

// Reparto de tomas por TRAMO (una oración de una noticia, la intro o el cierre): el tiempo real del tramo se divide en n tomas parejas (n = lo mínimo para no pasar de MAXC).
// tramo: { t0, t1, seg, items:[{id,ruta,duracion}] } con las tomas en orden de preferencia (la primera es la que mejor se relaciona con la frase). Cada toma se usa una vez en todo el video
// mientras haya otras; si se acaban, vuelve la menos usada pero arranca más adelante (otro tramo del mismo clip), nunca desde el mismo punto.
function planificarTomas(tramos, { ajustarSs = null } = {}) {
  const cortes = [], usos = new Map();
  for (const s of tramos) {
    const L = Math.max(0.6, s.t1 - s.t0), n = Math.max(1, Math.ceil(L / MAXC - 1e-9)), dur = L / n;
    if (!s.items.length) throw new Error(`el tramo ${s.t0.toFixed(1)}–${s.t1.toFixed(1)} s no tiene clips`);
    for (let k = 0; k < n; k++) {
      const c = s.items.find(x => !usos.get(x.id)) || [...s.items].sort((a, b) => (usos.get(a.id) || 0) - (usos.get(b.id) || 0))[0], v = usos.get(c.id) || 0; usos.set(c.id, v + 1);
      const largo = dur + TRANS + 0.1, tope = Math.max(0, (c.duracion || 99) - largo - 0.1); let ss = Math.min(tope, 0.2 + v * (dur + 0.4));
      if (ajustarSs && v === 0) ss = Math.min(tope, ajustarSs(c.ruta, ss));
      cortes.push({ clip: c.ruta, id: c.id, ss: Math.max(0, ss), t0: s.t0 + k * dur, t1: s.t0 + (k + 1) * dur, seg: s.seg, frase: s.frase || null });
    }
  }
  return cortes.sort((a, b) => a.t0 - b.t0);
}

const envolver = (ctx, texto, ancho) => { const pal = String(texto).split(/\s+/).filter(Boolean), out = []; let l = ''; for (const p of pal) { const t = l ? l + ' ' + p : p; if (ctx.measureText(t).width > ancho && l) { out.push(l); l = p; } else l = t; } if (l) out.push(l); return out; };
const pop = (t, d = 0.34) => { const x = acotar(t / d), c = 1.7; return 0.55 + 0.45 * (1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2)); }; // aparece con un pequeño rebote
const suave = k => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2); // entra y sale despacio (easeInOutCubic)

// DISTRIBUCIÓN: columna 0 = título (fija). Las columnas 1 y 2 alternan: video en la 1 (intro, noticia 2, 4…) o en la 2 (noticia 1, 3, cierre…); las animaciones ocupan la otra.
// Al empezar cada tramo se cruzan en 0,6 s (una sube y la otra baja para no chocar). → { video:{cx,dy,esc,giro}, anim:{cx,dy,alpha} }
const colVideo = si => (si % 2 === 0 ? 1 : 2), centro = c => COL * (c + 0.5), CRUCE = 0.6;
function distribucion(segmentos, tAbs) {
  let si = 0; for (let k = 0; k < segmentos.length; k++) if (segmentos[k].t0 <= tAbs + 0.001) si = k;
  const cur = colVideo(si), prev = si > 0 ? colVideo(si - 1) : cur, k = si > 0 ? acotar((tAbs - segmentos[si].t0) / CRUCE) : 1, e = k < 1 ? suave(k) : 1, mid = k < 1 ? Math.sin(Math.PI * k) : 0, sg = cur === 1 ? -1 : 1;
  return { si, video: { cx: lerp(centro(prev), centro(cur), e), dy: -mid * 60, esc: 1 - mid * 0.07, giro: sg * mid * 0.045 }, anim: { cx: lerp(centro(3 - prev), centro(3 - cur), e), dy: mid * 60, alpha: 1 - mid * 0.5 } };
}

// segmentos: [{ tipo:'intro'|'noticia'|'cierre', n, de, titular, dato, t0, t1 }]; marca: { paleta (de lienzo/portada.paletaDe), logo (ruta png) }; fecha: texto "27 DE NOVIEMBRE"
// graficos: [{ t0, t1, noticia (0-based), el }] con los componentes animados de lienzo/elementos.js (cifra, cita, lista, mapa); se dibujan en la columna de animaciones (y flotan).
function crearEscena({ cortes, segmentos, marca, fecha = '', estilo, t1, graficos = [] }) {
  let dir = null, fps = 30; const cuadros = [], memo = new Map(); let logo = null;
  const pal = marca.paleta, num = estilo.tipografia.numero, txt = estilo.tipografia.texto;
  const chica = createCanvas(24, 42), cch = chica.getContext('2d'); // el fondo desenfocado: el cuadro reducido a 24×42 y estirado con suavizado
  const cargar = a => { if (!memo.has(a)) { if (memo.size > 30) memo.delete(memo.keys().next().value); memo.set(a, fs.existsSync(a) ? loadImage(fs.readFileSync(a)) : Promise.resolve(null)); } return memo.get(a); };
  const cuadro = (ci, tAbs) => { const c = cortes[ci], idx = Math.min(cuadros[ci], Math.max(1, Math.floor((tAbs - c.t0) * fps) + 1)); for (let k = 1; k <= 3 && idx + k <= cuadros[ci]; k++) cargar(path.join(dir, `c${ci}_${String(idx + k).padStart(4, '0')}.jpg`)); return cargar(path.join(dir, `c${ci}_${String(idx).padStart(4, '0')}.jpg`)); };
  const circuloLogo = (ctx, cx, cy, r) => { if (!logo) return; ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip(); ctx.fillStyle = pal.fondoLogo; ctx.fillRect(cx - r, cy - r, r * 2, r * 2); const e = (r * 2) / Math.min(logo.width, logo.height); ctx.drawImage(logo, cx - logo.width * e / 2, cy - logo.height * e / 2, logo.width * e, logo.height * e); ctx.restore(); ctx.save(); ctx.lineWidth = Math.max(3, r * 0.05); ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); };
  const rotulo = (ctx, texto, x, y, tam, fuente, color, borde = 0) => { ctx.font = `${tam}px ${fuente}`; if (borde) { ctx.lineJoin = 'round'; ctx.lineWidth = borde; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.strokeText(texto, x, y); } ctx.fillStyle = color; ctx.fillText(texto, x, y); };
  // Zona de gráficos (parte alta de la columna de animaciones); el lettering de los subtítulos va debajo, en la parte baja de la misma columna.
  const PW = 590, PH = 600, PCY = 360, panel = createCanvas(PW, PH), pctx = panel.getContext('2d');
  const flote = (t, fase = 0, amp = 7, giroG = 0.45) => ({ dy: Math.sin(Math.PI * 2 * (t / 3.4) + fase) * amp, giro: Math.sin(Math.PI * 2 * (t / 4.6) + fase + 1) * giroG * Math.PI / 180 });
  const lay = tAbs => distribucion(segmentos, tAbs);
  return {
    t0: 0, t1, flota: false, layout: lay,
    eventos: [...segmentos.slice(1).map(s => ({ t: Math.max(0, s.t0 - 0.05), sonido: 'whoosh', db: -9 })), ...graficos.flatMap(g => g.el.eventos || [])],
    async preparar({ fps: f }) {
      fps = f; dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compilado-'));
      const p = path.join(MARCAS, marca.logo || ''); if (marca.logo && fs.existsSync(p)) logo = await loadImage(fs.readFileSync(p));
      const ffmpeg = process.env.FFMPEG_BIN || require('ffmpeg-static');
      const hacer = (c, ci) => new Promise((res, rej) => { const dur = c.t1 - c.t0 + TRANS + 0.1; cuadros[ci] = Math.ceil((dur - 0.1) * fps);
        execFile(ffmpeg, ['-y', '-loglevel', 'error', '-ss', String(c.ss || 0), '-t', String(dur), '-i', c.clip, '-an', '-vf', `fps=${fps},scale=${WW}:${WH}:force_original_aspect_ratio=increase,crop=${WW}:${WH}`, '-q:v', '5', path.join(dir, `c${ci}_%04d.jpg`)], { timeout: 120000 }, e => (e ? rej(e) : res())); });
      let i = 0; await Promise.all(Array.from({ length: 4 }, async () => { while (i < cortes.length) { const ci = i++; await hacer(cortes[ci], ci); } }));
      for (const g of graficos) if (g.el.preparar) await g.el.preparar({ w: PW, h: PH, fps });
    },
    async dibujar(ctx, { tAbs, w, h }) {
      let ci = 0; for (let k = 0; k < cortes.length; k++) if (cortes[k].t0 <= tAbs) ci = k;
      const c = cortes[ci], tt = tAbs - c.t0, enTrans = ci > 0 && tt < TRANS, p = enTrans ? easeOutCubic(acotar(tt / TRANS)) : 1;
      const imgA = await cuadro(ci, tAbs), imgP = enTrans ? await cuadro(ci - 1, tAbs) : null;
      const D = lay(tAbs), si = D.si, S = segmentos[si], ts = tAbs - S.t0;
      // 1) fondo: color del canal + cuadro desenfocado
      ctx.fillStyle = pal.degradado; ctx.fillRect(0, 0, w, h);
      const fondo = (img, a) => { if (!img) return; cch.drawImage(img, 0, 0, 24, 42); ctx.save(); ctx.globalAlpha = a; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; const e = Math.max(w / 24, h / 42); ctx.drawImage(chica, (w - 24 * e) / 2, (h - 42 * e) / 2, 24 * e, 42 * e); ctx.restore(); };
      if (enTrans) fondo(imgP, 1); fondo(imgA, enTrans ? p : 1);
      const g = ctx.createLinearGradient(0, 0, w, 0); g.addColorStop(0, 'rgba(0,0,0,0.60)'); g.addColorStop(0.5, 'rgba(0,0,0,0.38)'); g.addColorStop(1, 'rgba(0,0,0,0.55)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      // 2) VIDEO: ventana vertical en su columna (la que toque), con barrido de intercambio y flote suave
      const fv = flote(tAbs, 0, 6, 0.35), V = D.video;
      ctx.save(); ctx.translate(V.cx, VY + V.dy + fv.dy); ctx.rotate(V.giro + fv.giro); ctx.scale(V.esc, V.esc); ctx.translate(-WW / 2, -WH / 2);
      ctx.save(); B.sombraDeCapa(ctx, Math.min(w, h), 1.0, 0.5); ctx.fillStyle = '#fff'; B.rectRedondo(ctx, -8, -8, WW + 16, WH + 16, 26); ctx.fill(); B.sinSombra(ctx); ctx.restore();
      ctx.save(); B.rectRedondo(ctx, 0, 0, WW, WH, 20); ctx.clip();
      if (enTrans && imgP) ctx.drawImage(imgP, 0, 0, WW, WH); if (imgA) { ctx.globalAlpha = enTrans ? p : 1; ctx.drawImage(imgA, 0, 0, WW, WH); } ctx.restore();
      ctx.restore();
      // 3) TÍTULO (columna izquierda, fija): logo del canal, número de noticia y titular; en la intro y el cierre, el mensaje del tramo
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
      circuloLogo(ctx, 60 + 52, 40 + 52, 52); rotulo(ctx, (pal.nombre || '').toUpperCase(), 60 + 52 * 2 + 22, 40 + 52 + 14, 44, num, '#fff', 6);
      const LX = 60, LW = COL - 60 - 30, e = easeOutCubic(ts / 0.5), desl = (1 - e) * -90, ft = flote(tAbs, 1.3, 5, 0.3);
      ctx.save(); ctx.globalAlpha = e; ctx.translate(desl, ft.dy); ctx.rotate(ft.giro);
      if (S.tipo === 'noticia') {
        const etiqueta = `NOTICIA ${S.n} DE ${S.de}`; ctx.font = `34px ${txt}`; const ancho = ctx.measureText(etiqueta).width + 44;
        ctx.fillStyle = pal.acento; B.rectRedondo(ctx, LX, 200, ancho, 58, 29); ctx.fill(); rotulo(ctx, etiqueta, LX + 22, 241, 34, txt, '#fff');
        ctx.font = `124px ${num}`; envolver(ctx, String(S.titular || '').toUpperCase(), LW).slice(0, 5).forEach((l, i) => rotulo(ctx, l, LX, 390 + i * 118, 124, num, '#fff', 8));
      } else {
        const t1x = S.tipo === 'intro' ? 'LO MÁS FUERTE DEL DÍA' : 'GRACIAS POR VER', t2x = S.tipo === 'intro' ? fecha : 'SUSCRÍBETE';
        ctx.font = `124px ${num}`; const l1 = envolver(ctx, t1x, LW).slice(0, 4); l1.forEach((l, i) => rotulo(ctx, l, LX, 330 + i * 118, 124, num, '#fff', 8));
        ctx.font = `66px ${num}`; envolver(ctx, t2x, LW).slice(0, 2).forEach((l, i) => rotulo(ctx, l, LX, 330 + l1.length * 118 + 30 + i * 74, 66, num, pal.resalte, 6));
      }
      ctx.restore();
      // 4) ANIMACIONES (columna que toque): gráfico del momento arriba; el lettering de los subtítulos va debajo (lo dibuja crearSubtitulos con la misma distribución)
      const A = D.anim, gAct = graficos.find(x => tAbs >= x.t0 && tAbs < x.t1), hay = S.tipo === 'noticia' && graficos.some(x => x.noticia === S.n - 1), fg = flote(tAbs, 2.1, 9, 0.5);
      if (gAct) { // cifra con conteo, cita, lista o mapa, con flote suave
        pctx.clearRect(0, 0, PW, PH); pctx.save(); await gAct.el.dibujar(pctx, { t: tAbs - gAct.t0, tAbs, w: PW, h: PH, u: Math.min(PW, PH) * (gAct.escala || 1), estilo }); pctx.restore();
        ctx.save(); ctx.globalAlpha = acotar((gAct.t1 - tAbs) / 0.18) * A.alpha; ctx.translate(A.cx, PCY + A.dy + fg.dy); ctx.rotate(fg.giro); ctx.drawImage(panel, -PW / 2, -PH / 2); ctx.restore();
      } else if (S.tipo === 'noticia' && !hay && S.dato && ts > 1.6) { // noticia sin gráficos: recuadro con el dato más llamativo
        const q = pop(ts - 1.6); ctx.save(); ctx.globalAlpha = acotar((ts - 1.6) / 0.15) * A.alpha; ctx.translate(A.cx, PCY + A.dy + fg.dy); ctx.rotate(fg.giro); ctx.scale(q, q);
        ctx.font = `104px ${num}`; const ds = envolver(ctx, String(S.dato).toUpperCase(), PW - 70).slice(0, 3), alto = 150 + ds.length * 100, ancho = PW;
        ctx.save(); B.sombraDeCapa(ctx, Math.min(w, h), 0.8, 0.4); ctx.fillStyle = '#fff'; B.rectRedondo(ctx, -ancho / 2, -alto / 2, ancho, alto, 30); ctx.fill(); B.sinSombra(ctx); ctx.restore();
        rotulo(ctx, 'EL DATO', -ancho / 2 + 36, -alto / 2 + 62, 36, txt, pal.acento);
        ds.forEach((l, i) => rotulo(ctx, l, -ancho / 2 + 36, -alto / 2 + 170 + i * 100, 104, num, '#111')); ctx.restore();
      } else if (S.tipo !== 'noticia') { // intro y cierre: el logo grande ocupa la parte alta de la columna de animaciones
        ctx.save(); ctx.globalAlpha = e * A.alpha; ctx.translate(0, A.dy + fg.dy); circuloLogo(ctx, A.cx, 300, 190); ctx.restore();
      }
      // 5) barra de progreso por capítulos
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(0, h - 12, w, 12); ctx.fillStyle = pal.acento; ctx.fillRect(0, h - 12, w * acotar(tAbs / t1), 12);
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; for (const s of segmentos.slice(1)) ctx.fillRect(Math.round(w * s.t0 / t1) - 2, h - 12, 4, 12);
    },
    limpiar() { if (dir) try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} },
  };
}

// LETTERING: los subtítulos en la parte baja de la COLUMNA DE ANIMACIONES (debajo del gráfico), con las letras animadas: cada palabra entra con un rebote y un leve giro cuando se dice
// (las que faltan se ven tenues); la que suena va en amarillo y un poco más grande; las PALABRAS CLAVE (cifras, nombres propios y las que se pasan en `extras`) quedan en amarillo con un
// subrayado trazado a mano. palabras: [{palabra,t0,t1}]; columna(t) → { cx, dy, alpha } (la misma distribución que la escena, para que el lettering viaje con las animaciones).
const sinTildes = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ]/g, '');
const SIGNOS = /[.,;:!?…»)]+$/;
function crearSubtitulos({ palabras, estilo, columna, resalte = '#FFD21F', extras = [], maxClavesPorBloque = 2 }) {
  require('../overlay/animacion').registrarFuentes(estilo); // sin la fuente registrada, measureText mide con otra y las palabras salen pegadas
  const tam = 60, inter = 72, FOND = 1040, anchoMax = 590, fuente = `${tam}px ${estilo.tipografia.texto}`, med = createCanvas(8, 8).getContext('2d'); med.font = fuente;
  const termina = p => SIGNOS.test(p), bloques = []; let act = [];
  palabras.forEach((p, i) => { act.push(i); if ((termina(p.palabra) && act.length >= 3) || act.length >= 7) { bloques.push(act); act = []; } }); if (act.length) bloques.push(act);
  const ex = new Set(extras.map(sinTildes).filter(w => w.length >= 5)), ARTICULOS = new Set(['este', 'esta', 'ante', 'cuando', 'desde', 'hasta', 'para', 'pero', 'como', 'todo', 'todos', 'mientras', 'recordemos', 'suscribete']);
  const esClave = (i, primeraDelBloque) => {
    const w = palabras[i].palabra, limpio = w.replace(/[^\p{L}\p{N}]/g, ''), prev = i > 0 ? palabras[i - 1].palabra : '.';
    if (/\d/.test(limpio)) return true;
    if (ex.has(sinTildes(w))) return true;
    return !primeraDelBloque && limpio.length >= 4 && /^\p{Lu}/u.test(limpio) && !/[.!?…¡¿]$/.test(prev) && !ARTICULOS.has(sinTildes(w)); // nombre propio a mitad de frase
  };
  const grupos = [];
  for (const idx of bloques) {
    const lineas = []; let l = [], x = 0;
    for (const i of idx) { const wp = med.measureText(palabras[i].palabra + ' ').width + 12; if (x + wp > anchoMax && l.length) { lineas.push(l); l = []; x = 0; } l.push({ i, ancho: wp, solo: med.measureText(palabras[i].palabra.replace(SIGNOS, '')).width }); x += wp; }
    if (l.length) lineas.push(l);
    for (let a = 0; a < lineas.length; a += 3) { // máximo 3 líneas por bloque: si salen más, se parte en otro bloque
      const ls = lineas.slice(a, a + 3), ids = ls.flat().map(c => c.i), claves = new Set(); ids.forEach((i, k) => { if (claves.size < maxClavesPorBloque && esClave(i, k === 0)) claves.add(i); });
      grupos.push({ idx: ids, lineas: ls, claves, t0: palabras[ids[0]].t0, t1: palabras[ids[ids.length - 1]].t1 });
    }
  }
  grupos.forEach(g => { g.aparece = Math.max(0, g.t0 - 0.05); });
  grupos.forEach((g, k) => { g.desaparece = k + 1 < grupos.length ? grupos[k + 1].aparece : g.t1 + 0.4; });
  return {
    grupos,
    dibujar(ctx, t) {
      const g = grupos.find(x => t >= x.aparece && t < x.desaparece); if (!g) return;
      const col = columna ? columna(t) : { cx: W / 2, dy: 0, alpha: 1 };
      ctx.save(); ctx.globalAlpha = col.alpha * acotar((g.desaparece - t) / 0.1); ctx.font = fuente; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
      g.lineas.forEach((l, li) => {
        const total = l.reduce((s, c) => s + c.ancho, 0), y = FOND + col.dy - (g.lineas.length - 1 - li) * inter; let x = col.cx - total / 2;
        for (const c of l) {
          const p = palabras[c.i], dicha = t >= p.t0, activa = dicha && t < p.t1 + 0.04, clave = g.claves.has(c.i), tin = t - p.t0, palabra = p.palabra.replace(SIGNOS, '');
          const k = dicha ? easeOutBack(acotar(tin / 0.22), 2.4) : 0, esc = dicha ? 0.7 + 0.3 * k + (activa ? 0.06 : 0) : 1, giro = dicha ? (((c.i * 37) % 7) - 3) * 0.012 * (1 - acotar(tin / 0.3)) : 0, sube = dicha ? (1 - acotar(tin / 0.18)) * 16 : 0, cx = x + c.solo / 2;
          ctx.save(); ctx.globalAlpha *= dicha ? acotar(tin / 0.08) * 0.9 + 0.1 : 0.28; ctx.translate(cx, y - tam * 0.3 + sube); ctx.rotate(giro); ctx.scale(esc, esc);
          ctx.lineWidth = 12; ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.strokeText(palabra, 0, tam * 0.3); ctx.fillStyle = dicha && (activa || clave) ? resalte : '#fff'; ctx.fillText(palabra, 0, tam * 0.3);
          ctx.restore();
          if (clave && dicha) { const pr = easeOutCubic(tin / 0.25); B.trazar(ctx, B.puntosDeSubrayado(x, y + tam * 0.16, x + c.solo, y + tam * 0.16, c.i + 1), pr, { color: estilo.colores.verde, ancho: 7, u: 1080 }); }
          const punt = p.palabra.match(SIGNOS); if (punt) { ctx.save(); ctx.globalAlpha *= dicha ? 1 : 0.28; ctx.lineWidth = 12; ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.strokeText(punt[0], x + c.solo, y); ctx.fillText(punt[0], x + c.solo, y); ctx.restore(); }
          x += c.ancho;
        }
      });
      ctx.restore();
    },
  };
}

module.exports = { planificarTomas, crearEscena, crearSubtitulos, distribucion, MAXC, TRANS, W, H, WW, WH };

// ESCENA 16:9 del COMPILADO DIARIO. Los clips de la biblioteca son TikToks verticales (9:16): van en una ventana vertical centrada sobre un fondo desenfocado del mismo clip;
// a los lados, rótulos (logo del canal, número de noticia, titular, dato clave); abajo, subtítulos grandes; barra de progreso por capítulos.
// Regla de los 3 s: cada toma se muestra como mucho USO_MAX_S (3 s) contando la transición; el tiempo de cada tramo se reparte en tomas IGUALES.
const fs = require('fs'), path = require('path'), os = require('os');
const { execFile } = require('child_process');
const { loadImage, createCanvas } = require('@napi-rs/canvas');
const { acotar, easeOutCubic } = require('../overlay/animacion');
const B = require('./base');

const USO_MAX_S = 3.0, TRANS = 0.3, MAXC = USO_MAX_S - TRANS - 0.1; // 2,6 s por toma como máximo
const W = 1920, H = 1080, WH = Math.round(H * 0.80), WW = Math.round(WH * 9 / 16), VY = Math.round(H * 0.45); // ventana vertical: 486×864, centrada, sobre un fondo desenfocado
const MARCAS = path.join(__dirname, '..', 'assets', 'marcas');

// Reparto de tomas: cada tramo (intro, noticia k, cierre) se divide en n tomas parejas (n = lo mínimo para no pasar de MAXC). pool(seg, cuantas) → [{ruta, duracion, id}].
// Un clip que se repite arranca más adelante (otro tramo del mismo clip), nunca desde el mismo punto.
function planificarTomas(segmentos, poolDe, { ajustarSs = null } = {}) {
  const cortes = [], usos = new Map();
  segmentos.forEach((s, si) => {
    const L = Math.max(0.6, s.t1 - s.t0), n = Math.max(1, Math.ceil(L / MAXC - 1e-9)), dur = L / n, pool = poolDe(s, n, si);
    if (!pool.length) throw new Error(`el tramo "${s.tipo}${s.n ? ' ' + s.n : ''}" no tiene clips`);
    for (let k = 0; k < n; k++) {
      const c = pool[k % pool.length], v = usos.get(c.id) || 0; usos.set(c.id, v + 1);
      const largo = dur + TRANS + 0.1, tope = Math.max(0, (c.duracion || 99) - largo - 0.1); let ss = Math.min(tope, 0.2 + v * (dur + 0.4));
      if (ajustarSs && v === 0) ss = Math.min(tope, ajustarSs(c.ruta, ss));
      cortes.push({ clip: c.ruta, id: c.id, ss: Math.max(0, ss), t0: s.t0 + k * dur, t1: s.t0 + (k + 1) * dur, seg: si });
    }
  });
  return cortes;
}

const envolver = (ctx, texto, ancho) => { const pal = String(texto).split(/\s+/).filter(Boolean), out = []; let l = ''; for (const p of pal) { const t = l ? l + ' ' + p : p; if (ctx.measureText(t).width > ancho && l) { out.push(l); l = p; } else l = t; } if (l) out.push(l); return out; };
const pop = (t, d = 0.34) => { const x = acotar(t / d), c = 1.7; return 0.55 + 0.45 * (1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2)); }; // aparece con un pequeño rebote

// segmentos: [{ tipo:'intro'|'noticia'|'cierre', n, de, titular, dato, t0, t1 }]; marca: { paleta (de lienzo/portada.paletaDe), logo (ruta png) }; fecha: texto "27 DE NOVIEMBRE"
function crearEscena({ cortes, segmentos, marca, fecha = '', estilo, t1 }) {
  let dir = null, fps = 30; const cuadros = [], memo = new Map(); let logo = null;
  const pal = marca.paleta, num = estilo.tipografia.numero, txt = estilo.tipografia.texto;
  const chica = createCanvas(24, 42), cch = chica.getContext('2d'); // el fondo desenfocado: el cuadro reducido a 24×42 y estirado con suavizado
  const cargar = a => { if (!memo.has(a)) { if (memo.size > 30) memo.delete(memo.keys().next().value); memo.set(a, fs.existsSync(a) ? loadImage(fs.readFileSync(a)) : Promise.resolve(null)); } return memo.get(a); };
  const cuadro = (ci, tAbs) => { const c = cortes[ci], idx = Math.min(cuadros[ci], Math.max(1, Math.floor((tAbs - c.t0) * fps) + 1)); for (let k = 1; k <= 3 && idx + k <= cuadros[ci]; k++) cargar(path.join(dir, `c${ci}_${String(idx + k).padStart(4, '0')}.jpg`)); return cargar(path.join(dir, `c${ci}_${String(idx).padStart(4, '0')}.jpg`)); };
  const circuloLogo = (ctx, cx, cy, r) => { if (!logo) return; ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip(); ctx.fillStyle = pal.fondoLogo; ctx.fillRect(cx - r, cy - r, r * 2, r * 2); const e = (r * 2) / Math.min(logo.width, logo.height); ctx.drawImage(logo, cx - logo.width * e / 2, cy - logo.height * e / 2, logo.width * e, logo.height * e); ctx.restore(); ctx.save(); ctx.lineWidth = Math.max(3, r * 0.05); ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); };
  const rotulo = (ctx, texto, x, y, tam, fuente, color, borde = 0) => { ctx.font = `${tam}px ${fuente}`; if (borde) { ctx.lineJoin = 'round'; ctx.lineWidth = borde; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.strokeText(texto, x, y); } ctx.fillStyle = color; ctx.fillText(texto, x, y); };

  return {
    t0: 0, t1, flota: false, eventos: [],
    async preparar({ fps: f }) {
      fps = f; dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compilado-'));
      const p = path.join(MARCAS, marca.logo || ''); if (marca.logo && fs.existsSync(p)) logo = await loadImage(fs.readFileSync(p));
      const ffmpeg = process.env.FFMPEG_BIN || require('ffmpeg-static');
      const hacer = (c, ci) => new Promise((res, rej) => { const dur = c.t1 - c.t0 + TRANS + 0.1; cuadros[ci] = Math.ceil((dur - 0.1) * fps);
        execFile(ffmpeg, ['-y', '-loglevel', 'error', '-ss', String(c.ss || 0), '-t', String(dur), '-i', c.clip, '-an', '-vf', `fps=${fps},scale=${WW}:${WH}:force_original_aspect_ratio=increase,crop=${WW}:${WH}`, '-q:v', '5', path.join(dir, `c${ci}_%04d.jpg`)], { timeout: 120000 }, e => (e ? rej(e) : res())); });
      let i = 0; await Promise.all(Array.from({ length: 4 }, async () => { while (i < cortes.length) { const ci = i++; await hacer(cortes[ci], ci); } }));
    },
    async dibujar(ctx, { tAbs, w, h }) {
      let ci = 0; for (let k = 0; k < cortes.length; k++) if (cortes[k].t0 <= tAbs) ci = k;
      const c = cortes[ci], tt = tAbs - c.t0, enTrans = ci > 0 && tt < TRANS, p = enTrans ? easeOutCubic(acotar(tt / TRANS)) : 1;
      const imgA = await cuadro(ci, tAbs), imgP = enTrans ? await cuadro(ci - 1, tAbs) : null;
      let si = 0; for (let k = 0; k < segmentos.length; k++) if (segmentos[k].t0 <= tAbs + 0.001) si = k; const S = segmentos[si], ts = tAbs - S.t0;
      // 1) fondo: color del canal + cuadro desenfocado
      ctx.fillStyle = pal.degradado; ctx.fillRect(0, 0, w, h);
      const fondo = (img, a) => { if (!img) return; cch.drawImage(img, 0, 0, 24, 42); ctx.save(); ctx.globalAlpha = a; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; const e = Math.max(w / 24, h / 42); ctx.drawImage(chica, (w - 24 * e) / 2, (h - 42 * e) / 2, 24 * e, 42 * e); ctx.restore(); };
      if (enTrans) fondo(imgP, 1); fondo(imgA, enTrans ? p : 1);
      const g = ctx.createLinearGradient(0, 0, w, 0); g.addColorStop(0, 'rgba(0,0,0,0.60)'); g.addColorStop(0.5, 'rgba(0,0,0,0.38)'); g.addColorStop(1, 'rgba(0,0,0,0.60)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      // 2) ventana vertical con el clip
      const X = (w - WW) / 2, Y = VY - WH / 2;
      ctx.save(); B.sombraDeCapa(ctx, Math.min(w, h), 1.0, 0.5); ctx.fillStyle = '#fff'; B.rectRedondo(ctx, X - 8, Y - 8, WW + 16, WH + 16, 26); ctx.fill(); B.sinSombra(ctx); ctx.restore();
      ctx.save(); B.rectRedondo(ctx, X, Y, WW, WH, 20); ctx.clip();
      if (enTrans && imgP) ctx.drawImage(imgP, X, Y, WW, WH); if (imgA) { ctx.globalAlpha = enTrans ? p : 1; ctx.drawImage(imgA, X, Y, WW, WH); } ctx.restore();
      // 3) rótulos laterales
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
      circuloLogo(ctx, 60 + 52, 40 + 52, 52); rotulo(ctx, (pal.nombre || '').toUpperCase(), 60 + 52 * 2 + 22, 40 + 52 + 14, 44, num, '#fff', 6);
      const LX = 60, LW = X - 8 - 70 - LX, RX = X + WW + 8 + 70, RW = w - RX - 60;
      const e = easeOutCubic(ts / 0.5), desl = (1 - e) * -90;
      if (S.tipo === 'noticia') {
        ctx.save(); ctx.globalAlpha = e; ctx.translate(desl, 0);
        const etiqueta = `NOTICIA ${S.n} DE ${S.de}`; ctx.font = `34px ${txt}`; const ancho = ctx.measureText(etiqueta).width + 44;
        ctx.fillStyle = pal.acento; B.rectRedondo(ctx, LX, 200, ancho, 58, 29); ctx.fill(); rotulo(ctx, etiqueta, LX + 22, 241, 34, txt, '#fff');
        ctx.font = `124px ${num}`; const ls = envolver(ctx, String(S.titular || '').toUpperCase(), LW); ls.slice(0, 4).forEach((l, i) => rotulo(ctx, l, LX, 380 + i * 118, 124, num, i === 0 ? '#fff' : '#fff', 8));
        ctx.restore();
        if (S.dato && ts > 1.6) { // recuadro con el dato más llamativo, a la derecha
          const q = pop(ts - 1.6), cx = RX + RW / 2, cy = 470; ctx.save(); ctx.globalAlpha = acotar((ts - 1.6) / 0.15); ctx.translate(cx, cy); ctx.scale(q, q); ctx.translate(-cx, -cy);
          ctx.font = `104px ${num}`; const ds = envolver(ctx, String(S.dato).toUpperCase(), RW - 70), alto = 150 + ds.slice(0, 3).length * 100;
          ctx.save(); B.sombraDeCapa(ctx, Math.min(w, h), 0.8, 0.4); ctx.fillStyle = '#fff'; B.rectRedondo(ctx, RX, cy - alto / 2, RW, alto, 30); ctx.fill(); B.sinSombra(ctx); ctx.restore();
          rotulo(ctx, 'EL DATO', RX + 36, cy - alto / 2 + 62, 36, txt, pal.acento);
          ds.slice(0, 3).forEach((l, i) => rotulo(ctx, l, RX + 36, cy - alto / 2 + 170 + i * 100, 104, num, '#111')); ctx.restore();
        }
      } else {
        ctx.save(); ctx.globalAlpha = e; ctx.translate(desl, 0); circuloLogo(ctx, LX + LW / 2, 560, Math.min(190, LW / 2)); ctx.restore();
        const t1x = S.tipo === 'intro' ? 'LO MÁS FUERTE DEL DÍA' : 'GRACIAS POR VER', t2x = S.tipo === 'intro' ? fecha : 'SUSCRÍBETE';
        ctx.save(); ctx.globalAlpha = e; ctx.font = `110px ${num}`; const l1 = envolver(ctx, t1x, RW).slice(0, 3); l1.forEach((l, i) => rotulo(ctx, l, RX, 400 + i * 104, 110, num, '#fff', 8));
        ctx.font = `64px ${num}`; const l2 = envolver(ctx, t2x, RW).slice(0, 2); l2.forEach((l, i) => rotulo(ctx, l, RX, 400 + l1.length * 104 + 30 + i * 70, 64, num, pal.resalte, 6)); ctx.restore();
      }
      // 4) barra de progreso por capítulos
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(0, h - 12, w, 12); ctx.fillStyle = pal.acento; ctx.fillRect(0, h - 12, w * acotar(tAbs / t1), 12);
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; for (const s of segmentos.slice(1)) ctx.fillRect(Math.round(w * s.t0 / t1) - 2, h - 12, 4, 12);
    },
    limpiar() { if (dir) try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} },
  };
}

// Subtítulos grandes abajo, centrados, con borde negro; la palabra que se dice va en amarillo. palabras: [{palabra,t0,t1}]
function crearSubtitulos({ palabras, estilo, resalte = '#FFD21F' }) {
  require('../overlay/animacion').registrarFuentes(estilo); // sin la fuente registrada, measureText mide con otra y las palabras salen pegadas
  const tam = 54, inter = 66, fuente = `${tam}px ${estilo.tipografia.texto}`, anchoMax = 1560, med = createCanvas(8, 8).getContext('2d'); med.font = fuente;
  const termina = p => /[.,;:!?…»)]$/.test(p), bloques = []; let act = [];
  palabras.forEach((p, i) => { act.push(i); if ((termina(p.palabra) && act.length >= 3) || act.length >= 9) { bloques.push(act); act = []; } }); if (act.length) bloques.push(act);
  const grupos = bloques.map(idx => { const lineas = []; let l = [], x = 0; for (const i of idx) { const wp = med.measureText(palabras[i].palabra + ' ').width; if (x + wp > anchoMax && l.length) { lineas.push(l); l = []; x = 0; } l.push({ i, ancho: wp }); x += wp; } if (l.length) lineas.push(l); return { idx, lineas: lineas.slice(0, 2), t0: palabras[idx[0]].t0, t1: palabras[idx[idx.length - 1]].t1 }; });
  grupos.forEach(g => { g.aparece = Math.max(0, g.t0 - 0.05); });
  grupos.forEach((g, k) => { g.desaparece = k + 1 < grupos.length ? grupos[k + 1].aparece : g.t1 + 0.4; });
  return {
    dibujar(ctx, t) {
      const g = grupos.find(x => t >= x.aparece && t < x.desaparece); if (!g) return;
      ctx.save(); ctx.font = fuente; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'; ctx.lineJoin = 'round'; ctx.globalAlpha = acotar((t - g.aparece) / 0.12);
      g.lineas.forEach((l, li) => { const total = l.reduce((s, c) => s + c.ancho, 0), y = H - 60 - (g.lineas.length - 1 - li) * inter; let x = (W - total) / 2;
        for (const c of l) { const p = palabras[c.i], activa = t >= p.t0 && t < p.t1 + 0.04; ctx.lineWidth = 11; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.strokeText(p.palabra, x, y); ctx.fillStyle = activa ? resalte : '#fff'; ctx.fillText(p.palabra, x, y); x += c.ancho; } });
      ctx.restore();
    },
  };
}

module.exports = { planificarTomas, crearEscena, crearSubtitulos, MAXC, TRANS, W, H, WW, WH };

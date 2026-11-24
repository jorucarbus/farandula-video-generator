// Elementos del escenario (las piezas explicativas). Cada uno: { t0, t1, preparar?(ctxInfo), dibujar(ctx, {t, tAbs, w, h, u, estilo}) }
// t = segundos desde que el elemento aparece; tAbs = segundo del video. Los tiempos de los eventos internos (la
// cifra, el pin, cada fila) llegan en tiempo ABSOLUTO desde las palabras del guion, para que caigan en la palabra.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { geoMercator, geoPath, geoArea } = require('d3-geo');
const { feature } = require('topojson-client');
const { lerp, acotar, easeOutCubic, easeOutBack } = require('../overlay/animacion');
const { COMPONENTES } = require('../overlay/componentes');
const B = require('./base');
const { ticksDeConteo } = require('./sonidos');

const imagen = f => (Buffer.isBuffer(f) ? loadImage(f) : loadImage(fs.readFileSync(f)));
const pop = (t, dur = 0.34) => lerp(0.5, 1, easeOutBack(t / dur, 1.7));

// ── Retrato circular con nombre ─────────────────────────────────────────────────────────────────
function retrato({ foto, nombre, cx = 0.5, cy = 0.5, r = 0.2, foco, t0, t1 }) {
  let img = null;
  return {
    t0, t1, eventos: [{ t: t0, sonido: 'pop' }],
    async preparar() { img = await imagen(foto); },
    dibujar(ctx, { t, w, h, u, estilo }) {
      const R = u * r, X = w * cx, flote = Math.sin(t * 1.7) * u * 0.004, Y = h * cy + flote, e = pop(t);
      B.sombraDeContacto(ctx, X, h * cy + R * 1.18, R * 0.9 * e, R * 0.2 * e, 0.2 * acotar(t / 0.3));
      ctx.save(); ctx.globalAlpha = acotar(t / 0.12); ctx.translate(X, Y); ctx.scale(e, e); ctx.translate(-X, -Y);
      B.retratoCircular(ctx, img, X, Y, R, { foco, u });
      if (nombre && t > 0.2) { // etiqueta negra bajo el círculo
        const tam = Math.round(u * 0.034), p = acotar((t - 0.2) / 0.25);
        ctx.font = `${tam}px ${estilo.tipografia.texto}`;
        const tw = ctx.measureText(nombre).width, pw = tw + tam * 1.6, ph = tam * 1.9, py = Y + R + tam * 0.9;
        ctx.globalAlpha = p; B.sombraDeCapa(ctx, u, 0.35, 0.28);
        ctx.fillStyle = estilo.colores.negro; B.rectRedondo(ctx, X - pw / 2, py + (1 - p) * 10, pw, ph, ph / 2); ctx.fill(); B.sinSombra(ctx);
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(nombre, X, py + (1 - p) * 10 + ph / 2 + tam * 0.04);
      }
      ctx.restore();
    },
  };
}

// ── Cifra en píldora (reusa el componente del estilo) ───────────────────────────────────────────
function cifra({ valor, sufijo, prefijo, agrupar, conteo, cy = 0.46, t0, t1 }) {
  const datos = { valor, sufijo, prefijo, agrupar, conteo, ancla: 'centro' };
  return {
    t0, t1,
    eventos: [{ t: t0, sonido: 'pop' }, ...(conteo === false ? [] : [...ticksDeConteo(valor, t0, 0.95, easeOutCubic).map((t, k, a) => ({ t, sonido: 'tick', pitch: 1 + 0.4 * k / Math.max(1, a.length - 1) })), { t: t0 + 0.95, sonido: 'ding' }])],
    dibujar(ctx, { t, w, h, u, estilo }) {
      const comp = COMPONENTES.cifra_pildora, caja = comp.caja({ w, h, u, datos, estilo, ctx });
      ctx.save(); ctx.translate(caja.x, Math.round(h * cy - caja.ch / 2));
      comp.dibujar(ctx, { p: acotar(t / comp.dur(estilo, datos)), t, cw: caja.cw, ch: caja.ch, w, h, u, datos, estilo });
      ctx.restore();
    },
  };
}

// ── Lista numerada (tarjeta blanca con insignias negras; cada fila entra en su palabra) ─────────
function listaNumerada({ titulo, items, cy = 0.5, t0, t1 }) { // items: [{ texto, t (abs) }]
  return {
    t0, t1, eventos: [{ t: t0, sonido: 'pop' }, ...items.map(i => ({ t: i.t, sonido: 'clic' }))],
    dibujar(ctx, { t, tAbs, w, h, u, estilo }) {
      const ancho = w * 0.80, tam = Math.round(u * 0.04), fila = tam * 2.2, pad = u * 0.045, tit = titulo ? tam * 1.8 : 0;
      const alto = pad * 2 + tit + fila * items.length, x = (w - ancho) / 2, y = h * cy - alto / 2, e = pop(t, 0.3);
      ctx.save(); ctx.globalAlpha = acotar(t / 0.12); ctx.translate(w / 2, h * cy); ctx.scale(e, e); ctx.translate(-w / 2, -h * cy);
      B.sombraDeCapa(ctx, u, 0.6, 0.30); ctx.fillStyle = '#fff'; B.rectRedondo(ctx, x, y, ancho, alto, u * 0.035); ctx.fill(); B.sinSombra(ctx);
      let py = y + pad; ctx.textBaseline = 'middle';
      if (titulo) { ctx.font = `${Math.round(tam * 0.72)}px ${estilo.tipografia.texto}`; if ('letterSpacing' in ctx) ctx.letterSpacing = `${tam * 0.1}px`; ctx.fillStyle = estilo.colores.verde; ctx.textAlign = 'left'; ctx.fillText(titulo.toUpperCase(), x + pad, py + tit * 0.4); if ('letterSpacing' in ctx) ctx.letterSpacing = '0px'; py += tit; }
      items.forEach((it, i) => {
        const p = easeOutCubic((tAbs - it.t) / 0.3); if (p <= 0) return;
        const cyF = py + fila * i + fila / 2, dx = (1 - p) * -24;
        ctx.save(); ctx.globalAlpha = acotar(p); ctx.translate(dx, 0);
        const rr = tam * 0.62; B.sombraDeCapa(ctx, u, 0.2, 0.3); ctx.fillStyle = estilo.colores.negro; ctx.beginPath(); ctx.arc(x + pad + rr, cyF, rr, 0, Math.PI * 2); ctx.fill(); B.sinSombra(ctx);
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = `${Math.round(tam * 0.95)}px ${estilo.tipografia.numero}`; ctx.fillText(String(i + 1), x + pad + rr, cyF + tam * 0.03);
        ctx.fillStyle = estilo.colores.negro; ctx.textAlign = 'left'; ctx.font = `${tam}px ${estilo.tipografia.texto}`; ctx.fillText(it.texto, x + pad + rr * 2 + tam * 0.6, cyF + tam * 0.03);
        ctx.restore();
      });
      ctx.restore();
    },
  };
}

// ── Mapa con zoom y marcador ────────────────────────────────────────────────────────────────────
let _mundo = null;
function mundo() {
  if (_mundo) return _mundo;
  const topo = require('world-atlas/countries-50m.json');
  const todos = feature(topo, topo.objects.countries).features;
  const cerca = ['Ecuador', 'Colombia', 'Peru', 'Brazil', 'Venezuela', 'Bolivia', 'Chile', 'Panama', 'Costa Rica', 'Argentina', 'Guyana', 'Suriname', 'Paraguay'];
  _mundo = { paises: todos.filter(f => cerca.includes(f.properties.name)) };
  // Solo el continente de cada país en el encuadre (Galápagos haría el zoom enorme).
  _mundo.paises = _mundo.paises.map(f => {
    if (f.geometry.type !== 'MultiPolygon') return f;
    const mayor = f.geometry.coordinates.map(c => ({ c, a: geoArea({ type: 'Polygon', coordinates: c }) })).sort((a, b) => b.a - a.a)[0].c;
    return { ...f, geometry: { type: 'Polygon', coordinates: mayor } };
  });
  return _mundo;
}

// lugar: { lon, lat, nombre }; tPin: segundo ABSOLUTO en que cae el marcador (la palabra del lugar).
function mapa({ pais = 'Ecuador', lugar, tPin, cy = 0.5, alto = 0.40, t0, t1 }) {
  const { paises } = mundo();
  const destino = paises.find(f => f.properties.name === pais);
  return {
    t0, t1, eventos: [{ t: t0, sonido: 'pop' }, { t: t0 + 0.35, sonido: 'trazo' }, ...(lugar ? [{ t: tPin + 0.45, sonido: 'golpe', db: -6 }, { t: tPin + 0.62, sonido: 'clic', db: -4 }] : [])],
    dibujar(ctx, { t, tAbs, w, h, u, estilo }) {
      const cw = Math.round(w * 0.86), ch = Math.round(h * alto), X = (w - cw) / 2, Y = h * cy - ch / 2, e = pop(t, 0.34);
      const ampl = { type: 'FeatureCollection', features: paises.filter(f => ['Ecuador', 'Colombia', 'Peru'].includes(f.properties.name)) };
      const ajuste = (col, pad) => { const p = geoMercator().fitExtent([[pad, pad], [cw - pad, ch - pad]], col); return { k: p.scale(), t: p.translate() }; };
      const A = ajuste(ampl, cw * 0.06), Z = ajuste({ type: 'FeatureCollection', features: [destino] }, cw * 0.16);
      const z = easeOutCubic((t - 0.35) / 1.2);
      const proy = geoMercator().scale(lerp(A.k, Z.k, z)).translate([lerp(A.t[0], Z.t[0], z), lerp(A.t[1], Z.t[1], z)]);
      ctx.save(); ctx.globalAlpha = acotar(t / 0.12); ctx.translate(w / 2, h * cy); ctx.scale(e, e); ctx.translate(-w / 2, -h * cy);
      B.sombraDeCapa(ctx, u, 0.7, 0.32); ctx.fillStyle = '#fff'; B.rectRedondo(ctx, X - 7, Y - 7, cw + 14, ch + 14, u * 0.045); ctx.fill(); B.sinSombra(ctx);
      ctx.save(); B.rectRedondo(ctx, X, Y, cw, ch, u * 0.04); ctx.clip(); ctx.translate(X, Y);
      ctx.fillStyle = '#D7E3E8'; ctx.fillRect(0, 0, cw, ch); // océano
      const ruta = geoPath(proy, ctx);
      for (const f of paises) { ctx.beginPath(); ruta(f); ctx.fillStyle = f === destino ? estilo.colores.verde : '#EAE4D8'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke(); }
      if (lugar) { // marcador que cae y rebota en la palabra
        const [px, py] = proy([lugar.lon, lugar.lat]), tp = tAbs - tPin;
        if (tp > 0) {
          const caida = acotar(tp / 0.45), rebote = caida < 1 ? (1 - caida) * (1 - caida) * -ch * 0.35 : Math.abs(Math.sin((tp - 0.45) * 9)) * Math.exp(-(tp - 0.45) * 5) * -ch * 0.04;
          const r = u * 0.03, y = py + rebote;
          if (tp > 0.45) { const q = acotar((tp - 0.45) / 0.9); ctx.strokeStyle = `rgba(229,23,63,${0.5 * (1 - q)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(px, py, r * (1 + q * 2.4), 0, Math.PI * 2); ctx.stroke(); }
          B.sombraDeContacto(ctx, px, py, r * 1.1 * acotar(caida + 0.2), r * 0.35, 0.3);
          ctx.globalAlpha = acotar(tp / 0.1); B.sombraDeCapa(ctx, u, 0.4, 0.35);
          ctx.fillStyle = estilo.colores.rojo; ctx.beginPath(); ctx.arc(px, y - r * 1.7, r, Math.PI * 0.82, Math.PI * 0.18); ctx.lineTo(px, y); ctx.closePath(); ctx.fill(); B.sinSombra(ctx);
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px, y - r * 1.7, r * 0.38, 0, Math.PI * 2); ctx.fill();
          if (lugar.nombre && tp > 0.35) {
            const tam = Math.round(u * 0.032); ctx.font = `${tam}px ${estilo.tipografia.texto}`; const tw = ctx.measureText(lugar.nombre).width, pw = tw + tam * 1.5, ph = tam * 1.8, a = acotar((tp - 0.35) / 0.2);
            ctx.globalAlpha = a; B.sombraDeCapa(ctx, u, 0.3, 0.3); ctx.fillStyle = estilo.colores.negro; B.rectRedondo(ctx, px + r * 1.4, y - r * 2.7, pw, ph, ph / 2); ctx.fill(); B.sinSombra(ctx);
            ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(lugar.nombre, px + r * 1.4 + pw / 2, y - r * 2.7 + ph / 2 + tam * 0.04);
          }
        }
      }
      ctx.restore(); ctx.restore();
    },
  };
}

// ── Recuadro vertical redondeado con clip real + marcas a mano encima ───────────────────────────
// marcas: [{ tipo:'circulo', cx, cy, rx, ry, t, dur? } | { tipo:'subrayado', x0, y0, x1, y1, t, dur? }] en fracciones del recuadro; t ABSOLUTO.
function ventanaClip({ clip, ss = 0, marcas = [], cy = 0.57, ancho = 0.616, t0, t1 }) {
  let dir = null, nFrames = 0, WW = 0, HH = 0, fpsClip = 30;
  return {
    t0, t1, eventos: [{ t: t0, sonido: 'pop' }, ...marcas.map(m => ({ t: m.t, sonido: 'trazo' }))],
    async preparar({ w, h, fps }) {
      fpsClip = fps; WW = Math.round(w * ancho); HH = Math.round(WW * 16 / 9); nFrames = Math.ceil((t1 - t0) * fps);
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ventana-'));
      await new Promise((res, rej) => execFile(process.env.FFMPEG_BIN || require('ffmpeg-static'), ['-y', '-loglevel', 'error', '-ss', String(ss), '-t', String(t1 - t0 + 0.1), '-i', clip, '-an',
        '-vf', `fps=${fps},scale=${WW}:${HH}:force_original_aspect_ratio=increase,crop=${WW}:${HH}`, '-q:v', '3', path.join(dir, 'f_%04d.jpg')], { timeout: 120000 }, e => (e ? rej(e) : res())));
    },
    async dibujar(ctx, { t, tAbs, w, h, u, estilo }) {
      const X = (w - WW) / 2, Y = h * cy - HH / 2, e = pop(t, 0.34), idx = Math.min(nFrames, Math.max(1, Math.floor(t * fpsClip) + 1));
      const arch = path.join(dir, `f_${String(idx).padStart(4, '0')}.jpg`);
      const img = fs.existsSync(arch) ? await loadImage(fs.readFileSync(arch)) : null;
      ctx.save(); ctx.globalAlpha = acotar(t / 0.12); ctx.translate(w / 2, h * cy); ctx.scale(e, e); ctx.translate(-w / 2, -h * cy);
      B.sombraDeCapa(ctx, u, 0.85, 0.36); ctx.fillStyle = '#fff'; B.rectRedondo(ctx, X - 10, Y - 10, WW + 20, HH + 20, u * 0.06); ctx.fill(); B.sinSombra(ctx);
      ctx.save(); B.rectRedondo(ctx, X, Y, WW, HH, u * 0.05); ctx.clip(); if (img) ctx.drawImage(img, X, Y, WW, HH); ctx.restore();
      for (const m of marcas) {
        const p = easeOutCubic((tAbs - m.t) / (m.dur || 0.7)); if (p <= 0) continue;
        const pts = m.tipo === 'circulo' ? B.puntosDeOvalo(X + m.cx * WW, Y + m.cy * HH, m.rx * WW, m.ry * HH, m.semilla || 11) : B.puntosDeSubrayado(X + m.x0 * WW, Y + m.y0 * HH, X + m.x1 * WW, Y + m.y1 * HH, m.semilla || 5);
        B.trazar(ctx, pts, p, { color: estilo.colores.rojo, ancho: Math.max(6, u * 0.011), u });
      }
      ctx.restore();
    },
    limpiar() { if (dir) try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} },
  };
}

// ── MONTAJE: el video como "carta de fondo". Un recuadro vertical grande con un picado de tomas cortas que acompaña el ritmo del
// discurso (cada toma, un clip distinto), unidas por transiciones. Los datos van ENCIMA como tarjetas independientes; donde hay tarjeta
// el video se oscurece un poco para que el texto se lea. cortes: [{ clip, ss, t0, t1, trans?, marcas? }] (t ABSOLUTO; las marcas como en ventanaClip).
// Cada toma sigue corriendo TRANS s después de su t1 mientras la siguiente entra: el ensamblador deja eso dentro de los 3 s por clip.
const TRANS = 0.3, TRANSICIONES = ['empuja', 'zoom', 'abajo', 'fundido'];
function montaje({ cortes, t0, t1, cy = 0.48, ancho = 0.616, atenuar = [], base = 0.08, fuerte = 0.30 }) {
  let dir = null, fpsM = 30, WW = 0, HH = 0; const cuadros = [], memo = new Map();
  const cola = cortes.map((c, i) => ({ ...c, trans: c.trans || (i === 0 ? 'fundido' : TRANSICIONES[(i - 1) % TRANSICIONES.length]) }));
  const velo = tAbs => { let a = base; for (const v of atenuar) { const k = acotar((tAbs - v.t0) / 0.3) * acotar((v.t1 - tAbs) / 0.3); a = Math.max(a, lerp(base, fuerte, k)); } return a; };
  const cuadro = async (ci, tAbs) => {
    const c = cola[ci], idx = Math.min(cuadros[ci], Math.max(1, Math.floor((tAbs - c.t0) * fpsM) + 1)), arch = path.join(dir, `c${ci}_${String(idx).padStart(4, '0')}.jpg`);
    if (!memo.has(arch)) { if (memo.size > 8) memo.delete(memo.keys().next().value); memo.set(arch, fs.existsSync(arch) ? loadImage(fs.readFileSync(arch)) : Promise.resolve(null)); }
    return memo.get(arch);
  };
  return {
    t0, t1, cortes: cola, eventos: [{ t: t0, sonido: 'pop' }, ...cola.slice(1).map(c => ({ t: c.t0, sonido: 'clic', db: -10 })), ...cola.flatMap(c => (c.marcas || []).map(m => ({ t: m.t, sonido: 'trazo' })))],
    async preparar({ w, h, fps }) {
      fpsM = fps; WW = Math.round(w * ancho); HH = Math.round(WW * 16 / 9); dir = fs.mkdtempSync(path.join(os.tmpdir(), 'montaje-'));
      const ffmpeg = process.env.FFMPEG_BIN || require('ffmpeg-static');
      const hacer = (c, ci) => new Promise((res, rej) => {
        const dur = c.t1 - c.t0 + TRANS + 0.1; cuadros[ci] = Math.ceil((dur - 0.1) * fps);
        execFile(ffmpeg, ['-y', '-loglevel', 'error', '-ss', String(c.ss || 0), '-t', String(dur), '-i', c.clip, '-an', '-vf', `fps=${fps},scale=${WW}:${HH}:force_original_aspect_ratio=increase,crop=${WW}:${HH}`, '-q:v', '5', path.join(dir, `c${ci}_%04d.jpg`)], { timeout: 120000 }, e => (e ? rej(e) : res()));
      });
      let i = 0; await Promise.all(Array.from({ length: 4 }, async () => { while (i < cola.length) { const ci = i++; await hacer(cola[ci], ci); } })); // 4 extracciones a la vez
    },
    async dibujar(ctx, { t, tAbs, w, h, u, estilo }) {
      let i = 0; for (let k = 0; k < cola.length; k++) if (cola[k].t0 <= tAbs) i = k;
      const X = (w - WW) / 2, Y = h * cy - HH / 2, e = pop(t, 0.34), c = cola[i], tt = tAbs - c.t0;
      const imgA = await cuadro(i, tAbs);
      const enTrans = i > 0 && tt < TRANS, imgP = enTrans ? await cuadro(i - 1, tAbs) : null, p = enTrans ? easeOutCubic(tt / TRANS) : 1;
      ctx.save(); ctx.globalAlpha = acotar(t / 0.12) * acotar((t1 - tAbs) / 0.2); ctx.translate(w / 2, h * cy); ctx.scale(e, e); ctx.translate(-w / 2, -h * cy);
      B.sombraDeCapa(ctx, u, 1.0, 0.42); ctx.fillStyle = '#fff'; B.rectRedondo(ctx, X - 10, Y - 10, WW + 20, HH + 20, u * 0.06); ctx.fill(); B.sinSombra(ctx);
      ctx.save(); B.rectRedondo(ctx, X, Y, WW, HH, u * 0.05); ctx.clip();
      const pon = (img, dx, dy, s = 1, a = 1) => { if (!img) return; ctx.save(); ctx.globalAlpha *= a; ctx.translate(X + WW / 2 + dx, Y + HH / 2 + dy); ctx.scale(s, s); ctx.drawImage(img, -WW / 2, -HH / 2, WW, HH); ctx.restore(); };
      if (!enTrans) pon(imgA, 0, 0);
      else if (c.trans === 'empuja') { pon(imgP, -p * WW, 0); pon(imgA, (1 - p) * WW, 0); }
      else if (c.trans === 'abajo') { pon(imgP, 0, p * HH); pon(imgA, 0, -(1 - p) * HH); }
      else if (c.trans === 'zoom') { pon(imgP, 0, 0); pon(imgA, 0, 0, lerp(1.28, 1, p), p); }
      else { pon(imgP, 0, 0); pon(imgA, 0, 0, 1, p); }
      ctx.fillStyle = `rgba(20,16,12,${(velo(tAbs) || 0).toFixed(3)})`; ctx.fillRect(X, Y, WW, HH); // velo: más oscuro donde hay tarjetas
      ctx.restore();
      for (const m of c.marcas || []) {
        const pr = easeOutCubic((tAbs - m.t) / (m.dur || 0.7)); if (pr <= 0 || tAbs > c.t1 + TRANS) continue;
        const pts = m.tipo === 'circulo' ? B.puntosDeOvalo(X + m.cx * WW, Y + m.cy * HH, m.rx * WW, m.ry * HH, m.semilla || 11) : B.puntosDeSubrayado(X + m.x0 * WW, Y + m.y0 * HH, X + m.x1 * WW, Y + m.y1 * HH, m.semilla || 5);
        B.trazar(ctx, pts, pr, { color: estilo.colores.rojo, ancho: Math.max(6, u * 0.011), u });
      }
      ctx.restore();
    },
    limpiar() { if (dir) try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} },
  };
}

module.exports = { retrato, cifra, listaNumerada, mapa, ventanaClip, montaje, TRANS };

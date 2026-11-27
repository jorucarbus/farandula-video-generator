// Elementos del escenario (las piezas explicativas). Cada uno: { t0, t1, preparar?(ctxInfo), dibujar(ctx, {t, tAbs, w, h, u, estilo}) }
// t = segundos desde que el elemento aparece; tAbs = segundo del video. Los tiempos de los eventos internos (la
// cifra, el pin, cada fila) llegan en tiempo ABSOLUTO desde las palabras del guion, para que caigan en la palabra.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { geoMercator, geoPath, geoArea, geoBounds, geoCentroid } = require('d3-geo');
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

// ── Marcas sobre el video (círculo, cuadro o flecha) que siguen la cara durante la toma ──────────────────────────────────────────────
// m.pista = [{ t (segundo del clip), cx, cy, w, h }] en coordenadas de la ventana; sin pista, la posición fija de siempre (m.cx, m.cy, m.rx, m.ry).
function geomMarca(m, tSrc) {
  const P = m.pista; if (!P || !P.length) return { cx: m.cx, cy: m.cy, rx: m.rx, ry: m.ry };
  let a = P[0], b = P[P.length - 1];
  if (tSrc <= a.t) b = a; else if (tSrc >= b.t) a = b; else for (let i = 1; i < P.length; i++) if (P[i].t >= tSrc) { a = P[i - 1]; b = P[i]; break; }
  const k = b.t === a.t ? 0 : (tSrc - a.t) / (b.t - a.t);
  return { cx: lerp(a.cx, b.cx, k), cy: lerp(a.cy, b.cy, k), rx: lerp(a.w, b.w, k) * 0.8, ry: lerp(a.h, b.h, k) * 0.8 };
}
function trazarMarca(ctx, m, { X, Y, WW, HH, tSrc, p, estilo, u }) {
  const opt = { color: estilo.colores.rojo, ancho: Math.max(6, u * 0.011), u };
  if (m.tipo === 'subrayado') { B.trazar(ctx, B.puntosDeSubrayado(X + m.x0 * WW, Y + m.y0 * HH, X + m.x1 * WW, Y + m.y1 * HH, m.semilla || 5), p, opt); return; }
  const g = geomMarca(m, tSrc), cx = X + g.cx * WW, cy = Y + g.cy * HH, rx = g.rx * WW, ry = g.ry * HH;
  if (m.tipo === 'cuadro') B.trazar(ctx, B.puntosDeCuadro(cx, cy, rx * 1.08, ry * 1.08, m.semilla || 11), p, opt);
  else if (m.tipo === 'flecha') { const sg = B.puntosDeFlecha(cx, cy, Math.max(rx, ry), m.lado === 'izq' ? -1 : 1, X, X + WW, m.semilla || 11); B.trazar(ctx, sg[0], Math.min(1, p / 0.75), opt); if (p > 0.75) { B.trazar(ctx, sg[1], (p - 0.75) / 0.25, opt); B.trazar(ctx, sg[2], (p - 0.75) / 0.25, opt); } }
  else B.trazar(ctx, B.puntosDeOvalo(cx, cy, rx, ry, m.semilla || 11), p, opt);
}

// ── VS: dos círculos con foto que entran de los lados y un "VS" que cae en medio (confrontación) ─────────────────────────────────────
function etiquetaNombre(ctx, nombre, X, y, p, u, estilo) {
  const tam = Math.round(u * 0.03); ctx.font = `${tam}px ${estilo.tipografia.texto}`;
  const pw = ctx.measureText(nombre).width + tam * 1.5, ph = tam * 1.8;
  ctx.save(); ctx.globalAlpha *= p; B.sombraDeCapa(ctx, u, 0.35, 0.28); ctx.fillStyle = estilo.colores.negro; B.rectRedondo(ctx, X - pw / 2, y, pw, ph, ph / 2); ctx.fill(); B.sinSombra(ctx);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(nombre, X, y + ph / 2 + tam * 0.04); ctx.restore();
}
// Tarjeta blanca (la misma de la lista y el gráfico) que entra con un pop; el que llama cierra con ctx.restore().
function abrirTarjeta(ctx, { w, h, u, cy, alto, ancho = 0.84, t }) {
  const aw = w * ancho, x = (w - aw) / 2, y = h * cy - alto / 2, e = pop(t, 0.3);
  ctx.save(); ctx.globalAlpha *= acotar(t / 0.12); ctx.translate(w / 2, h * cy); ctx.scale(e, e); ctx.translate(-w / 2, -h * cy);
  B.sombraDeCapa(ctx, u, 0.6, 0.30); ctx.fillStyle = '#fff'; B.rectRedondo(ctx, x, y, aw, alto, u * 0.035); ctx.fill(); B.sinSombra(ctx);
}
function vs({ a, b, cy = 0.33, r = 0.105, tarjeta = false, t0, t1 }) {
  let ia = null, ib = null;
  return {
    t0, t1, eventos: [{ t: t0, sonido: 'whoosh', db: -8 }, { t: t0 + 0.38, sonido: 'golpe', db: -4 }],
    async preparar() { [ia, ib] = await Promise.all([imagen(a.foto), imagen(b.foto)]); },
    dibujar(ctx, { t, tAbs, w, h, u, estilo }) {
      const R = u * r, Y = tarjeta ? h * cy - u * 0.022 : h * cy, s = easeOutCubic(acotar(t / 0.38)), salida = acotar((t1 - tAbs) / 0.25), XA = lerp(-R, w * 0.27, s), XB = lerp(w + R, w * 0.73, s);
      ctx.save(); ctx.globalAlpha = salida;
      if (tarjeta) { ctx.beginPath(); ctx.rect(w * 0.08, 0, w * 0.84, h); ctx.clip(); abrirTarjeta(ctx, { w, h, u, cy, alto: R * 2 + u * 0.135, t }); } // los círculos entran de los lados, recortados por la tarjeta
      B.retratoCircular(ctx, ia, XA, Y, R, { u }); B.retratoCircular(ctx, ib, XB, Y, R, { u });
      const tv = t - 0.3; if (tv > 0) { // el VS cae con rebote y tiembla un instante
        const e = pop(tv, 0.3), temblor = Math.sin(tv * 60) * Math.exp(-tv * 7) * 0.12, Rv = R * 0.6;
        ctx.save(); ctx.translate(w / 2, Y); ctx.rotate(temblor); ctx.scale(e, e);
        B.sombraDeCapa(ctx, u, 0.5, 0.35); ctx.fillStyle = estilo.colores.rojo; ctx.beginPath(); ctx.arc(0, 0, Rv, 0, Math.PI * 2); ctx.fill(); B.sinSombra(ctx);
        ctx.lineWidth = Rv * 0.12; ctx.strokeStyle = '#fff'; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = `${Math.round(Rv * 1.05)}px ${estilo.tipografia.texto}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('VS', 0, Rv * 0.05); ctx.restore();
      }
      const p = acotar((t - 0.4) / 0.25); if (p > 0) { etiquetaNombre(ctx, a.nombre, XA, Y + R + u * 0.02, p, u, estilo); etiquetaNombre(ctx, b.nombre, XB, Y + R + u * 0.02, p, u, estilo); }
      if (tarjeta) ctx.restore();
      ctx.restore();
    },
  };
}

// ── Apoyo: fotos con un corazón (o siluetas del público si nadie en particular) ────────────────────────────────────────────────────
function apoyo({ fotos = [], icono = 'heart', cy = 0.33, r = 0.1, tarjeta = false, t0, t1 }) {
  let imgs = [], ico = null; const { cargarIcono } = require('./iconos');
  return {
    t0, t1, eventos: [{ t: t0, sonido: 'pop' }, ...(fotos.length ? fotos : [0, 1, 2, 3, 4]).map((_, i) => ({ t: t0 + 0.12 + i * 0.14, sonido: 'clic', db: -12 }))],
    async preparar() { imgs = await Promise.all(fotos.map(f => imagen(f.foto))); ico = await cargarIcono(icono, { color: '#FFFFFF', grosor: 1.8 }); },
    dibujar(ctx, { t, tAbs, w, h, u, estilo }) {
      const salida = acotar((t1 - tAbs) / 0.25); ctx.save(); ctx.globalAlpha = salida;
      if (tarjeta) abrirTarjeta(ctx, { w, h, u, cy, alto: fotos.length ? u * r * 2 + u * 0.135 : u * 0.27, t });
      const corazon = (x, y, R, e) => { ctx.save(); ctx.translate(x, y); ctx.scale(e, e); B.sombraDeCapa(ctx, u, 0.35, 0.3); ctx.fillStyle = estilo.colores.rojo; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill(); B.sinSombra(ctx); if (ico) ctx.drawImage(ico, -R * 0.62, -R * 0.62, R * 1.24, R * 1.24); ctx.restore(); };
      if (fotos.length) {
        const R = u * r, n = fotos.length, sep = R * 2.5;
        fotos.forEach((f, i) => { const tt = t - i * 0.15; if (tt <= 0) return; const e = pop(tt), X = w / 2 + (i - (n - 1) / 2) * sep, Y = tarjeta ? h * cy - u * 0.022 : h * cy;
          ctx.save(); ctx.translate(X, Y); ctx.scale(e, e); ctx.translate(-X, -Y); B.retratoCircular(ctx, imgs[i], X, Y, R, { u }); ctx.restore();
          const te = tt - 0.25; if (te > 0) corazon(X + R * 0.78, Y + R * 0.78, R * 0.34, pop(te, 0.3)); if (f.nombre && tt > 0.3) etiquetaNombre(ctx, f.nombre, X, Y + R + u * 0.02, acotar((tt - 0.3) / 0.25), u, estilo); });
      } else { // siluetas simples del público, con corazones que suben
        const n = 5, base = h * (cy + 0.07) + (tarjeta ? u * 0.012 : 0), tam = u * (tarjeta ? 0.075 : 0.095);
        for (let i = 0; i < n; i++) {
          const tt = t - i * 0.12; if (tt <= 0) continue; const e = pop(tt, 0.3), x = w / 2 + (i - (n - 1) / 2) * tam * 1.55, k = 1 - Math.abs(i - (n - 1) / 2) * 0.1, s = tam * k;
          ctx.save(); ctx.translate(x, base); ctx.scale(e, e); ctx.fillStyle = i % 2 ? '#8E9BA6' : '#A5B1BB'; ctx.strokeStyle = '#fff'; ctx.lineWidth = s * 0.07;
          ctx.beginPath(); ctx.arc(0, -s * 0.95, s * 0.36, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); // cabeza
          ctx.beginPath(); ctx.ellipse(0, 0, s * 0.62, s * 0.78, 0, Math.PI, 0, false); ctx.closePath(); ctx.fill(); ctx.stroke(); // hombros
          ctx.restore();
          const ph = ((t * 0.7 + i * 0.37) % 1.4); if (tt > 0.3 && ph < 1.1) { const q = ph / 1.1; ctx.save(); ctx.globalAlpha *= (1 - q) * acotar(q * 8); corazon(x + Math.sin(q * 5 + i) * s * 0.2, base - s * 1.6 - q * s * (tarjeta ? 1.1 : 1.8), s * 0.3, 1); ctx.restore(); }
        }
      }
      if (tarjeta) ctx.restore();
      ctx.restore();
    },
  };
}

// ── Cita: lo que alguien dijo, en una tarjeta blanca con comillas rojas; cada palabra aparece cuando se dice ───────────────────────────
// texto: la cita TAL CUAL; palabras: [{ t (abs) }] una por palabra del texto (si faltan, se reparten); autor opcional.
function cita({ texto, autor = '', palabras = [], cy = 0.80, t0, t1 }) {
  const ws = String(texto).trim().split(/\s+/), ts = ws.map((_, i) => (palabras[i] && Number.isFinite(palabras[i].t) ? palabras[i].t : t0 + 0.25 + i * 0.28));
  return {
    t0, t1, eventos: [{ t: t0, sonido: 'pop' }],
    dibujar(ctx, { t, tAbs, w, h, u, estilo }) {
      const aw = w * 0.84, pad = u * 0.05, util = aw - pad * 2 - u * 0.02;
      let tam = Math.round(u * 0.056), lineas = [];
      for (; tam >= Math.round(u * 0.038); tam -= 2) { // se achica el texto hasta que quepa en 4 líneas
        ctx.font = `${tam}px ${estilo.tipografia.texto}`; lineas = []; let cur = [];
        ws.forEach((p, i) => { const prueba = cur.concat({ p, i }), ancho = ctx.measureText(prueba.map(x => x.p).join(' ')).width; if (ancho > util && cur.length) { lineas.push(cur); cur = [{ p, i }]; } else cur = prueba; }); if (cur.length) lineas.push(cur);
        if (lineas.length <= 4) break;
      }
      const lh = tam * 1.3, cab = u * 0.07, pie = autor ? tam * 1.5 : 0, alto = pad + cab + lineas.length * lh + pie + pad * 0.7;
      abrirTarjeta(ctx, { w, h, u, cy, alto, t });
      const X = (w - aw) / 2, Y = h * cy - alto / 2;
      ctx.fillStyle = estilo.colores.rojo; ctx.font = `${Math.round(u * 0.2)}px ${estilo.tipografia.numero}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText('\u201C', X + pad * 0.7, Y + u * 0.15);
      ctx.textBaseline = 'middle'; ctx.font = `${tam}px ${estilo.tipografia.texto}`;
      lineas.forEach((ln, li) => { const y = Y + pad * 0.6 + cab + lh * (li + 0.5); let x = X + pad; for (const { p, i } of ln) { const a = easeOutCubic(acotar((tAbs - ts[i]) / 0.18)); ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = estilo.colores.negro; ctx.fillText(p, x, y + (1 - a) * tam * 0.25); ctx.restore(); x += ctx.measureText(p + ' ').width; } });
      if (autor) { ctx.fillStyle = estilo.colores.rojo; ctx.font = `${Math.round(tam * 0.78)}px ${estilo.tipografia.texto}`; ctx.fillText('\u2014 ' + autor, X + pad, Y + alto - pad * 0.7 - tam * 0.45); }
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

// ── Gráfico de barras que CRECE (cada barra sube en su palabra; el valor cuenta hasta su cifra; la mayor va en rojo) ─────────
// items: [{ etiqueta, valor, t (abs, segundo de la palabra) }]; titulo opcional. Tarjeta blanca como la lista.
function grafico({ titulo, items, cy = 0.5, alto = 0.30, t0, t1 }) {
  const maxV = Math.max(...items.map(i => i.valor)), iMax = items.findIndex(i => i.valor === maxV), fmt = v => (Number.isInteger(v) ? v.toLocaleString('es-EC').replace(/ /g, '.') : String(v));
  return {
    t0, t1, eventos: [{ t: t0, sonido: 'pop' }, ...items.map(i => ({ t: i.t, sonido: 'clic' }))],
    dibujar(ctx, { t, tAbs, w, h, u, estilo }) {
      const ancho = w * 0.84, alt = h * alto, x = (w - ancho) / 2, y = h * cy - alt / 2, e = pop(t, 0.3), pad = u * 0.04, tam = Math.round(u * 0.034), tit = titulo ? tam * 1.7 : 0;
      ctx.save(); ctx.globalAlpha = acotar(t / 0.12); ctx.translate(w / 2, h * cy); ctx.scale(e, e); ctx.translate(-w / 2, -h * cy);
      B.sombraDeCapa(ctx, u, 0.6, 0.30); ctx.fillStyle = '#fff'; B.rectRedondo(ctx, x, y, ancho, alt, u * 0.035); ctx.fill(); B.sinSombra(ctx);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (titulo) { ctx.fillStyle = estilo.colores.negro; ctx.font = `${Math.round(tam * 1.15)}px ${estilo.tipografia.texto}`; ctx.fillText(titulo, w / 2, y + pad + tit / 2 - tam * 0.2); }
      const n = items.length, zona = ancho - pad * 2, ancha = zona / n, gap = ancha * 0.22, bw = ancha - gap, base = y + alt - pad - tam * 1.5, tope = y + pad + tit + tam * 1.6, util = base - tope;
      ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + pad, base); ctx.lineTo(x + ancho - pad, base); ctx.stroke();
      items.forEach((it, i) => {
        const p = easeOutCubic(acotar((tAbs - it.t) / 0.75)), bh = util * (it.valor / maxV) * p, bx = x + pad + i * ancha + gap / 2;
        ctx.fillStyle = i === iMax ? estilo.colores.rojo : estilo.colores.negro; B.rectRedondo(ctx, bx, base - bh, bw, Math.max(bh, 0.1), Math.min(bw * 0.18, u * 0.012)); if (bh > 2) ctx.fill();
        if (p > 0.02) { ctx.fillStyle = estilo.colores.negro; ctx.font = `${Math.round(tam * 1.5)}px ${estilo.tipografia.numero}`; ctx.fillText(fmt(Math.round(it.valor * p)), bx + bw / 2, base - bh - tam * 0.9); }
        ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.font = `${Math.round(tam * 0.95)}px ${estilo.tipografia.texto}`; ctx.fillText(it.etiqueta, bx + bw / 2, base + tam * 0.9);
      });
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
        ctx.fillStyle = estilo.colores.negro; ctx.textAlign = 'left';
        // el texto nunca se sale de la tarjeta: primero se achica la letra (hasta 68 %) y, si aún no cabe, se corta con puntos suspensivos
        const maxW = ancho - pad * 2 - rr * 2 - tam * 0.6; let fs2 = tam; ctx.font = `${fs2}px ${estilo.tipografia.texto}`;
        while (ctx.measureText(it.texto).width > maxW && fs2 > tam * 0.68) { fs2 -= tam * 0.04; ctx.font = `${Math.round(fs2)}px ${estilo.tipografia.texto}`; }
        let txt = it.texto; if (ctx.measureText(txt).width > maxW) { while (txt.length > 4 && ctx.measureText(txt + '…').width > maxW) txt = txt.slice(0, -1); txt = txt.trimEnd() + '…'; }
        ctx.fillText(txt, x + pad + rr * 2 + tam * 0.6, cyF + tam * 0.03);
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

// Todos los países del atlas (solo el continente de cada uno), para mapas de OTROS países (Puerto Rico, España, Estados Unidos...). Se carga solo si hace falta.
let _todos = null;
function mundoCompleto() {
  if (_todos) return _todos;
  const topo = require('world-atlas/countries-50m.json');
  _todos = feature(topo, topo.objects.countries).features.filter(f => f.properties.name !== 'Antarctica').map(f => {
    if (f.geometry.type !== 'MultiPolygon') return f;
    const mayor = f.geometry.coordinates.map(c => ({ c, a: geoArea({ type: 'Polygon', coordinates: c }) })).sort((a, b) => b.a - a.a)[0].c;
    return { ...f, geometry: { type: 'Polygon', coordinates: mayor } };
  });
  return _todos;
}
const CERCA = ['Ecuador', 'Colombia', 'Peru', 'Brazil', 'Venezuela', 'Bolivia', 'Chile', 'Panama', 'Costa Rica', 'Argentina', 'Guyana', 'Suriname', 'Paraguay'];

// lugar: { lon, lat, nombre }; tPin: segundo ABSOLUTO en que cae el marcador (la palabra del lugar). pais: nombre del país en el atlas (inglés); nombrePais: cómo se dice en español (etiqueta del marcador).
// Para un país fuera de Sudamérica el mapa parte de una vista amplia y acerca hasta el país, con marcador y nombre en su centro.
// desde: { lon, lat, nombre } = ruta de avión desde ese punto hasta el país (la línea punteada que dibuja el avión); el pin cae al llegar.
function avionGlifo(ctx, x, y, ang, s, color) { // silueta simple de avión, apunta hacia +x
  const mitad = [[1, 0], [0.25, -0.13], [-0.05, -0.8], [-0.3, -0.8], [-0.25, -0.14], [-0.8, -0.1], [-0.95, -0.38], [-1.1, -0.38], [-1.0, 0]];
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.fillStyle = color; ctx.beginPath(); mitad.forEach(([px, py], i) => (i ? ctx.lineTo(px * s, py * s) : ctx.moveTo(px * s, py * s))); mitad.slice(0, -1).reverse().forEach(([px, py]) => ctx.lineTo(px * s, -py * s)); ctx.closePath(); ctx.fill(); ctx.restore();
}
// desde / hasta: { lon, lat, nombre } (ciudad) o { pais: nombre en el atlas, nombre } (el punto es el centro del país). Con los dos, el mapa es una ruta libre entre cualquier par de lugares del mundo.
function mapa({ pais = 'Ecuador', nombrePais, lugar, tPin, cy = 0.5, alto = 0.40, t0, t1, desde = null, hasta = null }) {
  const libre = Boolean(desde && hasta), regional = libre || !CERCA.includes(pais), paises = regional ? mundoCompleto() : mundo().paises;
  let destino = libre ? null : paises.find(f => f.properties.name === pais);
  const puntoDe = p => { if (!p || !p.pais) return p; const f = paises.find(x => x.properties.name === p.pais); if (!f) return null; const c = geoCentroid(f); return { lon: c[0], lat: c[1], nombre: p.nombre || p.pais, feat: f }; };
  if (libre) { desde = puntoDe(desde); hasta = puntoDe(hasta); if (desde && hasta) { lugar = { lon: hasta.lon, lat: hasta.lat, nombre: hasta.nombre }; destino = hasta.feat || null; tPin = tPin ?? t0 + 1.0; } else { desde = null; } }
  else if (regional && destino && !lugar) { const c = geoCentroid(destino); lugar = { lon: c[0], lat: c[1], nombre: nombrePais || pais }; tPin = tPin ?? t0 + 1.0; }
  const viaje = Boolean(desde && lugar && (libre || (regional && destino))), tSale = t0 + 0.45;
  if (viaje) tPin = Math.max(tSale + 1.7, (tPin ?? 0) + 0.4); // el avión sale al aparecer el mapa y llega (el pin cae) cuando se nombra el destino
  const mLon = viaje ? (desde.lon + lugar.lon) / 2 : 0, mLat = viaje ? (desde.lat + lugar.lat) / 2 : 0;
  const proyRuta = (cw, ch) => geoMercator().fitExtent([[cw * 0.14, ch * 0.22], [cw * 0.86, ch * 0.78]], { type: 'MultiPoint', coordinates: [[desde.lon, desde.lat], [lugar.lon, lugar.lat], [mLon - 8, mLat - 8 * ch / cw], [mLon + 8, mLat + 8 * ch / cw]] }); // los dos puntos extra fijan un mínimo de zoom (≈16° de ancho) para rutas cortas
  return {
    t0, t1, eventos: [{ t: t0, sonido: 'pop' }, { t: t0 + 0.35, sonido: 'trazo' }, ...(viaje ? [{ t: tSale, sonido: 'whoosh', db: -6 }] : []), ...(lugar ? [{ t: tPin + 0.45, sonido: 'golpe', db: -6 }, { t: tPin + 0.62, sonido: 'clic', db: -4 }] : [])],
    dibujar(ctx, { t, tAbs, w, h, u, estilo }) {
      const cw = Math.round(w * 0.86), ch = Math.round(h * alto), X = (w - cw) / 2, Y = h * cy - ch / 2, e = pop(t, 0.34);
      const ajuste = (col, pad) => { const p = geoMercator().fitExtent([[pad, pad], [cw - pad, ch - pad]], col); return { k: p.scale(), t: p.translate() }; };
      let A, Z;
      if (viaje) { /* la ruta usa su propia proyección */ } else if (regional) { // vista amplia (≈70° de longitud) → acercamiento al país (≥ 2,4 veces su ancho, mínimo 10°)
        const c = geoCentroid(destino), [[x0], [x1]] = geoBounds(destino), caja = span => { const hy = (span / 2) * (ch / cw); return { type: 'MultiPoint', coordinates: [[c[0] - span / 2, Math.max(-75, c[1] - hy)], [c[0] + span / 2, Math.min(75, c[1] + hy)]] }; };
        const spanZ = Math.max(Math.abs(x1 - x0) * 2.4, 10); A = ajuste(caja(Math.max(70, spanZ * 4)), 0); Z = ajuste(caja(spanZ), 0);
      } else { const ampl = { type: 'FeatureCollection', features: paises.filter(f => ['Ecuador', 'Colombia', 'Peru'].includes(f.properties.name)) }; A = ajuste(ampl, cw * 0.06); Z = ajuste({ type: 'FeatureCollection', features: [destino] }, cw * 0.16); }
      const z = easeOutCubic((t - 0.35) / 1.2);
      const proy = viaje ? proyRuta(cw, ch) : geoMercator().scale(lerp(A.k, Z.k, z)).translate([lerp(A.t[0], Z.t[0], z), lerp(A.t[1], Z.t[1], z)]);
      ctx.save(); ctx.globalAlpha = acotar(t / 0.12); ctx.translate(w / 2, h * cy); ctx.scale(e, e); ctx.translate(-w / 2, -h * cy);
      B.sombraDeCapa(ctx, u, 0.7, 0.32); ctx.fillStyle = '#fff'; B.rectRedondo(ctx, X - 7, Y - 7, cw + 14, ch + 14, u * 0.045); ctx.fill(); B.sinSombra(ctx);
      ctx.save(); B.rectRedondo(ctx, X, Y, cw, ch, u * 0.04); ctx.clip(); ctx.translate(X, Y);
      ctx.fillStyle = '#D7E3E8'; ctx.fillRect(0, 0, cw, ch); // océano
      const ruta = geoPath(proy, ctx);
      for (const f of paises) { ctx.beginPath(); ruta(f); ctx.fillStyle = f === destino ? estilo.colores.verde : '#EAE4D8'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke(); }
      if (viaje) { // línea punteada que dibuja el avión, del punto de salida al destino
        const [ox, oy] = proy([desde.lon, desde.lat]), [dx, dy] = proy([lugar.lon, lugar.lat]), mx = (ox + dx) / 2, my = Math.min(oy, dy) - ch * 0.3;
        const pt = s => { const a = 1 - s; return [a * a * ox + 2 * a * s * mx + s * s * dx, a * a * oy + 2 * a * s * my + s * s * dy]; };
        const p = acotar((tAbs - tSale) / Math.max(0.1, tPin - tSale)), ro = u * 0.014;
        ctx.fillStyle = estilo.colores.negro; ctx.beginPath(); ctx.arc(ox, oy, ro, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ox, oy, ro * 0.4, 0, Math.PI * 2); ctx.fill();
        if (desde.nombre) { const tam = Math.round(u * 0.028); ctx.font = `${tam}px ${estilo.tipografia.texto}`; const tw = ctx.measureText(desde.nombre).width, pw = tw + tam * 1.3, ph = tam * 1.7; ctx.fillStyle = estilo.colores.negro; B.rectRedondo(ctx, ox - pw / 2, oy + ro * 1.6, pw, ph, ph / 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(desde.nombre, ox, oy + ro * 1.6 + ph / 2 + tam * 0.04); }
        if (p > 0) {
          ctx.save(); ctx.setLineDash([u * 0.016, u * 0.012]); ctx.lineWidth = Math.max(4, u * 0.007); ctx.lineCap = 'round'; ctx.strokeStyle = estilo.colores.rojo; ctx.beginPath();
          for (let i = 0; i <= 48; i++) { const [x, y] = pt(p * i / 48); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.stroke(); ctx.restore();
          const [hx, hy] = pt(p), [gx, gy] = pt(Math.max(0, p - 0.02)); ctx.save(); ctx.globalAlpha *= acotar(1 - (tAbs - tPin) / 0.3); B.sombraDeCapa(ctx, u, 0.35, 0.3); avionGlifo(ctx, hx, hy, Math.atan2(hy - gy, hx - gx), u * 0.042, '#1b1b1b'); B.sinSombra(ctx); ctx.restore();
        }
      }
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
            const lx = px + r * 1.4 + pw > cw - 6 ? px - r * 1.4 - pw : px + r * 1.4; // si no cabe a la derecha del pin, va a su izquierda
            ctx.globalAlpha = a; B.sombraDeCapa(ctx, u, 0.3, 0.3); ctx.fillStyle = estilo.colores.negro; B.rectRedondo(ctx, lx, y - r * 2.7, pw, ph, ph / 2); ctx.fill(); B.sinSombra(ctx);
            ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(lugar.nombre, lx + pw / 2, y - r * 2.7 + ph / 2 + tam * 0.04);
          }
        }
      }
      ctx.restore(); ctx.restore();
    },
  };
}

// ── Recuadro vertical redondeado con clip real + marcas a mano encima ───────────────────────────
// marcas: [{ tipo:'circulo', cx, cy, rx, ry, t, dur? } | { tipo:'subrayado', x0, y0, x1, y1, t, dur? }] en fracciones del recuadro; t ABSOLUTO.
function ventanaClip({ clip, ss = 0, marcas = [], cy = 0.63, ancho = 0.616, t0, t1 }) {
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
        trazarMarca(ctx, m, { X, Y, WW, HH, tSrc: ss + (tAbs - t0), p, estilo, u });
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
function montaje({ cortes, t0, t1, cy = 0.54, ancho = 0.616, atenuar = [], base = 0.08, fuerte = 0.30, zooms = [] }) {
  let dir = null, fpsM = 30, WW = 0, HH = 0; const cuadros = [], memo = new Map();
  const cola = cortes.map((c, i) => ({ ...c, trans: c.trans || (i === 0 ? 'fundido' : TRANSICIONES[(i - 1) % TRANSICIONES.length]) }));
  // zoom digital: un golpe de acercamiento (≈ 10 %) en cada palabra clave (zooms: [t absolutos]); sube en 0,12 s y se relaja en ≈ 0,7 s
  const zoomEn = tAbs => { let k = 0; for (const z of zooms) { const tt = tAbs - z; if (tt < 0 || tt > 1.2) continue; k = Math.max(k, tt < 0.12 ? easeOutCubic(tt / 0.12) : Math.exp(-(tt - 0.12) * 3.6)); } return 1 + 0.10 * k; };
  const velo = tAbs => { let a = base; for (const v of atenuar) { const k = acotar((tAbs - v.t0) / 0.3) * acotar((v.t1 - tAbs) / 0.3); a = Math.max(a, lerp(base, fuerte, k)); } return a; };
  const cuadro = async (ci, tAbs) => {
    const c = cola[ci], idx = Math.min(cuadros[ci], Math.max(1, Math.floor((tAbs - c.t0) * fpsM) + 1)), arch = path.join(dir, `c${ci}_${String(idx).padStart(4, '0')}.jpg`);
    const cargarArch = a => { if (!memo.has(a)) { if (memo.size > 24) memo.delete(memo.keys().next().value); memo.set(a, fs.existsSync(a) ? loadImage(fs.readFileSync(a)) : Promise.resolve(null)); } return memo.get(a); };
    // se pide ya la decodificación de los 3 cuadros siguientes: corre en otro hilo mientras este cuadro se dibuja
    for (let k = 1; k <= 3 && idx + k <= cuadros[ci]; k++) cargarArch(path.join(dir, `c${ci}_${String(idx + k).padStart(4, '0')}.jpg`));
    return cargarArch(arch);
  };
  return {
    t0, t1, cortes: cola, eventos: [{ t: t0, sonido: 'pop' }, ...cola.slice(1).map(c => (c.trans === 'fundido' ? { t: c.t0, sonido: 'clic', db: -10 } : { t: c.t0, sonido: 'whoosh', db: -4 })), ...cola.flatMap(c => (c.marcas || []).map(m => ({ t: m.t, sonido: 'trazo' })))],
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
      const zm = zoomEn(tAbs), pon = (img, dx, dy, s = 1, a = 1, enc = null) => { if (!img) return; ctx.save(); ctx.globalAlpha *= a; ctx.translate(X + WW / 2 + dx, Y + HH / 2 + dy + (enc ? enc.dy * HH : 0)); ctx.scale(s * zm * (enc ? enc.s : 1), s * zm * (enc ? enc.s : 1)); ctx.drawImage(img, -WW / 2, -HH / 2, WW, HH); ctx.restore(); }; // enc: reencuadre de la toma para que una tarjeta encima no tape la cara
      const eA = c.enc || null, eP = i > 0 ? cola[i - 1].enc || null : null;
      if (!enTrans) pon(imgA, 0, 0, 1, 1, eA);
      else if (c.trans === 'empuja') { pon(imgP, -p * WW, 0, 1, 1, eP); pon(imgA, (1 - p) * WW, 0, 1, 1, eA); }
      else if (c.trans === 'abajo') { pon(imgP, 0, p * HH, 1, 1, eP); pon(imgA, 0, -(1 - p) * HH, 1, 1, eA); }
      else if (c.trans === 'zoom') { pon(imgP, 0, 0, 1, 1, eP); pon(imgA, 0, 0, lerp(1.28, 1, p), p, eA); }
      else { pon(imgP, 0, 0, 1, 1, eP); pon(imgA, 0, 0, 1, p, eA); }
      ctx.fillStyle = `rgba(20,16,12,${(velo(tAbs) || 0).toFixed(3)})`; ctx.fillRect(X, Y, WW, HH); // velo: más oscuro donde hay tarjetas
      ctx.restore();
      for (const m of c.marcas || []) {
        const pr = easeOutCubic((tAbs - m.t) / (m.dur || 0.7)); if (pr <= 0 || tAbs > c.t1 + TRANS) continue;
        trazarMarca(ctx, m, { X, Y, WW, HH, tSrc: (c.ss || 0) + (tAbs - c.t0), p: pr, estilo, u });
      }
      ctx.restore();
    },
    limpiar() { if (dir) try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} },
  };
}

module.exports = { vs, apoyo, cita, retrato, cifra, grafico, listaNumerada, mapa, ventanaClip, montaje, TRANS };

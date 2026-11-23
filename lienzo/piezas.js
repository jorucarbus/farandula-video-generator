// Piezas explicativas nuevas del estilo: insignia con ícono, progresión "de A a B" (bastonera → reina), burbuja de cita y sello.
// Mismo contrato que elementos.js: { t0, t1, eventos, preparar?, dibujar }. Los tiempos de cada nodo llegan ABSOLUTOS (la palabra).
const { cargarIcono } = require('./iconos');
const B = require('./base');
const { lerp, acotar, easeOutCubic, easeOutBack } = require('../overlay/animacion');
const { COMPONENTES } = require('../overlay/componentes');

const color = (estilo, nombre) => ({ rojo: estilo.colores.rojo, verde: estilo.colores.verde, negro: estilo.colores.negro, gris: estilo.colores.gris }[nombre] || nombre);
const pop = (t, dur = 0.34) => lerp(0.45, 1, easeOutBack(t / dur, 1.9));

// Mezcla de un color #RRGGBB con blanco (k 0..1): para el brillo del volumen.
function aclarar(hex, k) { const n = parseInt(hex.slice(1), 16); const m = c => Math.round(c + (255 - c) * k); return `rgb(${m(n >> 16 & 255)},${m(n >> 8 & 255)},${m(n & 255)})`; }

// Disco de color con volumen (brillo arriba-izquierda, aro interior), ícono blanco y etiqueta opcional.
function dibujarInsignia(ctx, { x, y, R, img, base, etiqueta, t, u, estilo, pulso = 0 }) {
  const e = pop(t);
  B.sombraDeContacto(ctx, x, y + R * 1.12, R * 0.95 * e, R * 0.2 * e, 0.2 * acotar(t / 0.3));
  ctx.save(); ctx.globalAlpha = acotar(t / 0.1); ctx.translate(x, y + Math.sin(t * 1.8) * u * 0.003); ctx.scale(e, e);
  if (pulso > 0) { ctx.strokeStyle = `rgba(229,23,63,${0.45 * (1 - pulso)})`; ctx.lineWidth = u * 0.006; ctx.beginPath(); ctx.arc(0, 0, R * (1.05 + pulso * 0.5), 0, Math.PI * 2); ctx.stroke(); }
  B.sombraDeCapa(ctx, u, 0.6, 0.34);
  const g = ctx.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R * 1.05); g.addColorStop(0, aclarar(base, 0.28)); g.addColorStop(1, base);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill(); B.sinSombra(ctx);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = Math.max(2, R * 0.04); ctx.beginPath(); ctx.arc(0, 0, R * 0.9, 0, Math.PI * 2); ctx.stroke();
  const s = R * 1.15; ctx.drawImage(img, -s / 2, -s / 2, s, s);
  if (etiqueta) {
    const tam = Math.round(u * 0.031); ctx.font = `${tam}px ${estilo.tipografia.texto}`;
    const tw = ctx.measureText(etiqueta).width, pw = tw + tam * 1.5, ph = tam * 1.85, py = R + tam * 0.7;
    B.sombraDeCapa(ctx, u, 0.3, 0.28); ctx.fillStyle = estilo.colores.negro; B.rectRedondo(ctx, -pw / 2, py, pw, ph, ph / 2); ctx.fill(); B.sinSombra(ctx);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(etiqueta, 0, py + ph / 2 + tam * 0.04);
  }
  ctx.restore();
}

function insignia({ icono, color: c = 'negro', etiqueta, cx = 0.5, cy = 0.5, r = 0.075, t0, t1 }) {
  let img;
  return {
    t0, t1, eventos: [{ t: t0, sonido: 'pop' }],
    async preparar() { img = await cargarIcono(icono, { color: '#FFFFFF', grosor: 1.8 }); },
    dibujar(ctx, { t, w, h, u, estilo }) { dibujarInsignia(ctx, { x: w * cx, y: h * cy, R: u * r, img, base: color(estilo, c), etiqueta, t, u, estilo }); },
  };
}

// nodos: [{ icono, etiqueta, color?, t (abs) }] de 2 a 3. Cada nodo entra en su palabra; la flecha se traza justo antes del siguiente.
function progresion({ nodos, cy = 0.66, t0, t1 }) {
  let imgs = [];
  const ini = t0 ?? nodos[0].t;
  return {
    t0: ini, t1,
    eventos: nodos.flatMap((n, i) => [{ t: n.t, sonido: i === nodos.length - 1 ? 'golpe' : 'pop', db: i === nodos.length - 1 ? -4 : 0 }, ...(i ? [{ t: n.t - 0.42, sonido: 'trazo' }] : [])]),
    async preparar() { imgs = await Promise.all(nodos.map(n => cargarIcono(n.icono, { color: '#FFFFFF', grosor: 1.8 }))); },
    dibujar(ctx, { tAbs, w, h, u, estilo }) {
      const n = nodos.length, sep = n === 2 ? 0.46 : 0.31, Y = h * cy;
      const R = i => u * (i === n - 1 ? 0.112 : 0.092);
      const X = i => w * (0.5 + (i - (n - 1) / 2) * sep);
      const defecto = i => (i === 0 ? 'gris' : i === n - 1 ? 'rojo' : 'verde');
      nodos.forEach((nd, i) => { // flechas debajo de los discos
        if (!i) return;
        const p = easeOutCubic((tAbs - (nd.t - 0.42)) / 0.42); if (p <= 0) return;
        const x0 = X(i - 1) + R(i - 1) * 1.2, x1 = X(i) - R(i) * 1.25, pts = [];
        for (let k = 0; k <= 30; k++) { const s = k / 30; pts.push({ x: lerp(x0, x1, s), y: Y - Math.sin(s * Math.PI) * u * 0.03 }); }
        B.trazar(ctx, pts, p, { color: estilo.colores.negro, ancho: u * 0.009, u });
        if (p > 0.9) { const q = acotar((p - 0.9) / 0.1), a = 9; B.trazar(ctx, [{ x: x1 - u * 0.028, y: Y - u * 0.026 }, { x: x1, y: Y }, { x: x1 - u * 0.028, y: Y + u * 0.024 }], q, { color: estilo.colores.negro, ancho: u * 0.009, u }); void a; }
      });
      nodos.forEach((nd, i) => {
        const t = tAbs - nd.t; if (t < 0) return;
        const ultimo = i === n - 1;
        dibujarInsignia(ctx, { x: X(i), y: Y, R: R(i), img: imgs[i], base: color(estilo, nd.color || defecto(i)), etiqueta: nd.etiqueta, t, u, estilo, pulso: ultimo ? acotar((t - 0.3) / 0.9) : 0 });
      });
    },
  };
}

// Burbuja de cita: tarjeta blanca con comillas rojas y cola hacia el hablante.
function burbuja({ texto, cx = 0.5, cy = 0.5, ancho = 0.74, cola = 'izq', t0, t1 }) {
  return {
    t0, t1, eventos: [{ t: t0, sonido: 'clic' }],
    dibujar(ctx, { t, w, h, u, estilo }) {
      const tam = Math.round(u * 0.046); ctx.font = `${tam}px ${estilo.tipografia.texto}`;
      const maxW = w * ancho - tam * 2.4, lineas = []; let act = '';
      for (const p of String(texto).split(/\s+/)) { const prueba = act ? `${act} ${p}` : p; if (ctx.measureText(prueba).width > maxW && act) { lineas.push(act); act = p; } else act = prueba; }
      if (act) lineas.push(act);
      const bw = w * ancho, bh = lineas.length * tam * 1.3 + tam * 2.6, X = w * cx - bw / 2, Y = h * cy - bh / 2, e = pop(t, 0.3);
      ctx.save(); ctx.globalAlpha = acotar(t / 0.12); ctx.translate(w * cx, h * cy); ctx.scale(e, e); ctx.translate(-w * cx, -h * cy);
      B.sombraDeCapa(ctx, u, 0.55, 0.3); ctx.fillStyle = '#fff';
      B.rectRedondo(ctx, X, Y, bw, bh, u * 0.04); ctx.fill();
      const cx0 = cola === 'izq' ? X + bw * 0.16 : X + bw * 0.84; // cola
      ctx.beginPath(); ctx.moveTo(cx0 - u * 0.03, Y + bh - 2); ctx.lineTo(cx0 + (cola === 'izq' ? -u * 0.02 : u * 0.02), Y + bh + u * 0.05); ctx.lineTo(cx0 + u * 0.035, Y + bh - 2); ctx.closePath(); ctx.fill(); B.sinSombra(ctx);
      ctx.fillStyle = estilo.colores.rojo; ctx.font = `${Math.round(tam * 2.2)}px ${estilo.tipografia.numero}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('“', X + tam * 0.5, Y + tam * 0.1);
      ctx.fillStyle = estilo.colores.negro; ctx.font = `${tam}px ${estilo.tipografia.texto}`;
      lineas.forEach((l, i) => ctx.fillText(l, X + tam * 1.2, Y + tam * 1.1 + i * tam * 1.3));
      ctx.restore();
    },
  };
}

// Sello de rumor (componente del estilo) a pantalla completa.
function sello({ texto = 'Rumor sin confirmar', cy = 0.5, t0, t1 }) {
  const datos = { texto, ancla: 'centro' };
  return {
    t0, t1, eventos: [{ t: t0 + 0.19, sonido: 'golpe' }],
    dibujar(ctx, { t, w, h, u, estilo }) {
      const comp = COMPONENTES.sello_animado, caja = comp.caja({ w, h, u, datos, estilo, ctx });
      ctx.save(); ctx.translate(caja.x, Math.round(h * cy - caja.ch / 2));
      comp.dibujar(ctx, { p: acotar(t / comp.dur(estilo, datos)), t, cw: caja.cw, ch: caja.ch, w, h, u, datos, estilo });
      ctx.restore();
    },
  };
}

module.exports = { insignia, progresion, burbuja, sello, aclarar };

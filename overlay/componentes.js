// Componentes visuales del estilo (cada uno = una pieza que una receta puede pedir). Se dibujan con canvas
// dentro de una caja pequeña y se animan por secuencia de fotogramas (ver animacion.js).
// Contrato: { dur(estilo,datos), caja({w,h,u,datos,estilo,ctx}) → {cw,ch,x,y}, dibujar(ctx,{p,t,cw,ch,u,datos,estilo}) }
const { lerp, acotar, easeOutCubic, easeInQuad, easeOutBack } = require('./animacion');

function rectRedondo(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y); ctx.arcTo(x + w, y, x + w, y + h, rr); ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr); ctx.arcTo(x, y, x + w, y, rr); ctx.closePath();
}

function espaciar(ctx, px) { if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`; }

function envolver(ctx, texto, maxAncho) {
  const lineas = []; let actual = '';
  for (const palabra of String(texto).trim().split(/\s+/)) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (ctx.measureText(prueba).width > maxAncho && actual) { lineas.push(actual); actual = palabra; } else actual = prueba;
  }
  if (actual) lineas.push(actual);
  return lineas;
}

// Ancla vertical dentro del cuadro: lo que pide la receta ('arriba' | 'centro' | 'abajo').
function ubicar(ancla, w, h, cw, ch) {
  const cy = { arriba: 0.17, centro: 0.46, abajo: 0.72 }[ancla] ?? 0.46;
  return { x: Math.round((w - cw) / 2), y: Math.round(h * cy - ch / 2) };
}

// Miles con punto, como se escribe en Ecuador/España ("500.000"). `agrupar:false` para años.
const formatear = (n, agrupar = true) => (agrupar ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : String(n));

// ── Cifra en píldora roja con conteo ────────────────────────────────────────────────────────────
const cifraPildora = {
  dur: (est, datos) => (datos.conteo === false ? est.movimiento.pop.dur : Math.max(est.movimiento.pop.dur, est.movimiento.conteo.dur)),
  _medidas({ w, u, datos, estilo, ctx }) {
    let tam = Math.round(u * 0.17);
    const final = `${datos.prefijo || ''}${formatear(datos.valor, datos.agrupar !== false)}${datos.sufijo || ''}`;
    ctx.font = `${tam}px ${estilo.tipografia.numero}`; espaciar(ctx, 0);
    let tw = ctx.measureText(final).width;
    // Si no cabe en el cuadro (p. ej. "12 aspirantes"), se achica el tamaño completo en vez de recortar.
    const maxAncho = w * 0.88;
    if (tw + tam * 0.76 > maxAncho) { tam = Math.floor(tam * maxAncho / (tw + tam * 0.76)); ctx.font = `${tam}px ${estilo.tipografia.numero}`; tw = ctx.measureText(final).width; }
    const padX = tam * 0.38, padY = tam * 0.12;
    return { tam, tw, pw: Math.ceil(tw + padX * 2), ph: Math.ceil(tam * 0.86 + padY * 2), final };
  },
  caja(a) {
    const m = this._medidas(a), margen = Math.round(a.u * 0.09);
    const cw = Math.min(a.w, m.pw + margen * 2), ch = m.ph + margen * 2;
    return { cw, ch, ...ubicar(a.datos.ancla, a.w, a.h, cw, ch) };
  },
  dibujar(ctx, a) {
    const { t, cw, ch, w, u, datos, estilo } = a;
    const m = this._medidas({ w, u, datos, estilo, ctx });
    const mv = estilo.movimiento;
    const escala = lerp(mv.pop.escalaInicial, 1, easeOutBack(t / mv.pop.dur, mv.pop.sobreimpulso));
    const valor = datos.conteo === false ? datos.valor : Math.round(datos.valor * easeOutCubic(t / mv.conteo.dur));
    ctx.save();
    ctx.globalAlpha = acotar(t / 0.08);
    ctx.translate(cw / 2, ch / 2); ctx.scale(escala, escala);
    ctx.shadowColor = estilo.colores.sombra; ctx.shadowBlur = u * 0.03; ctx.shadowOffsetY = u * 0.012;
    ctx.fillStyle = estilo.colores.rojo; rectRedondo(ctx, -m.pw / 2, -m.ph / 2, m.pw, m.ph, m.ph / 2); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = estilo.colores.blanco; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${m.tam}px ${estilo.tipografia.numero}`;
    ctx.fillText(`${datos.prefijo || ''}${formatear(valor, datos.agrupar !== false)}${datos.sufijo || ''}`, 0, m.tam * 0.03);
    ctx.restore();
  },
};

// ── Sello de rumor: cae grande, golpea y se asienta ligeramente girado ─────────────────────────
const selloAnimado = {
  dur: (est) => est.movimiento.sello.dur,
  _medidas({ u, datos, estilo, ctx }) {
    const tam = Math.round(u * 0.058);
    ctx.font = `${tam}px ${estilo.tipografia.texto}`; espaciar(ctx, tam * 0.06);
    const texto = String(datos.texto).toUpperCase();
    const tw = ctx.measureText(texto).width;
    return { tam, texto, bw: Math.ceil(tw + tam * 1.1), bh: Math.ceil(tam * 1.9) };
  },
  caja(a) {
    const m = this._medidas(a), s = a.estilo.movimiento.sello.escalaInicial;
    // Caja para la escala inicial; si excede el cuadro se recorta (el cuadro la recortaría igual).
    const cw = Math.min(a.w, Math.ceil(m.bw * s * 1.08)), ch = Math.ceil(m.bw * 0.12 * s + m.bh * s * 1.1);
    return { cw, ch, ...ubicar(a.datos.ancla, a.w, a.h, cw, ch) };
  },
  dibujar(ctx, a) {
    const { p, cw, ch, u, datos, estilo } = a;
    const m = this._medidas({ u, datos, estilo, ctx }), s = estilo.movimiento.sello;
    const caida = 0.62; // fracción del tiempo que dura la caída; el resto es el asiento
    const escala = p < caida ? lerp(s.escalaInicial, s.escalaImpacto, easeInQuad(p / caida)) : lerp(s.escalaImpacto, 1, easeOutCubic((p - caida) / (1 - caida)));
    ctx.save();
    ctx.globalAlpha = acotar(p / 0.25);
    ctx.translate(cw / 2, ch / 2); ctx.rotate((s.giroGrados * Math.PI) / 180); ctx.scale(escala, escala);
    ctx.strokeStyle = estilo.colores.rojo; ctx.fillStyle = estilo.colores.rojo;
    ctx.lineWidth = u * 0.011; rectRedondo(ctx, -m.bw / 2, -m.bh / 2, m.bw, m.bh, m.tam * 0.28); ctx.stroke();
    ctx.lineWidth = u * 0.004; rectRedondo(ctx, -m.bw / 2 + u * 0.016, -m.bh / 2 + u * 0.016, m.bw - u * 0.032, m.bh - u * 0.032, m.tam * 0.2); ctx.stroke();
    ctx.font = `${m.tam}px ${estilo.tipografia.texto}`; espaciar(ctx, m.tam * 0.06);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(m.texto, 0, m.tam * 0.04);
    ctx.restore();
  },
};

// ── Tarjeta de dato: etiqueta (FECHA, LUGAR…) + titular en numerales condensados + detalle ─────
const tarjetaDato = {
  dur: (est) => est.movimiento.pop.dur,
  _medidas({ w, u, datos, estilo, ctx }) {
    const ancho = Math.min(w * 0.86, u * 0.86), pad = u * 0.045;
    const tamT = Math.round(u * 0.095), tamE = Math.round(u * 0.03), tamD = Math.round(u * 0.04);
    ctx.font = `${tamT}px ${estilo.tipografia.numero}`; espaciar(ctx, 0);
    const lineasT = envolver(ctx, datos.titulo, ancho - pad * 2);
    ctx.font = `${tamD}px ${estilo.tipografia.texto}`;
    const lineasD = datos.detalle ? envolver(ctx, datos.detalle, ancho - pad * 2) : [];
    const altoE = datos.etiqueta ? tamE * 1.9 : 0;
    const alto = pad + altoE + lineasT.length * tamT * 1.02 + (lineasD.length ? tamD * 0.5 + lineasD.length * tamD * 1.25 : 0) + pad;
    return { ancho, alto: Math.ceil(alto), pad, tamT, tamE, tamD, lineasT, lineasD, altoE };
  },
  caja(a) {
    const m = this._medidas(a), margen = Math.round(a.u * 0.09);
    const cw = Math.min(a.w, Math.ceil(m.ancho) + margen * 2), ch = m.alto + margen * 2;
    return { cw, ch, ...ubicar(a.datos.ancla, a.w, a.h, cw, ch) };
  },
  dibujar(ctx, a) {
    const { t, cw, ch, w, u, datos, estilo } = a;
    const m = this._medidas({ w, u, datos, estilo, ctx }), mv = estilo.movimiento;
    const escala = lerp(mv.pop.escalaInicial, 1, easeOutBack(t / mv.pop.dur, mv.pop.sobreimpulso));
    ctx.save();
    ctx.globalAlpha = acotar(t / 0.08);
    ctx.translate(cw / 2, ch / 2); ctx.scale(escala, escala);
    ctx.shadowColor = estilo.colores.sombra; ctx.shadowBlur = u * 0.035; ctx.shadowOffsetY = u * 0.014;
    ctx.fillStyle = estilo.colores.blanco; rectRedondo(ctx, -m.ancho / 2, -m.alto / 2, m.ancho, m.alto, u * 0.035); ctx.fill();
    ctx.shadowColor = 'transparent';
    let y = -m.alto / 2 + m.pad; const x = -m.ancho / 2 + m.pad;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    if (datos.etiqueta) {
      ctx.font = `${m.tamE}px ${estilo.tipografia.texto}`; espaciar(ctx, m.tamE * 0.14); ctx.fillStyle = estilo.colores.verde;
      ctx.fillText(String(datos.etiqueta).toUpperCase(), x, y); y += m.altoE;
    }
    ctx.font = `${m.tamT}px ${estilo.tipografia.numero}`; espaciar(ctx, 0); ctx.fillStyle = estilo.colores.negro;
    for (const l of m.lineasT) { ctx.fillText(l, x, y); y += m.tamT * 1.02; }
    if (m.lineasD.length) {
      y += m.tamD * 0.5; ctx.font = `${m.tamD}px ${estilo.tipografia.texto}`; ctx.fillStyle = estilo.colores.gris;
      for (const l of m.lineasD) { ctx.fillText(l, x, y); y += m.tamD * 1.25; }
    }
    ctx.restore();
  },
};

const COMPONENTES = { cifra_pildora: cifraPildora, sello_animado: selloAnimado, tarjeta_dato: tarjetaDato };
module.exports = { COMPONENTES, formatear, rectRedondo, envolver, ubicar };

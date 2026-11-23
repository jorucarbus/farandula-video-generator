// Escenarios MÍNIMOS para las marionetas: pocos elementos, vectoriales y planos, con un letrero cuyo texto sale de la
// frase narrada (ej. una casa con el letrero "Mansión VIP"). Se dibujan en código: no hay que generar imágenes.
// Mismo contrato que los demás elementos: { t0, t1, eventos, dibujar }. cx/base en fracciones del cuadro (base = suelo).
const B = require('./base');
const { lerp, acotar, easeOutBack } = require('../overlay/animacion');

const TIPOS = ['casa', 'escenario', 'cartel'];
const TRAZO = '#2A2623';

// Letrero: tablero oscuro con el texto ajustado al ancho (en 1 o 2 líneas).
function letrero(ctx, { x, y, ancho, alto, texto, estilo, u }) {
  B.sombraDeCapa(ctx, u, 0.35, 0.3);
  ctx.fillStyle = '#1E1B19'; B.rectRedondo(ctx, x - ancho / 2, y - alto / 2, ancho, alto, alto * 0.18); ctx.fill(); B.sinSombra(ctx);
  ctx.strokeStyle = '#D9B26A'; ctx.lineWidth = Math.max(2, alto * 0.05); B.rectRedondo(ctx, x - ancho / 2 + alto * 0.08, y - alto / 2 + alto * 0.08, ancho - alto * 0.16, alto - alto * 0.16, alto * 0.12); ctx.stroke();
  const palabras = String(texto).toUpperCase().split(/\s+/), lineas = palabras.length > 2 ? [palabras.slice(0, Math.ceil(palabras.length / 2)).join(' '), palabras.slice(Math.ceil(palabras.length / 2)).join(' ')] : [palabras.join(' ')];
  let tam = alto * (lineas.length > 1 ? 0.34 : 0.5);
  ctx.font = `${tam}px ${estilo.tipografia.numero}`;
  const maxW = Math.max(...lineas.map(l => ctx.measureText(l).width)); if (maxW > ancho * 0.82) { tam *= ancho * 0.82 / maxW; ctx.font = `${tam}px ${estilo.tipografia.numero}`; }
  ctx.fillStyle = '#F5E6BE'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  lineas.forEach((l, i) => ctx.fillText(l, x, y + (i - (lineas.length - 1) / 2) * tam * 1.05 + tam * 0.04));
}

function dibujarCasa(ctx, { x, suelo, ancho, texto, estilo, u }) {
  const alto = ancho * 0.62, y0 = suelo - alto; // paredes
  ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, u * 0.004); ctx.strokeStyle = TRAZO;
  B.sombraDeContacto(ctx, x, suelo + 4, ancho * 0.62, ancho * 0.06, 0.26);
  B.sombraDeCapa(ctx, u, 0.4, 0.28);
  ctx.fillStyle = '#F1D9AE'; ctx.fillRect(x - ancho / 2, y0, ancho, alto); B.sinSombra(ctx); ctx.strokeRect(x - ancho / 2, y0, ancho, alto);
  ctx.fillStyle = '#C8473A'; ctx.beginPath(); ctx.moveTo(x - ancho * 0.58, y0 + 2); ctx.lineTo(x, y0 - ancho * 0.30); ctx.lineTo(x + ancho * 0.58, y0 + 2); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#9B3328'; ctx.fillRect(x + ancho * 0.22, y0 - ancho * 0.26, ancho * 0.09, ancho * 0.17); ctx.strokeRect(x + ancho * 0.22, y0 - ancho * 0.26, ancho * 0.09, ancho * 0.17); // chimenea
  ctx.fillStyle = '#7A4B2C'; B.rectRedondo(ctx, x - ancho * 0.09, suelo - alto * 0.5, ancho * 0.18, alto * 0.5, ancho * 0.02); ctx.fill(); ctx.stroke(); // puerta
  ctx.fillStyle = '#D9B26A'; ctx.beginPath(); ctx.arc(x + ancho * 0.05, suelo - alto * 0.25, ancho * 0.008, 0, Math.PI * 2); ctx.fill();
  for (const sx of [-1, 1]) { ctx.fillStyle = '#9CC9E4'; ctx.fillRect(x + sx * ancho * 0.3 - ancho * 0.08, y0 + alto * 0.52, ancho * 0.16, alto * 0.24); ctx.strokeRect(x + sx * ancho * 0.3 - ancho * 0.08, y0 + alto * 0.52, ancho * 0.16, alto * 0.24); }
  letrero(ctx, { x, y: y0 + alto * 0.26, ancho: ancho * 0.8, alto: alto * 0.30, texto, estilo, u });
}

function dibujarEscenario(ctx, { x, suelo, ancho, texto, estilo, u }) {
  const alto = ancho * 0.72, y0 = suelo - alto; ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, u * 0.004); ctx.strokeStyle = TRAZO;
  B.sombraDeContacto(ctx, x, suelo + 4, ancho * 0.6, ancho * 0.05, 0.26);
  B.sombraDeCapa(ctx, u, 0.4, 0.28); ctx.fillStyle = '#6B5A4C'; ctx.fillRect(x - ancho / 2, suelo - alto * 0.1, ancho, alto * 0.1); B.sinSombra(ctx); ctx.strokeRect(x - ancho / 2, suelo - alto * 0.1, ancho, alto * 0.1); // tarima
  ctx.fillStyle = '#3A2B3F'; ctx.fillRect(x - ancho * 0.45, y0, ancho * 0.9, alto * 0.9); ctx.strokeRect(x - ancho * 0.45, y0, ancho * 0.9, alto * 0.9); // fondo
  for (const sx of [-1, 1]) { ctx.fillStyle = '#B5333F'; ctx.beginPath(); ctx.moveTo(x + sx * ancho * 0.45, y0); ctx.lineTo(x + sx * ancho * 0.2, y0); ctx.quadraticCurveTo(x + sx * ancho * 0.3, y0 + alto * 0.45, x + sx * ancho * 0.18, y0 + alto * 0.9); ctx.lineTo(x + sx * ancho * 0.45, y0 + alto * 0.9); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  const g = ctx.createLinearGradient(x, y0, x, suelo); g.addColorStop(0, 'rgba(255,240,190,0.38)'); g.addColorStop(1, 'rgba(255,240,190,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - ancho * 0.04, y0); ctx.lineTo(x + ancho * 0.04, y0); ctx.lineTo(x + ancho * 0.26, suelo - alto * 0.1); ctx.lineTo(x - ancho * 0.26, suelo - alto * 0.1); ctx.closePath(); ctx.fill();
  letrero(ctx, { x, y: y0 + alto * 0.16, ancho: ancho * 0.62, alto: alto * 0.22, texto, estilo, u });
}

function dibujarCartel(ctx, { x, suelo, ancho, texto, estilo, u }) {
  const alto = ancho * 0.55; B.sombraDeContacto(ctx, x, suelo + 3, ancho * 0.3, ancho * 0.03, 0.24);
  ctx.fillStyle = '#7A4B2C'; ctx.fillRect(x - ancho * 0.03, suelo - alto * 1.5, ancho * 0.06, alto * 1.5);
  letrero(ctx, { x, y: suelo - alto * 1.5, ancho, alto, texto, estilo, u });
}
const DIBUJAR = { casa: dibujarCasa, escenario: dibujarEscenario, cartel: dibujarCartel };

// tipo ∈ TIPOS; texto = lo que dice el letrero (literal de la frase). cx/base: posición del centro y del suelo (fracciones).
function escenario({ tipo = 'casa', texto, cx = 0.65, base = 0.9, ancho = 0.52, t0, t1 }) {
  if (!DIBUJAR[tipo]) throw new Error(`escenario desconocido: ${tipo}`);
  return {
    t0, t1, eventos: [{ t: t0, sonido: 'trazo' }],
    dibujar(ctx, { t, w, h, u, estilo }) {
      const p = acotar(t / 0.45), e = lerp(0.85, 1, easeOutBack(p, 1.3)), suelo = h * base, x = w * cx;
      ctx.save(); ctx.globalAlpha *= acotar(t / 0.2); ctx.translate(x, suelo); ctx.scale(e, e); ctx.translate(-x, -suelo + (1 - p) * u * 0.05);
      DIBUJAR[tipo](ctx, { x, suelo, ancho: w * ancho, texto, estilo, u });
      ctx.restore();
    },
  };
}

module.exports = { escenario, TIPOS };

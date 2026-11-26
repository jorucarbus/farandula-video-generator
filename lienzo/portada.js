// Portada 9:16 (1080x1920) de un video: foto a sangre de la protagonista, degradado con el color del canal, etiqueta con el logo del canal,
// titular grueso con la parte clave resaltada y círculos con los otros participantes de la noticia.
//
// Referencias: el estilo "Fuull Farándula" que pasó la dueña (foto completa + degradado + etiqueta "VIRAL" + titular blanco con la frase clave en amarillo).
// Se incrusta en el PRIMER cuadro del video (así TikTok/Reels la toman como portada) y se guarda también como JPG.
//
// Zonas seguras: TikTok tapa ~150 px arriba, ~330 px abajo y ~130 px a la derecha con su propia interfaz; en el feed la portada se recorta a 3:4 (centro).
// Por eso el bloque de texto termina por encima de y = 0,80·h y nada importante va en el borde derecho.
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { registrarFuentes } = require('../overlay/animacion');
const B = require('./base');

const MARCAS_DIR = path.join(__dirname, '..', 'assets', 'marcas');
const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ]+/g, '');
// Paleta por canal (sale de sus logos): degradado, acento de la etiqueta y color del resalte.
const PALETAS = {
  chismexpicante: { nombre: 'Chismex Picante', degradado: '#8E0B1F', acento: '#E5173F', resalte: '#FFD21F', logo: 'chismexpicante.png', fondoLogo: '#0B0B0B' },
  embajadoresdelchisme: { nombre: 'Embajadores del Chisme', degradado: '#0B5D57', acento: '#E4492E', resalte: '#FFD21F', logo: 'embajadoresdelchisme.png', fondoLogo: '#FBEBD3' },
  supelupe: { nombre: 'Supe Lupe', degradado: '#A10F63', acento: '#E0147E', resalte: '#FFE14A', logo: 'supelupe.png', fondoLogo: '#FFC107' },
  lanaple: { nombre: 'La Naple', degradado: '#0B6475', acento: '#F2B01E', resalte: '#FFD21F', logo: 'lanaple.png', fondoLogo: '#FDEEDC' },
};
const PALETA_NEUTRA = { nombre: '', degradado: '#3A1458', acento: '#E5173F', resalte: '#FFD21F', logo: null, fondoLogo: '#fff' };
const paletaDe = canal => PALETAS[norm(canal)] || PALETA_NEUTRA;

// Parte el titular en palabras y marca cuáles pertenecen al resalte (sin tildes ni mayúsculas).
function marcarResalte(titular, resalte) {
  const pal = String(titular).trim().split(/\s+/), r = String(resalte || '').trim().split(/\s+/).map(norm).filter(Boolean);
  const marcas = pal.map(() => false); if (!r.length) return pal.map(p => ({ p, r: false }));
  for (let i = 0; i + r.length <= pal.length; i++) if (r.every((x, k) => norm(pal[i + k]) === x)) { for (let k = 0; k < r.length; k++) marcas[i + k] = true; break; }
  return pal.map((p, i) => ({ p, r: marcas[i] }));
}

// Reparte las palabras en líneas que quepan en `ancho` con la fuente ya puesta en ctx. Devuelve [[{p,r,w}...]...]
function repartir(ctx, palabras, ancho, espacio) {
  const lineas = []; let l = [], x = 0;
  for (const pw of palabras) {
    const w = ctx.measureText(pw.p).width;
    if (l.length && x + espacio + w > ancho) { lineas.push(l); l = []; x = 0; }
    l.push({ ...pw, w }); x += (l.length > 1 ? espacio : 0) + w;
  }
  if (l.length) lineas.push(l); return lineas;
}

// Elige el tamaño de letra más grande que deja el titular en `maxLineas` líneas como mucho.
function ajustarTitular(ctx, palabras, { ancho, maxLineas, tamMax, tamMin, fuente }) {
  for (let tam = tamMax; tam >= tamMin; tam -= 4) {
    ctx.font = `${tam}px ${fuente}`; const espacio = tam * 0.22, lineas = repartir(ctx, palabras, ancho, espacio);
    if (lineas.length <= maxLineas && lineas.every(l => l.reduce((s, x, i) => s + x.w + (i ? espacio : 0), 0) <= ancho + 1)) return { tam, lineas, espacio };
  }
  ctx.font = `${tamMin}px ${fuente}`; const espacio = tamMin * 0.22; return { tam: tamMin, lineas: repartir(ctx, palabras, ancho, espacio), espacio };
}

async function cargar(x) { return x ? (Buffer.isBuffer(x) ? loadImage(x) : loadImage(fs.readFileSync(x))) : null; }

// foto: Buffer|ruta. foco: { x, y } 0-1 (dónde está la cara en la foto). circulos: [{ foto, nombre }] (máx. 3).
async function dibujarPortada({ w = 1080, h = 1920, foto, foco = { x: 0.5, y: 0.35 }, titular, resalte = '', etiqueta = 'VIRAL', canal = '', circulos = [], estilo }) {
  if (estilo) registrarFuentes(estilo);
  const pal = paletaDe(canal), canvas = createCanvas(w, h), ctx = canvas.getContext('2d'), u = Math.min(w, h);
  const FUENTE = '"Big Shoulders"', TEXTO = 'Outfit';

  // 1) foto a sangre (recorte "cover") con la cara en el tercio superior
  const img = await cargar(foto);
  if (img) {
    // acercamiento leve (hasta 1,18×) solo si hace falta para subir la cara al tercio superior
    const z = Math.min(1.18, Math.max(1, 0.62 / Math.max(0.05, 1 - foco.y))), k = Math.max(w / img.width, h / img.height) * z, iw = img.width * k, ih = img.height * k;
    const ox = Math.min(0, Math.max(w - iw, w * 0.5 - foco.x * iw)), oy = Math.min(0, Math.max(h - ih, h * 0.34 - foco.y * ih));
    ctx.drawImage(img, ox, oy, iw, ih);
  } else { ctx.fillStyle = pal.degradado; ctx.fillRect(0, 0, w, h); }

  // 2) degradado del canal desde la mitad hacia abajo + sombra suave arriba
  const g = ctx.createLinearGradient(0, h * 0.40, 0, h); g.addColorStop(0, hexa(pal.degradado, 0)); g.addColorStop(0.42, hexa(pal.degradado, 0.82)); g.addColorStop(1, hexa(pal.degradado, 1));
  ctx.fillStyle = g; ctx.fillRect(0, h * 0.40, w, h * 0.60);
  const s = ctx.createLinearGradient(0, 0, 0, h * 0.18); s.addColorStop(0, 'rgba(0,0,0,0.38)'); s.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = s; ctx.fillRect(0, 0, w, h * 0.18);

  // 3) titular (mayúsculas, con el resalte en amarillo)
  const margen = Math.round(w * 0.075), anchoTexto = w - margen * 2 - Math.round(w * 0.03);
  const palabras = marcarResalte(String(titular || '').toUpperCase().replace(/\s+/g, ' '), String(resalte || '').toUpperCase());
  const { tam, lineas, espacio } = ajustarTitular(ctx, palabras, { ancho: anchoTexto, maxLineas: 4, tamMax: 150, tamMin: 84, fuente: FUENTE }); // 4 líneas como mucho: el texto queda en el 45 % de abajo y deja libre la cara
  const interlinea = tam * 0.98, altoTexto = lineas.length * interlinea, finTexto = h * 0.83, inicioTexto = finTexto - altoTexto;
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  lineas.forEach((ln, i) => {
    let x = margen; const y = inicioTexto + (i + 1) * interlinea - interlinea * 0.12;
    for (const pw of ln) {
      ctx.font = `${tam}px ${FUENTE}`; ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = tam * 0.12; ctx.shadowOffsetY = tam * 0.05;
      ctx.fillStyle = pw.r ? pal.resalte : '#FFFFFF'; ctx.fillText(pw.p, x, y); x += pw.w + espacio;
    }
  });
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  // 4) etiqueta con el logo del canal (encima del titular)
  const yEt = inicioTexto - u * 0.075, rLogo = u * 0.055, logo = pal.logo ? await cargar(path.join(MARCAS_DIR, pal.logo)) : null;
  const tamEt = Math.round(u * 0.04); ctx.font = `${tamEt}px ${TEXTO}`; const wEt = ctx.measureText(etiqueta).width + tamEt * 1.7, hEt = tamEt * 1.9, xEt = margen + (logo ? rLogo * 1.55 : 0);
  if (etiqueta) { ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 14; ctx.fillStyle = pal.acento; B.rectRedondo(ctx, xEt, yEt - hEt / 2, wEt, hEt, hEt / 2); ctx.fill(); ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillText(etiqueta, xEt + tamEt * 0.85, yEt + tamEt * 0.04); }
  if (logo) {
    const cx = margen + rLogo, cy = yEt; ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 16; ctx.beginPath(); ctx.arc(cx, cy, rLogo + 6, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, rLogo, 0, Math.PI * 2); ctx.clip(); ctx.fillStyle = pal.fondoLogo; ctx.fillRect(cx - rLogo, cy - rLogo, rLogo * 2, rLogo * 2);
    const lado = Math.min(logo.width, logo.height), esc = (rLogo * 2) / lado * 1.0; ctx.drawImage(logo, cx - (logo.width * esc) / 2, cy - (logo.height * esc) / 2, logo.width * esc, logo.height * esc); ctx.restore();
  }

  // 5) círculos de los otros participantes (hasta 3), sobre el degradado, a la izquierda por encima de la etiqueta
  const otros = (circulos || []).slice(0, 3);
  if (otros.length) {
    const R = u * 0.062, y = h * 0.105 + R; // arriba a la izquierda (debajo de la interfaz de TikTok): no tapan la cara ni el titular
    for (const [i, c] of otros.entries()) {
      const cx = margen + R + i * (R * 2.7), im = await cargar(c.foto); if (!im) continue; // separados: así sus nombres no se pisan
      B.retratoCircular(ctx, im, cx, y, R, { u: R * 6 });
      if (c.nombre) { c.nombre = nombreCorto(c.nombre); const tn = Math.round(u * 0.027); ctx.font = `${tn}px ${TEXTO}`; const wn = ctx.measureText(c.nombre).width + tn * 1.3, hn = tn * 1.7; ctx.fillStyle = 'rgba(0,0,0,0.72)'; B.rectRedondo(ctx, cx - wn / 2, y + R + 8, wn, hn, hn / 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(c.nombre, cx, y + R + 8 + hn / 2 + 1); ctx.textAlign = 'left'; }
    }
  }
  return canvas.toBuffer('image/png');
}

// "Nawat Itsaragrisil" → "Nawat"; con nombres de una palabra larga se corta. Los nombres caben bajo cada círculo.
function nombreCorto(n) { const p = String(n).trim().split(/\s+/); const s = p.length > 1 && p[0].length <= 3 ? p.slice(0, 2).join(' ') : p[0]; return s.length > 13 ? s.slice(0, 12) + '…' : s; }

function hexa(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }

module.exports = { dibujarPortada, marcarResalte, ajustarTitular, paletaDe, PALETAS };

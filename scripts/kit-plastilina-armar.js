// Arma el kit de plastilina: toma las piezas elegidas de data-motor/kit/plastilina-crudo/, les quita el fondo de color liso y las deja en
// assets/kit-plastilina/ con los MISMOS nombres que el kit de fotos (cuerpo-bastonera, cuerpo-bastonera-celebrar, corona, baston, ...),
// para que el muñeco las use con solo cambiar de kit ({ kit: 'plastilina' }). La cabeza (sin cara) se recorta bajo el cuello y se guarda
// como cabeza.png con su cabeza.json (caja de la cara y anclas de ojos, cejas y boca).
// Uso: node scripts/kit-plastilina-armar.js
const fs = require('fs'), path = require('path');
const { createCanvas } = require('@napi-rs/canvas');
const { quitarFondo } = require('../lienzo/recorte');
const CRUDO = path.join(__dirname, '..', 'data-motor', 'kit', 'plastilina-crudo'), SALIDA = path.join(__dirname, '..', 'assets', 'kit-plastilina');
const BASE = { tol: 40, suave: 30, margen: 2, matiz: 28, sat: 0.18, limpiarGlobal: false };
// nombre de salida ← [archivo crudo elegido a ojo, opciones del recorte]. El vestido verde de la gala va sobre fondo azul: matiz estrecho para no comerse el vestido.
const ELEGIDAS = {
  'cuerpo-bastonera': ['cuerpo-reposo-2'], 'cuerpo-bastonera-celebrar': ['cuerpo-celebrar-2'], 'cuerpo-bastonera-senalar': ['cuerpo-senalar-2'],
  'cuerpo-gala': ['cuerpo-gala-3', { matiz: 9, sat: 0.4, tol: 28 }], corona: ['corona-1'], baston: ['baston-1'], 'guante-pulgar': ['mano-pulgar-1'], 'guante-abierto': ['mano-abierta-1'],
};
// Cabeza: se corta a CORTE del alto (justo bajo el cuello, sin pecho) y los últimos FUNDIDO del recorte se desvanecen. La caja de la cara y las
// anclas son fracciones de la imagen recortada, medidas sobre una rejilla.
const CABEZA = { crudo: 'cabeza-2', corte: 0.56, fundido: 0.12, cuelloDesde: 0.86, cuelloAncho: 0.115, // cuelloDesde: fracción del alto bajo la cual se quita el cuello; cuelloAncho: media anchura de la columna quitada
  libre: { caja: { cx: 0.5, cy: 0.47, w: 0.38, h: 0.70 }, tope: 0.82, limpia: true, cuelloK: -0.05 },
  anclas: { ojoY: -0.10, ojoDx: 0.24, ojoR: 0.062, bocaY: 0.243, bocaAncho: 0.2, cejaY: -0.13 } };
(async () => {
  fs.mkdirSync(SALIDA, { recursive: true });
  for (const [salida, [crudo, op]] of Object.entries(ELEGIDAS)) {
    const c = await quitarFondo(path.join(CRUDO, crudo + '.png'), { ...BASE, ...(op || {}) });
    fs.writeFileSync(path.join(SALIDA, salida + '.png'), c.toBuffer('image/png')); console.log(salida, c.width + 'x' + c.height);
  }
  const full = await quitarFondo(path.join(CRUDO, CABEZA.crudo + '.png'), BASE), alto = Math.round(full.height * CABEZA.corte), c = createCanvas(full.width, alto), x = c.getContext('2d');
  x.drawImage(full, 0, 0, full.width, alto, 0, 0, full.width, alto);
  const f = Math.round(alto * CABEZA.fundido), id = x.getImageData(0, alto - f, full.width, f), d = id.data;
  for (let j = 0; j < f; j++) for (let i = 0; i < full.width; i++) d[(j * full.width + i) * 4 + 3] *= 1 - (j + 1) / f;
  x.putImageData(id, 0, alto - f);
  // El cuello de debajo de la barbilla se quita: el cuerpo de plastilina trae el suyo, y así no queda una mancha difusa sobre el cuello del traje.
  // Solo la columna central (el pelo de los lados se queda y cae sobre los hombros).
  { const y0 = Math.round(alto * CABEZA.cuelloDesde), p = x.getImageData(0, y0, full.width, alto - y0), q = p.data, mitad = CABEZA.cuelloAncho * full.width, suave = full.width * 0.03;
    for (let j = 0; j < alto - y0; j++) for (let i = 0; i < full.width; i++) { const dx = Math.abs(i - full.width / 2), k = Math.min(1, Math.max(0, (dx - mitad) / suave)), ky = Math.min(1, j / (alto * 0.03)); q[(j * full.width + i) * 4 + 3] *= 1 - (1 - k) * ky; }
    x.putImageData(p, 0, y0); }
  fs.writeFileSync(path.join(SALIDA, 'cabeza.png'), c.toBuffer('image/png'));
  fs.writeFileSync(path.join(SALIDA, 'cabeza.json'), JSON.stringify({ descripcion: 'Cabeza de plastilina SIN CARA (ojos, cejas y boca se modelan encima como piezas de arcilla), con pelo y cuello. Se dibuja detrás del cuerpo: el cuello entra por el cuello del traje.', libre: CABEZA.libre, anclas: CABEZA.anclas }, null, 2));
  console.log('cabeza', c.width + 'x' + c.height);
})().catch(e => { console.error('FALLO', e); process.exit(1); });

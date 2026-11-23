// Muñeco articulado de plastilina: cinemática inversa, catálogo de gestos y un cuadro dibujado de verdad.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCanvas } = require('@napi-rs/canvas');
const estilo = require('../estilos/capitol');
const { ik, titereRig, GESTOS, TRAJES_RIG, POSES } = require('../lienzo/titere-rig');
const { GESTOS: GESTOS_DIRECTOR, validarEscena } = require('../edl/director');

const GRAD = Math.PI / 180;
// cinemática directa del mismo convenio: 0° = hacia abajo, positivo = hacia afuera; el codo suma -c al ángulo del hombro
const mano = (S, s, c, L1, L2) => { const f1 = s * GRAD, f2 = (s - c) * GRAD, ex = S.x + L1 * Math.sin(f1), ey = S.y + L1 * Math.cos(f1); return { x: ex + L2 * Math.sin(f2), y: ey + L2 * Math.cos(f2) }; };

test('ik: la mano llega al punto pedido (con el codo hacia afuera) o lo más cerca posible', () => {
  const S = { x: 118, y: 80 };
  for (const T of [{ x: 92, y: -58 }, { x: -22, y: 100 }, { x: 100, y: 214 }, { x: 175, y: -100 }]) {
    const { s, c } = ik(S, T, 150, 118), H = mano(S, s, c, 150, 118);
    assert.ok(Math.hypot(H.x - T.x, H.y - T.y) < 1.5, `objetivo ${JSON.stringify(T)} → ${JSON.stringify(H)}`);
  }
  const lejos = ik(S, { x: 900, y: 80 }, 150, 118), H = mano(S, lejos.s, lejos.c, 150, 118);
  assert.ok(H.x > S.x + 200, 'un punto inalcanzable estira el brazo hacia él sin romperse');
});

test('el catálogo de gestos del rig y el del director coinciden, y cada gesto devuelve puntos para las manos', () => {
  assert.deepEqual(Object.keys(GESTOS).sort(), [...GESTOS_DIRECTOR].sort());
  for (const [id, g] of Object.entries(GESTOS)) {
    assert.ok(g.dur > 0.5 && g.dur < 3, id + ': duración razonable');
    for (const t of [0, g.dur / 2]) { const o = g.j(t); assert.ok(['I', 'D'].some(L => o[L] && Number.isFinite(o[L].mx) && Number.isFinite(o[L].my)), id + ': da el punto de al menos una mano'); }
  }
});

test('el director valida el gesto: id del catálogo y ancla literal en la frase', () => {
  const beats = [{ frase: 'Ella se sorprendió con la noticia.', rol: 'persona', hechos: [1] }], hechos = [{ texto: 'Se sorprendió.' }];
  const base = g => ({ beat: 1, principal: 'muneco', muneco: { traje: 'bastonera', pose: 'reposo', emocion: 'normal', gesto: g }, extras: [] });
  assert.deepEqual(validarEscena(base({ id: 'mejillas', ancla: 'sorprendió' }), beats, hechos), []);
  assert.ok(validarEscena(base({ id: 'baile', ancla: 'sorprendió' }), beats, hechos).some(x => /gesto "baile" no válido/.test(x)));
  assert.ok(validarEscena(base({ id: 'mejillas', ancla: 'Quito' }), beats, hechos).some(x => /palabra ancla/.test(x)));
});

test('titereRig dibuja un cuadro con cada traje y cada pose sin errores y deja píxeles en el cuadro', async () => {
  for (const traje of Object.keys(TRAJES_RIG)) for (const pose of Object.keys(POSES)) {
    const el = titereRig({ traje, cx: 0.5, base: 0.95, alto: 0.8, t0: 0, t1: 5, poses: [{ t: 0.1, pieza: 'cuerpo-bastonera-' + pose }], emociones: [{ t: 0.1, e: 'feliz' }], gestos: [{ id: 'mejillas', t: 0.5 }], accesorios: [{ id: 'corona', t: 0.2 }] });
    await el.preparar({ w: 540, h: 960 }); const c = createCanvas(540, 960), x = c.getContext('2d');
    for (let f = 0; f <= 30; f++) { x.clearRect(0, 0, 540, 960); await el.dibujar(x, { t: f / 30, tAbs: f / 30, w: 540, h: 960, u: 540, estilo }); }
    const d = x.getImageData(0, 0, 540, 960).data; let opacos = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 200) opacos++;
    assert.ok(opacos > 540 * 960 * 0.1, `${traje}/${pose}: el muñeco ocupa el cuadro (${opacos} px)`);
  }
});

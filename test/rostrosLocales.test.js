const test = require('node:test');
const assert = require('node:assert');
const R = require('../edl/rostrosLocales');

const datos = {
  ancho: 720, alto: 1280,
  cuadros: [
    { t: 1, caras: [] },
    { t: 2, caras: [{ cx: 0.3, cy: 0.3, w: 0.2, h: 0.11, p: 0.9 }, { cx: 0.7, cy: 0.3, w: 0.2, h: 0.11, p: 0.9 }] },
    { t: 3, caras: [{ cx: 0.5, cy: 0.4, w: 0.3, h: 0.17, p: 0.95 }] },
  ],
};

test('mejorRostro prefiere el cuadro con una sola cara grande', () => {
  const m = R.mejorRostro(datos);
  assert.strictEqual(m.t, 3); assert.strictEqual(m.cx, 0.5); assert.strictEqual(m.cy, 0.4); assert.strictEqual(m.caras, 1);
  assert.ok(m.r > 0.1 && m.r < 0.3);
});

test('sin caras confiables no hay rostro', () => {
  assert.strictEqual(R.mejorRostro({ ancho: 720, alto: 1280, cuadros: [{ t: 1, caras: [{ cx: 0.5, cy: 0.5, w: 0.2, h: 0.1, p: 0.3 }] }] }), null);
  assert.strictEqual(R.mejorRostro(null), null);
});

test('aplicar corrige el rostro, guarda el del modelo y deja intactos los clips sin medición', () => {
  const et = { a: { id: 'a', rostro: { t: 9, cx: 0.5, cy: 0.9, r: 0.2 } }, b: { id: 'b', rostro: { t: 1, cx: 0.5, cy: 0.5, r: 0.2 } }, c: { id: 'c' } };
  const r = R.aplicar(et, { a: datos, b: { ancho: 720, alto: 1280, cuadros: [{ t: 1, caras: [] }] } });
  assert.strictEqual(r.etiquetas.a.rostro.cy, 0.4); assert.strictEqual(r.etiquetas.a.rostroIA.cy, 0.9); assert.strictEqual(r.etiquetas.a.rostroLocal, true);
  assert.strictEqual(r.etiquetas.b.rostroLocal, false); assert.strictEqual(r.etiquetas.b.rostro.cy, 0.5);
  assert.strictEqual(r.etiquetas.c.rostro, undefined);
  assert.strictEqual(r.corregidos, 1); assert.strictEqual(r.sinCara, 1);
});

test('fraccionConRostro', () => {
  assert.ok(Math.abs(R.fraccionConRostro(datos) - 2 / 3) < 1e-9);
  assert.strictEqual(R.fraccionConRostro(null), 0);
});

test('encuadreParaTarjeta: no toca si la cara queda arriba; sube la toma si una tarjeta la taparía', () => {
  const alta = [{ t: 1, caras: [{ cx: 0.5, cy: 0.3, w: 0.3, h: 0.17, p: 0.9 }] }];
  assert.strictEqual(R.encuadreParaTarjeta(alta, 720, 1280, 0.5, 2), null);
  const baja = [{ t: 1, caras: [{ cx: 0.5, cy: 0.62, w: 0.3, h: 0.17, p: 0.9 }] }]; // la cara llega hasta 0,705... con cy 0,70 pasa de 0,74
  const enc = R.encuadreParaTarjeta([{ t: 1, caras: [{ cx: 0.5, cy: 0.7, w: 0.3, h: 0.17, p: 0.9 }] }], 720, 1280, 0.5, 2);
  assert.ok(enc && enc.s >= 1.08 && enc.dy < 0);
  // tras el reencuadre la cara queda por encima de la zona tapada
  const abajo = 0.7 + 0.085, f = 0.5 + (abajo - 0.5) * enc.s + enc.dy;
  assert.ok(f <= R.ZONA_TAPADA + 0.01);
  assert.strictEqual(R.encuadreParaTarjeta(baja, 720, 1280, 0.5, 2), null);
  assert.strictEqual(R.encuadreParaTarjeta(null, 720, 1280, 0, 2), null);
});

test('cajaEnVentana: un clip horizontal recorta los lados', () => {
  const c = R.cajaEnVentana({ cx: 0.5, cy: 0.5, w: 0.1, h: 0.1, p: 1 }, 1920, 1080);
  assert.ok(Math.abs(c.cx - 0.5) < 1e-9 && c.w > 0.1);
});

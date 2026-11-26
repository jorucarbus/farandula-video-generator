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

test('pistaDeRostro sigue a una sola persona y descarta saltos grandes', () => {
  const serie = [
    { t: 1.0, caras: [{ cx: 0.3, cy: 0.3, w: 0.2, h: 0.11, p: 0.9 }, { cx: 0.8, cy: 0.3, w: 0.2, h: 0.11, p: 0.9 }] },
    { t: 1.5, caras: [{ cx: 0.32, cy: 0.31, w: 0.2, h: 0.11, p: 0.9 }, { cx: 0.8, cy: 0.3, w: 0.2, h: 0.11, p: 0.9 }] },
    { t: 2.0, caras: [{ cx: 0.9, cy: 0.9, w: 0.2, h: 0.11, p: 0.9 }] }, // otra persona, lejos: se ignora
    { t: 2.5, caras: [{ cx: 0.35, cy: 0.33, w: 0.2, h: 0.11, p: 0.9 }] },
  ];
  const p = R.pistaDeRostro(serie, 720, 1280, 1.0, 1.6, { cx: 0.3, cy: 0.3 });
  assert.deepStrictEqual(p.map(x => x.t), [1.0, 1.5, 2.5]);
  assert.ok(p.every(x => x.cx < 0.5));
  assert.strictEqual(R.pistaDeRostro(serie, 720, 1280, 10, 1, null), null);
  assert.strictEqual(R.pistaDeRostro(null, 720, 1280, 0, 1), null);
});

test('marcas: la flecha tiene tope de largo y las formas se dibujan sin romper', () => {
  const B = require('../lienzo/base');
  const [cuerpo, a1, a2] = B.puntosDeFlecha(300, 300, 400, 1, 0, 665, 3); // cara enorme
  const largo = Math.hypot(cuerpo[0].x - cuerpo[cuerpo.length - 1].x, cuerpo[0].y - cuerpo[cuerpo.length - 1].y); assert.ok(largo <= 665 * 0.28 * 1.5, 'el cuerpo no se estira con una cara enorme (' + Math.round(largo) + ' px)');
  assert.strictEqual(a1.length, 2); assert.strictEqual(a2.length, 2);
  const c = B.puntosDeCuadro(100, 100, 40, 30, 4);
  assert.ok(c.length > 40 && Math.abs(c[0].x - 60) < 12 && Math.abs(c[0].y - 70) < 12);
});

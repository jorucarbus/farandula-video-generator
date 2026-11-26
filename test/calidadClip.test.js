const test = require('node:test');
const assert = require('node:assert');
const C = require('../edl/calidadClip');

const bueno = { ancho: 1080, alto: 1920, fps: 30, bitrate: 6e6, duracion: 8 };

test('un clip 1080x1920 nítido y bien expuesto es apto con puntaje alto', () => {
  const r = C.evaluar(bueno, { blur: 3, brillo: 110, crop: { w: 1080, h: 1920 } });
  assert.strictEqual(r.apto, true);
  assert.ok(r.puntaje >= 90);
});

test('720x1280 se amplía 1,5×: apto con aviso; 576x1024 (1,9×) se descarta', () => {
  const a = C.evaluar({ ...bueno, ancho: 720, alto: 1280 }, { blur: 3, brillo: 110 });
  assert.strictEqual(a.apto, true); assert.ok(a.avisos.some(x => /amplía/.test(x)));
  const b = C.evaluar({ ...bueno, ancho: 576, alto: 1024 }, { blur: 3, brillo: 110 });
  assert.strictEqual(b.apto, false); assert.ok(b.motivos.some(x => /resolución baja/.test(x)));
});

test('barras negras, oscuro, quemado y cortísimo se descartan', () => {
  assert.ok(C.evaluar(bueno, { blur: 3, brillo: 110, crop: { w: 1080, h: 1200 } }).motivos.some(x => /barras negras/.test(x)));
  assert.ok(C.evaluar(bueno, { blur: 3, brillo: 20 }).motivos.some(x => /oscuro/.test(x)));
  assert.ok(C.evaluar(bueno, { blur: 3, brillo: 240 }).motivos.some(x => /quemado/.test(x)));
  assert.ok(C.evaluar({ ...bueno, duracion: 0.5 }, { blur: 3, brillo: 110 }).motivos.some(x => /solo 0,?\d|dura solo/.test(x)));
});

test('muy borroso descarta; algo suave solo avisa', () => {
  assert.strictEqual(C.evaluar(bueno, { blur: 9.5, brillo: 110 }).apto, false);
  const s = C.evaluar(bueno, { blur: 8, brillo: 110 });
  assert.strictEqual(s.apto, true); assert.ok(s.avisos.some(x => /suave/.test(x)));
});

test('sin medidas de imagen se juzga solo por el archivo', () => {
  assert.strictEqual(C.evaluar(bueno, null).apto, true);
});

test('filtrarAptos quita los no aptos, pero no se queda sin tomas', () => {
  const et = Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(i => [i, { id: i }]));
  const r = C.filtrarAptos(et, { a: { apto: false }, b: { apto: true } });
  assert.deepStrictEqual(r.descartados, ['a']); assert.strictEqual(Object.keys(r.etiquetas).length, 7);
  const pocos = C.filtrarAptos({ a: {}, b: {}, c: {} }, { a: { apto: false } });
  assert.strictEqual(Object.keys(pocos.etiquetas).length, 3); assert.deepStrictEqual(pocos.descartados, []);
});

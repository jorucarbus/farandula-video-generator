const test = require('node:test');
const assert = require('node:assert');
const C = require('../edl/calidadClip');

const bueno = { ancho: 1080, alto: 1920, fps: 30, bitrate: 6e6, duracion: 8 };

test('un clip 1080x1920 nítido y bien expuesto es apto con puntaje alto', () => {
  const r = C.evaluar(bueno, { blur: 3, brillo: 110, crop: { w: 1080, h: 1920 } });
  assert.strictEqual(r.apto, true);
  assert.ok(r.puntaje >= 90);
});

test('la resolución se mide contra la TARJETA (665x1183), no contra la pantalla: 576x1024 y 540x960 sirven; 400x711 no', () => {
  const m = { blur: 3, brillo: 110 };
  const a = C.evaluar({ ...bueno, ancho: 720, alto: 1280 }, m); assert.strictEqual(a.apto, true); assert.strictEqual(a.ampliacion, 1); assert.deepStrictEqual(a.avisos.filter(x => /amplía/.test(x)), []);
  const b = C.evaluar({ ...bueno, ancho: 576, alto: 1024 }, m); assert.strictEqual(b.apto, true); assert.ok(b.ampliacion < 1.2);
  const c = C.evaluar({ ...bueno, ancho: 540, alto: 960 }, m); assert.strictEqual(c.apto, true); assert.ok(c.avisos.some(x => /amplía/.test(x)) === (c.ampliacion > 1.25));
  const d = C.evaluar({ ...bueno, ancho: 400, alto: 711 }, m); assert.strictEqual(d.apto, false); assert.ok(d.motivos.some(x => /resolución baja/.test(x)));
});

test('reevaluarGuardado: rehace solo la resolución de una medición vieja y conserva los demás motivos', () => {
  const vieja = { ancho: 576, alto: 1024, puntaje: 20, apto: false, motivos: ['resolución baja (576x1024: se amplía 1.9×)', 'borroso (nitidez 0.05)'], avisos: ['se amplía 1.88×', 'compresión pesada (0.020 bits/píxel)'] };
  const r = C.reevaluarGuardado(vieja);
  assert.ok(!r.motivos.some(x => /resolución/.test(x)), 'ya no es de resolución baja'); assert.ok(r.motivos.some(x => /borroso/.test(x))); assert.strictEqual(r.apto, false);
  const solo = C.reevaluarGuardado({ ancho: 576, alto: 1024, puntaje: 55, apto: false, motivos: ['resolución baja (576x1024: se amplía 1.9×)'], avisos: [] });
  assert.strictEqual(solo.apto, true); assert.ok(solo.puntaje >= 90);
  assert.strictEqual(C.reevaluarGuardado(null), null);
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

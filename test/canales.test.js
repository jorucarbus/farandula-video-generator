const test = require('node:test');
const assert = require('node:assert');
const C = require('../canales');
const L = require('../largos');

test('ficha por nombre con tildes, mayúsculas y espacios', () => {
  const f = C.obtener('Embajadores del Chisme');
  assert.strictEqual(f.clave, 'embajadoresdelchisme');
  assert.strictEqual(f.hermano, 'lanaple');
  assert.strictEqual(f.monetiza, true);
  assert.strictEqual(f.tonoMusica, 'auto');
});

test('hermano de ida y vuelta', () => {
  assert.strictEqual(C.hermanoDe('Chismex Picante').clave, 'supelupe');
  assert.strictEqual(C.hermanoDe('Supe Lupe').clave, 'chismexpicante');
  assert.strictEqual(C.hermanoDe('Canal Inventado'), null);
});

test('sin ficha: null; defaults aplicados con ficha mínima', () => {
  assert.strictEqual(C.obtener('nada'), null);
  const f = C.obtener('x', { x: { nombre: 'X' } });
  assert.deepStrictEqual([f.monetiza, f.vozId, f.hashtags, f.sesgo], [true, null, [], '']);
});

test('largos usa la ficha: los que no monetizan salen cortos; sin ficha, la lista de siempre', () => {
  assert.strictEqual(L.objetivoPara('La Naple', true).id, 'corto');
  assert.strictEqual(L.objetivoPara('Chismex Picante', true).id, 'normal');
  assert.strictEqual(L.objetivoPara('La Naple', false).id, 'normal'); // interruptor apagado
});

test('hashtags fijos se suman sin repetir', () => {
  assert.deepStrictEqual(C.sumarHashtags(['#A', '#b'], { hashtags: ['#a', '#C'] }), ['#A', '#b', '#C']);
  assert.deepStrictEqual(C.sumarHashtags(['#A'], null), ['#A']);
});

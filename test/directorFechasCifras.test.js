const test = require('node:test');
const assert = require('node:assert');
const D = require('../edl/director');

const dirigir = frase => D.directorPorReglas([{ frase, rol: 'dato', hechos: [] }], [], null, { sinMuneco: true })[0];

test('varias fechas en una frase: lista de fechas, no una cifra "29 de"', () => {
  const e = dirigir('La concentración arranca el 26 de noviembre, la imposición de bandas el 29 de noviembre y la gala final el 12 de diciembre en Bangkok.');
  assert.strictEqual(e.principal, 'lista');
  assert.deepStrictEqual(e.lista.items.map(i => i.texto), ['26 de noviembre', '29 de noviembre', '12 de diciembre']);
  assert.deepStrictEqual(D.validarDireccion([e], [{ frase: 'La concentración arranca el 26 de noviembre, la imposición de bandas el 29 de noviembre y la gala final el 12 de diciembre en Bangkok.', rol: 'fecha', hechos: [] }], [], null), []);
});

test('la cifra por reglas no toma un conector como unidad ("10 y")', () => {
  const e = dirigir('Fue Top 10 y Mejor Traje Nacional en 2019.');
  assert.strictEqual(e.principal, 'cifra');
  assert.strictEqual(e.cifra.valor, 10);
  assert.strictEqual(e.cifra.sufijo, undefined);
});

test('la cifra conserva su unidad cuando es una palabra real', () => {
  const e = dirigir('Hubo 10 finalistas en la gala.');
  assert.strictEqual(e.cifra.sufijo, 'finalistas');
});

test('el título de lista del modelo se limpia en vez de invalidar la dirección', () => {
  const x = D.normalizarEscena({ principal: 'lista', lista: { titulo: 'Cronograma del certamen Miss Grand!!', items: ['a b', 'c d'] } });
  assert.ok(/^[\p{L} ]{3,20}$/u.test(x.lista.titulo));
  assert.strictEqual(D.normalizarEscena({ principal: 'lista', lista: { titulo: '', items: ['a b'] } }).lista.titulo, 'Lista');
});

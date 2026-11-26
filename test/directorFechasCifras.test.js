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

test('viaje: dos lugares cualesquiera con verbo de viaje -> mapa con ruta de avion', () => {
  const casos = [
    ['Mara salió de Guayaquil rumbo a Tailandia para el certamen.', 'Guayaquil', 'Tailandia'],
    ['Viajó de Madrid a Miami para la gala.', 'Madrid', 'Miami'],
    ['Aterrizó en Dubái desde Nueva York ayer.', 'Nueva York', 'Dubái'],
    ['Voló rumbo a España desde Ecuador el lunes.', 'Ecuador', 'España'],
  ];
  for (const [frase, desde, hasta] of casos) {
    const e = dirigir(frase);
    assert.strictEqual(e.principal, 'mapa', frase);
    assert.deepStrictEqual(e.mapa.ruta, { desde, hasta }, frase);
  }
});

test('un solo lugar o sin verbo de viaje sigue siendo un mapa suelto; ciudad y su pais no son una ruta', () => {
  assert.strictEqual(dirigir('La fiesta fue en Guayaquil el sábado pasado con mucha gente conocida.').mapa.lugar, 'Guayaquil');
  assert.strictEqual(D.rutaDeFrase('Ciudad de Panamá recibió a la reina; llegó a Panamá el martes.'), null);
  assert.strictEqual(D.rutaDeFrase('Madrid y Miami son ciudades grandes.') !== null, true); // sin verbo la regla del director no la usa (ver arriba), pero la extracción sí ordena
});

test('resolverPunto: ciudad -> coordenadas, pais -> nombre del atlas, desconocido -> null', () => {
  assert.ok(D.resolverPunto('Madrid').lat > 40);
  assert.strictEqual(D.resolverPunto('Tailandia').pais, 'Thailand');
  assert.strictEqual(D.resolverPunto('Atlantis'), null);
});

test('la dirección rechaza una cifra que es un año o con números en el sufijo (salían "2.0262026" y "12 Top 12")', () => {
  const beats = [{ frase: 'Quedó fuera del Top 12 de Miss Universo 2026 en noviembre.', rol: 'dato', hechos: [] }];
  const base = { beat: 1, principal: 'cifra', extras: [] };
  const err = cifra => D.validarDireccion([{ ...base, cifra }], beats, [], null);
  assert.ok(err({ valor: 2026, ancla: 'universo' }).some(x => /año/.test(x)));
  assert.ok(err({ valor: 12, sufijo: 'Top 12', ancla: 'top' }).some(x => /no puede llevar números/.test(x)));
  assert.deepStrictEqual(err({ valor: 12, sufijo: 'Top', ancla: 'top' }), []);
});

const test = require('node:test');
const assert = require('node:assert');
const P = require('../edl/pautaGuion');

const HECHOS = [
  { texto: 'Mara Topic viajó a Tailandia para el Miss Grand All Stars' },
  { texto: 'La concentración empieza el 26 de noviembre' },
  { texto: 'La gala final es el 12 de diciembre en Bangkok' },
  { texto: 'Ganó el premio al Mejor Traje Nacional en 2019' },
];
const BASE = HECHOS.map(h => h.texto).join('. ');

test('repetidos: detecta una fecha dicha dos veces', () => {
  assert.deepStrictEqual(P.repetidos('La concentración arranca el 26 de noviembre. Luego sigue la gala. Todo empieza este 26 de noviembre otra vez.'), ['26 de noviembre']);
  assert.deepStrictEqual(P.repetidos('Arranca el 26 de noviembre y termina el 12 de diciembre.'), []);
});

test('repetidos: detecta frases casi iguales', () => {
  const r = P.repetidos('Mara Topic viajó a Tailandia para competir en el Miss Grand All Stars. Después, Mara Topic viajó a Tailandia para competir en el Miss Grand All Stars otra vez.');
  assert.ok(r.some(x => x.startsWith('frases casi iguales')));
});

test('relleno: marca frases afirmativas sin ningún dato, pero no preguntas ni citas', () => {
  const guion = 'Mara Topic viajó a Tailandia para el Miss Grand All Stars. El itinerario internacional no da tregua desde la primera reunión oficial hasta la noche decisiva. ¿Tendrá el temple necesario para adueñarse del codiciado título mundial? «Nawat, aquí va tu reina».';
  const r = P.relleno(guion, HECHOS);
  assert.strictEqual(r.length, 1);
  assert.match(r[0], /itinerario/);
});

test('problemas: el largo y el relleno vuelven ok = false', () => {
  const guion = 'Mara Topic viajó a Tailandia para el Miss Grand All Stars. La concentración empieza el 26 de noviembre. La gala final es el 12 de diciembre en Bangkok. Ganó el Mejor Traje Nacional en 2019.';
  assert.strictEqual(P.problemas(guion, HECHOS, BASE, { maxPalabras: 100 }).ok, true);
  const p = P.problemas(guion, HECHOS, BASE, { maxPalabras: 10 });
  assert.strictEqual(p.ok, false);
  assert.ok(p.lista.some(l => l.startsWith('demasiado largo')));
});

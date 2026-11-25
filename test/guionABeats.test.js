const test = require('node:test');
const assert = require('node:assert');
const { guionABeats, partirFrases, rolPorReglas } = require('../edl/guionABeats');

const SCRIPT = 'Mara Topic viajó a Tailandia. El 29 de noviembre es la imposición de bandas. Por 18 votos pagas 0,99 dólares y por 6.000 votos, 199,99 dólares. Sí. Ahora busca traer la corona.';
const CRONICA = 'Mara Topic viajó a Tailandia para el Miss Grand All Stars. La imposición de bandas es el 29 de noviembre. Los votos cuestan 0,99 dólares por 18 votos.';

test('partirFrases no parte decimales ni miles y pega las frases de una palabra a la anterior', () => {
  const f = partirFrases(SCRIPT);
  assert.strictEqual(f.length, 4);
  assert.ok(f[2].includes('0,99') && f[2].includes('6.000') && f[2].includes('199,99'));
  assert.ok(f[2].endsWith('Sí.'));
});

test('rolPorReglas: fecha, cifra y dato', () => {
  assert.strictEqual(rolPorReglas('El 29 de noviembre es la gala.'), 'fecha');
  assert.strictEqual(rolPorReglas('Por 18 votos pagas 0,99 dólares.'), 'cifra');
  assert.strictEqual(rolPorReglas('Ella sonrió mucho.'), 'dato');
});

test('con modelo: usa roles y hechos válidos, descarta índices inexistentes', async () => {
  const llamar = async () => ({
    hechos: [{ texto: 'Mara viajó a Tailandia' }, { texto: 'Gala el 12 de diciembre', confirmado: false }, { texto: 'Votos a 0,99' }, { texto: 'Bandas el 29 de noviembre' }],
    frases: [{ n: 1, rol: 'persona', hechos: [1] }, { n: 2, rol: 'fecha', hechos: [4, 99] }, { n: 3, rol: 'inventado', hechos: [3] }, { n: 4, rol: 'rumor', hechos: [1] }],
  });
  const r = await guionABeats(SCRIPT, CRONICA, { llamar });
  assert.strictEqual(r.origen, 'modelo');
  assert.deepStrictEqual(r.beats[1].hechos, [4]);
  assert.strictEqual(r.beats[2].rol, 'cifra'); // rol inventado → reglas
  assert.notStrictEqual(r.beats[3].rol, 'rumor'); // rumor sin hecho no confirmado → se corrige
  assert.ok(r.avisos.length >= 1);
  assert.strictEqual(r.hechos[1].confirmado, false);
});

test('si el modelo falla, cae a reglas y el video sale igual', async () => {
  const r = await guionABeats(SCRIPT, CRONICA, { llamar: async () => { throw new Error('sin red'); } });
  assert.strictEqual(r.origen, 'reglas');
  assert.strictEqual(r.beats.length, 4);
  assert.ok(r.hechos.length >= 3);
  assert.ok(r.beats.every(b => Array.isArray(b.hechos)));
});

test('guion vacío lanza', async () => {
  await assert.rejects(() => guionABeats('', CRONICA, { llamar: async () => ({}) }), /vacío/);
});

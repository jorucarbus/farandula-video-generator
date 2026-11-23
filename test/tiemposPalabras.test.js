const test = require('node:test');
const assert = require('node:assert/strict');
const { alinearPalabras, ventanasDeFrases, normalizar } = require('../edl/tiemposPalabras');

const guion = 'Leidy Álvarez inició como bastonera. Ahora ganó la corona de Reina de Manabí.';
const ws = (...p) => p.map(([w, s, e]) => ({ w, s, e }));

test('normalizar quita tildes, signos y mayúsculas', () => {
  assert.equal(normalizar('¡Álvarez,'), 'alvarez');
  assert.equal(normalizar('Manabí.'), 'manabi');
});

test('alinea lo oído con el guion aunque Whisper cambie o omita palabras', () => {
  const oido = ws(['Leidy', 0, 0.4], ['Alvares', 0.4, 0.9], ['inició', 0.9, 1.3], ['como', 1.3, 1.5], ['bastonera', 1.5, 2.1],
    ['ahora', 2.4, 2.8], ['ganó', 2.8, 3.1], ['la', 3.1, 3.2], ['corona', 3.2, 3.7], ['de', 3.7, 3.8], ['Reina', 3.8, 4.2], ['de', 4.2, 4.3], ['Manabí', 4.3, 4.9]);
  const r = alinearPalabras(guion, oido);
  assert.equal(r.length, 13);
  assert.deepEqual(r.map(x => x.palabra).slice(0, 2), ['Leidy', 'Álvarez']);
  assert.equal(r[1].exacta, true, '"Alvares" casi igual a "Álvarez" cuenta como pareja');
  assert.equal(r[12].t1, 4.9);
  assert.ok(r.every((x, i) => x.t0 !== null && x.t1 >= x.t0 && (i === 0 || x.t0 >= r[i - 1].t0 - 1e-9)), 'tiempos completos y en orden');
});

test('una palabra que Whisper no oyó recibe tiempo interpolado entre sus vecinas', () => {
  const oido = ws(['Leidy', 0, 0.4], ['inició', 0.9, 1.3], ['como', 1.3, 1.5], ['bastonera', 1.5, 2.1], ['ahora', 2.4, 2.8], ['ganó', 2.8, 3.1], ['la', 3.1, 3.2], ['corona', 3.2, 3.7], ['de', 3.7, 3.8], ['Reina', 3.8, 4.2], ['de', 4.2, 4.3], ['Manabí', 4.3, 4.9]);
  const r = alinearPalabras(guion, oido);
  assert.equal(r[1].exacta, false);
  assert.ok(r[1].t0 >= 0.4 && r[1].t1 <= 0.9, `interpolada entre 0.4 y 0.9 (${r[1].t0}-${r[1].t1})`);
});

test('ventanasDeFrases cubre cada frase con su primera y última palabra', () => {
  const oido = ws(['Leidy', 0, 0.4], ['Álvarez', 0.4, 0.9], ['inició', 0.9, 1.3], ['como', 1.3, 1.5], ['bastonera', 1.5, 2.1],
    ['Ahora', 2.4, 2.8], ['ganó', 2.8, 3.1], ['la', 3.1, 3.2], ['corona', 3.2, 3.7], ['de', 3.7, 3.8], ['Reina', 3.8, 4.2], ['de', 4.2, 4.3], ['Manabí', 4.3, 4.9]);
  const palabras = alinearPalabras(guion, oido);
  const v = ventanasDeFrases([{ frase: 'Leidy Álvarez inició como bastonera.' }, { frase: 'Ahora ganó la corona de Reina de Manabí.' }], palabras);
  assert.deepEqual([v[0].t0, v[0].t1, v[1].t0, v[1].t1], [0, 2.1, 2.4, 4.9]);
  assert.deepEqual([v[1].desde, v[1].hasta], [5, 13]);
});

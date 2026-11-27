const test = require('node:test'), assert = require('node:assert');
const R = require('../edl/repartoTomas'), C = require('../edl/clipsDeOtros');

test('dividir: 7 s con tope 3 son 3 tomas de 2,33 s (no 3+3+1)', () => {
  const d = R.dividir(7, 3); assert.equal(d.n, 3); assert.ok(Math.abs(d.dur - 7 / 3) < 1e-9);
  assert.deepEqual(R.dividir(2.5, 3), { n: 1, dur: 2.5 }); assert.equal(R.dividir(3, 3).n, 1); assert.equal(R.dividir(9.1, 3).n, 4);
});
test('ordenarPorCalidad: filtra bajo el mínimo, ordena por puntaje y baja el mínimo si faltan tomas', () => {
  const cal = { a: { puntaje: 95 }, b: { puntaje: 60 }, c: { puntaje: 80 }, d: { puntaje: 90, apto: false } };
  assert.deepEqual(R.ordenarPorCalidad(['a', 'b', 'c', 'd'], cal, { min: 75 }), ['a', 'c']);
  assert.deepEqual(R.ordenarPorCalidad(['a', 'b', 'c', 'd'], cal, { min: 75, necesarias: 3 }), ['a', 'b', 'c']); // baja el mínimo; el no apto nunca entra
});
test('planificar: devuelve pool de calidad y carpeta por frase según el tiempo real', async () => {
  const mk = (id, p) => ({ id, rostro: { r: 0.2, t: 1 }, personas: 1, duracion: 9, tipo: 'selfie' });
  const et = Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'f'].map(i => [i, mk(i)])), calidad = { a: { puntaje: 95 }, b: { puntaje: 90 }, c: { puntaje: 85 }, d: { puntaje: 80 }, e: { puntaje: 40 }, f: { puntaje: 78 } };
  const r = await C.planificar({ beats: [{ frase: 'x' }, { frase: 'Marcela cantó' }], personas: [{ nombre: 'Marcela Ruiz' }], protagonista: [], carpetasLocales: ['Marcela_Ruiz'], cargar: () => ({ etiquetas: et, calidad }), tiempos: [{ t0: 0, t1: 3 }, { t0: 3, t1: 10 }] });
  assert.equal(r.carpetaPorFrase.get(1), 'Marcela_Ruiz');
  const pool = r.pools.get('Marcela_Ruiz'); assert.ok(pool.length >= 4 && !pool.includes('e')); // 7 s → 3 tomas (+1 de margen); la de 40 puntos no entra
});

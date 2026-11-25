const test = require('node:test');
const assert = require('node:assert');
const P = require('../edl/pautaGuion');

const HECHOS = [
  { texto: 'Mara Topic viajó a Tailandia para el Miss Grand All Stars' },
  { texto: 'La imposición de bandas es el 29 de noviembre' },
  { texto: 'Ganó el premio al Mejor Traje Nacional en 2019' },
  { texto: 'Israel Vélez Arce viajó desde Manabí durante la noche' },
];
const BASE = HECHOS.map(h => h.texto).join('. ') + '. La gala final es el 12 de diciembre en Bangkok. Dijo: Nawat, aquí va tu reina.';

test('aDigitos convierte fechas en letras', () => {
  assert.match(P.aDigitos('el veintiséis de noviembre y el doce de diciembre'), /26 de noviembre y el 12 de diciembre/);
});

test('cobertura: detecta los datos que faltan y acepta fechas en letras', () => {
  const guion = 'Mara Topic viajó a Tailandia. La imposición de bandas será el veintinueve de noviembre. Ganó el Mejor Traje Nacional en 2019.';
  const c = P.cobertura(guion, HECHOS);
  assert.strictEqual(c.faltan.length, 1);
  assert.match(c.faltan[0].texto, /Manabí/);
  assert.ok(c.pct >= 0.7 && c.pct < 1);
});

test('inventados: cifras y nombres que no están en el material', () => {
  const guion = 'Mara Topic viajó a Tailandia. El jurado de 15 personas la espera. Según Rodrigo Salazar será difícil.';
  const r = P.inventados(guion, BASE);
  assert.ok(r.numeros.includes('15'));
  assert.ok(r.nombres.includes('Salazar') || r.nombres.includes('Rodrigo'));
  const limpio = P.inventados('Mara Topic viajó a Tailandia. Nawat escuchó su frase el 12 de diciembre en Bangkok.', BASE);
  assert.deepStrictEqual(limpio.numeros, []);
  assert.deepStrictEqual(limpio.nombres, []);
});

test('problemas: ok solo si cubre casi todo y no inventa', () => {
  const bueno = 'Mara Topic viajó a Tailandia para el Miss Grand All Stars. La imposición de bandas es el 29 de noviembre. Ganó el premio al Mejor Traje Nacional en 2019. Israel Vélez Arce viajó desde Manabí durante la noche.';
  assert.strictEqual(P.problemas(bueno, HECHOS, BASE).ok, true);
  const malo = 'Mara Topic viajó a Tailandia.';
  const p = P.problemas(malo, HECHOS, BASE);
  assert.strictEqual(p.ok, false);
  assert.match(p.lista[0], /faltan datos/);
  assert.match(P.notaDeCorreccion(p), /CORRECCIÓN/);
});

test('extraerHechos usa el modelo y exige al menos 3 datos', async () => {
  const ok = await P.extraerHechos('texto', { llamar: async () => ({ hechos: [{ texto: 'a b' }, { texto: 'c d', confirmado: false }, { texto: 'e f' }, { texto: '' }] }) });
  assert.strictEqual(ok.length, 3);
  assert.strictEqual(ok[1].confirmado, false);
  await assert.rejects(() => P.extraerHechos('texto', { llamar: async () => ({ hechos: [{ texto: 'solo uno' }] }) }), /menos de 3/);
});

test('bloqueMaterial incluye datos numerados, no confirmados y la pauta', () => {
  const b = P.bloqueMaterial('CRÓNICA', [{ texto: 'x' }, { texto: 'y', confirmado: false }], 'NOTA');
  assert.ok(b.includes('1. x') && b.includes('2. y [NO CONFIRMADO') && b.includes('PAUTA DE TONO') && b.endsWith('NOTA'));
});

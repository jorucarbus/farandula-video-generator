const test = require('node:test');
const assert = require('node:assert/strict');
const { seleccionarHechos } = require('../edl/seleccionarHechos');
const { validarGuion, PROMPT } = require('../edl/guionNarrativo');

const hechos = [
  { texto: 'Leidy Alvarez ganó la corona de Reina de Manabí en Portoviejo.' },
  { texto: 'Compitió contra 12 aspirantes.' },
  { texto: 'Empezó como bastonera en desfiles cívicos de Chone.', origen: 'web', fuente: 'expreso.ec' },
  { texto: 'Nació el 30 de noviembre de 2006 en Chone.', origen: 'web', fuente: 'extra.ec' },
  { texto: 'Agradeció el respaldo de su cantón.' },
];

test('elige hechos, conserva el orden original y reindexa el gancho', async () => {
  const llamar = async () => ({ gancho: { de: 3, a: 1, frase: 'de bastonera a reina' }, elegidos: [1, 3, 2] });
  const r = await seleccionarHechos(hechos, { llamar, piso: 1 });
  assert.equal(r.origen, 'llm');
  assert.deepEqual(r.hechos.map(h => h.texto.slice(0, 8)), ['Leidy Al', 'Compitió', 'Empezó c']);
  assert.deepEqual([r.gancho.de, r.gancho.a], [2, 0]); // bastonera=posición 2, reina=posición 0
  assert.equal(r.descartados.length, 2);
});

test('rechaza índices malos, falta del hecho central, presupuesto y gancho con hechos no elegidos; reintenta con los errores', async () => {
  const prompts = [];
  const llamar = async (p) => { prompts.push(p); return prompts.length === 1 ? { gancho: { de: 3, a: 4, frase: 'x' }, elegidos: [3, 9] } : { gancho: null, elegidos: [1] }; };
  const r = await seleccionarHechos(hechos, { llamar, piso: 1 });
  assert.equal(r.origen, 'llm'); assert.equal(prompts.length, 2);
  assert.match(prompts[1], /inexistentes: 9/); assert.match(prompts[1], /falta el hecho central/);
  assert.equal(r.gancho, null);
});

test('sin arreglo: respaldo determinista prioriza hechos dados por el usuario y respeta el presupuesto', async () => {
  const r = await seleccionarHechos(hechos, { llamar: async () => ({ elegidos: [] }), maxReintentos: 0, presupuesto: 20 });
  assert.equal(r.origen, 'respaldo');
  assert.ok(r.hechos.every(h => h.origen !== 'web'));
  assert.ok(r.avisos.some(a => /determinista/.test(a)));
  const caido = await seleccionarHechos(hechos, { llamar: async () => { throw new Error('sin red'); } });
  assert.equal(caido.origen, 'respaldo');
});

test('el guion pide el gancho elegido y rechaza "pocos mencionan"', () => {
  assert.match(PROMPT([], 40, 100, { de: 2, a: 0, frase: 'de bastonera a reina' }), /hecho 3 con el hecho 1 \(de bastonera a reina\)/);
  const beats = [{ frase: 'Hay antecedentes que pocos mencionan sobre la reina.', rol: 'dato', hechos: [1] }];
  assert.ok(validarGuion(beats, hechos, { palabrasMin: 1, palabrasMax: 50 }).errores.some(e => /qué saben o cuentan/.test(e)));
});

test('piso: rechaza una selección demasiado podada', async () => {
  const prompts = [];
  const llamar = async (p) => { prompts.push(p); return { gancho: null, elegidos: prompts.length === 1 ? [1] : [1, 2, 3, 4, 5] }; };
  const r = await seleccionarHechos(hechos, { llamar, piso: 30 });
  assert.match(prompts[1], /solo \d+ palabras \(mín\./);
  assert.equal(r.hechos.length, 5);
});

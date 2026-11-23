const test = require('node:test');
const assert = require('node:assert/strict');
const { investigarHechos, MAX_NUEVOS } = require('../edl/investigarHechos');

const base = [{ texto: 'Leidy Alvarez ganó el título de Reina de Manabí 2026-2027 en Portoviejo.' }];
const cita = [{ titulo: 'Diario X', url: 'https://x.test/a' }];

test('agrega hechos nuevos con fuente; lo no corroborado queda confirmado:false', async () => {
  const buscar = async () => ({ citas: cita, hechos: [
    { texto: 'Alvarez empezó en un video como bastonera.', fuente: 'Diario X', corroborado: false },
    { texto: 'Fue Chonera Bonita 2023.', fuente: 'Diario Y', corroborado: true },
  ] });
  const r = await investigarHechos(base, { buscar });
  assert.equal(r.hechos.length, 3);
  assert.equal(r.nuevos[0].confirmado, false);
  assert.equal(r.nuevos[1].confirmado, true);
  assert.equal(r.nuevos[0].origen, 'web');
});

test('sin citas de búsqueda no entra nada', async () => {
  const r = await investigarHechos(base, { buscar: async () => ({ citas: [], hechos: [{ texto: 'Dato.', fuente: 'X' }] }) });
  assert.equal(r.nuevos.length, 0);
  assert.match(r.avisos[0], /ninguna fuente/);
});

test('descarta hechos sin fuente, repetidos y limita la cantidad', async () => {
  const muchos = Array.from({ length: 10 }, (_, i) => ({ texto: `Dato distinto número ${i} sobre la trayectoria ${'abcdefghij'[i]}${i * 7}.`, fuente: 'Diario X' }));
  const buscar = async () => ({ citas: cita, hechos: [
    { texto: 'Sin fuente.', fuente: '' },
    { texto: 'Leidy Alvarez ganó el título de Reina de Manabí 2026-2027 en Portoviejo.', fuente: 'Diario X' },
    ...muchos,
  ] });
  const r = await investigarHechos(base, { buscar });
  assert.equal(r.nuevos.length, MAX_NUEVOS);
  assert.ok(r.avisos.some(a => /sin fuente|no traer fuente/.test(a)));
  assert.ok(r.avisos.some(a => /repetido/.test(a)));
});

test('hechos sensibles (privacidad/difamación) se apartan y no entran al guion', async () => {
  const buscar = async () => ({ citas: cita, hechos: [
    { texto: 'Emitió un comunicado para desmentir supuestos videos íntimos atribuidos a su persona.', fuente: 'Diario X', corroborado: true },
    { texto: 'Fue detenido en 2024 por una denuncia.', fuente: 'Diario X', corroborado: true },
    { texto: 'Empezó como bastonera en su colegio.', fuente: 'Diario X', corroborado: true },
  ] });
  const r = await investigarHechos(base, { buscar });
  assert.equal(r.nuevos.length, 1);
  assert.match(r.nuevos[0].texto, /bastonera/);
  assert.equal(r.apartados.length, 2);
  assert.ok(r.avisos.some(a => /sensible/.test(a)));
});

test('si la búsqueda falla se sigue con los hechos base', async () => {
  const r = await investigarHechos(base, { buscar: async () => { throw new Error('sin red'); } });
  assert.deepEqual(r.hechos, base);
  assert.match(r.avisos[0], /sin red/);
});

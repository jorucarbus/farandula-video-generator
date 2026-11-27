const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { revisarPlan, senales } = require('../edl/revisorPlan');
const D = require('../edl/director');
const EX = require('../edl/exitos');

const beats = [{ frase: 'Mara llegó a Chone el sábado' }, { frase: 'Dijo que no quería hablar del tema' }, { frase: 'La gente comentó mucho en redes' }];
const hechos = [];
const base = () => D.directorPorReglas(beats, hechos, null, { sinMuneco: true });

test('revisor: aplica un cambio válido, descarta uno inválido y no deja el plan roto', async () => {
  const escenas = base();
  const llamar = async () => ({ cambios: [
    { beat: 1, motivo: 'la frase nombra un lugar', escena: { beat: 1, principal: 'mapa', mapa: { lugar: 'Chone', ancla: 'Chone' }, extras: [] } },
    { beat: 2, motivo: 'inventa texto', escena: { beat: 2, principal: 'cita', cita: { texto: 'texto que la frase no dice jamás', autor: 'X', ancla: 'no' }, extras: [] } },
    { beat: 99, motivo: 'fuera de rango', escena: { beat: 99, principal: 'video', extras: [] } }] });
  const r = await revisarPlan({ beats, hechos, escenas, llamar });
  assert.equal(r.aplicados.length, 1); assert.equal(r.aplicados[0].a, 'mapa'); assert.equal(r.descartados.length, 2);
  assert.equal(r.escenas[0].principal, 'mapa'); assert.deepEqual(D.validarDireccion(r.escenas, beats, hechos, null), []);
});
test('revisor: si el modelo cae o devuelve basura, el plan queda igual', async () => {
  const escenas = base();
  const a = await revisarPlan({ beats, hechos, escenas, llamar: async () => { throw new Error('503'); } });
  assert.deepEqual(a.escenas, escenas); assert.match(a.avisos[0], /no respondió/);
  const b = await revisarPlan({ beats, hechos, escenas, llamar: async () => ({ cambios: 'nada' }) });
  assert.deepEqual(b.escenas, escenas); assert.equal(b.aplicados.length, 0);
});
test('revisor: las señales gratis detectan monotonía', () => {
  const esc = [1, 2, 3].map(b => ({ beat: b, principal: 'video', extras: [] }));
  assert.ok(senales(beats, esc, hechos, null).some(s => /monoton/.test(s)));
});
test('éxitos: solo cuentan los que pasan el umbral; las referencias traen guion y secuencia visual', () => {
  const dm = fs.mkdtempSync(path.join(os.tmpdir(), 'ex-')); fs.mkdirSync(path.join(dm, 'renders')); 
  const crear = (n, vistas, canal) => { fs.mkdirSync(path.join(dm, 'noticias', n), { recursive: true }); fs.writeFileSync(path.join(dm, 'noticias', n, 'guion.json'), JSON.stringify({ script: 'Guion de ' + n, titulo: n, canal })); fs.writeFileSync(path.join(dm, 'noticias', n, 'plan.json'), JSON.stringify({ escenas: [{ principal: 'mapa' }, { principal: 'cita' }] })); return [n + '.mp4', { vistas }]; };
  fs.writeFileSync(EX.archivoVistas(dm), JSON.stringify(Object.fromEntries([crear('a', 250000, 'C1'), crear('b', 90000, 'C1'), crear('c', 120000, 'C2')])));
  assert.deepEqual(EX.exitos(dm).map(x => x.nombre), ['a', 'c']);
  const ref = EX.referencias(dm, { canal: 'C2', max: 1 }); assert.match(ref, /Guion de c/); assert.match(ref, /mapa > cita/); assert.match(ref, /120 mil/);
  assert.equal(EX.referencias(fs.mkdtempSync(path.join(os.tmpdir(), 'ex-')), {}), '');
});

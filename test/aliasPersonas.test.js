const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path');
const A = require('../edl/aliasPersonas'), C = require('../edl/clipsDeOtros');
const car = ['Kike_Jav_Cuy', 'Las_ñañas', 'Tamara_Pardo', 'Maria_Lopez'];
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'alias-')), 'a.json');

test('resolver: la 1ª vez busca en internet y guarda; la 2ª sale del registro sin buscar', async () => {
  const f = tmp(); let llamadas = 0; const buscar = async () => { llamadas++; return { nombres: ['Kike Jav', 'Enrique Pérez'] }; };
  const r1 = await A.resolver('El Cuy', { carpetas: car, buscar, guardarEn: f }); assert.equal(r1.carpeta, 'Kike_Jav_Cuy'); assert.equal(r1.origen, 'web'); assert.equal(llamadas, 1);
  const r2 = await A.resolver('El Cuy', { carpetas: car, buscar, guardarEn: f }); assert.equal(r2.origen, 'registro'); assert.equal(llamadas, 1);
  const r3 = await A.resolver('Enrique Pérez', { carpetas: car, buscar, guardarEn: f }); assert.equal(r3.carpeta, 'Kike_Jav_Cuy'); assert.equal(llamadas, 1);
});
test('resolver: nombre sin carpeta se recuerda como "sin carpeta" y no se vuelve a buscar', async () => {
  const f = tmp(); let n = 0; const buscar = async () => { n++; return { nombres: ['Tiffany Gaibor'] }; };
  assert.equal((await A.resolver('Tiffany Gaibor', { carpetas: car, buscar, guardarEn: f })).carpeta, null);
  await A.resolver('Tiffany Gaibor', { carpetas: car, buscar, guardarEn: f }); assert.equal(n, 1);
  await A.resolver('Tiffany Gaibor', { carpetas: [...car, 'Nueva'], buscar, guardarEn: f }); assert.equal(n, 2); // la lista de carpetas cambió: se reintenta
});
test('resolver: si internet falla no anota nada; coincidencia directa de carpeta no usa internet', async () => {
  const f = tmp(); const mal = async () => { throw new Error('sin red'); };
  assert.equal((await A.resolver('Alguien Raro', { carpetas: car, buscar: mal, guardarEn: f })).carpeta, null); assert.deepEqual(A.cargar(f).sinCarpeta, {});
  assert.equal((await A.resolver('Tamara Pardo', { carpetas: car, buscar: mal, guardarEn: f })).origen, 'carpeta');
});
test('personasEnTexto: alias aprendidos aparecen en el texto sin IA', () => {
  const reg = A.registrar({ alias: {}, sinCarpeta: {} }, ['El Cuy'], 'Kike_Jav_Cuy', 'manual');
  assert.deepEqual(A.personasEnTexto('Anoche El Cuy volvió a hablar', car, reg).map(x => x.carpeta), ['Kike_Jav_Cuy']);
  assert.deepEqual(A.personasEnTexto('Nada que ver', car, reg), []);
});
test('planificar: usa p.carpeta y los alias para hallar las frases', async () => {
  const et = { a: { id: 'a', rostro: { r: 0.2, t: 1 }, personas: 1, duracion: 5, tipo: 'selfie' } };
  const r = await C.planificar({ beats: [{ frase: 'x' }, { frase: 'Anoche El Cuy volvió a hablar' }], personas: [{ nombre: 'Enrique Pérez', carpeta: 'Kike_Jav_Cuy', alias: ['El Cuy'] }], protagonista: [], carpetasLocales: ['Kike_Jav_Cuy'], cargar: () => ({ etiquetas: et }) });
  assert.deepEqual([...r.elecciones.keys()], [1]);
});

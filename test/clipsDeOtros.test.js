const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../edl/clipsDeOtros');

const toma = (id, r, extra = {}) => ({ id, duracion: 8, personas: 1, rostro: { r, t: 2, cx: 0.5, cy: 0.4 }, tipo: 'otro', ...extra });
const beats = [{ frase: 'Mara habló de su mes.' }, { frase: 'Conny Garcés la criticó en redes.' }, { frase: 'Garcés insistió.' }, { frase: 'Otra frase sin nadie.' }, { frase: 'Conny volvió a escribir.' }];

test('buscarCarpeta: exige todas las palabras del nombre, ignora la protagonista y no adivina si es ambigua', () => {
  const cs = ['Mara_Topic', 'Conny_Garces', 'Conny_Perez', 'Cristhian_Mora', 'Nawat_Itsaragrisil'];
  assert.equal(C.buscarCarpeta('Conny Garcés', cs), 'Conny_Garces');
  assert.equal(C.buscarCarpeta('Conny', cs), null, 'dos Conny: ambigua');
  assert.equal(C.buscarCarpeta('Nawat', cs), 'Nawat_Itsaragrisil', 'un solo nombre y carpeta única');
  assert.equal(C.buscarCarpeta('Cristhian', cs), 'Cristhian_Mora');
  assert.equal(C.buscarCarpeta('Pedro Gómez', cs), null);
  assert.equal(C.buscarCarpeta('Mara Topic', cs, { excluir: ['Mara_Topic'] }), null, 'la protagonista no cuenta');
});

test('frasesQueLaNombran: por nombre o apellido (4+ letras)', () => {
  assert.deepEqual(C.frasesQueLaNombran(beats, 'Conny Garcés'), [1, 2, 4]);
  assert.deepEqual(C.frasesQueLaNombran(beats, 'Pedro Gómez'), []);
});

test('tomasAptas: solo con rostro visible y 3 s o más, las de rostro grande primero', () => {
  const et = { a: toma('a', 0.15), b: toma('b', 0.3), c: toma('c', 0.3, { duracion: 2 }), d: toma('d', 0.05), e: { id: 'e', duracion: 9 } };
  assert.deepEqual(C.tomasAptas(et).map(t => t.id), ['b', 'a']);
});

test('planificar: pone tomas de la persona en las frases que la nombran, cada toma una vez, sin pisar clips exactos', async () => {
  const cargar = c => (c === 'Conny_Garces' ? { etiquetas: { a: toma('a', 0.3), b: toma('b', 0.2), c: toma('c', 0.15), d: toma('d', 0.14) } } : { etiquetas: {} });
  const existentes = new Map([[2, { id: 'x', nivel: 'exacta' }], [4, { id: 'y', nivel: 'relacionada' }]]);
  const r = await C.planificar({ beats, personas: [{ nombre: 'Conny Garcés' }, { nombre: 'Pedro Gómez' }], protagonista: ['Mara_Topic'], existentes, carpetasLocales: ['Conny_Garces', 'Mara_Topic'], cargar });
  assert.deepEqual([...r.elecciones.keys()], [1, 4], 'frase 2 y la 5 (relacionada se pisa); la 3 tenía un clip exacto');
  assert.equal(r.elecciones.get(1).id, 'a'); assert.equal(r.elecciones.get(4).id, 'b');
  assert.equal(r.elecciones.get(1).ss, 1.6); assert.equal(r.carpetaDe.get('a'), 'Conny_Garces');
  assert.ok(r.avisos.some(a => /Conny Garcés: 2 toma/.test(a)));
});

test('planificar: una carpeta de Drive sin índice se indexa una vez; si no hay carpeta, no hace nada', async () => {
  let indexada = false, llamadas = 0;
  const cargar = () => (indexada ? { etiquetas: { a: toma('a', 0.3) } } : { etiquetas: {} });
  const r = await C.planificar({ beats, personas: [{ nombre: 'Conny Garcés' }], carpetasLocales: [], carpetasDrive: ['Conny_Garces'], cargar, indexar: async () => { indexada = true; llamadas++; } });
  assert.equal(llamadas, 1); assert.equal(r.elecciones.size, 1);
  const vacio = await C.planificar({ beats, personas: [{ nombre: 'Pedro Gómez' }], carpetasLocales: ['Conny_Garces'], cargar });
  assert.equal(vacio.elecciones.size, 0);
  const falla = await C.planificar({ beats, personas: [{ nombre: 'Conny Garcés' }], carpetasDrive: ['Conny_Garces'], cargar: () => ({ etiquetas: {} }), indexar: async () => { throw new Error('sin red'); } });
  assert.equal(falla.elecciones.size, 0); assert.ok(falla.avisos.some(a => /no pude indexar/.test(a)));
});

test('tomasPosibles: un grupo sin tomas "solo ella" igual aporta sus videos (duración desde clips.json)', () => {
  const et = { g1: { id: 'g1', tipo: 'desfile', personas: 6, rostro: { r: 0.2 } }, g2: { id: 'g2', tipo: 'otro', personas: 1 }, g3: { id: 'g3', tipo: 'selfie_hablando', personas: 2, rostro: { r: 0.15 }, duracion: 8 } };
  assert.equal(C.tomasAptas(et).length, 0);
  assert.deepEqual(C.tomasPosibles(et, { duraciones: { g1: 10, g2: 12 } }).map(t => t.id), ['g3', 'g1', 'g2']);
  assert.deepEqual(C.tomasPosibles(et, { duraciones: {} }).map(t => t.id), ['g3']);
});

test('colectivos: solo tomas del grupo, nunca una integrante sola; Tamara (carpeta aparte) no es colectivo', () => {
  assert.deepEqual(C.colectivoDe('Las_ñañas', 'Las Ñañas', {}), { integrantes: 0 });
  assert.deepEqual(C.colectivoDe('Las_ñañas', 'Las Ñañas', { Las_ñañas: { integrantes: 4 } }), { integrantes: 4 });
  assert.equal(C.colectivoDe('Tamara_Pardo', 'Tamara', {}), null);
  const et = { s: { id: 's', personas: 1, rostro: { r: 0.3 } }, d: { id: 'd', personas: 2, rostro: { r: 0.2 } }, c4: { id: 'c4', personas: 4, tipo: 'musica', rostro: { r: 0.1 } }, c3: { id: 'c3', personas: 3, rostro: { r: 0.1 } }, mult: { id: 'mult', personas: 10, rostro: { r: 0.1 } } };
  assert.deepEqual(C.tomasColectivo(et, { integrantes: 4 }).map(t => t.id), ['c4', 'c3']);
  assert.deepEqual(C.tomasColectivo({ s: et.s, d: et.d }, { integrantes: 4 }), []);
});

test('personasEnTexto: detecta nombres de carpeta dentro del guion aunque la lectura no los listara', () => {
  const car = ['Kike_Jav_Cuy', 'Las_ñañas', 'Tamara_Pardo', 'Nando', 'Vicente_Fernandez', 'Vicente_Fernandez_jr', 'Kerly_Moran'];
  const r = C.personasEnTexto('Kike Jav y Las Ñañas aparecen con Vicente Fernández en la noche. Nando no vino. Kerly Morán canta.', car, { excluir: ['Kerly_Moran'] });
  assert.deepEqual(r.map(x => x.carpeta).sort(), ['Kike_Jav_Cuy', 'Las_ñañas', 'Nando', 'Vicente_Fernandez']);
  assert.deepEqual(C.personasEnTexto('Kike Jav habló', car, { yaListadas: ['Kike Jav'] }), []);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { generarGuion, validarGuion, guionDeterminista } = require('../edl/guionNarrativo');

const hechos = [
  { texto: 'Shakira y Piqué firmaron un acuerdo de custodia en Barcelona.' },
  { texto: 'El acuerdo se firmó en 2023 tras meses de negociación.' },
  { texto: 'Los medios locales aseguran que Piqué pagará 3 millones.', confirmado: false, fuente: 'los medios locales' },
  { texto: 'Los hijos viven con Shakira en Miami.' },
];
const OPC = { palabrasMin: 20, palabrasMax: 80 };
const buenos = () => [
  { frase: 'Mientras todos hablan de la música, Shakira y Piqué firmaron un acuerdo de custodia en Barcelona.', rol: 'persona', hechos: [1] },
  { frase: 'Se firmó en 2023, tras meses de negociación.', rol: 'fecha', hechos: [2] },
  { frase: 'Según los medios locales, Piqué pagará 3 millones.', rol: 'cifra', hechos: [3] },
  { frase: 'Hoy los hijos viven con Shakira en Miami.', rol: 'lugar', hechos: [4] },
];
const err = (beats, re, opc = OPC) => assert.ok(validarGuion(beats, hechos, opc).errores.some(e => re.test(e)), `esperaba error ${re}`);

test('un guion fiel, en orden y con fuente pasa sin errores', () => {
  const v = validarGuion(buenos(), hechos, OPC);
  assert.deepEqual(v.errores, []);
});

test('rechaza datos inventados, valoración, moraleja, roles raros y frases largas', () => {
  const b = buenos(); b[0].frase = 'Mientras todos hablan, Shakira y Piqué firmaron en Madrid con Karol.'; err(b, /no están en los hechos: .*(Madrid|Karol)/);
  const c = buenos(); c[1].frase = 'Se firmó en 2023, un acuerdo increíble.'; err(c, /valoración/);
  const d = buenos(); d[3].frase = 'Moraleja: hoy los hijos viven con Shakira en Miami.'; err(d, /moraleja/);
  const e = buenos(); e[0].rol = 'emocion'; err(e, /rol "emocion"/);
  const f = buenos(); f[0].frase = Array(30).fill('Shakira').join(' '); err(f, /una idea por frase/);
});

test('un hecho no confirmado sin fuente se rechaza; con fuente pasa', () => {
  const b = buenos(); b[2].frase = 'Piqué pagará 3 millones.'; err(b, /no confirmado/);
  assert.deepEqual(validarGuion(buenos(), hechos, OPC).errores, []);
});

test('largo total fuera de rango y pocas marcas de tiempo (aviso)', () => {
  err(buenos(), /palabras en total/, { palabrasMin: 100, palabrasMax: 200 });
  const sinTiempo = [
    { frase: 'Shakira y Piqué firmaron un acuerdo de custodia en Barcelona.', rol: 'persona', hechos: [1] },
    { frase: 'Los hijos viven con Shakira en Miami.', rol: 'lugar', hechos: [4] },
  ];
  assert.ok(validarGuion(sinTiempo, hechos, OPC).avisos.some(a => /marcas de tiempo/.test(a)));
});

test('generarGuion: corrige con la respuesta del modelo en el reintento y manda los errores', async () => {
  const prompts = [];
  const llamar = async (p) => { prompts.push(p); return { beats: prompts.length === 1 ? [{ frase: 'Increíble acuerdo en Madrid.', rol: 'dato', hechos: [1] }] : buenos() }; };
  const r = await generarGuion(hechos, { llamar, ...OPC });
  assert.equal(r.origen, 'llm'); assert.equal(prompts.length, 2);
  assert.match(prompts[1], /Tu respuesta anterior tuvo estos problemas/);
  assert.match(r.script, /^Mientras todos hablan/);
});

test('generarGuion: sin arreglo cae al guion determinista fiel (con fuente en lo no confirmado)', async () => {
  const r = await generarGuion(hechos, { llamar: async () => ({ beats: [{ frase: 'Increíble.', rol: 'dato', hechos: [1] }] }), maxReintentos: 1, ...OPC });
  assert.equal(r.origen, 'respaldo');
  assert.equal(r.beats.length, hechos.length);
  assert.match(r.beats[2].frase, /^Los medios locales aseguran/); // ya trae su fuente: no se duplica
  assert.ok(r.avisos.some(a => /determinista/.test(a)));
  const sinFuente = guionDeterminista([{ texto: 'Se casaron en 2020.', confirmado: false, fuente: 'la revista' }]);
  assert.equal(sinFuente[0].frase, 'Según la revista, se casaron en 2020.');
});

test('generarGuion: si el modelo falla (excepción) devuelve el respaldo con aviso', async () => {
  const r = await generarGuion(hechos, { llamar: async () => { throw new Error('sin red'); }, ...OPC });
  assert.equal(r.origen, 'respaldo');
  assert.ok(r.avisos.some(a => /sin red/.test(a)));
});

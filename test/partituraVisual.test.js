const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { partituraVisual, partituraDeterminista, validarPartitura, recetasPorParrafo, numerosEnFrase } = require('../edl/partituraVisual');
const { aplicarPlanPorRecetas } = require('../edl/modoRecetas');

const hechos = [
  { texto: 'Ganó el título.' },
  { texto: 'Compitió contra 12 aspirantes.' },
  { texto: 'Los medios aseguran que recibió un premio.', confirmado: false },
];
const beats = [
  { frase: 'La noche del viernes 30 de octubre de 2026, Leidy ganó el título.', rol: 'fecha', hechos: [1] },
  { frase: 'Compitió contra doce aspirantes de la provincia.', rol: 'cifra', hechos: [2] },
  { frase: 'Según los medios, recibió un premio especial.', rol: 'rumor', hechos: [3] },
  { frase: 'Después agradeció el respaldo de su cantón.', rol: 'dato', hechos: [1] },
  { frase: 'Hoy sigue en las redes sociales.', rol: 'dato', hechos: [1] },
];
const buenas = () => [
  { beat: 1, recipe: 'tarjeta_dato', params: { etiqueta: 'Fecha', titulo: '30 de octubre de 2026' } },
  { beat: 2, recipe: 'cifra_pildora', params: { valor: 12, sufijo: ' aspirantes' } },
  { beat: 3, recipe: 'sello_animado', params: {} },
];

test('numerosEnFrase entiende cifras, miles con punto y números en palabras', () => {
  assert.deepEqual([...numerosEnFrase('Compitió contra doce aspirantes y 500.000 votos en 2026')].sort((a, b) => a - b), [12, 2026, 500000]);
});

test('una partitura fiel a las frases pasa sin errores', () => {
  assert.deepEqual(validarPartitura(buenas(), beats, hechos), []);
});

test('rechaza texto en pantalla que la frase no dice, cifras ajenas, sello sin rumor y exceso de piezas', () => {
  const err = (piezas, re) => assert.ok(validarPartitura(piezas, beats, hechos).some(e => re.test(e)), `esperaba ${re}`);
  err([{ beat: 1, recipe: 'tarjeta_dato', params: { titulo: '31 de octubre de 2026' } }], /no está literalmente/);
  err([{ beat: 2, recipe: 'cifra_pildora', params: { valor: 13 } }], /cifra 13 no está/);
  err([{ beat: 2, recipe: 'cifra_pildora', params: { valor: 12, sufijo: ' votos' } }], /sufijo/);
  err([{ beat: 2, recipe: 'sello_animado', params: {} }], /sin hechos no confirmados/);
  err([{ beat: 1, recipe: 'tarjeta_dato', params: { titulo: 'x', etiqueta: 'Chisme' } }], /etiqueta/);
  err([{ beat: 9, recipe: 'tarjeta_dato', params: { titulo: 'x' } }], /no existe/);
  err([{ beat: 1, recipe: 'confeti', params: {} }], /fuera del catálogo/);
  err([...buenas(), { beat: 4, recipe: 'tarjeta_dato', params: { titulo: 'su cantón' } }, { beat: 5, recipe: 'tarjeta_dato', params: { titulo: 'redes sociales' } }], /piezas para 5 frases/);
});

test('partituraVisual: usa al modelo y reintenta con los errores; sin arreglo cae al respaldo por reglas', async () => {
  const prompts = [];
  const llamar = async (p) => { prompts.push(p); return { piezas: prompts.length === 1 ? [{ beat: 1, recipe: 'tarjeta_dato', params: { titulo: 'inventado' } }] : buenas() }; };
  const r = await partituraVisual(beats, hechos, { llamar });
  assert.equal(r.origen, 'llm'); assert.equal(prompts.length, 2);
  assert.match(prompts[1], /no está literalmente/);
  const caido = await partituraVisual(beats, hechos, { llamar: async () => { throw new Error('sin red'); } });
  assert.equal(caido.origen, 'respaldo');
  assert.deepEqual(caido.piezas.map(p => [p.beat, p.recipe]), [[1, 'tarjeta_dato'], [3, 'sello_animado']]); // "doce" en palabras no lo toma el respaldo
  assert.equal(caido.piezas[0].params.titulo, '30 de octubre de 2026');
  assert.deepEqual(validarPartitura(caido.piezas, beats, hechos), []);
});

test('respaldo por reglas: cifra en dígitos y respeta la densidad', () => {
  const b = [{ frase: 'Compitió contra 12 aspirantes.', hechos: [] }, { frase: 'Ganó 3 premios.', hechos: [] }, { frase: 'Fue en 2023.', hechos: [] }];
  const p = partituraDeterminista(b, []);
  assert.equal(p[0].params.valor, 12); assert.equal(p[0].params.sufijo, ' aspirantes');
  assert.ok(p.length <= Math.ceil(b.length * 0.6));
  assert.ok(!p.some(x => x.params.valor === 2023), 'un año suelto no es una cifra');
});

test('modo recetas con partitura: pone la pieza en el primer clip del párrafo, no en el primer shot de un 9:16 y no llama al LLM', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'partitura-'));
  try {
    const plan = [
      { videoId: 'a', famoso: 'X', offset: 0, duracion: 2, parrafoIdx: 0 },
      { videoId: 'b', famoso: 'Y', offset: 0, duracion: 3, parrafoIdx: 1 },
      { videoId: 'b', famoso: 'Y', offset: 3, duracion: 3, parrafoIdx: 1 },
    ];
    const efectos = { aspect: '9:16', recetasPorParrafo: recetasPorParrafo([{ beat: 1, recipe: 'sello_animado', params: {} }, { beat: 2, recipe: 'tarjeta_dato', params: { titulo: 'Coliseo La California' } }]) };
    const r = await aplicarPlanPorRecetas({ plan, efectos, dirTemp: dir, llamar: async () => { throw new Error('no debe llamarse'); } });
    assert.equal(r.info.origen, 'partitura');
    assert.deepEqual(r.info.recetas, ['clip_kenburns', 'tarjeta_dato', 'clip_kenburns']);
    assert.equal(r.efectos.overlays.filter(o => o.secuencia).length, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

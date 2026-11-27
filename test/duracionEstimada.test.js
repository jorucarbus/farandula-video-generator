const test = require('node:test'), assert = require('node:assert');
const DU = require('../edl/duracionEstimada');
const frase = 'Una marea humana gritando en Cuenca, mientras a pocos kilómetros sobraba espacio frente a la tarima. ';
test('estimar: crece con el texto y no cuenta las etiquetas entre corchetes', () => {
  assert.ok(DU.estimar(frase.repeat(8)) > DU.estimar(frase.repeat(4)));
  assert.equal(DU.estimar('[excited] Hola, mundo.'), DU.estimar('Hola, mundo.'));
});
test('estimar: un guion de ~210 palabras pasa el tope y uno de ~170 no', () => {
  const g = n => Array.from({ length: n }, () => 'palabra').join(' ').replace(/(palabra ){8}/g, '$&. ');
  assert.ok(DU.estimar(frase.repeat(11)) > DU.TOPE_ESTIMADO); assert.ok(DU.estimar(frase.repeat(8)) < DU.TOPE_ESTIMADO);
});
test('acortar: usa la respuesta si es más corta; si no sirve, conserva el original', async () => {
  const largo = frase.repeat(11), corto = frase.repeat(7);
  assert.equal(await DU.acortar(largo, { llamar: async () => ({ guion: corto }) }), corto.trim());
  assert.equal(await DU.acortar(largo, { llamar: async () => ({ guion: 'muy corto' }) }), largo);
  assert.equal(await DU.acortar(largo, { llamar: async () => ({ guion: largo + ' más' }) }), largo);
});

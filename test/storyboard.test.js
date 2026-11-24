// El experto en storyboard: plantillas de reacción (qué le gusta / qué le duele), logros de OTRAS personas, muñeco acompañando a los datos y nunca parado.
const test = require('node:test');
const assert = require('node:assert/strict');
const { planificar, reaccionDe, storyboardMarkdown } = require('../edl/storyboard');
const { EMOCIONES, GESTOS } = require('../edl/director');

const beat = frase => ({ frase, rol: 'persona', hechos: [1] });
const opc = { emocionesValidas: EMOCIONES, gestosValidos: GESTOS };

test('reaccionDe: lo que le gusta, lo que le duele y el logro de otra persona', () => {
  assert.equal(reaccionDe('Ella ganó la corona de Reina de Manabí.').id, 'triunfo');
  assert.equal(reaccionDe('Su prima quedó segunda en el concurso.').id, 'decepcion');
  assert.equal(reaccionDe('Hubo una polémica enorme por el resultado.').id, 'polemica');
  assert.equal(reaccionDe('Según medios locales hubo cambios.').id, 'duda');
  assert.equal(reaccionDe('Ayer llovió en la ciudad.'), null);
  // el logro es de OTRA persona con nombre propio: la protagonista no celebra, se inquieta
  assert.equal(reaccionDe('Marcel Ponce Zamora, representante de Manta, quedó como virreina.').id, 'rival');
  // pero si la frase habla de ella (alias), sí celebra
  assert.equal(reaccionDe('Paula Zambrano, su antecesora, le entregó la corona.').id, 'triunfo');
});

test('planificar: el muñeco acompaña al mapa señalándolo, el dato chico sin reacción va solo, y ningún muñeco queda parado', () => {
  const beats = [beat('Nació en Chone el treinta de noviembre.'), beat('Mide un metro setenta y cinco.'), beat('Vive en una casa grande con su familia.'), beat('Trabaja todos los días con mucha disciplina.')];
  const escenas = [
    { beat: 1, principal: 'mapa', mapa: { lugar: 'Chone', ancla: 'Chone' }, extras: [] },
    { beat: 2, principal: 'cifra', cifra: { valor: 175, sufijo: 'cm', ancla: 'setenta' }, extras: [] },
    { beat: 3, principal: 'muneco', muneco: { traje: 'bastonera', pose: 'reposo', emocion: 'normal' }, extras: [] },
    { beat: 4, principal: 'muneco', muneco: { traje: 'bastonera', pose: 'reposo', emocion: 'normal' }, extras: [] },
  ];
  const { escenas: out, storyboard } = planificar(escenas, beats, opc);
  assert.ok(out[0].muneco && out[0].muneco.gestos.some(g => g.id === 'senala_arriba' && g.ancla === 'Chone'), 'el mapa lleva al muñeco señalándolo');
  assert.equal(out[0].muneco.encuadre, 'companero');
  assert.ok(!out[1].muneco, 'una cifra sin carga emocional va sola (con tomas de video)');
  for (const e of out.filter(x => x.muneco)) assert.ok(e.muneco.gestos.length > 0 || e.muneco.emocion !== 'normal' || e.muneco.pose !== 'reposo', `beat ${e.beat}: el muñeco no puede quedarse parado`);
  assert.equal(storyboard.length, 4);
  assert.match(storyboardMarkdown(storyboard), /\| 1 \|.*mapa \(Chone\)/);
});

test('planificar: primer plano solo en reacciones fuertes y con enfriamiento (no seguidos)', () => {
  const beats = [beat('Ella ganó la corona.'), beat('Ganó también otro título.'), beat('Hubo una gran polémica.'), beat('Nadie lo esperaba, fue increíble.')];
  const escenas = beats.map((b, i) => ({ beat: i + 1, principal: 'muneco', muneco: { traje: 'bastonera', pose: 'reposo', emocion: 'normal' }, extras: [] }));
  const { escenas: out } = planificar(escenas, beats, opc);
  assert.equal(out[0].muneco.plano, 'primer');
  assert.ok(out[1].muneco.plano !== 'primer' && out[2].muneco.plano !== 'primer', 'enfriamiento de 3 frases');
  assert.equal(out[3].muneco.plano, 'primer');
});

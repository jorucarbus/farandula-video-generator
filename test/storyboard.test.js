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

test('planificar: si el muñeco no aporta y hay video, la frase va con tomas que ilustren; con video no disponible se queda el muñeco', () => {
  const beats = [beat('Ella ganó la corona.'), beat('Vive en una casa tranquila.'), beat('Trabaja todos los días.'), beat('Ayer cerró el año con un viaje.')];
  const escenas = beats.map((b, i) => ({ beat: i + 1, principal: 'muneco', muneco: { traje: 'bastonera', pose: 'reposo', emocion: 'normal' }, extras: [] }));
  const con = planificar(escenas, beats, { ...opc, hayVideo: true }).escenas, sin = planificar(escenas, beats, { ...opc, hayVideo: false }).escenas;
  assert.equal(con[0].principal, 'muneco');                         // abre el video: ella reacciona
  assert.equal(con[1].principal, 'video'); assert.ok(!con[1].muneco);   // sin nada que sentir ni señalar: tomas
  assert.equal(con[3].principal, 'muneco');                         // cierra el video: vuelve el muñeco
  assert.ok(sin.every(e => e.principal === 'muneco' && e.muneco), 'sin video disponible el muñeco no se quita');
});

test('planificar: el lado del muñeco cambia al volver tras otra pieza y los gráficos van al lado contrario', () => {
  const beats = [beat('Ella ganó la corona.'), beat('Nació en Chone.'), beat('Segunda quedó otra candidata.'), beat('Al final todo terminó bien.')];
  const escenas = [
    { beat: 1, principal: 'muneco', muneco: { traje: 'bastonera', pose: 'reposo', emocion: 'normal' }, extras: [] },
    { beat: 2, principal: 'mapa', mapa: { lugar: 'Chone', ancla: 'Chone' }, extras: [] },
    { beat: 3, principal: 'muneco', muneco: { traje: 'bastonera', pose: 'reposo', emocion: 'normal' }, extras: [] },
    { beat: 4, principal: 'muneco', muneco: { traje: 'bastonera', pose: 'reposo', emocion: 'normal' }, extras: [] },
  ];
  const out = planificar(escenas, beats, opc).escenas;
  assert.ok(out[0].muneco.lado && out[2].muneco.lado && out[0].muneco.lado !== out[2].muneco.lado, 'tras el mapa el muñeco cambia de lado');
  assert.equal(out[3].muneco.lado, out[2].muneco.lado, 'frases seguidas con muñeco mantienen el lado');
  assert.equal(out[1].muneco.lado, undefined, 'el comentarista del mapa va centrado abajo');
});

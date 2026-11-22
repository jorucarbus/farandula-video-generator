// Capa 1 (sin red): el planificador de recetas con un "LLM" falso inyectado.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { planificarEdl, planDeterminista } = require('../edl/planificadorLLM');
const { validarEdl } = require('../edl/edlValidator');

const cargar = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'edl', n), 'utf8'));
const A = () => cargar('ejemplo-a-short-9x16.json');

// Un LLM falso que responde lo que se le diga, en orden, y registra lo que recibió.
function falso(respuestas) {
  const llamadas = [];
  const fn = async (prompt, mensaje) => {
    llamadas.push({ prompt, mensaje });
    const r = respuestas[Math.min(llamadas.length - 1, respuestas.length - 1)];
    if (r instanceof Error) throw r;
    return r;
  };
  fn.llamadas = llamadas;
  return fn;
}

const etapa1Buena = { shots: [{ id: 's1', recipe: 'hook_cold_open' }, { id: 's2', recipe: 'source_lowerthird' }, { id: 's3', recipe: 'rumor_stamp' }] };
const etapa2Buena = { shots: [{ id: 's1', params: { titulo: 'Lo que nadie vio' } }, { id: 's2', params: { texto: 'Según Medio Z, 3 may' } }, { id: 's3', params: {} }] };

test('camino feliz: recetas del LLM + params, validado, sin tocar duraciones ni clips', async () => {
  const llm = falso([etapa1Buena, etapa2Buena]);
  const r = await planificarEdl(A(), { llamar: llm });
  assert.equal(r.origen, 'llm');
  assert.deepEqual(r.edl.shots.map(s => s.recipe), ['hook_cold_open', 'source_lowerthird', 'rumor_stamp']);
  assert.equal(r.edl.shots[0].params.titulo, 'Lo que nadie vio');
  // la atribución y el sello NO los escribe el modelo: sus params siguen vacíos aunque los mande
  assert.deepEqual(r.edl.shots[1].params, {});
  assert.deepEqual(r.edl.shots[2].params, {});
  assert.deepEqual(validarEdl(r.edl).errores, []);
  assert.deepEqual(r.edl.shots.map(s => s.duracion), A().shots.map(s => s.duracion));
  assert.deepEqual(r.edl.shots.map(s => s.clip), A().shots.map(s => s.clip));
  assert.equal(llm.llamadas.length, 2);
});

test('el LLM no ve URLs ni rutas: solo el resumen del shot', async () => {
  const llm = falso([etapa1Buena, etapa2Buena]);
  await planificarEdl(A(), { llamar: llm });
  assert.ok(!/ejemplo\.test|http|videoId|drv_/.test(llm.llamadas[0].mensaje), llm.llamadas[0].mensaje);
});

test('receta inventada: cae a clip_kenburns y se avisa (nunca pasa fuera del enum)', async () => {
  const llm = falso([{ shots: [{ id: 's1', recipe: 'clip_kenburns' }, { id: 's2', recipe: 'blender_set_shot' }, { id: 's3', recipe: 'rumor_stamp' }] }, { shots: [] }]);
  const r = await planificarEdl(A(), { llamar: llm });
  assert.equal(r.edl.shots[1].recipe, 'clip_kenburns');
  assert.ok(r.avisos.some(a => /fuera del enum/.test(a)));
});

test('un shot con certeza rumor fuerza rumor_stamp aunque el LLM diga otra cosa', async () => {
  const llm = falso([{ shots: [{ id: 's1', recipe: 'clip_kenburns' }, { id: 's2', recipe: 'clip_kenburns' }, { id: 's3', recipe: 'clip_kenburns' }] }, { shots: [] }]);
  const r = await planificarEdl(A(), { llamar: llm });
  assert.equal(r.edl.shots[2].recipe, 'rumor_stamp');
  assert.ok(r.avisos.some(a => /fuerza rumor_stamp/.test(a)));
  assert.deepEqual(validarEdl(r.edl).errores, []);
});

test('error de reglas en código: reintenta devolviéndole los errores y se corrige', async () => {
  // primero propone hook_cold_open en el segundo shot (inválido); luego corrige
  const mala = { shots: [{ id: 's1', recipe: 'clip_kenburns' }, { id: 's2', recipe: 'hook_cold_open' }, { id: 's3', recipe: 'rumor_stamp' }] };
  const llm = falso([mala, etapa1Buena, etapa2Buena]);
  const r = await planificarEdl(A(), { llamar: llm });
  assert.equal(r.origen, 'llm');
  assert.equal(llm.llamadas.length, 3);
  assert.match(llm.llamadas[1].prompt, /solo puede ser el primer shot|V10/, 'el reintento incluye los errores');
});

test('si el LLM insiste en lo inválido, tras 2 reintentos usa el plan determinista', async () => {
  const mala = { shots: [{ id: 's1', recipe: 'clip_kenburns' }, { id: 's2', recipe: 'hook_cold_open' }, { id: 's3', recipe: 'rumor_stamp' }] };
  const llm = falso([mala, mala, mala, mala]);
  const r = await planificarEdl(A(), { llamar: llm });
  assert.equal(r.origen, 'respaldo');
  assert.equal(llm.llamadas.length, 3, '1 intento + 2 reintentos, ni uno más');
  assert.deepEqual(validarEdl(r.edl).errores, []);
  // el respaldo conserva lo que el shot ya traía si es válido (hook con título, kenburns) y fuerza el rumor
  assert.deepEqual(r.edl.shots.map(s => s.recipe), ['hook_cold_open', 'clip_kenburns', 'rumor_stamp']);
  // y sin recetas previas válidas cae a clip_kenburns (el comportamiento de hoy)
  const crudo = A(); crudo.shots.forEach(s => { s.recipe = 'ranking_item'; s.params = {}; s.certeza = { nivel: 'confirmado' }; });
  assert.deepEqual(planDeterminista(crudo).shots.map(s => s.recipe), ['clip_kenburns', 'clip_kenburns', 'clip_kenburns']);
});

test('si el modelo falla (red, cuota), plan determinista sin reintentar', async () => {
  const llm = falso([new Error('503 saturado')]);
  const r = await planificarEdl(A(), { llamar: llm });
  assert.equal(r.origen, 'respaldo');
  assert.equal(llm.llamadas.length, 1);
  assert.ok(r.avisos.some(a => /503/.test(a)));
});

test('params inválidos de la etapa 2 se descartan y se usan los de la receta', async () => {
  const e2 = { shots: [{ id: 's1', params: { titulo: 'x'.repeat(100) } }, { id: 's2', params: { texto: 'Según Medio Z' } }, { id: 's3', params: { ffmpeg: '-x' } }] };
  const r = await planificarEdl(A(), { llamar: falso([etapa1Buena, e2]) });
  // sin título válido, el gancho pasa a clip_kenburns (no se inventa el título)
  assert.equal(r.edl.shots[0].recipe, 'clip_kenburns');
  assert.deepEqual(r.edl.shots[1].params, {}, 'el texto de atribución nunca viene del modelo');
  assert.deepEqual(r.edl.shots[2].params, {});
  assert.deepEqual(validarEdl(r.edl).errores, []);
});

test('si la etapa 2 falla, igual hay plan válido (sin títulos inventados)', async () => {
  const llm = falso([etapa1Buena, new Error('timeout')]);
  const r = await planificarEdl(A(), { llamar: llm });
  assert.equal(r.origen, 'llm');
  assert.equal(r.edl.shots[0].recipe, 'clip_kenburns', 'hook sin título no se inventa');
  assert.deepEqual(validarEdl(r.edl).errores, []);
});

test('planDeterminista no cambia la EDL original y deja una EDL válida', () => {
  const original = A();
  const copia = JSON.stringify(original);
  const d = planDeterminista(original);
  assert.equal(JSON.stringify(original), copia);
  assert.deepEqual(validarEdl(d).errores, []);
});

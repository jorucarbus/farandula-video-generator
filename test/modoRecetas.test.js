// El modo opt-in "plan por recetas": convierte el plan clásico, elige recetas con un LLM falso y
// devuelve el MISMO plan con zoom por clip y overlays. Sin red.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { aplicarPlanPorRecetas, edlDesdePlan } = require('../edl/modoRecetas');
const { resolverFuente } = require('../overlay/renderPng');
const { validarEdl } = require('../edl/edlValidator');

let hayFuente = true;
try { resolverFuente(); } catch { hayFuente = false; }
const sinFuente = { skip: hayFuente ? false : 'no hay tipografía en el sistema' };

const planClasico = () => [
  { videoId: 'v1', famoso: 'Shakira', offset: 3.2, duracion: 2.1, parrafoIdx: 0 },
  null,
  { videoId: 'v2', famoso: 'Piqué', offset: 0, duracion: 1.8, parrafoIdx: 1 },
  { videoId: 'foto', famoso: 'Piqué', offset: 0, duracion: 2.4, parrafoIdx: 2, esImagen: true },
];

const llm = respuestas => { let n = 0; return async () => { const r = respuestas[Math.min(n++, respuestas.length - 1)]; if (r instanceof Error) throw r; return r; }; };

test('edlDesdePlan: salta los huecos, conserva campos y declara la fuente como biblioteca (sin inventar medios)', () => {
  const edl = edlDesdePlan(planClasico(), { aspect: '9:16', efectos: { transicion: 'alternado', transicionDur: 0.4 }, titulo: 'Titular de prueba' });
  assert.equal(edl.shots.length, 3);
  assert.deepEqual(edl.shots.map(s => s.id), ['c0', 'c2', 'c3']);
  assert.equal(edl.shots[2].clip.esImagen, true);
  assert.equal(edl.shots[0].locucion.texto_pantalla, 'Titular de prueba');
  assert.equal(edl.transicion_preset, 'alternado');
  assert.equal(edl.shots[0].fuente.licencia, 'biblioteca_propia');
  assert.match(edl.shots[0].fuente.url, /^drive:\/\//);
  assert.deepEqual(validarEdl(edl).errores.filter(e => e.regla !== 'V4'), []);
});

test('plan por recetas: el plan original manda y solo gana zoom/overlays', sinFuente, async () => {
  const etapa1 = { shots: [{ id: 'c0', recipe: 'hook_cold_open' }, { id: 'c2', recipe: 'clip_kenburns' }, { id: 'c3', recipe: 'clip_kenburns' }] };
  const etapa2 = { shots: [{ id: 'c0', params: { titulo: 'Titular de prueba' } }] };
  const original = planClasico();
  const copia = JSON.stringify(original);
  const r = await aplicarPlanPorRecetas({ plan: original, efectos: { transicion: 'ninguno', aspect: '9:16' }, titulo: 'Titular de prueba', llamar: llm([etapa1, etapa2]) });

  assert.equal(JSON.stringify(original), copia, 'no muta el plan que recibe');
  assert.equal(r.plan.length, 4);
  assert.equal(r.plan[1], null, 'el hueco se conserva en su lugar');
  assert.deepEqual({ ...r.plan[0], zoom: undefined }, { ...original[0], zoom: undefined }, 'los campos del clip no cambian');
  assert.equal(r.plan[0].zoom.direccion, 'in');
  assert.equal(r.plan[3].esImagen, true);
  assert.equal(r.info.origen, 'llm');
  assert.equal(r.efectos.overlays.length, 1, 'un overlay: el título del gancho');
  assert.ok(fs.existsSync(r.efectos.overlays[0].path));
  assert.equal(r.efectos.overlays[0].t0, 0);
});

test('plan por recetas: si el modelo falla, sale el respaldo determinista (zoom por clip, sin overlays inventados)', sinFuente, async () => {
  const r = await aplicarPlanPorRecetas({ plan: planClasico(), efectos: {}, titulo: 'X', llamar: llm([new Error('503')]) });
  assert.equal(r.info.origen, 'respaldo');
  assert.equal(r.efectos.overlays.length, 0);
  assert.ok(r.plan.filter(Boolean).every(p => p.zoom));
});

test('plan por recetas: un clip corto que decidió seleccion.js NO manda al planificador a respaldo (V2/V3/V4 ignoradas)', sinFuente, async () => {
  const plan = [{ videoId: 'v1', famoso: 'X', offset: 0, duracion: 0.4 }, { videoId: 'v2', famoso: 'X', offset: 0, duracion: 3.0 }];
  const etapa1 = { shots: [{ id: 'c0', recipe: 'clip_kenburns' }, { id: 'c1', recipe: 'clip_kenburns' }] };
  const r = await aplicarPlanPorRecetas({ plan, efectos: { transicion: 'todos' }, llamar: llm([etapa1, { shots: [] }]) });
  assert.equal(r.info.origen, 'llm');
});

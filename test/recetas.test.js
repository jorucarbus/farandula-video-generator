// Capa 1 (pura): el catálogo cerrado de recetas, V10 y la auditoría del plan legado.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const recetas = require('../recetas');
const { validarEdl, auditarPlanLegado } = require('../edl/edlValidator');

const cargar = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'edl', n), 'utf8'));

test('catálogo: las 4 recetas P0 están implementadas y las 2 reservadas no', () => {
  for (const id of ['clip_kenburns', 'hook_cold_open', 'source_lowerthird', 'rumor_stamp']) assert.equal(recetas.obtener(id).implementada, true, id);
  for (const id of ['ranking_item', 'split_compare']) assert.equal(recetas.obtener(id).implementada, false, id);
  assert.equal(recetas.existe('blender_set_shot'), false);
});

test('validarParams: defaults, tipos, rangos y propiedades desconocidas', () => {
  assert.deepEqual(recetas.validarParams('clip_kenburns', {}), []);
  assert.deepEqual(recetas.validarParams('clip_kenburns', { dir: 'out', pct: 15 }), []);
  assert.notDeepEqual(recetas.validarParams('clip_kenburns', { pct: 99 }), []);
  assert.notDeepEqual(recetas.validarParams('clip_kenburns', { dir: 'arriba' }), []);
  assert.notDeepEqual(recetas.validarParams('clip_kenburns', { ffmpeg: '-vf x' }), []);
  assert.notDeepEqual(recetas.validarParams('hook_cold_open', {}), [], 'exige titulo');
  assert.notDeepEqual(recetas.validarParams('hook_cold_open', { titulo: 'x'.repeat(41) }), []);
  assert.deepEqual(recetas.validarParams('rumor_stamp', {}), []);
  assert.notDeepEqual(recetas.validarParams('nada', {}), []);
});

test('hook_cold_open: título en mayúsculas arriba, solo los primeros segundos, con zoom in', () => {
  const shot = { id: 's1', duracion: 3.0 };
  const r = recetas.obtener('hook_cold_open').aplicar({ shot, params: recetas.paramsEfectivos('hook_cold_open', { titulo: 'Lo que nadie vio' }), tInicio: 0 });
  assert.equal(r.overlays.length, 1);
  assert.equal(r.overlays[0].texto, 'LO QUE NADIE VIO');
  assert.equal(r.overlays[0].estilo, 'titulo');
  assert.equal(r.overlays[0].t0, 0);
  assert.equal(r.overlays[0].t1, 2.4);
  assert.equal(r.zoom.direccion, 'in');
});

test('source_lowerthird: usa el texto dado o lo arma desde la fuente; sin ninguno avisa', () => {
  const rec = recetas.obtener('source_lowerthird');
  const p = recetas.paramsEfectivos('source_lowerthird', {});
  const a = rec.aplicar({ shot: { id: 'a', duracion: 2, fuente: { autor: 'Medio Z', fecha_acceso: '2026-11-21' } }, params: p, tInicio: 5 });
  assert.equal(a.overlays[0].texto, 'Según Medio Z, 2026-11-21');
  assert.ok(a.overlays[0].t0 >= 5 && a.overlays[0].t1 <= 7);
  const b = rec.aplicar({ shot: { id: 'b', duracion: 2 }, params: p, tInicio: 0 });
  assert.equal(b.overlays.length, 0);
  assert.ok(b.avisos.some(x => /sin texto/.test(x)));
});

test('rumor_stamp: sello rojo durante todo el shot', () => {
  const r = recetas.obtener('rumor_stamp').aplicar({ shot: { id: 'r', duracion: 4 }, params: recetas.paramsEfectivos('rumor_stamp', {}), tInicio: 10 });
  assert.equal(r.overlays[0].texto, 'RUMOR SIN CONFIRMAR');
  assert.equal(r.overlays[0].estilo, 'sello');
  assert.equal(r.overlays[0].t0, 10);
  assert.equal(r.overlays[0].t1, 14);
});

test('V10: receta fuera del catálogo y params inválidos fallan', () => {
  const edl = cargar('ejemplo-a-short-9x16.json');
  edl.shots[1].recipe = 'blender_set_shot';
  assert.ok(validarEdl(edl).errores.some(e => e.regla === 'V10' && e.shot === 's2'));
  const e2 = cargar('ejemplo-a-short-9x16.json');
  e2.shots[1].params = { pct: 500 };
  assert.ok(validarEdl(e2).errores.some(e => e.regla === 'V10' && /params/.test(e.mensaje)));
});

test('V10: primer shot de un short solo hook_cold_open o clip_kenburns; hook solo al inicio', () => {
  const edl = cargar('ejemplo-a-short-9x16.json');
  edl.shots[0].recipe = 'source_lowerthird'; edl.shots[0].params = {};
  edl.shots[0].certeza = { nivel: 'confirmado' };
  assert.ok(validarEdl(edl).errores.some(e => e.regla === 'V10' && /primer shot/.test(e.mensaje)));
  const e2 = cargar('ejemplo-a-short-9x16.json');
  e2.shots[1].recipe = 'hook_cold_open'; e2.shots[1].params = { titulo: 'OTRO' };
  assert.ok(validarEdl(e2).errores.some(e => e.regla === 'V10' && /solo puede ser el primer shot/.test(e.mensaje)));
});

test('auditarPlanLegado: marca un clip de 3.0 s con transición y respeta lo propio', () => {
  const plan = [
    { videoId: 'a', famoso: 'X', offset: 0, duracion: 3.0 },
    { videoId: 'b', famoso: 'X', offset: 0, duracion: 3.0 },
    { videoId: 'c', famoso: 'X', offset: 0, duracion: 4.0, fuenteTipo: 'propio' },
    { videoId: 'd', famoso: 'X', offset: 0, duracion: 1.0 },
  ];
  const r = auditarPlanLegado(plan, { transicion: 'todos', transicionDur: 0.35 }, 11);
  assert.deepEqual(r.errores.map(e => e.shot), ['clip0', 'clip1']);
  assert.equal(auditarPlanLegado(plan, {}, 11).errores.length, 0, 'sin transiciones los 3.0 s son válidos');
  assert.ok(auditarPlanLegado(plan, {}, 30).avisos.some(a => a.regla === 'V4'), 'audio muy distinto del plan = aviso, no error');
});

test('auditarPlanLegado: tolera un plan con huecos (null) y vacío', () => {
  assert.equal(auditarPlanLegado([null, { videoId: 'a', duracion: 2 }], {}, 2).clips, 1);
  assert.equal(auditarPlanLegado([], {}, null).errores.length, 0);
});

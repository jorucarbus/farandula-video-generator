// Capa 1 (pura): el adaptador EDL -> plan[] legado y planFormato.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { edlAPlan } = require('../edl/edlAPlan');
const { planFormato } = require('../edl/planFormato');

const cargar = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'edl', n), 'utf8'));

test('edlAPlan: una EDL equivalente a un plan hecho a mano devuelve el mismo plan', () => {
  const edl = cargar('ejemplo-a-short-9x16.json');
  const manual = [
    { videoId: 'drv_abc', famoso: 'Shakira', offset: 12.0, duracion: 2.4, fuenteTipo: 'tercero' },
    { videoId: 'drv_def', famoso: 'Piqué', offset: 3.0, duracion: 2.4, fuenteTipo: 'tercero' },
    { videoId: 'foto_01', famoso: 'Piqué', offset: 0, duracion: 5.2, esImagen: true, fuenteTipo: 'cc0' },
  ];
  assert.deepEqual(edlAPlan(edl).plan, manual);
});

test('edlAPlan: conserva parrafoIdx y respeta el orden aunque el array venga desordenado', () => {
  const edl = cargar('ejemplo-a-short-9x16.json');
  edl.shots[0].clip.parrafoIdx = 4;
  edl.shots.reverse();
  const { plan } = edlAPlan(edl);
  assert.deepEqual(plan.map(p => p.videoId), ['drv_abc', 'drv_def', 'foto_01']);
  assert.equal(plan[0].parrafoIdx, 4);
});

test('edlAPlan: los shots sin clip se omiten y se reportan, no se pierden en silencio', () => {
  const edl = cargar('ejemplo-b-ranking-16x9.json');
  const r = edlAPlan(edl);
  assert.equal(r.plan.length, 3);
  assert.deepEqual(r.omitidos, ['r4']);
  assert.ok(r.avisos.some(a => /r4/.test(a)));
});

test('edlAPlan: efectos de formato y transición', () => {
  const a = edlAPlan(cargar('ejemplo-a-short-9x16.json')).efectos;
  assert.equal(a.aspect, '9:16');
  assert.equal(a.transicion, 'todos');
  assert.equal(a.transicionDur, 0.35);
  assert.equal(a.transicionTipo, 'fade');
  const b = edlAPlan(cargar('ejemplo-b-ranking-16x9.json')).efectos;
  assert.equal(b.aspect, '16:9');
  assert.equal(b.transicion, 'ninguno');
  const c = cargar('ejemplo-b-ranking-16x9.json');
  c.transicion_preset = 'alternado'; c.transicion_default = { tipo: 'fade', dur: 0.4 };
  assert.equal(edlAPlan(c).efectos.transicion, 'alternado');
});

test('planFormato: 9:16 por defecto con el mismo filtro de siempre; 16:9 a 1920x1080', () => {
  const v = planFormato();
  assert.equal(v.w, 1080); assert.equal(v.h, 1920);
  assert.equal(v.escalaYRecorte, 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30');
  assert.equal(v.tamano, '1080x1920');
  const h = planFormato('16:9');
  assert.equal(h.w, 1920); assert.equal(h.h, 1080);
  assert.equal(h.tamano, '1920x1080');
  assert.throws(() => planFormato('4:3'), /aspect desconocido/);
});

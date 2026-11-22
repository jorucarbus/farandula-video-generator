// Servicio del compilado: fusión de historias en un job, validaciones, puentes y rótulos por historia.
// Sin Express, sin Drive y con un almacén de jobs en memoria (no toca jobs.json).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { fusionarHistorias, overlaysDeCompilado, idsDePuentes } = require('../edl/compilado');
const { cargarJobs, proponerPuentes, crearCompilado } = require('../edl/compiladoServicio');
const { resolverFuente } = require('../overlay/renderPng');

let hayFuente = true; try { resolverFuente(); } catch { hayFuente = false; }
const sinFuente = { skip: hayFuente ? false : 'no hay tipografía en el sistema' };

const frag = (texto, famoso) => ({ texto, famoso, caracteres: texto.length, porcentaje: 50 });
const jobA = () => ({ jobId: 'A', titulo: 'El acuerdo de Shakira', script: 'Shakira cerró un acuerdo con Piqué. Nadie lo vio venir.', canalId: 'canal1', carpetas: ['Shakira', 'Pique'], protagonista: 'Shakira', tono: 'neutral',
  fragments: [frag('Shakira cerró un acuerdo con Piqué.', 'Shakira'), frag('Nadie lo vio venir.', 'Pique')] });
const jobB = () => ({ jobId: 'B', titulo: 'La gala de Miami', script: 'La gala de Miami terminó con un beso inesperado.', canalId: 'canal1', carpetas: ['Shakira', 'Pique'], protagonista: 'Presentador',
  fragments: [frag('La gala de Miami terminó con un beso inesperado.', 'Presentador')] });
const puentes = [{ id: 'intro', texto: 'Hoy hay dos historias que dan de qué hablar.' }, { id: 'p1', texto: 'Cambiamos de escenario, aunque el chisme sigue.' }, { id: 'cierre', texto: 'Eso fue todo por hoy.' }];

const almacen = (...jobs) => {
  const m = new Map(jobs.map(j => [j.jobId, j]));
  const creados = [];
  return { obtenerJob: id => m.get(id), crearJob: d => { const j = { jobId: `nuevo${creados.length + 1}`, ...d }; creados.push(j); return j; }, creados };
};

test('fusionarHistorias: guion y fragmentos en orden (intro, historia 1, puente, historia 2, cierre) con marcas', () => {
  const r = fusionarHistorias([jobA(), jobB()], puentes);
  assert.deepEqual(r.fragments.map(f => f.puente || `h${f.historia}`), ['intro', 'h1', 'h1', 'p1', 'h2', 'cierre']);
  assert.equal(r.fragments.filter(f => f.inicioHistoria).length, 2);
  assert.equal(r.fragments[1].tituloHistoria, 'El acuerdo de Shakira');
  assert.equal(r.fragments[4].tituloHistoria, 'La gala de Miami');
  // los puentes toman el famoso de la historia que viene; el cierre, el de la última
  assert.equal(r.fragments[0].famoso, 'Shakira');
  assert.equal(r.fragments[3].famoso, 'Presentador');
  assert.equal(r.fragments[5].famoso, 'Presentador');
  assert.ok(r.fragments.every(f => f.famoso && f.caracteres > 0));
  assert.ok(Math.abs(r.fragments.reduce((t, f) => t + f.porcentaje, 0) - 100) < 0.5);
  assert.match(r.script, /Hoy hay dos historias[\s\S]*Shakira cerró un acuerdo[\s\S]*Cambiamos de escenario[\s\S]*La gala de Miami[\s\S]*Eso fue todo/);
  assert.equal(r.compilado.aspect, '16:9');
  assert.deepEqual(r.compilado.historias.map(h => h.jobId), ['A', 'B']);
});

test('fusionarHistorias: no muta los jobs y valida historias, puentes y famosos', () => {
  const a = jobA(); const copia = JSON.stringify(a);
  fusionarHistorias([a, jobB()], puentes);
  assert.equal(JSON.stringify(a), copia);
  assert.throws(() => fusionarHistorias([jobA()], puentes), /al menos 2/);
  assert.throws(() => fusionarHistorias([jobA(), jobB(), jobA(), jobB(), jobA()], puentes), /hasta 4/);
  assert.throws(() => fusionarHistorias([jobA(), jobB()], puentes.slice(0, 2)), /faltan textos de puente: cierre/);
  const sinFamoso = jobB(); sinFamoso.fragments[0].famoso = '';
  assert.throws(() => fusionarHistorias([jobA(), sinFamoso], puentes), /sin famoso asignado/);
  const sinGuion = jobB(); delete sinGuion.script;
  assert.throws(() => fusionarHistorias([jobA(), sinGuion], puentes), /no tiene guion y fragmentos/);
});

test('cargarJobs: límites, repetidos, inexistentes, compilados y jobs sin guion', () => {
  const s = almacen(jobA(), jobB(), { jobId: 'C', titulo: 'Sin guion' }, { jobId: 'D', titulo: 'Ya compilado', script: 'x', fragments: [{}], compilado: {} });
  const err = (ids, re, status) => assert.throws(() => cargarJobs(ids, s.obtenerJob), e => re.test(e.message) && (!status || e.status === status));
  err(['A'], /entre 2 y 4/);
  err(['A', 'A'], /repetidas/);
  err(['A', 'Z'], /No existe/, 404);
  err(['A', 'C'], /todavía no tiene guion/);
  err(['A', 'D'], /compilar un compilado/);
  assert.equal(cargarJobs(['A', 'B'], s.obtenerJob).length, 2);
});

test('crearCompilado: un job nuevo en el paso de asignación, con lo que la interfaz necesita para retomarlo', () => {
  const s = almacen(jobA(), jobB());
  const r = crearCompilado({ jobIds: ['A', 'B'], puentes }, s);
  assert.equal(r.jobId, 'nuevo1');
  assert.deepEqual(r.avisos, []);
  const j = s.creados[0];
  assert.equal(j.paso, 'fragmentacion');
  assert.equal(j.canalId, 'canal1');
  assert.deepEqual(j.carpetas, ['Shakira', 'Pique']);
  assert.ok(j.script && j.fragments.length === 6 && j.compilado && j.palabras > 10);
  assert.match(j.titulo, /^Compilado: El acuerdo de Shakira \| La gala de Miami/);
});

test('crearCompilado: un puente editado a mano con un dato nuevo NO se bloquea, pero avisa', () => {
  const s = almacen(jobA(), jobB());
  const editados = puentes.map(p => p.id === 'p1' ? { ...p, texto: 'Mientras tanto, Karol G opinó que fueron 90 millones.' } : p);
  const r = crearCompilado({ jobIds: ['A', 'B'], puentes: editados }, s);
  assert.ok(r.jobId);
  assert.equal(r.avisos.length, 1);
  assert.match(r.avisos[0], /p1/); assert.match(r.avisos[0], /Karol/); assert.match(r.avisos[0], /90/);
});

test('proponerPuentes: devuelve las historias y los puentes del modelo (falso)', async () => {
  const s = almacen(jobA(), jobB());
  const llamar = async () => ({ puentes });
  const r = await proponerPuentes({ jobIds: ['A', 'B'] }, { obtenerJob: s.obtenerJob, llamar });
  assert.equal(r.origen, 'llm');
  assert.deepEqual(r.historias.map(h => h.jobId), ['A', 'B']);
  assert.deepEqual(r.puentes.map(p => p.id), idsDePuentes(2));
});

test('overlaysDeCompilado: un rótulo (número + título) al empezar cada historia, dentro de su tramo', async () => {
  const { fragments } = fusionarHistorias([jobA(), jobB()], puentes);
  const tiempos = [3, 4, 3, 3, 5, 2]; // intro, h1, h1, p1, h2, cierre
  const dibujados = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rot-'));
  try {
    const r = await overlaysDeCompilado({ fragments, tiempos, aspect: '16:9', dirTemp: dir, renderizar: async o => { dibujados.push(`${o.estilo}:${o.texto}:${o.w}x${o.h}`); } });
    assert.deepEqual(dibujados, ['numero:#1:1920x1080', 'lowerthird:El acuerdo de Shakira:1920x1080', 'numero:#2:1920x1080', 'lowerthird:La gala de Miami:1920x1080']);
    assert.equal(r.overlays.length, 4);
    // historia 1 empieza en 3 s (tras la intro); historia 2 en 13 s (3+4+3+3)
    assert.ok(Math.abs(r.overlays[0].t0 - 3.1) < 1e-9 && r.overlays[0].t1 <= 6.2 + 1e-9);
    assert.ok(Math.abs(r.overlays[2].t0 - 13.1) < 1e-9 && r.overlays[2].t1 <= 16.2 + 1e-9);
    assert.ok(r.overlays[0].t1 <= r.overlays[2].t0, 'no se pisan');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('overlaysDeCompilado: una historia demasiado corta se omite con aviso y un PNG roto no lanza', async () => {
  const { fragments } = fusionarHistorias([jobA(), jobB()], puentes);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rot-'));
  try {
    const corta = await overlaysDeCompilado({ fragments, tiempos: [3, 0.05, 0.05, 0.05, 5, 2], dirTemp: dir, renderizar: async () => {} });
    assert.ok(corta.avisos.some(a => /historia 1: demasiado corta/.test(a)));
    const roto = await overlaysDeCompilado({ fragments, tiempos: [3, 4, 3, 3, 5, 2], dirTemp: dir, renderizar: async () => { throw new Error('sin fuente'); } });
    assert.equal(roto.overlays.length, 0);
    assert.ok(roto.avisos.length >= 2);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('overlaysDeCompilado con tipografía real: los PNG existen', sinFuente, async () => {
  const { fragments } = fusionarHistorias([jobA(), jobB()], puentes);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rot-'));
  try {
    const r = await overlaysDeCompilado({ fragments, tiempos: [3, 4, 3, 3, 5, 2], dirTemp: dir });
    assert.equal(r.overlays.length, 4);
    assert.ok(r.overlays.every(o => fs.existsSync(o.path) && fs.statSync(o.path).size > 500));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// Capa 1 (pura, sin red): el validador de la EDL. No importa seleccion, jobStore ni driveCache.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { validarEdl } = require('../edl/edlValidator');

const cargar = nombre => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'edl', nombre), 'utf8'));
const A = () => cargar('ejemplo-a-short-9x16.json');
const B = () => cargar('ejemplo-b-ranking-16x9.json');
const reglas = r => r.errores.map(e => e.regla);

test('los dos ejemplos de la nota 12 validan sin errores', () => {
  assert.deepEqual(validarEdl(A()).errores, []);
  assert.deepEqual(validarEdl(B()).errores, []);
});

test('V2: un clip de 3.0 s + xfade de 0.35 s falla', () => {
  const edl = A();
  edl.audio.duracion_s = 10.0;
  edl.shots[0].clip.duracion = 3.0;
  edl.shots[0].duracion = 3.0;
  edl.shots[2].duracion = 4.6; // la suma sigue igualando al audio
  const r = validarEdl(edl);
  assert.ok(r.errores.some(e => e.regla === 'V2' && e.shot === 's1'), JSON.stringify(r.errores));
});

test('V2: con corte (sin transición) el clip de 3.0 s completo es válido', () => {
  const edl = B();
  assert.deepEqual(validarEdl(edl).errores, []);
  edl.transicion_default = { tipo: 'fade', dur: 0.35 };
  const r = validarEdl(edl);
  assert.ok(r.errores.some(e => e.regla === 'V2'), 'con fade los clips de 3.0 s deben fallar');
});

test('V2: el último shot no lleva padding (no hay siguiente corte)', () => {
  const edl = A();
  edl.shots = [edl.shots[0], { ...edl.shots[1], clip: { ...edl.shots[1].clip, duracion: 3.0 }, duracion: 3.0 }];
  edl.shots[0].duracion = 3.0 - 0.0; edl.shots[0].clip.duracion = 2.6;
  edl.audio.duracion_s = edl.shots[0].duracion + edl.shots[1].duracion;
  const r = validarEdl(edl);
  assert.ok(!r.errores.some(e => e.regla === 'V2'), JSON.stringify(r.errores));
});

test('V2: con transicion_preset "alternado" solo los cortes activos suman padding (misma función del render)', () => {
  const edl = B();
  edl.transicion_default = { tipo: 'fade', dur: 0.35 };
  edl.transicion_preset = 'alternado';
  const r = validarEdl(edl);
  const fallan = r.errores.filter(e => e.regla === 'V2').map(e => e.shot);
  // alternado: activo en k par (0, 2) -> r1 y r3 fallan; r2 (k=1) no; r4 no es de tercero
  assert.deepEqual(fallan, ['r1', 'r3']);
});

test('V2: fuente.tipo ausente se trata como tercero (fail-closed)', () => {
  const edl = B();
  edl.transicion_default = { tipo: 'fade', dur: 0.35 };
  delete edl.shots[0].fuente;
  const r = validarEdl(edl);
  assert.ok(r.errores.some(e => e.regla === 'V2' && e.shot === 'r1'));
  assert.ok(r.errores.some(e => e.regla === 'V6' && e.shot === 'r1'), 'y exige atribución completa');
});

test('V2 no aplica a lo propio ni a imágenes de terceros (decisión del usuario)', () => {
  const edl = A();
  // video propio de 5 s con transición: sin límite
  edl.shots[0].fuente = { tipo: 'propio', licencia: 'propio' };
  edl.shots[0].clip.duracion = 5.0;
  edl.shots[0].duracion = 5.0;
  // foto de un tercero larga, con movimiento: sin tope
  edl.shots[2].fuente = { tipo: 'tercero', licencia: 'uso_legitimo_cita', autor: 'Medio', url: 'https://ejemplo.test/f' };
  edl.shots[2].duracion = 2.6;
  edl.shots[1].duracion = 2.0; edl.shots[1].clip.duracion = 2.0;
  edl.audio.duracion_s = 9.6;
  const r = validarEdl(edl);
  assert.ok(!r.errores.some(e => e.regla === 'V2'), JSON.stringify(r.errores));
});

test('V3: un clip de video por debajo de 0.7 s falla', () => {
  const edl = B();
  edl.shots[1].clip.duracion = 0.5;
  assert.ok(validarEdl(edl).errores.some(e => e.regla === 'V3' && e.shot === 'r2'));
});

test('V4: la suma de shots debe igualar al audio', () => {
  const edl = A();
  edl.audio.duracion_s = 12;
  assert.ok(reglas(validarEdl(edl)).includes('V4'));
});

test('V5: la resolución debe coincidir con el aspect', () => {
  const edl = A();
  edl.resolucion = { w: 1920, h: 1080 };
  assert.ok(reglas(validarEdl(edl)).includes('V5'));
});

test('V6: una fuente de tercero sin url falla', () => {
  const edl = A();
  delete edl.shots[0].fuente.url;
  assert.ok(validarEdl(edl).errores.some(e => e.regla === 'V6' && e.shot === 's1'));
});

test('V7: un rumor sin atribución falla', () => {
  const edl = A();
  edl.shots[2].certeza = { nivel: 'rumor' };
  assert.ok(validarEdl(edl).errores.some(e => e.regla === 'V7' && /atribucion/.test(e.mensaje)));
});

test('V7: un rumor sin sello visible falla; con elemento sello pasa', () => {
  const edl = A();
  edl.shots[2].recipe = 'clip_kenburns';
  assert.ok(validarEdl(edl).errores.some(e => e.regla === 'V7' && /sello/.test(e.mensaje)));
  edl.shots[2].elementos = [{ tipo: 'sello', t0: 0, t1: 5, texto: 'RUMOR' }];
  assert.ok(!validarEdl(edl).errores.some(e => e.regla === 'V7'));
});

test('V7: un rumor no puede ser el gancho', () => {
  const edl = A();
  edl.shots[0].certeza = { nivel: 'rumor', atribucion: 'circula en redes' };
  edl.shots[0].elementos = [{ tipo: 'sello', t0: 0, t1: 2, texto: 'RUMOR' }];
  assert.ok(validarEdl(edl).errores.some(e => e.regla === 'V7' && /gancho/.test(e.mensaje)));
});

test('V1: propiedades desconocidas y campos faltantes se rechazan', () => {
  const edl = A();
  edl.shots[0].ffmpeg = '-vf scale=1:1';
  assert.ok(reglas(validarEdl(edl)).includes('V1'));
  const sinAudio = A(); delete sinAudio.audio;
  assert.ok(reglas(validarEdl(sinAudio)).includes('V1'));
});

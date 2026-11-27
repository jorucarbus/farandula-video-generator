const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const S = require('../edl/subirFamosos');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'subir-')); test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const vid = (n, t = 'x') => { const f = path.join(tmp, n); fs.writeFileSync(f, t); return f; };
const falso = (mapa, enCarpeta = {}) => { const calls = { crear: [], subir: [] }; return { calls, obtenerCarpetasFamosos: async () => ({ ...mapa }), crearCarpetaFamoso: async n => { calls.crear.push(n); return 'NUEVA-' + n; }, listarVideos: async id => (enCarpeta[id] || []).map(name => ({ name })), subirVideo: async (r, n, id, mime) => { calls.subir.push({ n, id, mime }); return { id: 'f' + calls.subir.length }; } }; };

test('buscarExistente: reconoce la carpeta aunque cambien guiones, mayúsculas o tildes; ambigua → error; no existe → null', () => {
  const mapa = { Conny_Garces: 'A', Mara_Topic: 'B' };
  assert.equal(S.buscarExistente('conny garcés', mapa).id, 'A'); assert.equal(S.buscarExistente('Mara-Topic', mapa).nombre, 'Mara_Topic');
  assert.equal(S.buscarExistente('Pedro_Gomez', mapa), null);
  assert.throws(() => S.buscarExistente('Conny Garces', { Conny_Garces: 'A', 'Conny Garcés': 'B' }), /se parecen/);
});

test('actualización: sube a la carpeta existente y no repite lo que ya está en Drive', async () => {
  const a = vid('20260101_1_a.mp4'), b = vid('20260102_2_b.mp4'), d = falso({ Conny_Garces: 'ID1' }, { ID1: ['20260101_1_a.mp4'] }), reg = {};
  const r = await S.subirAFamosos({ carpeta: 'Conny Garces', rutas: [a, b], drive: d, registro: { leer: () => reg, anotar: (k, v) => { reg[k] = v; } } });
  assert.equal(r.nueva, false); assert.equal(r.carpeta, 'Conny_Garces'); assert.deepEqual(d.calls.crear, []);
  assert.deepEqual(d.calls.subir.map(x => [x.n, x.id, x.mime]), [['20260102_2_b.mp4', 'ID1', 'video/mp4']]); assert.deepEqual(r.saltados, ['20260101_1_a.mp4']);
  assert.ok(reg[b] && reg[b].carpetaId === 'ID1');
  const otra = await S.subirAFamosos({ carpeta: 'Conny_Garces', rutas: [b], drive: falso({ Conny_Garces: 'ID1' }), registro: { leer: () => reg, anotar() {} } });
  assert.equal(otra.subidos.length, 0, 'el registro local evita subirlo dos veces aunque Drive no lo liste todavía');
});

test('artista nuevo: crea la carpeta con el nombre normalizado y sube todo', async () => {
  const a = vid('x1.mp4'), b = vid('x2.mov'), d = falso({ Mara_Topic: 'B' });
  const r = await S.subirAFamosos({ carpeta: ' Pedro   Gómez ', rutas: [a, b], drive: d });
  assert.equal(r.nueva, true); assert.deepEqual(d.calls.crear, ['Pedro_Gomez'], 'sin tildes ni espacios');
  assert.deepEqual(d.calls.subir.map(x => [x.id, x.mime]), [['NUEVA-Pedro_Gomez', 'video/mp4'], ['NUEVA-Pedro_Gomez', 'video/quicktime']]);
});

test('errores: nombre inválido, archivo que no es video o no existe; un fallo no detiene a los demás; borrarLocal solo borra lo subido', async () => {
  await assert.rejects(() => S.subirAFamosos({ carpeta: '../x', rutas: [], drive: falso({}) }), /inválido/);
  const ok = vid('ok.mp4'), txt = vid('nota.txt'), nada = path.join(tmp, 'nada.mp4'), d = falso({ Ab: '1' });
  const r = await S.subirAFamosos({ carpeta: 'Ab', rutas: [txt, nada, ok], drive: d, borrarLocal: true });
  assert.equal(r.subidos.length, 1); assert.equal(r.fallos.length, 2); assert.ok(!fs.existsSync(ok), 'lo subido se borra del Selector si se pidió'); assert.ok(fs.existsSync(txt), 'lo que falló no se toca');
  const d2 = falso({ Ab: '1' }); d2.subirVideo = async () => { throw new Error('cuota'); }; const f2 = vid('f2.mp4');
  const r2 = await S.subirAFamosos({ carpeta: 'Ab', rutas: [f2], drive: d2, borrarLocal: true }); assert.equal(r2.fallos[0].error, 'cuota'); assert.ok(fs.existsSync(f2), 'si la subida falla, el archivo se conserva');
});

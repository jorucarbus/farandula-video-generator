const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'respaldo-test-'));
process.env.DATA_MOTOR_DIR = path.join(tmp, 'dm'); process.env.RESPALDO_DRIVE = '0';
const R = require('../edl/respaldoIndice');
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('escribirSeguro: no deja archivos a medias y guarda la versión anterior', () => {
  const f = path.join(tmp, 'a', 'x.json');
  R.escribirSeguro(f, { v: 1 }); R.escribirSeguro(f, { v: 2 });
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(f, 'utf8')), { v: 2 });
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(f + '.bak', 'utf8')), { v: 1 });
  assert.deepStrictEqual(fs.readdirSync(path.dirname(f)).filter(n => n.endsWith('.tmp')), []);
});

test('fusionar etiquetas: la unión de las dos versiones; la editada a mano más reciente gana; si no, la local', () => {
  const local = { a: { tipo: 'baile' }, b: { tipo: 'otro', editado: '2026-11-25T10:00:00Z' }, c: { tipo: 'local' } };
  const remoto = { b: { tipo: 'desfile', editado: '2026-11-25T12:00:00Z' }, c: { tipo: 'remoto' }, d: { tipo: 'nuevo' } };
  const f = R.fusionar(local, remoto);
  assert.deepStrictEqual(Object.keys(f).sort(), ['a', 'b', 'c', 'd']);
  assert.strictEqual(f.b.tipo, 'desfile'); assert.strictEqual(f.c.tipo, 'local'); assert.strictEqual(f.d.tipo, 'nuevo');
  assert.strictEqual(R.fusionar({ b: { tipo: 'mio', editado: '2026-11-26T00:00:00Z' } }, remoto).b.tipo, 'mio');
});

test('fusionar la lista de clips: unión por id, sin duplicar', () => {
  const f = R.fusionar([{ id: '1', name: 'a' }, { id: '2', name: 'b' }], [{ id: '2', name: 'viejo' }, { id: '3', name: 'c' }]);
  assert.deepStrictEqual(f.map(x => x.id).sort(), ['1', '2', '3']); assert.strictEqual(f.find(x => x.id === '2').name, 'b');
});

test('normalizarRutas: las rutas de otro equipo pasan a las de este; lo importado del Selector no se toca', () => {
  const f = R.rutaLocal('Zeta', 'clips');
  R.escribirSeguro(f, [{ id: 'abc', ruta: 'C:\\otra\\pc\\src_abc.mp4' }, { id: 'loc_1', ruta: 'D:\\x\\loc.mp4' }]);
  assert.strictEqual(R.normalizarRutas('Zeta'), 1);
  const c = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.strictEqual(c[0].ruta, path.join(R.BIB, 'Zeta', 'src_abc.mp4')); assert.strictEqual(c[1].ruta, 'D:\\x\\loc.mp4');
});

test('con RESPALDO_DRIVE=0 nada toca Drive', async () => {
  assert.deepStrictEqual(await R.respaldarCarpeta('Zeta'), { subidos: 0, traidos: 0 });
  assert.deepStrictEqual(await R.respaldarTodas(), { carpetas: 0, subidos: 0, traidos: 0 });
  assert.deepStrictEqual(await R.restaurarFaltantes(), []);
  await assert.rejects(R.respaldarCarpeta('../x'), /inválida/);
});

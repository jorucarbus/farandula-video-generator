const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clipsdrive-test-'));
process.env.DATA_MOTOR_DIR = path.join(tmp, 'dm');
const C = require('../edl/clipsDrive');
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const poner = (f, txt = 'x') => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, txt); return f; };
const viejo = (f, horas) => { const t = new Date(Date.now() - horas * 3600e3); fs.utimesSync(f, t, t); };

test('asegurar: baja solo lo que falta, marca como usado lo que ya está y no inventa clips locales', async () => {
  const bajados = [];
  const drive = { descargarVideo: async (id, dir) => { bajados.push(id); return poner(path.join(dir, `src_${id}.mp4`), 'video'); } };
  poner(C.rutaClip('Ana', 'ya')); viejo(C.rutaClip('Ana', 'ya'), 100);
  const r = await C.asegurar('Ana', ['ya', 'nuevo', 'nuevo', 'loc_1'], { drive });
  assert.deepStrictEqual(bajados, ['nuevo']); assert.strictEqual(r.bajados, 1);
  assert.ok(r.rutas.ya && r.rutas.nuevo); assert.strictEqual(r.fallos.length, 1); assert.match(r.fallos[0].error, /no es de Drive/);
  assert.ok(Date.now() - fs.statSync(C.rutaClip('Ana', 'ya')).mtimeMs < 5000, 'usar un clip reinicia su reloj de 48 h');
  await assert.rejects(C.asegurar('../x', ['a'], { drive }), /inválida/);
});

test('limpiarCaducados: borra los viejos de Drive, respeta los recientes, los recurrentes y los importados del Selector', () => {
  const a = poner(C.rutaClip('Bea', 'viejo')), b = poner(C.rutaClip('Bea', 'reciente')), c = poner(path.join(C.BIB, 'Bea', 'src_loc_importado.mp4')), d = poner(C.rutaClip('Cami', 'viejo'));
  viejo(a, 100); viejo(c, 500); viejo(d, 100);
  C.marcarRecurrente('Cami', true);
  const r = C.limpiarCaducados();
  assert.strictEqual(r.borrados, 1);
  assert.ok(!fs.existsSync(a)); assert.ok(fs.existsSync(b)); assert.ok(fs.existsSync(c), 'lo importado del Selector no se toca'); assert.ok(fs.existsSync(d), 'carpeta recurrente se queda');
  assert.deepStrictEqual(C.recurrentes(), ['Cami']);
  C.marcarRecurrente('Cami', false); assert.deepStrictEqual(C.recurrentes(), []);
});

test('purgar: libera los videos de Drive y deja el índice y lo importado', () => {
  poner(path.join(C.BIB, 'Dora.clips.json'), '[]'); poner(C.rutaClip('Dora', 'a'), 'aaaa'); poner(C.rutaClip('Dora', 'b'), 'bb'); poner(path.join(C.BIB, 'Dora', 'src_loc_z.mp4'));
  const r = C.purgar('Dora');
  assert.deepStrictEqual([r.borrados, r.bytes], [2, 6]);
  assert.ok(fs.existsSync(path.join(C.BIB, 'Dora.clips.json'))); assert.ok(fs.existsSync(path.join(C.BIB, 'Dora', 'src_loc_z.mp4')));
  assert.throws(() => C.purgar('../x'), /inválida/);
});

test('uso: cuenta videos y bytes de Drive por carpeta', () => {
  poner(C.rutaClip('Eva', '1'), '1234'); poner(C.rutaClip('Eva', '2'), '12');
  const u = C.uso().find(x => x.carpeta === 'Eva'); assert.deepStrictEqual([u.videos, u.bytes], [2, 6]);
});

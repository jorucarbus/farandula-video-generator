const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const M = require('../motorServicio');

test('despachador: motor edl va al nuevo, lo demás al legado', async () => {
  const d = M.despachador(() => 'legado', () => 'motor');
  assert.strictEqual(d({ motor: 'edl' }, 'x'), 'motor');
  assert.strictEqual(d({}, 'x'), 'legado');
  assert.strictEqual(d(undefined, 'x'), 'legado');
});

test('argumentosDe: link o texto, y falla sin noticia', () => {
  const a = M.argumentosDe({ link: 'https://x.com/n', canal: 'C', carpetaClips: 'Mara' }, 'n1', 'out.mp4');
  assert.ok(a.includes('https://x.com/n') && a.includes('--carpeta') && a.includes('Mara') && a.includes('out.mp4'));
  assert.ok(M.argumentosDe({ texto: 'hola', carpetaClips: 'Mara' }, 'n', 's').includes('--texto'));
  assert.throws(() => M.argumentosDe({ carpetaClips: 'Mara' }, 'n', 's'));
});

test('ejecutor: traduce la salida del script en avance, guarda y devuelve el resultado', async () => {
  const DM = path.join(__dirname, '..', 'data-motor');
  const nombre = 'prueba-servicio-motor';
  fs.mkdirSync(path.join(DM, 'noticias', nombre), { recursive: true });
  fs.writeFileSync(path.join(DM, 'noticias', nombre, 'guion.json'), JSON.stringify({ titulo: 'Título de prueba', descripcion: 'Desc', hashtags: ['#a'], script: 'texto', palabras: 1 }));
  const salida = path.join(DM, 'renders', `${nombre}.mp4`);
  fs.mkdirSync(path.dirname(salida), { recursive: true }); fs.writeFileSync(salida, 'x');
  const avances = []; const registros = []; const subidas = [];
  const spawnFalso = () => {
    const h = new EventEmitter(); h.stdout = new EventEmitter(); h.stderr = new EventEmitter();
    setImmediate(() => { h.stdout.emit('data', 'Leyendo la fuente…\nGuion: 190 palabras\nLISTO x (3 s)\n'); h.emit('close', 0); });
    return h;
  };
  const ej = M.crearEjecutor({
    colaRender: { reportar: (id, p, e) => avances.push([p, e]), contexto: () => {} },
    driveHelper: { nombreCarpeta: async () => 'Canal', subirVideo: async (f, n, d) => { subidas.push(n); return { webViewLink: 'link', id: 'i' }; } },
    sheets: { registrarVideo: async f => registros.push(f) },
    video: { obtenerDuracion: async () => 66.5 },
    spawnFn: spawnFalso, log: { warn() {} },
  });
  try {
    const r = await ej({ motor: 'edl', link: 'https://x.com/n', carpetaClips: 'Mara', destFolder: 'D1', nombre }, 'r1');
    assert.strictEqual(r.status, 'success');
    assert.strictEqual(r.duration, 66.5);
    assert.strictEqual(r.driveLink, 'link');
    assert.ok(/Titulo de prueba\.mp4$/.test(r.fileName));
    assert.strictEqual(registros.length, 1);
    assert.strictEqual(registros[0].linkFuente, 'https://x.com/n');
    assert.deepStrictEqual(avances.map(a => a[0]).filter(p => [5, 42, 84].includes(p)), [5, 42, 84]);
  } finally {
    fs.rmSync(path.join(DM, 'noticias', nombre), { recursive: true, force: true }); fs.rmSync(salida, { force: true });
  }
});

test('ejecutor: si el script falla, lanza con el motivo', async () => {
  const spawnFalso = () => {
    const h = new EventEmitter(); h.stdout = new EventEmitter(); h.stderr = new EventEmitter();
    setImmediate(() => { h.stderr.emit('data', 'FALLO sin clips\n'); h.emit('close', 1); });
    return h;
  };
  const ej = M.crearEjecutor({ colaRender: { reportar() {}, contexto() {} }, driveHelper: {}, sheets: {}, video: {}, spawnFn: spawnFalso });
  await assert.rejects(ej({ motor: 'edl', link: 'https://x.com/n', carpetaClips: 'Mara' }, 'r2'), /código 1.*FALLO sin clips/);
});

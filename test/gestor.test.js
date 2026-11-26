const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// El gestor lee sus rutas del entorno al cargarse: se apunta a una carpeta temporal ANTES de requerirlo.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gestor-test-'));
process.env.DATA_MOTOR_DIR = path.join(tmp, 'dm'); process.env.SELECTOR_DIR = path.join(tmp, 'sel');
const G = require('../gestor/biblioteca');
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const poner = (f, txt = 'x') => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, txt); return f; };
const desc = path.join(tmp, 'sel', 'Descargas');

test('rutaPermitida: solo dentro de biblioteca, descargas del Selector o papelera', () => {
  assert.strictEqual(G.rutaPermitida(path.join(G.BIB, 'A', 'x.mp4')), true);
  assert.strictEqual(G.rutaPermitida(path.join(desc, '@u', 'x.mp4')), true);
  assert.strictEqual(G.rutaPermitida(path.join(G.BIB, '..', '..', 'fuera.mp4')), false);
  assert.strictEqual(G.rutaPermitida('C:/Windows/notepad.exe'), false);
  assert.strictEqual(G.rutaPermitida(G.BIB), false); // la carpeta misma no cuenta
  assert.strictEqual(G.rutaPermitida(''), false);
});

test('fechaDeArchivo: prefijo AAAAMMDD del Selector', () => {
  assert.strictEqual(G.fechaDeArchivo('20260315_7001_titulo.mp4'), '2026-03-15');
  assert.strictEqual(G.fechaDeArchivo('sin_fecha.mp4'), null);
});

test('importar desde el Selector: copia a la biblioteca, registra el clip y no duplica', () => {
  const a = poner(path.join(desc, '@u', '20260310_1_a.mp4')), b = poner(path.join(desc, 'Instagram', '@v', '20260311_2_b.mp4'));
  assert.deepStrictEqual(G.carpetasSelector().map(c => c.nombre).sort(), ['@u', 'Instagram/@v']);
  const r = G.importarDeSelector([a, b], 'Mara_Prueba');
  assert.strictEqual(r.hechos.length, 2); assert.strictEqual(r.fallos.length, 0);
  assert.ok(fs.existsSync(a), 'el original sigue en el Selector (copia, no mueve)');
  const clips = G.clipsDeBiblioteca('Mara_Prueba'); assert.strictEqual(clips.length, 2); assert.ok(clips.every(c => c.existe && c.fecha));
  assert.strictEqual(G.importarDeSelector([a], 'Mara_Prueba').fallos[0].error, 'ya está importado');
  assert.throws(() => G.importarDeSelector([a], '../x'), /inválido/);
  assert.match(G.importarDeSelector([path.join(tmp, 'otra.mp4')], 'Mara_Prueba').fallos[0].error, /fuera/);
});

test('papelera: mueve (no borra), rechaza rutas ajenas y restaura', () => {
  const clips = G.clipsDeBiblioteca('Mara_Prueba'), ruta = clips[0].ruta;
  const r = G.aPapelera([ruta, path.join(tmp, 'ajeno.mp4')]);
  assert.strictEqual(r.hechos.length, 1); assert.strictEqual(r.fallos.length, 1);
  assert.ok(!fs.existsSync(ruta)); assert.ok(fs.existsSync(r.hechos[0].papelera));
  assert.strictEqual(G.enPapelera().length, 1);
  assert.strictEqual(G.clipsDeBiblioteca('Mara_Prueba').find(c => c.ruta === ruta).existe, false);
  assert.strictEqual(G.limpiarFaltantes('Mara_Prueba').quitados, 1);
  assert.ok(fs.existsSync(path.join(G.BIB, 'Mara_Prueba.clips.json.bak')), 'deja copia del json anterior');
  const rs = G.restaurar([r.hechos[0].papelera]); assert.strictEqual(rs.hechos.length, 1); assert.ok(fs.existsSync(ruta));
  assert.strictEqual(G.enPapelera().length, 0);
});

test('resumen: cuenta clips, medidos y malos por carpeta', () => {
  const clips = JSON.parse(fs.readFileSync(path.join(G.BIB, 'Mara_Prueba.clips.json'), 'utf8'));
  fs.writeFileSync(path.join(G.BIB, 'Mara_Prueba.calidad.json'), JSON.stringify({ [clips[0].id]: { puntaje: 40, apto: false, motivos: ['borroso'], avisos: [] } }));
  const r = G.resumenCarpetas().biblioteca.find(c => c.nombre === 'Mara_Prueba');
  assert.deepStrictEqual([r.clips, r.medidos, r.malos], [1, 1, 1]); // el otro clip se quitó con limpiarFaltantes
  assert.strictEqual(G.clipsDeBiblioteca('Mara_Prueba')[0].calidad.apto, false);
  assert.throws(() => G.clipsDeBiblioteca('../../etc'), /desconocida/);
});

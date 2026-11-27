const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// El gestor lee sus rutas del entorno al cargarse: se apunta a una carpeta temporal ANTES de requerirlo.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gestor-test-'));
process.env.RESPALDO_DRIVE = '0'; process.env.DATA_MOTOR_DIR = path.join(tmp, 'dm'); process.env.SELECTOR_DIR = path.join(tmp, 'sel');
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

test('limpiarFaltantes: solo quita lo que no se puede recuperar; lo que está en Drive se queda aunque falte el archivo', () => {
  const f = path.join(G.BIB, 'Solo_Drive.clips.json');
  fs.mkdirSync(G.BIB, { recursive: true });
  fs.writeFileSync(f, JSON.stringify([{ id: '1AbCdriveId', name: 'a.mp4', ruta: path.join(G.BIB, 'Solo_Drive', 'src_1AbCdriveId.mp4') }, { id: 'loc_zzz', name: 'b.mp4', ruta: path.join(G.BIB, 'Solo_Drive', 'src_loc_zzz.mp4') }]));
  assert.strictEqual(G.limpiarFaltantes('Solo_Drive').quitados, 1);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(f, 'utf8')).map(c => c.id), ['1AbCdriveId']);
});

test('rerender: arma la cola (render aparte → reemplazo → subida opcional) y rechaza videos sin guion/voz guardados', async () => {
  const http = require('http'), S = require('../gestor/servidor'), DM = G.DM;
  const n = 'zz-rerender-' + process.pid, poner2 = (f, t = 'x') => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
  poner2(path.join(DM, 'renders', n + '.mp4')); poner2(path.join(DM, 'renders', 'sin-datos.mp4'));
  poner2(path.join(DM, 'noticias', n, 'guion.json'), JSON.stringify({ canal: 'Embajadores del Chisme', titulo: 'T' })); poner2(path.join(DM, 'noticias', n, 'lectura.json'), '{}'); poner2(path.join(DM, 'noticias', n, 'palabras.json'), '{}');
  poner2(path.join(DM, 'noticias', n, 'render.json'), JSON.stringify({ carpeta: 'Mara_Topic' }));
  const srv = http.createServer(S.app).listen(0), puerto = srv.address().port, llamar = async (cuerpo) => { const r = await fetch(`http://127.0.0.1:${puerto}/api/rerender`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) }); return { st: r.status, j: await r.json() }; };
  try {
    const a = await llamar({ nombre: n + '.mp4', subir: false }); assert.strictEqual(a.st, 200); assert.strictEqual(a.j.carpeta, 'Mara_Topic');
    const t = S.trabajos.find(x => x.id === a.j.id); assert.deepStrictEqual(t.pasos.map(p => path.basename(p.args[0])), ['noticia-a-video.js', 'reemplazar-render.js']);
    assert.ok(t.pasos[0].args.includes(path.join(DM, 'renders', n + '.rerender.mp4')), 'renderiza a un archivo aparte');
    const b = await llamar({ nombre: n }); /* por defecto SÍ sube a Drive */ const t2 = S.trabajos.find(x => x.id === b.j.id);
    assert.deepStrictEqual(t2.pasos.map(p => path.basename(p.args[0])), ['noticia-a-video.js', 'reemplazar-render.js', 'publicar-en-drive.js']); assert.ok(t2.pasos[2].args.includes('--forzar') && t2.pasos[2].opcional);
    assert.strictEqual((await llamar({ nombre: 'sin-datos.mp4' })).st, 400);
    assert.strictEqual((await llamar({ nombre: '../x' })).st, 400);
    const lista = await (await fetch(`http://127.0.0.1:${puerto}/api/renders`)).json();
    poner2(path.join(DM, 'renders', n + '.anterior.mp4')); poner2(path.join(DM, 'renders', n + '.rerender.mp4'));
    const lista2 = await (await fetch(`http://127.0.0.1:${puerto}/api/renders`)).json();
    assert.strictEqual(lista2.filter(v => v.nombre.startsWith(n)).length, 1, 'los archivos de trabajo (.anterior / .rerender) no salen como videos'); assert.ok(lista.length >= 1);
  } finally { srv.close(); S.trabajos.splice(0, S.trabajos.length); }
});

test('reemplazar-render: reemplaza solo si el nuevo existe y no está vacío; guarda el anterior y mueve la portada', () => {
  const R = require('../scripts/reemplazar-render'), d = fs.mkdtempSync(path.join(tmp, 'rr-')), w = (f, t) => fs.writeFileSync(path.join(d, f), t);
  w('v.mp4', 'viejo'); assert.throws(() => R.reemplazar('v', d), /no se generó/); assert.strictEqual(fs.readFileSync(path.join(d, 'v.mp4'), 'utf8'), 'viejo');
  w('v.rerender.mp4', 'corto'); assert.throws(() => R.reemplazar('v', d), /vacío/); assert.strictEqual(fs.readFileSync(path.join(d, 'v.mp4'), 'utf8'), 'viejo', 'un video nuevo roto no pisa al bueno');
  w('v.rerender.mp4', 'n'.repeat(60000)); w('v.rerender.portada.jpg', 'p'); w('v.portada.jpg', 'vieja');
  R.reemplazar('v', d);
  assert.strictEqual(fs.statSync(path.join(d, 'v.mp4')).size, 60000); assert.strictEqual(fs.readFileSync(path.join(d, 'v.anterior.mp4'), 'utf8'), 'viejo');
  assert.strictEqual(fs.readFileSync(path.join(d, 'v.portada.jpg'), 'utf8'), 'p'); assert.ok(!fs.existsSync(path.join(d, 'v.rerender.mp4')));
});

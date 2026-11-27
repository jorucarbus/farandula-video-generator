const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');

test('publicar-en-drive: sube video y portada a la subcarpeta del canal, con el mismo nombre base, y no repite', async () => {
  const dm = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-')); fs.mkdirSync(path.join(dm, 'renders'), { recursive: true }); fs.mkdirSync(path.join(dm, 'noticias', 'v1'), { recursive: true });
  fs.writeFileSync(path.join(dm, 'renders', 'v1.mp4'), 'x'); fs.writeFileSync(path.join(dm, 'renders', 'v1.portada.jpg'), 'y'); fs.writeFileSync(path.join(dm, 'noticias', 'v1', 'guion.json'), JSON.stringify({ titulo: 'Mara: varada / en el "Atlántico"' }));
  // el script lee DM desde su propia ruta: se redirige copiando las carpetas al lugar real no es deseable; se prueba la parte pura y el flujo con DM del repo vacío mediante nombre único
  const P = require('../scripts/publicar-en-drive');
  assert.strictEqual(P.nombreSeguro('Mara: varada / en el "Atlántico"'), 'Mara varada en el Atlántico');
  assert.strictEqual(P.normCanal('Embajadores del Chisme'), 'embajadoresdelchisme');
  const cliente = { files: { list: async () => ({ data: { files: [{ id: 'A', name: 'Chismex Picante' }, { id: 'B', name: 'Embajadores del Chisme' }] } }) } };
  assert.strictEqual((await P.carpetaDelCanal(cliente, 'embajadores del chisme')).id, 'B');
  assert.strictEqual(await P.carpetaDelCanal(cliente, 'Otro canal'), null);
});

test('publicar-en-drive: flujo completo con Drive falso', async () => {
  const RAIZ = path.join(__dirname, '..'), DM = path.join(RAIZ, 'data-motor'), nombre = 'zz-prueba-publicar-' + process.pid;
  const r = path.join(DM, 'renders'), n = path.join(DM, 'noticias', nombre); fs.mkdirSync(r, { recursive: true }); fs.mkdirSync(n, { recursive: true });
  fs.writeFileSync(path.join(r, nombre + '.mp4'), 'x'); fs.writeFileSync(path.join(r, nombre + '.portada.jpg'), 'y'); fs.writeFileSync(path.join(n, 'guion.json'), JSON.stringify({ titulo: 'Título de prueba' }));
  try {
    const P = require('../scripts/publicar-en-drive'), subidas = [];
    const cliente = { files: { list: async () => ({ data: { files: [{ id: 'CARP', name: 'La Naple' }] } }) } };
    const subir = async (ruta, nom, carp, mime) => { subidas.push({ nom, carp, mime }); return { id: 'id' + subidas.length, webViewLink: 'https://x/' + nom }; };
    const out = await P.publicar(nombre, 'La Naple', { cliente, subir, log: () => {} });
    assert.strictEqual(subidas.length, 2); assert.ok(subidas[0].nom.endsWith(' Título de prueba.mp4')); assert.strictEqual(subidas[1].nom, subidas[0].nom.replace(/\.mp4$/, '.jpg')); assert.strictEqual(subidas[0].carp, 'CARP');
    assert.strictEqual(out.carpeta, 'La Naple'); assert.ok(fs.existsSync(path.join(r, nombre + '.drive.json')));
    await P.publicar(nombre, 'La Naple', { cliente, subir, log: () => {} }); assert.strictEqual(subidas.length, 2, 'no repite');
    await assert.rejects(() => P.publicar(nombre, 'Canal Inexistente', { cliente, subir, forzar: true, log: () => {} }), /subcarpeta/);
  } finally { for (const x of [path.join(r, nombre + '.mp4'), path.join(r, nombre + '.portada.jpg'), path.join(r, nombre + '.drive.json')]) try { fs.unlinkSync(x); } catch { /* */ } fs.rmSync(n, { recursive: true, force: true }); }
});

const test = require('node:test');
const assert = require('node:assert');
const { marcarResalte, ajustarTitular, paletaDe, dibujarPortada } = require('../lienzo/portada');
const Tit = require('../edl/portadaTitular');
const Foto = require('../edl/portadaFoto');
const { createCanvas } = require('@napi-rs/canvas');

test('marcarResalte marca las palabras del resalte sin importar mayúsculas ni tildes', () => {
  const r = marcarResalte('GISELLE ROSALES DESTACA EN JAPÓN SIN CORONA', 'destaca en japon');
  assert.deepStrictEqual(r.filter(x => x.r).map(x => x.p), ['DESTACA', 'EN', 'JAPÓN']);
  assert.strictEqual(marcarResalte('UNA DOS TRES', 'cuatro').some(x => x.r), false);
  assert.strictEqual(marcarResalte('UNA DOS TRES', '').some(x => x.r), false);
});

test('ajustarTitular: respeta el máximo de líneas y el ancho', () => {
  const ctx = createCanvas(10, 10).getContext('2d');
  const pal = 'GISELLE ROSALES DESTACA EN JAPÓN SIN LLEVAR CORONA'.split(' ').map(p => ({ p, r: false }));
  const r = ajustarTitular(ctx, pal, { ancho: 900, maxLineas: 4, tamMax: 150, tamMin: 60, fuente: 'sans-serif' });
  assert.ok(r.lineas.length <= 4); assert.ok(r.tam >= 60 && r.tam <= 150);
  for (const l of r.lineas) assert.ok(l.reduce((s, x, i) => s + x.w + (i ? r.espacio : 0), 0) <= 901);
});

test('paleta por canal: cada uno de los cuatro tiene la suya y un canal desconocido usa la neutra', () => {
  for (const c of ['Chismex Picante', 'Embajadores del Chisme', 'Supe Lupe', 'La Naple']) assert.ok(paletaDe(c).logo, c);
  assert.strictEqual(paletaDe('Otro canal').logo, null);
});

test('titular: el resalte tiene que ser un tramo consecutivo del titular; si no, se corrige', () => {
  assert.strictEqual(Tit.resalteValido('Giselle destaca en Japón', 'destaca en japon'), true);
  assert.strictEqual(Tit.resalteValido('Giselle destaca en Japón', 'Japón destaca'), false);
  const ok = Tit.limpiar({ titular: '«Giselle destaca en Japón sin corona».', resalte: 'palabras que no están', etiqueta: 'polémica' });
  assert.strictEqual(ok.titular, 'Giselle destaca en Japón sin corona'); assert.strictEqual(ok.etiqueta, 'POLÉMICA'); assert.ok(Tit.resalteValido(ok.titular, ok.resalte));
  assert.strictEqual(Tit.limpiar({ titular: 'Corto' }), null); // menos de 3 palabras
  assert.strictEqual(Tit.limpiar({ titular: 'una '.repeat(15) }), null); // demasiado largo
});

test('titular: sin modelo o con el modelo caído, el respaldo por reglas devuelve algo usable', async () => {
  const r = await Tit.generar({ titulo: 'Dalia Bucaram brilla entre las 30 más bellas del mundo', llamar: async () => { throw new Error('sin red'); } });
  assert.strictEqual(r.origen, 'reglas'); assert.ok(r.titular.length > 10 && Tit.resalteValido(r.titular, r.resalte));
  const m = await Tit.generar({ titulo: 'x', llamar: async () => ({ titular: 'Dalia brilla entre las más bellas', resalte: 'más bellas', etiqueta: 'VIRAL' }) });
  assert.strictEqual(m.origen, 'modelo'); assert.strictEqual(m.resalte, 'más bellas');
});

test('foto de portada: prefiere cara de tamaño medio y alta, sola y nítida; descarta mala calidad y caras diminutas', () => {
  const t = (r, cy, extra = {}) => ({ rostro: { r, cy, t: 1 }, personas: 1, rostroLocal: true, tipo: 'selfie_hablando', ...extra }), q = { ancho: 1080, alto: 1920, apto: true, nitidez: 0.4 };
  assert.ok(Foto.puntaje(t(0.2, 0.35), q) > Foto.puntaje(t(0.45, 0.35), q), 'una cara enorme puntúa menos');
  assert.ok(Foto.puntaje(t(0.2, 0.35), q) > Foto.puntaje(t(0.2, 0.62), q), 'una cara baja puntúa menos');
  assert.ok(Foto.puntaje(t(0.2, 0.35), q) > Foto.puntaje(t(0.2, 0.35), { ...q, ancho: 540 }), 'más resolución puntúa más');
  assert.strictEqual(Foto.puntaje(t(0.2, 0.35), { ...q, apto: false }), -1);
  assert.strictEqual(Foto.puntaje(t(0.05, 0.35), q), -1);
  assert.strictEqual(Foto.puntaje(null, q), -1);
});

test('dibujarPortada devuelve un PNG 1080x1920 aun sin foto ni logo', async () => {
  const png = await dibujarPortada({ titular: 'Titular de prueba con resalte', resalte: 'con resalte', canal: 'Canal Raro' });
  assert.strictEqual(png.slice(1, 4).toString(), 'PNG');
  const { loadImage } = require('@napi-rs/canvas'); const im = await loadImage(png); assert.deepStrictEqual([im.width, im.height], [1080, 1920]);
});

test('foto de portada: prefiere el cuadro que mira al frente; si ninguno lo hace, usa el mejor', async () => {
  const fsx = require('fs'), os = require('os'), pathx = require('path'), dir = fsx.mkdtempSync(pathx.join(os.tmpdir(), 'pf-')), biblio = pathx.join(dir, 'biblioteca'); fsx.mkdirSync(biblio);
  process.env.DATA_MOTOR_DIR = dir; const orig = require('child_process').execFileSync; require('child_process').execFileSync = () => Buffer.from('png'); delete require.cache[require.resolve('../edl/portadaFoto')]; const F = require('../edl/portadaFoto');
  const clips = [1, 2, 3].map(i => ({ id: 'c' + i, ruta: pathx.join(dir, `c${i}.mp4`) })); clips.forEach(c => fsx.writeFileSync(c.ruta, 'x'));
  const et = {}, cal = {}; clips.forEach((c, i) => { et[c.id] = { rostro: { r: 0.2, cy: 0.35, cx: 0.5, t: 0 }, personas: 1, tipo: 'selfie_hablando' }; cal[c.id] = { ancho: 1080, alto: 1920, apto: true, nitidez: 0.4 - i * 0.05 }; });
  fsx.writeFileSync(pathx.join(biblio, 'X.clips.json'), JSON.stringify(clips)); fsx.writeFileSync(pathx.join(biblio, 'X.etiquetas.json'), JSON.stringify(et)); fsx.writeFileSync(pathx.join(biblio, 'X.calidad.json'), JSON.stringify(cal));
  try {
    const orden = []; const r1 = await F.elegirFoto('X', { semilla: '', mirada: async () => { orden.push(1); return orden.length < 3 ? 'izquierda' : 'frente'; } });
    assert.strictEqual(r1.mira, 'frente'); assert.strictEqual(orden.length, 3);
    const r2 = await F.elegirFoto('X', { semilla: '', mirada: async () => 'derecha' }); assert.strictEqual(r2.mira, 'derecha'); assert.ok(r2.clipId);
  } finally { require('child_process').execFileSync = orig; delete process.env.DATA_MOTOR_DIR; delete require.cache[require.resolve('../edl/portadaFoto')]; }
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { construirCsv, campoDe, MAX_FILAS } = require('../edl/paqueteMetricool');

const pub = (n = 1, extra = {}) => ({ texto: `Chisme número ${n}, con "comillas" y, comas`, fecha: '2026-12-01', hora: '18:30', videoUrl: 'https://cdn.ejemplo.com/v.mp4', redes: ['instagram', 'tiktok'], ...extra });

test('sin plantilla: columnas por defecto, BOM, Draft TRUE y aviso', () => {
  const { archivos, avisos } = construirCsv([pub()]);
  assert.equal(archivos.length, 1);
  assert.ok(archivos[0].contenido.startsWith('\uFEFFText,Date,Time,Draft,Video URL,Instagram,TikTok,YouTube,Facebook'));
  const fila = archivos[0].contenido.split('\r\n')[1];
  assert.match(fila, /^"Chisme número 1, con ""comillas"" y, comas",2026-12-01,18:30:00,TRUE,https:\/\/cdn\.ejemplo\.com\/v\.mp4,TRUE,TRUE,FALSE,FALSE$/);
  assert.match(avisos[0], /sin plantilla oficial/);
});

test('con plantilla: respeta el orden de sus encabezados y avisa de los que no conoce', () => {
  const plantilla = 'Texto;Fecha de publicación;Hora;Instagram Reel;TikTok;Columna Rara;Video Link\n';
  const { archivos, avisos } = construirCsv([pub(1, { redes: ['tiktok'] })], { plantillaCsv: plantilla, draft: false });
  const [enc, fila] = archivos[0].contenido.replace('\uFEFF', '').split('\r\n');
  assert.equal(enc, 'Texto,Fecha de publicación,Hora,Instagram Reel,TikTok,Columna Rara,Video Link');
  assert.match(fila, /,2026-12-01,18:30:00,FALSE,TRUE,,https:\/\/cdn/);
  assert.ok(avisos.some(a => /Columna Rara/.test(a)));
});

test('parte en archivos de 50 filas', () => {
  const lista = Array.from({ length: MAX_FILAS * 2 + 3 }, (_, i) => pub(i));
  const { archivos } = construirCsv(lista);
  assert.equal(archivos.length, 3);
  assert.equal(archivos[0].contenido.trim().split('\r\n').length, MAX_FILAS + 1);
  assert.equal(archivos[2].contenido.trim().split('\r\n').length, 4);
  assert.deepEqual(archivos.map(a => a.nombre), ['metricool_01.csv', 'metricool_02.csv', 'metricool_03.csv']);
});

test('publicaciones inválidas lanzan con el detalle', () => {
  assert.throws(() => construirCsv([pub(1, { fecha: '01/12/2026', videoUrl: 'C:\\x.mp4', redes: [] })]),
    e => /fecha debe ser/.test(e.message) && /videoUrl/.test(e.message) && /sin redes/.test(e.message));
});

test('campoDe reconoce encabezados en español e inglés', () => {
  assert.equal(campoDe('Descripción'), 'texto');
  assert.equal(campoDe('Hora'), 'hora');
  assert.equal(campoDe('Borrador'), 'draft');
  assert.equal(campoDe('YouTube Shorts'), 'red:youtube');
  assert.equal(campoDe('Cualquier cosa'), null);
});

const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { parsearFuentes, unirActas, etiquetaDe } = require('../edl/fuentesMultiples');
const { normalizarJuicio, aMarkdown, revisionesDeCodigo, juzgar } = require('../edl/juezVideo');

test('fuentes: links uno por línea y bloques de texto separados por línea en blanco', () => {
  const f = parsearFuentes('https://a.com/x\nhttps://b.com/y\n\nConny dijo algo muy fuerte ayer\nen una entrevista larga\n\ncorto');
  assert.deepEqual(f.map(x => x.tipo), ['link', 'link', 'texto']);
  assert.match(f[2].contenido, /entrevista larga/); // dos líneas seguidas = un bloque; "corto" (<20) se ignora
});
test('fuentes: links repetidos (aunque cambie el ?query) cuentan una vez; máximo 8; vacío = nada', () => {
  assert.equal(parsearFuentes('https://a.com/x?utm=1\nhttps://a.com/x?utm=2').length, 1);
  assert.equal(parsearFuentes(Array.from({ length: 12 }, (_, i) => 'https://a.com/' + i).join('\n')).length, 8);
  assert.deepEqual(parsearFuentes('   \n  '), []);
});
test('fuentes: unirActas junta hechos y personas sin repetir', () => {
  const a = unirActas([{ hechos: 'H1', personas: ['Ana Paz', 'Luis'] }, { hechos: 'H2', personas: ['ana paz', 'Marta'] }]);
  assert.deepEqual(a.personas, ['Ana Paz', 'Luis', 'Marta']); assert.match(a.hechos, /FUENTE 1[\s\S]*H1[\s\S]*FUENTE 2[\s\S]*H2/);
  assert.equal(unirActas([{ hechos: 'x', personas: [] }]).hechos, 'x');
  assert.match(etiquetaDe({ tipo: 'link', contenido: 'https://www.sitio.com/nota' }), /sitio\.com/);
});
test('juez: normaliza basura del modelo (puntaje fuera de rango, gravedad rara, problemas sin texto) y ordena por gravedad', () => {
  const j = normalizarJuicio({ puntaje: 14, resumen: 'ok', problemas: [{ t: '3', gravedad: 'baja', que: 'a' }, { gravedad: 'alta', que: '' }, { t: 'x', gravedad: 'inventada', que: 'b' }, { t: 9, gravedad: 'alta', que: 'c', mejora: 'd' }], bueno: ['x', 'y', 'z'] });
  assert.equal(j.puntaje, 10); assert.deepEqual(j.problemas.map(p => p.que), ['c', 'b', 'a']); assert.equal(j.problemas[1].gravedad, 'media'); assert.equal(j.problemas[1].t, null); assert.equal(j.bueno.length, 2);
  assert.equal(normalizarJuicio(null).problemas.length, 0);
});
test('juez: revisión gratis de duración y markdown legible', () => {
  assert.equal(revisionesDeCodigo({ duracion: 40, minimo: 60 }).length, 1); assert.equal(revisionesDeCodigo({ duracion: 62, minimo: 60 }).length, 0); assert.equal(revisionesDeCodigo({ duracion: 20, minimo: 0 }).length, 0);
  const md = aMarkdown(normalizarJuicio({ puntaje: 6, resumen: 'regular', problemas: [{ t: 12, gravedad: 'alta', que: 'subtítulo cortado', mejora: 'subirlo' }] }), 'Título');
  assert.match(md, /6\/10/); assert.match(md, /\[ALTA\] ~12s subtítulo cortado → subirlo/);
});
test('juez: juzgar guarda juicio.json con el modelo inyectado, manda 1 imagen + guion, y sobrevive a un modelo caído', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'juez-')), video = path.join(dir, 'v.mp4'); fs.writeFileSync(video, 'x');
  const hojaFn = (v, d, destino) => { fs.writeFileSync(destino, 'jpg'); return { ruta: destino, tiempos: [1, 2] }; };
  let visto = null;
  const j = await juzgar({ video, guion: { script: 'Hola mundo', titulo: 'T' }, dir, hojaFn, llamar: async (p, partes) => { visto = partes; return { puntaje: 7.5, resumen: 'bien', problemas: [{ t: 5, gravedad: 'media', que: 'toma repetida', mejora: 'cambiarla' }] }; } });
  assert.equal(j.puntaje, 7.5); assert.equal(visto.filter(x => x.inlineData).length, 1); assert.match(visto[0].text, /Hola mundo/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'juicio.json'), 'utf8')).problemas[0].que, 'toma repetida'); assert.ok(fs.existsSync(path.join(dir, 'v.juicio.md')));
  const j2 = await juzgar({ video, guion: {}, dir, hojaFn, llamar: async () => { throw new Error('503'); } });
  assert.equal(j2.puntaje, null); assert.match(j2.resumen, /no pudo/);
});

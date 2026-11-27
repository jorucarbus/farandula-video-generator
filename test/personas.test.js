const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createCanvas } = require('@napi-rs/canvas');
const P = require('../edl/personas');

test('asignarPersonas pone el círculo en la primera frase donde se nombra a la persona y ancla en esa palabra', () => {
  const beats = [{ frase: 'Dalia desfiló.' }, { frase: 'Su preparadora Giselle Reyes la entrenó.' }, { frase: 'Reyes estuvo ahí.' }];
  const esc = [{ beat: 1 }, { beat: 2 }, { beat: 3 }];
  P.asignarPersonas(esc, beats, [{ nombre: 'Giselle Reyes', foto: 'x.jpg', lado: 'izq', alias: ['giselle', 'reyes'] }]);
  assert.equal(esc[1].personas.length, 1); assert.equal(esc[1].personas[0].ancla, 'giselle'); assert.equal(esc[0].personas, undefined); assert.equal(esc[2].personas, undefined);
});

test('prepararCirculo: la persona que mira hacia el borde se espeja para mirar hacia adentro; si ya mira hacia adentro no se espeja', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pers-')), foto = path.join(tmp, 'f.png'), c = createCanvas(600, 800), x = c.getContext('2d');
  x.fillStyle = '#888'; x.fillRect(0, 0, 600, 800); fs.writeFileSync(foto, c.toBuffer('image/png'));
  const an = { rostro: { cx: 0.5, cy: 0.35, r: 0.18 } };
  const a = await P.prepararCirculo(foto, { ...an, mira: 'izquierda' }, { lado: 'izq', salida: path.join(tmp, 'a.jpg') });   // círculo a la izquierda y mira a la izquierda = hacia afuera → espejar
  const b = await P.prepararCirculo(foto, { ...an, mira: 'derecha' }, { lado: 'izq', salida: path.join(tmp, 'b.jpg') });    // mira a la derecha estando a la izquierda = hacia adentro
  const c2 = await P.prepararCirculo(foto, { ...an, mira: 'izquierda' }, { salida: path.join(tmp, 'c.jpg') });             // sin lado fijo: va a la derecha y mira a la izquierda (hacia adentro)
  assert.equal(a.espejada, true); assert.equal(b.espejada, false); assert.equal(c2.lado, 'der'); assert.equal(c2.espejada, false);
  assert.ok(fs.existsSync(c2.foto));
});

test('fotoDe: un nombre suelto no se busca en Wikipedia (evita la foto de un homónimo famoso), pero una foto manual sí vale', async () => {
  const P = require('../edl/personas'), fs = require('fs'), path = require('path');
  const orig = global.fetch; let llamadas = 0; global.fetch = async () => { llamadas++; throw new Error('no debería consultar'); };
  try {
    assert.equal(await P.fotoDe({ nombre: 'Zzqx', rol: 'persona mencionada en la noticia' }), null);
    assert.equal(llamadas, 0, 'sin apellido no hay búsqueda');
  } finally { global.fetch = orig; }
});

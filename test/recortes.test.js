// Recorte de fondo croma y muñeco de recortes fotográficos (kit en assets/kit).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('@napi-rs/canvas');
const estilo = require('../estilos/capitol');
const { registrarFuentes } = require('../overlay/animacion');
const { quitarFondo } = require('../lienzo/recorte');
const { muneco, EMOCIONES, Resorte, salto, caida, ejeCuello, piezaKit, existePieza, parpadea, cuelloY } = require('../lienzo/recortes');
const B = require('../lienzo/base');

const KIT = path.join(__dirname, '..', 'assets', 'kit');

test('quitarFondo: quita el verde (con degradado), conserva piel/beige/dorado y borra motas sueltas', async () => {
  const c = createCanvas(300, 300), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 300, 300); g.addColorStop(0, '#8fc27a'); g.addColorStop(1, '#6faa5c'); x.fillStyle = g; x.fillRect(0, 0, 300, 300);
  x.fillStyle = '#c8272e'; x.fillRect(100, 60, 100, 120);          // objeto rojo
  x.fillStyle = '#e8dcc8'; x.fillRect(120, 180, 60, 90);           // "medias" beige, cerca del verde
  x.fillStyle = '#d0a463'; x.fillRect(80, 70, 20, 30);             // dorado
  x.fillStyle = '#808080'; x.fillRect(5, 5, 4, 4);                 // mota gris en la esquina
  const r = await quitarFondo(c.toBuffer('image/png'), { margen: 0 });
  assert.ok(r.width <= 130 && r.height <= 220 && r.width >= 110 && r.height >= 205, `recorta al objeto (${r.width}x${r.height})`);
  const d = r.getContext('2d').getImageData(0, 0, r.width, r.height).data, a = (px, py) => d[(py * r.width + px) * 4 + 3];
  assert.equal(a(70, r.height - 30), 255, 'la media beige se conserva');
  assert.equal(a(60, 40), 255, 'el rojo se conserva');
  assert.equal(a(5, r.height - 5), 0, 'el verde de la esquina inferior izquierda queda transparente');
});

test('quitarFondo: sin objeto o con fondo no liso lanza un error claro', async () => {
  const c = createCanvas(50, 50), x = c.getContext('2d'); x.fillStyle = '#00ff00'; x.fillRect(0, 0, 50, 50);
  await assert.rejects(quitarFondo(c.toBuffer('image/png')), /no dejó nada/);
});

test('resorte, salto y caída: convergen y hacen squash & stretch', () => {
  const r = new Resorte(150, 11); let v = 0; for (let i = 0; i < 240; i++) v = r.paso(1, 1 / 60);
  assert.ok(Math.abs(v - 1) < 0.01, 'el resorte llega al objetivo');
  const r2 = new Resorte(150, 11); let max = 0; for (let i = 0; i < 60; i++) max = Math.max(max, r2.paso(1, 1 / 60));
  assert.ok(max > 1.01, 'y se pasa un poco antes de asentarse (rebote)');
  assert.ok(salto(-0.05, 0).sy < 1, 'se agacha antes de saltar');
  assert.ok(salto(0.175, 0).dy > 0.05 && salto(0.175, 0).sy > 1, 'en el aire sube y se estira');
  assert.ok(salto(0.45, 0).sy < 1, 'al aterrizar se aplasta');
  assert.equal(salto(2, 0).sy, 1);
  assert.ok(caida(-1).dy > 1 && caida(0.6).sy < 1 && caida(2).dy === 0);
});

test('kit: existen las piezas, hay eje de cuello dentro de la imagen y las piezas desconocidas se rechazan', async () => {
  for (const n of ['cuerpo-bastonera', 'cuerpo-bastonera-celebrar', 'cuerpo-gala', 'guante-pulgar', 'baston', 'corona', 'cabeza-relleno-mujer']) assert.ok(existePieza(n), n);
  assert.equal(existePieza('../x'), false);
  const img = await piezaKit('cuerpo-bastonera'), eje = ejeCuello(img);
  assert.ok(eje > img.width * 0.25 && eje < img.width * 0.75, `eje del cuello ${eje}`);
});

test('muñeco: se dibuja con cabeza de foto, cambia con cada emoción y rechaza piezas inexistentes', async () => {
  registrarFuentes(estilo);
  const W = 360, H = 640, c = createCanvas(W, H), x = c.getContext('2d');
  const foto = fs.readFileSync(path.join(KIT, 'cabeza-relleno-mujer.png')), recorte = { cx: 0.5, cy: 0.345, rx: 0.353, ry: 0.28 };
  await assert.rejects(muneco({ cabeza: foto, recorte, cuerpo: 'cuerpo-inexistente', t0: 0, t1: 3 }).preparar({ w: W, h: H }), /desconocida/);
  const pix = async emocion => {
    const m = muneco({ cabeza: foto, recorte, emociones: [{ t: 0, e: emocion }], accesorios: emocion === 'feliz' ? [{ id: 'corona', t: 0 }] : [], t0: 0, t1: 9, alto: 0.6, base: 0.95 });
    await m.preparar({ w: W, h: H });
    for (let k = 0; k <= 90; k++) { B.fondo(x, W, H, estilo); m.dibujar(x, { t: k / 30, tAbs: k / 30, w: W, h: H, u: W, estilo }); }
    return x.getImageData(0, 0, W, H).data;
  };
  const base = createCanvas(W, H); const bx = base.getContext('2d'); B.fondo(bx, W, H, estilo); const fondo = bx.getImageData(0, 0, W, H).data;
  const normal = await pix('normal'); let ocupados = 0; for (let i = 0; i < normal.length; i += 4) if (normal[i] !== fondo[i] || normal[i + 2] !== fondo[i + 2]) ocupados++;
  assert.ok(ocupados > 8000, `la figura ocupa píxeles (${ocupados})`);
  for (const e of EMOCIONES.filter(e => e !== 'normal')) {
    const otra = await pix(e); let distintos = 0; for (let i = 0; i < normal.length; i += 4) if (normal[i] !== otra[i] || normal[i + 1] !== otra[i + 1]) distintos++;
    assert.ok(distintos > 150, `la emoción ${e} cambia la cara (${distintos} px)`);
  }
});

test('parpadeo: breve, periódico (~3.1 s) y desfasable', () => {
  const cerrados = []; for (let k = 0; k < 620; k++) if (parpadea(k / 100)) cerrados.push(k / 100);
  assert.ok(cerrados.length >= 2 * 13 && cerrados.length <= 2 * 16 + 1, `dos parpadeos en 6.2 s, ~0.14 s cada uno (${cerrados.length} muestras)`);
  assert.equal(parpadea(1), false); assert.equal(parpadea(0.05), true);
  assert.notEqual(parpadea(0.05, 0.9), parpadea(0.05));
});

test('altura del cuello: con los brazos arriba el cuello queda bastante más abajo que en reposo (la cabeza no flota)', async () => {
  const reposo = await piezaKit('cuerpo-bastonera'), arriba = await piezaKit('cuerpo-bastonera-celebrar');
  const yR = cuelloY(reposo, ejeCuello(reposo)) / reposo.height, yA = cuelloY(arriba, ejeCuello(arriba)) / arriba.height;
  assert.ok(yR < 0.05, `en reposo el cuello está arriba (${yR.toFixed(3)})`);
  assert.ok(yA > 0.08, `con los brazos arriba baja (${yA.toFixed(3)})`);
});

// Marioneta (esqueleto, plantillas, gestos, cabeza), envolvente de voz y escenarios mínimos.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { createCanvas } = require('@napi-rs/canvas');
const ffmpegBin = require('ffmpeg-static');
const estilo = require('../estilos/capitol');
const { registrarFuentes } = require('../overlay/animacion');
const { titere, articular, gestosDePalabras, PLANTILLAS } = require('../lienzo/titere');
const { escenario, TIPOS } = require('../lienzo/escenarios');
const { envolventeDeVoz } = require('../lienzo/voz');
const B = require('../lienzo/base');

test('voz: la boca abre cuando hay sonido y cierra en el silencio', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voz-'));
  try {
    const wav = path.join(dir, 'v.wav');
    // 1 s de tono, 1 s de silencio, 1 s de tono
    execFileSync(ffmpegBin, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=3', '-af', "volume='if(between(t,1,2),0,1)':eval=frame", wav]);
    const v = await envolventeDeVoz(wav, { fps: 30, duracion: 3 });
    assert.equal(v.abertura.length, 90);
    const media = (a, i, j) => a.slice(i, j).reduce((x, y) => x + y, 0) / (j - i);
    assert.ok(media(v.abertura, 5, 25) > 0.5, 'abierta con voz');
    assert.ok(media(v.abertura, 40, 55) < 0.15, 'cerrada en silencio');
    assert.ok(v.abertura.every(x => x >= 0 && x <= 1) && v.energia.every(x => x >= 0 && x <= 1));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('articular: en reposo respira y se mueve poco; las plantillas cambian los brazos y el cuerpo', () => {
  const r = articular(1, 0, [], []);
  assert.ok(Math.abs(r.respira) < 0.02 && Math.abs(r.brazoI.a - 9) < 4);
  const s = articular(2, 0, [], [{ plantilla: 'senalar', lado: 'D', t0: 0, t1: 9 }]);
  assert.ok(s.brazoD.a > 85, 'el brazo derecho señala (casi horizontal)'); assert.ok(s.brazoI.a < 15, 'el otro sigue relajado');
  const c = articular(2.1, 0, [], [{ plantilla: 'celebrar', t0: 0, t1: 9 }]);
  assert.ok(c.brazoI.a > 120 && c.brazoD.a > 120 && c.saltoY >= 0);
  const e = articular(2, 0, [], [{ plantilla: 'encoger', t0: 0, t1: 9 }]);
  assert.ok(e.brazoI.c > 50);
  const fuera = articular(20, 0, [], [{ plantilla: 'senalar', lado: 'D', t0: 0, t1: 9 }]);
  assert.ok(fuera.brazoD.a < 15, 'fuera de su ventana no hay acción');
  assert.deepEqual(PLANTILLAS.sort(), ['caminar', 'celebrar', 'encoger', 'sorpresa', 'senalar'].sort());
});

test('gestos al hablar: uno por frase de más de 1 s, alternando brazo, dentro de la ventana', () => {
  const pal = [['Hola', 0, 0.4], ['a', 0.4, 0.5], ['todos,', 0.5, 1.4], ['hoy', 1.6, 1.9], ['hablamos', 1.9, 2.5], ['de', 2.5, 2.7], ['esto.', 2.7, 3.4], ['Sí.', 3.6, 3.8]].map(([palabra, t0, t1]) => ({ palabra, t0, t1 }));
  const g = gestosDePalabras(pal, 0, 4);
  assert.equal(g.length, 2, 'la frase corta "Sí." no gesticula');
  assert.notEqual(g[0].lado, g[1].lado);
  assert.ok(g.every(x => x.t >= 0 && x.t < 4));
  assert.equal(gestosDePalabras(pal, 10, 20).length, 0);
});

test('marioneta: se dibuja (con cabeza genérica y con foto) y cambia de cuadro a cuadro al hablar', async () => {
  registrarFuentes(estilo);
  const W = 360, H = 640, c = createCanvas(W, H), x = c.getContext('2d');
  const foto = createCanvas(200, 300); const fx = foto.getContext('2d'); fx.fillStyle = '#d9a37f'; fx.fillRect(0, 0, 200, 300); fx.fillStyle = '#222'; fx.fillRect(70, 110, 20, 10); fx.fillRect(110, 110, 20, 10);
  for (const f of [null, foto.toBuffer('image/png')]) {
    const voz = { fps: 30, abertura: Float32Array.from({ length: 90 }, (_, i) => (i % 10 < 5 ? 0.9 : 0)), energia: new Float32Array(90).fill(0.5) };
    const el = titere({ genero: 'hombre', foto: f, voz, t0: 0, t1: 3, cx: 0.5, base: 0.9, alto: 0.5 });
    await el.preparar({ w: W, h: H });
    const pix = (tAbs) => { B.fondo(x, W, H, estilo); el.dibujar(x, { t: 1, tAbs, w: W, h: H, u: W, estilo }); return x.getImageData(0, 0, W, H).data; };
    const a = pix(0.05), b = pix(0.25), fondoSolo = (() => { B.fondo(x, W, H, estilo); return x.getImageData(0, 0, W, H).data; })();
    let distintos = 0, dibujados = 0; for (let i = 0; i < a.length; i += 4) { if (a[i] !== b[i] || a[i + 1] !== b[i + 1]) distintos++; if (a[i] !== fondoSolo[i] || a[i + 2] !== fondoSolo[i + 2]) dibujados++; }
    assert.ok(dibujados > 5000, `la figura ocupa píxeles (${dibujados})`);
    assert.ok(distintos > 50, `boca abierta vs cerrada cambia la imagen (${distintos})`);
  }
});

test('escenarios: la casa y el escenario dibujan su letrero; un tipo desconocido lanza', () => {
  registrarFuentes(estilo);
  assert.deepEqual(TIPOS, ['casa', 'escenario', 'cartel']);
  assert.throws(() => escenario({ tipo: 'castillo', texto: 'x', t0: 0, t1: 1 }), /desconocido/);
  const W = 360, H = 640, c = createCanvas(W, H), x = c.getContext('2d');
  for (const tipo of TIPOS) {
    B.fondo(x, W, H, estilo); const base = x.getImageData(0, 0, W, H).data;
    escenario({ tipo, texto: 'Mansión VIP', t0: 0, t1: 3 }).dibujar(x, { t: 2, w: W, h: H, u: W, estilo });
    const d = x.getImageData(0, 0, W, H).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] !== base[i] || d[i + 2] !== base[i + 2]) n++;
    assert.ok(n > 3000, `${tipo} dibuja (${n} px)`);
  }
});

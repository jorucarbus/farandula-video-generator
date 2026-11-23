// Lienzo del estilo fusionado: subtítulos por palabra, trazos a mano y un render real de humo (pequeño).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const ffmpegBin = require('ffmpeg-static');
const estilo = require('../estilos/capitol');
const { bloques, crearSubtitulos } = require('../lienzo/subtitulos');
const B = require('../lienzo/base');
const E = require('../lienzo/elementos');
const { renderizar } = require('../lienzo/render');

const pal = texto => texto.split(' ').map((palabra, i) => ({ palabra, t0: i * 0.4, t1: i * 0.4 + 0.35 }));

test('bloques corta tras puntuación (con 3+ palabras) o al llegar a 7', () => {
  const b = bloques(pal('Hoy en Chone, la reina ganó. Luego todos celebraron en la plaza principal de la ciudad'));
  assert.deepEqual(b.map(x => x.length), [3, 3, 7, 3]);
});

test('subtítulos: cada bloque tiene ventana de aparición y desaparición numéricas y consecutivas (regresión)', () => {
  const s = crearSubtitulos({ palabras: pal('Uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce'), w: 1080, h: 1920, estilo });
  assert.ok(s.grupos.length >= 2);
  s.grupos.forEach((g, k) => {
    assert.ok(Number.isFinite(g.aparece) && Number.isFinite(g.desaparece), `bloque ${k} con tiempos`);
    assert.ok(g.desaparece > g.aparece);
    if (k) assert.equal(g.aparece, s.grupos[k - 1].desaparece, 'un bloque sale cuando entra el siguiente');
  });
});

test('trazos a mano: puntos finitos, deterministas por semilla y distintos entre semillas', () => {
  const a = B.puntosDeOvalo(100, 100, 50, 40, 7), b = B.puntosDeOvalo(100, 100, 50, 40, 7), c = B.puntosDeOvalo(100, 100, 50, 40, 8);
  assert.ok(a.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  const s = B.puntosDeSubrayado(0, 10, 100, 10, 3);
  assert.equal(s[0].x, 0); assert.equal(s[s.length - 1].x, 100);
});

test('render de humo: cuadros reales con cifra roja, mapa y subtítulos; el rojo no está antes de su ventana', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lienzo-'));
  try {
    const salida = path.join(dir, 'humo.mp4');
    const subtitulos = crearSubtitulos({ palabras: pal('Chone tiene seis años'), claves: new Set([3]), w: 360, h: 640, estilo });
    await renderizar({ w: 360, h: 640, fps: 15, duracion: 2, salida, estilo, subtitulos,
      elementos: [E.cifra({ valor: 6, sufijo: 'años', cy: 0.5, t0: 0.8, t1: 2 }), E.mapa({ pais: 'Ecuador', lugar: { lon: -80.09, lat: -0.68, nombre: 'Chone' }, tPin: 0.3, cy: 0.5, t0: 0, t1: 0.7 })] });
    assert.ok(fs.statSync(salida).size > 1000);
    const rojos = t => {
      const buf = execFileSync(ffmpegBin, ['-v', 'error', '-ss', String(t), '-i', salida, '-frames:v', '1', '-vf', 'format=rgba,crop=360:1:0:320', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-']);
      let n = 0; for (let i = 0; i < buf.length; i += 4) if (buf[i] > 190 && buf[i + 1] < 70 && buf[i + 2] < 90) n++;
      return n;
    };
    assert.ok(rojos(1.7) > 20, 'la píldora roja está en pantalla después de animarse');
    assert.ok(rojos(0.1) < 5, 'antes de su ventana no hay rojo');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

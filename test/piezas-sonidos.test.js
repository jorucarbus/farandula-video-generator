// Íconos, efectos de sonido sintetizados y las piezas nuevas del lienzo (insignia, progresión, burbuja, sello).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const ffmpegBin = require('ffmpeg-static');
const estilo = require('../estilos/capitol');
const { cargarIcono, existe, disponibles } = require('../lienzo/iconos');
const { SONIDOS, mezclar, escribirWav, ticksDeConteo, SR } = require('../lienzo/sonidos');
const P = require('../lienzo/piezas');
const { crearSubtitulos } = require('../lienzo/subtitulos');
const { renderizar } = require('../lienzo/render');
const { easeOutCubic } = require('../overlay/animacion');

test('íconos: los del catálogo cargan nítidos y uno desconocido o con ruta rara lanza', async () => {
  assert.ok(disponibles().length >= 50);
  for (const n of ['crown', 'wand', 'trophy', 'brand-tiktok']) assert.ok(existe(n), n);
  const img = await cargarIcono('crown', { px: 128 });
  assert.equal(img.width, 128);
  await assert.rejects(cargarIcono('no-existe'), /desconocido/);
  assert.equal(existe('../../package'), false, 'no se escapa de la carpeta de íconos');
});

test('sonidos: todos los efectos tienen señal finita y no vacía; la mezcla no recorta y respeta el largo', () => {
  for (const [nombre, f] of Object.entries(SONIDOS)) {
    const s = f(); assert.ok(s.length > SR * 0.02, nombre); assert.ok(s.every(Number.isFinite), nombre);
  }
  const ev = Array.from({ length: 40 }, (_, i) => ({ t: 0.1 + i * 0.05, sonido: 'golpe', db: 12 })); // exagerado a propósito
  const m = mezclar(ev, 3, estilo.sonido);
  assert.equal(m.length, 3 * SR);
  assert.ok(m.every(x => Math.abs(x) <= 0.951), 'el limitador evita el recorte');
  assert.equal(mezclar([{ t: 1, sonido: 'inexistente' }], 2).every(x => x === 0), true);
});

test('wav escrito es válido y ticksDeConteo respeta el máximo y el orden', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wav-'));
  try {
    const f = escribirWav(path.join(dir, 'a.wav'), mezclar([{ t: 0.1, sonido: 'pop' }], 1, estilo.sonido));
    const dur = execFileSync(ffmpegBin, ['-v', 'error', '-i', f, '-f', 'null', '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
    void dur; assert.ok(fs.statSync(f).size > 80000);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  const t = ticksDeConteo(500000, 2, 0.95, easeOutCubic, 14);
  assert.ok(t.length <= 14 && t.length >= 5);
  assert.ok(t.every((x, i) => i === 0 || x >= t[i - 1]) && t[0] >= 2 && t[t.length - 1] <= 2.96);
  assert.equal(ticksDeConteo(3, 0, 0.95, easeOutCubic).length, 3, 'un conteo corto marca cada número');
});

test('render real con insignia, progresión, burbuja y sello: sale con voz+efectos y trae los eventos esperados', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'piezas-'));
  try {
    const voz = path.join(dir, 'voz.wav');
    execFileSync(ffmpegBin, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=200:duration=3', voz]);
    const els = [
      P.insignia({ icono: 'crown', color: 'rojo', etiqueta: 'Reina', cx: 0.5, cy: 0.3, t0: 0.2, t1: 3 }),
      P.progresion({ cy: 0.6, t1: 3, nodos: [{ icono: 'wand', etiqueta: 'A', t: 0.3 }, { icono: 'crown', etiqueta: 'B', t: 1.2 }] }),
      P.burbuja({ texto: 'Es mi amigo', cy: 0.8, t0: 1.5, t1: 3 }),
      P.sello({ cy: 0.45, t0: 2, t1: 3 }),
    ];
    assert.deepEqual(els[1].eventos.map(e => e.sonido).sort(), ['golpe', 'pop', 'trazo']);
    assert.equal(els[3].eventos[0].sonido, 'golpe');
    const salida = path.join(dir, 'p.mp4');
    const subs = crearSubtitulos({ palabras: [{ palabra: 'Hola', t0: 0, t1: 0.4 }, { palabra: 'mundo', t0: 0.5, t1: 1 }], w: 360, h: 640, estilo });
    await renderizar({ w: 360, h: 640, fps: 15, duracion: 3, audio: voz, salida, estilo, subtitulos: subs, elementos: els });
    const r = spawnSync(ffmpegBin, ['-hide_banner', '-i', salida], { encoding: 'utf8' }); // sin salida: ffmpeg termina con 1 e informa los streams por stderr
    assert.match(r.stderr, /Video: h264/); assert.match(r.stderr, /Audio: aac/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

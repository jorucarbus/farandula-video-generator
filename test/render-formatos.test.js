// Capa 2: render real con medios sintéticos (lavfi). Verifica 16:9, overlays con ventana de tiempo,
// degradación de overlays y el guardia de 3 s. Llama a montarVideoPlan directo: nunca importa
// server.js, seleccion, jobStore ni driveCache (no toca historial.json, jobs.json ni Drive).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ffmpegBin = require('ffmpeg-static');
const ffprobeBin = require('ffprobe-static').path;
const video = require('../video');

const ff = args => execFileSync(ffmpegBin, ['-y', '-loglevel', 'error', ...args]);
const probe = (f) => JSON.parse(execFileSync(ffprobeBin, ['-v', 'error', '-select_streams', 'v:0',
  '-show_entries', 'stream=width,height', '-show_entries', 'format=duration', '-of', 'json', f]).toString());

// Color (r,g,b) del píxel (x,y) del fotograma en el segundo t.
function pixel(f, t, x, y) {
  const buf = execFileSync(ffmpegBin, ['-v', 'error', '-ss', String(t), '-i', f, '-frames:v', '1',
    '-vf', `format=rgb24,crop=1:1:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  return [buf[0], buf[1], buf[2]];
}
const esRojo = ([r, g, b]) => r > 200 && g < 60 && b < 60;

function preparar(dur = 4) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'render-formatos-'));
  const clip = path.join(dir, 'clip.mp4');
  // Fondo azul liso: el píxel de prueba es azul salvo donde el overlay lo cubra.
  ff(['-f', 'lavfi', '-i', `color=c=blue:size=640x360:rate=30:duration=${dur + 2}`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', clip]);
  const audio = path.join(dir, 'audio.mp3');
  ff(['-f', 'lavfi', '-i', `sine=frequency=440:duration=${dur}`, '-c:a', 'libmp3lame', audio]);
  const png = path.join(dir, 'rojo.png');
  ff(['-f', 'lavfi', '-i', 'color=c=red:size=500x300', '-frames:v', '1', png]);
  return { dir, clip, audio, png };
}
const limpiar = (dir, jobId) => { video.limpiarTemporales(jobId); try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} };

test('16:9 produce 1920x1080 con la duración del audio', async () => {
  const m = preparar(4);
  try {
    const plan = [{ videoId: 'a', famoso: 'X', offset: 0, duracion: 2.0 }, { videoId: 'a', famoso: 'X', offset: 2.0, duracion: 2.0 }];
    const r = await video.montarVideoPlan(plan, { a: m.clip }, m.audio, 't-169', { aspect: '16:9' });
    const info = probe(r.finalPath);
    assert.equal(info.streams[0].width, 1920);
    assert.equal(info.streams[0].height, 1080);
    assert.ok(Math.abs(Number(info.format.duration) - 4) < 0.2);
  } finally { limpiar(m.dir, 't-169'); }
});

test('16:9 con zoom usa el tamaño de salida de 16:9 (no el de 9:16)', async () => {
  const m = preparar(4);
  try {
    const plan = [{ videoId: 'a', famoso: 'X', offset: 0, duracion: 2.0 }, { videoId: 'a', famoso: 'X', offset: 2.0, duracion: 2.0 }];
    const r = await video.montarVideoPlan(plan, { a: m.clip }, m.audio, 't-zoom', { aspect: '16:9', zoom: 'todos', zoomPct: 20 });
    const info = probe(r.finalPath);
    assert.equal(info.streams[0].width, 1920);
    assert.equal(info.streams[0].height, 1080);
  } finally { limpiar(m.dir, 't-zoom'); }
});

test('overlay con ventana: visible entre t0 y t1 y ausente fuera (9:16 y 16:9)', async () => {
  for (const aspect of ['9:16', '16:9']) {
    const m = preparar(4);
    const id = `t-ov-${aspect.replace(':', 'x')}`;
    try {
      const plan = [{ videoId: 'a', famoso: 'X', offset: 0, duracion: 2.0 }, { videoId: 'a', famoso: 'X', offset: 2.0, duracion: 2.0 }];
      const efectos = { aspect, overlays: [{ path: m.png, t0: 1.5, t1: 3.0, x: 0, y: 0 }] };
      const r = await video.montarVideoPlan(plan, { a: m.clip }, m.audio, id, efectos);
      assert.ok(esRojo(pixel(r.finalPath, 2.2, 50, 50)), `${aspect}: el overlay debe verse a los 2.2 s`);
      assert.ok(!esRojo(pixel(r.finalPath, 0.5, 50, 50)), `${aspect}: no debe verse antes de t0`);
      assert.ok(!esRojo(pixel(r.finalPath, 3.6, 50, 50)), `${aspect}: no debe verse después de t1`);
    } finally { limpiar(m.dir, id); }
  }
});

test('overlay roto (PNG inexistente) no rompe el render: sale sin él', async () => {
  const m = preparar(4);
  try {
    const plan = [{ videoId: 'a', famoso: 'X', offset: 0, duracion: 2.0 }, { videoId: 'a', famoso: 'X', offset: 2.0, duracion: 2.0 }];
    const r = await video.montarVideoPlan(plan, { a: m.clip }, m.audio, 't-roto',
      { overlays: [{ path: path.join(m.dir, 'no-existe.png'), t0: 1, t1: 2 }, { path: m.png, t0: 3, t1: 1 }] });
    assert.ok(fs.existsSync(r.finalPath));
    assert.ok(!esRojo(pixel(r.finalPath, 1.5, 50, 50)));
  } finally { limpiar(m.dir, 't-roto'); }
});

test('guardia de 3 s: un clip de 3.0 s con cola de transición lanza error', async () => {
  const m = preparar(8);
  try {
    const plan = [{ videoId: 'a', famoso: 'X', offset: 0, duracion: 3.0 }, { videoId: 'a', famoso: 'X', offset: 3.0, duracion: 3.0 }];
    await assert.rejects(
      video.montarVideoPlan(plan, { a: m.clip }, m.audio, 't-guardia', { transicion: 'todos', transicionDur: 0.35, transicionTipo: 'fade' }),
      /máx\. 3/);
  } finally { limpiar(m.dir, 't-guardia'); }
});

test('guardia de 3 s: sin transición un clip de 3.0 s pasa; uno de 3.5 s lanza', async () => {
  const m = preparar(8);
  try {
    const ok = [{ videoId: 'a', famoso: 'X', offset: 0, duracion: 3.0 }, { videoId: 'a', famoso: 'X', offset: 3.0, duracion: 3.0 }];
    const r = await video.montarVideoPlan(ok, { a: m.clip }, m.audio, 't-g-ok', {});
    assert.ok(fs.existsSync(r.finalPath));
    const largo = [{ videoId: 'a', famoso: 'X', offset: 0, duracion: 3.5 }];
    await assert.rejects(video.montarVideoPlan(largo, { a: m.clip }, m.audio, 't-g-no', {}), /máx\. 3/);
  } finally { limpiar(m.dir, 't-g-ok'); limpiar(m.dir, 't-g-no'); }
});

test('guardia de 3 s: lo propio y las imágenes no entran en el límite', async () => {
  const m = preparar(8);
  try {
    const plan = [{ videoId: 'a', famoso: 'X', offset: 0, duracion: 5.0, fuenteTipo: 'propio' }];
    const r = await video.montarVideoPlan(plan, { a: m.clip }, m.audio, 't-propio', {});
    assert.ok(fs.existsSync(r.finalPath));
  } finally { limpiar(m.dir, 't-propio'); }
});

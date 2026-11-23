// Render de prueba del estilo capitol sobre un fondo sintético; deja una hoja de fotogramas para revisarla a ojo.
// Uso: node scripts/probar-estilo-video.js [carpetaSalida]
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const ffmpegBin = require('ffmpeg-static');
const video = require('../video');
const { planEdlARender } = require('../edl/planEdlARender');
const salida = path.resolve(process.argv[2] || path.join(__dirname, '..', 'data-motor', 'estilo-prueba'));
fs.mkdirSync(salida, { recursive: true }); fs.mkdirSync(video.TEMP_DIR, { recursive: true });
const ff = a => execFileSync(ffmpegBin, ['-y', '-loglevel', 'error', ...a]);
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'estilo-'));
  ff(['-f', 'lavfi', '-i', 'gradients=s=720x1280:d=12:c0=0x2b3a67:c1=0xc9a66b:speed=0.02', '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(dir, 'fondo.mp4')]);
  ff(['-i', path.join(dir, 'fondo.mp4'), '-frames:v', '1', path.join(dir, 'foto.jpg')]);
  ff(['-f', 'lavfi', '-i', 'sine=frequency=330:duration=12', '-c:a', 'libmp3lame', path.join(dir, 'audio.mp3')]);
  const edl = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'test', 'fixtures', 'edl', 'ejemplo-a-short-9x16.json'), 'utf8'));
  edl.shots[0].params = { titulo: 'De bastonera a reina', resaltar: 'reina' };
  edl.shots[1].recipe = 'tarjeta_dato'; edl.shots[1].params = { etiqueta: 'Fecha', titulo: '30 de octubre de 2026', detalle: 'Coliseo La California, Portoviejo', ancla: 'abajo' };
  edl.shots[2].recipe = 'cifra_pildora'; edl.shots[2].params = { valor: 12, sufijo: ' aspirantes', ancla: 'arriba' };
  const r = await planEdlARender(edl, { dirTemp: path.join(dir, 'ov') });
  console.log('AVISOS:', r.avisos.join(' || ') || '-', '| overlays:', r.efectos.overlays.length);
  const archivos = { drv_abc: path.join(dir, 'fondo.mp4'), drv_def: path.join(dir, 'fondo.mp4'), foto_01: path.join(dir, 'foto.jpg') };
  const res = await video.montarVideoPlan(r.plan, archivos, path.join(dir, 'audio.mp3'), 'estilo-prueba', r.efectos);
  const mp4 = path.join(salida, 'estilo-prueba.mp4'); fs.copyFileSync(res.finalPath, mp4);
  const tiempos = [2.7, 2.9, 3.4, 4.3, 5.0, 5.3, 6.2, 8.0];
  tiempos.forEach((t, i) => ff(['-ss', String(t), '-i', mp4, '-frames:v', '1', '-vf', 'scale=270:-1', path.join(salida, `f${i}.png`)]));
  ff([...tiempos.flatMap((_, i) => ['-i', path.join(salida, `f${i}.png`)]), '-filter_complex', `${tiempos.map((_, i) => `[${i}:v]`).join('')}hstack=inputs=${tiempos.length}`, '-frames:v', '1', path.join(salida, 'hoja.png')]);
  console.log('VIDEO:', mp4, '\nHOJA:', path.join(salida, 'hoja.png'));
  video.limpiarTemporales('estilo-prueba'); fs.rmSync(dir, { recursive: true, force: true });
})().catch(e => { console.error('FALLO', e); process.exit(1); });

// Prueba de no regresión del render 9:16: los argumentos de ffmpeg deben ser idénticos a los
// del código ANTES del motor EDL (golden file). Solo medios sintéticos; no toca historial.json,
// jobs.json, Drive ni server.js (ver .claude/ plan: "Seguridad de datos en pruebas").
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const { llamadas, normalizar } = require('./helpers/captura-ffmpeg');
const ffmpegBin = require('ffmpeg-static');
const ffprobeBin = require('ffprobe-static').path;
const video = require('../video');

const GOLDEN = path.join(__dirname, 'golden', 'args-9x16.json');

function ff(args) { execFileSync(ffmpegBin, ['-y', '-loglevel', 'error', ...args]); }

test('montarVideoPlan 9:16: argumentos de ffmpeg idénticos al golden file', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'golden-9x16-'));
  try {
    const archivos = {};
    for (const id of ['a', 'b', 'c']) {
      const p = path.join(dir, `clip_${id}.mp4`);
      ff(['-f', 'lavfi', '-i', `testsrc=size=640x360:rate=30:duration=6`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', p]);
      archivos[id] = p;
    }
    const audio = path.join(dir, 'audio.mp3');
    ff(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=8', '-c:a', 'libmp3lame', audio]);

    const plan = [
      { videoId: 'a', famoso: 'X', offset: 0, duracion: 2.0, parrafoIdx: 0 },
      { videoId: 'b', famoso: 'X', offset: 0, duracion: 2.0, parrafoIdx: 0 },
      { videoId: 'c', famoso: 'X', offset: 0, duracion: 2.0, parrafoIdx: 1 },
      { videoId: 'a', famoso: 'X', offset: 2.0, duracion: 2.0, parrafoIdx: 1 },
    ];
    const efectos = { zoom: 'alternado', espejo: 'ninguno', zoomPct: 20, transicion: 'alternado', transicionDur: 0.35, transicionTipo: 'fade' };

    llamadas.length = 0;
    const res = await video.montarVideoPlan(plan, archivos, audio, 'golden-test', efectos);

    const reemplazos = [[video.TEMP_DIR, '<TEMP>'], [dir, '<FIX>']];
    const capturadas = llamadas
      .filter(l => l.bin.startsWith('ffmpeg') || l.bin === path.basename(ffmpegBin).replace(/\.exe$/i, ''))
      // se omite el sondeo de encoder (depende de la máquina)
      .filter(l => !l.args.includes('color=c=black:size=256x256:duration=0.2'))
      // y las llamadas de ffprobe/otras herramientas
      .map(l => normalizar(l.args, reemplazos));

    // El render debe producir 1080x1920 con la duración del audio
    const info = JSON.parse(execFileSync(ffprobeBin, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-show_entries', 'format=duration', '-of', 'json', res.finalPath]).toString());
    assert.equal(info.streams[0].width, 1080);
    assert.equal(info.streams[0].height, 1920);
    assert.ok(Math.abs(Number(info.format.duration) - 8) < 0.2, `duración ${info.format.duration}`);

    if (process.env.UPDATE_GOLDEN === '1') {
      fs.mkdirSync(path.dirname(GOLDEN), { recursive: true });
      fs.writeFileSync(GOLDEN, JSON.stringify(capturadas, null, 2) + '\n');
      console.log(`golden escrito: ${capturadas.length} llamadas`);
      return;
    }
    const golden = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
    assert.deepEqual(capturadas, golden);
  } finally {
    video.limpiarTemporales('golden-test');
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
});

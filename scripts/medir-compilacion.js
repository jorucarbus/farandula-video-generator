// Mide una compilación 16:9 de muchos clips cortos con medios sintéticos: tiempo y memoria pico de
// ffmpeg (suma del working set de todos los procesos ffmpeg, muestreada cada ~600 ms).
// Uso: node scripts/medir-compilacion.js [clips=36] [duracionClip=2.5] [transicion=alternado|todos|ninguno]
// No toca datos reales, Drive ni server.js. Escribe en una carpeta temporal y la borra al terminar.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, execFileSync } = require('child_process');

const video = require('../video');
fs.mkdirSync(video.TEMP_DIR, { recursive: true });
const ffmpegBin = require('ffmpeg-static');

const N = Number(process.argv[2] || 36);
const DUR = Number(process.argv[3] || 2.5);
const TRANS = process.argv[4] || 'alternado';
const jobId = `medir-${Date.now()}`;

function rssFfmpeg() {
  return new Promise(resolve => {
    execFile('powershell', ['-NoProfile', '-Command',
      "(Get-Process ffmpeg -ErrorAction SilentlyContinue | Measure-Object WorkingSet64 -Sum).Sum"], { timeout: 4000 }, (e, out) => {
      resolve(Number((out || '').trim()) || 0);
    });
  });
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'medir-comp-'));
  try {
    // 6 fuentes 1080p de 14 s (como metraje real), reutilizadas con offsets distintos.
    const archivos = {};
    for (let i = 0; i < 6; i++) {
      const p = path.join(dir, `src_${i}.mp4`);
      execFileSync(ffmpegBin, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `testsrc2=size=1920x1080:rate=30:duration=14`,
        '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', p]);
      archivos[`v${i}`] = p;
    }
    const total = N * DUR;
    const audio = path.join(dir, 'audio.mp3');
    execFileSync(ffmpegBin, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `sine=frequency=440:duration=${total}`, '-c:a', 'libmp3lame', audio]);

    const plan = Array.from({ length: N }, (_, i) => ({ videoId: `v${i % 6}`, famoso: 'X', offset: (i % 4) * 3, duracion: DUR }));
    const efectos = { aspect: '16:9', transicion: TRANS, transicionDur: 0.35, transicionTipo: 'fade' };

    let pico = 0; let vivo = true;
    const muestreo = (async () => { while (vivo) { pico = Math.max(pico, await rssFfmpeg()); await new Promise(r => setTimeout(r, 600)); } })();
    const t0 = Date.now();
    const r = await video.montarVideoPlan(plan, archivos, audio, jobId, efectos);
    const seg = (Date.now() - t0) / 1000;
    vivo = false; await muestreo;

    const sz = fs.statSync(r.finalPath).size;
    console.log(JSON.stringify({
      clips: N, duracionClip: DUR, transicion: TRANS, videoSegundos: total, renderSegundos: Number(seg.toFixed(1)),
      xTiempoReal: Number((total / seg).toFixed(2)), ramPicoFfmpegMB: Math.round(pico / 1048576), tandas: r.tandas, encoder: r.encoder,
      archivoMB: Number((sz / 1048576).toFixed(1)),
    }));
  } finally {
    video.limpiarTemporales(jobId);
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(e => { console.error('FALLÓ:', e.message.slice(0, 400)); process.exit(1); });

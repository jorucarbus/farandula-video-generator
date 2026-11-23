// Renderer de escenas: dibuja cada cuadro con canvas (fondo crema + elementos activos + subtítulos arriba) y lo envía
// como video crudo a ffmpeg, que lo codifica y le pone la voz. Sin archivos intermedios por cuadro.
const { spawn } = require('child_process');
const { once } = require('events');
const { createCanvas } = require('@napi-rs/canvas');
const { registrarFuentes, acotar } = require('../overlay/animacion');
const B = require('./base');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { mezclar, escribirWav } = require('./sonidos');

// elementos: salida de lienzo/elementos.js; subtitulos: salida de crearSubtitulos; opciones.alCuadro(i,n) para progreso.
async function renderizar({ w = 1080, h = 1920, fps = 30, duracion, audio, salida, estilo, subtitulos, elementos = [], crf = 20, sonidos = true, alCuadro = null, ffmpeg = process.env.FFMPEG_BIN || require('ffmpeg-static') }) {
  registrarFuentes(estilo);
  const u = Math.min(w, h), n = Math.ceil(duracion * fps);
  for (const el of elementos) if (el.preparar) await el.preparar({ w, h, fps });
  const canvas = createCanvas(w, h), ctx = canvas.getContext('2d');
  // Efectos de sonido: cada elemento declara sus eventos; se sintetiza una pista y se mezcla bajo la voz.
  let wav = null;
  const eventos = sonidos ? elementos.flatMap(e => e.eventos || []).filter(e => e.t >= 0 && e.t < duracion) : [];
  if (eventos.length) wav = escribirWav(path.join(os.tmpdir(), `sfx_${process.pid}_${Date.now()}.wav`), mezclar(eventos, duracion, estilo.sonido || {}));
  const conVoz = Boolean(audio), conSfx = Boolean(wav);
  const args = ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`, '-r', String(fps), '-i', '-',
    ...(conVoz ? ['-i', audio] : []), ...(conSfx ? ['-i', wav] : []), ...(conVoz || conSfx ? ['-t', String(duracion)] : []),
    ...(conVoz && conSfx ? ['-filter_complex', '[1:a]aformat=sample_rates=44100:channel_layouts=stereo[v];[2:a]aformat=sample_rates=44100:channel_layouts=stereo[s];[v][s]amix=inputs=2:duration=first:normalize=0[a]', '-map', '0:v', '-map', '[a]'] : []),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', String(crf), '-preset', 'veryfast', '-movflags', '+faststart', ...(conVoz || conSfx ? ['-c:a', 'aac', '-b:a', '160k'] : []), salida];
  const ff = spawn(ffmpeg, args, { stdio: ['pipe', 'ignore', 'pipe'] });
  let err = ''; ff.stderr.on('data', d => { err += d; });
  const fin = new Promise((res, rej) => { ff.on('close', c => (c === 0 ? res() : rej(new Error(`ffmpeg: ${err.slice(-500)}`)))); ff.on('error', rej); });
  try {
    for (let i = 0; i < n; i++) {
      const t = i / fps;
      B.fondo(ctx, w, h, estilo);
      for (const el of elementos) {
        if (t < el.t0 || t >= el.t1) continue;
        const salida_ = acotar((el.t1 - t) / 0.18); // sale con un fundido rápido
        ctx.save(); ctx.globalAlpha = salida_;
        await el.dibujar(ctx, { t: t - el.t0, tAbs: t, w, h, u, estilo });
        ctx.restore();
      }
      if (subtitulos) subtitulos.dibujar(ctx, t);
      const buf = Buffer.from(canvas.data());
      if (!ff.stdin.write(buf)) await once(ff.stdin, 'drain');
      if (alCuadro && i % 30 === 0) alCuadro(i, n);
    }
    ff.stdin.end();
    await fin;
  } catch (e) { try { ff.kill(); } catch {} throw e; } finally { for (const el of elementos) if (el.limpiar) el.limpiar(); if (wav) try { fs.unlinkSync(wav); } catch {} }
  return salida;
}

module.exports = { renderizar };

// Mide cuánto tarda el render y deja el video de prueba para comparar cuadro a cuadro (antes/después de tocar el renderer).
// Uso: node scripts/medir-render.js [segundos=9] [salida.mp4]   → imprime TIEMPOS y el hash (md5) de todos los cuadros.
// Es determinista: clips sintéticos (testsrc), sin voz ni música ni red. Si dos corridas dan el mismo hash, los píxeles son idénticos.
const path = require('path'), fs = require('fs'), os = require('os'), crypto = require('crypto'), { execFileSync } = require('child_process');
const ffmpeg = process.env.FFMPEG_BIN || require('ffmpeg-static');
const estilo = require('../estilos/capitol'), E = require('../lienzo/elementos'), { renderizar } = require('../lienzo/render');
(async () => {
  const seg = Number(process.argv[2]) || 9, salida = path.resolve(process.argv[3] || path.join(os.tmpdir(), 'medir-render.mp4'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'medir-')), clips = ['testsrc2', 'smptebars', 'rgbtestsrc'].map((f, i) => { const p = path.join(dir, `c${i}.mp4`); execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `${f}=size=720x1280:rate=30:duration=6`, '-pix_fmt', 'yuv420p', p]); return p; });
  const paso = seg / 3, cortes = clips.map((c, i) => ({ clip: c, ss: 0, t0: 0.2 + i * paso, t1: 0.2 + (i + 1) * paso, trans: ['fundido', 'empuja', 'zoom'][i] }));
  const m = E.montaje({ cortes, t0: 0.2, t1: seg - 0.1, atenuar: [{ t0: 1, t1: 3 }], zooms: [1.5, 4.2] });
  await renderizar({ duracion: seg, salida, estilo, subtitulos: null, elementos: [m], sonidos: false, crf: 20 });
  const md5 = execFileSync(ffmpeg, ['-loglevel', 'error', '-i', salida, '-f', 'framemd5', '-']).toString().split('\n').filter(l => l && !l.startsWith('#')).map(l => l.split(',').pop().trim()).join('');
  console.log('HASH', crypto.createHash('md5').update(md5).digest('hex')); fs.rmSync(dir, { recursive: true, force: true });
})().catch(e => { console.error(e); process.exit(1); });

// Captura los argumentos con que video.js llama a ffmpeg, SIN ejecutar nada distinto.
// Debe cargarse ANTES de require('../video.js'): envuelve child_process.execFile.
const cp = require('child_process');
const path = require('path');

const llamadas = [];
const original = cp.execFile;
cp.execFile = function (file, args, ...resto) {
  if (Array.isArray(args)) llamadas.push({ bin: path.basename(String(file)).replace(/\.exe$/i, ''), args: [...args] });
  return original.call(this, file, args, ...resto);
};

const BARRA_INVERSA = /\\/g;

function normalizar(args, reemplazos) {
  const a = args.map(x => {
    let s = String(x).replace(BARRA_INVERSA, '/');
    for (const [desde, hacia] of reemplazos) s = s.split(desde.replace(BARRA_INVERSA, '/')).join(hacia);
    return s;
  });
  // El encoder depende de la máquina (NVENC o libx264): se marca, no se compara.
  const grupos = [
    ['-c:v', 'h264_nvenc', '-preset', 'p4', '-rc', 'vbr', '-cq', '23', '-b:v', '0', '-pix_fmt', 'yuv420p'],
    ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p'],
  ];
  for (const g of grupos) {
    for (let i = 0; i + g.length <= a.length; i++) {
      if (g.every((v, j) => a[i + j] === v)) a.splice(i, g.length, '<ENC>');
    }
  }
  return a;
}

module.exports = { llamadas, normalizar };

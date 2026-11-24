// Arma las HOJAS MODELO (rejillas) a partir de los renders 3D de herramientas/blender/cabeza_modelo.py: visemas, ojos/cejas de emoción, bocas de emoción y giro de cabeza.
// Uso: node scripts/hojas-3d.js [carpeta renders] [carpeta salida]
const fs = require('fs'), path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const pos = process.argv.slice(2).filter(a => !a.startsWith('--')), R = pos[0] || path.join(__dirname, '..', 'data-motor', 'blender', 'todo'), S = pos[1] || path.join(__dirname, '..', 'data-motor', 'blender', 'hojas');
fs.mkdirSync(S, { recursive: true });
const EMO = ['feliz', 'sorpresa', 'triste', 'enojo', 'duda', 'orgullo', 'asco', 'preocupacion', 'amor'], VIS = ['Neutral', 'Aa', 'Ee', 'Oh', 'Woo', 'M', 'F', 'D', 'S', 'Uh', 'R'], ANG = [-90, -60, -30, 0, 30, 60, 90];
async function hoja(nombre, archivos, cols, celda, hueco = 6, ventana = null) { // ventana: recorte {x,y,w,h} de cada render (fracciones)
  const filas = Math.ceil(archivos.length / cols), c = createCanvas(cols * celda.w + (cols + 1) * hueco, filas * celda.h + (filas + 1) * hueco), x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  for (let k = 0; k < archivos.length; k++) { if (!archivos[k]) continue; const im = await loadImage(path.join(R, archivos[k] + '.png')), v = ventana || { x: 0, y: 0, w: 1, h: 1 };
    x.drawImage(im, v.x * im.width, v.y * im.height, v.w * im.width, v.h * im.height, hueco + (k % cols) * (celda.w + hueco), hueco + Math.floor(k / cols) * (celda.h + hueco), celda.w, celda.h); }
  fs.writeFileSync(path.join(S, nombre + '.png'), c.toBuffer('image/png')); console.log(nombre, c.width + 'x' + c.height);
}
(async () => {
  await hoja('3d-visemas', [...VIS.map(v => 'visema_' + v), 'emoinf_feliz'], 4, { w: 512, h: 384 }, 6, { x: 0, y: 0.08, w: 1, h: 0.75 });  // 4x3 = 12 celdas de la parte baja de la cara
  await hoja('3d-emo-superiores', EMO.map(e => 'emosup_' + e), 3, { w: 512, h: 384 }, 6, { x: 0, y: 0.1, w: 1, h: 0.75 });
  await hoja('3d-emo-inferiores', EMO.map(e => 'emoinf_' + e), 3, { w: 512, h: 384 }, 6, { x: 0, y: 0.08, w: 1, h: 0.75 });
  const VA = ['Neutral', 'Aa', 'Ee', 'Oh', 'Woo', 'M'], VB = ['F', 'D', 'S', 'Uh', 'R', 'feliz'];   // visemas con cara completa, 2 hojas de 3x2
  await hoja('3d-visemas-a', VA.map(v => 'vf_' + v), 3, { w: 512, h: 512 }, 6, { x: 0.12, y: 0.05, w: 0.76, h: 0.76 });
  await hoja('3d-visemas-b', VB.map(v => 'vf_' + v), 3, { w: 512, h: 512 }, 6, { x: 0.12, y: 0.05, w: 0.76, h: 0.76 });
  await hoja('3d-angulos', [...ANG.map(a => 'angulo_' + (a >= 0 ? '+' : '') + a), null], 4, { w: 480, h: 640 }, 6, { x: 0.15, y: 0, w: 0.7, h: 1 });
})();
// Hoja ÚNICA: 9 emociones + 11 visemas (20 celdas, cara completa) en una sola rejilla 5x4 para generarla con UNA imagen de alta resolución
(async () => { if (!process.argv.includes('--unica')) return; await hoja('3d-unica', [...EMO.map(e => 'emosup_' + e), ...VIS.map(v => 'vf_' + v)], 5, { w: 400, h: 400 }, 6, { x: 0.12, y: 0.05, w: 0.76, h: 0.76 }); })();

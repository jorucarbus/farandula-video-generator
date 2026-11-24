// Prueba de una persona del rig de fotos: reposo y varios visemas, con el borde blanco. Uso: node scripts/rig-persona-foto.js leidy
const fs = require('fs'), path = require('path');
const { createCanvas } = require('@napi-rs/canvas');
const estilo = require('../estilos/capitol'), B = require('../lienzo/base');
const { titereRig } = require('../lienzo/titere-rig');
const persona = process.argv[2] || 'leidy', traje = persona === 'generica' ? 'bastonera-foto' : 'bastonera-foto@' + persona, V = ['N', 'Aa', 'Ee', 'Oh', 'M', 'F', 'D', 'Woo'];
(async () => {
  const W = 300, Hh = 760, out = createCanvas(W * V.length, Hh), ox = out.getContext('2d'); ox.fillStyle = '#eee'; ox.fillRect(0, 0, out.width, out.height);
  for (let k = 0; k < V.length; k++) {
    const el = titereRig({ traje, cx: 0.5, base: 0.96, alto: 0.9, t0: 0, t1: 10, voz: { fps: 30, abertura: new Array(300).fill(0.5), visemas: new Array(300).fill(V[k]) } });
    await el.preparar({ w: 1080, h: 1920 }); const c = createCanvas(1080, 1920), x = c.getContext('2d');
    for (let f = 0; f <= 40; f++) { x.clearRect(0, 0, 1080, 1920); B.fondo(x, 1080, 1920, estilo); await el.dibujar(x, { t: f / 30, tAbs: f / 30, w: 1080, h: 1920, u: 1080, estilo }); }
    ox.drawImage(c, 300, 120, 480, 1216 * 0.5 + 120, k * W, 0, W, Hh); ox.fillStyle = '#000'; ox.font = '20px sans-serif'; ox.fillText(V[k], k * W + 8, 24);
  }
  const sal = path.join(__dirname, '..', 'data-motor', 'lamina', 'estilos', 'persona-' + persona + '.png'); fs.writeFileSync(sal, out.toBuffer('image/png')); console.log('listo', sal);
})().catch(e => { console.error('FALLO', e); process.exit(1); });

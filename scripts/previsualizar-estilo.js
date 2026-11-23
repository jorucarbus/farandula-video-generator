// Hoja de contacto del estilo: fotogramas de cada componente animado sobre fondo crema (9:16 reducido).
// Uso: node scripts/previsualizar-estilo.js [salida.png]
const fs = require('fs'), os = require('os'), path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const estilo = require('../estilos/capitol');
const { generarSecuencia } = require('../overlay/animacion');
const { COMPONENTES } = require('../overlay/componentes');
const W = 1080, H = 1920, ESC = 0.30;
const casos = [
  ['cifra_pildora', { valor: 500000, sufijo: ' $', ancla: 'arriba' }],
  ['cifra_pildora', { valor: 2023, agrupar: false, ancla: 'centro' }],
  ['sello_animado', { texto: 'Rumor sin confirmar', ancla: 'centro' }],
  ['tarjeta_dato', { etiqueta: 'Fecha', titulo: '30 de octubre de 2026', detalle: 'Coliseo La California, Portoviejo', ancla: 'centro' }],
];
const MOMENTOS = [0.0, 0.25, 0.5, 0.75, 1.0];
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prev-'));
  const celdaW = Math.round(W * ESC), celdaH = Math.round(H * ESC);
  const hoja = createCanvas(celdaW * MOMENTOS.length, celdaH * casos.length);
  const ctx = hoja.getContext('2d');
  for (const [fila, [nombre, datos]] of casos.entries()) {
    const r = generarSecuencia({ componente: COMPONENTES[nombre], datos, estilo, w: W, h: H, dirDestino: path.join(dir, String(fila)) });
    console.log(nombre, `caja ${r.cw}x${r.ch} en (${r.x},${r.y}), ${r.secuencia.n} fotogramas, ${r.dur}s`);
    for (const [col, m] of MOMENTOS.entries()) {
      const n = r.secuencia.n, i = Math.min(n - 1, Math.round(m * (n - 1)));
      const img = await loadImage(fs.readFileSync(path.join(dir, String(fila), `anim_${String(i).padStart(3, '0')}.png`)));
      const ox = col * celdaW, oy = fila * celdaH;
      ctx.fillStyle = estilo.colores.fondo; ctx.fillRect(ox, oy, celdaW, celdaH);
      ctx.strokeStyle = '#ccc'; ctx.strokeRect(ox + 0.5, oy + 0.5, celdaW - 1, celdaH - 1);
      ctx.drawImage(img, ox + r.x * ESC, oy + r.y * ESC, r.cw * ESC, r.ch * ESC);
    }
  }
  const salida = process.argv[2] || path.join(os.tmpdir(), 'hoja-estilo.png');
  fs.writeFileSync(salida, hoja.toBuffer('image/png'));
  console.log('HOJA:', salida);
})().catch(e => { console.error('FALLO', e); process.exit(1); });

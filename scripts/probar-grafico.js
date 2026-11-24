// Prueba visual del gráfico de barras que crece sobre un fondo de tarjeta de video. Uso: node scripts/probar-grafico.js  → data-motor/renders/prueba-grafico.mp4
const path = require('path');
const estilo = require('../estilos/capitol');
const E = require('../lienzo/elementos');
const { renderizar } = require('../lienzo/render');
(async () => {
  const salida = path.join(__dirname, '..', 'data-motor', 'renders', 'prueba-grafico.mp4');
  const el = [E.grafico({ titulo: 'Su carrera', items: [{ etiqueta: 'años', valor: 6, t: 1.0 }, { etiqueta: 'títulos', valor: 3, t: 1.8 }, { etiqueta: 'rivales', valor: 12, t: 2.6 }], cy: 0.5, alto: 0.30, t0: 0.5, t1: 5 })];
  await renderizar({ duracion: 5, salida, estilo, subtitulos: null, elementos: el, sonidos: false });
  console.log('listo', salida);
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });

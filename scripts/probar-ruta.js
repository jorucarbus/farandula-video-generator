// Prueba visual de la ruta de avión entre dos lugares cualesquiera (ciudad o país del catálogo).
// Uso: node scripts/probar-ruta.js [Desde] [Hasta]   (por defecto Guayaquil → Tailandia)  → data-motor/renders/prueba-ruta.mp4 + hoja en data-motor/qa/ruta
const path = require('path'), fs = require('fs'), { execFileSync } = require('child_process');
const estilo = require('../estilos/capitol'), E = require('../lienzo/elementos'), { renderizar } = require('../lienzo/render'), D = require('../edl/director');
(async () => {
  const desde = D.resolverPunto(process.argv[2] || 'Guayaquil'), hasta = D.resolverPunto(process.argv[3] || 'Tailandia');
  if (!desde || !hasta) throw new Error('lugar fuera del catálogo');
  const salida = path.join(__dirname, '..', 'data-motor', 'renders', 'prueba-ruta.mp4');
  const el = [E.mapa({ pais: null, desde, hasta, tPin: 2.6, cy: 0.5, alto: 0.40, t0: 0.5, t1: 6 })];
  await renderizar({ duracion: 6, salida, estilo, subtitulos: null, elementos: el, sonidos: false });
  const qa = path.join(__dirname, '..', 'data-motor', 'qa', 'ruta'); fs.mkdirSync(qa, { recursive: true });
  execFileSync(require('ffmpeg-static'), ['-y', '-v', 'error', '-ss', '5', '-i', salida, '-frames:v', '1', '-vf', 'crop=iw:ih*0.5:0:ih*0.25,scale=600:-2', path.join(qa, 'fin.jpg')]);
  console.log('listo', salida);
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });

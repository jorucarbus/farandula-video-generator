// Prueba visual de la ruta de avión en el mapa. Uso: node scripts/probar-ruta.js [Pais] [Ciudad]  → data-motor/renders/prueba-ruta.mp4 (+ cuadros en data-motor/qa/ruta)
const path = require('path'), fs = require('fs'), { execFileSync } = require('child_process');
const estilo = require('../estilos/capitol'), E = require('../lienzo/elementos'), { renderizar } = require('../lienzo/render');
const LUGARES = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'assets', 'lugares.json'), 'utf8'));
(async () => {
  const pais = process.argv[2] || 'Thailand', ciudad = process.argv[3] || 'Guayaquil', l = LUGARES[ciudad];
  const salida = path.join(__dirname, '..', 'data-motor', 'renders', 'prueba-ruta.mp4');
  const el = [E.mapa({ pais, nombrePais: pais === 'Thailand' ? 'Tailandia' : pais, desde: { lon: l.lon, lat: l.lat, nombre: ciudad }, tPin: 2.6, cy: 0.5, alto: 0.40, t0: 0.5, t1: 6 })];
  await renderizar({ duracion: 6, salida, estilo, subtitulos: null, elementos: el, sonidos: false });
  const qa = path.join(__dirname, '..', 'data-motor', 'qa', 'ruta'); fs.mkdirSync(qa, { recursive: true });
  execFileSync(require('ffmpeg-static'), ['-y', '-v', 'error', '-i', salida, '-vf', 'fps=1.5,scale=300:-2,tile=5x2', '-frames:v', '1', path.join(qa, 'hoja.jpg')]);
  console.log('listo', salida);
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });

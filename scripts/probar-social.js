// Prueba visual de VS y apoyo. Uso: node scripts/probar-social.js → data-motor/qa/social/hoja.jpg
const path = require('path'), fs = require('fs'), { execFileSync } = require('child_process');
const estilo = require('../estilos/capitol'), E = require('../lienzo/elementos'), { renderizar } = require('../lienzo/render');
const dir = path.join(__dirname, '..', 'data-motor', 'personas');
const fotos = fs.readdirSync(dir).filter(f => /_circulo\.jpg$|_protagonista\.jpg$/.test(f)).map(f => path.join(dir, f));
if (fotos.length < 2) { console.error('hacen falta al menos 2 fotos en data-motor/personas'); process.exit(1); }
const nom = f => path.basename(f).replace(/_circulo\.jpg$|_protagonista\.jpg$/, '').replace(/-/g, ' ');
(async () => {
  const salida = path.join(__dirname, '..', 'data-motor', 'renders', 'prueba-social.mp4');
  const el = [
    E.vs({ a: { foto: fotos[0], nombre: nom(fotos[0]) }, b: { foto: fotos[1], nombre: nom(fotos[1]) }, t0: 0.3, t1: 3.3 }),
    E.apoyo({ fotos: [{ foto: fotos[0], nombre: nom(fotos[0]) }], t0: 3.5, t1: 6.5 }),
    E.apoyo({ fotos: [], t0: 6.7, t1: 9.7 }),
  ];
  await renderizar({ duracion: 10, salida, estilo, subtitulos: null, elementos: el, sonidos: false });
  const qa = path.join(__dirname, '..', 'data-motor', 'qa', 'social'); fs.mkdirSync(qa, { recursive: true });
  execFileSync(require('ffmpeg-static'), ['-y', '-v', 'error', '-i', salida, '-vf', 'fps=1.25,crop=iw:ih*0.28:0:ih*0.13,scale=540:-2,tile=3x4', '-frames:v', '1', path.join(qa, 'hoja.jpg')]);
  console.log('listo', salida);
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });

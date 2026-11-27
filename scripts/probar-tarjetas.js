// Prueba visual de las tarjetas de abajo (cita, VS, apoyo, gráfico, lista) sobre el montaje, con tomas sintéticas. Uso: node scripts/probar-tarjetas.js → data-motor/qa/tarjetas.jpg
const path = require('path'), fs = require('fs'), os = require('os'), { execFileSync } = require('child_process');
const ffmpeg = process.env.FFMPEG_BIN || require('ffmpeg-static');
const estilo = require('../estilos/capitol'), E = require('../lienzo/elementos'), { renderizar } = require('../lienzo/render');
(async () => {
  const DM = path.join(__dirname, '..', 'data-motor'), qa = path.join(DM, 'qa'); fs.mkdirSync(qa, { recursive: true });
  const fotos = fs.existsSync(path.join(DM, 'personas')) ? fs.readdirSync(path.join(DM, 'personas')).filter(f => /\.(jpe?g|png)$/i.test(f)).map(f => path.join(DM, 'personas', f)) : [];
  if (fotos.length < 2) throw new Error('faltan 2 fotos en data-motor/personas para probar el VS');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tarj-')), clip = path.join(dir, 'c.mp4');
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=720x1280:rate=30:duration=12', '-pix_fmt', 'yuv420p', clip]);
  const m = E.montaje({ cortes: [{ clip, ss: 0, t0: 0.2, t1: 12 }], t0: 0.2, t1: 12 });
  const palabras = 'No voy a permitir que me falten el respeto nunca más en mi vida'.split(' ').map((p, i) => ({ t: 1.2 + i * 0.3 }));
  const els = [m,
    E.cita({ texto: 'No voy a permitir que me falten el respeto nunca más en mi vida', autor: 'Mara Topic', palabras, cy: 0.80, t0: 1, t1: 4.8 }),
    E.vs({ a: { nombre: 'Mara', foto: fotos[0] }, b: { nombre: 'Conny', foto: fotos[1] }, tarjeta: true, cy: 0.80, r: 0.075, t0: 5, t1: 8 }),
    E.apoyo({ fotos: [{ nombre: 'Mara', foto: fotos[0] }, { nombre: 'Conny', foto: fotos[1] }], tarjeta: true, cy: 0.80, r: 0.075, t0: 8.2, t1: 10.2 }),
    E.grafico({ titulo: 'Su carrera', items: [{ etiqueta: 'años', valor: 6, t: 10.4 }, { etiqueta: 'títulos', valor: 3, t: 10.7 }], cy: 0.80, alto: 0.24, t0: 10.3, t1: 11.9 })];
  const salida = path.join(dir, 't.mp4'); await renderizar({ duracion: 12, salida, estilo, subtitulos: null, elementos: els, sonidos: false });
  const hoja = path.join(qa, 'tarjetas.jpg');
  const marcas = [2.3, 4.4, 6.2, 7.5, 9.3, 11.4];
  const fr = marcas.map((t, i) => { const f = path.join(dir, `f${i}.jpg`); execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-ss', String(t), '-i', salida, '-frames:v', '1', '-vf', 'scale=360:-1', f]); return f; });
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', ...fr.flatMap(f => ['-i', f]), '-filter_complex', `${fr.map((_, i) => `[${i}:v]`).join('')}hstack=inputs=${fr.length}`, hoja]);
  console.log('listo', hoja); fs.rmSync(dir, { recursive: true, force: true });
})().catch(e => { console.error(e); process.exit(1); });

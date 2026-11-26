// Prueba visual de las marcas (círculo, cuadro, flecha) que siguen la cara. Uso: node scripts/probar-marcas.js [carpeta] → data-motor/qa/marcas/hoja.jpg
const path = require('path'), fs = require('fs'), { execFileSync } = require('child_process');
const estilo = require('../estilos/capitol'), E = require('../lienzo/elementos'), { renderizar } = require('../lienzo/render');
const R = require('../edl/rostrosLocales'), BIB = path.join(__dirname, '..', 'data-motor', 'biblioteca');
(async () => {
  const carpeta = process.argv[2] || 'Mara_Topic', ro = JSON.parse(fs.readFileSync(path.join(BIB, carpeta + '.rostros.json'), 'utf8')), cl = JSON.parse(fs.readFileSync(path.join(BIB, carpeta + '.clips.json'), 'utf8'));
  // clips con cara en casi todos los cuadros y de duración corta (más muestras por segundo)
  const largo = c => { const q = ro[c.id].cuadros; return q[q.length - 1].t - q[0].t; }, buenos = cl.filter(c => ro[c.id] && ro[c.id].cuadros.filter(q => q.caras.length).length >= 15).sort((x, y) => largo(x) - largo(y)).slice(0, 3);
  if (buenos.length < 3) throw new Error('faltan clips cortos con cara');
  const formas = ['circulo', 'cuadro', 'flecha'], cortes = [];
  buenos.forEach((c, i) => {
    const d = ro[c.id], m = R.mejorRostro(d), ss = Math.max(0, m.t - 0.5), dur = 2.6, cara = R.cajaEnVentana({ cx: m.cx, cy: m.cy, w: m.r * 1.8, h: m.r * 1.8, p: 1 }, d.ancho, d.alto);
    const pista = R.pistaDeRostro(R.serieDensa(c.ruta, ss, dur + 0.5) || d.cuadros, d.ancho, d.alto, ss, dur + 0.4, { cx: cara.cx, cy: cara.cy });
    cortes.push({ clip: c.ruta, ss, t0: 0.2 + i * dur, t1: 0.2 + (i + 1) * dur, trans: 'fundido', marcas: [{ tipo: formas[i], cx: cara.cx, cy: cara.cy, rx: 0.2, ry: 0.14, pista, lado: cara.cx < 0.5 ? 'der' : 'izq', t: 0.2 + i * dur + 0.5, semilla: 11 + i }] });
    console.log(formas[i], c.name.slice(0, 30), 'pista de', pista ? pista.length : 0, 'puntos');
  });
  const salida = path.join(__dirname, '..', 'data-motor', 'renders', 'prueba-marcas.mp4');
  await renderizar({ duracion: 8.3, salida, estilo, subtitulos: null, elementos: [E.montaje({ cortes, t0: 0.2, t1: 8.1 })], sonidos: false });
  const qa = path.join(__dirname, '..', 'data-motor', 'qa', 'marcas'); fs.mkdirSync(qa, { recursive: true });
  execFileSync(require('ffmpeg-static'), ['-y', '-v', 'error', '-i', salida, '-vf', 'fps=1.4,crop=iw*0.8:ih*0.68:iw*0.1:ih*0.15,scale=260:-2,tile=6x2', '-frames:v', '1', path.join(qa, 'hoja.jpg')]);
  console.log('listo');
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });

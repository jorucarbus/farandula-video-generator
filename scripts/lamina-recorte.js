// Escena del MUÑECO DE RECORTES con la voz de la locutora: la protagonista no habla, ACTÚA lo que se cuenta:
// de bastonera (con su bastón girando) a reina (pose de festejo, la corona cae sobre su cabeza, expresión feliz).
// Cabeza/cuerpo/accesorios son FICTICIOS (kit en assets/kit). Uso: node scripts/lamina-recorte.js [--hasta 9]
require('dotenv').config();
const fs = require('fs'), path = require('path');
const estilo = require('../estilos/capitol');
const { alinearPalabras, ventanasDeFrases, normalizar } = require('../edl/tiemposPalabras');
const { crearSubtitulos } = require('../lienzo/subtitulos');
const { muneco } = require('../lienzo/recortes');
const { renderizar } = require('../lienzo/render');
const DM = path.join(__dirname, '..', 'data-motor'), KIT = path.join(__dirname, '..', 'assets', 'kit');
const hasta = Number(process.argv[process.argv.indexOf('--hasta') + 1]) || 9;
const g = JSON.parse(fs.readFileSync(path.join(DM, 'guion-reina.json'), 'utf8'));
const w = JSON.parse(fs.readFileSync(path.join(DM, 'narrativo-voz', 'palabras-whisper.json'), 'utf8'));
const palabras = alinearPalabras(g.script, w.palabras, { duracion: w.duracion });
const V = ventanasDeFrases(g.beats, palabras);
const idx = (k, norm) => { for (let i = V[k].desde; i < V[k].hasta; i++) if (normalizar(palabras[i].palabra) === norm) return i; throw new Error(`no hallé "${norm}"`); };
const t = (norm) => palabras[idx(0, norm)].t0;
(async () => {
  const claves = new Set([idx(0, 'bastonera'), idx(0, 'reina')]);
  const subtitulos = crearSubtitulos({ palabras: palabras.filter(p => p.t0 < hasta), claves, w: 1080, h: 1920, estilo });
  const m = muneco({
    cuerpo: 'cuerpo-bastonera', cabeza: fs.readFileSync(path.join(KIT, 'cabeza-relleno-mujer.png')),
    recorte: { cx: 0.5, cy: 0.345, rx: 0.353, ry: 0.28 }, anclas: { ojoY: 0.01, ojoDx: 0.17, ojoR: 0.05, bocaY: 0.33 },
    cx: 0.5, base: 0.92, alto: 0.60, t0: V[0].t0 + 0.1, t1: hasta,
    saltos: [t('bastonera'), t('gano')],
    poses: [{ t: t('gano'), pieza: 'cuerpo-bastonera-celebrar' }],
    emociones: [{ t: t('gano'), e: 'sorpresa' }, { t: t('corona'), e: 'feliz' }],
    accesorios: [{ id: 'corona', t: t('corona') }],
    pegatinas: [{ id: 'baston', t0: t('bastonera'), t1: t('ahora'), dx: 0.34, dy: 0.42, ancho: 0.40, giro: true }, { id: 'guante-pulgar', t0: t('reina') + 0.1, dx: -0.36, dy: 0.62, ancho: 0.24 }],
  });
  const salida = path.join(DM, 'lamina', 'lamina-recorte.mp4');
  await renderizar({ duracion: hasta, audio: path.join(DM, 'audios', '2026-11-23 Narrativo con voz.mp3'), salida, estilo, subtitulos, elementos: [m], alCuadro: (i, n) => process.stdout.write(`\r${i}/${n}  `) });
  console.log(`\nLISTO ${salida}`);
})().catch(e => { console.error('\nFALLO', e); process.exit(1); });

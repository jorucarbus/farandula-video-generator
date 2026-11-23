// VIDEO NARRATIVO AUTOMÁTICO de punta a punta: guion (beats + hechos) + voz → tiempos por palabra (Whisper) → clips reales
// de la biblioteca que calzan con cada frase → director (modelo con respaldo por reglas) → ensamblador → render.
// Nadie coloca nada a mano. Uso: node scripts/video-narrativo.js [--sin-llm] [--sin-clips] [--carpeta Leidy_Alvarez] [--hasta 74] [--salida ruta.mp4]
// Requiere data-motor/guion-reina.json, la voz en data-motor/audios y data-motor/narrativo-voz/palabras-whisper.json.
// Para usar clips reales primero: node scripts/biblioteca-etiquetar.js <Carpeta>   (descarga y etiqueta una sola vez).
require('dotenv').config();
const fs = require('fs'), path = require('path');
const estilo = require('../estilos/capitol');
const { alinearPalabras, ventanasDeFrases } = require('../edl/tiemposPalabras');
const { dirigir, directorPorReglas, validarDireccion } = require('../edl/director');
const { elegirClips, dimensiones, RAIZ } = require('../edl/biblioteca');
const { crearSubtitulos } = require('../lienzo/subtitulos');
const { ensamblar } = require('../lienzo/ensamblador');
const { renderizar } = require('../lienzo/render');

const DM = path.join(__dirname, '..', 'data-motor'), KIT = path.join(__dirname, '..', 'assets', 'kit');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const g = JSON.parse(fs.readFileSync(path.join(DM, 'guion-reina.json'), 'utf8'));
const w = JSON.parse(fs.readFileSync(path.join(DM, 'narrativo-voz', 'palabras-whisper.json'), 'utf8'));
const AUDIO = path.join(DM, 'audios', '2026-11-23 Narrativo con voz.mp3');
const hasta = Number(arg('--hasta', Math.min(w.duracion, 74)));
const carpeta = arg('--carpeta', 'Leidy_Alvarez');

(async () => {
  const palabras = alinearPalabras(g.script, w.palabras, { duracion: w.duracion });
  const V = ventanasDeFrases(g.beats, palabras);

  // clips reales: qué clip de la biblioteca calza con cada frase (o ninguno)
  let elecciones = new Map(), etiquetas = null, rutaDe = {}; const cfgClips = {};
  const rEtiq = path.join(RAIZ, `${carpeta}.etiquetas.json`), rClips = path.join(RAIZ, `${carpeta}.clips.json`);
  const protagonista = arg('--protagonista', carpeta.replace(/_/g, ' '));
  const infoClip = id => { const t = etiquetas[id]; return { ruta: rutaDe[id], ...dimensiones(rutaDe[id]), rostro: t.rostro, duracion: t.duracion }; };
  if (!process.argv.includes('--sin-clips') && fs.existsSync(rEtiq) && fs.existsSync(rClips)) {
    etiquetas = JSON.parse(fs.readFileSync(rEtiq, 'utf8')); rutaDe = Object.fromEntries(JSON.parse(fs.readFileSync(rClips, 'utf8')).map(c => [c.id, c.ruta]));
    const r = await elegirClips(g.beats, etiquetas, { protagonista }); elecciones = r.elecciones;
    console.log(`CLIPS REALES de ${carpeta}: ${Object.keys(etiquetas).length} etiquetados, ${elecciones.size} frases con clip ${r.avisos.join(' || ')}`);
    for (const [i, c] of elecciones) { const t = etiquetas[c.id]; cfgClips[c.id] = infoClip(c.id); console.log(`  frase ${i + 1} ← ${t.fecha} "${t.descripcion.slice(0, 80)}" | ${c.motivo}`); }
  } else console.log('sin clips reales (falta etiquetar la carpeta o --sin-clips)');

  const dir = process.argv.includes('--sin-llm') ? { escenas: directorPorReglas(g.beats, g.hechos, elecciones), origen: 'reglas', avisos: [] } : await dirigir(g.beats, g.hechos, { clips: elecciones });
  console.log(`DIRECTOR (${dir.origen}) ${dir.avisos.join(' || ')}`);
  dir.escenas.forEach(e => console.log(`  ${e.beat}. ${e.principal}${e.muneco ? ` + muñeco ${e.muneco.pose}/${e.muneco.emocion}${e.muneco.accesorio ? '/' + e.muneco.accesorio : ''}` : ''} | extras: ${(e.extras || []).map(x => x.icono || x.tipo).join(', ') || '-'}`));
  const errores = validarDireccion(dir.escenas, g.beats, g.hechos, elecciones); if (errores.length) throw new Error('dirección inválida: ' + errores.join('; '));
  const escenas = dir.escenas.filter(e => V[e.beat - 1].t0 < hasta);
  // relleno de huecos: clips de la protagonista con rostro (primero los de acción, luego por tamaño del rostro); nunca pantalla vacía
  const relleno = etiquetas ? { ids: Object.values(etiquetas).filter(t => t.rostro && rutaDe[t.id] && fs.existsSync(rutaDe[t.id]))
    .sort((a, b) => (b.tipo !== 'otro') - (a.tipo !== 'otro') || b.rostro.r - a.rostro.r).map(t => t.id), info: infoClip } : null;
  // cabeza: la de plastilina (con pelo y cuello) si existe; --cabeza relleno usa la foto ficticia de antes
  const plast = path.join(KIT, 'cabeza-leidy-plastilina'), usaPlast = arg('--cabeza', 'plastilina') === 'plastilina' && fs.existsSync(plast + '.png');
  const cab = usaPlast ? { foto: fs.readFileSync(plast + '.png'), ...(({ libre, anclas }) => ({ recorte: { libre }, anclas }))(JSON.parse(fs.readFileSync(plast + '.json', 'utf8'))) }
    : { foto: fs.readFileSync(path.join(KIT, 'cabeza-relleno-mujer.png')), recorte: { cx: 0.5, cy: 0.345, rx: 0.353, ry: 0.28 } };
  const { elementos, claves, avisos } = ensamblar(escenas, g.beats.slice(0, escenas.length), V, palabras, { ...cab, proporcion: 0.30, clips: cfgClips, relleno });
  if (avisos.length) console.log('AVISOS:', avisos.join(' | '));
  const subtitulos = crearSubtitulos({ palabras: palabras.filter(p => p.t0 < hasta), claves, w: 1080, h: 1920, estilo });
  const salida = arg('--salida', path.join(DM, 'lamina', 'video-narrativo.mp4'));
  fs.mkdirSync(path.dirname(salida), { recursive: true });
  const ini = Date.now();
  await renderizar({ duracion: hasta, audio: AUDIO, salida, estilo, subtitulos, elementos: elementos.filter(e => e.t0 < hasta), alCuadro: (i, n) => process.stdout.write(`\r${i}/${n}  `) });
  console.log(`\nLISTO ${salida} (${Math.round((Date.now() - ini) / 1000)} s, ${elementos.length} elementos)`);
})().catch(e => { console.error('\nFALLO', e); process.exit(1); });

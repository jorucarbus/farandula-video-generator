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
const { envolventeDeVoz } = require('../lienzo/voz');
const { visemasDesdePalabras } = require('../lienzo/titere-rig');
const { ventanasDeCitas, vozSoloEnCitas } = require('../lienzo/citas');

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
    etiquetas = JSON.parse(fs.readFileSync(rEtiq, 'utf8'));
    const nac = arg('--nacimiento', null); // YYYY-MM-DD: solo clips de cuando ya era mayor de edad (no se muestra a la persona siendo menor)
    if (nac) { const mayor = String(Number(nac.slice(0, 4)) + 18) + nac.slice(4), antes = Object.keys(etiquetas).length; etiquetas = Object.fromEntries(Object.entries(etiquetas).filter(([, t]) => t.fecha >= mayor)); console.log('MAYOR DE EDAD desde ' + mayor + ': ' + Object.keys(etiquetas).length + ' de ' + antes + ' clips'); } rutaDe = Object.fromEntries(JSON.parse(fs.readFileSync(rClips, 'utf8')).map(c => [c.id, c.ruta]));
    const r = await elegirClips(g.beats, etiquetas, { protagonista }); elecciones = r.elecciones;
    console.log(`CLIPS REALES de ${carpeta}: ${Object.keys(etiquetas).length} etiquetados, ${elecciones.size} frases con clip ${r.avisos.join(' || ')}`);
    for (const [i, c] of elecciones) { const t = etiquetas[c.id]; cfgClips[c.id] = infoClip(c.id); console.log(`  frase ${i + 1} ← ${t.fecha} "${t.descripcion.slice(0, 80)}" | ${c.motivo}`); }
  } else console.log('sin clips reales (falta etiquetar la carpeta o --sin-clips)');

  const dir = process.argv.includes('--sin-llm') ? { escenas: directorPorReglas(g.beats, g.hechos, elecciones), origen: 'reglas', avisos: [] } : await dirigir(g.beats, g.hechos, { clips: elecciones });
  console.log(`DIRECTOR (${dir.origen}) ${dir.avisos.join(' || ')}`);
  dir.escenas.forEach(e => console.log(`  ${e.beat}. ${e.principal}${e.muneco ? ` + muñeco ${e.muneco.pose}/${e.muneco.emocion}${e.muneco.accesorio ? '/' + e.muneco.accesorio : ''}` : ''} | extras: ${(e.extras || []).map(x => x.icono || x.tipo).join(', ') || '-'}`));
  const errores = validarDireccion(dir.escenas, g.beats, g.hechos, elecciones); if (errores.length) throw new Error('dirección inválida: ' + errores.join('; '));
  const escenas = dir.escenas.filter(e => V[e.beat - 1].t0 < hasta);
  // montaje de fondo: clips de la protagonista con rostro, primero los de acción y luego por tamaño del rostro (cada uno se usa una sola vez).
  // --sin-montaje vuelve al diseño anterior (ventana pequeña de 3 s + relleno de huecos).
  const lista = etiquetas ? Object.values(etiquetas).filter(t => t.rostro && rutaDe[t.id] && fs.existsSync(rutaDe[t.id])).sort((a, b) => (b.tipo !== 'otro') - (a.tipo !== 'otro') || b.rostro.r - a.rostro.r).map(t => t.id) : [];
  const montaje = etiquetas && !process.argv.includes('--sin-montaje') ? { ids: lista, info: id => ({ ruta: rutaDe[id], rostro: etiquetas[id].rostro, duracion: etiquetas[id].duracion }) } : null;
  const relleno = etiquetas && !montaje ? { ids: lista, info: infoClip } : null;
  // cabeza y kit (--cabeza): rig-foto (por defecto: muñeco articulado de piezas de foto, assets/foto-rig) | plastilina | fotos (muñeco de foto de una pieza)
  const KP = path.join(__dirname, '..', 'assets', 'kit-plastilina', 'rig'), KF = path.join(__dirname, '..', 'assets', 'foto-rig'), modoCab = arg('--cabeza', fs.existsSync(path.join(KF, 'rig.json')) ? 'rig-foto' : 'plastilina');
  const usaPlast = modoCab === 'plastilina' && fs.existsSync(path.join(KP, 'cabeza.png')), usaRigFoto = modoCab === 'rig-foto' && fs.existsSync(path.join(KF, 'rig.json'));
  const cab = usaRigFoto ? { kit: 'rig-foto' } // muñeco articulado de piezas de FOTO (assets/foto-rig): manos de piel, bocas fotográficas por visema
    : usaPlast ? { kit: 'plastilina' } // muñeco articulado de piezas (assets/kit-plastilina/rig)
    : { foto: fs.readFileSync(path.join(KIT, 'cabeza-relleno-mujer.png')), recorte: { cx: 0.5, cy: 0.345, rx: 0.353, ry: 0.28 } };
  // voz del muñeco: abertura/energía del audio y VISEMAS sacados del texto y los tiempos de cada palabra (sincronía labial)
  const FPS = 30, env = await envolventeDeVoz(AUDIO, { fps: FPS, duracion: hasta }), visemas = visemasDesdePalabras(palabras.map(p => ({ texto: p.palabra, t0: p.t0, t1: p.t1 })), FPS, Math.ceil(hasta * FPS) + 1), vozTotal = { ...env, visemas };
  // REGLA: la protagonista no habla con la voz del narrador, solo reacciona; su boca solo se sincroniza donde el guion la CITA (comillas o beat.cita). --lipsync-total solo para pruebas.
  const citas = ventanasDeCitas(g.beats, palabras, V), voz = process.argv.includes('--lipsync-total') ? vozTotal : vozSoloEnCitas(vozTotal, citas, FPS);
  console.log(citas.length ? `CITAS (la protagonista habla): ${citas.map(c => c.t0.toFixed(1) + '-' + c.t1.toFixed(1) + 's').join(', ')}` : 'Sin citas: la protagonista solo reacciona (no hay sincronía labial).');
  const { elementos, claves, avisos } = ensamblar(escenas, g.beats.slice(0, escenas.length), V, palabras, { ...cab, proporcion: 0.30, clips: cfgClips, relleno, montaje, voz });
  if (avisos.length) console.log('AVISOS:', avisos.join(' | '));
  const subtitulos = crearSubtitulos({ palabras: palabras.filter(p => p.t0 < hasta), claves, w: 1080, h: 1920, estilo });
  const salida = arg('--salida', path.join(DM, 'lamina', 'video-narrativo.mp4'));
  fs.mkdirSync(path.dirname(salida), { recursive: true });
  const ini = Date.now();
  await renderizar({ duracion: hasta, audio: AUDIO, salida, estilo, subtitulos, elementos: elementos.filter(e => e.t0 < hasta), alCuadro: (i, n) => process.stdout.write(`\r${i}/${n}  `) });
  console.log(`\nLISTO ${salida} (${Math.round((Date.now() - ini) / 1000)} s, ${elementos.length} elementos)`);
})().catch(e => { console.error('\nFALLO', e); process.exit(1); });

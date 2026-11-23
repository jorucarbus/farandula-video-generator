// VIDEO NARRATIVO AUTOMÁTICO de punta a punta: guion (beats + hechos) + voz → tiempos por palabra (Whisper) → director
// (modelo con respaldo por reglas) → ensamblador → render. Nadie coloca nada a mano.
// Uso: node scripts/video-narrativo.js [--sin-llm] [--hasta 74] [--salida ruta.mp4]
// Requiere data-motor/guion-reina.json, la voz en data-motor/audios y data-motor/narrativo-voz/palabras-whisper.json (o WHISPER_PY).
require('dotenv').config();
const fs = require('fs'), path = require('path');
const estilo = require('../estilos/capitol');
const { alinearPalabras, ventanasDeFrases } = require('../edl/tiemposPalabras');
const { dirigir, directorPorReglas, validarDireccion } = require('../edl/director');
const { crearSubtitulos } = require('../lienzo/subtitulos');
const { ensamblar } = require('../lienzo/ensamblador');
const { envolventeDeVoz } = require('../lienzo/voz');
const { renderizar } = require('../lienzo/render');

const DM = path.join(__dirname, '..', 'data-motor'), KIT = path.join(__dirname, '..', 'assets', 'kit');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const g = JSON.parse(fs.readFileSync(path.join(DM, 'guion-reina.json'), 'utf8'));
const w = JSON.parse(fs.readFileSync(path.join(DM, 'narrativo-voz', 'palabras-whisper.json'), 'utf8'));
const AUDIO = path.join(DM, 'audios', '2026-11-23 Narrativo con voz.mp3');
const hasta = Number(arg('--hasta', Math.min(w.duracion, 74)));

(async () => {
  const palabras = alinearPalabras(g.script, w.palabras, { duracion: w.duracion });
  const V = ventanasDeFrases(g.beats, palabras);
  const dir = process.argv.includes('--sin-llm') ? { escenas: directorPorReglas(g.beats, g.hechos), origen: 'reglas', avisos: [] } : await dirigir(g.beats, g.hechos);
  console.log(`DIRECTOR (${dir.origen}) ${dir.avisos.join(' || ')}`);
  dir.escenas.forEach(e => console.log(`  ${e.beat}. ${e.principal}${e.muneco ? ` + muñeco ${e.muneco.pose}/${e.muneco.emocion}${e.muneco.accesorio ? '/' + e.muneco.accesorio : ''}` : ''} | extras: ${(e.extras || []).map(x => x.icono || x.tipo).join(', ') || '-'}`));
  const errores = validarDireccion(dir.escenas, g.beats, g.hechos); if (errores.length) throw new Error('dirección inválida: ' + errores.join('; '));
  const escenas = dir.escenas.filter(e => V[e.beat - 1].t0 < hasta);
  const { elementos, claves } = ensamblar(escenas, g.beats.slice(0, escenas.length), V, palabras, { foto: fs.readFileSync(path.join(KIT, 'cabeza-relleno-mujer.png')), recorte: { cx: 0.5, cy: 0.345, rx: 0.353, ry: 0.28 }, proporcion: 0.30 });
  const subtitulos = crearSubtitulos({ palabras: palabras.filter(p => p.t0 < hasta), claves, w: 1080, h: 1920, estilo });
  const salida = arg('--salida', path.join(DM, 'lamina', 'video-narrativo.mp4'));
  fs.mkdirSync(path.dirname(salida), { recursive: true });
  const ini = Date.now();
  await renderizar({ duracion: hasta, audio: AUDIO, salida, estilo, subtitulos, elementos: elementos.filter(e => e.t0 < hasta), alCuadro: (i, n) => process.stdout.write(`\r${i}/${n}  `) });
  console.log(`\nLISTO ${salida} (${Math.round((Date.now() - ini) / 1000)} s, ${elementos.length} elementos)`);
})().catch(e => { console.error('\nFALLO', e); process.exit(1); });

// Lámina de estilo (fusión capitol + revolutia) sobre la voz del video narrativo: subtítulos arriba palabra por
// palabra, retrato en círculo, mapa con marcador, recuadro vertical con marcas a mano, cifra y lista numerada.
// Rostros/clips: material de la biblioteca como RELLENO (el retrato dice "Protagonista"); lo que se prueba es el estilo.
// Uso: node scripts/lamina-estilo.js [--hasta 37]   Requiere data-motor/guion-reina.json y palabras-whisper.json
require('dotenv').config();
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const estilo = require('../estilos/capitol');
const { alinearPalabras, ventanasDeFrases, normalizar } = require('../edl/tiemposPalabras');
const { crearSubtitulos } = require('../lienzo/subtitulos');
const E = require('../lienzo/elementos');
const { renderizar } = require('../lienzo/render');

const DM = path.join(__dirname, '..', 'data-motor'), TV = path.join(__dirname, '..', 'temp-videos');
const hasta = Number(process.argv[process.argv.indexOf('--hasta') + 1]) || 37;
const g = JSON.parse(fs.readFileSync(path.join(DM, 'guion-reina.json'), 'utf8'));
const w = JSON.parse(fs.readFileSync(path.join(DM, 'narrativo-voz', 'palabras-whisper.json'), 'utf8'));
const palabras = alinearPalabras(g.script, w.palabras, { duracion: w.duracion });
const V = ventanasDeFrases(g.beats, palabras);
// Primera palabra (normalizada) dentro de la frase k (0-based); devuelve su índice global.
const idx = (k, norm, n = 1) => { let c = 0; for (let i = V[k].desde; i < V[k].hasta; i++) if (normalizar(palabras[i].palabra) === norm && ++c === n) return i; throw new Error(`no hallé "${norm}" en la frase ${k + 1}`); };
const t0De = (k, norm, n) => palabras[idx(k, norm, n)].t0;

const fotograma = (archivo, t) => execFileSync(ffmpeg, ['-v', 'error', '-ss', String(t), '-i', path.join(TV, archivo), '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-'], { maxBuffer: 1 << 26 });
const CLIP_RETRATO = 'src_12-mpm8Qds6RaJCeQDbEdjStPjDahmJ8T.mp4', CLIP_VENTANA = 'src_18YH0mzgu-NbElBlNlxycaruKsiACKz0H.mp4';

const claves = new Set([idx(0, 'bastonera'), idx(1, 'chone'), idx(3, 'anos'), idx(4, 'titulos')]);
const subtitulos = crearSubtitulos({ palabras: palabras.filter((_, i) => palabras[i].t0 < hasta), claves, w: 1080, h: 1920, estilo });
const elementos = [
  E.retrato({ foto: fotograma(CLIP_RETRATO, 1.2), nombre: 'Protagonista', cx: 0.5, cy: 0.52, r: 0.22, foco: { x: 0.5, y: 0.36 }, t0: V[0].t0 + 0.4, t1: V[0].t1 + 0.4 }),
  E.mapa({ pais: 'Ecuador', lugar: { lon: -80.0937, lat: -0.6836, nombre: 'Chone' }, tPin: t0De(1, 'chone'), t0: V[1].t0, t1: V[1].t1 + 0.3 }),
  E.ventanaClip({ clip: path.join(TV, CLIP_VENTANA), ss: 0.4, t0: V[2].t0, t1: V[2].t1 + 0.3,
    marcas: [{ tipo: 'circulo', cx: 0.5, cy: 0.33, rx: 0.27, ry: 0.15, t: t0De(2, 'amazonas') }, { tipo: 'subrayado', x0: 0.30, y0: 0.655, x1: 0.70, y1: 0.655, t: t0De(2, 'latinos') }] }),
  E.cifra({ valor: 6, sufijo: 'años', cy: 0.5, t0: t0De(3, 'seis') - 0.1, t1: V[3].t1 + 0.4 }),
  E.listaNumerada({ titulo: 'Títulos', cy: 0.5, t0: V[4].t0 + 0.2, t1: V[4].t1 + 0.3,
    items: [{ texto: 'Chonera Bonita 2023', t: t0De(4, 'chonera') }, { texto: 'Miss Turismo Manabí 2024', t: t0De(4, 'miss') }, { texto: 'Reina de Chone 2026', t: t0De(4, 'reina') }] }),
].filter(e => e.t0 < hasta);
console.log('MUESTRAS', JSON.stringify({ pin: +(t0De(1, 'chone') + 0.9).toFixed(1), circulo: +(t0De(2, 'amazonas') + 0.9).toFixed(1), cifra: +(t0De(3, 'seis') + 1.2).toFixed(1), lista: +(t0De(4, 'reina') + 0.8).toFixed(1) }));
const salida = path.join(DM, 'lamina', 'lamina-estilo.mp4');
fs.mkdirSync(path.dirname(salida), { recursive: true });
const ini = Date.now();
renderizar({ duracion: hasta, audio: path.join(DM, 'audios', '2026-11-23 Narrativo con voz.mp3'), salida, estilo, subtitulos, elementos, alCuadro: (i, n) => process.stdout.write(`\r${i}/${n}  `) })
  .then(() => console.log(`\nLISTO ${salida} (${Math.round((Date.now() - ini) / 1000)} s)`)).catch(e => { console.error('\nFALLO', e); process.exit(1); });

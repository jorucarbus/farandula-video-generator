// Lámina DENSA: varias piezas por frase, cada una en su palabra, con efectos de sonido sintetizados por evento.
// Misma voz y tiempos (Whisper) que lamina-estilo.js. Uso: node scripts/lamina-denso.js [--hasta 37] [--sin-sonido]
require('dotenv').config();
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const estilo = require('../estilos/capitol');
const { alinearPalabras, ventanasDeFrases, normalizar } = require('../edl/tiemposPalabras');
const { crearSubtitulos } = require('../lienzo/subtitulos');
const E = require('../lienzo/elementos');
const P = require('../lienzo/piezas');
const { renderizar } = require('../lienzo/render');

const DM = path.join(__dirname, '..', 'data-motor'), TV = path.join(__dirname, '..', 'temp-videos');
const hasta = Number(process.argv[process.argv.indexOf('--hasta') + 1]) || 37;
const g = JSON.parse(fs.readFileSync(path.join(DM, 'guion-reina.json'), 'utf8'));
const w = JSON.parse(fs.readFileSync(path.join(DM, 'narrativo-voz', 'palabras-whisper.json'), 'utf8'));
const palabras = alinearPalabras(g.script, w.palabras, { duracion: w.duracion });
const V = ventanasDeFrases(g.beats, palabras);
const idx = (k, norm, n = 1) => { let c = 0; for (let i = V[k].desde; i < V[k].hasta; i++) if (normalizar(palabras[i].palabra) === norm && ++c === n) return i; throw new Error(`no hallé "${norm}" en la frase ${k + 1}`); };
const t0De = (k, norm, n) => palabras[idx(k, norm, n)].t0;
const fotograma = (archivo, t) => execFileSync(ffmpeg, ['-v', 'error', '-ss', String(t), '-i', path.join(TV, archivo), '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-'], { maxBuffer: 1 << 26 });
const CLIP_RETRATO = 'src_12-mpm8Qds6RaJCeQDbEdjStPjDahmJ8T.mp4', CLIP_VENTANA = 'src_18YH0mzgu-NbElBlNlxycaruKsiACKz0H.mp4';
const fin = k => V[k].t1 + 0.4;

const claves = new Set([idx(0, 'bastonera'), idx(0, 'reina'), idx(1, 'chone'), idx(3, 'anos'), idx(4, 'titulos')]);
const subtitulos = crearSubtitulos({ palabras: palabras.filter(p => p.t0 < hasta), claves, w: 1080, h: 1920, estilo });
const elementos = [
  // Frase 1 — de bastonera a reina: retrato arriba, progresión A→B abajo
  E.retrato({ foto: fotograma(CLIP_RETRATO, 1.2), nombre: 'Protagonista', cx: 0.5, cy: 0.31, r: 0.13, foco: { x: 0.5, y: 0.36 }, t0: V[0].t0 + 0.3, t1: fin(0) }),
  P.progresion({ cy: 0.64, t1: fin(0), nodos: [{ icono: 'wand', etiqueta: 'Bastonera', t: t0De(0, 'bastonera') }, { icono: 'crown', etiqueta: 'Reina de Manabí', t: t0De(0, 'reina') }] }),
  // Frase 2 — nació en Chone
  P.insignia({ icono: 'calendar-event', color: 'negro', etiqueta: '30 de noviembre de 2006', cx: 0.5, cy: 0.27, r: 0.065, t0: t0De(1, '30'), t1: fin(1) }),
  E.mapa({ pais: 'Ecuador', lugar: { lon: -80.0937, lat: -0.6836, nombre: 'Chone' }, tPin: t0De(1, 'chone'), cy: 0.58, t0: V[1].t0, t1: fin(1) }),
  // Frase 3 — Unidad Educativa Amazonas y el grupo Latinos
  E.ventanaClip({ clip: path.join(TV, CLIP_VENTANA), ss: 0.4, cy: 0.58, t0: V[2].t0, t1: fin(2),
    marcas: [{ tipo: 'circulo', cx: 0.5, cy: 0.33, rx: 0.27, ry: 0.15, t: t0De(2, 'amazonas') }, { tipo: 'subrayado', x0: 0.30, y0: 0.655, x1: 0.70, y1: 0.655, t: t0De(2, 'latinos') }] }),
  P.insignia({ icono: 'school', color: 'verde', etiqueta: 'Unidad Educativa Amazonas', cx: 0.27, cy: 0.30, r: 0.06, t0: t0De(2, 'educativa'), t1: fin(2) }),
  P.insignia({ icono: 'music', color: 'rojo', etiqueta: 'Latinos', cx: 0.74, cy: 0.86, r: 0.06, t0: t0De(2, 'musical'), t1: fin(2) }),
  // Frase 4 — seis años en TikTok e Instagram
  E.cifra({ valor: 6, sufijo: 'años', cy: 0.42, t0: t0De(3, 'seis') - 0.1, t1: fin(3) }),
  P.insignia({ icono: 'brand-tiktok', color: 'negro', etiqueta: 'TikTok', cx: 0.3, cy: 0.64, r: 0.075, t0: t0De(3, 'tiktok'), t1: fin(3) }),
  P.insignia({ icono: 'brand-instagram', color: 'rojo', etiqueta: 'Instagram', cx: 0.7, cy: 0.64, r: 0.075, t0: t0De(3, 'instagram'), t1: fin(3) }),
  // Frase 5 — los títulos
  P.insignia({ icono: 'trophy', color: 'verde', cx: 0.5, cy: 0.29, r: 0.07, t0: t0De(4, 'titulos'), t1: fin(4) }),
  E.listaNumerada({ titulo: 'Títulos', cy: 0.58, t0: V[4].t0 + 0.2, t1: fin(4),
    items: [{ texto: 'Chonera Bonita 2023', t: t0De(4, 'chonera') }, { texto: 'Miss Turismo Manabí 2024', t: t0De(4, 'miss') }, { texto: 'Reina de Chone 2026', t: t0De(4, 'reina') }] }),
].filter(e => e.t0 < hasta);
const salida = path.join(DM, 'lamina', 'lamina-denso.mp4');
fs.mkdirSync(path.dirname(salida), { recursive: true });
const ini = Date.now();
renderizar({ duracion: hasta, audio: path.join(DM, 'audios', '2026-11-23 Narrativo con voz.mp3'), salida, estilo, subtitulos, elementos, sonidos: !process.argv.includes('--sin-sonido'), alCuadro: (i, n) => process.stdout.write(`\r${i}/${n}  `) })
  .then(() => console.log(`\nLISTO ${salida} (${Math.round((Date.now() - ini) / 1000)} s) — ${elementos.reduce((n, e) => n + (e.eventos || []).length, 0)} eventos de sonido`)).catch(e => { console.error('\nFALLO', e); process.exit(1); });

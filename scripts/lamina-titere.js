// Lámina con MARIONETA: habla (mandíbula según la voz), gesticula, señala y celebra, junto a escenario mínimo, mapa y piezas.
// Misma voz y tiempos (Whisper) que las láminas anteriores. Cabeza = foto de relleno (cuando se conecte, la del protagonista).
// Uso: node scripts/lamina-titere.js [--hasta 37]
require('dotenv').config();
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const estilo = require('../estilos/capitol');
const { alinearPalabras, ventanasDeFrases, normalizar } = require('../edl/tiemposPalabras');
const { crearSubtitulos } = require('../lienzo/subtitulos');
const E = require('../lienzo/elementos');
const P = require('../lienzo/piezas');
const { titere } = require('../lienzo/titere');
const { escenario } = require('../lienzo/escenarios');
const { envolventeDeVoz } = require('../lienzo/voz');
const { renderizar } = require('../lienzo/render');

const DM = path.join(__dirname, '..', 'data-motor'), TV = path.join(__dirname, '..', 'temp-videos');
const hasta = Number(process.argv[process.argv.indexOf('--hasta') + 1]) || 37;
const AUDIO = path.join(DM, 'audios', '2026-11-23 Narrativo con voz.mp3');
const g = JSON.parse(fs.readFileSync(path.join(DM, 'guion-reina.json'), 'utf8'));
const w = JSON.parse(fs.readFileSync(path.join(DM, 'narrativo-voz', 'palabras-whisper.json'), 'utf8'));
const palabras = alinearPalabras(g.script, w.palabras, { duracion: w.duracion });
const V = ventanasDeFrases(g.beats, palabras);
const idx = (k, norm, n = 1) => { let c = 0; for (let i = V[k].desde; i < V[k].hasta; i++) if (normalizar(palabras[i].palabra) === norm && ++c === n) return i; throw new Error(`no hallé "${norm}" en la frase ${k + 1}`); };
const t0De = (k, norm, n) => palabras[idx(k, norm, n)].t0;
const fotograma = (archivo, t) => execFileSync(ffmpeg, ['-v', 'error', '-ss', String(t), '-i', path.join(TV, archivo), '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-'], { maxBuffer: 1 << 26 });
const FOTO = fotograma('src_12-mpm8Qds6RaJCeQDbEdjStPjDahmJ8T.mp4', 1.2), RECORTE = { cx: 0.5, cy: 0.37, rx: 0.40, ry: 0.25 };
const fin = k => V[k].t1 + 0.4;

(async () => {
  const voz = await envolventeDeVoz(AUDIO, { fps: 30, duracion: hasta });
  const claves = new Set([idx(0, 'bastonera'), idx(0, 'reina'), idx(1, 'chone'), idx(2, 'educativa'), idx(3, 'anos'), idx(4, 'titulos')]);
  const subtitulos = crearSubtitulos({ palabras: palabras.filter(p => p.t0 < hasta), claves, w: 1080, h: 1920, estilo });
  const nina = (o) => titere({ genero: 'mujer', foto: FOTO, recorte: RECORTE, voz, palabras, ...o });
  const elementos = [
    // Frase 1 — bastonera → reina: la marioneta habla y señala la progresión a su derecha
    nina({ cx: 0.27, base: 0.90, alto: 0.46, t0: V[0].t0 + 0.2, t1: fin(0), acciones: [{ plantilla: 'senalar', lado: 'D', t0: t0De(0, 'bastonera') - 0.3, t1: t0De(0, 'reina') + 1.2 }] }),
    P.progresion({ cx: 0.70, sep: 0.27, cy: 0.56, t1: fin(0), nodos: [{ icono: 'wand', etiqueta: 'Bastonera', t: t0De(0, 'bastonera') }, { icono: 'crown', etiqueta: 'Reina', t: t0De(0, 'reina') }] }),
    // Frase 2 — nació en Chone (sin marioneta: el mapa manda)
    P.insignia({ icono: 'calendar-event', color: 'negro', etiqueta: '30 de noviembre de 2006', cx: 0.5, cy: 0.27, r: 0.065, t0: t0De(1, '30'), t1: fin(1) }),
    E.mapa({ pais: 'Ecuador', lugar: { lon: -80.0937, lat: -0.6836, nombre: 'Chone' }, tPin: t0De(1, 'chone'), cy: 0.58, t0: V[1].t0, t1: fin(1) }),
    // Frase 3 — una casa con letrero; la marioneta la señala
    escenario({ tipo: 'casa', texto: 'Unidad Educativa Amazonas', cx: 0.70, base: 0.90, ancho: 0.56, t0: t0De(2, 'unidad') - 0.2, t1: fin(2) }),
    nina({ cx: 0.26, base: 0.90, alto: 0.46, t0: V[2].t0, t1: fin(2), acciones: [{ plantilla: 'senalar', lado: 'D', t0: t0De(2, 'unidad') - 0.2, t1: t0De(2, 'amazonas') + 1.2 }] }),
    // Frase 4 — seis años en redes
    E.cifra({ valor: 6, sufijo: 'años', cy: 0.42, t0: t0De(3, 'seis') - 0.1, t1: fin(3) }),
    P.insignia({ icono: 'brand-tiktok', color: 'negro', etiqueta: 'TikTok', cx: 0.3, cy: 0.64, r: 0.075, t0: t0De(3, 'tiktok'), t1: fin(3) }),
    P.insignia({ icono: 'brand-instagram', color: 'rojo', etiqueta: 'Instagram', cx: 0.7, cy: 0.64, r: 0.075, t0: t0De(3, 'instagram'), t1: fin(3) }),
    // Frase 5 — los títulos: la lista arriba y la marioneta celebra
    E.listaNumerada({ titulo: 'Títulos', cy: 0.40, t0: V[4].t0 + 0.2, t1: fin(4), items: [{ texto: 'Chonera Bonita 2023', t: t0De(4, 'chonera') }, { texto: 'Miss Turismo Manabí 2024', t: t0De(4, 'miss') }, { texto: 'Reina de Chone 2026', t: t0De(4, 'reina') }] }),
    nina({ cx: 0.5, base: 0.94, alto: 0.34, t0: V[4].t0 + 1.0, t1: fin(4), acciones: [{ plantilla: 'celebrar', t0: t0De(4, 'reina') - 0.2, t1: fin(4) }] }),
  ].filter(e => e.t0 < hasta);
  const salida = path.join(DM, 'lamina', 'lamina-titere.mp4');
  fs.mkdirSync(path.dirname(salida), { recursive: true });
  const ini = Date.now();
  await renderizar({ duracion: hasta, audio: AUDIO, salida, estilo, subtitulos, elementos, alCuadro: (i, n) => process.stdout.write(`\r${i}/${n}  `) });
  console.log(`\nLISTO ${salida} (${Math.round((Date.now() - ini) / 1000)} s)`);
})().catch(e => { console.error('\nFALLO', e); process.exit(1); });

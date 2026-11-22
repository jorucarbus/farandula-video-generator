// Render de overlays PNG con ffmpeg (drawtext + color), sin motor web ni dependencias nuevas.
//
// Cada overlay es un PNG TRANSPARENTE del tamaño completo del cuadro (el overlay se pega en 0,0),
// así que las posiciones se calculan acá y montarVideoPlan solo lo muestra entre t0 y t1.
// El texto va por `textfile` (UTF-8): tildes, ñ, comillas y dos puntos no necesitan escape.
//
// Si no hay tipografía o ffmpeg falla, renderPng LANZA: quien llama decide degradar (el video sale
// igual sin ese overlay, ver planEdlARender).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const FFMPEG_BIN = require('ffmpeg-static');

const BARRA = /\\/g;
const rutaFiltro = p => p.replace(BARRA, '/').replace(/:/g, '\\:');

// Estilos: proporciones del cuadro, no píxeles, para que valgan en 9:16 y en 16:9.
// OJO con los alfa del fondo: sobre un lienzo transparente drawtext aplica el alfa de boxcolor DOS
// veces (medido: black@0.62 daba alfa 0.385 = 0.62^2). Por eso se pide la raíz: 0.79 -> ~0.62 real.
const ESTILOS = {
  // Gancho: grande, arriba, texto blanco con borde negro grueso.
  titulo:     { tam: 0.085, maxAncho: 0.88, y: 0.16, color: 'white', borde: 8, fondo: null },
  // "Según X, fecha": franja oscura abajo a la izquierda.
  lowerthird: { tam: 0.042, maxAncho: 0.84, y: 0.74, color: 'white', borde: 0, fondo: 'black@0.79', relleno: 22, izquierda: 0.06 },
  // Sello de rumor: caja roja centrada.
  sello:      { tam: 0.060, maxAncho: 0.80, y: 0.44, color: 'white', borde: 0, fondo: 'red@0.94', relleno: 26 },
};

// Candidatas de tipografía: primero la del catálogo de subtítulos si ya se descargó, luego las del
// sistema. Un `fuenteArchivo` explícito manda sobre todo.
function resolverFuente(fuenteArchivo) {
  const candidatas = [
    fuenteArchivo,
    process.env.OVERLAY_FUENTE,
    path.join(__dirname, '..', 'temp-videos', 'fuentes', 'Anton-Regular.ttf'),
    'C:/Windows/Fonts/arialbd.ttf',
    'C:/Windows/Fonts/arial.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
  ].filter(Boolean);
  const f = candidatas.find(c => { try { return fs.statSync(c).size > 1000; } catch { return false; } });
  if (!f) throw new Error('no hay tipografía disponible para los overlays (definir OVERLAY_FUENTE)');
  return f;
}

// Parte el texto en líneas de hasta `maxChars`, en límites de palabra.
function envolver(texto, maxChars) {
  const lineas = [];
  let actual = '';
  for (const palabra of String(texto).trim().split(/\s+/)) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (prueba.length > maxChars && actual) { lineas.push(actual); actual = palabra; } else { actual = prueba; }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile(FFMPEG_BIN, ['-y', '-loglevel', 'error', ...args], { timeout: 60000 }, (err, _o, stderr) => {
      if (err) reject(new Error(`ffmpeg (overlay): ${(stderr || err.message).slice(-600)}`)); else resolve();
    });
  });
}

// renderPng({texto, estilo, w, h, destino, fuenteArchivo?}) -> destino
async function renderPng({ texto, estilo = 'titulo', w, h, destino, fuenteArchivo }) {
  const e = ESTILOS[estilo];
  if (!e) throw new Error(`estilo de overlay desconocido: ${estilo}`);
  if (!texto || !String(texto).trim()) throw new Error('overlay sin texto');
  const fuente = resolverFuente(fuenteArchivo);
  const tam = Math.round(Math.min(w, h) * e.tam);
  const maxChars = Math.max(6, Math.floor((w * e.maxAncho) / (tam * 0.56)));
  const lineas = envolver(texto, maxChars);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-'));
  const archivoTexto = path.join(dir, 'texto.txt');
  fs.writeFileSync(archivoTexto, lineas.join('\n'), 'utf8');
  try {
    const x = e.izquierda !== undefined ? Math.round(w * e.izquierda) : '(w-text_w)/2';
    let dt = `drawtext=fontfile='${rutaFiltro(fuente)}':textfile='${rutaFiltro(archivoTexto)}':fontsize=${tam}:fontcolor=${e.color}`
      + `:x=${x}:y=${Math.round(h * e.y)}:line_spacing=${Math.round(tam * 0.18)}`;
    if (e.borde) dt += `:borderw=${e.borde}:bordercolor=black`;
    if (e.fondo) dt += `:box=1:boxcolor=${e.fondo}:boxborderw=${e.relleno}`;
    await ffmpeg([
      '-f', 'lavfi', '-i', `color=c=black@0.0:s=${w}x${h}:d=1,format=rgba`,
      '-vf', dt, '-frames:v', '1', destino,
    ]);
    return destino;
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

module.exports = { renderPng, resolverFuente, envolver, ESTILOS };

// Subtítulos animados en formato ASS, sincronizados por porcentaje de caracteres.
// El timing sale del plan de clips: cada párrafo tiene su ventana exacta de tiempo,
// y dentro de ella el texto se reparte en líneas cortas proporcionales a sus caracteres.
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Tipografías disponibles (archivo → nombre de familia para libass)
const FUENTES = {
  poppins: { archivo: 'Poppins-ExtraBold.ttf', familia: 'Poppins ExtraBold' },
  anton: { archivo: 'Anton-Regular.ttf', familia: 'Anton' },
  bangers: { archivo: 'Bangers-Regular.ttf', familia: 'Bangers' },
  luckiest: { archivo: 'LuckiestGuy-Regular.ttf', familia: 'Luckiest Guy' },
  archivo: { archivo: 'ArchivoBlack-Regular.ttf', familia: 'Archivo Black' },
};

const TAMANOS = { chico: 64, mediano: 80, grande: 100 };
const MAX_CHARS_LINEA = 22; // por renglón visible (se permite hasta 2 renglones por bloque)

// Partir el texto de un párrafo en bloques cortos estilo TikTok (en límites de palabra)
function partirEnBloques(texto, maxChars = MAX_CHARS_LINEA * 2) {
  const palabras = texto.split(/\s+/).filter(Boolean);
  const bloques = [];
  let actual = '';
  for (const p of palabras) {
    if ((actual + ' ' + p).trim().length > maxChars && actual) {
      bloques.push(actual.trim());
      actual = p;
    } else {
      actual = (actual + ' ' + p).trim();
    }
  }
  if (actual) bloques.push(actual.trim());
  return bloques;
}

// Insertar salto de línea ASS (\N) si el bloque supera un renglón
function conSaltos(bloque) {
  if (bloque.length <= MAX_CHARS_LINEA) return bloque;
  const palabras = bloque.split(' ');
  let linea1 = '';
  let i = 0;
  while (i < palabras.length && (linea1 + ' ' + palabras[i]).trim().length <= MAX_CHARS_LINEA) {
    linea1 = (linea1 + ' ' + palabras[i]).trim();
    i++;
  }
  const linea2 = palabras.slice(i).join(' ');
  return linea2 ? `${linea1}\\N${linea2}` : linea1;
}

function tiempoASS(segundos) {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = Math.floor(segundos % 60);
  const cs = Math.round((segundos % 1) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function escaparASS(texto) {
  return texto.replace(/[{}]/g, '').replace(/\\(?!N)/g, '');
}

// parrafos: [{texto, caracteres}], plan: [{duracion, parrafoIdx}]
// opciones: {fuente: 'poppins', tamano: 'mediano'}
// Devuelve la ruta del archivo .ass generado
function generarASS(parrafos, plan, opciones = {}, tempDir) {
  const fuente = FUENTES[opciones.fuente] || FUENTES.poppins;
  const tamano = TAMANOS[opciones.tamano] || TAMANOS.mediano;

  // Ventana de tiempo de cada párrafo (suma de las duraciones de sus clips, en orden)
  const ventanas = []; // por parrafoIdx: {inicio, fin}
  let t = 0;
  for (const clip of plan) {
    if (!clip) continue;
    if (!ventanas[clip.parrafoIdx]) ventanas[clip.parrafoIdx] = { inicio: t, fin: t };
    ventanas[clip.parrafoIdx].fin = t + clip.duracion;
    t += clip.duracion;
  }

  const eventos = [];
  parrafos.forEach((p, idx) => {
    const v = ventanas[idx];
    if (!v) return;
    const bloques = partirEnBloques(p.texto);
    const totalChars = bloques.reduce((s, b) => s + b.length, 0) || 1;
    const durVentana = v.fin - v.inicio;

    let cursor = v.inicio;
    for (const bloque of bloques) {
      const dur = durVentana * (bloque.length / totalChars);
      // Animación: pop-in (escala 115%→100%) + fade corto de entrada y salida
      const anim = '{\\fad(90,60)\\fscx115\\fscy115\\t(0,110,\\fscx100\\fscy100)}';
      eventos.push(`Dialogue: 0,${tiempoASS(cursor)},${tiempoASS(cursor + dur)},Base,,0,0,0,,${anim}${conSaltos(escaparASS(bloque))}`);
      cursor += dur;
    }
  });

  const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Base,${fuente.familia},${tamano},&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,7,2,2,60,60,340,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${eventos.join('\n')}
`;

  const assPath = path.join(tempDir, `${opciones.jobId || 'subs_' + Date.now()}_subs.ass`);
  fs.writeFileSync(assPath, ass, 'utf8');
  return assPath;
}

// Descargar el PNG de un emoji desde Twemoji (CC-BY 4.0) con caché local
async function descargarEmoji(emoji, emojisDir) {
  fs.mkdirSync(emojisDir, { recursive: true });
  const codepoints = [...emoji].map(c => c.codePointAt(0).toString(16)).join('-');
  const intentos = [codepoints, codepoints.replace(/-fe0f/g, '')];

  for (const code of intentos) {
    const destino = path.join(emojisDir, `${code}.png`);
    if (fs.existsSync(destino)) return destino;
    try {
      const url = `https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/72x72/${code}.png`;
      const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 });
      fs.writeFileSync(destino, res.data);
      return destino;
    } catch { /* probar siguiente forma */ }
  }
  return null;
}

module.exports = { generarASS, descargarEmoji, FUENTES, TAMANOS };

// Puerta de calidad por clip: ¿se ve bien cuando ocupa la pantalla vertical (1080x1920)?
//
// Mide con ffprobe/ffmpeg (sin modelos, sin costo): resolución efectiva (cuánto hay que ampliar el clip), nitidez,
// barras negras, brillo (muy oscuro/quemado), bitrate por píxel (compresión pesada) y cuadros congelados. Cada clip
// recibe un puntaje 0-100, una lista de motivos y `apto` (true/false). Lo que se descarta no se borra: solo deja de
// elegirse; la dueña decide en el gestor si lo elimina.
//
// Los umbrales son datos (UMBRALES), no código: se ajustan mirando la hoja de contacto de una carpeta.
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const FFMPEG = process.env.FFMPEG_BIN || require('ffmpeg-static');
const FFPROBE = require('ffprobe-static').path;
// El clip NO ocupa toda la pantalla: va dentro de la tarjeta de video, que mide el 61,6 % del ancho del lienzo (1080 → 665 px) y es 9:16 (665x1183).
// La resolución que hace falta es la de la TARJETA, no la del lienzo. (Antes se medía contra 1080x1920 y se descartaban de más los clips de 540x960 y 576x1024.)
const SALIDA = { ancho: 665, alto: 1183 };

const UMBRALES = {
  ampliacionMax: 1.6,      // el clip no se amplía más de 1,6× para cubrir la pantalla (más de eso se ve pastoso)
  ampliacionAviso: 1.25,
  nitidezMin: 0.10,        // 0-1; por debajo, borroso de verdad. OJO: blurdetect baja con piel lisa y fondo desenfocado (retratos nítidos dan 0,12-0,3);
  nitidezAviso: 0.30,      // calibrado mirando la hoja de contacto de Mara_Topic (22 clips): por eso solo el extremo descarta y lo demás es aviso
  barrasMax: 0.18,         // fracción del cuadro ocupada por barras negras (no incluye fondos difuminados)
  brilloMin: 40, brilloMax: 215, // Y promedio (0-255): demasiado oscuro / quemado
  bppMin: 0.035,           // bits por píxel por cuadro: por debajo, compresión muy pesada
  fpsMin: 20,
  duracionMin: 1.0,
};

function correr(bin, args, { maxBuffer = 20 * 1024 * 1024 } = {}) {
  return new Promise((res, rej) => execFile(bin, args, { maxBuffer, windowsHide: true }, (e, so, se) => (e && !so && !se ? rej(e) : res({ so, se, e }))));
}

// Dimensiones visibles (ya rotadas), fps, bitrate y duración. -show_streams porque el ffprobe empaquetado no entiende stream_side_data.
async function sondear(ruta) {
  const { so } = await correr(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_streams', '-show_format', '-of', 'json', ruta]);
  const j = JSON.parse(so), v = (j.streams || [])[0];
  if (!v) throw new Error('sin video: ' + ruta);
  const rot = Math.abs(Number(((v.side_data_list || [])[0] || {}).rotation ?? (v.tags || {}).rotate ?? 0)) % 180;
  const [n, d] = String(v.avg_frame_rate || v.r_frame_rate || '0/1').split('/').map(Number);
  const dur = Number(v.duration || (j.format || {}).duration) || null;
  const bits = Number(v.bit_rate || (j.format || {}).bit_rate) || null;
  return { ancho: rot === 90 ? v.height : v.width, alto: rot === 90 ? v.width : v.height, fps: d ? n / d : null, bitrate: bits, duracion: dur, codec: v.codec_name };
}

// Un solo pase de ffmpeg sobre una ventana del medio del clip, a 2 cuadros por segundo.
async function medir(ruta, duracion, { ventana = 4 } = {}) {
  const ini = duracion && duracion > ventana + 1 ? Math.max(0, duracion / 2 - ventana / 2) : 0;
  const { so, se } = await correr(FFMPEG, ['-hide_banner', '-v', 'info', '-ss', String(ini), '-t', String(ventana), '-i', ruta, '-an',
    '-vf', 'fps=2,blurdetect,cropdetect=limit=24:round=2,signalstats,freezedetect=n=-60dB:d=1.5,metadata=mode=print:file=-', '-f', 'null', '-']);
  const blur = [...so.matchAll(/lavfi\.blur=([\d.]+)/g)].map(m => Number(m[1]));
  const yavg = [...so.matchAll(/lavfi\.signalstats\.YAVG=([\d.]+)/g)].map(m => Number(m[1]));
  const crops = [...se.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)].map(m => ({ w: +m[1], h: +m[2], x: +m[3], y: +m[4] }));
  const media = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
  return { blur: media(blur), brillo: media(yavg), crop: crops.length ? crops[crops.length - 1] : null, congelado: /freeze_start/.test(se), cuadros: blur.length };
}

// Nitidez 0-1 a partir del blur medido (blurdetect: más alto = más borroso). Se normaliza contra la resolución para no
// castigar a los clips grandes, cuyo desenfoque en píxeles es mayor aunque se vean igual de nítidos.
function nitidezDe(blur, ancho) {
  if (blur == null) return null;
  const relativo = blur / Math.max(1, ancho / 1080) / 10; // ~0 = nítido; ≥1 = muy borroso
  return Math.max(0, Math.min(1, 1 - relativo));
}

// Reglas puras (se prueban sin ffmpeg): recibe lo medido y devuelve { puntaje, apto, motivos, avisos }.
function evaluar(info, m, umbrales = UMBRALES) {
  const motivos = [], avisos = [];
  const cubre = Math.max(SALIDA.ancho / info.ancho, SALIDA.alto / info.alto); // ampliación para llenar la tarjeta (recorte "cover")
  const ampliacion = Math.max(1, cubre);
  let puntaje = 100;
  if (ampliacion > umbrales.ampliacionMax) { motivos.push(`resolución baja (${info.ancho}x${info.alto}: se amplía ${ampliacion.toFixed(1)}×)`); puntaje -= 45; }
  else if (ampliacion > umbrales.ampliacionAviso) { avisos.push(`se amplía ${ampliacion.toFixed(2)}×`); puntaje -= 10; }
  const nit = m ? nitidezDe(m.blur, info.ancho) : null;
  if (nit != null && nit < umbrales.nitidezMin) { motivos.push(`borroso (nitidez ${nit.toFixed(2)})`); puntaje -= 35; }
  else if (nit != null && nit < umbrales.nitidezAviso) { avisos.push(`algo suave (nitidez ${nit.toFixed(2)})`); puntaje -= 8; }
  if (m && m.crop && info.ancho && info.alto) {
    const area = (m.crop.w * m.crop.h) / (info.ancho * info.alto), barras = 1 - area;
    if (barras > umbrales.barrasMax) { motivos.push(`barras negras (${Math.round(barras * 100)} % del cuadro)`); puntaje -= 25; }
  }
  if (m && m.brillo != null) {
    if (m.brillo < umbrales.brilloMin) { motivos.push(`muy oscuro (brillo ${Math.round(m.brillo)})`); puntaje -= 25; }
    else if (m.brillo > umbrales.brilloMax) { motivos.push(`quemado (brillo ${Math.round(m.brillo)})`); puntaje -= 20; }
  }
  if (info.bitrate && info.fps) {
    const bpp = info.bitrate / (info.ancho * info.alto * info.fps);
    if (bpp < umbrales.bppMin) { avisos.push(`compresión pesada (${bpp.toFixed(3)} bits/píxel)`); puntaje -= 15; }
  }
  if (info.fps && info.fps < umbrales.fpsMin) { avisos.push(`pocos cuadros por segundo (${Math.round(info.fps)})`); puntaje -= 10; }
  if (info.duracion != null && info.duracion < umbrales.duracionMin) { motivos.push(`dura solo ${info.duracion.toFixed(1)} s`); puntaje -= 30; }
  if (m && m.congelado) { avisos.push('tiene cuadros congelados'); puntaje -= 10; }
  puntaje = Math.max(0, Math.min(100, Math.round(puntaje)));
  return { puntaje, apto: motivos.length === 0, motivos, avisos, ampliacion: +ampliacion.toFixed(2), nitidez: nit == null ? null : +nit.toFixed(2) };
}

async function analizarClip(ruta, umbrales = UMBRALES) {
  const info = await sondear(ruta);
  let m = null;
  try { m = await medir(ruta, info.duracion); } catch { /* sin medidas de imagen: se juzga solo por el archivo */ }
  return { ...evaluar(info, m, umbrales), ancho: info.ancho, alto: info.alto, fps: info.fps ? Math.round(info.fps) : null, bitrate: info.bitrate, duracion: info.duracion, medido: new Date().toISOString().slice(0, 10) };
}

// Recalcula la parte de RESOLUCIÓN de una medición ya guardada (sin necesitar el video): sirve cuando cambia el tamaño de la tarjeta o los umbrales.
// Se conservan los demás motivos (nitidez, barras, brillo, duración) tal como se midieron.
function reevaluarGuardado(q, umbrales = UMBRALES) {
  if (!q || !q.ancho || !q.alto) return q;
  const ampliacion = Math.max(1, Math.max(SALIDA.ancho / q.ancho, SALIDA.alto / q.alto)), sinRes = s => !/^resolución baja|^se amplía/.test(s);
  const motivos = (q.motivos || []).filter(sinRes), avisos = (q.avisos || []).filter(sinRes);
  let puntaje = 100;
  if (ampliacion > umbrales.ampliacionMax) { motivos.unshift(`resolución baja (${q.ancho}x${q.alto}: se amplía ${ampliacion.toFixed(1)}×)`); puntaje -= 45; }
  else if (ampliacion > umbrales.ampliacionAviso) { avisos.unshift(`se amplía ${ampliacion.toFixed(2)}×`); puntaje -= 10; }
  for (const m of motivos) if (!/^resolución baja/.test(m)) puntaje -= /borroso/.test(m) ? 35 : /barras/.test(m) ? 25 : /oscuro|quemado/.test(m) ? 25 : 30;
  for (const a of avisos) if (!/^se amplía/.test(a)) puntaje -= /suave/.test(a) ? 8 : /compresión/.test(a) ? 15 : 10;
  return { ...q, motivos, avisos, apto: motivos.length === 0, ampliacion: +ampliacion.toFixed(2), puntaje: Math.max(0, Math.min(100, Math.round(puntaje))) };
}

// Analiza una carpeta de la biblioteca (usa <carpeta>.clips.json) y guarda <carpeta>.calidad.json. Reanuda: no repite lo ya medido.
async function analizarBiblioteca(raiz, carpeta, { rehacer = false, concurrencia = 3, progreso = null } = {}) {
  const rClips = path.join(raiz, `${carpeta}.clips.json`), rCal = path.join(raiz, `${carpeta}.calidad.json`);
  const clips = JSON.parse(fs.readFileSync(rClips, 'utf8')), previo = !rehacer && fs.existsSync(rCal) ? JSON.parse(fs.readFileSync(rCal, 'utf8')) : {};
  const pendientes = clips.filter(c => c.ruta && fs.existsSync(c.ruta) && !previo[c.id]);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(concurrencia, pendientes.length) }, async () => {
    while (i < pendientes.length) {
      const c = pendientes[i++];
      try { previo[c.id] = await analizarClip(c.ruta); } catch (e) { previo[c.id] = { puntaje: 0, apto: false, motivos: ['no se pudo leer: ' + String(e.message).slice(0, 80)], avisos: [] }; }
      if (progreso) progreso(c, previo[c.id]);
    }
  }));
  fs.writeFileSync(rCal, JSON.stringify(previo, null, 1));
  return previo;
}

// Quita de `etiquetas` ({id: etiqueta}) los clips no aptos. Si quedarían muy pocos, no filtra (mejor una toma regular que una pantalla vacía).
function filtrarAptos(etiquetas, calidad, { minimo = 6 } = {}) {
  const ids = Object.keys(etiquetas), aptos = ids.filter(id => !calidad[id] || calidad[id].apto !== false);
  const descartados = ids.filter(id => !aptos.includes(id));
  if (aptos.length < minimo) return { etiquetas, descartados: [], aviso: descartados.length ? `solo ${aptos.length} clips aptos: no se filtra para no quedarse sin tomas` : '' };
  return { etiquetas: Object.fromEntries(aptos.map(id => [id, etiquetas[id]])), descartados, aviso: '' };
}

module.exports = { SALIDA, reevaluarGuardado, UMBRALES, sondear, medir, nitidezDe, evaluar, analizarClip, analizarBiblioteca, filtrarAptos };

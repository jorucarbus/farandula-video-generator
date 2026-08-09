const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

// Binarios estáticos de npm: no dependen del PATH del sistema (en Railway/Nixpacks
// ffmpeg/ffprobe no llegan al runtime → spawn ENOENT). Se llaman por ruta absoluta.
const FFMPEG_BIN = require('ffmpeg-static');
const FFPROBE_BIN = require('ffprobe-static').path;

const TEMP_DIR = path.join(__dirname, 'temp-videos');

// Límite duro por llamada: si ffmpeg se cuelga (bug de filtros, buffer infinito),
// se mata solo y el error sube en vez de dejar el render congelado para siempre
const FFMPEG_TIMEOUT_MS = 10 * 60 * 1000;

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile(FFMPEG_BIN, ['-y', ...args], { maxBuffer: 1024 * 1024 * 50, timeout: FFMPEG_TIMEOUT_MS, killSignal: 'SIGKILL' }, (err, stdout, stderr) => {
      if (err) {
        const motivo = err.killed ? `timeout de ${FFMPEG_TIMEOUT_MS / 60000} min alcanzado (proceso matado)` : (stderr || '').slice(-500);
        return reject(new Error(`ffmpeg: ${motivo}`));
      }
      resolve(stdout);
    });
  });
}

// ---- Encoder: NVENC (GPU NVIDIA) si está disponible, si no libx264 (CPU) ----
let ENCODER_DETECTADO = null;

async function detectarEncoder() {
  if (ENCODER_DETECTADO) return ENCODER_DETECTADO;
  try {
    await ffmpeg(['-f', 'lavfi', '-i', 'color=c=black:size=256x256:duration=0.2', '-c:v', 'h264_nvenc', '-f', 'null', '-']);
    ENCODER_DETECTADO = 'h264_nvenc';
    console.log('  ⚡ Encoder: NVENC (GPU)');
  } catch {
    ENCODER_DETECTADO = 'libx264';
    console.log('  🖥️ Encoder: libx264 (CPU)');
  }
  return ENCODER_DETECTADO;
}

// Escapar una ruta de Windows para usarla dentro de un filtro de FFmpeg (drive letter ':'
// necesita escaparse o el parser de filtros lo confunde con un separador de opción).
function rutaFiltro(p) {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:');
}

function argsEncoder(encoder) {
  return encoder === 'h264_nvenc'
    ? ['-c:v', 'h264_nvenc', '-preset', 'p4', '-rc', 'vbr', '-cq', '23', '-b:v', '0', '-pix_fmt', 'yuv420p']
    : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p'];
}

function ffprobe(args) {
  return new Promise((resolve, reject) => {
    execFile(FFPROBE_BIN, args, { maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`ffprobe: ${stderr.slice(-300)}`));
      resolve(stdout.trim());
    });
  });
}

// Duración real de un archivo de audio/video en segundos
async function obtenerDuracion(filePath) {
  const out = await ffprobe([
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath,
  ]);
  return parseFloat(out);
}


// ---- Efectos por clip: zoom (Ken Burns, activo toda la duración) + espejo (hflip) ----
// Presets (mismos para zoom y espejo): 'todos' | 'alternado' | 'intercalado' | 'ninguno'
const FPS_EFECTOS = 30;

function decidirEfecto(preset, index) {
  switch (preset) {
    case 'todos': return { activo: true, direccion: 'in' };
    case 'alternado': return { activo: index % 2 === 0, direccion: 'in' };
    // 'intercalado' solo tiene sentido direccional en zoom (in/out); en espejo equivale a alternado.
    case 'intercalado': return { activo: true, direccion: index % 2 === 0 ? 'in' : 'out' };
    default: return { activo: false, direccion: 'in' };
  }
}

// Zoom durante TODA la duración del clip: 'in' 100%→(100+pct)%, 'out' al revés.
// zoompan con d=1 procesa cada frame del video una sola vez (no lo congela como Ken Burns de imagen fija).
//
// Fase 7: progreso con aceleración no lineal (ease-out cúbico) en vez de lineal — el cambio de
// una línea con mejor relación esfuerzo/resultado del plan. Lineal (on/frames) se sentía plano;
// arranca rápido y frena hacia el final, como un zoom hecho a mano.
// min(...,1) al final: si el clip se corta más largo que duracionClip (cola extra para una
// transición xfade, Fase 7), el zoom no se pasa del factor pedido — se sostiene en el 100%
// final durante esa cola, que es justo lo que conviene para la mezcla.
function filtroZoom(direccion, pct, duracionClip) {
  const frames = Math.max(2, Math.round(duracionClip * FPS_EFECTOS));
  const factor = Math.max(0, pct) / 100;
  const progreso = `(1-pow(1-min(on/${frames},1),3))`;
  const expr = direccion === 'out'
    ? `(1+${factor})-${progreso}*${factor}`
    : `1+${progreso}*${factor}`;
  // d DEBE ser un entero de frames. d=1 = 1 frame de salida por frame de entrada
  // (zoom suave sobre el video). d=decimal (ej. d=2.456) rompe con -22 "Invalid
  // argument" en ffmpeg estricto (Railway); d=frames congela el clip (imagen fija).
  return `zoompan=z='${expr}':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=${FPS_EFECTOS}`;
}

// ---- Transiciones entre clips (Fase 7) ----
// Subconjunto curado de las transiciones `xfade` de ffmpeg (tiene 58) — las que se ven bien en
// un corte rápido vertical de farándula, sin las muy lentas/cinematográficas que no pegan con
// el ritmo. 'aleatorio' elige una distinta en cada corte (variedad sin que el usuario elija una
// por una).
const TRANSICIONES_DISPONIBLES = [
  'fade', 'fadeblack', 'wipeleft', 'wiperight', 'wipeup', 'wipedown',
  'slideleft', 'slideright', 'slideup', 'slidedown',
  'circleopen', 'circleclose', 'dissolve', 'pixelize', 'radial', 'zoomin',
];

function elegirTransicion(tipo) {
  if (tipo === 'aleatorio') return TRANSICIONES_DISPONIBLES[Math.floor(Math.random() * TRANSICIONES_DISPONIBLES.length)];
  return TRANSICIONES_DISPONIBLES.includes(tipo) ? tipo : 'fade';
}

// Encadena segmentos YA CORTADOS (algunos con cola extra de `duracion` segundos, ver
// montarVideoPlan) con `xfade` en los cortes activos y `concat` (sin mezcla) en los demás —
// mismo filtro_complex, una sola pasada de ffmpeg. `duracionesVisibles[i]` es la duración QUE
// VE el espectador de cada segmento (sin la cola de mezcla), no la longitud real del archivo.
//
// offset de cada xfade = suma acumulada de duracionesVisibles hasta ese corte: es el punto en
// el tiempo, dentro de la MEZCLA acumulada hasta ahí, donde arranca la cola de ese clip. Ver
// comentario largo en montarVideoPlan para la derivación completa.
async function renderizarConTransiciones(segmentos, duracionesVisibles, outPath, { preset, duracion, tipo, enc }) {
  const inputs = [];
  segmentos.forEach(s => inputs.push('-i', s));

  const filtros = [];
  // Normalizar CADA entrada (fps + formato de pixel) antes de encadenar. Sin esto, alternar
  // `xfade` y `concat` en la misma cadena (preset "alternado") falla con "match the
  // corresponding second input link xfade timebase" — encontrado probando el preset real, no
  // en la teoría: NVENC deja timebases distintas entre segmentos que `concat` no reconcilia
  // antes de entrar al siguiente `xfade`. `fps=30` fuerza el mismo timebase en todas las
  // entradas, así el orden xfade/concat que venga ya no importa.
  segmentos.forEach((_, k) => filtros.push(`[${k}:v]fps=30,format=yuv420p[n${k}]`));

  let etiqueta = '[n0]';
  let acumulado = duracionesVisibles[0];

  for (let k = 0; k < segmentos.length - 1; k++) {
    const activa = decidirEfecto(preset, k).activo;
    const siguiente = `[n${k + 1}]`;
    const salida = k === segmentos.length - 2 ? '[vout]' : `[vx${k}]`;
    // fps=30 encadenado DESPUÉS de xfade/concat, no solo antes: el timebase que cada filtro
    // deja en su salida no siempre hereda el de sus entradas (visto real: entradas ya en 1/30,
    // salida de `concat` en otro timebase, y el siguiente `xfade` la rechaza). Re-normalizar en
    // cada etapa es lo único que sostiene la cadena completa sin importar cuántas veces alterne.
    if (activa) {
      const t = elegirTransicion(tipo);
      filtros.push(`${etiqueta}${siguiente}xfade=transition=${t}:duration=${duracion.toFixed(2)}:offset=${acumulado.toFixed(3)},fps=30,format=yuv420p${salida}`);
    } else {
      filtros.push(`${etiqueta}${siguiente}concat=n=2:v=1:a=0,fps=30,format=yuv420p${salida}`);
    }
    etiqueta = salida;
    acumulado += duracionesVisibles[k + 1];
  }

  await ffmpeg([
    ...inputs,
    '-filter_complex', filtros.join(';'),
    '-map', '[vout]',
    ...enc,
    outPath,
  ]);
}

// ---- Montaje v2: por plan de clips + zoom/espejo/subtítulos + transiciones (Fase 7) ----
// plan: [{videoId, offset, duracion}], archivos: {videoId: ruta local}
// efectos: { zoom, zoomPct, espejo, transicion, transicionDur, transicionTipo, subsPath, fuentesDir }
// La suma de duraciones VISIBLES = duración del audio, así que el video calza por construcción
// — las transiciones NO acortan esa suma, solo agregan metraje extra por debajo (ver más abajo).
async function montarVideoPlan(plan, archivos, audioPath, jobId, efectos = {}) {
  const enc = argsEncoder(await detectarEncoder());
  const zoomPreset = efectos.zoom || 'ninguno';
  const espejoPreset = efectos.espejo || 'ninguno';
  const zoomPct = Number.isFinite(efectos.zoomPct) ? efectos.zoomPct : 20;
  const transPreset = efectos.transicion || 'ninguno';
  // Duración de cada transición: acotada 0.1-0.6s — fuera de ese rango deja de leerse como
  // "corte con transición" (muy corta no se ve, muy larga se siente lenta para el ritmo).
  const transDur = Math.min(0.6, Math.max(0.1, Number.isFinite(efectos.transicionDur) ? efectos.transicionDur : 0.35));
  const transTipo = efectos.transicionTipo || 'fade';

  const clipsValidos = plan
    .map((clip, i) => ({ clip, i }))
    .filter(x => x.clip && archivos[x.clip.videoId]);

  const segmentos = [];
  const duracionesVisibles = []; // duración QUE VE el espectador (sin cola de mezcla), mismo orden que segmentos

  for (let k = 0; k < clipsValidos.length; k++) {
    const { clip, i } = clipsValidos[k];
    const esUltimo = k === clipsValidos.length - 1;
    // Este clip empalma con el siguiente por transición → necesita `transDur` segundos EXTRA
    // de metraje fuente para la cola de mezcla (Fase 7, corrección de solapamiento). Por eso
    // server.js ya bajó CLIP_MAX a CLIP_MAX-transDur al planificar: duracion+padding nunca pasa
    // del límite legal de 3s. Ver comentario largo en renderizarConTransiciones() para el resto.
    const activaTransicion = !esUltimo && transPreset !== 'ninguno' && decidirEfecto(transPreset, k).activo;
    const padding = activaTransicion ? transDur : 0;

    const segPath = path.join(TEMP_DIR, `${jobId}_seg${i}.mp4`);
    const base = 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30';
    const filtros = [base];
    const zoomInfo = decidirEfecto(zoomPreset, i);
    if (zoomInfo.activo) filtros.push(filtroZoom(zoomInfo.direccion, zoomPct, clip.duracion));
    if (decidirEfecto(espejoPreset, i).activo) filtros.push('hflip');

    const argsSegmento = (vf) => [
      '-ss', clip.offset.toFixed(2),
      '-i', archivos[clip.videoId],
      '-t', (clip.duracion + padding).toFixed(3),
      '-vf', vf,
      '-an',
      ...enc,
      segPath,
    ];

    try {
      await ffmpeg(argsSegmento(filtros.join(',')));
    } catch (e) {
      // Si el clip con efectos falla (ej. zoompan rechazado por ffmpeg estricto),
      // no abortar todo el render: reintentar ESE segmento sin efectos (plano).
      if (filtros.length > 1) {
        console.warn(`  ⚠️ Segmento ${i} falló con efectos, reintentando plano: ${e.message}`);
        await ffmpeg(argsSegmento(base));
      } else {
        throw e;
      }
    }
    segmentos.push(segPath);
    duracionesVisibles.push(clip.duracion);
  }

  if (segmentos.length === 0) {
    throw new Error('Ningún clip del plan tiene video asignado');
  }

  const basePath = path.join(TEMP_DIR, `${jobId}_base.mp4`);
  let listaPath = null;
  const concatPlano = () => {
    listaPath = path.join(TEMP_DIR, `${jobId}_lista.txt`);
    fs.writeFileSync(listaPath, segmentos.map(s => `file '${s.replace(/'/g, "'\\''")}'`).join('\n'));
    return ffmpeg(['-f', 'concat', '-safe', '0', '-i', listaPath, '-c', 'copy', basePath]);
  };

  const hayTransiciones = transPreset !== 'ninguno' && segmentos.length > 1;
  if (!hayTransiciones) {
    await concatPlano();
  } else {
    try {
      await renderizarConTransiciones(segmentos, duracionesVisibles, basePath, { preset: transPreset, duracion: transDur, tipo: transTipo, enc });
    } catch (e) {
      // Regla de robustez: si la cadena de xfade falla (tipo de transición no soportado por
      // esta build de ffmpeg, filtergraph rechazado), cae a cortes secos en vez de perder el
      // render. Nota: los segmentos con cola de mezcla ya se cortaron con esos segundos de más;
      // en este fallback el `-t durAudio` del mux final igual deja la duración final EXACTA —
      // el sobrante de metraje se recorta del final, a costa de perder un poco del último clip.
      console.warn(`  ⚠️ [${jobId}] Transiciones fallaron, reintentando con cortes secos: ${e.message}`);
      await concatPlano();
    }
  }

  // Mux con la locución: si el video quedó una pizca corto (redondeos), se congela
  // el último frame hasta 2s; el corte final es exactamente la duración del audio.
  const durAudio = await obtenerDuracion(audioPath);
  const finalPath = path.join(TEMP_DIR, `${jobId}_final.mp4`);
  const tpad = 'tpad=stop_mode=clone:stop_duration=2';
  // Subtítulos (Fase 6): filtro `ass` quemado DESPUÉS del tpad, para que también se vea sobre
  // el frame congelado si el video quedó corto. Si el filtro falla (fuente corrupta, .ass mal
  // formado), no aborta el render: reintenta el mismo mux sin subtítulos — Regla de robustez.
  const conSubs = efectos.subsPath
    ? `${tpad},ass='${rutaFiltro(efectos.subsPath)}'${efectos.fuentesDir ? `:fontsdir='${rutaFiltro(efectos.fuentesDir)}'` : ''}`
    : tpad;

  const argsMux = (filtroV) => [
    '-i', basePath,
    '-i', audioPath,
    '-filter:v', filtroV,
    '-map', '0:v', '-map', '1:a',
    '-t', durAudio.toFixed(3),
    ...enc,
    '-c:a', 'aac', '-b:a', '192k',
    finalPath,
  ];

  try {
    await ffmpeg(argsMux(conSubs));
  } catch (e) {
    if (efectos.subsPath) {
      console.warn(`  ⚠️ Subtítulos fallaron al quemarse, reintentando sin ellos: ${e.message}`);
      await ffmpeg(argsMux(tpad));
    } else {
      throw e;
    }
  }

  [...segmentos, listaPath, basePath].filter(Boolean).forEach(f => {
    try { fs.unlinkSync(f); } catch {}
  });

  return { finalPath, duracion: Math.round(durAudio), clips: segmentos.length };
}

// Limpiar archivos temporales de un job. NO toca los clips fuente cacheados (src_*.mp4):
// ese caché es compartido entre jobs a propósito (evita redescargar el mismo clip de Drive
// para otro video), y borrarlo aquí corría la carrera de que un job terminando/fallando
// eliminara el clip que OTRO job concurrente acababa de descargar y estaba por leer con
// ffmpeg ("Error opening input file ... No such file or directory"). La limpieza de src_*
// por antigüedad ya la hace limpiarCache() en server.js (TTL de 1h).
function limpiarTemporales(jobId) {
  try {
    for (const f of fs.readdirSync(TEMP_DIR)) {
      if (f.startsWith(jobId)) {
        try { fs.unlinkSync(path.join(TEMP_DIR, f)); } catch {}
      }
    }
  } catch {}
}

module.exports = {
  montarVideoPlan,
  obtenerDuracion,
  limpiarTemporales,
  TEMP_DIR,
  // Reusados por exportar.js (corte de insumos individuales) para no duplicar
  // la detección de encoder ni los efectos de zoom/espejo.
  ffmpeg,
  detectarEncoder,
  argsEncoder,
  decidirEfecto,
  filtroZoom,
  TRANSICIONES_DISPONIBLES,
};

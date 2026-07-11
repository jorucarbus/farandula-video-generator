const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const TEMP_DIR = path.join(__dirname, 'temp-videos');
const USAGE_FILE = path.join(__dirname, 'usage.json');

// Velocidad de lectura estimada (caracteres por segundo) para la duración base de cada clip
const CHARS_POR_SEGUNDO = 17;
const DURACION_MIN = 1.5;
const DURACION_MAX = 4;
// Segundos a descartar al inicio de cada video fuente
const RECORTE_INICIAL = 1;

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', ['-y', ...args], { maxBuffer: 1024 * 1024 * 50 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`ffmpeg: ${stderr.slice(-500)}`));
      resolve(stdout);
    });
  });
}

function ffprobe(args) {
  return new Promise((resolve, reject) => {
    execFile('ffprobe', args, { maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
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

// ---- Registro de uso de videos (para no repetir hasta agotar la carpeta) ----
function cargarUso() {
  try {
    return JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function guardarUso(uso) {
  fs.writeFileSync(USAGE_FILE, JSON.stringify(uso, null, 2));
}

// ---- Selección de videos por carpeta de famoso ----
// carpetasVideos: { nombreCarpeta: [{id, name}, ...] }
// Devuelve para cada fragmento el video asignado, evitando repetir hasta usar todos.
function asignarVideos(fragments, carpetasVideos) {
  const uso = cargarUso();
  const asignaciones = [];

  for (const frag of fragments) {
    const nombre = frag.famoso;
    const videos = carpetasVideos[nombre] || [];
    if (videos.length === 0) {
      asignaciones.push(null);
      continue;
    }

    if (!uso[nombre]) uso[nombre] = [];
    let disponibles = videos.filter(v => !uso[nombre].includes(v.id));

    // Si se agotaron todos los videos de la carpeta, reiniciar el ciclo
    if (disponibles.length === 0) {
      uso[nombre] = [];
      disponibles = videos;
    }

    const elegido = disponibles[Math.floor(Math.random() * disponibles.length)];
    uso[nombre].push(elegido.id);
    asignaciones.push(elegido);
  }

  guardarUso(uso);
  return asignaciones;
}

// Duración base de un fragmento según sus caracteres
function duracionFragmento(texto) {
  const dur = texto.length / CHARS_POR_SEGUNDO;
  return Math.min(DURACION_MAX, Math.max(DURACION_MIN, dur));
}

// ---- Montaje ----
// fragments: [{famoso, texto}], archivos: [ruta local del video por fragmento]
// audioPath: locución. Devuelve ruta del video final.
async function montarVideo(fragments, archivos, audioPath, jobId) {
  const segmentos = [];

  // 1. Crear cada segmento: recortar inicio, duración base, formato vertical 1080x1920
  for (let i = 0; i < fragments.length; i++) {
    if (!archivos[i]) continue;
    const dur = duracionFragmento(fragments[i].texto);
    const segPath = path.join(TEMP_DIR, `${jobId}_seg${i}.mp4`);

    await ffmpeg([
      '-ss', String(RECORTE_INICIAL),
      '-i', archivos[i],
      '-t', dur.toFixed(2),
      '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30',
      '-an',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
      segPath,
    ]);
    segmentos.push(segPath);
  }

  if (segmentos.length === 0) {
    throw new Error('Ningún fragmento tiene video asignado');
  }

  // 2. Concatenar segmentos
  const listaPath = path.join(TEMP_DIR, `${jobId}_lista.txt`);
  fs.writeFileSync(listaPath, segmentos.map(s => `file '${s.replace(/'/g, "'\\''")}'`).join('\n'));
  const basePath = path.join(TEMP_DIR, `${jobId}_base.mp4`);
  await ffmpeg(['-f', 'concat', '-safe', '0', '-i', listaPath, '-c', 'copy', basePath]);

  // 3. Ajustar velocidad del video para empatar con la duración de la locución
  const durVideo = await obtenerDuracion(basePath);
  const durAudio = await obtenerDuracion(audioPath);
  const factor = durAudio / durVideo; // <1 acelera, >1 desacelera

  const finalPath = path.join(TEMP_DIR, `${jobId}_final.mp4`);
  await ffmpeg([
    '-i', basePath,
    '-i', audioPath,
    '-filter:v', `setpts=PTS*${factor.toFixed(5)}`,
    '-map', '0:v', '-map', '1:a',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k',
    '-shortest',
    finalPath,
  ]);

  // Limpiar intermedios
  [...segmentos, listaPath, basePath].forEach(f => {
    try { fs.unlinkSync(f); } catch {}
  });

  const durFinal = await obtenerDuracion(finalPath);
  return { finalPath, duracion: Math.round(durFinal), factorVelocidad: (1 / factor).toFixed(2) };
}

// ---- Montaje v2: por plan de clips (tiempos por porcentaje, sin ajuste de velocidad) ----
// plan: [{videoId, offset, duracion}], archivos: {videoId: ruta local}
// La suma de duraciones = duración del audio, así que el video calza por construcción.
async function montarVideoPlan(plan, archivos, audioPath, jobId) {
  const segmentos = [];

  for (let i = 0; i < plan.length; i++) {
    const clip = plan[i];
    if (!clip || !archivos[clip.videoId]) continue;
    const segPath = path.join(TEMP_DIR, `${jobId}_seg${i}.mp4`);

    await ffmpeg([
      '-ss', clip.offset.toFixed(2),
      '-i', archivos[clip.videoId],
      '-t', clip.duracion.toFixed(3),
      '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30',
      '-an',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
      segPath,
    ]);
    segmentos.push(segPath);
  }

  if (segmentos.length === 0) {
    throw new Error('Ningún clip del plan tiene video asignado');
  }

  // Concatenar
  const listaPath = path.join(TEMP_DIR, `${jobId}_lista.txt`);
  fs.writeFileSync(listaPath, segmentos.map(s => `file '${s.replace(/'/g, "'\\''")}'`).join('\n'));
  const basePath = path.join(TEMP_DIR, `${jobId}_base.mp4`);
  await ffmpeg(['-f', 'concat', '-safe', '0', '-i', listaPath, '-c', 'copy', basePath]);

  // Mux con la locución: si el video quedó una pizca corto (redondeos), se congela
  // el último frame hasta 2s; el corte final es exactamente la duración del audio.
  const durAudio = await obtenerDuracion(audioPath);
  const finalPath = path.join(TEMP_DIR, `${jobId}_final.mp4`);
  await ffmpeg([
    '-i', basePath,
    '-i', audioPath,
    '-filter:v', 'tpad=stop_mode=clone:stop_duration=2',
    '-map', '0:v', '-map', '1:a',
    '-t', durAudio.toFixed(3),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k',
    finalPath,
  ]);

  [...segmentos, listaPath, basePath].forEach(f => {
    try { fs.unlinkSync(f); } catch {}
  });

  return { finalPath, duracion: Math.round(durAudio), clips: segmentos.length };
}

// Limpiar archivos temporales de un job
function limpiarTemporales(jobId) {
  try {
    for (const f of fs.readdirSync(TEMP_DIR)) {
      if (f.startsWith(jobId) || f.startsWith('src_')) {
        try { fs.unlinkSync(path.join(TEMP_DIR, f)); } catch {}
      }
    }
  } catch {}
}

module.exports = {
  asignarVideos,
  montarVideo,
  montarVideoPlan,
  obtenerDuracion,
  duracionFragmento,
  limpiarTemporales,
  TEMP_DIR,
};

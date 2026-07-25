// Corte y exportación de insumos (modo "Insumos para editar"): fragmentos numerados + locución,
// sin componer un video final. Reusa los helpers de FFmpeg/encoder/efectos de video.js — mismos
// presets de zoom/espejo que el modo "Video final" (paridad, ver .claude/CLAUDE.md 2026-07-19).
const fs = require('fs');
const path = require('path');
const { ffmpeg, detectarEncoder, argsEncoder, decidirEfecto, filtroZoom } = require('./video');

// Cortar los fragmentos del plan (duración exacta, vertical 1080x1920, sin audio)
// y guardarlos numerados junto con la locución en la carpeta destino.
// plan: [{videoId, famoso, offset, duracion}], archivos: {videoId: ruta local}
// efectos: { zoom: preset, zoomPct: number, espejo: preset } — mismos presets que el video final
async function exportarInsumos(plan, archivos, audioPath, destinoDir, efectos = {}) {
  const enc = argsEncoder(await detectarEncoder());
  fs.mkdirSync(destinoDir, { recursive: true });
  const zoomPreset = efectos.zoom || 'ninguno';
  const espejoPreset = efectos.espejo || 'ninguno';
  const zoomPct = Number.isFinite(efectos.zoomPct) ? efectos.zoomPct : 20;

  const clips = plan.filter(c => c && archivos[c.videoId]);
  if (clips.length === 0) throw new Error('Ningún clip del plan tiene video asignado');

  const generados = [];
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const numero = String(i + 1).padStart(2, '0');
    const famoso = clip.famoso.replace(/[/\\:*?"<>|]/g, '').slice(0, 40);
    const nombre = `${numero}_${famoso}.mp4`;
    const destino = path.join(destinoDir, nombre);

    const filtros = ['scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30'];
    const zoomInfo = decidirEfecto(zoomPreset, i);
    if (zoomInfo.activo) filtros.push(filtroZoom(zoomInfo.direccion, zoomPct, clip.duracion));
    if (decidirEfecto(espejoPreset, i).activo) filtros.push('hflip');

    await ffmpeg([
      '-ss', clip.offset.toFixed(2),
      '-i', archivos[clip.videoId],
      '-t', clip.duracion.toFixed(3),
      '-vf', filtros.join(','),
      '-an',
      ...enc,
      destino,
    ]);
    generados.push(nombre);
  }

  // La locución va junto a los fragmentos
  fs.copyFileSync(audioPath, path.join(destinoDir, 'locucion.mp3'));

  return { fragmentos: generados.length, archivos: generados };
}

module.exports = { exportarInsumos };

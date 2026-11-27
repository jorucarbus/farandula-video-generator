// Arma la portada de un video dentro del flujo automático: foto del artista (índice) + titular (Gemini barato) + logo/paleta del canal + círculos de las otras personas.
// Devuelve { png, jpg, titular, resalte, etiqueta, fotoDe } y deja <salida>.portada.png / .portada.jpg junto al video. Nunca lanza por falta de foto: devuelve null.
const fs = require('fs');
const path = require('path');
const { dibujarPortada } = require('../lienzo/portada');
const Foto = require('./portadaFoto');
const Tit = require('./portadaTitular');

// g: guion.json ({ titulo, descripcion, ...}); personas: [{ nombre, foto, alias }] de edl/personas.prepararPersonas (ya con foto de círculo).
async function crear({ g, carpeta, canal = '', personas = [], estilo, salida, foto = null, llamarTitular = null }) {
  let f = null;
  if (foto && fs.existsSync(foto)) f = { buffer: fs.readFileSync(foto), foco: { x: 0.5, y: 0.35 }, clipId: 'manual' };
  else if (carpeta) f = await Foto.elegirFoto(carpeta, { semilla: (g && g.titulo) || carpeta });
  if (!f) return null;
  const t = await Tit.generar({ titulo: (g && g.titulo) || '', descripcion: (g && g.descripcion) || '', llamar: llamarTitular });
  const protag = String(carpeta || '').toLowerCase().replace(/_/g, ' ');
  const otros = (personas || []).filter(p => p && p.foto && !String(p.nombre || '').toLowerCase().split(' ').some(w => w.length >= 4 && protag.includes(w))).slice(0, 3).map(p => ({ foto: p.foto, nombre: p.nombre, lado: p.lado }));
  const buf = await dibujarPortada({ foto: f.buffer, foco: f.foco, titular: t.titular, resalte: t.resalte, etiqueta: '', canal, circulos: otros, estilo });
  const base = salida.replace(/\.mp4$/i, '') + '.portada', png = base + '.png', jpg = base + '.jpg';
  fs.mkdirSync(path.dirname(png), { recursive: true }); fs.writeFileSync(png, buf);
  try { // JPG para subirlo a mano si hace falta (TikTok no deja fijar la portada por API)
    const { createCanvas, loadImage } = require('@napi-rs/canvas'), im = await loadImage(buf), c = createCanvas(im.width, im.height); c.getContext('2d').drawImage(im, 0, 0); fs.writeFileSync(jpg, c.toBuffer('image/jpeg', 92));
  } catch { /* el PNG basta */ }
  return { png, jpg: fs.existsSync(jpg) ? jpg : png, titular: t.titular, resalte: t.resalte, etiqueta: t.etiqueta, fotoDe: f.clipId, circulos: otros.length };
}

module.exports = { crear };

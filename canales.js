// Fichas de canal (canales.json): lo que cambia de un canal a otro, en un solo lugar.
//
// Campos: nombre, hermano (clave del canal gemelo), monetiza (false = guion corto), vozId (voz de ElevenLabs;
// null = la de .env), tonoMusica ('auto' o un tono de lienzo/musicaFondo), hashtags (fijos, se suman a los de la
// noticia), sesgo (instrucción de tono para el guion de ESTE canal), fondo (reservado: fondo animado por canal).
// Un canal que no está en el archivo se comporta como siempre (sin ficha = todo por defecto).
const fs = require('fs');
const path = require('path');

const ARCHIVO = path.join(__dirname, 'canales.json');
let cache = null;

function normalizar(nombre) {
  return String(nombre || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}

function cargar(archivo = ARCHIVO) {
  if (cache && archivo === ARCHIVO) return cache;
  let datos = {};
  try { datos = JSON.parse(fs.readFileSync(archivo, 'utf8')); } catch { /* sin archivo: todo por defecto */ }
  const fichas = {};
  for (const [clave, f] of Object.entries(datos)) if (!clave.startsWith('_') && f && typeof f === 'object') fichas[normalizar(clave)] = f;
  if (archivo === ARCHIVO) cache = fichas;
  return fichas;
}

// La ficha del canal (por nombre o clave) con los valores por defecto aplicados, o null si no existe.
function obtener(nombre, fichas = cargar()) {
  const clave = normalizar(nombre), f = fichas[clave];
  if (!f) return null;
  return {
    clave, nombre: f.nombre || nombre, hermano: f.hermano ? normalizar(f.hermano) : null,
    monetiza: f.monetiza !== false, vozId: f.vozId || null, tonoMusica: f.tonoMusica || 'auto',
    hashtags: Array.isArray(f.hashtags) ? f.hashtags : [], sesgo: String(f.sesgo || ''), fondo: f.fondo || null,
  };
}

// La ficha del canal hermano (o null).
function hermanoDe(nombre, fichas = cargar()) {
  const f = obtener(nombre, fichas);
  return f && f.hermano ? obtener(f.hermano, fichas) : null;
}

// Hashtags de la noticia + los fijos del canal, sin repetir (sin distinguir mayúsculas).
function sumarHashtags(propios, canal) {
  const vistos = new Set(), salida = [];
  for (const h of [...(propios || []), ...((canal && canal.hashtags) || [])]) { const k = String(h).toLowerCase(); if (!vistos.has(k)) { vistos.add(k); salida.push(h); } }
  return salida;
}

module.exports = { normalizar, cargar, obtener, hermanoDe, sumarHashtags };

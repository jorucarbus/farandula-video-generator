// Íconos (Tabler, MIT; ver assets/iconos/ORIGEN.md) como imágenes de canvas. Se recolorean y se rasterizan al tamaño
// pedido (el SVG se reescribe con width/height finales: así salen nítidos en vez de escalar un bitmap de 24 px).
const fs = require('fs');
const path = require('path');
const { loadImage } = require('@napi-rs/canvas');

const DIR = path.join(__dirname, '..', 'assets', 'iconos');
const cache = new Map();

const disponibles = () => fs.readdirSync(DIR).filter(f => f.endsWith('.svg')).map(f => f.slice(0, -4));
const existe = nombre => /^[a-z0-9-]+$/.test(nombre) && fs.existsSync(path.join(DIR, `${nombre}.svg`));

async function cargarIcono(nombre, { color = '#FFFFFF', px = 256, grosor = 2 } = {}) {
  if (!existe(nombre)) throw new Error(`ícono desconocido: ${nombre}`);
  const clave = `${nombre}|${color}|${px}|${grosor}`;
  if (cache.has(clave)) return cache.get(clave);
  const svg = fs.readFileSync(path.join(DIR, `${nombre}.svg`), 'utf8')
    .replace(/currentColor/g, color).replace('width="24"', `width="${px}"`).replace('height="24"', `height="${px}"`)
    .replace('stroke-width="2"', `stroke-width="${grosor}"`);
  const img = await loadImage(Buffer.from(svg));
  cache.set(clave, img);
  return img;
}

module.exports = { cargarIcono, disponibles, existe };

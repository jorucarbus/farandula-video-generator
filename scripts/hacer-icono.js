// Genera gestor/superapp.ico (claqueta + play sobre degradado del estilo de la app) y gestor/superapp.png. Uso: node scripts/hacer-icono.js
const fs = require('fs'), path = require('path'), { createCanvas } = require('@napi-rs/canvas');
function dibujar(S) {
  const c = createCanvas(S, S), x = c.getContext('2d'), u = S / 256, rr = (px, py, w, h, r) => { x.beginPath(); x.roundRect(px, py, w, h, r); };
  // fondo: cuadrado redondeado, negro cálido → rojo de la marca
  const g = x.createLinearGradient(0, 0, S, S); g.addColorStop(0, '#2b1620'); g.addColorStop(1, '#0f0a10');
  rr(0, 0, S, S, 56 * u); x.fillStyle = g; x.fill();
  const brillo = x.createRadialGradient(S * 0.75, S * 0.2, 0, S * 0.75, S * 0.2, S * 0.7); brillo.addColorStop(0, 'rgba(255,45,85,0.55)'); brillo.addColorStop(1, 'rgba(255,45,85,0)');
  rr(0, 0, S, S, 56 * u); x.fillStyle = brillo; x.fill();
  // claqueta: cuerpo (pantalla vertical 9:16 de los shorts) + tapa rayada
  const cx = 128 * u, bw = 150 * u, bx = cx - bw / 2, by = 100 * u, bh = 118 * u;
  x.save(); x.shadowColor = 'rgba(0,0,0,0.5)'; x.shadowBlur = 14 * u; x.shadowOffsetY = 6 * u; rr(bx, by, bw, bh, 14 * u); x.fillStyle = '#fff'; x.fill(); x.restore();
  // play
  x.fillStyle = '#ff2d55'; x.beginPath(); x.moveTo(cx - 20 * u, by + 28 * u); x.lineTo(cx - 20 * u, by + bh - 24 * u); x.lineTo(cx + 30 * u, by + bh / 2 + 2 * u); x.closePath(); x.fill();
  // tapa con rayas diagonales, ligeramente abierta
  x.save(); x.translate(bx, by - 4 * u); x.rotate(-0.16); rr(0, -34 * u, bw, 34 * u, 8 * u); x.clip(); x.fillStyle = '#111'; x.fillRect(0, -34 * u, bw, 34 * u);
  x.fillStyle = '#fff'; for (let i = -1; i < 7; i++) { x.beginPath(); x.moveTo(i * 30 * u, 0); x.lineTo(i * 30 * u + 16 * u, 0); x.lineTo(i * 30 * u + 34 * u, -34 * u); x.lineTo(i * 30 * u + 18 * u, -34 * u); x.closePath(); x.fill(); } x.restore();
  // destello ("chisme"): chispa de cuatro puntas arriba a la derecha
  const sx = 196 * u, sy = 66 * u, R = 26 * u; x.fillStyle = '#ffd60a'; x.beginPath();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 2, r = i % 2 ? R * 0.28 : R; x.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r); } x.closePath(); x.fill();
  return c;
}
const tamanos = [16, 24, 32, 48, 64, 128, 256], pngs = tamanos.map(S => dibujar(S).toBuffer('image/png'));
const cab = Buffer.alloc(6 + 16 * tamanos.length); cab.writeUInt16LE(0, 0); cab.writeUInt16LE(1, 2); cab.writeUInt16LE(tamanos.length, 4);
let off = cab.length; tamanos.forEach((S, i) => { const o = 6 + i * 16; cab[o] = S >= 256 ? 0 : S; cab[o + 1] = S >= 256 ? 0 : S; cab.writeUInt16LE(1, o + 4); cab.writeUInt16LE(32, o + 6); cab.writeUInt32LE(pngs[i].length, o + 8); cab.writeUInt32LE(off, o + 12); off += pngs[i].length; });
const sal = path.join(__dirname, '..', 'gestor'); fs.writeFileSync(path.join(sal, 'superapp.ico'), Buffer.concat([cab, ...pngs])); fs.writeFileSync(path.join(sal, 'superapp.png'), pngs[pngs.length - 1]);
console.log('listo', path.join(sal, 'superapp.ico'));

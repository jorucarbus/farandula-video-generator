// Escena de prueba compartida: pasarela + público de maniquíes sin rostro + 1 maniquí caminando + cámara que avanza. Mismos números para three.js y Blender.
const fs = require('fs');
let s = 12345; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
const PAL = ['#C8553D', '#F0B429', '#3D7EAA', '#6B8F71', '#8E5572', '#E8A87C'];
const aud = [];
for (const side of [-1, 1]) for (const x of [3.0, 4.1]) for (let z = -6.5; z <= 6.5; z += 1.3) {
  aud.push({ x: side * (x + (rnd() - 0.5) * 0.3), z: z + (rnd() - 0.5) * 0.3, h: 1.55 + rnd() * 0.25, c: PAL[Math.floor(rnd() * PAL.length)], ry: side > 0 ? -Math.PI / 2 : Math.PI / 2 });
}
const sc = { w: 1080, h: 1920, fps: 24, frames: 72, bg: '#F2EBDD', floor: '#E9DFCB', runway: '#C8553D', hero: '#F0B429', aud, runwayLen: 14, runwayW: 2.2, runwayH: 0.25,
  camA: { p: [0, 1.5, 9.5], t: [0, 1.1, 0] }, camB: { p: [0.8, 1.3, 5.2], t: [0, 1.2, -1] }, fov: 62, heroZ0: -6, heroZ1: 2 };
fs.writeFileSync(__dirname + '/scene.json', JSON.stringify(sc, null, 1)); console.log(aud.length, 'maniquíes de público');

// Genera con Gemini la misma cara con DISTINTAS BOCAS (visemas) para el rig de fotos. Solo cambia la boca; luego scripts/kit-foto-rig.js recorta la zona de la boca de cada
// imagen y la pega con borde suave sobre la cara base. Uso: node scripts/bocas-generar.js [visema ...] [--n 2]   → data-motor/kit/bocas-crudo/<visema>-<k>.png
require('dotenv').config();
const fs = require('fs'), path = require('path');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const N = Number(arg('--n', 2)), SALIDA = path.join(__dirname, '..', 'data-motor', 'kit', 'bocas-crudo'), REF = path.join(__dirname, '..', 'assets', 'kit', 'cabeza-relleno-mujer.png');
const BASE = 'Edit this exact photograph: keep the SAME woman, the same hair, the same skin, the same lighting, the same background, the same head position, the same framing and the same eyes and eyebrows, pixel-for-pixel identical. Change ONLY the mouth (lips, teeth, tongue) and the jaw as described. The result must look like a real unretouched photograph of the same moment, a natural expression, no exaggeration.';
const V = {
  Aa: 'Her mouth is wide open as if saying the sound "ahh": jaw dropped, upper teeth visible, a bit of tongue visible.',
  Ee: 'Her lips are spread wide as in saying "eee" or a broad smile showing the upper and lower teeth together, jaw only slightly open.',
  Oh: 'Her lips form a rounded open "O" shape as in saying "oh", teeth barely visible, jaw moderately open.',
  Woo: 'Her lips are pushed forward into a small tight round pucker as in saying "oo" or "woo", jaw nearly closed.',
  M: 'Her lips are pressed firmly together, closed, as when saying "mmm" or "p" or "b", neutral and relaxed face.',
  F: 'Her upper front teeth rest on her lower lip as when saying "f" or "v", lips slightly parted.',
  D: 'Her mouth is slightly open showing the upper teeth and the tip of the tongue touching behind the upper teeth, as when saying "d", "t" or "l".',
  S: 'Her teeth are closed together and visible, lips slightly parted and drawn back a little, as when saying "sss".',
  Uh: 'Her mouth is slightly open, relaxed, jaw a little dropped, as when saying "uh", teeth slightly visible.',
  R: 'Her mouth is slightly open with the lips slightly rounded and tense, as when saying "rr", the upper teeth slightly visible.',
};
async function una(v, k) {
  const partes = [{ inlineData: { mimeType: 'image/png', data: fs.readFileSync(REF).toString('base64') } }, { text: `${BASE} ${V[v]}` }];
  const cuerpo = { contents: [{ parts: partes }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '3:4' } } };
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${process.env.GEMINI_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
  const j = await r.json(), parte = (j.candidates?.[0]?.content?.parts || []).find(p => p.inlineData);
  if (!parte) { console.log(v, k, 'SIN IMAGEN', JSON.stringify(j).slice(0, 200)); return; }
  fs.mkdirSync(SALIDA, { recursive: true }); fs.writeFileSync(path.join(SALIDA, `${v}-${k}.png`), Buffer.from(parte.inlineData.data, 'base64')); console.log(v, k, 'ok');
}
(async () => {
  const pedidas = process.argv.slice(2).filter(a => V[a]), vs = pedidas.length ? pedidas : Object.keys(V);
  await Promise.all(vs.flatMap(v => Array.from({ length: N }, (_, k) => una(v, k + 1).catch(e => console.log(v, k + 1, 'FALLO', e.message)))));
})();

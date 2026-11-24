// Genera con Gemini manos de PIEL para el rig de fotos (misma piel que el cuerpo del kit): una mano por imagen, con la muñeca arriba cortada en horizontal
// y los dedos hacia abajo, sobre fondo verde liso. Se revisan a ojo y luego scripts/kit-foto-rig.js las recorta y las arma.
// Uso: node scripts/manos-generar.js [pose ...] [--n 2]   (poses: relajada abierta puno senalar)
require('dotenv').config();
const fs = require('fs'), path = require('path');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const N = Number(arg('--n', 2)), SALIDA = path.join(__dirname, '..', 'data-motor', 'kit', 'manos-crudo'), REF = path.join(__dirname, '..', 'assets', 'kit', 'cuerpo-bastonera-senalar.png');
const BASE = 'Photograph of a single realistic adult female hand, the same skin tone as the reference image (light warm beige), natural unretouched skin with subtle knuckle creases and clean short natural nails. ONLY the hand and about 2 cm of wrist: the wrist is at the very TOP edge of the image and ends in a clean straight horizontal cut, no sleeve, no cuff, no jewelry, no watch. The fingers point straight DOWN in the image. The hand is perfectly sharp and fully inside the frame with space around it, evenly lit from the front, no cast shadows. Background: plain pure bright green (#00FF00) chroma-key, no text, no watermark.';
const POSES = {
  relajada: 'Relaxed hand, fingers together and slightly curled, thumb resting against the side, back of the hand facing the viewer.',
  abierta: 'Open hand with all five fingers gently spread apart, palm facing the viewer.',
  puno: 'Closed fist, back of the hand facing the viewer, thumb wrapped over the fingers.',
  senalar: 'Pointing gesture: the index finger extended straight, the other three fingers curled into the palm, thumb tucked, back of the hand facing the viewer.',
};
async function una(pose, k) {
  const partes = [{ inlineData: { mimeType: 'image/png', data: fs.readFileSync(REF).toString('base64') } }, { text: `${POSES[pose]} ${BASE}` }];
  const cuerpo = { contents: [{ parts: partes }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '3:4' } } };
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${process.env.GEMINI_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
  const j = await r.json(), parte = (j.candidates?.[0]?.content?.parts || []).find(p => p.inlineData);
  if (!parte) { console.log(pose, k, 'SIN IMAGEN', JSON.stringify(j).slice(0, 200)); return; }
  fs.mkdirSync(SALIDA, { recursive: true }); fs.writeFileSync(path.join(SALIDA, `${pose}-${k}.png`), Buffer.from(parte.inlineData.data, 'base64')); console.log(pose, k, 'ok');
}
(async () => {
  const pedidas = process.argv.slice(2).filter(a => POSES[a]), poses = pedidas.length ? pedidas : Object.keys(POSES);
  await Promise.all(poses.flatMap(p => Array.from({ length: N }, (_, k) => una(p, k + 1).catch(e => console.log(p, k + 1, 'FALLO', e.message)))));
})();

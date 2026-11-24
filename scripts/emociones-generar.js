// Genera con Gemini la misma cara con distintas EMOCIONES para el rig de fotos (solo cambia la expresión: cejas, ojos, mejillas y boca).
// Uso: node scripts/emociones-generar.js [emoción ...] [--persona leidy] [--n 2]  → data-motor/kit/personas/<persona>/emociones-crudo/<emoción>-<k>.png
require('dotenv').config();
const fs = require('fs'), path = require('path');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const N = Number(arg('--n', 2)), PERSONA = arg('--persona', 'leidy'), SALIDA = path.join(__dirname, '..', 'data-motor', 'kit', 'personas', PERSONA, 'emociones-crudo'), REF = path.join(__dirname, '..', 'assets', 'kit', 'personas', PERSONA, 'cabeza.png');
const BASE = 'Edit this exact photograph: keep the SAME woman, the same hair, the same skin, the same lighting, the same plain background, the same head position, angle and framing, pixel-for-pixel identical everywhere except her facial expression. Change ONLY the expression of the face (eyebrows, eyes, cheeks and mouth) as described. It must look like a real unretouched photograph of the same moment with a natural, convincing expression, clearly readable at a glance.';
const E = {
  feliz: 'Expression: overjoyed, a big radiant open-mouth smile showing teeth, cheeks raised, eyes bright and slightly crinkled, eyebrows lifted. Pure happiness and excitement.',
  sorpresa: 'Expression: shocked and astonished, eyes wide open, eyebrows raised high, mouth open in a round "o".',
  triste: 'Expression: sad and hurt, inner ends of the eyebrows raised and drawn together, eyes a little glossy and downcast, corners of the lips turned down, a slight quiver of the lower lip.',
  enojo: 'Expression: angry and indignant, eyebrows pulled down and together, eyes narrowed with an intense stare, lips pressed tight and jaw tense, nostrils slightly flared.',
  duda: 'Expression: doubtful and skeptical, one eyebrow raised higher than the other, eyes looking slightly sideways, lips pursed and pushed to one side as if thinking "hmm, really?".',
  orgullo: 'Expression: proud and self-satisfied, a confident closed-lip smirk, eyes calm and half-lidded with satisfaction, eyebrows relaxed and slightly raised.',
  asco: 'Expression: disgusted, nose wrinkled, upper lip raised, eyebrows lowered, eyes squinting, corners of the mouth pulled down.',
  preocupacion: 'Expression: worried and anxious, eyebrows raised and pulled together in the middle, eyes wide and uneasy, lips pressed together and slightly pulled down.',
  amor: 'Expression: tender and touched, a soft warm gentle smile, eyes soft and a bit moist with emotion, eyebrows slightly raised, a heartfelt look.',
};
async function una(v, k) {
  const partes = [{ inlineData: { mimeType: 'image/png', data: fs.readFileSync(REF).toString('base64') } }, { text: `${BASE} ${E[v]}` }];
  const cuerpo = { contents: [{ parts: partes }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '3:4' } } };
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${process.env.GEMINI_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
  const j = await r.json(), parte = (j.candidates?.[0]?.content?.parts || []).find(p => p.inlineData);
  if (!parte) { console.log(v, k, 'SIN IMAGEN', JSON.stringify(j).slice(0, 200)); return; }
  fs.mkdirSync(SALIDA, { recursive: true }); fs.writeFileSync(path.join(SALIDA, `${v}-${k}.png`), Buffer.from(parte.inlineData.data, 'base64')); console.log(v, k, 'ok');
}
(async () => {
  const pedidas = process.argv.slice(2).filter(a => E[a]), vs = pedidas.length ? pedidas : Object.keys(E);
  await Promise.all(vs.flatMap(v => Array.from({ length: N }, (_, k) => una(v, k + 1).catch(e => console.log(v, k + 1, 'FALLO', e.message)))));
})();

// Genera con Gemini una CABEZA limpia (retrato frontal de estudio) de una persona a partir de fotos de referencia, para armar su muñeco del rig de fotos.
// OJO LEGAL: usa fotos de una persona real; el uso publicado requiere revisión de un abogado ecuatoriano (ver CLAUDE.md).
// Uso: node scripts/cabeza-persona-generar.js --slug leidy --refs ruta1.png,ruta2.png,... [--n 3]  → data-motor/kit/personas/<slug>/cabeza-<k>.png
require('dotenv').config();
const fs = require('fs'), path = require('path');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const slug = arg('--slug', 'persona'), refs = String(arg('--refs', '')).split(',').filter(Boolean), N = Number(arg('--n', 3));
if (!refs.length) { console.error('Faltan --refs'); process.exit(1); }
const PELO = arg('--pelo', 'Her long straight light-brown hair with blonde highlights falls on both sides of her face and over her shoulders, with her natural parted fringe framing the face.'); // describe el pelo real de la persona
const LIBRO = path.join(__dirname, '..', 'data-motor', 'gasto-gemini.json');
const SALIDA = path.join(__dirname, '..', 'data-motor', 'kit', 'personas', slug);
const PROMPT = 'Using the reference photos of the SAME woman, create ONE clean studio portrait photograph of her: facing straight to the camera, head perfectly upright and centered, looking directly at the lens, relaxed neutral expression with the lips gently closed, eyes fully open. ' + PELO + ' Show her head, neck, and bare shoulders down to the collarbones (no jewelry, no clothing visible beyond bare shoulders), the neck clearly visible. Plain flat light-gray studio background, soft even lighting, no shadows on the background, sharp realistic photograph, same framing as an ID headshot. Preserve her real facial features, skin tone, eye color and eyebrows exactly as in the references. No text, no watermark.';
async function una(k) {
  try { const g = JSON.parse(fs.readFileSync(LIBRO, 'utf8')); g.imagenes++; g.usd = +((g.usd || 0) + 0.039).toFixed(4); g.registro.push({ t: new Date().toISOString(), hoja: 'cabeza', persona: slug, modelo: 'gemini-2.5-flash-image', usd: 0.039 }); fs.writeFileSync(LIBRO, JSON.stringify(g, null, 2)); } catch (e) { /* sin libro: se sigue */ }
  const partes = refs.map(r => ({ inlineData: { mimeType: 'image/png', data: fs.readFileSync(r).toString('base64') } })); partes.push({ text: PROMPT });
  const cuerpo = { contents: [{ parts: partes }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '3:4' } } };
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${process.env.GEMINI_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
  const j = await r.json(), parte = (j.candidates?.[0]?.content?.parts || []).find(p => p.inlineData);
  if (!parte) { console.log('cabeza', k, 'SIN IMAGEN', JSON.stringify(j).slice(0, 300)); return; }
  fs.mkdirSync(SALIDA, { recursive: true }); fs.writeFileSync(path.join(SALIDA, `cabeza-${k}.png`), Buffer.from(parte.inlineData.data, 'base64')); console.log('cabeza', k, 'ok');
}
(async () => { await Promise.all(Array.from({ length: N }, (_, k) => una(k + 1).catch(e => console.log('cabeza', k + 1, 'FALLO', e.message)))); })();

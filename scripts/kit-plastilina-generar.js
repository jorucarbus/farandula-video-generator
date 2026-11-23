// Genera piezas del kit de plastilina con Gemini (imagen) a partir de una imagen de referencia del personaje.
// Uso: node scripts/kit-plastilina-generar.js <pieza> [--n 3] [--ref ruta.png] [--fondo verde|azul]
//   piezas: cabeza | cuerpo-reposo | cuerpo-celebrar | cuerpo-senalar | cuerpo-gala | corona | baston | mano-pulgar | mano-abierta
// Salida: data-motor/kit/plastilina-crudo/<pieza>-<k>.png (se revisan a ojo y se elige una; luego scripts/kit-plastilina-armar.js).
require('dotenv').config();
const fs = require('fs'), path = require('path');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const pieza = process.argv[2], N = Number(arg('--n', 3));
const REF = arg('--ref', path.join(__dirname, '..', 'data-motor', 'kit', 'crudo', 'estilo-plastilina.png'));
const SALIDA = path.join(__dirname, '..', 'data-motor', 'kit', 'plastilina-crudo');
const FONDO = { verde: 'plain pure bright green (#00FF00) chroma-key background', azul: 'plain pure bright blue (#0033FF) chroma-key background' };
const ESTILO = 'Look: REAL hand-made plasticine, like Aardman / Play-Doh stop-motion models: clearly visible fingerprints and thumb marks pressed into the surface, a slightly lumpy uneven hand-sculpted surface, tiny tool marks, soft seams where clay pieces were joined, imperfect rounded shapes, matte clay with a faint sheen. It must NOT look like a smooth 3D render or an airbrushed doll.';
const UNIFORME = 'a white double-breasted marching-band jacket with a red stand collar, red trim and gold buttons and gold shoulder fringe, a short red pleated skirt with gold trim, white tights and red knee-high boots';
const SIN_CABEZA = 'The figure is shown from the NECK DOWN ONLY: NO head and NO hair at all; the neck is a short clay stub that ends in a flat horizontal cut at the very top of the image, like a ghost-mannequin product photo. Full body down to the feet, front view, centered, nothing cropped at the sides or bottom.';
const PIEZAS = {
  cabeza: { fondo: 'verde', ref: true, p: `Using the reference character as identity and style, produce the same character's head, hair and neck, front view, centered. Long wavy blonde hair with a middle part, falling in front of both shoulders. The neck is long and ends at the collarbones. IMPORTANT: the face has NO eyes, NO eyebrows, NO eyelids, NO mouth and NO lips (blank clay skin there), BUT it DOES have a clearly visible hand-sculpted clay NOSE (rounded tip, two small nostril dents, visible bridge) plus cheeks, ears and chin. ${ESTILO}` },
  'cuerpo-reposo': { fondo: 'verde', ref: true, p: `Using the reference character's clay skin tone and clay style, produce a clay character body wearing ${UNIFORME}. Relaxed standing pose, arms hanging at the sides with open hands. ${SIN_CABEZA} ${ESTILO}` },
  'cuerpo-celebrar': { fondo: 'verde', ref: true, p: `Using the reference character's clay skin tone and clay style, produce a clay character body wearing ${UNIFORME}. Celebrating pose: both arms raised up and out in a V shape, open hands, weight on both feet. ${SIN_CABEZA} ${ESTILO}` },
  'cuerpo-senalar': { fondo: 'verde', ref: true, p: `Using the reference character's clay skin tone and clay style, produce a clay character body wearing ${UNIFORME}. Pointing pose: one arm extended straight out horizontally to the side with the index finger pointing, the other arm relaxed at the side. ${SIN_CABEZA} ${ESTILO}` },
  'cuerpo-gala': { fondo: 'azul', ref: true, p: `Using the reference character's clay skin tone and clay style, produce a clay character body wearing an elegant emerald-green satin evening gown with a white pageant sash across the chest (no text on the sash), and silver heels. Relaxed standing pose, arms at the sides. ${SIN_CABEZA} ${ESTILO}` },
  corona: { fondo: 'verde', ref: false, p: `A small pink and gold pageant tiara crown made of modeling clay with tiny clay gems, front view, centered, nothing else. ${ESTILO}` },
  baston: { fondo: 'verde', ref: false, p: `A majorette baton made of modeling clay: a long thin silver-gray shaft with a white clay ball on each end, shown diagonally, nothing else. ${ESTILO}` },
  'mano-pulgar': { fondo: 'verde', ref: true, p: `Using the reference character's clay skin tone, a single clay hand with the thumb up (thumbs-up), seen from the front, with a bit of the wrist, nothing else. ${ESTILO}` },
  'mano-abierta': { fondo: 'verde', ref: true, p: `Using the reference character's clay skin tone, a single clay open hand with all five fingers spread (waving), seen from the front, with a bit of the wrist, nothing else. ${ESTILO}` },
};

async function una(k, cfg, ref) {
  const partes = []; if (cfg.ref) partes.push({ inlineData: { mimeType: 'image/png', data: fs.readFileSync(ref).toString('base64') } });
  partes.push({ text: `${cfg.p} Background: ${FONDO[arg('--fondo', cfg.fondo)]}, no shadows on the background, no text, no watermark.` });
  const cuerpo = { contents: [{ parts: partes }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: arg('--aspecto', pieza.startsWith('cuerpo') ? '9:16' : '1:1') } } };
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${process.env.GEMINI_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
  const j = await r.json(), parte = (j.candidates?.[0]?.content?.parts || []).find(p => p.inlineData);
  if (!parte) { console.log(pieza, k, 'SIN IMAGEN', JSON.stringify(j).slice(0, 250)); return; }
  fs.mkdirSync(SALIDA, { recursive: true }); fs.writeFileSync(path.join(SALIDA, `${pieza}-${k}.png`), Buffer.from(parte.inlineData.data, 'base64')); console.log(pieza, k, 'ok');
}
(async () => {
  const cfg = PIEZAS[pieza]; if (!cfg) { console.log('pieza desconocida. Opciones: ' + Object.keys(PIEZAS).join(', ')); process.exit(1); }
  await Promise.all(Array.from({ length: N }, (_, k) => una(k + 1, cfg, REF).catch(e => console.log(pieza, k + 1, 'FALLO', e.message))));
})();

// Genera una imagen con Gemini; opcional imagen de referencia (REF=ruta) para mantener la misma persona/traje.
require('dotenv').config();
const fs = require('fs');
const [modelo, nombre, prompt] = process.argv.slice(2);
(async () => {
  const t0 = Date.now(), partes = [];
  if (process.env.REF) partes.push({ inlineData: { mimeType: 'image/png', data: fs.readFileSync(process.env.REF).toString('base64') } });
  partes.push({ text: prompt });
  const cuerpo = { contents: [{ parts: partes }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: process.env.ASPECTO || '1:1' } } };
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${process.env.GEMINI_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
  const j = await r.json();
  const parte = (j.candidates?.[0]?.content?.parts || []).find(p => p.inlineData);
  if (!parte) { console.log(nombre, 'SIN IMAGEN', JSON.stringify(j).slice(0, 300)); return; }
  fs.writeFileSync(`data-motor/kit/crudo/${nombre}.png`, Buffer.from(parte.inlineData.data, 'base64'));
  console.log(nombre, 'ok', Math.round((Date.now() - t0) / 1000) + 's');
})().catch(e => console.log(nombre, 'FALLO', e.message));

// Genera la voz (ElevenLabs, con tiempos por carácter) de un guion de noticia y deja los tiempos por palabra en el formato de Whisper.
// Uso: node scripts/noticia-voz.js --guion data-motor/noticias/dalia/guion.json --audio "data-motor/audios/2026-11-24 Dalia.mp3" --palabras data-motor/noticias/dalia/palabras.json
require('dotenv').config();
const fs = require('fs'), path = require('path');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const g = JSON.parse(fs.readFileSync(arg('--guion'), 'utf8')), AUDIO = arg('--audio'), PAL = arg('--palabras');
(async () => {
  const el = require('../elevenlabs'), modelo = require('../ajustes').obtener().modeloVoz;
  console.log('voz:', g.script.length, 'caracteres, modelo', modelo);
  const a = await el.generarAudioConTiempos(g.script, modelo);
  fs.mkdirSync(path.dirname(AUDIO), { recursive: true }); fs.copyFileSync(a.audioPath, AUDIO);
  const ch = a.caracteres, st = a.inicios, fi = a.fines || st.slice(1).concat([st[st.length - 1] + 0.3]), pal = []; let ini = -1;
  for (let i = 0; i <= ch.length; i++) { const esp = i === ch.length || /\s/.test(ch[i]); if (!esp && ini < 0) ini = i; if (esp && ini >= 0) { pal.push({ w: ch.slice(ini, i).join(''), s: +st[ini].toFixed(3), e: +fi[i - 1].toFixed(3) }); ini = -1; } }
  
  const video = require('../video'); const duracion = await video.obtenerDuracion(AUDIO);
  fs.writeFileSync(PAL, JSON.stringify({ duracion, modelo: a.modelo, palabras: pal }, null, 1)); console.log('audio', AUDIO, duracion.toFixed(1) + ' s,', pal.length, 'palabras');
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });

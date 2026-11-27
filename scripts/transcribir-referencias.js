// Transcribe (con Whisper local, gratis) los videos MÁS vistos de tus canales de TikTok y, para comparar, otros de las mismas cuentas con pocas vistas.
// Lee lo que el Selector ya escaneó (selector-videos/datos/<usuario>.json) y deja data-motor/referencias-canales/<usuario>.json
// con { id, url, vistas, dur, fecha, desc, grupo: 'exito'|'contraste', texto }. No gasta Gemini; solo descarga el AUDIO de cada video.
// Uso: node scripts/transcribir-referencias.js --usuarios a,b,c --exitos 8 --contraste 8 [--desde-vistas 100000]
require('dotenv').config({ quiet: true });
const fs = require('fs'), path = require('path');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const SELECTOR = process.env.SELECTOR_DIR || 'C:\\Users\\jorucarbus\\proyectos\\selector-videos', DM = path.join(__dirname, '..', 'data-motor'), SALIDA = path.join(DM, 'referencias-canales');
const usuarios = String(arg('--usuarios', '')).split(',').map(s => s.trim()).filter(Boolean), nExitos = Number(arg('--exitos', 8)), nContraste = Number(arg('--contraste', 8)), umbral = Number(arg('--desde-vistas', 100000));
if (!usuarios.length) { console.error('falta --usuarios'); process.exit(1); }
const dormir = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const fuentes = require('../fuentes'), { transcribir } = require('../edl/transcribirLocal');
  fs.mkdirSync(SALIDA, { recursive: true });
  for (const u of usuarios) {
    const datos = JSON.parse(fs.readFileSync(path.join(SELECTOR, 'datos', u + '.json'), 'utf8')).videos.map(v => ({ ...v, vistas: v.vistas || 0 }));
    const fSal = path.join(SALIDA, u + '.json'), previo = fs.existsSync(fSal) ? JSON.parse(fs.readFileSync(fSal, 'utf8')) : [], hechos = new Map(previo.map(x => [x.id, x]));
    // éxitos: los más vistos (con voz: duración >= 30 s); contraste: de 55 a 100 s, entre 1.000 y la mediana de vistas, repartidos en el tiempo
    const exitos = datos.filter(v => v.vistas >= umbral && v.dur >= 30).sort((a, b) => b.vistas - a.vistas).slice(0, nExitos);
    const med = datos.map(v => v.vistas).sort((a, b) => a - b)[Math.floor(datos.length / 2)];
    const pool = datos.filter(v => v.dur >= 55 && v.dur <= 100 && v.vistas >= 500 && v.vistas <= Math.max(med, 1500)).sort((a, b) => a.fecha - b.fecha);
    const paso = Math.max(1, Math.floor(pool.length / Math.max(nContraste, 1))), contraste = Array.from({ length: Math.min(nContraste, pool.length) }, (_, i) => pool[i * paso]);
    const lista = [...exitos.map(v => ({ ...v, grupo: 'exito' })), ...contraste.map(v => ({ ...v, grupo: 'contraste' }))];
    console.log(`\n@${u}: ${exitos.length} éxitos + ${contraste.length} de contraste (mediana del canal ${med.toLocaleString()} vistas)`);
    for (const v of lista) {
      if (hechos.has(v.id) && hechos.get(v.id).texto !== undefined) continue;
      let texto = null, error = '';
      try {
        const audio = await fuentes.descargarAudio(v.url);
        try { texto = await transcribir(audio, { modelo: 'small' }); } finally { try { fs.unlinkSync(audio); } catch { /* temporal */ } }
      } catch (e) { error = String(e.message).slice(0, 100); }
      hechos.set(v.id, { id: v.id, url: v.url, vistas: v.vistas, dur: v.dur, fecha: v.fecha, desc: v.desc, likes: v.likes, grupo: v.grupo, texto, ...(error ? { error } : {}) });
      fs.writeFileSync(fSal, JSON.stringify([...hechos.values()], null, 1));
      console.log(`  ${v.grupo === 'exito' ? '★' : '·'} ${String(v.vistas).padStart(8)} v ${v.dur}s ${texto ? texto.split(' ').length + ' palabras' : (error || 'sin voz')}`);
      await dormir(1500);
    }
  }
  console.log('\nLISTO');
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });

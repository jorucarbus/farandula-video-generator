// Descarga los efectos CC0 elegidos de Openverse (Freesound), los pasa a WAV mono 44,1 kHz recortados y normalizados y los registra en assets/sfx/MANIFEST.json con su autor, licencia y página de origen.
// Uso: node scripts/sfx-descargar.js            (descarga todos los de ELEGIDOS que falten)
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const FFMPEG = process.env.FFMPEG_BIN || require('ffmpeg-static');
const DIR = path.join(__dirname, '..', 'assets', 'sfx'), MAN = path.join(DIR, 'MANIFEST.json');
const UA = { 'User-Agent': 'FarandulaMotor/1.0 (generador de videos)' };

// sonido del motor → candidatos (consulta de búsqueda + prefijo del id de Openverse) y duración máxima en segundos
const ELEGIDOS = {
  pop: { max: 0.3, c: [['pop', '7b1f829e'], ['pop', '6ff2d0e8'], ['pop', 'b71550f1']] },
  clic: { max: 0.3, c: [['ui click', 'ea9dc47e'], ['ui click', 'd3ab488b']] },
  tick: { max: 0.2, c: [['ui click', 'a1e70c65'], ['tick', 'b9e2d017']] },
  golpe: { max: 0.6, c: [['thud impact', 'd19dc776'], ['thud impact', '65a5a67e']] },
  trazo: { max: 0.75, c: [['marker scribble', '5ed58808']] },
  ding: { max: 0.7, c: [['bell ding', '741bb1d4'], ['bell ding', 'b30c8c3a']] },
  whoosh: { max: 0.6, c: [['whoosh', 'f1dc6045'], ['whoosh', 'b7ae7822']] },
};

(async () => {
  fs.mkdirSync(DIR, { recursive: true });
  const man = fs.existsSync(MAN) ? JSON.parse(fs.readFileSync(MAN, 'utf8')) : { descripcion: 'Efectos de sonido CC0 (Freesound vía Openverse). Licencia CC0 1.0: sin atribución obligatoria; se guarda autor y origen por trazabilidad.', archivos: [] };
  for (const [sonido, { max, c }] of Object.entries(ELEGIDOS)) {
    for (let i = 0; i < c.length; i++) {
      const [q, pref] = c[i], nombre = `${sonido}-${i + 1}.wav`, dest = path.join(DIR, nombre);
      if (fs.existsSync(dest)) continue;
      const lista = (await (await fetch(`https://api.openverse.org/v1/audio/?q=${encodeURIComponent(q)}&license=cc0&page_size=20`, { headers: UA })).json()).results || [], r = lista.find(x => x.id.startsWith(pref));
      if (!r) { console.log('NO ENCONTRADO', sonido, pref); continue; }
      if (r.license !== 'cc0') { console.log('NO ES CC0, se omite', r.title, r.license); continue; }
      const crudo = path.join(DIR, `_crudo_${pref}.mp3`), res = await fetch(r.url, { headers: UA });
      if (!res.ok) { console.log('fallo descarga', r.url, res.status); continue; }
      fs.writeFileSync(crudo, Buffer.from(await res.arrayBuffer()));
      // mono 44,1 kHz, recorte de silencio inicial, duración máxima, normalizado a pico -3 dB con fundido corto de salida
      const af = `silenceremove=start_periods=1:start_threshold=-45dB,atrim=0:${max},afade=t=out:st=${Math.max(0, max - 0.05)}:d=0.05,loudnorm=I=-18:TP=-3:LRA=7`;
      execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', crudo, '-ac', '1', '-ar', '44100', '-af', af, '-c:a', 'pcm_s16le', dest]);
      fs.unlinkSync(crudo);
      man.archivos = man.archivos.filter(x => x.archivo !== nombre).concat({ archivo: nombre, sonido, titulo: r.title, autor: r.creator, licencia: r.license, licencia_url: r.license_url, origen: r.foreign_landing_url, descarga: r.url, duracion_original_s: +(r.duration / 1000).toFixed(2), descargado: new Date().toISOString().slice(0, 10) });
      console.log('ok', nombre, '←', r.title, '·', r.creator);
    }
  }
  fs.writeFileSync(MAN, JSON.stringify(man, null, 1));
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });

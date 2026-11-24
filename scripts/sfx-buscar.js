// Busca efectos de sonido CC0 en Openverse (API pública sin clave) y los lista: node scripts/sfx-buscar.js "<consulta>" [--max 1.6]
const q = process.argv[2], max = Number((process.argv.indexOf('--max') > 0 && process.argv[process.argv.indexOf('--max') + 1]) || 1.6);
(async () => {
  const url = `https://api.openverse.org/v1/audio/?q=${encodeURIComponent(q)}&license=cc0&page_size=20`;
  const r = await fetch(url, { headers: { 'User-Agent': 'FarandulaMotor/1.0 (generador de videos)' } }); if (!r.ok) { console.log('HTTP', r.status, (await r.text()).slice(0, 200)); return; }
  const j = await r.json(); const c = (j.results || []).filter(x => x.duration && x.duration / 1000 <= max && x.duration >= 60);
  console.log(`${q}: ${j.result_count} resultados, ${c.length} cortos (≤ ${max} s)`);
  for (const x of c.slice(0, 12)) console.log([x.id.slice(0, 8), (x.duration / 1000).toFixed(2) + 's', x.source, x.license, (x.creator || '?').slice(0, 18), '|', String(x.title).slice(0, 48), '|', x.url.slice(0, 90)].join(' '));
})().catch(e => console.log('ERR', e.message));

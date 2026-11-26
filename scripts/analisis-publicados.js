// Analiza el historial de videos publicados (hoja "Publicaciones - farandula" de Drive, solo lectura) y la carpeta "para publicar":
//   - quiénes son los artistas más frecuentes, por canal y en total;
//   - a qué carpeta de Drive corresponde cada uno (mismo cotejo que la app de farándula);
//   - qué tan largos son los guiones, qué hashtags se repiten, qué títulos funcionan (si hay vistas anotadas).
// Deja data-motor/analisis/publicados.json (datos) y docs/analisis-publicados.md (informe legible).
// Uso: node scripts/analisis-publicados.js
require('dotenv').config({ quiet: true });
const fs = require('fs'), path = require('path');
const { google } = require('googleapis');
const drive = require('../drive'), famosos = require('../famosos');

const SHEET_ID = process.env.GOOGLE_SHEET_ID || '1G-FUAwaKPbyppZDhoWJHIU3r8nXKPZFSt5JoYDKKjaE'; // "Publicaciones - farandula"
const PUBLICAR_ID = process.env.GOOGLE_DRIVE_PUBLICAR_FOLDER_ID || '1Zni4Algee1RJTO7qt7BvGV7TwJfTZt1t'; // carpeta "para publicar" (una subcarpeta por canal)
const RAIZ = path.join(__dirname, '..'), SALIDA = path.join(RAIZ, 'data-motor', 'analisis'), INFORME = path.join(RAIZ, 'docs', 'analisis-publicados.md');
const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();
const palabras = t => (String(t || '').match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]+/g) || []).length;
const cuenta = (m, k, n = 1) => { m[k] = (m[k] || 0) + n; };
const top = (m, n = 20) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n);

async function leerHoja() {
  const o = new google.auth.OAuth2(process.env.GOOGLE_OAUTH_CLIENT_ID, process.env.GOOGLE_OAUTH_CLIENT_SECRET);
  o.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
  const s = google.sheets({ version: 'v4', auth: o }), meta = await s.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets.properties' });
  const r = await s.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${meta.data.sheets[0].properties.title}!A1:T5000` });
  const [cab, ...filas] = r.data.values || [];
  return filas.filter(f => f && (f[1] || f[5])).map(f => Object.fromEntries(cab.map((c, i) => [c, f[i] || ''])));
}

async function listarPublicar() {
  const c = drive.getDriveOAuth() || drive.getDrive(), ls = async id => { const out = []; let t; do { const r = await c.files.list({ q: `'${id}' in parents and trashed=false`, fields: 'nextPageToken,files(id,name,mimeType,size)', pageSize: 500, pageToken: t, includeItemsFromAllDrives: true, supportsAllDrives: true }); out.push(...r.data.files); t = r.data.nextPageToken; } while (t); return out; };
  const canales = (await ls(PUBLICAR_ID)).filter(f => f.mimeType.includes('folder')), out = {};
  for (const ch of canales) { const x = await ls(ch.id); out[ch.name] = { videos: x.filter(f => /video/.test(f.mimeType)).length, imagenes: x.filter(f => /image/.test(f.mimeType)).length, nombres: x.filter(f => /video/.test(f.mimeType)).map(f => f.name) }; }
  return out;
}

(async () => {
  console.log('Leyendo la hoja de publicaciones…'); const filas = await leerHoja(); console.log(`  ${filas.length} filas`);
  console.log('Leyendo las carpetas "para publicar"…'); const carpetasPublicar = await listarPublicar();
  console.log('Leyendo las carpetas de artistas en Drive…'); const mapa = await drive.obtenerCarpetasFamosos(), nombresCarpeta = Object.keys(mapa);

  const porArtista = {}, porCanal = {}, porMes = {}, hashtags = {}, estados = {}, tipos = {}; const largos = [];
  for (const f of filas) {
    const p = (f['Protagonista'] || '').trim() || '(sin protagonista)', canal = f['Canal'] || '(sin canal)', mes = String(f['Fecha'] || '').slice(0, 7);
    porArtista[p] = porArtista[p] || { total: 0, canales: {}, titulos: [], ultima: '' }; porArtista[p].total++; cuenta(porArtista[p].canales, canal); porArtista[p].titulos.push(f['Título']); if ((f['Fecha'] || '') > porArtista[p].ultima) porArtista[p].ultima = f['Fecha'];
    cuenta(porCanal, canal); cuenta(porMes, mes); cuenta(estados, f['Status'] || '(vacío)'); cuenta(tipos, f['Tipo'] || '(vacío)');
    for (const h of (f['Descripción + Hashtags'] || '').match(/#\w+/g) || []) cuenta(hashtags, h.toLowerCase());
    if (f['Guion']) largos.push({ canal, palabras: palabras(f['Guion']) });
  }
  // cada artista → su carpeta de Drive (cotejo de la app vieja)
  const artistas = Object.entries(porArtista).map(([nombre, d]) => { const m = nombre.startsWith('(') ? null : famosos.cotejar(nombre, nombresCarpeta); return { nombre, ...d, carpeta: m && m.carpeta, confianza: m && m.confianza }; }).sort((a, b) => b.total - a.total);
  const prom = (arr) => (arr.length ? Math.round(arr.reduce((s, x) => s + x, 0) / arr.length) : 0);
  const largoPorCanal = {}; for (const c of Object.keys(porCanal)) largoPorCanal[c] = prom(largos.filter(x => x.canal === c).map(x => x.palabras));
  // lo que sí tiene resultados anotados
  const conVistas = filas.filter(f => Number(String(f['Vistas']).replace(/\D/g, '')) > 0).map(f => ({ titulo: f['Título'], canal: f['Canal'], vistas: Number(String(f['Vistas']).replace(/\D/g, '')), funciono: f['Qué funcionó'] })).sort((a, b) => b.vistas - a.vistas);

  const datos = { generado: new Date().toISOString(), filas: filas.length, publicarDrive: Object.fromEntries(Object.entries(carpetasPublicar).map(([k, v]) => [k, { videos: v.videos, imagenes: v.imagenes }])), porCanal, porMes, estados, tipos, largoGuionPromedio: largoPorCanal, hashtags: top(hashtags, 40), artistas: artistas.map(({ titulos, ...r }) => ({ ...r, ejemplos: titulos.slice(0, 3) })), conVistas: conVistas.slice(0, 30) };
  fs.mkdirSync(SALIDA, { recursive: true }); fs.writeFileSync(path.join(SALIDA, 'publicados.json'), JSON.stringify(datos, null, 1));

  const conCarpeta = artistas.filter(a => a.carpeta), sinCarpeta = artistas.filter(a => !a.carpeta && !a.nombre.startsWith('('));
  const L = [];
  L.push('# Análisis de lo publicado', '', `Generado ${new Date().toISOString().slice(0, 10)} · ${filas.length} videos en la hoja "Publicaciones - farandula" · carpeta "para publicar" en Drive.`, '');
  L.push('## Por canal', '', '| Canal | Videos en la hoja | Videos en "para publicar" | Palabras de guion (promedio) |', '|---|---:|---:|---:|');
  for (const [c, n] of top(porCanal)) L.push(`| ${c} | ${n} | ${(carpetasPublicar[c] || {}).videos ?? '—'} | ${largoPorCanal[c] || '—'} |`);
  L.push('', '## Estado de los videos', '', top(estados).map(([k, n]) => `- ${k}: ${n}`).join('\n'), '', '## Videos por mes', '', top(porMes, 24).sort().map(([k, n]) => `- ${k}: ${n}`).join('\n'), '');
  L.push('## Artistas más frecuentes', '', '| # | Artista (protagonista) | Videos | Canales | Carpeta de Drive | Última vez |', '|---:|---|---:|---|---|---|');
  artistas.slice(0, 60).forEach((a, i) => L.push(`| ${i + 1} | ${a.nombre} | ${a.total} | ${Object.entries(a.canales).map(([c, n]) => `${c} ${n}`).join(', ')} | ${a.carpeta ? a.carpeta + (a.confianza === 'media' ? ' (parecida)' : '') : '**sin carpeta**'} | ${a.ultima} |`));
  L.push('', `Con carpeta en Drive: ${conCarpeta.length} de ${artistas.length} artistas distintos (${conCarpeta.reduce((s, a) => s + a.total, 0)} de ${filas.length} videos).`, '');
  L.push('## Artistas frecuentes SIN carpeta de clips en Drive', '', sinCarpeta.slice(0, 40).map(a => `- ${a.nombre} (${a.total} videos)`).join('\n') || '- ninguno', '');
  L.push('## Hashtags más usados', '', top(hashtags, 30).map(([h, n]) => `${h} (${n})`).join(' · '), '');
  if (conVistas.length) L.push('## Videos con vistas anotadas', '', conVistas.slice(0, 15).map(v => `- ${v.vistas.toLocaleString('es')} vistas · ${v.canal} · ${v.titulo}${v.funciono ? ' — ' + v.funciono : ''}`).join('\n'), '');
  fs.mkdirSync(path.dirname(INFORME), { recursive: true }); fs.writeFileSync(INFORME, L.join('\n'));
  console.log(`\n${filas.length} videos · ${artistas.length} artistas distintos · ${conCarpeta.length} con carpeta en Drive`);
  console.log('Top 15:'); artistas.slice(0, 15).forEach((a, i) => console.log(`  ${String(i + 1).padStart(2)}. ${a.nombre.padEnd(28)} ${String(a.total).padStart(3)} videos → ${a.carpeta || 'SIN CARPETA'}`));
  console.log(`Informe: ${path.relative(RAIZ, INFORME)}`);
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });

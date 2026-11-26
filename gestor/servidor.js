// Superapp: gestor de la biblioteca + Selector de videos + crear video, en una sola ventana (http://127.0.0.1:3100).
// Local y solo local: escucha en 127.0.0.1. El Selector (Python, puerto 8765) sigue siendo un proceso aparte; aquí se incrusta.
// Uso: node gestor/servidor.js     (o INICIAR-SUPERAPP.bat, que además arranca el Selector)
require('dotenv').config({ quiet: true });
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');
const G = require('./biblioteca');
const clipsDrive = require('../edl/clipsDrive');
const respaldo = require('../edl/respaldoIndice');
const { TIPOS: TIPOS_TOMA } = require('../edl/biblioteca');
const canales = require('../canales');

const PUERTO = Number(process.env.GESTOR_PUERTO) || 3100, RAIZ = G.RAIZ, MINIS = path.join(G.DM, 'gestor', 'minis');
const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const ok = (res, datos) => res.json(datos), mal = (res, e, c = 400) => res.status(c).json({ error: e.message || String(e) });
const carpetaValida = c => /^[\w .-]+$/.test(c || '');

// ---------------------------------------------------------------- lectura
app.get('/api/resumen', (req, res) => { try { ok(res, { ...G.resumenCarpetas(), canales: Object.values(canales.cargar()).map(f => ({ clave: canales.normalizar(f.nombre), nombre: f.nombre, hermano: f.hermano || null, monetiza: f.monetiza !== false })) }); } catch (e) { mal(res, e, 500); } });

app.get('/api/clips', (req, res) => {
  try { const { tipo, carpeta } = req.query; ok(res, tipo === 'selector' ? G.clipsDeSelector(carpeta) : G.clipsDeBiblioteca(carpeta)); } catch (e) { mal(res, e); }
});

app.get('/api/papelera', (req, res) => ok(res, G.enPapelera()));

// Miniatura (primer cuadro útil) con caché en disco. La ruta debe estar en las carpetas permitidas.
app.get('/miniatura', (req, res) => {
  const ruta = String(req.query.ruta || '');
  if (!G.rutaPermitida(ruta) || !fs.existsSync(ruta)) return res.status(404).end();
  const mini = path.join(MINIS, crypto.createHash('sha1').update(ruta).digest('hex').slice(0, 20) + '.jpg');
  const servir = () => res.sendFile(mini, { maxAge: '7d' });
  if (fs.existsSync(mini)) return servir();
  fs.mkdirSync(MINIS, { recursive: true });
  execFile(process.env.FFMPEG_BIN || require('ffmpeg-static'), ['-y', '-v', 'error', '-ss', '1', '-i', ruta, '-frames:v', '1', '-vf', 'scale=270:-2', '-q:v', '5', mini], { timeout: 20000 }, e => {
    if (e) return execFile(process.env.FFMPEG_BIN || require('ffmpeg-static'), ['-y', '-v', 'error', '-i', ruta, '-frames:v', '1', '-vf', 'scale=270:-2', '-q:v', '5', mini], { timeout: 20000 }, e2 => (e2 ? res.status(500).end() : servir()));
    servir();
  });
});

// Miniatura guardada en el índice (sirve aunque el video ya no esté en disco).
app.get('/mini', (req, res) => {
  const { carpeta, id } = req.query; if (!/^[\w .-]+$/.test(carpeta || '') || !/^[\w-]+$/.test(id || '')) return res.status(400).end();
  const f = path.join(G.BIB, `${carpeta}.minis`, `${id}.jpg`); if (!fs.existsSync(f)) return res.status(404).end();
  res.sendFile(f, { maxAge: '30d' });
});

// Reproducir un clip que está solo en Drive: se transmite desde Drive, con rangos, sin guardarlo en el disco.
app.get('/video-drive', async (req, res) => {
  try {
    const { carpeta, id } = req.query; if (!/^[\w .-]+$/.test(carpeta || '') || !/^[\w-]+$/.test(id || '')) return res.status(400).end();
    if (!G.clipsDeBiblioteca(carpeta).some(c => c.id === id && !/^loc_/.test(c.id))) return res.status(404).end();
    const r = await require('../drive').streamArchivo(id, req.headers.range || null);
    res.status(r.status || 200); const cab = h => (r.headers && typeof r.headers.get === 'function' ? r.headers.get(h) : r.headers && r.headers[h]); for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) { const v = cab(h); if (v) res.setHeader(h, v); }
    r.data.on('error', () => res.end()); req.on('close', () => r.data.destroy && r.data.destroy()); r.data.pipe(res);
  } catch (e) { if (!res.headersSent) res.status(502).end(); }
});

// Reproducción del clip (con rangos, para poder avanzar en el video).
app.get('/video', (req, res) => {
  const ruta = String(req.query.ruta || '');
  if (!G.rutaPermitida(ruta) || !fs.existsSync(ruta)) return res.status(404).end();
  res.sendFile(path.resolve(ruta));
});

// ---------------------------------------------------------------- acciones en grupo
app.post('/api/papelera', (req, res) => { try { ok(res, G.aPapelera(Array.isArray(req.body.rutas) ? req.body.rutas : [], { motivo: req.body.motivo || 'manual' })); } catch (e) { mal(res, e); } });
app.post('/api/restaurar', (req, res) => { try { ok(res, G.restaurar(Array.isArray(req.body.rutas) ? req.body.rutas : [])); } catch (e) { mal(res, e); } });
app.post('/api/limpiar-faltantes', (req, res) => { try { if (!G.carpetasBiblioteca().includes(req.body.carpeta)) throw new Error('carpeta desconocida'); ok(res, G.limpiarFaltantes(req.body.carpeta)); } catch (e) { mal(res, e); } });
app.post('/api/importar', (req, res) => { try { ok(res, G.importarDeSelector(Array.isArray(req.body.rutas) ? req.body.rutas : [], req.body.carpeta, { mover: Boolean(req.body.mover) })); } catch (e) { mal(res, e); } });

// ---------------------------------------------------------------- trabajos en segundo plano (uno a la vez: comparten GPU/CPU y la rotación de clips)
const trabajos = []; let corriendo = false;
function encolar(titulo, pasos) { const t = { id: trabajos.length + 1, titulo, estado: 'en cola', log: '', inicio: null, fin: null, pasos }; trabajos.push(t); bombear(); return t; }
async function bombear() {
  if (corriendo) return; const t = trabajos.find(x => x.estado === 'en cola'); if (!t) return;
  corriendo = true; t.estado = 'corriendo'; t.inicio = new Date().toISOString();
  try {
    for (const [i, p] of t.pasos.entries()) {
      t.log += `\n▶ ${p.titulo || p.cmd + ' ' + p.args.join(' ')}\n`;
      const code = await new Promise(r => { const h = spawn(p.cmd, p.args, { cwd: RAIZ, env: process.env, windowsHide: true }); const a = c => { t.log = (t.log + c).slice(-12000); }; h.stdout.on('data', a); h.stderr.on('data', a); h.on('error', e => { a(String(e)); r(1); }); h.on('close', r); });
      if (code !== 0 && !p.opcional) { t.estado = 'falló'; t.log += `\n✖ terminó con código ${code}\n`; break; }
      if (i === t.pasos.length - 1) t.estado = 'listo';
    }
  } catch (e) { t.estado = 'falló'; t.log += String(e); }
  t.fin = new Date().toISOString(); corriendo = false; bombear();
}
// Índice de una carpeta: baja de Drive lo que falte (temporal), mide calidad y rostros, etiqueta (opcional), guarda miniaturas y libera el disco (salvo carpetas recurrentes).
function pasosDeIndice(carpeta, etiquetar, opcionalTraer) {
  const traer = node('biblioteca-traer.js', carpeta); if (opcionalTraer) traer.opcional = true; // carpetas que no son de Drive (importadas del Selector) no se bajan
  return [traer, ...(etiquetar ? [node('biblioteca-etiquetar-local.js', carpeta)] : []), node('calidad-clips.js', carpeta), py('rostros-clips.py', carpeta), node('biblioteca-minis.js', carpeta), node('biblioteca-purgar.js', carpeta, '--si-no-recurrente'), { ...node('biblioteca-respaldar.js', carpeta), opcional: true }];
}
const node = (script, ...args) => ({ cmd: process.execPath, args: [path.join(RAIZ, 'scripts', script), ...args], titulo: `${script} ${args.join(' ')}` });
const py = (script, ...args) => ({ cmd: 'python', args: [path.join(RAIZ, 'scripts', script), ...args], titulo: `${script} ${args.join(' ')}`, opcional: true });

app.get('/api/trabajos', (req, res) => ok(res, trabajos.map(({ pasos, ...t }) => ({ ...t, log: t.log.slice(-2500) })).reverse()));

// Preparar una carpeta: medir calidad y rostros (gratis, local) y, si se pide, etiquetar con Gemini (cuesta llamadas).
app.post('/api/preparar', (req, res) => {
  try {
    const { carpeta, etiquetar } = req.body || {}; if (!carpetaValida(carpeta) || !G.carpetasBiblioteca().includes(carpeta)) throw new Error('carpeta desconocida');
    ok(res, { id: encolar(`Actualizar índice de ${carpeta}${etiquetar ? ' (con etiquetas de Gemini)' : ''}`, pasosDeIndice(carpeta, etiquetar, true)).id });
  } catch (e) { mal(res, e); }
});

// Crear video desde un link: uno solo o con su gemelo (canal hermano). Usa la tubería automática (Gemini + voz ElevenLabs).
app.post('/api/crear-video', async (req, res) => {
  try {
    const { link, canal, carpeta, gemelo } = req.body || {};
    if (!/^https?:\/\/\S+$/i.test(link || '')) throw new Error('el link debe empezar con http:// o https://');
    // carpeta: 'auto' (se detecta desde la noticia leyendo las carpetas de Drive) o cualquier carpeta de Drive / de la biblioteca
    if (carpeta !== 'auto') { const mapa = await carpetasDrive(false).catch(() => ({})); if (!carpetaValida(carpeta) || !(G.carpetasBiblioteca().includes(carpeta) || mapa[carpeta])) throw new Error('esa carpeta no existe en Drive ni en la biblioteca; elige otra o usa la detección automática'); }
    const ficha = canales.obtener(canal); if (!ficha) throw new Error('canal desconocido');
    const nombre = `gestor-${new Date().toISOString().slice(0, 10)}-${Date.now().toString(36)}`;
    const pasos = [node('noticia-a-video.js', link, '--canal', ficha.nombre, '--carpeta', carpeta, '--nombre', nombre, '--salida', path.join(G.DM, 'renders', `${nombre}.mp4`))];
    if (gemelo) { const h = canales.hermanoDe(canal); if (!h) throw new Error(`"${ficha.nombre}" no tiene canal hermano en canales.json`); const n2 = `${nombre}-${h.clave}`; pasos.push(node('noticia-a-video.js', '--canal', h.nombre, '--carpeta', carpeta, '--nombre', n2, '--desde', nombre, '--salida', path.join(G.DM, 'renders', `${n2}.mp4`))); }
    ok(res, { id: encolar(`Video: ${ficha.nombre}${gemelo ? ' + gemelo' : ''} · ${link.slice(0, 60)}`, pasos).id, salidas: [`${nombre}.mp4`].concat(gemelo ? [`${nombre}-${canales.hermanoDe(canal).clave}.mp4`] : []) });
  } catch (e) { mal(res, e); }
});

// ---------------------------------------------------------------- carpetas de Drive (las mismas que usa la app de farándula)
// Se detectan solas: GOOGLE_DRIVE_FOLDER_ID del .env es la carpeta de famosos; cada subcarpeta es una persona. Lista en caché 10 min.
let cacheDrive = null;
async function carpetasDrive(refrescar) {
  if (!refrescar && cacheDrive && Date.now() - cacheDrive.t < 600000) return cacheDrive.mapa;
  const mapa = await require('../drive').obtenerCarpetasFamosos(); cacheDrive = { t: Date.now(), mapa }; return mapa;
}
app.get('/api/drive/carpetas', async (req, res) => {
  try {
    const mapa = await carpetasDrive(req.query.refrescar === '1'), locales = new Map(G.resumenCarpetas().biblioteca.map(c => [c.nombre, c]));
    const remotos = await respaldo.listarRemotos().catch(() => new Map()); // el índice respaldado en Drive también cuenta como "ya etiquetada" (hecha desde otra PC)
    ok(res, Object.keys(mapa).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })).map(n => ({ nombre: n, local: locales.has(n), clipsLocales: locales.has(n) ? locales.get(n).clips : 0, etiquetada: remotos.has(respaldo.nombreRemoto(n, 'etiquetas')) || Boolean(locales.has(n) && locales.get(n).etiquetados) })));
  } catch (e) { mal(res, new Error('No pude leer Drive: ' + String(e.message).slice(0, 160)), 502); }
});
app.get('/api/drive/contar', async (req, res) => {
  try {
    const mapa = await carpetasDrive(false), id = mapa[req.query.carpeta]; if (!id) throw new Error('carpeta desconocida');
    const v = await require('../drive').listarVideos(id); ok(res, { videos: v.length, segundos: Math.round(v.reduce((s, x) => s + (x.duracion || 0), 0)) });
  } catch (e) { mal(res, e); }
});
// Traer una carpeta de Drive a disco y medir calidad y rostros (gratis). Etiquetar con Gemini es un paso aparte (cuesta).
app.post('/api/drive/indexar', async (req, res) => {
  try {
    const { carpeta, etiquetar } = req.body || {}; const mapa = await carpetasDrive(false);
    if (!carpetaValida(carpeta) || !mapa[carpeta]) throw new Error('carpeta desconocida');
    ok(res, { id: encolar(`Indexar de Drive: ${carpeta}${etiquetar ? ' (con etiquetas de Gemini)' : ''}`, pasosDeIndice(carpeta, Boolean(etiquetar), false)).id });
  } catch (e) { mal(res, e); }
});

// Corregir una etiqueta a mano (tipo, descripción, lugar, vestuario, personas). Queda marcada como editada: en una fusión con Drive gana sobre la automática.
app.post('/api/etiqueta', async (req, res) => {
  try {
    const { carpeta, id, cambios } = req.body || {}; if (!G.carpetasBiblioteca().includes(carpeta) || !/^[\w-]+$/.test(id || '')) throw new Error('carpeta o clip desconocido');
    const f = respaldo.rutaLocal(carpeta, 'etiquetas'), todas = JSON.parse(fs.readFileSync(f, 'utf8')), t = todas[id]; if (!t) throw new Error('ese clip todavía no tiene etiqueta');
    const c = cambios || {}, n = { ...t };
    if (c.tipo !== undefined) { if (!TIPOS_TOMA.includes(c.tipo)) throw new Error('tipo no válido: ' + TIPOS_TOMA.join(', ')); n.tipo = c.tipo; }
    if (c.descripcion !== undefined) n.descripcion = String(c.descripcion).slice(0, 300);
    if (c.lugar !== undefined) n.lugar = String(c.lugar).slice(0, 80);
    if (c.vestuario !== undefined) n.vestuario = (Array.isArray(c.vestuario) ? c.vestuario : String(c.vestuario).split(',')).map(x => String(x).trim()).filter(Boolean).slice(0, 6);
    if (c.personas !== undefined) { const p = Math.round(Number(c.personas)); if (!Number.isFinite(p) || p < 0 || p > 50) throw new Error('personas debe ser un número de 0 a 50'); n.personas = p; }
    n.editado = new Date().toISOString(); todas[id] = n; respaldo.escribirSeguro(f, todas);
    respaldo.respaldarCarpeta(carpeta).catch(() => {}); // a Drive, sin esperar
    ok(res, { etiqueta: n });
  } catch (e) { mal(res, e); }
});
app.get('/api/tipos', (req, res) => ok(res, TIPOS_TOMA));
// Respaldo del índice en Drive: estado y botón manual.
app.post('/api/respaldar', async (req, res) => { try { ok(res, await respaldo.respaldarTodas()); } catch (e) { mal(res, new Error('No pude respaldar en Drive: ' + String(e.message).slice(0, 140)), 502); } });

// ---------------------------------------------------------------- sesiones de las redes
// El Selector (puerto 8765) lee las cookies del perfil de Firefox de la superapp. Aquí solo se le PREGUNTA si hay sesión iniciada (sí/no y un mensaje);
// la superapp nunca ve ni muestra las cookies.
const SELECTOR_URL = process.env.SELECTOR_URL || 'http://127.0.0.1:8765';
app.get('/api/sesiones', async (req, res) => {
  const redes = [['ig', 'Instagram'], ['tt', 'TikTok'], ['x', 'X'], ['fb', 'Facebook']], out = [];
  for (const [plat, nombre] of redes) {
    try {
      const r = await fetch(SELECTOR_URL + '/api/sesion', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ plat }), signal: AbortSignal.timeout(15000) });
      const j = await r.json(); out.push({ plat, nombre, ok: Boolean(j.ok), mensaje: String(j.mensaje || '').slice(0, 300) });
    } catch (e) { out.push({ plat, nombre, ok: false, mensaje: 'El Selector no responde (¿está abierto? INICIAR-SUPERAPP.bat lo arranca).' }); }
  }
  ok(res, out);
});

// Caché de videos en disco: ver cuánto ocupa, marcar carpetas "recurrentes" (se quedan) y liberar espacio.
app.get('/api/cache', (req, res) => ok(res, { uso: clipsDrive.uso(), recurrentes: clipsDrive.recurrentes(), manuales: clipsDrive.recurrentesManuales(), ttlHoras: clipsDrive.TTL_HORAS, topeGB: clipsDrive.TOPE_GB }));
app.post('/api/recurrente', (req, res) => { try { ok(res, { recurrentes: clipsDrive.marcarRecurrente(req.body.carpeta, Boolean(req.body.si)) }); } catch (e) { mal(res, e); } });
app.post('/api/purgar', (req, res) => { try { if (!G.carpetasBiblioteca().includes(req.body.carpeta)) throw new Error('carpeta desconocida'); ok(res, clipsDrive.purgar(req.body.carpeta)); } catch (e) { mal(res, e); } });
// Mandar clips a la PAPELERA DE DRIVE (recuperable ~30 días) y sacarlos del índice. Solo clips que están en el índice de la carpeta.
app.post('/api/drive/papelera', async (req, res) => {
  try {
    const { carpeta, ids } = req.body || {}; if (!G.carpetasBiblioteca().includes(carpeta)) throw new Error('carpeta desconocida');
    const clips = G.clipsDeBiblioteca(carpeta), validos = (Array.isArray(ids) ? ids : []).filter(id => clips.some(c => c.id === id && !/^loc_/.test(c.id)));
    const drive = require('../drive'), hechos = [], fallos = [];
    for (const id of validos) { try { await drive.enviarAPapelera(id); hechos.push(id); } catch (e) { fallos.push({ id, error: String(e.message).slice(0, 100) }); } }
    if (hechos.length) { const f = path.join(G.BIB, `${carpeta}.clips.json`), act = JSON.parse(fs.readFileSync(f, 'utf8')); fs.copyFileSync(f, f + '.bak'); fs.writeFileSync(f, JSON.stringify(act.filter(c => !hechos.includes(c.id)), null, 1)); for (const id of hechos) { const p = clipsDrive.rutaClip(carpeta, id); try { fs.unlinkSync(p); } catch {} } }
    ok(res, { hechos: hechos.length, fallos });
  } catch (e) { mal(res, e); }
});

// Videos ya renderizados (para verlos desde la misma ventana).
// Estado de publicación de los videos listos: data-motor/renders/estado-publicacion.json { "<nombre>.mp4": { publicado, fecha, linkPost } }
const F_PUBLICADOS = path.join(G.DM, 'renders', 'estado-publicacion.json');
const leerPublicados = () => { try { return JSON.parse(fs.readFileSync(F_PUBLICADOS, 'utf8')); } catch { return {}; } };
app.get('/api/renders', (req, res) => {
  const dir = path.join(G.DM, 'renders'); if (!fs.existsSync(dir)) return ok(res, []); const est = leerPublicados();
  const guion = n => { try { return JSON.parse(fs.readFileSync(path.join(G.DM, 'noticias', n.replace(/\.mp4$/i, ''), 'guion.json'), 'utf8')); } catch { return null; } };
  ok(res, fs.readdirSync(dir).filter(f => /\.mp4$/i.test(f) && !/^prueba/.test(f) && !/^layout-prueba/.test(f)).map(f => { const st = fs.statSync(path.join(dir, f)), g = guion(f), e = est[f] || {};
    return { nombre: f, ruta: path.join(dir, f), tam: st.size, fecha: st.mtime, canal: (g && g.canal) || '(sin canal)', titulo: g && g.titulo || '', publicado: Boolean(e.publicado), fechaPublicado: e.fecha || null, linkPost: e.linkPost || '' }; }).sort((a, b) => b.fecha - a.fecha).slice(0, 200));
});
app.post('/api/render-publicado', (req, res) => {
  try {
    const { nombre, publicado, linkPost } = req.body || {}; const n = path.basename(String(nombre || '')); if (!/^[\w.-]+\.mp4$/i.test(n) || !fs.existsSync(path.join(G.DM, 'renders', n))) throw new Error('video desconocido');
    const est = leerPublicados(); est[n] = publicado ? { publicado: true, fecha: new Date().toISOString(), linkPost: String(linkPost || '').slice(0, 300) } : { publicado: false };
    require('../edl/respaldoIndice').escribirSeguro(F_PUBLICADOS, est); ok(res, est[n]);
  } catch (e) { mal(res, e); }
});
// Ficha de publicación de un video listo: lo que se pega en las redes (título, descripción, hashtags) y de dónde salió. Sale del guion guardado junto al render.
app.get('/api/render-info', (req, res) => {
  const nombre = path.basename(String(req.query.nombre || '')).replace(/\.mp4$/i, ''); if (!/^[\w.-]+$/.test(nombre)) return res.status(400).json({ error: 'nombre inválido' });
  const dir = path.join(G.DM, 'noticias', nombre), leer = f => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return null; } };
  const g = leer('guion.json'), l = leer('lectura.json'); if (!g) return ok(res, { sinFicha: true });
  const portada = fs.existsSync(path.join(G.DM, 'renders', nombre + '.portada.jpg')) || fs.existsSync(path.join(G.DM, 'renders', nombre + '.portada.png'));
  ok(res, { portada, titulo: g.titulo || '', descripcion: g.descripcion || '', hashtags: g.hashtags || [], canal: g.canal || '', fuente: l && l.fuente || '', palabras: g.palabras || null, guion: g.script || '', datosCubiertosPct: g.control && g.control.datosCubiertosPct });
});
// Portada 9:16 del video (JPG para subir a mano; la misma imagen va incrustada en el primer cuadro del video).
app.get('/portada', (req, res) => {
  const n = path.basename(String(req.query.nombre || '')).replace(/\.mp4$/i, ''); if (!/^[\w.-]+$/.test(n)) return res.status(400).end();
  const f = ['.portada.jpg', '.portada.png'].map(e => path.join(G.DM, 'renders', n + e)).find(x => fs.existsSync(x)); if (!f) return res.status(404).end();
  if (req.query.descargar) res.setHeader('Content-Disposition', `attachment; filename="${n}-portada${path.extname(f)}"`); res.sendFile(f);
});
app.get('/render', (req, res) => { const f = path.join(G.DM, 'renders', path.basename(String(req.query.nombre || ''))); if (!/\.mp4$/i.test(f) || !fs.existsSync(f)) return res.status(404).end(); res.sendFile(f); });

const limpiarCaducadosYa = () => { try { const r = clipsDrive.limpiarCaducados(); if (r.borrados) console.log(`Caché: ${r.borrados} videos viejos liberados (${(r.bytes / 1e6).toFixed(0)} MB)`); } catch (e) { console.log('Caché: no pude limpiar:', e.message); } };
const respaldarYa = () => respaldo.respaldarTodas().then(r => { if (r.subidos) console.log(`Índice respaldado en Drive: ${r.subidos} archivos`); }).catch(e => console.log('Respaldo del índice: no pude (', String(e.message).slice(0, 80), ')'));
const iniciar = () => { respaldo.restaurarFaltantes().then(t => { if (t.length) console.log(`Índice restaurado de Drive: ${t.length} archivos`); }).catch(() => {}).then(respaldarYa); setInterval(respaldarYa, 3600e3).unref(); limpiarCaducadosYa(); setInterval(limpiarCaducadosYa, 3600e3).unref(); return app.listen(PUERTO, '127.0.0.1', () => console.log(`Superapp lista: http://127.0.0.1:${PUERTO}  (Selector en http://127.0.0.1:8765)`)); };
if (require.main === module) iniciar();
module.exports = { app, iniciar, encolar, trabajos };

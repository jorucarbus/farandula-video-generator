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
const node = (script, ...args) => ({ cmd: process.execPath, args: [path.join(RAIZ, 'scripts', script), ...args], titulo: `${script} ${args.join(' ')}` });
const py = (script, ...args) => ({ cmd: 'python', args: [path.join(RAIZ, 'scripts', script), ...args], titulo: `${script} ${args.join(' ')}`, opcional: true });

app.get('/api/trabajos', (req, res) => ok(res, trabajos.map(({ pasos, ...t }) => ({ ...t, log: t.log.slice(-2500) })).reverse()));

// Preparar una carpeta: medir calidad y rostros (gratis, local) y, si se pide, etiquetar con Gemini (cuesta llamadas).
app.post('/api/preparar', (req, res) => {
  try {
    const { carpeta, etiquetar } = req.body || {}; if (!carpetaValida(carpeta) || !G.carpetasBiblioteca().includes(carpeta)) throw new Error('carpeta desconocida');
    const pasos = []; if (etiquetar) pasos.push(node('biblioteca-etiquetar-local.js', carpeta)); pasos.push(node('calidad-clips.js', carpeta), py('rostros-clips.py', carpeta));
    ok(res, { id: encolar(`Preparar ${carpeta}${etiquetar ? ' (con etiquetas de Gemini)' : ''}`, pasos).id });
  } catch (e) { mal(res, e); }
});

// Crear video desde un link: uno solo o con su gemelo (canal hermano). Usa la tubería automática (Gemini + voz ElevenLabs).
app.post('/api/crear-video', (req, res) => {
  try {
    const { link, canal, carpeta, gemelo } = req.body || {};
    if (!/^https?:\/\/\S+$/i.test(link || '')) throw new Error('el link debe empezar con http:// o https://');
    if (!carpetaValida(carpeta) || !G.carpetasBiblioteca().includes(carpeta)) throw new Error('elige una carpeta de clips de la biblioteca');
    const ficha = canales.obtener(canal); if (!ficha) throw new Error('canal desconocido');
    const nombre = `gestor-${new Date().toISOString().slice(0, 10)}-${Date.now().toString(36)}`;
    const pasos = [node('noticia-a-video.js', link, '--canal', ficha.nombre, '--carpeta', carpeta, '--nombre', nombre, '--salida', path.join(G.DM, 'renders', `${nombre}.mp4`))];
    if (gemelo) { const h = canales.hermanoDe(canal); if (!h) throw new Error(`"${ficha.nombre}" no tiene canal hermano en canales.json`); const n2 = `${nombre}-${h.clave}`; pasos.push(node('noticia-a-video.js', '--canal', h.nombre, '--carpeta', carpeta, '--nombre', n2, '--desde', nombre, '--salida', path.join(G.DM, 'renders', `${n2}.mp4`))); }
    ok(res, { id: encolar(`Video: ${ficha.nombre}${gemelo ? ' + gemelo' : ''} · ${link.slice(0, 60)}`, pasos).id, salidas: [`${nombre}.mp4`].concat(gemelo ? [`${nombre}-${canales.hermanoDe(canal).clave}.mp4`] : []) });
  } catch (e) { mal(res, e); }
});

// Videos ya renderizados (para verlos desde la misma ventana).
app.get('/api/renders', (req, res) => {
  const dir = path.join(G.DM, 'renders'); if (!fs.existsSync(dir)) return ok(res, []);
  ok(res, fs.readdirSync(dir).filter(f => /\.mp4$/i.test(f) && !/^prueba/.test(f)).map(f => ({ nombre: f, ruta: path.join(dir, f), tam: fs.statSync(path.join(dir, f)).size, fecha: fs.statSync(path.join(dir, f)).mtime })).sort((a, b) => b.fecha - a.fecha).slice(0, 30));
});
app.get('/render', (req, res) => { const f = path.join(G.DM, 'renders', path.basename(String(req.query.nombre || ''))); if (!/\.mp4$/i.test(f) || !fs.existsSync(f)) return res.status(404).end(); res.sendFile(f); });

const iniciar = () => app.listen(PUERTO, '127.0.0.1', () => console.log(`Superapp lista: http://127.0.0.1:${PUERTO}  (Selector en http://127.0.0.1:8765)`));
if (require.main === module) iniciar();
module.exports = { app, iniciar, encolar, trabajos };

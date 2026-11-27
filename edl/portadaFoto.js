// Foto de la protagonista para la portada: el mejor cuadro de rostro de sus clips (índice: rostro local, calidad, resolución).
// Prefiere clips de 1080x1920 (más nítidos), con ella sola y la cara grande, sin barras ni oscuridad; entre los mejores varía según una semilla
// para que dos portadas seguidas de la misma persona no usen la misma foto. Baja de Drive solo el clip elegido (temporal).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const BIB = path.join(process.env.DATA_MOTOR_DIR || path.join(__dirname, '..', 'data-motor'), 'biblioteca');
const leer = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const hash = s => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

// Puntaje de un clip como foto de portada (puro y probable sin archivos).
function puntaje(t, q) {
  if (!t || !t.rostro) return -1;
  const sola = (t.carasEnTomaPrincipal || t.personas || 1) <= 1, r = t.rostro.r || 0, ancho = (q && q.ancho) || 0;
  if (q && q.apto === false) return -1;
  if (r < 0.14) return -1; // cara muy chica: la foto saldría vacía
  // La cara ideal es de tamaño medio (r ≈ 0,16-0,28) y está arriba: una cara enorme o baja queda tapada por el titular, que ocupa del 40 % hacia abajo.
  const penaTam = Math.abs(r - 0.2) * 14, penaAlto = Math.max(0, (t.rostro.cy || 0.4) - 0.42) * 6; // tamaño ideal: radio ≈ 0,20 (la cara ocupa ~un tercio del ancho)
  return (ancho >= 1080 ? 2.5 : ancho >= 720 ? 1.2 : 0) + - penaTam - penaAlto + (sola ? 1.5 : 0) + (t.rostroLocal ? 0.8 : 0) + ((q && q.nitidez) || 0.3) * 1.2 + ((t.fraccionRostro || 0) * 0.8)
    + (['selfie_hablando', 'desfile', 'evento'].includes(t.tipo) ? 0.4 : 0);
}

function candidatos(carpeta) {
  const clips = leer(path.join(BIB, `${carpeta}.clips.json`), []), et = leer(path.join(BIB, `${carpeta}.etiquetas.json`), {}), cal = leer(path.join(BIB, `${carpeta}.calidad.json`), {}), ros = leer(path.join(BIB, `${carpeta}.rostros.json`), {});
  const { mejorRostro } = require('./rostrosLocales');
  // el rostro del modelo era aproximado: si hay detección local, se usa esa (posición, tamaño y momento exactos)
  const conLocal = id => { const t = et[id], loc = ros[id] && mejorRostro(ros[id]); return t && loc ? { ...t, rostro: { ...loc }, rostroLocal: true, carasEnTomaPrincipal: loc.caras } : t; };
  return clips.map(c => { const t = conLocal(c.id); return { clip: c, et: t, q: cal[c.id], p: puntaje(t, cal[c.id]) }; }).filter(x => x.p > 0).sort((a, b) => b.p - a.p);
}

// Devuelve { buffer (PNG del cuadro), foco: {x,y}, clipId, ancho, alto, puntaje } o null.
// La mirada nunca debe salir del cuadro: se prefiere un cuadro donde ella mira al frente (a cámara). `mirada` (async buffer → 'frente'|'izquierda'|'derecha'|null) es inyectable; false la omite.
async function miradaGemini(buffer) {
  const os = require('os'), f = path.join(os.tmpdir(), `portada-mirada-${process.pid}-${Date.now()}.png`);
  try { fs.writeFileSync(f, buffer); const an = await require('./personas').analizarFoto(f); return an && an.mira || null; } finally { try { fs.unlinkSync(f); } catch { /* nada */ } }
}

async function elegirFoto(carpeta, { semilla = '', top = 4, asegurar = null, mirada = miradaGemini, ffmpeg = process.env.FFMPEG_BIN || require('ffmpeg-static') } = {}) {
  const c = candidatos(carpeta).slice(0, top); if (!c.length) return null;
  const orden = [...c.slice(hash(semilla) % c.length), ...c.slice(0, hash(semilla) % c.length)]; // empieza por uno distinto según la semilla
  let respaldo = null; // el mejor cuadro aunque no mire al frente, por si ninguno lo hace
  for (const x of orden) {
    try {
      let ruta = x.clip.ruta;
      if (!ruta || !fs.existsSync(ruta)) { const a = asegurar || require('./clipsDrive').asegurar; const r = await a(carpeta, [x.clip.id]); ruta = r.rutas && r.rutas[x.clip.id]; }
      if (!ruta || !fs.existsSync(ruta)) continue;
      const t = (x.et.rostro && x.et.rostro.t) || 0;
      const buffer = execFileSync(ffmpeg, ['-v', 'error', '-ss', String(t), '-i', ruta, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-'], { maxBuffer: 64 << 20 });
      if (!buffer.length) continue;
      let m = 'frente'; if (mirada) { try { m = await mirada(buffer); } catch { m = null; } }
      const r = { buffer, foco: { x: x.et.rostro.cx, y: x.et.rostro.cy }, radio: x.et.rostro.r, clipId: x.clip.id, ancho: x.q && x.q.ancho, alto: x.q && x.q.alto, puntaje: +x.p.toFixed(2), mira: m };
      if (m === 'frente' || m === null) return r; // null = no se pudo medir: se acepta
      if (!respaldo) respaldo = r;
    } catch { /* se prueba el siguiente */ }
  }
  return respaldo;
}

module.exports = { elegirFoto, candidatos, puntaje };

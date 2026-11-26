// FOTOS DE PERSONAS QUE NO SON LA PROTAGONISTA: se detectan en el guion, se buscan en Wikipedia/Wikimedia (descarga previa, con caché) o se toman de una carpeta manual,
// se recortan en cuadrado sobre el rostro y se muestran en un círculo flotante cuando se las nombra. Regla: el círculo va del lado hacia el que la persona MIRA, para que mire
// hacia ADENTRO del video (si mira a la derecha, el círculo va a la izquierda y viceversa); si no se puede, la foto se espeja. El modelo no identifica a nadie por su cara:
// solo dice dónde está el rostro y hacia dónde mira.
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const DIR = path.join(__dirname, '..', 'data-motor', 'personas');
const UA = { 'User-Agent': 'FarandulaMotor/1.0 (generador de videos)' };
const normalizar = t => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();
const slug = n => normalizar(n).replace(/ /g, '-');

// 1) ¿quién más aparece en el guion? (una llamada barata; los alias de la protagonista se excluyen)
async function detectarPersonas(beats, { excluir = [], llamar = null } = {}) {
  const gemini = require('../gemini'); llamar = llamar || ((p, m) => gemini.llamarJSON(p, m, gemini.TAREAS.etiquetaClip));
  const prompt = `Del guion de un video de farándula, lista las PERSONAS REALES con nombre propio que se mencionan (no la protagonista, no lugares, no marcas, no instituciones). Para cada una: "nombre" tal como aparece (nombre y apellido si los hay), "rol" en pocas palabras según el guion. Responde SOLO JSON: {"personas":[{"nombre":"...","rol":"..."}]}. Excluye: ${excluir.join(', ') || 'nadie'}.`;
  const r = await llamar(prompt, JSON.stringify(beats.map(b => b.frase))); const ex = new Set(excluir.map(normalizar));
  return ((r && r.personas) || []).filter(p => p && p.nombre && !normalizar(p.nombre).split(' ').some(w => ex.has(w))).slice(0, 6);
}

// 2) la foto: carpeta manual primero (data-motor/personas/<slug>.jpg|png|jpeg|webp), luego Wikipedia (es, luego en)
async function buscarEnWikipedia(nombre, rol) {
  const gemini = require('../gemini');
  for (const lang of ['es', 'en']) {
    let titulos = [];
    try { titulos = (await (await fetch(`https://${lang}.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(nombre)}&limit=3&format=json`, { headers: UA })).json())[1] || []; } catch { continue; }
    const t = titulos.find(x => normalizar(x) === normalizar(nombre)) || titulos.find(x => normalizar(x).startsWith(normalizar(nombre)));
    if (!t) continue;
    let sum;
    try { sum = await (await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t.replace(/ /g, '_'))}`, { headers: UA })).json(); } catch { continue; }
    if (sum.type !== 'standard') continue; // homónimos / desambiguación
    const img = sum.originalimage && sum.originalimage.width >= 400 ? sum.originalimage.source : (sum.thumbnail && sum.thumbnail.source);
    if (!img) continue;
    // ¿la página es de la persona que menciona el guion? Se compara su descripción con el rol del guion (no se usa el rostro).
    const ok = await gemini.llamarJSON('Responde SOLO JSON {"mismo":true|false}: ¿la página descrita corresponde a la misma persona que el guion menciona?', JSON.stringify({ guion: { nombre, rol }, pagina: { titulo: sum.title, descripcion: sum.description || '', resumen: String(sum.extract || '').slice(0, 300) } }), gemini.TAREAS.etiquetaClip).catch(() => null);
    if (!ok || ok.mismo !== true) continue;
    return { url: img, pagina: sum.content_urls && sum.content_urls.desktop && sum.content_urls.desktop.page, titulo: sum.title, lang };
  }
  return null;
}

async function fotoDe(persona) {
  fs.mkdirSync(DIR, { recursive: true });
  const s = slug(persona.nombre);
  for (const ext of ['jpg', 'jpeg', 'png', 'webp']) { const f = path.join(DIR, `${s}.${ext}`); if (fs.existsSync(f)) return { ruta: f, fuente: 'manual/caché' }; }
  const w = await buscarEnWikipedia(persona.nombre, persona.rol);
  if (!w) return null;
  const r = await fetch(w.url, { headers: UA });
  if (!r.ok) return null;
  const buf = Buffer.from(await r.arrayBuffer()), img = await loadImage(buf), c = createCanvas(img.width, img.height), f = path.join(DIR, `${s}.jpg`);
  c.getContext('2d').drawImage(img, 0, 0);
  fs.writeFileSync(f, c.toBuffer('image/jpeg', 92));
  fs.writeFileSync(path.join(DIR, `${s}.fuente.json`), JSON.stringify({ nombre: persona.nombre, ...w, descargado: new Date().toISOString().slice(0, 10) }, null, 1));
  return { ruta: f, fuente: w.pagina || w.url };
}

// 3) dónde está el rostro y hacia dónde mira (sin identificar)
async function analizarFoto(ruta, { llamar = null } = {}) {
  const gemini = require('../gemini'), partes = await gemini.parteMultimodal('imagen', ruta);
  // El rectángulo del rostro se pide en el formato nativo de detección de Gemini (box_2d = [ymin, xmin, ymax, xmax] en 0-1000), que es mucho más preciso que pedir centro y radio.
  llamar = llamar || (() => gemini.llamarJSON('Detecta el rostro de la persona principal de esta foto SIN identificar a nadie. Responde SOLO JSON: {"una_persona":true|false,"box_2d":[ymin,xmin,ymax,xmax],"mira":"izquierda"|"derecha"|"frente","nitida":true|false}. box_2d = rectángulo AJUSTADO al rostro (frente a barbilla, de oreja a oreja; sin pelo largo ni hombros) en coordenadas 0-1000 sobre la imagen completa. "mira" = hacia dónde mira la persona vista desde quien mira la foto (de frente = "frente").', [...partes, { text: 'Detecta el rostro.' }], gemini.TAREAS.etiquetaClip));
  const r = await llamar();
  if (r && Array.isArray(r.box_2d) && r.box_2d.length === 4) { // → rostro { cx, cy, r } relativos al ancho (r = mitad del lado mayor del rectángulo), con el aspecto real de la imagen
    const img = await require('@napi-rs/canvas').loadImage(require('fs').readFileSync(ruta)), [y0, x0, y1, x1] = r.box_2d.map(v => Math.max(0, Math.min(1000, Number(v)))), W = img.width, H = img.height;
    r.rostro = { cx: ((x0 + x1) / 2000), cy: ((y0 + y1) / 2000), r: Math.max((x1 - x0) / 1000 * W, (y1 - y0) / 1000 * H) / 2 / W };
  }
  return r;
}

// 4) círculo: recorte cuadrado sobre el rostro (≈ 2,4 veces su radio), espejado si hace falta; el lado de pantalla se elige para que mire hacia adentro
async function prepararCirculo(ruta, an, { lado = null, salida }) {
  const img = await loadImage(fs.readFileSync(ruta)), W = img.width, H = img.height, f = an && an.rostro ? an.rostro : { cx: 0.5, cy: 0.4, r: 0.18 };
  const lad = lado || (an && an.mira === 'derecha' ? 'izq' : an && an.mira === 'izquierda' ? 'der' : 'izq'); // mira a la derecha → círculo a la izquierda (mira hacia el centro)
  const espejar = Boolean(an && ((lad === 'izq' && an.mira === 'izquierda') || (lad === 'der' && an.mira === 'derecha')));
  // lado = 3 veces el radio del rostro (la cabeza entera con algo de aire); centrado EN el rostro (el círculo no corta la cara), sin salirse de la foto
  const px = Math.min(W, H, f.r * W * 3.0), X0 = Math.max(0, Math.min(W - px, f.cx * W - px / 2)), Y0 = Math.max(0, Math.min(H - px, f.cy * H - px / 2));
  const c = createCanvas(512, 512), x = c.getContext('2d');
  x.imageSmoothingQuality = 'high';
  if (espejar) { x.translate(512, 0); x.scale(-1, 1); }
  x.drawImage(img, X0, Y0, px, px, 0, 0, 512, 512);
  fs.writeFileSync(salida, c.toBuffer('image/jpeg', 90));
  return { foto: salida, lado: lad, espejada: espejar };
}

// 5) todo junto → [{ nombre, foto, lado, alias[] }] (las que no tienen foto utilizable se omiten sin romper el video)
async function prepararPersonas(beats, { excluir = [], log = () => {}, conocidas = null } = {}) {
  // `conocidas`: personas con su NOMBRE COMPLETO ya extraído de la noticia ([{nombre, rol}]); así "Nawat" se busca como "Nawat Itsaragrisil" y no se gasta la llamada de detección.
  const ex = new Set(excluir.map(normalizar)), lista = Array.isArray(conocidas) && conocidas.length
    ? conocidas.filter(p => p && p.nombre && !normalizar(p.nombre).split(' ').some(w => ex.has(w))).slice(0, 6)
    : await detectarPersonas(beats, { excluir }), out = [];
  let alterna = 0;
  for (const p of lista) {
    try {
      const f = await fotoDe(p);
      if (!f) { log(`  sin foto: ${p.nombre}`); continue; }
      const an = await analizarFoto(f.ruta);
      if (!an || an.una_persona === false || an.nitida === false) { log(`  foto descartada (no hay una sola persona nítida): ${p.nombre}`); continue; }
      const lado = an.mira === 'frente' ? (alterna++ % 2 ? 'der' : 'izq') : null, c = await prepararCirculo(f.ruta, an, { lado, salida: path.join(DIR, `${slug(p.nombre)}_circulo.jpg`) });
      out.push({ nombre: p.nombre, rol: p.rol, foto: c.foto, lado: c.lado, alias: normalizar(p.nombre).split(' ').filter(w => w.length >= 4), fuente: f.fuente });
      log(`  ${p.nombre}: ${f.fuente} · mira ${an.mira}${c.espejada ? ' (espejada)' : ''} · círculo ${c.lado}`);
    } catch (e) { log(`  fallo con ${p.nombre}: ${e.message.slice(0, 100)}`); }
  }
  return out;
}

// 6) a qué frase y palabra va cada círculo: la primera frase donde aparece su nombre (apellido o nombre de 4+ letras)
function asignarPersonas(escenas, beats, personas) {
  const usadas = new Set();
  for (const pr of personas) {
    for (let k = 0; k < beats.length; k++) {
      const w = normalizar(beats[k].frase).split(' ').find(t => pr.alias.includes(t));
      if (!w) continue;
      const e = escenas.find(x => x.beat === k + 1);
      if (!e || usadas.has(k)) continue;
      usadas.add(k); (e.personas = e.personas || []).push({ nombre: pr.nombre, foto: pr.foto, lado: pr.lado, ancla: w });
      break;
    }
  }
  return escenas;
}

module.exports = { detectarPersonas, buscarEnWikipedia, fotoDe, analizarFoto, prepararCirculo, prepararPersonas, asignarPersonas, slug, normalizar };

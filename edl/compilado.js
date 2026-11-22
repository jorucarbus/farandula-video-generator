// Compilado horizontal (16:9): varias historias (los shorts del día) + puentes con material NUEVO.
//
// Por qué no es "pegar los shorts": un video que solo une shorts es el caso más débil frente a la política
// de contenido inauténtico (nota 15). Cada puente aporta narración nueva (contexto, enlace entre historias)
// y las historias se renombran como ítems de un ranking. Este módulo es PURO salvo `unirAudios` (ffmpeg).
//
//   armarCompilado(segmentos)      -> EDL 16:9 válida (historias + puentes), fit 'auto' en todas las tomas
//   generarPuentes(historias, ...) -> textos de puente con un LLM inyectable; nunca inventa hechos
//   unirAudios(rutas, destino)     -> un solo mp3 con las narraciones en orden
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const FFMPEG_BIN = require('ffmpeg-static');

const PALABRAS_POR_SEGUNDO = 2.5; // 150 ppm, el mismo ritmo del resto del proyecto

function clonar(x) { return JSON.parse(JSON.stringify(x)); }

// ---------------------------------------------------------------- armar el EDL

// segmentos: [{ tipo:'historia', titulo, shots:[shotsDeEdl] } | { tipo:'puente', id, duracion, clip, texto_pantalla? }]
// Devuelve { edl, avisos }. No toca los segmentos recibidos.
function armarCompilado(segmentos, { id = `compilado_${Date.now()}`, aspect = '16:9' } = {}) {
  const avisos = [];
  const shots = [];
  const origenPorVideo = new Map(); // videoId -> primera historia donde apareció
  let numero = 0;

  segmentos.forEach((seg, s) => {
    if (seg.tipo === 'historia') {
      numero++;
      seg.shots.forEach((original, k) => {
        const shot = clonar(original);
        shot.id = `h${numero}_${original.id}`;
        if (k === 0) {
          // La apertura de cada historia es un ítem del ranking: número grande + título.
          shot.recipe = 'ranking_item';
          shot.params = { numero, titulo: String(seg.titulo).slice(0, 50), fit: 'auto' };
        } else {
          // hook_cold_open solo vale para el primer shot de un short: en el compilado pasa a toma normal.
          if (shot.recipe === 'hook_cold_open') { shot.recipe = 'clip_kenburns'; shot.params = {}; }
          if (shot.recipe === 'clip_kenburns' || shot.recipe === 'ranking_item') shot.params = { ...(shot.params || {}), fit: 'auto' };
        }
        if (shot.clip && !shot.clip.esImagen) {
          const previo = origenPorVideo.get(shot.clip.videoId);
          if (previo !== undefined && previo !== numero) avisos.push(`el video ${shot.clip.videoId} aparece en las historias ${previo} y ${numero}`);
          else origenPorVideo.set(shot.clip.videoId, numero);
        }
        shots.push(shot);
      });
    } else if (seg.tipo === 'puente') {
      if (!seg.clip) { avisos.push(`el puente ${seg.id} no tiene clip: se omite del video`); return; }
      shots.push({
        id: `p_${seg.id}`,
        duracion: seg.duracion,
        recipe: 'clip_kenburns',
        params: { dir: 'in', pct: 6, fit: 'auto' },
        clip: { ...seg.clip, duracion: seg.clip.duracion ?? seg.duracion },
        fuente: seg.fuente || { tipo: 'tercero', licencia: 'biblioteca_propia', autor: 'biblioteca de Drive', url: `drive://${seg.clip.videoId}` },
        locucion: seg.texto_pantalla ? { texto_pantalla: seg.texto_pantalla } : undefined,
      });
    } else {
      throw new Error(`segmento ${s}: tipo desconocido '${seg.tipo}'`);
    }
  });

  shots.forEach((sh, i) => { sh.orden = i + 1; if (sh.locucion === undefined) delete sh.locucion; });
  const edl = {
    edl_version: '1',
    id,
    aspect,
    fps: 30,
    audio: { duracion_s: shots.reduce((t, s) => t + s.duracion, 0) },
    transicion_preset: 'ninguno',
    transicion_default: { tipo: 'corte', dur: 0.35 },
    shots,
  };
  return { edl, avisos };
}

// ---------------------------------------------------------------- guion de los puentes

const normalizar = t => String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const palabrasDe = t => normalizar(t).match(/[a-z0-9ñ]+/g) || [];

// Números y nombres propios (palabras con mayúscula a mitad de frase) que el texto del puente trae y
// NINGUNA fuente menciona: son hechos nuevos, y un puente no puede introducirlos.
function hechosNuevos(texto, fuentes) {
  const conocido = new Set(palabrasDe(fuentes.join(' ')));
  const nuevos = new Set();
  for (const n of String(texto).match(/\d[\d.,]*/g) || []) if (!conocido.has(normalizar(n).replace(/[.,]/g, ''))) nuevos.add(n);
  const oraciones = String(texto).split(/(?<=[.!?¿¡])\s+/);
  for (const o of oraciones) {
    const toks = o.match(/[A-ZÁÉÍÓÚÑ][\p{L}]+/gu) || [];
    const inicio = o.trim().match(/^[¿¡"«]?([\p{L}]+)/u);
    for (const t of toks) {
      if (inicio && t === inicio[1]) continue; // la primera palabra de la oración va con mayúscula siempre
      if (!conocido.has(normalizar(t))) nuevos.add(t);
    }
  }
  return [...nuevos];
}

// Fracción de 5-gramas del puente que ya están en las fuentes (no es "re-narrar lo mismo").
function solapamiento(texto, fuentes) {
  const g = (ws) => { const s = new Set(); for (let i = 0; i + 5 <= ws.length; i++) s.add(ws.slice(i, i + 5).join(' ')); return s; };
  const mios = g(palabrasDe(texto));
  if (!mios.size) return 0;
  const suyos = g(palabrasDe(fuentes.join(' ')));
  let comunes = 0;
  for (const x of mios) if (suyos.has(x)) comunes++;
  return comunes / mios.size;
}

// ids de los puentes: intro, p1..p(n-1), cierre
const idsDePuentes = n => ['intro', ...Array.from({ length: Math.max(0, n - 1) }, (_, i) => `p${i + 1}`), 'cierre'];

function puentesDeterministas(historias) {
  const ids = idsDePuentes(historias.length);
  return ids.map(id => {
    if (id === 'intro') return { id, texto: `Hoy repasamos estas historias: ${historias.map(h => h.titulo).join('; ')}.` };
    if (id === 'cierre') return { id, texto: 'Eso fue todo por hoy.' };
    const i = Number(id.slice(1));
    return { id, texto: `Seguimos con: ${historias[i].titulo}.` };
  });
}

function llamarGemini(prompt, mensaje) {
  const gemini = require('../gemini');
  return gemini.llamarJSON(prompt, mensaje, gemini.TAREAS.planEdl);
}

const PROMPT_PUENTES = (n, palabrasMax, errores) => `Eres el guionista de un compilado de ${n} historias de farándula.
Escribe los textos de enlace en español neutro, con tono de conversación, y SOLO con lo que ya dicen las historias.
Reglas: máx. ${palabrasMax} palabras cada uno; NO introduzcas nombres propios, cifras, fechas ni datos que no estén en las historias;
NO repitas frases de las historias (aporta contexto, contraste o un enlace entre una y otra); lo que sea opinión, dilo como opinión.
ids: ${idsDePuentes(n).join(', ')} (intro = apertura, pN = enlace entre la historia N y la N+1, cierre = despedida).
Responde SOLO JSON: {"puentes":[{"id":"...","texto":"..."}]}${errores.length ? `\nTu respuesta anterior tuvo estos problemas, corrígelos:\n- ${errores.join('\n- ')}` : ''}`;

// historias: [{ titulo, texto }] (texto = la narración de esa historia). Devuelve { puentes:[{id,texto}], origen, avisos }.
async function generarPuentes(historias, { llamar = llamarGemini, palabrasMax = 45, maxReintentos = 2, maxSolape = 0.3 } = {}) {
  const avisos = [];
  const fuentes = historias.map(h => `${h.titulo}. ${h.texto}`);
  const ids = idsDePuentes(historias.length);
  let errores = [];

  for (let intento = 0; intento <= maxReintentos; intento++) {
    let r;
    try {
      r = await llamar(PROMPT_PUENTES(historias.length, palabrasMax, errores), JSON.stringify(historias.map((h, i) => ({ n: i + 1, titulo: h.titulo, texto: h.texto }))));
    } catch (e) {
      avisos.push(`el modelo falló (${e.message})`);
      break;
    }
    const porId = new Map(((r && r.puentes) || []).map(p => [p.id, String(p.texto || '').trim()]));
    errores = [];
    for (const id of ids) {
      const t = porId.get(id);
      if (!t) { errores.push(`falta el puente ${id}`); continue; }
      const n = palabrasDe(t).length;
      if (n > palabrasMax) errores.push(`${id}: ${n} palabras (máx. ${palabrasMax})`);
      const nuevos = hechosNuevos(t, fuentes);
      if (nuevos.length) errores.push(`${id}: datos que no están en las historias: ${nuevos.join(', ')}`);
      if (solapamiento(t, fuentes) > maxSolape) errores.push(`${id}: repite frases de las historias`);
    }
    if (!errores.length) return { puentes: ids.map(id => ({ id, texto: porId.get(id) })), origen: 'llm', avisos };
  }
  avisos.push(`puentes deterministas de respaldo${errores.length ? ` (problemas sin resolver: ${errores.join('; ')})` : ''}`);
  return { puentes: puentesDeterministas(historias), origen: 'respaldo', avisos };
}

// Duración de un puente a partir de su texto, a 150 ppm (se afina con el audio real al locutarlo).
const duracionDePuente = texto => Math.max(1.5, Number((palabrasDe(texto).length / PALABRAS_POR_SEGUNDO).toFixed(2)));

// ---------------------------------------------------------------- audio

function unirAudios(rutas, destino) {
  return new Promise((resolve, reject) => {
    if (!rutas.length) return reject(new Error('no hay audios para unir'));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unir-audios-'));
    const lista = path.join(dir, 'lista.txt');
    fs.writeFileSync(lista, rutas.map(r => `file '${path.resolve(r).replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'));
    execFile(FFMPEG_BIN, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lista, '-c:a', 'libmp3lame', '-b:a', '192k', '-ar', '44100', '-ac', '1', destino],
      { timeout: 120000 }, (err, _o, stderr) => {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
        if (err) reject(new Error(`ffmpeg (unir audios): ${(stderr || err.message).slice(-400)}`)); else resolve(destino);
      });
  });
}

module.exports = { armarCompilado, generarPuentes, puentesDeterministas, hechosNuevos, solapamiento, duracionDePuente, unirAudios, idsDePuentes };

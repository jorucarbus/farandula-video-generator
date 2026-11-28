// COMPILADO DIARIO 16:9 (sin tiempo fijo): las últimas N noticias de un canal en un solo video horizontal, con guion y voz propios (no se reciclan los shorts).
// Etapas (cada una deja su archivo en data-motor/compilados/<nombre>/ y se salta si ya existe; --rehacer la repite):
//   1) guion  (1 llamada a Gemini)      2) voz (ElevenLabs, 1 cobro)      3) render 16:9
// Uso: node scripts/compilado-diario.js --canal "Embajadores del Chisme" --youtube "La Naple" [--ultimas 4 | --ids id1,id2] [--hasta-guion] [--rehacer]
require('dotenv').config();
const fs = require('fs'), path = require('path');
const RAIZ = path.join(__dirname, '..'), DM = path.join(RAIZ, 'data-motor'), NOT = path.join(DM, 'noticias');
const args = process.argv.slice(2), arg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; }, bandera = n => args.includes(n);
const leerJ = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
const log = (...a) => console.log(...a);

// Las últimas N noticias del canal (más recientes primero → se devuelven en orden cronológico). Una noticia cuenta si tiene guion y es de ese canal.
function ultimasDelCanal(canal, n) {
  const cand = fs.readdirSync(NOT).filter(d => /^gestor-/.test(d)).map(d => ({ d, g: leerJ(path.join(NOT, d, 'guion.json')) })).filter(x => x.g && norm(x.g.canal) === norm(canal))
    .map(x => ({ ...x, t: fs.statSync(path.join(NOT, x.d, 'guion.json')).mtimeMs })).sort((a, b) => b.t - a.t).slice(0, n);
  return cand.reverse().map(x => x.d);
}

function cargarNoticia(id) {
  const g = leerJ(path.join(NOT, id, 'guion.json')), l = leerJ(path.join(NOT, id, 'lectura.json')), r = leerJ(path.join(NOT, id, 'render.json'), {});
  if (!g || !l) throw new Error(`falta guion o lectura de ${id}`);
  const cronica = typeof l.cronica === 'string' ? l.cronica : (l.cronica || {}).cronica || '';
  return { id, titulo: g.titulo, hechos: (g.hechos && g.hechos.length ? g.hechos : l.hechos || []).filter(h => h && h.texto), cronica, personas: (g.personas || []).map(p => p.nombre), carpeta: r.carpeta || null, canal: g.canal };
}

if (require.main === module) (async () => {
  const canal = arg('--canal', 'Embajadores del Chisme'), youtube = arg('--youtube', canal), n = Number(arg('--ultimas', 4)), rehacer = bandera('--rehacer');
  const ids = arg('--ids', null) ? arg('--ids').split(',').map(s => s.trim()).filter(Boolean) : ultimasDelCanal(canal, n);
  if (!ids.length) throw new Error(`No hay noticias del canal "${canal}"`);
  const hoyLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }, fecha = arg('--fecha', hoyLocal()), nombre = arg('--nombre', `compilado-${fecha}-${norm(youtube)}`), dir = path.join(DM, 'compilados', nombre), fGuion = path.join(dir, 'guion.json');
  fs.mkdirSync(dir, { recursive: true });
  const noticias = ids.map(cargarNoticia);
  log(`Compilado "${nombre}" para YouTube "${youtube}" con ${noticias.length} noticias:\n` + noticias.map((x, i) => `  ${i + 1}. ${x.titulo} (${x.hechos.length} datos, carpeta ${x.carpeta || '?'})`).join('\n'));

  // ---- 1) guion: una sola llamada; el largo sale de lo que haya (sin tope de tiempo)
  let g = !rehacer ? leerJ(fGuion) : null;
  if (!g) {
    const GC = require('../edl/guionCompilado'), r = await GC.generar({ noticias, canalYoutube: youtube, fecha });
    g = { ...r, nombre, youtube, canal, fecha, fuentes: ids, generado: new Date().toISOString() };
    fs.writeFileSync(fGuion, JSON.stringify(g, null, 2));
  } else log('Guion ya escrito; se reutiliza');
  log(`\nGUION: ${g.palabras} palabras · ${g.script.length} caracteres de voz · ≈ ${(g.estimadaSeg / 60).toFixed(1)} min (${g.estimadaSeg.toFixed(0)} s)`);
  (g.avisos || []).forEach(a => log('  AVISO:', a));
  log(`Título: ${g.titulo}\n\n${g.script}\n`);
  if (bandera('--hasta-guion')) { log(`Se detiene en el guion. Revísalo (puedes editar ${path.relative(RAIZ, fGuion)}) y sigue sin --hasta-guion.`); return; }

  // ---- 2) voz (ElevenLabs, UN solo cobro por guion; si ya existe se reutiliza aunque se vuelva a renderizar)
  const fVoz = path.join(dir, 'voz.mp3'), fPal = path.join(dir, 'palabras.json');
  if (!(fs.existsSync(fVoz) && fs.existsSync(fPal)) || bandera('--rehacer-voz')) {
    log(`Voz: ${g.script.length} caracteres (se cobra una vez)…`);
    const el = require('../elevenlabs'), a = await el.generarAudioConTiempos(g.script, require('../ajustes').obtener().modeloVoz);
    fs.copyFileSync(a.audioPath, fVoz);
    const ch = a.caracteres, st = a.inicios, fi = a.fines || st.slice(1).concat([st[st.length - 1] + 0.3]), pal = []; let ini = -1;
    for (let i = 0; i <= ch.length; i++) { const esp = i === ch.length || /\s/.test(ch[i]); if (!esp && ini < 0) ini = i; if (esp && ini >= 0) { pal.push({ w: ch.slice(ini, i).join(''), s: +st[ini].toFixed(3), e: +fi[i - 1].toFixed(3) }); ini = -1; } }
    fs.writeFileSync(fPal, JSON.stringify({ duracion: await require('../video').obtenerDuracion(fVoz), modelo: a.modelo, palabras: pal }, null, 1));
  } else log('Voz ya generada; se reutiliza');
  const W = leerJ(fPal), palabras = W.palabras.map(p => ({ palabra: p.w, t0: p.s, t1: p.e })), durVoz = W.duracion, dur = durVoz + 1.0;
  log(`VOZ: ${durVoz.toFixed(1)} s (estimada ${g.estimadaSeg.toFixed(0)} s) → video de ${dur.toFixed(1)} s`);

  // ---- 3) tramos (intro, cada noticia, cierre) con sus tiempos reales, tomas por tramo y render 16:9
  const partes = [g.intro, ...g.noticias.map(x => x.texto), g.cierre], cuenta = partes.map(t => (String(t).match(/\S+/g) || []).length), total = cuenta.reduce((s, x) => s + x, 0);
  if (total !== palabras.length) throw new Error(`las palabras del guion (${total}) no coinciden con las de la voz (${palabras.length}); borra la voz o revisa el guion`);
  let acum = 0; const inicios = cuenta.map(c => { const t = acum === 0 ? 0 : palabras[acum].t0; acum += c; return t; });
  const segmentos = partes.map((_, i) => {
    const t0 = inicios[i], t1 = i + 1 < partes.length ? inicios[i + 1] : dur;
    if (i === 0) return { tipo: 'intro', t0, t1 };
    if (i === partes.length - 1) return { tipo: 'cierre', t0, t1 };
    const x = g.noticias[i - 1]; return { tipo: 'noticia', n: i, de: g.noticias.length, titular: x.titular, dato: x.dato, fuente: noticias[x.n - 1], t0, t1 };
  });
  segmentos.forEach(s => log(`  ${s.tipo}${s.n ? ' ' + s.n : ''}: ${s.t0.toFixed(1)}–${s.t1.toFixed(1)} s${s.titular ? ' · ' + s.titular : ''}${s.dato ? ' · dato: ' + s.dato : ''}`));

  const CP = require('../lienzo/compilado'), TC = require('../edl/tomasCompilado'), CO = require('../edl/clipsDeOtros'), BIB = require('../edl/biblioteca'), RB = BIB.RAIZ;
  const locales = fs.readdirSync(RB).filter(f => f.endsWith('.clips.json')).map(f => f.replace(/\.clips\.json$/, ''));
  const carpetaDe = nt => (nt.carpeta && locales.includes(nt.carpeta) ? nt.carpeta : locales.find(c => nt.personas.some(p => norm(c) === norm(p))) || null);
  let mapaDrive = {}; try { mapaDrive = process.env.RESPALDO_DRIVE === '0' ? {} : await require('../drive').obtenerCarpetasFamosos(); } catch { /* sin Drive: solo carpetas locales */ }
  // la duración de un clip no siempre está en clips.json: también viene en las etiquetas y en la medición de calidad
  const datos = new Map(), de = c => { if (!datos.has(c)) { const cl = Object.fromEntries(leerJ(path.join(RB, `${c}.clips.json`), []).map(x => [x.id, x])), et = leerJ(path.join(RB, `${c}.etiquetas.json`), {}), ca = leerJ(path.join(RB, `${c}.calidad.json`), {}); for (const [id, k] of Object.entries(cl)) k.duracion = k.duracion || (et[id] || {}).duracion || (ca[id] || {}).duracion || 0; datos.set(c, { clips: cl }); } return datos.get(c); };
  const cargar = c => { let et = leerJ(path.join(RB, `${c}.etiquetas.json`), {}); const cal = leerJ(path.join(RB, `${c}.calidad.json`), null); if (cal && Object.keys(et).length) et = require('../edl/calidadClip').filtrarAptos(et, cal).etiquetas; const duraciones = {}; for (const x of leerJ(path.join(RB, `${c}.clips.json`), [])) if (x && x.duracion) duraciones[x.id] = x.duracion; for (const [id, q] of Object.entries(cal || {})) if (q && q.duracion && !duraciones[id]) duraciones[id] = q.duracion; return { etiquetas: et, duraciones, calidad: cal || {} }; };
  const indexar = async c => { require('child_process').spawnSync(process.execPath, [path.join(__dirname, 'biblioteca-indexar-nuevos.js'), c], { stdio: 'inherit' }); };
  const ctx = { locales, drive: Object.keys(mapaDrive), cargar, indexar, asignar: bandera('--sin-gemini-otros') ? null : CO.elegirCarpetas, log: m => log('  OTROS: ' + m) };
  // tomas POR FRASE: cada oración de cada noticia recibe tomas de la carpeta que le toca (la protagonista o la persona/grupo nombrado), con el tiempo real de la frase repartido en tomas iguales
  const ini0 = []; { let a = 0; for (const c of cuenta) { ini0.push(a); a += c; } }
  const planes = new Map();
  for (const [si, s] of segmentos.entries()) {
    if (s.tipo !== 'noticia') continue;
    const nt = s.fuente, c = carpetaDe(nt); if (!c) throw new Error(`no encuentro la carpeta de clips de "${nt.titulo}"`);
    log(`NOTICIA ${s.n}: ${nt.titulo} (carpeta ${c})`);
    const plan = await TC.planificarNoticia({ texto: partes[si], personas: nt.personas, carpeta: c, nombre: c.replace(/_/g, ' '), palabras: palabras.slice(ini0[si], ini0[si] + cuenta[si]), t0: s.t0, t1: s.t1 }, ctx);
    plan.avisos.forEach(a => log('  ' + a)); planes.set(si, plan);
  }
  const info = x => { const k = de(x.carpeta).clips[x.id]; return k && k.duracion >= 2.2 ? { id: x.id, ruta: k.ruta, duracion: k.duracion, carpeta: x.carpeta } : null; };
  const sinNegro = (ruta, ss) => { const FFM = process.env.FFMPEG_BIN || require('ffmpeg-static'); for (let i = 0; i < 8; i++) { try { const b = require('child_process').execFileSync(FFM, ['-v', 'error', '-ss', String(ss), '-i', ruta, '-frames:v', '1', '-vf', 'scale=16:16,format=gray', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 20 }); if (!b.length || b.reduce((s, x) => s + x, 0) / b.length > 18) return ss; } catch { return ss; } ss += 0.4; } return ss; };
  const faltantes = new Set();
  const armar = () => { // tramos con tomas (las que no se pudieron bajar se excluyen) → cortes
    const ok = x => info(x) && !faltantes.has(x.id), tramos = [];
    for (const [si, p] of planes) for (const t of p.tramos) tramos.push({ t0: t.t0, t1: t.t1, seg: si, frase: t.frase, items: t.items.filter(ok).map(info) });
    const inter = [...planes.values()].map(p => p.protIds.map(id => ({ id, carpeta: p.tramos[0].carpeta }))); const mezcla = []; for (let k = 0; mezcla.length < 40 && k < 40; k++) for (const l of inter) if (l[k]) mezcla.push(l[k]);
    const pe = mezcla.filter(ok).map(info);
    for (const [si, s] of segmentos.entries()) if (s.tipo !== 'noticia') tramos.push({ t0: s.t0, t1: s.t1, seg: si, frase: null, items: s.tipo === 'intro' ? pe : [...pe].reverse() });
    return CP.planificarTomas(tramos, { ajustarSs: sinNegro });
  };
  let cortes = armar();
  for (let vuelta = 0; vuelta < 2; vuelta++) { // bajar de Drive SOLO las tomas que se van a usar; si alguna no baja, se excluye y se reparte otra vez
    const porCarpeta = new Map(); for (const c of cortes) { const carp = [...planes.values()].flatMap(p => p.tramos.flatMap(t => t.items)).concat(...[]).find(x => x.id === c.id); const cc = (carp && carp.carpeta) || null; if (!fs.existsSync(c.clip)) { const k = cc || locales.find(l => de(l).clips[c.id]); if (!porCarpeta.has(k)) porCarpeta.set(k, new Set()); porCarpeta.get(k).add(c.id); } }
    if (!porCarpeta.size) break;
    for (const [k, ids] of porCarpeta) { try { const h = await require('../edl/clipsDrive').asegurar(k, [...ids], { log: m => log('  ' + m) }); log(`DRIVE: ${h.bajados} clip(s) de ${k} bajados`); } catch (e) { log('no pude bajar clips de ' + k + ': ' + String(e.message).slice(0, 100)); } }
    const aun = cortes.filter(c => !fs.existsSync(c.clip)).map(c => c.id); if (!aun.length) break; aun.forEach(id => faltantes.add(id)); cortes = armar();
  }
  const maxVisto = Math.max(...cortes.map(c => c.t1 - c.t0 + CP.TRANS));
  log(`TOMAS: ${cortes.length} cortes por frase, el más largo se ve ${maxVisto.toFixed(2)} s (tope 3 s) · clips distintos: ${new Set(cortes.map(c => c.id)).size}`);
  if (maxVisto > 3.001) throw new Error('una toma pasa de 3 s: no se renderiza');
  fs.writeFileSync(path.join(dir, 'cortes.json'), JSON.stringify(cortes.map(c => ({ seg: c.seg, frase: c.frase, id: c.id, ss: +c.ss.toFixed(2), t0: +c.t0.toFixed(2), t1: +c.t1.toFixed(2) })), null, 1));

  const { paletaDe } = require('../lienzo/portada'), estilo = require('../estilos/capitol'), paleta = paletaDe(youtube), MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
  const [aa, mm, dd] = g.fecha.split('-').map(Number), fechaTxt = `${dd} DE ${MESES[mm - 1]} DE ${aa}`;
  let fondo = null; if (!bandera('--sin-musica')) { try { const mf = require('../lienzo/musicaFondo'); fondo = await mf.prepararFondo({ tono: arg('--tono', mf.tonoDeGuion(g.script)), duracion: dur, jobId: 'compilado' + process.pid, clave: nombre }); log(`MÚSICA: ${fondo.nombre} (tono ${fondo.tono}, ${fondo.gananciaDb} dB)`); } catch (e) { log('sin música de fondo: ' + String(e.message).slice(0, 140)); } }
  // gráficos animados (cifra con conteo, cita, lista, mapa con avión): UNA llamada barata para todo el compilado, validada en local; se guarda en graficos.json y no se repite al re-renderizar
  const GC = require('../edl/graficosCompilado'), fGraf = path.join(dir, 'graficos.json');
  let grafSel = !bandera('--rehacer-graficos') ? leerJ(fGraf) : null;
  if (!grafSel && !bandera('--sin-graficos')) {
    const noticiasG = segmentos.map((s, si) => (s.tipo === 'noticia' ? { titular: s.titular, t0: s.t0, t1: s.t1, frases: planes.get(si).tramos.map(t => ({ frase: t.frase, t0: t.t0, t1: t.t1 })) } : null)).filter(Boolean);
    try { const r = await GC.seleccionar(noticiasG); grafSel = r.graficos; r.avisos.forEach(a => log('  GRÁFICOS: ' + a)); fs.writeFileSync(fGraf, JSON.stringify(grafSel, null, 1)); }
    catch (e) { log('sin gráficos animados (' + String(e.message).slice(0, 120) + '): se usa el recuadro "EL DATO"'); grafSel = []; }
  }
  const graficos = GC.construir(grafSel || [], { palabras });
  log(`GRÁFICOS: ${graficos.length} → ${graficos.map(g => `${g.tipo}@noticia ${g.noticia + 1} (${g.t0.toFixed(1)}–${g.t1.toFixed(1)} s)`).join(', ') || 'ninguno'}`);
  const extras = segmentos.flatMap(s => [s.titular, s.dato]).join(' ').split(/\s+/).filter(Boolean);
  const escena = CP.crearEscena({ cortes, segmentos, marca: { paleta, logo: paleta.logo }, fecha: fechaTxt, estilo, t1: dur, graficos }), subtitulos = CP.crearSubtitulos({ palabras, estilo, extras });
  const salida = arg('--salida', path.join(dir, `${nombre}.mp4`)), ini = Date.now();
  await require('../lienzo/render').renderizar({ w: CP.W, h: CP.H, fps: 30, duracion: dur, audio: fVoz, musica: fondo && fondo.listo, salida, estilo, subtitulos, elementos: [escena], alCuadro: (i, n) => process.stdout.write(`\r${i}/${n}  `) });
  log(`\nLISTO ${salida} (${Math.round((Date.now() - ini) / 1000)} s de render)\nTítulo: ${g.titulo}\nDescripción: ${g.descripcion}`);
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });

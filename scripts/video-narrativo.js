// VIDEO NARRATIVO AUTOMÁTICO de punta a punta: guion (beats + hechos) + voz → tiempos por palabra (Whisper) → clips reales
// de la biblioteca que calzan con cada frase → director (modelo con respaldo por reglas) → ensamblador → render.
// Nadie coloca nada a mano. Uso: node scripts/video-narrativo.js [--sin-llm] [--sin-clips] [--carpeta Leidy_Alvarez] [--hasta 74] [--salida ruta.mp4]
// Requiere data-motor/guion-reina.json, la voz en data-motor/audios y data-motor/narrativo-voz/palabras-whisper.json.
// Para usar clips reales primero: node scripts/biblioteca-etiquetar.js <Carpeta>   (descarga y etiqueta una sola vez).
require('dotenv').config();
const fs = require('fs'), path = require('path');
const estilo = require('../estilos/capitol');
const { alinearPalabras, ventanasDeFrases } = require('../edl/tiemposPalabras');
const { dirigir, directorPorReglas, validarDireccion, EMOCIONES, GESTOS } = require('../edl/director');
const { elegirClips, dimensiones, candidatosRelleno, RAIZ } = require('../edl/biblioteca');
const { crearSubtitulos } = require('../lienzo/subtitulos');
const { ensamblar } = require('../lienzo/ensamblador');
const { renderizar } = require('../lienzo/render');
const { envolventeDeVoz } = require('../lienzo/voz');
const { visemasDesdePalabras } = require('../lienzo/titere-rig');
const { ventanasDeCitas, vozSoloEnCitas } = require('../lienzo/citas');
const { planificar, storyboardMarkdown } = require('../edl/storyboard');

const DM = path.join(__dirname, '..', 'data-motor'), KIT = path.join(__dirname, '..', 'assets', 'kit');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const g = JSON.parse(fs.readFileSync(arg('--guion', path.join(DM, 'guion-reina.json')), 'utf8'));
const w = JSON.parse(fs.readFileSync(arg('--palabras', path.join(DM, 'narrativo-voz', 'palabras-whisper.json')), 'utf8'));
const AUDIO = arg('--audio', path.join(DM, 'audios', '2026-11-23 Narrativo con voz.mp3'));
// MÍNIMO 60 s (los programas que pagan por vistas exigen más de un minuto): si la voz es más corta se completa con SILENCIO hasta 62,4 s y ahí sigue la música de fondo y las tomas (la voz queda intacta, sin reescalar tiempos).
const OBJETIVO_MIN = Number(arg('--minimo', 62.4)), durVideo = Math.max(w.duracion, OBJETIVO_MIN), hasta = Number(arg('--hasta', Math.min(durVideo, 74)));
let AUDIO_VIDEO = AUDIO;
if (w.duracion < OBJETIVO_MIN) { const tmp = path.join(require('os').tmpdir(), `voz_${process.pid}.mp3`); require('child_process').execFileSync(process.env.FFMPEG_BIN || require('ffmpeg-static'), ['-y', '-loglevel', 'error', '-i', AUDIO, '-af', `apad=whole_dur=${OBJETIVO_MIN}`, '-c:a', 'libmp3lame', '-q:a', '2', tmp]); AUDIO_VIDEO = tmp; console.log(`MÍNIMO ${OBJETIVO_MIN} s: la voz dura ${w.duracion.toFixed(1)} s; se completa con ${(OBJETIVO_MIN - w.duracion).toFixed(1)} s de música/tomas`); }
const carpeta = arg('--carpeta', 'Leidy_Alvarez');

// Si el clip empieza en negro (fundido de entrada), se corre el inicio de la toma hasta el primer cuadro con imagen.
function sinNegro(ruta, ss) {
  const FFM = process.env.FFMPEG_BIN || require('ffmpeg-static');
  for (let i = 0; i < 8; i++) { try { const b = require('child_process').execFileSync(FFM, ['-v', 'error', '-ss', String(ss), '-i', ruta, '-frames:v', '1', '-vf', 'scale=16:16,format=gray', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 20 }); if (!b.length || b.reduce((s, x) => s + x, 0) / b.length > 18) return ss; } catch { return ss; } ss += 0.4; }
  return ss;
}

(async () => {
  const palabras = alinearPalabras(g.script, w.palabras, { duracion: w.duracion });
  const V = ventanasDeFrases(g.beats, palabras);

  // clips reales: qué clip de la biblioteca calza con cada frase (o ninguno)
  let elecciones = new Map(), etiquetas = null, rutaDe = {}; const cfgClips = {};
  // Índice del artista al día: la primera vez que se usa un artista (o si aparecen videos nuevos en su carpeta de Drive) se etiquetan SOLO los clips sin etiqueta,
  // una vez, y queda guardado y respaldado. Lo ya etiquetado no gasta IA. --sin-indice-auto lo salta.
  if (!process.argv.includes('--sin-indice-auto') && !process.argv.includes('--sin-clips')) require('child_process').spawnSync(process.execPath, [path.join(__dirname, 'biblioteca-indexar-nuevos.js'), carpeta], { stdio: 'inherit' });
  const canalPortada = arg('--canal', ''); let fotosPersonas = []; // fotos de las otras personas (círculos de la portada)
  const rEtiq = path.join(RAIZ, `${carpeta}.etiquetas.json`), rClips = path.join(RAIZ, `${carpeta}.clips.json`);
  const protagonista = arg('--protagonista', carpeta.replace(/_/g, ' '));
  // Los videos viven en Drive: solo se bajan los que este video va a usar (y se borran solos a las 48 h, salvo las carpetas recurrentes).
  const hidratar = async ids => {
    const faltan = [...new Set(ids)].filter(id => rutaDe[id] && !fs.existsSync(rutaDe[id])); if (!faltan.length) return;
    try { const h = await require('../edl/clipsDrive').asegurar(carpeta, faltan, { log: m => console.log('  ' + m) }); console.log(`DRIVE: ${h.bajados} clip(s) bajados para editar${h.fallos.length ? ', fallaron ' + h.fallos.length + ' (' + h.fallos[0].error + ')' : ''}`); }
    catch (e) { console.log('no pude bajar clips de Drive:', String(e.message).slice(0, 120)); }
  };
  let rostrosSerie = {}; // detección local por cuadro (para reencuadrar cuando una tarjeta tapa la cara)
  const infoClip = id => { const t = etiquetas[id]; return { ruta: rutaDe[id], ...dimensiones(rutaDe[id]), rostro: t.rostro, duracion: t.duracion, caras: rostrosSerie[id] ? rostrosSerie[id].cuadros : null }; };
  if (!process.argv.includes('--sin-clips') && fs.existsSync(rEtiq) && fs.existsSync(rClips)) {
    etiquetas = JSON.parse(fs.readFileSync(rEtiq, 'utf8'));
    const nac = arg('--nacimiento', null); // YYYY-MM-DD: solo clips de cuando ya era mayor de edad (no se muestra a la persona siendo menor)
    if (nac) { const mayor = String(Number(nac.slice(0, 4)) + 18) + nac.slice(4), antes = Object.keys(etiquetas).length; etiquetas = Object.fromEntries(Object.entries(etiquetas).filter(([, t]) => t.fecha >= mayor)); console.log('MAYOR DE EDAD desde ' + mayor + ': ' + Object.keys(etiquetas).length + ' de ' + antes + ' clips'); } rutaDe = Object.fromEntries(JSON.parse(fs.readFileSync(rClips, 'utf8')).map(c => [c.id, c.ruta]));
    // Puerta de calidad: los clips que no se ven bien a pantalla completa (resolución, barras, oscuros...) no se eligen. --sin-calidad la salta.
    const rCal = path.join(RAIZ, `${carpeta}.calidad.json`);
    if (!process.argv.includes('--sin-calidad') && fs.existsSync(rCal)) { const fa = require('../edl/calidadClip').filtrarAptos(etiquetas, JSON.parse(fs.readFileSync(rCal, 'utf8'))); etiquetas = fa.etiquetas; console.log(`CALIDAD: ${fa.descartados.length} clip(s) descartados por calidad${fa.aviso ? ' — ' + fa.aviso : ''}`); }
    // Rostros medidos en local: corrigen la posición/tamaño/momento que había adivinado el modelo (de ahí salían los círculos "aleatorios"). --sin-rostros-locales los salta.
    const rRos = path.join(RAIZ, `${carpeta}.rostros.json`);
    if (!process.argv.includes('--sin-rostros-locales') && fs.existsSync(rRos)) { rostrosSerie = JSON.parse(fs.readFileSync(rRos, 'utf8')); const ap = require('../edl/rostrosLocales').aplicar(etiquetas, rostrosSerie); etiquetas = ap.etiquetas; console.log(`ROSTROS LOCALES: ${ap.corregidos} clips corregidos, ${ap.sinCara} sin cara detectada`); }
    const r = await elegirClips(g.beats, etiquetas, { protagonista }); elecciones = r.elecciones; await hidratar([...elecciones.values()].map(c => c.id));
    console.log(`CLIPS REALES de ${carpeta}: ${Object.keys(etiquetas).length} etiquetados, ${elecciones.size} frases con clip ${r.avisos.join(' || ')}`);
    for (const [i, c] of elecciones) { const t = etiquetas[c.id]; cfgClips[c.id] = infoClip(c.id); console.log(`  [${c.nivel || 'exacta'}] frase ${i + 1} ← ${t.fecha} "${t.descripcion.slice(0, 80)}" | ${c.motivo}`); }
  } else console.log('sin clips reales (falta etiquetar la carpeta o --sin-clips)');

  // VIDEOS DE OTRAS PERSONAS: si el guion nombra a alguien con carpeta propia (aquí o en Drive), en las frases que la nombran van tomas SUYAS (--sin-clips-otros lo salta)
  if (!process.argv.includes('--sin-clips-otros') && !process.argv.includes('--sin-clips') && (g.script || g.beats)) {
    try {
      const CO = require('../edl/clipsDeOtros'), leerJ = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
      let mapaDrive = {}; try { mapaDrive = process.env.RESPALDO_DRIVE === '0' ? {} : await require('../drive').obtenerCarpetasFamosos(); } catch { /* sin Drive: solo carpetas locales */ }
      const locales = fs.readdirSync(RAIZ).filter(f => f.endsWith('.etiquetas.json')).map(f => f.replace(/\.etiquetas\.json$/, ''));
      const cargar = c => { let et = leerJ(path.join(RAIZ, `${c}.etiquetas.json`), {}); const cal = leerJ(path.join(RAIZ, `${c}.calidad.json`), null); if (cal && Object.keys(et).length) et = require('../edl/calidadClip').filtrarAptos(et, cal).etiquetas; const duraciones = {}; for (const x of leerJ(path.join(RAIZ, `${c}.clips.json`), [])) if (x && x.duracion) duraciones[x.id] = x.duracion; return { etiquetas: et, duraciones }; };
      const indexar = async c => { require('child_process').spawnSync(process.execPath, [path.join(__dirname, 'biblioteca-indexar-nuevos.js'), c], { stdio: 'inherit' }); };
      // además de las personas que listó la lectura, las que el guion nombra y tienen carpeta (p. ej. Kike Jav → Kike_Jav_Cuy)
      const textoGuion = g.script || g.beats.map(b => b.frase).join(' '), extra = CO.personasEnTexto(textoGuion, [...new Set([...locales, ...Object.keys(mapaDrive)])], { excluir: [carpeta, protagonista], yaListadas: (g.personas || []).map(p => p.nombre) });
      if (extra.length) console.log('OTROS: nombrados con carpeta propia: ' + extra.map(x => x.nombre + ' → ' + x.carpeta).join(', '));
      // alias aprendidos (sin IA) y, para los nombres sin carpeta, una búsqueda en internet UNA sola vez (queda guardada en data-motor/alias-personas.json)
      const AL = require('../edl/aliasPersonas'); await AL.sincronizar({ log: m => console.log('OTROS: ' + m) }); const todasC = [...new Set([...locales, ...Object.keys(mapaDrive)])], reg = AL.cargar(), excl = [carpeta, protagonista];
      const aprendidos = AL.personasEnTexto(textoGuion, todasC, reg).filter(x => x.carpeta !== carpeta && !extra.some(e => e.carpeta === x.carpeta));
      const porResolver = (g.personas || []).filter(p => !CO.buscarCarpeta(p.nombre, todasC, { excluir: excl }) && !aprendidos.some(x => x.alias.includes(CO.norm(p.nombre))));
      const resueltas = []; let consultas = 0;
      for (const p of porResolver) {
        if (process.argv.includes('--sin-alias-web') || consultas >= 4) break;
        const conocido = Boolean(reg.alias[CO.norm(p.nombre)] || reg.sinCarpeta[CO.norm(p.nombre)]); if (!conocido) consultas++;
        const r = await AL.resolver(p.nombre, { carpetas: todasC, reg, excluir: excl, contexto: (g.hechos || []).slice(0, 3).map(h => h.texto).join(' ') });
        if (r.carpeta && r.carpeta !== carpeta) { resueltas.push({ nombre: p.nombre, carpeta: r.carpeta, alias: [p.nombre] }); console.log(`OTROS: "${p.nombre}" es ${r.carpeta} (${r.origen})`); }
      }
      const otros = await CO.planificar({ elegir: process.argv.includes('--sin-gemini-otros') ? null : CO.elegirConGemini, beats: g.beats, personas: [...(g.personas || []).filter(p => !resueltas.some(r => r.nombre === p.nombre)), ...extra, ...aprendidos, ...resueltas], protagonista: [carpeta, protagonista], existentes: elecciones, carpetasLocales: locales, carpetasDrive: Object.keys(mapaDrive), cargar, indexar, log: m => console.log('OTROS: ' + m) });
      const porCarpeta = new Map(); for (const [id, c] of otros.carpetaDe) { if (!porCarpeta.has(c)) porCarpeta.set(c, []); porCarpeta.get(c).push(id); }
      for (const [c, ids] of porCarpeta) { // bajar de Drive solo esas tomas y medirlas
        const clipsC = leerJ(path.join(RAIZ, `${c}.clips.json`), []), ros = leerJ(path.join(RAIZ, `${c}.rostros.json`), {}), et = cargar(c).etiquetas, ruta = Object.fromEntries(clipsC.map(x => [x.id, x.ruta]));
        const faltan = ids.filter(id => ruta[id] && !fs.existsSync(ruta[id]));
        if (faltan.length) { try { const h = await require('../edl/clipsDrive').asegurar(c, faltan, { log: m => console.log('  ' + m) }); console.log(`DRIVE: ${h.bajados} clip(s) de ${c} bajados`); } catch (e) { console.log('no pude bajar clips de ' + c + ':', String(e.message).slice(0, 120)); } }
        for (const id of ids) {
          const beat = [...otros.elecciones].find(([, v]) => v.id === id)[0];
          if (!ruta[id] || !fs.existsSync(ruta[id])) { otros.elecciones.delete(beat); continue; }
          cfgClips[id] = { ruta: ruta[id], ...dimensiones(ruta[id]), rostro: et[id].rostro, duracion: et[id].duracion || (clipsC.find(x => x.id === id) || {}).duracion, caras: ros[id] ? ros[id].cuadros : null };
        }
      }
      for (const [i, c] of otros.elecciones) { elecciones.set(i, c); console.log(`  [otra persona] frase ${i + 1} ← ${c.persona}: ${c.motivo}`); }
      otros.avisos.forEach(a => console.log('OTROS:', a)); await AL.sincronizar({});
    } catch (e) { console.log('sin clips de otras personas:', String(e.message).slice(0, 140)); }
  }
  const SIN_MUNECO = process.argv.includes('--sin-muneco'); // sin personajes: tomas reales + motion graphics
  const dir = process.argv.includes('--sin-llm') ? { escenas: directorPorReglas(g.beats, g.hechos, elecciones, { sinMuneco: SIN_MUNECO }), origen: 'reglas', avisos: [] } : await dirigir(g.beats, g.hechos, { clips: elecciones, sinMuneco: SIN_MUNECO });
  console.log(`DIRECTOR (${dir.origen}) ${dir.avisos.join(' || ')}`);
  // REVISOR DEL PLAN (una llamada de texto, barata): verifica que lo visual acompañe lo narrado y mejora lo técnico. Sus cambios pasan por los validadores; --sin-revisor lo salta.
  let revisionPlan = null;
  if (!process.argv.includes('--sin-llm') && !process.argv.includes('--sin-revisor')) {
    try {
      const refs = require('../edl/exitos').referencias(DM, { canal: g.canal || '' });
      revisionPlan = await require('../edl/revisorPlan').revisarPlan({ beats: g.beats, hechos: g.hechos, clips: elecciones, escenas: dir.escenas, referencias: refs });
      dir.escenas = revisionPlan.escenas;
      console.log(`REVISOR: ${revisionPlan.aplicados.length} cambio(s)${refs ? ' (con referencias de videos exitosos)' : ''}${revisionPlan.avisos.length ? ' · ' + revisionPlan.avisos.join(' | ') : ''}`);
      revisionPlan.aplicados.forEach(c => console.log(`  frase ${c.beat}: ${c.de} -> ${c.a} · ${c.motivo}`));
    } catch (e) { console.log('(el revisor del plan no pudo correr: ' + String(e.message).slice(0, 100) + ')'); }
  }
  dir.escenas.forEach(e => console.log(`  ${e.beat}. ${e.principal}${e.muneco ? ` + muñeco ${e.muneco.pose}/${e.muneco.emocion}${e.muneco.accesorio ? '/' + e.muneco.accesorio : ''}` : ''} | extras: ${(e.extras || []).map(x => x.icono || x.tipo).join(', ') || '-'}`));
  // fotos de las otras personas nombradas (círculos flotantes); --sin-personas las quita
  if (!process.argv.includes('--sin-personas')) {
    try {
      const P2 = require('../edl/personas'), excluir = require('../edl/storyboard').REACCIONES.protagonista.alias.concat(protagonista.toLowerCase().split(' ')),
        otras = await P2.prepararPersonas(g.beats, { excluir, log: m => console.log(m), conocidas: g.personas });
      fotosPersonas = otras; P2.asignarPersonas(dir.escenas, g.beats, otras); console.log(`PERSONAS con foto: ${otras.map(p => p.nombre).join(', ') || 'ninguna'}`);
      // VS y apoyo: solo si la frase lo pide y hay fotos de las personas nombradas (la protagonista sale de su mejor cuadro de rostro, medido en local)
      if (!process.argv.includes('--sin-sociales')) {
        const figuras = otras.map(p => ({ nombre: p.nombre, foto: p.foto, alias: p.alias }));
        const mejor = etiquetas ? Object.values(etiquetas).filter(t => t.rostroLocal && rutaDe[t.id] && fs.existsSync(rutaDe[t.id]) && (t.carasEnTomaPrincipal || 1) <= 1).sort((x, y) => y.rostro.r - x.rostro.r)[0] : null;
        if (mejor) {
          try {
            const fr = path.join(require('os').tmpdir(), 'protag_' + process.pid + '.jpg'); require('child_process').execFileSync(process.env.FFMPEG_BIN || require('ffmpeg-static'), ['-y', '-v', 'error', '-ss', String(mejor.rostro.t), '-i', rutaDe[mejor.id], '-frames:v', '1', fr]);
            const pc = await P2.prepararCirculo(fr, { rostro: mejor.rostro, mira: 'frente' }, { lado: 'izq', salida: path.join(__dirname, '..', 'data-motor', 'personas', P2.slug(protagonista) + '_protagonista.jpg') });
            figuras.push({ nombre: protagonista, foto: pc.foto, alias: protagonista.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/s+/).filter(w => w.length >= 4).concat(require('../edl/storyboard').REACCIONES.protagonista.alias) });
          } catch (e) { console.log('sin foto de la protagonista para VS/apoyo:', e.message.slice(0, 100)); }
        }
        const so = require('../edl/graficosSociales').asignarSociales(dir.escenas, g.beats, figuras, { abajo: SIN_MUNECO }); so.avisos.forEach(x => console.log('SOCIAL:', x));
      }
    } catch (e) { console.log('sin fotos de personas:', e.message.slice(0, 140)); }
  }
  const errores = validarDireccion(dir.escenas, g.beats, g.hechos, elecciones); if (errores.length) throw new Error('dirección inválida: ' + errores.join('; '));
  // El plan final (con lo que cambió el revisor) queda junto al guion: sirve para comparar después qué secuencias visuales funcionan (ver edl/exitos.js).
  try { fs.writeFileSync(path.join(path.dirname(arg('--guion', path.join(DM, 'guion-reina.json'))), 'plan.json'), JSON.stringify({ escenas: dir.escenas.map(({ beat, principal, extras }) => ({ beat, principal, extras: (extras || []).map(x => x.tipo) })), origen: dir.origen, revisor: revisionPlan ? { aplicados: revisionPlan.aplicados, descartados: revisionPlan.descartados } : null, fecha: new Date().toISOString() }, null, 1)); } catch { /* opcional */ }
  // montaje de fondo: clips de la protagonista con rostro, primero los de acción y luego por tamaño del rostro (cada uno se usa una sola vez).
  // --sin-montaje vuelve al diseño anterior (ventana pequeña de 3 s + relleno de huecos).
  const cand = etiquetas ? candidatosRelleno(Object.values(etiquetas).filter(t => t.rostro && rutaDe[t.id])) : []; await hidratar(cand.slice(0, 16)); // solo se bajan los 16 mejores candidatos de relleno
  const lista = cand.filter(id => fs.existsSync(rutaDe[id])); // relleno con criterio: tomas donde sale ella (≤ 2 personas, rostro visible)
  const montaje = etiquetas && !process.argv.includes('--sin-montaje') ? { ids: lista, info: id => ({ ruta: rutaDe[id], rostro: etiquetas[id].rostro, duracion: etiquetas[id].duracion, ...dimensiones(rutaDe[id]), caras: rostrosSerie[id] ? rostrosSerie[id].cuadros : null }) } : null;
  const relleno = etiquetas && !montaje ? { ids: lista, info: infoClip } : null;
  // STORYBOARD: el experto decide el guion visual (muñeco con los datos, reacciones por plantilla, planos, lados, nunca parado; video que ilustra cuando el muñeco no aporta)
  const sb = process.argv.includes('--sin-storyboard') || SIN_MUNECO ? { escenas: dir.escenas, storyboard: [] } : planificar(dir.escenas, g.beats, { emocionesValidas: EMOCIONES, gestosValidos: GESTOS, hayVideo: Boolean(montaje) });
  const escenas = sb.escenas.filter(e => V[e.beat - 1].t0 < hasta);
  // cabeza y kit (--cabeza): rig-foto (por defecto: muñeco articulado de piezas de foto, assets/foto-rig) | plastilina | fotos (muñeco de foto de una pieza)
  const KP = path.join(__dirname, '..', 'assets', 'kit-plastilina', 'rig'), KF = path.join(__dirname, '..', 'assets', 'foto-rig'), modoCab = arg('--cabeza', fs.existsSync(path.join(KF, 'rig.json')) ? 'rig-foto' : 'plastilina');
  const usaPlast = modoCab === 'plastilina' && fs.existsSync(path.join(KP, 'cabeza.png')), usaRigFoto = modoCab === 'rig-foto' && fs.existsSync(path.join(KF, 'rig.json'));
  const slug = carpeta.split('_')[0].toLowerCase(), persona = arg('--persona', fs.existsSync(path.join(KF + '-' + slug, 'rig.json')) ? slug : ''), // por defecto el muñeco de la protagonista si existe (Leidy_Alvarez → assets/foto-rig-leidy)
     cab = usaRigFoto ? { kit: 'rig-foto', trajeFoto: persona ? 'bastonera-foto@' + persona : undefined } // --persona leidy: cabeza y bocas de la protagonista (assets/foto-rig-leidy) // muñeco articulado de piezas de FOTO (assets/foto-rig): manos de piel, bocas fotográficas por visema
    : usaPlast ? { kit: 'plastilina' } // muñeco articulado de piezas (assets/kit-plastilina/rig)
    : { foto: fs.readFileSync(path.join(KIT, 'cabeza-relleno-mujer.png')), recorte: { cx: 0.5, cy: 0.345, rx: 0.353, ry: 0.28 } };
  // voz del muñeco: abertura/energía del audio y VISEMAS sacados del texto y los tiempos de cada palabra (sincronía labial)
  const FPS = 30, env = await envolventeDeVoz(AUDIO_VIDEO, { fps: FPS, duracion: hasta }), visemas = visemasDesdePalabras(palabras.map(p => ({ texto: p.palabra, t0: p.t0, t1: p.t1 })), FPS, Math.ceil(hasta * FPS) + 1), vozTotal = { ...env, visemas };
  // REGLA: la protagonista no habla con la voz del narrador, solo reacciona; su boca solo se sincroniza donde el guion la CITA (comillas o beat.cita). --lipsync-total solo para pruebas.
  const citas = ventanasDeCitas(g.beats, palabras, V), voz = process.argv.includes('--lipsync-total') ? vozTotal : vozSoloEnCitas(vozTotal, citas, FPS);
  console.log(citas.length ? `CITAS (la protagonista habla): ${citas.map(c => c.t0.toFixed(1) + '-' + c.t1.toFixed(1) + 's').join(', ')}` : 'Sin citas: la protagonista solo reacciona (no hay sincronía labial).');
  const { elementos, claves, avisos } = ensamblar(escenas, g.beats.slice(0, escenas.length), V, palabras, { ...cab, serieDe: process.argv.includes('--sin-rostros-locales') ? null : require('../edl/rostrosLocales').serieDensa, cola: hasta > V[V.length - 1].t1 + 0.9 ? { t0: V[V.length - 1].t1 + 0.4, t1: hasta } : null, proporcion: 0.30, clips: cfgClips, relleno, montaje, voz, ajustarSs: sinNegro, alias: require('../edl/storyboard').REACCIONES.protagonista.alias });
  if (avisos.length) console.log('AVISOS:', avisos.join(' | '));
  const subtitulos = crearSubtitulos({ palabras: palabras.filter(p => p.t0 < hasta), claves, w: 1080, h: 1920, estilo });
  const salida = arg('--salida', path.join(DM, 'lamina', 'video-narrativo.mp4'));
  if (sb.storyboard.length) { const md = salida.replace(/.mp4$/i, '') + '.storyboard.md'; fs.mkdirSync(path.dirname(salida), { recursive: true }); fs.writeFileSync(md, storyboardMarkdown(sb.storyboard, 'Storyboard · ' + path.basename(salida))); console.log('Storyboard:', md); }
  fs.mkdirSync(path.dirname(salida), { recursive: true });
  const ini = Date.now();
  // música de fondo de la biblioteca de Drive (por tono); --sin-musica la quita, --tono fuerza el tono, --semilla cambia de pista
  let fondo = null; if (!process.argv.includes('--sin-musica')) { try { const mf = require('../lienzo/musicaFondo'), tono = arg('--tono', mf.tonoDeGuion(g.script)); fondo = await mf.prepararFondo({ tono, duracion: hasta, jobId: 'motor' + process.pid, semilla: Number(arg('--semilla', 0)) || null, clave: `${g.titulo || ''}|${arg('--canal', '')}` }); console.log(`MÚSICA: ${fondo.nombre} (tono ${fondo.tono}, ${fondo.gananciaDb} dB)`); } catch (e) { console.log('sin música de fondo:', e.message.slice(0, 160)); } }
  // Portada 9:16 en el primer cuadro + JPG aparte (--sin-portada la quita). Si algo falla, el video sale igual, sin portada.
  let portadaPng = null;
  if (!process.argv.includes('--sin-portada')) {
    try {
      const PFo = require('../edl/portadaFoto'), FL_PORTADAS = path.join(DM, 'portadas-usadas.json'), nombreVideo = path.basename(path.dirname(arg('--guion', path.join(DM, 'guion-reina.json'))));
      let ledgerPortadas = {}; try { ledgerPortadas = JSON.parse(fs.readFileSync(FL_PORTADAS, 'utf8')); } catch { /* primera vez */ }
      const PF = require('../edl/portadaFlujo'), pr = await PF.crear({ g, carpeta, canal: canalPortada, personas: fotosPersonas, estilo, salida, foto: arg('--portada-foto', null), excluir: [...String(arg('--portada-excluir', '')).split(',').filter(Boolean), ...PFo.recientes(ledgerPortadas, carpeta, nombreVideo)] });
      if (pr && pr.fotoDe && pr.fotoDe !== 'manual') { try { require('../edl/respaldoIndice').escribirSeguro(FL_PORTADAS, PFo.anotarUso(ledgerPortadas, carpeta, nombreVideo, pr.fotoDe)); } catch { /* opcional */ } }
      if (pr) { try { fs.writeFileSync(path.join(path.dirname(arg('--guion', path.join(DM, 'guion-reina.json'))), 'portada.json'), JSON.stringify({ clipId: pr.fotoDe, titular: pr.titular })); } catch { /* opcional */ }
        portadaPng = pr.png; console.log(`PORTADA: "${pr.titular}" (resalte "${pr.resalte}", ${pr.etiqueta}) · foto ${pr.fotoDe} → ${path.relative(RAIZ, pr.jpg)}`); }
    } catch (e) { console.log('sin portada:', String(e.message).slice(0, 140)); }
  }
  await renderizar({ portada: portadaPng, duracion: hasta, audio: AUDIO_VIDEO, musica: fondo && fondo.listo, salida, estilo, subtitulos, elementos: elementos.filter(e => e.t0 < hasta), alCuadro: (i, n) => process.stdout.write(`\r${i}/${n}  `) });
  console.log(`\nLISTO ${salida} (${Math.round((Date.now() - ini) / 1000)} s, ${elementos.length} elementos)`);
})().catch(e => { console.error('\nFALLO', e); process.exit(1); });

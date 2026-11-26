// DE LINK A MP4 sin intervención: lectura → crónica → guion (motor "grafo") → revisión → frases con rol y hechos → voz → director → render.
// Reutiliza la tubería de la app de siempre (lecturaFuente, gemini, guionGrafo, revisionGuion, largos, ajustes) y el motor sin muñeco.
// Cada etapa deja su archivo en data-motor/noticias/<nombre>/ y se SALTA si ya existe (--rehacer la repite), así un fallo no obliga a
// pagar de nuevo lo que ya salió bien.
//
// Uso:
//   node scripts/noticia-a-video.js <link> --canal "Chismex Picante" --carpeta Mara_Topic [--nombre mara] [--hasta-guion] [--rehacer]
//   node scripts/noticia-a-video.js --texto "texto de la noticia" ...        (o --archivo ruta.txt)
//   Lo que venga después de "--" se pasa tal cual a scripts/video-narrativo.js (p. ej. -- --tono emotivo --sin-musica).
// --hasta-guion: se detiene con el guion escrito (para aprobarlo o editarlo en guion.json); al volver a correr sin la bandera sigue desde ahí.
// El canal decide el largo: los que no monetizan (interruptor videosCortos de la app) salen cortos y SIN el mínimo de 60 s.
require('dotenv').config();
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const RAIZ = path.join(__dirname, '..'), DM = path.join(RAIZ, 'data-motor');

const args = process.argv.slice(2), corte = args.indexOf('--'), propios = corte >= 0 ? args.slice(0, corte) : args, extra = corte >= 0 ? args.slice(corte + 1) : [];
const arg = (n, d) => { const i = propios.indexOf(n); return i >= 0 ? propios[i + 1] : d; }, bandera = n => propios.includes(n);
const link = propios.find(a => /^https?:\/\//i.test(a));
const normalizar = t => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const contarPalabras = t => (String(t).match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]+/g) || []).length;
const log = (...a) => console.log(...a);

(async () => {
  const largos = require('../largos'), gemini = require('../gemini'), ajustes = require('../ajustes').obtener();
  const canal = arg('--canal', 'Chismex Picante'), ficha = require('../canales').obtener(canal), objetivo = largos.objetivoPara(canal, ajustes.videosCortos);
  const dosTiempos = Boolean(ajustes.guionDosTiempos) && objetivo.id === 'normal';
  log(`Canal "${canal}" → guion ${objetivo.id} (${objetivo.min}-${objetivo.max} palabras${dosTiempos ? ', en dos tiempos' : ''})`);

  // ---- 1) nombre de trabajo y archivos
  let nombre = arg('--nombre', null);
  const carpetaTmp = nombre ? path.join(DM, 'noticias', nombre) : null;
  const rehacer = bandera('--rehacer');
  // Gemelos: --desde <nombre> reutiliza la lectura de la noticia que ya se hizo para el canal hermano (se paga una sola vez) y
  // le pasa su guion al modelo como "no te le parezcas".
  const desde = arg('--desde', null); let evitar = null;
  if (desde) {
    if (!nombre) throw new Error('--desde necesita --nombre (la carpeta de este canal)');
    const o = path.join(DM, 'noticias', desde), d = carpetaTmp;
    if (rehacer || !fs.existsSync(path.join(d, 'lectura.json'))) { if (!fs.existsSync(path.join(o, 'lectura.json'))) throw new Error(`--desde: no existe la lectura de "${desde}"`); fs.mkdirSync(d, { recursive: true }); fs.copyFileSync(path.join(o, 'lectura.json'), path.join(d, 'lectura.json')); log(`Lectura copiada de "${desde}" (gemelo)`); }
    if (fs.existsSync(path.join(o, 'guion.json'))) evitar = JSON.parse(fs.readFileSync(path.join(o, 'guion.json'), 'utf8')).script;
  }
  if (ficha) log(`Ficha de canal: ${ficha.nombre}${ficha.sesgo ? ' (con sesgo propio)' : ''}${ficha.vozId ? ' (voz propia)' : ''}`);
  let lectura = carpetaTmp && fs.existsSync(path.join(carpetaTmp, 'lectura.json')) && (!rehacer || desde) ? JSON.parse(fs.readFileSync(path.join(carpetaTmp, 'lectura.json'), 'utf8')) : null;

  // ---- 2) lectura + crónica (la parte que más tokens gastaba escribiéndola a mano)
  if (!lectura) {
    let tipo, contenido;
    if (arg('--texto', null)) { tipo = 'texto'; contenido = arg('--texto'); }
    else if (arg('--archivo', null)) { tipo = 'texto'; contenido = fs.readFileSync(arg('--archivo'), 'utf8'); }
    else if (link) { tipo = 'link'; contenido = link; }
    else throw new Error('Falta la noticia: un link, --texto o --archivo');
    log('Leyendo la fuente…');
    const { extraerActaDeFuente } = require('../lecturaFuente');
    const { acta, tipoReal } = await extraerActaDeFuente(tipo, contenido.trim());
    const cr = await gemini.sintetizarCronica([acta], 'neutral');
    lectura = { fuente: tipo === 'link' ? contenido : '(texto)', tipoReal, acta, cronica: cr };
    nombre = nombre || normalizar(cr.titulo || 'noticia').slice(0, 40);
    fs.mkdirSync(path.join(DM, 'noticias', nombre), { recursive: true });
    fs.writeFileSync(path.join(DM, 'noticias', nombre, 'lectura.json'), JSON.stringify(lectura, null, 1));
    log(`Lectura (${tipoReal}) → "${cr.titulo}" · crónica de ${contarPalabras(cr.cronica)} palabras`);
  } else log(`Lectura ya hecha (${nombre}); se reutiliza`);
  const dir = path.join(DM, 'noticias', nombre), fGuion = path.join(dir, 'guion.json'), fPal = path.join(dir, 'palabras.json');
  const cronica = typeof lectura.cronica === 'string' ? lectura.cronica : lectura.cronica.cronica;

  // ---- 3) guion con el motor "grafo" + revisión + frases con rol y hechos
  let g = fs.existsSync(fGuion) && !rehacer ? JSON.parse(fs.readFileSync(fGuion, 'utf8')) : null;
  if (!g) {
    // 3a) los DATOS de la noticia (acta + crónica): la verdad contra la que se mide el guion
    const pauta = require('../edl/pautaGuion'), base = `${lectura.acta.hechos}\n\n${cronica}`;
    if (!lectura.hechos) { lectura.hechos = await pauta.extraerHechos(base); fs.writeFileSync(path.join(dir, 'lectura.json'), JSON.stringify(lectura, null, 1)); }
    log(`Datos de la noticia: ${lectura.hechos.length}`);
    // 3b) guion con el motor grafo, con TODOS los datos y permiso de picante; si faltan datos o aparece algo inventado, UN reintento dirigido
    // Largo adaptado a los datos: con pocos datos, exigir 185-200 palabras obliga al modelo a rellenar. 165 palabras ya dan ~62 s de voz (mínimo para monetizar);
    // en ese caso se escribe de un solo pase (el método en dos tiempos supone material para ~190 palabras).
    const palabrasDatos = lectura.hechos.reduce((n, h) => n + contarPalabras(h.texto), 0);
    let objUsado = objetivo, dos = dosTiempos;
    if (objetivo.id === 'normal' && palabrasDatos < 200) {
      objUsado = { ...largos.NORMAL, min: 165, max: 185, minAceptable: 158 }; dos = false;
      log(`Pocos datos (${palabrasDatos} palabras): guion de ${objUsado.min}-${objUsado.max} palabras, de un solo pase, para no rellenar`);
    }
    const corto = objUsado.id === 'corto'; // los canales cortos eligen los datos más fuertes en vez de cubrirlos todos
    const maxPalabras = Math.round(objUsado.max * 1.15); // por encima de esto el guion es demasiado largo
    const escribir = async nota => {
      const material = pauta.bloqueMaterial(cronica, lectura.hechos, nota, { corto });
      return dos ? gemini.escribirGuionEnDosTiempos(material, null, null, [], evitar, 'grafo', ficha ? ficha.sesgo : '') : gemini.escribirGuion(material, null, null, [], evitar, 'grafo', ficha ? ficha.sesgo : '', objUsado);
    };
    let script = await escribir(''), prob = pauta.problemas(script, lectura.hechos, base, { maxPalabras, corto });
    log(`Guion 1: ${contarPalabras(script)} palabras · datos cubiertos ${Math.round(prob.cobertura.pct * 100)}% · ${prob.ok ? 'sin invenciones' : 'PROBLEMAS: ' + prob.lista.join(' ; ')}`);
    if (!prob.ok) {
      const script2 = await escribir(pauta.notaDeCorreccion(prob)), prob2 = pauta.problemas(script2, lectura.hechos, base, { maxPalabras, corto });
      log(`Guion 2: ${contarPalabras(script2)} palabras · datos cubiertos ${Math.round(prob2.cobertura.pct * 100)}% · ${prob2.ok ? 'sin invenciones' : 'PROBLEMAS: ' + prob2.lista.join(' ; ')}`);
      const largo2 = contarPalabras(script2) <= Math.round(objUsado.max * 1.25); // un reintento que revienta el largo no sirve aunque cubra todo
      if (largo2 && prob2.lista.length <= prob.lista.length && prob2.cobertura.pct >= prob.cobertura.pct - 0.05) { script = script2; prob = prob2; } else log('  se conserva el guion 1 (el 2 no mejoró o se pasó de largo)');
    }
    // 3c) revisión de siempre (menores, léxico, afirmaciones sin respaldo) contra TODOS los datos, no solo la crónica comprimida
    const rev = await require('../revisionGuion').revisar(script, base);
    (rev.avisos || []).forEach(a => log('  AVISO de revisión:', typeof a === 'string' ? a : JSON.stringify(a)));
    script = rev.guion;
    if ((rev.cambios || []).length) { const rev2 = await require('../revisionGuion').revisar(script, base); script = rev2.guion; rev.cambios = [...rev.cambios, ...(rev2.cambios || [])]; log(`  segunda pasada de revisión: ${(rev2.cambios || []).length} cambio(s)`); }
    const final = pauta.problemas(script, lectura.hechos, base, { maxPalabras, corto });
    // 3d) frases con rol y hechos para el director
    const { guionABeats } = require('../edl/guionABeats'), b = await guionABeats(script, cronica, { hechosDados: lectura.hechos });
    b.avisos.forEach(a => log('  puente:', a));
    const desc = String(lectura.cronica.descripcion || ''), tags = desc.match(/#\S+/g) || [];
    g = { hechos: b.hechos, beats: b.beats, script, origen: `automático: grafo + pauta de datos + revisión + puente (${b.origen})`, canal, objetivo: objetivo.id, palabras: contarPalabras(script),
      personas: (lectura.acta.personas || []).map(nombre => ({ nombre, rol: 'persona mencionada en la noticia' })), titulo: lectura.cronica.titulo, descripcion: desc.replace(/#\S+/g, '').trim(), hashtags: require('../canales').sumarHashtags(tags, ficha), cambiosRevision: rev.cambios || [],
      control: { datosCubiertosPct: Math.round(final.cobertura.pct * 100), faltan: final.cobertura.faltan.map(f => f.texto), posiblesInventos: [...final.inventados.numeros, ...final.inventados.nombres] } };
    if (final.lista.length) log('  ATENCIÓN tras la revisión:', final.lista.join(' ; '));
    fs.writeFileSync(fGuion, JSON.stringify(g, null, 2));
    log(`Guion: ${g.palabras} palabras, ${g.beats.length} frases → ${path.relative(RAIZ, fGuion)}`);
  } else {
    log(`Guion ya escrito (${g.palabras} palabras); se reutiliza`);
    if (!g.personas && lectura.acta) { g.personas = (lectura.acta.personas || []).map(nombre => ({ nombre, rol: 'persona mencionada en la noticia' })); fs.writeFileSync(fGuion, JSON.stringify(g, null, 2)); }
  }
  if (bandera('--hasta-guion')) { log('\nSe detiene en el guion (--hasta-guion). Revísalo/edítalo y vuelve a correr sin la bandera para seguir.\n\n' + g.script); return; }

  // ---- 4) voz + tiempos por palabra (ElevenLabs) — se paga una vez por guion
  let carpeta = arg('--carpeta', null);
  if (!carpeta || carpeta === 'auto') { // detección automática: la persona de la noticia que tiene carpeta en Drive (la más mencionada)
    const A = require('../edl/carpetaAuto'); let nombres;
    try { nombres = Object.keys(await require('../drive').obtenerCarpetasFamosos()); } catch (e) { throw new Error('No pude leer las carpetas de Drive para detectar al artista (' + String(e.message).slice(0, 80) + '). Elige la carpeta a mano.'); }
    const r = A.elegir(lectura, nombres);
    if (!r) throw new Error(`No encontré en Drive una carpeta para ninguna de las personas de la noticia (${(lectura.acta.personas || []).join(', ') || 'ninguna'}). Elige la carpeta a mano; la lectura y el guion ya hechos se reutilizan.`);
    carpeta = r.carpeta; log(`CARPETA automática: ${carpeta} (por "${r.persona}", coincidencia ${r.confianza}, ${r.menciones} menciones${r.otras.length ? '; otras posibles: ' + r.otras.map(o => o.carpeta).join(', ') : ''})`);
  }
  const audio = arg('--audio', path.join(DM, 'audios', `${new Date().toISOString().slice(0, 10)} ${nombre}.mp3`));
  const correr = (script, a) => { const r = spawnSync(process.execPath, [path.join(__dirname, script), ...a], { stdio: 'inherit', cwd: RAIZ, env: { ...process.env, ...(ficha && ficha.vozId ? { ELEVENLABS_VOICE_ID: ficha.vozId } : {}) } }); if (r.status !== 0) throw new Error(`${script} falló (código ${r.status})`); };
  if (fs.existsSync(audio) && fs.existsSync(fPal) && !rehacer) log('Voz ya generada; se reutiliza');
  else { log(`Voz: ${g.script.length} caracteres…`); correr('noticia-voz.js', ['--guion', fGuion, '--audio', audio, '--palabras', fPal]); }

  // ---- 5) director + ensamblador + render (motor sin muñeco). Mínimo de 60 s solo si el canal NO es corto.
  const salida = arg('--salida', path.join(DM, 'renders', `${nombre}.mp4`));
  const minimo = objetivo.id === 'corto' ? ['--minimo', '0'] : [];
  // Índice del artista (primera vez: baja, etiqueta con Gemini y mide SOLO los clips sin etiqueta; después no hace nada). Va ANTES de medir: una carpeta nueva todavía no tiene lista de clips.
  spawnSync(process.execPath, [path.join(__dirname, 'biblioteca-indexar-nuevos.js'), carpeta], { stdio: 'inherit', cwd: RAIZ });
  if (fs.existsSync(path.join(DM, 'biblioteca', carpeta + '.clips.json'))) { // si el índice no se pudo armar (sin Drive), se sigue sin medir en vez de caerse
    try { const p = require('child_process').spawnSync('python', [path.join(__dirname, 'rostros-clips.py'), carpeta], { stdio: 'inherit', cwd: RAIZ }); if (p.status !== 0) log('(rostros locales no disponibles: se usan los del modelo)'); } catch { log('(sin python: se usan los rostros del modelo)'); }
    try { correr('calidad-clips.js', [carpeta]); } catch (e) { log('(no se pudo medir la calidad: ' + e.message + ')'); } // mide los clips nuevos (gratis, reanuda: no repite los ya medidos)
  }
  correr('video-narrativo.js', ['--guion', fGuion, '--palabras', fPal, '--audio', audio, '--carpeta', carpeta, '--sin-muneco', '--salida', salida, ...minimo, ...(ficha && ficha.tonoMusica !== 'auto' && !extra.includes('--tono') ? ['--tono', ficha.tonoMusica] : []), ...extra]);
  log(`\nListo: ${salida}\nTítulo: ${g.titulo}\nDescripción: ${g.descripcion || ''}\n${(g.hashtags || []).join(' ')}`);
})().catch(e => { console.error('FALLO', e.message); process.exit(1); });

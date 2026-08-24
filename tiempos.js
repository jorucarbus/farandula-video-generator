// Fase 5 del plan maestro — fuente de tiempos por fragmento (y por palabra), intercambiable.
//
// Hasta ahora seleccion.planificarClips() repartía el tiempo en pantalla de cada
// fragmento por PORCENTAJE DE CARACTERES sobre la duración total del audio — una
// estimación, el techo de calidad que dejó el subtitulos.js viejo (por % de
// caracteres, sin timing real). Este módulo la reemplaza por tiempos REALES:
// ElevenLabs devuelve, junto con el audio, en qué segundo exacto empieza cada
// carácter (endpoint /with-timestamps). La Fase 6 (subtítulos con resalte
// palabra-por-palabra) reusa exactamente la misma alineación, a nivel de palabra.
//
// Puerta abierta (plan maestro): interfaz con dos implementaciones. Hoy solo
// ElevenLabs. RunPod con alineación forzada queda para después — sirve además
// para farandula-video-family, donde el audio lo sube el usuario y no hay
// timestamps de ningún proveedor.
const path = require('path');
const elevenlabs = require('./elevenlabs');
const famosos = require('./famosos');
const video = require('./video');

const FUENTES = {
  elevenlabs: (guionConMarcas, modeloPreferido) => elevenlabs.generarAudioConTiempos(guionConMarcas, modeloPreferido),
  runpod: async () => { throw new Error('Fuente de tiempos "runpod" (alineación forzada): no implementada todavía'); },
};

// Genera audio y devuelve, además de lo de siempre, la alineación cruda
// (caracteres, inicios de cada uno, texto exacto que se mandó a hablar).
async function generarConTiempos(guionConMarcas, { fuente = 'elevenlabs', modelo } = {}) {
  const impl = FUENTES[fuente];
  if (!impl) throw new Error(`Fuente de tiempos desconocida: ${fuente}`);
  return impl(guionConMarcas, modelo);
}

// PROMPTS.marcas pide "cero pausas" e "ignorar los puntos en la cadencia" (regla 1) — en la
// práctica Gemini a veces borra comas y puntos, no solo los ignora acústicamente (verificado
// con una corrida real: "Piqué, del otro lado" salió como "Piqué del otro lado"). Por eso la
// puntuación, igual que los espacios, es tolerante: si aparece de un lado y no del otro, se
// salta sin exigir que calce. Letras, tildes y mayúsculas SÍ tienen que calzar exacto — eso
// es cambio de palabra real, no cadencia.
const ES_IGNORABLE = c => /[\s,.:;!¡?¿"'“”«»…\-–—]/.test(c);

// Busca un token (palabra o fragmento) dentro de caracteres[] a partir de jInicio. Devuelve
// el índice siguiente, o -1 si no encaja.
function matchTexto(caracteres, jInicio, texto) {
  let j = jInicio;
  let k = 0;
  while (k < texto.length) {
    const ck = texto[k];
    if (ES_IGNORABLE(ck)) {
      while (k < texto.length && ES_IGNORABLE(texto[k])) k++;
      while (j < caracteres.length && ES_IGNORABLE(caracteres[j])) j++;
      continue;
    }
    while (j < caracteres.length && ES_IGNORABLE(caracteres[j])) j++;
    if (j >= caracteres.length || caracteres[j] !== ck) return -1;
    j++;
    k++;
  }
  return j;
}

function limpiarMarcas(caracteres, inicios) {
  const limpios = [];
  const iniciosLimpios = [];
  let dentroMarca = false;
  for (let i = 0; i < caracteres.length; i++) {
    const c = caracteres[i];
    if (c === '[') { dentroMarca = true; continue; }
    if (c === ']') { dentroMarca = false; continue; }
    if (dentroMarca) continue;
    limpios.push(c);
    iniciosLimpios.push(inicios[i]);
  }
  return { limpios, iniciosLimpios };
}

// A partir de la alineación carácter-por-carácter, ubica cada PALABRA de cada fragmento en
// la locución real (no solo cada fragmento — eso es lo que necesita el resalte palabra por
// palabra de la Fase 6). Nunca lanza: si algo no calza, devuelve null y quien llama cae de
// vuelta al reparto por % de caracteres — Regla de robustez del plan (una capa nueva nunca
// puede tumbar el render, degrada entera y de una sola vez: fragmentos Y palabras juntos,
// para que nunca queden en relojes distintos).
//
// Devuelve: { duraciones: [seg, ...] (una por fragmento), palabras: [[{texto,inicio,fin}, ...], ...] (una lista por fragmento) }
// `mapaVoz` (opcional): pronunciaciones por famoso. Un nombre puede haberse MANDADO A HABLAR con
// otra escritura ("Nawat" -> "Nagüat"), así que comparar contra la forma escrita fallaría y
// tumbaría la alineación entera al reparto estimado. Se compara contra lo que de verdad se dijo;
// lo que se muestra en los subtítulos sigue siendo la forma escrita.
function alinearFragmentos(fragments, alineacion, duracionAudioReal, mapaVoz = null) {
  const { caracteres, inicios } = alineacion || {};
  if (!Array.isArray(caracteres) || caracteres.length === 0 || !Array.isArray(inicios)) {
    console.warn('  ⚠️ Tiempos reales: ElevenLabs no devolvió alineación, cae a % de caracteres');
    return null;
  }

  const { limpios, iniciosLimpios } = limpiarMarcas(caracteres, inicios);

  let j = 0;
  const porFragmento = []; // [{ palabras: [texto,...], inicios: [seg,...] }]
  for (const f of fragments) {
    const palabras = f.texto.split(/\s+/).filter(Boolean);
    const inicios2 = [];
    for (const palabra of palabras) {
      while (j < limpios.length && ES_IGNORABLE(limpios[j])) j++;
      if (j >= limpios.length) {
        console.warn('  ⚠️ Tiempos reales: la alineación se acabó antes que los fragmentos, cae a % de caracteres');
        return null;
      }
      inicios2.push(iniciosLimpios[j]);
      const hablada = famosos.hablar(palabra, mapaVoz);
      const jFinal = matchTexto(limpios, j, hablada);
      if (jFinal === -1) {
        console.warn(`  ⚠️ Tiempos reales: "${palabra}"${hablada !== palabra ? ` (dicho "${hablada}")` : ''} no calza con el audio, cae a % de caracteres`);
        return null;
      }
      j = jFinal;
    }
    if (palabras.length === 0) {
      console.warn('  ⚠️ Tiempos reales: fragmento sin palabras, cae a % de caracteres');
      return null;
    }
    porFragmento.push({ palabras, inicios: inicios2 });
  }

  // Telescopar: cada palabra dura hasta que empieza la SIGUIENTE palabra en toda la
  // locución (sea del mismo fragmento o del siguiente), la última hasta el final real
  // del audio. Así todo tila sin huecos ni superposición — la suma es exacta siempre,
  // silencios y marcas quedan absorbidos en la palabra anterior.
  const plano = porFragmento.flatMap((p, fi) => p.palabras.map((texto, wi) => ({ texto, inicio: p.inicios[wi], fragIdx: fi })));
  const conFin = plano.map((w, idx) => ({
    texto: w.texto,
    inicio: w.inicio,
    fin: idx + 1 < plano.length ? plano[idx + 1].inicio : duracionAudioReal,
    fragIdx: w.fragIdx,
  }));

  const palabrasPorFragmento = fragments.map((_, fi) => conFin.filter(w => w.fragIdx === fi).map(({ texto, inicio, fin }) => ({ texto, inicio, fin })));

  const inicioPorFragmento = porFragmento.map(p => p.inicios[0]);
  const duraciones = fragments.map((_, idx) => {
    const inicioTramo = idx === 0 ? 0 : inicioPorFragmento[idx];
    const finTramo = idx + 1 < inicioPorFragmento.length ? inicioPorFragmento[idx + 1] : duracionAudioReal;
    return finTramo - inicioTramo;
  });

  if (duraciones.some(d => d <= 0)) {
    console.warn('  ⚠️ Tiempos reales: algún fragmento salió con duración ≤0, cae a % de caracteres');
    return null;
  }

  return { duraciones, palabras: palabrasPorFragmento };
}

// Material adicional: INSERTA el audio ORIGINAL de una entrevista (cita real) dentro de la
// locución, justo DESPUÉS de que la voz en off termina de narrar el fragmento al que la cita
// acompaña. Es la pieza más invasiva de esa feature — corre en el tiempo TODO lo que viene
// después.
//
// Por qué insertar y no reemplazar (cambio de diseño pedido por el usuario, 2026-08-21): la
// versión anterior SUSTITUÍA el tramo sintético de ese fragmento por la cita, así que la voz en
// off se comía esa parte del guion — "es como que vuelve a tener sonido" al terminar la cita, en
// vez de continuar donde se quedó. Ahora la narración del fragmento se escucha COMPLETA, después
// entra la cita con su audio original (sin voz en off encima), y la voz en off sigue exactamente
// donde iba. Cuesta que la línea de tiempo gane un hueco que no pertenece a ningún fragmento del
// guion: por eso esta función devuelve arrays de duraciones/palabras MÁS LARGOS que los de
// entrada, más `inserciones` para que el llamador meta el pseudo-fragmento equivalente en su copia
// de `fragments` (ver server.js) — de esa forma seleccion.js y subtitulos.js, que reconstruyen la
// línea de tiempo sumando duraciones en orden, siguen funcionando sin enterarse de nada.
//
// empalmes: [{ parrafoIdx, archivoPath, inicio, fin, esVideo }, ...] — se asume YA en orden
//   ascendente de parrafoIdx (server.js los arma recorriendo fragments en orden).
// duracionesBase/palabrasBase: mismo par que devuelve alinearFragmentos() (tiempos reales), o
//   duracionesBase por % de caracteres + un array de `null` del mismo largo (cuando la Fase 5 ya
//   cayó a estimado) — funciona igual en los dos casos, palabrasBase[i]===null ya tiene su
//   propio fallback en subtitulos.js (palabrasEstimadas).
//
// Devuelve { audioPath, duraciones, palabras, inserciones, aplicados, descartados } o null si
// NINGÚN empalme prosperó (el llamador sigue con el audio/tiempos originales, sin tocar nada —
// Regla de robustez: esta capa nunca aborta el render).
//   inserciones: [{ indice, parrafoOrigen, duracion, empalme }] — `indice` ya está en el espacio
//   de índices NUEVO (el de los arrays devueltos), listo para hacerle splice a `fragments`.
async function empalmarCitasReales(audioPathOriginal, duracionesBase, palabrasBase, empalmes, jobId) {
  if (!empalmes || empalmes.length === 0) return null;

  // 1. Clamp de cada empalme contra la duración REAL del archivo de entrevista (mismo criterio
  //    que el fix de offset-clamp ya existente en video.js) — descarta el empalme individual si
  //    queda <0.3s tras el clamp, sin tocar los demás.
  const descartados = [];
  const validos = [];
  for (const e of [...empalmes].sort((a, b) => a.parrafoIdx - b.parrafoIdx)) {
    let durArchivo = null;
    try { durArchivo = await video.obtenerDuracion(e.archivoPath); } catch { /* archivo raro, sigue sin clamp */ }
    const finClamp = durArchivo && Number.isFinite(durArchivo) ? Math.min(e.fin, durArchivo) : e.fin;
    if (finClamp - e.inicio < 0.3) {
      console.warn(`  ⚠️ Cita del fragmento ${e.parrafoIdx} descartada: duración inválida tras clamp (${(finClamp - e.inicio).toFixed(2)}s)`);
      descartados.push(e.parrafoIdx);
      continue;
    }
    validos.push({ ...e, fin: finClamp, duracionReal: finClamp - e.inicio });
  }
  if (validos.length === 0) return null;

  // 2. Boundaries del audio ORIGINAL (acumulado de duracionesBase) — dónde empieza y termina cada
  //    fragmento en la locución sintética de hoy.
  const inicios = [];
  let acc = 0;
  for (const d of duracionesBase) { inicios.push(acc); acc += d; }
  const totalOriginal = acc;

  // 3. Armar tramos cubriendo TODO [0, totalOriginal] sin quitar nada, intercalando las citas.
  //    A diferencia del diseño viejo, el tramo sintético del fragmento con cita NO se saca: la
  //    cita se agrega DESPUÉS de él. Los fragmentos consecutivos se agrupan en un solo tramo
  //    sintético (menos inputs de ffmpeg); el corte de grupo cae DESPUÉS del fragmento con cita.
  const porFragIdx = new Map(validos.map(v => [v.parrafoIdx, v]));
  const tramos = []; // { inicio, fin, archivo }
  let grupoInicio = 0;
  for (let i = 0; i < duracionesBase.length; i++) {
    const v = porFragIdx.get(i);
    if (!v) continue;
    const finNarracion = inicios[i] + duracionesBase[i];
    if (finNarracion > grupoInicio) {
      tramos.push({ inicio: grupoInicio, fin: finNarracion, archivo: audioPathOriginal });
    }
    tramos.push({ inicio: v.inicio, fin: v.fin, archivo: v.archivoPath });
    grupoInicio = finNarracion;
  }
  if (totalOriginal > grupoInicio) {
    tramos.push({ inicio: grupoInicio, fin: totalOriginal, archivo: audioPathOriginal });
  }

  // 4. Un solo ffmpeg -filter_complex concat=n:v=0:a=1 — cada tramo entra como su propio -i con
  //    -ss/-t, sin necesidad de cortar un archivo intermedio antes.
  //
  // BUG real encontrado en producción (2026-08-20, usuario reportó "no funcionó la cita" — el
  // video salió 25s más corto de lo esperado con solo 1-2 citas insertadas): `-ss`/`-t` son
  // opciones de INPUT y tienen que ir ANTES del `-i` al que aplican. El resto de este proyecto
  // (video.js, cortes de clip) SIEMPRE hace un `-i` por llamada a ffmpeg, así que un `-t` puesto
  // DESPUÉS del único `-i` nunca causó problema (no había ambigüedad posible). Acá, por primera
  // vez en el repo, un solo comando de ffmpeg lleva VARIOS `-i` (uno por tramo) — con `-t`
  // DESPUÉS de cada `-i`, ffmpeg no lo asocia a ESE input: lo trata como opción de OUTPUT
  // (duración total del output), y como se repite una vez por tramo, gana la ÚLTIMA — el output
  // terminaba truncado a la duración del ÚLTIMO tramo nada más, ignorando el resto. Fix:
  // `-ss`/`-t` ANTES del `-i` de cada tramo, como corresponde.
  const args = [];
  tramos.forEach((t) => {
    args.push('-ss', t.inicio.toFixed(3), '-t', (t.fin - t.inicio).toFixed(3), '-i', t.archivo);
  });
  const refsAudio = tramos.map((_, k) => `[${k}:a]`).join('');
  const filtro = `${refsAudio}concat=n=${tramos.length}:v=0:a=1[aout]`;
  const audioPath = path.join(video.TEMP_DIR, `${jobId}_locucion_con_citas.mp3`);
  args.push('-filter_complex', filtro, '-map', '[aout]', '-c:a', 'libmp3lame', '-q:a', '2', audioPath);

  try {
    await video.ffmpeg(args);
  } catch (e) {
    console.warn(`  ⚠️ Empalme de citas reales falló al renderizar el audio compuesto: ${e.message}`);
    return null;
  }

  // 5. Reconstruir duraciones/palabras con el hueco de cada cita YA insertado, y correr los
  //    timestamps de palabra de todo lo que queda después. Las palabras del PROPIO fragmento con
  //    cita no se mueven: su narración suena antes de la cita, no después — esa es justamente la
  //    diferencia con el diseño viejo, donde ese fragmento perdía su narración entera.
  const duraciones = [];
  const palabras = [];
  const inserciones = [];
  const aplicados = [];
  let corrimiento = 0;
  for (let i = 0; i < duracionesBase.length; i++) {
    duraciones.push(duracionesBase[i]);
    const base = palabrasBase && palabrasBase[i];
    palabras.push(base ? base.map(w => ({ ...w, inicio: w.inicio + corrimiento, fin: w.fin + corrimiento })) : (base ?? null));
    const v = porFragIdx.get(i);
    if (!v) continue;
    inserciones.push({ indice: duraciones.length, parrafoOrigen: i, duracion: v.duracionReal, empalme: v });
    duraciones.push(v.duracionReal);
    palabras.push([]); // la cita no lleva subtítulos: es la voz real de la entrevista, no la voz en off
    corrimiento += v.duracionReal;
    aplicados.push(i);
  }

  return { audioPath, duraciones, palabras, inserciones, aplicados, descartados };
}

module.exports = {
  generarConTiempos,
  alinearFragmentos,
  empalmarCitasReales,
};

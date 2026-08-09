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
const elevenlabs = require('./elevenlabs');

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
function alinearFragmentos(fragments, alineacion, duracionAudioReal) {
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
      const jFinal = matchTexto(limpios, j, palabra);
      if (jFinal === -1) {
        console.warn(`  ⚠️ Tiempos reales: "${palabra}" no calza con el audio, cae a % de caracteres`);
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

module.exports = {
  generarConTiempos,
  alinearFragmentos,
};

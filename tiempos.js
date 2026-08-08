// Fase 5 del plan maestro — fuente de tiempos por fragmento, intercambiable.
//
// Hasta ahora seleccion.planificarClips() repartía el tiempo en pantalla de cada
// fragmento por PORCENTAJE DE CARACTERES sobre la duración total del audio — una
// estimación, el techo de calidad que dejó el subtitulos.js viejo (por % de
// caracteres, sin timing real). Este módulo la reemplaza por tiempos REALES:
// ElevenLabs devuelve, junto con el audio, en qué segundo exacto empieza cada
// carácter (endpoint /with-timestamps).
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

// Busca fragmentoTexto dentro de caracteres[] a partir de jInicio. Devuelve el índice
// siguiente, o -1 si no encaja.
function matchTexto(caracteres, jInicio, fragmentoTexto) {
  let j = jInicio;
  let k = 0;
  while (k < fragmentoTexto.length) {
    const ck = fragmentoTexto[k];
    if (ES_IGNORABLE(ck)) {
      while (k < fragmentoTexto.length && ES_IGNORABLE(fragmentoTexto[k])) k++;
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

// A partir de la alineación carácter-por-carácter, calcula cuánto dura CADA
// fragmento en la locución real. Nunca lanza: si algo no calza, devuelve null y
// quien llama cae de vuelta al reparto por % de caracteres — Regla de robustez
// del plan (una capa nueva nunca puede tumbar el render, degrada entera).
function duracionesPorFragmento(fragments, alineacion, duracionAudioReal) {
  const { caracteres, inicios } = alineacion || {};
  if (!Array.isArray(caracteres) || caracteres.length === 0 || !Array.isArray(inicios)) {
    console.warn('  ⚠️ Tiempos reales: ElevenLabs no devolvió alineación, cae a % de caracteres');
    return null;
  }

  // 1. Quitar las marcas [tag] del stream, conservando el tiempo de lo que queda.
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

  // 2. Ubicar, en orden, dónde empieza cada fragmento dentro del stream limpio.
  let j = 0;
  const inicioDe = [];
  for (const f of fragments) {
    while (j < limpios.length && ES_IGNORABLE(limpios[j])) j++;
    if (j >= limpios.length) {
      console.warn('  ⚠️ Tiempos reales: la alineación se acabó antes que los fragmentos, cae a % de caracteres');
      return null;
    }
    const jFinal = matchTexto(limpios, j, f.texto);
    if (jFinal === -1) {
      console.warn(`  ⚠️ Tiempos reales: "${f.texto.slice(0, 40)}…" no calza con el audio, cae a % de caracteres`);
      return null;
    }
    inicioDe.push(iniciosLimpios[j]);
    j = jFinal;
  }

  // 3. Duración de cada fragmento = desde que empieza a hablarse hasta que empieza
  // el siguiente (o el final real del audio, medido por ffprobe). Así la suma da
  // EXACTO el total — silencios y pausas de las marcas quedan absorbidos en el
  // fragmento anterior, no se pierden ni se inventan. Ver invariante de sincronía.
  const duraciones = fragments.map((_, idx) => {
    const inicioTramo = idx === 0 ? 0 : inicioDe[idx];
    const finTramo = idx + 1 < inicioDe.length ? inicioDe[idx + 1] : duracionAudioReal;
    return finTramo - inicioTramo;
  });

  if (duraciones.some(d => d <= 0)) {
    console.warn('  ⚠️ Tiempos reales: algún fragmento salió con duración ≤0, cae a % de caracteres');
    return null;
  }

  return duraciones;
}

module.exports = {
  generarConTiempos,
  duracionesPorFragmento,
};

// Cuánto tiene que durar el guion de cada canal.
//
// Por qué existe (pedido del usuario, 2026-09-07): La Naple y Supe Lupe son los canales hermanos
// que todavía no monetizan, y la locución de ElevenLabs se cobra POR CARÁCTER. Gastar un guion de
// 215 palabras en un canal que no devuelve nada es tirar créditos: "no tiene sentido gastar
// locución pasando el minuto si todavía no monetizan".
//
// Es un INTERRUPTOR, encendido por defecto. El día que esos canales empiecen a monetizar se apaga
// y todo vuelve exactamente a como estaba — por eso el largo normal sigue acá al lado, sin
// borrarse, y apagado el switch NADA de este módulo se aplica.
//
// ⚠️ Lo que el usuario ya sabe y decidió igual: los programas que pagan por vistas suelen exigir
// videos de más de un minuto, así que estos videos cortos hacen crecer el canal (seguidores,
// vistas) pero probablemente no sumen al fondo de recompensas. Es a propósito: se ahorra mientras
// el canal no vale nada, y se apaga el switch cuando empiece a valer.

// El largo de siempre. NO se toca: es a lo que se vuelve al apagar el interruptor.
const NORMAL = {
  id: 'normal',
  min: 205,
  max: 220,
  // Debajo de esto, `escribirGuion` pide otro: la longitud no es cosmética, de ella sale la
  // duración del video.
  minAceptable: 200,
  segundos: 'unos 70 segundos',
};

// 30-40 segundos a las 3 palabras por segundo que ya usa el contador de la pantalla.
const CORTO = {
  id: 'corto',
  min: 95,
  max: 125,
  minAceptable: 90,
  segundos: 'entre 30 y 40 segundos',
};

// Los canales que todavía no monetizan, por nombre normalizado (mismo criterio que
// `CANALES_HERMANOS` en server.js: las carpetas se emparejan por nombre, no por id, porque el
// mismo canal existe en "para publicar" y en "insumos edicion" con ids distintos).
const CANALES_CORTOS = new Set(['lanaple', 'supelupe']);

function normalizarCanal(nombre) {
  return (nombre || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function esCanalCorto(nombreCanal) {
  return CANALES_CORTOS.has(normalizarCanal(nombreCanal));
}

// El objetivo de longitud de un canal. Con el interruptor apagado devuelve SIEMPRE el normal, sin
// mirar de qué canal se trata — que es justo lo que hace que apagarlo restaure el comportamiento
// viejo entero, sin dejar rastros a medias.
function objetivoPara(nombreCanal, switchActivo = true) {
  if (!switchActivo) return NORMAL;
  return esCanalCorto(nombreCanal) ? CORTO : NORMAL;
}

// La regla 1 del prompt maestro, escrita con el largo que toca.
function reglaDeLongitud(objetivo) {
  const o = objetivo || NORMAL;
  return `1. LONGITUD: El guion DEBE tener entre ${o.min} y ${o.max} palabras (${o.segundos} de locución). `
    + `Nunca menos de ${o.minAceptable}.`;
}

// La línea de la TAREA, en el mensaje de cada motor.
function tareaDeLongitud(objetivo) {
  const o = objetivo || NORMAL;
  return `${o.min}-${o.max} palabras`;
}

// Instrucciones EXTRA para el formato corto.
//
// No alcanza con cambiar el número: las ocho reglas del prompt están pensadas para 70 segundos, y
// metidas en 35 sin decir nada más el modelo cuenta lo mismo más rápido y sale un resumen
// atropellado. Un video de 35 segundos necesita MENOS hechos, no los mismos comprimidos.
function bloqueDeFormatoCorto(objetivo) {
  if (!objetivo || objetivo.id !== 'corto') return '';
  return `\n\n=== FORMATO CORTO (este canal publica videos de ${objetivo.segundos}) ===
Este guion NO es la versión resumida de uno largo. Es un video entero, más chico:
- Elegí UN solo hecho, el más fuerte de todos, y contá ese. Los demás no entran ni de refilón.
- Nada de antecedentes, contexto previo ni "quién es quién": se entra directo al hecho.
- Una sola revelación, no tres. El desarrollo es corto porque hay poco que desarrollar, no porque
  se esté apurando.
- El cierre en bucle y el tono se mantienen igual que siempre.
Contar de más y rápido es el error que hay que evitar: preferí decir menos cosas, bien dichas.
=== FIN DEL FORMATO CORTO ===`;
}

// Cuántas citas de entrevista aguanta un video de este largo.
//
// Cada cita abre su propio hueco en la línea de tiempo con el audio original (2-4 segundos). En un
// video de 35 segundos, dos citas son el 20% del video y a la narración propia no le queda casi
// nada. En uno de 70 no molesta y se dejan pasar todas, como siempre.
function citasMaximas(objetivo) {
  return objetivo?.id === 'corto' ? 1 : Infinity;
}

module.exports = {
  NORMAL,
  CORTO,
  CANALES_CORTOS,
  normalizarCanal,
  esCanalCorto,
  objetivoPara,
  reglaDeLongitud,
  tareaDeLongitud,
  bloqueDeFormatoCorto,
  citasMaximas,
};

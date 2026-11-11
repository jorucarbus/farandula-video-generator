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

// CALIBRACIÓN con la voz nueva (eleven_v4), 2026-11-10. Medido sobre guiones reales con las marcas de
// siempre: v4 habla ~2,65 palabras por segundo de mediana (v3: ~2,81), con días de 2,5 a 3,2. La misma
// voz y el mismo guion varían entre 5% y 7% de una generación a otra, así que ningún número de palabras
// garantiza una duración exacta: `ajusteDuracion.js` alarga hasta un 5% las locuciones que quedaron
// justo debajo del minuto. Por eso los rangos apuntan a ~68 s de mediana (ventana buscada: 62-70 s).
//
// El largo de un solo pase. A este número se vuelve al apagar el guion en dos tiempos.
const NORMAL = {
  id: 'normal',
  min: 185,
  max: 200,
  // Debajo de esto, `escribirGuion` pide otro: la longitud no es cosmética, de ella sale la
  // duración del video — y de ella depende que el video califique para monetizar.
  minAceptable: 178,
  segundos: 'poco más de un minuto',
};

// El guion largo escrito EN DOS TIEMPOS: un núcleo que se sostiene solo y un complemento que lo
// extiende. Idea del usuario, después de que le gustaran los guiones cortos: "me gusta cómo queda
// la consistencia". Elegido a ciegas contra el método de un solo pase, sobre la misma noticia.
//
// El reparto no es caprichoso: la mayoría de sus espectadores no pasa de la mitad del video, así
// que TODO el valor va en el núcleo, y el complemento existe para cruzar el minuto y para el que
// se queda hasta el final. Núcleo ≈ 30-31 s y complemento ≈ 36-37 s, que sumados dan los 185 del total.
const NUCLEO = {
  id: 'nucleo',
  min: 82,
  max: 90,
  minAceptable: 76,
  segundos: 'unos 30 segundos',
};

const COMPLEMENTO = {
  id: 'complemento',
  min: 98,
  max: 106,
  minAceptable: 92,
  segundos: 'unos 35 segundos',
};

// Por debajo de esto, un video de canal largo no califica para los programas que pagan por vistas.
// Se mide sobre la locución REAL, nunca sobre la estimación por palabras, que se equivoca hasta un
// 20%. El margen sobre los 60 existe porque el video final dura lo que dura el audio.
const MINIMO_MONETIZA_SEG = 62;

// ~30 segundos a ~2,7 palabras por segundo. (En Facebook un Reel monetiza desde los 10 s, según las
// guías que citan a Meta: el formato corto cumple de sobra. TikTok es el que pide pasar del minuto.)
const CORTO = {
  id: 'corto',
  min: 76,
  max: 88,
  minAceptable: 70,
  segundos: 'unos 30 segundos',
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
// Instrucciones del PRIMER tramo. Cambia una regla del prompt maestro: este tramo no cierra el
// video, así que en vez del cierre en bucle tiene que dejar algo abierto.
function bloqueDelNucleo(objetivo) {
  const o = objetivo || NUCLEO;
  return `\n\n=== ESTE ES EL PRIMER TRAMO DE UN VIDEO MÁS LARGO ===
Escribe ${o.min}-${o.max} palabras (${o.segundos}).
La mayoría de la gente no pasa de la mitad del video, así que ESTE tramo tiene que contener la
noticia entera: quién, qué pasó y el golpe. Nada de guardarse lo bueno para después.
OJO, esto cambia la regla del cierre en bucle: este tramo NO cierra el video, porque después sigue
otro. Su última frase tiene que DEJAR ALGO ABIERTO —una pregunta sin responder, una tensión— que
obligue a seguir escuchando. Nada de conclusiones ni de moralejas.
=== FIN ===`;
}

// Instrucciones del SEGUNDO tramo. Lo más importante está en la regla 2: si el complemento trae
// "los datos que sobraron", vuelve la dispersión que el formato corto vino a evitar.
function bloqueDelComplemento(objetivo, nucleo) {
  const o = objetivo || COMPLEMENTO;
  return `\n\n=== PRIMER TRAMO YA ESCRITO (esto YA se dijo: no lo repitas, no lo resumas) ===
${(nucleo || '').trim()}
=== FIN DEL PRIMER TRAMO ===

=== TU TAREA: EL SEGUNDO TRAMO, DE ${o.min}-${o.max} PALABRAS (${o.segundos}) ===
1. Arranca RETOMANDO, como si el espectador acabara de oír el primer tramo. Prohibido volver a
   presentar a la persona, repetir el contexto o hacer un "como decíamos".
2. No agregues "el resto de los datos". Traé OTRA CAPA: la consecuencia, la reacción del entorno,
   el antecedente que lo explica, o qué viene ahora.
3. Vocabulario distinto al del primer tramo: nada de repetir sus expresiones ni sus imágenes.
4. Este tramo SÍ cierra el video: su última frase conecta por la IDEA con la primera frase del
   primer tramo, con palabras totalmente distintas.
=== FIN ===`;
}

function citasMaximas(objetivo) {
  return objetivo?.id === 'corto' ? 1 : Infinity;
}

module.exports = {
  NORMAL,
  CORTO,
  NUCLEO,
  COMPLEMENTO,
  MINIMO_MONETIZA_SEG,
  bloqueDelNucleo,
  bloqueDelComplemento,
  CANALES_CORTOS,
  normalizarCanal,
  esCanalCorto,
  objetivoPara,
  reglaDeLongitud,
  tareaDeLongitud,
  bloqueDeFormatoCorto,
  citasMaximas,
};

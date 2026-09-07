// La instrucción que el usuario escribe al pegar la fuente: "céntrate en Shyare Andrade", "el tema
// es la pelea, no el concurso", "que el interés sea la mamá, no la hija".
//
// Por qué existe (pedido del usuario, 2026-09-07): la lectura decidía sola de quién era la noticia,
// y con varias fuentes que mencionan a mucha gente elegía por su cuenta un protagonista que no era
// el que interesaba. De ahí salía todo torcido: la crónica hablaba de otro, el guion también, y en
// el reparto de tomas aparecían carpetas de gente ajena.
//
// Es UNA sola instrucción y la ven TODAS las etapas — así lo pidió: "uno solo que todos los procesos
// entiendan". Cada etapa la recibe con las palabras que le sirven a ella, pero el texto del usuario
// es el mismo y viaja tal cual.
//
// Lo que la instrucción SÍ decide: quién es el protagonista, qué se pone adelante, qué queda de
// fondo, y qué de las fuentes se usa.
// Lo que NO puede hacer: agregar un solo hecho que las fuentes no digan. Esa línea va repetida en
// los tres bloques a propósito — es la que evita que "céntrate en X" termine en un guion inventado
// cuando las fuentes casi no hablan de X (ya pasó una vez, con Emilia Mernes en una noticia de
// Celeste Morán).

const LARGO_MAX = 400;

// Limpia lo que llega del navegador. Devuelve '' si no hay nada útil: todos los bloques de acá
// abajo se apagan solos con eso, así que "sin instrucción" es exactamente el comportamiento viejo.
function normalizar(texto) {
  return (texto || '').toString().replace(/\s+/g, ' ').trim().slice(0, LARGO_MAX);
}

// "Céntrate" y "Centrate" son la misma palabra para la lista de exclusión.
function quitarTildes(t) {
  return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const NO_INVENTAR = 'Esto decide QUÉ se pone adelante y qué queda de fondo, y de qué fuentes se '
  + 'saca. NO habilita agregar ni un solo hecho que las fuentes no digan. Si las fuentes traen '
  + 'poco sobre eso, se cuenta lo poco que hay desde ese interés — nunca se rellena con nada.';

// Para la síntesis de la crónica (`gemini.sintetizarCronica`). Es la etapa que más pesa: acá se
// decide el protagonista, y el protagonista arrastra las carpetas de tomas, el título, el nombre
// del archivo y los hashtags.
function bloqueParaLectura(instruccion) {
  const t = normalizar(instruccion);
  if (!t) return '';
  return `\n\nINTERÉS CENTRAL DE ESTE VIDEO (lo pidió el usuario, manda sobre tu criterio): ${t}\n`
    + `Léelo así: de todo lo que traen las fuentes, lo que responde a ese interés va al centro de la `
    + `crónica y el resto queda como contexto. Si ahí se nombra a una persona, ESA es el `
    + `protagonista, aunque otra aparezca más veces en las fuentes. ${NO_INVENTAR}`;
}

// Para elegir los dos puntos de entrada de los videos gemelos (`encuadres.proponerDos`). Los dos
// enfoques tienen que salir del mismo interés: si uno se va para otro lado, el usuario termina con
// un video del artista que pidió y otro de cualquier cosa.
function bloqueParaEncuadres(instruccion) {
  const t = normalizar(instruccion);
  if (!t) return '';
  return `\n\nINTERÉS CENTRAL, FIJADO POR EL USUARIO: ${t}\n`
    + `Los DOS encuadres tienen que servir a ese interés: son dos maneras distintas de entrar a esa `
    + `misma historia, no dos historias. Ninguno puede correr el foco hacia otra persona u otro tema.`;
}

// Para el guionista (los dos motores: el de siempre y el del grafo). Llega ya trabajado desde la
// crónica, así que acá es un recordatorio: sirve para que el guion no se desvíe al elegir qué
// frase poner primero ni a quién nombrar en la apertura.
function bloqueParaGuion(instruccion) {
  const t = normalizar(instruccion);
  if (!t) return '';
  return `\n\n=== INTERÉS CENTRAL (lo fijó el usuario; NO es contenido) ===\n${t}\n`
    + `El guion entero gira alrededor de eso. Si el MATERIAL BASE trae otras personas o temas, `
    + `entran solo en lo que sirven a este interés. ${NO_INVENTAR}\n`
    + `=== FIN DEL INTERÉS ===`;
}

// ¿Las fuentes hablan de lo que el usuario pidió?
//
// Sin llamar a ningún modelo: se sacan los nombres propios de la instrucción y se busca cada uno en
// el material. Si ninguno aparece, se avisa. Es a propósito un aviso y no un corte — el usuario
// puede estar pidiendo un tema y no una persona ("céntrate en la plata"), y ahí no hay nombre que
// buscar y no avisa nada, que es lo correcto.
//
// El caso que este chequeo ataca es el peligroso: pedir a alguien de quien las fuentes no dicen
// nada. Ahí el modelo, obligado a centrarse en esa persona, se la inventa.
function avisoSiNoEstaEnLasFuentes(instruccion, textoDeLasFuentes) {
  const t = normalizar(instruccion);
  if (!t) return null;

  // Nombres propios: palabras capitalizadas de 3+ letras. La regex va SIN contexto a la izquierda
  // a propósito — con `[^.!?]\s` delante, matchAll se comía el espacio de la coincidencia anterior
  // y en "Shyare Andrade" encontraba solo "Shyare". Las palabras que no son nombres (el verbo con
  // el que arranca la instrucción, el inicio de una frase) se sacan por lista.
  const NO_SON_NOMBRES = /^(centrate|enfocate|enfoca|habla|hablar|quiero|necesito|que|sobre|tema|interes|el|la|los|las|todo|toda|solo|mejor|dale|usa|usar|pon|poner)$/i;
  const nombres = [...t.matchAll(/\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}/g)]
    .map(m => m[0])
    .filter(n => !NO_SON_NOMBRES.test(quitarTildes(n)));
  if (!nombres.length) return null;

  const material = (textoDeLasFuentes || '').toLowerCase();
  const sinAparecer = nombres.filter(n => !material.includes(n.toLowerCase()));
  if (sinAparecer.length < nombres.length) return null;   // al menos uno aparece: alcanza

  return `Pediste centrarte en ${sinAparecer.join(', ')}, pero las fuentes que cargaste casi no `
    + `lo(s) mencionan. El guion va a salir con muy poco material real sobre eso — agregá una `
    + `fuente que hable del tema, o cambiá la instrucción.`;
}

module.exports = {
  normalizar,
  bloqueParaLectura,
  bloqueParaEncuadres,
  bloqueParaGuion,
  avisoSiNoEstaEnLasFuentes,
  LARGO_MAX,
};

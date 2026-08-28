// Encuadres: dos PUNTOS DE ENTRADA distintos a los mismos hechos, uno por video gemelo.
//
// EL PROBLEMA QUE RESUELVE. El usuario: "capaz el problema de que se parezcan los guiones es que
// toman de una sola crónica de la primera lectura". Tenía razón, y el código lo confirma: la
// crónica del gemelo solo se genera aparte si el sesgo es favor/contra Y el motor es `grafo`. Con
// sesgo neutral —que es el default— los dos guiones salen de la MISMA crónica, así que el
// parafraseo es su techo. La estructura del motor `grafo` cambia el ORDEN en que se cuenta, no QUÉ
// se cuenta.
//
// POR QUÉ NO ALCANZA CON "UNO A FAVOR Y OTRO EN CONTRA". Esa palanca ya existe y funciona, pero
// obliga a tomar postura moral para diferenciarse, y con noticias donde no hay a quién defender
// produce un video forzado. Un encuadre es otra cosa: es desde DÓNDE se entra a la historia. Los
// mismos hechos, sin mentir ni tomar partido, entrando por otro lado.
//
// DE DÓNDE SALE EL CATÁLOGO. De los marcos genéricos con los que la investigación en comunicación
// clasifica cualquier noticia (conflicto, interés humano, responsabilidad, moralidad, consecuencia
// económica), más un recurso clásico de redacción: cambiar quién es el protagonista de la historia.
// La misma pelea contada desde el que atacó, desde el que respondió o desde el tercero que quedó en
// el medio son tres notas distintas con los mismos hechos.
//
// LA REGLA DURA: los dos encuadres tienen que ser de FAMILIAS distintas. Dos variantes de
// "conflicto" no son dos ángulos, son el mismo ángulo con otras palabras — que es exactamente el
// problema que se está tratando de arreglar.

// Cada marco con el nombre que el modelo va a ver y una explicación en términos de farándula, no
// académicos: el prompt tiene que servirle a un guionista, no a un investigador.
const MARCOS = {
  conflicto: 'El choque entre las partes: quién enfrentó a quién, qué se dijeron, cómo escaló.',
  humano: 'El costo personal: qué significó esto para la persona, qué se le vino encima, cómo la afecta.',
  responsabilidad: 'De quién es la culpa: quién provocó esto, quién debía actuar y no actuó, a quién le toca responder.',
  moralidad: 'Lo que estuvo bien o mal: qué línea se cruzó, qué dice esto de cómo se manejan las cosas en ese ambiente.',
  economico: 'La plata: contratos, patrocinios, trabajos que se caen, cuánto le cuesta esto en concreto.',
  protagonista: 'La misma historia contada desde OTRA persona: el que respondió, el tercero que quedó en el medio, el entorno.',
  cronologia: 'Lo que vino después: no el hecho, sino sus consecuencias y las reacciones que destapó.',
  antecedente: 'Lo que pasó antes: la historia previa que explica por qué esto no salió de la nada.',
};

const PROMPT_ENCUADRES = `Rol: Editor de un canal de farándula que maneja DOS canales hermanos.

Te doy los HECHOS de una noticia. Los dos canales van a publicar sobre ella, y no pueden salir con
el mismo video. Tu trabajo es elegir DOS PUNTOS DE ENTRADA distintos a esta misma historia.

Un punto de entrada NO es una opinión ni una postura: es desde dónde se cuenta. Los dos videos
cuentan los mismos hechos y ninguno miente; lo que cambia es qué se pone adelante y qué queda de
fondo.

MARCOS DISPONIBLES:
{{MARCOS}}

REGLAS:
1. Los dos encuadres TIENEN que ser de marcos distintos. Dos variantes del mismo marco no sirven.
2. Elegí por lo que ESTOS hechos aguantan, no por lo que suena mejor en general. Si no hay nada de
   plata en juego, no elijas el marco económico; si nadie más está involucrado, no elijas
   protagonista alterno.
3. Cada encuadre tiene que responder al menos una de estas preguntas: qué cambia, por qué importa,
   a quién afecta, qué lo demuestra, por qué ahora. Si no responde ninguna, no es un ángulo.
4. PROHIBIDO inventar hechos para sostener un encuadre. Si un ángulo necesita algo que los hechos no
   dicen, ese ángulo no sirve: elegí otro.
5. Si los hechos son tan pocos que no dan para dos ángulos honestos, decilo: poné "suficiente" en
   false y proponé UNO solo bien hecho. Forzar el segundo produce relleno, y eso se nota.

Responde ÚNICAMENTE con un objeto JSON válido (sin markdown, sin bloques de código):
{
  "suficiente": true o false (false si el material no da para dos ángulos honestos),
  "encuadres": [
    {
      "marco": "la clave exacta del marco elegido, de la lista de arriba",
      "titulo": "De qué va este video, en 4-8 palabras",
      "instruccion": "Cómo narrar la crónica con este encuadre: qué se pone adelante, qué queda de fondo, con qué se abre. 2-4 frases dirigidas a quien escribe."
    }
  ],
  "porque": "Una frase: por qué estos dos ángulos y no otros"
}`;

function bloqueDeMarcos() {
  return Object.entries(MARCOS).map(([clave, desc]) => `- ${clave}: ${desc}`).join('\n');
}

// Propone dos encuadres a partir de las actas. `gemini` entra por parámetro para no crear un ciclo
// de requires (gemini.js no importa este módulo; lo usa el servidor).
//
// Devuelve siempre algo utilizable o lanza: quien llama decide si degrada. La regla del proyecto es
// que nada de esto puede tumbar la lectura, así que el servidor lo envuelve.
async function proponerDos(gemini, actas) {
  const hechos = (actas || []).map(a => a?.hechos).filter(Boolean).join('\n\n');
  if (!hechos.trim()) throw new Error('no hay hechos de los que sacar encuadres');

  const prompt = PROMPT_ENCUADRES.replace('{{MARCOS}}', bloqueDeMarcos());
  const datos = await gemini.llamarJSON(prompt, `=== HECHOS ===\n${hechos}\n=== FIN ===`, gemini.TAREAS.encuadres);

  const lista = Array.isArray(datos?.encuadres) ? datos.encuadres : [];
  const validos = lista
    .filter(e => e && e.instruccion && MARCOS[e.marco])
    .map(e => ({ marco: e.marco, titulo: (e.titulo || '').trim(), instruccion: e.instruccion.trim() }));

  if (!validos.length) throw new Error('el modelo no devolvió encuadres utilizables');

  // La regla dura, verificada en código y no confiada al prompt: si volvieron dos del mismo marco,
  // el segundo no aporta nada y se descarta. Es el mismo criterio que se usó con la estructura del
  // motor `grafo`, donde pedírselo al modelo no alcanzó.
  const unicos = [];
  for (const e of validos) {
    if (!unicos.some(u => u.marco === e.marco)) unicos.push(e);
  }

  return {
    suficiente: Boolean(datos.suficiente) && unicos.length >= 2,
    encuadres: unicos.slice(0, 2),
    porque: (datos.porque || '').trim(),
  };
}

// La instrucción de encuadre, con la forma que espera `sintetizarCronica`. Se arma acá para que el
// recordatorio de no inventar viaje pegado al encuadre, siempre.
function instruccionPara(encuadre) {
  if (!encuadre?.instruccion) return '';
  return `ENCUADRE OBLIGATORIO DE ESTA CRÓNICA: ${encuadre.instruccion}\n`
    + `Esto decide QUÉ se pone adelante y qué queda de fondo — no habilita agregar ni un solo hecho `
    + `que las fuentes no digan. Si el encuadre pide algo que los hechos no tienen, se cuenta lo que `
    + `sí hay desde ese ángulo.`;
}

module.exports = { MARCOS, proponerDos, instruccionPara, bloqueDeMarcos, PROMPT_ENCUADRES };

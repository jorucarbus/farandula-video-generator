// Motor de guion sobre el GRAFO DE TÉCNICA NARRATIVA (proyecto `generador-guion-graphify`).
//
// Qué cambia respecto del motor de siempre: hoy el usuario elige un ÁNGULO de una lista de 7
// (de qué va el video) y Gemini escribe con esa lente. Acá no elige nada: el motor lee la crónica,
// elige él mismo la estructura con la que contarla —tomada de un catálogo de técnicas extraído de
// un curso de guion de cine, resúmenes de Platzi y material de retención de video corto— y escribe.
// Pedido explícito del usuario: *"lo que quiero es que mi motor escoja la mejor forma de
// estructurar la noticia, no me interesa escoger el ángulo en graphify, quiero que él mismo lo
// escoja"*.
//
// Por qué el catálogo viaja congelado en un archivo y no se consulta el grafo en vivo:
//   1. `graphify query` es un binario de Python que vive en la máquina del usuario. En Railway no
//      existe, y meter Python al build le agrega al pipeline de video —que ya está en producción—
//      una dependencia nueva que puede romperlo.
//   2. Las 5 consultas del generador son FIJAS: preguntan siempre lo mismo sin mirar la noticia.
//      Pasarle el catálogo entero al modelo es estrictamente mejor, porque elige con la crónica
//      delante. Y evita el punto ciego que ya apareció allá: el BFS arranca por similitud de
//      palabras, así que el material de retención quedaba invisible para consultas redactadas con
//      vocabulario de cine.
//
// Para actualizarlo: en `generador-guion-graphify`, `graphify . --update` y `node exportar-catalogo.js`,
// y copiar el archivo acá.
const fs = require('fs');
const path = require('path');
const expresiones = require('./expresiones');

const CATALOGO_PATH = path.join(__dirname, 'catalogo-tecnicas.json');

let _catalogo = null;
function cargarCatalogo() {
  if (_catalogo) return _catalogo;
  const datos = JSON.parse(fs.readFileSync(CATALOGO_PATH, 'utf-8'));
  const tecnicas = (datos.tecnicas || []).filter(t => t && t.tecnica && t.explicacion);
  if (tecnicas.length === 0) throw new Error('catalogo-tecnicas.json no tiene técnicas utilizables');
  _catalogo = { ...datos, tecnicas };
  return _catalogo;
}

// El catálogo se le pasa agrupado por comunidad del grafo ("Apertura y primer acto", "Atención,
// retención y gancho", …). El agrupado no es cosmético: es lo que permite pedirle una combinación
// que cubra apertura + tensión + cierre en vez de tres técnicas del mismo rincón del grafo.
function catalogoFormateado() {
  const { tecnicas } = cargarCatalogo();
  const porGrupo = new Map();
  for (const t of tecnicas) {
    const g = t.grupo || 'Otras';
    if (!porGrupo.has(g)) porGrupo.set(g, []);
    porGrupo.get(g).push(t);
  }
  const bloques = [];
  for (const [grupo, lista] of porGrupo) {
    bloques.push(`## ${grupo}`);
    for (const t of lista) bloques.push(`- [${t.fuente}] ${t.tecnica}: ${t.explicacion}`);
  }
  return bloques.join('\n');
}

const PROMPT_ELEGIR = `Rol: Director de contenido de un canal de farándula en TikTok, con formación en guion.

Te doy una NOTICIA y un CATÁLOGO de técnicas narrativas (extraídas de un curso de guion de cine,
material de redacción y guías de retención de video corto). Cada técnica trae entre corchetes el
archivo del que salió.

TAREA: elegí la mejor forma de ESTRUCTURAR esta noticia concreta en un video de 70 segundos, y
armá UNA combinación de 2 a 4 técnicas del catálogo que la sostenga.

REGLAS:
1. Solo técnicas que estén en el catálogo. Prohibido inventar una o citar una que no aparezca.
2. La combinación tiene que cubrir al menos el ARRANQUE y el CIERRE. Sumá tensión o personaje si el
   material lo pide.
3. Elegí por lo que pide ESTA noticia, no por lo que suena mejor en general: si el material fuerte
   es una contradicción, la estructura la tiene que exprimir; si es una revelación, hay que
   administrar cuándo se suelta.
4. Nada de maquetación de cine (encabezados de escena, formato de página): esto es una locución.
5. El campo "tecnica" se le entrega a un guionista que NO ve el catálogo. Escribí ahí la
   instrucción concreta de cómo estructurar: qué se abre, en qué orden se revela, cómo se cierra.
   Instrucciones, no teoría.

Responde ÚNICAMENTE con un objeto JSON válido (sin markdown, sin bloques de código):
{
  "nombre": "Nombre corto de la estructura elegida (2-5 palabras)",
  "porque": "Una frase: por qué esta noticia pide esta estructura",
  "tecnica": "La instrucción de estructura para el guionista: apertura, orden de revelación, manejo de la tensión y cierre. 3-6 frases.",
  "fuenteGrafo": ["nombre exacto de cada técnica del catálogo que usaste"],
  "evitada": "Solo si te dieron un guion del canal hermano: qué estructura usa ESE guion, del que te estás apartando. Si no, cadena vacía."
}`;

// Elige la estructura. Tarea PAUTADA (elegir de una lista dada, no inventar), así que va por la
// cadena mecánica del router — mismo criterio que fragmentación y materiales.
async function elegirEstructura(gemini, cronica, guionEvitar) {
  // Videos gemelos: el hermano se pasa solo para NO REPETIRLE la forma, no para diferenciar el
  // contenido. Eso ya no es trabajo de este motor.
  //
  // Antes sí lo era, y era la palanca débil: la estructura cambia el ORDEN en que se cuenta, no QUÉ
  // se cuenta, así que con los dos videos saliendo de la misma crónica el techo era el parafraseo.
  // Ahora cada video llega con SU PROPIA CRÓNICA, escrita desde su enfoque en el Paso 1 — pedido
  // del usuario: "los grafos solo convierten esas crónicas a guiones de TikTok". La diferencia de
  // fondo ya viene resuelta; acá solo se evita que además suenen igual de forma.
  const evitar = !guionEvitar ? '' : `

=== GUION DEL CANAL HERMANO (otra historia, del mismo hecho) ===
${guionEvitar}
=== FIN ===

REGLA EXTRA: no repitas su FORMA. Deducí por dónde abre, en qué orden revela y cómo cierra,
escribilo en "evitada", y elegí una combinación cuya APERTURA venga de otro grupo del catálogo.
No mires su contenido para decidir de qué habla este video: eso ya está decidido en la NOTICIA de
arriba, que es distinta de la suya.`;

  const mensaje = `=== NOTICIA ===
${cronica}
=== FIN DE LA NOTICIA ===

=== CATÁLOGO DE TÉCNICAS ===
${catalogoFormateado()}
=== FIN DEL CATÁLOGO ===${evitar}`;

  const elegida = await gemini.llamarJSON(PROMPT_ELEGIR, mensaje, gemini.TAREAS.tecnica);
  if (!elegida || !elegida.tecnica) throw new Error('el modelo no devolvió una estructura utilizable');
  return elegida;
}

// Mismo contrato que `generarGuion` (gemini.js): así entra en MOTORES_GUION sin que server.js se
// entere de nada.
//
// `angle` y `angleContent` se reciben y se IGNORAN a propósito — en este motor la estructura la
// decide el grafo, no el usuario. Están en la firma porque el contrato es compartido.
async function generarGuionGrafo(cronica, angle, angleContent = null, citas = [], guionEvitar = null, nota = null) {
  // require adentro para no crear un ciclo: gemini.js registra este motor en MOTORES_GUION.
  const gemini = require('./gemini');

  let estructura;
  try {
    estructura = await elegirEstructura(gemini, cronica, guionEvitar);
    console.log(`  🎓 Estructura del grafo: ${estructura.nombre} — ${estructura.porque || ''}`);
    if (Array.isArray(estructura.fuenteGrafo) && estructura.fuenteGrafo.length) {
      console.log(`     técnicas: ${[...new Set(estructura.fuenteGrafo)].join(' + ')}`);
    }
    if (estructura.evitada) console.log(`     se aparta de: ${estructura.evitada}`);
  } catch (e) {
    // Regla de robustez: si el grafo no puede elegir, no se cae el paso del guion — se escribe con
    // el motor de siempre y se avisa.
    console.warn(`  ⚠️ El motor del grafo no pudo elegir estructura (${e.message}); se escribe con el motor de siempre`);
    return gemini.generarGuion(cronica, angle, angleContent, citas, guionEvitar, nota);
  }

  // El guion se escribe con el MISMO prompt maestro y los MISMOS bloques de citas y de
  // no-repetición que el motor de siempre. Lo único que cambia es la lente: donde antes iba el
  // ángulo elegido a mano, ahora va la estructura que salió del grafo.
  const userMessage = `A continuación tienes dos bloques claramente separados.

=== MATERIAL BASE (la crónica con los HECHOS de la noticia; de aquí sale TODO el contenido del guion) ===
${cronica}
=== FIN DEL MATERIAL BASE ===

=== ESTRUCTURA NARRATIVA (esto NO es contenido; es CÓMO tenés que contar los hechos) ===
${estructura.tecnica}
=== FIN DE LA ESTRUCTURA ===

TAREA: Escribe el guion de 205-220 palabras usando ÚNICAMENTE los hechos del MATERIAL BASE, contados con la ESTRUCTURA NARRATIVA indicada. No copies el texto de la estructura en el guion: úsalo solo para decidir la apertura, el orden de la revelación y el cierre.

REGISTRO: ${expresiones.bloqueDeTono()}${expresiones.bloqueDeAperturas()}${gemini.bloqueDeCitas(citas)}${gemini.bloqueDeEvitar(guionEvitar)}${nota ? `

${nota}` : ''}`;

  const { texto } = await gemini.callGemini(gemini.PROMPTS.guion, userMessage, gemini.TAREAS.guion);
  return texto.trim();
}

module.exports = { generarGuionGrafo, cargarCatalogo, catalogoFormateado, elegirEstructura, CATALOGO_PATH };
